import { normalizeEspnNewsArticle } from '@/src/lib/espn-news';
import { extractEspnOdds, moneylineToProbability } from '@/src/lib/odds';
import { compareByStartTime, getEasternDateKey, isSameEasternDate } from '@/src/lib/time';

const CACHE = new Map();

export const FOOTBALL_LEAGUES = {
  mls: {
    key: 'mls',
    slug: 'usa.1',
    label: 'MLS',
    shortLabel: 'MLS',
    region: 'North America',
    competitionWeight: 0.96,
    accent: '#ff5f95',
    accentAlt: '#ffc7da',
    surface: 'radial-gradient(circle at top, rgba(255, 97, 149, 0.34), rgba(10, 8, 14, 0.97) 72%)',
    cardBlurb: 'Pink match-night energy, live MLS boards, and a league-specific composite inside the larger Football shell.',
  },
  'premier-league': {
    key: 'premier-league',
    slug: 'eng.1',
    label: 'Premier League',
    shortLabel: 'Premier League',
    region: 'England',
    competitionWeight: 1.22,
    accent: '#86ff67',
    accentAlt: '#d8ffd1',
    surface: 'radial-gradient(circle at top, rgba(56, 157, 91, 0.32), rgba(7, 12, 9, 0.97) 72%)',
    cardBlurb: 'Elite English matchdays, title-race context, and club-level composite power.',
  },
  'la-liga': {
    key: 'la-liga',
    slug: 'esp.1',
    label: 'La Liga',
    shortLabel: 'La Liga',
    region: 'Spain',
    competitionWeight: 1.14,
    accent: '#ffd24f',
    accentAlt: '#fff0bf',
    surface: 'radial-gradient(circle at top, rgba(255, 193, 58, 0.32), rgba(12, 8, 6, 0.97) 72%)',
    cardBlurb: 'Spanish technical quality, possession control, and star-heavy match boards.',
  },
  'serie-a': {
    key: 'serie-a',
    slug: 'ita.1',
    label: 'Serie A',
    shortLabel: 'Serie A',
    region: 'Italy',
    competitionWeight: 1.1,
    accent: '#6bd0ff',
    accentAlt: '#d6f5ff',
    surface: 'radial-gradient(circle at top, rgba(58, 144, 255, 0.32), rgba(6, 10, 16, 0.97) 72%)',
    cardBlurb: 'Italian control, structure, and tactical matchups tracked through one league board.',
  },
  'ligue-1': {
    key: 'ligue-1',
    slug: 'fra.1',
    label: 'Ligue 1',
    shortLabel: 'Ligue 1',
    region: 'France',
    competitionWeight: 1.04,
    accent: '#8ef1ff',
    accentAlt: '#dbfbff',
    surface: 'radial-gradient(circle at top, rgba(77, 188, 210, 0.32), rgba(6, 11, 14, 0.97) 72%)',
    cardBlurb: 'French pace, youth, transition threats, and a clean league-wide composite.',
  },
  'champions-league': {
    key: 'champions-league',
    slug: 'uefa.champions',
    label: 'Champions League',
    shortLabel: 'Champions League',
    region: 'Europe',
    competitionWeight: 1.35,
    accent: '#8db1ff',
    accentAlt: '#edf3ff',
    surface: 'radial-gradient(circle at top, rgba(95, 126, 255, 0.36), rgba(7, 8, 18, 0.98) 74%)',
    cardBlurb: 'The biggest European nights, elite clubs, and the highest-weighted match board in Football.',
  },
};

function cacheKey(scope, league, extra = '') {
  return `${scope}:${league}:${extra}`;
}

function readCache(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    CACHE.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value, ttlMs) {
  CACHE.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function uniqBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => map.set(getKey(item), item));
  return Array.from(map.values());
}

function walk(node, visit, seen = new WeakSet()) {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  visit(node);

  if (Array.isArray(node)) {
    node.forEach((entry) => walk(entry, visit, seen));
    return;
  }

  Object.values(node).forEach((value) => walk(value, visit, seen));
}

function flattenStats(stats = []) {
  const map = {};
  stats.forEach((stat) => {
    const keys = [stat.name, stat.displayName, stat.shortDisplayName, stat.abbreviation].filter(Boolean);
    keys.forEach((key) => {
      map[normalizeKey(key)] = stat.value ?? stat.displayValue ?? 0;
      map[`${normalizeKey(key)}Display`] = stat.displayValue ?? stat.value ?? '0';
    });
  });
  return map;
}

async function fetchJson(url, ttlMs = 60_000) {
  const key = cacheKey('json', 'global', url);
  const cached = readCache(key);
  if (cached) return cached;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return writeCache(key, await response.json(), ttlMs);
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

function scoreScale(values, higherIsBetter = true) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return () => 50;
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  if (min === max) return () => 50;
  return (value) => {
    const normalized = ((value - min) / (max - min)) * 100;
    return Math.round((higherIsBetter ? normalized : 100 - normalized) * 10) / 10;
  };
}

function leagueMeta(leagueKey) {
  const meta = FOOTBALL_LEAGUES[leagueKey];
  if (!meta) throw new Error(`Unsupported football league "${leagueKey}"`);
  return meta;
}

function siteBase(leagueKey) {
  return `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueMeta(leagueKey).slug}`;
}

function parseTeam(rawTeam) {
  return {
    id: String(rawTeam.id),
    espnId: String(rawTeam.id),
    abbreviation: rawTeam.abbreviation || rawTeam.shortDisplayName || rawTeam.displayName,
    displayName: rawTeam.displayName || rawTeam.name,
    shortDisplayName: rawTeam.shortDisplayName || rawTeam.abbreviation || rawTeam.displayName,
    logo:
      rawTeam.logo ||
      rawTeam.logos?.[0]?.href ||
      rawTeam.links?.logo?.href ||
      '',
    color: rawTeam.color || '#9fd3ff',
    alternateColor: rawTeam.alternateColor || '#ffffff',
    location: rawTeam.location || '',
  };
}

