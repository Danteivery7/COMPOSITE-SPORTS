import { NextResponse } from 'next/server';
import { getNFLGameDetail } from '@/src/lib/nfl';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { gameId } = await params;

  try {
    const data = await getNFLGameDetail(gameId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'nfl',
        gameId,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
