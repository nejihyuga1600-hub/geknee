'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ─── E5 · Live Trip · in-the-field companion ────────────────────────────────
// In-trip companion: glanceable LEAVE-BY card on top of a focused city map,
// flanked by next-stop / weather / crowds context cards and a horizontal
// day-timeline strip. v0: shipping the visual surface with realistic mock
// data; geolocation, Mapbox Directions ETA, and Google Places popular-times
// hookups land in follow-ups.

interface TripData {
  id: string;
  title: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  nights: number | null;
}

interface DayWeather {
  date: string;
  tempMin: number;
  tempMax: number;
  condition: string;
  icon: string;
  iconUrl: string;
  pop: number;
}

interface Geo { lat: number; lon: number }

interface Activity {
  // 24-hour absolute clock for "today" (HH:MM). Comparable across the day.
  time: string;
  // Display string straight from the markdown ("1:00 PM").
  display: string;
  // Activity body: "Tea ceremony at Camellia."
  name: string;
  // Best-effort extracted place name for geocoding ("Camellia").
  place: string | null;
}

// ─── Itinerary parsing helpers ──────────────────────────────────────────────

// "**1:00 PM**" or "**12:30 PM**" prefix at the start of an activity line.
const TIME_RE = /^\*\*(\d{1,2}):(\d{2})\s*(AM|PM)\*\*\s*[-–:]?\s*(.*)$/i;
const DAY_HEADING_RE = /day[\s\-]*(\d+)/i;

