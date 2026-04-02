import { getSportConfig } from '@/src/data/sports';
import { normalizeEspnNewsArticle } from '@/src/lib/espn-news';

const CACHE = new Map();

const GENERIC_SPORTS = {
  cbb: {
    key: 'cbb',
    label: 'CBB',
    teamCountLabel: 'Full D-I men',
    scoreboardAverage: 72,
    site: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball',
    core: 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball',
    successWeight: 0.5,
  },
  nfl: {
    key: 'nfl',
    label: 'NFL',
    teamCountLabel: '32 clubs',
    scoreboardAverage: 23,
    site: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl',
    core: 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl',
    successWeight: 0.55,
  },
  mls: {
    key: 'mls',
    label: 'MLS',
    teamCountLabel: 'League squads',
    scoreboardAverage: 2,
    site: 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1',
    core: 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/usa.1',
    successWeight: 0.52,
  },
};

function cacheKey(scope, sport, extra = '') {
  return `${scope}:${sport}:${extra}`;
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

function uniqBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    map.set(getKey(item), item);
  });
  return Array.from(map.values());
}

function sportMeta(sport) {
  const meta = GENERIC_SPORTS[sport];
  if (!meta) {
    throw new Error(`Unsupported sport "${sport}"`);
  }
  return meta;
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

async function getTeams(sport) {
  const meta = sportMeta(sport);
  const key = cacheKey('teams', sport);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${meta.site}/teams`, 12 * 60 * 60 * 1000);
  return writeCache(key, parseTeamsFromPayload(payload), 12 * 60 * 60 * 1000);
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

async function getStandings(sport) {
  const meta = sportMeta(sport);
  const key = cacheKey('standings', sport);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${meta.site}/standings`, 20 * 60 * 1000);
  const entries = [];
  walk(payload, (node) => {
    if (node?.team?.id && Array.isArray(node?.stats)) {
      entries.push(node);
    }
  });

  const standings = uniqBy(
    entries.map((entry) => {
      const stats = flattenStats(entry.stats);
      const wins = getStatValue(stats, ['wins']);
      const losses = getStatValue(stats, ['losses']);
      const ties = getStatValue(stats, ['ties', 'draws']);
      const gamesPlayed = getStatValue(stats, ['gamesplayed', 'games'], wins + losses + ties);
      const recordText =
        stats.recordDisplay ||
        [wins, losses, ties].filter((value, index) => value || (index < 2)).join('-');
      const pointsFor = getStatValue(stats, [
        'pointsfor',
        'goalsfor',
        'points',
        'runs',
        'pointsscored',
      ]);
      const pointsAgainst = getStatValue(stats, [
        'pointsagainst',
        'goalsagainst',
        'oppoints',
        'pointsallowed',
      ]);
      const differential = getStatValue(stats, ['differential', 'pointdifferential', 'goaldifferential'], pointsFor - pointsAgainst);
      const streak = stats.streakDisplay || stats.streak || 'Even';
      const standingPoints = getStatValue(stats, ['points', 'standingpoints'], 0);
      const winPctRaw = getStatValue(stats, ['winpercent', 'winningpercentage']);
      const winPct =
        typeof winPctRaw === 'number' && winPctRaw > 0
          ? winPctRaw > 1
            ? winPctRaw / 100
            : winPctRaw
          : gamesPlayed
            ? (wins + ties * 0.5) / gamesPlayed
            : 0;

      return {
        teamId: String(entry.team.id),
        team: parseTeam(entry.team),
        wins,
        losses,
        ties,
        gamesPlayed,
        record: recordText,
        pointsFor,
        pointsAgainst,
        differential,
        streak,
        standingPoints,
        winPct,
      };
    }),
    (entry) => entry.teamId,
  );

  return writeCache(key, standings, 20 * 60 * 1000);
}

