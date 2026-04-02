'use client';

import { useEffect, useMemo, useState } from 'react';

export default function SportIntroGate({ config, children }) {
  const storageKey = useMemo(() => `composite-hub-intro-${config.key}`, [config.key]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (config.alwaysShowIntro) {
      setOpen(true);
      setReady(true);
      return;
    }

    const seen = window.localStorage.getItem(storageKey) === '1';
    setOpen(!seen);
    setReady(true);
  }, [config.alwaysShowIntro, storageKey]);

  function closeIntro() {
    if (!config.alwaysShowIntro) {
      window.localStorage.setItem(storageKey, '1');
    }
    setOpen(false);
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
        <section className={`sport-intro sport-intro-${config.motif || 'default'}`}>
          <div className="sport-intro-noise" aria-hidden="true" />
          <div className="sport-intro-grid" aria-hidden="true" />
          <div className="sport-intro-orbit orbit-a" aria-hidden="true" />
          <div className="sport-intro-orbit orbit-b" aria-hidden="true" />
          <div className="sport-intro-panel">
            <p className="eyebrow">{config.introEyebrow}</p>
            <h1>{config.introTitle}</h1>
            <p>{config.introCopy}</p>
            <div className="sport-intro-actions">
              <button className="sport-intro-button" type="button" onClick={closeIntro}>
                {config.enterLabel}
              </button>
              <button className="sport-intro-link" type="button" onClick={closeIntro}>
                Skip intro
              </button>
            </div>
          </div>
        </section>
      ) : null}
      <div className={`sport-stage ${open ? 'is-hidden' : ''}`}>{children}</div>
    </div>
  );
}
