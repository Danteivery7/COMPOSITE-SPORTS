import { NextResponse } from 'next/server';
import { fetchEspnStoryDetail } from '@/src/lib/espn-news';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { storyId } = await params;
  const apiHref = request.nextUrl.searchParams.get('apiHref') || '';

  if (!storyId) {
    return NextResponse.json({ error: 'Missing story id' }, { status: 400 });
  }

  try {
    const story = await fetchEspnStoryDetail(storyId, apiHref);
    return NextResponse.json(story);
  } catch (error) {
    console.error('NHL story detail API error:', error);
    return NextResponse.json(
      {
        storyId,
        headline: 'Story unavailable',
        dek: 'This story could not be loaded right now.',
        body: '',
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
