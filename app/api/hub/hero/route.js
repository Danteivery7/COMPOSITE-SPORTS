import { NextResponse } from 'next/server';
import { getHubHero } from '@/src/lib/hub';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const data = await getHubHero({
      force: request.nextUrl.searchParams.get('force') === '1',
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        worldBoard: { players: [], lastUpdated: null },
        trendingStories: [],
        heroStories: [],
        secondaryStories: [],
        topBets: [],
        betLegs: [],
        parlay: null,
        parlaySummary: null,
        verifiedAt: null,
        cardSpotlights: {},
        liveTicker: [],
        error: error.message,
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
