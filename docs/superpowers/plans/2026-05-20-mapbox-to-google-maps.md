# Mapbox → Google Maps Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Mapbox from geknee.com client surfaces and consolidate on Google Maps.

**Architecture:** Surface-by-surface migration. Phase 0 builds shared helpers (dark style, marker, route polyline, server directions wrapper). Phases 1–4 migrate one user-visible map surface at a time, each shipping independently. Phase 5 (server-side AI agent routing) is flagged for a defer/ship decision. Phase 6 removes `mapbox-gl` from the bundle and strips stale references.

**Tech Stack:** Google Maps JavaScript API (already loaded via `lib/googleMapsLoader.ts`), `google.maps.marker.AdvancedMarkerElement`, `google.maps.Polyline`, server-side Google Directions REST.

**Spec:** `docs/superpowers/specs/2026-05-20-mapbox-to-google-maps-design.md`

---

## Pre-flight

- [ ] **Verify env vars present**

  Run:
  ```bash
  grep -E "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API_KEY" .env.local 2>/dev/null || echo "missing"
  ```

  Expected: both keys present. If `GOOGLE_MAPS_API_KEY` (server-side) is missing, add it before Phase 0 Task 4. Use a server-only key with billing alerts at $50 and $200 monthly.

- [ ] **Confirm Mapbox usage inventory matches spec**

  Run:
  ```bash
  grep -rln "mapboxgl\|MAPBOX_TOKEN\|api.mapbox.com" app lib | grep -v node_modules
  ```

  Expected files: `app/components/CityMapView.tsx`, `app/plan/summary/DayMap.tsx`, `app/plan/summary/UnifiedTripMap.tsx`, `app/trip/[tripId]/live/page.tsx`, `lib/agent/tools/route_between.ts`.

---

## Phase 0 — Shared Helpers

No user-visible change. Each task is internal infrastructure.

### Task 0.1: Extract dark style to shared module

**Files:**
- Create: `lib/googleMaps/darkStyle.ts`
- Modify: `app/plan/summary/UnifiedTripMap.tsx` (line 1954 area — remove the inline `const` declaration)

- [ ] **Step 1: Read the existing inline dark-style array**

  Open `app/plan/summary/UnifiedTripMap.tsx` near line 1954. The array follows a comment `// Dark Mapbox-equivalent style for Google Maps. Pulled from Google's …`. Copy the full array literal (entries from `{ elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] }` through `{ featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] }`).

- [ ] **Step 2: Create the helper module**

  Create `lib/googleMaps/darkStyle.ts`:

  ```ts
  // Dark map style matching the prior Mapbox dark-v11 feel.
  // Pulled from Google's "Night" sample, hand-tuned for geknee.
  // Imported by every Google Maps surface so we have one source of truth.
  export const DARK_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
    { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'road.highway', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] },
  ];
  ```

  If the live file at line 1954 has entries between those two anchors that aren't in the snippet above, KEEP THEM — copy the actual live array verbatim and replace the bracket contents above.

- [ ] **Step 3: Replace the inline declaration in `UnifiedTripMap.tsx`**

  Delete the inline `const DARK_STYLE = [...]` (or however it's named) and replace with:

  ```ts
  import { DARK_STYLE } from '@/lib/googleMaps/darkStyle';
  ```

  Update any references in the file to use the imported name.

- [ ] **Step 4: Typecheck**

  Run:
  ```bash
  npx tsc --noEmit --skipLibCheck
  ```

  Expected: clean exit, no output.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/googleMaps/darkStyle.ts app/plan/summary/UnifiedTripMap.tsx
  git commit -m "refactor(maps): extract dark map style to lib/googleMaps/darkStyle"
  ```

---

### Task 0.2: Marker helper

**Files:**
- Create: `lib/googleMaps/marker.ts`

- [ ] **Step 1: Write the helper**

  Create `lib/googleMaps/marker.ts`:

  ```ts
  // Creates a purple dot marker matching the Mapbox-era pin visual.
  // Uses google.maps.marker.AdvancedMarkerElement which REQUIRES the
  // owning Map to be constructed with a mapId. Provide GOOGLE_MAPS_MAP_ID
  // (or fall back to 'DEMO_MAP_ID') in the Map constructor.

  export interface PurpleMarkerOpts {
    label?: string;
    onClick?: () => void;
    onRightClick?: () => void;
  }

  export interface PurpleMarker {
    marker: google.maps.marker.AdvancedMarkerElement;
    el: HTMLDivElement;
    remove: () => void;
  }

  export function createPurpleMarker(
    map: google.maps.Map,
    position: { lat: number; lng: number },
    opts: PurpleMarkerOpts = {},
  ): PurpleMarker {
    const el = document.createElement('div');
    el.style.cssText =
      'width:14px;height:14px;border-radius:50%;background:#a78bfa;' +
      'border:2px solid #fff;box-shadow:0 0 8px rgba(167,139,250,0.8);' +
      'cursor:pointer;';

    if (opts.onClick) {
      el.addEventListener('click', (e) => { e.stopPropagation(); opts.onClick?.(); });
    }
    if (opts.onRightClick) {
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); opts.onRightClick?.(); });
    }

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      content: el,
      title: opts.label,
    });

    return {
      marker,
      el,
      remove: () => { marker.map = null; },
    };
  }
  ```

- [ ] **Step 2: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/googleMaps/marker.ts
  git commit -m "feat(maps): add createPurpleMarker helper for Google Maps"
  ```

