import { NextResponse } from 'next/server';
import { getNFLSnapshot } from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const data = await getNFLSnapshot({
      force: request.nextUrl.searchParams.get('force') === '1',
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'nfl',
        error: error.message,
        scoreboard: [],
        rankings: [],
        teams: [],
        news: [],
        fantasyNews: [],
        featuredPlayers: [],
        fantasyRankings: [],
        predictors: [],
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
