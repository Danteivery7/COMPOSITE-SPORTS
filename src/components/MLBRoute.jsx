'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SportIntroGate from '@/src/components/SportIntroGate';
import { getSportConfig } from '@/src/data/sports';
import MLBApp from '@/src/mlb/App';

export default function MLBRoute() {
  const config = getSportConfig('mlb');
  const [theme, setTheme] = useState('dark');
  const searchParams = useSearchParams();
  const initialEntry = {
    playerId: searchParams.get('player') || null,
    fromHub: searchParams.get('from') === 'hub',
  };

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('composite-hub-mlb-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
    document.body.dataset.compositeRoute = 'mlb';
    return () => {
      delete document.body.dataset.compositeRoute;
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem('composite-hub-mlb-theme', next);
      return next;
    });
  }, []);

  return (
    <SportIntroGate config={config}>
      <section className="mlb-route-shell" data-theme={theme}>
        <div className="mlb-route-topbar">
          <div>
            <p className="eyebrow">COMPOSITE Sports</p>
            <h1>Composite MLB</h1>
          </div>
          <Link href="/" className="hub-back-link">
            Back To Hub
          </Link>
        </div>
        <MLBApp theme={theme} toggleTheme={toggleTheme} initialEntry={initialEntry} />
      </section>
    </SportIntroGate>
  );
}
