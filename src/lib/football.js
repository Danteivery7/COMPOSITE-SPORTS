import { normalizeEspnNewsArticle } from '@/src/lib/espn-news';
import { extractEspnOdds, moneylineToProbability } from '@/src/lib/odds';
import { compareByStartTime, getEasternDateKey, isSameEasternDate } from '@/src/lib/time';

const CACHE = new Map();
const DEFAULT_HEADSHOT = 'https://a.espncdn.com/i/headshots/nophoto.png';
const FINAL_VISIBILITY_HOURS = 12;
const MATCH_DURATION_HOURS = 2.5;

export const PRIMARY_FOOTBALL_LEAGUE_KEYS = [
  'premier-league',
  'la-liga',
  'serie-a',
  'ligue-1',
  'bundesliga',
  'mls',
];

export const FOOTBALL_ROUTE_ORDER = [
  ...PRIMARY_FOOTBALL_LEAGUE_KEYS,
  'champions-league',
  'international-play',
];

export const FOOTBALL_LEAGUES = {
  'premier-league': {
    key: 'premier-league',
    slug: 'eng.1',
    label: 'Premier League',
    shortLabel: 'Premier League',
    region: 'England',
    competitionWeight: 1.2,
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
    competitionWeight: 1.15,
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
    competitionWeight: 1.05,
    accent: '#8ef1ff',
    accentAlt: '#dbfbff',
    surface: 'radial-gradient(circle at top, rgba(77, 188, 210, 0.32), rgba(6, 11, 14, 0.97) 72%)',
    cardBlurb: 'French pace, youth, transition threats, and a clean league-wide composite.',
  },
  bundesliga: {
    key: 'bundesliga',
    slug: 'ger.1',
    label: 'Bundesliga',
    shortLabel: 'Bundesliga',
    region: 'Germany',
    competitionWeight: 1.02,
    accent: '#ff8762',
    accentAlt: '#ffe1d4',
    surface: 'radial-gradient(circle at top, rgba(238, 92, 61, 0.34), rgba(14, 7, 7, 0.97) 72%)',
    cardBlurb: 'German tempo, pressing energy, and a full league composite built from live club form and squad quality.',
  },
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
  'champions-league': {
    key: 'champions-league',
    slug: 'uefa.champions',
    label: 'Champions League',
    shortLabel: 'Champions League',
    region: 'Europe',
    competitionWeight: 0.94,
    accent: '#8db1ff',
    accentAlt: '#edf3ff',
    surface: 'radial-gradient(circle at top, rgba(95, 126, 255, 0.36), rgba(7, 8, 18, 0.98) 74%)',
    cardBlurb: 'Big European nights, knockout drama, and a secondary competition context layered below the core club-league board.',
  },
  'international-play': {
    key: 'international-play',
    slug: 'fifa.world',
    label: 'International Play',
    shortLabel: 'International',
    region: 'Global',
    competitionWeight: 0.92,
    accent: '#72ffd6',
    accentAlt: '#e8fff8',
    surface: 'radial-gradient(circle at top, rgba(52, 196, 147, 0.34), rgba(6, 12, 17, 0.98) 74%)',
    cardBlurb: 'National-team football, World Cup priority logic, and a global composite that blends live international form with FIFA context.',
  },
};

const CLUB_FOOTBALL_LEAGUES = [...PRIMARY_FOOTBALL_LEAGUE_KEYS];
const WORLD_CUP_MARKERS = ['fifa world cup', 'world cup'];
const FOOTBALL_SIDE_ALIASES = {
  usa: ['unitedstates', 'unitedstatesofamerica'],
  unitedstates: ['usa', 'unitedstatesofamerica'],
  unitedstatesofamerica: ['usa', 'unitedstates'],
  turkiye: ['turkey'],
  turkey: ['turkiye'],
  korearepublic: ['southkorea'],
  southkorea: ['korearepublic'],
  iriran: ['iran', 'islamicrepublicofiran'],
  iran: ['iriran', 'islamicrepublicofiran'],
  islamicrepublicofiran: ['iran', 'iriran'],
  ivorycoast: ['cotedivoire'],
  cotedivoire: ['ivorycoast'],
  drcongo: ['congodr', 'democraticrepublicofthecongo'],
  congodr: ['drcongo', 'democraticrepublicofthecongo'],
  democraticrepublicofthecongo: ['drcongo', 'congodr'],
  capeverde: ['caboverde'],
  caboverde: ['capeverde'],
  bosniaandherzegovina: ['bosniaherzegovina'],
  bosniaherzegovina: ['bosniaandherzegovina'],
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

function emptyFootballPlayerCatalog(leagueKey) {
  return {
    league: leagueKey,
    players: [],
    lastUpdated: null,
    totalPlayers: 0,
  };
}

function getCachedPlayerCatalog(leagueKey) {
  return readCache(cacheKey('players', leagueKey)) || emptyFootballPlayerCatalog(leagueKey);
}

async function getBootstrapPlayersCatalog(leagueKey, timeoutMs = 900) {
  const cached = getCachedPlayerCatalog(leagueKey);
  if (cached.players?.length) return cached;

  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(cached), timeoutMs);
  });

  try {
    return await Promise.race([getPlayerCatalog(leagueKey), timeout]);
  } catch (_error) {
    return cached;
  }
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

function isGenericHeadshot(source = '') {
  const value = String(source || '').toLowerCase();
  return !value || value.includes('nophoto') || value.endsWith('/default.jpg');
}

function resolveFootballHeadshot(playerId, ...sources) {
  for (const source of sources) {
    if (typeof source === 'string' && source.trim() && !isGenericHeadshot(source)) {
      return source;
    }
  }

  const id = String(playerId || '').trim();
  if (!id) return DEFAULT_HEADSHOT;
  return `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png`;
}

function safeAverage(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function weightedMetricAverage(metrics, weights) {
  const usableEntries = Object.entries(weights).filter(([key]) => Number.isFinite(metrics[key]));
  if (!usableEntries.length) return 50;
  const totalWeight = usableEntries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!totalWeight) return 50;
  const total = usableEntries.reduce((sum, [key, weight]) => sum + (metrics[key] * weight), 0);
  return total / totalWeight;
}

function percentileRank(sortedValues, value, higherIsBetter = true) {
  if (!sortedValues.length || !Number.isFinite(value)) return 50;
  let index = sortedValues.findIndex((entry) => (higherIsBetter ? value >= entry : value <= entry));
  if (index === -1) index = sortedValues.length - 1;
  if (sortedValues.length === 1) return 50;
  return clampNumber(((sortedValues.length - index - 1) / (sortedValues.length - 1)) * 100, 0, 100);
}

