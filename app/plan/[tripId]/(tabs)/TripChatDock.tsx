'use client';
// Persistent glass bottom dock that surfaces the group chat on every trip
// detail page. Always visible (composer + last-message preview), tap to
// open the full TripSocialPanel chat. Pull up to expand to fullscreen
// (TripSocialPanel handles its own modal layering).
//
// Per the user spec: "glass like group chat at the bottom of the screen
// where they can pull up to fit the whole screen if they wanted to
// interact with the group chat more". Per the ui-skill: bottom-sheet
// pattern for mobile chat, glass surface for chrome consistency, leave
// the AI mascot fixed bottom-right at zIndex above this dock.

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

function SendArrow({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

const TripSocialPanel = dynamic(() => import('@/app/components/TripSocialPanel'), { ssr: false });

interface Props {
  tripId: string;
  // Optional context — if we know the trip's destination we can render it
  // as the chat title instead of the generic "Trip chat".
  destination?: string | null;
}

interface MessagePreview {
  authorName: string;
  body: string;
  ts: string;
}

export default function TripChatDock({ tripId, destination }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<MessagePreview | null>(null);

  // Light poll of the most recent message so the dock can preview "Who said
  // what" without opening the full panel. 20s is fine for an idle dock —
  // users who want fresh updates will tap to open the live panel.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/trip-messages?tripId=${tripId}`);
        if (!r.ok) return;
        const data = await r.json() as { messages?: Array<{ authorName?: string; body: string; createdAt: string }> };
        const last = data.messages?.[data.messages.length - 1];
        if (!cancelled && last) {
          setPreview({ authorName: last.authorName ?? 'Someone', body: last.body, ts: last.createdAt });
        }
      } catch {}
    };
    load();
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 20_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [tripId]);

  const openChat = () => setOpen(true);

  const submitDraft = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // We don't post directly from the dock — opening the panel lets the
    // user see their message in context. Pass the draft via a custom event
    // so the panel can seed its composer (kept loose so the panel stays
    // simple to evolve independently of this dock).
    if (draft.trim()) {
      window.dispatchEvent(new CustomEvent('geknee:trip-chat-seed', { detail: { text: draft } }));
    }
    setDraft('');
    setOpen(true);
  };

  const titleText = destination ? `${destination} group chat` : 'Trip group chat';

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openChat}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openChat(); }}
        aria-label={`Open ${titleText}`}
        style={{
          position: 'fixed',
          left: 12, right: 12,
          // Sits above the iOS home indicator and any safe-area inset.
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          // Leaves room for the AI mascot floating at bottom-right (zIndex
          // 9500) without overlapping it. Mascot stays the dominant
          // floating affordance, dock is the contextual one.
          zIndex: 9400,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px 10px 14px',
          paddingRight: 86,
          borderRadius: 24,
          background: 'rgba(14, 16, 32, 0.45)',
          border: '1px solid rgba(255,255,255,0.18)',
          WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          backdropFilter: 'blur(28px) saturate(200%)',
          boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.18), 0 12px 36px rgba(0,0,0,0.50)',
          cursor: 'pointer',
          transform: 'translate3d(0,0,0)',
          willChange: 'transform',
        }}
      >
        {/* Avatar cluster placeholder — kept light to avoid pulling extra
            avatar data on every trip page. The TripSocialPanel handles
            rich member rendering once the user taps in. */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #a78bfa, #7dd3fc)',
          color: '#0a0f1e', fontSize: 14, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontFamily: 'var(--font-mono-display, monospace)',
        }} aria-hidden>
          {String.fromCodePoint(0x1F4AC)}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: 'rgba(255,255,255,0.92)',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {titleText}
          </span>
          <span style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.62)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {preview
              ? `${preview.authorName}: ${preview.body}`
              : 'Tap to message your trip'}
          </span>
        </div>
        <form
          onSubmit={submitDraft}
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={openChat}
            placeholder="Quick reply"
            aria-label="Quick reply"
            style={{
              width: 130, padding: '6px 10px',
              borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--brand-ink, #f1f5f9)', fontSize: 12,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Open chat"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: '50%',
              background: draft.trim() ? '#a78bfa' : 'rgba(255,255,255,0.10)',
              color: draft.trim() ? '#0a0f1e' : 'rgba(255,255,255,0.45)',
              border: 'none', cursor: draft.trim() ? 'pointer' : 'default',
              padding: 0,
              transition: 'background 150ms ease',
            }}
          >
            <SendArrow size={14} />
          </button>
        </form>
      </div>
      {open && (
        <TripSocialPanel
          open={open}
          onClose={() => setOpen(false)}
          currentLocation={destination ?? ''}
        />
      )}
    </>
  );
}
