import { normalizeEspnNewsArticle } from '@/src/lib/espn-news';
import { extractEspnOdds, moneylineToProbability } from '@/src/lib/odds';

const NFL_SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CACHE = new Map();

const FORMULA_COPY = {
  QB: {
    label: 'QB',
    summary:
      '0.26 Efficiency + 0.22 Production + 0.14 Explosiveness + 0.10 Rushing + 0.10 DecisionMaking + 0.10 SnapShare + 0.08 Consistency',
  },
  RB: {
    label: 'RB',
    summary:
      '0.24 Efficiency + 0.22 Production + 0.14 ExplosiveRuns + 0.14 Receiving + 0.10 RedZoneRole + 0.08 SnapShare + 0.08 Consistency',
  },
  WR: {
    label: 'WR',
    summary:
      '0.24 Efficiency + 0.22 Production + 0.16 TargetCommand + 0.14 ExplosivePlays + 0.10 TouchdownRate + 0.08 SnapShare + 0.06 Consistency',
  },
  TE: {
    label: 'TE',
    summary:
      '0.22 Efficiency + 0.20 Production + 0.18 TargetCommand + 0.12 RedZoneRole + 0.10 BlockingRole + 0.10 SnapShare + 0.08 Consistency',
  },
  OL: {
    label: 'OL',
    summary:
      '0.30 PassProtection + 0.26 RunBlocking + 0.12 Discipline + 0.12 Availability + 0.10 TeamRushSupport + 0.10 TeamPassSupport',
  },
  EDGE: {
    label: 'EDGE',
    summary:
      '0.28 Pressure + 0.18 SackProduction + 0.16 TFLDisruption + 0.12 RunDefense + 0.10 ForcedTurnovers + 0.08 SnapShare + 0.08 Consistency',
  },
  DL: {
    label: 'DL',
    summary:
      '0.26 Disruption + 0.18 RunDefense + 0.16 TFLRate + 0.14 Pressure + 0.10 SackProduction + 0.08 SnapShare + 0.08 Consistency',
  },
  LB: {
    label: 'LB',
    summary:
      '0.24 Tackling + 0.20 Coverage + 0.16 SplashPlays + 0.14 RunFits + 0.10 Pressure + 0.08 SnapShare + 0.08 Consistency',
  },
  CB: {
    label: 'CB',
    summary:
      '0.28 Coverage + 0.18 BallProduction + 0.16 PassBreakups + 0.12 Tackling + 0.10 SplashPlays + 0.08 SnapShare + 0.08 Consistency',
  },
  S: {
    label: 'S',
    summary:
      '0.22 Coverage + 0.18 Tackling + 0.16 BallProduction + 0.14 RunDefense + 0.10 Versatility + 0.10 SnapShare + 0.10 Consistency',
  },
  'K/P': {
    label: 'K/P',
    summary:
      '0.34 Accuracy + 0.18 VolumeDifficulty + 0.16 NetValue + 0.12 Consistency + 0.10 Clutch + 0.10 FieldPositionImpact',
  },
};

const POSITION_GROUPS = {
  QB: 'QB',
  RB: 'RB',
  HB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  LT: 'OL',
  LG: 'OL',
  C: 'OL',
  RG: 'OL',
  RT: 'OL',
  G: 'OL',
  T: 'OL',
  OL: 'OL',
  OT: 'OL',
  OG: 'OL',
  DE: 'EDGE',
  OLB: 'EDGE',
  EDGE: 'EDGE',
  DT: 'DL',
  NT: 'DL',
  DL: 'DL',
  ILB: 'LB',
  MLB: 'LB',
  LB: 'LB',
  CB: 'CB',
  S: 'S',
  SS: 'S',
  FS: 'S',
  DB: 'S',
  PK: 'K/P',
  K: 'K/P',
  P: 'K/P',
};

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const FANTASY_KEYWORDS = [
  'fantasy',
  'injury',
  'depth chart',
  'camp',
  'usage',
  'touch',
  'target',
  'starter',
  'role',
  'rookie',
  'draft',
];

function cacheKey(scope, extra = '') {
  return `nfl:${scope}:${extra}`;
}

function readCache(key) {
  const cached = CACHE.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expires) {
    CACHE.delete(key);
    return null;
  }
  return cached.value;
}

function writeCache(key, value, ttlMs) {
  CACHE.set(key, {
    value,
    expires: Date.now() + ttlMs,
  });
  return value;
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
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

function withQuery(url, params = {}) {
  const next = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      next.searchParams.set(key, String(value));
    }
  });
  return next.toString();
}

function easternDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return {
    year: values.year || date.getFullYear(),
    month: values.month || date.getMonth() + 1,
    day: values.day || date.getDate(),
  };
}

export function getNFLSeasonYear(date = new Date()) {
  const { year, month, day } = easternDateParts(date);
  return month > 7 || (month === 7 && day >= 31) ? year : year - 1;
}

function shouldUsePreviousSeasonBoard(date = new Date()) {
  const { month, day } = easternDateParts(date);
  return month < 7 || (month === 7 && day < 31);
}

async function fetchJson(url, ttlMs = 60_000) {
  const key = cacheKey('json', url);
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

async function fetchText(url, ttlMs = 60_000) {
  const key = cacheKey('text', url);
  const cached = readCache(key);
  if (cached) return cached;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'text/html,text/plain,*/*' },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return writeCache(key, await response.text(), ttlMs);
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

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const normalized = String(value).replace(/,/g, '').replace(/%/g, '');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;|&apos;/gi, '\'')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeFantasyLookupName(value = '') {
  return normalizeKey(
    String(value || '')
      .replace(/\b(Jr\.?|Sr\.?|II|III|IV|V)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function buildFantasyLookupKeys(name = '', teamAbbr = '') {
  const keys = new Set();
  const normalizedName = normalizeFantasyLookupName(name);
  const team = normalizeKey(teamAbbr);
  if (normalizedName) keys.add(normalizedName);
  if (normalizedName && team) keys.add(`${normalizedName}:${team}`);
  return Array.from(keys);
}

function fantasyRankToPercentile(rank, total = 200) {
  if (!Number.isFinite(rank) || rank <= 0 || total <= 1) return 50;
  return Math.max(1, Math.min(99, ((total - rank) / (total - 1)) * 100));
}

async function fetchOfficialFantasyRankings() {
  const seasonYear = getNFLSeasonYear();
  const key = cacheKey('fantasy-source', seasonYear);
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const html = await fetchText(
      `https://fantasy.nfl.com/research/players?leagueId=0&position=O&statCategory=stats&statSeason=${seasonYear}&statType=seasonStats`,
      6 * 60 * 60 * 1000,
    );
    const text = decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );

    const players = [];
    const pattern = /([A-Z0-9][A-Za-z0-9.'\-]+(?:\s+[A-Z0-9][A-Za-z0-9.'\-]+){0,4})\s+(QB|RB|WR|TE)\s*-\s*([A-Z]{2,3})(?:\s+(?:IR|IA|SUS|O|Q|PUP|NFI-R))*\b/g;
    let match;
    let inferredRank = 1;
    while ((match = pattern.exec(text)) !== null) {
      const displayName = String(match[1] || '').trim();
      const position = String(match[2] || '').trim();
      const teamAbbr = String(match[3] || '').trim();
      if (!displayName || !position || !teamAbbr) continue;
      players.push({
        rank: inferredRank,
        displayName,
        teamAbbr,
        positionGroup: position,
        source: 'NFL Fantasy',
      });
      inferredRank += 1;
    }

    const uniquePlayers = uniqBy(players, (player) => `${normalizeFantasyLookupName(player.displayName)}:${player.teamAbbr}`);
    return writeCache(
      key,
      {
        source: `NFL Fantasy ${seasonYear} Season`,
        players: uniquePlayers.slice(0, 200),
        totalPlayers: uniquePlayers.length,
        lastUpdated: new Date().toISOString(),
      },
      6 * 60 * 60 * 1000,
    );
  } catch (_error) {
    return writeCache(
      key,
      {
        source: 'NFL Fantasy',
        players: [],
        totalPlayers: 0,
        lastUpdated: null,
      },
      30 * 60 * 1000,
    );
  }
}

function normalizeCompetitorScore(score) {
  if (score && typeof score === 'object') {
    if (score.displayValue !== undefined && score.displayValue !== null && score.displayValue !== '') {
      return String(score.displayValue);
    }
    if (score.value !== undefined && score.value !== null && score.value !== '') {
      return String(score.value);
    }
  }
  if (score === null || score === undefined || score === '') return '0';
  return String(score);
}

function numericCompetitorScore(score) {
  return parseNumeric(normalizeCompetitorScore(score)) || 0;
}

function scoreScale(values, higherIsBetter = true) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return () => 50;
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  if (min === max) return () => 50;
  return (value) => {
    if (!Number.isFinite(value)) return 50;
    const normalized = ((value - min) / (max - min)) * 100;
    const scaled = higherIsBetter ? normalized : 100 - normalized;
    return Math.round(scaled * 10) / 10;
  };
}

