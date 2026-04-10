import {
  computeTopPlayers,
  getCachedTopPlayers,
  getStaleTopPlayers,
} from '@/src/mlb/lib/topPlayers';
import {
  FOOTBALL_LEAGUES,
  FOOTBALL_ROUTE_ORDER,
  PRIMARY_FOOTBALL_LEAGUE_KEYS,
} from '@/src/lib/football';
import { getFootballLeagueSnapshot, getGenericSportSnapshot } from '@/src/lib/live-sports-backend';
import { getNbaBootstrapSnapshot } from '@/src/lib/nba-backend';
import { getExactNbaRatedPlayers } from '@/src/lib/nba-site-ratings';
import { getHotSnapshot } from '@/src/lib/snapshot-store';
import {
  extractSeasonLeaderPlayers as extractNhlSeasonLeaderPlayers,
  getPlayerBundle as getNhlPlayerBundle,
  getScoreboardWindow as getNhlScoreboardWindow,
  getSeasonLeaders as getNhlSeasonLeaders,
  getTeams as getNhlTeams,
  pickSeasonYear as pickNhlSeasonYear,
} from '@/public/vendor/nhl/src/api.js';
import {
  buildFeaturedPlayers as buildNhlFeaturedPlayers,
  buildPlayerCard as buildNhlPlayerCard,
} from '@/public/vendor/nhl/src/analytics.js';

const CACHE = new Map();
const WORLD_CACHE_VERSION = 'v11';
const DEFAULT_HEADSHOT = 'https://a.espncdn.com/i/headshots/nophoto.png';
const MAX_PLAYERS_PER_SPORT = 2;
const THIRD_PLAYER_CLEAR_MARGIN = 3;
const WORLD_TOP5_SPORT_QUOTA = [
  ['nba', 2],
  ['nhl', 1],
  ['football', 1],
  ['mlb', 1],
];

const SOURCE_WEIGHTS = {
  mlb: 1.18,
  nba: 1.24,
  nhl: 1.2,
  nfl: 1.14,
  cbb: 0.96,
  football: 1.12,
};

