# Mapbox → Google Maps Migration

**Date:** 2026-05-20
**Status:** Spec
**Author:** Claude (with nejihyuga1600)

## Goal

Remove Mapbox from geknee.com and consolidate on Google Maps for every
client-side map surface and the server-side AI agent routing tool.
Outcome: one mapping provider, one API key story, no `mapbox-gl` in the
client bundle.

## Why now

- The codebase already runs Google Maps on `UnifiedTripMap`, the live-trip
  `GoogleLiveMap.tsx`, and several Places/Directions/Geocoding API routes
  (`app/api/place-photo`, `place-images`, `geocode`, `popular-times`,
  `map-tile`). Two providers is duplicated cost and double surface area.
- Mapbox is shipped to the client as `mapbox-gl` (≈700 KB) plus a separate
  style fetch — the dependency tax is paid even on pages that never render
  a Mapbox map.
- `lib/googleMapsLoader.ts` already exists and handles async load + ready
  callback; no platform groundwork needed.

## Current Mapbox surfaces (inventory)

| File | Role | Mapbox usage |
|---|---|---|
| `app/components/CityMapView.tsx` | City map users land on from the globe | Map + markers + style `mapbox/dark-v11` |
| `app/plan/summary/DayMap.tsx` | Per-day itinerary map | Map + markers + Directions polyline + Geocoding fallback |
| `app/plan/summary/UnifiedTripMap.tsx` | Whole-trip overview | Already partially Google; Mapbox left over for some route legs and the "Dark Mapbox-equivalent style for Google Maps" comment confirms intent |
| `app/trip/[tripId]/live/page.tsx` | Live trip view (companion `GoogleLiveMap.tsx` already exists) | Map + markers + Directions + Geocoding |
| `lib/agent/tools/route_between.ts` | Server-side directions tool for the AI agent | Mapbox Directions REST |
| `app/plan/summary/lib/places.ts` | Profile mapping (taxi/walk/bike → Mapbox profile) | Conceptual only |
| `app/api/itinerary/route.ts` | Itinerary prompt mentions Mapbox routing | Comment only |
| `app/privacy/page.tsx` | Privacy notice naming "Mapbox" as a sub-processor | Copy only |

Comment-only references in `PublicGlobe.tsx`, `HeroGlobe.tsx`,
`native-offline-maps.ts`, `atlas/destinations.ts`, and stale comments in
`LocationClient.tsx` get cleaned up in Phase 6.

## Approach

Surface-by-surface, shipped independently. Mapbox and Google coexist
between phases; the `mapbox-gl` dependency is only dropped in Phase 6.

Each phase is one PR-sized commit on `main` (or a short-lived feature
branch if the diff is large). Each phase MUST leave the app functional
on every other surface — no half-migrations across files.

## Phase 0 — Shared helpers (no user-visible change)

New files under `lib/googleMaps/`:

- `darkStyle.ts` — export the dark-theme `MapTypeStyle[]` array. Extract
  from the existing inline value at `app/plan/summary/UnifiedTripMap.tsx`
  near line 1954 so every surface uses one source.
- `marker.ts` — `createPurpleMarker(map, position, opts?) → AdvancedMarkerElement`.
  Wraps `google.maps.marker.AdvancedMarkerElement` with the existing
  purple-pin DOM (same swatch used in `DayMap` / `CityMapView` today).
- `route.ts` — `drawRoute(map, points, mode) → { polyline, bounds }`.
  Draws a polyline from a sequence of `LatLng` points and returns a
  bounds object the caller can `fitBounds` against. Mode mapping:
  `walking → WALKING`, `driving|taxi → DRIVING`, `cycling → BICYCLING`,
  `transit|subway|bus|train → TRANSIT`. Flight and ferry: no Google
  profile — fall back to straight-line polyline (same as Mapbox today).
- `directions.ts` (server) — thin wrapper around the Google Directions
  REST endpoint, used by `route_between.ts` in Phase 5.

Env setup:
- Client: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (already present per
  `lib/googleMapsLoader.ts`).
- Server: add `GOOGLE_MAPS_API_KEY` (separate key, HTTP-referrer
  restricted is NOT what we want for server — restrict by IP or use
  unrestricted with billing alerts).

Phase 0 ships with zero behavioral changes; later phases just import the
helpers.

## Phase 1 — `CityMapView.tsx`

Most user-visible surface (globe → city handoff). Migrating this first
proves the marker + style helpers work in the highest-stakes context.

Changes:
- Replace `mapboxgl.Map` constructor with `new google.maps.Map(el, …)`.
- Style: `darkStyle` from Phase 0.
- Markers: `createPurpleMarker(...)` for each pin.
- Bounds: `map.fitBounds(latLngBounds, padding)`.
- Loading: `loadGoogleMaps()` from `lib/googleMapsLoader.ts`.
- Remove `import mapboxgl from 'mapbox-gl'` and the CSS import.

Risk: pinch-zoom on touch. Google Maps handles touch natively, but the
`touch-action: none` already on the parent canvas from the globe doesn't
need to apply here.

## Phase 2 — `DayMap.tsx`

Per-day map with markers + a walking/driving route line.

Changes:
- Map + style + markers: same as Phase 1.
- Replace Mapbox Directions fetch with either:
  - `google.maps.DirectionsService` client-side (counts against client key
    quota; needs Directions API enabled on the project), OR
  - Server proxy via a new `app/api/directions/route.ts` that calls
    Google Directions REST with the server key.
  - **Recommendation:** server proxy. Lets us cache, hides the key, and
    matches the pattern already used by `app/api/geocode/route.ts`.
