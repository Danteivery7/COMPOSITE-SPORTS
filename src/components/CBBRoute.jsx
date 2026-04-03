'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import SportIntroGate from '@/src/components/SportIntroGate';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import useCompositeTheme from '@/src/hooks/useCompositeTheme';
import { getSportConfig } from '@/src/data/sports';
import CBBApp from '@/src/components/CBBApp';

export default function CBBRoute({ initialEntry = null }) {
  const config = getSportConfig('cbb');
  const { theme, toggleTheme } = useCompositeTheme('cbb');

  useEffect(() => {
    document.body.dataset.compositeRoute = 'cbb';
    return () => {
      delete document.body.dataset.compositeRoute;
    };
  }, []);

  return (
    <SportIntroGate config={config}>
      <section className="generic-route-shell cbb-route-shell" data-theme={theme}>
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
        <CBBApp initialEntry={initialEntry} />
      </section>
    </SportIntroGate>
  );
}
