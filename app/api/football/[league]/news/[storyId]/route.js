import { NextResponse } from 'next/server';
import { fetchEspnStoryDetail } from '@/src/lib/espn-news';
import { isFootballLeague } from '@/src/lib/football';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { league, storyId } = await params;

  if (!isFootballLeague(league)) {
    return NextResponse.json({ error: 'Unsupported league' }, { status: 404 });
  }

  try {
    const apiHref = request.nextUrl.searchParams.get('apiHref') || '';
    const story = await fetchEspnStoryDetail(storyId, apiHref);
    return NextResponse.json(story);
  } catch (error) {
    return NextResponse.json(
      {
        storyId,
        headline: 'Story unavailable',
        dek: '',
        body: '<p>This story could not be loaded right now.</p>',
        published: null,
        byline: 'ESPN',
        source: 'ESPN',
        image: '',
        contentType: 'Story',
        related: [],
        error: error.message,
      },
      { status: 500 },
    );
  }
}
