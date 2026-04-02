'use client';

import Link from 'next/link';
import SportIntroGate from '@/src/components/SportIntroGate';
import { getSportConfig } from '@/src/data/sports';
import MLBApp from '@/src/mlb/App';

export default function MLBRoute() {
  const config = getSportConfig('mlb');

  return (
    <SportIntroGate config={config}>
      <section className="mlb-route-shell">
        <div className="mlb-route-topbar">
          <div>
            <p className="eyebrow">COMPOSITE All Sports</p>
            <h1>Composite MLB</h1>
          </div>
          <Link href="/" className="hub-back-link">
            Back To Hub
          </Link>
        </div>
        <MLBApp />
      </section>
    </SportIntroGate>
  );
}
