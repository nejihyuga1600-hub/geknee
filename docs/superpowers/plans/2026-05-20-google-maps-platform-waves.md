# Google Maps Platform Waves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship Wave 1 (Street View, Weather, Time Zone) + Wave 2 (Places New, Routes API, OG Static) + 6 cost mitigations, in priority order.

**Architecture:** Server-proxy + client-wrapper pattern matching Phase 0 of the Mapbox migration. Each API gets `app/api/<name>/route.ts` + `lib/googleMaps/<name>Client.ts`. Cost mitigations apply across the codebase.

**Spec:** `docs/superpowers/specs/2026-05-20-google-maps-platform-waves-design.md`

**Locked defaults (per resume):**
- OG card style: custom dark + purple pins
- Weather provider: Google Maps Platform Weather API
- KV: probe for `KV_URL` env, fall back to in-memory `Map` per Function instance

---

## Phase A — Cost mitigations (independent, ship first)

These can land before any Wave 1 work because they retrofit existing surfaces.

### A.1 Vercel KV (or in-memory fallback) cache for `/api/directions`

**Files:**
- Create: `lib/cache/directionsCache.ts`
- Modify: `app/api/directions/route.ts`

- [ ] **Step 1: Write the cache helper**

  `lib/cache/directionsCache.ts`:

  ```ts
  // Server-side cache for /api/directions. Uses Vercel KV when KV_URL is
  // configured; falls back to a per-Function-instance Map otherwise.
  // Key: directions:{originLat},{originLng}:{destLat},{destLng}:{mode}
  // TTL: 24h.

  type CachedDirections = {
    polyline: string;
    durationSec: number | null;
    distanceM: number | null;
    cachedAt: number;
  };

  const memCache = new Map<string, CachedDirections>();
  const TTL_MS = 24 * 60 * 60 * 1000;

  function cacheKey(o: {lat:number; lng:number}, d: {lat:number; lng:number}, mode: string) {
    const r = (n: number) => n.toFixed(4);
    return `directions:${r(o.lat)},${r(o.lng)}:${r(d.lat)},${r(d.lng)}:${mode}`;
  }

  async function tryKv(): Promise<typeof import('@vercel/kv').kv | null> {
    if (!process.env.KV_URL && !process.env.KV_REST_API_URL) return null;
    try {
      const mod = await import('@vercel/kv');
      return mod.kv;
    } catch { return null; }
  }

  export async function getCached(o: {lat:number; lng:number}, d: {lat:number; lng:number}, mode: string): Promise<CachedDirections | null> {
    const key = cacheKey(o, d, mode);
    const kv = await tryKv();
    if (kv) {
      const v = await kv.get<CachedDirections>(key);
      if (v && Date.now() - v.cachedAt < TTL_MS) return v;
      return null;
    }
    const v = memCache.get(key);
    if (v && Date.now() - v.cachedAt < TTL_MS) return v;
    if (v) memCache.delete(key);
    return null;
  }

  export async function setCached(o: {lat:number; lng:number}, d: {lat:number; lng:number}, mode: string, value: Omit<CachedDirections, 'cachedAt'>): Promise<void> {
    const key = cacheKey(o, d, mode);
    const entry: CachedDirections = { ...value, cachedAt: Date.now() };
    const kv = await tryKv();
    if (kv) { await kv.set(key, entry, { ex: 86400 }); return; }
    memCache.set(key, entry);
    if (memCache.size > 5000) {
      const oldest = memCache.keys().next().value;
      if (oldest) memCache.delete(oldest);
    }
  }
  ```

  If `@vercel/kv` is not installed, the `import` will fail at runtime and `tryKv()` returns `null` — fallback path. Don't add `@vercel/kv` as a dep; it gets pulled in lazily only when KV_URL is set.

