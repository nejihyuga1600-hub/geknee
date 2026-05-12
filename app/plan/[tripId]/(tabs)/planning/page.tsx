'use client';

import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

// Photo attacher now lives inline in SummaryView's header row as a
// compact pill (see PhotoToItinerary compact mode). No top-of-page strip
// here — keeps the planning surface tight.
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
  return (
    <SummaryView
      tripIdOverride={tripId}
      initialMainTab="planning"
      autoGenerate={false}
    />
  );
}
