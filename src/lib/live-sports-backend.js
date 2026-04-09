import { getHotSnapshot, warmSnapshot } from '@/src/lib/snapshot-store';
import { getSportBootstrap, getPlayerCatalog, isGenericSport } from '@/src/lib/generic-sports';
import { getCBBBootstrap, getCBBPlayerCatalog } from '@/src/lib/cbb';
import { getNFLBootstrap, getNFLPlayerCatalog } from '@/src/lib/nfl';
import {
  getFootballBootstrap,
  getFootballLanding,
  isFootballLeague,
} from '@/src/lib/football';

const SPORT_BOOTSTRAP_TTL = 2 * 60 * 1000;
const SPORT_PLAYER_TTL = 10 * 60 * 1000;
const FOOTBALL_LANDING_TTL = 2 * 60 * 1000;
const CBB_SNAPSHOT_VERSION = 'v3';
const NFL_SNAPSHOT_VERSION = 'v3';
const FOOTBALL_SNAPSHOT_VERSION = 'v12';
const FOOTBALL_LANDING_VERSION = 'v8';

function footballRecordHasGames(record) {
  const match = String(record || '').match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
  if (!match) return false;
  return Number(match[1]) + Number(match[2]) + Number(match[3]) > 0;
}

function isHealthyFootballSnapshot(snapshot) {
  const rankings = snapshot?.rankings || [];
  const rankedTeams = Array.isArray(rankings) ? rankings.length : 0;
  const liveGames = snapshot?.scoreboard?.length || 0;
  const newsCount = snapshot?.news?.length || 0;
  const hasRealRecords = rankings.some(
    (team) => footballRecordHasGames(team?.record) || Number(team?.gamesPlayed || 0) > 0 || Number(team?.standingPoints || 0) > 0,
  );
  return rankedTeams >= 6 && (hasRealRecords || liveGames > 0 || newsCount > 0);
}

function isMeaningfulFootballSnapshot(snapshot) {
  const rankings = snapshot?.rankings || [];
  return rankings.length >= 6 || (snapshot?.scoreboard?.length || 0) > 0 || (snapshot?.news?.length || 0) > 0;
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

export function getSportSnapshotKey(sport) {
  return makeSportSnapshotKey(sport);
}

export function getFootballLeagueSnapshotKey(leagueKey) {
  return makeFootballSnapshotKey(leagueKey);
}

export const FOOTBALL_LANDING_SNAPSHOT_KEY = `football-landing-${FOOTBALL_LANDING_VERSION}`;

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
    const bootstrap = await getNFLBootstrap();
    const playersCatalog = bootstrap?.playersCatalog?.players?.length
      ? bootstrap.playersCatalog
      : await getNFLPlayerCatalog();

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
  const snapshot = {
    ...bootstrap,
    featuredPlayers: bootstrap?.featuredPlayers || [],
    playersCatalog: bootstrap?.playersCatalog || { league: leagueKey, players: [], lastUpdated: null, totalPlayers: 0 },
    playerMeta: {
      totalPlayers: bootstrap?.playersCatalog?.players?.length || 0,
      lastUpdated: bootstrap?.playersCatalog?.lastUpdated || null,
    },
    lastUpdated: new Date().toISOString(),
  };

  if (!isHealthyFootballSnapshot(snapshot)) {
    const rankedTeams = snapshot?.rankings?.length || 0;
    const nonZeroTeams = (snapshot?.rankings || []).filter((team) => footballRecordHasGames(team?.record)).length;
    throw new Error(
      `Incomplete football snapshot for ${leagueKey}: ${rankedTeams} clubs, ${nonZeroTeams} clubs with live records`,
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
    const repaired = {
      ...directBootstrap,
      featuredPlayers: directBootstrap?.featuredPlayers || [],
      playersCatalog: directBootstrap?.playersCatalog || { league: leagueKey, players: [], lastUpdated: null, totalPlayers: 0 },
      playerMeta: {
        totalPlayers: directBootstrap?.playersCatalog?.players?.length || 0,
        lastUpdated: directBootstrap?.playersCatalog?.lastUpdated || directBootstrap?.lastUpdated || null,
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
    FOOTBALL_LANDING_SNAPSHOT_KEY,
    async () => ({
      ...(await getFootballLanding()),
      lastUpdated: new Date().toISOString(),
    }),
    { ttlMs: FOOTBALL_LANDING_TTL, force },
  );
}

export async function warmFootballLandingSnapshot(force = false) {
  return warmSnapshot(
    FOOTBALL_LANDING_SNAPSHOT_KEY,
    async () => ({
      ...(await getFootballLanding()),
      lastUpdated: new Date().toISOString(),
    }),
    { ttlMs: FOOTBALL_LANDING_TTL, force },
  );
}
