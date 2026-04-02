import { NextResponse } from 'next/server';
import { getGameDetail, isGenericSport } from '@/src/lib/generic-sports';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { sport, gameId } = await params;

  if (!isGenericSport(sport)) {
    return NextResponse.json({ error: 'Unsupported sport' }, { status: 404 });
  }

  try {
    const data = await getGameDetail(sport, gameId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport,
        gameId,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
