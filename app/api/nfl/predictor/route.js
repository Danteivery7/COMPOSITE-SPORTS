import { NextResponse } from 'next/server';
import { getNFLBootstrap, getNFLPredictor } from '@/src/lib/nfl';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const homeTeamId = request.nextUrl.searchParams.get('homeTeamId') || '';
    const awayTeamId = request.nextUrl.searchParams.get('awayTeamId') || '';
    const data =
      homeTeamId && awayTeamId
        ? await getNFLPredictor(homeTeamId, awayTeamId)
        : { predictors: (await getNFLBootstrap()).predictors || [], lastUpdated: new Date().toISOString() };

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'nfl',
        error: error.message,
        predictors: [],
      },
      { status: 500 },
    );
  }
}
