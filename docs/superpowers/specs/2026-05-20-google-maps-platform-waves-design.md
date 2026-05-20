# Google Maps Platform — Waves 1+2 + Cost Mitigations

**Date:** 2026-05-20
**Status:** Spec
**Author:** Claude (with nejihyuga1600)

## Goal

Add three high-impact travel-UX features (Street View Static, Weather, Time Zone) AND apply five cost-mitigation patterns that cut projected scale-spend by ~75%. Migrate Places + Directions to Google's next-gen API tiers in the same pass. Wave 3 items captured as deferred design notes.

## Why this scope

A scale model at 10,000 MAU / 6,000 active trips per month projects:

| Path | Net monthly Google bill |
|---|---|
| Do nothing | ~$1,940 |
| Apply mitigations + migrate to new API tiers | ~$390 |
| Mitigations + new tiers + Wave 1 features added | ~$510 |

The mitigations are mostly free engineering (the way Google now recommends calling its APIs), so doing them alongside Wave 1 costs nothing extra and locks in the savings before scale.

## Scope decisions locked in by brainstorming

- Time zone storage: **new `TripDraft.timezone String?` Prisma migration** (queryable, survives device switch).
- Weather scope: **current + 7-day forecast** (covers ~95% of trip planning windows).
- Street View surfaces: **all four** — ActivityBlock, BookView, RecPanel, DayMap pin popups.
- Phase 5 (server `route_between`): still deferred per prior decision; revisit after 30 days of Routes API usage data.

## Architecture overview

Mirrors the Phase 0 pattern that just shipped for the Mapbox migration. Each API gets:
1. A server-side proxy at `app/api/<name>/route.ts` that hides the key, applies cache headers, and normalizes the response shape.
2. A thin client wrapper at `lib/googleMaps/<name>Client.ts` that calls the proxy and decodes the response.
3. Consumers across `app/components/` and `app/plan/*/` that use the client wrapper directly.

All routes accept `GOOGLE_PLACES_API_KEY` in their fallback chain (already wired in the prior `cf70ce5` commit).

## File structure

```
prisma/
  schema.prisma                          — adds TripDraft.timezone

lib/googleMaps/
  streetView.ts                          — buildStreetViewUrl(lat, lng, opts)
  weatherClient.ts                       — fetchWeather(lat, lng, days?)
  timezoneClient.ts                      — fetchTimezone(lat, lng)
  placesSession.ts                       — Places Autocomplete session-token helper
  cache.ts                               — shared LRU+TTL cache for client-side reuse

app/api/
  streetview/route.ts                    — GET ?lat=&lng=&heading?=&size?= → 302 to Google
  weather/route.ts                       — GET ?lat=&lng=&days=0|7 → JSON
  timezone/route.ts                      — GET ?lat=&lng= → JSON
  directions/route.ts                    — MODIFIED — Vercel KV cache, Routes API v2
  geocode/route.ts                       — MODIFIED — preserves existing cache
  og-trip-map/[tripId]/route.ts          — GET → PNG via Maps Static API

app/components/
  StreetViewThumb.tsx                    — NEW. <img> with skeleton + fallback
  ActivityBlock.tsx                      — adds <StreetViewThumb>
  BookView.tsx                           — adds <StreetViewThumb>

app/plan/summary/
  RecPanel.tsx                           — adds <StreetViewThumb>
  DayMap.tsx                             — adds <StreetViewThumb> inside pin popups
  UnifiedTripMap.tsx                     — adds weather strip on day headers

app/plan/style/page.tsx                  — resolves + persists trip timezone on destination-lock
app/trip/[tripId]/live/page.tsx          — adds current-weather banner
app/api/chat/route.ts                    — passes weather forecast as context
app/components/CityMapView.tsx           — Places API (New) migration + session tokens + field masking
```

## Wave 1 — three new features

### 1.1 Street View Static