function to24h(h: number, m: number, ampm: string): string {
  let hh = h % 12;
  if (ampm.toUpperCase() === 'PM') hh += 12;
  return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Pull a likely place name out of an activity body. Heuristics — looks for
// "at <Place>", "to <Place>", or capitalised phrases. Returns null when
// nothing useful surfaces.
function extractPlaceName(body: string): string | null {
  const cleaned = body.replace(/[*`]/g, '').trim();
  const m = cleaned.match(/\b(?:at|to|in|visit|see)\s+([A-Z][\wÀ-ſ'’\- ]{2,40})/);
  if (m) return m[1].trim().replace(/[.,;:!?]+$/, '');
  // Fallback: first capitalised noun-phrase up to 4 words.
  const cap = cleaned.match(/[A-Z][\wÀ-ſ'’\-]+(?:\s+[A-Z][\wÀ-ſ'’\-]+){0,3}/);
  return cap?.[0] ?? null;
}

function parseTodayActivities(itinerary: string, dayNumber: number): Activity[] {
  if (!itinerary) return [];
  const lines = itinerary.split('\n');
  let inDay = false;
  let currentDay = -1;
  const activities: Activity[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const headingMatch = line.match(/^#{1,4}\s+(.*)$/) ?? line.match(/^\*\*(Day\s+\d+[^*]*)\*\*/i);
    const headingText = headingMatch?.[1] ?? '';
    if (headingText) {
      const dm = headingText.match(DAY_HEADING_RE);
      if (dm) {
        currentDay = parseInt(dm[1], 10);
        inDay = currentDay === dayNumber;
        continue;
      }
      // Non-day heading inside the active day signals the section ended.
      if (inDay && /^[#]/.test(line)) inDay = false;
    }
    if (!inDay) continue;
    const tm = line.match(TIME_RE);
    if (tm) {
      const [, hStr, mStr, ampm, body] = tm;
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      const time = to24h(h, m, ampm);
      const display = `${h}:${String(m).padStart(2, '0')} ${ampm.toUpperCase()}`;
      const name = body.trim().replace(/^[-–:]\s*/, '');
      activities.push({ time, display, name, place: extractPlaceName(name) });
    }
  }
  return activities.sort((a, b) => a.time.localeCompare(b.time));
}

function nowHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const MONO = 'var(--font-mono-display), ui-monospace, monospace';
const DISPLAY = 'var(--font-display), Georgia, serif';

export default function LiveTripPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params?.tripId ?? '';
  const [trip, setTrip] = useState<TripData | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [now, setNow] = useState<Date>(() => new Date());
  const [weather, setWeather] = useState<DayWeather[] | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Browser geolocation. Silent failure — we just don't recenter.
  useEffect(() => {
    if (!navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      pos => { if (!cancelled) setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      () => { /* permission denied or unavailable — keep mock center */ },
      { timeout: 8000, maximumAge: 60_000 },
    );
    return () => { cancelled = true; };
  }, []);

  // Weather lookup keyed off the trip's location. Uses the existing
  // /api/weather endpoint (OpenWeather forecast cached 1h).
  useEffect(() => {
    if (!trip?.location) return;
    let cancelled = false;
    fetch(`/api/weather?city=${encodeURIComponent(trip.location)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && Array.isArray(d?.days)) setWeather(d.days as DayWeather[]); })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [trip?.location]);

  const [itinerary, setItinerary] = useState<string>('');
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetch(`/api/trips/${encodeURIComponent(tripId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.trip) return;
        setTrip({
          id: d.trip.id,
          title: d.trip.title,
          location: d.trip.location ?? null,
          startDate: d.trip.startDate ?? null,
          endDate: d.trip.endDate ?? null,
          nights: d.trip.nights ?? null,
        });
        if (typeof d.trip.itinerary === 'string') setItinerary(d.trip.itinerary);
      })
      .finally(() => { if (!cancelled) setLoadingTrip(false); });
    return () => { cancelled = true; };
  }, [tripId]);

  // Trip-day calculation — what day are we on out of total nights+1?
  const dayInfo = (() => {
    if (!trip?.startDate || !trip?.nights) return { day: 1, total: 1 };
    const start = new Date(trip.startDate + 'T00:00:00');
    const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00');
    const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
    const total = trip.nights + 1;
    const day = Math.max(1, Math.min(total, diff + 1));
    return { day, total };
  })();

  const cityName = (trip?.location ?? 'YOUR CITY').toUpperCase();
  const clockText = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  // Today's activities, parsed from the saved itinerary.
  const activities = useMemo(
    () => parseTodayActivities(itinerary, dayInfo.day),
    [itinerary, dayInfo.day],
  );

  // Next activity = first one whose time is later than now.
  const currentClock = nowHHMM(now);
  const nextIdx = activities.findIndex(a => a.time > currentClock);
  const nextActivity = nextIdx >= 0 ? activities[nextIdx] : null;

  // ETA from user → next activity. Uses Mapbox Geocoder + Directions; bails
  // silently if the token / coordinates aren't available, leaving the
  // mocked-fallback copy in place.
  const [etaMin, setEtaMin] = useState<number | null>(null);
  const [nextCoords, setNextCoords] = useState<Geo | null>(null);
  useEffect(() => {
    setEtaMin(null);
    setNextCoords(null);
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !geo || !nextActivity?.place) return;
    let cancelled = false;
    const proximity = `${geo.lon},${geo.lat}`;
    const placeQuery = trip?.location
      ? `${nextActivity.place} ${trip.location}`
      : nextActivity.place;
    fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(placeQuery)}.json?access_token=${token}&limit=1&proximity=${proximity}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.features?.[0]?.center) return;
        const [lon, lat] = d.features[0].center as [number, number];
        setNextCoords({ lat, lon });
        return fetch(`https://api.mapbox.com/directions/v5/mapbox/walking/${geo.lon},${geo.lat};${lon},${lat}?access_token=${token}&overview=false`);
      })
      .then(r => r ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.routes?.[0]?.duration) return;
        setEtaMin(Math.round(d.routes[0].duration / 60));
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [geo, nextActivity?.place, trip?.location]);

  // "Leave by" = activity time minus walking ETA minus a 5-min buffer.
  const leaveByText = (() => {
    if (!nextActivity) return null;
    const [h, m] = nextActivity.time.split(':').map(Number);
    const target = new Date(now); target.setHours(h, m, 0, 0);
    const offset = (etaMin ?? 0) + 5;
    const leaveAt = new Date(target.getTime() - offset * 60_000);
    const minsToLeave = Math.max(0, Math.round((leaveAt.getTime() - now.getTime()) / 60_000));
    return { leaveAt, minsToLeave };
  })();

  return (
    <div style={{
      minHeight: '100svh',
      background: 'var(--brand-bg)',
      color: 'var(--brand-ink)',
      fontFamily: 'var(--font-ui), system-ui, sans-serif',
      paddingBottom: 80,
    }}>
      {/* ── Top app bar ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 22px',
        background: 'rgba(5,5,15,0.85)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--brand-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: 'var(--brand-success)',
            boxShadow: '0 0 12px var(--brand-success)',
            animation: 'livePulse 1.6s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em',
            color: 'var(--brand-ink-dim)', fontWeight: 600,
          }}>
            LIVE · DAY {dayInfo.day} OF {dayInfo.total} · {cityName}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--brand-ink-dim)' }}>{clockText}</span>
          <span style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
            padding: '4px 10px', borderRadius: 999,
            border: '1px solid var(--brand-border)',
            color: 'var(--brand-ink-mute)',
          }}>
            {String.fromCodePoint(0x25D0)} OFFLINE MAPS CACHED
          </span>
          <Link href={`/plan/summary?tripId=${encodeURIComponent(tripId)}`}
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
              color: 'var(--brand-accent)', textDecoration: 'none',
              padding: '4px 10px', borderRadius: 999,
              border: '1px solid var(--brand-border-hi)',
            }}>
            ITINERARY {String.fromCodePoint(0x2197)}
          </Link>
        </div>
      </div>

      {/* ── Map area ───────────────────────────────────────────────────── */}
      <LiveMap city={trip?.location ?? null} geo={geo} weather={weather?.[0] ?? null} activities={activities} />

      {/* ── Hero LEAVE-BY card ─────────────────────────────────────────── */}
      <div style={{ padding: '24px 22px 0' }}>
        <LeaveByCard
          next={nextActivity}
          etaMin={etaMin}
          leaveBy={leaveByText}
          coords={nextCoords}
        />
      </div>

      {/* ── Three context cards ────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14, padding: '20px 22px 0',
      }}>
        <NextStopCard next={activities[nextIdx + 1] ?? null} />
        <WeatherAlertCard weather={weather?.[0] ?? null} />
        <CrowdsCard placeName={nextActivity?.place ?? null} placeCoords={nextCoords ?? geo} />
      </div>

      {/* ── Day timeline strip ─────────────────────────────────────────── */}
      <div style={{ padding: '24px 22px 0' }}>
        <DayTimeline activities={activities} currentClock={currentClock} />
      </div>

      {loadingTrip && (
        <div style={{ padding: '24px 22px', color: 'var(--brand-ink-mute)', fontSize: 12 }}>
          Loading trip…
        </div>
      )}

      <style>{`
        @keyframes livePulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.6); opacity: 0.5; }
        }
        @keyframes routeDash {
          to { stroke-dashoffset: -32; }
        }
      `}</style>
    </div>
  );
}

