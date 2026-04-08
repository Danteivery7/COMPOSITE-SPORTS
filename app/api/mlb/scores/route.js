import { cacheGet, cacheSet, CACHE_TTL } from '@/src/mlb/lib/cache';
import { NextResponse } from 'next/server';
import { buildMLBScoresPayload } from '@/src/mlb/lib/bootstrap';

export const dynamic = 'force-dynamic';
const SCORES_CACHE_KEY = 'mlb_scores_route_v1';
const SCORES_STALE_KEY = 'mlb_scores_route_stale_v1';
let isRefreshingScores = false;

async function buildScoresPayload() {
    return buildMLBScoresPayload();
}

function refreshScoresInBackground() {
    if (isRefreshingScores) return;
    isRefreshingScores = true;
    buildScoresPayload()
        .then((result) => {
            cacheSet(SCORES_CACHE_KEY, result, CACHE_TTL.SCORES);
            cacheSet(SCORES_STALE_KEY, result, CACHE_TTL.SCORES * 12);
        })
        .catch((error) => {
            console.error('Scores background refresh error:', error);
        })
        .finally(() => {
            isRefreshingScores = false;
        });
}

export async function GET() {
    const cached = cacheGet(SCORES_CACHE_KEY);
    if (cached) {
        const age = cached.lastUpdated ? Date.now() - new Date(cached.lastUpdated).getTime() : 0;
        if (age > CACHE_TTL.SCORES * 1000) {
            refreshScoresInBackground();
        }
        return NextResponse.json(cached);
    }

    try {
        const data = await buildScoresPayload();
        cacheSet(SCORES_CACHE_KEY, data, CACHE_TTL.SCORES);
        cacheSet(SCORES_STALE_KEY, data, CACHE_TTL.SCORES * 12);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Scores API error:', error);
        const stale = cacheGet(SCORES_STALE_KEY);
        if (stale) {
            return NextResponse.json({ ...stale, stale: true });
        }
        return NextResponse.json(
            { games: [], error: error.message, lastUpdated: null },
            { status: 500 }
        );
    }
}