- [ ] **Step 2: Wire into `/api/directions/route.ts`**

  Modify the POST handler to check cache before calling Google, write to cache after a successful response:

  ```ts
  import { getCached, setCached } from '@/lib/cache/directionsCache';

  // After validating body but before building the URL:
  const cached = await getCached({lat: oLat, lng: oLng}, {lat: dLat, lng: dLng}, body.mode);
  if (cached) {
    return NextResponse.json(cached, { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400', 'x-cache': 'HIT' } });
  }

  // ... existing fetch + parse logic builds { polyline, durationSec, distanceM } ...

  // Before returning success response:
  await setCached({lat: oLat, lng: oLng}, {lat: dLat, lng: dLng}, body.mode, { polyline: ..., durationSec: ..., distanceM: ... });
  ```

- [ ] **Step 3: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

- [ ] **Step 4: Commit**

  ```
  feat(maps/directions): server-side cache (KV or in-memory) for 24h
  ```

### A.2 Document budget alarms + key restrictions in CLAUDE.md

- [ ] **Step 1: Add Maps Platform ops section to CLAUDE.md**

  Append to CLAUDE.md (after Observability MCPs section):

  ```
  ## Google Maps Platform — ops

  - **Budget alarms** (set in Google Cloud Console → Billing → Budgets):
    - 50% of $200 free credit → email
    - 100% of free credit → email + Slack
    - $500/mo absolute → page on-call
    - $1k/mo absolute → API key auto-disable
  - **Two keys:**
    - `GOOGLE_PLACES_API_KEY` (server-only): no app restriction, IP-restricted to Vercel egress where possible. Enables: Directions, Geocoding, Places, Weather, Time Zone, Street View Static, Maps Static.
    - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client): HTTP-referrer restricted to geknee.com + *.vercel.app + localhost. Enables: Maps JS, Places (client autocomplete).
  - **Cost mitigations in code** (all live as of 2026-05-20):
    - Session tokens on Places Autocomplete
    - Field masking on Places getDetails (Basic only)
    - KV (or in-memory) cache on /api/directions
    - 1-week immutable CDN cache on /api/streetview
    - lat/lng coalescing to 2-decimal precision on /api/weather
  ```

- [ ] **Step 2: Commit**

  ```
  docs(maps): document GCP budget alarms + cost mitigation patterns
  ```

---

## Phase B — Wave 1 features

### B.1 Street View Static

**Files:**
- Create: `app/api/streetview/route.ts`
- Create: `lib/googleMaps/streetView.ts`
- Create: `app/components/StreetViewThumb.tsx`
- Modify: `app/components/ActivityBlock.tsx`
- Modify: `app/components/BookView.tsx`
- Modify: `app/plan/summary/RecPanel.tsx`
- Modify: `app/plan/summary/DayMap.tsx`

