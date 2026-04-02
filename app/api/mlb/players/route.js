/**
 * /api/players — Top 50 players with stale-while-revalidate for speed
 * Returns cached data instantly, refreshes in background if stale
 */

export const dynamic = 'force-dynamic';

import { computeTopPlayers, getCachedTopPlayers, getStaleTopPlayers } from '@/src/mlb/lib/topPlayers';

// In-memory background refresh flag
let isRefreshing = false;

function refreshInBackground() {
    if (isRefreshing) return;
    isRefreshing = true;
    computeTopPlayers(50)
        .catch(err => console.error('Background top-50 refresh failed:', err.message))
        .finally(() => { isRefreshing = false; });
}

export async function GET() {
    // Return cached data immediately if available (stale-while-revalidate)
    const cached = getCachedTopPlayers(50);
    if (cached) {
        // Trigger background refresh if data is > 10 seconds old
        const age = Date.now() - new Date(cached.lastUpdated).getTime();
        if (age > 10000) refreshInBackground();
        return Response.json(cached);
    }

    // No cache at all — must compute synchronously (first load only)
    try {
        const result = await computeTopPlayers(50);
        return Response.json(result);
    } catch (err) {
        console.error('Players API error:', err);
        // Return stale data if available
        const stale = getStaleTopPlayers();
        if (stale) return Response.json({ ...stale, stale: true });
        return Response.json(
            { players: [], error: err.message, lastUpdated: new Date().toISOString() },
            { status: 200 }
        );
    }
}