**Server route** `app/api/streetview/route.ts`:
- GET handler, runtime `nodejs`.
- Params: `lat`, `lng` required; `heading`, `pitch`, `fov`, `size` optional with sensible defaults (`heading=0`, `pitch=10`, `fov=80`, `size=400x300`).
- Validates lat/lng are finite numbers (returns 400 if not).
- Builds signed Google URL: `https://maps.googleapis.com/maps/api/streetview?location={lat},{lng}&size={size}&heading={heading}&pitch={pitch}&fov={fov}&source=outdoor&key={KEY}`.
- Returns 302 redirect to the Google URL. Cache-Control: `public, max-age=604800, s-maxage=604800, immutable` (1 week — Street View at a coord rarely changes; immutable so the browser never re-validates).
- Auth-gates with the existing `auth()` pattern so anonymous traffic can't burn quota.

**Client component** `app/components/StreetViewThumb.tsx`:
- Props: `lat: number`, `lng: number`, `heading?: number`, `alt: string`, `className?: string`, `aspectRatio?: '4/3' | '16/9' | '1/1'`.
- Renders a `<div>` with a skeleton placeholder, plus an `<img src="/api/streetview?lat=...&lng=...">`.
- `onError`: swap to a neutral gradient placeholder (no API call).
- `loading="lazy"` for offscreen cards.
- Browser cache hit means zero re-fetch on remount.

**Consumers:**
- `ActivityBlock.tsx`: small thumb left of activity title when `lat`/`lng` resolved.
- `BookView.tsx`: large thumb in hotel/restaurant card hero area.
- `RecPanel.tsx`: thumb on the AI suggestion chip.
- `DayMap.tsx`: thumb inside the Google `InfoWindow` when user taps a pin.

### 1.2 Weather API

**Server route** `app/api/weather/route.ts`:
- GET handler, runtime `nodejs`.
- Params: `lat`, `lng` required; `days=0` (current only) or `days=7` (current + 7-day forecast).
- Coalesces lat/lng to 2-decimal precision (~1.1km grid) for cache key.
- Calls Google Weather API `/v1/currentConditions:lookup` (current) and `/v1/forecast/days:lookup?days=7` (forecast).
- Returns `{ current: {...}, forecast: [...] }`. Forecast omitted when `days=0`.
- Cache-Control: `public, max-age=3600, s-maxage=3600, stale-while-revalidate=21600` (1h fresh, 6h stale-while-revalidate for forecast).

**Client wrapper** `lib/googleMaps/weatherClient.ts`:
- Exports `WeatherResult` interface and `fetchWeather(lat, lng, days?)`.
- Returns `null` on any error (consumers degrade gracefully).

**Consumers:**
- `UnifiedTripMap.tsx`: small weather strip across each day-header row (icon + high/low).
- `app/trip/[tripId]/live/page.tsx`: current-conditions banner above the live map.
- `app/api/chat/route.ts`: when assembling the system prompt for an active trip, fetch the forecast for the trip's destination + dates and inject as `[Current weather context: ...]` so the AI can reason about it without a separate tool call.

### 1.3 Time Zone API

**Prisma migration** `prisma/schema.prisma`:
- Add `timezone String?` to `TripDraft` model.
- Migration name: `add_trip_timezone`.

**Server route** `app/api/timezone/route.ts`:
- GET handler, runtime `nodejs`.
- Params: `lat`, `lng` required.
- Calls `https://maps.googleapis.com/maps/api/timezone/json?location={lat},{lng}&timestamp={epochSec}&key={KEY}`.
- Returns `{ ianaId, utcOffsetSec, dstOffsetSec }`.
- Cache-Control: `public, max-age=31536000, immutable` (1 year — timezone of a coordinate is effectively static).

**Client wrapper** `lib/googleMaps/timezoneClient.ts`:
- Exports `TzResult` interface and `fetchTimezone(lat, lng)`.

**Integration:**
- `app/plan/style/page.tsx` (where destination + dates get locked in): after destination is geocoded to lat/lng, call `fetchTimezone()` and PATCH the trip with the resolved `timezone` field.
- A new `useTripTimezone(tripId)` hook reads `trip.timezone` and falls back to `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser local) when null.
- All activity time renders switch to `new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' })`.

