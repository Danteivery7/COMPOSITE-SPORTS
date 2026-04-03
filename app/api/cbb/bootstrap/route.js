import { NextResponse } from 'next/server';
import { getCBBBootstrap } from '@/src/lib/cbb';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const data = await getCBBBootstrap({
      force: request.nextUrl.searchParams.get('force') === '1',
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'cbb',
        error: error.message,
        scoreboard: [],
        rankings: [],
        teams: [],
        news: [],
        featuredPlayers: [],
        predictors: [],
        playersCatalog: { players: [], lastUpdated: null },
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
