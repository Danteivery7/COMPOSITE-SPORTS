'use client';

import Link from 'next/link';
import SportIntroGate from '@/src/components/SportIntroGate';
import { getSportConfig } from '@/src/data/sports';

export default function SportFrameRoute({ sportKey, frameSrc }) {
  const config = getSportConfig(sportKey);
  const content = (
    <section className="vendor-shell" data-sport={sportKey}>
      <div className="vendor-topbar">
        <div>
          <p className="eyebrow">COMPOSITE All Sports</p>
          <h1>{config.name}</h1>
        </div>
        <Link href="/" className="hub-back-link">
          Back To Hub
        </Link>
      </div>
      <iframe className="vendor-frame" src={frameSrc} title={config.name} />
    </section>
  );

  if (config.nativeIntro) {
    return content;
  }

  return (
    <SportIntroGate config={config}>
      {content}
    </SportIntroGate>
  );
}
