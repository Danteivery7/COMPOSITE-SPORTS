import { NextResponse } from 'next/server';
import { getFootballLanding } from '@/src/lib/football';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getFootballLanding();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        title: 'Composite Football',
        subtitle: 'Football landing board is still syncing.',
        topMatches: [],
        leagues: [],
        error: error.message,
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
