import { NextResponse } from 'next/server';
import { isGenericSport } from '@/src/lib/generic-sports';
import { getGenericSportSnapshot } from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { sport } = await params;

  if (!isGenericSport(sport)) {
    return NextResponse.json({ error: 'Unsupported sport' }, { status: 404 });
  }

  try {
    const data = await getGenericSportSnapshot(sport, {
      force: _request.nextUrl.searchParams.get('force') === '1',
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport,
        error: error.message,
        scoreboard: [],
        rankings: [],
        teams: [],
        news: [],
        featuredPlayers: [],
        predictors: [],
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
