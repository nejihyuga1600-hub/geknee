# Globe zoom smoothness + small-city population — design

**Date:** 2026-05-22
**Page:** `/plan/location`
**Files in scope:** `app/plan/location/LocationClient.tsx`, `app/plan/location/globe/cityData.ts`, `public/data/cities-geonames-1k.json` (new)

## Problem

Two user-reported regressions on the 3D globe page:

1. **Zoom feels not smooth on slower laptops.** Wheel + pinch dolly drops frames during motion; the user asked whether it was their hardware.
2. **Small cities never populate at deepest zoom.** Cities below ~30K population are unreachable even at `minDistance`.

Code investigation confirms both have real causes in the current implementation, not just hardware:

- `gl.setPixelRatio` is fixed at `window.devicePixelRatio` (≈2× on Retina) — 4× the fragment-shading cost during motion when the user isn't reading labels anyway.
- ~200 country labels each run `scale.setScalar(Math.pow(camDist / 15, 1.4))` per frame in their own `useFrame`; back-facing labels are not culled.
- `dampingFactor` is 0.12 — slow decay keeps the camera in the rendering-heavy zone longer than it needs to be.
- `OrbitControls.minDistance = 11.5` but the `popMin` ladder's most permissive branch fires at `camDist ≤ 11` — that branch is dead. Small towns (GeoNames 15K-30K) are never shown at any zoom.
- The 15K-population floor means towns like Aspen, Sedona, Bar Harbor — recognizable travel destinations — don't exist in the dataset at all.

## Goals

- Zoom motion feels smooth on an integrated-GPU laptop (~16ms frames during motion).
- At deepest zoom, the user sees small notable towns (pop ≥ 1,000), not just mid-sized cities.
- Zero new API spend. Per `CLAUDE.md` ops guidance, no monthly cost added.

## Non-goals

- Pure live data (Google Places, OpenStreetMap Overpass). Considered and rejected for cost + complexity reasons during brainstorming.
- Replacing the curated 628-city baseline. It stays as the "always-visible" overlay.
- Mobile zoom tuning beyond `zoomSpeed`. Mobile already has a separate `0.6` scalar; we'll trim to `0.5` and stop there.
- Aerial-view / street-tier zoom (`camDist < 10.5`). Out of scope; would need real terrain.

## Section 1 — Zoom perf

### Architecture

A single source of truth tracks whether the camera is currently moving. A ref + 250 ms idle timer; three consumers read it: the renderer (drops pixel ratio), the per-frame country-label scaler (skips when delta is negligible), and the OrbitControls damping/zoom-speed tuning settles the camera faster.

### Components

**`useGlobeMotion()` hook** — owned next to `DampingUpdater` in `LocationClient.tsx`. Exposes a module-scoped ref `{ moving: boolean, lastMotionAt: number }` and a setter `bumpMotion()`. Idle threshold: 250 ms after the last `bumpMotion()` call without a new one flips `moving → false`. The setter is called from:

- `OrbitControls` `onStart` / `onChange` (via the existing `useThree(s => s.controls)` ref)
- The existing pointer-drag handler around line 2108
- The existing pinch-zoom handler in the same block

Idle detection is per-`useFrame` rather than `setTimeout` to keep React out of the hot path.

**`DprController`** — a sibling component to `DampingUpdater`. Owns its own `useFrame` callback. Reads `motion.moving`; transitions only on edges (`prev !== curr`):

- `moving=true` → `gl.setPixelRatio(1.0)` + `gl.setSize(width, height, false)` once.
- `moving=false` → `gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))` + `gl.setSize(width, height, false)`.

The cap at 2 avoids 3×-DPR phones blowing the fragment budget on idle. `gl.setSize` is called with `updateStyle = false` so the canvas CSS size doesn't change.

**Country-label `useFrame` (existing, ~line 1640)** — modify in place:

```ts
useFrame(({ camera }) => {
  if (!textGroupRef.current) return;
  const camDist = camera.position.length();

  // Skip when camDist barely moved AND we're in motion (cheaper to skip than apply)
  const last = lastAppliedRef.current;
  if (motion.moving && Math.abs(camDist - last) < 0.05) return;

  // Cull back-facing — dot product of camera→label vs camera forward
  if (isBackFacing(labelPos, camera)) return;

  textGroupRef.current.scale.setScalar(Math.pow(camDist / 15, 1.4));
  lastAppliedRef.current = camDist;
});
```

