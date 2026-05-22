# Globe zoom smoothness + small-city population — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make zoom smoother on slower laptops, and surface small cities (~pop 1K+) at the deepest zoom band on the `/plan/location` globe.

**Architecture:** Two independent slices.
- *Zoom perf*: introduce a single motion-state ref consulted by a DPR-lowering controller and the per-frame country-label scaler; tune `OrbitControls` damping.
- *Small cities*: ship a static `cities-geonames-1k.json` and lazy-load it at deepest zoom; fix a dead branch in the `popMin` tier ladder and lower `minDistance` so the new tier is reachable.

**Tech Stack:** Next.js App Router 16, React 19, `@react-three/fiber`, `@react-three/drei` (OrbitControls), Three.js, Playwright (verification).

**Spec:** [`docs/superpowers/specs/2026-05-22-globe-zoom-cities-design.md`](../specs/2026-05-22-globe-zoom-cities-design.md)

**Testing approach:** This project has no jest/vitest. Verification uses Playwright (already installed for `bin/bake-overlays.mjs`) plus manual Chrome DevTools frame profiling. Each task's "test" step boots the dev server, navigates the headless browser to `/plan/location`, and asserts a specific runtime observable (canvas DPR, console behavior, mesh count, label presence) via `browser_evaluate`.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `app/plan/location/LocationClient.tsx` | modify | Main globe glue. Add `useGlobeMotion` hook, `DprController` component; modify country-label `useFrame`; rewrite `popMin` + `sepThresh` ladders; lower `minDistance`; wire `CityLabels` to small dataset. |
| `app/plan/location/globe/cityData.ts` | modify | Add exports for the new small-cities tier (`_small`, `_smallVersion`, `_smallLoadPromise`, `getSmallCities`, `useSmallCitiesVersion`, `loadSmallCities`). |
| `public/data/cities-geonames-1k.json` | create | Static asset. ~150K rows, ~10-12 MB. Lazy-fetched at deepest zoom. |
| `bin/fetch-cities-1k.mjs` | create | One-shot build helper. Downloads `cities1000.zip` from GeoNames, parses the ZIP inline with `zlib.inflateRawSync` (no shell exec), parses TSV, writes JSON. Manual run; not part of `next build`. |

---

## Task 1 — useGlobeMotion hook + DprController

**Files:**
- Modify: `app/plan/location/LocationClient.tsx` (near `DampingUpdater`, around line 1950; and inside `<Canvas>` content, around line 3140)

**Why:** A single motion-state ref drives the DPR drop and (in Task 2) the label scale batching. Idle detection lives in `useFrame` so React never re-renders on motion changes.

- [ ] **Step 1.1** — In `LocationClient.tsx`, immediately after the `DampingUpdater` component declaration (search for the comment `// ─── Keeps OrbitControls damping ticking every frame ───`), add this module-scope motion state and the controller component:

```tsx
// ─── Globe motion state (drives DPR drop + label scale batching) ─────────────
// Module-scope ref so DprController and label useFrames share one source of
// truth without prop drilling or context. Idle threshold = 250ms after the
// last bumpMotion() call.
const globeMotion = { moving: false, lastBumpAt: 0 };
function bumpMotion() {
  globeMotion.moving = true;
  globeMotion.lastBumpAt = performance.now();
}

// Drops gl.setPixelRatio to 1 while the camera is moving; restores it on
// idle. Single biggest perf win for integrated-GPU laptops since fragment
// shading scales quadratically with DPR.
function DprController() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const appliedRef = useRef<number | null>(null);
  useFrame(() => {
    const now = performance.now();
    if (globeMotion.moving && now - globeMotion.lastBumpAt > 250) {
      globeMotion.moving = false;
    }
    const target = globeMotion.moving ? 1.0 : Math.min(window.devicePixelRatio, 2);
    if (appliedRef.current !== target) {
      gl.setPixelRatio(target);
      gl.setSize(size.width, size.height, false);
      appliedRef.current = target;
    }
  });
  return null;
}
```

