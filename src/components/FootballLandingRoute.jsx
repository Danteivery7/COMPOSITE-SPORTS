'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import FootballIntroGate from '@/src/components/FootballIntroGate';
import RouteSiteMenu from '@/src/components/RouteSiteMenu';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import useCompositeTheme from '@/src/hooks/useCompositeTheme';

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
          </div>
          <div className="route-shell-actions">
            <RouteSiteMenu theme={theme} onToggleTheme={toggleTheme} />
            <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
            <a href="/" className="football-hub-link" target="_top">
              Back To Hub
            </a>
          </div>
        </header>

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
                <article className="football-card football-marquee-card" key={`${match.leagueKey}-${match.id}`}>
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
                        onError={(event) => {
                          if (event.currentTarget.dataset.fallbackApplied === '1') return;
                          event.currentTarget.dataset.fallbackApplied = '1';
                          event.currentTarget.src = 'https://a.espncdn.com/i/headshots/nophoto.png';
                        }}
                      />
                    ) : (
                      <span className="football-logo-fallback">{player.displayName?.slice(0, 2)?.toUpperCase() || 'PL'}</span>
                    )}
                    <div>
                      <strong>{player.displayName}</strong>
                      <span>{player.team?.displayName || player.team?.abbreviation || player.leagueLabel}</span>
                      <p>{player.position} • {player.rating} OVR</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
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
