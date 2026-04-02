import { NextResponse } from 'next/server';
import { getSportBootstrap, isGenericSport } from '@/src/lib/generic-sports';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { sport } = await params;

  if (!isGenericSport(sport)) {
    return NextResponse.json({ error: 'Unsupported sport' }, { status: 404 });
  }

  try {
    const data = await getSportBootstrap(sport);
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