// ─── Live Map ───────────────────────────────────────────────────────────────

function LiveMap({ city, geo, weather, activities }: { city: string | null; geo: Geo | null; weather: DayWeather | null; activities: Activity[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const youAreHereRef = useRef<mapboxgl.Marker | null>(null);
  const stopMarkersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !containerRef.current) return;
    mapboxgl.accessToken = token;

    // Prefer geolocation; fall back to Kyoto until both city geocode and
    // geolocation arrive.
    const initialCenter: [number, number] = geo ? [geo.lon, geo.lat] : [135.768, 35.0116];
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: initialCenter,
      zoom: 13,
      pitch: 0,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on('load', () => {
      // Per-leg route source — same shape as DayMap so the per-leg color
      // logic and per-mode Directions fetching ports straight over.
      map.addSource('live-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'live-route-line',
        type: 'line',
        source: 'live-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match', ['coalesce', ['get', 'mode'], 'unknown'],
            'walking',  '#a78bfa',
            'cycling',  '#34d399',
            'driving',  '#fbbf24',
            /* default */ '#a78bfa',
          ],
          'line-width': 4,
          'line-opacity': 0.85,
        },
      });
    });
    return () => {
      youAreHereRef.current?.remove();
      youAreHereRef.current = null;
      stopMarkersRef.current.forEach(m => m.remove());
      stopMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  // Mounted once; recenter via the effect below as geo arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter and drop / move the "you are here" pulsing marker as the
  // browser geolocation resolves.
  useEffect(() => {
    if (!mapRef.current || !geo) return;
    mapRef.current.flyTo({ center: [geo.lon, geo.lat], zoom: 14, duration: 1200 });
    if (!youAreHereRef.current) {
      const el = document.createElement('div');
      el.style.cssText = `
        width: 18px; height: 18px; border-radius: 50%;
        background: var(--brand-success);
        box-shadow: 0 0 0 4px rgba(124,255,151,0.25), 0 0 18px rgba(124,255,151,0.55);
        animation: livePulse 1.6s ease-in-out infinite;
      `;
      youAreHereRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([geo.lon, geo.lat])
        .addTo(mapRef.current);
    } else {
      youAreHereRef.current.setLngLat([geo.lon, geo.lat]);
    }
  }, [geo]);

  // Drop a numbered pin at every activity stop AND draw a Mapbox-routed
  // line from "you are here" → next stop → following stops. Uses the same
  // multi-strategy geocoder + per-leg directions pipeline as the planning
  // DayMap so routes follow streets, not arbitrary diagonals.
  useEffect(() => {
    if (!mapRef.current || !city) return;
    let cancelled = false;
    const map = mapRef.current;

    async function geocode(addr: string): Promise<[number, number] | null> {
      try {
        const r = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
        if (r.ok) {
          const c = await r.json() as { lat: number; lng: number } | null;
          if (c) return [c.lng, c.lat];
        }
      } catch { /* fall through */ }
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) return null;
      try {
        const u = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${token}&limit=1`;
        const r = await fetch(u);
        if (!r.ok) return null;
        const d = await r.json() as { features?: Array<{ center: [number, number] }> };
        return d.features?.[0]?.center ?? null;
      } catch { return null; }
    }

    async function resolve(name: string, anchor: [number, number]): Promise<[number, number] | null> {
      const tries = [`${name}, ${city}`, `${name}`];
      for (const q of tries) {
        const c = await geocode(q);
        if (c && Math.abs(c[1] - anchor[1]) < 0.6 && Math.abs(c[0] - anchor[0]) < 0.9) return c;
      }
      return null;
    }

    (async () => {
      stopMarkersRef.current.forEach(m => m.remove());
      stopMarkersRef.current = [];
      const src = map.getSource('live-route') as mapboxgl.GeoJSONSource | undefined;
      src?.setData({ type: 'FeatureCollection', features: [] });

      const cityCoords = await geocode(city);
      if (cancelled || !cityCoords) return;
      const anchor: [number, number] = geo ? [geo.lon, geo.lat] : cityCoords;

      const placeNames = activities.map(a => a.place).filter((p): p is string => !!p);
      const resolved = (await Promise.all(placeNames.map(n => resolve(n, anchor))))
        .map((c, i) => c ? { name: placeNames[i], coords: c } : null)
        .filter((p): p is { name: string; coords: [number, number] } => !!p);
      if (cancelled || resolved.length === 0) return;

      // Pin every resolved activity. Smaller + semi-transparent so
      // overlapping pins stay readable. First one (next-up) gets a
      // subtle bump so it's still spottable; quest-like stops swap to
      // gold while everything else stays in the purple theme.
      resolved.forEach((p, i) => {
        const isMonument = /monument|quest|⏚|temple|shrine|cathedral|landmark|tower|palace|castle/i.test(p.name);
        const isFirst = i === 0;
        const baseRGB = isMonument ? '251, 191, 36' : '167, 139, 250';
        const fillAlpha = isFirst ? 0.92 : 0.72;
        const borderAlpha = isFirst ? 0.95 : 0.55;
        const size = isFirst ? 22 : 18;

        const el = document.createElement('div');
        el.style.cssText = `
          width: ${size}px; height: ${size}px; border-radius: 50%;
          background: rgba(${baseRGB}, ${fillAlpha});
          color: #0a0a1f; font-weight: 700; font-size: ${isFirst ? 11 : 10}px;
          display: flex; align-items: center; justify-content: center;
          border: 1.5px solid rgba(13,13,36,${borderAlpha});
          box-shadow: 0 1px 6px rgba(0,0,0,0.35);
          font-family: var(--font-ui, system-ui), sans-serif;
        `;
        el.textContent = String(i + 1);
        const m = new mapboxgl.Marker({ element: el }).setLngLat(p.coords).addTo(map);
        stopMarkersRef.current.push(m);
      });

      // Build the legged route: "you are here" (if available) → first stop
      // → second → ... Walking profile because live-trip context is almost
      // always a pedestrian-radius decision.
      const legPath: [number, number][] = [];
      if (geo) legPath.push([geo.lon, geo.lat]);
      legPath.push(...resolved.map(p => p.coords));

      type LegFeature = GeoJSON.Feature<GeoJSON.LineString, { mode: string; legIdx: number }>;
      const features: LegFeature[] = [];
      for (let i = 0; i < legPath.length - 1; i++) {
        features.push({
          type: 'Feature',
          properties: { mode: 'walking', legIdx: i },
          geometry: { type: 'LineString', coordinates: [legPath[i], legPath[i + 1]] },
        });
      }
      src?.setData({ type: 'FeatureCollection', features });

      // Upgrade each leg to a routed walking path, fire-and-forget.
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (token) {
        for (let i = 0; i < features.length; i++) {
          const a = legPath[i], b = legPath[i + 1];
          const u = `https://api.mapbox.com/directions/v5/mapbox/walking/${a[0]},${a[1]};${b[0]},${b[1]}?access_token=${token}&geometries=geojson&overview=full`;
          fetch(u)
            .then(r => r.ok ? r.json() as Promise<{ routes?: { geometry: { coordinates: [number, number][] } }[] }> : null)
            .then(d => {
              // No cancelled-guard — same React re-render trap as DayMap;
              // bailing on cancelled was throwing away every routed leg.
              const routed = d?.routes?.[0]?.geometry?.coordinates;
              if (!routed || routed.length === 0) return;
              const stillSrc = mapRef.current?.getSource('live-route') as mapboxgl.GeoJSONSource | undefined;
              if (!stillSrc) return;
              features[i] = {
                type: 'Feature',
                properties: { mode: 'walking', legIdx: i },
                geometry: { type: 'LineString', coordinates: routed },
              };
              stillSrc.setData({ type: 'FeatureCollection', features: [...features] });
            })
            .catch(() => { /* keep straight */ });
        }
      }

      // Fit bounds to all pins + you-are-here.
      const bounds = new mapboxgl.LngLatBounds();
      legPath.forEach(c => bounds.extend(c));
      map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 700 });
    })();

    return () => { cancelled = true; };
  }, [activities, city, geo]);

  void weather;

  const tokenMissing = !process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{
        width: '100%',
        height: 'min(56vh, 480px)',
        background: 'var(--brand-bg2)',
        borderBottom: '1px solid var(--brand-border)',
      }} />
      {tokenMissing && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'grid', placeItems: 'center',
          color: 'var(--brand-ink-mute)', fontSize: 12, padding: 24, textAlign: 'center',
        }}>
          NEXT_PUBLIC_MAPBOX_TOKEN not set — map preview disabled.
        </div>
      )}

      {/* Floating overlays — desktop only (hidden on narrow screens) */}
      <div style={{
        position: 'absolute', top: 16, right: 16,
        display: 'flex', flexDirection: 'column', gap: 10,
        pointerEvents: 'none',
      }}>
        <MiniWeatherCard weather={weather} />
        <MiniTransitCard />
      </div>

      {/* NEXT label-pill above the next stop pin (mocked centered) */}
      <div style={{
        position: 'absolute', top: '40%', left: '50%',
        transform: 'translate(-50%, -100%)',
        background: 'var(--brand-accent)',
        color: 'var(--brand-bg)',
        padding: '6px 12px', borderRadius: 999,
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 16px rgba(167,139,250,0.4)',
        pointerEvents: 'none',
      }}>
        NEXT · TEA CEREMONY · 14 MIN
      </div>
    </div>
  );
}