- [ ] **Step 1.2** — Mount `<DprController />` inside `<Canvas>` next to the existing `<DampingUpdater />` (grep `<DampingUpdater />` to find it):

```tsx
<DampingUpdater />
<DprController />
```

- [ ] **Step 1.3** — Wire `bumpMotion()` into the existing input handlers. In `LocationClient.tsx`, locate the pointer-drag handler (search for `const onDown = (e: PointerEvent)` around line 2108). Add `bumpMotion()` as the first statement of `onDown` AND as the first statement of `onMove` (search for `const onMove`):

```tsx
const onDown = (e: PointerEvent) => {
  bumpMotion();
  // ... existing body unchanged
};
```

```tsx
const onMove = (e: PointerEvent) => {
  bumpMotion();
  // ... existing body unchanged
};
```

If `onMove` doesn't exist by that exact name, add `bumpMotion()` to whatever pointermove handler is registered on the canvas in that effect.

- [ ] **Step 1.4** — Also wire `bumpMotion()` to the wheel event. In the same effect that registers `onDown`/`onMove`, add a wheel listener:

```tsx
const onWheel = () => bumpMotion();
el.addEventListener("wheel", onWheel, { passive: true });
// ... later in cleanup:
el.removeEventListener("wheel", onWheel);
```

If a wheel handler already exists, prepend `bumpMotion()` to its body instead.

- [ ] **Step 1.5** — Run typecheck. Expected: no errors.

```bash
npx tsc --noEmit
```

- [ ] **Step 1.6** — Start dev server, navigate via Playwright MCP, verify DPR transitions:

```bash
npm run dev
```

Wait for `Ready in`, then via Playwright MCP: navigate to `http://localhost:3000/plan/location`, wait ~6 s, then `browser_evaluate`:

```js
async () => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  const dprBefore = c.width / c.clientWidth;
  for (let i = 0; i < 20; i++) {
    c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -50, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  }
  await new Promise(r => setTimeout(r, 50));
  const dprMidMotion = c.width / c.clientWidth;
  await new Promise(r => setTimeout(r, 400));
  const dprIdle = c.width / c.clientWidth;
  return { dprBefore, dprMidMotion, dprIdle };
}
```

Expected: `dprMidMotion ≈ 1.0`, `dprBefore ≈ dprIdle ≈ Math.min(devicePixelRatio, 2)`.

- [ ] **Step 1.7** — Commit.

```bash
git add app/plan/location/LocationClient.tsx
git commit -m "perf(globe): drop pixel ratio during zoom motion — DprController + motion ref

useGlobeMotion module-state ref + 250ms idle timer. DprController reads it
inside useFrame and calls gl.setPixelRatio(1.0) on motion / restore on idle.
Single biggest GPU win for integrated-graphics laptops; invisible at speed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2 — Country-label scale batching

**Files:**
- Modify: `app/plan/location/LocationClient.tsx` around line 1640 (the country-label `useFrame` callback)

**Why:** ~200 labels each run `pow(camDist/15, 1.4) + scale.setScalar` per frame. Skipping when delta is negligible OR the label is back-facing cuts CPU cost ~80% during motion. Combined with the DPR drop from Task 1, frame budget is freed up.

- [ ] **Step 2.1** — In `LocationClient.tsx`, locate the country-label `useFrame` (search for the comment `// Per-frame zoom-aware scale on the text group only` around line 1637). Replace the existing `useFrame` body. The existing code is:

```tsx
const textGroupRef = useRef<THREE.Group>(null);
useFrame(({ camera }) => {
  if (!textGroupRef.current) return;
  const camDist = camera.position.length();
  textGroupRef.current.scale.setScalar(Math.pow(camDist / 15, 1.4));
});
```

Replace it with:

