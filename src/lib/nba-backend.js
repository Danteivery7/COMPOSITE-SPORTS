import path from 'path';
import { promises as fs } from 'fs';
import { normalizeEspnNewsArticle } from '@/src/lib/espn-news';

const NBA_SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const SNAPSHOT_FILE = path.join('/tmp', 'composite-nba-snapshot.json');
const HEAVY_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

let snapshotCache = null;
let warmPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function getSeasonYear() {
  const d = new Date();
  const year = d.getFullYear();
  return d.getMonth() >= 9 ? year + 1 : year;
}

function normalizePercent(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value <= 1.5 ? value * 100 : value;
}

function assignMappedStat(target, name, rawValue) {
  if (!target || !name || rawValue == null) return;

  const nameParts = String(name).split('-');
  const valueParts = String(rawValue).split('-');

  if (nameParts.length > 1 && nameParts.length === valueParts.length) {
    nameParts.forEach((part, idx) => {
      const parsed = parseFloat(valueParts[idx]);
      if (Number.isFinite(parsed)) {
        target[part] = parsed;
      }
    });
    return;
  }

  const parsed = parseFloat(rawValue);
  if (Number.isFinite(parsed)) {
    target[name] = parsed;
  }
}

function mapCategoryValues(category, values) {
  const mapped = {};
  const names = category?.names || [];
  const rawValues = Array.isArray(values) ? values : [];

  names.forEach((name, idx) => {
    assignMappedStat(mapped, name, rawValues[idx]);
  });

  return mapped;
}

function getEntryGamesPlayed(category, entry) {
  if (!category || !entry) return 0;
  const mapped = mapCategoryValues(category, entry?.stats);
  return Number(mapped.gamesPlayed ?? mapped.gp ?? 0);
}

function pickSeasonEntry(statistics = [], seasonYear = getSeasonYear(), category = null) {
  if (!Array.isArray(statistics) || statistics.length === 0) return null;
  const exactSeason = statistics.filter((entry) => Number(entry?.season?.year) === Number(seasonYear));
  const exactWithGames = exactSeason.find((entry) => getEntryGamesPlayed(category, entry) > 0);
  if (exactWithGames) return exactWithGames;
  if (exactSeason.length) return exactSeason[0];

  const sampled = statistics.filter((entry) => getEntryGamesPlayed(category, entry) > 0);
  return sampled[sampled.length - 1] || statistics[statistics.length - 1] || null;
}

function pickPreviousSeasonEntry(statistics = [], seasonYear = getSeasonYear(), category = null) {
  if (!Array.isArray(statistics) || statistics.length === 0) return null;
  const previous = statistics.filter((entry) => Number(entry?.season?.year) < Number(seasonYear));
  const sampled = previous.filter((entry) => getEntryGamesPlayed(category, entry) > 0);
  return sampled[sampled.length - 1] || (previous.length ? previous[previous.length - 1] : null);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function mapLimit(items, mapper, concurrency = 8) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await mapper(items[index], index);
      } catch (_error) {
        results[index] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function writeSnapshotToDisk(snapshot) {
  try {
    await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot), 'utf8');
  } catch (error) {
    console.warn('[NBA Backend] Failed to write snapshot:', error?.message || error);
  }
}