## Wave 2 — migrations to next-gen API tiers

### 2.1 Places API (New) migration

Current code uses the legacy `google.maps.places.AutocompleteService` + `PlacesService.getDetails()` in `CityMapView.tsx`. Migrate to:
- `google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions()` (new) — returns `AutocompleteSuggestion[]` with `placePrediction.place` references.
- `place.fetchFields({ fields: ['displayName', 'location'] })` (new) — explicit field masking. Use **only `displayName` and `location`** (Basic Data — free under the new pricing).

Side benefits:
- Cleaner async/await API (no callbacks).
- Better TS types in `@types/google.maps`.

### 2.2 Routes API migration

Current `/api/directions/route.ts` calls `/maps/api/directions/json` (legacy Directions API). Migrate to:
- `POST https://routes.googleapis.com/directions/v2:computeRoutes` with a body of `{ origin, destination, travelMode, routingPreference }`.
- Field mask via header: `X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline` (drops unused traffic/leg detail; cheaper billing tier).
- Response handling: decode `routes[0].polyline.encodedPolyline` exactly like today (same polyline-5 format).

Same client wrapper (`fetchDirections`) — only the server route changes. Client doesn't need to know.

### 2.3 Maps Static API — OG share cards

**Server route** `app/api/og-trip-map/[tripId]/route.ts`:
- GET handler, runtime `nodejs`.
- Loads the trip's pins from Prisma.
- Calls `https://maps.googleapis.com/maps/api/staticmap?size=1200x630&style=...&markers=color:purple|{lat,lng}|...&path=color:0xa78bfa80|weight:3|{...}&key={KEY}`.
- Returns the PNG image bytes directly with `Content-Type: image/png` and `Cache-Control: public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800`.

**Integration:**
- Trip-page metadata: `generateMetadata` returns OG image URL pointing at this route.
- Twitter / Discord / iMessage previews automatically pick up the map image.

## Cost mitigations (applied across the codebase)

### M1 — Session tokens on Places Autocomplete

Today the typeahead in `CityMapView.tsx` charges per-request (`$17/1k`). With session tokens, an entire autocomplete-to-detail flow bills as one **session** (`$2.83/session`).

**Change in `CityMapView.tsx`:**
- Create a `sessionTokenRef` on mount: `const sessionTokenRef = useRef(new google.maps.places.AutocompleteSessionToken())`.
- Pass `sessionToken: sessionTokenRef.current` to every `getPlacePredictions` call.
- Pass the same `sessionToken` to the final `getDetails` call.
- After `getDetails` resolves (session closes), regenerate the token for the next session.

**Estimated savings at 6k trips/mo:** $970/mo.

### M2 — Field masking on Places getDetails

Today `getDetails` requests `['geometry', 'name']`. The new Places API charges per field-tier. If we keep fields ⊂ **Basic Data** (`displayName`, `location`, `id`, `formattedAddress`, `addressComponents`), the bill is $0 for that call.

**Change in `CityMapView.tsx`:**
- Update `fetchFields({ fields: ['displayName', 'location'] })`.

**Estimated savings at 6k trips/mo:** $306/mo.

### M3 — Vercel KV cache on Directions

Today `/api/directions/route.ts` has only HTTP Cache-Control headers (browser/CDN cache, not server-side). Identical leg requests from different browsers re-hit Google.

**New behavior:**
- Server-side cache keyed `directions:{originLat},{originLng}:{destLat},{destLng}:{mode}` with 24h TTL.
- Use Vercel KV (Marketplace integration — Upstash Redis under the hood) when `KV_URL` env is set; fall back to in-memory `Map` (per-instance) when not.
- Cache hit returns cached `{ polyline, durationSec, distanceM }` instantly.

**Estimated savings at 6k trips/mo:** $120/mo.

### M4 — CDN cache-control on Street View

