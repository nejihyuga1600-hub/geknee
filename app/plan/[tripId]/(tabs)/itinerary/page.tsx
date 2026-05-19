'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { PhotoToItinerary } from './PhotoToItinerary';
import SuggestionsSection from '@/app/components/SuggestionsSection';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';

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
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

  // tripOwner/voteMode for SuggestionsSection
  const [tripOwnerUserId, setTripOwnerUserId] = useState<string | null>(null);
  const [tripVoteMode, setTripVoteMode] = useState<'advisory' | 'auto_majority'>('advisory');

  // Day count drives the PhotoToItinerary dropdown. Pulled once on mount.
  const [dayCount, setDayCount] = useState<number>(0);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetch(`/api/trips/${tripId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { trip?: { startDate?: string | null; endDate?: string | null; nights?: number | null; userId?: string | null; suggestionVoteMode?: string | null } } | null) => {
        if (cancelled || !d?.trip) return;
        const { startDate, endDate, nights } = d.trip;
        if (typeof nights === 'number') {
          setDayCount(nights + 1);
        }
        setTripOwnerUserId(d.trip.userId ?? null);
        setTripVoteMode(d.trip.suggestionVoteMode === 'auto_majority' ? 'auto_majority' : 'advisory');
        if (startDate && endDate) {
          const today = new Date().toISOString().slice(0, 10);
          if (today >= startDate && today <= endDate) {
            router.replace(`/trip/${tripId}/live`);
          }
        }
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [tripId, router]);

  return (
    <>
      {/* Photo → itinerary attacher. Sits above SummaryView so users see it
          on the same surface that displays the day plan. Only renders once
          we know dayCount so the day dropdown is meaningful. */}
      {tripId && dayCount > 0 && (
        <PhotoToItinerary tripId={tripId} dayCount={dayCount} />
      )}

      {CHAT_SUGGESTIONS_ENABLED && tripId && currentUserId && (
        <SuggestionsSection
          tripId={tripId}
          currentUserId={currentUserId}
          isOwner={tripOwnerUserId === currentUserId}
          voteMode={tripVoteMode}
        />
      )}

      <SummaryView tripIdOverride={tripId} initialMainTab="itinerary" />
    </>
  );
}
