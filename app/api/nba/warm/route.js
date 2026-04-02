import { NextResponse } from 'next/server';
import { getNbaWarmState, warmNbaSnapshot } from '@/src/lib/nba-backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await warmNbaSnapshot(true);
    return NextResponse.json(await getNbaWarmState());
  } catch (error) {
    console.error('NBA warm API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
