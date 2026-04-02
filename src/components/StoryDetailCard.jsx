'use client';

export default function StoryDetailCard({ story, onBack, backLabel = 'Back', onOpenRelated }) {
  return (
    <section className="story-detail-shell">
      <button className="generic-back-button story-detail-back" type="button" onClick={onBack}>
        {backLabel}
      </button>

      <article className="generic-card story-detail-card">
        <div className="story-detail-head">
          <div>
            <p className="eyebrow">{story?.source || 'ESPN'}</p>
            <h2>{story?.headline || 'Story unavailable'}</h2>
            <div className="story-detail-meta">
              <span>{story?.contentType || 'Story'}</span>
              {story?.published ? <span>{new Date(story.published).toLocaleString()}</span> : null}
              {story?.byline ? <span>{story.byline}</span> : null}
            </div>
          </div>
        </div>

        {story?.image ? (
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
                <div>
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
