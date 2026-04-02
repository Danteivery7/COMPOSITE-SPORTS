import { NextResponse } from 'next/server';
import { getFootballPlayerDetail, isFootballLeague } from '@/src/lib/football';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { league, playerId } = await params;

  if (!isFootballLeague(league)) {
    return NextResponse.json({ error: 'Unsupported football league' }, { status: 404 });
  }

  try {
    const data = await getFootballPlayerDetail(league, playerId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        league,
        playerId,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
