import { NextResponse } from 'next/server';
import { getHubTrendingStories } from '@/src/lib/hub';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const data = await getHubTrendingStories({
      force: request.nextUrl.searchParams.get('force') === '1',
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        stories: [],
        error: error.message,
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
