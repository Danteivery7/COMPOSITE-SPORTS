import { NextResponse } from 'next/server';
import { getPlayerCatalog, isGenericSport } from '@/src/lib/generic-sports';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { sport } = await params;

  if (!isGenericSport(sport)) {
    return NextResponse.json({ error: 'Unsupported sport' }, { status: 404 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.trim().toLowerCase() || '';
    const data = await getPlayerCatalog(sport);
    const players = query
      ? data.players.filter((player) => {
          const haystack = [
            player.displayName,
            player.shortName,
            player.team?.displayName,
            player.team?.abbreviation,
            player.position,
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
        sport,
        error: error.message,
        players: [],
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
