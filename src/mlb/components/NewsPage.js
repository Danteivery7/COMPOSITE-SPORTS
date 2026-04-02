'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchMLBRouteJson } from '@/src/mlb/lib/clientPrefetch';

export default function NewsPage() {
    const [data, setData] = useState({ articles: [], lastUpdated: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const timerRef = useRef(null);

    const fetchNews = async (force = false) => {
        try {
            const json = await fetchMLBRouteJson('/api/mlb/news', { force });
            setData(json);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNews();
        timerRef.current = setInterval(() => fetchNews(true), 300000);
        return () => clearInterval(timerRef.current);
    }, []);

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
                    {[...Array(6)].map((_, i) => (
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
                        <span className="refresh-icon" onClick={() => fetchNews(true)}></span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                    <p style={{ color: 'var(--accent-red)', fontSize: '13px' }}>⚠️ {error}</p>
                </div>
            )}

            {!data?.articles?.length ? (
                <div className="empty-state">
                    <div className="empty-icon"></div>
                    <h3>No News Available</h3>
                    <p>ESPN hasn&apos;t returned any MLB stories right now.</p>
                </div>
            ) : (
                <div className="news-grid">
                    {data.articles.map((article) => (
                        <a
                            key={article.id}
                            href={article.link}
                            target="_blank"
                            rel="noreferrer"
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
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
