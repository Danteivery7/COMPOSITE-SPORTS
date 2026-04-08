const clientRouteCache = new Map();
const clientRouteListeners = new Map();

function emitUpdate(url) {
    const listeners = clientRouteListeners.get(url);
    if (!listeners?.size) return;
    const payload = clientRouteCache.get(url)?.data ?? null;
    for (const listener of listeners) {
        listener(payload);
    }
}

function storeData(url, data) {
    clientRouteCache.set(url, {
        data,
        promise: null,
        fetchedAt: Date.now(),
    });
    emitUpdate(url);
    return data;
}

export function getMLBPrefetchedData(url) {
    return clientRouteCache.get(url)?.data ?? null;
}

export function primeMLBRouteCache(seed = {}) {
    if (!seed || typeof seed !== 'object') return;
    for (const [url, data] of Object.entries(seed)) {
        if (!url) continue;
        storeData(url, data);
    }
}

export function subscribeMLBRoute(url, listener) {
    if (!clientRouteListeners.has(url)) {
        clientRouteListeners.set(url, new Set());
    }
    const listeners = clientRouteListeners.get(url);
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (!listeners.size) {
            clientRouteListeners.delete(url);
        }
    };
}

export async function fetchMLBRouteJson(url, options = {}) {
    const {
        force = false,
        allowStaleOnError = true,
    } = options;

    const existing = clientRouteCache.get(url);
    if (!force) {
        if (existing?.promise) return existing.promise;
        if (existing?.data) return existing.data;
    }

    const request = fetch(url, { cache: 'no-store' })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch ${url}: ${response.status}`);
            }
            const json = await response.json();
            return storeData(url, json);
        })
        .catch((error) => {
            if (allowStaleOnError && existing?.data) {
                return existing.data;
            }
            clientRouteCache.delete(url);
            throw error;
        });

    clientRouteCache.set(url, {
        ...existing,
        promise: request,
    });

    return request;
}

export async function prefetchMLBRoutes(urls, options = {}) {
    return Promise.allSettled(
        urls.map((url) => fetchMLBRouteJson(url, options))
    );
}
