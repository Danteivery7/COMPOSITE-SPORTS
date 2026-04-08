'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import SportIntroGate from '@/src/components/SportIntroGate';
import RouteSiteMenu from '@/src/components/RouteSiteMenu';
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
            <RouteSiteMenu theme={theme} onToggleTheme={toggleTheme} />
            <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
            <Link href="/" className="hub-back-link">
              Back To Hub
            </Link>
          </div>
        </div>
        <MLBApp theme={theme} toggleTheme={toggleTheme} initialEntry={initialEntry} />
      </section>
    </SportIntroGate>
  );
}
