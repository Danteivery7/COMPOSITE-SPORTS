import { CACHE_PREFIX } from "./config.js";

function buildKey(key) {
  return `${CACHE_PREFIX}:${key}`;
}

export function readCache(key) {
  try {
    const raw = localStorage.getItem(buildKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

export function writeCache(key, data) {
  try {
    localStorage.setItem(
      buildKey(key),
      JSON.stringify({
        timestamp: Date.now(),
        data,
      }),
    );
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
