'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import SportIntroGate from '@/src/components/SportIntroGate';
import { getSportConfig } from '@/src/data/sports';

export default function SportFrameRoute({ sportKey, frameSrc }) {
  const config = getSportConfig(sportKey);
  const searchParams = useSearchParams();

  useEffect(() => {
    document.body.dataset.compositeRoute = sportKey;
    return () => {
      delete document.body.dataset.compositeRoute;
    };
  }, [sportKey]);

  const frameParams = new URLSearchParams();
  const deepLinkId = searchParams.get('id');
  const deepLinkView = searchParams.get('view');
  if (searchParams.get('from') === 'hub') {
    frameParams.set('from', 'hub');
  }
  if (sportKey === 'nba' && deepLinkView === 'player' && deepLinkId) {
    frameParams.set('view', 'player');
    frameParams.set('id', deepLinkId);
  }
  const frameQuery = frameParams.toString();
  const resolvedFrameSrc =
    sportKey === 'nhl' && deepLinkView === 'player' && deepLinkId
      ? `${frameSrc}${frameQuery ? `?${frameQuery}` : ''}#player/${encodeURIComponent(deepLinkId)}`
      : `${frameSrc}${frameQuery ? `?${frameQuery}` : ''}`;

  const content = (
    <section className="vendor-shell" data-sport={sportKey}>
      <div className="vendor-topbar">
        <div>
          <p className="eyebrow">COMPOSITE Sports</p>
          <h1>{config.name}</h1>
        </div>
        <Link href="/" className="hub-back-link">
          Back To Hub
        </Link>
      </div>
      <iframe className="vendor-frame" src={resolvedFrameSrc} title={config.name} />
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
