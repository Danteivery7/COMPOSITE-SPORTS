'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import FootballIntroGate from '@/src/components/FootballIntroGate';
import RouteSiteMenu from '@/src/components/RouteSiteMenu';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import useCompositeTheme from '@/src/hooks/useCompositeTheme';

function applyFootballHeadshotFallback(event) {
  const { currentTarget } = event;
  const fallbackSrc = currentTarget.dataset.fallbackSrc;
  if (fallbackSrc && currentTarget.dataset.fallbackApplied !== 'primary') {
    currentTarget.dataset.fallbackApplied = 'primary';
    currentTarget.src = fallbackSrc;
    return;
  }
  if (currentTarget.dataset.fallbackApplied === 'final') return;
  currentTarget.dataset.fallbackApplied = 'final';
  currentTarget.src = 'https://a.espncdn.com/i/headshots/nophoto.png';
}

function formatKickoff(value) {
  if (!value) return 'Kickoff TBD';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function recordParts(record) {
  const match = String(record || '').match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  return [
    { label: 'W', value: match[1] },
    { label: 'D', value: match[2] },
    { label: 'L', value: match[3] },
  ];
}

function FootballRecordLine({ record, fallback }) {
  const parts = recordParts(record);
  if (!parts) return <span>{fallback || record || 'Record TBD'}</span>;
  return (
    <span className="football-record-inline">
      {parts.map((part) => (
        <span className="football-record-chip" key={part.label}>
          <strong>{part.label}</strong>
          <span>{part.value}</span>
        </span>
      ))}
    </span>
  );
}

export default function FootballLandingRoute() {
  const { theme, toggleTheme } = useCompositeTheme('football');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.body.dataset.compositeRoute = 'football';

    async function load() {
      try {
        let response = await fetch('/api/football/landing', { cache: 'no-store' });
        let json = await response.json();
        const invalidLanding =
          !response.ok ||
          !Array.isArray(json?.leagues) ||
          !json.leagues.length ||
          !Array.isArray(json?.topPlayers) ||
          !json.topPlayers.length;

        if (invalidLanding) {
          response = await fetch('/api/football/landing?force=1', { cache: 'no-store' });
          json = await response.json();
        }

        setData(json);
      } finally {
        setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, 45_000);

    return () => {
      clearInterval(timer);
      delete document.body.dataset.compositeRoute;
    };
  }, []);

  const topMatches = data?.topMatches || [];
  const topPlayers = data?.topPlayers || [];
  const leagues = data?.leagues || [];
  const liveMatchCount = topMatches.filter((match) => ['live', 'in'].includes(match?.state)).length;
  const visualLogos = [
    ...topMatches.flatMap((match) => [match?.away?.logo, match?.home?.logo]),
    ...leagues.map((league) => league.logo),
  ].filter(Boolean).slice(0, 6);
  const tickerItems = [
    ...topMatches.slice(0, 6).map((match) => ({
      id: `match-${match.id}`,
      label: `${match.leagueLabel} • ${match.away?.abbreviation || match.away?.displayName} vs ${match.home?.abbreviation || match.home?.displayName} • ${match.statusLabel}`,
    })),
    ...leagues.slice(0, 6).map((league) => ({
      id: `league-${league.key}`,
      label: `${league.label} • ${league.liveCount} live • ${league.matchCount} fixtures`,
    })),
  ];

  return (
    <FootballIntroGate
      title="Enter Composite Football"
      copy="Floodlights rise, the tifo lifts, and the match-night board comes alive before you drop into any league inside one global football control room."
      enterLabel="Enter The Pitch"
      accent="#8db1ff"
      accentAlt="#edf3ff"
    >
      <section className="football-landing-shell" data-theme={theme}>
        <header className="football-landing-hero">
          <div className="football-landing-copy">
            <p className="eyebrow">COMPOSITE Sports</p>
            <h1>Composite Football</h1>
            <p>{data?.subtitle || 'The global football selector is syncing the marquee board and league hubs.'}</p>
            <div className="football-chip-row football-landing-chip-row">
              <span className="football-chip">{liveMatchCount} live now</span>
              <span className="football-chip">{leagues.length} football boards</span>
              <span className="football-chip">{topPlayers.length} elite players tracked</span>
            </div>
          </div>
          <div className="football-hero-visual" aria-hidden="true">
            <div className="football-hero-visual-grid" />
            <div className="football-hero-visual-sweep" />
            <div className="football-live-ribbon">
              <span>Match Night Control Room</span>
              <strong>{liveMatchCount ? `${liveMatchCount} live` : 'Global slate primed'}</strong>
            </div>
            <div className="football-hero-match-stack">
              {(topMatches.length ? topMatches.slice(0, 2) : [{}, {}]).map((match, index) => (
                <div
                  className={`football-hero-match-card ${['live', 'in'].includes(match?.state) ? 'is-live' : ''} ${loading ? 'is-loading' : ''}`}
                  key={match?.id || `hero-match-${index}`}
                >
                  {loading || !match?.id ? (
                    <span className="football-hero-match-placeholder">Loading live board</span>
                  ) : (
                    <>
                      <div className="football-card-head">
                        <span className={`football-status-pill is-${match.state}`}>{match.statusLabel}</span>
                        <span>{match.leagueLabel}</span>
                      </div>
                      <div className="football-hero-match-row">
                        <strong>{match.away?.abbreviation}</strong>
                        <span>{match.away?.score}</span>
                      </div>
                      <div className="football-hero-match-row">
                        <strong>{match.home?.abbreviation}</strong>
                        <span>{match.home?.score}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="football-hero-media-strip">
              <div className="football-hero-logo-row">
                {visualLogos.map((logo, index) => (
                  <span className="football-hero-logo-chip" key={`${logo}-${index}`}>
                    <img src={logo} alt="" className="football-club-logo" />
                  </span>
                ))}
              </div>
              <div className="football-hero-player-row">
                {topPlayers.slice(0, 3).map((player) => (
                  <div className="football-hero-player-chip" key={`${player.leagueKey}-${player.id}`}>
                    {player.headshot ? (
                      <img
                        src={player.headshot}
                        alt={player.displayName}
                        className="football-player-headshot"
                        data-fallback-src={`https://a.espncdn.com/i/headshots/soccer/players/full/${player.id}.png`}
                        onError={applyFootballHeadshotFallback}
                      />
                    ) : (
                      <span className="football-logo-fallback">{player.displayName?.slice(0, 2)?.toUpperCase() || 'PL'}</span>
                    )}
                    <div>
                      <strong>{player.displayName}</strong>
                      <span>{player.team?.abbreviation || player.leagueLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="route-shell-actions">
            <RouteSiteMenu theme={theme} onToggleTheme={toggleTheme} />
            <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
            <a href="/" className="football-hub-link" target="_top">
              Back To Hub
            </a>
          </div>
        </header>

        <section className="football-top-player-board">
          <div className="football-section-head">
            <div>
              <p className="eyebrow">World Footballers</p>
              <h2>Top 3 Players In The Sport</h2>
            </div>
            <span>Ranked strictly by the live football overall model.</span>
          </div>
          <div className="football-top-player-grid">
            {loading ? (
              [...Array(3)].map((_, index) => <div className="football-card football-loading-card" key={index} />)
            ) : (
              topPlayers.map((player, index) => (
                <Link
                  href={`/football/${player.leagueKey}?player=${encodeURIComponent(player.id)}`}
                  className="football-card football-top-player-card"
                  key={`${player.leagueKey}-${player.id}`}
                >
                  <div className="football-top-player-head">
                    <span className="football-rank-badge">#{index + 1}</span>
                    <span className="football-chip">{player.leagueLabel}</span>
                  </div>
                  <div className="football-top-player-body">
                    {player.headshot ? (
                      <img
                        src={player.headshot}
                        alt={player.displayName}
                        className="football-player-headshot is-large"
                        data-fallback-src={`https://a.espncdn.com/i/headshots/soccer/players/full/${player.id}.png`}
                        onError={applyFootballHeadshotFallback}
                      />
                    ) : (
                      <span className="football-logo-fallback">{player.displayName?.slice(0, 2)?.toUpperCase() || 'PL'}</span>
                    )}
                    <div>
                      <strong>{player.displayName}</strong>
                      <span>{player.team?.displayName || player.team?.abbreviation || player.leagueLabel}</span>
                      <p>{player.positionLabel || player.position} • {player.rating} OVR</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {tickerItems.length ? (
          <section className="football-live-ticker" aria-label="Live football ticker">
            <div className="football-live-ticker-track">
              {[...tickerItems, ...tickerItems].map((item, index) => (
                <span className="football-live-ticker-item" key={`${item.id}-${index}`}>
                  {item.label}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="football-marquee-board">
          <div className="football-section-head">
            <div>
              <p className="eyebrow">Marquee Matches</p>
              <h2>Top 3 Matches Today</h2>
            </div>
            <span>{data?.lastUpdated ? `Updated ${new Date(data.lastUpdated).toLocaleTimeString()}` : 'Sync pending'}</span>
          </div>

          {loading ? (
            <div className="football-marquee-grid">
              {[...Array(3)].map((_, index) => (
                <div className="football-card football-loading-card" key={index} />
              ))}
            </div>
          ) : (
            <div className="football-marquee-grid">
              {topMatches.map((match) => (
                <article className={`football-card football-marquee-card ${['live', 'in'].includes(match.state) ? 'is-live' : ''}`} key={`${match.leagueKey}-${match.id}`}>
                  <div className="football-marquee-league">
                    {match.leagueLogo ? <img src={match.leagueLogo} alt={match.leagueLabel} className="football-league-logo" /> : null}
                    <div>
                      <strong>{match.leagueLabel}</strong>
                      <span>{formatKickoff(match.startTime)}</span>
                    </div>
                  </div>
                  <div className="football-marquee-match">
                    <div className="football-marquee-side">
                      {match.away?.logo ? <img src={match.away.logo} alt={match.away.displayName} className="football-club-logo" /> : null}
                      <div>
                        <strong>{match.away.displayName}</strong>
                        <FootballRecordLine record={match.away.record} fallback={match.away.abbreviation} />
                      </div>
                    </div>
                    <div className="football-marquee-center">
                      <span className={`football-status-pill is-${match.state}`}>{match.statusLabel}</span>
                      <strong>{match.away.score} - {match.home.score}</strong>
                    </div>
                    <div className="football-marquee-side">
                      {match.home?.logo ? <img src={match.home.logo} alt={match.home.displayName} className="football-club-logo" /> : null}
                      <div>
                        <strong>{match.home.displayName}</strong>
                        <FootballRecordLine record={match.home.record} fallback={match.home.abbreviation} />
                      </div>
                    </div>
                  </div>
                  <Link href={`/football/${match.leagueKey}`} className="football-inline-link">
                    Open {match.leagueLabel}
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="football-league-selector">
          <div className="football-section-head">
            <div>
              <p className="eyebrow">League Boards</p>
              <h2>Choose Your League</h2>
            </div>
            <span>MLS, Europe, and the biggest nights in one football shell.</span>
          </div>
          <div className="football-league-grid">
            {leagues.map((league) => (
              <Link
                href={league.path}
                key={league.key}
                className="football-card football-league-card"
                style={{
                  '--league-accent': league.accent,
                  '--league-accent-alt': league.accentAlt,
                  '--league-surface': league.surface,
                }}
              >
                <div className="football-league-card-surface" />
                <div className="football-league-card-top">
                  <div>
                    <p className="eyebrow">{league.region}</p>
                    <h3>{league.label}</h3>
                  </div>
                  {league.logo ? <img src={league.logo} alt={league.label} className="football-league-logo is-large" /> : null}
                </div>
                <p>{league.blurb}</p>
                <div className="football-chip-row">
                  <span className="football-chip">{league.liveCount} live</span>
                  <span className="football-chip">{league.matchCount} fixtures</span>
                  {league.topTeam ? <span className="football-chip">#{league.topTeam.ovrRank} {league.topTeam.abbreviation}</span> : null}
                </div>
                <span className="football-card-cta">Open {league.label}</span>
              </Link>
            ))}
          </div>
        </section>
      </section>
    </FootballIntroGate>
  );
}
