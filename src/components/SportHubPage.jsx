'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSportCards, SPORT_CONFIGS } from '@/src/data/sports';
import StoryDetailCard from '@/src/components/StoryDetailCard';

function MoneylineTag({ value }) {
  if (!value) return null;
  return <span className="hub-bet-odds">{value}</span>;
}

export default function SportHubPage() {
  const cards = getSportCards();
  const sportRailRef = useRef(null);
  const [hero, setHero] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStory, setActiveStory] = useState(null);
  const [storyIndex, setStoryIndex] = useState(0);

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
    document.body.dataset.compositeRoute = 'hub';

    async function loadHero() {
      try {
        const response = await fetch('/api/hub/hero');
        const json = await response.json();
        setHero(json);
      } finally {
        setLoading(false);
      }
    }

    loadHero();
    const timer = window.setInterval(loadHero, 60_000);

    return () => {
      window.clearInterval(timer);
      delete document.body.dataset.compositeRoute;
    };
  }, []);

  useEffect(() => {
    setStoryIndex(0);
  }, [hero?.trendingStories?.length]);

  async function openStory(storyRef) {
    const storyId = typeof storyRef === 'string' ? storyRef : storyRef?.storyId;
    if (!storyId) return;
    const apiHref = typeof storyRef === 'object' && storyRef?.apiHref ? `?apiHref=${encodeURIComponent(storyRef.apiHref)}` : '';
    const response = await fetch(`/api/hub/trending-stories/${storyId}${apiHref}`);
    const json = await response.json();
    setActiveStory(json);
  }

  const worldPlayers = hero?.worldBoard?.players || [];
  const stories = hero?.trendingStories || [];
  const bets = hero?.topBets || [];
  const cardSpotlights = hero?.cardSpotlights || {};
  const parlay = hero?.parlay || null;
  const liveTicker = hero?.liveTicker || [];
  const featuredStory = stories[storyIndex] || stories[0] || null;
  const movingStories = stories.length > 1 ? [...stories, ...stories] : stories;
  const tickerLoop = liveTicker.length > 1 ? [...liveTicker, ...liveTicker] : liveTicker;

  useEffect(() => {
    if (stories.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setStoryIndex((current) => (current + 1) % stories.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [stories.length]);

  function shiftSportRail(direction) {
    sportRailRef.current?.scrollBy({
      left: direction * 320,
      behavior: 'smooth',
    });
  }

  const enhancedCards = useMemo(
    () =>
      cards.map((card) => ({
        ...card,
        spotlight: cardSpotlights[card.key] || null,
      })),
    [cards, cardSpotlights],
  );

  if (activeStory) {
    return (
      <main className="hub-page hub-story-page">
        <div className="hub-aurora aurora-a" aria-hidden="true" />
        <div className="hub-aurora aurora-b" aria-hidden="true" />
        <StoryDetailCard
          story={activeStory}
          backLabel="Back to main menu"
          onBack={() => setActiveStory(null)}
          onOpenRelated={(story) => story?.storyId && openStory(story)}
        />
      </main>
    );
  }

  return (
    <main className="hub-page">
      <div className="hub-aurora aurora-a" aria-hidden="true" />
      <div className="hub-aurora aurora-b" aria-hidden="true" />
      <div className="hub-aurora aurora-c" aria-hidden="true" />
      <div className="hub-gridline" aria-hidden="true" />
      <div className="hub-orbit orbit-a" aria-hidden="true" />
      <div className="hub-orbit orbit-b" aria-hidden="true" />

      <section className="hub-hero hub-hero-expanded">
        <div className="hub-hero-copy">
          <p className="eyebrow">COMPOSITE Sports</p>
          <h1>{SPORT_CONFIGS.hub.title}</h1>
          <p>
            The main menu is now the live front page: every sport, the world-player board,
            trending stories across the last 24 hours, and the top parlay-worthy edges on today&apos;s slate.
          </p>
        </div>

        <div className="hub-hero-stack">
          <article className="hub-hero-story-card">
            <div className="hub-module-head">
              <div>
                <p className="eyebrow">Trending Stories</p>
                <h2>Last 24 Hours</h2>
              </div>
              <span>{hero?.nowLabel || 'Syncing'}</span>
            </div>
            {stories[0] ? (
              <button className="hub-story-feature" type="button" onClick={() => openStory(featuredStory)}>
                {featuredStory?.image ? <img src={featuredStory.image} alt={featuredStory.headline} className="hub-story-feature-image" /> : null}
                <div>
                  <span className="hub-story-kicker">{featuredStory?.league}</span>
                  <strong>{featuredStory?.headline}</strong>
                  <p>{featuredStory?.summary || featuredStory?.description || 'Open story'}</p>
                </div>
              </button>
            ) : (
              <div className="hub-story-feature is-loading" />
            )}
            {stories.length > 1 ? (
              <div className="hub-story-dots" aria-label="Story rotation">
                {stories.map((story, index) => (
                  <button
                    key={story.storyId}
                    type="button"
                    className={index === storyIndex ? 'is-active' : ''}
                    aria-label={`Show story ${index + 1}`}
                    onClick={() => setStoryIndex(index)}
                  />
                ))}
              </div>
            ) : null}
          </article>

          <article className="hub-hero-bets-card">
            <div className="hub-module-head">
              <div>
                <p className="eyebrow">Top 3 Bets Of The Day</p>
                <h2>Cross-Sport Parlay</h2>
              </div>
              <span>{parlay?.americanLabel || 'Syncing'}</span>
            </div>
            <div className="hub-parlay-summary">
              <div>
                <span>Stake</span>
                <strong>${parlay?.stake || 10}</strong>
              </div>
              <div>
                <span>American Odds</span>
                <strong>{parlay?.americanLabel || '--'}</strong>
              </div>
              <div>
                <span>Projected Return</span>
                <strong>{parlay?.return ? `$${parlay.return}` : '--'}</strong>
              </div>
            </div>
            <div className="hub-bet-mini-list">
              {bets.length
                ? bets.map((bet) => (
                    <div className="hub-bet-mini-card" key={`${bet.league}-${bet.gameId}`}>
                      <div className="hub-bet-mini-top">
                        <span>{bet.league}</span>
                        <MoneylineTag value={bet.americanOddsLabel} />
                      </div>
                      <strong>{bet.selection}</strong>
                      <p>{bet.lineType}</p>
                    </div>
                  ))
                : [...Array(3)].map((_, index) => <div key={index} className="hub-bet-mini-card is-loading" />)}
            </div>
          </article>
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
      </section>

      <section className="hub-sport-rail-section">
        <div className="hub-module-head">
          <div>
            <p className="eyebrow">All Sports</p>
            <h2>Jump Straight Into Any Board</h2>
          </div>
          <div className="hub-rail-controls">
            <button type="button" onClick={() => shiftSportRail(-1)} aria-label="Previous sports">
              ‹
            </button>
            <button type="button" onClick={() => shiftSportRail(1)} aria-label="Next sports">
              ›
            </button>
          </div>
        </div>
        <div className="hub-sport-rail" ref={sportRailRef}>
          {enhancedCards.map((card) => (
            <Link
              key={card.key}
              href={card.path}
              className="hub-card hub-card-compact"
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
              {card.spotlight?.image ? <img src={card.spotlight.image} alt={card.spotlight.headline || card.label} className="hub-card-image" /> : null}
              <p className="eyebrow">{card.label}</p>
              <h2>{card.label}</h2>
              <div className="hub-card-spotlight">
                <strong>{card.spotlight?.headline || `Open ${card.label}`}</strong>
                <span>{card.spotlight?.subhead || card.hoverLabel || card.theme?.hoverCue}</span>
              </div>
              <div className="hub-card-footer compact">
                <span className="hub-card-hover-label">{card.hoverLabel || card.theme?.hoverCue}</span>
                <span className="hub-card-cta">Open</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="hub-world-board">
        <div className="hub-world-head">
          <div>
            <p className="eyebrow">Global Player Board</p>
            <h2>Top 5 Players In The World</h2>
          </div>
          <span>{hero?.worldBoard?.lastUpdated ? `Updated ${new Date(hero.worldBoard.lastUpdated).toLocaleTimeString()}` : 'Sync pending'}</span>
        </div>
        <div className="hub-world-grid">
          {loading
            ? [...Array(5)].map((_, index) => <div key={index} className="hub-world-card is-loading" />)
            : worldPlayers.map((player) => (
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

      <section className="hub-story-board">
        <div className="hub-module-head">
          <div>
            <p className="eyebrow">Trending Stories</p>
            <h2>Main Storylines Across Sports</h2>
          </div>
          <span>Only stories from the last 24 hours</span>
        </div>
        <div className="hub-story-grid">
          {stories.length
            ? stories.map((story) => (
                <button className="hub-story-card" type="button" key={story.storyId} onClick={() => openStory(story)}>
                  {story.image ? <img src={story.image} alt={story.headline} className="hub-story-card-image" /> : null}
                  <div className="hub-story-card-copy">
                    <span className="hub-story-kicker">{story.league} • {story.source}</span>
                    <strong>{story.headline}</strong>
                    <p>{story.summary || story.description || 'Open story'}</p>
                  </div>
                </button>
              ))
            : [...Array(4)].map((_, index) => <div key={index} className="hub-story-card is-loading" />)}
        </div>
        {movingStories.length ? (
          <div className="hub-story-marquee" aria-hidden="true">
            <div className="hub-story-marquee-track">
              {movingStories.map((story, index) => (
                <span key={`${story.storyId}-${index}`} className="hub-story-marquee-pill">
                  <strong>{story.league}</strong>
                  <span>{story.headline}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="hub-bet-board">
        <div className="hub-module-head">
          <div>
            <p className="eyebrow">Best Bets Today</p>
            <h2>Top 3 Multi-Sport Edges</h2>
          </div>
          <span>{hero?.lastUpdated ? `Updated ${new Date(hero.lastUpdated).toLocaleTimeString()}` : 'Sync pending'}</span>
        </div>
        <div className="hub-bet-grid">
          {bets.length
            ? bets.map((bet) => (
                <article className="hub-bet-card" key={`${bet.league}-${bet.gameId}`}>
                  <div className="hub-bet-card-top">
                    <span>{bet.league}</span>
                    <MoneylineTag value={bet.americanOddsLabel} />
                  </div>
                  <div className="hub-bet-card-mid">
                    <div className="hub-bet-logos">
                      {bet.teamLogo ? <img src={bet.teamLogo} alt={bet.selection} className="hub-bet-logo" /> : null}
                      {bet.opponentLogo ? <img src={bet.opponentLogo} alt="" className="hub-bet-logo is-ghost" /> : null}
                    </div>
                    <div>
                      <strong>{bet.selection}</strong>
                      <p>{bet.lineType}</p>
                    </div>
                  </div>
                  <div className="hub-bet-card-bottom">
                    <span>{bet.projectedScore}</span>
                    <span>{bet.startLabel || ''}</span>
                  </div>
                </article>
              ))
            : [...Array(3)].map((_, index) => <div key={index} className="hub-bet-card is-loading" />)}
        </div>
      </section>

      {tickerLoop.length ? (
        <section className="hub-live-ticker" aria-label="Composite Sports live ticker">
          <div className="hub-live-ticker-track">
            {tickerLoop.map((item, index) => (
              <span className="hub-live-ticker-item" key={`${item.id}-${index}`}>
                <strong>{item.league}</strong>
                {item.awayLogo ? <img src={item.awayLogo} alt="" className="hub-live-ticker-logo" /> : null}
                <span>{item.matchup}</span>
                <span>{item.scoreLabel}</span>
                {item.homeLogo ? <img src={item.homeLogo} alt="" className="hub-live-ticker-logo" /> : null}
                <em>{item.statusLabel}</em>
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
