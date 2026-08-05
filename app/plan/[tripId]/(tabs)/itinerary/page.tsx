'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
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
  const searchParams = useSearchParams();
  const tripId = (params?.tripId as string) ?? '';
  // When the user reaches this page via the ITINERARY chip on the live
  // page (which appends ?stay=1), skip the "trip is happening now →
  // redirect to /live" bounce — they explicitly asked to see the AI
  // itinerary instead of the live view.
  const stayOnItinerary = searchParams?.get('stay') === '1';
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

  // tripOwner/voteMode for SuggestionsSection
  const [tripOwnerUserId, setTripOwnerUserId] = useState<string | null>(null);
  const [tripVoteMode, setTripVoteMode] = useState<'advisory' | 'auto_majority'>('advisory');

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
        const { startDate, endDate } = d.trip;
        setTripOwnerUserId(d.trip.userId ?? null);
        setTripVoteMode(d.trip.suggestionVoteMode === 'auto_majority' ? 'auto_majority' : 'advisory');
        setTripDestination(d.trip.destination ?? d.trip.location ?? '');
        if (startDate && endDate && !stayOnItinerary) {
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
  }, [tripId, router, stayOnItinerary]);

  return (
    <>
      {/* "Back to Live" bar — appears only when the user arrived via
          the LIVE page's ITINERARY chip (?stay=1). Without this, the
          heavy SummaryView modal traps users on the itinerary page
          with no obvious way back to the live trip view (user
          feedback 2026-08-04 "keeps on glitching and won't let me
          back out of this map"). */}
      {stayOnItinerary && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 9500,
          padding: 'calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px',
          background: 'rgba(5,5,15,0.95)',
          WebkitBackdropFilter: 'blur(18px)', backdropFilter: 'blur(18px)',
          borderBottom: '1px solid var(--brand-border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Link
            href={`/trip/${tripId}/live`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 999,
              background: 'color-mix(in srgb, var(--brand-accent, #a78bfa) 22%, transparent)',
              border: '1px solid color-mix(in srgb, var(--brand-accent, #a78bfa) 55%, transparent)',
              color: 'var(--brand-ink)', textDecoration: 'none',
              fontFamily: 'var(--font-mono-display, monospace)',
              fontSize: 11, letterSpacing: '0.14em', fontWeight: 700,
            }}
          >
            ← BACK TO LIVE
          </Link>
          <span style={{
            fontFamily: 'var(--font-mono-display, monospace)',
            fontSize: 10, letterSpacing: '0.14em',
            color: 'var(--brand-ink-mute)', textTransform: 'uppercase',
          }}>Original AI Itinerary</span>
        </div>
      )}

      {/* Photo → itinerary attacher moved INSIDE the map drawer in
          SummaryView, docked next to the "Drop a pin to update your
          trip" sync bar. Both controls amend the itinerary from a
          real-world signal, so they belong together — and removing
          this from the top of the itinerary tab gives the day content
          immediate viewport priority. */}

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
          {/* Removed 2026-06-23: 52x52 floating purple→sky gradient chat
              button that sat at bottom-right corner. The TripChatDock at
              the bottom of the page already provides group-chat access,
              so this was a redundant second affordance bleeding out from
              behind the dock. TripSocialPanel stays mounted (closed) so
              the file-vault overlay path can still mount its children
              if invoked from elsewhere. */}
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
