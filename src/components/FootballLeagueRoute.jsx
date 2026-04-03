'use client';

import { useEffect } from 'react';
import FootballIntroGate from '@/src/components/FootballIntroGate';
import FootballLeagueApp from '@/src/components/FootballLeagueApp';
import useCompositeTheme from '@/src/hooks/useCompositeTheme';
import { getFootballLeagueConfig } from '@/src/lib/football';

export default function FootballLeagueRoute({ leagueKey, initialEntry = null }) {
  const config = getFootballLeagueConfig(leagueKey);
  const { theme, toggleTheme } = useCompositeTheme(`football-${leagueKey}`);

  useEffect(() => {
    document.body.dataset.compositeRoute = 'football';
    return () => {
      delete document.body.dataset.compositeRoute;
    };
  }, []);

  return (
    <FootballIntroGate
      title={`Enter ${config.label}`}
      copy={`Floodlights, pitch lines, and a live scorebug now bring the ${config.label} board online before scores, club power, player rankings, and match edges take over.`}
      enterLabel={`Open ${config.label}`}
      accent={config.accent}
      accentAlt={config.accentAlt}
    >
      <FootballLeagueApp leagueKey={leagueKey} initialEntry={initialEntry} theme={theme} toggleTheme={toggleTheme} />
    </FootballIntroGate>
  );
}