function toTierLabel(rating) {
  if (rating >= 96) return 'generational elite';
  if (rating >= 91) return 'world-class';
  if (rating >= 84) return 'top level starter';
  if (rating >= 78) return 'solid starter';
  if (rating >= 70) return 'average pro';
  return 'depth';
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

async function fetchText(url, ttlMs = 60_000) {
  const key = cacheKey('text', 'global', url);
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

function getFootballLeagueOrderIndex(leagueKey) {
  const index = FOOTBALL_ROUTE_ORDER.indexOf(leagueKey);
  return index === -1 ? FOOTBALL_ROUTE_ORDER.length : index;
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

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeFootballSideName(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

function addFootballSideAliasKeys(set, normalized) {
  if (!normalized) return;
  set.add(normalized);
  (FOOTBALL_SIDE_ALIASES[normalized] || []).forEach((alias) => {
    if (alias) set.add(alias);
  });
}

function getFifaLookupKeys(team = {}) {
  const keys = new Set();
  [
    team.displayName,
    team.shortDisplayName,
    team.abbreviation,
    team.location,
    team.name,
  ].forEach((value) => addFootballSideAliasKeys(keys, normalizeFootballSideName(value)));
  return Array.from(keys);
}

function resolveFifaRankingEntry(team, fifaData) {
  if (!fifaData?.rankingsByKey) return null;
  const lookupKeys = getFifaLookupKeys(team);
  for (const key of lookupKeys) {
    const entry = fifaData.rankingsByKey[key];
    if (entry) return entry;
  }
  return null;
}

function extractNextDataPayload(html = '') {
  const match = String(html || '').match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch (_error) {
    return null;
  }
}

function collectMatchingStrings(node, pattern, bucket = [], seen = new WeakSet()) {
  if (!node || typeof node !== 'object') return bucket;
  if (seen.has(node)) return bucket;
  seen.add(node);

  if (Array.isArray(node)) {
    node.forEach((entry) => collectMatchingStrings(entry, pattern, bucket, seen));
    return bucket;
  }

  Object.values(node).forEach((value) => {
    if (typeof value === 'string' && pattern.test(value)) {
      bucket.push(value);
      return;
    }
    if (value && typeof value === 'object') {
      collectMatchingStrings(value, pattern, bucket, seen);
    }
  });

  return bucket;
}

function getCurrentFifaScheduleId(nextData, html = '') {
  const nestedId = nextData?.props?.pageProps?.pageData?.ranking?.dates?.[0]?.dates?.find((entry) =>
    /^FRS_Male_Football_\d{8}$/.test(String(entry?.id || '')))?.id;
  if (nestedId) return nestedId;

  const discovered = collectMatchingStrings(nextData, /^FRS_Male_Football_\d{8}$/);
  if (discovered.length) return discovered[0];

  const htmlMatch = String(html || '').match(/FRS_Male_Football_\d{8}/);
  return htmlMatch?.[0] || '';
}

function pickFifaTeamName(teamName = []) {
  return (
    teamName.find((entry) => entry?.Locale === 'en-GB')?.Description ||
    teamName.find((entry) => entry?.Locale === 'en')?.Description ||
    teamName[0]?.Description ||
    ''
  );
}

function isExpiredFinalGame(startTime, state, { durationHours = MATCH_DURATION_HOURS, visibilityHours = FINAL_VISIBILITY_HOURS } = {}) {
  if (String(state || '').toLowerCase() !== 'post' || !startTime) return false;
  const startMs = new Date(startTime).getTime();
  if (!Number.isFinite(startMs)) return false;
  const expiresAt = startMs + ((durationHours + visibilityHours) * 60 * 60 * 1000);
  return Date.now() > expiresAt;
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

function getFootballResolvedPosition(position = '') {
  const pos = String(position || '').toUpperCase();
  if (['G', 'GK'].includes(pos)) return 'GK';
  if (['CB', 'LCB', 'RCB'].includes(pos)) return 'CB';
  if (['LB', 'RB', 'LWB', 'RWB', 'WB', 'FB'].includes(pos)) return 'FB/WB';
  if (['DM', 'CDM', 'CM', 'MF', 'M'].includes(pos)) return 'DM/CM';
  if (['CAM', 'AM', 'LM', 'RM', 'LW', 'RW', 'WF', 'W'].includes(pos)) return 'AM/W';
  return 'ST';
}

function getFootballPositionGroup(position = '') {
  const resolved = getFootballResolvedPosition(position);
  if (resolved === 'GK') return 'GK';
  if (resolved === 'CB' || resolved === 'FB/WB') return 'DEF';
  if (resolved === 'DM/CM') return 'MID';
  return 'FWD';
}

function footballPositionLabel(position = '') {
  const resolved = getFootballResolvedPosition(position);
  if (resolved === 'FB/WB') return 'Fullback / Wingback';
  if (resolved === 'DM/CM') return 'Defensive / Central Midfielder';
  if (resolved === 'AM/W') return 'Attacking Midfielder / Winger';
  if (resolved === 'ST') return 'Striker';
  if (resolved === 'CB') return 'Center Back';
  return 'Goalkeeper';
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
  const recentFormSequence = recent.map((game) => {
    if (game.teamScore > game.opponentScore) return 'W';
    if (game.teamScore === game.opponentScore) return 'D';
    return 'L';
  }).join('-');

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
    recentFormSequence,
    recentFormPointsLabel: recent.length ? `${recentFormPoints} pts last ${recent.length}` : 'Last 5 unavailable',
    recentFormCountryLabel: recent.length ? `Last ${recent.length}: ${recentFormSequence}` : 'Last 5 unavailable',
    recentFormLabel: recent.length ? `${recentFormPoints} pts last ${recent.length}` : 'Last 5 unavailable',
    recentResults: recent
      .slice()
      .reverse()
      .map((game) => `${game.teamScore}-${game.opponentScore} vs ${game.opponentAbbr}`),
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
  const teamStatsPayloads = await mapLimit(
    teams,
    async (team) => ({
      teamId: team.id,
      stats: await getTeamStatistics(leagueKey, team.espnId),
    }),
    3,
  );

  const teamStatsMap = Object.fromEntries(teamStatsPayloads.filter(Boolean).map((entry) => [entry.teamId, entry.stats]));
  const schedules = await mapLimit(
    teams,
    async (team) => ({
      teamId: team.id,
      schedule: await fetchTeamSchedule(leagueKey, team.espnId),
    }),
    4,
  );
  const scheduleMap = Object.fromEntries(schedules.filter(Boolean).map((entry) => [entry.teamId, entry.schedule]));

  const standings = teams.map((team) => {
    const stats = teamStatsMap[team.id] || {};
    const parsedRecord = parseRecordSummary(stats.recordSummary);
    const schedulePayload = scheduleMap[team.id];
    const scheduleSummary = summarizeScheduleResults(schedulePayload, team.id);
    const recentFormLabel = leagueKey === 'international-play'
      ? scheduleSummary.recentFormCountryLabel
      : scheduleSummary.recentFormPointsLabel;

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
      streak: recentFormLabel,
      recentFormPoints: scheduleSummary.recentFormPoints,
      recentFormSequence: scheduleSummary.recentFormSequence,
      recentFormLabel,
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

async function fetchFifaMenRankings() {
  const key = cacheKey('fifa-men-rankings', 'international-play');
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const html = await fetchText('https://inside.fifa.com/fifa-world-ranking/men', 12 * 60 * 60 * 1000);
    const nextData = extractNextDataPayload(html);
    const scheduleId = getCurrentFifaScheduleId(nextData, html);
    if (!scheduleId) {
      return writeCache(key, { rankingsByKey: {}, ordered: [], scheduleId: '', lastUpdated: null }, 30 * 60 * 1000);
    }

    const payload = await fetchJson(
      `https://api.fifa.com/api/v3/fifarankings/rankings/rankingsbyschedule?rankingScheduleId=${scheduleId}&language=en`,
      12 * 60 * 60 * 1000,
    );
    const ordered = (payload?.Results || [])
      .map((row) => {
        const name = pickFifaTeamName(row.TeamName || []);
        const rank = toFiniteNumber(row.Rank, NaN);
        if (!name || !Number.isFinite(rank)) return null;
        return {
          name,
          code: String(row.IdCountry || '').trim().toUpperCase(),
          rank,
          points: toFiniteNumber(row.TotalPoints, 0),
          prevRank: toFiniteNumber(row.PrevRank, rank),
          movement: toFiniteNumber(row.RankingMovement, 0),
          confederation: pickFifaTeamName(row.ConfederationName || []),
          ratedMatches: toFiniteNumber(row.RatedMatches, 0),
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.rank - right.rank);

    const rankingsByKey = {};
    ordered.forEach((entry) => {
      const nameKey = normalizeFootballSideName(entry.name);
      const keys = new Set();
      addFootballSideAliasKeys(keys, nameKey);
      addFootballSideAliasKeys(keys, normalizeFootballSideName(entry.code));
      keys.forEach((lookupKey) => {
        if (lookupKey) rankingsByKey[lookupKey] = entry;
      });
    });

    return writeCache(
      key,
      {
        rankingsByKey,
        ordered,
        scheduleId,
        lastUpdated: nextData?.props?.pageProps?.pageData?.ranking?.rankingLastUpdated || null,
      },
      12 * 60 * 60 * 1000,
    );
  } catch (_error) {
    return writeCache(key, { rankingsByKey: {}, ordered: [], scheduleId: '', lastUpdated: null }, 30 * 60 * 1000);
  }
}

async function computeRankings(leagueKey) {
  const key = cacheKey('rankings', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;

  const [teams, standings, playersCatalog, fifaRankings] = await Promise.all([
    getTeams(leagueKey),
    getStandings(leagueKey),
    getPlayerCatalog(leagueKey),
    leagueKey === 'international-play'
      ? fetchFifaMenRankings()
      : Promise.resolve({ rankingsByKey: {}, ordered: [], scheduleId: '', lastUpdated: null }),
  ]);
  const standingsMap = Object.fromEntries(standings.map((entry) => [entry.teamId, entry]));
  const rosterMap = (playersCatalog.players || []).reduce((map, player) => {
    const teamId = String(player.team?.id || '');
    if (!teamId) return map;
    const list = map.get(teamId) || [];
    list.push(player);
    map.set(teamId, list);
    return map;
  }, new Map());

  const base = teams.map((team) => {
    const standing = standingsMap[team.id] || {};
    const context = buildTeamPerformanceContext({ ...team, ...standing, id: team.id }, leagueKey);
    const roster = (rosterMap.get(String(team.id)) || []).slice().sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0));
    const projectedXi = roster.slice(0, 11);
    const depthGroup = roster.slice(11, 18);
    const startingXI = safeAverage(projectedXi.map((player) => Number(player.rating || 0)));
    const depth = safeAverage(depthGroup.map((player) => Number(player.rating || 0))) || safeAverage(roster.slice(5, 12).map((player) => Number(player.rating || 0)));
    const attackProxy = clampNumber(
      context.goalsForPer90 * 38 +
        context.differentialPer90 * 12 +
        context.standingPointsPct * 0.20 +
        safeAverage(roster.filter((player) => ['ST', 'AM/W'].includes(player.resolvedPosition)).slice(0, 5).map((player) => Number(player.rating || 0))) * 0.25,
      0,
      120,
    );
    const defenseProxy = clampNumber(
      ((2.4 - Math.min(context.goalsAgainstPer90 || 2.4, 2.4)) * 42) +
        context.cleanSheetRate * 0.35 +
        safeAverage(roster.filter((player) => ['GK', 'CB', 'FB/WB', 'DM/CM'].includes(player.resolvedPosition)).slice(0, 7).map((player) => Number(player.rating || 0))) * 0.30,
      0,
      120,
    );
    const underlyingProxy = clampNumber(
      context.differentialPer90 * 20 + context.goalsForPer90 * 12 + ((2.2 - Math.min(context.goalsAgainstPer90 || 2.2, 2.2)) * 14),
      0,
      120,
    );

    return {
      ...team,
      record: standing.record || '0-0-0',
      streak: standing.recentFormLabel || 'Last 5 unavailable',
      wins: standing.wins || 0,
      losses: standing.losses || 0,
      ties: standing.ties || 0,
      winPct: standing.winPct || 0,
      standingPoints: standing.standingPoints || 0,
      clubPoints: standing.standingPoints || 0,
      goalsFor: standing.pointsFor || 0,
      goalsAgainst: standing.pointsAgainst || 0,
      differential: standing.differential || 0,
      goalsForPerMatch: context.goalsForPer90,
      goalsAgainstPerMatch: context.goalsAgainstPer90,
      cleanSheets: standing.cleanSheets || 0,
      recentFormPoints: standing.recentFormPoints || 0,
      recentFormSequence: standing.recentFormSequence || '',
      recentFormLabel: standing.recentFormLabel || 'Last 5 unavailable',
      recentResults: standing.recentResults || [],
      standingRank: standing.standingRank || null,
      startingXI,
      depth,
      attackProxy,
      defenseProxy,
      underlyingProxy,
      standingPointsPct: context.standingPointsPct,
      recentPct: context.recentPct,
      teamStrengthPct: context.teamStrengthPct,
      squadSize: roster.length,
      roster,
    };
  });

  const offenseScale = scoreScale(base.map((team) => team.attackProxy));
  const defenseScale = scoreScale(base.map((team) => team.defenseProxy));
  const squadScale = scoreScale(base.map((team) => (team.startingXI * 0.72) + (team.depth * 0.28)));
  const recentScale = scoreScale(base.map((team) => team.recentPct));
  const underlyingScale = scoreScale(base.map((team) => team.underlyingProxy));

  const ranked = base.map((team) => {
    const offScore = offenseScale(team.attackProxy);
    const defScore = defenseScale(team.defenseProxy);
    const squadScore = squadScale((team.startingXI * 0.72) + (team.depth * 0.28));
    const recentScore = recentScale(team.recentPct);
    const underlyingScore = underlyingScale(team.underlyingProxy);
    const leagueAdj = clampNumber((leagueMeta(leagueKey).competitionWeight - 1.0) * 6, -2, 2);
    const fifaEntry = leagueKey === 'international-play' ? resolveFifaRankingEntry(team, fifaRankings) : null;
    const fifaRank = fifaEntry?.rank || null;
    const fifaPoints = fifaEntry?.points || 0;
    const fifaPercentile = leagueKey === 'international-play' && fifaRank && fifaRankings.ordered.length
      ? clampNumber(((fifaRankings.ordered.length - fifaRank) / Math.max(1, fifaRankings.ordered.length - 1)) * 100, 1, 100)
      : null;
    const hotnessNerf = recentScore * 0.10;
    const finalPercentile = leagueKey === 'international-play'
      ? clampNumber(
        (fifaPercentile ?? 50) * 0.88 +
          recentScore * 0.06 +
          offScore * 0.03 +
          defScore * 0.03,
        1,
        100,
      )
      : clampNumber(
        squadScore * 0.26 +
          offScore * 0.16 +
          defScore * 0.16 +
          team.standingPointsPct * 0.12 +
          hotnessNerf +
          underlyingScore * 0.06 +
          leagueAdj,
        1,
        100,
      );
    const ovrScore = clampNumber(Math.round((60 + finalPercentile * 0.39) * 10) / 10, 50, 99);
    const globalScore = ovrScore;

    return {
      ...team,
      standingRank: leagueKey === 'international-play' && fifaRank ? fifaRank : team.standingRank,
      standingPoints: leagueKey === 'international-play' && fifaPoints ? Math.round(fifaPoints) : team.standingPoints,
      clubPoints: leagueKey === 'international-play' && fifaPoints ? Math.round(fifaPoints) : team.clubPoints,
      resultsScore: Math.round((leagueKey === 'international-play' && fifaPercentile != null ? fifaPercentile : team.standingPointsPct) * 10) / 10,
      offScore: Math.round(offScore * 10) / 10,
      defScore: Math.round(defScore * 10) / 10,
      squadScore: Math.round(squadScore * 10) / 10,
      recentScore: Math.round(recentScore * 10) / 10,
      underlyingScore: Math.round(underlyingScore * 10) / 10,
      fifaRank,
      fifaPoints: Math.round(fifaPoints),
      ovrScore,
      globalScore,
      groupLabel: team.location || team.abbreviation,
      competition: leagueMeta(leagueKey).label,
    };
  });

  if (leagueKey === 'international-play') {
    ranked.sort((left, right) =>
      (left.fifaRank || Number.MAX_SAFE_INTEGER) - (right.fifaRank || Number.MAX_SAFE_INTEGER) ||
      right.recentFormPoints - left.recentFormPoints ||
      right.ovrScore - left.ovrScore,
    );
  } else {
    ranked.sort((left, right) => right.ovrScore - left.ovrScore || right.clubPoints - left.clubPoints || right.winPct - left.winPct);
  }
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
  }).filter((game) => !isExpiredFinalGame(game.startTime, game.state));
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
            headshot: resolveFootballHeadshot(
              node.athlete.id,
              node.athlete.headshot?.href,
              node.athlete.headshot,
            ),
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
  return toTierLabel(Number(rating || 0));
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
        headshot: resolveFootballHeadshot(
          node.id,
          node.headshot?.href,
          node.headshot,
        ),
        team,
        statistics: flattenedStats.statMap,
        statFeed: flattenedStats.statFeed,
      });
    }
  });
  return uniqBy(players, (player) => player.id);
}

const FOOTBALL_POSITION_WEIGHTS = {
  GK: { shotStopping: 0.28, goalsPrevented: 0.22, savePct: 0.16, distribution: 0.12, claims: 0.10, sweeping: 0.06, consistency: 0.06 },
  CB: { defending: 0.26, aerials: 0.18, interceptions: 0.16, clearances: 0.12, duelWinPct: 0.14, progression: 0.08, discipline: 0.06 },
  'FB/WB': { defending: 0.20, recoveryPace: 0.14, crossing: 0.16, chanceCreation: 0.16, ballProgression: 0.14, workRate: 0.12, duelWinPct: 0.08 },
  'DM/CM': { passing: 0.20, progression: 0.20, ballWinning: 0.18, pressResistance: 0.16, control: 0.16, chanceCreation: 0.10 },
  'AM/W': { creativity: 0.20, dribbling: 0.16, chanceCreation: 0.20, ballProgression: 0.16, goalsAssists: 0.18, workRate: 0.10 },
  ST: { finishing: 0.24, shotQuality: 0.18, movement: 0.18, pressing: 0.10, linkPlay: 0.12, nonPenaltyScoring: 0.18 },
};

function footballOverallFromPercentile(percentile) {
  const value = clampNumber(percentile, 0, 100);
  const segments = [
    [0, 15, 60, 68],
    [15, 40, 68, 75],
    [40, 70, 75, 82],
    [70, 88, 82, 89],
    [88, 96, 89, 94],
    [96, 99, 94, 97],
    [99, 99.7, 97, 98.5],
    [99.7, 100, 98.5, 99],
  ];

  for (const [start, end, min, max] of segments) {
    if (value <= end) {
      const span = Math.max(0.001, end - start);
      const progress = clampNumber((value - start) / span, 0, 1);
      return Math.round((min + (max - min) * progress) * 10) / 10;
    }
  }

  return 99;
}

function buildTeamPerformanceContext(team = {}, leagueKey = '') {
  const gamesPlayed = Math.max(1, Number(team.gamesPlayed || 0));
  const clubPoints = Number(team.standingPoints || 0);
  const goalsForPer90 = Number(team.pointsFor || 0) / gamesPlayed;
  const goalsAgainstPer90 = Number(team.pointsAgainst || 0) / gamesPlayed;
  const recentPct = gamesPlayed ? clampNumber((Number(team.recentFormPoints || 0) / Math.max(3, Math.min(15, Math.max(3, (team.recentResults || []).length * 3)))) * 100, 0, 100) : 50;
  const standingPointsPct = clampNumber((clubPoints / (gamesPlayed * 3)) * 100, 0, 100);
  const teamStrengthPct = clampNumber(
    standingPointsPct * 0.48 +
      clampNumber((goalsForPer90 / 2.7) * 100, 0, 100) * 0.22 +
      clampNumber((1 - Math.min(goalsAgainstPer90, 2.5) / 2.5) * 100, 0, 100) * 0.2 +
      recentPct * 0.10,
    0,
    100,
  );

  return {
    teamId: String(team.id || team.teamId || ''),
    team,
    leagueKey,
    gamesPlayed,
    clubPoints,
    goalsForPer90,
    goalsAgainstPer90,
    cleanSheetRate: clampNumber((Number(team.cleanSheets || 0) / gamesPlayed) * 100, 0, 100),
    recentPct,
    standingPointsPct,
    differentialPer90: Number(team.differential || 0) / gamesPlayed,
    teamStrengthPct,
  };
}

function extractFootballPlayerSignals(player, teamContext, leaderEntries = [], leagueKey = '') {
  const stats = player.statistics || {};
  const resolvedPosition = getFootballResolvedPosition(player.position);
  const positionGroup = getFootballPositionGroup(player.position);
  const appearances = getPlayerStat(stats, ['appearances', 'app'], 0);
  const subIns = getPlayerStat(stats, ['subins', 'sub'], 0);
  const starts = Math.max(0, appearances - subIns);
  const goals = getPlayerStat(stats, ['totalgoals', 'goals', 'g'], 0);
  const assists = getPlayerStat(stats, ['goalassists', 'assists', 'a'], 0);
  const shots = getPlayerStat(stats, ['totalshots', 'shots', 'sh'], 0);
  const shotsOnTarget = getPlayerStat(stats, ['shotsontarget', 'st'], 0);
  const saves = getPlayerStat(stats, ['saves', 'sv'], 0);
  const shotsFaced = getPlayerStat(stats, ['shotsfaced', 'shf'], 0);
  const goalsConceded = getPlayerStat(stats, ['goalsconceded', 'goalsagainst', 'ga'], 0);
  const foulsCommitted = getPlayerStat(stats, ['foulscommitted', 'fc'], 0);
  const foulsSuffered = getPlayerStat(stats, ['foulssuffered', 'fa'], 0);
  const yellowCards = getPlayerStat(stats, ['yellowcards', 'yc'], 0);
  const redCards = getPlayerStat(stats, ['redcards', 'rc'], 0);
  const offsides = getPlayerStat(stats, ['offsides', 'of'], 0);

  const apps = Math.max(1, appearances);
  const appearancePct = clampNumber((appearances / 34) * 100, 0, 100);
  const startsSharePct = clampNumber((starts / apps) * 100, 0, 100);
  const minutesPct = clampNumber(appearancePct * 0.6 + startsSharePct * 0.4, 0, 100);
  const goalRate = goals / apps;
  const assistRate = assists / apps;
  const shotRate = shots / apps;
  const shotOnTargetRate = shotsOnTarget / apps;
  const shotAccuracy = shots > 0 ? shotsOnTarget / shots : 0;
  const savePct = shotsFaced > 0 ? saves / shotsFaced : 0;
  const savesPerMatch = saves / apps;
  const goalsAgainstPerMatch = goalsConceded / apps;
  const disciplineControl = clampNumber(100 - ((yellowCards * 5) + (redCards * 18) + (foulsCommitted * 1.5)), 0, 100);
  const workRatePct = clampNumber(minutesPct * 0.65 + clampNumber((foulsSuffered + foulsCommitted) * 5, 0, 100) * 0.35, 0, 100);
  const leaderSignal = clampNumber(
    leaderEntries.slice(0, 3).reduce((total, entry) => total + Math.max(0, 12 - Number(entry.rank || 12)) * 4, 0),
    0,
    100,
  );
  const consistencyPct = clampNumber((appearancePct * 0.55) + (startsSharePct * 0.30) + (leaderSignal * 0.15), 0, 100);

  const metricFamilies = {
    GK: {
      shotStopping: savePct * 100,
      goalsPrevented: clampNumber((1.8 - goalsAgainstPerMatch) * 55 + (savePct * 35), 0, 100),
      savePct: savePct * 100,
      distribution: clampNumber(teamContext.goalsForPer90 * 26 + startsSharePct * 0.35, 0, 100),
      claims: clampNumber(savesPerMatch * 16, 0, 100),
      sweeping: clampNumber((teamContext.cleanSheetRate * 0.45) + (startsSharePct * 0.35) + (disciplineControl * 0.20), 0, 100),
      consistency: consistencyPct,
    },
    CB: {
      defending: clampNumber((teamContext.teamStrengthPct * 0.20) + ((100 - clampNumber(teamContext.goalsAgainstPer90 * 28, 0, 100)) * 0.55) + (startsSharePct * 0.25), 0, 100),
      aerials: clampNumber((startsSharePct * 0.55) + (appearancePct * 0.20) + (goalRate * 180) + (disciplineControl * 0.25), 0, 100),
      interceptions: clampNumber((teamContext.cleanSheetRate * 0.45) + (startsSharePct * 0.35) + (disciplineControl * 0.20), 0, 100),
      clearances: clampNumber((100 - clampNumber(teamContext.goalsAgainstPer90 * 28, 0, 100)) * 0.55 + appearancePct * 0.25 + workRatePct * 0.20, 0, 100),
      duelWinPct: clampNumber((disciplineControl * 0.45) + (startsSharePct * 0.30) + (teamContext.teamStrengthPct * 0.25), 0, 100),
      progression: clampNumber((assistRate * 220) + (foulsSuffered * 8) + (teamContext.goalsForPer90 * 18), 0, 100),
      discipline: disciplineControl,
    },
    'FB/WB': {
      defending: clampNumber((100 - clampNumber(teamContext.goalsAgainstPer90 * 28, 0, 100)) * 0.45 + startsSharePct * 0.35 + disciplineControl * 0.20, 0, 100),
      recoveryPace: clampNumber((appearancePct * 0.45) + (workRatePct * 0.35) + (teamContext.recentPct * 0.20), 0, 100),
      crossing: clampNumber((assistRate * 260) + (shotOnTargetRate * 80) + (teamContext.goalsForPer90 * 16), 0, 100),
      chanceCreation: clampNumber((assistRate * 280) + (foulsSuffered * 8) + (shotRate * 22), 0, 100),
      ballProgression: clampNumber((assistRate * 220) + (foulsSuffered * 8) + (teamContext.goalsForPer90 * 18), 0, 100),
      workRate: workRatePct,
      duelWinPct: clampNumber((disciplineControl * 0.40) + (workRatePct * 0.35) + (startsSharePct * 0.25), 0, 100),
    },
    'DM/CM': {
      passing: clampNumber((assistRate * 240) + (teamContext.standingPointsPct * 0.35) + (startsSharePct * 0.30), 0, 100),
      progression: clampNumber((assistRate * 260) + (foulsSuffered * 8) + (shotRate * 18), 0, 100),
      ballWinning: clampNumber((disciplineControl * 0.40) + (workRatePct * 0.30) + ((100 - clampNumber(teamContext.goalsAgainstPer90 * 28, 0, 100)) * 0.30), 0, 100),
      pressResistance: clampNumber((foulsSuffered * 9) + (startsSharePct * 0.40) + (disciplineControl * 0.25), 0, 100),
      control: clampNumber((teamContext.standingPointsPct * 0.40) + (teamContext.teamStrengthPct * 0.30) + (startsSharePct * 0.30), 0, 100),
      chanceCreation: clampNumber((assistRate * 280) + (shotOnTargetRate * 55) + (foulsSuffered * 7), 0, 100),
    },
    'AM/W': {
      creativity: clampNumber((assistRate * 290) + (foulsSuffered * 7) + (teamContext.goalsForPer90 * 16), 0, 100),
      dribbling: clampNumber((foulsSuffered * 9) + (shotOnTargetRate * 60) + (startsSharePct * 0.20), 0, 100),
      chanceCreation: clampNumber((assistRate * 280) + (shotRate * 22) + (shotOnTargetRate * 38), 0, 100),
      ballProgression: clampNumber((goalRate * 140) + (assistRate * 180) + (teamContext.goalsForPer90 * 16), 0, 100),
      goalsAssists: clampNumber(((goalRate + assistRate) * 210) + leaderSignal * 0.15, 0, 100),
      workRate: workRatePct,
    },
    ST: {
      finishing: clampNumber((goalRate * 330) + (shotAccuracy * 70), 0, 100),
      shotQuality: clampNumber((shotOnTargetRate * 85) + (shotAccuracy * 55), 0, 100),
      movement: clampNumber((shotRate * 28) + (offsides > 0 ? clampNumber(100 - offsides * 8, 0, 100) : 72), 0, 100),
      pressing: clampNumber((workRatePct * 0.55) + (foulsCommitted * 6) + (teamContext.recentPct * 0.15), 0, 100),
      linkPlay: clampNumber((assistRate * 260) + (foulsSuffered * 8) + (teamContext.teamStrengthPct * 0.18), 0, 100),
      nonPenaltyScoring: clampNumber((goalRate * 300) + leaderSignal * 0.15, 0, 100),
    },
  };

  return {
    ...player,
    leagueKey,
    resolvedPosition,
    positionGroup,
    positionLabel: footballPositionLabel(player.position),
    leaderEntries,
    teamContext,
    appearances,
    starts,
    goals,
    assists,
    shots,
    shotsOnTarget,
    saves,
    shotsFaced,
    goalsConceded,
    metrics: {
      appearances,
      starts,
      goals,
      assists,
      shots,
      shotsOnTarget,
      saves,
      shotsFaced,
      goalsConceded,
    },
    appearancePct,
    minutesPct,
    consistencyPct,
    recentPct: teamContext.recentPct,
    teamStrengthPct: teamContext.teamStrengthPct,
    leagueCompetitionWeight: leagueMeta(leagueKey).competitionWeight,
    metricFamilies,
    profileSummary:
      resolvedPosition === 'GK'
        ? `${saves} saves • ${goalsConceded} GA • ${appearances} apps`
        : `${goals} G • ${assists} A • ${appearances} apps`,
  };
}

function buildFootballMetricScales(rawPlayers) {
  const scales = {};
  Object.keys(FOOTBALL_POSITION_WEIGHTS).forEach((positionKey) => {
    const positionPlayers = rawPlayers.filter((player) => player.resolvedPosition === positionKey);
    const metrics = {};
    Object.keys(FOOTBALL_POSITION_WEIGHTS[positionKey]).forEach((metricKey) => {
      metrics[metricKey] = positionPlayers
        .map((player) => Number(player.metricFamilies?.[positionKey]?.[metricKey]))
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => right - left);
    });
    scales[positionKey] = metrics;
  });
  return scales;
}