- [ ] **Step 1: Server route**

  `app/api/streetview/route.ts`:

  ```ts
  import { NextResponse } from 'next/server';
  import { auth } from '@/auth';

  export const runtime = 'nodejs';

  export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user) return new Response('Unauthorized', { status: 401 });

    const key =
      process.env.GOOGLE_MAPS_API_KEY ??
      process.env.GOOGLE_PLACES_API_KEY ??
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return new Response('No API key', { status: 500 });

    const { searchParams } = new URL(req.url);
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    if (!isFinite(lat) || !isFinite(lng)) return new Response('lat/lng required', { status: 400 });

    const heading = searchParams.get('heading') ?? '0';
    const pitch = searchParams.get('pitch') ?? '10';
    const fov = searchParams.get('fov') ?? '80';
    const size = searchParams.get('size') ?? '400x300';

    const url = `https://maps.googleapis.com/maps/api/streetview?location=${lat},${lng}&size=${size}&heading=${heading}&pitch=${pitch}&fov=${fov}&source=outdoor&key=${key}`;

    return NextResponse.redirect(url, {
      status: 302,
      headers: { 'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable' },
    });
  }
  ```

- [ ] **Step 2: Client URL builder** (`lib/googleMaps/streetView.ts`)

  ```ts
  export interface SVOpts { heading?: number; pitch?: number; fov?: number; size?: string }
  export function streetViewSrc(lat: number, lng: number, opts: SVOpts = {}): string {
    const p = new URLSearchParams();
    p.set('lat', String(lat));
    p.set('lng', String(lng));
    if (opts.heading !== undefined) p.set('heading', String(opts.heading));
    if (opts.pitch !== undefined) p.set('pitch', String(opts.pitch));
    if (opts.fov !== undefined) p.set('fov', String(opts.fov));
    if (opts.size) p.set('size', opts.size);
    return `/api/streetview?${p.toString()}`;
  }
  ```

- [ ] **Step 3: StreetViewThumb component**

  `app/components/StreetViewThumb.tsx`:

  ```tsx
  'use client';
  import { useState } from 'react';
  import { streetViewSrc, type SVOpts } from '@/lib/googleMaps/streetView';

  interface Props extends SVOpts {
    lat: number;
    lng: number;
    alt: string;
    className?: string;
    aspectRatio?: '4/3' | '16/9' | '1/1';
  }

  export default function StreetViewThumb({ lat, lng, alt, className, aspectRatio = '4/3', ...opts }: Props) {
    const [errored, setErrored] = useState(false);
    const src = streetViewSrc(lat, lng, opts);
    return (
      <div className={className} style={{ aspectRatio, background: 'linear-gradient(135deg, #1d2c4d 0%, #304a7d 100%)', borderRadius: 8, overflow: 'hidden' }}>
        {!errored && (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setErrored(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Wire into 4 consumer surfaces**

  Add `<StreetViewThumb lat={x.lat} lng={x.lng} alt={x.name} />` where it makes sense in each of:
  - `app/components/ActivityBlock.tsx` — small (80px) thumb left of activity title
  - `app/components/BookView.tsx` — large (full-width 16/9) thumb in hotel/restaurant card hero
  - `app/plan/summary/RecPanel.tsx` — small (60px) thumb on AI suggestion chip
  - `app/plan/summary/DayMap.tsx` — inside Google `InfoWindow` content when user taps a pin (use `infoWindow.setContent(htmlString)` with an embedded `<img>` element using `streetViewSrc()`)

- [ ] **Step 5: Typecheck + commit each surface wire as one commit**

  ```
  feat(maps/streetview): /api/streetview route + StreetViewThumb component + wire to 4 surfaces
  ```

### B.2 Weather API

**Files:**
- Create: `app/api/weather/route.ts`
- Create: `lib/googleMaps/weatherClient.ts`
- Modify: `app/plan/summary/UnifiedTripMap.tsx`
- Modify: `app/trip/[tripId]/live/page.tsx`
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Server route**

  ```ts
  // app/api/weather/route.ts
  import { NextResponse } from 'next/server';
  import { auth } from '@/auth';

  export const runtime = 'nodejs';

  export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const key =
      process.env.GOOGLE_MAPS_API_KEY ??
      process.env.GOOGLE_PLACES_API_KEY ??
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return NextResponse.json({ error: 'no key' }, { status: 500 });

    const { searchParams } = new URL(req.url);
    const rawLat = Number(searchParams.get('lat'));
    const rawLng = Number(searchParams.get('lng'));
    if (!isFinite(rawLat) || !isFinite(rawLng)) return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });
    const days = Number(searchParams.get('days') ?? '0');
    // Coalesce to 2-decimal precision (~1.1km grid) for cache efficiency
    const lat = Math.round(rawLat * 100) / 100;
    const lng = Math.round(rawLng * 100) / 100;

    const currentUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?location.latitude=${lat}&location.longitude=${lng}&key=${key}`;
    const forecastUrl = `https://weather.googleapis.com/v1/forecast/days:lookup?location.latitude=${lat}&location.longitude=${lng}&days=${days || 7}&key=${key}`;

    try {
      const reqs: Promise<Response>[] = [fetch(currentUrl, { signal: AbortSignal.timeout(8000) })];
      if (days > 0) reqs.push(fetch(forecastUrl, { signal: AbortSignal.timeout(8000) }));
      const responses = await Promise.all(reqs);
      const [currentRes, forecastRes] = responses;
      if (!currentRes.ok) return NextResponse.json({ error: `weather ${currentRes.status}` }, { status: 502 });

      const currentData = await currentRes.json() as { temperature?: { degrees: number }; weatherCondition?: { description?: { text: string }; iconBaseUri?: string }; wind?: { speed?: { value: number } } };
      const forecastData = forecastRes && forecastRes.ok ? await forecastRes.json() as { forecastDays?: Array<{ displayDate?: { year:number; month:number; day:number }; maxTemperature?: { degrees: number }; minTemperature?: { degrees: number }; daytimeForecast?: { weatherCondition?: { description?: { text: string }; iconBaseUri?: string }; precipitation?: { probability?: { percent: number } } } }> } : null;

      return NextResponse.json({
        current: {
          tempC: currentData.temperature?.degrees ?? null,
          conditionsText: currentData.weatherCondition?.description?.text ?? '',
          iconUrl: currentData.weatherCondition?.iconBaseUri ? `${currentData.weatherCondition.iconBaseUri}.svg` : null,
          windKph: currentData.wind?.speed?.value ?? null,
        },
        forecast: (forecastData?.forecastDays ?? []).map((d) => ({
          date: d.displayDate ? `${d.displayDate.year}-${String(d.displayDate.month).padStart(2,'0')}-${String(d.displayDate.day).padStart(2,'0')}` : '',
          highC: d.maxTemperature?.degrees ?? null,
          lowC: d.minTemperature?.degrees ?? null,
          conditionsText: d.daytimeForecast?.weatherCondition?.description?.text ?? '',
          iconUrl: d.daytimeForecast?.weatherCondition?.iconBaseUri ? `${d.daytimeForecast.weatherCondition.iconBaseUri}.svg` : null,
          precipPct: d.daytimeForecast?.precipitation?.probability?.percent ?? 0,
        })),
      }, { headers: { 'Cache-Control': `public, max-age=3600, s-maxage=3600, stale-while-revalidate=21600` } });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      return NextResponse.json({ error: isTimeout ? 'weather timeout' : 'weather failed' }, { status: isTimeout ? 504 : 502 });
    }
  }
  ```

  If the Google Weather API response shape differs from the assumed shape above, adapt the field paths. Spec assumes the API's GA shape as of late 2025.

- [ ] **Step 2: Client wrapper**

  `lib/googleMaps/weatherClient.ts`:

  ```ts
  export interface WeatherDay {
    date: string;
    highC: number | null;
    lowC: number | null;
    conditionsText: string;
    iconUrl: string | null;
    precipPct: number;
  }
  export interface WeatherResult {
    current: { tempC: number | null; conditionsText: string; iconUrl: string | null; windKph: number | null };
    forecast: WeatherDay[];
  }
  export async function fetchWeather(lat: number, lng: number, days: 0 | 7 = 0): Promise<WeatherResult | null> {
    try {
      const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}&days=${days}`);
      if (!res.ok) return null;
      return await res.json() as WeatherResult;
    } catch { return null; }
  }
  ```

- [ ] **Step 3: Wire into 3 consumer surfaces**

  - `app/plan/summary/UnifiedTripMap.tsx`: at top of each day-header row, fetch `fetchWeather(destLat, destLng, 7)` once when the day-header mounts, render `{forecast[dayIdx]?.iconUrl}` + `{highC}°/{lowC}°` if data present.
  - `app/trip/[tripId]/live/page.tsx`: above the live map, fetch `fetchWeather(userLat, userLng, 0)` once on mount and on geolocation update (debounced 60s), render current strip.
  - `app/api/chat/route.ts`: when assembling the system prompt for a chat with active trip context, server-side-fetch the forecast for the trip's destination and prepend a `[Weather: ...]` block to the system prompt.

- [ ] **Step 4: Typecheck + commit**

  ```
  feat(maps/weather): /api/weather route + 3 consumer wires + chat injection
  ```

### B.3 Time Zone API

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_trip_timezone/migration.sql` (via `prisma migrate dev`)
- Create: `app/api/timezone/route.ts`
- Create: `lib/googleMaps/timezoneClient.ts`
- Create: `app/hooks/useTripTimezone.ts`
- Modify: `app/plan/style/page.tsx`
- Modify: `app/api/trips/[tripId]/route.ts` (if it exists; else find the trip-PATCH endpoint)

- [ ] **Step 1: Prisma migration**

  Add to `prisma/schema.prisma`'s `TripDraft` model:
  ```prisma
  timezone String?
  ```

  Run:
  ```bash
  npx prisma migrate dev --name add_trip_timezone
  ```

  Expected: a new migration folder created under `prisma/migrations/`.

- [ ] **Step 2: Server route**

  `app/api/timezone/route.ts`:

  ```ts
  import { NextResponse } from 'next/server';
  import { auth } from '@/auth';

  export const runtime = 'nodejs';

  export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const key =
      process.env.GOOGLE_MAPS_API_KEY ??
      process.env.GOOGLE_PLACES_API_KEY ??
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return NextResponse.json({ error: 'no key' }, { status: 500 });

    const { searchParams } = new URL(req.url);
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    if (!isFinite(lat) || !isFinite(lng)) return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });

    const timestamp = Math.floor(Date.now() / 1000);
    const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${key}`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return NextResponse.json({ error: `timezone ${res.status}` }, { status: 502 });
      const data = await res.json() as { status: string; timeZoneId?: string; rawOffset?: number; dstOffset?: number };
      if (data.status !== 'OK' || !data.timeZoneId) return NextResponse.json(null);
      return NextResponse.json({
        ianaId: data.timeZoneId,
        utcOffsetSec: data.rawOffset ?? 0,
        dstOffsetSec: data.dstOffset ?? 0,
      }, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      return NextResponse.json({ error: isTimeout ? 'timezone timeout' : 'timezone failed' }, { status: isTimeout ? 504 : 502 });
    }
  }
  ```

- [ ] **Step 3: Client wrapper**

  ```ts
  // lib/googleMaps/timezoneClient.ts
  export interface TzResult { ianaId: string; utcOffsetSec: number; dstOffsetSec: number }
  export async function fetchTimezone(lat: number, lng: number): Promise<TzResult | null> {
    try {
      const res = await fetch(`/api/timezone?lat=${lat}&lng=${lng}`);
      if (!res.ok) return null;
      return await res.json() as TzResult | null;
    } catch { return null; }
  }
  ```

- [ ] **Step 4: Hook**

  ```ts
  // app/hooks/useTripTimezone.ts
  'use client';
  import { useMemo } from 'react';
  export function useTripTimezone(tripTimezone: string | null | undefined): string {
    return useMemo(() => {
      if (tripTimezone) return tripTimezone;
      if (typeof Intl !== 'undefined') return Intl.DateTimeFormat().resolvedOptions().timeZone;
      return 'UTC';
    }, [tripTimezone]);
  }
  ```

- [ ] **Step 5: Resolve + persist on destination-lock**

  In `app/plan/style/page.tsx`, after the destination's lat/lng has been geocoded and right before the user is routed to `/plan/dates`, call `fetchTimezone(lat, lng)` and PATCH the current TripDraft with the resolved `timezone`. Find the existing trip-PATCH endpoint (likely `app/api/trips/[id]/route.ts` or similar) — extend it to accept a `timezone` field if it doesn't already.

- [ ] **Step 6: Render local times throughout**

  Wherever activity times are rendered (search for `new Date(...).toLocaleString` or similar), wrap with `new Intl.DateTimeFormat(undefined, { timeZone: useTripTimezone(trip.timezone), hour: 'numeric', minute: '2-digit' }).format(date)`.

- [ ] **Step 7: Typecheck + commit**

  ```
  feat(maps/timezone): TripDraft.timezone column + /api/timezone route + local-time rendering
  ```

---

## Phase C — Wave 2 migrations

### C.1 Places API (New) migration + Session tokens + Field masking

**Files:**
- Modify: `app/components/CityMapView.tsx`

This phase bundles three things because they all touch the same call path:
1. Switch from `AutocompleteService.getPlacePredictions` → `AutocompleteSuggestion.fetchAutocompleteSuggestions`
2. Add session-token threading (`new google.maps.places.AutocompleteSessionToken()` regenerated after each completed flow)
3. Field-mask `fetchFields` to `['displayName', 'location']` (Basic Data only)

- [ ] **Step 1: Read the existing CityMapView autocomplete logic**

  Look at `autocompleteRef`, `placesServiceRef`, `getPlacePredictions`, and the `getDetails` call path.

- [ ] **Step 2: Replace with new API**

  Roughly:

  ```ts
  // Replace AutocompleteService + PlacesService
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  function makeNewSession() {
    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
  }

  // On input change:
  async function fetchPredictions(input: string) {
    if (!sessionTokenRef.current) makeNewSession();
    const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      sessionToken: sessionTokenRef.current!,
      locationBias: { center: { lat, lng: lon }, radius: 50000 },
    });
    return suggestions
      .map((s) => s.placePrediction)
      .filter((p): p is google.maps.places.PlacePrediction => !!p);
  }

  // On user-select:
  async function selectPlace(prediction: google.maps.places.PlacePrediction) {
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ['displayName', 'location'] });
    // place.displayName, place.location.lat(), place.location.lng()
    // ... drop pin / pan / etc.
    makeNewSession(); // close the session, start a fresh one
  }
  ```

  The existing UI shape (input, results dropdown, keyboard nav) does NOT need to change — only the data fetching.

- [ ] **Step 3: Typecheck + commit**

  ```
  refactor(maps/city): migrate to Places API (New) + session tokens + Basic-only field mask
  ```

### C.2 Routes API migration in `/api/directions`

**Files:**
- Modify: `app/api/directions/route.ts`

- [ ] **Step 1: Replace the Directions REST call**

  Swap the existing GET to `maps.googleapis.com/maps/api/directions/json` with a POST to `routes.googleapis.com/directions/v2:computeRoutes`:

  ```ts
  const TRAVEL_MODE_MAP: Record<string, string> = {
    walking: 'WALK',
    driving: 'DRIVE',
    cycling: 'BICYCLE',
    transit: 'TRANSIT',
  };

  const body = {
    origin: { location: { latLng: { latitude: oLat, longitude: oLng } } },
    destination: { location: { latLng: { latitude: dLat, longitude: dLng } } },
    travelMode: TRAVEL_MODE_MAP[bodyMode],
    polylineEncoding: 'ENCODED_POLYLINE',
  };

  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  ```

  Parse response: `data.routes[0].polyline.encodedPolyline`, `data.routes[0].duration` (string like `'1234s'` → parse), `data.routes[0].distanceMeters`.

- [ ] **Step 2: Preserve the cache integration from A.1**

  The cache layer added in A.1 sits on top of the API call — only the internal HTTP call changes. The cache layer continues to work unchanged.

- [ ] **Step 3: Typecheck + commit**

  ```
  refactor(maps/directions): migrate from legacy Directions to Routes API v2
  ```

### C.3 Maps Static API — OG share cards

**Files:**
- Create: `app/api/og-trip-map/[tripId]/route.ts`
- Modify: `app/trip/[tripId]/page.tsx` (or whichever exposes trip metadata)

- [ ] **Step 1: Server route**

  ```ts
  // app/api/og-trip-map/[tripId]/route.ts
  import prisma from '@/lib/prisma';
  import { auth } from '@/auth';

  export const runtime = 'nodejs';

  // Dark style equivalent for Static Maps URL (URL-encoded style params)
  const STATIC_STYLE = [
    'feature:all|element:geometry|color:0x1d2c4d',
    'feature:water|element:geometry|color:0x0e1626',
    'feature:road|element:geometry|color:0x304a7d',
    'feature:poi|visibility:off',
    'feature:transit|visibility:off',
  ].map(encodeURIComponent).join('&style=');

  export async function GET(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
    const session = await auth();
    if (!session?.user) return new Response('Unauthorized', { status: 401 });

    const { tripId } = await params;
    // Fetch the trip + stops. Adapt to actual schema relations.
    const trip = await prisma.tripDraft.findUnique({ where: { id: tripId } });
    if (!trip) return new Response('Not found', { status: 404 });

    // Build markers from bookingSuggestions / itinerary / etc. For v0:
    // use the destination geocode as a single marker.
    // TODO: extend to walk the itinerary for real pins.
    const key = process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY!;
    const markers = `markers=color:purple|${trip.location}`; // placeholder; v1 should resolve to lat/lng

    const url = `https://maps.googleapis.com/maps/api/staticmap?size=1200x630&style=${STATIC_STYLE}&${markers}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return new Response('Static maps failed', { status: 502 });
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  }
  ```

- [ ] **Step 2: Wire into trip page metadata**

  In `app/trip/[tripId]/page.tsx` (or the route that owns trip OG tags), add to `generateMetadata`:

  ```ts
  export async function generateMetadata({ params }: { params: Promise<{ tripId: string }> }): Promise<Metadata> {
    const { tripId } = await params;
    return {
      openGraph: {
        images: [{ url: `/api/og-trip-map/${tripId}`, width: 1200, height: 630 }],
      },
      twitter: { card: 'summary_large_image', images: [`/api/og-trip-map/${tripId}`] },
    };
  }
  ```

- [ ] **Step 3: Typecheck + commit**

  ```
  feat(maps/og): Static Maps OG share card route for trips
  ```

---

## Phase D — Cleanup

- [ ] **Step 1: Update `CLAUDE.md` Tech notes section**

  Note: the existing `CLAUDE.md` ops section from A.2 already lists the new APIs. Just add a brief mention that Wave 1 features are live.

- [ ] **Step 2: Final build verify**

  ```bash
  npx tsc --noEmit --skipLibCheck
  npx next build
  ```

  Expected: both pass.

- [ ] **Step 3: Commit**

  ```
  chore(maps): mark waves 1+2 shipped in CLAUDE.md
  ```

---

## Verification per phase

- **Phase A**: `/api/directions` returns `x-cache: HIT` on a repeat request (curl test).
- **Phase B.1**: Street View images render on the 4 surfaces.
- **Phase B.2**: Day cards show weather; live page shows current; chat system prompt logs include `[Weather: ...]` context.
- **Phase B.3**: New trips have a non-null `timezone` after destination is set. Activity times render in the trip's timezone.
- **Phase C.1**: CityMapView typeahead still works; network tab shows calls to `places.googleapis.com/v1/places:autocomplete` (new) not `places.googleapis.com/maps/api/place/autocomplete/json` (legacy).
- **Phase C.2**: Network tab shows calls to `routes.googleapis.com/directions/v2:computeRoutes`.
- **Phase C.3**: Visiting `/api/og-trip-map/<some-trip-id>` returns a 1200x630 PNG.

## Spec coverage

| Spec section | Tasks |
|---|---|
| Wave 1.1 Street View | B.1 |
| Wave 1.2 Weather | B.2 |
| Wave 1.3 Time Zone | B.3 |
| Wave 2.1 Places API (New) | C.1 |
| Wave 2.2 Routes API | C.2 |
| Wave 2.3 Maps Static OG | C.3 |
| M1 Session tokens | C.1 (bundled) |
| M2 Field masking | C.1 (bundled) |
| M3 KV cache | A.1 |
| M4 Street View CDN cache | B.1 (built-in) |
| M5 Weather coalescing | B.2 (built-in) |
| M6 GCP budget alarms | A.2 |
