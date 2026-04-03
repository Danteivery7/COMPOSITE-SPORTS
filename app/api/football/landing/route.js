import { NextResponse } from 'next/server';
import { getFootballLanding } from '@/src/lib/football';
import { getFootballLandingSnapshot } from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const data = await getFootballLandingSnapshot({
      force: request.nextUrl.searchParams.get('force') === '1',
    });
    return NextResponse.json(data);
  } catch (error) {
    try {
      const rebuilt = await getFootballLanding();
      return NextResponse.json({
        ...rebuilt,
        warning: error.message,
      });
    } catch (fallbackError) {
      return NextResponse.json(
        {
          title: 'Composite Football',
          subtitle: 'Football landing board is still syncing.',
          topMatches: [],
          topPlayers: [],
          leagues: [],
          error: fallbackError.message || error.message,
          lastUpdated: null,
        },
        { status: 500 },
      );
    }
  }
}
