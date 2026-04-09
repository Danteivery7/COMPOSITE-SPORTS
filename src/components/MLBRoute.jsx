'use client';

import { useEffect } from 'react';
import SportIntroGate from '@/src/components/SportIntroGate';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import useCompositeTheme from '@/src/hooks/useCompositeTheme';
import { getSportConfig } from '@/src/data/sports';
import MLBApp from '@/src/mlb/App';

export default function MLBRoute({ initialEntry = null }) {
  const config = getSportConfig('mlb');
  const { theme, toggleTheme } = useCompositeTheme('mlb');

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
    document.body.dataset.compositeRoute = 'mlb';
    return () => {
      delete document.body.dataset.compositeRoute;
    };
  }, []);

  return (
    <SportIntroGate config={config}>
      <section className="mlb-route-shell" data-theme={theme}>
        <div className="mlb-route-topbar">
          <div>
            <p className="eyebrow">COMPOSITE Sports</p>
            <h1>Composite MLB</h1>
          </div>
          <div className="route-shell-actions">
            <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
            <a href="/" className="hub-back-link" target="_top">
              Back To Hub
            </a>
          </div>
        </div>
        <MLBApp theme={theme} toggleTheme={toggleTheme} initialEntry={initialEntry} />
      </section>
    </SportIntroGate>
  );
}
