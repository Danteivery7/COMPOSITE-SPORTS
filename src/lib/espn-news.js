const DETAIL_CACHE = new Map();

function readCache(key) {
  const entry = DETAIL_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    DETAIL_CACHE.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value, ttlMs) {
  DETAIL_CACHE.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

function normalizeApiUrl(url) {
  if (!url) return '';
  return String(url).replace('http://', 'https://').replace('.pvt', '.com');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripUnsupportedHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<video\d*><\/video\d*>/gi, '')
    .replace(/<p>\s*<video\d*>\s*<\/p>/gi, '')
    .replace(/<img[^>]*greyline[^>]*>/gi, '<hr />')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<span\b[^>]*>/gi, '<span>')
    .replace(/<[^>]+\s(on\w+)=["'][^"']*["'][^>]*>/gi, (match) => match.replace(/\s(on\w+)=["'][^"']*["']/gi, ''))
    .trim();
}

function guessDetailUrl(storyId) {
  return [
    `https://content.core.api.espn.com/v1/sports/news/${storyId}`,
    `https://content.core.api.espn.com/v1/video/clips/${storyId}`,
  ];
}

async function fetchJson(url) {
  const response = await fetch(normalizeApiUrl(url), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function normalizeRelated(items = []) {
  return items
    .map((item, index) => normalizeEspnNewsArticle(item, { fallbackSource: item?.source || 'ESPN', fallbackId: `related-${index}` }))
    .filter((item) => item.storyId);
}

function buildStoryDetailFromHeadline(headline, storyId) {
  const primaryImage = headline?.images?.[0] || headline?.thumbnail || headline?.image || null;
  return {
    storyId: String(headline?.id || storyId),
    headline: headline?.headline || headline?.title || 'ESPN Story',
    dek: headline?.description || '',
    body: stripUnsupportedHtml(headline?.story || headline?.description || ''),
    published: headline?.published || headline?.originallyPosted || headline?.lastModified || null,
    byline: headline?.byline || headline?.source || 'ESPN',
    source: headline?.source || 'ESPN',
    image: primaryImage?.url || primaryImage?.href || '',
    contentType: headline?.type || 'Story',
    related: normalizeRelated(headline?.related || headline?.videos || []),
  };
}

function buildStoryDetailFromVideo(video, storyId) {
  const poster = video?.posterImages?.full?.href || video?.thumbnail || video?.images?.[0]?.url || '';
  const description = video?.description || video?.caption || video?.headline || '';
  return {
    storyId: String(video?.id || storyId),
    headline: video?.headline || video?.title || 'ESPN Video',
    dek: description,
    body: stripUnsupportedHtml(`<p>${escapeHtml(description)}</p>`),
    published: video?.originalPublishDate || video?.lastModified || null,
    byline: video?.source || 'ESPN',
    source: video?.source || 'ESPN',
    image: poster,
    contentType: video?.type || 'Media',
    related: [],
  };
}

export function normalizeEspnNewsArticle(article, { fallbackSource = 'ESPN', fallbackId = null } = {}) {
  const image = article?.images?.[0] || article?.thumbnail || article?.image || null;
  const storyId = String(article?.id || article?.guid || fallbackId || '');
  return {
    id: storyId || String(fallbackId || article?.headline || ''),
    storyId,
    apiHref: normalizeApiUrl(article?.links?.api?.self?.href || ''),
    contentType: article?.type || 'Story',
    headline: article?.headline || article?.title || 'ESPN Story',
    description: article?.description || article?.story || article?.caption || '',
    published: article?.published || article?.originallyPosted || article?.lastModified || null,
    source: article?.source || fallbackSource,
    byline: article?.byline || article?.source || fallbackSource,
    image: image?.url || image?.href || '',
    link: normalizeApiUrl(article?.links?.web?.href || article?.links?.mobile?.href || article?.link || ''),
  };
}

export async function fetchEspnStoryDetail(storyId, apiHref = '') {
  const cacheKey = `story:${storyId}:${apiHref || 'auto'}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const urls = apiHref ? [normalizeApiUrl(apiHref), ...guessDetailUrl(storyId)] : guessDetailUrl(storyId);

  let lastError = null;
  for (const url of urls) {
    if (!url) continue;
    try {
      const payload = await fetchJson(url);
      if (Array.isArray(payload?.headlines) && payload.headlines[0]) {
        return writeCache(cacheKey, buildStoryDetailFromHeadline(payload.headlines[0], storyId), 15 * 60 * 1000);
      }
      if (Array.isArray(payload?.videos) && payload.videos[0]) {
        return writeCache(cacheKey, buildStoryDetailFromVideo(payload.videos[0], storyId), 15 * 60 * 1000);
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Unable to load story ${storyId}`);
}
