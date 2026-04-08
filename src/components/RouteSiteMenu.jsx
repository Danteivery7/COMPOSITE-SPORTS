'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import { getSportCards } from '@/src/data/sports';

export default function RouteSiteMenu({ theme = 'dark', onToggleTheme = () => {} }) {
  const pathname = usePathname();
  const cards = getSportCards();
  const [open, setOpen] = useState(false);

  const activeKey = useMemo(
    () => cards.find((card) => pathname === card.path || pathname.startsWith(`${card.path}/`))?.key || null,
    [cards, pathname],
  );

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;

    document.body.classList.add('route-site-menu-open');

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('route-site-menu-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <div className="route-site-menu">
        <button
          type="button"
          className={`route-site-menu-trigger ${open ? 'is-open' : ''}`}
          aria-label="Open site navigation"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        className={`route-site-menu-overlay ${open ? 'is-open' : ''}`}
        aria-label="Close site navigation"
        onClick={() => setOpen(false)}
      />

      <div className={`route-site-menu-panel ${open ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label="COMPOSITE site navigation">
        <div className="route-site-menu-head">
          <div>
            <p className="eyebrow">COMPOSITE Sites</p>
            <strong>Jump between sport sites</strong>
          </div>
          <button type="button" className="route-site-menu-close" aria-label="Close site navigation" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>

        <nav className="route-site-menu-list" aria-label="Sport sites">
          {cards.map((card) => {
            const isCurrent = activeKey === card.key;
            return (
              <Link
                href={card.path}
                key={card.key}
                className={`route-site-menu-link ${isCurrent ? 'is-current' : ''}`}
                onClick={() => setOpen(false)}
                aria-current={isCurrent ? 'page' : undefined}
                style={{
                  '--site-accent': card.theme?.hub?.accent || card.accent,
                  '--site-accent-alt': card.theme?.hub?.accentAlt || card.accentAlt,
                }}
              >
                <span className="route-site-menu-icon-shell" aria-hidden="true">
                  {card.hubTile?.icon ? <img src={card.hubTile.icon} alt="" className="route-site-menu-icon" /> : null}
                </span>
                <span className="route-site-menu-copy">
                  <strong>{card.label}</strong>
                  <span>{card.hubTile?.subline || `Open ${card.label}`}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="route-site-menu-theme">
          <RouteThemeToggle theme={theme} onToggle={onToggleTheme} compact />
        </div>
      </div>
    </>
  );
}
