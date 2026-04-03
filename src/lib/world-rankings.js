import {
  computeTopPlayers,
  getCachedTopPlayers,
  getStaleTopPlayers,
} from '@/src/mlb/lib/topPlayers';
import { FOOTBALL_LEAGUES } from '@/src/lib/football';
import { getFootballLeagueSnapshot, getGenericSportSnapshot } from '@/src/lib/live-sports-backend';
import { getNbaBootstrapSnapshot } from '@/src/lib/nba-backend';
import { getHotSnapshot } from '@/src/lib/snapshot-store';

const CACHE = new Map();

const SOURCE_WEIGHTS = {
  mlb: 1.18,
  nba: 1.24,
  nhl: 1.2,
  nfl: 1.14,
  cbb: 0.96,
  football: 1.12,
};

const DIVERSITY_SPORTS = ['nba', 'nhl', 'football'];

function settledValue(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cacheKey(scope) {
  return `world:${scope}`;
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

async function fetchJson(url, ttlMs = 30 * 60 * 1000) {
  const key = cacheKey(url);
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

function parseStandings(payload) {
  const entries = [];
  walk(payload, (node) => {
    if (node?.team?.id && Array.isArray(node?.stats)) {
      const statMap = {};
      node.stats.forEach((stat) => {
        if (stat.name) statMap[stat.name.toLowerCase()] = stat.value ?? stat.displayValue ?? 0;
        if (stat.abbreviation) statMap[stat.abbreviation.toLowerCase()] = stat.value ?? stat.displayValue ?? 0;
      });
      entries.push({
        teamId: String(node.team.id),
        winPct: Number(statMap.winpercent || statMap.winningpercentage || 0),
      });
    }
  });
  return Object.fromEntries(entries.map((entry) => [entry.teamId, entry]));
}

async function fetchLeagueLeaders({ site }) {
  const payload = await fetchJson(`${site}/leaders`, 60 * 60 * 1000);
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
        teamLogo: node.team?.logo || node.team?.logos?.[0]?.href || '',
      });
    }
  });
  return uniqBy(leaders, (entry) => `${entry.athleteId}:${entry.label}`);
}

function positionDifficulty(position = '') {
  const pos = String(position).toUpperCase();
  if (['QB', 'PG', 'C', 'GK', 'SP', 'G'].includes(pos)) return 1;
  if (['CF', 'ST', 'LW', 'RW', 'CAM', 'CM', 'WR', 'RB', 'PF', 'SG', '1B', 'RF', 'LF'].includes(pos)) return 0.84;
  if (['D', 'DF', 'CB', 'LB', 'RB', 'TE', 'SF', '3B', 'SS', 'CDM', 'DM'].includes(pos)) return 0.76;
  return 0.68;
}

async function getMlbTopPlayersSnapshot(limit = 50) {
  const snapshot = await getHotSnapshot(
    'hub-mlb-top-players',
    async () => {
      const cached = getCachedTopPlayers(50);
      if (cached) return cached;

      const stale = getStaleTopPlayers();
      if (stale) return stale;

      return computeTopPlayers(Math.max(limit, 50));
    },
    { ttlMs: 15 * 60 * 1000 },
  );

  return snapshot?.players ? snapshot : { players: [], totalPlayers: 0, lastUpdated: null };
}

function computeNbaSiteOverall(player) {
  const stats = player?.realStats;
  if (!stats?.gp) return 69;

  const baseline = stats?.lastSeason?.gp ? stats.lastSeason : (stats?.career?.gp ? stats.career : null);
  const baselineOverall = baseline
    ? clamp(
        64 +
          (Number(baseline.ppg || 0) * 0.7) +
          (Number(baseline.apg || 0) * 1.15) +
          (Number(baseline.rpg || 0) * 0.62) +
          ((Number(baseline.spg || 0) + Number(baseline.bpg || 0)) * 2.2) +
          ((Number(baseline.tsPct || 55) - 55) * 0.32),
        62,
        93,
      )
    : null;

  const creation = (Number(stats.ppg || 0) * 0.86) + (Number(stats.apg || 0) * 1.32) + (Number(stats.rpg || 0) * 0.58);
  const disruption = (Number(stats.spg || 0) * 3.6) + (Number(stats.bpg || 0) * 3.4);
  const efficiency = ((Number(stats.tsPct || 55) - 55) * 0.44) + ((Number(stats.efgPct || 52) - 52) * 0.18);
  const load = Math.min(6.8, (Number(stats.mpg || 0) - 18) * 0.22);
  const advanced = ((Number(stats.per || 15) - 15) * 0.36) + (Number(stats.vorp || 0) * 1.15);
  const ballSecurity = (Number(stats.astTovRatio || 0) - 1.5) * 1.6;
  const currentOverall = 63 + creation + disruption + efficiency + load + advanced + ballSecurity;
  const trustedOverall = baselineOverall == null
    ? currentOverall
    : (currentOverall * 0.74) + (baselineOverall * 0.26);

  return clamp(Math.round(trustedOverall * 10) / 10, 64, 97.6);
}

