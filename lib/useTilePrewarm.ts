'use client';
// Background prewarm for the static-map tile cache.
//
// When a user opens /trip/[id]/live and the trip has a detected flight
// booking (Phase 0), this hook fires a handful of client-side fetches to
// /api/map-tile for the trip city at multiple zooms. The Service Worker
// intercepts those requests and caches them — so when the user later
// loses network mid-trip, the GoogleLiveMap's offline fallback can read
// from cache instead of failing.
//
// Why client-side: the SW only caches client-initiated fetches. A server
// pre-warm wouldn't help — the SW lives in the user's browser.
//
// Costs are predictable: 6 requests × ~30 KB each = ~180 KB per trip.
// Inside Google Static Maps' 28K/mo free tier well past 1000 active users.

import { useEffect } from 'react';

interface PrewarmOpts {
  city: string | null;
  /** When true, fire requests. Caller is responsible for any gating
      (e.g. only when flightBookingDetectedAt is set). */
  enabled: boolean;
}

// Center the trip on the city via the proxy. We can't geocode here easily,
// so we let the upstream URL pass `center=<city>` and Google geocodes
// server-side. Static Maps accepts free-text in `center`.
const ZOOMS = [11, 13, 15];

export function useTilePrewarm({ city, enabled }: PrewarmOpts) {
  useEffect(() => {
    if (!enabled || !city) return;
    // Run a tick after mount so the live-trip page's main render isn't
    // competing with these requests on slow connections.
    const t = setTimeout(() => {
      for (const z of ZOOMS) {
        const url = `/api/map-tile?center=${encodeURIComponent(city)}&zoom=${z}&size=640x400&scale=2`;
        // `no-cache` cache-control means the network fetch happens even
        // if the browser has a stale entry — but the SW will still cache
        // the response. Catch failures silently; offline = not our problem
        // here, the user just won't have prewarmed tiles.
        fetch(url, { cache: 'reload' }).catch(() => { /* silent */ });
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [city, enabled]);
}