function flattenStatisticsPayload(payload) {
  const stats = {};
  walk(payload, (node) => {
    if (Array.isArray(node?.stats)) {
      const localMap = flattenStats(node.stats);
      Object.assign(stats, localMap);
    }
  });
  return stats;
}

async function getTeamStatistics(sport, teamId) {
  const meta = sportMeta(sport);
  const key = cacheKey('team-stats', sport, teamId);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${meta.site}/teams/${teamId}/statistics`, 6 * 60 * 60 * 1000);
  return writeCache(key, flattenStatisticsPayload(payload), 6 * 60 * 60 * 1000);
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
      } catch (error) {
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

function metricSetForSport(sport) {
  if (sport === 'nfl') {
    return {
      offense: ['pointspergame', 'yardspergame', 'totaloffensiveyards', 'passingyards', 'rushingyards'],
      defense: ['pointsallowedpergame', 'yardsallowedpergame', 'goalsagainst', 'opppointspergame'],
    };
  }
  if (sport === 'mls') {
    return {
      offense: ['goalsfor', 'shotsontargetpergame', 'goalsscored', 'pointsfor'],
      defense: ['goalsagainst', 'goalsagainstaverage', 'pointsagainst'],
    };
  }
  return {
    offense: ['pointspergame', 'pointsscored', 'fieldgoalpct', 'assistspergame', 'offensivereboundspergame'],
    defense: ['pointsallowedpergame', 'opppointspergame', 'blockspergame', 'stealspergame'],
  };
}

async function computeRankings(sport) {
  const key = cacheKey('rankings', sport);
  const cached = readCache(key);
  if (cached) return cached;

  const [teams, standings] = await Promise.all([getTeams(sport), getStandings(sport)]);
  const standingsMap = Object.fromEntries(standings.map((entry) => [entry.teamId, entry]));
  const metricSet = metricSetForSport(sport);
  const teamStats = await mapLimit(
    teams,
    async (team) => ({
      teamId: team.id,
      stats: await getTeamStatistics(sport, team.espnId),
    }),
    sport === 'cbb' ? 12 : 8,
  );
  const statMap = Object.fromEntries(teamStats.filter(Boolean).map((entry) => [entry.teamId, entry.stats]));

  const base = teams.map((team) => {
    const standing = standingsMap[team.id] || {};
    const stats = statMap[team.id] || {};
    const offenseValue =
      metricSet.offense.map((key) => getStatValue(stats, [key], NaN)).find((value) => Number.isFinite(value)) ??
      standing.pointsFor ??
      0;
    const defenseValue =
      metricSet.defense.map((key) => getStatValue(stats, [key], NaN)).find((value) => Number.isFinite(value)) ??
      standing.pointsAgainst ??
      0;
    return {
      ...team,
      record: standing.record || '0-0',
      streak: standing.streak || 'Even',
      winPct: standing.winPct || 0,
      differential: standing.differential || 0,
      standingPoints: standing.standingPoints || 0,
      pointsFor: standing.pointsFor || 0,
      pointsAgainst: standing.pointsAgainst || 0,
      offenseValue,
      defenseValue,
    };
  });

  const successScale = scoreScale(base.map((team) => (team.winPct * 100) + (team.differential * 0.5) + team.standingPoints));
  const offenseScale = scoreScale(base.map((team) => team.offenseValue));
  const defenseScale = scoreScale(base.map((team) => team.defenseValue), false);

  const ranked = base.map((team) => {
    const successScore = successScale((team.winPct * 100) + (team.differential * 0.5) + team.standingPoints);
    const offScore = offenseScale(team.offenseValue);
    const defScore = defenseScale(team.defenseValue);
    const ovrScore = Math.round(
      (successScore * sportMeta(sport).successWeight + offScore * 0.25 + defScore * (0.75 - sportMeta(sport).successWeight)) *
        10,
    ) / 10;
    return {
      ...team,
      successScore,
      offScore,
      defScore,
      ovrScore,
      groupLabel: team.location || team.abbreviation,
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

async function fetchScoreboard(sport) {
  const meta = sportMeta(sport);
  const key = cacheKey('scoreboard', sport);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${meta.site}/scoreboard`, 45 * 1000);
  const games = (payload.events || []).map((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const away = competitors.find((item) => item.homeAway === 'away');
    const home = competitors.find((item) => item.homeAway === 'home');
    const status = competition?.status?.type || event.status?.type || {};
    const broadcast = competition?.broadcasts?.[0]?.names?.[0] || '';
    return {
      id: event.id,
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
      home: {
        teamId: home?.team?.id ? String(home.team.id) : '',
        abbreviation: home?.team?.abbreviation || home?.team?.shortDisplayName || 'HOME',
        displayName: home?.team?.displayName || 'Home',
        logo: home?.team?.logo || home?.team?.logos?.[0]?.href || '',
        score: home?.score || '0',
        record: home?.records?.[0]?.summary || '',
        winner: home?.winner || false,
      },
      away: {
        teamId: away?.team?.id ? String(away.team.id) : '',
        abbreviation: away?.team?.abbreviation || away?.team?.shortDisplayName || 'AWAY',
        displayName: away?.team?.displayName || 'Away',
        logo: away?.team?.logo || away?.team?.logos?.[0]?.href || '',
        score: away?.score || '0',
        record: away?.records?.[0]?.summary || '',
        winner: away?.winner || false,
      },
    };
  });
  return writeCache(key, games, 45 * 1000);
}

