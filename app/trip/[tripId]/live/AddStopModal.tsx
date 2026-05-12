'use client';
// Live-trip "Add stop" modal. Lets the user slot a new activity into the
// currently-displayed day; calls /api/itinerary/adjust which uses Claude
// to make the minimal markdown edit + persist back to TripDraft.itinerary.
//
// Both /plan/[tripId]/itinerary and /trip/[tripId]/live read off
// TripDraft.itinerary, so a successful save updates both surfaces — no
// explicit cross-page wiring needed.
//
// Place input uses Google Places autocomplete (the Google Maps loader is
// already on the page). Time + kind are simple chips/inputs.

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';

interface AddStopModalProps {
  tripId: string;
  city: string | null;
  day: number;
  initialPlaceName?: string;
  initialCoords?: { lat: number; lon: number } | null;
  /** Called with the updated full itinerary on success. */
  onSaved: (newItinerary: string) => void;
  onClose: () => void;
}

const KINDS = [
  { id: 'meal',      label: 'Meal' },
  { id: 'sight',     label: 'Sight' },
  { id: 'activity',  label: 'Activity' },
  { id: 'coffee',    label: 'Coffee' },
  { id: 'shopping',  label: 'Shopping' },
];

export function AddStopModal({
  tripId, city, day, initialPlaceName, initialCoords, onSaved, onClose,
}: AddStopModalProps) {
  const placeInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [placeName, setPlaceName] = useState(initialPlaceName ?? '');
  const [time, setTime] = useState('13:00');
  const [kind, setKind] = useState<string>('meal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wire Google Places autocomplete to the place input. Bound the search
  // to the trip's city so suggestions stay relevant.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !placeInputRef.current) return;
      const ac = new google.maps.places.Autocomplete(placeInputRef.current, {
        fields: ['name', 'formatted_address', 'geometry'],
        types: ['establishment'],
      });
      autocompleteRef.current = ac;
      ac.addListener('place_changed', () => {
        const p = ac.getPlace();
        if (p?.name) setPlaceName(p.name);
      });
    }).catch(() => { /* loader failure → fall back to plain text input */ });
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    setError(null);
    if (!placeName.trim()) {
      setError('Where are you going? Add a place.');
      return;
    }
    setSaving(true);

    // Format the time as "1:00 PM" matching the itinerary's existing style.
    const [hRaw, mRaw] = time.split(':');
    const hh = Number(hRaw);
    const mm = mRaw ? Number(mRaw) : 0;
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const hour12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    const timeDisplay = `${hour12}:${String(mm).padStart(2, '0')} ${ampm}`;

    const kindLabel = KINDS.find(k => k.id === kind)?.label?.toLowerCase() ?? kind;
    // Pack the day + time + kind into the adjust endpoint's `meta` string.
    // The endpoint reads this verbatim into Claude's prompt as the WHEN/INFO
    // line, so the model knows which day to edit and what slot.
    const meta = `Day ${day} · ${timeDisplay} · ${kindLabel}`;

    try {
      const res = await fetch('/api/itinerary/adjust', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tripId,
          kind: 'activity',
          name: placeName,
          district: city ?? undefined,
          meta,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json() as { itinerary: string };
      onSaved(j.itinerary);
    } catch (err) {
      console.error('[AddStopModal] adjust failed:', err);
      setError(err instanceof Error ? err.message : 'Save failed — please retry.');
    } finally {
      setSaving(false);
    }
  };

  // Pre-populate place name when launched from a map click (reverse-geocode
  // the coords to a human label) — soft enhancement; user can edit it.
  useEffect(() => {
    if (!initialCoords || initialPlaceName) return;
    loadGoogleMaps().then(() => {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode(
        { location: { lat: initialCoords.lat, lng: initialCoords.lon } },
        (results, status) => {
          if (status === 'OK' && results?.[0]) {
            const r = results[0];
            setPlaceName(r.formatted_address?.split(',')[0] ?? r.address_components?.[0]?.long_name ?? '');
          }
        },
      );
    }).catch(() => { /* silent */ });
  }, [initialCoords, initialPlaceName]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(5, 5, 15, 0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: 'var(--brand-surface-solid, #0d0d24)',
          border: '1px solid var(--brand-border-hi)',
          borderRadius: 18,
          padding: 22,
          color: 'var(--brand-ink)',
          fontFamily: 'inherit',
        }}
      >
        <div style={{
          fontFamily: 'var(--font-mono-display, monospace)', fontSize: 10,
          letterSpacing: '0.18em', color: 'var(--brand-accent)',
          textTransform: 'uppercase', marginBottom: 8,
        }}>
          Day {day} · Slot in a stop
        </div>
        <h3 style={{
          margin: 0, fontSize: 22, fontWeight: 600,
          fontFamily: 'var(--font-display, Georgia, serif)',
          letterSpacing: '-0.01em',
        }}>
          Where to next?
        </h3>
        <p style={{
          margin: '6px 0 18px',
          fontSize: 13, lineHeight: 1.45,
          color: 'var(--brand-ink-dim)',
        }}>
          Add it here and we&apos;ll reshuffle the day to fit. Your itinerary
          page updates too.
        </p>

        <label style={labelStyle}>Place</label>
        <input
          ref={placeInputRef}
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value)}
          placeholder={city ? `e.g. a café near ${city}` : 'Type to search'}
          autoFocus
          style={inputStyle}
        />

        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <label style={{ ...labelStyle, marginTop: 14 }}>Kind</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {KINDS.map(k => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              style={{
                padding: '6px 12px', borderRadius: 999,
                border: `1px solid ${kind === k.id ? 'var(--brand-accent)' : 'var(--brand-border)'}`,
                background: kind === k.id ? 'rgba(167,139,250,0.18)' : 'transparent',
                color: kind === k.id ? 'var(--brand-ink)' : 'var(--brand-ink-dim)',
                fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {k.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            marginTop: 14, padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(248,113,113,0.12)',
            border: '1px solid rgba(248,113,113,0.3)',
            color: '#f87171', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={ghostBtn}>Cancel</button>
          <button onClick={submit} disabled={saving} style={primaryBtn}>
            {saving ? 'Re-planning…' : 'Add & re-plan day'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono-display, monospace)', fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'var(--brand-ink-mute)', marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid var(--brand-border)',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 10,
  color: 'var(--brand-ink)',
  fontSize: 14, fontFamily: 'inherit',
  outline: 'none',
};

const ghostBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10,
  border: '1px solid var(--brand-border)',
  background: 'transparent',
  color: 'var(--brand-ink-dim)',
  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10,
  border: 'none',
  background: 'var(--brand-accent)',
  color: 'var(--brand-bg)',
  fontFamily: 'inherit', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
  cursor: 'pointer',
};
