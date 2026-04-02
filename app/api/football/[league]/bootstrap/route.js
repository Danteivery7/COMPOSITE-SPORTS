import { NextResponse } from 'next/server';
import { isFootballLeague } from '@/src/lib/football';
import { getFootballLeagueSnapshot } from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { league } = await params;

  if (!isFootballLeague(league)) {
    return NextResponse.json({ error: 'Unsupported football league' }, { status: 404 });
  }

  try {
    const data = await getFootballLeagueSnapshot(league, {
      force: _request.nextUrl.searchParams.get('force') === '1',
    });
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
