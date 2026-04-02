import { cacheGet, cacheSet, CACHE_TTL } from '@/src/mlb/lib/cache';
import { normalizeEspnNewsArticle } from '@/src/lib/espn-news';

const MLB_NEWS_URL = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news';
const MLB_NEWS_CACHE_KEY = 'mlb_news_v1';
const MLB_NEWS_STALE_KEY = 'mlb_news_stale_v1';

export function normalizeArticle(article, index) {
    return normalizeEspnNewsArticle(article, {
        fallbackSource: 'ESPN',
        fallbackId: `mlb-news-${index}`,
    });
}

export async function fetchMLBNews() {
    const cached = cacheGet(MLB_NEWS_CACHE_KEY);
    if (cached) return cached;

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

        const result = {
            articles,
            lastUpdated: new Date().toISOString(),
        };

        cacheSet(MLB_NEWS_CACHE_KEY, result, CACHE_TTL.NEWS);
        cacheSet(MLB_NEWS_STALE_KEY, result, CACHE_TTL.NEWS * 6);
        return result;
    } catch (error) {
        const stale = cacheGet(MLB_NEWS_STALE_KEY);
        if (stale) return { ...stale, stale: true };
        throw error;
    }
}
