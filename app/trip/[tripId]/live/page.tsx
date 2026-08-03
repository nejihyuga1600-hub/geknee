'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import BudgetTracker from './BudgetTracker';
import { GoogleLiveMap } from './GoogleLiveMap';
import { AddStopModal } from './AddStopModal';
import { useTilePrewarm, useExplicitOfflineDownload } from '@/lib/useTilePrewarm';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { fetchDirections } from '@/lib/googleMaps/directionsClient';
import { fetchWeather, type WeatherResult, type WeatherDay } from '@/lib/googleMaps/weatherClient';
import { useTripTimezone } from '@/app/hooks/useTripTimezone';
import { CardShell } from './CardShell';
import { SafetyCard } from './SafetyCard';

// ─── E5 · Live Trip · in-the-field companion ────────────────────────────────
// In-trip companion: glanceable LEAVE-BY card on top of a focused city map,
// flanked by next-stop / weather / crowds context cards and a horizontal
// day-timeline strip. v0: shipping the visual surface with realistic mock
// data; geolocation, Google Directions ETA, and Google Places popular-times
// hookups land in follow-ups.

interface TripData {
  id: string;
  title: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  nights: number | null;
  // Phase 0/2: when populated, this trip had a flight detected via Gmail
  // scan — kicks the tile-prewarm hook so the SW caches static maps for
  // the trip city ahead of any network loss.
  flightBookingDetectedAt?: string | null;
  // Phase 3: flipped true after the offline tile prewarm has completed
  // for this trip (either auto on flight detection or explicit via the
  // "Download offline" CTA). UI suppresses the CTA when this is set.
  offlineMapPrefetched?: boolean;
  timezone?: string | null;
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

// Strip markdown emphasis + list dashes + trailing punctuation from an
// activity body so it renders as clean prose. The itinerary is authored
// as markdown ("Stroll through **Vinohrady** *(~1 hr)* — Prague's...")
// and prior versions were dumping that raw into the live-trip cards
// with `**` and `*` and stray dashes visible on-screen (user video
// 2026-08-03 10:34). Removes: **bold**, *italic*, _underscore_,
// `code`, leading `—`/`-`/`–`/`:`, and collapses runs of whitespace.
function stripMd(s: string): string {
  return s
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^[\s\-–—:•]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
      // stripMd + strip leading list dashes so the rendered name is clean
      // prose (was showing raw "**Vinohrady** *(~1 hr)* — Prague's..." in
      // the LEAVE-BY / timeline cards).
      const name = stripMd(body);
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
  const [currentWeather, setCurrentWeather] = useState<WeatherResult | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setNow(new Date());
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  // Geolocation removed per privacy directive — only flight departure
  // detection requests location. Live trip view falls back to the
  // trip's anchor city for the mock map center; no GPS recenter.

  // Current-conditions banner above the live map.
  // Geocode the anchor city then call /api/weather?days=7 so we get both current (banner) and forecast (alert card).
  // Re-fetches when the trip location changes. Falls back silently on any error.
  useEffect(() => {
    if (!trip?.location) return;
    let cancelled = false;
    (async () => {
      try {
        const gr = await fetch(`/api/geocode?address=${encodeURIComponent(trip.location!)}`);
        if (!gr.ok || cancelled) return;
        const gd = await gr.json() as { lat?: number; lng?: number; country?: string | null } | null;
        if (!gd?.lat || !gd?.lng || cancelled) return;
        if (!cancelled) setCountryCode(gd.country ?? null);
        const w = await fetchWeather(gd.lat, gd.lng, 7);
        if (!cancelled) setCurrentWeather(w);
      } catch { /* silent */ }
    })();
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
          flightBookingDetectedAt: d.trip.flightBookingDetectedAt ?? null,
          offlineMapPrefetched: !!d.trip.offlineMapPrefetched,
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
  const tripTz = useTripTimezone(trip?.timezone);
  const clockText = new Intl.DateTimeFormat(undefined, {
    timeZone: tripTz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(now);

  // The user can toggle which day they're previewing — defaults to the
  // calendar-current day. Map + activity list both flip when this changes,
  // so the map centers on Day N's stops instead of the user's geolocation.
  const [selectedDay, setSelectedDay] = useState<number>(dayInfo.day);
  // Add-stop modal state. coords are populated when the user clicks the
  // map; null = launched from the "+ Add stop" button (no pre-seed).
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [addStopCoords, setAddStopCoords] = useState<{ lat: number; lon: number } | null>(null);

  // Offline tile prewarm — only kicks for trips with a Gmail-detected
  // flight. The SW caches /api/map-tile responses; this fires a handful
  // of background fetches to populate the cache for the trip city so
  // when network drops mid-trip, GoogleLiveMap's offline fallback works.
  useTilePrewarm({
    city: trip?.location ?? null,
    enabled: !!trip?.flightBookingDetectedAt,
  });

  const online = useOnlineStatus();

  // Explicit "Download offline" — wider grid than the automatic prewarm.
  // Surfaces as a button; user gets a progress fraction while it runs.
  const explicitDownload = useExplicitOfflineDownload();
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [downloadDone, setDownloadDone] = useState(false);
  useEffect(() => {
    // When the calendar advances (new day on a running trip), follow along
    // — but don't override an explicit user choice. Heuristic: if the user
    // hasn't deviated from the previous "today", track it.
    setSelectedDay(dayInfo.day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayInfo.day]);

  // Selected-day activities. The map + day-on-rails copy + LEAVE-BY card
  // all read off this list, so toggling re-renders the whole strip cleanly.
  const activities = useMemo(
    () => parseTodayActivities(itinerary, selectedDay),
    [itinerary, selectedDay],
  );

  // Next activity = first one whose time is later than now.
  const currentClock = nowHHMM(now);
  const nextIdx = activities.findIndex(a => a.time > currentClock);
  const nextActivity = nextIdx >= 0 ? activities[nextIdx] : null;

  // ETA from user → next activity. Uses /api/geocode + Google Directions.
  // Throttled: fires at most every 60 s AND only if user moved >50 m.
  const [etaMin, setEtaMin] = useState<number | null>(null);
  const [nextCoords, setNextCoords] = useState<Geo | null>(null);
  const lastEtaCallRef = useRef<number>(0);
  const lastEtaPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // Inline haversine helper (metres) — no extra deps needed.
  function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6_371_000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(sin2));
  }

  useEffect(() => {
    setEtaMin(null);
    setNextCoords(null);
    if (!geo || !nextActivity?.place) return;
    let cancelled = false;
    const placeQuery = trip?.location
      ? `${nextActivity.place} ${trip.location}`
      : nextActivity.place;
    const userPos = { lat: geo.lat, lng: geo.lon };

    // Throttle: skip if called within 60 s or user hasn't moved 50 m.
    const now = Date.now();
    if (now - lastEtaCallRef.current < 60_000) return;
    if (lastEtaPosRef.current && haversineMeters(lastEtaPosRef.current, userPos) < 50) return;
    lastEtaCallRef.current = now;
    lastEtaPosRef.current = userPos;

    (async () => {
      const gRes = await fetch(`/api/geocode?address=${encodeURIComponent(placeQuery)}`);
      if (cancelled || !gRes.ok) return;
      const place = await gRes.json() as { lat: number; lng: number } | null;
      if (cancelled || !place) return;
      setNextCoords({ lat: place.lat, lon: place.lng });
      const dr = await fetchDirections(
        { lat: userPos.lat, lng: userPos.lng },
        { lat: place.lat, lng: place.lng },
        'walking',
      );
      if (cancelled || !dr) return;
      if (dr.durationSec != null) setEtaMin(Math.round(dr.durationSec / 60));
    })().catch(() => { /* silent */ });
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
      {/* ── Offline status banner (Phase 3) ───────────────────────────── */}
      {!online && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 40,
          // Push below the iOS Dynamic Island / status bar; background
          // extends INTO the safe area so the body underneath stays hidden.
          padding: 'calc(env(safe-area-inset-top) + 8px) 22px 8px',
          background: 'rgba(251, 146, 60, 0.18)',
          borderBottom: '1px solid rgba(251, 146, 60, 0.45)',
          color: 'var(--brand-warn)',
          fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em',
          textTransform: 'uppercase', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>● Offline</span>
          <span style={{ color: 'var(--brand-ink-dim)', letterSpacing: '0.06em', textTransform: 'none' }}>
            — using cached map data. Itinerary edits will retry when you reconnect.
          </span>
        </div>
      )}
      {/* ── Top app bar ─────────────────────────────────────────────────
          Two-row layout (redesigned 2026-08-03 per user feedback that the
          prior single row was "cramped and poorly designed"):
            Row 1  ·  live-dot + LIVE / DAY N OF TOTAL / city  ←→  clock
            Row 2  ·  offline-map chip  ←→  nav chips (itin / book / vault)
          Every chip is 44 pt tall so the whole bar is a real touch surface
          instead of a text ribbon. Font size bumped from 10 → 11–12 so
          labels are legible without squinting. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', flexDirection: 'column', gap: 10,
        paddingTop: online ? 'calc(env(safe-area-inset-top) + 12px)' : '12px',
        paddingBottom: 12, paddingLeft: 20, paddingRight: 20,
        background: 'rgba(5,5,15,0.9)', WebkitBackdropFilter: 'blur(18px)', backdropFilter: 'blur(18px)',
        borderBottom: '1px solid var(--brand-border)',
      }}>
        {/* Row 1 — live badge + clock */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <span style={{
              flexShrink: 0,
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: 'var(--brand-success)',
              boxShadow: '0 0 12px var(--brand-success)',
              animation: 'livePulse 1.6s ease-in-out infinite',
            }} />
            <span style={{
              fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em',
              color: 'var(--brand-ink)', fontWeight: 700,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              DAY {dayInfo.day} / {dayInfo.total} · {cityName}
            </span>
          </div>
          <span style={{
            flexShrink: 0,
            fontFamily: MONO, fontSize: 13, fontVariantNumeric: 'tabular-nums',
            color: 'var(--brand-ink)', fontWeight: 600,
          }}>{clockText}</span>
        </div>
        {/* Row 2 — offline status (left) + nav chips (right) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span
            title={online ? 'Offline maps ready' : 'Offline mode'}
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
              padding: '6px 10px', borderRadius: 999,
              border: `1px solid ${online ? 'var(--brand-border)' : 'color-mix(in srgb, var(--brand-warning, #f59e0b) 45%, transparent)'}`,
              color: online ? 'var(--brand-ink-mute)' : 'var(--brand-warning, #f59e0b)',
              background: online ? 'transparent' : 'color-mix(in srgb, var(--brand-warning, #f59e0b) 12%, transparent)',
              whiteSpace: 'nowrap',
            }}>
            {String.fromCodePoint(0x25D0)} {online ? 'OFFLINE READY' : 'OFFLINE'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link href={`/plan/${tripId}/itinerary`}
              title="Itinerary" aria-label="Itinerary"
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', fontWeight: 700,
                color: 'var(--brand-accent)', textDecoration: 'none',
                padding: '8px 12px', borderRadius: 999,
                border: '1px solid var(--brand-border-hi)',
                background: 'color-mix(in srgb, var(--brand-accent) 10%, transparent)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              PLAN
            </Link>
            <Link href={`/plan/${tripId}/booking`}
              title="Booking" aria-label="Booking"
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', fontWeight: 700,
                color: 'var(--brand-ink-dim)', textDecoration: 'none',
                padding: '8px 12px', borderRadius: 999,
                border: '1px solid var(--brand-border)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              BOOK
            </Link>
            <Link href={`/plan/${tripId}/vault`}
              title="Vault" aria-label="Vault"
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', fontWeight: 700,
                color: 'var(--brand-ink-dim)', textDecoration: 'none',
                padding: '8px 12px', borderRadius: 999,
                border: '1px solid var(--brand-border)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              VAULT
            </Link>
          </div>
        </div>
      </div>

      {/* ── Day toggle pills ───────────────────────────────────────────── */}
      <div style={{
        padding: '12px 22px 4px',
        display: 'flex', alignItems: 'center', gap: 8,
        flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em',
          color: 'var(--brand-ink-mute)', textTransform: 'uppercase',
          marginRight: 4,
        }}>
          View day
        </span>
        {Array.from({ length: dayInfo.total }).map((_, i) => {
          const d = i + 1;
          const isActive = selectedDay === d;
          const isToday = dayInfo.day === d;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              style={{
                padding: '5px 12px', borderRadius: 999,
                border: `1px solid ${isActive ? 'var(--brand-accent)' : 'var(--brand-border)'}`,
                background: isActive ? 'rgba(167,139,250,0.18)' : 'transparent',
                color: isActive ? 'var(--brand-ink)' : 'var(--brand-ink-dim)',
                fontFamily: MONO, fontSize: 11, fontWeight: 600,
                letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              {d}{isToday && (
                <span style={{
                  marginLeft: 5,
                  fontSize: 8, color: 'var(--brand-success)',
                  letterSpacing: '0.12em',
                }}>● TODAY</span>
              )}
            </button>
          );
        })}

        {/* Offline-download status pill. Three states:
            (a) flight detected + not yet cached + not downloading → CTA
            (b) downloading → progress text
            (c) cached → green "Saved offline" stamp */}
        {trip?.flightBookingDetectedAt && !trip.offlineMapPrefetched && !downloadDone && !downloadProgress && (
          <button
            onClick={async () => {
              if (!trip?.location || !tripId) return;
              setDownloadProgress({ done: 0, total: 1 });
              await explicitDownload(trip.location, tripId, {
                onProgress: (done, total) => setDownloadProgress({ done, total }),
              });
              setDownloadProgress(null);
              setDownloadDone(true);
            }}
            style={{
              marginLeft: 'auto',
              padding: '5px 12px', borderRadius: 999,
              border: '1px solid var(--brand-accent)',
              background: 'rgba(167,139,250,0.18)',
              color: 'var(--brand-ink)',
              fontFamily: MONO, fontSize: 11, fontWeight: 600,
              letterSpacing: '0.08em', cursor: 'pointer',
            }}
          >
            ⤓ Save offline
          </button>
        )}
        {downloadProgress && (
          <span style={{
            marginLeft: 'auto',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em',
            color: 'var(--brand-accent)',
          }}>
            ⤓ Caching {downloadProgress.done}/{downloadProgress.total}…
          </span>
        )}
        {(downloadDone || trip?.offlineMapPrefetched) && (
          <span style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 999,
            border: '1px solid var(--brand-success)',
            background: 'rgba(124,255,151,0.12)',
            color: 'var(--brand-success)',
            fontFamily: MONO, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.08em',
          }}>
            ✓ Saved offline
          </span>
        )}
      </div>

      {/* ── Map area (2D Google Maps, centered on selected day) ─────────── */}
      <div style={{ padding: '0 22px', position: 'relative' }}>
        {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'grid', placeItems: 'center',
            color: 'var(--brand-ink-mute)', fontSize: 12, padding: 24, textAlign: 'center',
            background: 'var(--brand-bg2)',
          }}>
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set — map preview disabled.
          </div>
        )}
        <GoogleLiveMap
          city={trip?.location ?? null}
          activities={activities}
          dayKey={selectedDay}
          geo={geo}
          onMapClick={(coords) => {
            setAddStopCoords(coords);
            setAddStopOpen(true);
          }}
        />
        {/* Floating "+ Add stop" pill in the top-left of the map. Always
            visible so users don't have to discover the click-to-add
            interaction. */}
        <button
          onClick={() => { setAddStopCoords(null); setAddStopOpen(true); }}
          style={{
            position: 'absolute',
            left: 36, top: 14,
            background: 'rgba(167,139,250,0.92)',
            color: 'var(--brand-bg)',
            border: 'none',
            borderRadius: 999,
            padding: '8px 14px',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(167,139,250,0.45)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          + Add stop
        </button>
        {/* Save-for-offline CTA. Web/PWA can't programmatically download
            Google Maps tiles (Google TOS), so this deep-links into the
            Google Maps app on iOS/Android — once open, the user taps
            "Download" on the area card to save offline. On desktop the
            link opens maps.google.com with the destination preselected.
            True automatic download triggered by a Gmail-detected flight
            booking is queued for the native (Capacitor) build. */}
        {trip?.location && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: 'absolute',
              right: 36, bottom: 14,
              background: 'rgba(10, 10, 31, 0.92)',
              color: 'var(--brand-ink)',
              border: '1px solid var(--brand-border-hi)',
              borderRadius: 10,
              padding: '8px 12px',
              fontFamily: MONO, fontSize: 10, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              textDecoration: 'none',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            ⤓ Save offline
          </a>
        )}
      </div>

      {/* ── Hero LEAVE-BY card ─────────────────────────────────────────── */}
      <div style={{ padding: '24px 22px 0' }}>
        <LeaveByCard
          next={nextActivity}
          etaMin={etaMin}
          leaveBy={leaveByText}
          coords={nextCoords}
          tripTimezone={trip?.timezone}
        />
      </div>

      {/* ── Three context cards ────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14, padding: '20px 22px 0',
      }}>
        <NextStopCard next={activities[nextIdx + 1] ?? null} />
        <WeatherAlertCard day={currentWeather?.forecast?.[0] ?? null} />
        <CrowdsCard placeName={nextActivity?.place ?? null} placeCoords={nextCoords ?? geo} />
        <SafetyCard
          countryCode={countryCode}
          anchor={geo ? { lat: geo.lat, lng: geo.lon } : null}
          online={online}
        />
      </div>

      {/* ── Day timeline strip ─────────────────────────────────────────── */}
      <div style={{ padding: '24px 22px 0' }}>
        <DayTimeline activities={activities} currentClock={currentClock} />
      </div>

      {/* ── Live budget tracker ────────────────────────────────────────── */}
      {tripId && (
        <div style={{ padding: '20px 22px 0' }}>
          <BudgetTracker tripId={tripId} />
        </div>
      )}

      {loadingTrip && (
        <div style={{ padding: '24px 22px', color: 'var(--brand-ink-mute)', fontSize: 12 }}>
          Loading trip…
        </div>
      )}

      {/* AI re-plan modal. Single write to TripDraft.itinerary updates both
          this live page and the /plan/[tripId]/itinerary page (both read
          the same field). */}
      {addStopOpen && tripId && (
        <AddStopModal
          tripId={tripId}
          city={trip?.location ?? null}
          day={selectedDay}
          initialCoords={addStopCoords}
          onSaved={(newItinerary) => {
            setItinerary(newItinerary);
            setAddStopOpen(false);
            setAddStopCoords(null);
          }}
          onClose={() => { setAddStopOpen(false); setAddStopCoords(null); }}
        />
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


function MiniTransitCard() {
  const [mode, setMode] = useState<'walk' | 'bus'>('walk');
  return (
    <div style={{
      pointerEvents: 'auto',
      background: 'rgba(13,13,36,0.85)', WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)',
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
  next, etaMin, leaveBy, coords, tripTimezone,
}: {
  next: Activity | null;
  etaMin: number | null;
  leaveBy: { leaveAt: Date; minsToLeave: number } | null;
  coords: Geo | null;
  tripTimezone?: string | null;
}) {
  const tripTz = useTripTimezone(tripTimezone);
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
      ? new Intl.DateTimeFormat(undefined, {
          timeZone: tripTz,
          hour: 'numeric',
          minute: '2-digit',
        }).format(leaveBy.leaveAt)
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

function WeatherAlertCard({ day }: { day: WeatherDay | null }) {
  if (!day) {
    return (
      <CardShell accent="var(--brand-gold)" label="WEATHER ALERT">
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, color: 'var(--brand-ink)' }}>Loading…</div>
        <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
          Pulling the local forecast.
        </div>
      </CardShell>
    );
  }
  const popPct = day.precipPct;
  const cond = day.conditionsText || 'Clear';
  const headline = popPct >= 60
    ? `${cond} · expect rain`
    : popPct >= 30
      ? `${cond} · light rain possible`
      : cond;
  const tempLine = (day.highC !== null && day.lowC !== null)
    ? `${Math.round(day.highC)}°/${Math.round(day.lowC)}° today`
    : '';
  const detail = popPct >= 60
    ? 'Pack a layer and waterproof your camera bag.'
    : popPct >= 30
      ? 'Bring a layer. Most outdoor stops stay open in light rain.'
      : tempLine ? `${tempLine} — sunset wraps the day in honey light.` : 'Clear conditions ahead.';
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
  // Horizontal-scroll strip (redesigned 2026-08-03): the prior
  // grid-template `repeat(N, minmax(0, 1fr))` split the day into N
  // equal columns, which meant a 7-activity day on a 393px iPhone gave
  // each tile ~46px — every name truncated after 3 characters. Now
  // each tile is a fixed 156px wide (comfortably 2 lines of 13px
  // display), the strip scrolls horizontally with scroll-snap so users
  // land on a card, and the "NOW" tile is scrollIntoView'd on mount.
  return (
    <div
      ref={(el) => {
        // Center the NOW card on first paint (or DONE if the day is over).
        if (!el) return;
        const targetIdx = nextIdx === -1 ? activities.length - 1 : nextIdx;
        const target = el.children[targetIdx] as HTMLElement | undefined;
        if (target) target.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
      }}
      style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollSnapType: 'x mandatory',
        paddingBottom: 6,
        // Hide native scrollbar on WebKit — the strip is discoverable
        // via the peeking next tile so a bar is just chrome.
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      {activities.map((a, i) => {
        const status: 'done' | 'now' | 'future' =
          nextIdx === -1                     ? 'done'
          : i < nextIdx                       ? 'done'
          : i === nextIdx                     ? 'now'
                                              : 'future';
        const color = status === 'done'   ? 'var(--brand-success)'
                    : status === 'now'    ? 'var(--brand-accent)'
                                          : 'var(--brand-ink-mute)';
        const opacity = status === 'future' ? 0.65 : 1;
        return (
          <div key={i} style={{
            flex: '0 0 156px',
            scrollSnapAlign: 'center',
            borderTop: `2px solid ${color}`,
            paddingTop: 10,
            opacity,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, marginBottom: 10,
              boxShadow: status === 'now' ? `0 0 10px ${color}` : 'none',
            }} />
            <div style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
              color: status === 'now' ? 'var(--brand-accent)' : 'var(--brand-ink-mute)',
              marginBottom: 4, fontWeight: 700,
            }}>
              {status.toUpperCase()} · {a.display}
            </div>
            <div style={{
              fontFamily: DISPLAY, fontSize: 14, color: 'var(--brand-ink)', lineHeight: 1.3,
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
