import { NextResponse } from 'next/server';
import { getCBBPlayerDetail } from '@/src/lib/cbb';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  try {
    const { playerId } = await params;
    const data = await getCBBPlayerDetail(playerId);
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
