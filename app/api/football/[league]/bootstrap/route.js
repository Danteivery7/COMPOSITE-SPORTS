import { NextResponse } from 'next/server';
import { getFootballBootstrap, isFootballLeague } from '@/src/lib/football';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { league } = await params;

  if (!isFootballLeague(league)) {
    return NextResponse.json({ error: 'Unsupported football league' }, { status: 404 });
  }

  try {
    const data = await getFootballBootstrap(league);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        league,
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