function MiniWeatherCard({ weather }: { weather: DayWeather | null }) {
  const tempC = weather ? Math.round((weather.tempMin + weather.tempMax) / 2) : null;
  const cond = weather?.condition ?? 'Loading…';
  const popPct = weather ? Math.round(weather.pop * 100) : 0;
  return (
    <div style={{
      pointerEvents: 'auto',
      background: 'rgba(13,13,36,0.85)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--brand-border)', borderRadius: 12,
      padding: '10px 14px', minWidth: 160,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: 'var(--brand-ink-mute)', marginBottom: 4 }}>
        WEATHER
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 400, color: 'var(--brand-accent-2)' }}>
        {tempC === null ? '—' : `${tempC}°`}{' '}
        {weather && <img src={weather.iconUrl} alt={weather.condition} style={{ width: 24, height: 24, verticalAlign: 'middle' }} />}
      </div>
      <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)' }}>
        {cond}{popPct >= 30 ? ` · ${popPct}% rain` : ''}
      </div>
    </div>
  );
}

function MiniTransitCard() {
  const [mode, setMode] = useState<'walk' | 'bus'>('walk');
  return (
    <div style={{
      pointerEvents: 'auto',
      background: 'rgba(13,13,36,0.85)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--brand-border)', borderRadius: 12,
      padding: '10px 14px', minWidth: 160,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: 'var(--brand-ink-mute)', marginBottom: 6 }}>
        TRANSIT
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['walk', 'bus'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: '6px 10px', borderRadius: 8,
            background: mode === m ? 'rgba(167,139,250,0.16)' : 'transparent',
            border: `1px solid ${mode === m ? 'var(--brand-border-hi)' : 'var(--brand-border)'}`,
            color: mode === m ? 'var(--brand-accent)' : 'var(--brand-ink-dim)',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
            textTransform: 'capitalize', cursor: 'pointer',
          }}>{m}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)', marginTop: 6 }}>
        {mode === 'walk' ? '14 min · 1.1 km' : '6 min · bus 5 line'}
      </div>
    </div>
  );
}