async function getNBACandidates() {
  const snapshot = await getNbaBootstrapSnapshot();
  return (snapshot?.playerCatalog || [])
    .filter((player) => player?.displayName && player?.headshot)
    .map((player) => {
      const overall = computeNbaSiteOverall(player);
      const trend = clamp(
        ((Number(player.realStats?.ppg || 0) - Number(player.realStats?.lastSeason?.ppg || 0)) * 0.7) +
          ((Number(player.realStats?.tsPct || 55) - Number(player.realStats?.lastSeason?.tsPct || 55)) * 0.16),
        -4,
        8,
      );
      return {
        id: `nba-${player.id}`,
        playerId: String(player.id),
        displayName: player.displayName,
        headshot: player.headshot,
        position: player.position || 'NBA',
        leagueLabel: 'NBA',
        sportKey: 'nba',
        leagueKey: 'nba',
        overall,
        overallLabel: overall.toFixed(1),
        signalCount: player.hasOfficialStats ? 3 : 1,
        contextScore: clamp(62 + trend * 4, 48, 94),
        formScore: clamp(60 + trend * 5, 48, 96),
        teamAbbr: player.teamAbbr || '',
      };
    })
    .sort((left, right) => right.overall - left.overall)
    .slice(0, 18);
}

async function getNHLCandidates() {
  const site = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl';
  const [leaders, standingsPayload] = await Promise.all([
    fetchLeagueLeaders({ site }),
    fetchJson(`${site}/standings`, 30 * 60 * 1000),
  ]);
  const standings = parseStandings(standingsPayload);
  const categoryWeights = {
    points: 16,
    goals: 14,
    assists: 12,
    'save percentage': 14,
    'save pct': 14,
    'goals against average': 12,
    gaa: 12,
    wins: 10,
    shutouts: 8,
    'plus minus': 8,
    hits: 7,
    'blocked shots': 7,
    shots: 8,
  };

  const bucket = new Map();
  leaders.forEach((entry) => {
    const current = bucket.get(entry.athleteId) || {
      athleteId: entry.athleteId,
      displayName: entry.athlete.displayName,
      headshot: entry.athlete.headshot || '',
      position: entry.athlete.position || 'NHL',
      teamId: entry.teamId,
      teamLogo: entry.teamLogo || '',
      categories: [],
      provisionalScore: 0,
    };

    const weightKey = String(entry.label || '')
      .toLowerCase()
      .replace(/[%]/g, ' pct')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const weight = categoryWeights[weightKey] || 6;
    current.provisionalScore += Math.max(0, 18 - Number(entry.rank || 18)) * weight;
    current.categories.push(entry);
    bucket.set(entry.athleteId, current);
  });

  return Array.from(bucket.values())
    .map((entry) => {
      const teamBoost = (standings[entry.teamId]?.winPct || 0.5) * 10;
      const overall = clamp(
        Math.round(58 + entry.provisionalScore / 18 + teamBoost),
        55,
        99,
      );
      const bestRank = Math.min(...entry.categories.map((category) => Number(category.rank || 18)));
      return {
        id: `nhl-${entry.athleteId}`,
        playerId: entry.athleteId,
        displayName: entry.displayName,
        headshot: entry.headshot || entry.teamLogo || '',
        position: entry.position,
        leagueLabel: 'NHL',
        sportKey: 'nhl',
        leagueKey: 'nhl',
        overall,
        overallLabel: String(overall),
        signalCount: Math.max(1, Math.min(3, entry.categories.length)),
        contextScore: clamp(56 + teamBoost * 0.9, 46, 92),
        formScore: clamp(94 - (bestRank - 1) * 3.2, 44, 96),
        teamLogo: entry.teamLogo || '',
      };
    })
    .sort((left, right) => right.overall - left.overall)
    .slice(0, 14);
}

