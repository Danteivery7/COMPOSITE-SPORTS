'use client';

import StoryDetailCard from '@/src/components/StoryDetailCard';
import { useMLBRouteData } from '@/src/mlb/lib/useMLBRouteData';

export default function NewsStoryPage({ story, onBack, onStoryClick }) {
  const storyId = story?.storyId;
  const apiHref = story?.apiHref || '';
  const { data, loading } = useMLBRouteData(
    storyId ? `/api/mlb/news/${storyId}?apiHref=${encodeURIComponent(apiHref)}` : '',
    { enabled: Boolean(storyId) },
  );

  if (!storyId) {
    return (
      <div className="page-container">
        <StoryDetailCard
          story={{
            headline: 'Story unavailable',
            body: '<p>This story could not be opened.</p>',
            source: 'ESPN',
          }}
          onBack={onBack}
          backLabel="Back to news"
        />
      </div>
    );
  }

  const resolvedStory = data || {
    storyId,
    headline: story?.headline || 'Loading story…',
    dek: story?.description || '',
    body: `<p>${story?.description || 'Loading story…'}</p>`,
    source: story?.source || 'ESPN',
    byline: story?.byline || story?.source || 'ESPN',
    published: story?.published || null,
    image: story?.image || '',
    contentType: story?.contentType || 'Story',
    related: [],
  };

  return (
    <div className="page-container">
      <StoryDetailCard
        story={resolvedStory}
        onBack={onBack}
        backLabel="Back to news"
        onOpenRelated={(nextStory) => onStoryClick?.(nextStory)}
      />
    </div>
  );
}
