import { NextResponse } from 'next/server';
import { getFootballGameDetail, isFootballLeague } from '@/src/lib/football';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { league, gameId } = await params;

  if (!isFootballLeague(league)) {
    return NextResponse.json({ error: 'Unsupported football league' }, { status: 404 });
  }

  try {
    const data = await getFootballGameDetail(league, gameId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        league,
        gameId,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
