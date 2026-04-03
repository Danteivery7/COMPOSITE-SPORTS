'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import SportIntroGate from '@/src/components/SportIntroGate';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import useCompositeTheme from '@/src/hooks/useCompositeTheme';
import { getSportConfig } from '@/src/data/sports';

export default function SportFrameRoute({ sportKey, frameSrc }) {
  const config = getSportConfig(sportKey);
  const iframeRef = useRef(null);
  const { theme, toggleTheme, setTheme } = useCompositeTheme(sportKey);
  const searchParams = useSearchParams();

  useEffect(() => {
    document.body.dataset.compositeRoute = sportKey;
    return () => {
      delete document.body.dataset.compositeRoute;
    };
  }, [sportKey]);

  const syncFrameTheme = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    try {
      frameWindow.postMessage(
        {
          type: 'composite-theme',
          sport: sportKey,
          theme,
        },
        window.location.origin,
      );
    } catch (_error) {
      // Ignore bridge errors so the wrapper stays responsive.
    }
  }, [sportKey, theme]);

  useEffect(() => {
    syncFrameTheme();
  }, [syncFrameTheme]);

  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};
      if (data?.type === 'composite-theme-changed' && data?.sport === sportKey && (data?.theme === 'light' || data?.theme === 'dark')) {
        setTheme(data.theme);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setTheme, sportKey]);

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
    <section className="vendor-shell" data-sport={sportKey} data-theme={theme}>
      <div className="vendor-topbar">
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
      <iframe ref={iframeRef} onLoad={syncFrameTheme} className="vendor-frame" src={resolvedFrameSrc} title={config.name} />
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
