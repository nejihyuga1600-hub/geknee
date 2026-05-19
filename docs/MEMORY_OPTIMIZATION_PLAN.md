# Memory & Storage Optimization Plan

> Last updated: 2026-05-19. Status: drafted, baseline measurement in progress.

## Why "phone off" matters
When the device powers off, runtime memory is zero — what survives is **persistent storage**: localStorage, IndexedDB, ServiceWorker caches, Capacitor native storage, and downloaded GLB blobs. Reducing this footprint stops the app from accreting disk space over months and improves cold-start.

This plan covers both runtime (active heap + GPU memory) and persistent (disk).

---

## Phase 0 — Measure first

Don't optimize blind. Capture a baseline so each fix can be scored.

### What we capture from the source side (automated)
- Bundle sizes per route (`next build` output)
- Largest client components (line count + bytes)
- All `setInterval` / polling locations
- All GLB / model references and projected total weight

### What you capture from the browser side (manual paste in DevTools console)

```js
// Persistent storage usage right now
const est = await navigator.storage.estimate();
console.log({
  usageMB: (est.usage / 1024 / 1024).toFixed(1),
  quotaMB: (est.quota / 1024 / 1024).toFixed(1),
  percent: ((est.usage / est.quota) * 100).toFixed(1) + '%',
  byBucket: est.usageDetails,
});

// localStorage by key, sorted by size
console.table(
  Object.keys(localStorage)
    .map(k => ({ key: k, kb: (localStorage[k].length * 2 / 1024).toFixed(1) }))
    .sort((a, b) => b.kb - a.kb)
);

// IndexedDB databases present
indexedDB.databases().then(dbs => console.table(dbs));
```

Then in **DevTools → Performance**: tick the Memory checkbox, hit Record, rotate the globe for 30s, stop. Save the trace. Capture the JS heap line at start and end.

Then in **DevTools → Memory → Heap snapshot**: take one at boot, one after navigating to a trip and back. Diff. Anything > 1MB in the diff that doesn't go away is a leak candidate.

---

## Phase 1 — Quick wins (1–2 hrs, no architecture changes)

### 1.1 Stop the 403 retry storm  ★★ — ✅ DONE 2026-05-19
Created `app/plan/location/globe/safeGLB.ts` with a HEAD-probe wrapper. Module-load preload loop in `landmark.tsx` (50+ URLs) and per-skin preload in `_setActiveSkins` both route through `safePreloadGLB` — known-bad URLs are blacklisted for the session after one HEAD check.

### 1.2 `frameloop="demand"` on idle scenes  ★★ — ⚠ DEFERRED
R3F's `<Canvas>` renders 60fps continuously by default. **12 `useFrame` hooks across globe code** mean this isn't a one-liner — animations would freeze unless each invalidates explicitly. Needs a dedicated audit session.

### 1.3 Pause polling when tab hidden — ✅ DONE 2026-05-19
All 8 known polling sites now early-return when `document.visibilityState !== 'visible'`:
- `TripSocialPanel.tsx`:132/175/214/233 (notifications, presence, friends, chat)
- `SummaryView.tsx`:500/812 (clock tick, friend poll)
- `LocationClient.tsx`:2567 (monument refresh)
- `live/page.tsx`:137 (now-clock)

Saves zero work on hidden tabs. Server load drops proportionally for backgrounded sessions.

### 1.A Click-lag fix (bonus, not originally in plan) — ✅ DONE 2026-05-19
Every landmark on the globe had a `geknee:mobilecity` window listener that called `setMobileActive(false)` on every click, regardless of current state. Even with React's same-value bail-out, the call overhead × 50-60 landmarks was meaningful. Ref-guarded the handler in `landmark.tsx`, `LocationClient.tsx` (geo + city variants) — non-matching landmarks now skip setState entirely.

### 1.4 Audit chat history cleanup
Confirm `setChatMsgs([])` runs on every close path.

### 1.5 Verify localStorage trimness
Currently stores feature flag + favoriteFriends + group names. Should be tiny (<5KB). Confirm PostHog session-recording is flushing properly.

### 1.6 Service-worker cache LRU + size cap  ★★★ Biggest "phone-off" win
GLBs currently fall through to the browser's HTTP cache (unbounded). Intercept GLB fetches in the SW, store in a named cache `geknee-models-v1` with max-entries=20 + LRU eviction. **Caps persistent storage at ~150MB.**