async function fetchNews(sport) {
  const meta = sportMeta(sport);
  const key = cacheKey('news', sport);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${meta.site}/news`, 30 * 60 * 1000);
  const articles = (payload.articles || [])
    .slice(0, 8)
    .map((article, index) =>
      normalizeEspnNewsArticle(article, {
        fallbackSource: meta.label,
        fallbackId: `${sport}-news-${index}`,
      }),
    )
    .filter((article) => article.storyId);
  return writeCache(key, articles, 30 * 60 * 1000);
}

async function fetchLeaders(sport) {
  const meta = sportMeta(sport);
  const key = cacheKey('leaders', sport);
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const payload = await fetchJson(`${meta.site}/leaders`, 60 * 60 * 1000);
    const leaders = [];
    walk(payload, (node) => {
      if (node?.athlete?.id && (node.rank || node.displayValue || node.value)) {
        leaders.push({
          athleteId: String(node.athlete.id),
          label: node.name || node.displayName || node.shortDisplayName || 'Leader',
          rank: node.rank || 1,
          value: node.displayValue || node.value || '',
          athlete: {
            id: String(node.athlete.id),
            displayName: node.athlete.displayName || node.athlete.shortName || 'Player',
            shortName: node.athlete.shortName || node.athlete.displayName || 'Player',
            headshot: node.athlete.headshot?.href || node.athlete.headshot || '',
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
  if (rating >= 92) return 'elite';
  if (rating >= 84) return 'impact';
  if (rating >= 76) return 'starter';
  if (rating >= 68) return 'rotation';
  return 'depth';
}

async function fetchRoster(sport, teamId) {
  const meta = sportMeta(sport);
  const key = cacheKey('roster', sport, teamId);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${meta.site}/teams/${teamId}/roster`, 12 * 60 * 60 * 1000);
  return writeCache(key, payload, 12 * 60 * 60 * 1000);
}

function parseRosterPlayers(payload, team) {
  const players = [];
  walk(payload, (node) => {
    if (node?.id && (node.displayName || node.fullName || node.shortName) && node.position) {
      players.push({
        id: String(node.id),
        displayName: node.displayName || node.fullName || node.shortName,
        shortName: node.shortName || node.displayName || node.fullName,
        position: node.position?.abbreviation || node.position?.displayName || node.position?.name || '',
        jersey: node.jersey || '',
        age: node.age || null,
        headshot: node.headshot?.href || node.headshot || '',
        team,
      });
    }
  });
  return uniqBy(players, (player) => player.id);
}

