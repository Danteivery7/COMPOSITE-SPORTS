'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMLBRouteJson, getMLBPrefetchedData, subscribeMLBRoute } from '@/src/mlb/lib/clientPrefetch';

export function useMLBRouteData(url, options = {}) {
    const {
        enabled = true,
        refreshInterval = 0,
    } = options;

    const initialData = useMemo(() => (enabled ? getMLBPrefetchedData(url) : null), [enabled, url]);
    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(enabled && !initialData);
    const [error, setError] = useState(null);

    const refresh = useCallback(async (force = true, silent = true) => {
        if (!enabled || !url) return null;

        const cached = getMLBPrefetchedData(url);
        if (!silent && !cached) {
            setLoading(true);
        }

        try {
            const json = await fetchMLBRouteJson(url, {
                force,
                allowStaleOnError: true,
            });
            setData(json);
            setError(null);
            setLoading(false);
            return json;
        } catch (err) {
            setError(err.message);
            setLoading(false);
            return null;
        }
    }, [enabled, url]);

    useEffect(() => {
        if (!enabled || !url) return undefined;
        return subscribeMLBRoute(url, (next) => {
            if (next) {
                setData(next);
                setLoading(false);
                setError(null);
            }
        });
    }, [enabled, url]);

    useEffect(() => {
        if (!enabled || !url) {
            setLoading(false);
            return undefined;
        }

        const cached = getMLBPrefetchedData(url);
        if (cached) {
            setData(cached);
            setLoading(false);
        } else {
            refresh(false, false);
        }

        if (!refreshInterval) return undefined;
        const timer = setInterval(() => {
            refresh(true, true);
        }, refreshInterval);
        return () => clearInterval(timer);
    }, [enabled, refresh, refreshInterval, url]);

    return {
        data,
        loading,
        error,
        refresh: () => refresh(true, true),
    };
}
