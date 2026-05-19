// Service worker — PWA install eligibility + offline map tile cache + GLB
// model cache (Phase M3 — mobile memory plan).
// We deliberately do NOT cache HTML aggressively because itineraries,
// prices, and bookings change often and stale UI is worse than a network
// request. Three cache buckets:
//   - SHELL:  brand icons + logos, version-pinned, replaced on each deploy
//   - TILES:  /api/map-tile responses, stale-while-revalidate so offline
//             users still see the day's map until network comes back
//   - MODELS: monument GLBs (same-origin /models/*.glb + Vercel Blob),
//             LRU + size-capped so persistent storage stays bounded.
//             Mobile gets stricter caps because iOS WebsiteDataStore can
//             evict aggressively under memory pressure.
const CACHE = 'geknee-shell-v2';   // bumped: Phase 2 introduces tile cache
const TILES = 'geknee-tiles-v1';
const MODELS = 'geknee-models-v1';
const TILE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TILE_MAX_ENTRIES = 400;       // cap so a noisy user doesn't bloat storage

const IS_MOBILE_SW = /iPhone|iPad|iPod|Android/i.test(self.navigator.userAgent);
const MODELS_MAX_ENTRIES = IS_MOBILE_SW ? 10 : 20;
const MODELS_MAX_BYTES   = (IS_MOBILE_SW ? 60 : 150) * 1024 * 1024;
const BLOB_HOST = 'mrfgpxw07gmgmriv.public.blob.vercel-storage.com';

function isGlbRequest(url) {
  if (!url.pathname.endsWith('.glb')) return false;
  return url.origin === self.location.origin || url.host === BLOB_HOST;
}

// Track byte totals in-memory so we don't have to read every cached
// response just to know the size on each fetch. Rebuilt on activate.
let _modelBytes = 0;
const _modelSizes = new Map(); // url → bytes

const SHELL = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/brand/geknee-logo.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Evict any cache that isn't on the current allow-list. Old MODELS_v0
      // caches (if we ever bump the version) get dropped automatically here.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== TILES && k !== MODELS)
          .map((k) => caches.delete(k)),
      );

      // Rebuild in-memory size tracking for the MODELS cache. Responses
      // already on disk from a previous session keep their entries; we just
      // need to know their byte sizes for the LRU/byte-cap math.
      const models = await caches.open(MODELS);
      const cached = await models.keys();
      _modelBytes = 0;
      _modelSizes.clear();
      for (const k of cached) {
        const r = await models.match(k);
        const len = r?.headers.get('content-length');
        const bytes = len ? parseInt(len, 10) : 0;
        _modelSizes.set(k.url, bytes);
        _modelBytes += bytes;
      }
    })(),
  );
  self.clients.claim();
});

// Trim the tile cache when we exceed TILE_MAX_ENTRIES. LRU-ish — keys()
// returns insertion order so we delete from the front. Called after every
// successful tile fetch (cheap when cache is small).
async function trimTileCache() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  if (keys.length <= TILE_MAX_ENTRIES) return;
  const toDelete = keys.slice(0, keys.length - TILE_MAX_ENTRIES);
  await Promise.all(toDelete.map((req) => cache.delete(req)));
}

// Trim MODELS cache to honor BOTH the entry count cap AND the byte cap.
// Delete from the front of keys() (oldest insertion) until both caps are met.
async function trimModelsCache() {
  const cache = await caches.open(MODELS);
  let keys = await cache.keys();
  while (
    (keys.length > MODELS_MAX_ENTRIES || _modelBytes > MODELS_MAX_BYTES) &&
    keys.length > 0
  ) {
    const oldest = keys[0];
    const sz = _modelSizes.get(oldest.url) || 0;
    await cache.delete(oldest);
    _modelSizes.delete(oldest.url);
    _modelBytes = Math.max(0, _modelBytes - sz);
    keys = keys.slice(1);
  }
}

// Cache-first with LRU touch — when a model is hit, delete + re-put so it
// moves to the END of the insertion order. Misses fetch from network and
// store only on 2xx. Errors (403, 404, 5xx) are NOT cached — keeps a Blob
// outage from poisoning the cache.
async function handleGlb(req) {
  const cache = await caches.open(MODELS);
  const cached = await cache.match(req);
  if (cached) {
    // Touch for LRU. Fire-and-forget so the cache hit returns immediately.
    cache.delete(req).then(() => cache.put(req, cached.clone())).catch(() => {});
    return cached;
  }
  let res;
  try {
    res = await fetch(req);
  } catch {
    return new Response('Network error and not cached', { status: 504 });
  }
  if (res && res.ok) {
    const cloned = res.clone();
    const len = cloned.headers.get('content-length');
    const bytes = len ? parseInt(len, 10) : 0;
    // Reject single files that exceed the byte cap — caching them would
    // immediately evict everything else and leave just one entry.
    if (bytes > 0 && bytes > MODELS_MAX_BYTES) return res;
    cache.put(req, cloned).then(() => {
      _modelSizes.set(req.url, bytes);
      _modelBytes += bytes;
      return trimModelsCache();
    }).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ── Monument GLBs: same-origin OR Vercel Blob, LRU + size-capped ────
  // Checked first because Blob requests are cross-origin and would
  // otherwise fall through the same-origin guard below.
  if (isGlbRequest(url)) {
    event.respondWith(handleGlb(req));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // ── Shell assets: cache-first ───────────────────────────────────────
  if (SHELL.some((path) => url.pathname === path)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  // ── Static map tiles: stale-while-revalidate ────────────────────────
  // Match BOTH the proxy path (/api/map-tile) and prewarm.
  if (url.pathname === '/api/map-tile' || url.pathname.startsWith('/api/map-tile/')) {
    event.respondWith(handleTile(req));
    return;
  }
  // Otherwise: passthrough (no SW intervention).
});

async function handleTile(req) {
  const cache = await caches.open(TILES);
  const cached = await cache.match(req);
  // Network race: kick off fetch in parallel, return cache immediately if
  // available, otherwise wait for network. Refreshes cache for next visit.
  const networkFetch = fetch(req)
    .then(async (res) => {
      if (res && res.ok) {
        // Clone before putting — Response body can only be consumed once.
        cache.put(req, res.clone()).then(trimTileCache);
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    // Stale-while-revalidate: serve cache immediately, network refreshes
    // it in the background for next request.
    return cached;
  }
  // No cache yet — wait for network. If network fails (offline + first
  // visit), surface a 504 so the calling <img> can show its broken state.
  const fresh = await networkFetch;
  return fresh || new Response('Offline + tile not cached', { status: 504 });
}

// Suppress unused-warning for TILE_MAX_AGE_MS — kept as documentation
// and for future "evict by age" pass.
void TILE_MAX_AGE_MS;