```tsx
const textGroupRef = useRef<THREE.Group>(null);
const lastAppliedScaleDistRef = useRef<number>(0);
useFrame(({ camera }) => {
  if (!textGroupRef.current) return;
  const camDist = camera.position.length();
  // During motion, skip when camera barely moved — saves ~200×/frame
  // matrix updates across all country labels.
  if (globeMotion.moving && Math.abs(camDist - lastAppliedScaleDistRef.current) < 0.05) return;
  // Cull back-facing labels during motion: skip when the label's outward
  // normal points away from the camera. At rest, every label still gets
  // a perfect scale so legibility is unchanged.
  if (globeMotion.moving) {
    const labelPos = textGroupRef.current.getWorldPosition(new THREE.Vector3());
    const camFwd = camera.position.clone().normalize();
    if (labelPos.normalize().dot(camFwd) < -0.2) return;
  }
  textGroupRef.current.scale.setScalar(Math.pow(camDist / 15, 1.4));
  lastAppliedScaleDistRef.current = camDist;
});
```

The `globeMotion` global comes from Task 1. The `THREE` import is already at top of file.

- [ ] **Step 2.2** — Typecheck.

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2.3** — Playwright visual smoke. Load `/plan/location`, wait for globe, capture screenshot, eyeball it:

```js
() => ({ ok: !!document.querySelector('canvas'), title: document.title })
```

Then `browser_take_screenshot` to `country-labels-baseline.png`. Country labels should be visible on Africa / Eurasia / Americas — same as `main`.

- [ ] **Step 2.4** — Commit.

```bash
git add app/plan/location/LocationClient.tsx
git commit -m "perf(globe): batch country-label scale + back-face cull during motion

Skip the per-frame setScalar when camDist delta is <0.05 OR the label is
back-facing, but only while motion is active. At rest, every label still
scales normally so legibility is unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3 — OrbitControls damping + zoomSpeed tune

**Files:**
- Modify: `app/plan/location/LocationClient.tsx:3152-3154`

**Why:** `dampingFactor=0.12` keeps the camera in the slow-render zone too long; `zoomSpeed=1.2` (drei default) feels jumpy on a desktop wheel. Tighten both so the user spends less time mid-motion.

- [ ] **Step 3.1** — In `LocationClient.tsx`, find the `<OrbitControls>` block (search `<OrbitControls`). Change `dampingFactor` and `zoomSpeed`:

```tsx
<OrbitControls
  makeDefault
  enableZoom
  enablePan={false}
  enableRotate={false}
  minDistance={11.5}
  maxDistance={45}
  zoomSpeed={isMobile ? 0.5 : 0.9}
  enableDamping
  dampingFactor={0.20}
  touches={{ ONE: 0, TWO: 2 }}
/>
```

*(Note: `minDistance={11.5}` stays here. Task 6 drops it to 10.5.)*

- [ ] **Step 3.2** — Typecheck.

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3.3** — Playwright sanity check: load `/plan/location`, dispatch a few wheel events, screenshot. Camera should settle within ~500 ms (no observable in browser_evaluate; this one is human-eye).

- [ ] **Step 3.4** — Commit.

```bash
git add app/plan/location/LocationClient.tsx
git commit -m "tune(globe): faster damping (0.12→0.20), finer zoomSpeed (1.2→0.9)

Less time spent in the rendering-heavy mid-motion zone. Mobile drops
0.6→0.5 to match the perceived speed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4 — bin/fetch-cities-1k.mjs build helper + run it

**Files:**
- Create: `bin/fetch-cities-1k.mjs`
- Create (by running the script): `public/data/cities-geonames-1k.json`

**Why:** Pulls cities1000 from GeoNames, parses the ZIP entirely in Node (using `zlib.inflateRawSync` — no shell exec, no external binary, cross-platform), writes the JSON our runtime loader will fetch. Manual run; safe to re-run quarterly to refresh.

- [ ] **Step 4.1** — Create `bin/fetch-cities-1k.mjs` with this content:

