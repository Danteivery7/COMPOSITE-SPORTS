import { NextResponse } from 'next/server';
import { getWorldTopPlayers } from '@/src/lib/world-rankings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getWorldTopPlayers();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        players: [],
        error: error.message,
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