function applyFootballRating(rawPlayer, scales, { includeLeagueAdjustment = true } = {}) {
  const positionKey = rawPlayer.resolvedPosition;
  const weights = FOOTBALL_POSITION_WEIGHTS[positionKey] || FOOTBALL_POSITION_WEIGHTS.ST;
  const positionScales = scales[positionKey] || {};
  const percentileMetrics = {};

  Object.keys(weights).forEach((metricKey) => {
    percentileMetrics[metricKey] = percentileRank(
      positionScales[metricKey] || [],
      Number(rawPlayer.metricFamilies?.[positionKey]?.[metricKey]),
      true,
    );
  });

  const basePositionalPercentile = weightedMetricAverage(percentileMetrics, weights);
  const leagueAdjPct = includeLeagueAdjustment
    ? clampNumber((Number(rawPlayer.leagueCompetitionWeight || 1) - 1.0) * 4, -2, 2)
    : 0;
  const teamAdjPct = clampNumber(((Number(rawPlayer.teamStrengthPct || 50) - 50) * 0.04), -2, 2);
  const minutesAdjPct = clampNumber(((Number(rawPlayer.minutesPct || 50) - 50) * 0.03), -1.5, 1.5);
  const recentAdjPct = clampNumber(((Number(rawPlayer.recentPct || 50) - basePositionalPercentile) * 0.10), -1.5, 1.5);
  const consistencyAdjPct = clampNumber(((Number(rawPlayer.consistencyPct || 50) - 50) * 0.03), -1, 1);
  const age = Number(rawPlayer.age || 0);
  const primeAdjPct =
    age >= 24 && age <= 29 ? 1.0 :
    (age >= 21 && age <= 23) || (age >= 30 && age <= 31) ? 0.4 :
    age >= 32 && age <= 33 ? -0.6 :
    age >= 34 ? -1.2 :
    0;

  const finalPercentile = clampNumber(
    basePositionalPercentile + leagueAdjPct + teamAdjPct + minutesAdjPct + recentAdjPct + consistencyAdjPct + primeAdjPct,
    1,
    99.95,
  );
  const rating = footballOverallFromPercentile(finalPercentile);
  const leaderSummary = rawPlayer.leaderEntries?.[0]
    ? `${rawPlayer.leaderEntries[0].label} #${rawPlayer.leaderEntries[0].rank}`
    : rawPlayer.profileSummary;

  return {
    ...rawPlayer,
    rating,
    tier: toTierLabel(rating),
    leaderSummary,
    basePositionalPercentile: Math.round(basePositionalPercentile * 10) / 10,
    finalPercentile: Math.round(finalPercentile * 10) / 10,
  };
}