function buildHubHref(candidate) {
  if (candidate.sportKey === 'mlb') {
    return `/mlb?player=${encodeURIComponent(candidate.playerId)}&from=hub`;
  }
  if (candidate.sportKey === 'nba') {
    return `/nba?view=player&id=${encodeURIComponent(candidate.playerId)}&from=hub`;
  }
  if (candidate.sportKey === 'nhl') {
    return `/nhl?view=player&id=${encodeURIComponent(candidate.playerId)}&from=hub`;
  }
  if (candidate.sportKey === 'football') {
    return `/football/${candidate.leagueKey}?player=${encodeURIComponent(candidate.playerId)}&from=hub`;
  }
  return `/${candidate.sportKey}?player=${encodeURIComponent(candidate.playerId)}&from=hub`;
}

function normalizeSourceCandidates(candidates, sourceWeight) {
  const sorted = [...candidates].sort((left, right) => right.overall - left.overall);
  return sorted.map((candidate, index) => {
    const next = sorted[index + 1];
    const percentile = sorted.length === 1 ? 1 : 1 - index / Math.max(1, sorted.length - 1);
    const separation = Math.max(0, Number(candidate.overall || 0) - Number(next?.overall ?? (candidate.overall || 0) - 1.5));
    const role = positionDifficulty(candidate.position);
    const reliability = clamp(0.46 + (candidate.signalCount || 1) * 0.12, 0.48, 0.94);
    const form = clamp(Number(candidate.formScore || candidate.overall || 70) / 100, 0.4, 1);
    const context = clamp(Number(candidate.contextScore || candidate.overall || 70) / 100, 0.4, 1);
    const worldScore =
      (Number(candidate.overall || 0) * 0.48) +
      (percentile * 24) +
      Math.min(18, separation * 3.1) +
      (role * 8) +
      (reliability * 8) +
      (form * 9) +
      (context * 5) +
      (sourceWeight * 5);

    return {
      ...candidate,
      sourcePercentile: percentile,
      normalizedDominance: Math.round(worldScore * 10) / 10,
      href: buildHubHref(candidate),
    };
  });
}

function includeDiversityPicks(sorted) {
  const selected = [];
  const selectedIds = new Set();

  function pushCandidate(candidate) {
    if (!candidate || selectedIds.has(candidate.id) || selected.length >= 5) return;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }

  const topScore = sorted[0]?.normalizedDominance || 0;
  DIVERSITY_SPORTS.forEach((sportKey) => {
    const candidate = sorted.find((entry) => entry.sportKey === sportKey);
    if (candidate && candidate.normalizedDominance >= Math.max(84, topScore - 12)) {
      pushCandidate(candidate);
    }
  });

  sorted.forEach((candidate) => pushCandidate(candidate));
  return selected.slice(0, 5);
}

