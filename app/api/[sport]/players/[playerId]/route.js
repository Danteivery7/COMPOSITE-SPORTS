import { NextResponse } from 'next/server';
import { getPlayerDetail, isGenericSport } from '@/src/lib/generic-sports';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { sport, playerId } = await params;

  if (!isGenericSport(sport)) {
    return NextResponse.json({ error: 'Unsupported sport' }, { status: 404 });
  }

  try {
    const data = await getPlayerDetail(sport, playerId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport,
        playerId,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