async function getPlayerCatalog(sport) {
  const key = cacheKey('players', sport);
  const cached = readCache(key);
  if (cached) return cached;

  const [teams, rankings, leaders] = await Promise.all([getTeams(sport), computeRankings(sport), fetchLeaders(sport)]);
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
      const payload = await fetchRoster(sport, team.espnId);
      return parseRosterPlayers(payload, rankingMap[team.id] || team);
    },
    sport === 'cbb' ? 14 : 8,
  );

  const players = uniqBy(rosters.flat().filter(Boolean), (player) => player.id)
    .map((player) => {
      const teamRank = rankingMap[player.team.id]?.ovrRank || teams.length;
      const leaderEntries = leaderMap.get(player.id) || [];
      const leaderBoost = leaderEntries
        .slice(0, 3)
        .reduce((total, entry) => total + Math.max(0, 18 - Number(entry.rank || 18)), 0);
      const rankBoost = Math.max(0, 20 - teamRank);
      const ageBoost = player.age ? Math.max(0, 4 - Math.abs(23 - player.age) * 0.35) : 1.5;
      const rating = Math.max(42, Math.min(99, Math.round(48 + leaderBoost * 0.9 + rankBoost * 0.9 + ageBoost)));
      return {
        ...player,
        leaders: leaderEntries,
        leaderSummary:
          leaderEntries[0] ? `${leaderEntries[0].label} #${leaderEntries[0].rank}` : `${player.team.abbreviation} roster board`,
        rating,
        tier: bucketTier(rating),
      };
    })
    .sort((left, right) => right.rating - left.rating || left.displayName.localeCompare(right.displayName))
    .map((player, index) => ({ ...player, rank: index + 1 }));

  return writeCache(
    key,
    {
      sport,
      players,
      lastUpdated: new Date().toISOString(),
      totalPlayers: players.length,
    },
    sport === 'cbb' ? 2 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000,
  );
}

async function fetchAthleteStats(sport, athleteId) {
  const meta = sportMeta(sport);
  try {
    const payload = await fetchJson(`${meta.site}/athletes/${athleteId}/stats`, 30 * 60 * 60 * 1000);
    const statLines = [];
    walk(payload, (node) => {
      if (Array.isArray(node?.stats) && node.displayName) {
        node.stats.slice(0, 6).forEach((stat) => {
          statLines.push({
            group: node.displayName,
            label: stat.displayName || stat.name || 'Stat',
            value: stat.displayValue || stat.value || '0',
          });
        });
      }
    });
    return statLines.slice(0, 14);
  } catch (_error) {
    return [];
  }
}