```js
#!/usr/bin/env node
// Fetches GeoNames cities1000 (CC BY 4.0) and writes a minimal JSON to
// public/data/cities-geonames-1k.json. Schema mirrors cities-geonames-15k.json:
//   { n: string, lat: number, lon: number, c: string, p: number }
//
// Manual run: `node bin/fetch-cities-1k.mjs`
// Source: https://download.geonames.org/export/dump/cities1000.zip
// License: CC BY 4.0 — attribution already in the existing footer credits.
//
// Inlines a tiny zip-local-file reader so we don't need an external unzip
// binary or a new npm dep. cities1000.zip has a single member, which
// keeps the reader trivial.

import { mkdirSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { join } from "node:path";

const URL = "https://download.geonames.org/export/dump/cities1000.zip";
const outDir = "public/data";
const outPath = join(outDir, "cities-geonames-1k.json");

console.log(`[fetch] ${URL}`);
const res = await fetch(URL);
if (!res.ok) {
  console.error(`Download failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const zip = Buffer.from(await res.arrayBuffer());
console.log(`[fetch] ${(zip.length / 1024 / 1024).toFixed(2)} MB`);

// Parse the first local file header (PK\x03\x04). cities1000.zip has one
// entry, so we don't need to walk the central directory.
if (zip.readUInt32LE(0) !== 0x04034b50) {
  console.error("Not a zip file (missing local file header signature)");
  process.exit(1);
}
const compMethod    = zip.readUInt16LE(8);
const compressedSz  = zip.readUInt32LE(18);
const filenameLen   = zip.readUInt16LE(26);
const extraLen      = zip.readUInt16LE(28);
const filename      = zip.subarray(30, 30 + filenameLen).toString("utf8");
const dataStart     = 30 + filenameLen + extraLen;
const dataEnd       = dataStart + compressedSz;
console.log(`[zip] entry "${filename}" — method ${compMethod}, ${compressedSz.toLocaleString()} bytes compressed`);

let tsv;
if (compMethod === 0) {
  tsv = zip.subarray(dataStart, dataEnd).toString("utf8");
} else if (compMethod === 8) {
  tsv = inflateRawSync(zip.subarray(dataStart, dataEnd)).toString("utf8");
} else {
  console.error(`Unsupported zip compression method: ${compMethod}`);
  process.exit(1);
}

console.log(`[parse] ${(tsv.length / 1024 / 1024).toFixed(2)} MB TSV`);
const lines = tsv.split("\n");
const out = [];
for (const line of lines) {
  if (!line) continue;
  // GeoNames TSV columns: 0 geonameid | 1 name | 2 asciiname | 3 alternatenames
  // | 4 latitude | 5 longitude | 6 feature class | 7 feature code
  // | 8 country code | ... | 14 population | ...
  const cols = line.split("\t");
  if (cols.length < 15) continue;
  const n = cols[1];
  const lat = Number(cols[4]);
  const lon = Number(cols[5]);
  const c = cols[8];
  const p = Number(cols[14]) || 0;
  if (!n || !Number.isFinite(lat) || !Number.isFinite(lon) || !c) continue;
  if (p < 1000) continue; // cities1000 is already filtered, but defend
  out.push({ n, lat, lon, c, p });
}
out.sort((a, b) => b.p - a.p); // largest first → predictable mesh batching

mkdirSync(outDir, { recursive: true });
const json = JSON.stringify(out);
writeFileSync(outPath, json);
console.log(`[write] ${outPath} — ${out.length.toLocaleString()} rows, ${(json.length / 1024 / 1024).toFixed(2)} MB`);
```

- [ ] **Step 4.2** — Run it.

```bash
node bin/fetch-cities-1k.mjs
```

Expected output ending with `[write] public/data/cities-geonames-1k.json — ~150,000 rows, ~10-15 MB`.

- [ ] **Step 4.3** — Sanity-check the JSON.

```bash
node -e "const c=require('./public/data/cities-geonames-1k.json'); console.log('rows:', c.length); console.log('sample[0]:', JSON.stringify(c[0])); console.log('sample[50000]:', JSON.stringify(c[50000])); console.log('aspen US?', c.find(x => x.n==='Aspen' && x.c==='US')); console.log('sedona US?', c.find(x => x.n==='Sedona' && x.c==='US'));"
```

Expected: rows count >= 130_000. `Aspen, US` present. `Sedona, US` present.

- [ ] **Step 4.4** — Commit script + asset together.

```bash
git add bin/fetch-cities-1k.mjs public/data/cities-geonames-1k.json
git commit -m "data(globe): ship cities1000 dataset for deepest zoom tier

