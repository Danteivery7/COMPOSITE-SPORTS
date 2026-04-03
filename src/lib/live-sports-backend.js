import { getHotSnapshot, warmSnapshot } from '@/src/lib/snapshot-store';
import { getSportBootstrap, getPlayerCatalog, isGenericSport } from '@/src/lib/generic-sports';
import {
  getFootballBootstrap,
  getFootballLanding,
  getFootballPlayerCatalog,
  isFootballLeague,
} from '@/src/lib/football';

const SPORT_BOOTSTRAP_TTL = 2 * 60 * 1000;
const SPORT_PLAYER_TTL = 10 * 60 * 1000;
const FOOTBALL_LANDING_TTL = 2 * 60 * 1000;

function makeSportSnapshotKey(sport) {
  return `generic-sport-${sport}`;
}

function makeFootballSnapshotKey(leagueKey) {
  return `football-league-${leagueKey}`;
}

async function buildGenericSportSnapshot(sport) {
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
  const playersCatalog = bootstrap?.playersCatalog || (await getFootballPlayerCatalog(leagueKey));

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

export async function getFootballLeagueSnapshot(leagueKey, { force = false } = {}) {
  if (!isFootballLeague(leagueKey)) {
    throw new Error(`Unsupported football league "${leagueKey}"`);
  }

  return getHotSnapshot(
    makeFootballSnapshotKey(leagueKey),
    () => buildFootballLeagueSnapshot(leagueKey),
    { ttlMs: SPORT_BOOTSTRAP_TTL, force },
  );
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
    'football-landing',
    async () => ({
      ...(await getFootballLanding()),
      lastUpdated: new Date().toISOString(),
    }),
    { ttlMs: FOOTBALL_LANDING_TTL, force },
  );
}

export async function warmFootballLandingSnapshot(force = false) {
  return warmSnapshot(
    'football-landing',
    async () => ({
      ...(await getFootballLanding()),
      lastUpdated: new Date().toISOString(),
    }),
    { ttlMs: FOOTBALL_LANDING_TTL, force },
  );
}
