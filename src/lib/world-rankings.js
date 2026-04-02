import { computeTopPlayers } from '@/src/mlb/lib/topPlayers';
import { FOOTBALL_LEAGUES } from '@/src/lib/football';
import { getFootballLeagueSnapshot, getGenericSportSnapshot } from '@/src/lib/live-sports-backend';

const CACHE = new Map();

const SOURCE_WEIGHTS = {
  mlb: 1.2,
  nba: 1.24,
  nhl: 1.18,
  nfl: 1.22,
  cbb: 0.96,
};

function settledValue(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
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
      });
    }
  });
  return uniqBy(leaders, (entry) => `${entry.athleteId}:${entry.label}`);
}

function positionDifficulty(position = '') {
  const pos = String(position).toUpperCase();
  if (['QB', 'PG', 'C', 'GK', 'SP', 'G'].includes(pos)) return 1;
  if (['CF', 'ST', 'C', 'RW', 'LW', 'WR', 'RB', 'PF', 'SG'].includes(pos)) return 0.82;
  if (['D', 'DF', 'CB', 'LB', 'RB', 'TE', 'SF', '3B', 'SS'].includes(pos)) return 0.74;
  return 0.66;
}

function normalizeSourceCandidates(candidates, sourceWeight) {
  const sorted = [...candidates].sort((left, right) => right.rating - left.rating);
  return sorted.map((candidate, index) => {
    const next = sorted[index + 1];
    const percentile = sorted.length === 1 ? 1 : 1 - index / Math.max(1, sorted.length - 1);
    const separation = Math.max(0, candidate.rating - (next?.rating || candidate.rating - 2));
    const role = positionDifficulty(candidate.position);
    const reliability = Math.min(1, 0.42 + (candidate.signalCount || 1) * 0.12);
    const predictive = Math.min(1, 0.5 + Math.min(20, separation) / 32);
    const dominanceScore =
      percentile * 42 +
      Math.min(18, separation * 2.4) +
      role * 14 +
      reliability * 12 +
      predictive * 12 +
      sourceWeight * 8;
    const overall = Math.max(80, Math.min(99, Math.round(78 + dominanceScore / 3.2)));

    return {
      ...candidate,
      sourcePercentile: percentile,
      normalizedDominance: Math.round(dominanceScore * 10) / 10,
      overall,
    };
  });
}

async function getNBACandidates() {
  const site = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
  const [leaders, standingsPayload] = await Promise.all([
    fetchLeagueLeaders({ site }),
    fetchJson(`${site}/standings`, 30 * 60 * 1000),
  ]);
  const standings = parseStandings(standingsPayload);
  return uniqBy(
    leaders.map((entry) => {
      const teamBoost = (standings[entry.teamId]?.winPct || 0.5) * 16;
      const base = 86 - (entry.rank - 1) * 1.65 + teamBoost + positionDifficulty(entry.athlete.position) * 6;
      return {
        id: `nba-${entry.athleteId}`,
        playerId: entry.athleteId,
        displayName: entry.athlete.displayName,
        headshot: entry.athlete.headshot,
        position: entry.athlete.position || 'NBA',
        leagueLabel: 'NBA',
        sourceKey: 'nba',
        rating: Math.max(68, Math.min(98, Math.round(base))),
        signalCount: 1,
      };
    }),
    (entry) => entry.id,
  )
    .sort((left, right) => right.rating - left.rating)
    .slice(0, 12);
}

async function getNHLCandidates() {
  const site = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl';
  const [leaders, standingsPayload] = await Promise.all([
    fetchLeagueLeaders({ site }),
    fetchJson(`${site}/standings`, 30 * 60 * 1000),
  ]);
  const standings = parseStandings(standingsPayload);
  return uniqBy(
    leaders.map((entry) => {
      const teamBoost = (standings[entry.teamId]?.winPct || 0.5) * 14;
      const base = 85 - (entry.rank - 1) * 1.55 + teamBoost + positionDifficulty(entry.athlete.position) * 5.4;
      return {
        id: `nhl-${entry.athleteId}`,
        playerId: entry.athleteId,
        displayName: entry.athlete.displayName,
        headshot: entry.athlete.headshot,
        position: entry.athlete.position || 'NHL',
        leagueLabel: 'NHL',
        sourceKey: 'nhl',
        rating: Math.max(66, Math.min(98, Math.round(base))),
        signalCount: 1,
      };
    }),
    (entry) => entry.id,
  )
    .sort((left, right) => right.rating - left.rating)
    .slice(0, 12);
}

async function getHubCandidates() {
  const footballLeagueKeys = Object.keys(FOOTBALL_LEAGUES);
  const [mlbResult, nflResult, cbbResult, nbaResult, nhlResult, ...footballResults] = await Promise.allSettled([
    computeTopPlayers(12),
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

  const mlbCandidates = (mlb.players || []).slice(0, 10).map((player) => ({
    id: `mlb-${player.id}`,
    playerId: String(player.id),
    displayName: player.name || player.displayName,
    headshot: player.headshot,
    position: player.position || 'MLB',
    leagueLabel: 'MLB',
    sourceKey: 'mlb',
    rating: Number(player.rating || 75),
    signalCount: player.isTwoWay ? 3 : 2,
  }));

  const genericCandidates = (board, sourceKey, leagueLabel) =>
    (board.featuredPlayers || []).slice(0, 10).map((player) => ({
      id: `${sourceKey}-${player.id}`,
      playerId: String(player.id),
      displayName: player.displayName,
      headshot: player.headshot,
      position: player.position || leagueLabel,
      leagueLabel,
      sourceKey,
      rating: Number(player.rating || 72),
      signalCount: 1,
    }));

  const footballCandidates = footballBoards.flatMap(({ leagueKey, board }) => {
    const league = FOOTBALL_LEAGUES[leagueKey];
    return (board?.featuredPlayers || []).slice(0, 6).map((player) => ({
      id: `${leagueKey}-${player.id}`,
      playerId: String(player.id),
      displayName: player.displayName,
      headshot: player.headshot,
      position: player.position || 'Football',
      leagueLabel: league.label,
      sourceKey: leagueKey,
      rating: Number(player.rating || 72),
      signalCount: 1,
      sourceWeight: league?.competitionWeight || 1,
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
      const key = candidate.leagueLabel;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(candidate);
      return map;
    }, new Map()).values(),
  );
  const normalized = [
    ...normalizeSourceCandidates(sourcePools.mlb, SOURCE_WEIGHTS.mlb),
    ...normalizeSourceCandidates(sourcePools.nba, SOURCE_WEIGHTS.nba),
    ...normalizeSourceCandidates(sourcePools.nhl, SOURCE_WEIGHTS.nhl),
    ...normalizeSourceCandidates(sourcePools.nfl, SOURCE_WEIGHTS.nfl),
    ...normalizeSourceCandidates(sourcePools.cbb, SOURCE_WEIGHTS.cbb),
    ...footballByLeague.flatMap((pool) => normalizeSourceCandidates(pool, pool[0]?.sourceWeight || 1)),
  ];

  const players = uniqBy(normalized, (entry) => entry.id)
    .sort((left, right) => right.normalizedDominance - left.normalizedDominance || right.overall - left.overall)
    .slice(0, 5)
    .map((player, index) => ({
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