bin/fetch-cities-1k.mjs downloads GeoNames cities1000.zip (CC BY 4.0),
inflates inline via zlib.inflateRawSync (no shell exec), parses TSV,
writes public/data/cities-geonames-1k.json (~150K rows, pop>=1000).
Manual run. Runtime wiring lands in subsequent commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5 — cityData.ts small-cities loader

**Files:**
- Modify: `app/plan/location/globe/cityData.ts`

**Why:** Provide getter, hook, and async loader for the small dataset — mirrors the existing `extras` (15K) pattern so the runtime wiring in Task 6 stays trivial.

- [ ] **Step 5.1** — Open `app/plan/location/globe/cityData.ts`. Find the module-scope `_extra`, `_version`, `_loadPromise`, `subscribers` declarations near the top, and add this block immediately after them:

```ts
// Small cities (~150K rows, pop >= 1000). Lazy-loaded only at deepest
// zoom band — most sessions never pay for it. Source asset baked by
// bin/fetch-cities-1k.mjs.
let _small: City[] = [];
let _smallVersion = 0;
let _smallLoadPromise: Promise<void> | null = null;
const smallSubscribers = new Set<() => void>();
```

(The `City` type is already imported/defined in this file — the existing `_extra: City[]` proves it.)

- [ ] **Step 5.2** — Add three new exported functions at the bottom of the file (after `loadExtraCities`):

```ts
export function getSmallCities(): City[] {
  return _small;
}

export function useSmallCitiesVersion(): number {
  const [v, setV] = useState(_smallVersion);
  useEffect(() => {
    const fn = () => setV(_smallVersion);
    smallSubscribers.add(fn);
    return () => { smallSubscribers.delete(fn); };
  }, []);
  return v;
}

export function loadSmallCities(seenNames: Set<string>): Promise<void> {
  if (_smallLoadPromise) return _smallLoadPromise;
  _smallLoadPromise = (async () => {
    try {
      const res = await fetch("/data/cities-geonames-1k.json", { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as City[];
      // Drop rows already present in CITIES or the extras set so the
      // mesh doesn't render duplicate labels at the same coordinates.
      _small = rows.filter((c) => !seenNames.has(c.n));
      _smallVersion++;
      smallSubscribers.forEach((fn) => fn());
    } catch (e) {
      console.warn("[cityData] loadSmallCities failed; deep-zoom tier will be empty:", e);
      _smallLoadPromise = null; // allow retry on a future call
    }
  })();
  return _smallLoadPromise;
}
```

`useState` and `useEffect` are already imported (used by the existing `useExtraCitiesVersion`).

- [ ] **Step 5.3** — Typecheck.

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.4** — Commit.

