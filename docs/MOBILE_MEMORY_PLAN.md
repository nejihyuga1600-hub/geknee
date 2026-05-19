# Mobile Memory Reduction Plan — GeKnee Capacitor App

> Companion to `docs/MEMORY_OPTIMIZATION_PLAN.md`, focused on the iOS/Android Capacitor build.
> Status: drafted 2026-05-19.

## Why mobile is different

The Capacitor build (`capacitor.config.ts`) loads `https://www.geknee.com` directly into native WebViews:
- **iOS WKWebView**: ~512 MB JS heap cap before OOM kill, ~1.5 GB total app memory budget on a 3 GB device.
- **Android WebView**: Varies — low-end Android One devices have ~256 MB before TRIM_MEMORY pressure.
- **VRAM**: Mobile GPUs have far less than desktop — Apple A15 ~3 GB shared, low-end Android ~512 MB shared.
- **Background lifecycle**: iOS suspends WebGL contexts when app is backgrounded; can reclaim WebView memory at any time.
- **Storage**: App sandbox quota varies; iOS reclaims aggressively under disk pressure.

The web optimizations already shipped today help mobile too. This plan layers mobile-specific work on top.

## Already shipped (helps mobile too)

- ✅ 403 retry storm killed → no wasted cellular bandwidth on 50 failing requests at startup
- ✅ Polling pause on `visibilitychange` → no work in background WebView
- ✅ Lazy-mount AtlasShell sub-panels → smaller cold-start heap
- ✅ Primitive monument fallback removed → fewer meshes drawn when Blob is locked
- ✅ 874 MB of orphan GLBs out of `public/` → smaller initial CDN payload
- ✅ Click-lag ref-guard → fewer setState calls per touch

## Phase M1 — Capacitor lifecycle hooks (highest mobile-specific impact)

### M1.1 Pause R3F render loop on `appStateChange` ★★★
The biggest mobile-specific win. Right now, R3F keeps the render loop running even when the app is backgrounded. iOS will suspend the WebView, but during the suspend/resume window the GPU is still warm.

Listen to `@capacitor/app`'s `appStateChange`:
```ts
import { App } from '@capacitor/app';
App.addListener('appStateChange', ({ isActive }) => {
  // Tell the Canvas to halt useFrame and release the GL context
  window.dispatchEvent(new CustomEvent('geknee:app-state', { detail: { isActive } }));
});
```

Then in the Canvas (`LocationClient.tsx:2671`):
- On `isActive=false` → call `invalidate()` once, then set `frameloop="never"` via state
- On `isActive=true` → set `frameloop="always"` again

**Effort:** 30 min. **Mobile gain:** ~100 MB GPU memory freed during background, no battery drain.

### M1.2 Listen for iOS memory warnings ★★ ✅ DONE 2026-05-19
iOS posts `UIApplicationDidReceiveMemoryWarning` when memory is tight. Capacitor doesn't expose this directly, but we can write a tiny plugin OR listen for `pagehide` + visibility together as a proxy.

Shipped:
- `LocationClient.tsx`: when `renderPaused` flips true, schedule a 30s timer; if still backgrounded, dispatch `geknee:mem-pressure` window event. Resume cancels.
- `landmark.tsx`: each `Lm` listens for `geknee:mem-pressure`; if its own monument is currently `glbVisible=false`, calls `useGLTF.clear(skinPath)` + `useGLTF.clear(model.path)` to dispose GPU buffers + parsed scene. On-screen monuments are exempt so the user doesn't return to a blank globe.
- The Service Worker MODELS cache (M3) makes the next refetch nearly instant when the user pans back.

Future extensions (not in this pass):
- Trim in-memory chat messages beyond the last 20
- Clear notification list to empty
- Wire a proper Capacitor plugin to receive native `UIApplicationDidReceiveMemoryWarning` so we don't have to wait 30s

**Effort:** ~20 min. **Mobile gain:** reclaims ~50-150 MB VRAM after 30s of background; survives OS memory pressure on resume.

### M1.3 Reduce concurrent loaded monuments on mobile ★★★ ✅ DONE 2026-05-19
On mobile, only load GLBs for monuments **currently in the camera frustum at zoom**, plus a small ring outside. Don't preload all 19 — load 6-8 visible, lazy-load on pan.

Shipped in `app/plan/location/globe/landmark.tsx`:
- Module-level `IS_MOBILE` constant mirrors `LocationClient.tsx` detection
- `Lm` carries a `glbVisible` state (init `!IS_MOBILE` so desktop always renders)
- `useFrame` runs a 1Hz NDC + horizon check; flips state only on transitions
- Outer JSX gates `<GlbModel>` mount on `glbVisible` — useGLTF never fires for off-screen monuments on cold start, drei cache survives across pans

Caveats:
- VRAM only drops on **cold start**: drei's `useGLTF` cache retains parsed GLBs after a monument scrolls out — next visit is from cache. To reclaim VRAM aggressively, pair with M1.2 cache flush on backgrounding.
- Frustum margin is 1.3 (30% past edge) — keeps pop-in invisible during normal pan velocities; aggressive flicks may briefly reveal it.
- 1Hz timer initialized at 2.0 so first useFrame evaluates immediately (no 1s blank-globe wait on cold start).

**Effort:** ~30 min. **Mobile gain:** ~60-80% fewer GLB downloads on cold start; ~50% fewer draw calls per frame in steady state.

## Phase M2 — Mobile-aware loader settings