async function getHubCandidates() {
  const footballLeagueKeys = Object.keys(FOOTBALL_LEAGUES);
  const [mlbResult, nflResult, cbbResult, nbaResult, nhlResult, ...footballResults] = await Promise.allSettled([
    getMlbTopPlayersSnapshot(50),
    getGenericSportSnapshot('nfl'),
    getGenericSportSnapshot('cbb'),
    getNBACandidates(),
    getNHLCandidates(),
    ...footballLeagueKeys.map((leagueKey) => getFootballLeagueSnapshot(leagueKey)),
  ]);

  const mlb = settledValue(mlbResult, { players: [] });
  const nfl = settledValue(nflResult, { featuredPlayers: [] });
  const cbb = settledValue(cbbResult, { featuredPlayers: [] });
  const nba = settledValue(nbaResult, []);
  const nhl = settledValue(nhlResult, []);
  const footballBoards = footballResults
    .map((result, index) => ({
      result,
      leagueKey: footballLeagueKeys[index],
    }))
    .filter(({ result }) => result.status === 'fulfilled')
    .map(({ result, leagueKey }) => ({
      leagueKey,
      board: result.value,
    }));

  const mlbCandidates = (mlb.players || []).slice(0, 12).map((player) => ({
    id: `mlb-${player.id}`,
    playerId: String(player.id),
    displayName: player.name || player.displayName,
    headshot: player.headshot || player.teamLogo || '',
    position: player.position || 'MLB',
    leagueLabel: 'MLB',
    sportKey: 'mlb',
    leagueKey: 'mlb',
    overall: Number(player.rating || 75),
    overallLabel: String(Number(player.rating || 75)),
    signalCount: player.isTwoWay ? 3 : 2,
    contextScore: clamp(Number(player.rating || 75) + (player.isTwoWay ? 4 : 0), 50, 99),
    formScore: clamp(Number(player.rating || 75) + (player.rank <= 5 ? 4 : 0), 50, 99),
    teamAbbr: player.teamAbbr || '',
    teamLogo: player.teamLogo || '',
  }));

  const genericCandidates = (board, sportKey, leagueLabel) =>
    (board.featuredPlayers || []).slice(0, 12).map((player, index) => ({
      id: `${sportKey}-${player.id}`,
      playerId: String(player.id),
      displayName: player.displayName,
      headshot: player.headshot || player.team?.logo || '',
      position: player.position || leagueLabel,
      leagueLabel,
      sportKey,
      leagueKey: sportKey,
      overall: Number(player.rating || 72),
      overallLabel: String(Number(player.rating || 72)),
      signalCount: (player.leaders || []).length ? 2 : 1,
      contextScore: clamp(Number(player.rating || 72) + Math.max(0, 6 - index), 48, 96),
      formScore: clamp(Number(player.rating || 72) + (String(player.tier || '').toLowerCase().includes('elite') ? 4 : 0), 48, 96),
      teamAbbr: player.team?.abbreviation || '',
      teamLogo: player.team?.logo || '',
    }));

  const footballCandidates = footballBoards.flatMap(({ leagueKey, board }) => {
    const league = FOOTBALL_LEAGUES[leagueKey];
    return (board?.featuredPlayers || []).slice(0, 8).map((player, index) => ({
      id: `${leagueKey}-${player.id}`,
      playerId: String(player.id),
      displayName: player.displayName,
      headshot: player.headshot || player.team?.logo || '',
      position: player.position || 'Football',
      leagueLabel: league.label,
      sportKey: 'football',
      leagueKey,
      overall: Number(player.rating || 72),
      overallLabel: String(Number(player.rating || 72)),
      signalCount: (player.leaders || []).length ? 2 : 1,
      contextScore: clamp(
        Number(player.rating || 72) +
          ((league.competitionWeight || 1) * 4.8) +
          Math.max(0, 4 - index),
        48,
        96,
      ),
      formScore: clamp(Number(player.rating || 72) + Math.max(0, 5 - index), 48, 96),
      teamAbbr: player.team?.abbreviation || '',
      teamLogo: player.team?.logo || '',
    }));
  });

  return {
    mlb: mlbCandidates,
    nfl: genericCandidates(nfl, 'nfl', 'NFL'),
    cbb: genericCandidates(cbb, 'cbb', 'CBB'),
    nba,
    nhl,
    football: footballCandidates,
  };
}

export async function getWorldTopPlayers() {
  const key = cacheKey('top-players');
  const cached = readCache(key);
  if (cached) return cached;

  const sourcePools = await getHubCandidates();
  const footballByLeague = Array.from(
    sourcePools.football.reduce((map, candidate) => {
      const groupKey = candidate.leagueKey;
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey).push(candidate);
      return map;
    }, new Map()).values(),
  );

  const normalized = [
    ...normalizeSourceCandidates(sourcePools.mlb, SOURCE_WEIGHTS.mlb),
    ...normalizeSourceCandidates(sourcePools.nba, SOURCE_WEIGHTS.nba),
    ...normalizeSourceCandidates(sourcePools.nhl, SOURCE_WEIGHTS.nhl),
    ...normalizeSourceCandidates(sourcePools.nfl, SOURCE_WEIGHTS.nfl),
    ...normalizeSourceCandidates(sourcePools.cbb, SOURCE_WEIGHTS.cbb),
    ...footballByLeague.flatMap((pool) => normalizeSourceCandidates(pool, SOURCE_WEIGHTS.football + ((FOOTBALL_LEAGUES[pool[0]?.leagueKey]?.competitionWeight || 1) * 0.08))),
  ];

  const players = includeDiversityPicks(
    uniqBy(normalized, (entry) => entry.id)
      .sort(
        (left, right) =>
          right.normalizedDominance - left.normalizedDominance ||
          Number(right.overall || 0) - Number(left.overall || 0),
      ),
  ).map((player, index) => ({
    ...player,
    worldRank: index + 1,
  }));

  return writeCache(
    key,
    {
      players,
      lastUpdated: new Date().toISOString(),
    },
    15 * 60 * 1000,
  );
}
