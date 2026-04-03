import path from 'path';
import vm from 'node:vm';
import { promises as fs } from 'fs';
import { getNbaBootstrapSnapshot } from '@/src/lib/nba-backend';

const CACHE = new Map();
const MODELS_PATH = path.join(process.cwd(), 'public/vendor/nba/js/models.js');

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
  CACHE.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

async function loadModelsSource() {
  const cached = readCache('models-source');
  if (cached) return cached;
  const source = await fs.readFile(MODELS_PATH, 'utf8');
  return writeCache('models-source', source, 60 * 60 * 1000);
}

function cloneSnapshotInput(snapshot) {
  return JSON.parse(
    JSON.stringify({
      teams: snapshot?.teams || [],
      rosters: snapshot?.rosters || {},
      teamStats: snapshot?.teamStats || {},
    }),
  );
}

function buildSandbox(snapshot) {
  const input = cloneSnapshotInput(snapshot);
  const sandbox = {
    console,
    window: {},
  };

  sandbox.window.window = sandbox.window;
  sandbox.window.store = {
    state: {
      teams: input.teams,
      rosters: input.rosters,
      teamStats: input.teamStats,
      leagueStats: {},
      roleStats: {},
      players: [],
    },
    setAllPlayers(players) {
      this.state.players = players;
    },
  };
  sandbox.store = sandbox.window.store;
  return sandbox;
}

function evaluateModels(source, snapshot) {
  const sandbox = buildSandbox(snapshot);
  vm.runInNewContext(source, sandbox, {
    filename: 'nba-models.js',
  });
  sandbox.window.models.updateAllPlayers();
  return sandbox.window.store.state.players || [];
}

export async function getExactNbaRatedPlayers({ force = false } = {}) {
  const key = 'nba-site-rated-players';
  if (!force) {
    const cached = readCache(key);
    if (cached) return cached;
  }

  const [source, snapshot] = await Promise.all([
    loadModelsSource(),
    getNbaBootstrapSnapshot(),
  ]);

  const players = evaluateModels(source, snapshot);
  return writeCache(
    key,
    {
      players,
      lastUpdated: new Date().toISOString(),
    },
    10 * 60 * 1000,
  );
}
