import path from 'path';
import { promises as fs } from 'fs';

const ROOT = path.join('/tmp', 'composite-sports-snapshots');
const MEMORY = new Map();
const INFLIGHT = new Map();

async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true });
}

function snapshotPath(key) {
  return path.join(ROOT, `${String(key).replace(/[^a-z0-9_-]/gi, '_')}.json`);
}

async function readDiskSnapshot(key) {
  try {
    const raw = await fs.readFile(snapshotPath(key), 'utf8');
    const parsed = JSON.parse(raw);
    MEMORY.set(key, parsed);
    return parsed;
  } catch (_error) {
    return null;
  }
}

async function writeDiskSnapshot(key, value) {
  try {
    await ensureRoot();
    await fs.writeFile(snapshotPath(key), JSON.stringify(value), 'utf8');
  } catch (error) {
    console.warn(`[snapshot-store] Failed to persist ${key}:`, error?.message || error);
  }
}

export function getSnapshotAge(snapshot) {
  const stamp = snapshot?.snapshotUpdated || snapshot?.lastUpdated || null;
  if (!stamp) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(stamp).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Date.now() - timestamp;
}

export function isSnapshotFresh(snapshot, ttlMs) {
  return getSnapshotAge(snapshot) <= ttlMs;
}

export async function getStoredSnapshot(key) {
  if (MEMORY.has(key)) return MEMORY.get(key);
  return readDiskSnapshot(key);
}

export async function saveSnapshot(key, value) {
  const snapshot = {
    ...value,
    snapshotKey: key,
    snapshotUpdated: value?.snapshotUpdated || new Date().toISOString(),
  };
  MEMORY.set(key, snapshot);
  await writeDiskSnapshot(key, snapshot);
  return snapshot;
}

export async function warmSnapshot(key, builder, { force = false, ttlMs = 5 * 60 * 1000 } = {}) {
  const cached = await getStoredSnapshot(key);
  if (!force && cached && isSnapshotFresh(cached, ttlMs)) {
    return cached;
  }

  if (INFLIGHT.has(key)) {
    return INFLIGHT.get(key);
  }

  const promise = (async () => {
    const built = await builder(cached);
    return saveSnapshot(key, {
      ...built,
      snapshotUpdated: new Date().toISOString(),
    });
  })();

  INFLIGHT.set(key, promise);
  try {
    return await promise;
  } finally {
    INFLIGHT.delete(key);
  }
}

export async function getHotSnapshot(key, builder, { ttlMs = 5 * 60 * 1000, force = false } = {}) {
  const cached = await getStoredSnapshot(key);
  const fresh = isSnapshotFresh(cached, ttlMs);

  if (force) {
    const snapshot = await warmSnapshot(key, builder, { force: true, ttlMs });
    return {
      ...snapshot,
      warmState: { isWarming: false, isFresh: true, ageMs: 0 },
    };
  }

  if (cached && fresh) {
    return {
      ...cached,
      warmState: {
        isWarming: INFLIGHT.has(key),
        isFresh: true,
        ageMs: getSnapshotAge(cached),
      },
    };
  }

  if (cached && !INFLIGHT.has(key)) {
    void warmSnapshot(key, builder, { force: true, ttlMs });
    return {
      ...cached,
      warmState: {
        isWarming: true,
        isFresh: false,
        ageMs: getSnapshotAge(cached),
      },
    };
  }

  const snapshot = await warmSnapshot(key, builder, { force: true, ttlMs });
  return {
    ...snapshot,
    warmState: {
      isWarming: false,
      isFresh: true,
      ageMs: 0,
    },
  };
}

export function getWarmStateSync(key, snapshot, ttlMs) {
  return {
    key,
    hasSnapshot: Boolean(snapshot),
    isFresh: isSnapshotFresh(snapshot, ttlMs),
    isWarming: INFLIGHT.has(key),
    ageMs: getSnapshotAge(snapshot),
    lastUpdated: snapshot?.snapshotUpdated || snapshot?.lastUpdated || null,
  };
}
