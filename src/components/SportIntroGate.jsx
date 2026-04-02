'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const EXIT_DURATION_MS = 1120;

function IntroScene({ motif }) {
  if (motif === 'court') {
    return (
      <div className="sport-intro-scene" data-motif={motif} aria-hidden="true">
        <div className="sport-intro-spotlight spotlight-a" />
        <div className="sport-intro-spotlight spotlight-b" />
        <div className="sport-intro-scorebug" />
        <div className="sport-intro-floor" />
        <div className="sport-intro-backboard" />
        <div className="sport-intro-object">
          <span className="sport-intro-detail detail-a" />
          <span className="sport-intro-detail detail-b" />
          <span className="sport-intro-detail detail-c" />
        </div>
      </div>
    );
  }

  if (motif === 'bracket') {
    return (
      <div className="sport-intro-scene" data-motif={motif} aria-hidden="true">
        <div className="sport-intro-spotlight spotlight-a" />
        <div className="sport-intro-spotlight spotlight-b" />
        <div className="sport-intro-bracket-wall" />
        <div className="sport-intro-banner" />
        <div className="sport-intro-object">
          <span className="sport-intro-detail detail-a" />
          <span className="sport-intro-detail detail-b" />
          <span className="sport-intro-detail detail-c" />
        </div>
      </div>
    );
  }

  if (motif === 'diamond') {
    return (
      <div className="sport-intro-scene" data-motif={motif} aria-hidden="true">
        <div className="sport-intro-spotlight spotlight-a" />
        <div className="sport-intro-spotlight spotlight-b" />
        <div className="sport-intro-scorebug" />
        <div className="sport-intro-baseline" />
        <div className="sport-intro-object">
          <span className="sport-intro-detail detail-a" />
          <span className="sport-intro-detail detail-b" />
          <span className="sport-intro-detail detail-c" />
        </div>
      </div>
    );
  }

  if (motif === 'yardline') {
    return (
      <div className="sport-intro-scene" data-motif={motif} aria-hidden="true">
        <div className="sport-intro-spotlight spotlight-a" />
        <div className="sport-intro-spotlight spotlight-b" />
        <div className="sport-intro-playbook" />
        <div className="sport-intro-banner" />
        <div className="sport-intro-object">
          <span className="sport-intro-detail detail-a" />
          <span className="sport-intro-detail detail-b" />
          <span className="sport-intro-detail detail-c" />
        </div>
      </div>
    );
  }

  return (
    <div className="sport-intro-scene" data-motif={motif} aria-hidden="true">
      <div className="sport-intro-spotlight spotlight-a" />
      <div className="sport-intro-spotlight spotlight-b" />
      <div className="sport-intro-runway" />
      <div className="sport-intro-portal" />
      <div className="sport-intro-shard shard-a" />
      <div className="sport-intro-shard shard-b" />
      <div className="sport-intro-shard shard-c" />
      <div className="sport-intro-object">
        <span className="sport-intro-detail detail-a" />
        <span className="sport-intro-detail detail-b" />
        <span className="sport-intro-detail detail-c" />
      </div>
    </div>
  );
}

export default function SportIntroGate({ config, children }) {
  const storageKey = useMemo(() => `composite-hub-intro-${config.key}`, [config.key]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitTimerRef = useRef(null);

  useEffect(() => {
    setExiting(false);

    if (config.alwaysShowIntro) {
      setOpen(true);
      setReady(true);
      return;
    }

    const seen = window.localStorage.getItem(storageKey) === '1';
    setOpen(!seen);
    setReady(true);
  }, [config.alwaysShowIntro, storageKey]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  function completeIntro() {
    setOpen(false);
    setExiting(false);
  }

  function enterIntro() {
    if (exiting) return;

    if (!config.alwaysShowIntro) {
      window.localStorage.setItem(storageKey, '1');
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      completeIntro();
      return;
    }

    setExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      completeIntro();
    }, EXIT_DURATION_MS);
  }

  if (!ready) {
    return (
      <div
        className="sport-gate-shell sport-gate-loading"
        style={{
          '--sport-accent': config.accent,
          '--sport-accent-alt': config.accentAlt,
          '--sport-surface': config.surface,
        }}
      >
        <div className="sport-gate-loader">
          <span className="eyebrow">{config.label} Tunnel</span>
          <h1>Booting the boards.</h1>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`sport-gate-shell ${open ? 'is-locked' : ''}`}
      style={{
        '--sport-accent': config.accent,
        '--sport-accent-alt': config.accentAlt,
        '--sport-surface': config.surface,
      }}
    >
      {open ? (
        <section
          className={`sport-intro sport-intro-${config.motif || 'default'} ${exiting ? 'is-exiting' : ''}`}
          data-motif={config.motif || 'default'}
        >
          <div className="sport-intro-noise" aria-hidden="true" />
          <div className="sport-intro-grid" aria-hidden="true" />
          <div className="sport-intro-orbit orbit-a" aria-hidden="true" />
          <div className="sport-intro-orbit orbit-b" aria-hidden="true" />
          <IntroScene motif={config.motif || 'default'} />
          <div className="sport-intro-panel">
            <p className="eyebrow">{config.introEyebrow}</p>
            <h1>{config.introTitle}</h1>
            <p>{config.introCopy}</p>
            <div className="sport-intro-actions">
              <button className="sport-intro-button" type="button" onClick={enterIntro}>
                {config.enterLabel}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      <div className={`sport-stage ${open ? 'is-hidden' : ''}`}>{children}</div>
    </div>
  );
}
