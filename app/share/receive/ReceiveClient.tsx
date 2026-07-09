'use client';

// ReceiveClient — the trip-picker UX for the Web/iOS/Android share flow.
// Renders a compact card: source thumbnail + resolved venue + trip picker.
// Every path (URL share, text share, media share) funnels into the same
// UnfurlResult shape returned by /api/share-unfurl or /api/share/analyze-media.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type UnfurlResult = {
  venueName: string;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  thumbnail?: string;
  source: 'instagram' | 'tiktok' | 'youtube' | 'airbnb' | 'gmaps' | 'url' | 'text' | 'vision';
  sourceUrl?: string;
  ocr_text?: string;
  confidence?: 'high' | 'medium' | 'low';
};

type Trip = { id: string; title: string; location?: string };

type ReceiveClientProps = {
  url: string;
  text: string;
  media: string;
  error: string;
  stash?: string;
};

type Stage =
  | { kind: 'resolving' }
  | { kind: 'need-media-app' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'picker'; result: UnfurlResult }
  | { kind: 'saving' }
  | { kind: 'saved'; tripUrl: string };

export default function ReceiveClient({ url, text, media, error, stash }: ReceiveClientProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(() => {
    if (error === 'empty') return { kind: 'empty' };
    if (media === 'unsupported') return { kind: 'need-media-app' };
    return { kind: 'resolving' };
  });
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>('new');
  const [tripsLoading, setTripsLoading] = useState(true);

  const payload = useMemo(() => {
    if (url) return { source: 'url' as const, payload: url };
    if (text) return { source: 'text' as const, payload: text };
    return null;
  }, [url, text]);

  useEffect(() => {
    if (stage.kind !== 'resolving') return;

    // Path 1: Android media flow already resolved the venue via
    // /api/share/analyze-media; the bridge stashed the UnfurlResult
    // in sessionStorage under `stash`. Consume + delete.
    if (stash) {
      try {
        const raw = sessionStorage.getItem(stash);
        if (raw) {
          sessionStorage.removeItem(stash);
          const result = JSON.parse(raw) as UnfurlResult;
          if (!result.venueName) {
            setStage({ kind: 'error', message: 'Couldn’t identify a place from that image.' });
            return;
          }
          setStage({ kind: 'picker', result });
          return;
        }
      } catch {
        // Fall through to error case below
      }
      setStage({ kind: 'error', message: 'Share expired — please try sharing again.' });
      return;
    }

    // Path 2: URL / text — call share-unfurl.
    if (!payload) {
      setStage({ kind: 'empty' });
      return;
    }
    void (async () => {
      try {
        const res = await fetch('/api/share-unfurl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setStage({ kind: 'error', message: j.error ?? `Unfurl failed (${res.status})` });
          return;
        }
        const j = (await res.json()) as UnfurlResult;
        if (!j.venueName) {
          setStage({ kind: 'error', message: 'Couldn’t identify a place from that link.' });
          return;
        }
        setStage({ kind: 'picker', result: j });
      } catch (e) {
        setStage({ kind: 'error', message: e instanceof Error ? e.message : 'Network error' });
      }
    })();
  }, [payload, stage.kind, stash]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/trips', { credentials: 'include' });
        if (res.ok) {
          const j = (await res.json()) as { trips?: Trip[] };
          setTrips(j.trips ?? []);
        }
      } finally {
        setTripsLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    if (stage.kind !== 'picker') return;
    const r = stage.result;
    setStage({ kind: 'saving' });
    try {
      const res = await fetch('/api/trips/add-from-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tripId: selectedTripId,
          venueName: r.venueName,
          city: r.city,
          country: r.country,
          lat: r.lat,
          lon: r.lon,
          source: r.source,
          sourceUrl: r.sourceUrl,
          thumbnail: r.thumbnail,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setStage({ kind: 'error', message: j.error ?? `Save failed (${res.status})` });
        return;
      }
      const j = (await res.json()) as { tripUrl?: string };
      const tripUrl = j.tripUrl ?? '/plan';
      setStage({ kind: 'saved', tripUrl });
      // Small delay so the user sees the confirmation
      setTimeout(() => router.push(tripUrl), 700);
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : 'Network error' });
    }
  }

  return (
    <main
      style={{
        minHeight: '100svh',
        background: 'var(--bg, #0a0a1f)',
        color: 'var(--fg, #f5f1e8)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 24px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={pillBtnStyle}
            aria-label="Close"
          >
            &larr; Back
          </button>
          <span style={{ opacity: 0.6, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Save to trip
          </span>
        </div>

        {stage.kind === 'resolving' && (
          <StatusCard title="Reading the share…" subtitle="geknee is looking up the place." />
        )}

        {stage.kind === 'empty' && (
          <StatusCard title="Nothing to save" subtitle="The share came through without a URL, text, or image we can use." />
        )}

        {stage.kind === 'need-media-app' && (
          <StatusCard
            title="Install the app to save images"
            subtitle="Web share of photos + videos needs the geknee iOS or Android app for vision analysis. On mobile, install from the App Store or Google Play."
            action={<a href="/download" style={ctaStyle}>Get the app</a>}
          />
        )}

        {stage.kind === 'error' && (
          <StatusCard title="Couldn’t save" subtitle={stage.message} action={<button onClick={() => router.back()} style={ctaStyle}>Try again</button>} />
        )}

        {stage.kind === 'picker' && (
          <VenueCard
            result={stage.result}
            trips={trips}
            tripsLoading={tripsLoading}
            selectedTripId={selectedTripId}
            onSelectTrip={setSelectedTripId}
            onSave={handleSave}
          />
        )}

        {stage.kind === 'saving' && (
          <StatusCard title="Adding to your itinerary…" subtitle="One second." />
        )}

        {stage.kind === 'saved' && (
          <StatusCard
            title="Saved ✓"
            subtitle="Opening your trip…"
          />
        )}
      </div>
    </main>
  );
}

function StatusCard({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <h1 style={{ fontFamily: '"Iowan Old Style", Palatino, Georgia, serif', fontSize: 24, margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
      <p style={{ margin: 0, opacity: 0.75, lineHeight: 1.5, fontSize: 14 }}>{subtitle}</p>
      {action}
    </div>
  );
}

function VenueCard({
  result,
  trips,
  tripsLoading,
  selectedTripId,
  onSelectTrip,
  onSave,
}: {
  result: UnfurlResult;
  trips: Trip[];
  tripsLoading: boolean;
  selectedTripId: string;
  onSelectTrip: (id: string) => void;
  onSave: () => void;
}) {
  const displayLocation = [result.city, result.country].filter(Boolean).join(', ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {result.thumbnail && (
          <div style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '16 / 9', background: 'rgba(0,0,0,0.35)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.thumbnail} alt={result.venueName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        <div>
          <div style={{ opacity: 0.55, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
            From {result.source}
          </div>
          <h1
            style={{
              fontFamily: '"Iowan Old Style", Palatino, Georgia, serif',
              fontSize: 26,
              margin: 0,
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
            }}
          >
            {result.venueName}
          </h1>
          {displayLocation && (
            <div style={{ opacity: 0.7, marginTop: 4, fontSize: 14 }}>{displayLocation}</div>
          )}
        </div>
      </div>

      <div
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          padding: 16,
        }}
      >
        <label
          style={{
            display: 'block',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            opacity: 0.6,
            marginBottom: 10,
          }}
          htmlFor="trip-picker"
        >
          Add to which trip?
        </label>
        <select
          id="trip-picker"
          value={selectedTripId}
          onChange={(e) => onSelectTrip(e.target.value)}
          disabled={tripsLoading}
          style={{
            width: '100%',
            padding: '12px 14px',
            fontSize: 15,
            background: 'rgba(0,0,0,0.35)',
            color: 'inherit',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 10,
            minHeight: 48,
          }}
        >
          <option value="new">+ New trip</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
              {t.location ? ` — ${t.location}` : ''}
            </option>
          ))}
        </select>
      </div>

      <button onClick={onSave} style={{ ...ctaStyle, minHeight: 52, fontSize: 16 }}>
        Add to itinerary
      </button>
    </div>
  );
}

const pillBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.2)',
  color: 'inherit',
  fontSize: 13,
  padding: '8px 12px',
  borderRadius: 999,
  cursor: 'pointer',
  minHeight: 36,
};

const ctaStyle: React.CSSProperties = {
  background: '#7c93ff',
  color: '#0a0a1f',
  border: 'none',
  padding: '14px 20px',
  borderRadius: 12,
  fontWeight: 600,
  fontSize: 15,
  cursor: 'pointer',
  textAlign: 'center' as const,
  textDecoration: 'none',
  display: 'inline-block',
  width: '100%',
};
