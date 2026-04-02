import { NextResponse } from 'next/server';
import { normalizeEspnNewsArticle } from '@/src/lib/espn-news';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch NHL news: ${response.status}`);
    }

    const payload = await response.json();
    const articles = (payload?.articles || [])
      .map((article, index) => normalizeEspnNewsArticle(article, { fallbackSource: 'ESPN', fallbackId: `nhl-news-${index}` }))
      .filter((article) => article.storyId);

    return NextResponse.json(articles);
  } catch (error) {
    console.error('NHL news API error:', error);
    return NextResponse.json([], { status: 500 });
  }
}
