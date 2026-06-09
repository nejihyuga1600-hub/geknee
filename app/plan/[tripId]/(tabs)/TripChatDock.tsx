'use client';
// Self-contained bottom-sheet group chat. The dock is BOTH the collapsed
// pill and the expanded fullscreen chat — drag the handle up to grow, drag
// down to shrink. No modal redirect, the chat lives inside the dock.
//
// Sheet geometry:
//   - Container: fixed bottom: 0, height: 92svh
//   - translateY( SHEET_OFFSET ) hides most of the sheet behind the
//     viewport — only the top ~84px (the pill row) peeks above the home
//     indicator when collapsed.
//   - Expanded: translateY(0). Smooth animated snap on touchend.
//
// Touch handling:
//   - Drag handlers live ONLY on the header row (handle + pill body).
//     The message-list region scrolls naturally; quick-reply input +
//     send button stop propagation.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

function SendArrow({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

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
const SHEET_PEEK_HEIGHT = 84; // px of pill visible when collapsed

export default function TripChatDock({ tripId, destination }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);
  const [posting, setPosting] = useState(false);
  const { data: session } = useSession();
  const authorName = session?.user?.name?.trim() || session?.user?.email?.split('@')[0] || 'You';

  // Drag state — finger-tracked offset added on top of the snapped sheet
  // position. Reset on touchend after snap.
  const dragStartY = useRef<number | null>(null);
  const dragStartExpanded = useRef<boolean>(false);
  const [dragDelta, setDragDelta] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
    }, expanded ? 8_000 : 20_000);
    return () => clearInterval(iv);
  }, [loadMessages, loadSuggestions, expanded]);

  // Auto-scroll to newest when expanded or new messages arrive.
  useEffect(() => {
    if (!expanded) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, expanded]);

  const unreadCount = (() => {
    if (!messages.length) return 0;
    const lastId = messages[messages.length - 1].id;
    if (!lastSeen) return 0;
    if (lastSeen === lastId) return 0;
    let count = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].id === lastSeen) break;
      count++;
    }
    return count;
  })();

  const latest = messages[messages.length - 1];

  const markRead = useCallback(() => {
    if (latest) {
      try { localStorage.setItem(LAST_SEEN_KEY(tripId), latest.id); } catch {}
      setLastSeen(latest.id);
    }
  }, [latest, tripId]);

  const expand = useCallback(() => {
    setExpanded(true);
    markRead();
  }, [markRead]);
  const collapse = useCallback(() => { setExpanded(false); }, []);

  // Tell the rest of the chrome (notably the AI mascot floating top-right)
  // to step aside while the chat occupies the full screen. The mascot
  // listens for this event and hides itself — two primary affordances
  // can't both live in the top-right corner.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('geknee:trip-chat-expanded', { detail: { expanded } }));
  }, [expanded]);

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content) return;
    setPosting(true);
    try {
      const r = await fetch(`/api/trip-messages?tripId=${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: authorName, content }),
      });
      if (r.ok) {
        setDraft('');
        loadMessages();
      }
    } catch {}
    setPosting(false);
  }, [tripId, authorName, loadMessages]);

  const submit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    sendMessage(draft);
  };

  // Touch handlers attached only to the header strip.
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragStartExpanded.current = expanded;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    // Resist out-of-range drags: when collapsed, only allow upward drag
    // (negative dy). When expanded, only allow downward drag (positive).
    if (!dragStartExpanded.current && dy > 0) { setDragDelta(0); return; }
    if (dragStartExpanded.current && dy < 0) { setDragDelta(0); return; }
    setDragDelta(dy);
  };
  const onTouchEnd = () => {
    const dy = dragDelta;
    setDragDelta(0);
    dragStartY.current = null;
    const wasExpanded = dragStartExpanded.current;
    // Threshold: 60px is enough to commit a snap in either direction.
    if (!wasExpanded && dy < -60) { expand(); return; }
    if (wasExpanded && dy > 80) { collapse(); return; }
  };

  // Compute the sheet's vertical translation.
  // - Expanded base: 0 (fully visible)
  // - Collapsed base: hide all but SHEET_PEEK_HEIGHT
  // dragDelta is signed: negative drags reduce translateY (sheet rises),
  // positive drags increase it (sheet falls).
  const collapsedTranslate = `calc(92svh - ${SHEET_PEEK_HEIGHT}px)`;
  const transformValue = dragStartY.current !== null
    ? `translate3d(0, calc(${dragStartExpanded.current ? '0px' : collapsedTranslate} + ${dragDelta}px), 0)`
    : `translate3d(0, ${expanded ? '0px' : collapsedTranslate}, 0)`;

  const titleText = destination ? `${destination} chat` : 'Trip chat';

  return (
    <div
      role="region"
      aria-label="Trip group chat"
      style={{
        position: 'fixed',
        left: 12, right: 12,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        height: '92svh',
        zIndex: 9400,
        display: 'flex', flexDirection: 'column',
        transform: transformValue,
        transition: dragStartY.current === null
          ? 'transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1)'
          : 'none',
        willChange: 'transform',
        // Glass surface.
        borderRadius: 24,
        background: 'rgba(14, 16, 32, 0.55)',
        border: '1px solid rgba(255,255,255,0.18)',
        WebkitBackdropFilter: 'blur(28px) saturate(200%)',
        backdropFilter: 'blur(28px) saturate(200%)',
        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.18), 0 12px 36px rgba(0,0,0,0.50)',
        overflow: 'hidden',
      }}
    >
      {/* Header — drag handle + preview row. Drag handlers live here only. */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { expanded ? collapse() : expand(); }}
        style={{
          padding: '8px 14px 10px',
          flexShrink: 0,
          cursor: 'pointer',
          touchAction: 'none',
        }}
      >
        <div aria-hidden style={{
          width: 40, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.32)',
          margin: '0 auto 8px',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #a78bfa, #7dd3fc)',
              color: '#0a0f1e', fontSize: 16, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} aria-hidden>{String.fromCodePoint(0x1F4AC)}</div>
            {!expanded && unreadCount > 0 && (
              <span aria-label={`${unreadCount} unread messages`} style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
                background: '#ef4444', color: '#fff',
                fontSize: 10, fontWeight: 800, lineHeight: '18px', textAlign: 'center',
                border: '2px solid #0a0f1e',
              }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
            {pendingSuggestions > 0 && (
              <span aria-label={`${pendingSuggestions} suggestions pending vote`} style={{
                position: 'absolute', bottom: -4, right: -4,
                width: 18, height: 18, borderRadius: 999,
                background: '#fbbf24', color: '#0a0f1e',
                fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #0a0f1e',
              }}>{String.fromCodePoint(0x1F5F3)}</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: 'rgba(255,255,255,0.92)',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {titleText}
              {pendingSuggestions > 0 && (
                <span style={{
                  marginLeft: 6,
                  fontSize: 9, color: '#fbbf24',
                  letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 700,
                }}>· {pendingSuggestions} vote{pendingSuggestions === 1 ? '' : 's'} pending</span>
              )}
            </span>
            <span style={{
              fontSize: 12,
              color: !expanded && unreadCount > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.62)',
              fontWeight: !expanded && unreadCount > 0 ? 600 : 400,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {expanded
                ? 'Drag down to collapse'
                : (latest ? `${latest.author}: ${latest.content}` : 'Tap or pull up to chat')}
            </span>
          </div>
          {/* Chevron-down collapse button removed — was sitting right under
              the top-right mascot and reading as a stacked second button.
              The drag handle at the top of the sheet is the sole collapse
              affordance, with double-tap on the handle row as a fallback. */}
        </div>
      </div>

      {/* Messages — only renders when expanded or near-expanded to keep the
          collapsed state lightweight. Scrollable area; gestures inside the
          list don't drag the sheet (touchAction: pan-y). */}
      <div style={{
        flex: 1, minHeight: 0,
        overflowY: 'auto',
        padding: '0 14px 8px',
        display: 'flex', flexDirection: 'column', gap: 8,
        touchAction: 'pan-y',
        opacity: expanded ? 1 : 0,
        pointerEvents: expanded ? 'auto' : 'none',
        transition: 'opacity 200ms ease',
      }}>
        {messages.length === 0 ? (
          <div style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 13, textAlign: 'center', padding: '40px 20px',
          }}>
            No messages yet. Say hi to your trip mates.
          </div>
        ) : (
          messages.map((m) => {
            const isSelf = m.author === authorName;
            return (
              <div key={m.id} style={{
                display: 'flex',
                justifyContent: isSelf ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '78%',
                  padding: '8px 12px',
                  borderRadius: 14,
                  background: isSelf
                    ? 'linear-gradient(135deg, rgba(167,139,250,0.35), rgba(125,211,252,0.30))'
                    : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${isSelf ? 'rgba(167,139,250,0.40)' : 'rgba(255,255,255,0.10)'}`,
                  color: '#f1f5f9',
                }}>
                  {!isSelf && (
                    <div style={{
                      fontSize: 10, fontWeight: 700,
                      color: 'rgba(167,139,250,0.85)',
                      letterSpacing: '0.04em',
                      marginBottom: 2,
                    }}>{m.author}</div>
                  )}
                  <div style={{ fontSize: 14, lineHeight: 1.35, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.content}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer — always rendered so the input is reachable from peek
          state (quick reply). Stop touch propagation so typing doesn't
          drag the sheet. */}
      <form
        onSubmit={submit}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          flexShrink: 0,
          padding: '8px 14px calc(env(safe-area-inset-bottom, 0px) + 10px)',
          display: 'flex', alignItems: 'center', gap: 8,
          borderTop: expanded ? '1px solid rgba(255,255,255,0.10)' : 'none',
          background: 'rgba(0,0,0,0.18)',
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => { if (!expanded) expand(); }}
          placeholder={expanded ? 'Message your trip…' : 'Reply'}
          aria-label="Type a message"
          style={{
            flex: 1, padding: '10px 14px',
            borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)',
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--brand-ink, #f1f5f9)', fontSize: 14,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || posting}
          aria-label="Send message"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: '50%',
            background: draft.trim() ? '#a78bfa' : 'rgba(255,255,255,0.10)',
            color: draft.trim() ? '#0a0f1e' : 'rgba(255,255,255,0.45)',
            border: 'none', cursor: draft.trim() ? 'pointer' : 'default',
            padding: 0,
            transition: 'background 150ms ease',
            flexShrink: 0,
          }}
        >
          <SendArrow size={16} />
        </button>
      </form>
    </div>
  );
}
