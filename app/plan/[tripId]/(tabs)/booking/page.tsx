'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { BookTabProps } from '@/app/plan/summary/lib/types';

const BookView = dynamic(() => import('@/app/plan/summary/components/BookView'), { ssr: false });

const MONO = 'var(--font-mono-display), ui-monospace, monospace';
const DISPLAY = 'var(--font-display), Georgia, serif';

// Subset of the TripDraft Prisma model — only the fields BookView needs to
// render. Defined locally so this file doesn't have to import the full
// Prisma types into the client bundle.
interface LoadedTrip {
  id: string;
  location: string | null;
  startDate?: string | null;
  endDate?: string | null;
  nights?: number | null;
  style?: string | null;
  itinerary?: string | null;
}

export default function BookingTabPage() {
  const params = useParams();
  const tripId = (params?.tripId as string) ?? '';
  const [trip, setTrip] = useState<LoadedTrip | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetch(`/api/trips/${encodeURIComponent(tripId)}`)
      .then(r => {
        if (r.status === 401) throw new Error('Sign in required to load this trip.');
        if (r.status === 404) throw new Error("Couldn't find that trip.");
        if (!r.ok) throw new Error(`Failed to load trip (${r.status}).`);
        return r.json();
      })
      .then(d => { if (!cancelled) setTrip(d.trip ?? null); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [tripId]);

  // The TripDraft.style column stores a JSON string of preferences captured
  // during /plan/style — purpose / style / budget / interests / constraints.
  // Parse defensively because legacy rows may be plain strings.
  const stylePrefs = useMemo<Record<string, string> | null>(() => {
    if (!trip?.style) return null;
    try {
      const parsed = JSON.parse(trip.style);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
    } catch { /* not JSON */ }
    return { style: trip.style };
  }, [trip]);

  const props = useMemo<BookTabProps | null>(() => {
    if (!trip) return null;
    return {
      location:      trip.location ?? '',
      purpose:       stylePrefs?.purpose ?? '',
      style:         stylePrefs?.style ?? '',
      budget:        stylePrefs?.budget ?? '',
      interests:     stylePrefs?.interests ?? '',
      startDate:     trip.startDate ?? '',
      endDate:       trip.endDate ?? '',
      nights:        trip.nights ? String(trip.nights) : '',
      fullItinerary: trip.itinerary ?? undefined,
      tripId,
    };
  }, [trip, stylePrefs, tripId]);

  if (error) {
    return (
      <div style={{ padding: '48px 32px', maxWidth: 880, margin: '0 auto', fontFamily: DISPLAY }}>
        <p style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: '#f87171', fontWeight: 600, margin: 0,
        }}>
          § Trip not loaded
        </p>
        <h1 style={{ fontSize: 28, lineHeight: 1.15, margin: '12px 0 12px', fontWeight: 400 }}>
          {error}
        </h1>
        <p style={{ color: 'rgba(241,245,249,0.6)', fontSize: 14, margin: 0 }}>
          Trip id: <span style={{ fontFamily: MONO, fontSize: 12 }}>{tripId || '(missing)'}</span>
        </p>
      </div>
    );
  }

  if (!props) {
    return (
      <div style={{
        padding: '48px 32px', color: 'rgba(241,245,249,0.55)',
        fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
      }}>
        Loading trip…
      </div>
    );
  }

  return <BookView {...props} />;
}
