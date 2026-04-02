'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSportCards, SPORT_CONFIGS } from '@/src/data/sports';

export default function SportHubPage() {
  const cards = getSportCards();
  const [worldBoard, setWorldBoard] = useState(null);
  const [worldLoading, setWorldLoading] = useState(true);

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
    document.body.dataset.compositeRoute = 'hub';

    async function loadWorldBoard() {
      try {
        const response = await fetch('/api/hub/world-rankings');
        const json = await response.json();
        setWorldBoard(json);
      } finally {
        setWorldLoading(false);
      }
    }

    loadWorldBoard();
    const timer = window.setInterval(loadWorldBoard, 60000);

    return () => {
      window.clearInterval(timer);
      delete document.body.dataset.compositeRoute;
    };
  }, []);

  return (
    <main className="hub-page">
      <div className="hub-aurora aurora-a" aria-hidden="true" />
      <div className="hub-aurora aurora-b" aria-hidden="true" />
      <div className="hub-aurora aurora-c" aria-hidden="true" />
      <div className="hub-gridline" aria-hidden="true" />
      <div className="hub-orbit orbit-a" aria-hidden="true" />
      <div className="hub-orbit orbit-b" aria-hidden="true" />
      <section className="hub-hero">
        <div className="hub-hero-copy">
          <p className="eyebrow">COMPOSITE Sports</p>
          <h1>{SPORT_CONFIGS.hub.title}</h1>
          <p>Pick a tunnel, step into a sport, and let the board boot around you. Now with a world-ranking board that compares the best players across every league in the system.</p>
        </div>
        <div className="hub-status-strip" aria-hidden="true">
          {cards.map((card) => (
            <span
              key={`${card.key}-pulse`}
              className="hub-status-pill"
              style={{
                '--pill-accent': card.theme?.hub?.accent || card.accent,
                '--pill-accent-alt': card.theme?.hub?.accentAlt || card.accentAlt,
              }}
            >
              {card.label}
            </span>
          ))}
        </div>
        <div className="hub-hero-meta">
          <div className="hub-meta-card">
            <span>Routes Live</span>
            <strong>{cards.length}</strong>
          </div>
          <div className="hub-meta-card">
            <span>Engines</span>
            <strong>6 Boards</strong>
          </div>
          <div className="hub-meta-card">
            <span>Selector</span>
            <strong>Always Hot</strong>
          </div>
        </div>
      </section>

      <section className="hub-world-board">
        <div className="hub-world-head">
          <div>
            <p className="eyebrow">Global Player Board</p>
            <h2>Top 5 Players In The World</h2>
          </div>
          <span>{worldBoard?.lastUpdated ? `Updated ${new Date(worldBoard.lastUpdated).toLocaleTimeString()}` : 'Sync pending'}</span>
        </div>
        <div className="hub-world-grid">
          {worldLoading
            ? [...Array(5)].map((_, index) => <div key={index} className="hub-world-card is-loading" />)
            : (worldBoard?.players || []).map((player) => (
                <article className="hub-world-card" key={player.id}>
                  <div className="hub-world-rank">#{player.worldRank}</div>
                  {player.headshot ? (
                    <img src={player.headshot} alt={player.displayName} className="hub-world-headshot" />
                  ) : (
                    <div className="hub-world-headshot hub-world-headshot-fallback">{player.displayName?.slice(0, 2)?.toUpperCase() || 'PL'}</div>
                  )}
                  <div className="hub-world-copy">
                    <strong>{player.displayName}</strong>
                    <span>{player.leagueLabel}</span>
                    <p>{player.position} • {player.overall} OVR</p>
                  </div>
                </article>
              ))}
        </div>
      </section>

      <section className="hub-grid">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.path}
            className="hub-card"
            data-sport={card.key}
            data-motif={card.motif}
            style={{
              '--card-accent': card.accent,
              '--card-accent-alt': card.accentAlt,
              '--card-surface': card.surface,
              '--card-glow': card.theme?.hub?.glow || card.accent,
            }}
          >
            <div className="hub-card-surface" />
            <div className="hub-card-noise" />
            <div className="hub-card-marking" />
            <p className="eyebrow">{card.label}</p>
            <h2>{card.name}</h2>
            <p>{card.cardBlurb}</p>
            <div className="hub-card-footer">
              <span className="hub-card-cta">Open {card.label}</span>
              <span className="hub-card-hover-label">{card.hoverLabel || card.theme?.hoverCue}</span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