async function getRawFootballPlayerCatalog(leagueKey) {
  const key = cacheKey('raw-players', leagueKey);
  const cached = readCache(key);
  if (cached) return cached;

  const [teams, standings, leaders] = await Promise.all([getTeams(leagueKey), getStandings(leagueKey), fetchLeaders(leagueKey)]);
  const standingMap = Object.fromEntries(standings.map((entry) => [entry.teamId, entry]));
  const teamMap = Object.fromEntries(teams.map((team) => [team.id, team]));
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
      const standing = standingMap[team.id] || { ...team, teamId: team.id };
      const teamContext = buildTeamPerformanceContext({ ...team, ...standing, id: team.id }, leagueKey);
      return parseRosterPlayers(payload, { ...team, ...standing }).map((player) =>
        extractFootballPlayerSignals(
          player,
          teamContext,
          (leaderMap.get(player.id) || []).sort((left, right) => left.rank - right.rank),
          leagueKey,
        ),
      );
    },
    3,
  );

  const rosterPlayers = uniqBy(rosters.flat().filter(Boolean), (player) => player.id);
  const leaderFallbackPlayers = uniqBy(
    leaders.map((leader) => {
      const baseTeam = standingMap[leader.teamId] || teamMap[leader.teamId] || null;
      const teamContext = buildTeamPerformanceContext({ ...(baseTeam || {}), id: leader.teamId }, leagueKey);
      const leaderEntries = (leaderMap.get(leader.athleteId) || []).sort((left, right) => left.rank - right.rank);
      return extractFootballPlayerSignals(
        {
          id: String(leader.athleteId),
          displayName: leader.athlete.displayName,
          shortName: leader.athlete.shortName,
          position: leader.athlete.position || 'F',
          headshot: resolveFootballHeadshot(leader.athleteId, leader.athlete.headshot),
          team: baseTeam,
          statistics: {},
          statFeed: [],
        },
        teamContext,
        leaderEntries,
        leagueKey,
      );
    }),
    (player) => player.id,
  );

  const players = uniqBy([...rosterPlayers, ...leaderFallbackPlayers], (player) => player.id);

  return writeCache(
    key,
    {
      league: leagueKey,
      players,
      lastUpdated: new Date().toISOString(),
    },
    6 * 60 * 60 * 1000,
  );
}