async function readSnapshotFromDisk() {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function isSnapshotFresh(snapshot) {
  if (!snapshot?.lastUpdated) return false;
  return Date.now() - new Date(snapshot.lastUpdated).getTime() < HEAVY_SNAPSHOT_TTL_MS;
}

async function fetchScoreboard() {
  const payload = await fetchJson(`${NBA_SITE_BASE}/scoreboard`);
  return payload.events || [];
}

async function fetchNews() {
  const payload = await fetchJson(`${NBA_SITE_BASE}/news`);
  return (payload.articles || [])
    .map((article, index) => normalizeEspnNewsArticle(article, { fallbackSource: 'ESPN', fallbackId: `nba-news-${index}` }))
    .filter((article) => article.storyId);
}

async function fetchTeams() {
  const payload = await fetchJson(`${NBA_SITE_BASE}/teams?limit=30`);
  return payload?.sports?.[0]?.leagues?.[0]?.teams?.map((entry) => entry.team) || [];
}

async function fetchTeamProfile(teamId) {
  const payload = await fetchJson(`${NBA_SITE_BASE}/teams/${teamId}`);
  return payload.team;
}

async function fetchTeamRoster(teamId) {
  const data = await fetchJson(`${NBA_SITE_BASE}/teams/${teamId}/roster`);
  const coachName = data?.coach?.[0] ? `${data.coach[0].firstName} ${data.coach[0].lastName}` : 'N/A';

  const athletes = [];
  if (Array.isArray(data.athletes)) {
    data.athletes.forEach((group) => {
      if (group && Array.isArray(group.items)) {
        group.items.forEach((athlete) => {
          if (!athlete.position && group.position) {
            athlete.position = { name: group.position, abbreviation: group.position.charAt(0) };
          }
          athletes.push(athlete);
        });
      } else if (group?.id) {
        athletes.push(group);
      }
    });
  }

  return { athletes, coach: coachName };
}

async function fetchTeamStatistics(teamId) {
  let seasonYear = getSeasonYear();

  let response = await fetch(
    `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${seasonYear}/types/2/teams/${teamId}/statistics`,
    { cache: 'no-store', headers: { Accept: 'application/json' } },
  );

  if (!response.ok) {
    seasonYear -= 1;
    response = await fetch(
      `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${seasonYear}/types/2/teams/${teamId}/statistics`,
      { cache: 'no-store', headers: { Accept: 'application/json' } },
    );
  }

  if (!response.ok) return null;

  const data = await response.json();
  const categories = data.splits?.categories || [];
  const nameMap = {};

  categories.forEach((category) => {
    if (category.stats && Array.isArray(category.stats)) {
      category.stats.forEach((stat) => {
        nameMap[stat.name] = parseFloat(stat.value) || 0;
      });
    }
  });

  return {
    ppg: nameMap.avgPoints || 0,
    rpg: nameMap.avgRebounds || 0,
    apg: nameMap.avgAssists || 0,
    spg: nameMap.avgSteals || 0,
    bpg: nameMap.avgBlocks || 0,
    tovPg: nameMap.avgTurnovers || 0,
    fgPct: nameMap.fieldGoalPct || 0,
    threePct: nameMap.threePointPct || nameMap.threePointFieldGoalPct || 0,
    ftPct: nameMap.freeThrowPct || 0,
    efgPct: nameMap.effectiveFGPct || nameMap.shootingEfficiency || 0,
    twoPtPct: nameMap.twoPointFieldGoalPct || 0,
    fta: nameMap.avgFreeThrowsAttempted || 0,
    threePA: nameMap.avgThreePointFieldGoalsAttempted || 0,
    offRebPg: nameMap.avgOffensiveRebounds || 0,
    defRebPg: nameMap.avgDefensiveRebounds || 0,
    gp: nameMap.gamesPlayed || 0,
    pace: nameMap.paceFactor || nameMap.avgEstimatedPossessions || 98,
    estimatedPossessions: nameMap.avgEstimatedPossessions || nameMap.estimatedPossessions || 98,
    assistTurnoverRatio: nameMap.assistTurnoverRatio || nameMap.teamAssistTurnoverRatio || 1.7,
    turnoverRatio: nameMap.turnoverRatio || 13,
    reboundRate: nameMap.reboundRate || 50,
    trueShootingPct: normalizePercent(nameMap.trueShootingPct) || 57,
    shootingEfficiency: normalizePercent(nameMap.shootingEfficiency) || 53,
    scoringEfficiency: nameMap.scoringEfficiency || 1.25,
    offensiveEfficiency: (nameMap.pointsPerEstimatedPossessions || 1.12) * 100,
    avgEstimatedPossessions: nameMap.avgEstimatedPossessions || 98,
  };
}

async function fetchTeamSchedule(teamId) {
  let seasonYear = getSeasonYear();
  let response = await fetch(`${NBA_SITE_BASE}/teams/${teamId}/schedule?season=${seasonYear}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    seasonYear -= 1;
    response = await fetch(`${NBA_SITE_BASE}/teams/${teamId}/schedule?season=${seasonYear}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  }

  if (!response.ok) return [];
  const data = await response.json();
  return (data.events || []).filter((event) => event?.competitions?.[0]?.status?.type?.completed).slice(-5).reverse();
}

async function fetchPlayerStats(playerId) {
  const seasonYear = getSeasonYear();
  const data = await fetchJson(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${playerId}/stats`);
  const categories = data.categories || [];

  const nameMap = {};
  const careerMap = {};
  const lastSeasonMap = {};
  let resolvedSeasonEntry = null;

  categories.forEach((category) => {
    const currentSeasonEntry = pickSeasonEntry(category.statistics, seasonYear, category);
    const previousSeasonEntry = pickPreviousSeasonEntry(category.statistics, seasonYear, category);

    if (!resolvedSeasonEntry && currentSeasonEntry?.season) {
      resolvedSeasonEntry = currentSeasonEntry;
    }

    Object.assign(nameMap, mapCategoryValues(category, currentSeasonEntry?.stats));
    Object.assign(careerMap, mapCategoryValues(category, category?.totals));

    if (previousSeasonEntry?.stats) {
      Object.assign(lastSeasonMap, mapCategoryValues(category, previousSeasonEntry.stats));
    }
  });

  const getStat = (keys) => {
    for (const key of keys) {
      if (nameMap[key] !== undefined) return nameMap[key];
    }
    return 0;
  };

  const ppg = getStat(['avgPoints', 'points', 'avgPts']);
  if (ppg === 0 && !nameMap.gamesPlayed) return null;

  const apg = getStat(['avgAssists', 'assists', 'avgAst']);
  const tovPg = getStat(['avgTurnovers', 'turnovers', 'avgTov']);
  const spg = getStat(['avgSteals', 'steals', 'avgStl']);
  const bpg = getStat(['avgBlocks', 'blocks', 'avgBlk']);
  const mpg = getStat(['avgMinutes', 'minutes', 'mpg']);
  const rpg = getStat(['avgRebounds', 'rebounds', 'avgReb']);
  const gp = getStat(['gamesPlayed', 'gp']);
  const gs = getStat(['gamesStarted', 'gs']);

  const fgm = getStat(['avgFieldGoalsMade', 'fieldGoalsMade']);
  const fga = getStat(['avgFieldGoalsAttempted', 'fieldGoalsAttempted', 'fga']);
  const threePm = getStat(['avgThreePointFieldGoalsMade', 'threePointFieldGoalsMade']);
  const threePa = getStat(['avgThreePointFieldGoalsAttempted', 'threePointFieldGoalsAttempted', 'threePA']);
  const ftm = getStat(['avgFreeThrowsMade', 'freeThrowsMade']);
  const fta = getStat(['avgFreeThrowsAttempted', 'freeThrowsAttempted', 'fta']);

  const fgPct = normalizePercent(getStat(['fieldGoalPct', 'fg%'])) || (fga > 0 ? (fgm / fga) * 100 : 0);
  const threePct = normalizePercent(getStat(['threePointFieldGoalPct', 'threePointPct', '3p%'])) || (threePa > 0 ? (threePm / threePa) * 100 : 0);
  const ftPct = normalizePercent(getStat(['freeThrowPct', 'ft%'])) || (fta > 0 ? (ftm / fta) * 100 : 0);
  const efgPct = normalizePercent(getStat(['effectiveFGPct', 'efg%'])) ||
    normalizePercent(nameMap.shootingEfficiency) ||
    (fga > 0 ? ((fgm + 0.5 * threePm) / fga) * 100 : 0);
  const tsPct = normalizePercent(getStat(['trueShootingPct', 'ts%'])) ||
    (fga + (0.44 * fta) > 0 ? (ppg / (2 * (fga + (0.44 * fta)))) * 100 : 55);

  const usageApprox = Math.max(12, Math.min(38, ((fga + (0.44 * fta) + tovPg) / Math.max(mpg, 1)) * 18));
  const perApprox = Math.max(
    8,
    Math.min(
      34,
      11 +
      (ppg * 0.32) +
      (rpg * 0.35) +
      (apg * 0.60) +
      (spg * 1.80) +
      (bpg * 1.70) -
      (tovPg * 0.90) -
      ((getStat(['avgFouls', 'fouls']) || 0) * 0.25),
    ),
  );
  const vorpApprox = Math.max(-0.5, Math.min(6, ((ppg - 10) * 0.05) + (apg * 0.11) + (rpg * 0.06) + ((spg + bpg) * 0.45) + ((tsPct - 55) * 0.03)));

  const buildBaseline = (sourceMap) => {
    const baselineGet = (keys) => {
      for (const key of keys) {
        if (sourceMap[key] !== undefined) return sourceMap[key];
      }
      return 0;
    };

    const basePpg = baselineGet(['avgPoints', 'points', 'avgPts']);
    const baseFga = baselineGet(['avgFieldGoalsAttempted', 'fieldGoalsAttempted', 'fga']);
    const baseFta = baselineGet(['avgFreeThrowsAttempted', 'freeThrowsAttempted', 'fta']);
    const baseFgm = baselineGet(['avgFieldGoalsMade', 'fieldGoalsMade']);
    const baseThreePm = baselineGet(['avgThreePointFieldGoalsMade', 'threePointFieldGoalsMade']);
    const baseThreePa = baselineGet(['avgThreePointFieldGoalsAttempted', 'threePointFieldGoalsAttempted', 'threePA']);

    return {
      ppg: basePpg,
      rpg: baselineGet(['avgRebounds', 'rebounds', 'avgReb']),
      apg: baselineGet(['avgAssists', 'assists', 'avgAst']),
      spg: baselineGet(['avgSteals', 'steals', 'avgStl']),
      bpg: baselineGet(['avgBlocks', 'blocks', 'avgBlk']),
      gp: baselineGet(['gamesPlayed', 'gp']),
      fgPct: normalizePercent(baselineGet(['fieldGoalPct', 'fg%'])) || (baseFga > 0 ? (baseFgm / baseFga) * 100 : 0),
      threePct: normalizePercent(baselineGet(['threePointFieldGoalPct', 'threePointPct', '3p%'])) || (baseThreePa > 0 ? (baseThreePm / baseThreePa) * 100 : 0),
      ftPct: normalizePercent(baselineGet(['freeThrowPct', 'ft%'])),
      astTovRatio: baselineGet(['assistTurnoverRatio']) || 0,
      shootingEfficiency: normalizePercent(baselineGet(['shootingEfficiency'])),
      tsPct: normalizePercent(baselineGet(['trueShootingPct', 'ts%'])) ||
        (baseFga + (0.44 * baseFta) > 0 ? (basePpg / (2 * (baseFga + (0.44 * baseFta)))) * 100 : 0),
    };
  };

  return {
    ppg,
    rpg,
    apg,
    spg,
    bpg,
    tovPg,
    foulsPg: getStat(['avgFouls', 'fouls']),
    mpg,
    gp,
    gs,
    fgPct,
    threePct,
    ftPct,
    efgPct: efgPct || 50,
    tsPct: tsPct || 55,
    fga,
    fta,
    fgm,
    ftm,
    threePm,
    threePa,
    per: getStat(['PER', 'per']) || perApprox,
    usage: getStat(['usageRate', 'usage']) || usageApprox,
    vorp: getStat(['VORP', 'vorp']) || vorpApprox,
    plusMinus: getStat(['plusMinus', 'avgPlusMinus']),
    assistRatio: getStat(['assistRatio']),
    astTovRatio: nameMap.assistTurnoverRatio || (apg / (tovPg || 0.1)),
    defRebPg: getStat(['avgDefensiveRebounds', 'defensiveRebounds']),
    stl48: nameMap.avg48Steals || (spg / (mpg || 30) * 48),
    blk48: nameMap.avg48Blocks || (bpg / (mpg || 30) * 48),
    estimatedPossessions: getStat(['avgEstimatedPossessions', 'estimatedPossessions']) || (mpg * 2),
    totalMinutes: mpg * gp,
    shootingEfficiency: normalizePercent(nameMap.shootingEfficiency) || efgPct || 50,
    career: buildBaseline(careerMap),
    lastSeason: buildBaseline(lastSeasonMap),
    seasonYear: Number(resolvedSeasonEntry?.season?.year || seasonYear),
    seasonLabel: resolvedSeasonEntry?.season?.displayName || `${seasonYear - 1}-${String(seasonYear).slice(-2)}`,
    statSource: 'official',
  };
}

function buildPlayerCatalog(rosters, teamsById) {
  const players = [];

  Object.entries(rosters || {}).forEach(([teamId, rosterObj]) => {
    (rosterObj?.athletes || []).forEach((athlete) => {
      if (!athlete?.id) return;
      const team = teamsById[String(teamId)] || null;
      players.push({
        id: String(athlete.id),
        teamId: String(teamId),
        fullName: athlete.fullName || athlete.displayName,
        displayName: athlete.displayName || athlete.fullName,
        shortName: athlete.shortName || athlete.displayName,
        jersey: athlete.jersey || '',
        position: athlete.position?.abbreviation || athlete.position?.name || '',
        headshot: athlete.headshot?.href || '',
        teamAbbr: team?.abbreviation || '',
        teamDisplayName: team?.displayName || '',
        realStats: athlete.realStats || null,
        hasOfficialStats: Boolean(athlete.realStats),
      });
    });
  });

  return players;
}

async function buildHeavySnapshot() {
  const teams = await fetchTeams();
  const teamsById = Object.fromEntries(teams.map((team) => [String(team.id), team]));

  const [teamProfiles, teamDetailedStats, teamRecentForms, rosters] = await Promise.all([
    mapLimit(teams, async (team) => [String(team.id), await fetchTeamProfile(team.id)], 10),
    mapLimit(teams, async (team) => [String(team.id), await fetchTeamStatistics(team.id)], 8),
    mapLimit(teams, async (team) => [String(team.id), await fetchTeamSchedule(team.id)], 8),
    mapLimit(teams, async (team) => [String(team.id), await fetchTeamRoster(team.id)], 8),
  ]);

  const rostersMap = Object.fromEntries((rosters || []).filter(Boolean));
  const playerTargets = [];

  Object.entries(rostersMap).forEach(([teamId, roster]) => {
    (roster?.athletes || []).forEach((athlete) => {
      if (athlete?.id) {
        playerTargets.push({ playerId: String(athlete.id), teamId: String(teamId) });
      }
    });
  });

  await mapLimit(
    playerTargets,
    async ({ playerId, teamId }) => {
      const stats = await fetchPlayerStats(playerId).catch(() => null);
      const roster = rostersMap[teamId];
      const athlete = roster?.athletes?.find((entry) => String(entry.id) === String(playerId));
      if (athlete) {
        athlete.realStats = stats;
      }
      await sleep(25);
      return null;
    },
    8,
  );

  const playerCatalog = buildPlayerCatalog(rostersMap, teamsById);
  const officialPlayerCount = playerCatalog.filter((player) => player.hasOfficialStats).length;

  return {
    teams,
    teamStats: Object.fromEntries((teamProfiles || []).filter(Boolean)),
    teamDetailedStats: Object.fromEntries((teamDetailedStats || []).filter(Boolean)),
    teamRecentForm: Object.fromEntries((teamRecentForms || []).filter(Boolean)),
    rosters: rostersMap,
    playerCatalog,
    playerMeta: {
      totalPlayers: playerCatalog.length,
      officialPlayerCount,
      syncingPlayerCount: Math.max(0, playerCatalog.length - officialPlayerCount),
    },
    lastUpdated: nowIso(),
  };
}

async function loadCachedSnapshot() {
  if (snapshotCache) return snapshotCache;
  const diskSnapshot = await readSnapshotFromDisk();
  if (diskSnapshot) {
    snapshotCache = diskSnapshot;
  }
  return snapshotCache;
}

export async function warmNbaSnapshot(force = false) {
  const cached = await loadCachedSnapshot();
  if (!force && cached && isSnapshotFresh(cached)) {
    return cached;
  }

  if (warmPromise) {
    return warmPromise;
  }

  warmPromise = (async () => {
    const heavySnapshot = await buildHeavySnapshot();
    snapshotCache = heavySnapshot;
    await writeSnapshotToDisk(heavySnapshot);
    return heavySnapshot;
  })();

  try {
    return await warmPromise;
  } finally {
    warmPromise = null;
  }
}

export async function getNbaBootstrapSnapshot() {
  const cached = await loadCachedSnapshot();
  if ((!cached || !isSnapshotFresh(cached)) && !warmPromise) {
    void warmNbaSnapshot(true);
  }

  const heavySnapshot = cached || (await warmNbaSnapshot(true));

  const [games, news] = await Promise.allSettled([fetchScoreboard(), fetchNews()]);
  const scoreboard = games.status === 'fulfilled' ? games.value : [];
  const newsFeed = news.status === 'fulfilled' ? news.value : [];

  return {
    ...heavySnapshot,
    games: scoreboard,
    news: newsFeed,
    warmState: {
      isWarming: Boolean(warmPromise),
      isFresh: isSnapshotFresh(heavySnapshot),
    },
    bootstrapUpdated: nowIso(),
  };
}

export async function getNbaNewsFeed() {
  return {
    articles: await fetchNews(),
    lastUpdated: nowIso(),
  };
}

export async function getNbaPlayerCatalog(query = '') {
  const snapshot = await loadCachedSnapshot() || await warmNbaSnapshot(true);
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const players = snapshot.playerCatalog || [];
  if (!normalizedQuery) return players;
  return players.filter((player) => {
    const haystack = `${player.displayName} ${player.fullName} ${player.teamAbbr} ${player.position}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export async function getNbaPlayerSnapshot(playerId) {
  const snapshot = await loadCachedSnapshot() || await warmNbaSnapshot(true);
  return (snapshot.playerCatalog || []).find((player) => String(player.id) === String(playerId)) || null;
}

export async function getNbaWarmState() {
  const snapshot = await loadCachedSnapshot();
  return {
    lastUpdated: snapshot?.lastUpdated || null,
    hasSnapshot: Boolean(snapshot),
    isFresh: isSnapshotFresh(snapshot),
    isWarming: Boolean(warmPromise),
    playerMeta: snapshot?.playerMeta || { totalPlayers: 0, officialPlayerCount: 0, syncingPlayerCount: 0 },
  };
}
