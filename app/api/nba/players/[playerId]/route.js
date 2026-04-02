import { NextResponse } from 'next/server';
import { getNbaPlayerSnapshot } from '@/src/lib/nba-backend';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const playerId = params?.playerId;

  if (!playerId) {
    return NextResponse.json({ error: 'Missing player id' }, { status: 400 });
  }

  try {
    const player = await getNbaPlayerSnapshot(playerId);
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }
    return NextResponse.json(player);
  } catch (error) {
    console.error('NBA player detail API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
