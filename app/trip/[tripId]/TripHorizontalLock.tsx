'use client';
import { useEffect } from 'react';

// Adds a body-level horizontal-scroll lock for the duration of the
// /trip subtree. Runs as a Client Component from the layout so the
// class hits document.body before the first child paints, plus keeps
// pinning the scroll position to 0 in case a nested scrollIntoView
// pushes the outer viewport sideways.
export function TripHorizontalLock() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.add('geknee-x-lock');
    document.body.classList.add('geknee-x-lock');
    // Snap any stuck-panned viewport back to origin (users who loaded
    // a pre-fix bundle may have been left panned right).
    const snap = () => {
      if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY });
      if (document.documentElement.scrollLeft !== 0) document.documentElement.scrollLeft = 0;
      if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0;
    };
    snap();
    // Chase any late layout that manages to push the page (typically a
    // nested scrollIntoView call during first paint).
    const raf = requestAnimationFrame(snap);
    const t1 = setTimeout(snap, 100);
    const t2 = setTimeout(snap, 500);
    window.addEventListener('resize', snap);
    window.addEventListener('orientationchange', snap);
    return () => {
      document.documentElement.classList.remove('geknee-x-lock');
      document.body.classList.remove('geknee-x-lock');
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', snap);
      window.removeEventListener('orientationchange', snap);
    };
  }, []);
  return null;
}