### M2.1 Mobile DPR cap (already partially done) ✅
`LocationClient.tsx:2675` already does `dpr={[1, isMobile ? 1.5 : 2]}`. Could lower to 1 on detection of low-end Android.

### M2.2 Smaller texture cap on mobile
Currently the earth texture uses `gl.capabilities.maxTextureSize` for resolution. On iOS that's typically 8192 or 16384 — which means a 256 MB single texture.

Cap at 4096 on mobile:
```ts
const maxTex = Math.min(gl.capabilities.maxTextureSize, isMobile ? 4096 : 8192);
```

**Effort:** 5 min. **Mobile gain:** 75% VRAM reduction on the earth surface texture alone.

### M2.3 Don't load states GeoJSON on mobile ✅ (already done)
Confirmed at `LocationClient.tsx:2218` — comment notes 100MB+ heap allocation, skipped on iOS Safari. Verify it also skips in Capacitor WebView.

### M2.4 Antialias off on Android
Currently `LocationClient.tsx:2691`: `antialias: !isMobile` — already disabled on mobile. ✅

## Phase M3 — Revised Service Worker cache spec

Original spec lived at `docs/SW_CACHE_POLICY_SPEC.md`. **Revised mobile-aware version:**

### What's the same as the original spec
- Cache name: `geknee-models-v1`
- Pattern matcher: `/models/*.glb` (same-origin + Vercel Blob)
- LRU eviction
- Errors never cached
- Version bump → automatic eviction on next visit

### What changes for mobile

| Knob | Web | Mobile | Why |
|---|---:|---:|---|
| `MAX_ENTRIES` | 20 | **10** | iOS reclaims aggressively; small cache is more reliable |
| `MAX_BYTES` | 150 MB | **60 MB** | Stays under typical iOS WebView sandbox pressure |
| Cache strategy | LRU on `lastAccessed` | LRU + on-memwarn flush | M1.2 hook drops cache under pressure |

Detection: SW reads `navigator.userAgent` once on install. If iOS/Android/Capacitor, use mobile limits.

### Why limits are smaller, not bigger, on mobile

Counter-intuitive. The reasoning:
- iOS WebsiteDataStore can evict a 150 MB cache without warning — losing the LRU order
- A 60 MB cache survives more reliably than 150 MB
- Once Phase 2.2 (GLB compression) ships, 60 MB fits ~12-15 monuments — enough for normal browsing

### Capacitor + SW interaction

WKWebView 14+ supports Service Workers. Capacitor's `iosScheme: 'https'` (line 28 of config) ensures SW registers properly. **No special wiring needed** — the SW we ship to web works in the app.

One gotcha: when Capacitor's `server.url` points to a remote host (line 24), the SW lives in the **remote origin's** WebsiteData, not in the app sandbox. So cache size counts against Safari's allocation, not the app's. Pros: doesn't bloat app sandbox. Cons: Safari is more aggressive about eviction.

### What the SW does NOT cache (still)

- HTML pages (itineraries, prices change)
- API responses (chat, suggestions, monuments)
- The earth canvas texture (built dynamically, can't be intercepted)
- The 39 MB states JSON (out of scope, not on mobile anyway)

## Phase M4 — Bundle weight on mobile

Mobile JS parse/eval is ~3-4× slower than desktop. The 3000-line LocationClient.tsx hurts mobile cold-start most.

### M4.1 Code-split LocationClient (still deferred from main plan)
Pull MonumentShop interactions, settings, and trip-related sub-features to separate chunks. Goal: cold-start chunk under 200KB gzipped.

### M4.2 Defer non-globe code paths
Today, `app/page.tsx` is 758 lines of zine landing. If the user is signed in, the server-side redirect (already shipped) skips this entirely — but the chunk still ships. Code-split the landing page so it's a separate route bundle.

### M4.3 Bundle analyzer audit
Run `ANALYZE=true npm run build` to see actual chunk sizes. Identify mobile-hostile dependencies (large `lodash`, unused `@radix-ui/*`, etc.).

## Recommended ship order

1. **M1.1 Pause R3F on background** — ✅ DONE 2026-05-19 (LocationClient.tsx `renderPaused` state + `appStateChange` listener + `frameloop` prop)
2. **M2.2 Cap mobile texture size at 4096** — ✅ DONE 2026-05-19 (LocationClient.tsx:2204 `texCap` ceiling on `createEarthTexture`)
3. **M3 SW cache for GLBs** — ✅ DONE 2026-05-19 (public/sw.js MODELS bucket, mobile 10/60MB caps, LRU)
   ⚠ Only registers in production (RegisterSW.tsx skips dev intentionally) — test via `npm run build && npm start` or Vercel deploy.
4. **M1.3 Frustum-bound monument loading** — ✅ DONE 2026-05-19 (landmark.tsx 1Hz NDC gate on `<GlbModel>` mount)
5. **M1.2 On-background cache flush** — ✅ DONE 2026-05-19 (30s mem-pressure → useGLTF.clear off-screen)
6. **M4.3 Bundle audit** — pending

Stop after step 3 and remeasure before continuing. The first three together should drop mobile RAM by 40-60% with no UX regressions.

## Open questions

1. Do we currently ship the Capacitor app to TestFlight / Play internal track? If yes, M1.1 needs real-device validation before broad release.
2. Is there an Android Studio profile of current memory usage we can baseline against? (Mobile equivalent of the Phase 0 browser numbers.)
3. The `webContentsDebuggingEnabled: true` in `capacitor.config.ts` (line 68) is dev-only — confirm it's stripped in release builds.
