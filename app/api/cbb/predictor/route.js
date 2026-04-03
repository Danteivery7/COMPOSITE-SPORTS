import { NextResponse } from 'next/server';
import { getCBBPredictor } from '@/src/lib/cbb';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const homeTeamId = request.nextUrl.searchParams.get('homeTeamId') || '';
    const awayTeamId = request.nextUrl.searchParams.get('awayTeamId') || '';
    const data = await getCBBPredictor({ homeTeamId, awayTeamId });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'cbb',
        error: error.message,
        predictors: [],
      },
      { status: 500 },
    );
  }
}