---

## Phase 2 — Targeted optimizations (3–5 hrs)

### 2.1 Dispose Three.js properly  ★★★ — ✅ AUDITED 2026-05-19, mostly already correct
Audit findings:
- `LocationClient.tsx` already disposes the earth `CanvasTexture` on effect cleanup (line 2210)
- `loadedBump` Texture disposed on unmount (line 2299)
- `ImageBitmap` close-on-replace lifecycle is correctly separated to avoid React strict-mode race
- `TextureLoader` calls dispose on cancel/reject paths
- `GlbModel`'s `scene.clone()` is shallow on geometry/material — those refs are shared with drei's cache; disposing them locally would break other instances

The only remaining VRAM concern is **drei's useGLTF cache itself** (50+ models cached forever). A `useGLTF.clear(url)` policy belongs with Phase 3.1 (SW model registry) — not here.

### 2.2 GLB compression — `gltfpack` + KTX2 textures
Run all 275 GLBs through `gltfpack -i in.glb -o out.glb -c -cc`. Convert embedded textures to KTX2/Basis. **Saves: persistent cache 5-10× smaller, GPU memory 2-3× smaller.**

**Caveat:** user has a rule against degrading Meshy GLBs without explicit OK. Visual-diff sign-off required.

### 2.3 LOD system on monuments
Add a low-poly `_lod` proxy for distant monuments. Use `<Lod>` from R3F. **Saves: ~70% triangles drawn at typical zoom.**

### 2.4 Lazy-mount AtlasShell sub-panels — ✅ DONE 2026-05-19
Wrapped `MonumentShop`, `UpgradeModal`, `SettingsPanel`, `AuthModal` in `{open && <...>}` in both `AtlasShell.tsx` and `LocationClient.tsx`. Chunks now load lazily on first open. `TripSocialPanel` left eager since users open it almost every session.

### 2.5 Code-split LocationClient.tsx
6350 lines in one client component. Pull sub-features to lazy chunks.

### 2.6 Image budget
Set explicit `sizes` and `quality={75}` on all `<Image>` instances.

---

## Phase 3 — Architectural (1–2 days)

### 3.1 Service worker model registry
Ship a `models-manifest.json` so the SW only caches known monuments and evicts everything else. Single knob to control storage.

### 3.2 Persistent storage budget enforcement
Read `navigator.storage.estimate()` on boot. If quota > 80%, proactively evict before the OS does it non-deterministically.

### 3.3 Capacitor-specific: pause WebGL on app background
On `Capacitor.App.addListener('appStateChange')`, stop the R3F render loop and release the WebGL context when backgrounded.

### 3.4 Suggestion / message retention policy
TripMessage capped at 200 server-side. Mirror client-side with a true windowed view (last 50 in state, fetch older on scroll).

### 3.5 Move analytics flush off main thread
PostHog session-recording → move to a Web Worker if hot.

---

## Expected outcomes (rough)

| Metric | Before (est.) | After Phase 1+2 | After Phase 3 |
|---|---|---|---|
| Cold idle JS heap | 80–120 MB | 50–70 MB | 35–50 MB |
| GPU memory (globe loaded) | 200–400 MB | 90–150 MB | 60–100 MB |
| Persistent storage (heavy user, 1 mo) | 500 MB–1 GB | ~150 MB | <80 MB capped |
| Battery drain (1hr backgrounded mobile) | meaningful | small | negligible |

---

## Execution order
1. Phase 0 baseline (this doc + browser snippets)
2. Phase 1.1 + 1.2 + 1.6 first — biggest impact-to-effort ratio
3. **Review checkpoint** — confirm 1.6 LRU eviction policy
4. Phase 2.1 (dispose), then 2.4–2.6 (low-risk JS wins)
5. **Review checkpoint** — Phase 2.2 GLB recompression needs explicit sign-off (Meshy rule)
6. Phase 3 only if metrics still demand it

---

## Baseline measurements (Phase 0 results)

_Captured 2026-05-19 from source side. Browser-side TBD by user._

### Static asset weight (the big problem)

