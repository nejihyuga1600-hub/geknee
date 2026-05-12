'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { PhotoToItinerary } from '../itinerary/PhotoToItinerary';

const SummaryView = dynamic(
  () => import('@/app/plan/summary/SummaryView'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          padding: '48px 32px',
          color: 'rgba(241,245,249,0.55)',
          fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        Loading planning surface…
      </div>
    ),
  }
);

export default function PlanningTabPage() {
  const params = useParams();
  const tripId = (params?.tripId as string) ?? '';

  // Surface PhotoToItinerary on Planning too — but only when an itinerary
  // already exists. Pre-generation, photo→activity has nowhere to land.
  const [dayCount, setDayCount] = useState<number>(0);
  const [hasItinerary, setHasItinerary] = useState<boolean>(false);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetch(`/api/trips/${tripId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { trip?: { itinerary?: string | null; nights?: number | null } } | null) => {
        if (cancelled || !d?.trip) return;
        if (typeof d.trip.nights === 'number') setDayCount(d.trip.nights + 1);
        setHasItinerary(typeof d.trip.itinerary === 'string' && d.trip.itinerary.trim().length > 0);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [tripId]);

  return (
    <>
      {tripId && hasItinerary && dayCount > 0 && (
        <PhotoToItinerary tripId={tripId} dayCount={dayCount} />
      )}

      <SummaryView
        tripIdOverride={tripId}
        initialMainTab="planning"
        autoGenerate={false}
      />
    </>
  );
}
