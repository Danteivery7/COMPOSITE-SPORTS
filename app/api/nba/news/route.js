import { NextResponse } from 'next/server';
import { getNbaNewsFeed } from '@/src/lib/nba-backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getNbaNewsFeed());
  } catch (error) {
    console.error('NBA news API error:', error);
    return NextResponse.json({ articles: [], lastUpdated: null, error: error.message }, { status: 500 });
  }
}
