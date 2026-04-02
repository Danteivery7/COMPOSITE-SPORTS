import { NextResponse } from 'next/server';
import { isFootballLeague } from '@/src/lib/football';
import { warmFootballLeagueSnapshot } from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { league } = await params;

  if (!isFootballLeague(league)) {
    return NextResponse.json({ error: 'Unsupported football league' }, { status: 404 });
  }

  try {
    const snapshot = await warmFootballLeagueSnapshot(league, true);
    return NextResponse.json({
      ok: true,
      league,
      lastUpdated: snapshot?.lastUpdated || snapshot?.snapshotUpdated || null,
      playerCount: snapshot?.playersCatalog?.players?.length || 0,
      liveGames: snapshot?.scoreboard?.filter?.((game) => game.state === 'in')?.length || 0,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, league, error: error.message }, { status: 500 });
  }
}
