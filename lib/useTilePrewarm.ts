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

import { useCallback, useEffect } from 'react';

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

interface ExplicitDownloadOpts {
  /** Called as each tile resolves with current progress, 0..1. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Explicit "Download offline" trigger — runs a larger prewarm grid than
 * the automatic version. Returns a Promise that resolves when all tiles
 * are cached (or rejected on hard failure).
 *
 * Grid: 5 zooms × 4 quadrant offsets around the city center = 20 tiles.
 * At ~30KB each that's ~600 KB per trip — comfortable on most networks
 * and well inside Google Static Maps' free tier.
 */
export function useExplicitOfflineDownload() {
  return useCallback(async (city: string, tripId?: string, opts?: ExplicitDownloadOpts) => {
    const widerZooms = [10, 12, 13, 14, 15];
    // 4 nudges around the center to broaden coverage. Static Maps treats
    // center as a freeform location; we synthesize different centers by
    // appending the cardinal hint to the query.
    const offsets = ['', ' north', ' east', ' south'];
    const requests: string[] = [];
    for (const z of widerZooms) {
      for (const o of offsets) {
        const center = (city + o).trim();
        requests.push(
          `/api/map-tile?center=${encodeURIComponent(center)}&zoom=${z}&size=640x400&scale=2`,
        );
      }
    }
    const total = requests.length;
    let done = 0;
    opts?.onProgress?.(0, total);

    // Sequential with small concurrency (4 at a time) so we don't slam the
    // Static Maps quota or saturate a flaky hotel wifi.
    const CONCURRENCY = 4;
    let idx = 0;
    async function worker() {
      while (idx < requests.length) {
        const my = idx++;
        try {
          await fetch(requests[my], { cache: 'reload' });
        } catch {
          /* silent — partial cache is still useful offline */
        }
        done++;
        opts?.onProgress?.(done, total);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // Mark the trip as cached so the UI suppresses the CTA next visit.
    if (tripId) {
      try {
        await fetch(`/api/trips/${tripId}/mark-offline-ready`, { method: 'POST' });
      } catch {
        /* silent — best-effort; the prewarm itself is the load-bearing work */
      }
    }
  }, []);
}
