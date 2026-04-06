'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TripDraft {
  id: string; title: string; location: string;
  startDate?: string | null; endDate?: string | null;
  nights?: number | null; notes?: string | null; updatedAt: string;
}

interface Friend {
  id: string; name: string | null; email: string;
  username: string | null; image: string | null;
  online: boolean; friendshipId: string;
}

interface PendingUser {
  id: string; name: string | null; email: string;
  username: string | null; image: string | null; friendshipId: string;
}

interface ChatMsg {
  id: string; author: string; content: string; timestamp: number;
}

interface GroupChat {
  id: string;       // hash of location
  name: string;     // display name (editable)
  location: string; // original location string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return Math.abs(h).toString(36) || 'global';
}

function fmtDate(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function loadGroupNames(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem('geknee_group_names') ?? '{}'); } catch { return {}; }
}
function saveGroupName(id: string, name: string) {
  const n = loadGroupNames(); n[id] = name;
  localStorage.setItem('geknee_group_names', JSON.stringify(n));
}

function Avatar({ src, name, size = 28 }: { src?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  if (src) return <img src={src} alt={name ?? ''} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: '#a5b4fc', flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function TripSocialPanel({
  open, onClose, currentLocation,
}: {
  open: boolean; onClose: () => void; currentLocation?: string;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const userId = (session?.user as { id?: string })?.id;
  const myName = (session?.user as { name?: string })?.name ?? 'Me';

  const [tab, setTab] = useState<'trips' | 'friends'>('trips');

  // ── Username ───────────────────────────────────────────────────────────────
  const [username,        setUsername]        = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput,   setUsernameInput]   = useState('');
  const [usernameError,   setUsernameError]   = useState('');
  const [usernameSaving,  setUsernameSaving]  = useState(false);

  // ── Trips ──────────────────────────────────────────────────────────────────
  const [trips,        setTrips]        = useState<TripDraft[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [saveTitle,    setSaveTitle]    = useState('');
  const [saving,       setSaving]       = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);

  // ── Friends ────────────────────────────────────────────────────────────────
  const [friends,         setFriends]         = useState<Friend[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<PendingUser[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<PendingUser[]>([]);
  const [friendsLoading,  setFriendsLoading]  = useState(false);
  const [addQuery,        setAddQuery]        = useState('');
  const [addError,        setAddError]        = useState('');
  const [addLoading,      setAddLoading]      = useState(false);
  const [addOpen,         setAddOpen]         = useState(false);

  // ── Group chat ─────────────────────────────────────────────────────────────
  const [activeGroup,    setActiveGroup]    = useState<GroupChat | null>(null);
  const [chatMsgs,       setChatMsgs]       = useState<ChatMsg[]>([]);
  const [chatInput,      setChatInput]      = useState('');
  const [chatSending,    setChatSending]    = useState(false);
  const [editingGrpName, setEditingGrpName] = useState(false);
  const [grpNameInput,   setGrpNameInput]   = useState('');
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef  = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // ── Presence ───────────────────────────────────────────────────────────────
  const pingPresence = useCallback(() => {
    if (!userId) return;
    fetch('/api/presence', { method: 'POST' }).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!open || !userId) return;
    pingPresence();
    const iv = setInterval(pingPresence, 30_000);
    return () => clearInterval(iv);
  }, [open, userId, pingPresence]);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadUsername = useCallback(async () => {
    if (!userId) return;
    const res = await fetch('/api/me/username');
    const d = await res.json();
    setUsername(d.username ?? null);
  }, [userId]);

  const loadTrips = useCallback(async () => {
    if (!userId) return;
    setTripsLoading(true);
    try {
      const res = await fetch('/api/trips');
      setTrips((await res.json()).trips ?? []);
    } catch { /**/ } finally { setTripsLoading(false); }
  }, [userId]);

  const loadFriends = useCallback(async () => {
    if (!userId) return;
    setFriendsLoading(true);
    try {
      const d = await (await fetch('/api/friends')).json();
      setFriends(d.friends ?? []);
      setPendingIncoming(d.pendingIncoming ?? []);
      setPendingOutgoing(d.pendingOutgoing ?? []);
    } catch { /**/ } finally { setFriendsLoading(false); }
  }, [userId]);

  useEffect(() => {
    if (!open || !userId) return;
    loadUsername(); loadTrips(); loadFriends();
  }, [open, userId, loadUsername, loadTrips, loadFriends]);

  useEffect(() => {
    if (!open || !userId) return;
    const iv = setInterval(loadFriends, 30_000);
    return () => clearInterval(iv);
  }, [open, userId, loadFriends]);

  // ── Group chat polling ─────────────────────────────────────────────────────
  const pollChat = useCallback(async (groupId: string) => {
    try {
      const r = await fetch(`/api/trip-messages?tripId=${groupId}`);
      const d = await r.json() as { messages: ChatMsg[] };
      setChatMsgs(d.messages ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!activeGroup) {
      if (chatPollRef.current) clearInterval(chatPollRef.current);
      return;
    }
    pollChat(activeGroup.id);
    chatPollRef.current = setInterval(() => pollChat(activeGroup.id), 3000);
    return () => { if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [activeGroup, pollChat]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);
  useEffect(() => { if (activeGroup) chatInputRef.current?.focus(); }, [activeGroup]);

  // ── Escape key ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (activeGroup) { setActiveGroup(null); setChatMsgs([]); }
        else onClose();
      }
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, activeGroup]);

  // ── Username actions ───────────────────────────────────────────────────────
  async function saveUsername() {
    setUsernameError('');
    setUsernameSaving(true);
    try {
      const res = await fetch('/api/me/username', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput }),
      });
      const d = await res.json();
      if (!res.ok) { setUsernameError(d.error || 'Failed'); }
      else { setUsername(d.username); setEditingUsername(false); setUsernameInput(''); }
    } catch { setUsernameError('Network error'); }
    finally { setUsernameSaving(false); }
  }

  // ── Trip actions ───────────────────────────────────────────────────────────
  async function saveTrip() {
    if (!saveTitle.trim()) return;
    setSaving(true);
    const params = new URLSearchParams(window.location.search);
    const location  = params.get('location')  || currentLocation || '';
    const startDate = params.get('startDate')  || undefined;
    const endDate   = params.get('endDate')    || undefined;
    const nights    = params.get('nights') ? parseInt(params.get('nights')!) : undefined;
    try {
      const res = await fetch('/api/trips', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: saveTitle.trim(), location: location || 'Unknown', startDate, endDate, nights }),
      });
      const d = await res.json();
      if (d.trip) { setTrips(p => [d.trip, ...p]); setSaveTitle(''); setShowSaveForm(false); }
    } catch { /**/ } finally { setSaving(false); }
  }

  async function deleteTrip(id: string) {
    await fetch(`/api/trips/${id}`, { method: 'DELETE' });
    setTrips(p => p.filter(t => t.id !== id));
  }

  function continueTrip(trip: TripDraft) {
    const p = new URLSearchParams();
    p.set('location', trip.location);
    if (trip.startDate) p.set('startDate', trip.startDate);
    if (trip.endDate)   p.set('endDate',   trip.endDate);
    if (trip.nights)    p.set('nights',    String(trip.nights));
    router.push(`/plan/style?${p.toString()}`);
    onClose();
  }

  // ── Friend actions ─────────────────────────────────────────────────────────
  async function sendFriendRequest() {
    if (!addQuery.trim()) return;
    setAddError(''); setAddLoading(true);
    try {
      const res = await fetch('/api/friends', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: addQuery.trim() }),
      });
      const d = await res.json();
      if (!res.ok) setAddError(d.error || 'Failed');
      else { setAddQuery(''); setAddOpen(false); loadFriends(); }
    } catch { setAddError('Network error'); }
    finally { setAddLoading(false); }
  }

  async function acceptFriend(id: string) { await fetch(`/api/friends/${id}`, { method: 'PUT' }); loadFriends(); }
  async function removeFriend(id: string) { await fetch(`/api/friends/${id}`, { method: 'DELETE' }); loadFriends(); }

  // ── Chat actions ───────────────────────────────────────────────────────────
  async function sendChatMsg() {
    if (!activeGroup || !chatInput.trim() || chatSending) return;
    setChatSending(true);
    const author = username ? `@${username}` : myName;
    try {
      const r = await fetch(`/api/trip-messages?tripId=${activeGroup.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, content: chatInput.trim() }),
      });
      const d = await r.json() as { ok: boolean; message: ChatMsg };
      if (d.ok) { setChatMsgs(prev => [...prev, d.message]); setChatInput(''); }
    } catch {} finally { setChatSending(false); }
  }

  function openGroup(location: string) {
    const id = hashStr(location.toLowerCase().trim());
    const names = loadGroupNames();
    const name = names[id] ?? location;
    setActiveGroup({ id, name, location });
    setChatMsgs([]);
    setEditingGrpName(false);
  }

  function saveGrpName() {
    if (!activeGroup || !grpNameInput.trim()) return;
    const newName = grpNameInput.trim();
    saveGroupName(activeGroup.id, newName);
    setActiveGroup({ ...activeGroup, name: newName });
    setEditingGrpName(false);
  }

  // Build group list from trips + currentLocation (deduplicated)
  const groups: GroupChat[] = (() => {
    const names = loadGroupNames();
    const seen = new Set<string>();
    const result: GroupChat[] = [];
    const locs = [
      ...(currentLocation ? [currentLocation] : []),
      ...trips.map(t => t.location),
    ];
    for (const loc of locs) {
      const id = hashStr(loc.toLowerCase().trim());
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({ id, name: names[id] ?? loc, location: loc });
    }
    return result;
  })();

  if (!open) return null;

  // ── Style constants ────────────────────────────────────────────────────────
  const BTN  = (bg = '#6366f1'): React.CSSProperties => ({ background: bg, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' });
  const GHOST: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 500, padding: '5px 10px', cursor: 'pointer' };
  const INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '8px 12px', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const CARD:  React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 14px', marginBottom: 10 };
  const TAB   = (active: boolean): React.CSSProperties => ({ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', borderBottom: active ? '2px solid #818cf8' : '2px solid transparent', background: 'none', color: active ? '#c7d2fe' : 'rgba(255,255,255,0.35)', transition: 'all 0.15s' });

  const myAuthor = username ? `@${username}` : myName;

  return (
    <>
      {/* Backdrop */}
      <div onClick={() => { if (activeGroup) { setActiveGroup(null); setChatMsgs([]); } else onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49 }} />

      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: 'rgba(6,8,22,0.97)', backdropFilter: 'blur(24px)', borderLeft: '1px solid rgba(99,102,241,0.2)', zIndex: 50, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.6)' }}>

        {/* ── Header ── */}
        {!activeGroup ? (
          <>
            <div style={{ padding: '16px 18px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar src={session?.user?.image} name={session?.user?.name} size={36} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e7ff' }}>
                      {session?.user?.name ?? session?.user?.email ?? 'Traveler'}
                    </div>
                    {!editingUsername ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        {username ? (
                          <span style={{ fontSize: 12, color: '#818cf8', fontWeight: 600 }}>@{username}</span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>No username set</span>
                        )}
                        <button
                          onClick={() => { setEditingUsername(true); setUsernameInput(username ?? ''); setUsernameError(''); }}
                          style={{ background: 'none', border: 'none', color: 'rgba(99,102,241,0.6)', fontSize: 10, cursor: 'pointer', padding: '0 2px' }}
                        >
                          {username ? 'edit' : '+ set username'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <div style={{ position: 'relative', flex: 1 }}>
                            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#818cf8', fontSize: 13, pointerEvents: 'none' }}>@</span>
                            <input
                              style={{ ...INPUT, paddingLeft: 22, fontSize: 12, padding: '5px 8px 5px 20px' }}
                              value={usernameInput}
                              onChange={e => { setUsernameInput(e.target.value); setUsernameError(''); }}
                              onKeyDown={e => { if (e.key === 'Enter') saveUsername(); if (e.key === 'Escape') setEditingUsername(false); }}
                              placeholder="yourname"
                              autoFocus
                              maxLength={24}
                            />
                          </div>
                          <button onClick={saveUsername} disabled={usernameSaving} style={{ ...BTN('#4f46e5'), padding: '5px 10px', fontSize: 11 }}>
                            {usernameSaving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingUsername(false)} style={{ ...GHOST, padding: '5px 8px' }}>✕</button>
                        </div>
                        {usernameError && <div style={{ fontSize: 11, color: '#f87171', marginTop: 3 }}>{usernameError}</div>}
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>letters, numbers, _ and - only</div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}>
                    ×
                  </button>
                  <button
                    onClick={() => signOut()}
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 500, padding: '4px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', margin: '14px 0 0', flexShrink: 0 }}>
              <button style={TAB(tab === 'trips')} onClick={() => setTab('trips')}>
                {String.fromCodePoint(0x1F9F3)} My Trips
              </button>
              <button style={TAB(tab === 'friends')} onClick={() => setTab('friends')}>
                {String.fromCodePoint(0x1F465)} Friends
                {pendingIncoming.length > 0 && (
                  <span style={{ marginLeft: 5, background: '#ef4444', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
                    {pendingIncoming.length}
                  </span>
                )}
              </button>
            </div>
          </>
        ) : (
          /* ── Group chat header ── */
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => { setActiveGroup(null); setChatMsgs([]); }}
              style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: 18, cursor: 'pointer', padding: '0 4px 0 0', lineHeight: 1 }}
            >
              &#8592;
            </button>
            {!editingGrpName ? (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e7ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeGroup.name}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                  {friends.filter(f => f.online).length} friend{friends.filter(f => f.online).length !== 1 ? 's' : ''} online
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                <input
                  value={grpNameInput}
                  onChange={e => setGrpNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveGrpName(); if (e.key === 'Escape') setEditingGrpName(false); }}
                  autoFocus
                  style={{ ...INPUT, padding: '5px 10px', fontSize: 13 }}
                />
                <button onClick={saveGrpName} style={{ ...BTN('#4f46e5'), padding: '5px 10px', fontSize: 11, flexShrink: 0 }}>Save</button>
              </div>
            )}
            {!editingGrpName && (
              <button
                onClick={() => { setGrpNameInput(activeGroup.name); setEditingGrpName(true); }}
                title="Rename chat"
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 13, padding: 4, flexShrink: 0 }}
              >
                ✏️
              </button>
            )}
            <button onClick={() => { setActiveGroup(null); setChatMsgs([]); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* ── Body ── */}
        {!activeGroup ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

            {/* ── TRIPS TAB ── */}
            {tab === 'trips' && (
              <>
                {!showSaveForm ? (
                  <button onClick={() => setShowSaveForm(true)} style={{ ...BTN('#4f46e5'), width: '100%', padding: '10px', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                    <span style={{ fontSize: 16 }}>+</span> Save Current Trip
                  </button>
                ) : (
                  <div style={{ ...CARD, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Trip name</div>
                    <input style={INPUT} placeholder="e.g. Tokyo Spring 2026" value={saveTitle} onChange={e => setSaveTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveTrip(); if (e.key === 'Escape') setShowSaveForm(false); }} autoFocus />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={saveTrip} disabled={saving || !saveTitle.trim()} style={{ ...BTN('#4f46e5'), flex: 1 }}>{saving ? 'Saving…' : 'Save'}</button>
                      <button onClick={() => setShowSaveForm(false)} style={GHOST}>Cancel</button>
                    </div>
                  </div>
                )}

                {tripsLoading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 24 }}>Loading…</div>}
                {!tripsLoading && trips.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13, marginTop: 32 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{String.fromCodePoint(0x1F9F3)}</div>
                    No saved trips yet.<br />Start planning and save your draft above.
                  </div>
                )}
                {trips.map(trip => (
                  <div key={trip.id} style={CARD}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e7ff', lineHeight: 1.3 }}>{trip.title}</div>
                      <button onClick={() => deleteTrip(trip.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 0 0 8px', flexShrink: 0 }}>×</button>
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>{String.fromCodePoint(0x1F4CD)} {trip.location}</div>
                    {trip.startDate && (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
                        {fmtDate(trip.startDate)}{trip.endDate ? ` – ${fmtDate(trip.endDate)}` : ''}{trip.nights ? ` · ${trip.nights} nights` : ''}
                      </div>
                    )}
                    <button onClick={() => continueTrip(trip)} style={{ ...BTN('#0891b2'), fontSize: 12, padding: '5px 12px' }}>Continue Planning →</button>
                  </div>
                ))}
              </>
            )}

            {/* ── FRIENDS TAB ── */}
            {tab === 'friends' && (
              <>
                {/* Add friend */}
                <div style={{ ...CARD, marginBottom: 16 }}>
                  <button
                    onClick={() => { setAddOpen(o => !o); setAddError(''); setAddQuery(''); }}
                    style={{ background: 'none', border: 'none', color: '#c7d2fe', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>+ Add Friend</span>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>{addOpen ? '−' : '+'}</span>
                  </button>
                  {addOpen && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10, color: 'rgba(129,140,248,0.5)', marginBottom: 6 }}>@username or email address</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input style={{ ...INPUT, flex: 1 }} placeholder="@username or email" value={addQuery}
                          onChange={e => { setAddQuery(e.target.value); setAddError(''); }}
                          onKeyDown={e => { if (e.key === 'Enter') sendFriendRequest(); }}
                          autoFocus />
                        <button onClick={sendFriendRequest} disabled={addLoading || !addQuery.trim()} style={BTN('#4f46e5')}>
                          {addLoading ? '…' : 'Add'}
                        </button>
                      </div>
                      {addError && <div style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>{addError}</div>}
                      {username && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 8 }}>
                          Your username: <span style={{ color: '#818cf8' }}>@{username}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Group Chats */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
                    GROUP CHATS
                  </div>
                  {groups.length === 0 && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '12px 0' }}>
                      Save a trip to create a group chat
                    </div>
                  )}
                  {groups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => openGroup(g.location)}
                      style={{ ...CARD, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 8 }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                        {String.fromCodePoint(0x1F4AC)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e7ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                          {friends.length} friend{friends.length !== 1 ? 's' : ''} · Tap to chat
                        </div>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 16 }}>›</span>
                    </button>
                  ))}
                </div>

                {/* Pending incoming */}
                {pendingIncoming.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>FRIEND REQUESTS</div>
                    {pendingIncoming.map(u => (
                      <div key={u.friendshipId} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar src={u.image} name={u.name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e7ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name ?? u.email}</div>
                          <div style={{ fontSize: 11, color: '#818cf8' }}>{u.username ? `@${u.username}` : u.email}</div>
                        </div>
                        <button onClick={() => acceptFriend(u.friendshipId)} style={BTN('#16a34a')}>Accept</button>
                        <button onClick={() => removeFriend(u.friendshipId)} style={GHOST}>Decline</button>
                      </div>
                    ))}
                    <div style={{ height: 8 }} />
                  </>
                )}

                {/* Pending outgoing */}
                {pendingOutgoing.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>SENT REQUESTS</div>
                    {pendingOutgoing.map(u => (
                      <div key={u.friendshipId} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar src={u.image} name={u.name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e7ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name ?? u.email}</div>
                          <div style={{ fontSize: 11, color: '#818cf8' }}>{u.username ? `@${u.username}` : u.email}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Pending…</div>
                        </div>
                        <button onClick={() => removeFriend(u.friendshipId)} style={GHOST}>Cancel</button>
                      </div>
                    ))}
                    <div style={{ height: 8 }} />
                  </>
                )}

                {/* Friends list */}
                {friendsLoading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 24 }}>Loading…</div>}
                {!friendsLoading && friends.length === 0 && pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13, marginTop: 16 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{String.fromCodePoint(0x1F465)}</div>
                    No friends yet.<br />Add them by @username or email above.
                  </div>
                )}
                {friends.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                      FRIENDS · {friends.filter(f => f.online).length} ONLINE
                    </div>
                    {friends
                      .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0))
                      .map(f => (
                        <div key={f.friendshipId} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <Avatar src={f.image} name={f.name} size={36} />
                            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: f.online ? '#22c55e' : 'rgba(255,255,255,0.2)', border: '2px solid rgba(6,8,22,0.97)' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e7ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name ?? f.email}</div>
                            <div style={{ fontSize: 11, color: '#818cf8' }}>{f.username ? `@${f.username}` : f.email}</div>
                            <div style={{ fontSize: 11, color: f.online ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>{f.online ? 'Online now' : 'Offline'}</div>
                          </div>
                          <button onClick={() => removeFriend(f.friendshipId)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}>×</button>
                        </div>
                      ))}
                  </>
                )}
              </>
            )}

          </div>
        ) : (
          /* ── Group chat body ── */
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chatMsgs.length === 0 && (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13, marginTop: 40 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{String.fromCodePoint(0x1F4AC)}</div>
                  No messages yet — say hello!
                </div>
              )}
              {chatMsgs.map(msg => {
                const isMe = msg.author === myAuthor;
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 2 }}>
                    {!isMe && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', paddingLeft: 4 }}>{msg.author}</span>}
                    <div style={{
                      maxWidth: '82%', padding: '9px 13px',
                      borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isMe
                        ? 'linear-gradient(135deg,rgba(56,189,248,0.2),rgba(129,140,248,0.2))'
                        : 'rgba(255,255,255,0.07)',
                      border: isMe ? '1px solid rgba(56,189,248,0.3)' : '1px solid rgba(255,255,255,0.08)',
                      color: '#e2e8f0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    }}>{msg.content}</div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <input
                ref={chatInputRef}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMsg(); } }}
                placeholder={`Message ${activeGroup.name}…`}
                disabled={chatSending}
                style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontSize: 13, padding: '10px 13px', outline: 'none' }}
              />
              <button
                onClick={sendChatMsg}
                disabled={chatSending || !chatInput.trim()}
                style={{
                  width: 38, height: 38, borderRadius: 10, border: 'none', flexShrink: 0,
                  background: chatInput.trim() && !chatSending ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : 'rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: 15, cursor: chatInput.trim() && !chatSending ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >{String.fromCodePoint(0x27A4)}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
