'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { getSportCards, SPORT_CONFIGS } from '@/src/data/sports';

export default function SportHubPage() {
  const cards = getSportCards();

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
    document.body.dataset.compositeRoute = 'hub';
    return () => {
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
          <p className="eyebrow">Composite Tracking Suite</p>
          <h1>{SPORT_CONFIGS.hub.title}</h1>
          <p>{SPORT_CONFIGS.hub.subtitle}</p>
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
