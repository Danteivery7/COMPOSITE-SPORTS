'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import SportIntroGate from '@/src/components/SportIntroGate';
import GenericSportApp from '@/src/components/GenericSportApp';
import { getSportConfig } from '@/src/data/sports';

export default function GenericSportRoute({ sportKey }) {
  const config = getSportConfig(sportKey);

  useEffect(() => {
    document.body.dataset.compositeRoute = sportKey;
    return () => {
      delete document.body.dataset.compositeRoute;
    };
  }, [sportKey]);

  return (
    <SportIntroGate config={config}>
      <section className="generic-route-shell">
        <div className="generic-route-topbar">
          <div>
            <p className="eyebrow">COMPOSITE All Sports</p>
            <h1>{config.name}</h1>
          </div>
          <Link href="/" className="hub-back-link">
            Back To Hub
          </Link>
        </div>
        <GenericSportApp sportKey={sportKey} />
      </section>
    </SportIntroGate>
  );
}