Already in the Wave 1.1 design (1-week immutable `Cache-Control` header). Listed explicitly here because it's worth $96/mo at 6k trips.

### M5 — Weather lat/lng coalescing

Already in the Wave 1.2 design (round to 2 decimals for cache key). Listed here for completeness.

**Estimated savings at 6k trips/mo:** $60/mo.

### M6 — Google Cloud budget alarms (config-only)

Set in Google Cloud Console:
- Threshold 50% of $200 free credit → email warning
- Threshold 100% → email + Slack
- Threshold $500/mo absolute → page on-call
- Threshold $1k/mo absolute → API key auto-disable

Documented in `CLAUDE.md` so future Claude sessions know the alarms exist.

## Wave 3 — DEFERRED, design notes only

These need their own design pass before code. Captured here so they don't get lost.

### Maps Grounding Lite API
Upgrade the AI agent's `find_places` + `route_between` + `geocode` tools to use the new Grounding Lite endpoint designed for LLM consumption. Could subsume Phase 5 (server `route_between` migration). Estimated effort: 1 spec session + 1 implementation session. Estimated savings: not yet quantified (new product, beta pricing).

### Aerial View API
Cinematic flyover videos when a user first drops the portal on a destination. Async video-generation API (request → poll → display). UX wow factor. Estimated effort: substantial — needs polling, video player, async UX.

### Air Quality + Pollen APIs
Health-conscious trip filters ("show me hotels in low-AQI neighborhoods"). Pollen useful for allergy-prone users. Estimated effort: small; depends on the filtering UX you want.

### Roads API
Snap GPS breadcrumbs to roads on the live trip page. Only worth shipping if you actually persist + render the user's walked path. Today the live page shows position, not history.

### Distance Matrix API
Multi-stop trip optimization. Heavy overlap with Routes API's `computeRouteMatrix` — use that instead if you build trip-optimization.

### Photorealistic 3D Tiles
Could replace the cartoon globe. **Probably skip** — cartoon globe is brand identity.

## Cost projections (revised, 10k MAU / 6k active trips/mo)

| Line item | Unoptimized | With mitigations + new API tiers + Wave 1 |
|---|---|---|
| Maps JS Dynamic loads | $210 | $210 |
| Places Autocomplete | $1,020 | $50 (session tokens) |
| Places getDetails | $306 | $0 (Basic-only field mask) |
| Directions / Routes | $240 | $120 (KV cache + Routes tier) |
| Geocoding | $90 | $90 |
| Street View Static | — | $30 (Wave 1) |
| Weather | — | $60 (Wave 1, coalesced) |
| Time Zone | — | $30 (Wave 1) |
| Maps Static (OG cards) | — | $20 (Wave 2.3) |
| **Subtotal** | **~$1,866** | **~$610** |
| Less $200 free credit | -$200 | -$200 |
| **NET / mo** | **~$1,666** | **~$410** |

At 10k MAU / 80% conversion (10k active trips): scale linearly to ~$680/mo net.

## Verification per task

Each task ships with:
- `npx tsc --noEmit --skipLibCheck` clean.
- Browser verification of the new surface (manual; no automated UI tests for these flows).
- For server routes: a curl smoke test confirming a real Google response comes back.
- Per-commit verification that no other surface regressed.

## Out of scope

- Wave 3 items above (deferred — each needs own design).
- The deferred Phase 5 (server `route_between.ts`) — revisit after 30 days of Routes API usage data.
- Native iOS/Android Maps SDK adoption — Capacitor WebView path is fine.

## Open decisions

- **OG card style:** match the current geknee dark aesthetic, or use Google's default Static Maps colors? Recommend custom dark style + purple pins (matches the in-app trip view).
- **Weather provider:** Google Maps Platform Weather API (newer, ~$5/1k) vs. OpenWeather (existing `OPENWEATHER_API_KEY` env var). Spec assumes Google; if OpenWeather is cheaper at scale we can re-evaluate.
- **Vercel KV provisioning:** is there an existing KV instance, or do we provision one fresh? Need to verify before M3 ships.
