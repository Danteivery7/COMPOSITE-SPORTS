import { cacheGet, cacheSet, CACHE_TTL } from '@/src/mlb/lib/cache';
import { NextResponse } from 'next/server';
import { buildMLBOverviewPayload } from '@/src/mlb/lib/bootstrap';

export const dynamic = 'force-dynamic';
const OVERVIEW_CACHE_KEY = 'mlb_overview_v2';
const OVERVIEW_STALE_KEY = 'mlb_overview_stale_v2';
let isRefreshingOverview = false;

async function buildOverviewPayload() {
        return buildMLBOverviewPayload();
}

function refreshOverviewInBackground() {
    if (isRefreshingOverview) return;
    isRefreshingOverview = true;
    buildOverviewPayload()
        .then((result) => {
            cacheSet(OVERVIEW_CACHE_KEY, result, CACHE_TTL.OVERVIEW);
            cacheSet(OVERVIEW_STALE_KEY, result, CACHE_TTL.OVERVIEW * 8);
        })
        .catch((error) => {
            console.error('MLB overview background refresh error:', error);
        })
        .finally(() => {
            isRefreshingOverview = false;
        });
}

export async function GET() {
    const cached = cacheGet(OVERVIEW_CACHE_KEY);
    if (cached) {
        const age = cached.lastUpdated ? Date.now() - new Date(cached.lastUpdated).getTime() : 0;
        if (age > CACHE_TTL.OVERVIEW * 1000) {
            refreshOverviewInBackground();
        }
        return NextResponse.json(cached);
    }

    try {
        const result = await buildOverviewPayload();
        cacheSet(OVERVIEW_CACHE_KEY, result, CACHE_TTL.OVERVIEW);
        cacheSet(OVERVIEW_STALE_KEY, result, CACHE_TTL.OVERVIEW * 8);
        return NextResponse.json(result);
    } catch (error) {
        console.error('MLB overview API error:', error);
        const stale = cacheGet(OVERVIEW_STALE_KEY);
        if (stale) {
            return NextResponse.json({ ...stale, stale: true });
        }
        return NextResponse.json(
            {
                scores: [],
                news: [],
                topTeams: [],
                trendingPlayers: [],
                bestEdges: [],
                pickOfTheDay: null,
                error: error.message,
                lastUpdated: null,
            },
            { status: 500 }
        );
    }
}
