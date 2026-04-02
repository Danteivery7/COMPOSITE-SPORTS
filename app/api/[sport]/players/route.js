import { NextResponse } from 'next/server';
import { isGenericSport } from '@/src/lib/generic-sports';
import { getGenericSportSnapshot } from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { sport } = await params;

  if (!isGenericSport(sport)) {
    return NextResponse.json({ error: 'Unsupported sport' }, { status: 404 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.trim().toLowerCase() || '';
    const snapshot = await getGenericSportSnapshot(sport);
    const catalog = snapshot.playersCatalog || { players: [], lastUpdated: snapshot.lastUpdated };
    const players = query
      ? catalog.players.filter((player) => {
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
      : catalog.players;

    return NextResponse.json({
      ...catalog,
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
