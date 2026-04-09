import { NextResponse } from 'next/server';
import { getNFLPlayerCatalog } from '@/src/lib/nfl';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const query = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() || '';
    const catalog = await getNFLPlayerCatalog();
    const players = query
      ? catalog.players.filter((player) => {
          const haystack = [
            player.displayName,
            player.shortName,
            player.team?.displayName,
            player.team?.abbreviation,
            player.position,
            player.positionGroup,
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
        sport: 'nfl',
        error: error.message,
        players: [],
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
