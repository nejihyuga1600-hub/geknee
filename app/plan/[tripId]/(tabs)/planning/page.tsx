'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// Merged Planning / Itinerary tab. Same surface handles both modes:
// pin curation when no itinerary exists, day-plan view once it does.
// Auto-picks the initial sub-tab based on persisted state so users
// don't need to switch manually after generation.
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
  const router = useRouter();
  const tripId = (params?.tripId as string) ?? '';
  const [initial, setInitial] = useState<'planning' | 'itinerary' | null>(null);

  useEffect(() => {
    if (!tripId) { setInitial('planning'); return; }
    let cancelled = false;
    fetch(`/api/trips/${tripId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { trip?: { itinerary?: string | null; startDate?: string | null; endDate?: string | null } } | null) => {
        if (cancelled) return;
        // Auto-route to /live ONLY when the trip already has an itinerary.
        // For a same-day trip with no itinerary, generating is more
        // valuable than dropping the user into an empty live planner.
        const itinerary = d?.trip?.itinerary;
        const startDate = d?.trip?.startDate;
        const endDate = d?.trip?.endDate;
        if (itinerary && startDate && endDate) {
          const today = new Date().toISOString().slice(0, 10);
          if (today >= startDate && today <= endDate) {
            router.replace(`/trip/${tripId}/live`);
            return;
          }
        }
        setInitial(itinerary ? 'itinerary' : 'planning');
      })
      .catch(() => { if (!cancelled) setInitial('planning'); });
    return () => { cancelled = true; };
  }, [tripId, router]);

  if (!initial) {
    return (
      <div style={{
        padding: '48px 32px',
        color: 'rgba(241,245,249,0.55)',
        fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}>
        Loading trip…
      </div>
    );
  }

  return (
    <SummaryView
      tripIdOverride={tripId}
      initialMainTab={initial}
      // Auto-fire AI generation only when the trip has no itinerary yet.
      // Mirrors the user's intent after clicking "Build itinerary ✨" —
      // landing on /planning with an empty trip should kick off the
      // stream, not park them on an empty pin-curate view.
      autoGenerate={initial === 'planning'}
    />
  );
}