---

### Task 0.3: Route polyline helper

**Files:**
- Create: `lib/googleMaps/route.ts`

- [ ] **Step 1: Write the helper**

  Create `lib/googleMaps/route.ts`:

  ```ts
  // Draws a polyline on a Google Map matching the Mapbox dashed-purple
  // line style we used for itinerary routes. Returns the polyline + a
  // bounds object the caller can fitBounds against.

  export type RouteMode = 'walking' | 'driving' | 'cycling' | 'transit' | 'flight' | 'ferry';

  export interface RouteSegment {
    polyline: google.maps.Polyline;
    bounds: google.maps.LatLngBounds;
    remove: () => void;
  }

  // Flight + ferry have no Google Directions equivalent — fall back to
  // straight-line. Other modes can use Directions API server-side.
  export function modeUsesDirections(mode: RouteMode): boolean {
    return mode !== 'flight' && mode !== 'ferry';
  }

  // Maps app mode to Google Directions TravelMode enum value (string form).
  export function modeToGoogleTravelMode(mode: RouteMode): string {
    switch (mode) {
      case 'walking': return 'WALKING';
      case 'driving': return 'DRIVING';
      case 'cycling': return 'BICYCLING';
      case 'transit': return 'TRANSIT';
      default: return 'WALKING';
    }
  }

  export function drawRoute(
    map: google.maps.Map,
    points: Array<{ lat: number; lng: number }>,
    opts: { color?: string; weight?: number; dashed?: boolean } = {},
  ): RouteSegment {
    const path = points.map((p) => new google.maps.LatLng(p.lat, p.lng));
    const polyline = new google.maps.Polyline({
      path,
      geodesic: false,
      strokeColor: opts.color ?? '#a78bfa',
      strokeOpacity: opts.dashed ? 0 : 0.9,
      strokeWeight: opts.weight ?? 4,
      icons: opts.dashed ? [{
        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
        offset: '0',
        repeat: '14px',
      }] : undefined,
      map,
    });
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    return {
      polyline,
      bounds,
      remove: () => polyline.setMap(null),
    };
  }
  ```

- [ ] **Step 2: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/googleMaps/route.ts
  git commit -m "feat(maps): add drawRoute polyline helper for Google Maps"
  ```

---

### Task 0.4: Server-side directions API route + wrapper

**Files:**
- Create: `app/api/directions/route.ts`
- Create: `lib/googleMaps/directionsClient.ts` (client-side wrapper that POSTs to the route)

- [ ] **Step 1: Confirm `GOOGLE_MAPS_API_KEY` (server) is set**

  Run:
  ```bash
  grep "^GOOGLE_MAPS_API_KEY=" .env.local || echo "missing"
  ```

  If missing, add a server-only key to `.env.local` (NOT prefixed with `NEXT_PUBLIC_`). Restrict to server IP / HTTP referrer per Google Console.

- [ ] **Step 2: Write the API route**

  Create `app/api/directions/route.ts`:

  ```ts
  import { NextResponse } from 'next/server';

  // Server-side Google Directions wrapper. Hides the server key from the
  // client and lets us add caching later. Used by DayMap, UnifiedTripMap,
  // and the live trip page.

  export const runtime = 'nodejs';

  type Body = {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    mode: 'walking' | 'driving' | 'cycling' | 'transit';
  };

  const MODE_MAP: Record<Body['mode'], string> = {
    walking: 'walking',
    driving: 'driving',
    cycling: 'bicycling',
    transit: 'transit',
  };

  export async function POST(req: Request) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 500 });

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid json' }, { status: 400 });
    }
    if (!body?.origin || !body?.destination || !body?.mode) {
      return NextResponse.json({ error: 'origin, destination, mode required' }, { status: 400 });
    }

    const origin = `${body.origin.lat},${body.origin.lng}`;
    const dest   = `${body.destination.lat},${body.destination.lng}`;
    const mode   = MODE_MAP[body.mode];
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&mode=${mode}&key=${key}`;

    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ error: `directions ${res.status}` }, { status: 502 });
    const data = await res.json() as { routes?: Array<{ overview_polyline?: { points: string }; legs: Array<{ duration: { value: number }; distance: { value: number } }> }> };
    const route = data.routes?.[0];
    if (!route) return NextResponse.json({ error: 'no route' }, { status: 404 });

    return NextResponse.json({
      polyline: route.overview_polyline?.points ?? '',
      durationSec: route.legs?.[0]?.duration?.value ?? null,
      distanceM:   route.legs?.[0]?.distance?.value ?? null,
    }, {
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400' },
    });
  }
  ```

