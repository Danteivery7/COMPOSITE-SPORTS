import { NextResponse } from 'next/server';
import { getHubTopBets } from '@/src/lib/hub';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const data = await getHubTopBets({
      force: request.nextUrl.searchParams.get('force') === '1',
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        bets: [],
        betLegs: [],
        parlay: null,
        parlaySummary: null,
        verifiedAt: null,
        error: error.message,
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
