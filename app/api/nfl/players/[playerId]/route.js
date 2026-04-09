import { NextResponse } from 'next/server';
import { getNFLPlayerDetail } from '@/src/lib/nfl';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { playerId } = await params;

  try {
    const data = await getNFLPlayerDetail(playerId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'nfl',
        playerId,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
