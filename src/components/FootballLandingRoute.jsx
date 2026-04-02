'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import FootballIntroGate from '@/src/components/FootballIntroGate';

function formatKickoff(value) {
  if (!value) return 'Kickoff TBD';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function FootballLandingRoute() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.body.dataset.compositeRoute = 'football';

    async function load() {
      try {
        const response = await fetch('/api/football/landing');
        const json = await response.json();
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
  const leagues = data?.leagues || [];

  return (
    <FootballIntroGate
      title="Enter Composite Football"
      copy="Floodlights rise, the tifo lifts, and the match-night board comes alive before you drop into any league inside one global football control room."
      enterLabel="Enter The Pitch"
      accent="#8db1ff"
      accentAlt="#edf3ff"
    >
      <section className="football-landing-shell">
        <header className="football-landing-hero">
          <div className="football-landing-copy">
            <p className="eyebrow">COMPOSITE Sports</p>
            <h1>Composite Football</h1>
            <p>{data?.subtitle || 'The global football selector is syncing the marquee board and league hubs.'}</p>
          </div>
          <Link href="/" className="football-hub-link">
            Back To Hub
          </Link>
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
                        <span>{match.away.record || match.away.abbreviation}</span>
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
                        <span>{match.home.record || match.home.abbreviation}</span>
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
