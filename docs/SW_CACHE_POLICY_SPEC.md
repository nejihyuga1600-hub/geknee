# Service Worker Cache Policy Spec — GLB Models

> Phase 1.6 of `docs/MEMORY_OPTIMIZATION_PLAN.md`.
> Status: **draft, awaiting approval before ship**.
> Author: Claude · Date: 2026-05-19

## Goal

Cap persistent storage of monument GLB models on the client device. Today, the browser's HTTP cache holds GLBs indefinitely with no size budget you control. A typical heavy user accumulates 500 MB – 1 GB of stale models that the OS can evict non-deterministically.

A dedicated SW cache gives one knob: **at most N MB on disk, LRU eviction**.

## Scope (what we intercept)

| Pattern | Cached? | Why |
|---|---|---|
| `/_next/static/**` | ❌ | Already handled by Next.js + HTTP cache + content hashing |
| Same-origin `/models/*.glb` | ✅ | Local GLBs in `public/models/` |
| `mrfgpxw07gmgmriv.public.blob.vercel-storage.com/models/*.glb` | ✅ | Production Vercel Blob storage |
| `*.json` (geojson borders) | ❌ (separate Phase) | Not in scope here — they're text and small |
| `/api/**` | ❌ | API responses must not be cached at SW layer |
| Images / textures | ❌ (separate Phase) | Image budget is its own phase (2.6) |

**Pattern matcher** in `public/sw.js`:
```js
const GLB_HOSTS = new Set([
  self.location.origin,                                    // same-origin /models/*.glb
  'https://mrfgpxw07gmgmriv.public.blob.vercel-storage.com', // Vercel Blob
]);
const isGlb = (url) => GLB_HOSTS.has(url.origin) && url.pathname.endsWith('.glb');
```

## Cache structure

- Cache name: **`geknee-models-v1`** (versioned so a bump invalidates everything).
- Storage: standard `caches.open('geknee-models-v1')`.
- LRU metadata: separate IndexedDB store `geknee-sw-meta` keyed by URL, value = `{ lastAccessed: number, size: number }`.

## Limits — values to confirm

| Knob | Proposed | Rationale | Your call |
|---|---:|---|:---:|
| `MAX_ENTRIES` | **20** | Average mid-zoom view shows ~6-12 monuments; 20 covers typical browse depth | ✅ / change |
| `MAX_BYTES` | **150 MB** | Below typical browser quota of 6% disk; comfortable on a 64 GB device | ✅ / change |
| LRU sort key | `lastAccessed` | Updated on every cache hit | ✅ / change |
| Eviction trigger | On `fetch` after write | Cheap, runs at most once per fetch | ✅ / change |

The cache stops growing past EITHER `MAX_ENTRIES` OR `MAX_BYTES`, whichever hits first.

## Request flow

```
fetch(GLB url)
  │
  ▼
[SW intercept]
  │
  ├── Hit in cache? ───YES──► touch lastAccessed → return cached response
  │
  ▼ NO
fetch from network
  │
  ├── 200 OK? ───YES──► clone, store in cache, write meta { size, lastAccessed }
  │                     │
  │                     ▼
  │                  evictIfOver(MAX_ENTRIES, MAX_BYTES) — LRU
  │
  └── 4xx/5xx ──► do NOT cache; pass response through
```

**Key rule:** errors are never cached. A 403 today won't poison the cache.

## Offline behavior

If the user is offline and the GLB **is** in cache → serve cached. Their globe still works for previously-visited monuments.

If the user is offline and the GLB **is not** in cache → return the cached primitive fallback by letting the network error propagate. `ModelErrorBoundary` already handles this gracefully.

## What happens on cache version bump

When we change loader behavior or compress models (Phase 2.2), we bump `v1` → `v2`. The SW `activate` event walks all caches, deletes anything not on the current allow-list:

```js
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('geknee-models-') && k !== 'geknee-models-v1')
          .map(k => caches.delete(k))
    ))
  );
});
```

User's device automatically frees the old cache on next visit.

## What this spec does NOT do

- Doesn't preload GLBs proactively. That's still the app's responsibility (already throttled by `safeGLB.ts`).
- Doesn't migrate existing browser HTTP cache. Users with existing 500 MB of HTTP-cached GLBs keep them until the browser decides to evict. Going forward, new fetches go through SW cache.
- Doesn't compress GLBs at runtime. Phase 2.2 handles that source-side.
- Doesn't intercept other asset types. Future phases can extend this pattern.

## Existing service worker

This repo has a service worker referenced in memory observation 537 ("Service Worker Does Not Cache GLB Monument Files"). The plan is to **extend** it, not replace it.

Before shipping, I need to:
1. Locate the existing `public/sw.js` (or wherever it lives)
2. Confirm it doesn't already have a cache strategy that conflicts
3. Add the GLB-specific handlers as an additive layer

## Test plan

After ship:
1. DevTools → Application → Service Workers → check `geknee-models-v1` activates
2. Application → Cache Storage → `geknee-models-v1` populates as you browse the globe
3. Navigate enough monuments to exceed 20 entries → confirm oldest get evicted
4. `navigator.storage.estimate()` shows usage stops growing past ~150 MB
5. Reload offline → previously-visited monuments still load

## Open questions for you

1. **`MAX_ENTRIES=20` and `MAX_BYTES=150 MB` — too low, right, or too high?** Once Phase 2.2 compresses GLBs to ~5 MB each, 20 entries fits in ~100 MB easily and we could raise MAX_ENTRIES to 40+ for a smoother experience.
2. **Cache Vercel Blob GLBs even though they currently return 403?** Yes is safe (we don't cache errors), so I'd say leave the pattern in for when the Blob store comes back online.
3. **Cache the GeoJSON border data (39 MB states JSON)?** That's outside this phase, but it's a big asset; we could add it to the same SW cache trivially.

Once you've signed off on the limits + answered the open questions, I'll implement.
