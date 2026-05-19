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

const TripSocialPanel = dynamic(
  () => import('@/app/components/TripSocialPanel'),
  { ssr: false }
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

  // Group chat panel — accessible from itinerary, not only from the globe.
  const [chatOpen, setChatOpen] = useState(false);
  const [tripDestination, setTripDestination] = useState<string>('');

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;

    async function loadTrip() {
      try {
        const r = await fetch(`/api/trips/${tripId}`);
        if (!r.ok) return;
        const d: { trip?: { startDate?: string | null; endDate?: string | null; nights?: number | null; userId?: string | null; suggestionVoteMode?: string | null; destination?: string | null; location?: string | null } } = await r.json();
        if (cancelled || !d?.trip) return;
        const { startDate, endDate, nights } = d.trip;
        if (typeof nights === 'number') {
          setDayCount(nights + 1);
        }
        setTripOwnerUserId(d.trip.userId ?? null);
        setTripVoteMode(d.trip.suggestionVoteMode === 'auto_majority' ? 'auto_majority' : 'advisory');
        setTripDestination(d.trip.destination ?? d.trip.location ?? '');
        if (startDate && endDate) {
          const today = new Date().toISOString().slice(0, 10);
          if (today >= startDate && today <= endDate) {
            router.replace(`/trip/${tripId}/live`);
          }
        }
      } catch { /* ignore */ }
    }

    loadTrip();

    // Refresh when the tab regains focus or visibility flips — lets members see
    // edits made by other collaborators (applied suggestions, notes, etc.) without
    // requiring a hard reload.
    const onFocus = () => { if (document.visibilityState === 'visible') loadTrip(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
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

      {currentUserId && tripId && (
        <>
          <button
            onClick={() => setChatOpen(true)}
            aria-label="Open group chat"
            title="Group chat"
            style={{
              position: 'fixed',
              right: 20,
              bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
              width: 52,
              height: 52,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.14)',
              background:
                'linear-gradient(135deg, var(--brand-accent, #a78bfa), var(--brand-accent-2, #7dd3fc))',
              color: '#0a0a1f',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
              zIndex: 60,
              padding: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <TripSocialPanel
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            currentLocation={tripDestination}
          />
        </>
      )}
    </>
  );
}
