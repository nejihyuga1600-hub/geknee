'use client';
// Persistent glass bottom dock that surfaces the group chat on every trip
// detail page. Collapsed: shows the latest message preview, unread count,
// and a vote-pending badge when there are itinerary suggestions waiting on
// the user. Expanded: opens the full TripSocialPanel modal.
//
// Gesture model per user spec:
//   - Swipe UP on the dock (>= 50px) → opens the panel.
//   - Tap anywhere on the pill body → opens the panel.
//   - Drag handle at the top doubles as a visual swipe affordance.
//   - Swipe DOWN (collapse) is handled by TripSocialPanel's own dismiss.
//
// Unread tracking is local-only: localStorage stores the highest-seen
// message id per tripId; anything newer counts as unread. Cleared when the
// user opens the panel.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  destination?: string | null;
}

interface ChatMessage {
  id: string;
  author: string;
  content: string;
  timestamp: number;
}

const LAST_SEEN_KEY = (tripId: string) => `geknee:trip-chat-lastseen:${tripId}`;

export default function TripChatDock({ tripId, destination }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);

  // Drag state — translateY follows the finger upward while the user is
  // pulling the dock up. Snaps back on release unless they cross the
  // 50px threshold, in which case we open the panel.
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    try { setLastSeen(localStorage.getItem(LAST_SEEN_KEY(tripId))); } catch {}
  }, [tripId]);

  const loadMessages = useCallback(async () => {
    try {
      const r = await fetch(`/api/trip-messages?tripId=${tripId}`);
      if (!r.ok) return;
      const d = await r.json() as { messages?: ChatMessage[] };
      if (d.messages) setMessages(d.messages);
    } catch {}
  }, [tripId]);

  const loadSuggestions = useCallback(async () => {
    try {
      const r = await fetch(`/api/trips/${tripId}/suggestions`);
      if (!r.ok) return;
      const d = await r.json() as { suggestions?: Array<{ id: string }> };
      setPendingSuggestions(d.suggestions?.length ?? 0);
    } catch {}
  }, [tripId]);

  useEffect(() => {
    loadMessages();
    loadSuggestions();
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadMessages();
      loadSuggestions();
    }, 20_000);
    return () => clearInterval(iv);
  }, [loadMessages, loadSuggestions]);

  // Compute unread by walking back from the newest message and counting
  // entries whose id post-dates lastSeen. When lastSeen is null (first
  // visit) treat all messages as read so the user isn't ambushed by a
  // huge red badge on initial render — the dock will start tracking from
  // the first viewing.
  const unreadCount = (() => {
    if (!messages.length) return 0;
    const lastId = messages[messages.length - 1].id;
    if (!lastSeen) return 0;
    if (lastSeen === lastId) return 0;
    // Find lastSeen index from the end; count messages after it.
    let count = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].id === lastSeen) break;
      count++;
    }
    return count;
  })();

  const latest = messages[messages.length - 1];

  const openChat = useCallback(() => {
    setOpen(true);
    // Mark all current messages read.
    if (latest) {
      try { localStorage.setItem(LAST_SEEN_KEY(tripId), latest.id); } catch {}
      setLastSeen(latest.id);
    }
  }, [latest, tripId]);

  const submitDraft = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (draft.trim()) {
      window.dispatchEvent(new CustomEvent('geknee:trip-chat-seed', { detail: { text: draft } }));
    }
    setDraft('');
    openChat();
  };

  // Touch handlers — only attached to the pill BODY (not the input or
  // send button) so the quick-reply UX isn't hijacked.
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy < 0) {
      // Resist with sqrt curve so the pill feels "weighty" — opens fully
      // around 50px of pull which kicks in at touchEnd.
      setDragY(-Math.min(80, Math.sqrt(-dy) * 8));
    }
  };
  const onTouchEnd = () => {
    const dy = dragY;
    setDragY(0);
    dragStartY.current = null;
    if (dy < -30) openChat();
  };

  const titleText = destination ? `${destination} chat` : 'Trip chat';

  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: 12, right: 12,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          zIndex: 9400,
          transform: `translate3d(0, ${dragY}px, 0)`,
          willChange: 'transform',
          transition: dragStartY.current === null ? 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none',
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={openChat}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openChat(); }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-label={`Open ${titleText} — ${unreadCount} unread`}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px 10px 14px',
            borderRadius: 24,
            background: 'rgba(14, 16, 32, 0.45)',
            border: '1px solid rgba(255,255,255,0.18)',
            WebkitBackdropFilter: 'blur(28px) saturate(200%)',
            backdropFilter: 'blur(28px) saturate(200%)',
            boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.18), 0 12px 36px rgba(0,0,0,0.50)',
            cursor: 'pointer',
            position: 'relative',
            flexDirection: 'column',
            touchAction: 'pan-y',
          }}
        >
          {/* Drag handle — visual swipe affordance. Skill §2 swipe-clarity:
              user shouldn't have to discover the gesture blind. */}
          <div aria-hidden style={{
            width: 36, height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.30)',
            margin: '0 auto 6px',
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            {/* Status cluster: chat icon with unread + voting badges. */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, #a78bfa, #7dd3fc)',
                color: '#0a0f1e', fontSize: 16, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono-display, monospace)',
              }} aria-hidden>
                {String.fromCodePoint(0x1F4AC)}
              </div>
              {unreadCount > 0 && (
                <span aria-label={`${unreadCount} unread messages`} style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
                  background: '#ef4444', color: '#fff',
                  fontSize: 10, fontWeight: 800, lineHeight: '18px',
                  textAlign: 'center',
                  border: '2px solid #0a0f1e',
                  fontFamily: 'var(--font-mono-display, monospace)',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
              {pendingSuggestions > 0 && (
                <span
                  aria-label={`${pendingSuggestions} suggestion${pendingSuggestions === 1 ? '' : 's'} pending vote`}
                  title={`${pendingSuggestions} pending vote${pendingSuggestions === 1 ? '' : 's'}`}
                  style={{
                    position: 'absolute', bottom: -4, right: -4,
                    width: 18, height: 18, borderRadius: 999,
                    background: '#fbbf24', color: '#0a0f1e',
                    fontSize: 10, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid #0a0f1e',
                  }}
                >
                  {String.fromCodePoint(0x1F5F3)}
                </span>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: 'rgba(255,255,255,0.92)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {titleText}
                {pendingSuggestions > 0 && (
                  <span style={{
                    fontSize: 9, color: '#fbbf24',
                    letterSpacing: '0.10em', textTransform: 'uppercase',
                    fontWeight: 700,
                  }}>
                    · {pendingSuggestions} vote{pendingSuggestions === 1 ? '' : 's'} pending
                  </span>
                )}
              </span>
              <span style={{
                fontSize: 12,
                color: latest && unreadCount > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.62)',
                fontWeight: unreadCount > 0 ? 600 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {latest
                  ? `${latest.author}: ${latest.content}`
                  : 'Tap to message your trip'}
              </span>
            </div>
            <form
              onSubmit={submitDraft}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={openChat}
                placeholder="Reply"
                aria-label="Quick reply"
                style={{
                  width: 90, padding: '6px 10px',
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
        </div>
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
