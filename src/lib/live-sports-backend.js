import { getHotSnapshot, warmSnapshot } from '@/src/lib/snapshot-store';
import { getSportBootstrap, getPlayerCatalog, isGenericSport } from '@/src/lib/generic-sports';
import { getCBBBootstrap, getCBBPlayerCatalog } from '@/src/lib/cbb';
import { getNFLBootstrap, getNFLPlayerCatalog } from '@/src/lib/nfl';
import {
  getFootballBootstrap,
  getFootballFeaturedPlayers,
  getFootballLanding,
  getFootballPlayerCatalog,
  isFootballLeague,
} from '@/src/lib/football';

const SPORT_BOOTSTRAP_TTL = 2 * 60 * 1000;
const SPORT_PLAYER_TTL = 10 * 60 * 1000;
const FOOTBALL_LANDING_TTL = 2 * 60 * 1000;
const CBB_SNAPSHOT_VERSION = 'v3';
const FOOTBALL_SNAPSHOT_VERSION = 'v11';
const FOOTBALL_LANDING_VERSION = 'v7';

function footballRecordHasGames(record) {
  const match = String(record || '').match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
  if (!match) return false;
  return Number(match[1]) + Number(match[2]) + Number(match[3]) > 0;
}

function isHealthyFootballSnapshot(snapshot) {
  const rankings = snapshot?.rankings || [];
  const players = snapshot?.playersCatalog?.players || [];
  const rankedTeams = Array.isArray(rankings) ? rankings.length : 0;
  const playerCount = Array.isArray(players) ? players.length : 0;
  const hasRealRecords = rankings.some(
    (team) => footballRecordHasGames(team?.record) || Number(team?.gamesPlayed || 0) > 0 || Number(team?.standingPoints || 0) > 0,
  );
  return rankedTeams >= 6 && playerCount >= 15 && hasRealRecords;
}

function isMeaningfulFootballSnapshot(snapshot) {
  const rankings = snapshot?.rankings || [];
  const players = snapshot?.playersCatalog?.players || [];
  return rankings.length >= 6 || players.length >= 15;
}

function makeSportSnapshotKey(sport) {
  if (sport === 'cbb') {
    return `cbb-snapshot-${CBB_SNAPSHOT_VERSION}`;
  }
  if (sport === 'nfl') {
    return `nfl-snapshot-${NFL_SNAPSHOT_VERSION}`;
  }
  return `generic-sport-${sport}`;
}

function makeFootballSnapshotKey(leagueKey) {
  return `football-league-${FOOTBALL_SNAPSHOT_VERSION}-${leagueKey}`;
}

async function buildGenericSportSnapshot(sport) {
  if (sport === 'cbb') {
    const snapshot = await getCBBBootstrap({ force: true });
    const playersCatalog = snapshot?.playersCatalog?.players?.length
      ? snapshot.playersCatalog
      : await getCBBPlayerCatalog({ force: true });
    return {
      ...snapshot,
      playersCatalog,
      playerMeta: {
        totalPlayers: playersCatalog?.players?.length || 0,
        lastUpdated: playersCatalog?.lastUpdated || snapshot?.lastUpdated || null,
      },
      lastUpdated: snapshot?.lastUpdated || new Date().toISOString(),
    };
  }

  if (sport === 'nfl') {
    const [bootstrap, playersCatalog] = await Promise.all([
      getNFLBootstrap(),
      getNFLPlayerCatalog(),
    ]);

    return {
      ...bootstrap,
      playersCatalog,
      playerMeta: {
        totalPlayers: playersCatalog?.players?.length || 0,
        lastUpdated: playersCatalog?.lastUpdated || bootstrap?.lastUpdated || null,
      },
      lastUpdated: bootstrap?.lastUpdated || new Date().toISOString(),
    };
  }

  const [bootstrap, playersCatalog] = await Promise.all([
    getSportBootstrap(sport),
    getPlayerCatalog(sport),
  ]);

  return {
    ...bootstrap,
    playersCatalog,
    playerMeta: {
      totalPlayers: playersCatalog?.players?.length || 0,
      lastUpdated: playersCatalog?.lastUpdated || null,
    },
    lastUpdated: new Date().toISOString(),
  };
}

