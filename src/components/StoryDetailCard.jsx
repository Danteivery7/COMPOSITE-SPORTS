'use client';

import { useRef } from 'react';

function StoryMediaPlayer({ media, headline, fallbackImage }) {
  const videoRef = useRef(null);
  if (!media) return null;

  if (media.kind === 'video' && media.src) {
    return (
      <div className="story-detail-media">
        <video
          ref={videoRef}
          className="story-detail-video"
          controls
          playsInline
          preload="metadata"
          poster={media.poster || fallbackImage || ''}
        >
          <source src={media.src} type={media.mimeType || undefined} />
        </video>
        <div className="story-detail-media-controls">
          <button type="button" onClick={() => videoRef.current && (videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10))}>
            -10s
          </button>
          <button type="button" onClick={() => {
            if (!videoRef.current) return;
            if (videoRef.current.paused) {
              void videoRef.current.play();
              return;
            }
            videoRef.current.pause();
          }}
          >
            Play / Pause
          </button>
          <button type="button" onClick={() => videoRef.current && (videoRef.current.currentTime += 10)}>
            +10s
          </button>
        </div>
      </div>
    );
  }

  if (media.kind === 'embed' && media.embedUrl) {
    return (
      <div className="story-detail-media">
        <div className="story-detail-embed">
          <iframe
            src={media.embedUrl}
            title={headline || 'Story video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  return null;
}

export default function StoryDetailCard({ story, onBack, backLabel = 'Back', onOpenRelated }) {
  return (
    <section className="story-detail-shell">
      <div className="story-detail-back-bar">
        <button className="generic-back-button story-detail-back" type="button" onClick={onBack}>
          ← {backLabel}
        </button>
      </div>

      <article className="generic-card story-detail-card">
        <div className="story-detail-head">
          <div className="story-detail-heading">
            <p className="eyebrow story-detail-source">{story?.source || 'ESPN'}</p>
            <h2>{story?.headline || 'Story unavailable'}</h2>
            <div className="story-detail-meta">
              <span>{story?.contentType || 'Story'}</span>
              {story?.published ? <span>{new Date(story.published).toLocaleString()}</span> : null}
              {story?.byline ? <span>{story.byline}</span> : null}
            </div>
          </div>
        </div>

        {story?.media ? (
          <StoryMediaPlayer media={story.media} headline={story.headline} fallbackImage={story.image} />
        ) : story?.image ? (
          <img src={story.image} alt={story.headline} className="story-detail-image" />
        ) : null}

        {story?.dek ? <p className="story-detail-dek">{story.dek}</p> : null}

        <div
          className="story-detail-body"
          dangerouslySetInnerHTML={{ __html: story?.body || '<p>No story body available.</p>' }}
        />
      </article>

      {story?.related?.length ? (
        <article className="generic-card story-detail-card">
          <div className="story-detail-head">
            <div>
              <p className="eyebrow">Related</p>
              <h3>More From The Feed</h3>
            </div>
          </div>
          <div className="story-related-grid">
            {story.related.slice(0, 4).map((item) => (
              <button
                className="story-related-card"
                key={item.storyId || item.id}
                type="button"
                onClick={() => onOpenRelated?.(item)}
              >
                {item.image ? <img src={item.image} alt={item.headline} className="story-related-image" /> : null}
                <div className="story-related-copy">
                  <strong>{item.headline}</strong>
                  <span>{item.contentType || 'Story'}</span>
                </div>
              </button>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
