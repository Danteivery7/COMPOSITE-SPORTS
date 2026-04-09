import { NextResponse } from 'next/server';
import { getFootballPredictor, isFootballLeague } from '@/src/lib/football';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { league } = await params;

  if (!isFootballLeague(league)) {
    return NextResponse.json({ error: 'Unsupported football league' }, { status: 404 });
  }

  try {
    const homeTeamId = request.nextUrl.searchParams.get('homeTeamId') || '';
    const awayTeamId = request.nextUrl.searchParams.get('awayTeamId') || '';
    const data = await getFootballPredictor({ leagueKey: league, homeTeamId, awayTeamId });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        league,
        error: error.message,
        predictors: [],
      },
      { status: 500 },
    );
  }
}