async function buildFootballLeagueSnapshot(leagueKey) {
  const bootstrap = await getFootballBootstrap(leagueKey);
  const playersCatalog = bootstrap?.playersCatalog?.players?.length ? bootstrap.playersCatalog : (await getFootballPlayerCatalog(leagueKey));
  const featuredPlayers = bootstrap?.featuredPlayers?.length ? bootstrap.featuredPlayers : await getFootballFeaturedPlayers(leagueKey, bootstrap?.rankings || []);
  const snapshot = {
    ...bootstrap,
    featuredPlayers,
    playersCatalog,
    playerMeta: {
      totalPlayers: playersCatalog?.players?.length || 0,
      lastUpdated: playersCatalog?.lastUpdated || null,
    },
    lastUpdated: new Date().toISOString(),
  };

  if (!isHealthyFootballSnapshot(snapshot)) {
    const rankedTeams = snapshot?.rankings?.length || 0;
    const playerCount = snapshot?.playersCatalog?.players?.length || 0;
    const nonZeroTeams = (snapshot?.rankings || []).filter((team) => footballRecordHasGames(team?.record)).length;
    throw new Error(
      `Incomplete football snapshot for ${leagueKey}: ${rankedTeams} teams, ${playerCount} players, ${nonZeroTeams} clubs with live records`,
    );
  }

  return snapshot;
}

export async function getGenericSportSnapshot(sport, { force = false } = {}) {
  if (!isGenericSport(sport)) {
    throw new Error(`Unsupported sport "${sport}"`);
  }

  return getHotSnapshot(
    makeSportSnapshotKey(sport),
    () => buildGenericSportSnapshot(sport),
    { ttlMs: SPORT_BOOTSTRAP_TTL, force },
  );
}

export async function warmGenericSportSnapshot(sport, force = false) {
  if (!isGenericSport(sport)) {
    throw new Error(`Unsupported sport "${sport}"`);
  }

  return warmSnapshot(
    makeSportSnapshotKey(sport),
    () => buildGenericSportSnapshot(sport),
    { ttlMs: SPORT_PLAYER_TTL, force },
  );
}

export async function getNFLSnapshot({ force = false } = {}) {
  return getGenericSportSnapshot('nfl', { force });
}

export async function warmNFLSnapshot(force = false) {
  return warmGenericSportSnapshot('nfl', force);
}

export async function getFootballLeagueSnapshot(leagueKey, { force = false } = {}) {
  if (!isFootballLeague(leagueKey)) {
    throw new Error(`Unsupported football league "${leagueKey}"`);
  }

  let snapshot = await getHotSnapshot(
    makeFootballSnapshotKey(leagueKey),
    () => buildFootballLeagueSnapshot(leagueKey),
    { ttlMs: SPORT_BOOTSTRAP_TTL, force },
  );

  if (!isHealthyFootballSnapshot(snapshot)) {
    snapshot = await getHotSnapshot(
      makeFootballSnapshotKey(leagueKey),
      () => buildFootballLeagueSnapshot(leagueKey),
      { ttlMs: SPORT_BOOTSTRAP_TTL, force: true },
    );
  }

  if (!isHealthyFootballSnapshot(snapshot)) {
    const directBootstrap = await getFootballBootstrap(leagueKey);
    const directPlayers = directBootstrap?.playersCatalog?.players?.length
      ? directBootstrap.playersCatalog
      : await getFootballPlayerCatalog(leagueKey);
    const repaired = {
      ...directBootstrap,
      featuredPlayers: directBootstrap?.featuredPlayers?.length
        ? directBootstrap.featuredPlayers
        : (directPlayers?.players || []).slice(0, 12),
      playersCatalog: directPlayers,
      playerMeta: {
        totalPlayers: directPlayers?.players?.length || 0,
        lastUpdated: directPlayers?.lastUpdated || directBootstrap?.lastUpdated || null,
      },
      lastUpdated: new Date().toISOString(),
    };

    if (isMeaningfulFootballSnapshot(repaired)) {
      return repaired;
    }

    throw new Error(`Football snapshot for ${leagueKey} is still incomplete after rebuild`);
  }

  return snapshot;
}

export async function warmFootballLeagueSnapshot(leagueKey, force = false) {
  if (!isFootballLeague(leagueKey)) {
    throw new Error(`Unsupported football league "${leagueKey}"`);
  }

  return warmSnapshot(
    makeFootballSnapshotKey(leagueKey),
    () => buildFootballLeagueSnapshot(leagueKey),
    { ttlMs: SPORT_PLAYER_TTL, force },
  );
}

export async function getFootballLandingSnapshot({ force = false } = {}) {
  return getHotSnapshot(
    `football-landing-${FOOTBALL_LANDING_VERSION}`,
    async () => ({
      ...(await getFootballLanding()),
      lastUpdated: new Date().toISOString(),
    }),
    { ttlMs: FOOTBALL_LANDING_TTL, force },
  );
}

export async function warmFootballLandingSnapshot(force = false) {
  return warmSnapshot(
    `football-landing-${FOOTBALL_LANDING_VERSION}`,
    async () => ({
      ...(await getFootballLanding()),
      lastUpdated: new Date().toISOString(),
    }),
    { ttlMs: FOOTBALL_LANDING_TTL, force },
  );
}
