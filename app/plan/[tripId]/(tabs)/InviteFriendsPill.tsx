'use client';

// Persistent invite-friends control in the trip tab header. Visible on
// planning / booking / itinerary / vault so a trip owner can pull
// collaborators in without having to detour through the chat panel.
//
// Wraps POST /api/trips/[id]/members — same endpoint TripSocialPanel uses.
// Accepts either an email or an @username. Closes on outside click,
// Escape, or successful invite. Shows a tiny member-count chip when there
// are 2+ members so the owner can see at a glance who's already in.

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

const MONO = 'var(--font-mono-display), ui-monospace, monospace';

interface MemberRow {
  id: string;
  role: 'owner' | 'member';
  user: { id: string; name: string | null; email: string | null; image: string | null; username: string | null };
}

export default function InviteFriendsPill() {
  const params = useParams();
  const tripId = (params?.tripId as string) ?? '';

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const popRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Fetch member list lazily — only when the popover opens, so the trip
  // header doesn't pay for the request on every mount.
  useEffect(() => {
    if (!open || !tripId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/trips/${tripId}/members`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setMembers(d.members ?? []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [open, tripId]);

  // Also fetch ONCE on mount to show the count chip without opening — but
  // only when we have a tripId, so we don't waste a request on /plan with no id.
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/trips/${tripId}/members`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setMembers(d.members ?? []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [tripId]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Autofocus when opening; blur when closing so iOS dismisses the
  // keyboard along with the popover (without this the keyboard stays
  // floating after the user taps outside to close the invite sheet).
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else inputRef.current?.blur();
  }, [open]);

  async function submit() {
    const raw = input.trim();
    if (!raw || loading || !tripId) return;
    setError(null);
    setOkMessage(null);
    setLoading(true);
    const body = raw.includes('@')
      ? { email: raw.toLowerCase() }
      : { username: raw.toLowerCase().replace(/^@/, '') };
    try {
      const r = await fetch(`/api/trips/${tripId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d?.error ?? 'Could not invite that user');
      } else {
        setOkMessage(d?.member?.user?.name ?? d?.member?.user?.username ?? d?.member?.user?.email ?? 'Invited');
        setInput('');
        // Re-fetch list so the count chip updates.
        try {
          const r2 = await fetch(`/api/trips/${tripId}/members`);
          if (r2.ok) {
            const d2 = await r2.json();
            setMembers(d2.members ?? []);
          }
        } catch { /* ignore */ }
        // Auto-dismiss the success message after a moment.
        setTimeout(() => setOkMessage(null), 2500);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  const count = members.length;
  const showCountChip = count >= 2;

  return (
    <div ref={popRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 999,
          background: 'rgba(56,189,248,0.12)',
          border: '1px solid rgba(56,189,248,0.32)',
          color: 'var(--brand-accent, #38bdf8)',
          fontFamily: MONO, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        + Invite friends
        {showCountChip && (
          <span
            aria-label={`${count} members`}
            style={{
              marginLeft: 2,
              padding: '1px 7px',
              borderRadius: 999,
              background: 'rgba(56,189,248,0.22)',
              color: '#bae6fd',
              fontSize: 10,
              fontFamily: MONO,
              letterSpacing: '0.04em',
            }}
          >
            {count}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Invite friends to this trip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 60,
            width: 320,
            padding: 14,
            background: 'rgba(13,13,36,0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(56,189,248,0.32)',
            borderRadius: 14,
            boxShadow: '0 14px 38px rgba(0,0,0,0.55)',
            fontFamily: 'var(--font-ui), Inter, system-ui, sans-serif',
            color: '#e2e8f0',
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: 6, fontFamily: MONO }}>
            Invite by email or @username
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="alice@example.com or @alice"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !loading) submit(); }}
              disabled={loading}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                color: '#e2e8f0',
                padding: '8px 10px',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={submit}
              disabled={loading || !input.trim()}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background: loading ? 'rgba(56,189,248,0.18)' : 'linear-gradient(135deg, #38bdf8, #7dd3fc)',
                border: 'none',
                color: '#0a0a1f',
                fontWeight: 700,
                fontSize: 12,
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !input.trim() ? 0.55 : 1,
              }}
            >
              {loading ? '...' : 'Invite'}
            </button>
          </div>
          {error && (
            <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 8 }}>{error}</div>
          )}
          {okMessage && (
            <div style={{ fontSize: 12, color: '#86efac', marginTop: 8 }}>Invited {okMessage}.</div>
          )}
          {members.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 6, fontFamily: MONO }}>
                In this trip ({members.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {members.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    {m.user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.user.image} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'linear-gradient(135deg,#a78bfa,#7dd3fc)',
                        color: '#0a0a1f', fontSize: 10, fontWeight: 700,
                        display: 'grid', placeItems: 'center',
                      }}>{(m.user.name ?? m.user.username ?? m.user.email ?? '?')[0]?.toUpperCase()}</span>
                    )}
                    <span style={{ flex: 1 }}>{m.user.name ?? m.user.username ?? m.user.email ?? 'Member'}</span>
                    {m.role === 'owner' && (
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', color: 'rgba(167,139,250,0.85)' }}>OWNER</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