function settledValue(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cacheKey(scope) {
  return `world:${WORLD_CACHE_VERSION}:${scope}`;
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

function isGenericHeadshot(source = '') {
  const value = String(source || '').toLowerCase();
  return !value || value.includes('nophoto') || value.endsWith('/default.jpg');
}

function resolveHeadshot(...sources) {
  for (const source of sources) {
    if (typeof source === 'string' && source.trim() && !isGenericHeadshot(source)) {
      return source;
    }
  }
  return DEFAULT_HEADSHOT;
}

function getSportHeadshotUrl(sportKey, playerId) {
  const id = String(playerId || '').trim();
  if (!id) return '';
  if (sportKey === 'mlb') return `https://a.espncdn.com/i/headshots/mlb/players/full/${id}.png`;
  if (sportKey === 'nba') return `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
  if (sportKey === 'nhl') return `https://a.espncdn.com/i/headshots/nhl/players/full/${id}.png`;
  if (sportKey === 'nfl') return `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
  if (sportKey === 'football') return `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png`;
  if (sportKey === 'cbb') return `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${id}.png`;
  return '';
}

function resolveSportHeadshot(sportKey, playerId, ...sources) {
  return resolveHeadshot(...sources, getSportHeadshotUrl(sportKey, playerId));
}

function getFootballLeagueStrengthBonus(leagueKey) {
  const index = PRIMARY_FOOTBALL_LEAGUE_KEYS.indexOf(leagueKey);
  if (index === -1) return 0.15;
  return 2.1 - (index * 0.35);
}

function positionDifficulty(position = '') {
  const pos = String(position).toUpperCase();
  if (['QB', 'PG', 'C', 'GK', 'SP', 'G'].includes(pos)) return 1;
  if (['CF', 'ST', 'LW', 'RW', 'CAM', 'CM', 'WR', 'RB', 'PF', 'SG', '1B', 'RF', 'LF'].includes(pos)) return 0.84;
  if (['D', 'DF', 'CB', 'LB', 'RB', 'TE', 'SF', '3B', 'SS', 'CDM', 'DM'].includes(pos)) return 0.76;
  return 0.68;
}

function roleImpactAdjustment(position = '') {
  const pos = String(position).toUpperCase();
  if (['RP', 'CL', 'CP'].includes(pos)) return -6;
  if (['DH'].includes(pos)) return -2;
  return 0;
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

async function getNBACandidates() {
  const [snapshot, bootstrap] = await Promise.all([
    getExactNbaRatedPlayers(),
    getNbaBootstrapSnapshot(),
  ]);
  const officialCatalog = new Map(
    (bootstrap?.playerCatalog || [])
      .filter((player) => player?.id && player?.hasOfficialStats)
      .map((player) => [String(player.id), player]),
  );

  return (snapshot?.players || [])
    .filter((player) => {
      const playerId = String(player?.id || '');
      const officialPlayer = officialCatalog.get(playerId);
      const overall = Number(player?.rating?.ratingNum);
      return Boolean(
        playerId &&
        officialPlayer &&
        player?.displayName &&
        player?.rating?.hasRealStats &&
        Number.isFinite(overall),
      );
    })
    .map((player) => {
      const officialPlayer = officialCatalog.get(String(player.id));
      const overall = Number(player.rating?.ratingNum);
      if (!Number.isFinite(overall)) return null;
      const hotness = Number(player.rating?.hotnessScore || 0);
      return {
        id: `nba-${player.id}`,
        playerId: String(player.id),
        displayName: player.fullName || player.displayName,
        headshot: resolveSportHeadshot(
          'nba',
          player.id,
          officialPlayer?.headshot,
          player.headshot?.href,
          player.headshot,
        ),
        position: player.rating?.posAbbrev || player.position?.abbreviation || player.position || 'NBA',
        leagueLabel: 'NBA',
        sportKey: 'nba',
        leagueKey: 'nba',
        overall,
        overallLabel: overall.toFixed(1),
        signalCount: 3,
        contextScore: clamp(overall + hotness * 1.8, 48, 97),
        formScore: clamp(overall + hotness * 2.4, 48, 98),
        teamAbbr: player.teamAbbr || '',
        teamLogo: player.teamLogo || '',
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.overall - left.overall)
    .slice(0, 18);
}

async function getNHLCandidates() {
  const cache = readCache(cacheKey('nhl-exact-candidates'));
  if (cache) return cache;

  const scoreboard = await getNhlScoreboardWindow();
  const seasonYear = pickNhlSeasonYear(scoreboard);
  const teams = await getNhlTeams();
  const teamsById = Object.fromEntries((teams || []).map((team) => [String(team.id), team]));
  const seasonLeaders = await getNhlSeasonLeaders(seasonYear);
  const leaderEntries = extractNhlSeasonLeaderPlayers(seasonLeaders);
  const featured = buildNhlFeaturedPlayers(leaderEntries, teamsById).slice(0, 12);
  const cards = await Promise.allSettled(
    featured.map(async (player) => {
      const bundle = await getNhlPlayerBundle(player.playerId, seasonYear);
      return buildNhlPlayerCard(bundle, teamsById);
    }),
  );

  return writeCache(
    cacheKey('nhl-exact-candidates'),
    cards
      .filter((result) => result.status === 'fulfilled' && result.value?.playerId && result.value?.overall)
      .map((result) => {
        const card = result.value;
        const overall = Number(card.overall || 0);
        return {
          id: `nhl-${card.playerId}`,
          playerId: String(card.playerId),
          displayName: card.fullName || card.shortName || 'NHL Player',
          headshot: resolveSportHeadshot('nhl', card.playerId, card.headshot),
          position: card.position || 'NHL',
          leagueLabel: 'NHL',
          sportKey: 'nhl',
          leagueKey: 'nhl',
          overall,
          overallLabel: String(overall),
          signalCount: card.games >= 20 ? 3 : card.games >= 8 ? 2 : 1,
          contextScore: clamp(overall + (card.sampleTrust || 0.5) * 7, 46, 97),
          formScore: clamp(overall + Number(card.hotnessScore || 0) * 2.2, 44, 98),
          teamLogo: card.team?.logo || '',
          teamAbbr: card.team?.abbreviation || '',
        };
      })
      .sort((left, right) => right.overall - left.overall)
      .slice(0, 14),
    15 * 60 * 1000,
  );
}

function buildHubHref(candidate) {
  if (!candidate?.playerId || !candidate?.sportKey) return null;
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
    const rawSeparation = Math.max(0, Number(candidate.overall || 0) - Number(next?.overall ?? (candidate.overall || 0) - 1.5));
    const tiedTopLeader =
      index === 0 &&
      next &&
      Math.abs(Number(candidate.overall || 0) - Number(next?.overall || 0)) <= 0.15;
    const separation = tiedTopLeader ? Math.max(rawSeparation, 1.5) : rawSeparation;
    const role = positionDifficulty(candidate.position);
    const reliability = clamp(0.46 + (candidate.signalCount || 1) * 0.12, 0.48, 0.94);
    const form = clamp(Number(candidate.formScore || candidate.overall || 70) / 100, 0.4, 1);
    const context = clamp(Number(candidate.contextScore || candidate.overall || 70) / 100, 0.4, 1);
    const worldScore =
      (Number(candidate.overall || 0) * 0.48) +
      (percentile * 24) +
      Math.min(18, separation * 3.1) +
      (role * 8) +
      roleImpactAdjustment(candidate.position) +
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
  }).filter((candidate) => candidate?.href && candidate?.overallLabel && Number.isFinite(Number(candidate?.overall)));
}

function includeDiversityPicks(sorted) {
  const selected = [];
  const selectedIds = new Set();
  const selectedCountBySport = new Map();

  function pushCandidate(candidate) {
    if (!candidate || selectedIds.has(candidate.id) || selected.length >= 5) return;
    selected.push(candidate);
    selectedIds.add(candidate.id);
    selectedCountBySport.set(candidate.sportKey, (selectedCountBySport.get(candidate.sportKey) || 0) + 1);
  }

  WORLD_TOP5_SPORT_QUOTA.forEach(([sportKey, count]) => {
    sorted
      .filter((entry) => entry.sportKey === sportKey)
      .slice(0, count)
      .forEach((candidate) => pushCandidate(candidate));
  });

  sorted.forEach((candidate) => {
    const quota = WORLD_TOP5_SPORT_QUOTA.find(([sportKey]) => sportKey === candidate.sportKey)?.[1];
    if (quota && (selectedCountBySport.get(candidate.sportKey) || 0) >= quota) return;
    pushCandidate(candidate);
  });
  const preliminary = selected
    .sort(
      (left, right) =>
        right.normalizedDominance - left.normalizedDominance ||
        Number(right.overall || 0) - Number(left.overall || 0),
    )
    .slice(0, 5);

  const sportCounts = preliminary.reduce((map, candidate) => {
    map.set(candidate.sportKey, (map.get(candidate.sportKey) || 0) + 1);
    return map;
  }, new Map());

  let refined = [...preliminary];

  const crowdedSports = Array.from(sportCounts.entries())
    .filter(([, count]) => count > MAX_PLAYERS_PER_SPORT)
    .map(([sportKey]) => sportKey);

  crowdedSports.forEach((sportKey) => {
    const sportPlayers = refined
      .filter((candidate) => candidate.sportKey === sportKey)
      .sort((left, right) => right.normalizedDominance - left.normalizedDominance);

    const overflowPlayers = sportPlayers.slice(MAX_PLAYERS_PER_SPORT);
    overflowPlayers.forEach((overflowPlayer) => {
      const replacement = sorted.find((candidate) => {
        if (!candidate || candidate.id === overflowPlayer.id) return false;
        if (refined.some((entry) => entry.id === candidate.id)) return false;
        if (candidate.sportKey === sportKey) return false;
        const existingCount = refined.filter((entry) => entry.sportKey === candidate.sportKey).length;
        return existingCount < MAX_PLAYERS_PER_SPORT;
      });

      if (!replacement) return;
      const keepOverflow =
        Number(overflowPlayer.normalizedDominance || 0) >=
        Number(replacement.normalizedDominance || 0) + THIRD_PLAYER_CLEAR_MARGIN;

      if (!keepOverflow) {
        refined = refined
          .filter((entry) => entry.id !== overflowPlayer.id)
          .concat(replacement)
          .sort(
            (left, right) =>
              right.normalizedDominance - left.normalizedDominance ||
              Number(right.overall || 0) - Number(left.overall || 0),
          )
          .slice(0, 5);
      }
    });
  });

  if (refined.length < 5) {
    sorted.forEach((candidate) => {
      if (refined.length >= 5) return;
      const currentCount = refined.filter((entry) => entry.sportKey === candidate.sportKey).length;
      if (currentCount >= MAX_PLAYERS_PER_SPORT) return;
      if (refined.some((entry) => entry.id === candidate.id)) return;
      refined.push(candidate);
    });
  }

  return refined
    .sort(
      (left, right) =>
        right.normalizedDominance - left.normalizedDominance ||
        Number(right.overall || 0) - Number(left.overall || 0),
    )
    .slice(0, 5);
}

async function getHubCandidates() {
  const footballLeagueKeys = FOOTBALL_ROUTE_ORDER;
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
    headshot: resolveSportHeadshot('mlb', player.id, player.headshot),
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
    (board?.playersCatalog?.players || board?.featuredPlayers || []).slice(0, 16).map((player, index) => ({
      id: `${sportKey}-${player.id}`,
      playerId: String(player.id),
      displayName: player.displayName,
      headshot: resolveSportHeadshot(sportKey, player.id, player.headshot),
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
    })).filter((player) => player.playerId && Number.isFinite(player.overall));

  const footballCandidates = footballBoards.flatMap(({ leagueKey, board }) => {
    const league = FOOTBALL_LEAGUES[leagueKey];
    const fifaRankByTeamId = Object.fromEntries(
      (board?.rankings || [])
        .filter((team) => team?.id && Number.isFinite(Number(team?.fifaRank)))
        .map((team) => [String(team.id), Number(team.fifaRank)]),
    );
    return (board?.playersCatalog?.players || board?.featuredPlayers || []).slice(0, 12).map((player, index) => ({
      id: `football-${player.id}`,
      playerId: String(player.id),
      displayName: player.displayName,
      headshot: resolveSportHeadshot('football', player.id, player.headshot),
      position: player.position || 'Football',
      leagueLabel: (FOOTBALL_LEAGUES[player.canonicalLeagueKey || leagueKey] || league).label,
      sportKey: 'football',
      leagueKey: player.canonicalLeagueKey || leagueKey,
      overall: Number(player.rating || 72),
      overallLabel: String(Number(player.rating || 72)),
      signalCount: (player.leaders || []).length ? 2 : 1,
      fifaRank: fifaRankByTeamId[String(player.team?.id || '')] || null,
      contextScore: clamp(
        Number(player.rating || 72) +
          getFootballLeagueStrengthBonus(player.canonicalLeagueKey || leagueKey) +
          (Number.isFinite(fifaRankByTeamId[String(player.team?.id || '')])
            ? clamp(((210 - fifaRankByTeamId[String(player.team?.id || '')]) / 210) * 0.9, 0.05, 0.9)
            : 0) +
          Math.max(0, 4 - index) * 0.35,
        48,
        96,
      ),
      formScore: clamp(
        Number(player.rating || 72) +
          Math.max(0, 5 - index) * 0.45 +
          (Number.isFinite(fifaRankByTeamId[String(player.team?.id || '')])
            ? clamp(((210 - fifaRankByTeamId[String(player.team?.id || '')]) / 210) * 0.45, 0.03, 0.45)
            : 0),
        48,
        96,
      ),
      teamAbbr: player.team?.abbreviation || '',
      teamLogo: player.team?.logo || '',
    })).filter((player) => player.playerId && Number.isFinite(player.overall));
  }).reduce((list, player) => {
    const existingIndex = list.findIndex((entry) => entry.playerId === player.playerId);
    if (existingIndex === -1) {
      list.push(player);
      return list;
    }
    const existing = list[existingIndex];
    const shouldReplace =
      Number(player.overall || 0) > Number(existing.overall || 0) ||
      (
        Number(player.overall || 0) === Number(existing.overall || 0) &&
        (
          Number(player.contextScore || 0) > Number(existing.contextScore || 0) ||
          getFootballLeagueStrengthBonus(player.leagueKey) > getFootballLeagueStrengthBonus(existing.leagueKey)
        )
      );
    if (shouldReplace) {
      list[existingIndex] = player;
    } else if (!existing.fifaRank && player.fifaRank) {
      list[existingIndex] = { ...existing, fifaRank: player.fifaRank };
    }
    return list;
  }, []);

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
  const footballPool = [...sourcePools.football].sort((left, right) =>
    Number(right.overall || 0) - Number(left.overall || 0),
  );

  const normalized = [
    ...normalizeSourceCandidates(sourcePools.mlb, SOURCE_WEIGHTS.mlb),
    ...normalizeSourceCandidates(sourcePools.nba, SOURCE_WEIGHTS.nba),
    ...normalizeSourceCandidates(sourcePools.nhl, SOURCE_WEIGHTS.nhl),
    ...normalizeSourceCandidates(sourcePools.nfl, SOURCE_WEIGHTS.nfl),
    ...normalizeSourceCandidates(sourcePools.cbb, SOURCE_WEIGHTS.cbb),
    ...normalizeSourceCandidates(
      footballPool,
      SOURCE_WEIGHTS.football,
    ),
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
