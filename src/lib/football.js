import { normalizeEspnNewsArticle } from '@/src/lib/espn-news';

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
  const payload = await fetchJson(`${siteBase(leagueKey)}/standings`, 20 * 60 * 1000);
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
      const goalsFor = getStatValue(stats, ['goalsfor', 'goalsscored', 'pointsfor'], 0);
      const goalsAgainst = getStatValue(stats, ['goalsagainst', 'pointsagainst'], 0);
      const differential = getStatValue(stats, ['goaldifferential', 'differential'], goalsFor - goalsAgainst);
      const streak = stats.streakDisplay || stats.streak || 'Even';
      const standingPoints = getStatValue(stats, ['points', 'standingpoints'], wins * 3 + ties);
      const winPctRaw = getStatValue(stats, ['winpercent', 'winningpercentage']);
      const winPct =
        typeof winPctRaw === 'number' && winPctRaw > 0
          ? winPctRaw > 1
            ? winPctRaw / 100
            : winPctRaw
          : gamesPlayed
            ? (wins * 3 + ties) / Math.max(1, gamesPlayed * 3)
            : 0;

      return {
        teamId: String(entry.team.id),
        team: parseTeam(entry.team),
        wins,
        losses,
        ties,
        gamesPlayed,
        record: recordText,
        pointsFor: goalsFor,
        pointsAgainst: goalsAgainst,
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
      Object.assign(stats, flattenStats(node.stats));
    }
  });
  return stats;
}

