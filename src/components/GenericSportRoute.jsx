'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import SportIntroGate from '@/src/components/SportIntroGate';
import GenericSportApp from '@/src/components/GenericSportApp';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import useCompositeTheme from '@/src/hooks/useCompositeTheme';
import { getSportConfig } from '@/src/data/sports';

export default function GenericSportRoute({ sportKey, initialEntry = null }) {
  const config = getSportConfig(sportKey);
  const { theme, toggleTheme } = useCompositeTheme(sportKey);

  useEffect(() => {
    document.body.dataset.compositeRoute = sportKey;
    return () => {
      delete document.body.dataset.compositeRoute;
    };
  }, [sportKey]);

  return (
    <SportIntroGate config={config}>
      <section className="generic-route-shell" data-theme={theme}>
        <div className="generic-route-topbar">
          <div>
            <p className="eyebrow">COMPOSITE Sports</p>
            <h1>{config.name}</h1>
          </div>
          <div className="route-shell-actions">
            <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
            <Link href="/" className="hub-back-link">
              Back To Hub
            </Link>
          </div>
        </div>
        <GenericSportApp sportKey={sportKey} initialEntry={initialEntry} />
      </section>
    </SportIntroGate>
  );
}
