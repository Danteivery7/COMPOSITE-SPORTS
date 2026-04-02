import { NextResponse } from 'next/server';
import { getNbaBootstrapSnapshot, warmNbaSnapshot } from '@/src/lib/nba-backend';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    if (request.nextUrl.searchParams.get('force') === '1') {
      await warmNbaSnapshot(true);
    }
    const snapshot = await getNbaBootstrapSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('NBA bootstrap API error:', error);
    return NextResponse.json(
      {
        games: [],
        news: [],
        teams: [],
        teamStats: {},
        teamDetailedStats: {},
        teamRecentForm: {},
        rosters: {},
        playerCatalog: [],
        playerMeta: { totalPlayers: 0, officialPlayerCount: 0, syncingPlayerCount: 0 },
        lastUpdated: null,
        warmState: { isWarming: false, isFresh: false },
        error: error.message,
      },
      { status: 500 },
    );
  }
}