async function getFootballSharedPlayerRegistry() {
  const key = cacheKey('shared-player-registry', 'football');
  const cached = readCache(key);
  if (cached) return cached;

  const rawCatalogs = (await Promise.allSettled(
    CLUB_FOOTBALL_LEAGUES.map((leagueKey) => getRawFootballPlayerCatalog(leagueKey)),
  ))
    .filter((result) => result.status === 'fulfilled' && Array.isArray(result.value?.players))
    .map((result) => result.value);
  const rawPlayers = rawCatalogs.flatMap((catalog) => catalog.players || []);
  const scales = buildFootballMetricScales(rawPlayers);
  const rated = rawPlayers.map((player) => applyFootballRating(player, scales));
  const registry = {};

  rated.forEach((player) => {
    const existing = registry[player.id];
    if (!existing || Number(player.rating || 0) > Number(existing.rating || 0)) {
      registry[player.id] = {
        id: player.id,
        rating: player.rating,
        tier: player.tier,
        leaderSummary: player.leaderSummary,
        canonicalLeagueKey: player.leagueKey,
        canonicalTeamId: player.team?.id || player.teamContext?.teamId || '',
        canonicalTeamName: player.team?.displayName || player.team?.abbreviation || '',
        headshot: resolveFootballHeadshot(player.id, player.headshot, existing?.headshot),
        resolvedPosition: player.resolvedPosition,
        positionLabel: player.positionLabel,
        finalPercentile: player.finalPercentile,
      };
    }
  });

  return writeCache(key, { registry, scales }, 4 * 60 * 60 * 1000);
}