async function getPlayerDetail(sport, playerId) {
  const [catalog, stats] = await Promise.all([getPlayerCatalog(sport), fetchAthleteStats(sport, playerId)]);
  const player = catalog.players.find((entry) => entry.id === String(playerId));
  if (!player) {
    throw new Error('Player not found');
  }
  const analysis = player.leaders?.length
    ? `${player.displayName} lands in the ${player.tier} tier thanks to ${player.leaders
        .slice(0, 2)
        .map((entry) => `${entry.label} #${entry.rank}`)
        .join(' and ')}.`
    : `${player.displayName} is currently carried by team strength and roster placement inside the ${getSportConfig(sport).label} board.`;

  return {
    sport,
    player,
    stats,
    analysis,
    lastUpdated: new Date().toISOString(),
  };
}

async function fetchTeamSchedule(sport, teamId) {
  const meta = sportMeta(sport);
  try {
    return await fetchJson(`${meta.site}/teams/${teamId}/schedule`, 60 * 60 * 1000);
  } catch (_error) {
    return { events: [] };
  }
}

async function getTeamDetail(sport, teamId) {
  const [rankings, playersCatalog, schedulePayload] = await Promise.all([
    computeRankings(sport),
    getPlayerCatalog(sport),
    fetchTeamSchedule(sport, teamId),
  ]);

  const team = rankings.find((entry) => entry.id === String(teamId));
  if (!team) {
    throw new Error('Team not found');
  }

  const roster = playersCatalog.players.filter((player) => player.team.id === String(teamId));
  const events = schedulePayload.events || schedulePayload.games || [];
  const recent = events
    .filter((event) => event.competitions?.[0]?.status?.type?.state === 'post')
    .slice(-5)
    .reverse()
    .map((event) => event.shortName || event.name);

  return {
    sport,
    team,
    roster,
    recent,
    lastUpdated: new Date().toISOString(),
  };
}

function buildPredictors(scoreboard, rankings, sport) {
  const rankingMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
  const average = sportMeta(sport).scoreboardAverage;
  return scoreboard
    .filter((game) => game.home.teamId && game.away.teamId)
    .slice(0, 12)
    .map((game) => {
      const home = rankingMap[game.home.teamId];
      const away = rankingMap[game.away.teamId];
      const homeStrength = (home?.ovrScore || 50) + 3;
      const awayStrength = away?.ovrScore || 50;
      const diff = homeStrength - awayStrength;
      const homeWinProbability = Math.max(5, Math.min(95, Math.round(50 + diff * 1.7)));
      const projectedHomeScore = Math.max(0, Math.round(average + (homeStrength - (away?.defScore || 50)) / 12));
      const projectedAwayScore = Math.max(0, Math.round(average + (awayStrength - (home?.defScore || 50)) / 12));

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
        projectedHomeScore,
        projectedAwayScore,
        confidence: Math.abs(diff) > 12 ? 'High' : Math.abs(diff) > 6 ? 'Medium' : 'Lean',
      };
    });
}

async function getSportBootstrap(sport) {
  const [scoreboard, rankings, teams, news, featuredPlayers] = await Promise.all([
    fetchScoreboard(sport),
    computeRankings(sport),
    getTeams(sport),
    fetchNews(sport),
    fetchLeaders(sport),
  ]);

  const featured = uniqBy(
    featuredPlayers.map((entry) => ({
      id: entry.athleteId,
      displayName: entry.athlete.displayName,
      shortName: entry.athlete.shortName,
      headshot: entry.athlete.headshot,
      position: getSportConfig(sport).label,
      team: rankings.find((team) => team.id === entry.teamId) || {
        abbreviation: entry.teamId || getSportConfig(sport).label,
      },
      rating: Math.max(66, Math.min(97, 96 - Number(entry.rank || 1) * 2)),
      leaderSummary: `${entry.label} #${entry.rank}`,
    })),
    (entry) => entry.id,
  )
    .slice(0, 12)
    .map((entry, index) => ({
      ...entry,
      tier: bucketTier(entry.rating),
      rank: index + 1,
    }));

  return {
    sport,
    headline: `${getSportConfig(sport).name} is tracking live boards, team composites, and roster-wide player movement.`,
    scoreboard,
    rankings,
    teams: rankings.length ? rankings : teams,
    news,
    featuredPlayers: featured,
    predictors: buildPredictors(scoreboard, rankings, sport),
    meta: {
      liveGames: scoreboard.filter((game) => game.state === 'in').length,
      teamCount: teams.length,
      playerCountLabel: sportMeta(sport).teamCountLabel,
    },
    lastUpdated: new Date().toISOString(),
  };
}

async function getGameDetail(sport, gameId) {
  const meta = sportMeta(sport);
  const scoreboard = await fetchScoreboard(sport);
  const game = scoreboard.find((entry) => entry.id === String(gameId));
  if (!game) {
    throw new Error('Game not found');
  }

  try {
    const summary = await fetchJson(`${meta.site}/summary?event=${gameId}`, 20 * 1000);
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
      sport,
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
      sport,
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

export function isGenericSport(sport) {
  return Boolean(GENERIC_SPORTS[sport]);
}

export { getSportBootstrap, getPlayerCatalog, getPlayerDetail, getTeamDetail, getGameDetail };
