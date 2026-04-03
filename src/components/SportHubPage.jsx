'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getSportCards, SPORT_CONFIGS } from '@/src/data/sports';
import StoryDetailCard from '@/src/components/StoryDetailCard';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import useCompositeTheme from '@/src/hooks/useCompositeTheme';

function MoneylineTag({ value }) {
  if (!value) return null;
  return <span className="hub-bet-odds">{value}</span>;
}

function getSportRailStep(rail) {
  if (!rail) return 320;
  const card = rail.querySelector('.hub-card-compact');
  if (!card) return Math.max(320, rail.clientWidth * 0.88);
  const styles = window.getComputedStyle(rail);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || '18') || 18;
  return card.getBoundingClientRect().width + gap;
}

function ensureHeadshotFallback(event) {
  if (event.currentTarget.dataset.fallbackApplied === '1') return;
  event.currentTarget.dataset.fallbackApplied = '1';
  event.currentTarget.src = 'https://a.espncdn.com/i/headshots/nophoto.png';
}

export default function SportHubPage() {
  const cards = getSportCards();
  const sportRailRef = useRef(null);
  const { theme, toggleTheme } = useCompositeTheme('hub');
  const [hero, setHero] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStory, setActiveStory] = useState(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [activeSportIndex, setActiveSportIndex] = useState(0);

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
    document.body.dataset.compositeRoute = 'hub';

    async function loadHero() {
      try {
        let response = await fetch('/api/hub/hero', { cache: 'no-store' });
        let json = await response.json();
        const invalidHero =
          !response.ok ||
          !Array.isArray(json?.worldBoard?.players) ||
          !json.worldBoard.players.length ||
          !Array.isArray(json?.heroStories) ||
          !json.heroStories.length;

        if (invalidHero) {
          response = await fetch('/api/hub/hero?force=1', { cache: 'no-store' });
          json = await response.json();
        }

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
  }, [hero?.heroStories?.length]);

  async function openStory(storyRef) {
    const storyId = typeof storyRef === 'string' ? storyRef : storyRef?.storyId;
    if (!storyId) return;
    const apiHref = typeof storyRef === 'object' && storyRef?.apiHref ? `?apiHref=${encodeURIComponent(storyRef.apiHref)}` : '';
    const response = await fetch(`/api/hub/trending-stories/${storyId}${apiHref}`);
    const json = await response.json();
    setActiveStory(json);
  }

  const worldPlayers = hero?.worldBoard?.players || [];
  const heroStories = hero?.heroStories || [];
  const secondaryStories = hero?.secondaryStories || [];
  const parlay = hero?.parlaySummary || hero?.parlay || null;
  const liveTicker = hero?.liveTicker || [];
  const featuredStory = heroStories[storyIndex] || heroStories[0] || null;
  const movingStories = secondaryStories.length > 1 ? [...secondaryStories, ...secondaryStories] : secondaryStories;
  const tickerLoop = liveTicker.length > 1 ? [...liveTicker, ...liveTicker] : liveTicker;

  useEffect(() => {
    if (heroStories.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setStoryIndex((current) => (current + 1) % heroStories.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [heroStories.length]);

  useEffect(() => {
    const rail = sportRailRef.current;
    if (!rail) return undefined;

    const updateActiveIndex = () => {
      const step = Math.max(1, getSportRailStep(rail));
      setActiveSportIndex(Math.max(0, Math.min(cards.length - 1, Math.round(rail.scrollLeft / step))));
    };

    updateActiveIndex();
    rail.addEventListener('scroll', updateActiveIndex, { passive: true });
    window.addEventListener('resize', updateActiveIndex);
    return () => {
      rail.removeEventListener('scroll', updateActiveIndex);
      window.removeEventListener('resize', updateActiveIndex);
    };
  }, [cards.length]);

  function shiftSportRail(direction) {
    const rail = sportRailRef.current;
    if (!rail) return;
    const step = getSportRailStep(rail);
    rail.scrollBy({
      left: direction * step,
      behavior: 'smooth',
    });
  }

  function jumpToSport(index) {
    const rail = sportRailRef.current;
    if (!rail) return;
    const step = getSportRailStep(rail);
    rail.scrollTo({
      left: step * index,
      behavior: 'smooth',
    });
  }

  if (activeStory) {
    return (
      <main className="hub-page hub-story-page" data-theme={theme}>
        <div className="hub-aurora aurora-a" aria-hidden="true" />
        <div className="hub-aurora aurora-b" aria-hidden="true" />
        <div className="route-shell-actions route-shell-actions-hub">
          <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
        </div>
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
      <main className={`hub-page ${tickerLoop.length ? 'hub-page-has-ticker' : ''}`} data-theme={theme}>
      <div className="hub-aurora aurora-a" aria-hidden="true" />
      <div className="hub-aurora aurora-b" aria-hidden="true" />
      <div className="hub-aurora aurora-c" aria-hidden="true" />
      <div className="hub-gridline" aria-hidden="true" />
      <div className="hub-orbit orbit-a" aria-hidden="true" />
      <div className="hub-orbit orbit-b" aria-hidden="true" />

      <div className="route-shell-actions route-shell-actions-hub">
        <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
      </div>

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
            {featuredStory ? (
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
            {heroStories.length > 1 ? (
              <div className="hub-story-dots" aria-label="Story rotation">
                {heroStories.map((story, index) => (
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
            <div className="hub-parlay-footnote">
              {parlay?.verifiedAt ? `Verified ${new Date(parlay.verifiedAt).toLocaleTimeString()}` : 'Live parlay board syncing now'}
            </div>
            <p className="hub-parlay-note">
              The parlay card is the only betting module on the main menu. It uses verified odds math and today&apos;s strongest cross-sport edge set.
            </p>
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
            <p className="eyebrow">COMPOSITE Sites</p>
            <h2>Choose A COMPOSITE Site To Enter</h2>
            <p className="hub-module-helper">Swipe or click through the live sport sites below.</p>
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
          {cards.map((card) => (
            <Link
              key={card.key}
              href={card.path}
              className="hub-card hub-card-compact"
              data-sport={card.key}
              data-motif={card.motif}
              style={{
                '--card-accent': card.accent,
                '--card-accent-alt': card.accentAlt,
                '--card-base': card.hubTile?.base || card.accent,
                '--card-base-alt': card.hubTile?.baseAlt || card.surface,
                '--card-hover': card.hubTile?.hover || card.accentAlt,
                '--card-hover-alt': card.hubTile?.hoverAlt || card.accent,
                '--card-glow': card.theme?.hub?.glow || card.accent,
              }}
            >
              <div className="hub-card-surface" />
              <div className="hub-card-noise" />
              <div className="hub-card-marking" />
              <div className="hub-card-badge-shell" aria-hidden="true">
                {card.hubTile?.icon ? <img src={card.hubTile.icon} alt="" className="hub-card-badge-image" /> : null}
              </div>
              <div className="hub-card-body">
                <p className="hub-card-site-label">COMPOSITE Site</p>
                <h2>{card.label}</h2>
                <p className="hub-card-subline">{card.hubTile?.subline || card.theme?.hoverCue || `Open ${card.label}`}</p>
              </div>
              <div className="hub-card-footer compact">
                <span className="hub-card-hover-label">{card.hoverLabel || card.theme?.hoverCue}</span>
                <span className="hub-card-cta">Enter</span>
              </div>
            </Link>
          ))}
        </div>
        <div className="hub-sport-rail-pager" aria-label="Composite sites pages">
          {cards.map((card, index) => (
            <button
              key={`${card.key}-pager`}
              type="button"
              className={index === activeSportIndex ? 'is-active' : ''}
              aria-label={`Show ${card.label}`}
              onClick={() => jumpToSport(index)}
            />
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
                <Link className="hub-world-card" key={player.id} href={player.href || '#'}>
                  <div className="hub-world-rank">#{player.worldRank}</div>
                  {player.headshot ? (
                    <img src={player.headshot} alt={player.displayName} className="hub-world-headshot" onError={ensureHeadshotFallback} />
                  ) : (
                    <div className="hub-world-headshot hub-world-headshot-fallback">{player.displayName?.slice(0, 2)?.toUpperCase() || 'PL'}</div>
                  )}
                  <div className="hub-world-copy">
                    <strong>{player.displayName}</strong>
                    <span>{player.leagueLabel}</span>
                    <p>{player.position} • {player.overallLabel || player.overall} OVR</p>
                  </div>
                </Link>
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
          {secondaryStories.length
            ? secondaryStories.map((story) => (
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

    </main>
  );
}
