import { NextResponse } from 'next/server';
import { buildMLBBootstrapSnapshot } from '@/src/mlb/lib/bootstrap';

export const dynamic = 'force-dynamic';

export async function GET() {
    const startedAt = Date.now();

    try {
        const snapshot = await buildMLBBootstrapSnapshot();
        const scores = snapshot['/api/mlb/scores'];
        const overview = snapshot['/api/mlb/overview'];
        const rankings = snapshot['/api/mlb/rankings'];
        const players = snapshot['/api/mlb/players'];
        const news = snapshot['/api/mlb/news'];

        return NextResponse.json({
            ok: true,
            warmed: {
                scores: scores?.games?.length || 0,
                rankings: rankings?.rankings?.length || 0,
                players: players?.players?.length || 0,
                news: news?.articles?.length || 0,
                featuredMatchups: overview?.scores?.length || 0,
            },
            durationMs: Date.now() - startedAt,
            lastUpdated: new Date().toISOString(),
        });
    } catch (error) {
        console.error('MLB warm route error:', error);
        return NextResponse.json(
            {
                ok: false,
                error: error.message,
                durationMs: Date.now() - startedAt,
                lastUpdated: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
