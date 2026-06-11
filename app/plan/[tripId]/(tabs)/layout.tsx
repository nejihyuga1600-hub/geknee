'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { NextStepHint } from './NextStepHint';
import BackButton from '@/app/components/BackButton';

const InviteFriendsPill = dynamic(() => import('./InviteFriendsPill'), { ssr: false });
const TripChatDock = dynamic(() => import('./TripChatDock'), { ssr: false });

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
    // Single-word tab labels per UI-skill nav guidance — the prior
    // "Planning / Itinerary" was one tab doing two jobs; the slash read as
    // a separator and confused tap targets. Pick the user-facing noun
    // (Itinerary) and let the planning sub-routes live under it.
    { href: `/plan/${tripId}/planning`,  label: 'Itinerary' },
    { href: `/plan/${tripId}/booking`,   label: 'Booking' },
    { href: `/plan/${tripId}/vault`,     label: 'Vault' },
  ];

  return (
    // Hard lockdown on horizontal scroll for the body. overflowX: hidden +
    // maxWidth: 100vw guard against any descendant that ignores the
    // constraint. touchAction is pan-y ONLY (no pinch-zoom) per user
    // request: when the keyboard opens, iOS auto-zoom was leaving the
    // page in a partially-zoomed state with no clean way out. All
    // text inputs on this page are now 16 px+ so iOS won't auto-zoom
    // on focus, and pinch-zoom is fully blocked at the page level so
    // accidental two-finger gestures can't strand the layout either.
    <div style={{
      minHeight: '100svh', background: '#0a0f1e', color: '#f1f5f9',
      overflowX: 'hidden', maxWidth: '100vw',
      touchAction: 'pan-y',
      // Prevents content from getting hidden behind the new bottom chat dock.
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
    }}>
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
          // Right padding reserves a corridor for the top-right AI mascot
          // (52px + 14px inset) so the Vault tab doesn't tuck under it.
          padding: 'calc(env(safe-area-inset-top) + 0px) 78px 0 16px',
          minHeight: 'calc(env(safe-area-inset-top) + 56px)',
          height: 'auto',
          alignItems: 'center',
          background: 'rgba(10, 15, 30, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          // The tab labels are mono-tracked and the row also carries Back +
          // Invite pills — on phone widths this combo overflows. Allow the
          // nav itself to scroll horizontally so the user can swipe to reach
          // hidden tabs. Hide the scrollbar to keep the chrome calm.
          overflowX: 'auto',
          overflowY: 'hidden',
          whiteSpace: 'nowrap',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
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
        {/* Tabs — flex naturally to their content width inside the nav's
            horizontal scroller (no flex: 1; that previously stretched them
            to fill viewport, fighting the scroll). flexShrink: 0 stops the
            row from collapsing labels when the nav overflows. */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'center', height: '100%', flexShrink: 0 }}>
        {tabs.map(t => {
          const active = pathname === t.href || (pathname && pathname.startsWith(t.href + '/'));
          return (
            <Link
              key={t.href}
              href={t.href}
              prefetch
              aria-current={active ? 'page' : undefined}
              style={{
                // Tighter type per skill §6 (letter-spacing 0.18em was way
                // outside the recommended body range — caused the iPhone
                // overflow that forced the horizontal scroller below).
                // 0.08em keeps the mono-uppercase feel without spreading
                // each tab to 200+ pixels.
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                height: 'auto',
                padding: '6px 12px',
                borderRadius: 999,
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: active ? '#e0f2fe' : 'rgba(255, 255, 255, 0.55)',
                background: active ? 'rgba(56, 189, 248, 0.14)' : 'transparent',
                border: `1px solid ${active ? 'rgba(56, 189, 248, 0.45)' : 'transparent'}`,
                WebkitBackdropFilter: active ? 'blur(20px) saturate(180%)' : undefined,
                backdropFilter: active ? 'blur(20px) saturate(180%)' : undefined,
                boxShadow: active
                  ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px rgba(56,189,248,0.20)'
                  : undefined,
                textDecoration: 'none',
                transition: 'color 180ms ease, background 180ms ease',
              }}
            >
              {t.label}
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
      {/* Bottom group-chat dock — always visible per user spec, glass
          surface, tap to open the full TripSocialPanel. paddingBottom on
          the page wrapper above already reserves space so content never
          sits behind it. */}
      <TripChatDock tripId={tripId} />
    </div>
  );
}
