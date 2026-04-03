import { NextResponse } from 'next/server';
import { getFootballLandingSnapshot } from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getFootballLandingSnapshot();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        title: 'Composite Football',
        subtitle: 'Football landing board is still syncing.',
        topMatches: [],
        topPlayers: [],
        leagues: [],
        error: error.message,
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
