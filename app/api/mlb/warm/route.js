import { NextResponse } from 'next/server';
import { fetchScoreboard } from '@/src/mlb/lib/espn';
import { fetchMLBNews } from '@/src/mlb/lib/news';
import { computeTopPlayers, getCachedTopPlayers, getStaleTopPlayers } from '@/src/mlb/lib/topPlayers';
import { computeRankings } from '@/src/mlb/lib/rankings';
import { predict } from '@/src/mlb/lib/predictor';

export const dynamic = 'force-dynamic';

export async function GET() {
    const startedAt = Date.now();

    try {
        const [scores, news, rankings] = await Promise.all([
            fetchScoreboard(),
            fetchMLBNews(),
            computeRankings(),
        ]);

        let players = getCachedTopPlayers(50);
        if (!players) {
            try {
                players = await computeTopPlayers(50);
            } catch (error) {
                players = getStaleTopPlayers() || { players: [] };
            }
        }

        const pregameGames = (scores?.games || []).filter(
            (game) => game.state === 'pre' && game.away?.teamId && game.home?.teamId
        );

        await Promise.allSettled(
            pregameGames.map((game) =>
                predict(game.away.teamId, game.home.teamId, { neutralSite: false })
            )
        );

        return NextResponse.json({
            ok: true,
            warmed: {
                scores: scores?.games?.length || 0,
                rankings: rankings?.rankings?.length || 0,
                players: players?.players?.length || 0,
                news: news?.articles?.length || 0,
                predictions: pregameGames.length,
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