function mergeFootballPlayerCatalog(rawCatalog, registryData, leagueKey) {
  const localScales = buildFootballMetricScales(rawCatalog.players || []);
  const localRated = Object.fromEntries((rawCatalog.players || []).map((player) => [player.id, applyFootballRating(player, localScales, { includeLeagueAdjustment: true })]));
  const registry = registryData?.registry || {};

  const players = (rawCatalog.players || [])
    .map((player) => {
      const canonical = registry[player.id];
      const local = localRated[player.id];
      const chosen = canonical && leagueKey !== 'international-play'
        ? canonical
        : canonical && leagueKey === 'international-play'
          ? canonical
          : local;

      return {
        ...player,
        rating: chosen?.rating ?? local?.rating ?? 70,
        tier: chosen?.tier ?? local?.tier ?? 'average pro',
        leaderSummary: chosen?.leaderSummary ?? local?.leaderSummary ?? player.profileSummary,
        headshot: resolveFootballHeadshot(player.id, chosen?.headshot, player.headshot),
        resolvedPosition: chosen?.resolvedPosition || player.resolvedPosition,
        positionLabel: chosen?.positionLabel || player.positionLabel,
        competition: leagueMeta(leagueKey).label,
        canonicalLeagueKey: chosen?.canonicalLeagueKey || leagueKey,
        canonicalTeamId: chosen?.canonicalTeamId || player.team?.id || '',
        canonicalTeamName: chosen?.canonicalTeamName || player.team?.displayName || '',
      };
    })
    .sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0) || left.displayName.localeCompare(right.displayName))
    .map((player, index) => ({ ...player, rank: index + 1 }));

  return {
    league: leagueKey,
    players,
    lastUpdated: new Date().toISOString(),
    totalPlayers: players.length,
  };
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

  const [rawCatalog, registryData] = await Promise.all([
    getRawFootballPlayerCatalog(leagueKey),
    getFootballSharedPlayerRegistry(),
  ]);

  return writeCache(key, mergeFootballPlayerCatalog(rawCatalog, registryData, leagueKey), 6 * 60 * 60 * 1000);
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
  const goalkeeperImpactMap = players.reduce((map, player) => {
    if (player.resolvedPosition !== 'GK') return map;
    const teamId = String(player.team?.id || '');
    if (!teamId) return map;
    const best = map.get(teamId) || 0;
    map.set(teamId, Math.max(best, Number(player.rating || 0)));
    return map;
  }, new Map());

  function buildPredictorEntry(game, home, away) {
    if (!home || !away) return null;
    const homeLabel = game.home.abbreviation || home.abbreviation;
    const awayLabel = game.away.abbreviation || away.abbreviation;
    const homePlayerImpact = (playerImpactMap.get(String(home.id || game.home.teamId)) || []).sort((a, b) => b - a).slice(0, 5);
    const awayPlayerImpact = (playerImpactMap.get(String(away.id || game.away.teamId)) || []).sort((a, b) => b - a).slice(0, 5);
    const homeImpactBoost = homePlayerImpact.length ? safeAverage(homePlayerImpact) : 72;
    const awayImpactBoost = awayPlayerImpact.length ? safeAverage(awayPlayerImpact) : 72;
    const homeKeeperImpact = Number(goalkeeperImpactMap.get(String(home.id || game.home.teamId)) || 72);
    const awayKeeperImpact = Number(goalkeeperImpactMap.get(String(away.id || game.away.teamId)) || 72);
    const homeStrength =
      Number(home.globalScore || home.ovrScore || 72) +
      Number(home.offScore || 50) * 0.18 +
      Number(home.defScore || 50) * 0.10 +
      Number(home.clubPoints || home.standingPoints || 0) * 0.18 +
      (homeKeeperImpact - 72) * 0.22 +
      (homeImpactBoost - 72) * 0.45 +
      3.2;
    const awayStrength =
      Number(away.globalScore || away.ovrScore || 72) +
      Number(away.offScore || 50) * 0.18 +
      Number(away.defScore || 50) * 0.10 +
      Number(away.clubPoints || away.standingPoints || 0) * 0.18 +
      (awayKeeperImpact - 72) * 0.22 +
      (awayImpactBoost - 72) * 0.45;
    const diff = homeStrength - awayStrength;
    const homeWinProbability = Math.max(10, Math.min(90, Math.round((1 / (1 + Math.exp(-(diff / 10.5)))) * 100)));
    let projectedHomeScore = Math.max(0, Math.round(1.05 + ((Number(home.offScore || 50) - Number(away.defScore || 50)) / 28) + ((homeStrength - awayStrength) / 30)));
    let projectedAwayScore = Math.max(0, Math.round(0.95 + ((Number(away.offScore || 50) - Number(home.defScore || 50)) / 28) + ((awayStrength - homeStrength) / 30)));
    if (projectedHomeScore === projectedAwayScore) {
      if (homeWinProbability >= 50) projectedHomeScore += 1;
      else projectedAwayScore += 1;
    }
    const projectedMargin = projectedHomeScore - projectedAwayScore;
    const projectedTotal = projectedHomeScore + projectedAwayScore;
    const marketHomeProbability = moneylineToProbability(game.odds?.homeMoneyline);
    const marketEdge =
      Number.isFinite(marketHomeProbability) && marketHomeProbability !== null
        ? Number((homeWinProbability / 100 - marketHomeProbability).toFixed(3))
        : null;
    const attackDelta = Number(home.offScore || 50) - Number(away.offScore || 50);
    const defenseDelta = Number(home.defScore || 50) - Number(away.defScore || 50);
    const keeperDelta = homeKeeperImpact - awayKeeperImpact;
    const squadDelta = homeImpactBoost - awayImpactBoost;
    const formDelta = Number(home.recentScore || 50) - Number(away.recentScore || 50);
    const reasons = [
      Math.abs(attackDelta) >= 6 ? `${attackDelta > 0 ? homeLabel : awayLabel} attack edge` : null,
      Math.abs(defenseDelta) >= 6 ? `${defenseDelta > 0 ? homeLabel : awayLabel} defense edge` : null,
      Math.abs(keeperDelta) >= 3 ? `${keeperDelta > 0 ? homeLabel : awayLabel} keeper edge` : null,
      Math.abs(squadDelta) >= 4 ? `${squadDelta > 0 ? homeLabel : awayLabel} squad edge` : null,
      Math.abs(formDelta) >= 5 ? `${formDelta > 0 ? homeLabel : awayLabel} form edge` : null,
    ].filter(Boolean).slice(0, 3);
    const leaningHome = homeWinProbability >= 50;

    return {
      gameId: game.id,
      home: {
        teamId: String(home.id || game.home.teamId || ''),
        abbreviation: game.home.abbreviation || home.abbreviation,
        displayName: game.home.displayName || home.displayName,
      },
      away: {
        teamId: String(away.id || game.away.teamId || ''),
        abbreviation: game.away.abbreviation || away.abbreviation,
        displayName: game.away.displayName || away.displayName,
      },
      winner: leaningHome ? (game.home.displayName || home.displayName) : (game.away.displayName || away.displayName),
      homeWinProbability,
      awayWinProbability: Math.max(10, 100 - homeWinProbability),
      projectedHomeScore,
      projectedAwayScore,
      projectedMargin,
      projectedTotal,
      odds: game.odds || null,
      marketEdge,
      bettingLean: `${leaningHome ? (game.home.abbreviation || home.abbreviation) : (game.away.abbreviation || away.abbreviation)} model lean`,
      americanOdds: leaningHome ? game.odds?.homeMoneyline ?? null : game.odds?.awayMoneyline ?? null,
      explanation: [
        `${leaningHome ? (game.home.displayName || home.displayName) : (game.away.displayName || away.displayName)} grades as the stronger side by the live football model.`,
        `${home.displayName} OFF ${home.offScore} / DEF ${home.defScore} / ${home.clubPoints || home.standingPoints || 0} pts vs ${away.displayName} OFF ${away.offScore} / DEF ${away.defScore} / ${away.clubPoints || away.standingPoints || 0} pts.`,
      ],
      reasons,
      confidence: Math.abs(diff) > 12 || (marketEdge !== null && Math.abs(marketEdge) >= 0.08) ? 'High' : Math.abs(diff) > 6 ? 'Medium' : 'Lean',
    };
  }

  return scoreboard
    .filter((game) => game.home.teamId && game.away.teamId)
    .slice(0, 12)
    .map((game) => buildPredictorEntry(game, rankingMap[game.home.teamId], rankingMap[game.away.teamId]))
    .filter(Boolean)
    .sort((left, right) => {
      const leftEdge = Math.max(Math.abs(left.marketEdge || 0) * 100, Math.abs(left.projectedMargin || 0));
      const rightEdge = Math.max(Math.abs(right.marketEdge || 0) * 100, Math.abs(right.projectedMargin || 0));
      return rightEdge - leftEdge;
    });
}

