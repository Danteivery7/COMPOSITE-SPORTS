import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MLB_NEWS_URL = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news';

function normalizeArticle(article, index) {
    const image = article?.images?.[0] || article?.thumbnail;
    const link = article?.links?.web?.href || article?.links?.mobile?.href || article?.link || null;

    return {
        id: article?.id || article?.guid || `mlb-news-${index}`,
        headline: article?.headline || 'MLB Update',
        description: article?.description || article?.story || '',
        published: article?.published || article?.lastModified || null,
        source: article?.source || 'ESPN',
        byline: article?.byline || '',
        image: image?.url || image?.href || null,
        link,
    };
}

export async function GET() {
    try {
        const response = await fetch(MLB_NEWS_URL, {
            cache: 'no-store',
            headers: { 'User-Agent': 'CompositeMLB/1.0' },
        });

        if (!response.ok) {
            throw new Error(`MLB news request failed with ${response.status}`);
        }

        const data = await response.json();
        const articles = Array.isArray(data?.articles)
            ? data.articles.map(normalizeArticle).filter((article) => article.link)
            : [];

        return NextResponse.json({
            articles,
            lastUpdated: new Date().toISOString(),
        });
    } catch (error) {
        console.error('MLB news API error:', error);
        return NextResponse.json(
            {
                articles: [],
                error: error.message,
                lastUpdated: null,
            },
            { status: 500 }
        );
    }
}
