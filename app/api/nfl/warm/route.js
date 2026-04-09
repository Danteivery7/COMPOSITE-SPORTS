import { NextResponse } from 'next/server';
import { warmNFLSnapshot } from '@/src/lib/live-sports-backend';
import { getNFLPlayerCatalog } from '@/src/lib/nfl';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [snapshot, catalog] = await Promise.all([warmNFLSnapshot(true), getNFLPlayerCatalog()]);
    return NextResponse.json({
      ok: true,
      sport: 'nfl',
      lastUpdated: snapshot?.lastUpdated || snapshot?.snapshotUpdated || null,
      playerCount: catalog?.players?.length || 0,
      liveGames: snapshot?.scoreboard?.filter?.((game) => game.state === 'in')?.length || 0,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, sport: 'nfl', error: error.message }, { status: 500 });
  }
}