```bash
git add app/plan/location/globe/cityData.ts
git commit -m "data(globe): cityData exports for small-cities tier

getSmallCities / useSmallCitiesVersion / loadSmallCities — mirrors the
existing extras pattern. Lazy fetch from /data/cities-geonames-1k.json
with dedup against seenNames. Idempotent; allows retry on failure.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6 — LocationClient: tier ladder + minDistance + CityLabels wiring + verify

**Files:**
- Modify: `app/plan/location/LocationClient.tsx` — the import line for `cityData`, the `CityLabels` component around line 1777, and the `OrbitControls` block around line 3150.

**Why:** This is the bug fix and the new tier wiring in a single commit, so the runtime is always coherent.

- [ ] **Step 6.1** — Extend the cityData import (search `from "./globe/cityData"`). Replace it with:

```tsx
import { getCityInfo, getExtraCities, getSmallCities, loadCityInfo, loadExtraCities, loadSmallCities, useExtraCitiesVersion, useSmallCitiesVersion } from "./globe/cityData";
```

- [ ] **Step 6.2** — Find the `CityLabels` function (search `function CityLabels({ camDist }`) around line 1777. Replace the existing `sepThresh` and `popMin` declarations + the `useMemo`. **Leave everything after the `useMemo` (the `collectedSet` block, the spatial dedup that consumes `sepThresh`, the JSX render) untouched.**

Existing code to replace:

```tsx
const sepThresh = camDist > 22 ? 6.0 : camDist > 18 ? 3.5 : camDist > 14 ? 1.8 : camDist > 11 ? 0.9 : 0.5;
const extraVersion = useExtraCitiesVersion();
const popMin = camDist > 22 ? 1_500_000
            : camDist > 18 ?   400_000
            : camDist > 14 ?   100_000
            : camDist > 11 ?    30_000
            :                        0;

const items = useMemo(() => {
  const base = CITIES.map(({ n, lat, lon }) => ({
    n, lat, lon,
    pos: geoPos(lat, lon, R * 1.001),
    tier: 1,
    pop: Infinity,
  }));
  const extra = getExtraCities()
    .filter((c) => (c.p ?? 0) >= popMin)
    .map((c) => ({
      n: c.n, lat: c.lat, lon: c.lon,
      pos: geoPos(c.lat, c.lon, R * 1.001),
      tier: 3,
      pop: c.p ?? 0,
    }));
  return [...base, ...extra];
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [extraVersion, popMin]);
```

Replace with:

```tsx
// Spatial-dedup threshold by zoom — tighter at deeper zoom = more cities.
// Boundaries aligned with the popMin ladder below.
const sepThresh =
  camDist > 22 ? 6.0 :
  camDist > 18 ? 3.5 :
  camDist > 14 ? 1.8 :
  camDist > 12 ? 0.9 :
  camDist > 11 ? 0.5 :
                 0.2; // ~22 km — deepest zoom band, 1K pop floor

const extraVersion = useExtraCitiesVersion();
const smallVersion = useSmallCitiesVersion();

// Population floor per tier. The deepest band fires loadSmallCities().
// Boundaries align with sepThresh above.
const popMin =
  camDist > 22 ? 1_500_000 :
  camDist > 18 ?   400_000 :
  camDist > 14 ?   100_000 :
  camDist > 12 ?    30_000 :
  camDist > 11 ?    15_000 :
                     1_000;

// Fire lazy load once we enter the deepest tier. cityData side is
// idempotent, so zoom-out / zoom-in cycles don't re-fetch.
useEffect(() => {
  if (popMin <= 1_000) {
    const seen = new Set<string>([
      ...CITIES.map((c) => c.n),
      ...getExtraCities().map((c) => c.n),
    ]);
    void loadSmallCities(seen);
  }
}, [popMin]);

const items = useMemo(() => {
  const base = CITIES.map(({ n, lat, lon }) => ({
    n, lat, lon,
    pos: geoPos(lat, lon, R * 1.001),
    tier: 1,
    pop: Infinity,
  }));
  const extra = getExtraCities()
    .filter((c) => (c.p ?? 0) >= popMin)
    .map((c) => ({
      n: c.n, lat: c.lat, lon: c.lon,
      pos: geoPos(c.lat, c.lon, R * 1.001),
      tier: 3,
      pop: c.p ?? 0,
    }));
  const small = popMin <= 1_000
    ? getSmallCities()
        .filter((c) => (c.p ?? 0) >= popMin)
        .map((c) => ({
          n: c.n, lat: c.lat, lon: c.lon,
          pos: geoPos(c.lat, c.lon, R * 1.001),
          tier: 4,
          pop: c.p ?? 0,
        }))
    : [];
  return [...base, ...extra, ...small];
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [extraVersion, smallVersion, popMin]);
```

If TypeScript complains that `tier: 4` doesn't fit a union literal type, find where the item type is declared (likely a `type` alias in the file or inline) and widen its `tier` to `1 | 3 | 4`. If `tier` is just `number`, no change needed.

If `useEffect` isn't already imported in this file, the existing `useState` import line should have it — verify and add if missing.

- [ ] **Step 6.3** — Lower `OrbitControls.minDistance` from `11.5` to `10.5`:

```tsx
<OrbitControls
  makeDefault
  enableZoom
  enablePan={false}
  enableRotate={false}
  minDistance={10.5}
  maxDistance={45}
  zoomSpeed={isMobile ? 0.5 : 0.9}
  enableDamping
  dampingFactor={0.20}
  touches={{ ONE: 0, TWO: 2 }}
/>
```

- [ ] **Step 6.4** — Typecheck.

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6.5** — End-to-end Playwright verify. Start dev server if not running. Navigate to `/plan/location`. Wait for globe (~6 s). Zoom aggressively then assert the small dataset fetched:

```js
async () => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  for (let i = 0; i < 60; i++) {
    c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -200, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  }
  await new Promise(r => setTimeout(r, 2500));
  const entries = performance.getEntriesByName(window.location.origin + '/data/cities-geonames-1k.json');
  return {
    smallFetched: entries.length > 0,
    smallBytes: entries[0]?.transferSize ?? null,
    smallResponseStatus: entries[0]?.responseStatus ?? null,
    smallDurationMs: entries[0]?.duration ?? null,
  };
}
```

Expected: `smallFetched: true`, `smallBytes > 1_000_000`. Take a screenshot to `cities-1k-zoomed.png` and eyeball it — small-town labels should appear (e.g., somewhere over Colorado, Provence, or southern France).

- [ ] **Step 6.6** — Commit.

```bash
git add app/plan/location/LocationClient.tsx
git commit -m "feat(globe): small-cities tier at deepest zoom + popMin ladder fix

CityLabels now fetches /data/cities-geonames-1k.json the first time the
user reaches camDist <= 11, surfacing towns like Aspen / Sedona / Bar
Harbor. Fixes the dead-branch popMin gate (minDistance was 11.5 but the
permissive branch fired only at camDist <= 11 — never reachable).

OrbitControls minDistance lowered 11.5 → 10.5 so the new tier is reachable
on a single wheel tick from the previous floor. sepThresh tightened to
0.2° (~22km) for the new band so the 1K dataset doesn't visually mush.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7 — Push + final verify

- [ ] **Step 7.1** — Push the local commits to origin.

```bash
git push origin main
```

- [ ] **Step 7.2** — Re-run the Playwright check from Step 6.5 to confirm nothing regressed.

- [ ] **Step 7.3** — If any earlier-task verify regressed, open the relevant diff and fix; otherwise the plan is complete.

---

## Self-Review Summary

**Spec coverage:**
- Spec §1 "Zoom perf" → Tasks 1, 2, 3 (DPR drop, label batch, OrbitControls tune).
- Spec §2 "Small cities" → Tasks 4, 5, 6 (dataset fetch, loader exports, runtime wiring + minDistance + ladders).
- Spec "Open question" (manual fetch vs prebuild hook) → resolved manual in Task 4.

**Placeholder scan:** None. Every step has explicit code or commands.

**Type consistency:**
- `City` type from `cityData.ts` reused across `_small`, `getSmallCities`, `loadSmallCities`. Same shape as `_extra`.
- `tier` widened to `1 | 3 | 4` only if the existing union forces it (otherwise stays `number`).
- `globeMotion` module-state used by Task 1 (`DprController`, handler wiring) and Task 2 (label scale skip). Same shape (`moving: boolean, lastBumpAt: number`).
