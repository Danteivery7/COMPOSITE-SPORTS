import { NextResponse } from 'next/server';
import { getNbaPlayerCatalog } from '@/src/lib/nba-backend';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const query = request.nextUrl.searchParams.get('q') || '';
    const players = await getNbaPlayerCatalog(query);
    return NextResponse.json({ players, lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error('NBA players API error:', error);
    return NextResponse.json({ players: [], lastUpdated: null, error: error.message }, { status: 500 });
  }
}
