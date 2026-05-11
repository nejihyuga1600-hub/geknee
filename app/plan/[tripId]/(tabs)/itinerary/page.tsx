'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// Lazy-load the heavy summary view (~1,700 lines, dynamic-imports a Map,
// chart, BookView, etc). Renders client-side only — matches how the
// legacy /plan/summary page behaves.
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
        Loading itinerary…
      </div>
    ),
  }
);

export default function ItineraryTabPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = (params?.tripId as string) ?? '';

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetch(`/api/trips/${tripId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { trip?: { startDate?: string | null; endDate?: string | null } } | null) => {
        if (cancelled || !d?.trip) return;
        const { startDate, endDate } = d.trip;
        if (!startDate || !endDate) return;
        const today = new Date().toISOString().slice(0, 10);
        if (today >= startDate && today <= endDate) {
          router.replace(`/trip/${tripId}/live`);
        }
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [tripId, router]);

  return <SummaryView tripIdOverride={tripId} initialMainTab="itinerary" />;
}