// ─── Hero LEAVE-BY card ─────────────────────────────────────────────────────

function LeaveByCard({
  next, etaMin, leaveBy, coords,
}: {
  next: Activity | null;
  etaMin: number | null;
  leaveBy: { leaveAt: Date; minsToLeave: number } | null;
  coords: Geo | null;
}) {
  // Pull a clean place-name pair out of the activity body so we can render
  // "<verb> at <Place>" with the place in italic accent.
  const split = (() => {
    if (!next) return null;
    const m = next.name.match(/^(.*?)(?:\s+(?:at|in)\s+)([A-Z][\wÀ-ſ'’\- ]{2,40})\.?$/);
    if (m) return { lead: m[1].trim(), place: m[2].trim() };
    return { lead: next.name.replace(/[.]$/, ''), place: '' };
  })();

  const stamp = (() => {
    if (!next) return 'WAITING ON NEXT STOP';
    if (leaveBy && leaveBy.minsToLeave > 0) {
      return `${String.fromCodePoint(0x2728)} LEAVE IN ${leaveBy.minsToLeave} MIN · TO MAKE ${next.display}`;
    }
    if (leaveBy && leaveBy.minsToLeave === 0) {
      return `${String.fromCodePoint(0x2728)} LEAVE NOW · ${next.display}`;
    }
    return `${String.fromCodePoint(0x2728)} NEXT · ${next.display}`;
  })();

  const detail = (() => {
    if (!next) return 'No more activities scheduled for today. Soak it in.';
    const eta = etaMin != null ? `${etaMin} min walk` : 'walk time pending';
    const leaveAt = leaveBy
      ? leaveBy.leaveAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : null;
    return leaveAt
      ? `${eta} from your current spot. Leaving by ${leaveAt} gives you a ~5 min buffer.`
      : `${eta} from your current spot.`;
  })();

  const navHref = coords
    ? `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lon}&travelmode=walking`
    : null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(167,139,250,0.18), rgba(125,211,252,0.10))',
      border: '1px solid var(--brand-border-hi)',
      borderRadius: 18,
      padding: '22px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 18, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em',
          color: 'var(--brand-accent)', fontWeight: 700, marginBottom: 8,
        }}>
          {stamp}
        </div>
        <h2 style={{
          margin: 0,
          fontFamily: DISPLAY, fontSize: 'clamp(28px, 4vw, 44px)',
          fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.05,
          color: 'var(--brand-ink)',
        }}>
          {!split ? 'Day on rails.' : (
            <>
              {split.lead}{' '}
              {split.place && <em style={{ fontStyle: 'italic', color: 'var(--brand-accent)' }}>{split.place}</em>}.
            </>
          )}
        </h2>
        <div style={{
          marginTop: 10, fontSize: 13, lineHeight: 1.5,
          color: 'var(--brand-ink-dim)', maxWidth: 480,
        }}>
          {detail}
        </div>
      </div>
      {navHref ? (
        <a href={navHref} target="_blank" rel="noopener noreferrer" style={{
          flexShrink: 0,
          background: 'var(--brand-accent)',
          color: 'var(--brand-bg)',
          border: 'none', borderRadius: 14,
          padding: '14px 22px',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 700, letterSpacing: '0.02em',
          cursor: 'pointer', textDecoration: 'none',
          boxShadow: '0 8px 24px rgba(167,139,250,0.35)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {String.fromCodePoint(0x2197)} Navigate
        </a>
      ) : (
        <button disabled style={{
          flexShrink: 0,
          background: 'rgba(167,139,250,0.25)',
          color: 'var(--brand-bg)',
          border: 'none', borderRadius: 14,
          padding: '14px 22px',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 700, letterSpacing: '0.02em',
          cursor: 'not-allowed', opacity: 0.55,
        }}>
          {String.fromCodePoint(0x2197)} Navigate
        </button>
      )}
    </div>
  );
}

// ─── Context cards ──────────────────────────────────────────────────────────

function CardShell({ accent, label, children }: {
  accent: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderLeft: `3px solid ${accent}`,
      border: '1px solid var(--brand-border)',
      borderLeftWidth: 3,
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
        color: accent, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase',
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function NextStopCard({ next }: { next: Activity | null }) {
  if (!next) {
    return (
      <CardShell accent="var(--brand-accent-2)" label="AFTER THAT">
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, color: 'var(--brand-ink)' }}>
          Open evening
        </div>
        <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
          Nothing else on the books today.
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell accent="var(--brand-accent-2)" label="AFTER THAT">
      <div style={{
        fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, color: 'var(--brand-ink)',
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {next.name}
      </div>
      <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
        {next.display}
      </div>
    </CardShell>
  );
}

function WeatherAlertCard({ weather }: { weather: DayWeather | null }) {
  if (!weather) {
    return (
      <CardShell accent="var(--brand-gold)" label="WEATHER ALERT">
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, color: 'var(--brand-ink)' }}>Loading…</div>
        <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
          Pulling the local forecast.
        </div>
      </CardShell>
    );
  }
  const popPct = Math.round(weather.pop * 100);
  const headline = popPct >= 60
    ? `${weather.condition} · expect rain`
    : popPct >= 30
      ? `${weather.condition} · light rain possible`
      : weather.condition;
  const detail = popPct >= 60
    ? 'Pack a layer and waterproof your camera bag.'
    : popPct >= 30
      ? 'Bring a layer. Most temple gardens stay open in light rain.'
      : `${weather.tempMax}°/${weather.tempMin}° today — sunset wraps the day in honey light.`;
  return (
    <CardShell accent="var(--brand-gold)" label="WEATHER ALERT">
      <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, color: 'var(--brand-ink)', textTransform: 'capitalize' }}>
        {headline}
      </div>
      <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
        {detail}
      </div>
    </CardShell>
  );
}

