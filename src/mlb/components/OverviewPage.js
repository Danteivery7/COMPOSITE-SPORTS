'use client';

import { useEffect, useRef, useState } from 'react';

function formatTime(isoString) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatTimestamp(isoString) {
    if (!isoString) return 'Never';
    return new Date(isoString).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
}

function getGameStatusLabel(game) {
    const now = Date.now();
    const start = game.startTime ? new Date(game.startTime).getTime() : null;
    const minsUntil = start ? (start - now) / 60000 : null;

    if (game.state === 'in') return game.shortDetail || game.statusDetail || 'Live';
    if (game.state === 'post') return 'Final';
    if (minsUntil !== null && minsUntil <= 5 && minsUntil > 0) return 'About to start';
    if (minsUntil !== null && minsUntil <= 30 && minsUntil > 0) return 'Starting soon';
    return formatTime(game.startTime);
}

export default function OverviewPage({ onTeamClick, onPlayerClick, onGameClick }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const timerRef = useRef(null);

    const fetchOverview = async () => {
        try {
            const res = await fetch('/api/mlb/overview');
            if (!res.ok) throw new Error('Failed to fetch overview');
            const json = await res.json();
            setData(json);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOverview();
        timerRef.current = setInterval(fetchOverview, 60000);
        return () => clearInterval(timerRef.current);
    }, []);

    if (loading) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title">Overview</h1>
                    <p className="page-subtitle">Loading today&apos;s composite board...</p>
                </div>
                <div className="overview-grid">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="skeleton skeleton-card" style={{ height: i === 0 ? '220px' : '180px' }} />
                    ))}
                </div>
            </div>
        );
    }

    const scores = data?.scores || [];
    const news = data?.news || [];
    const topTeams = data?.topTeams || [];
    const trendingPlayers = data?.trendingPlayers || [];
    const bestEdges = data?.bestEdges || [];
    const pick = data?.pickOfTheDay || null;

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Overview</h1>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <p className="page-subtitle">
                        Daily composite dashboard with scores, edges, news, and player heat
                    </p>
                    <div className="last-updated">
                        <span>Updated: {formatTimestamp(data?.lastUpdated)}</span>
                        <span className="refresh-icon" onClick={fetchOverview}></span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                    <p style={{ color: 'var(--accent-red)', fontSize: '13px' }}>⚠️ {error}</p>
                </div>
            )}

            <div className="overview-grid">
                <section className="card overview-hero">
                    <div className="overview-hero-copy">
                        <span className="overview-kicker">Pick of the Day</span>
                        <h2>{pick?.title || 'No official play'}</h2>
                        <p>{pick?.summary || 'Today’s strongest MLB edge will appear here once the board settles.'}</p>
                        {pick?.lean ? (
                            <div className="overview-pick-tags">
                                <span className={`overview-chip ${pick.hasOfficialPick ? 'success' : 'muted'}`}>
                                    {pick.hasOfficialPick ? 'Official play' : 'Strongest lean'}
                                </span>
                                <span className="overview-chip">{pick.lean.matchup}</span>
                                <span className="overview-chip">{pick.lean.winPct.toFixed(1)}% model win</span>
                                <span className="overview-chip">{pick.lean.projectedScore}</span>
                            </div>
                        ) : null}
                    </div>
                    <div className="overview-hero-stats">
                        <div className="mini-stat-card">
                            <div className="msc-value">{scores.filter((game) => game.state === 'in').length}</div>
                            <div className="msc-label">Live games</div>
                        </div>
                        <div className="mini-stat-card">
                            <div className="msc-value">{bestEdges.length}</div>
                            <div className="msc-label">Model leans</div>
                        </div>
                        <div className="mini-stat-card">
                            <div className="msc-value">{topTeams[0]?.abbr || '--'}</div>
                            <div className="msc-label">Top team</div>
                        </div>
                    </div>
                </section>

                <section className="card overview-section">
                    <div className="overview-section-head">
                        <h3>Scores Snapshot</h3>
                        <button className="filter-btn active" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Today</button>
                    </div>
                    {!scores.length ? (
                        <div className="empty-state">
                            <div className="empty-icon"></div>
                            <h3>No Games Right Now</h3>
                        </div>
                    ) : (
                        <div className="overview-list">
                            {scores.map((game) => (
                                <button
                                    key={game.id}
                                    className="overview-row-btn"
                                    onClick={() => onGameClick && onGameClick(game.id)}
                                >
                                    <div>
                                        <div className="overview-row-title">{game.away?.abbr} @ {game.home?.abbr}</div>
                                        <div className="overview-row-subtitle">{getGameStatusLabel(game)}</div>
                                    </div>
                                    <div className="overview-scoreline">
                                        <span>{game.away?.score ?? '-'}</span>
                                        <span>{game.home?.score ?? '-'}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                <section className="card overview-section">
                    <div className="overview-section-head">
                        <h3>Top Teams</h3>
                        <button className="filter-btn active" onClick={() => onTeamClick && topTeams[0] && onTeamClick(topTeams[0].id)}>Open #1</button>
                    </div>
                    {!topTeams.length ? (
                        <div className="empty-state">
                            <div className="empty-icon"></div>
                            <h3>Team Rankings Loading</h3>
                        </div>
                    ) : (
                        <div className="overview-list">
                            {topTeams.map((team) => (
                                <button
                                    key={team.id}
                                    className="overview-row-btn"
                                    onClick={() => onTeamClick && onTeamClick(team.id)}
                                >
                                    <div>
                                        <div className="overview-row-title">#{team.ovrRank} {team.fullName}</div>
                                        <div className="overview-row-subtitle">{team.wins}-{team.losses} · {team.streak}</div>
                                    </div>
                                    <div className="overview-metric-stack">
                                        <strong>{team.ovrScore?.toFixed?.(1) || team.ovrScore}</strong>
                                        <span>OVR</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                <section className="card overview-section overview-span-2">
                    <div className="overview-section-head">
                        <h3>Trending News</h3>
                        <button className="filter-btn active" onClick={() => window.open('/mlb', '_self')}>Full App</button>
                    </div>
                    {!news.length ? (
                        <div className="empty-state">
                            <div className="empty-icon"></div>
                            <h3>No Stories Available</h3>
                        </div>
                    ) : (
                        <div className="news-grid">
                            {news.map((article) => (
                                <a key={article.id} href={article.link} target="_blank" rel="noreferrer" className="card news-card">
                                    {article.image ? (
                                        <img src={article.image} alt={article.headline} className="news-card-image" />
                                    ) : (
                                        <div className="news-card-image news-card-image-fallback">MLB</div>
                                    )}
                                    <div className="news-card-body">
                                        <div className="news-card-meta">
                                            <span>{article.source || 'ESPN'}</span>
                                            <span>{formatTime(article.published)}</span>
                                        </div>
                                        <h3>{article.headline}</h3>
                                        {article.description ? <p>{article.description}</p> : null}
                                        <span className="news-card-link">Open Story</span>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </section>

                <section className="card overview-section">
                    <div className="overview-section-head">
                        <h3>Trending Players</h3>
                        <button className="filter-btn active" onClick={() => onPlayerClick && trendingPlayers[0] && onPlayerClick(trendingPlayers[0].id)}>Open #1</button>
                    </div>
                    {!trendingPlayers.length ? (
                        <div className="empty-state">
                            <div className="empty-icon"></div>
                            <h3>No Players Heating Up Yet</h3>
                        </div>
                    ) : (
                        <div className="overview-list">
                            {trendingPlayers.map((player) => (
                                <button
                                    key={player.id}
                                    className="overview-row-btn"
                                    onClick={() => onPlayerClick && onPlayerClick(player.id)}
                                >
                                    <div className="overview-player-meta">
                                        <img
                                            src={player.headshot}
                                            alt={player.name}
                                            className="player-headshot"
                                            onError={(e) => { e.target.src = 'https://a.espncdn.com/i/headshots/nophoto.png'; }}
                                        />
                                        <div>
                                            <div className="overview-row-title">{player.name}</div>
                                            <div className="overview-row-subtitle">{player.teamAbbr} · {player.position}</div>
                                        </div>
                                    </div>
                                    <div className="overview-metric-stack">
                                        <strong>{player.rating}</strong>
                                        <span>OVR</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                <section className="card overview-section">
                    <div className="overview-section-head">
                        <h3>Best Model Edges</h3>
                        <button className="filter-btn active" onClick={() => onGameClick && bestEdges[0] && onGameClick(bestEdges[0].gameId)}>Open Best</button>
                    </div>
                    {!bestEdges.length ? (
                        <div className="empty-state">
                            <div className="empty-icon"></div>
                            <h3>No Pregame Edges Yet</h3>
                        </div>
                    ) : (
                        <div className="overview-list">
                            {bestEdges.map((edge) => (
                                <button
                                    key={`${edge.gameId}-${edge.leanTeamId}`}
                                    className="overview-row-btn"
                                    onClick={() => onGameClick && onGameClick(edge.gameId)}
                                >
                                    <div>
                                        <div className="overview-row-title">{edge.leanAbbr} lean vs {edge.fadeTeam}</div>
                                        <div className="overview-row-subtitle">{edge.matchup} · {edge.confidence} confidence</div>
                                    </div>
                                    <div className="overview-metric-stack">
                                        <strong>{edge.winPct.toFixed(1)}%</strong>
                                        <span>Model</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
