'use client';

import { useMLBRouteData } from '@/src/mlb/lib/useMLBRouteData';

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

function getTeamLogo(team) {
    if (!team) return '';
    if (team.logo) return team.logo;
    const logoAbbr = (team.logoAbbr || team.abbr || team.abbreviation || '').toLowerCase();
    return logoAbbr ? `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${logoAbbr}.png` : '';
}

function TeamBadge({ team, size = 'md' }) {
    const logo = getTeamLogo(team);
    const className = size === 'lg' ? 'overview-team-logo is-lg' : 'overview-team-logo';

    if (!logo) {
        return <span className={`${className} is-fallback`}>{team?.abbr || team?.abbreviation || 'MLB'}</span>;
    }

    return <img src={logo} alt={team?.fullName || team?.name || team?.displayName || team?.abbr || 'Team'} className={className} />;
}

export default function OverviewPage({ onTeamClick, onPlayerClick, onGameClick, onStoryClick }) {
    const { data, loading, error, refresh } = useMLBRouteData('/api/mlb/overview');

    if (loading) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title">Overview</h1>
                    <p className="page-subtitle">Loading today&apos;s composite board...</p>
                </div>
                <div className="overview-grid">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="skeleton skeleton-card" style={{ height: i === 0 ? '320px' : '210px' }} />
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
    const featuredGame = scores[0] || null;
    const featuredTeam = topTeams[0] || null;
    const featuredPlayer = trendingPlayers[0] || null;
    const featuredStory = news[0] || null;
    const moreStories = news.slice(1, 3);

    return (
        <div className="page-container">
            <div className="page-header overview-page-header">
                <div>
                    <h1 className="page-title">Overview</h1>
                    <p className="page-subtitle">
                        Daily composite dashboard with live matchups, hot players, top clubs, and the sharpest baseball edge on the board.
                    </p>
                </div>
                <div className="last-updated">
                    <span>Updated: {formatTimestamp(data?.lastUpdated)}</span>
                    <span className="refresh-icon" onClick={refresh}></span>
                </div>
            </div>

            {error && (
                <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                    <p style={{ color: 'var(--accent-red)', fontSize: '13px' }}>⚠️ {error}</p>
                </div>
            )}

            <div className="overview-grid">
                <section className="card overview-hero overview-hero-main">
                    <div className="overview-hero-copy">
                        <span className="overview-kicker">Pick of the Day</span>
                        <h2>{pick?.title || 'No official play yet'}</h2>
                        <p>{pick?.summary || 'Today’s strongest MLB edge will settle here once the schedule and model line up.'}</p>
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

                        {featuredGame ? (
                            <button className="overview-hero-matchup" onClick={() => onGameClick && onGameClick(featuredGame.id)}>
                                <div className="overview-hero-matchup-head">
                                    <span className="overview-kicker">Featured Matchup</span>
                                    <span>{getGameStatusLabel(featuredGame)}</span>
                                </div>
                                <div className="overview-hero-matchup-rows">
                                    {[featuredGame.away, featuredGame.home].map((team) => (
                                        <div className="overview-hero-team-row" key={`${featuredGame.id}-${team?.teamId}`}>
                                            <div className="overview-hero-team-copy">
                                                <TeamBadge team={team} size="lg" />
                                                <div>
                                                    <strong>{team?.displayName || team?.abbr}</strong>
                                                    <span>{team?.record || team?.abbr}</span>
                                                </div>
                                            </div>
                                            <strong className="overview-hero-team-score">{team?.score ?? '-'}</strong>
                                        </div>
                                    ))}
                                </div>
                            </button>
                        ) : null}
                    </div>

                    <div className="overview-hero-showcase">
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
                                <div className="msc-value">{featuredTeam?.abbr || '--'}</div>
                                <div className="msc-label">Top club</div>
                            </div>
                        </div>

                        <div className="overview-hero-spotlight-grid">
                            {featuredPlayer ? (
                                <button className="overview-hero-spotlight overview-hero-player" onClick={() => onPlayerClick && onPlayerClick(featuredPlayer.id)}>
                                    <img
                                        src={featuredPlayer.headshot}
                                        alt={featuredPlayer.name}
                                        className="overview-hero-headshot"
                                        onError={(e) => { e.target.src = 'https://a.espncdn.com/i/headshots/nophoto.png'; }}
                                    />
                                    <div>
                                        <span className="overview-kicker">Player Heat</span>
                                        <strong>{featuredPlayer.name}</strong>
                                        <p>{featuredPlayer.teamAbbr} • {featuredPlayer.position} • {featuredPlayer.rating} OVR</p>
                                    </div>
                                </button>
                            ) : null}

                            {featuredTeam ? (
                                <button className="overview-hero-spotlight overview-hero-club" onClick={() => onTeamClick && onTeamClick(featuredTeam.id)}>
                                    <TeamBadge team={featuredTeam} size="lg" />
                                    <div>
                                        <span className="overview-kicker">Clubhouse Leader</span>
                                        <strong>{featuredTeam.fullName}</strong>
                                        <p>#{featuredTeam.ovrRank} OVR • {featuredTeam.wins}-{featuredTeam.losses} • {featuredTeam.streak}</p>
                                    </div>
                                </button>
                            ) : null}
                        </div>
                    </div>
                </section>

                <section className="card overview-news-rail">
                    <div className="overview-section-head">
                        <h3>Trending News</h3>
                        <button
                            className="filter-btn active"
                            onClick={() => featuredStory && onStoryClick?.(featuredStory)}
                        >
                            Top story
                        </button>
                    </div>
                    {featuredStory ? (
                        <div className="overview-news-rail-body">
                            <button type="button" className="overview-news-feature" onClick={() => onStoryClick?.(featuredStory)}>
                                {featuredStory.image ? (
                                    <img src={featuredStory.image} alt={featuredStory.headline} className="overview-news-feature-image" />
                                ) : (
                                    <div className="overview-news-feature-image overview-news-feature-fallback">MLB</div>
                                )}
                                <div className="overview-news-feature-copy">
                                    <div className="news-card-meta">
                                        <span>{featuredStory.source || 'ESPN'}</span>
                                        <span>{formatTime(featuredStory.published)}</span>
                                    </div>
                                    <h3>{featuredStory.headline}</h3>
                                    {featuredStory.description ? <p>{featuredStory.description}</p> : null}
                                </div>
                            </button>

                            <div className="overview-news-mini-list">
                                {moreStories.map((article) => (
                                    <button key={article.id} type="button" onClick={() => onStoryClick?.(article)} className="overview-news-mini">
                                        <strong>{article.headline}</strong>
                                        <span>{article.source || 'ESPN'} • {formatTime(article.published)}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-icon"></div>
                            <h3>No Stories Available</h3>
                        </div>
                    )}
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
                                    <div className="overview-row-stack">
                                        {[game.away, game.home].map((team) => (
                                            <div className="overview-row-team" key={`${game.id}-${team?.teamId}`}>
                                                <TeamBadge team={team} />
                                                <div>
                                                    <div className="overview-row-title">{team?.abbr || team?.displayName}</div>
                                                    <div className="overview-row-subtitle">{team?.record || getGameStatusLabel(game)}</div>
                                                </div>
                                            </div>
                                        ))}
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
                        <button className="filter-btn active" onClick={() => onTeamClick && featuredTeam && onTeamClick(featuredTeam.id)}>Open #1</button>
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
                                    <div className="overview-player-meta">
                                        <TeamBadge team={team} />
                                        <div>
                                            <div className="overview-row-title">#{team.ovrRank} {team.fullName}</div>
                                            <div className="overview-row-subtitle">{team.wins}-{team.losses} • {team.streak}</div>
                                        </div>
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

                <section className="card overview-section">
                    <div className="overview-section-head">
                        <h3>Trending Players</h3>
                        <button className="filter-btn active" onClick={() => onPlayerClick && featuredPlayer && onPlayerClick(featuredPlayer.id)}>Open #1</button>
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
                                            <div className="overview-row-subtitle">{player.teamAbbr} • {player.position}</div>
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

                <section className="card overview-section overview-span-2">
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
                                        <div className="overview-row-subtitle">{edge.matchup} • {edge.confidence} confidence</div>
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
