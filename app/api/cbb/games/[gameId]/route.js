import { NextResponse } from 'next/server';
import { getCBBGameDetail } from '@/src/lib/cbb';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  try {
    const { gameId } = await params;
    const data = await getCBBGameDetail(gameId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'cbb',
        error: error.message,
      },
      { status: 500 },
    );
  }
}