- [ ] **Step 3: Write the client wrapper**

  Create `lib/googleMaps/directionsClient.ts`:

  ```ts
  import type { RouteMode } from './route';

  // Decodes a Google polyline-5 encoded string into [lat, lng] pairs.
  function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
    const points: Array<{ lat: number; lng: number }> = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b: number, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return points;
  }

  export interface DirectionsResult {
    points: Array<{ lat: number; lng: number }>;
    durationSec: number | null;
    distanceM: number | null;
  }

  export async function fetchDirections(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: Exclude<RouteMode, 'flight' | 'ferry'>,
  ): Promise<DirectionsResult | null> {
    const res = await fetch('/api/directions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin, destination, mode }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { polyline: string; durationSec: number | null; distanceM: number | null };
    if (!data.polyline) return null;
    return {
      points: decodePolyline(data.polyline),
      durationSec: data.durationSec,
      distanceM: data.distanceM,
    };
  }
  ```

- [ ] **Step 4: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

- [ ] **Step 5: Commit**

  ```bash
  git add app/api/directions/route.ts lib/googleMaps/directionsClient.ts
  git commit -m "feat(maps): add /api/directions route + client wrapper"
  ```

---

## Phase 1 — `CityMapView.tsx`

**Files:**
- Modify: `app/components/CityMapView.tsx`

The current file uses `mapboxgl.Map` with `satellite-streets-v12` style, native navigation control, geocoding via Mapbox places API, and a click handler that drops pins on the map.

### Task 1.1: Replace map construction

- [ ] **Step 1: Update imports**

  Open `app/components/CityMapView.tsx`. Remove:
  ```ts
  import mapboxgl from 'mapbox-gl';
  import 'mapbox-gl/dist/mapbox-gl.css';
  ```

  Add:
  ```ts
  import { loadGoogleMaps } from '@/lib/googleMapsLoader';
  import { DARK_STYLE } from '@/lib/googleMaps/darkStyle';
  import { createPurpleMarker, type PurpleMarker } from '@/lib/googleMaps/marker';
  ```

- [ ] **Step 2: Change refs**

  Replace:
  ```ts
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const droppedMarkersRef = useRef<mapboxgl.Marker[]>([]);
  ```

  With:
  ```ts
  const mapRef = useRef<google.maps.Map | null>(null);
  const droppedMarkersRef = useRef<PurpleMarker[]>([]);
  ```

- [ ] **Step 3: Replace the map constructor effect**

  Find the `useEffect` that creates `new mapboxgl.Map(...)` (around line 171). Replace its body:

  ```ts
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let clickListener: google.maps.MapsEventListener | null = null;
    let zoomListener: google.maps.MapsEventListener | null = null;

    loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current) return;
      const map = new google.maps.Map(containerRef.current, {
        center: { lat, lng: lon },
        zoom: 12,
        mapTypeId: 'hybrid',          // satellite + labels — closest to satellite-streets-v12
        tilt: 45,
        styles: undefined,            // hybrid ignores styles; remove if switching to roadmap
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy',
      });
      mapRef.current = map;

      zoomListener = map.addListener('zoom_changed', () => {
        const z = map.getZoom() ?? 12;
        if (z < RETURN_TO_GLOBE_ZOOM) onCloseRef.current();
      });

      clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        dropPin(e.latLng.lng(), e.latLng.lat());
      });
    });

    return () => {
      cancelled = true;
      clickListener?.remove();
      zoomListener?.remove();
      droppedMarkersRef.current.forEach((m) => m.remove());
      droppedMarkersRef.current = [];
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);
  ```

  Note: `mapTypeId: 'hybrid'` mirrors `satellite-streets-v12` (satellite imagery with roads + labels). If a future style match is needed, switch to `'roadmap'` with `styles: DARK_STYLE`.

- [ ] **Step 4: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit. If type errors mention `dropPin` taking `(lng, lat)`, leave for the next task.

### Task 1.2: Replace `dropPin` to use `createPurpleMarker`

- [ ] **Step 1: Rewrite `dropPin`**

  Find the `dropPin` function (around line 133). Replace its body:

  ```ts
  function dropPin(lng: number, latitude: number, label?: string) {
    const map = mapRef.current;
    if (!map) return;
    const pm = createPurpleMarker(map, { lat: latitude, lng }, {
      label,
      onRightClick: () => {
        pm.remove();
        droppedMarkersRef.current = droppedMarkersRef.current.filter((x) => x !== pm);
      },
    });
    droppedMarkersRef.current.push(pm);
  }
  ```

  If popup behavior is needed for `label`, wire up `google.maps.InfoWindow` here. For first pass, the `title` on the AdvancedMarkerElement renders as a native tooltip — accept that and skip the popup.

- [ ] **Step 2: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

### Task 1.3: Replace Mapbox geocoding with `/api/geocode`

