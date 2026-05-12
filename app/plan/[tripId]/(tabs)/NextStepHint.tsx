'use client';
// Context-aware "next step" chip that sits at the bottom of every trip tab.
// Reads the current pathname + the trip's state (does it have an itinerary,
// bookings, vault files) and suggests the most useful next tab.
//
// Why this exists: each tab — Planning / Itinerary / Booking / Vault — is
// self-contained, but the natural flow between them isn't always discoverable.
// A user who just generated an itinerary often wants to book stays next;
// users who finish booking want to verify their day plan; users in the vault
// often want to see the trip live. This component closes those loops.
//
// Visually low-key: a small mono-label band, not a full bar. Hides itself
// when the suggestion would be redundant (e.g. user is already on the
// suggested tab, or the trip lacks the data to warrant the suggestion).

import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface TripSnapshot {
  hasItinerary: boolean;
  hasBookings: boolean;
  hasFiles: boolean;
  isInTripWindow: boolean;
  bookmarkCount?: number;
}

export function NextStepHint() {
  const pathname = usePathname() ?? '';
  const params = useParams();
  const tripId = (params?.tripId as string) ?? '';
  const [snap, setSnap] = useState<TripSnapshot | null>(null);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetch(`/api/trips/${tripId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { trip?: { itinerary?: string | null; startDate?: string | null; endDate?: string | null } } | null) => {
        if (cancelled || !d?.trip) return;
        const today = new Date().toISOString().slice(0, 10);
        setSnap({
          hasItinerary: typeof d.trip.itinerary === 'string' && d.trip.itinerary.trim().length > 0,
          hasBookings: false,  // TODO: wire from prisma when Booking model count is exposed
          hasFiles: false,     // TODO: wire from TripFile count when exposed
          isInTripWindow:
            !!(d.trip.startDate && d.trip.endDate && today >= d.trip.startDate && today <= d.trip.endDate),
        });
      })
      .catch(() => { /* silent — hint just won't render */ });
    return () => { cancelled = true; };
  }, [tripId]);

  if (!tripId || !snap) return null;

  const onPlanning  = pathname.endsWith('/planning');
  const onItinerary = pathname.endsWith('/itinerary');
  const onBooking   = pathname.endsWith('/booking');
  const onVault     = pathname.endsWith('/vault');

  // Pick the next-step suggestion. Priority order:
  //   1. Trip is happening NOW → live page is the strongest call
  //   2. On Planning + no itinerary → keep them on Planning (no hint needed)
  //   3. On Planning + has itinerary → Itinerary
  //   4. On Itinerary → Booking
  //   5. On Booking → Vault
  //   6. On Vault → Live (when in window) or Itinerary
  let hint: { href: string; label: string; sub: string } | null = null;

  if (snap.isInTripWindow && !pathname.includes('/trip/')) {
    hint = {
      href: `/trip/${tripId}/live`,
      label: '🟢 Trip is live — open today\'s plan',
      sub: 'Day-on-rails + map open in the live view',
    };
  } else if (onPlanning && snap.hasItinerary) {
    hint = {
      href: `/plan/${tripId}/itinerary`,
      label: 'See the day plan →',
      sub: 'Your itinerary is ready — review it before booking',
    };
  } else if (onItinerary && snap.hasItinerary) {
    hint = {
      href: `/plan/${tripId}/booking`,
      label: 'Book stays + flights →',
      sub: 'Lock in hotels and transit to anchor the days',
    };
  } else if (onBooking) {
    hint = {
      href: `/plan/${tripId}/itinerary`,
      label: 'Back to itinerary →',
      sub: 'See how the new booking fits into your day plan',
    };
  } else if (onVault) {
    hint = snap.isInTripWindow
      ? {
          href: `/trip/${tripId}/live`,
          label: 'Open the live trip →',
          sub: 'You\'re in the trip window — passport + tickets ready',
        }
      : {
          href: `/plan/${tripId}/itinerary`,
          label: 'Back to itinerary →',
          sub: 'Make sure your day plan covers the docs you just saved',
        };
  }

  if (!hint) return null;

  return (
    <Link
      href={hint.href}
      prefetch
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 14,
        margin: '40px 16px 24px',
        padding: '14px 18px',
        borderRadius: 14,
        background: 'rgba(167,139,250,0.10)',
        border: '1px solid rgba(167,139,250,0.32)',
        color: 'var(--brand-ink)',
        textDecoration: 'none',
        transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease',
      }}
      className="next-step-hint"
    >
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-mono-display), monospace',
          fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--brand-accent)', fontWeight: 700, marginBottom: 4,
        }}>
          ✦ Next
        </div>
        <div style={{
          fontFamily: 'var(--font-display), Georgia, serif',
          fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em',
          color: 'var(--brand-ink)', marginBottom: 2,
        }}>
          {hint.label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', lineHeight: 1.4 }}>
          {hint.sub}
        </div>
      </div>
      <span aria-hidden style={{
        fontSize: 22, color: 'var(--brand-accent)', flexShrink: 0,
      }}>→</span>

      <style>{`
        .next-step-hint:hover {
          background: rgba(167,139,250,0.16) !important;
          border-color: rgba(167,139,250,0.48) !important;
          transform: translateY(-1px);
        }
        .next-step-hint:focus-visible {
          outline: 2px solid var(--brand-accent);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .next-step-hint { transition: none !important; }
          .next-step-hint:hover { transform: none !important; }
        }
      `}</style>
    </Link>
  );
}
