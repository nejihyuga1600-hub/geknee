'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { RecommendationsRail } from './RecommendationsRail';

// Same SummaryView the itinerary tab uses, but mounted with
// initialMainTab='planning' so the user lands on the pin/bookmark
// curation surface with a "Generate Itinerary" CTA — the canonical
// pre-generation step. New trips redirected from /plan/summary land
// here when their DB itinerary is empty.
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

  // Pull just enough trip context for the Recs rail header subtitle.
  // We don't render anything that depends on this until it lands — the
  // rail itself fetches recs server-side from its tripId prop.
  const [destination, setDestination] = useState<string | null>(null);
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetch(`/api/trips/${tripId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.trip) return;
        setDestination(d.trip.location ?? null);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [tripId]);

  return (
    <>
      {/* Recommendations rail — sits above the SummaryView curation surface
          since "discover then plan" is the natural flow for new trips, and
          for trips with an existing itinerary the rail acts as a prompt to
          slot in fresh ideas via the existing /api/itinerary/adjust loop. */}
      {tripId && <RecommendationsRail tripId={tripId} destination={destination} />}

      <SummaryView
        tripIdOverride={tripId}
        initialMainTab="planning"
        autoGenerate={false}
      />
    </>
  );
}