- [ ] **Step 1: Update the geocoding effect**

  Find the fetch to `api.mapbox.com/geocoding/v5/mapbox.places` (around line 120). Replace the URL build + fetch with a call to the existing geocode route:

  ```ts
  const proximityParam = proximity ? `&proximity=${proximity}` : '';
  const url = `/api/geocode?q=${encodeURIComponent(query)}&limit=7${proximityParam}`;
  const res = await fetch(url);
  ```

  If `/api/geocode` returns a different shape than the Mapbox `GeocodeFeature[]` the component expects, normalize at the fetch site. Check `app/api/geocode/route.ts` for the actual response shape — likely `{ results: [{ name, lat, lng, ... }] }`. Map to the existing `GeocodeFeature` interface:

  ```ts
  type ApiGeocodeRes = { results: Array<{ name: string; lat: number; lng: number; type?: string; address?: string }> };
  const data = await res.json() as ApiGeocodeRes;
  setResults(data.results.map((r): GeocodeFeature => ({
    id: `${r.lat},${r.lng}`,
    place_name: r.name,
    text: r.name,
    center: [r.lng, r.lat],
    place_type: r.type ? [r.type] : ['place'],
  })));
  ```

  ADAPT the mapping to the actual `GeocodeFeature` shape declared at the top of `CityMapView.tsx`. If the `/api/geocode` route doesn't already return this shape, extend the route to add a Mapbox-compatible projection rather than duplicating the mapping at every call site.

- [ ] **Step 2: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

### Task 1.4: Remove the monument-rings Mapbox code

- [ ] **Step 1: Find `addMonumentRings`**

  Around line 478, `addMonumentRings(map: mapboxgl.Map, monuments: MonumentMarker[])` adds source/layer combos to draw rings on the ground. Rewrite to use circles or polylines:

  ```ts
  function addMonumentRings(map: google.maps.Map, monuments: MonumentMarker[]) {
    if (monuments.length === 0) return;
    for (const m of monuments) {
      new google.maps.Circle({
        map,
        center: { lat: m.lat, lng: m.lng },
        radius: 40, // meters — same physical size as the prior Mapbox circle layer
        fillColor: m.ringColor,
        fillOpacity: 0.25,
        strokeColor: m.ringColor,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        clickable: false,
      });
    }
  }
  ```

  The Mapbox version may have used a custom `circle-radius` in pixels; if pixel-scaled rings are visually important, switch to drawing a small `Polyline` or symbol overlay instead — circles in Google Maps scale with the map (meters, not pixels).

- [ ] **Step 2: Update the call site**

  Find where `addMonumentRings` was called inside the previous Mapbox `useEffect`. Move it into the Google Maps load callback after the map is constructed.

- [ ] **Step 3: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

### Task 1.5: Browser verification + commit

- [ ] **Step 1: Run dev server**

  ```bash
  npx next dev
  ```

  Open `http://localhost:3000`. Drop a portal on the globe. Pick a city pin. The city map view should open.

- [ ] **Step 2: Verify visually**

  Checklist:
  - Map renders (satellite imagery + roads + labels).
  - Clicking the map drops a purple pin.
  - Right-clicking a pin removes it.
  - Geocoding search box returns results from `/api/geocode`.
  - Zooming out far enough closes the view (returns to globe).
  - No console errors mentioning `mapboxgl`, `mapbox-gl`, or `MAPBOX_TOKEN`.

- [ ] **Step 3: Commit**

  ```bash
  git add app/components/CityMapView.tsx
  git commit -m "feat(maps): migrate CityMapView from Mapbox to Google Maps"
  ```

---

## Phase 2 — `DayMap.tsx`

**Files:**
- Modify: `app/plan/summary/DayMap.tsx`

The current file uses `mapboxgl` + Mapbox Directions for per-day walking/driving route lines + Mapbox Geocoding for address fallback.

### Task 2.1: Swap imports + map constructor

- [ ] **Step 1: Update imports**

  Remove:
  ```ts
  import mapboxgl from 'mapbox-gl';
  import 'mapbox-gl/dist/mapbox-gl.css';
  ```

  Add:
  ```ts
  import { loadGoogleMaps } from '@/lib/googleMapsLoader';
  import { DARK_STYLE } from '@/lib/googleMaps/darkStyle';
  import { createPurpleMarker, type PurpleMarker } from '@/lib/googleMaps/marker';
  import { drawRoute, modeUsesDirections, type RouteMode } from '@/lib/googleMaps/route';
  import { fetchDirections } from '@/lib/googleMaps/directionsClient';
  ```

- [ ] **Step 2: Change refs**

  Replace:
  ```ts
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  ```

  With:
  ```ts
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<PurpleMarker[]>([]);
  const routeRef = useRef<google.maps.Polyline[]>([]);
  ```

- [ ] **Step 3: Replace the Mapbox map-construction effect**

  Find the `useEffect` initializing `new mapboxgl.Map`. Replace with:

  ```ts
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current) return;
      const map = new google.maps.Map(containerRef.current, {
        center: { lat: 40.7128, lng: -74.0060 }, // placeholder; fitBounds runs below
        zoom: 12,
        styles: DARK_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      routeRef.current.forEach((p) => p.setMap(null));
      routeRef.current = [];
      mapRef.current = null;
    };
  }, []);
  ```

