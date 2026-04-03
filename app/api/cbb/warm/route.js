import { NextResponse } from 'next/server';
import { warmGenericSportSnapshot } from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await warmGenericSportSnapshot('cbb', true);
    return NextResponse.json({
      ok: true,
      sport: 'cbb',
      lastUpdated: snapshot?.lastUpdated || snapshot?.snapshotUpdated || null,
      playerCount: snapshot?.playersCatalog?.players?.length || 0,
      liveGames: snapshot?.scoreboard?.filter?.((game) => game.state === 'in')?.length || 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sport: 'cbb',
        error: error.message,
      },
      { status: 500 },
    );
  }
}
