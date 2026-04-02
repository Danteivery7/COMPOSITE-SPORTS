'use client';

import { useEffect, useRef, useState } from 'react';

const EXIT_DURATION_MS = 1180;

export default function FootballIntroGate({ title, copy, enterLabel, accent = '#8db1ff', accentAlt = '#edf3ff', children }) {
  const [open, setOpen] = useState(true);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  function closeIntro() {
    if (exiting) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setOpen(false);
      return;
    }
    setExiting(true);
    timerRef.current = window.setTimeout(() => {
      setOpen(false);
      setExiting(false);
    }, EXIT_DURATION_MS);
  }

  return (
    <div
      className={`football-gate-shell ${open ? 'is-locked' : ''}`}
      style={{
        '--football-accent': accent,
        '--football-accent-alt': accentAlt,
      }}
    >
      {open ? (
        <section className={`football-intro ${exiting ? 'is-exiting' : ''}`}>
          <div className="football-intro-floodlight floodlight-a" aria-hidden="true" />
          <div className="football-intro-floodlight floodlight-b" aria-hidden="true" />
          <div className="football-intro-tunnel" aria-hidden="true" />
          <div className="football-intro-track" aria-hidden="true" />
          <div className="football-intro-pitch" aria-hidden="true">
            <span className="football-pitch-circle" />
            <span className="football-pitch-line line-x" />
            <span className="football-pitch-line line-y" />
            <span className="football-pitch-box box-a" />
            <span className="football-pitch-box box-b" />
          </div>
          <div className="football-intro-panel">
            <p className="eyebrow">Tunnel To Pitch</p>
            <h1>{title}</h1>
            <p>{copy}</p>
            <div className="football-intro-tags">
              <span>League selector</span>
              <span>Daily marquee board</span>
              <span>Global club power</span>
            </div>
            <button className="football-intro-button" type="button" onClick={closeIntro}>
              {enterLabel}
            </button>
          </div>
        </section>
      ) : null}
      <div className={`football-gate-stage ${open ? 'is-hidden' : ''}`}>{children}</div>
    </div>
  );
}