function CrowdsCard({ placeName, placeCoords }: { placeName: string | null; placeCoords: Geo | null }) {
  const [hours, setHours] = useState<number[] | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!placeName) { setHours(null); setResolvedName(null); setLoaded(true); return; }
    let cancelled = false;
    setLoaded(false);
    const params = new URLSearchParams({ place: placeName });
    if (placeCoords) {
      params.set('lat', String(placeCoords.lat));
      params.set('lon', String(placeCoords.lon));
    }
    fetch(`/api/popular-times?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return;
        setHours(Array.isArray(d?.hours) && d.hours.some((h: number) => h > 0) ? d.hours : null);
        setResolvedName(d?.name ?? placeName);
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [placeName, placeCoords?.lat, placeCoords?.lon]);

  const current = new Date().getHours();
  const label = (resolvedName ?? placeName ?? 'NEXT STOP').toUpperCase();

  if (!hours) {
    // No place yet, no popular-times data, or fetch failed — show a quiet
    // placeholder rather than the synthetic mock curve.
    return (
      <CardShell accent="var(--brand-warn)" label={`CROWDS · ${label.slice(0, 24)}`}>
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, color: 'var(--brand-ink)' }}>
          {!placeName ? 'No next stop yet' : !loaded ? 'Reading busyness…' : 'No popular-times data'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
          {!placeName
            ? 'A crowd forecast appears here once your next stop is set.'
            : !loaded
              ? 'Pulling Google Maps popular times.'
              : 'Google doesn’t publish hourly busyness for this place.'}
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell accent="var(--brand-warn)" label={`CROWDS · ${label.slice(0, 24)}`}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 36, marginTop: 4 }}>
        {hours.map((h, i) => (
          <div key={i} style={{
            flex: 1,
            height: `${Math.max(6, h)}%`,
            borderRadius: 1,
            background: i === current ? 'var(--brand-success)' : 'var(--brand-warn)',
            opacity: i === current ? 1 : 0.55,
          }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)', marginTop: 6 }}>
        {hours[current] > 0 ? `Currently ${hours[current]}%` : 'Currently quiet'}
        {' · '}
        {(() => {
          const peakHour = hours.indexOf(Math.max(...hours));
          const ampm = peakHour >= 12 ? 'PM' : 'AM';
          const display = ((peakHour + 11) % 12) + 1;
          return `peak ${display} ${ampm}`;
        })()}
      </div>
    </CardShell>
  );
}

// ─── Day timeline ───────────────────────────────────────────────────────────

function DayTimeline({ activities, currentClock }: { activities: Activity[]; currentClock: string }) {
  if (activities.length === 0) {
    return (
      <div style={{
        padding: 18, borderRadius: 12,
        border: '1.5px dashed var(--brand-border)',
        color: 'var(--brand-ink-mute)', fontSize: 12, textAlign: 'center',
      }}>
        No activities parsed for today. Add stops to your itinerary to see them here.
      </div>
    );
  }
  const nextIdx = activities.findIndex(a => a.time > currentClock);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${activities.length}, minmax(0, 1fr))`,
      gap: 8,
    }}>
      {activities.map((a, i) => {
        const status: 'done' | 'now' | 'future' =
          nextIdx === -1                     ? 'done'
          : i < nextIdx                       ? 'done'
          : i === nextIdx                     ? 'now'
                                              : 'future';
        const color = status === 'done'   ? 'var(--brand-success)'
                    : status === 'now'    ? 'var(--brand-accent)'
                                          : 'var(--brand-ink-mute)';
        const opacity = status === 'future' ? 0.55 : 1;
        return (
          <div key={i} style={{
            borderTop: `2px solid ${color}`,
            paddingTop: 8, opacity,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, marginBottom: 8,
            }} />
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: 'var(--brand-ink-mute)', marginBottom: 2 }}>
              {status.toUpperCase()} · {a.display}
            </div>
            <div style={{
              fontFamily: DISPLAY, fontSize: 13, color: 'var(--brand-ink)', lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {a.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
