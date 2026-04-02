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

  if (loading && !data) {
    return (
      <div className="page-container">
        <div className="skeleton skeleton-card" style={{ height: '480px' }} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <StoryDetailCard
        story={data}
        onBack={onBack}
        backLabel="Back to news"
        onOpenRelated={(nextStory) => onStoryClick?.(nextStory)}
      />
    </div>
  );
}