async function getTeamStatistics(leagueKey, teamId) {
  const key = cacheKey('team-stats', leagueKey, teamId);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${siteBase(leagueKey)}/teams/${teamId}/statistics`, 6 * 60 * 60 * 1000);
  return writeCache(key, flattenStatisticsPayload(payload), 6 * 60 * 60 * 1000);
}

async function fetchTeamSchedule(leagueKey, teamId) {
  try {
    return await fetchJson(`${siteBase(leagueKey)}/teams/${teamId}/schedule`, 60 * 60 * 1000);
  } catch (_error) {
    return { events: [] };
  }
}

function summarizeRecentForm(payload, teamId) {
  const events = payload.events || payload.games || [];
  const completed = events
    .filter((event) => event.competitions?.[0]?.status?.type?.state === 'post')
    .slice(-5);

  let points = 0;
  const notes = completed
    .map((event) => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors || [];
      const team = competitors.find((item) => String(item.team?.id) === String(teamId));
      const opponent = competitors.find((item) => String(item.team?.id) !== String(teamId));
      if (!team || !opponent) return null;
      const teamScore = Number(team.score || 0);
      const opponentScore = Number(opponent.score || 0);
      if (teamScore > opponentScore) points += 3;
      else if (teamScore === opponentScore) points += 1;
      return `${team.team?.abbreviation || 'CLB'} ${teamScore}-${opponentScore} ${opponent.team?.abbreviation || 'OPP'}`;
    })
    .filter(Boolean);

  return {
    recentFormPoints: points,
    recentFormLabel: completed.length ? `${points} pts last ${completed.length}` : 'Form pending',
    recentResults: notes.reverse(),
  };
}

async function computeRankings(leagueKey) {
  const key = cacheKey('rankings', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;

  const [teams, standings] = await Promise.all([getTeams(leagueKey), getStandings(leagueKey)]);
  const standingsMap = Object.fromEntries(standings.map((entry) => [entry.teamId, entry]));

  const [teamStats, schedules] = await Promise.all([
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

  const statMap = Object.fromEntries(teamStats.filter(Boolean).map((entry) => [entry.teamId, entry.stats]));
  const formMap = Object.fromEntries(
    schedules.filter(Boolean).map((entry) => [entry.teamId, summarizeRecentForm(entry.schedule, entry.teamId)]),
  );

  const base = teams.map((team) => {
    const standing = standingsMap[team.id] || {};
    const stats = statMap[team.id] || {};
    const form = formMap[team.id] || { recentFormPoints: 0, recentFormLabel: 'Form pending', recentResults: [] };
    const gamesPlayed = standing.gamesPlayed || 1;
    const goalsForPerMatch = standing.pointsFor ? standing.pointsFor / gamesPlayed : 0;
    const goalsAgainstPerMatch = standing.pointsAgainst ? standing.pointsAgainst / gamesPlayed : 0;
    const shotsOnTarget = getStatValue(stats, ['shotsontargetpergame', 'shotsontarget', 'shots'], goalsForPerMatch * 2.4);
    const possession = getStatValue(stats, ['possessionpct', 'averagepossession'], 50);
    const cleanSheets = getStatValue(stats, ['cleansheets'], 0);
    const passes = getStatValue(stats, ['passescompleted', 'passes'], 0);
    const tacklesWon = getStatValue(stats, ['tackleswon', 'tackles'], 0);

    return {
      ...team,
      record: standing.record || '0-0-0',
      streak: standing.streak || form.recentFormLabel,
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
      shotsOnTarget,
      possession,
      cleanSheets,
      passes,
      tacklesWon,
      recentFormPoints: form.recentFormPoints,
      recentFormLabel: form.recentFormLabel,
      recentResults: form.recentResults,
    };
  });

  const resultsScale = scoreScale(
    base.map((team) => (team.standingPoints / Math.max(1, team.wins + team.losses + team.ties)) * 22 + team.differential * 3.5 + team.recentFormPoints),
  );
  const offenseScale = scoreScale(
    base.map((team) => team.goalsForPerMatch * 28 + team.shotsOnTarget * 5 + team.possession * 0.3 + team.passes * 0.004),
  );
  const defenseScale = scoreScale(
    base.map((team) => team.goalsAgainstPerMatch * 28 - team.cleanSheets * 3 - team.tacklesWon * 0.2 - team.differential),
    false,
  );

  const ranked = base.map((team) => {
    const resultsScore = resultsScale(
      (team.standingPoints / Math.max(1, team.wins + team.losses + team.ties)) * 22 + team.differential * 3.5 + team.recentFormPoints,
    );
    const offScore = offenseScale(team.goalsForPerMatch * 28 + team.shotsOnTarget * 5 + team.possession * 0.3 + team.passes * 0.004);
    const defScore = defenseScale(team.goalsAgainstPerMatch * 28 - team.cleanSheets * 3 - team.tacklesWon * 0.2 - team.differential);
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

function positionWeight(position) {
  const pos = String(position || '').toUpperCase();
  if (['ST', 'CF', 'RW', 'LW', 'FW', 'F'].includes(pos)) return 8;
  if (['AM', 'CAM', 'LM', 'RM', 'MF', 'M', 'CM'].includes(pos)) return 6.5;
  if (['CB', 'LB', 'RB', 'WB', 'DF', 'D'].includes(pos)) return 5.2;
  if (['GK'].includes(pos)) return 6.2;
  return 4.5;
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

async function getFeaturedPlayers(leagueKey, rankings = null) {
  const leagueRankings = rankings || (await computeRankings(leagueKey));
  const leaders = await fetchLeaders(leagueKey);
  const rankingMap = Object.fromEntries(leagueRankings.map((team) => [team.id, team]));

  return uniqBy(
    leaders.map((entry) => {
      const team = rankingMap[entry.teamId];
      const base = 84 - (entry.rank - 1) * 1.8 + positionWeight(entry.athlete.position) + ((team?.globalScore || 70) - 70) * 0.12;
      const rating = Math.max(60, Math.min(98, Math.round(base)));
      return {
        id: entry.athleteId,
        displayName: entry.athlete.displayName,
        shortName: entry.athlete.shortName,
        headshot: entry.athlete.headshot,
        position: entry.athlete.position || 'Player',
        team: team || { abbreviation: entry.teamId || leagueMeta(leagueKey).shortLabel },
        rating,
        leaderSummary: `${entry.label} #${entry.rank}`,
        tier: bucketTier(rating),
        competition: leagueMeta(leagueKey).label,
      };
    }),
    (entry) => entry.id,
  )
    .sort((left, right) => right.rating - left.rating)
    .slice(0, 12)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
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
      const leaderBoost = leaderEntries
        .slice(0, 4)
        .reduce((total, entry) => total + Math.max(0, 22 - Number(entry.rank || 22)) * 1.2, 0);
      const multiCategoryBonus = uniqBy(leaderEntries, (entry) => normalizeKey(entry.label)).length * 1.8;
      const teamBoost = Math.max(0, ((team.globalScore || team.ovrScore || 72) - 68) * 0.28);
      const formBoost = Math.max(0, (team.recentFormPoints || 0) * 0.22);
      const roleBoost = positionWeight(player.position);
      const reliabilityBoost = Math.min(8, leaderEntries.length * 2.1);
      const ageBoost = player.age ? Math.max(0, 3.5 - Math.abs(25 - player.age) * 0.22) : 1.5;
      const rating = Math.max(
        42,
        Math.min(99, Math.round(43 + leaderBoost + multiCategoryBonus + teamBoost + formBoost + roleBoost + reliabilityBoost + ageBoost)),
      );

      return {
        ...player,
        leaders: leaderEntries,
        leaderSummary:
          leaderEntries[0] ? `${leaderEntries[0].label} #${leaderEntries[0].rank}` : `${team.abbreviation} first team board`,
        rating,
        tier: bucketTier(rating),
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

function buildPredictors(scoreboard, rankings, leagueKey) {
  const rankingMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
  return scoreboard
    .filter((game) => game.home.teamId && game.away.teamId)
    .slice(0, 12)
    .map((game) => {
      const home = rankingMap[game.home.teamId];
      const away = rankingMap[game.away.teamId];
      const homeStrength = (home?.globalScore || home?.ovrScore || 70) + 2.8;
      const awayStrength = away?.globalScore || away?.ovrScore || 70;
      const diff = homeStrength - awayStrength;
      const homeWinProbability = Math.max(8, Math.min(92, Math.round(50 + diff * 1.45)));
      const projectedHomeScore = Math.max(0, Math.round((1.2 + (homeStrength - (away?.defScore || 50)) / 42) * 10) / 10);
      const projectedAwayScore = Math.max(0, Math.round((1.05 + (awayStrength - (home?.defScore || 50)) / 42) * 10) / 10);

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
        confidence: Math.abs(diff) > 12 ? 'High' : Math.abs(diff) > 7 ? 'Medium' : 'Lean',
      };
    });
}