| Path | Size | Notes |
|---|---|---|
| `public/` total | **2.3 GB** | Everything that ships and gets HTTP-cached |
| `public/models/` | **1.8 GB** (52 GLBs) | Dominant cost — average ~35 MB per model |
| `public/christ-the-redeemer.zip` | 58 MB | **Stray** — already unpacked next to it, ZIP is dead weight |
| `public/christ-the-redeemer/` | 58 MB | Unpacked twin of the ZIP above |
| `public/Taj Mahal (2).glb` | 46 MB | **Stray** — should be in `public/models/` or removed |
| `public/ne_10m_admin_1_states_provinces.json` | 39 MB | Natural Earth states geojson |
| `public/earth_terrain.jpg` | 23 MB | Single base texture |
| `.next/` build cache | **13 GB** | Local dev artifact; not shipped, but flag for cleanup |

**Top 15 heaviest GLBs:**

| Size | File |
|---:|---|
| 268.1 MB | maasai_mara.glb ⚠ outlier |
| 119.1 MB | morocco_mar.glb |
|  97.8 MB | neuschwanstein.glb |
|  84.0 MB | colognecathedral.glb |
|  82.6 MB | angkor_wat.glb |
|  81.1 MB | osaka_castle.glb |
|  78.4 MB | sagrada_familia.glb |
|  75.4 MB | petra.glb |
|  64.3 MB | ta_prohm.glb |
|  62.6 MB | grand_canyon.glb |
|  56.7 MB | hagia_sophia.glb |
|  47.9 MB | mt_rushmore.glb |
|  45.0 MB | Taj (folder) |
|  45.0 MB | notre_dame.glb |
|  44.9 MB | forbidden_city.glb |

### Active polling intervals on the client

| File | Line | Interval | Purpose |
|---|---:|---:|---|
| `TripSocialPanel.tsx` | 132 | 15 s | notifications |
| `TripSocialPanel.tsx` | 175 | 30 s | presence ping |
| `TripSocialPanel.tsx` | 214 | 30 s | friends list refresh |
| `TripSocialPanel.tsx` | 233 | **3 s** | trip chat poll |
| `SummaryView.tsx` | 500 | 1 s | timer tick |
| `SummaryView.tsx` | 812 | 3 s | friends poll |
| `LocationClient.tsx` | 2561 | 30 s | (unknown — confirm in Phase 1.3) |
| `live/page.tsx` | 137 | 30 s | "now" clock |

All 8 fire continuously regardless of `document.visibilityState`. Phase 1.3 pauses them when the tab is hidden.

### Largest client components (lines)

| Lines | File |
|---:|---|
| 3003 | LocationClient.tsx (already pre-flagged) |
| 2654 | SummaryView.tsx |
| 2298 | AllLandmarks.tsx |
| 2282 | BookView.tsx |
| 2075 | style/page.tsx |
| 2053 | AtlasShell.tsx |
| 1974 | UnifiedTripMap.tsx |
| 1370 | PlanningMap.tsx |
| 1335 | TripSocialPanel.tsx |
| 1258 | live/page.tsx |
| 1237 | MonumentShop.tsx |

These are the targets for Phase 2.5 (code-split).

### Source-side conclusions

1. **The 1.8 GB GLB folder is the single biggest lever.** `maasai_mara.glb` alone is 268 MB — that's a 10-minute download on slow 4G and dwarfs the rest of the app. Phase 2.2 (gltfpack + KTX2) on these top 15 files is worth ~80% of the total persistent-storage win.
2. **Stray assets to delete now** (zero risk, instant win, ~150 MB):
   - `public/christ-the-redeemer.zip` (58 MB, already unpacked alongside)
   - `public/Taj Mahal (2).glb` (46 MB, name suggests duplicate)
   - Investigate whether the unpacked `christ-the-redeemer/` folder is also redundant if `models/christ_redeemer.glb` exists (yes it does)
3. **8 polling intervals fire on hidden tabs** — Phase 1.3 is a 30-minute fix with battery + CPU savings.
4. **`.next/` is 13 GB.** Periodic `rm -rf .next` between builds keeps dev disk sane.

### From browser side (still to capture — paste snippets from Phase 0 above)

- `navigator.storage.estimate()`: _TBD_
- localStorage breakdown: _TBD_
- IndexedDB databases: _TBD_
- JS heap (idle on globe): _TBD_
- JS heap after 30s rotation: _TBD_
