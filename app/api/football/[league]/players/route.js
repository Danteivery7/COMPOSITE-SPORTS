import { NextResponse } from 'next/server';
import { getFootballPlayerCatalog, isFootballLeague } from '@/src/lib/football';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { league } = await params;

  if (!isFootballLeague(league)) {
    return NextResponse.json({ error: 'Unsupported football league' }, { status: 404 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.trim().toLowerCase() || '';
    const data = await getFootballPlayerCatalog(league);
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
