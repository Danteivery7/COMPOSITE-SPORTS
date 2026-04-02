import { NextResponse } from 'next/server';
import { isGenericSport } from '@/src/lib/generic-sports';
import { warmGenericSportSnapshot } from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { sport } = await params;

  if (!isGenericSport(sport)) {
    return NextResponse.json({ error: 'Unsupported sport' }, { status: 404 });
  }

  try {
    const snapshot = await warmGenericSportSnapshot(sport, true);
    return NextResponse.json({
      ok: true,
      sport,
      lastUpdated: snapshot?.lastUpdated || snapshot?.snapshotUpdated || null,
      playerCount: snapshot?.playersCatalog?.players?.length || 0,
      liveGames: snapshot?.scoreboard?.filter?.((game) => game.state === 'in')?.length || 0,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, sport, error: error.message }, { status: 500 });
  }
}
