import { NextResponse } from 'next/server';
import { getNFLFantasyRankings } from '@/src/lib/nfl';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getNFLFantasyRankings();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'nfl',
        error: error.message,
        players: [],
        news: [],
      },
      { status: 500 },
    );
  }
}