async function getFootballPredictor({ leagueKey, homeTeamId = '', awayTeamId = '' }) {
  const bootstrap = await getFootballBootstrap(leagueKey);
  if (!homeTeamId || !awayTeamId) {
    return {
      league: leagueKey,
      predictors: bootstrap.predictors || [],
      rankings: bootstrap.rankings || [],
      lastUpdated: bootstrap.lastUpdated || new Date().toISOString(),
    };
  }

  const teams = bootstrap.rankings || [];
  const home = teams.find((team) => String(team.id) === String(homeTeamId));
  const away = teams.find((team) => String(team.id) === String(awayTeamId));
  if (!home || !away || home.id === away.id) {
    return {
      league: leagueKey,
      predictors: [],
      error: 'Valid clubs required',
      lastUpdated: bootstrap.lastUpdated || new Date().toISOString(),
    };
  }

  const syntheticGame = {
    id: `${leagueKey}-${home.id}-${away.id}`,
    home: { teamId: String(home.id), abbreviation: home.abbreviation, displayName: home.displayName },
    away: { teamId: String(away.id), abbreviation: away.abbreviation, displayName: away.displayName },
    odds: null,
  };
  const custom = buildPredictors([syntheticGame], teams, leagueKey, bootstrap.playersCatalog?.players || [])[0];
  return {
    league: leagueKey,
    predictors: custom ? [custom] : [],
    rankings: teams,
    lastUpdated: bootstrap.lastUpdated || new Date().toISOString(),
  };
}

async function getFootballBootstrap(leagueKey) {
  const [scoreboardResult, rankingsResult, newsResult, brandResult, playersCatalogResult] = await Promise.allSettled([
    fetchScoreboard(leagueKey),
    computeRankings(leagueKey),
    fetchNews(leagueKey),
    getLeagueBrand(leagueKey),
    getBootstrapPlayersCatalog(leagueKey),
  ]);

  const scoreboard = scoreboardResult.status === 'fulfilled' ? scoreboardResult.value : [];
  const rankings = rankingsResult.status === 'fulfilled' ? rankingsResult.value : [];
  const news = newsResult.status === 'fulfilled' ? newsResult.value : [];
  const brand = brandResult.status === 'fulfilled'
    ? brandResult.value
    : {
        ...leagueMeta(leagueKey),
        logo: '',
        season: '',
      };
  const playersCatalog = playersCatalogResult.status === 'fulfilled'
    ? playersCatalogResult.value
    : emptyFootballPlayerCatalog(leagueKey);

  const featuredPlayers = (playersCatalog.players || []).slice(0, 12);
  const sideLabel = leagueKey === 'international-play' ? 'national sides' : 'clubs';

  return {
    league: brand,
    headline: `${brand.label} is tracking live fixtures, ${sideLabel}, player impact, and match edges inside Composite Football.`,
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
      clubCountLabel: `${rankings.length || 0} ${sideLabel}`,
      playerCountLabel: `${playersCatalog.players?.length || 0} players tracked`,
    },
    lastUpdated: new Date().toISOString(),
  };
}

function buildFootballPlayerStatSections(player, statFeed = []) {
  const resolvedPosition = player.resolvedPosition || getFootballResolvedPosition(player.position);
  const allStats = Array.isArray(statFeed) ? statFeed : [];
  const filtered = resolvedPosition === 'GK'
    ? allStats.filter((stat) => ['goal keeping', 'general'].includes(String(stat.group || '').toLowerCase()))
    : allStats.filter((stat) => String(stat.group || '').toLowerCase() !== 'goal keeping');

  const coreStats = resolvedPosition === 'GK'
    ? [
        { label: 'Saves', value: player.metrics?.saves ?? 0 },
        { label: 'Goals Against', value: player.metrics?.goalsConceded ?? 0 },
        { label: 'Shots Faced', value: player.metrics?.shotsFaced ?? 0 },
        { label: 'Appearances', value: player.metrics?.appearances ?? 0 },
      ]
    : [
        { label: 'Goals', value: player.metrics?.goals ?? 0 },
        { label: 'Assists', value: player.metrics?.assists ?? 0 },
        { label: 'Shots', value: player.metrics?.shots ?? 0 },
        { label: 'Shots On Target', value: player.metrics?.shotsOnTarget ?? 0 },
        { label: 'Appearances', value: player.metrics?.appearances ?? 0 },
      ];

  return [
    { title: 'Role Summary', stats: coreStats },
    { title: 'Stat Feed', stats: filtered.slice(0, 12).map((stat) => ({ label: stat.label, value: stat.value, group: stat.group })) },
  ];
}

function buildFootballPlayerAnalysis(player, leagueKey) {
  const label = footballPositionLabel(player.position);
  if (player.resolvedPosition === 'GK') {
    return `${player.displayName} grades ${player.rating} OVR as a ${label.toLowerCase()} in ${leagueMeta(leagueKey).label}, driven by shot stopping, goals prevented, and match-to-match reliability. ${player.leaderSummary || player.profileSummary}.`;
  }
  return `${player.displayName} grades ${player.rating} OVR as a ${label.toLowerCase()} in ${leagueMeta(leagueKey).label}, built from position-adjusted production, club context, and live form without overrating reputation alone. ${player.leaderSummary || player.profileSummary}.`;
}

