'use client';

import { useEffect } from 'react';
import SportIntroGate from '@/src/components/SportIntroGate';
import NFLApp from '@/src/components/NFLApp';
import useCompositeTheme from '@/src/hooks/useCompositeTheme';
import { getSportConfig } from '@/src/data/sports';

export default function NFLRoute({ initialEntry = null, initialBootstrap = null }) {
  const config = getSportConfig('nfl');
  const { theme, toggleTheme } = useCompositeTheme('nfl');

  useEffect(() => {
    document.body.dataset.compositeRoute = 'nfl';
    return () => {
      delete document.body.dataset.compositeRoute;
    };
  }, []);

  return (
    <SportIntroGate config={config}>
      <NFLApp initialEntry={initialEntry} initialBootstrap={initialBootstrap} theme={theme} toggleTheme={toggleTheme} />
    </SportIntroGate>
  );
}
