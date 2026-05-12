'use client';
// useOnlineStatus — boolean reflecting navigator.onLine, reactive to
// `online` / `offline` events. SSR-safe (returns true until mount).
//
// Used by the live-trip page to show an OFFLINE banner and by the
// GoogleLiveMap component to swap into static-tile-fallback mode when
// the user loses network mid-trip.

import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const apply = () => setOnline(navigator.onLine);
    apply();
    window.addEventListener('online', apply);
    window.addEventListener('offline', apply);
    return () => {
      window.removeEventListener('online', apply);
      window.removeEventListener('offline', apply);
    };
  }, []);
  return online;
}
