import { NextResponse } from 'next/server';
import { fetchEspnStoryDetail } from '@/src/lib/espn-news';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { storyId } = await params;
    const apiHref = request.nextUrl.searchParams.get('apiHref') || '';
    const story = await fetchEspnStoryDetail(storyId, apiHref);
    return NextResponse.json(story);
  } catch (error) {
    return NextResponse.json(
      {
        headline: 'Story unavailable',
        body: '<p>This story could not be loaded right now.</p>',
        related: [],
        error: error.message,
      },
      { status: 500 },
    );
  }
}
