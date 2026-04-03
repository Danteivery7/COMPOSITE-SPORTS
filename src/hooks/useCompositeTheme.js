'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY_PREFIX = 'composite-route-theme:';
const LEGACY_KEYS = {
  mlb: 'composite-hub-mlb-theme',
};

function readStoredTheme(routeKey) {
  if (typeof window === 'undefined') return null;

  const nextKey = `${KEY_PREFIX}${routeKey}`;
  const direct = window.localStorage.getItem(nextKey);
  if (direct === 'light' || direct === 'dark') {
    return direct;
  }

  const legacyKey = LEGACY_KEYS[routeKey];
  if (legacyKey) {
    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy === 'light' || legacy === 'dark') {
      return legacy;
    }
  }

  return null;
}

export default function useCompositeTheme(routeKey, initialTheme = 'dark') {
  const [theme, setThemeState] = useState(initialTheme);

  useEffect(() => {
    const stored = readStoredTheme(routeKey);
    if (stored) {
      setThemeState(stored);
    }
  }, [routeKey]);

  const setTheme = useCallback((value) => {
    const next = value === 'light' ? 'light' : 'dark';
    setThemeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`${KEY_PREFIX}${routeKey}`, next);
      const legacyKey = LEGACY_KEYS[routeKey];
      if (legacyKey) {
        window.localStorage.setItem(legacyKey, next);
      }
    }
  }, [routeKey]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}
