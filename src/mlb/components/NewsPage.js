'use client';

import { useMLBRouteData } from '@/src/mlb/lib/useMLBRouteData';

export default function NewsPage({ onStoryClick }) {
    const { data = { articles: [], lastUpdated: null }, loading, error, refresh } = useMLBRouteData('/api/mlb/news');
    const articles = (data?.articles || []).slice(0, 8);

    const formatTimestamp = (isoString) => {
        if (!isoString) return 'Never';
        return new Date(isoString).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });
    };

    const formatPublished = (isoString) => {
        if (!isoString) return 'ESPN';
        return new Date(isoString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title">Latest News</h1>
                    <p className="page-subtitle">Loading MLB headlines...</p>
                </div>
                <div className="news-grid">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="skeleton skeleton-card" style={{ height: '240px' }} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Latest News</h1>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <p className="page-subtitle">
                        ESPN MLB headlines and feature stories
                    </p>
                    <div className="last-updated">
                        <span>Updated: {formatTimestamp(data?.lastUpdated)}</span>
                        <span className="refresh-icon" onClick={refresh}></span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                    <p style={{ color: 'var(--accent-red)', fontSize: '13px' }}>⚠️ {error}</p>
                </div>
            )}

            {!articles.length ? (
                <div className="empty-state">
                    <div className="empty-icon"></div>
                    <h3>No News Available</h3>
                    <p>ESPN hasn&apos;t returned any MLB stories right now.</p>
                </div>
            ) : (
                <div className="news-grid">
                    {articles.map((article) => (
                        <button
                            key={article.id}
                            type="button"
                            onClick={() => onStoryClick?.(article)}
                            className="card news-card"
                        >
                            {article.image ? (
                                <img src={article.image} alt={article.headline} className="news-card-image" />
                            ) : (
                                <div className="news-card-image news-card-image-fallback">MLB</div>
                            )}
                            <div className="news-card-body">
                                <div className="news-card-meta">
                                    <span>{article.source || 'ESPN'}</span>
                                    <span>{formatPublished(article.published)}</span>
                                </div>
                                <h3>{article.headline}</h3>
                                {article.description ? <p>{article.description}</p> : null}
                                <span className="news-card-link">Open Story</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
