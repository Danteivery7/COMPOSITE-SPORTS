import { CACHE_PREFIX } from "./config.js";

const RESPONSE_CACHE_LIMIT = 60;

function buildKey(key) {
  return `${CACHE_PREFIX}:${key}`;
}

function getResponseStorage() {
  try {
    return window.sessionStorage;
  } catch (_error) {
    return null;
  }
}

function pruneResponseCache(storage) {
  if (!storage) return;
  const entries = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(`${CACHE_PREFIX}:`)) continue;
    try {
      const parsed = JSON.parse(storage.getItem(key) || "null");
      if (parsed && typeof parsed === "object" && "timestamp" in parsed && "data" in parsed) {
        entries.push({ key, timestamp: Number(parsed.timestamp || 0) });
      }
    } catch (_error) {
      storage.removeItem(key);
    }
  }
  if (entries.length <= RESPONSE_CACHE_LIMIT) return;
  entries
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, entries.length - RESPONSE_CACHE_LIMIT)
    .forEach((entry) => storage.removeItem(entry.key));
}

export function readCache(key) {
  try {
    const storage = getResponseStorage();
    if (!storage) return null;
    const raw = storage.getItem(buildKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

export function writeCache(key, data) {
  try {
    const storage = getResponseStorage();
    if (!storage) return data;
    storage.setItem(
      buildKey(key),
      JSON.stringify({
        timestamp: Date.now(),
        data,
      }),
    );
    pruneResponseCache(storage);
  } catch (_error) {
    return null;
  }
  return data;
}

export function readCachedSettings(key, fallback) {
  try {
    const raw = localStorage.getItem(buildKey(key));
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

export function writeCachedSettings(key, value) {
  try {
    localStorage.setItem(buildKey(key), JSON.stringify(value));
  } catch (_error) {
    return null;
  }
  return value;
}

export async function loadWithCache(key, ttl, fetcher, options = {}) {
  const cached = readCache(key);
  const age = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;
  const isFresh = age <= ttl;

  if (cached && isFresh && !options.force) {
    return { data: cached.data, fromCache: true, stale: false };
  }

  if (cached && !options.force && options.allowStale !== false) {
    fetcher()
      .then((data) => {
        writeCache(key, data);
        options.onBackgroundUpdate?.(data);
      })
      .catch(() => {
        return null;
      });

    return { data: cached.data, fromCache: true, stale: true };
  }

  const data = await fetcher();
  writeCache(key, data);
  return { data, fromCache: false, stale: false };
}

export function snapshotTeamRankings(rankings) {
  const payload = {
    timestamp: Date.now(),
    values: Object.fromEntries(rankings.map((team) => [team.id, team.compositeScore])),
  };
  writeCachedSettings("rankings-snapshot", payload);
  return payload;
}