function parseTeam(rawTeam) {
  return {
    id: String(rawTeam.id),
    espnId: String(rawTeam.id),
    abbreviation: rawTeam.abbreviation || rawTeam.shortDisplayName || rawTeam.displayName,
    displayName: rawTeam.displayName || rawTeam.name,
    shortDisplayName: rawTeam.shortDisplayName || rawTeam.abbreviation || rawTeam.displayName,
    logo: rawTeam.logo || rawTeam.logos?.[0]?.href || '',
    color: rawTeam.color || '#7dd45f',
    alternateColor: rawTeam.alternateColor || '#ffffff',
    location: rawTeam.location || '',
    nickname: rawTeam.name || rawTeam.displayName || '',
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

async function getTeams() {
  const key = cacheKey('teams');
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${NFL_SITE}/teams`, 12 * 60 * 60 * 1000);
  return writeCache(key, parseTeamsFromPayload(payload), 12 * 60 * 60 * 1000);
}

function buildFallbackRankings(teams = []) {
  return teams.map((team, index) => ({
    ...team,
    record: '0-0',
    streak: 'Even',
    wins: 0,
    losses: 0,
    ties: 0,
    gamesPlayed: 0,
    winPct: 0,
    differential: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    standingPoints: 0,
    clubPoints: 0,
    recentFormPoints: 0,
    recentFormLabel: 'Last 5 pending',
    recentRecord: '0-0',
    recentResults: [],
    pointsPerGame: 0,
    pointsAllowedPerGame: 0,
    yardsPerGame: 0,
    yardsAllowedPerGame: 0,
    turnovers: 0,
    giveaways: 0,
    sackRate: 0,
    successScore: 75,
    offScore: 75,
    defScore: 75,
    recentScore: 75,
    groupLabel: team.nickname || team.abbreviation,
    ovrScore: 75,
    ovrRank: index + 1,
  }));
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

function parseNflRecordSummary(summary = '') {
  const parts = String(summary || '')
    .split('-')
    .map((part) => Number(String(part).trim()))
    .filter((part) => Number.isFinite(part));

  if (parts.length >= 3) {
    const [wins, losses, ties] = parts;
    return {
      wins,
      losses,
      ties,
      gamesPlayed: wins + losses + ties,
      display: `${wins}-${losses}-${ties}`,
    };
  }

  if (parts.length === 2) {
    const [wins, losses] = parts;
    return {
      wins,
      losses,
      ties: 0,
      gamesPlayed: wins + losses,
      display: `${wins}-${losses}`,
    };
  }

  return {
    wins: 0,
    losses: 0,
    ties: 0,
    gamesPlayed: 0,
    display: '0-0',
  };
}

async function getStandings() {
  const seasonYear = getNFLSeasonYear();
  const offseasonLock = shouldUsePreviousSeasonBoard();
  const key = cacheKey('standings', seasonYear);
  const cached = readCache(key);
  if (cached) return cached;

  let payload = await fetchJson(withQuery(`${NFL_SITE}/standings`, { season: seasonYear, seasontype: 2 }), 30 * 60 * 1000);
  const entries = [];
  walk(payload, (node) => {
    if (node?.team?.id && Array.isArray(node?.stats)) {
      entries.push(node);
    }
  });

  if (!entries.length) {
    if (!offseasonLock) {
      payload = await fetchJson(`${NFL_SITE}/standings`, 30 * 60 * 1000);
      walk(payload, (node) => {
        if (node?.team?.id && Array.isArray(node?.stats)) {
          entries.push(node);
        }
      });
    }
  }

  const standings = uniqBy(
    entries.map((entry) => {
      const stats = flattenStats(entry.stats);
      const wins = getStatValue(stats, ['wins']);
      const losses = getStatValue(stats, ['losses']);
      const ties = getStatValue(stats, ['ties'], 0);
      const gamesPlayed = getStatValue(stats, ['gamesplayed', 'games'], wins + losses + ties);
      const pointsFor = getStatValue(stats, ['pointsfor', 'pointsscored']);
      const pointsAgainst = getStatValue(stats, ['pointsagainst', 'pointsallowed']);
      const differential = getStatValue(stats, ['pointdifferential', 'differential'], pointsFor - pointsAgainst);
      const winPctRaw = getStatValue(stats, ['winpercent', 'winningpercentage'], 0);
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
        record: stats.recordDisplay || [wins, losses, ties].filter((value, index) => value || index < 2).join('-'),
        pointsFor,
        pointsAgainst,
        differential,
        streak: stats.streakDisplay || stats.streak || 'Even',
        standingPoints: wins * 2 + ties,
        winPct,
      };
    }),
    (entry) => entry.teamId,
  );
  if (standings.some((entry) => Number(entry.gamesPlayed || 0) > 0)) {
    return writeCache(key, standings, 30 * 60 * 1000);
  }

  const teams = await getTeams();
  const derivedStandings = uniqBy(
    (await mapLimit(
      teams,
      async (team) => summarizeSeasonSchedule(await fetchTeamSchedule(team.espnId), team.id),
      8,
    ))
      .filter((entry) => entry?.teamId)
      .map((entry) => ({
        ...entry,
        team: entry.team || teams.find((team) => team.id === entry.teamId) || null,
      })),
    (entry) => entry.teamId,
  );

  derivedStandings.sort((left, right) =>
    right.winPct - left.winPct ||
    right.wins - left.wins ||
    right.differential - left.differential ||
    right.pointsFor - left.pointsFor,
  );

  return writeCache(key, derivedStandings, 30 * 60 * 1000);
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

async function getTeamStatistics(teamId) {
  const seasonYear = getNFLSeasonYear();
  const offseasonLock = shouldUsePreviousSeasonBoard();
  const key = cacheKey('team-stats', `${teamId}:${seasonYear}`);
  const cached = readCache(key);
  if (cached) return cached;

  let payload = await fetchJson(withQuery(`${NFL_SITE}/teams/${teamId}/statistics`, { season: seasonYear, seasontype: 2 }), 6 * 60 * 60 * 1000);
  let stats = flattenStatisticsPayload(payload);
  if (!Object.keys(stats).length && !offseasonLock) {
    payload = await fetchJson(`${NFL_SITE}/teams/${teamId}/statistics`, 6 * 60 * 60 * 1000);
    stats = flattenStatisticsPayload(payload);
  }
  return writeCache(key, stats, 6 * 60 * 60 * 1000);
}

async function fetchTeamSchedule(teamId) {
  const seasonYear = getNFLSeasonYear();
  const offseasonLock = shouldUsePreviousSeasonBoard();
  const key = cacheKey('team-schedule', `${teamId}:${seasonYear}`);
  const cached = readCache(key);
  if (cached) return cached;
  try {
    const schedule = await fetchJson(withQuery(`${NFL_SITE}/teams/${teamId}/schedule`, { season: seasonYear, seasontype: 2 }), 60 * 60 * 1000);
    return writeCache(key, schedule, 60 * 60 * 1000);
  } catch (_error) {
    if (!offseasonLock) {
      try {
        const schedule = await fetchJson(`${NFL_SITE}/teams/${teamId}/schedule`, 60 * 60 * 1000);
        return writeCache(key, schedule, 60 * 60 * 1000);
      } catch (_fallbackError) {
        // fall through
      }
    }
    return writeCache(key, { events: [] }, 15 * 60 * 1000);
  }
}

function summarizeSeasonSchedule(schedulePayload, teamId) {
  const events = schedulePayload?.events || schedulePayload?.games || [];
  const completed = events
    .filter((event) => event?.competitions?.[0]?.status?.type?.state === 'post')
    .sort((left, right) => new Date(left?.date || 0) - new Date(right?.date || 0));

  let wins = 0;
  let losses = 0;
  let ties = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  const outcomes = [];

  completed.forEach((event) => {
    const competitors = event.competitions?.[0]?.competitors || [];
    const team = competitors.find((item) => String(item.team?.id) === String(teamId));
    const opponent = competitors.find((item) => String(item.team?.id) !== String(teamId));
    if (!team || !opponent) return;

    const teamScore = numericCompetitorScore(team.score);
    const opponentScore = numericCompetitorScore(opponent.score);
    pointsFor += teamScore;
    pointsAgainst += opponentScore;

    if (teamScore > opponentScore) {
      wins += 1;
      outcomes.push('W');
    } else if (teamScore < opponentScore) {
      losses += 1;
      outcomes.push('L');
    } else {
      ties += 1;
      outcomes.push('T');
    }
  });

  const rootRecord = parseNflRecordSummary(schedulePayload?.team?.recordSummary || '');
  const summary = rootRecord.gamesPlayed
    ? rootRecord
    : {
        wins,
        losses,
        ties,
        gamesPlayed: wins + losses + ties,
        display: ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
      };

  let streak = 'Even';
  if (outcomes.length) {
    const lastResult = outcomes[outcomes.length - 1];
    let count = 0;
    for (let index = outcomes.length - 1; index >= 0; index -= 1) {
      if (outcomes[index] !== lastResult) break;
      count += 1;
    }
    streak = `${lastResult}${count}`;
  }

  return {
    teamId: String(teamId),
    team: schedulePayload?.team ? parseTeam(schedulePayload.team) : null,
    wins: summary.wins,
    losses: summary.losses,
    ties: summary.ties,
    gamesPlayed: summary.gamesPlayed,
    record: summary.display,
    pointsFor,
    pointsAgainst,
    differential: pointsFor - pointsAgainst,
    streak,
    standingPoints: summary.wins * 2 + summary.ties,
    winPct: summary.gamesPlayed ? (summary.wins + summary.ties * 0.5) / summary.gamesPlayed : 0,
  };
}

function parseScoreboardGames(payload = {}) {
  return (payload.events || [])
    .map((event) => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors || [];
      const away = competitors.find((item) => item.homeAway === 'away');
      const home = competitors.find((item) => item.homeAway === 'home');
      const status = competition?.status?.type || event.status?.type || {};
      if (!home || !away) return null;
      return {
        id: String(event.id),
        name: event.name || event.shortName,
        state: status.state || 'pre',
        statusLabel: status.detail || status.shortDetail || status.description || 'Scheduled',
        startTime: event.date,
        startLabel: event.date
          ? new Date(event.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : 'TBD',
        broadcast: competition?.broadcasts?.[0]?.names?.[0] || '',
        odds: extractEspnOdds(competition, event?.pickcenter?.[0] || null),
        situation: competition?.situation || null,
        home: {
          teamId: home?.team?.id ? String(home.team.id) : '',
          abbreviation: home?.team?.abbreviation || 'HOME',
          displayName: home?.team?.displayName || 'Home',
          logo: home?.team?.logo || home?.team?.logos?.[0]?.href || '',
          score: normalizeCompetitorScore(home?.score),
          record: home?.records?.[0]?.summary || '',
          winner: Boolean(home?.winner),
        },
        away: {
          teamId: away?.team?.id ? String(away.team.id) : '',
          abbreviation: away?.team?.abbreviation || 'AWAY',
          displayName: away?.team?.displayName || 'Away',
          logo: away?.team?.logo || away?.team?.logos?.[0]?.href || '',
          score: normalizeCompetitorScore(away?.score),
          record: away?.records?.[0]?.summary || '',
          winner: Boolean(away?.winner),
        },
      };
    })
    .filter(Boolean);
}

async function buildPreviousSeasonScoreboard(seasonYear) {
  const teams = await getTeams();
  const schedules = await mapLimit(
    teams,
    async (team) => fetchTeamSchedule(team.espnId),
    8,
  );

  const eventMap = new Map();
  schedules.forEach((schedule) => {
    (schedule?.events || []).forEach((event) => {
      const competition = event?.competitions?.[0];
      const status = competition?.status?.type || event?.status?.type || {};
      if (!competition || status.state !== 'post' || !event?.id || eventMap.has(String(event.id))) return;
      eventMap.set(String(event.id), event);
    });
  });

  const payload = {
    events: Array.from(eventMap.values()).sort((left, right) => new Date(right?.date || 0) - new Date(left?.date || 0)),
  };
  const games = parseScoreboardGames(payload);
  return games.slice(0, 12).map((game, index) => ({
    ...game,
    statusLabel: index === 0 ? `${game.statusLabel} • Latest final from ${seasonYear}` : game.statusLabel,
  }));
}

function summarizeRecentForm(schedulePayload, teamId) {
  const events = schedulePayload?.events || schedulePayload?.games || [];
  const completed = events
    .filter((event) => event?.competitions?.[0]?.status?.type?.state === 'post')
    .slice(-5);

  let wins = 0;
  let losses = 0;
  let points = 0;
  const notes = completed
    .map((event) => {
      const competitors = event.competitions?.[0]?.competitors || [];
      const team = competitors.find((item) => String(item.team?.id) === String(teamId));
      const opponent = competitors.find((item) => String(item.team?.id) !== String(teamId));
      if (!team || !opponent) return null;
      const teamScore = numericCompetitorScore(team.score);
      const opponentScore = numericCompetitorScore(opponent.score);
      if (teamScore > opponentScore) {
        wins += 1;
        points += 2;
      } else {
        losses += 1;
      }
      return `${team.team?.abbreviation || 'TM'} ${teamScore}-${opponentScore} ${opponent.team?.abbreviation || 'OPP'}`;
    })
    .filter(Boolean)
    .reverse();

  return {
    recentFormPoints: points,
    recentRecord: `${wins}-${losses}`,
    recentFormLabel: completed.length ? `${wins}-${losses} last ${completed.length}` : 'Last 5 pending',
    recentResults: notes,
  };
}

async function fetchScoreboard() {
  const seasonYear = getNFLSeasonYear();
  const usePreviousSeasonBoard = shouldUsePreviousSeasonBoard();
  const key = cacheKey('scoreboard', `${seasonYear}:${usePreviousSeasonBoard ? 'archive' : 'live'}`);
  const cached = readCache(key);
  if (cached) return cached;
  if (usePreviousSeasonBoard) {
    try {
      const archivedGames = await buildPreviousSeasonScoreboard(seasonYear);
      if (archivedGames.length) {
        return writeCache(key, archivedGames, 10 * 60 * 1000);
      }
    } catch (_error) {
      // Fall through to the live scoreboard endpoint if the archived build path fails.
    }
  }
  try {
    const payload = await fetchJson(`${NFL_SITE}/scoreboard`, 45 * 1000);
    const games = parseScoreboardGames(payload);
    return writeCache(key, games, 45 * 1000);
  } catch (_error) {
    return writeCache(key, [], 2 * 60 * 1000);
  }
}

async function fetchNews() {
  const key = cacheKey('news');
  const cached = readCache(key);
  if (cached) return cached;
  try {
    const payload = await fetchJson(`${NFL_SITE}/news`, 30 * 60 * 1000);
    const articles = (payload.articles || [])
      .slice(0, 12)
      .map((article, index) => normalizeEspnNewsArticle(article, { fallbackSource: 'NFL', fallbackId: `nfl-news-${index}` }))
      .filter((article) => article.storyId);
    return writeCache(key, articles, 30 * 60 * 1000);
  } catch (_error) {
    return writeCache(key, [], 5 * 60 * 1000);
  }
}

function extractEspnFittPayload(html = '') {
  const token = "window['__espnfitt__']=";
  const start = String(html || '').indexOf(token);
  if (start === -1) return null;
  const jsonStart = start + token.length;
  const jsonEnd = String(html || '').indexOf(';</script>', jsonStart);
  if (jsonEnd === -1) return null;
  try {
    return JSON.parse(String(html || '').slice(jsonStart, jsonEnd));
  } catch (_error) {
    return null;
  }
}

function parseEspnStatPageLeaders(payload = {}) {
  const rows = payload?.page?.content?.stats?.leaders || [];
  return rows.flatMap((row) => {
    const athleteId = String(row?.athlete?.uid || row?.athlete?.href || '').match(/a:(\d+)|\/id\/(\d+)\//)?.slice(1).find(Boolean) || '';
    if (!athleteId) return [];
    return (row?.stats || [])
      .filter((stat) => stat?.name)
      .map((stat) => {
        const parsedRank = parseNumeric(stat.rank);
        return {
          athleteId,
          label: stat.name || 'Leader',
          metricKey: normalizeKey(stat.name || ''),
          rank: Number.isFinite(parsedRank) ? parsedRank : Number(row?.athlete?.rank || 999),
          value: parseNumeric(stat.value),
          displayValue: String(stat.value ?? ''),
          athlete: {
            id: athleteId,
            displayName: row?.athlete?.name || row?.athlete?.shortName || 'Player',
            shortName: row?.athlete?.shortName || row?.athlete?.name || 'Player',
            headshot: buildNflHeadshot(athleteId, ''),
            position: row?.athlete?.position || '',
          },
          teamId: '',
        };
      });
  });
}

async function fetchHtmlLeaders(seasonYear) {
  const pages = [
    `https://www.espn.com/nfl/stats/player/_/season/${seasonYear}/seasontype/2/table/passing/sort/passingYards/dir/desc`,
    `https://www.espn.com/nfl/stats/player/_/season/${seasonYear}/seasontype/2/table/rushing/sort/rushingYards/dir/desc`,
    `https://www.espn.com/nfl/stats/player/_/season/${seasonYear}/seasontype/2/table/receiving/sort/receivingYards/dir/desc`,
    `https://www.espn.com/nfl/stats/player/_/view/defense/season/${seasonYear}/seasontype/2/table/defensive/sort/sacks/dir/desc`,
    `https://www.espn.com/nfl/stats/player/_/view/scoring/season/${seasonYear}/seasontype/2/table/scoring/sort/totalTouchdowns/dir/desc`,
    `https://www.espn.com/nfl/stats/player/_/view/special/season/${seasonYear}/seasontype/2/table/kicking/sort/fieldGoalsMade/dir/desc`,
    `https://www.espn.com/nfl/stats/player/_/view/special/season/${seasonYear}/seasontype/2/table/punting/sort/netPuntingYards/dir/desc`,
  ];

  const payloads = await mapLimit(
    pages,
    async (url) => {
      const html = await fetchText(url, 6 * 60 * 60 * 1000);
      return parseEspnStatPageLeaders(extractEspnFittPayload(html) || {});
    },
    3,
  );

  return uniqBy(payloads.flat().filter((entry) => entry?.athleteId && entry?.metricKey), (leader) => `${leader.athleteId}:${leader.metricKey}`);
}

async function fetchLeaders() {
  const seasonYear = getNFLSeasonYear();
  const offseasonLock = shouldUsePreviousSeasonBoard();
  const key = cacheKey('leaders', seasonYear);
  const cached = readCache(key);
  if (cached) return cached;

  let leaders = [];
  try {
    let payload = await fetchJson(withQuery(`${NFL_SITE}/leaders`, { season: seasonYear, seasontype: 2 }), 60 * 60 * 1000);
    if (!(payload?.leaders || payload?.categories || payload?.items) && !offseasonLock) {
      payload = await fetchJson(`${NFL_SITE}/leaders`, 60 * 60 * 1000);
    }

    walk(payload, (node) => {
      if (node?.athlete?.id && (node.rank || node.displayValue || node.value)) {
        leaders.push({
          athleteId: String(node.athlete.id),
          label: node.name || node.displayName || node.shortDisplayName || 'Leader',
          metricKey: normalizeKey(node.name || node.displayName || node.shortDisplayName || ''),
          rank: Number(node.rank || 999),
          value: parseNumeric(node.value ?? node.displayValue),
          displayValue: node.displayValue || String(node.value || ''),
          athlete: {
            id: String(node.athlete.id),
            displayName: node.athlete.displayName || node.athlete.shortName || 'Player',
            shortName: node.athlete.shortName || node.athlete.displayName || 'Player',
            headshot: node.athlete.headshot?.href || '',
            position: node.athlete.position?.abbreviation || '',
          },
          teamId: node.team?.id ? String(node.team.id) : '',
        });
      }
    });
  } catch (_error) {
    leaders = [];
  }

  if (!leaders.length) {
    leaders = await fetchHtmlLeaders(seasonYear);
  }

  return writeCache(key, uniqBy(leaders, (leader) => `${leader.athleteId}:${leader.metricKey}`), 60 * 60 * 1000);
}

async function fetchRoster(teamId) {
  const key = cacheKey('roster', teamId);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${NFL_SITE}/teams/${teamId}/roster`, 4 * 60 * 60 * 1000);
  return writeCache(key, payload, 4 * 60 * 60 * 1000);
}

function resolvePositionGroup(position) {
  const normalized = String(position || '').toUpperCase();
  return POSITION_GROUPS[normalized] || 'WR';
}

function buildNflHeadshot(playerId, fallback = '') {
  if (!playerId) return fallback || '';
  return `https://a.espncdn.com/i/headshots/nfl/players/full/${playerId}.png`;
}

function parseRosterPlayers(payload, team) {
  const players = [];
  walk(payload, (node) => {
    if (node?.id && (node.displayName || node.fullName || node.shortName) && node.position) {
      const position = node.position?.abbreviation || node.position?.displayName || '';
      players.push({
        id: String(node.id),
        displayName: node.displayName || node.fullName || node.shortName,
        shortName: node.shortName || node.displayName || node.fullName,
        position,
        positionGroup: resolvePositionGroup(position),
        jersey: node.jersey || '',
        age: node.age || null,
        experience: parseNumeric(node.experience?.years ?? node.experience?.value),
        headshot: buildNflHeadshot(node.id, node.headshot?.href || node.headshot || ''),
        team,
      });
    }
  });
  return uniqBy(players, (player) => player.id);
}

function metricValue(leaderMap, athleteId, keys, fallback = NaN) {
  const metrics = leaderMap[athleteId] || {};
  for (const key of keys) {
    const metric = metrics[normalizeKey(key)];
    if (metric && Number.isFinite(metric.value)) {
      return metric.value;
    }
  }
  return fallback;
}

function leaderSummary(leaderMap, athleteId) {
  const metrics = Object.values(leaderMap[athleteId] || {}).sort((a, b) => a.rank - b.rank);
  if (!metrics.length) return 'Roster board';
  const top = metrics[0];
  return `${top.label} #${top.rank}`;
}

function buildLeaderMetricMap(leaders) {
  const byAthlete = {};
  leaders.forEach((leader) => {
    if (!byAthlete[leader.athleteId]) byAthlete[leader.athleteId] = {};
    byAthlete[leader.athleteId][leader.metricKey] = leader;
  });
  return byAthlete;
}

function positionComponentNames(group) {
  return {
    QB: ['efficiency', 'production', 'explosivePassing', 'rushingValue', 'decisionMaking', 'snapShare', 'consistency'],
    RB: ['efficiency', 'production', 'explosiveRuns', 'receiving', 'redZoneRole', 'snapShare', 'consistency'],
    WR: ['efficiency', 'production', 'targetCommand', 'explosivePlays', 'touchdownRate', 'snapShare', 'consistency'],
    TE: ['efficiency', 'production', 'targetCommand', 'redZoneRole', 'blockingRole', 'snapShare', 'consistency'],
    OL: ['passProtection', 'runBlocking', 'discipline', 'availability', 'teamRushSupport', 'teamPassSupport'],
    EDGE: ['pressure', 'sackProduction', 'tflDisruption', 'runDefense', 'forcedTurnovers', 'snapShare', 'consistency'],
    DL: ['disruption', 'runDefense', 'tflRate', 'pressure', 'sackProduction', 'snapShare', 'consistency'],
    LB: ['tackling', 'coverage', 'splashPlays', 'runFits', 'pressure', 'snapShare', 'consistency'],
    CB: ['coverage', 'ballProduction', 'passBreakups', 'tackling', 'splashPlays', 'snapShare', 'consistency'],
    S: ['coverage', 'tackling', 'ballProduction', 'runDefense', 'versatility', 'snapShare', 'consistency'],
    'K/P': ['accuracy', 'volumeDifficulty', 'netValue', 'consistency', 'clutch', 'fieldPositionImpact'],
  }[group] || ['production', 'consistency'];
}

function computePositionComponents(player, leaderMap, teamMap) {
  const athleteId = player.id;
  const metrics = leaderMap[athleteId] || {};
  const team = teamMap[player.team.id] || player.team;

  const base = {
    efficiency: metricValue(leaderMap, athleteId, ['passerrating', 'quarterbackrating', 'yardsperattempt', 'yardspercatch', 'yardsperreception', 'yardsperrush'], 0),
    production: metricValue(leaderMap, athleteId, ['passingyards', 'rushingyards', 'receivingyards', 'totaltouchdowns', 'passingtouchdowns', 'sacks', 'totaltackles'], 0),
    explosivePassing: metricValue(leaderMap, athleteId, ['yardsperattempt', 'yardspercompletion', 'completionpct', 'qbr'], 0),
    rushingValue: metricValue(leaderMap, athleteId, ['rushingyards', 'rushingtouchdowns'], 0),
    decisionMaking: metricValue(leaderMap, athleteId, ['interceptions'], NaN),
    snapShare: metricValue(leaderMap, athleteId, ['gamesplayed', 'gamesstarted'], player.team?.winPct ? player.team.winPct * 17 : 0),
    consistency: metricValue(leaderMap, athleteId, ['completionpct', 'catchpct', 'fieldgoalpct', 'saves'], player.age ? Math.max(0, 70 - Math.abs(27 - player.age) * 3) : 55),
    explosiveRuns: metricValue(leaderMap, athleteId, ['yardsperrush', 'rushingyards'], 0),
    receiving: metricValue(leaderMap, athleteId, ['receptions', 'receivingyards', 'receivingtouchdowns'], 0),
    redZoneRole: metricValue(leaderMap, athleteId, ['totaltouchdowns', 'rushingtouchdowns', 'receivingtouchdowns'], 0),
    targetCommand: metricValue(leaderMap, athleteId, ['receptions', 'receivingyards'], 0),
    explosivePlays: metricValue(leaderMap, athleteId, ['yardsperreception', 'yardspercatch', 'receivingyards'], 0),
    touchdownRate: metricValue(leaderMap, athleteId, ['receivingtouchdowns', 'totaltouchdowns', 'rushingtouchdowns'], 0),
    blockingRole: (team.offScore || 50) + (team.successScore || 50) * 0.25,
    passProtection: (team.offScore || 50) + metricValue(leaderMap, athleteId, ['gamesstarted'], 0) * 0.12,
    runBlocking: (team.offScore || 50) + metricValue(leaderMap, athleteId, ['gamesstarted'], 0) * 0.1,
    discipline: 100 - (metricValue(leaderMap, athleteId, ['penalties'], 0) * 4),
    availability: metricValue(leaderMap, athleteId, ['gamesplayed', 'gamesstarted'], player.experience ? 12 : 8),
    teamRushSupport: team.offScore || 50,
    teamPassSupport: team.successScore || 50,
    pressure: metricValue(leaderMap, athleteId, ['sacks', 'quarterbackhits'], 0),
    sackProduction: metricValue(leaderMap, athleteId, ['sacks'], 0),
    tflDisruption: metricValue(leaderMap, athleteId, ['tacklesforloss', 'sacks'], 0),
    runDefense: metricValue(leaderMap, athleteId, ['totaltackles', 'solotackles', 'stuffs'], team.defScore || 50),
    forcedTurnovers: metricValue(leaderMap, athleteId, ['forcedfumbles', 'fumbleRecoveries', 'interceptions'], 0),
    disruption: metricValue(leaderMap, athleteId, ['tacklesforloss', 'sacks', 'quarterbackhits'], 0),
    tflRate: metricValue(leaderMap, athleteId, ['tacklesforloss'], 0),
    tackling: metricValue(leaderMap, athleteId, ['totaltackles', 'solotackles'], 0),
    coverage: metricValue(leaderMap, athleteId, ['interceptions', 'passesdefended'], 0),
    splashPlays: metricValue(leaderMap, athleteId, ['interceptions', 'forcedfumbles', 'sacks'], 0),
    runFits: metricValue(leaderMap, athleteId, ['totaltackles', 'tacklesforloss'], 0),
    ballProduction: metricValue(leaderMap, athleteId, ['interceptions', 'passesdefended'], 0),
    passBreakups: metricValue(leaderMap, athleteId, ['passesdefended'], 0),
    versatility: metricValue(leaderMap, athleteId, ['totaltackles', 'interceptions'], 0),
    accuracy: metricValue(leaderMap, athleteId, ['fieldgoalpct', 'fgpercentage', 'netpuntingaverage'], 0),
    volumeDifficulty: metricValue(leaderMap, athleteId, ['fieldgoalsmade', 'punts'], 0),
    netValue: metricValue(leaderMap, athleteId, ['netpuntingaverage', 'fieldgoalsmade'], 0),
    clutch: metricValue(leaderMap, athleteId, ['fieldgoalsmade'], 0),
    fieldPositionImpact: metricValue(leaderMap, athleteId, ['netpuntingaverage'], team.defScore || 50),
  };

  if (Number.isFinite(base.decisionMaking)) {
    base.decisionMaking = 100 - base.decisionMaking * 6;
  } else {
    base.decisionMaking = 58;
  }

  return base;
}

const POSITION_WEIGHTS = {
  QB: { efficiency: 0.26, production: 0.22, explosivePassing: 0.14, rushingValue: 0.10, decisionMaking: 0.10, snapShare: 0.10, consistency: 0.08 },
  RB: { efficiency: 0.24, production: 0.22, explosiveRuns: 0.14, receiving: 0.14, redZoneRole: 0.10, snapShare: 0.08, consistency: 0.08 },
  WR: { efficiency: 0.24, production: 0.22, targetCommand: 0.16, explosivePlays: 0.14, touchdownRate: 0.10, snapShare: 0.08, consistency: 0.06 },
  TE: { efficiency: 0.22, production: 0.20, targetCommand: 0.18, redZoneRole: 0.12, blockingRole: 0.10, snapShare: 0.10, consistency: 0.08 },
  OL: { passProtection: 0.30, runBlocking: 0.26, discipline: 0.12, availability: 0.12, teamRushSupport: 0.10, teamPassSupport: 0.10 },
  EDGE: { pressure: 0.28, sackProduction: 0.18, tflDisruption: 0.16, runDefense: 0.12, forcedTurnovers: 0.10, snapShare: 0.08, consistency: 0.08 },
  DL: { disruption: 0.26, runDefense: 0.18, tflRate: 0.16, pressure: 0.14, sackProduction: 0.10, snapShare: 0.08, consistency: 0.08 },
  LB: { tackling: 0.24, coverage: 0.20, splashPlays: 0.16, runFits: 0.14, pressure: 0.10, snapShare: 0.08, consistency: 0.08 },
  CB: { coverage: 0.28, ballProduction: 0.18, passBreakups: 0.16, tackling: 0.12, splashPlays: 0.10, snapShare: 0.08, consistency: 0.08 },
  S: { coverage: 0.22, tackling: 0.18, ballProduction: 0.16, runDefense: 0.14, versatility: 0.10, snapShare: 0.10, consistency: 0.10 },
  'K/P': { accuracy: 0.34, volumeDifficulty: 0.18, netValue: 0.16, consistency: 0.12, clutch: 0.10, fieldPositionImpact: 0.10 },
};

function convertPercentileToOvr(percentile) {
  const pct = Math.max(0, Math.min(100, percentile));
  if (pct >= 99.75) return 99;
  if (pct >= 99) return 97 + ((pct - 99) / 0.75) * 2;
  if (pct >= 96) return 94 + ((pct - 96) / 3) * 3;
  if (pct >= 88) return 89 + ((pct - 88) / 8) * 5;
  if (pct >= 70) return 84 + ((pct - 70) / 18) * 5;
  if (pct >= 45) return 78 + ((pct - 45) / 25) * 5;
  if (pct >= 20) return 70 + ((pct - 20) / 25) * 8;
  return 60 + (pct / 20) * 10;
}

function roundOvr(value) {
  return Math.max(60, Math.min(99, Math.round(value * 10) / 10));
}

async function computeRankings() {
  const seasonYear = getNFLSeasonYear();
  const key = cacheKey('rankings', seasonYear);
  const cached = readCache(key);
  if (cached) return cached;

  const [teams, standings] = await Promise.all([getTeams(), getStandings()]);
  const standingsMap = Object.fromEntries(standings.map((entry) => [entry.teamId, entry]));
  const [teamStats, schedules] = await Promise.all([
    mapLimit(teams, async (team) => ({ teamId: team.id, stats: await getTeamStatistics(team.espnId) }), 8),
    mapLimit(teams, async (team) => ({ teamId: team.id, schedule: await fetchTeamSchedule(team.espnId) }), 6),
  ]);

  const statsMap = Object.fromEntries(teamStats.filter(Boolean).map((entry) => [entry.teamId, entry.stats]));
  const formMap = Object.fromEntries(schedules.filter(Boolean).map((entry) => [entry.teamId, summarizeRecentForm(entry.schedule, entry.teamId)]));

  const baseTeams = teams.map((team) => {
    const standing = standingsMap[team.id] || {};
    const stats = statsMap[team.id] || {};
    const form = formMap[team.id] || { recentFormPoints: 0, recentFormLabel: 'Last 5 pending', recentResults: [], recentRecord: '0-0' };
    const pointsPerGame = getStatValue(stats, ['pointspergame', 'pointsscored'], standing.gamesPlayed ? standing.pointsFor / standing.gamesPlayed : 0);
    const pointsAllowedPerGame = getStatValue(stats, ['pointsallowedpergame', 'pointsagainst'], standing.gamesPlayed ? standing.pointsAgainst / standing.gamesPlayed : 0);
    const yardsPerGame = getStatValue(stats, ['yardspergame', 'totaloffensiveyards'], 0);
    const yardsAllowedPerGame = getStatValue(stats, ['yardsallowedpergame'], 0);
    const turnovers = getStatValue(stats, ['takeaways'], 0);
    const giveaways = getStatValue(stats, ['turnovers', 'giveaways'], 0);
    const sackRate = getStatValue(stats, ['sacks'], 0);

    return {
      ...team,
      record: standing.record || '0-0',
      streak: standing.streak || 'Even',
      wins: standing.wins || 0,
      losses: standing.losses || 0,
      ties: standing.ties || 0,
      gamesPlayed: standing.gamesPlayed || 0,
      winPct: standing.winPct || 0,
      differential: standing.differential || 0,
      pointsFor: standing.pointsFor || 0,
      pointsAgainst: standing.pointsAgainst || 0,
      standingPoints: standing.standingPoints || 0,
      clubPoints: standing.wins || 0,
      recentFormPoints: form.recentFormPoints,
      recentFormLabel: form.recentFormLabel,
      recentRecord: form.recentRecord,
      recentResults: form.recentResults,
      pointsPerGame,
      pointsAllowedPerGame,
      yardsPerGame,
      yardsAllowedPerGame,
      turnovers,
      giveaways,
      sackRate,
      successValue: (standing.winPct || 0) * 100 + (standing.differential || 0) * 2.2 + form.recentFormPoints * 1.2,
      offenseValue: pointsPerGame * 3.6 + yardsPerGame * 0.08 - giveaways * 0.8,
      defenseValue: pointsAllowedPerGame * -3.5 + yardsAllowedPerGame * -0.07 + turnovers * 1.1 + sackRate * 0.6,
    };
  });

  const successScale = scoreScale(baseTeams.map((team) => team.successValue));
  const offenseScale = scoreScale(baseTeams.map((team) => team.offenseValue));
  const defenseScale = scoreScale(baseTeams.map((team) => team.defenseValue));
  const recentScale = scoreScale(baseTeams.map((team) => team.recentFormPoints * 8 + team.differential));

  const ranked = baseTeams.map((team) => {
    const successScore = successScale(team.successValue);
    const offScore = offenseScale(team.offenseValue);
    const defScore = defenseScale(team.defenseValue);
    const recentScore = recentScale(team.recentFormPoints * 8 + team.differential);
    const ovrScore = roundOvr(successScore * 0.42 + offScore * 0.23 + defScore * 0.25 + recentScore * 0.10);
    return {
      ...team,
      successScore: roundOvr(successScore),
      offScore: roundOvr(offScore),
      defScore: roundOvr(defScore),
      recentScore: roundOvr(recentScore),
      groupLabel: team.nickname || team.abbreviation,
      ovrScore,
    };
  });

  ranked.sort((left, right) => right.ovrScore - left.ovrScore || right.winPct - left.winPct || right.differential - left.differential);
  ranked.forEach((team, index) => {
    team.ovrRank = index + 1;
  });
  return writeCache(key, ranked, 30 * 60 * 1000);
}

function buildPositionScales(players) {
  const scales = {};
  const groups = uniqBy(players.map((player) => player.positionGroup), (entry) => entry);
  groups.forEach((group) => {
    const groupPlayers = players.filter((player) => player.positionGroup === group);
    const names = positionComponentNames(group);
    scales[group] = {};
    names.forEach((name) => {
      scales[group][name] = scoreScale(groupPlayers.map((player) => player.rawComponents?.[name]), !['decisionMaking'].includes(name));
    });
  });
  return scales;
}

function buildPlayerAnalysis(player) {
  const group = player.positionGroup;
  const leaders = (player.leaders || []).slice(0, 3).map((entry) => `${entry.label} #${entry.rank}`);
  const leaderPhrase = leaders.length ? leaders.join(', ') : 'team role and current usage';
  const clubContext = `${player.team?.displayName || player.team?.abbreviation} (${player.team?.record || '0-0'})`;

  switch (group) {
    case 'QB':
      return `${player.displayName} grades as a ${player.tier} quarterback because his current profile is being driven by efficiency, production, and decision-making signals. The board is leaning on ${leaderPhrase} inside the ${clubContext} environment.`;
    case 'RB':
      return `${player.displayName} is carrying a ${player.tier} running back grade through rushing efficiency, volume, and red-zone role. The live board is reading ${leaderPhrase} with team context from ${clubContext}.`;
    case 'WR':
    case 'TE':
      return `${player.displayName} is landing in the ${player.tier} pass-catcher tier based on target command, production, and scoring impact. Right now the strongest live signals are ${leaderPhrase} for ${clubContext}.`;
    case 'OL':
      return `${player.displayName} is being graded as an offensive line piece rather than a fantasy name. Protection, availability, and team run/pass support are driving this mark inside ${clubContext}.`;
    case 'EDGE':
    case 'DL':
    case 'LB':
    case 'CB':
    case 'S':
      return `${player.displayName} is being ranked on real defensive impact instead of reputation: disruption, tackling, coverage, and splash-play indicators matter most. The clearest current signals are ${leaderPhrase} for ${clubContext}.`;
    default:
      return `${player.displayName} is sitting in the ${player.tier} tier with the live board currently leaning on ${leaderPhrase} inside ${clubContext}.`;
  }
}

function bucketTier(rating) {
  if (rating >= 96) return 'generational';
  if (rating >= 91) return 'superstar';
  if (rating >= 84) return 'high-end starter';
  if (rating >= 78) return 'solid starter';
  if (rating >= 70) return 'average';
  return 'depth';
}

export async function getNFLPlayerCatalog() {
  const seasonYear = getNFLSeasonYear();
  const key = cacheKey('players', seasonYear);
  const cached = readCache(key);
  if (cached) return cached;

  const teams = await getTeams();
  const [rankings, leaders] = await Promise.all([
    computeRankings().catch(() => buildFallbackRankings(teams)),
    fetchLeaders().catch(() => []),
  ]);
  const rankingMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
  const leaderMap = buildLeaderMetricMap(leaders);

  const rosters = await mapLimit(
    teams,
    async (team) => {
      const payload = await fetchRoster(team.espnId);
      return parseRosterPlayers(payload, rankingMap[team.id] || team);
    },
    8,
  );

  const teamMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
  const players = uniqBy(rosters.flat().filter(Boolean), (player) => player.id).map((player) => ({
    ...player,
    leaders: leaders.filter((entry) => entry.athleteId === player.id).sort((a, b) => a.rank - b.rank),
    rawComponents: computePositionComponents(player, leaderMap, teamMap),
  }));

  const scales = buildPositionScales(players);
  const rated = players
    .map((player) => {
      const weights = POSITION_WEIGHTS[player.positionGroup] || POSITION_WEIGHTS.WR;
      const groupScales = scales[player.positionGroup] || {};
      const leaderCount = player.leaders?.length || 0;
      let weightedTotal = 0;
      let weightTotal = 0;

      Object.entries(weights).forEach(([metric, weight]) => {
        const scale = groupScales[metric];
        if (!scale) return;
        weightedTotal += scale(player.rawComponents?.[metric]) * weight;
        weightTotal += weight;
      });

      const basePercentile = weightTotal ? weightedTotal / weightTotal : 50;
      const teamContext = leaderCount ? ((player.team?.ovrScore || 75) - 75) * 0.03 : 0;
      const roleDifficulty = leaderCount
        ? (player.positionGroup === 'QB' ? 1.6 : player.positionGroup === 'CB' || player.positionGroup === 'EDGE' ? 1.1 : 0.4)
        : 0;
      const ageAdj =
        player.age == null
          ? 0
          : player.age >= 24 && player.age <= 29
            ? 1.2
            : player.age >= 21 && player.age <= 23
              ? 0.4
              : player.age >= 32
                ? -0.8
              : 0;
      const experienceAdj = Number.isFinite(player.experience) ? Math.min(1, player.experience * 0.14) : 0;
      const recentAdj = leaderCount ? ((player.team?.recentScore || 50) - 50) * 0.02 : 0;
      const bestRank = Math.min(...(player.leaders || []).map((entry) => Number(entry.rank || 999)), 999);
      const leaderboardBonus = leaderCount ? Math.max(0, (40 - bestRank) * 0.18) : 0;
      const noDataPenalty =
        leaderCount > 0
          ? 0
          : player.positionGroup === 'OL'
            ? -18
            : player.positionGroup === 'K/P'
              ? -12
              : -9;
      const finalPercentile = Math.max(
        1,
        Math.min(99.9, basePercentile + teamContext + roleDifficulty + ageAdj + experienceAdj + recentAdj + leaderboardBonus + noDataPenalty),
      );
      const rating = roundOvr(convertPercentileToOvr(finalPercentile));

      return {
        ...player,
        rating,
        ovr: rating,
        percentile: Math.round(finalPercentile * 10) / 10,
        tier: bucketTier(rating),
        leaderSummary: leaderSummary(leaderMap, player.id),
      };
    })
    .sort((left, right) => right.rating - left.rating || left.displayName.localeCompare(right.displayName))
    .map((player, index) => ({
      ...player,
      rank: index + 1,
      analysis: buildPlayerAnalysis(player),
    }));

  return writeCache(
    key,
    {
      sport: 'nfl',
      players: rated,
      lastUpdated: new Date().toISOString(),
      totalPlayers: rated.length,
    },
    10 * 60 * 1000,
  );
}

function fantasySeasonBlend() {
  const now = new Date();
  const month = easternDateParts(now).month;
  return month < 9 ? { currentWeight: 0.15, lastWeight: 0.85 } : { currentWeight: 0.55, lastWeight: 0.45 };
}

function findFantasySourceEntry(player, sourcePlayers = []) {
  const lookupKeys = buildFantasyLookupKeys(player.displayName, player.team?.abbreviation);
  for (const sourcePlayer of sourcePlayers) {
    const sourceKeys = buildFantasyLookupKeys(sourcePlayer.displayName, sourcePlayer.teamAbbr);
    if (lookupKeys.some((key) => sourceKeys.includes(key))) {
      return sourcePlayer;
    }
  }
  return null;
}

function buildFantasyPayload(catalog, news, sourceRankings = { players: [], source: 'NFL Fantasy' }) {
  const { currentWeight, lastWeight } = fantasySeasonBlend();
  const sourcePlayers = sourceRankings?.players || [];
  const sourceTotal = Math.max(1, sourceRankings?.totalPlayers || sourcePlayers.length || 200);
  const players = (catalog?.players || [])
    .filter((player) => FANTASY_POSITIONS.has(player.positionGroup))
    .map((player) => {
      const metrics = player.rawComponents || {};
      const volume = (metrics.production || 0) * 0.34 + (metrics.targetCommand || 0) * 0.28 + (metrics.redZoneRole || 0) * 0.18 + (metrics.snapShare || 0) * 0.2;
      const ceiling = (metrics.explosivePassing || metrics.explosiveRuns || metrics.explosivePlays || metrics.touchdownRate || 0) * 0.46 + (metrics.efficiency || 0) * 0.26 + (metrics.redZoneRole || 0) * 0.28;
      const realSkill = (player.rating || 70) * 0.65;
      const teamSituation = ((player.team?.ovrScore || 75) * 0.45) + ((player.team?.offScore || 70) * 0.35) + ((player.team?.recentScore || 50) * 0.20);
      const historicalModel = (volume * 0.44) + (ceiling * 0.24) + (realSkill * 0.18) + (teamSituation * 0.14);
      const sourceEntry = findFantasySourceEntry(player, sourcePlayers);
      const sourcePercentile = sourceEntry ? fantasyRankToPercentile(sourceEntry.rank, sourceTotal) : null;
      const sourceScore = sourcePercentile != null ? convertPercentileToOvr(sourcePercentile) : null;
      const injuryPenalty = (news || []).some((story) => normalizeKey(story.headline).includes(normalizeKey(player.displayName)) && /injur|out|surgery|questionable/i.test(story.headline || '')) ? -6 : 0;
      const fantasyValue = roundOvr(
        (sourceScore != null
          ? (lastWeight * ((sourceScore * 0.54) + (historicalModel * 0.32) + ((player.rating || 70) * 0.14))) +
            (currentWeight * (((player.rating || 70) * 0.60) + (historicalModel * 0.25) + (sourceScore * 0.15)))
          : (lastWeight * historicalModel) + (currentWeight * (player.rating || 70))) +
          injuryPenalty,
      );
      return {
        ...player,
        fantasyValue,
        fantasyTier: bucketTier(fantasyValue),
        fantasySource: sourceEntry?.source || sourceRankings?.source || 'Composite',
        fantasySourceRank: sourceEntry?.rank || null,
      };
    })
    .sort((left, right) =>
      right.fantasyValue - left.fantasyValue ||
      (left.fantasySourceRank || Number.MAX_SAFE_INTEGER) - (right.fantasySourceRank || Number.MAX_SAFE_INTEGER) ||
      right.rating - left.rating
    )
    .map((player, index) => ({
      ...player,
      fantasyRank: index + 1,
    }));

  const fantasyNews = (news || []).filter((story) => {
    const haystack = `${story.headline} ${story.description}`.toLowerCase();
    return FANTASY_KEYWORDS.some((keyword) => haystack.includes(keyword));
  });

  return {
    players,
    news: fantasyNews.slice(0, 8),
    lastUpdated: new Date().toISOString(),
    formula:
      'Before Week 5 the board leans on official NFL Fantasy draft rankings plus previous-season volume, role, and team context. After Week 5 current-season production takes over more aggressively.',
    source: sourceRankings?.source || 'NFL Fantasy',
  };
}

export async function getNFLFantasyRankings() {
  const seasonYear = getNFLSeasonYear();
  const key = cacheKey('fantasy', seasonYear);
  const cached = readCache(key);
  if (cached) return cached;

  const [catalog, news, sourceRankings] = await Promise.all([getNFLPlayerCatalog(), fetchNews(), fetchOfficialFantasyRankings()]);
  return writeCache(key, buildFantasyPayload(catalog, news, sourceRankings), 20 * 60 * 1000);
}

function filterTeamNews(news, team) {
  const teamName = (team.displayName || '').toLowerCase();
  const abbr = (team.abbreviation || '').toLowerCase();
  const nickname = (team.nickname || '').toLowerCase();
  return news.filter((story) => {
    const haystack = `${story.headline} ${story.description}`.toLowerCase();
    return (teamName && haystack.includes(teamName)) || (nickname && haystack.includes(nickname)) || (abbr && haystack.includes(` ${abbr} `));
  });
}

function buildPredictorCard(home, away, odds = null, topPlayerMap = {}) {
  const homeStrength = (home.ovrScore || 75) + (home.offScore || 75) * 0.18 + (home.recentScore || 50) * 0.08 + (topPlayerMap[home.id]?.rating || 75) * 0.1 + 2.4;
  const awayStrength = (away.ovrScore || 75) + (away.offScore || 75) * 0.18 + (away.recentScore || 50) * 0.08 + (topPlayerMap[away.id]?.rating || 75) * 0.1;
  const diff = homeStrength - awayStrength;
  const homeWinProbability = Math.max(5, Math.min(95, Math.round((1 / (1 + Math.exp(-(diff / 11)))) * 100)));
  let projectedHomeScore = Math.round(21 + ((home.offScore || 75) - (away.defScore || 75)) / 5 + diff / 10);
  let projectedAwayScore = Math.round(20 + ((away.offScore || 75) - (home.defScore || 75)) / 5 - diff / 13);
  if (projectedHomeScore === projectedAwayScore) {
    if (homeWinProbability >= 50) projectedHomeScore += 1;
    else projectedAwayScore += 1;
  }
  const projectedMargin = projectedHomeScore - projectedAwayScore;
  const projectedTotal = projectedHomeScore + projectedAwayScore;
  const marketHomeProbability = moneylineToProbability(odds?.homeMoneyline);
  const marketEdge =
    Number.isFinite(marketHomeProbability) && marketHomeProbability !== null
      ? Number((homeWinProbability / 100 - marketHomeProbability).toFixed(3))
      : null;

  return {
    gameId: `${away.id || away.teamId}-${home.id || home.teamId}`,
    home: {
      teamId: home.id || home.teamId,
      abbreviation: home.abbreviation,
      displayName: home.displayName,
    },
    away: {
      teamId: away.id || away.teamId,
      abbreviation: away.abbreviation,
      displayName: away.displayName,
    },
    homeWinProbability,
    awayWinProbability: 100 - homeWinProbability,
    projectedHomeScore,
    projectedAwayScore,
    projectedMargin,
    projectedTotal,
    americanOdds: homeWinProbability >= 50 ? odds?.homeMoneyline ?? null : odds?.awayMoneyline ?? null,
    odds: odds || null,
    confidence: Math.abs(diff) > 17 ? 'High' : Math.abs(diff) > 9 ? 'Medium' : 'Lean',
    bettingLean: homeWinProbability >= 50 ? `${home.abbreviation} model lean` : `${away.abbreviation} model lean`,
    explanation: [
      `${home.abbreviation} OFF ${home.offScore} vs ${away.abbreviation} DEF ${away.defScore}.`,
      `${away.abbreviation} OFF ${away.offScore} vs ${home.abbreviation} DEF ${home.defScore}.`,
      `${home.abbreviation} record ${home.record} and ${away.abbreviation} record ${away.record} are part of the model context.`,
      topPlayerMap[home.id || home.teamId] || topPlayerMap[away.id || away.teamId]
        ? `Top-player edge: ${topPlayerMap[home.id || home.teamId]?.displayName || home.displayName} / ${topPlayerMap[away.id || away.teamId]?.displayName || away.displayName}.`
        : null,
      marketEdge !== null ? `Model vs market edge: ${(marketEdge * 100).toFixed(1)}%.` : null,
    ].filter(Boolean),
  };
}

function buildPredictors(scoreboard, rankings, featuredPlayers) {
  const rankingMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
  const topPlayerMap = {};
  featuredPlayers.forEach((player) => {
    const teamId = player.team?.id;
    if (teamId && !topPlayerMap[teamId]) topPlayerMap[teamId] = player;
  });
  return scoreboard
    .filter((game) => game.home.teamId && game.away.teamId)
    .map((game) => {
      const home = rankingMap[game.home.teamId];
      const away = rankingMap[game.away.teamId];
      if (!home || !away) return null;
      return {
        ...buildPredictorCard(home, away, game.odds, topPlayerMap),
        gameId: game.id,
      };
    })
    .filter(Boolean)
    .sort((left, right) => Math.abs(right.projectedMargin) - Math.abs(left.projectedMargin));
}

export async function getNFLPredictor(homeTeamId, awayTeamId) {
  const [rankings, catalog] = await Promise.all([computeRankings(), getNFLPlayerCatalog()]);
  const teams = Object.fromEntries(rankings.map((team) => [team.id, team]));
  const featuredByTeam = {};
  catalog.players.slice(0, 120).forEach((player) => {
    const teamId = player.team?.id;
    if (teamId && !featuredByTeam[teamId]) featuredByTeam[teamId] = player;
  });

  const home = teams[String(homeTeamId)];
  const away = teams[String(awayTeamId)];
  if (!home || !away) {
    return { predictors: [] };
  }
  return {
    predictors: [buildPredictorCard(home, away, null, featuredByTeam)],
    lastUpdated: new Date().toISOString(),
  };
}

export async function getNFLBootstrap() {
  const key = cacheKey('bootstrap', getNFLSeasonYear());
  const cached = readCache(key);
  if (cached) return cached;

  const teams = await getTeams().catch(() => []);
  const rankings = await computeRankings().catch(() => buildFallbackRankings(teams));
  const [scoreboard, news, catalog] = await Promise.all([
    fetchScoreboard().catch(() => []),
    fetchNews().catch(() => []),
    getNFLPlayerCatalog().catch(() => ({
      sport: 'nfl',
      players: [],
      lastUpdated: new Date().toISOString(),
      totalPlayers: 0,
    })),
  ]);
  const fantasy = buildFantasyPayload(catalog, news);

  const featuredPlayers = catalog.players.slice(0, 16);
  const predictors = buildPredictors(scoreboard, rankings, featuredPlayers);

  return writeCache(
    key,
    {
      sport: 'nfl',
      seasonYear: getNFLSeasonYear(),
      headline:
        'A premium NFL control room with live boards, power rankings, fantasy context, and stat-driven player tiers built off the current active season baseline.',
      scoreboard,
      rankings,
      teams: rankings,
      news: news.slice(0, 8),
      fantasyNews: fantasy.news || [],
      featuredPlayers,
      playersCatalog: catalog,
      predictors,
      fantasyRankings: fantasy.players.slice(0, 80),
      formulas: FORMULA_COPY,
      meta: {
        liveGames: scoreboard.filter((game) => game.state === 'in').length,
        teamCount: rankings.length,
        playerCountLabel: `${catalog.players.length} tracked players`,
      },
      lastUpdated: new Date().toISOString(),
    },
    2 * 60 * 1000,
  );
}

async function fetchAthleteStats(athleteId) {
  const seasonYear = getNFLSeasonYear();
  const key = cacheKey('athlete-stats', `${athleteId}:${seasonYear}`);
  const cached = readCache(key);
  if (cached) return cached;
  try {
    const payload = await fetchJson(withQuery(`${NFL_SITE}/athletes/${athleteId}/stats`, { season: seasonYear, seasontype: 2 }), 30 * 60 * 60 * 1000);
    const statLines = [];
    walk(payload, (node) => {
      if (Array.isArray(node?.stats) && node.displayName) {
        node.stats.slice(0, 8).forEach((stat) => {
          statLines.push({
            group: node.displayName,
            label: stat.displayName || stat.name || 'Stat',
            value: stat.displayValue || stat.value || '0',
          });
        });
      }
    });
    return writeCache(key, statLines.slice(0, 20), 30 * 60 * 60 * 1000);
  } catch (_error) {
    return writeCache(key, [], 30 * 60 * 1000);
  }
}

function filterStatsForPosition(positionGroup, stats) {
  const goalieKeys = [];
  const offenseMatchers = {
    QB: /passing|rushing|completion|interception|rating|qbr/i,
    RB: /rushing|receiving|touchdown|fumbles/i,
    WR: /receiving|targets|touchdown|yards/i,
    TE: /receiving|targets|touchdown|yards/i,
    OL: /games|starts|penalt/i,
    EDGE: /sacks|tackle|forced|interception|passes defended/i,
    DL: /sacks|tackle|forced/i,
    LB: /tackle|sacks|interception|forced/i,
    CB: /interception|passes defended|tackle|forced/i,
    S: /interception|passes defended|tackle|forced/i,
    'K/P': /field goal|extra point|punt|average/i,
  };
  const matcher = offenseMatchers[positionGroup] || /.*/i;
  return stats.filter((stat) => matcher.test(`${stat.group} ${stat.label}`) && !goalieKeys.length).slice(0, 14);
}

export async function getNFLPlayerDetail(playerId) {
  const [catalog, stats, fantasy] = await Promise.all([getNFLPlayerCatalog(), fetchAthleteStats(playerId), getNFLFantasyRankings()]);
  const player = catalog.players.find((entry) => entry.id === String(playerId));
  if (!player) {
    throw new Error('Player not found');
  }
  const fantasyEntry = fantasy.players.find((entry) => entry.id === player.id);
  const filteredStats = filterStatsForPosition(player.positionGroup, stats);
  return {
    player: {
      ...player,
      fantasyRank: fantasyEntry?.fantasyRank || null,
      fantasyValue: fantasyEntry?.fantasyValue || null,
    },
    analysis: player.analysis,
    hotness: Math.max(1, Math.min(5, Math.round(((player.percentile || 50) - 45) / 11))),
    stats: filteredStats,
    accolades: (player.leaders || []).slice(0, 4).map((leader) => `${leader.label} #${leader.rank}`),
    lastUpdated: new Date().toISOString(),
  };
}

export async function getNFLTeamDetail(teamId) {
  const [rankings, catalog, schedule, news] = await Promise.all([
    computeRankings(),
    getNFLPlayerCatalog(),
    fetchTeamSchedule(teamId),
    fetchNews(),
  ]);
  const team = rankings.find((entry) => entry.id === String(teamId));
  if (!team) {
    throw new Error('Team not found');
  }
  const roster = catalog.players.filter((player) => player.team.id === String(teamId)).slice(0, 24);
  const teamNews = filterTeamNews(news, team).slice(0, 8);
  return {
    team,
    roster,
    recent: team.recentResults || [],
    news: teamNews,
    summary:
      `${team.displayName} sits at #${team.ovrRank} with ${team.record}, ${team.offScore} offense, ${team.defScore} defense, and ${team.recentFormLabel}.`,
    lastUpdated: new Date().toISOString(),
  };
}

function dedupeStrings(items = []) {
  return uniqBy(items.filter(Boolean), (item) => item);
}

export async function getNFLGameDetail(gameId) {
  const [scoreboard, bootstrap] = await Promise.all([fetchScoreboard(), getNFLBootstrap()]);
  const game = scoreboard.find((entry) => entry.id === String(gameId));
  if (!game) {
    throw new Error('Game not found');
  }

  try {
    const summary = await fetchJson(`${NFL_SITE}/summary?event=${gameId}`, 20 * 1000);
    const competition = summary.header?.competitions?.[0] || null;
    const venue = summary.gameInfo?.venue?.fullName || competition?.venue?.fullName || '';
    const address = summary.gameInfo?.venue?.address || competition?.venue?.address || {};
    const location = [address.city, address.state, address.country].filter(Boolean).join(', ');
    const broadcasts = competition?.broadcasts?.[0]?.names?.join(', ') || '';
    const situation = summary.drives?.current || summary.situation || competition?.situation || {};
    const yardLine = Number(situation?.yardLine || situation?.yardline || 50);
    const downDistance = [situation?.downDistanceText, situation?.shortDownDistanceText].filter(Boolean)[0] || '';
    const possession = situation?.possessionText || situation?.lastPlay?.team?.displayName || '';
    const scoringPlays = (summary.scoringPlays || []).map((play) => ({
      title: play.text || play.shortText || 'Scoring play',
      clock: play.clock?.displayValue || '',
      period: play.period?.number ? `Q${play.period.number}` : '',
      teamId: play.team?.id ? String(play.team.id) : '',
      scoreValue: play.scoreValue || '',
    }));
    const headlines = [];
    walk(summary, (node) => {
      if (typeof node === 'string' && node.length > 24 && headlines.length < 18) {
        headlines.push(node);
      }
    });

    const leaders = [];
    walk(summary?.leaders || summary?.boxscore, (node) => {
      if (node?.athlete?.displayName && leaders.length < 8) {
        leaders.push({
          name: node.athlete.displayName,
          teamId: node.team?.id ? String(node.team.id) : '',
          label: node.displayName || node.name || 'Leader',
          value: node.displayValue || '',
        });
      }
    });

    const manOfTheMatch = leaders[0]
      ? {
          displayName: leaders[0].name,
          teamId: leaders[0].teamId,
          summary: `${leaders[0].label} • ${leaders[0].value}`,
        }
      : null;

    return {
      game,
      venue,
      location,
      broadcast: broadcasts || game.broadcast || '',
      summary: competition?.status?.type?.detail || game.statusLabel,
      fieldState: {
        possession,
        yardLine: Number.isFinite(yardLine) ? yardLine : 50,
        downDistance,
      },
      keyMoments: scoringPlays.slice(0, 12),
      timeline: scoringPlays.length ? scoringPlays : dedupeStrings(headlines).slice(0, 12).map((note) => ({ title: note })),
      boxScore: (summary.boxscore?.teams || []).map((teamBox) => ({
        teamId: teamBox.team?.id ? String(teamBox.team.id) : '',
        displayName: teamBox.team?.displayName || '',
        stats: (teamBox.statistics || []).slice(0, 8).map((stat) => ({
          label: stat.displayName || stat.name || 'Stat',
          value: stat.displayValue || stat.value || '',
        })),
      })),
      manOfTheMatch,
      predictor: bootstrap.predictors.find((entry) => entry.gameId === String(gameId)) || null,
      lastUpdated: new Date().toISOString(),
    };
  } catch (_error) {
    return {
      game,
      venue: '',
      location: '',
      broadcast: game.broadcast || '',
      summary: game.statusLabel,
      fieldState: {
        possession: '',
        yardLine: 50,
        downDistance: '',
      },
      keyMoments: [],
      timeline: [],
      boxScore: [],
      manOfTheMatch: null,
      predictor: bootstrap.predictors.find((entry) => entry.gameId === String(gameId)) || null,
      lastUpdated: new Date().toISOString(),
    };
  }
}

export async function getNFLNews() {
  return fetchNews();
}

export function getNFLFormulaCopy() {
  return FORMULA_COPY;
}
