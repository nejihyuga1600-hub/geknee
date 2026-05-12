// Service worker — PWA install eligibility + offline map tile cache.
// We deliberately do NOT cache HTML aggressively because itineraries,
// prices, and bookings change often and stale UI is worse than a network
// request. Two cache buckets:
//   - SHELL: brand icons + logos, version-pinned, replaced on each deploy
//   - TILES: /api/map-tile responses, stale-while-revalidate so offline
//            users still see the day's map until network comes back
const CACHE = 'geknee-shell-v2';   // bumped: Phase 2 introduces tile cache
const TILES = 'geknee-tiles-v1';
const TILE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TILE_MAX_ENTRIES = 400;       // cap so a noisy user doesn't bloat storage

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
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== TILES)
          .map((k) => caches.delete(k)),
      ),
    ),
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
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
