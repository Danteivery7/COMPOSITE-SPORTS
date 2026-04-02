import { NextResponse } from 'next/server';
import { isFootballLeague } from '@/src/lib/football';
import { getFootballLeagueSnapshot } from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { league } = await params;

  if (!isFootballLeague(league)) {
    return NextResponse.json({ error: 'Unsupported football league' }, { status: 404 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.trim().toLowerCase() || '';
    const snapshot = await getFootballLeagueSnapshot(league);
    const data = snapshot.playersCatalog || { players: [], lastUpdated: snapshot.lastUpdated };
    const players = query
      ? data.players.filter((player) => {
          const haystack = [
            player.displayName,
            player.shortName,
            player.team?.displayName,
            player.team?.abbreviation,
            player.position,
            player.competition,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(query);
        })
      : data.players;

    return NextResponse.json({
      ...data,
      players,
      query,
      totalReturned: players.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        league,
        error: error.message,
        players: [],
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
