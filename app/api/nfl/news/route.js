import { NextResponse } from 'next/server';
import { getNFLNews } from '@/src/lib/nfl';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const news = await getNFLNews();
    return NextResponse.json({
      sport: 'nfl',
      news,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'nfl',
        error: error.message,
        news: [],
      },
      { status: 500 },
    );
  }
}
