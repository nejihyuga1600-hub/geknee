'use client';
// useColorScheme — returns 'dark' | 'light' tracking the user's OS / browser
// `prefers-color-scheme` setting. Reactive: changing the OS theme while the
// page is open updates the value without reload.
//
// All 2D maps + UI chrome read this to swap palettes. The 3D globe is
// intentionally exempt and renders dark regardless — space is always dark.
//
// SSR safe: returns 'dark' until mount to avoid hydration mismatch (the
// site's brand chrome is dark-first; a brief dark flash for light-mode
// users is preferable to a hydration warning on every page).

import { useEffect, useState } from 'react';

export type ColorScheme = 'light' | 'dark';

export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>('dark');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => setScheme(mq.matches ? 'light' : 'dark');
    apply();
    // Modern browsers expose addEventListener; older ones use addListener.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  return scheme;
}
