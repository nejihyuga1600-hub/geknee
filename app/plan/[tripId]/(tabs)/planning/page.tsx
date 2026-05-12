'use client';

import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

// Lazy-load the heavy SummaryView (~1,700 lines). RecommendationsRail
// is now mounted INSIDE SummaryView's pin-panel as a "Recs" sub-tab —
// see the panel-tab block in SummaryView.tsx. Keeps the page top clean
// and lets rec clicks interact with the map control ref the panel owns.
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