- [ ] **Step 4: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit (later tasks will resolve any unused-import errors from leftover Mapbox code).

### Task 2.2: Replace marker creation

- [ ] **Step 1: Find marker construction**

  Find the loop where `new mapboxgl.Marker({ element: el, anchor: 'center' })` is called (around line 396). Replace with:

  ```ts
  const pm = createPurpleMarker(map, { lat: stop.lat, lng: stop.lng }, { label: stop.name });
  markersRef.current.push(pm);
  ```

- [ ] **Step 2: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

### Task 2.3: Replace route drawing

- [ ] **Step 1: Replace the Mapbox source/layer route code**

  Find the section that does `map.getSource('route')` and `setData(...)` (around line 408). Replace the whole route-drawing block with calls to `fetchDirections` + `drawRoute`:

  ```ts
  async function drawDayRoute(stops: DayStop[]) {
    routeRef.current.forEach((p) => p.setMap(null));
    routeRef.current = [];
    if (!mapRef.current || stops.length < 2) return;
    const bounds = new google.maps.LatLngBounds();

    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      const mode: RouteMode = a.modeToNext ?? 'walking';

      bounds.extend({ lat: a.lat, lng: a.lng });
      bounds.extend({ lat: b.lat, lng: b.lng });

      if (!modeUsesDirections(mode)) {
        // Flight / ferry: straight line
        const seg = drawRoute(mapRef.current, [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }], { dashed: true });
        routeRef.current.push(seg.polyline);
        continue;
      }

      const directions = await fetchDirections(
        { lat: a.lat, lng: a.lng },
        { lat: b.lat, lng: b.lng },
        mode as Exclude<RouteMode, 'flight' | 'ferry'>,
      );

      if (directions && directions.points.length > 0) {
        const seg = drawRoute(mapRef.current, directions.points);
        routeRef.current.push(seg.polyline);
      } else {
        // Directions failed — fall back to straight line
        const seg = drawRoute(mapRef.current, [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }], { dashed: true });
        routeRef.current.push(seg.polyline);
      }
    }

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, 64);
    }
  }
  ```

  ADAPT the field names (`modeToNext`, `lat`, `lng`) to whatever the existing `DayStop` type uses in this file. The structural shape matters more than the literal field names — wire it to whatever is already declared.

- [ ] **Step 2: Wire `drawDayRoute` into the stops-change effect**

  Replace the prior route-drawing useEffect's body with a call to `drawDayRoute(stops)`. Drop the Mapbox-specific source/layer cleanup.

- [ ] **Step 3: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

### Task 2.4: Replace geocoding fallback

- [ ] **Step 1: Find the Mapbox geocoding call**

  Around line 213, there's a `fetch('https://api.mapbox.com/geocoding/v5/mapbox.places/...')`. Replace with a call to `/api/geocode`:

  ```ts
  const url = `/api/geocode?q=${encodeURIComponent(address)}&limit=1`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json() as { results?: Array<{ lat: number; lng: number }> };
  const hit = data.results?.[0];
  if (!hit) return null;
  return { lat: hit.lat, lng: hit.lng };
  ```

  Verify the `/api/geocode` response shape matches — if it returns a different field name (`lon` vs `lng`), adjust.

- [ ] **Step 2: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

### Task 2.5: Strip residual Mapbox + verify

- [ ] **Step 1: Grep for leftovers**

  Run:
  ```bash
  grep -n "mapboxgl\|mapbox-gl\|MAPBOX_TOKEN\|api.mapbox.com" app/plan/summary/DayMap.tsx
  ```
  Expected: no output.

- [ ] **Step 2: Run dev server, verify**

  ```bash
  npx next dev
  ```

  Open a trip summary page. The per-day map should render in dark style with purple pins and a walking route polyline.

- [ ] **Step 3: Commit**

  ```bash
  git add app/plan/summary/DayMap.tsx
  git commit -m "feat(maps): migrate DayMap from Mapbox to Google Maps"
  ```

---

## Phase 3 — `UnifiedTripMap.tsx`

The file is already mostly Google. Only residual Mapbox is the per-leg Directions fetch.

### Task 3.1: Replace per-leg Mapbox Directions

- [ ] **Step 1: Find the leftover Mapbox fetch**

  Around line 955-977, look for `MAPBOX_TOKEN` and `api.mapbox.com/directions/v5/mapbox/...`. Replace with `fetchDirections` from `lib/googleMaps/directionsClient`:

  ```ts
  import { fetchDirections } from '@/lib/googleMaps/directionsClient';
  import { modeUsesDirections, type RouteMode } from '@/lib/googleMaps/route';
  ```

  Then in the route-fetching loop, swap the `fetch(api.mapbox.com...)` block:

  ```ts
  const mode: RouteMode = legMode ?? 'walking';
  if (!modeUsesDirections(mode)) {
    // straight-line fallback
    polylinePath = [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }];
  } else {
    const dr = await fetchDirections({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }, mode as Exclude<RouteMode, 'flight' | 'ferry'>);
    polylinePath = dr?.points ?? [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }];
  }
  ```

  ADAPT to the existing variable names in the file — the local variables for path/polyline likely already exist.

