'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { NextStepHint } from './NextStepHint';
import BackButton from '@/app/components/BackButton';

const InviteFriendsPill = dynamic(() => import('./InviteFriendsPill'), { ssr: false });

const MONO = 'var(--font-mono-display), ui-monospace, monospace';

export default function TripTabsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const tripId = (params?.tripId as string) ?? '';

  const tabs = [
    // Planning sits first — it's the pin/curate step users land on for
    // brand-new trips before an itinerary exists. Booking comes second so
    // users can lock down hotels/flights/activities before (or alongside)
    // the day-by-day. Itinerary then renders the day plan around those
    // commitments. Vault holds passports / tickets / bookings for the
    // trip, scoped to this tripId.
    { href: `/plan/${tripId}/planning`,  label: 'Planning / Itinerary' },
    { href: `/plan/${tripId}/booking`,   label: 'Booking' },
    { href: `/plan/${tripId}/vault`,     label: 'Vault' },
  ];

  return (
    <div style={{ minHeight: '100svh', background: '#0a0f1e', color: '#f1f5f9' }}>
      <nav
        aria-label="Trip sections"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          gap: 18,
          // Push the nav row BELOW the iOS Dynamic Island / status bar.
          // The background extends INTO the safe area (paddingTop fills
          // it with the same blurred-dark surface) so we don't see the
          // body underneath. User feedback 2026-06-05: title + buttons
          // were colliding with the iPhone 15 Pro front camera island.
          padding: 'calc(env(safe-area-inset-top) + 0px) 18px 0 16px',
          minHeight: 'calc(env(safe-area-inset-top) + 56px)',
          height: 'auto',
          alignItems: 'center',
          background: 'rgba(10, 15, 30, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {/* Shared BackButton — same visual + touch target as every other
            back affordance in the app. Routes back to the globe home. */}
        <BackButton href="/plan/location" label="Back to globe" />
        {/* Invite-friends pill — persistent across planning / booking /
            itinerary / vault so the owner can pull collaborators in
            without detouring through the chat panel. Pops an inline
            email/username composer; lists current members. */}
        <InviteFriendsPill />
        {/* Tabs centered between the back pill and the globe home icon. */}
        <div style={{ display: 'flex', gap: 28, flex: 1, alignItems: 'center', height: '100%' }}>
        {tabs.map(t => {
          const active = pathname === t.href || (pathname && pathname.startsWith(t.href + '/'));
          return (
            <Link
              key={t.href}
              href={t.href}
              prefetch
              aria-current={active ? 'page' : undefined}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                height: '100%',
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: active ? 'var(--brand-accent, #38bdf8)' : 'rgba(255, 255, 255, 0.5)',
                textDecoration: 'none',
                transition: 'color 180ms ease',
              }}
            >
              {t.label}
              {active && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: -1,
                    height: 2,
                    background: 'var(--brand-accent, #38bdf8)',
                    borderRadius: 2,
                  }}
                />
              )}
            </Link>
          );
        })}
        </div>
      </nav>
      <main>
        {children}
        {/* Context-aware next-step nudge. Reads the current tab + trip
            state and surfaces the natural next surface (e.g. Itinerary
            → Booking, Vault → Live). Hides when no useful suggestion. */}
        <NextStepHint />
      </main>
    </div>
  );
}