function filterClubNews(stories, team) {
  const teamName = String(team?.displayName || '').toLowerCase();
  const shortName = String(team?.shortDisplayName || '').toLowerCase();
  const abbreviation = String(team?.abbreviation || '').toLowerCase();
  const keywords = [teamName, shortName, abbreviation].filter(Boolean);
  if (!keywords.length) return (stories || []).slice(0, 4);
  const filtered = (stories || []).filter((story) => {
    const haystack = [story.headline, story.description, story.body]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return keywords.some((keyword) => keyword.length > 2 && haystack.includes(keyword));
  });
  return (filtered.length ? filtered : stories || []).slice(0, 4);
}

function extractFootballTimeline(summary) {
  const entries = [];
  walk(summary, (node) => {
    if (!node || typeof node !== 'object') return;
    const text = node.text || node.shortText || node.headline || node.displayText || '';
    if (!text || typeof text !== 'string') return;
    if (!/goal|penalty|red card|yellow card|substitution|half|full time|kickoff/i.test(text)) return;
    const minute = node.clock?.displayValue || node.clock || node.time || '';
    entries.push({
      minute: String(minute || '').trim(),
      text: text.trim(),
      type: /goal/i.test(text) ? 'goal' : /penalty/i.test(text) ? 'penalty' : /red card/i.test(text) ? 'card' : 'note',
    });
  });
  return uniqBy(entries, (entry) => `${entry.minute}:${entry.text}`).slice(0, 18);
}

function extractFootballBoxScore(summary, game) {
  const rows = [];
  const teamStats = summary?.boxscore?.teams || summary?.statistics || [];
  teamStats.forEach((teamBlock) => {
    const label = teamBlock.displayName || teamBlock.team?.displayName || '';
    (teamBlock.statistics || teamBlock.stats || []).forEach((stat) => {
      if (!stat?.displayName && !stat?.name) return;
      rows.push({
        team: label,
        label: stat.displayName || stat.name,
        value: stat.displayValue || stat.value || '0',
      });
    });
  });
  if (!rows.length) {
    return [
      { team: game.away.displayName, label: 'Goals', value: game.away.score },
      { team: game.home.displayName, label: 'Goals', value: game.home.score },
    ];
  }
  return rows.slice(0, 20);
}

function extractFootballManOfTheMatch(summary, game) {
  const leaderCandidates = [];
  walk(summary, (node) => {
    if (node?.athlete?.displayName && (node.displayValue || node.value || node.rank)) {
      leaderCandidates.push({
        displayName: node.athlete.displayName,
        shortName: node.athlete.shortName || node.athlete.displayName,
        headshot: resolveFootballHeadshot(node.athlete.id, node.athlete.headshot?.href, node.athlete.headshot),
        note: `${node.name || node.displayName || 'Match leader'} ${node.displayValue || node.value || ''}`.trim(),
      });
    }
  });
  if (leaderCandidates.length) return leaderCandidates[0];
  return {
    displayName: game.home.winner ? game.home.displayName : game.away.displayName,
    shortName: game.home.winner ? game.home.abbreviation : game.away.abbreviation,
    headshot: '',
    note: 'Match-defining performance',
  };
}

async function getPlayerDetail(leagueKey, playerId) {
  const [catalog, stats] = await Promise.all([getPlayerCatalog(leagueKey), fetchAthleteStats(leagueKey, playerId)]);
  const player = catalog.players.find((entry) => entry.id === String(playerId));
  if (!player) {
    throw new Error('Player not found');
  }

  return {
    league: leagueKey,
    player,
    resolvedPosition: player.resolvedPosition || getFootballResolvedPosition(player.position),
    stats,
    statSections: buildFootballPlayerStatSections(player, stats),
    analysis: buildFootballPlayerAnalysis(player, leagueKey),
    lastUpdated: new Date().toISOString(),
  };
}

async function getTeamDetail(leagueKey, teamId) {
  const [rankings, playersCatalog, schedulePayload, bootstrap] = await Promise.all([
    computeRankings(leagueKey),
    getPlayerCatalog(leagueKey),
    fetchTeamSchedule(leagueKey, teamId),
    getFootballBootstrap(leagueKey),
  ]);

  const team = rankings.find((entry) => entry.id === String(teamId));
  if (!team) {
    throw new Error('Club not found');
  }

  const roster = playersCatalog.players.filter((player) => player.team.id === String(teamId));
  const recent = summarizeScheduleResults(schedulePayload, teamId);

  return {
    league: leagueKey,
    team,
    roster,
    recent: recent.recentResults,
    clubNews: filterClubNews(bootstrap.news || [], team),
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
      timeline: extractFootballTimeline(summary),
      keyMoments: extractFootballTimeline(summary).filter((entry) => entry.type === 'goal' || entry.type === 'penalty').slice(0, 8),
      boxScore: extractFootballBoxScore(summary, game),
      manOfTheMatch: extractFootballManOfTheMatch(summary, game),
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
      timeline: [],
      keyMoments: [],
      boxScore: [
        { team: game.away.displayName, label: 'Goals', value: game.away.score },
        { team: game.home.displayName, label: 'Goals', value: game.home.score },
      ],
      manOfTheMatch: {
        displayName: game.home.winner ? game.home.displayName : game.away.displayName,
        shortName: game.home.winner ? game.home.abbreviation : game.away.abbreviation,
        headshot: '',
        note: 'Match-defining performance',
      },
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
  const leagueKeys = FOOTBALL_ROUTE_ORDER;
  const leagueData = (await Promise.allSettled(
    leagueKeys.map(async (leagueKey) => {
      const [brand, rankings, scoreboard] = await Promise.all([
        getLeagueBrand(leagueKey),
        computeRankings(leagueKey),
        fetchScoreboard(leagueKey),
      ]);
      return { leagueKey, brand, rankings, scoreboard, playersCatalog: getCachedPlayerCatalog(leagueKey) };
    }),
  ))
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

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
        leagueKey: player.canonicalLeagueKey || leagueKey,
        leagueLabel: FOOTBALL_LEAGUES[player.canonicalLeagueKey || leagueKey]?.label || brand.label,
      })),
    )
    .sort((left, right) =>
      Number(right.rating || 0) - Number(left.rating || 0) ||
      getFootballLeagueOrderIndex(left.canonicalLeagueKey || left.leagueKey) - getFootballLeagueOrderIndex(right.canonicalLeagueKey || right.leagueKey) ||
      left.displayName.localeCompare(right.displayName)
    )
    .reduce((list, player) => {
      if (list.some((entry) => String(entry.id) === String(player.id))) return list;
      const clubKey = String(player.canonicalTeamId || player.team?.id || '');
      if (clubKey && list.some((entry) => String(entry.canonicalTeamId || entry.team?.id || '') === clubKey)) return list;
      const leagueKey = String(player.canonicalLeagueKey || player.leagueKey || '');
      if (leagueKey && list.some((entry) => String(entry.canonicalLeagueKey || entry.leagueKey || '') === leagueKey)) return list;
      list.push(player);
      return list;
    }, [])
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
        const nameStack = `${game.name || ''} ${game.shortName || ''} ${game.statusLabel || ''}`.toLowerCase();
        const isWorldCupMatch = leagueKey === 'international-play' && WORLD_CUP_MARKERS.some((marker) => nameStack.includes(marker));
        const matchScore = brand.competitionWeight * 40 + power * 0.55 + stateBoost + timeProximityBoost(game.startTime) + (isWorldCupMatch ? 42 : 0);

        return {
          ...game,
          leagueKey,
          leagueLabel: brand.label,
          leagueLogo: brand.logo,
          isWorldCupMatch,
          matchScore,
          projectedHeadline: `${game.away.abbreviation} at ${game.home.abbreviation}`,
        };
      });
    })
    .sort((left, right) => {
      if (left.isWorldCupMatch && !right.isWorldCupMatch) return -1;
      if (right.isWorldCupMatch && !left.isWorldCupMatch) return 1;
      if (right.matchScore !== left.matchScore) return right.matchScore - left.matchScore;
      return compareByStartTime(left.startTime, right.startTime);
    })
    .slice(0, 3);

  return {
    title: 'Composite Football',
    subtitle: 'Step through the tunnel, scan the biggest matches of the day, and move between elite club football and international play from one global football hub.',
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
  getFootballPredictor,
  getTeamDetail as getFootballTeamDetail,
  getGameDetail as getFootballGameDetail,
  getFootballLanding,
  getFeaturedPlayers as getFootballFeaturedPlayers,
  computeRankings as computeFootballRankings,
};