- [ ] **Step 2: Strip dead Mapbox comments**

  Find comments mentioning Mapbox (lines 8, 391, 950, 955, 975, 977). Either remove them or update to say "Google Directions" where they describe current behavior.

- [ ] **Step 3: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

- [ ] **Step 4: Grep for leftovers**

  Run:
  ```bash
  grep -n "mapboxgl\|mapbox-gl\|MAPBOX_TOKEN\|api.mapbox.com" app/plan/summary/UnifiedTripMap.tsx
  ```
  Expected: no output.

- [ ] **Step 5: Browser verify + commit**

  Spot-check the trip summary page. Each day's polyline should still render.

  ```bash
  git add app/plan/summary/UnifiedTripMap.tsx
  git commit -m "feat(maps): drop Mapbox Directions from UnifiedTripMap"
  ```

---

## Phase 4 — Live trip page

**Files:**
- Modify: `app/trip/[tripId]/live/page.tsx`
- Possibly modify: `app/trip/[tripId]/live/GoogleLiveMap.tsx`

A `GoogleLiveMap.tsx` component exists alongside the page. The migration is mostly "wire it up and delete the in-page Mapbox component."

### Task 4.1: Replace inline `LiveMap` with `GoogleLiveMap`

- [ ] **Step 1: Audit `GoogleLiveMap.tsx`**

  Open `app/trip/[tripId]/live/GoogleLiveMap.tsx`. Confirm its props match (or can be made to match) the props the page passes to its inline `LiveMap` (around line 611-825). The expected props include: `stops` (with names/coords), `userPosition` (current geolocation), and a callback for when the user pin is updated.

  If `GoogleLiveMap` is missing functionality the inline component had (e.g., route polylines between stops, "You are here" marker), add those features to `GoogleLiveMap.tsx` using the helpers from Phase 0.

- [ ] **Step 2: Replace the page-level usage**

  In `app/trip/[tripId]/live/page.tsx`:

  - Remove `import mapboxgl from 'mapbox-gl'` and the CSS import (lines 4-5).
  - Replace the inline `LiveMap` component definition (~lines 611-825) — delete it entirely.
  - At the call site where `<LiveMap ... />` is rendered, swap to `<GoogleLiveMap ... />`.
  - Add the import: `import GoogleLiveMap from './GoogleLiveMap';`

- [ ] **Step 3: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

### Task 4.2: Replace ETA computation

- [ ] **Step 1: Find the ETA effect**

  Around lines 243-275, an effect fetches `api.mapbox.com/geocoding/...` then `api.mapbox.com/directions/...`. Replace with calls to `/api/geocode` + `fetchDirections`:

  ```ts
  // Geocode the activity address
  const gRes = await fetch(`/api/geocode?q=${encodeURIComponent(placeQuery)}&limit=1`);
  if (!gRes.ok) return;
  const gData = await gRes.json() as { results?: Array<{ lat: number; lng: number }> };
  const place = gData.results?.[0];
  if (!place) return;

  // Directions from user → activity
  const dr = await fetchDirections(
    { lat: userPos.lat, lng: userPos.lng },
    { lat: place.lat, lng: place.lng },
    'walking',
  );
  if (!dr) return;
  setEtaSec(dr.durationSec);
  ```

  Throttle this so it fires AT MOST every 60s AND only if the user has moved >50m since the last call. This is a cost mitigation per the spec.