function parseTeamsFromPayload(payload) {
  const teams = [];
  walk(payload, (node) => {
    if (node?.team?.id) {
      teams.push(parseTeam(node.team));
    } else if (node?.id && node?.displayName && node?.abbreviation && !node?.position) {
      teams.push(parseTeam(node));
    }
  });
  return uniqBy(teams, (team) => team.id);
}

function getStatValue(stats, keys, fallback = 0) {
  for (const key of keys) {
    const value = stats[normalizeKey(key)];
    if (value !== undefined && value !== null && value !== '') {
      const numeric = Number(value);
      return Number.isNaN(numeric) ? value : numeric;
    }
  }
  return fallback;
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseRecordSummary(summary = '') {
  const match = String(summary).match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
  if (!match) {
    return {
      wins: 0,
      ties: 0,
      losses: 0,
      gamesPlayed: 0,
      display: '0-0-0',
    };
  }

  const wins = Number(match[1]);
  const ties = Number(match[2]);
  const losses = Number(match[3]);
  return {
    wins,
    ties,
    losses,
    gamesPlayed: wins + ties + losses,
    display: `${wins}-${ties}-${losses}`,
  };
}

function parseStandingRank(summary = '') {
  const match = String(summary).match(/(\d+)(?:st|nd|rd|th)/i);
  return match ? Number(match[1]) : null;
}

function flattenAthleteStatistics(statistics = null) {
  const statMap = {};
  const statFeed = [];
  const categories = statistics?.splits?.categories || statistics?.categories || [];

  categories.forEach((category) => {
    (category?.stats || []).forEach((stat) => {
      const keys = [stat.name, stat.displayName, stat.shortDisplayName, stat.abbreviation].filter(Boolean);
      keys.forEach((key) => {
        statMap[normalizeKey(key)] = stat.value ?? stat.displayValue ?? 0;
        statMap[`${normalizeKey(key)}Display`] = stat.displayValue ?? stat.value ?? '0';
      });
      statFeed.push({
        group: category.displayName || category.name || 'Stats',
        label: stat.displayName || stat.name || 'Stat',
        value: stat.displayValue || stat.value || '0',
      });
    });
  });

  return { statMap, statFeed };
}

function getPlayerStat(stats, keys, fallback = 0) {
  return getStatValue(stats, keys, fallback);
}

function getFootballPositionGroup(position = '') {
  const pos = String(position || '').toUpperCase();
  if (['G', 'GK'].includes(pos)) return 'GK';
  if (['D', 'DF', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'WB'].includes(pos)) return 'DEF';
  if (['M', 'MF', 'CM', 'CDM', 'DM', 'CAM', 'AM', 'LM', 'RM'].includes(pos)) return 'MID';
  return 'FWD';
}

function summarizeScheduleResults(payload, teamId) {
  const competitions = (payload.events || payload.games || [])
    .map((event) => event?.competitions?.[0] || event)
    .filter(Boolean)
    .sort((left, right) => compareByStartTime(left?.date, right?.date));

  let wins = 0;
  let ties = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let cleanSheets = 0;

  const completed = [];

  competitions.forEach((competition) => {
    const statusState = competition?.status?.type?.state;
    if (statusState !== 'post') return;
    const competitors = competition?.competitors || [];
    const team = competitors.find((entry) => String(entry.team?.id || entry.id) === String(teamId));
    const opponent = competitors.find((entry) => String(entry.team?.id || entry.id) !== String(teamId));
    if (!team || !opponent) return;

    const teamScore = toFiniteNumber(team.score?.value ?? team.score?.displayValue ?? team.score, 0);
    const opponentScore = toFiniteNumber(opponent.score?.value ?? opponent.score?.displayValue ?? opponent.score, 0);

    goalsFor += teamScore;
    goalsAgainst += opponentScore;
    if (opponentScore === 0) cleanSheets += 1;

    if (teamScore > opponentScore) wins += 1;
    else if (teamScore === opponentScore) ties += 1;
    else losses += 1;

    completed.push({
      date: competition.date,
      teamScore,
      opponentScore,
      opponentAbbr: opponent.team?.abbreviation || opponent.team?.shortDisplayName || 'OPP',
    });
  });

  const recent = completed.slice(-5);
  const recentFormPoints = recent.reduce((total, game) => {
    if (game.teamScore > game.opponentScore) return total + 3;
    if (game.teamScore === game.opponentScore) return total + 1;
    return total;
  }, 0);

  return {
    wins,
    ties,
    losses,
    gamesPlayed: wins + ties + losses,
    standingPoints: wins * 3 + ties,
    pointsFor: goalsFor,
    pointsAgainst: goalsAgainst,
    differential: goalsFor - goalsAgainst,
    cleanSheets,
    record: `${wins}-${ties}-${losses}`,
    recentFormPoints,
    recentFormLabel: recent.length ? `${recentFormPoints} pts last ${recent.length}` : 'Form pending',
    recentResults: recent
      .slice()
      .reverse()
      .map((game) => `${game.teamScore}-${game.opponentScore} vs ${game.opponentAbbr}`),
  };
}

function buildFootballPlayerRating(player, team, leaderEntries = []) {
  const stats = player.statistics || {};
  const positionGroup = getFootballPositionGroup(player.position);
  const appearances = getPlayerStat(stats, ['appearances', 'app'], 0);
  const subIns = getPlayerStat(stats, ['subins', 'sub'], 0);
  const starts = Math.max(0, appearances - subIns);
  const goals = getPlayerStat(stats, ['totalgoals', 'goals', 'g'], 0);
  const assists = getPlayerStat(stats, ['goalassists', 'assists', 'a'], 0);
  const shots = getPlayerStat(stats, ['totalshots', 'shots', 'sh'], 0);
  const shotsOnTarget = getPlayerStat(stats, ['shotsontarget', 'st'], 0);
  const offsides = getPlayerStat(stats, ['offsides', 'of'], 0);
  const saves = getPlayerStat(stats, ['saves', 'sv'], 0);
  const shotsFaced = getPlayerStat(stats, ['shotsfaced', 'shf'], 0);
  const goalsConceded = getPlayerStat(stats, ['goalsconceded', 'goalsagainst', 'ga'], 0);
  const yellowCards = getPlayerStat(stats, ['yellowcards', 'yc'], 0);
  const redCards = getPlayerStat(stats, ['redcards', 'rc'], 0);
  const foulsCommitted = getPlayerStat(stats, ['foulscommitted', 'fc'], 0);
  const foulsSuffered = getPlayerStat(stats, ['foulssuffered', 'fa'], 0);

  const reliability = Math.max(0.18, Math.min(1, appearances / 24));
  const teamOffBoost = Math.max(0, ((team?.offScore || 50) - 50) * 0.28);
  const teamDefBoost = Math.max(0, ((team?.defScore || 50) - 50) * 0.3);
  const teamResultsBoost = Math.max(0, ((team?.resultsScore || 50) - 50) * 0.24);
  const leaderBoost = leaderEntries
    .slice(0, 4)
    .reduce((total, entry) => total + Math.max(0, 16 - Number(entry.rank || 16)) * 0.7, 0);
  const startsBoost = starts * 0.48;
  const disciplinePenalty = (yellowCards * 0.18) + (redCards * 1.75) + (foulsCommitted * 0.04);
  const foulDrawBonus = foulsSuffered * 0.08;

  let rawRating = 58;
  let summary = `${appearances} apps`;

  if (positionGroup === 'GK') {
    const saveRate = shotsFaced > 0 ? saves / shotsFaced : 0.68;
    const goalsAgainstPerMatch = appearances > 0 ? goalsConceded / appearances : 1.4;
    rawRating =
      64 +
      startsBoost +
      (saveRate * 20) +
      teamDefBoost +
      (teamResultsBoost * 0.8) +
      (leaderBoost * 0.28) -
      (goalsAgainstPerMatch * 3.2) -
      (disciplinePenalty * 0.12);
    summary = `${saves} saves • ${goalsConceded} GA`;
  } else if (positionGroup === 'DEF') {
    rawRating =
      60 +
      startsBoost +
      teamDefBoost +
      (teamResultsBoost * 0.7) +
      (goals * 4.2) +
      (assists * 3.9) +
      (shotsOnTarget * 0.6) +
      (leaderBoost * 0.34) +
      foulDrawBonus -
      disciplinePenalty;
    summary = `${goals} G • ${assists} A • ${appearances} apps`;
  } else if (positionGroup === 'MID') {
    rawRating =
      61 +
      startsBoost +
      (goals * 4.8) +
      (assists * 5.1) +
      (shotsOnTarget * 0.82) +
      (shots * 0.18) +
      (teamOffBoost * 0.9) +
      (teamDefBoost * 0.45) +
      (teamResultsBoost * 0.7) +
      (leaderBoost * 0.44) +
      foulDrawBonus -
      (disciplinePenalty * 0.85);
    summary = `${goals} G • ${assists} A • ${appearances} apps`;
  } else {
    const finishingRate = shots > 0 ? shotsOnTarget / shots : 0;
    rawRating =
      62 +
      (startsBoost * 0.9) +
      (goals * 5.9) +
      (assists * 4.1) +
      (shotsOnTarget * 1.2) +
      (shots * 0.2) +
      (finishingRate * 8) +
      teamOffBoost +
      (teamResultsBoost * 0.62) +
      (leaderBoost * 0.58) -
      (offsides * 0.08) -
      (disciplinePenalty * 0.7);
    summary = `${goals} G • ${assists} A • ${shotsOnTarget}/${shots} SOT`;
  }

  const stabilizedBaseline =
    positionGroup === 'GK' ? 68 : positionGroup === 'DEF' ? 65 : positionGroup === 'MID' ? 66 : 67;
  const stabilized = stabilizedBaseline + ((rawRating - stabilizedBaseline) * reliability);
  const rating = Math.max(42, Math.min(97.5, Math.round(stabilized * 10) / 10));

  return {
    rating,
    tier: bucketTier(rating),
    leaderSummary:
      leaderEntries[0]
        ? `${leaderEntries[0].label} #${leaderEntries[0].rank}`
        : summary,
    positionGroup,
    profileSummary: summary,
    appearances,
    starts,
    goals,
    assists,
    shots,
    shotsOnTarget,
    saves,
    shotsFaced,
    goalsConceded,
  };
}

async function fetchScoreboardPayload(leagueKey) {
  const key = cacheKey('scoreboard-payload', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${siteBase(leagueKey)}/scoreboard`, 45 * 1000);
  return writeCache(key, payload, 45 * 1000);
}

async function getLeagueBrand(leagueKey) {
  const meta = leagueMeta(leagueKey);
  const payload = await fetchScoreboardPayload(leagueKey);
  const league = payload.leagues?.[0] || {};
  return {
    ...meta,
    name: league.name || meta.label,
    logo: league.logos?.[0]?.href || '',
    season: league.season?.displayName || '',
  };
}

async function getTeams(leagueKey) {
  const key = cacheKey('teams', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${siteBase(leagueKey)}/teams`, 12 * 60 * 60 * 1000);
  return writeCache(key, parseTeamsFromPayload(payload), 12 * 60 * 60 * 1000);
}

async function getStandings(leagueKey) {
  const key = cacheKey('standings', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;
  const teams = await getTeams(leagueKey);
  const [teamStatsPayloads, schedules] = await Promise.all([
    mapLimit(
      teams,
      async (team) => ({
        teamId: team.id,
        stats: await getTeamStatistics(leagueKey, team.espnId),
      }),
      6,
    ),
    mapLimit(
      teams,
      async (team) => ({
        teamId: team.id,
        schedule: await fetchTeamSchedule(leagueKey, team.espnId),
      }),
      4,
    ),
  ]);

  const teamStatsMap = Object.fromEntries(teamStatsPayloads.filter(Boolean).map((entry) => [entry.teamId, entry.stats]));
  const scheduleMap = Object.fromEntries(schedules.filter(Boolean).map((entry) => [entry.teamId, entry.schedule]));

  const standings = teams.map((team) => {
    const stats = teamStatsMap[team.id] || {};
    const scheduleSummary = summarizeScheduleResults(scheduleMap[team.id], team.id);
    const parsedRecord = parseRecordSummary(stats.recordSummary || scheduleSummary.record);
    const wins = parsedRecord.gamesPlayed ? parsedRecord.wins : scheduleSummary.wins;
    const ties = parsedRecord.gamesPlayed ? parsedRecord.ties : scheduleSummary.ties;
    const losses = parsedRecord.gamesPlayed ? parsedRecord.losses : scheduleSummary.losses;
    const gamesPlayed = parsedRecord.gamesPlayed || scheduleSummary.gamesPlayed;
    const standingPoints = gamesPlayed ? (wins * 3) + ties : scheduleSummary.standingPoints;
    const standingRank = parseStandingRank(stats.standingSummary);

    return {
      teamId: team.id,
      team,
      wins,
      ties,
      losses,
      gamesPlayed,
      record: parsedRecord.gamesPlayed ? parsedRecord.display : scheduleSummary.record,
      pointsFor: scheduleSummary.pointsFor,
      pointsAgainst: scheduleSummary.pointsAgainst,
      differential: scheduleSummary.differential,
      cleanSheets: scheduleSummary.cleanSheets,
      streak: scheduleSummary.recentFormLabel,
      recentFormPoints: scheduleSummary.recentFormPoints,
      recentFormLabel: scheduleSummary.recentFormLabel,
      recentResults: scheduleSummary.recentResults,
      standingPoints,
      pointsPerMatch: gamesPlayed ? standingPoints / gamesPlayed : 0,
      winPct: gamesPlayed ? standingPoints / Math.max(1, gamesPlayed * 3) : 0,
      standingRank,
      standingSummary: stats.standingSummary || '',
      recordSummary: stats.recordSummary || '',
    };
  });

  standings.sort((left, right) => {
    const leftRank = left.standingRank || Number.MAX_SAFE_INTEGER;
    const rightRank = right.standingRank || Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (right.standingPoints !== left.standingPoints) return right.standingPoints - left.standingPoints;
    if (right.differential !== left.differential) return right.differential - left.differential;
    return right.pointsFor - left.pointsFor;
  });

  return writeCache(key, standings, 20 * 60 * 1000);
}

async function getTeamStatistics(leagueKey, teamId) {
  const key = cacheKey('team-stats', leagueKey, teamId);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${siteBase(leagueKey)}/teams/${teamId}/statistics`, 6 * 60 * 60 * 1000);
  return writeCache(
    key,
    {
      recordSummary: payload?.team?.recordSummary || '',
      standingSummary: payload?.team?.standingSummary || '',
      team: payload?.team || null,
    },
    6 * 60 * 60 * 1000,
  );
}

async function fetchTeamSchedule(leagueKey, teamId) {
  try {
    return await fetchJson(`${siteBase(leagueKey)}/teams/${teamId}/schedule`, 60 * 60 * 1000);
  } catch (_error) {
    return { events: [] };
  }
}

async function computeRankings(leagueKey) {
  const key = cacheKey('rankings', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;

  const [teams, standings] = await Promise.all([getTeams(leagueKey), getStandings(leagueKey)]);
  const standingsMap = Object.fromEntries(standings.map((entry) => [entry.teamId, entry]));

  const base = teams.map((team) => {
    const standing = standingsMap[team.id] || {};
    const gamesPlayed = standing.gamesPlayed || 1;
    const goalsForPerMatch = standing.pointsFor ? standing.pointsFor / gamesPlayed : 0;
    const goalsAgainstPerMatch = standing.pointsAgainst ? standing.pointsAgainst / gamesPlayed : 0;
    const cleanSheets = standing.cleanSheets || 0;
    const standingLift = standing.standingRank ? Math.max(0, teams.length - standing.standingRank + 1) : 0;

    return {
      ...team,
      record: standing.record || '0-0-0',
      streak: standing.recentFormLabel || 'Form pending',
      wins: standing.wins || 0,
      losses: standing.losses || 0,
      ties: standing.ties || 0,
      winPct: standing.winPct || 0,
      standingPoints: standing.standingPoints || 0,
      goalsFor: standing.pointsFor || 0,
      goalsAgainst: standing.pointsAgainst || 0,
      differential: standing.differential || 0,
      goalsForPerMatch,
      goalsAgainstPerMatch,
      cleanSheets,
      standingLift,
      recentFormPoints: standing.recentFormPoints || 0,
      recentFormLabel: standing.recentFormLabel || 'Form pending',
      recentResults: standing.recentResults || [],
      standingRank: standing.standingRank || null,
    };
  });

  const resultsScale = scoreScale(
    base.map((team) => (team.standingPoints / Math.max(1, team.wins + team.losses + team.ties)) * 28 + team.differential * 2.6 + team.recentFormPoints * 1.4 + team.standingLift),
  );
  const offenseScale = scoreScale(
    base.map((team) => team.goalsForPerMatch * 42 + team.differential * 1.8 + team.recentFormPoints * 0.75),
  );
  const defenseScale = scoreScale(
    base.map((team) => team.goalsAgainstPerMatch * 42 - team.cleanSheets * 4.2 - team.differential * 1.7 - team.standingLift * 0.4),
    false,
  );

  const ranked = base.map((team) => {
    const resultsScore = resultsScale(
      (team.standingPoints / Math.max(1, team.wins + team.losses + team.ties)) * 28 + team.differential * 2.6 + team.recentFormPoints * 1.4 + team.standingLift,
    );
    const offScore = offenseScale(team.goalsForPerMatch * 42 + team.differential * 1.8 + team.recentFormPoints * 0.75);
    const defScore = defenseScale(team.goalsAgainstPerMatch * 42 - team.cleanSheets * 4.2 - team.differential * 1.7 - team.standingLift * 0.4);
    const ovrScore = Math.round((resultsScore * 0.46 + offScore * 0.28 + defScore * 0.26) * 10) / 10;
    const globalScore = Math.round(ovrScore * leagueMeta(leagueKey).competitionWeight * 10) / 10;

    return {
      ...team,
      resultsScore,
      offScore,
      defScore,
      ovrScore,
      globalScore,
      groupLabel: team.location || team.abbreviation,
      competition: leagueMeta(leagueKey).label,
    };
  });

  ranked.sort((left, right) => right.ovrScore - left.ovrScore || right.winPct - left.winPct);
  ranked.forEach((team, index) => {
    team.ovrRank = index + 1;
  });
  [...ranked]
    .sort((left, right) => right.offScore - left.offScore)
    .forEach((team, index) => {
      team.offRank = index + 1;
    });
  [...ranked]
    .sort((left, right) => right.defScore - left.defScore)
    .forEach((team, index) => {
      team.defRank = index + 1;
    });

  return writeCache(key, ranked, 20 * 60 * 1000);
}

async function fetchScoreboard(leagueKey) {
  const key = cacheKey('scoreboard', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchScoreboardPayload(leagueKey);
  const games = (payload.events || []).map((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const away = competitors.find((item) => item.homeAway === 'away');
    const home = competitors.find((item) => item.homeAway === 'home');
    const status = competition?.status?.type || event.status?.type || {};
    const broadcast = competition?.broadcasts?.[0]?.names?.[0] || '';
    const odds = extractEspnOdds(competition, event?.pickcenter?.[0] || null);
    return {
      id: event.id,
      league: leagueKey,
      competition: leagueMeta(leagueKey).label,
      name: event.name || event.shortName,
      shortName: event.shortName,
      state: status.state || 'pre',
      statusLabel: status.detail || status.shortDetail || status.description || 'Scheduled',
      startTime: event.date,
      startLabel: new Date(event.date).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
      broadcast,
      odds,
      rawCompetition: competition,
      away: {
        teamId: away?.team?.id ? String(away.team.id) : '',
        abbreviation: away?.team?.abbreviation || away?.team?.shortDisplayName || 'AWAY',
        displayName: away?.team?.displayName || 'Away',
        logo: away?.team?.logo || away?.team?.logos?.[0]?.href || '',
        score: away?.score || '0',
        record: away?.records?.[0]?.summary || '',
        winner: away?.winner || false,
      },
      home: {
        teamId: home?.team?.id ? String(home.team.id) : '',
        abbreviation: home?.team?.abbreviation || home?.team?.shortDisplayName || 'HOME',
        displayName: home?.team?.displayName || 'Home',
        logo: home?.team?.logo || home?.team?.logos?.[0]?.href || '',
        score: home?.score || '0',
        record: home?.records?.[0]?.summary || '',
        winner: home?.winner || false,
      },
    };
  });
  return writeCache(key, games, 45 * 1000);
}

async function fetchNews(leagueKey) {
  const key = cacheKey('news', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${siteBase(leagueKey)}/news`, 30 * 60 * 1000);
  const articles = (payload.articles || [])
    .slice(0, 8)
    .map((article, index) =>
      normalizeEspnNewsArticle(article, {
        fallbackSource: leagueMeta(leagueKey).label,
        fallbackId: `${leagueKey}-news-${index}`,
      }),
    )
    .filter((article) => article.storyId);
  return writeCache(key, articles, 30 * 60 * 1000);
}

async function fetchLeaders(leagueKey) {
  const key = cacheKey('leaders', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const payload = await fetchJson(`${siteBase(leagueKey)}/leaders`, 60 * 60 * 1000);
    const leaders = [];
    walk(payload, (node) => {
      if (node?.athlete?.id && (node.rank || node.displayValue || node.value)) {
        leaders.push({
          athleteId: String(node.athlete.id),
          label: node.name || node.displayName || node.shortDisplayName || 'Leader',
          rank: Number(node.rank || 1),
          value: node.displayValue || node.value || '',
          athlete: {
            id: String(node.athlete.id),
            displayName: node.athlete.displayName || node.athlete.shortName || 'Player',
            shortName: node.athlete.shortName || node.athlete.displayName || 'Player',
            headshot: node.athlete.headshot?.href || node.athlete.headshot || '',
            position:
              node.athlete.position?.abbreviation ||
              node.athlete.position?.displayName ||
              node.athlete.position?.name ||
              '',
          },
          teamId: node.team?.id ? String(node.team.id) : '',
        });
      }
    });
    return writeCache(key, uniqBy(leaders, (leader) => `${leader.athleteId}:${leader.label}`), 60 * 60 * 1000);
  } catch (_error) {
    return writeCache(key, [], 10 * 60 * 1000);
  }
}

function bucketTier(rating) {
  if (rating >= 93) return 'world-class';
  if (rating >= 86) return 'elite';
  if (rating >= 78) return 'impact';
  if (rating >= 70) return 'starter';
  return 'depth';
}

async function fetchRoster(leagueKey, teamId) {
  const key = cacheKey('roster', leagueKey, teamId);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${siteBase(leagueKey)}/teams/${teamId}/roster`, 12 * 60 * 60 * 1000);
  return writeCache(key, payload, 12 * 60 * 60 * 1000);
}

function parseRosterPlayers(payload, team) {
  const players = [];
  walk(payload, (node) => {
    if (node?.id && (node.displayName || node.fullName || node.shortName) && node.position) {
      const flattenedStats = flattenAthleteStatistics(node.statistics);
      players.push({
        id: String(node.id),
        displayName: node.displayName || node.fullName || node.shortName,
        shortName: node.shortName || node.displayName || node.fullName,
        position: node.position?.abbreviation || node.position?.displayName || node.position?.name || '',
        jersey: node.jersey || '',
        age: node.age || null,
        headshot: node.headshot?.href || node.headshot || '',
        team,
        statistics: flattenedStats.statMap,
        statFeed: flattenedStats.statFeed,
      });
    }
  });
  return uniqBy(players, (player) => player.id);
}

async function getFeaturedPlayers(leagueKey, rankings = null) {
  const catalog = await getPlayerCatalog(leagueKey);
  return (catalog.players || []).slice(0, 12).map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

async function getPlayerCatalog(leagueKey) {
  const key = cacheKey('players', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;

  const [teams, rankings, leaders] = await Promise.all([getTeams(leagueKey), computeRankings(leagueKey), fetchLeaders(leagueKey)]);
  const rankingMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
  const leaderMap = new Map();

  leaders.forEach((leader) => {
    const list = leaderMap.get(leader.athleteId) || [];
    list.push(leader);
    leaderMap.set(leader.athleteId, list);
  });

  const rosters = await mapLimit(
    teams,
    async (team) => {
      const payload = await fetchRoster(leagueKey, team.espnId);
      return parseRosterPlayers(payload, rankingMap[team.id] || team);
    },
    6,
  );

  const players = uniqBy(rosters.flat().filter(Boolean), (player) => player.id)
    .map((player) => {
      const team = rankingMap[player.team.id] || player.team;
      const leaderEntries = (leaderMap.get(player.id) || []).sort((left, right) => left.rank - right.rank);
      const ratingCard = buildFootballPlayerRating(player, team, leaderEntries);

      return {
        ...player,
        leaders: leaderEntries,
        leaderSummary: ratingCard.leaderSummary,
        rating: ratingCard.rating,
        tier: ratingCard.tier,
        positionGroup: ratingCard.positionGroup,
        profileSummary: ratingCard.profileSummary,
        metrics: {
          appearances: ratingCard.appearances,
          starts: ratingCard.starts,
          goals: ratingCard.goals,
          assists: ratingCard.assists,
          shots: ratingCard.shots,
          shotsOnTarget: ratingCard.shotsOnTarget,
          saves: ratingCard.saves,
          shotsFaced: ratingCard.shotsFaced,
          goalsConceded: ratingCard.goalsConceded,
        },
        competition: leagueMeta(leagueKey).label,
      };
    })
    .sort((left, right) => right.rating - left.rating || left.displayName.localeCompare(right.displayName))
    .map((player, index) => ({ ...player, rank: index + 1 }));

  return writeCache(
    key,
    {
      league: leagueKey,
      players,
      lastUpdated: new Date().toISOString(),
      totalPlayers: players.length,
    },
    6 * 60 * 60 * 1000,
  );
}

async function fetchAthleteStats(leagueKey, athleteId) {
  const catalog = await getPlayerCatalog(leagueKey);
  const catalogPlayer = catalog.players.find((player) => player.id === String(athleteId));
  if (catalogPlayer?.statFeed?.length) {
    return catalogPlayer.statFeed.slice(0, 16);
  }

  try {
    const payload = await fetchJson(`${siteBase(leagueKey)}/athletes/${athleteId}/stats`, 30 * 60 * 60 * 1000);
    const statLines = [];
    walk(payload, (node) => {
      if (Array.isArray(node?.stats) && node.displayName) {
        node.stats.slice(0, 10).forEach((stat) => {
          statLines.push({
            group: node.displayName,
            label: stat.displayName || stat.name || 'Stat',
            value: stat.displayValue || stat.value || '0',
          });
        });
      }
    });
    return statLines.slice(0, 16);
  } catch (_error) {
    return [];
  }
}

function buildPredictors(scoreboard, rankings, leagueKey, players = []) {
  const rankingMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
  const playerImpactMap = players.reduce((map, player) => {
    const teamId = String(player.team?.id || '');
    if (!teamId) return map;
    const list = map.get(teamId) || [];
    list.push(Number(player.rating || 0));
    map.set(teamId, list);
    return map;
  }, new Map());

  return scoreboard
    .filter((game) => game.home.teamId && game.away.teamId)
    .slice(0, 12)
    .map((game) => {
      const home = rankingMap[game.home.teamId];
      const away = rankingMap[game.away.teamId];
      const homePlayerImpact = (playerImpactMap.get(String(game.home.teamId)) || []).sort((a, b) => b - a).slice(0, 5);
      const awayPlayerImpact = (playerImpactMap.get(String(game.away.teamId)) || []).sort((a, b) => b - a).slice(0, 5);
      const homeImpactBoost = homePlayerImpact.length ? homePlayerImpact.reduce((sum, value) => sum + value, 0) / homePlayerImpact.length : 70;
      const awayImpactBoost = awayPlayerImpact.length ? awayPlayerImpact.reduce((sum, value) => sum + value, 0) / awayPlayerImpact.length : 70;
      const homeStrength =
        (home?.globalScore || home?.ovrScore || 70) +
        (home?.resultsScore || 50) * 0.18 +
        (home?.recentFormPoints || 0) * 0.9 +
        (homeImpactBoost - 70) * 0.35 +
        3.1;
      const awayStrength =
        (away?.globalScore || away?.ovrScore || 70) +
        (away?.resultsScore || 50) * 0.18 +
        (away?.recentFormPoints || 0) * 0.9 +
        (awayImpactBoost - 70) * 0.35;
      const diff = homeStrength - awayStrength;
      const homeWinProbability = Math.max(8, Math.min(92, Math.round((1 / (1 + Math.exp(-(diff / 14)))) * 100)));
      const projectedHomeScore = Math.max(
        0,
        Math.round((1.2 + (homeStrength - (away?.defScore || 50)) / 42 + ((home?.offScore || 50) - (away?.defScore || 50)) / 70) * 10) / 10,
      );
      const projectedAwayScore = Math.max(
        0,
        Math.round((1.05 + (awayStrength - (home?.defScore || 50)) / 42 + ((away?.offScore || 50) - (home?.defScore || 50)) / 70) * 10) / 10,
      );
      const projectedMargin = Number((projectedHomeScore - projectedAwayScore).toFixed(1));
      const projectedTotal = Number((projectedHomeScore + projectedAwayScore).toFixed(1));
      const marketHomeProbability = moneylineToProbability(game.odds?.homeMoneyline);
      const marketEdge =
        Number.isFinite(marketHomeProbability) && marketHomeProbability !== null
          ? Number((homeWinProbability / 100 - marketHomeProbability).toFixed(3))
          : null;
      const spreadEdge =
        Number.isFinite(Number(game.odds?.homeSpread))
          ? Number((projectedMargin + Number(game.odds.homeSpread)).toFixed(1))
          : null;
      const totalEdge =
        Number.isFinite(Number(game.odds?.overUnder))
          ? Number((projectedTotal - Number(game.odds.overUnder)).toFixed(1))
          : null;
      const leaningHome = homeWinProbability >= 50;
      let bettingLean = `${leaningHome ? game.home.abbreviation : game.away.abbreviation} model lean`;
      if (marketEdge !== null && Math.abs(marketEdge) >= 0.045) {
        bettingLean = `${leaningHome ? game.home.abbreviation : game.away.abbreviation} moneyline lean`;
      } else if (spreadEdge !== null && Math.abs(spreadEdge) >= 0.55) {
        bettingLean = `${spreadEdge > 0 ? game.home.abbreviation : game.away.abbreviation} spread lean`;
      } else if (totalEdge !== null && Math.abs(totalEdge) >= 0.45) {
        bettingLean = `${totalEdge > 0 ? 'Over' : 'Under'} ${game.odds?.overUnder}`;
      }
      const explanation = [
        `${leaningHome ? game.home.displayName : game.away.displayName} carries the stronger club path with ${homeWinProbability}% home win odds.`,
        home && away
          ? `${home.displayName} results ${home.resultsScore} / OFF ${home.offScore} / DEF ${home.defScore} vs ${away.displayName} results ${away.resultsScore} / OFF ${away.offScore} / DEF ${away.defScore}.`
          : null,
        spreadEdge !== null ? `Projected margin is ${projectedMargin >= 0 ? '+' : ''}${projectedMargin} against ${game.odds?.homeSpread ?? 'N/A'} on the home spread.` : null,
        totalEdge !== null ? `Projected total is ${projectedTotal} against ${game.odds?.overUnder}.` : null,
      ].filter(Boolean);

      return {
        gameId: game.id,
        home: {
          abbreviation: game.home.abbreviation,
          displayName: game.home.displayName,
        },
        away: {
          abbreviation: game.away.abbreviation,
          displayName: game.away.displayName,
        },
        homeWinProbability,
        awayWinProbability: Math.max(8, 100 - homeWinProbability),
        projectedHomeScore,
        projectedAwayScore,
        projectedMargin,
        projectedTotal,
        odds: game.odds || null,
        marketEdge,
        spreadEdge,
        totalEdge,
        bettingLean,
        americanOdds: leaningHome ? game.odds?.homeMoneyline ?? null : game.odds?.awayMoneyline ?? null,
        explanation,
        confidence:
          Math.abs(diff) > 12 || (marketEdge !== null && Math.abs(marketEdge) >= 0.08)
            ? 'High'
            : Math.abs(diff) > 6 || (spreadEdge !== null && Math.abs(spreadEdge) >= 0.75)
              ? 'Medium'
              : 'Lean',
      };
    })
    .sort((left, right) => {
      const leftEdge = Math.max(Math.abs(left.marketEdge || 0) * 100, Math.abs(left.spreadEdge || 0), Math.abs(left.totalEdge || 0));
      const rightEdge = Math.max(Math.abs(right.marketEdge || 0) * 100, Math.abs(right.spreadEdge || 0), Math.abs(right.totalEdge || 0));
      return rightEdge - leftEdge;
    });
}

async function getFootballBootstrap(leagueKey) {
  const [scoreboard, rankings, news, brand, playersCatalog] = await Promise.all([
    fetchScoreboard(leagueKey),
    computeRankings(leagueKey),
    fetchNews(leagueKey),
    getLeagueBrand(leagueKey),
    getPlayerCatalog(leagueKey),
  ]);

  const featuredPlayers = (playersCatalog.players || []).slice(0, 12);

  return {
    league: brand,
    headline: `${brand.label} is tracking live fixtures, club power, player impact, and match edges inside Composite Football.`,
    scoreboard,
    rankings,
    teams: rankings,
    news,
    featuredPlayers,
    playersCatalog,
    predictors: buildPredictors(scoreboard, rankings, leagueKey, playersCatalog.players || []),
    meta: {
      liveGames: scoreboard.filter((game) => game.state === 'in').length,
      teamCount: rankings.length,
      playerCountLabel: `${playersCatalog.players?.length || 0} players tracked`,
    },
    lastUpdated: new Date().toISOString(),
  };
}

async function getPlayerDetail(leagueKey, playerId) {
  const [catalog, stats] = await Promise.all([getPlayerCatalog(leagueKey), fetchAthleteStats(leagueKey, playerId)]);
  const player = catalog.players.find((entry) => entry.id === String(playerId));
  if (!player) {
    throw new Error('Player not found');
  }

  const analysis = player.leaders?.length
    ? `${player.displayName} grades in the ${player.tier} tier for ${leagueMeta(leagueKey).label} thanks to ${player.leaders
        .slice(0, 2)
        .map((entry) => `${entry.label} #${entry.rank}`)
        .join(' and ')}.`
    : `${player.displayName} grades ${player.rating} OVR in ${leagueMeta(leagueKey).label} with a ${player.positionGroup || 'role'} profile built from ${player.profileSummary || 'current season usage'} and club context.`;

  return {
    league: leagueKey,
    player,
    stats,
    analysis,
    lastUpdated: new Date().toISOString(),
  };
}

async function getTeamDetail(leagueKey, teamId) {
  const [rankings, playersCatalog, schedulePayload] = await Promise.all([
    computeRankings(leagueKey),
    getPlayerCatalog(leagueKey),
    fetchTeamSchedule(leagueKey, teamId),
  ]);

  const team = rankings.find((entry) => entry.id === String(teamId));
  if (!team) {
    throw new Error('Team not found');
  }

  const roster = playersCatalog.players.filter((player) => player.team.id === String(teamId));
  const recent = summarizeScheduleResults(schedulePayload, teamId);

  return {
    league: leagueKey,
    team,
    roster,
    recent: recent.recentResults,
    lastUpdated: new Date().toISOString(),
  };
}

async function getGameDetail(leagueKey, gameId) {
  const scoreboard = await fetchScoreboard(leagueKey);
  const game = scoreboard.find((entry) => entry.id === String(gameId));
  if (!game) {
    throw new Error('Game not found');
  }

  try {
    const summary = await fetchJson(`${siteBase(leagueKey)}/summary?event=${gameId}`, 20 * 1000);
    const competition = summary.header?.competitions?.[0] || null;
    const venue = summary.gameInfo?.venue?.fullName || competition?.venue?.fullName || '';
    const venueAddress = summary.gameInfo?.venue?.address || competition?.venue?.address || {};
    const location = [venueAddress.city, venueAddress.state, venueAddress.country].filter(Boolean).join(', ');
    const broadcast =
      competition?.broadcasts?.[0]?.media?.shortName ||
      competition?.broadcasts?.[0]?.names?.join(', ') ||
      '';
    const notes = [];
    walk(summary, (node) => {
      if (typeof node === 'string' && node.length > 18 && notes.length < 12) {
        notes.push(node);
      }
    });

    return {
      league: leagueKey,
      game,
      headline:
        summary.predictor?.header ||
        summary.header?.competitions?.[0]?.note?.headline ||
        summary.article?.headline ||
        game.name,
      summary:
        summary.header?.competitions?.[0]?.note?.headline ||
        summary.predictor?.header ||
        game.statusLabel,
      venue,
      location,
      broadcast,
      notes: uniqBy(notes, (note) => note).slice(0, 8),
      lastUpdated: new Date().toISOString(),
    };
  } catch (_error) {
    return {
      league: leagueKey,
      game,
      headline: game.name,
      summary: game.statusLabel,
      venue: '',
      location: '',
      broadcast: game.broadcast || '',
      notes: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

function timeProximityBoost(startTime) {
  if (!startTime) return 0;
  const diffHours = Math.abs(new Date(startTime).getTime() - Date.now()) / (1000 * 60 * 60);
  if (diffHours <= 3) return 10;
  if (diffHours <= 8) return 6;
  if (diffHours <= 20) return 3;
  return 0;
}

async function getFootballLanding() {
  const leagueKeys = Object.keys(FOOTBALL_LEAGUES);
  const leagueData = await Promise.all(
    leagueKeys.map(async (leagueKey) => {
      const [brand, rankings, scoreboard, playersCatalog] = await Promise.all([
        getLeagueBrand(leagueKey),
        computeRankings(leagueKey),
        fetchScoreboard(leagueKey),
        getPlayerCatalog(leagueKey),
      ]);
      return { leagueKey, brand, rankings, scoreboard, playersCatalog };
    }),
  );

  const leagueCards = leagueData.map(({ leagueKey, brand, rankings, scoreboard }) => ({
    key: leagueKey,
    path: `/football/${leagueKey}`,
    label: brand.label,
    region: brand.region,
    logo: brand.logo,
    accent: brand.accent,
    accentAlt: brand.accentAlt,
    surface: brand.surface,
    liveCount: scoreboard.filter((game) => game.state === 'in').length,
    matchCount: scoreboard.length,
    topTeam: rankings[0] || null,
    blurb: brand.cardBlurb,
  }));

  const topPlayers = leagueData
    .flatMap(({ leagueKey, brand, playersCatalog }) =>
      (playersCatalog?.players || []).slice(0, 5).map((player) => ({
        ...player,
        leagueKey,
        leagueLabel: brand.label,
      })),
    )
    .sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0))
    .slice(0, 3);

  const topMatches = leagueData
    .flatMap(({ leagueKey, brand, rankings, scoreboard }) => {
      const rankingMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
      return scoreboard
        .filter((game) => isSameEasternDate(game.startTime, new Date()))
        .map((game) => {
        const away = rankingMap[game.away.teamId];
        const home = rankingMap[game.home.teamId];
        const power = ((away?.globalScore || away?.ovrScore || 70) + (home?.globalScore || home?.ovrScore || 70)) / 2;
        const stateBoost = game.state === 'in' ? 12 : game.state === 'pre' ? 6 : 2;
        const matchScore = brand.competitionWeight * 40 + power * 0.55 + stateBoost + timeProximityBoost(game.startTime);

        return {
          ...game,
          leagueKey,
          leagueLabel: brand.label,
          leagueLogo: brand.logo,
          matchScore,
          projectedHeadline: `${game.away.abbreviation} at ${game.home.abbreviation}`,
        };
      });
    })
    .sort((left, right) => {
      if (left.leagueKey === 'champions-league' && right.leagueKey !== 'champions-league') return -1;
      if (right.leagueKey === 'champions-league' && left.leagueKey !== 'champions-league') return 1;
      if (right.matchScore !== left.matchScore) return right.matchScore - left.matchScore;
      return compareByStartTime(left.startTime, right.startTime);
    })
    .slice(0, 3);

  return {
    title: 'Composite Football',
    subtitle: 'Step through the tunnel, scan the biggest matches of the day, and drop into any league board from one global football hub.',
    topMatches,
    topPlayers,
    leagues: leagueCards,
    lastUpdated: new Date().toISOString(),
  };
}

export function isFootballLeague(leagueKey) {
  return Boolean(FOOTBALL_LEAGUES[leagueKey]);
}

export function getFootballLeagueConfig(leagueKey) {
  return leagueMeta(leagueKey);
}

export {
  getFootballBootstrap,
  getPlayerCatalog as getFootballPlayerCatalog,
  getPlayerDetail as getFootballPlayerDetail,
  getTeamDetail as getFootballTeamDetail,
  getGameDetail as getFootballGameDetail,
  getFootballLanding,
  getFeaturedPlayers as getFootballFeaturedPlayers,
  computeRankings as computeFootballRankings,
};