async function getFootballBootstrap(leagueKey) {
  const [scoreboard, rankings, news, brand, featuredPlayers] = await Promise.all([
    fetchScoreboard(leagueKey),
    computeRankings(leagueKey),
    fetchNews(leagueKey),
    getLeagueBrand(leagueKey),
    getFeaturedPlayers(leagueKey),
  ]);

  return {
    league: brand,
    headline: `${brand.label} is tracking live fixtures, club power, player impact, and match edges inside Composite Football.`,
    scoreboard,
    rankings,
    teams: rankings,
    news,
    featuredPlayers,
    predictors: buildPredictors(scoreboard, rankings, leagueKey),
    meta: {
      liveGames: scoreboard.filter((game) => game.state === 'in').length,
      teamCount: rankings.length,
      playerCountLabel: `${rankings.length} clubs tracked`,
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
    : `${player.displayName} is currently carried by club strength, role projection, and roster placement inside the ${leagueMeta(leagueKey).label} board.`;

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
  const recent = summarizeRecentForm(schedulePayload, teamId);

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
      const [brand, rankings, scoreboard] = await Promise.all([
        getLeagueBrand(leagueKey),
        computeRankings(leagueKey),
        fetchScoreboard(leagueKey),
      ]);
      return { leagueKey, brand, rankings, scoreboard };
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

  const topMatches = leagueData
    .flatMap(({ leagueKey, brand, rankings, scoreboard }) => {
      const rankingMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
      return scoreboard.map((game) => {
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
      return right.matchScore - left.matchScore;
    })
    .slice(0, 3);

  return {
    title: 'Composite Football',
    subtitle: 'Step through the tunnel, scan the biggest matches of the day, and drop into any league board from one global football hub.',
    topMatches,
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