- [ ] **Step 2: Update the `tokenMissing` warning**

  The page has a `tokenMissing` check at line 825 that gates on `NEXT_PUBLIC_MAPBOX_TOKEN`. Switch to:

  ```ts
  const tokenMissing = !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  ```

  Update the warning copy from `NEXT_PUBLIC_MAPBOX_TOKEN not set` to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set`.

- [ ] **Step 3: Grep for leftovers**

  Run:
  ```bash
  grep -n "mapboxgl\|mapbox-gl\|MAPBOX_TOKEN\|api.mapbox.com" app/trip/[tripId]/live/page.tsx
  ```
  Expected: no output.

- [ ] **Step 4: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

### Task 4.3: Verify + commit

- [ ] **Step 1: Run dev server**

  ```bash
  npx next dev
  ```

  Navigate to a trip's live view. The map should render with the user pin + activity pins + a route line.

- [ ] **Step 2: Commit**

  ```bash
  git add app/trip/[tripId]/live/page.tsx app/trip/[tripId]/live/GoogleLiveMap.tsx
  git commit -m "feat(maps): migrate live trip page from Mapbox to GoogleLiveMap"
  ```

---

## Phase 5 — Server-side `route_between.ts` (AI agent tool)

⚠️ **Ship/defer decision required before proceeding.** The spec recommends deferring this phase until Phases 1-4 have 30 days of real Directions API usage data, because this is the largest cost lever ($150-300/mo at worst case).

If deferring, SKIP to Phase 6 — `mapbox-gl` is client-only, so dropping the dep doesn't affect `route_between.ts`. The server-side `MAPBOX_TOKEN` env var stays.

If shipping now:

### Task 5.1: Add server-side directions helper

**Files:**
- Create: `lib/googleMaps/directions.ts` (server)

- [ ] **Step 1: Write the server helper**

  Create `lib/googleMaps/directions.ts`:

  ```ts
  // Server-side Google Directions wrapper. Used by route_between agent tool.
  // Mirrors the response shape the AI agent expects (durationSec / distanceM).

  export interface ServerDirectionsResult {
    durationSec: number;
    distanceM: number;
    status: 'OK' | 'ZERO_RESULTS' | 'ERROR';
  }

  export async function serverDirections(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: 'walking' | 'driving' | 'bicycling' | 'transit',
  ): Promise<ServerDirectionsResult> {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return { durationSec: 0, distanceM: 0, status: 'ERROR' };
    const o = `${origin.lat},${origin.lng}`;
    const d = `${destination.lat},${destination.lng}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${o}&destination=${d}&mode=${mode}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return { durationSec: 0, distanceM: 0, status: 'ERROR' };
    const data = await res.json() as { status?: string; routes?: Array<{ legs: Array<{ duration: { value: number }; distance: { value: number } }> }> };
    if (data.status !== 'OK' || !data.routes?.length) return { durationSec: 0, distanceM: 0, status: 'ZERO_RESULTS' };
    const leg = data.routes[0].legs[0];
    return { durationSec: leg.duration.value, distanceM: leg.distance.value, status: 'OK' };
  }
  ```

- [ ] **Step 2: Typecheck + commit**

  Run: `npx tsc --noEmit --skipLibCheck`. Expected: clean.

  ```bash
  git add lib/googleMaps/directions.ts
  git commit -m "feat(maps): add server-side Google Directions helper"
  ```

### Task 5.2: Rewrite `route_between.ts` to use it

**Files:**
- Modify: `lib/agent/tools/route_between.ts`

- [ ] **Step 1: Replace the Mapbox fetch**

  Open `lib/agent/tools/route_between.ts`. Replace the body of the `route_between` function (around line 44-55):

  ```ts
  import { serverDirections } from '@/lib/googleMaps/directions';

  // ... inside the tool implementation:
  const modeMap: Record<string, 'walking' | 'driving' | 'bicycling' | 'transit'> = {
    walking: 'walking',
    driving: 'driving',
    cycling: 'bicycling',
    transit: 'transit',
  };
  const googleMode = modeMap[mode] ?? 'walking';
  const result = await serverDirections({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, googleMode);
  if (result.status !== 'OK') {
    return { error: `directions failed: ${result.status}` };
  }
  return {
    durationMin: Math.round(result.durationSec / 60),
    distanceKm: +(result.distanceM / 1000).toFixed(2),
  };
  ```

  ADAPT to the actual return type the tool declares — the existing file probably uses different field names (`from`/`to` vs `origin`/`destination`). Match the declared shape.

- [ ] **Step 2: Remove the Mapbox token imports**

  Strip `const MAPBOX_TOKEN = ...` and the `if (!MAPBOX_TOKEN) return ...` guard at the top.

- [ ] **Step 3: Typecheck**

  Run: `npx tsc --noEmit --skipLibCheck`
  Expected: clean exit.

- [ ] **Step 4: Spot-test the agent tool**

  If there's an existing agent eval script (per `bin/run-agent-evals.mjs`), run a small evaluation to confirm `route_between` still returns reasonable durations.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/agent/tools/route_between.ts
  git commit -m "feat(agent): migrate route_between from Mapbox to Google Directions"
  ```

---

## Phase 6 — Cleanup

### Task 6.1: Drop `mapbox-gl` dependency

- [ ] **Step 1: Confirm zero client-side imports**

  Run:
  ```bash
  grep -rln "mapbox-gl\|from 'mapbox-gl'\|from \"mapbox-gl\"" app lib | grep -v node_modules
  ```
  Expected: no output. If anything is left, that surface didn't finish migrating — STOP and complete the prior phase.

- [ ] **Step 2: Remove the dep**

  Edit `package.json`. Find:
  ```json
  "mapbox-gl": "^3.19.1",
  ```
  Delete that line.

- [ ] **Step 3: Reinstall**

  Run:
  ```bash
  pnpm install
  ```

  Or `npm install` if the project uses npm — check for `pnpm-lock.yaml` vs `package-lock.json`.

- [ ] **Step 4: Build verify**

  Run:
  ```bash
  npx next build
  ```

  Expected: build succeeds. No "Module not found: mapbox-gl" errors.

- [ ] **Step 5: Confirm `mapbox-gl` is gone from the bundle**

  Run:
  ```bash
  find .next/static/chunks -type f \( -name "*.js" \) -exec grep -l "mapboxgl\|mapbox-gl-js" {} \;
  ```

  Expected: no output.

### Task 6.2: Strip `NEXT_PUBLIC_MAPBOX_TOKEN` and stale comments

- [ ] **Step 1: Find remaining client references**

  Run:
  ```bash
  grep -rln "NEXT_PUBLIC_MAPBOX_TOKEN" app lib | grep -v node_modules
  ```

  Each match must be removed.

- [ ] **Step 2: Find Mapbox in comments**

  Run:
  ```bash
  grep -rln -i "mapbox" app lib --include="*.ts" --include="*.tsx" | grep -v node_modules
  ```

  For each file, open it and either delete the Mapbox comment or rewrite to say Google Maps. Targets include:
  - `app/plan/location/LocationClient.tsx:2193, 2423-2425` (stale comments)
  - `app/plan/summary/lib/places.ts` (mode-mapping comment)
  - `app/api/itinerary/route.ts:393` (transit times comment)
  - `app/plan/location/atlas/destinations.ts:3`
  - `app/components/HeroGlobe.tsx`, `app/u/[handle]/PublicGlobe.tsx`
  - `lib/native-offline-maps.ts:12`
  - `bin/run-agent-evals.mjs:13` (env var comment — strip MAPBOX_TOKEN reference)

  Phase 5 was deferred: keep server-only `MAPBOX_TOKEN` reference in `lib/agent/tools/route_between.ts` and document in CLAUDE.md.

### Task 6.3: Update the privacy page

- [ ] **Step 1: Update sub-processor list**

  In `app/privacy/page.tsx` line 68, replace:
  ```
  <Li><b>Mapbox</b> — map tiles and location services for the planner UI.</Li>
  ```
  With:
  ```
  <Li><b>Google Maps Platform</b> — map tiles, places, and directions across the planner UI.</Li>
  ```

  If Google Maps is already listed elsewhere on the page, merge into a single bullet rather than duplicating.

### Task 6.4: Update `CLAUDE.md`

- [ ] **Step 1: Read the current `CLAUDE.md` "Tech notes" section**

  Open `CLAUDE.md`. Find any line mentioning Mapbox.

- [ ] **Step 2: Remove or update**

  - If a line says "Globe: ... Mapbox", just drop the Mapbox reference.
  - If Phase 5 was deferred: add a line under "Tech notes": "AI agent server tool (`lib/agent/tools/route_between.ts`) still uses Mapbox Directions; client-side maps are all Google."

### Task 6.5: Final verification + commit

- [ ] **Step 1: Final grep**

  Run:
  ```bash
  grep -rln -i "mapbox" app lib bin --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js" | grep -v node_modules
  ```

  Expected: empty (or, if Phase 5 deferred, only `lib/agent/tools/route_between.ts` and one CLAUDE.md mention).

- [ ] **Step 2: Build + typecheck**

  Run:
  ```bash
  npx tsc --noEmit --skipLibCheck && npx next build
  ```

  Expected: both pass.

- [ ] **Step 3: Browser sweep**

  Run `npx next dev`. Visit each migrated surface:
  - Home globe → city map (CityMapView)
  - A trip's summary page (DayMap + UnifiedTripMap)
  - A trip's live page (GoogleLiveMap)

  Confirm each renders without console errors.

- [ ] **Step 4: Commit**

  ```bash
  git add package.json pnpm-lock.yaml app/privacy/page.tsx CLAUDE.md app lib bin
  git commit -m "chore(maps): drop mapbox-gl dependency + strip stale references"
  ```

---

## Done state

- `mapbox-gl` no longer in `package.json` or the client bundle.
- Five Mapbox client surfaces shipped on Google Maps.
- `NEXT_PUBLIC_MAPBOX_TOKEN` no longer used; can be safely removed from Vercel envs.
- (If Phase 5 deferred) server-side `MAPBOX_TOKEN` still in use for `route_between` agent tool; that's documented in `CLAUDE.md`.
- Privacy page reflects Google Maps as the map provider.

## Spec coverage check (self-review)

| Spec section | Tasks |
|---|---|
| Phase 0 — Shared helpers | 0.1, 0.2, 0.3, 0.4 |
| Phase 1 — CityMapView | 1.1, 1.2, 1.3, 1.4, 1.5 |
| Phase 2 — DayMap | 2.1, 2.2, 2.3, 2.4, 2.5 |
| Phase 3 — UnifiedTripMap | 3.1 |
| Phase 4 — Live trip page | 4.1, 4.2, 4.3 |
| Phase 5 — route_between (server) | 5.1, 5.2 (gated on ship/defer decision) |
| Phase 6 — Cleanup | 6.1, 6.2, 6.3, 6.4, 6.5 |
| Cost mitigations (caching, throttling) | 0.4 (cache headers on `/api/directions`), 4.2 (60s + 50m throttle on ETA) |
| Verification per phase | each phase ends with browser verify + commit |