`isBackFacing` reuses the existing label-on-sphere check (look for the `dot < 0` pattern already in `CityLabels`).

**`OrbitControls` props** (line 3145):
- `dampingFactor: 0.12 → 0.20` — faster settle.
- `zoomSpeed: 1.2 → 0.9` desktop, `0.6 → 0.5` mobile — finer wheel granularity.

### Data flow

1. User starts wheel/pinch/pointer drag.
2. Handler fires `bumpMotion()`.
3. Next frame: `DprController` sees `moving=true`, drops DPR to 1.0.
4. Per-frame label callbacks see `moving=true` and skip when delta < 0.05 or back-facing.
5. User releases. 250 ms later, `useFrame` watchdog flips `moving=false`.
6. `DprController` restores DPR. Label callbacks resume full scale work.

### Error handling

- Motion detection misses an edge case (e.g., programmatic camera animation) → worst case is current behavior (DPR stays at 2×, labels recompute every frame). No corrupted state.
- `gl.setPixelRatio` throwing is not possible per Three.js source; if it ever does, the catch is the existing renderer error boundary.
- Single source of truth is a ref, so re-renders are not triggered by motion changes. No React reconciliation cost.

### Testing

- Chrome DevTools Performance recording: zoom 45 → 11.5 over 2 s. Target median frame ≤ 16.7 ms desktop, ≤ 33 ms on an integrated-GPU laptop.
- Visual smoke test: zoom motion should not visibly differ from current behavior (DPR drop is invisible during motion at 60 fps).
- Settled state: take a still screenshot after zoom completes; should be pixel-identical to current `main`.

### Files touched

- `app/plan/location/LocationClient.tsx` — add `useGlobeMotion()`, `DprController`, edit country-label `useFrame`, edit `OrbitControls` props.

## Section 2 — Small-city population

### Architecture

Add a third tier of city data — `cities-geonames-1k.json` — fetched only when the user reaches the deepest zoom band. The existing 628-curated + 15K-extra dataset stays as-is for all other tiers. Fix the dead-branch bug in the existing `popMin` ladder so the new tier is reachable.

### Components

**Data asset:** `/public/data/cities-geonames-1k.json`. Schema mirrors the existing `cities-geonames-15k.json`:

```ts
type City = { n: string; lat: number; lon: number; c: string; p: number }
```

Source: `https://download.geonames.org/export/dump/cities1000.zip`. License: CC BY 4.0 — attribution lives in the existing footer credits block (no UI change required, link already present). Expected size: ~150K rows, ~10-12 MB raw, ~3-4 MB gzipped.

A build script `bin/fetch-cities-1k.mjs` (sibling of `bake-overlays.mjs`) downloads + normalizes + writes the file. Idempotent; safe to re-run. Not part of `next build` — run manually when refreshing the dataset.

**Loader extension** in `app/plan/location/globe/cityData.ts`:
- Module-level `_small: City[] = []`, `_smallVersion = 0`, `_smallLoadPromise: Promise<void> | null`.
- `getSmallCities(): City[]` — returns `_small`.
- `useSmallCitiesVersion(): number` — same `useState` + subscribers pattern as `useExtraCitiesVersion`.
- `loadSmallCities(seenNames: Set<string>): Promise<void>` — idempotent; on success, sets `_small`, bumps version, notifies subscribers. On failure, swallow + `console.warn` once.

**Tier ladder rewrite** at `LocationClient.tsx:1786` — boundaries kept aligned with the updated `sepThresh` ladder below for clarity:

```ts
const popMin =
  camDist > 22 ? 1_500_000 :
  camDist > 18 ?   400_000 :
  camDist > 14 ?   100_000 :
  camDist > 12 ?    30_000 :
  camDist > 11 ?    15_000 :
                     1_000;   // new band; fires loadSmallCities()
```

This gives a `~0.5`-unit zoom window (`10.5 → 11`) where the 1K dataset rules — wide enough to be reachable on a single wheel tick at min zoom, narrow enough that mid-zoom users don't pay for the 10 MB fetch.

**`CityLabels` items rebuild** — extend the existing `useMemo`:

```ts
const items = useMemo(() => {
  const base = CITIES.map(/* ...curated... */);
  const extra = getExtraCities().filter(c => (c.p ?? 0) >= popMin).map(/* ... */);
  const small = popMin <= 1_000 ? getSmallCities().filter(c => (c.p ?? 0) >= popMin).map(/* ... */) : [];
  return spatialDedup([...base, ...extra, ...small], sepThresh);
}, [extraVersion, smallVersion, popMin]);

useEffect(() => {
  if (popMin <= 1_000) {
    const seen = new Set([...CITIES.map(c => c.n), ...getExtraCities().map(c => c.n)]);
    void loadSmallCities(seen);
  }
}, [popMin]);
```

**`minDistance` fix:** `OrbitControls.minDistance = 11.5 → 10.5`. This is what makes the new `≤ 10.7` and `≤ 10.7 → small` branches reachable. The ceiling stays at 10.5 so we never dive into terrain artifacts. Verified against `maxTexSize = 8192` — at `camDist=10.5` the visible texels are still mostly above 1 px on a 1080p screen.

**Spatial-dedup tightening** at `LocationClient.tsx:1781` — same boundaries as the `popMin` ladder, separate values:

```ts
const sepThresh =
  camDist > 22 ? 6.0 :
  camDist > 18 ? 3.5 :
  camDist > 14 ? 1.8 :
  camDist > 12 ? 0.9 :
  camDist > 11 ? 0.5 :
                 0.2;   // new band — ~22 km between cities
```

Without the new band, the 1K dataset would visually overlap into illegible mush at full zoom.

### Data flow

1. User zooms past `camDist=11`. `setCamDist` fires (rounded to 0.5).
2. `CityLabels` re-renders with new `popMin = 1_000`.
3. `useEffect` sees `popMin <= 1_000` for the first time → fires `loadSmallCities(seen)`.
4. Fetch resolves → `_small` populated → `_smallVersion++` → subscribers notified.
5. `useSmallCitiesVersion` re-renders `CityLabels` → `useMemo` rebuilds `items` with merged dataset.
6. Mesh re-renders. Aspen, Sedona, Bar Harbor, etc. appear.

Subsequent zoom-outs and zoom-ins don't re-fetch — `_smallLoadPromise` is sticky once resolved.

### Error handling

- `/public/data/cities-geonames-1k.json` 404 or net failure → `loadSmallCities` swallows + warns once + sets `_smallLoadPromise = null` so a later retry on next zoom-in is possible. UI falls back to current 15K behavior.
- Dataset has a row with malformed coords → existing `filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))` (mirror the 15K loader's behavior) drops it.
- Bandwidth concern on slow connections: the 10-12 MB hit is lazy. Sessions that never zoom past country tier never pay. Add `Cache-Control: public, max-age=31536000, immutable` via `next.config.mjs` headers if not already covered by the existing `/public/data/*` rule (verify during implementation).

### Testing

Manual checks at `camDist <= 10.7`:
- **Aspen, CO** (pop ~7K) — appears.
- **Sedona, AZ** (pop ~10K) — appears.
- **Bar Harbor, ME** (pop ~5K) — appears.
- **Saint-Tropez, FR** (pop ~4K) — appears.

Smoke checks at higher tiers:
- `camDist=20` — no change vs `main`. Same 1.5M+ cities.
- `camDist=15` — no change. Same 100K+ cities.

Frame check:
- The mesh rebuild on first `popMin=1000` transition is the only suspect for a hitch. Profile with DevTools — target ≤ 100 ms first-build, ≤ 16 ms subsequent.

### Files touched

- `app/plan/location/globe/cityData.ts` — new exports for the small dataset.
- `app/plan/location/LocationClient.tsx` — `popMin` + `sepThresh` ladder rewrite, `OrbitControls.minDistance`, `CityLabels` `useMemo` + `useEffect`.
- `public/data/cities-geonames-1k.json` — new asset.
- `bin/fetch-cities-1k.mjs` — new build helper (manual run).

## Open question (defer to implementation)

The build script `fetch-cities-1k.mjs` could either run at deploy time (Vercel `prebuild` hook) or be manual. Manual keeps deploys deterministic; auto-prebuild keeps the dataset fresh. Recommend manual for now — re-run quarterly. Decision can be deferred to the plan.

## Out-of-scope follow-ups

- Country-label vertical/horizontal centering nudge for the new dense-zoom band (small cities may sit on top of country labels at deep zoom). If observed during testing, add to a follow-up.
- Streaming the 1K JSON via `fetch` + `ReadableStream` chunks instead of `response.json()`. Premature; current sub-100 ms parse is fine.