- Replace Mapbox Geocoding fallback at `DayMap.tsx:213` with a call to
  the existing `app/api/geocode` route (already Google-backed).

## Phase 3 — `UnifiedTripMap.tsx`

Mostly Google already. Audit and remove residual Mapbox calls (the
`MAPBOX_TOKEN` fetch around line 955-977 for per-leg route polylines).

Replace with the same server proxy from Phase 2.

## Phase 4 — `app/trip/[tripId]/live/page.tsx`

`GoogleLiveMap.tsx` already exists adjacent to this file. The migration
here is largely "wire it up and delete the inline Mapbox map component."

Changes:
- Replace the inline `LiveMap` component (lines ~611-825) with the
  exported `GoogleLiveMap`.
- ETA computation at lines 243-275 currently uses Mapbox Geocoder +
  Directions — switch to the `app/api/geocode` route + the new
  `app/api/directions` route.
- Drop `import mapboxgl from 'mapbox-gl'` and the CSS import.

## Phase 5 — `lib/agent/tools/route_between.ts` (server-side, AI agent)

Replace Mapbox Directions REST call with Google Directions REST via the
helper from Phase 0 (`lib/googleMaps/directions.ts`).

Cost note (see below). If the cost is unacceptable, this phase MAY be
deferred indefinitely — the AI agent's `route_between` is server-side
and can stay on Mapbox without leaking the dependency to the client.
Phase 6 (cleanup) is unaffected since `mapbox-gl` is client-only.

## Phase 6 — Cleanup & verification

- Remove `"mapbox-gl": "^3.19.1"` from `package.json`.
- Remove `NEXT_PUBLIC_MAPBOX_TOKEN` from `.env*` (keep in `.env.example`
  briefly with a deprecation comment, then strip).
- Update `app/privacy/page.tsx` line 68 to name Google Maps as the map
  provider (and drop the Mapbox bullet).
- Strip stale Mapbox comments from `LocationClient.tsx:2193`,
  `LocationClient.tsx:2423-2425`, and the comment-only files listed in
  the inventory.
- If Phase 5 was deferred: keep `MAPBOX_TOKEN` (server-only) and the
  `lib/agent/tools/route_between.ts` import path. Document in
  `CLAUDE.md` that Mapbox lives on for the agent tool only.
- Update `CLAUDE.md` "Tech notes" section to remove the implicit Mapbox
  reference.

## Cost & key management

⚠️ **Warning per `feedback_api_cost_warnings.md` — any new monthly cost
above $10 needs explicit sign-off.**

| API | Pricing | Current usage estimate | Monthly cost estimate |
|---|---|---|---|
| Google Maps JavaScript API | $7 per 1,000 map loads (10k free) | Already loaded; no change | $0 incremental |
| Google Directions API | $5 per 1,000 requests | Day routes (~2k trips × ~10 days × 3 legs × 1-2 retries) | **$150–$300/mo** |
| Google Geocoding API | $5 per 1,000 requests | Address fallback on live page + DayMap | **$25–$75/mo** |
| Mapbox (current) | Free up to 50k map loads + 100k Directions/mo | Within free tier | $0 |

**Mitigations baked into the plan:**

1. Server-side route proxy (`app/api/directions`) with a 24-hour
   `kv`/in-memory cache keyed on `(origin, dest, mode)`. Most routes
   re-render the same legs across sessions.
2. Client-side localStorage cache for resolved legs (already used for
   places — extend pattern).
3. Throttle the live page's ETA Directions call from "every geolocation
   update" to "≥60s since last call AND ≥50m moved."
4. Mark non-essential modes (flight, ferry) as straight-line in the
   helper so they never hit Directions API at all.

With those, expected cost lands in the $50–$120/mo range. If billing
spikes, Phase 5 deferral cuts the largest line item (the agent tool).

## Verification per phase

For each surface, before merging:

1. `pnpm typecheck` clean.
2. `pnpm dev`, open the surface, confirm:
   - Map renders with dark style.
   - Markers appear at correct positions.
   - For routing surfaces: polyline traces a sane path, ETA renders.
3. No console errors mentioning `mapbox`, `mapbox-gl`, or `MAPBOX_TOKEN`.
4. Build size check after Phase 6: `mapbox-gl` no longer in
   `.next/static/chunks/*` output.

## Out of scope

- The double-click-portal-zoom feature (briefed separately at
  `.planning/design-2026-05-20/CLAUDE-design-session.md`).
- Any visual redesign of the maps beyond matching the current dark feel.
- Migrating away from Google for the API routes that are already Google
  (`place-photo`, `place-images`, `popular-times`, `geocode`,
  `map-tile`) — they stay as-is.
- Offline tile caching in `lib/native-offline-maps.ts` — the comment
  there mentions Mapbox/MapLibre, but the file is a no-op stub today.
  Leave alone.

## Open decisions

- **Phase 5 (server-side `route_between`):** ship or defer? Decision
  owner: nejihyuga1600. Recommend deferring until Phase 1-4 are live and
  Directions API spend has 30 days of real usage data.
- **Directions caching layer:** in-memory per Function instance, or
  Vercel KV / Marketplace KV? Recommend in-memory for first ship, KV
  only if hit rate justifies it (visible from logs).
