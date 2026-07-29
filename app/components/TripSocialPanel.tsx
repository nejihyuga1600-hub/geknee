'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { track } from '@/lib/analytics';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';

const FileVault = dynamic(() => import('@/app/components/FileVault'), { ssr: false });
const SuggestionsSection = dynamic(() => import('@/app/components/SuggestionsSection'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface TripDraft {
  id: string; title: string; location: string;
  startDate?: string | null; endDate?: string | null;
  nights?: number | null; notes?: string | null; updatedAt: string;
  style?: string | null;
  userId?: string;
  suggestionVoteMode?: 'advisory' | 'auto_majority';
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
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(167, 139, 250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: '#a5b4fc', flexShrink: 0 }}>
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
  const [trips,          setTrips]          = useState<TripDraft[]>([]);
  const [tripsLoading,   setTripsLoading]   = useState(false);
  const [saveTitle,      setSaveTitle]      = useState('');
  const [saving,         setSaving]         = useState(false);
  const [showSaveForm,   setShowSaveForm]   = useState(false);
  const [renamingId,     setRenamingId]     = useState<string | null>(null);
  const [renameValue,    setRenameValue]    = useState('');
  const [renameSaving,   setRenameSaving]   = useState(false);

  // ── Friends ────────────────────────────────────────────────────────────────
  const [friends,         setFriends]         = useState<Friend[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<PendingUser[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<PendingUser[]>([]);
  const [friendsLoading,  setFriendsLoading]  = useState(false);
  const [favoriteFriends, setFavoriteFriends] = useState<Set<string>>(new Set());
  const [addQuery,        setAddQuery]        = useState('');
  const [addError,        setAddError]        = useState('');
  const [addLoading,      setAddLoading]      = useState(false);
  const [addOpen,         setAddOpen]         = useState(false);

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<{ id: string; type: string; title: string; body: string; read: boolean; createdAt: string }[]>([]);

  const tripNotifCount   = notifications.filter(n => !n.read && n.type === 'trip_update').length;
  const friendNotifCount = notifications.filter(n => !n.read && (n.type === 'friend_message' || n.type === 'friend_request')).length;
  const unreadCount      = tripNotifCount + friendNotifCount;

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const d = await (await fetch('/api/notifications')).json();
      setNotifications(d.notifications ?? []);
    } catch {}
  }, [userId]);

  useEffect(() => {
    if (!open || !userId) return;
    loadNotifications();
    // 45s (was 15s) — LocationClient already polls notifications every 30s
    // in the background, so 15s here was doubling up the request volume
    // for negligible UX gain. 45s keeps the modal feeling live without
    // the 8-requests-per-minute noise QA caught.
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadNotifications();
    }, 45_000);
    return () => clearInterval(iv);
  }, [open, userId, loadNotifications]);

  async function markTabRead(...types: string[]) {
    const unreadIds = notifications.filter(n => !n.read && types.includes(n.type)).map(n => n.id);
    if (unreadIds.length === 0) return;
    setNotifications(n => n.map(x => types.includes(x.type) ? { ...x, read: true } : x));
    for (const id of unreadIds) {
      fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
    }
  }

  // ── File vault (per-trip) ──────────────────────────────────────────────────
  const [activeFilesTrip, setActiveFilesTrip] = useState<{ id: string; name: string } | null>(null);

  // ── Group chat ─────────────────────────────────────────────────────────────
  const [activeGroup,    setActiveGroup]    = useState<GroupChat | null>(null);
  const [chatMsgs,       setChatMsgs]       = useState<ChatMsg[]>([]);
  const [chatInput,      setChatInput]      = useState('');
  const [chatSending,    setChatSending]    = useState(false);
  const [editingGrpName, setEditingGrpName] = useState(false);
  const [grpNameInput,   setGrpNameInput]   = useState('');

  // Trip-membership UI (multi-user shared trips).
  const [members,        setMembers]        = useState<Array<{ id: string; role: string; user: { id: string; name?: string | null; email?: string | null; image?: string | null; username?: string | null } }>>([]);
  const [memberInput,    setMemberInput]    = useState('');
  const [memberError,    setMemberError]    = useState<string | null>(null);
  const [memberLoading,  setMemberLoading]  = useState(false);
  const [showInviteRow,  setShowInviteRow]  = useState(false);
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
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      pingPresence();
    }, 30_000);
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
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadFriends();
    }, 30_000);
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
    chatPollRef.current = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      pollChat(activeGroup.id);
    }, 3000);
    return () => { if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [activeGroup, pollChat]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);
  useEffect(() => { if (activeGroup) chatInputRef.current?.focus(); }, [activeGroup]);

  // ── Escape key ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (activeFilesTrip) setActiveFilesTrip(null);
        else if (activeGroup) { setActiveGroup(null); setChatMsgs([]); }
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
      if (d.trip) { setTrips(p => [d.trip, ...p]); setSaveTitle(''); setShowSaveForm(false); } if (d.trip) { track('plan_saved', { tripId: d.trip.id, location: d.trip.location }); }
    } catch { /**/ } finally { setSaving(false); }
  }

  async function deleteTrip(id: string) {
    await fetch(`/api/trips/${id}`, { method: 'DELETE' });
    setTrips(p => p.filter(t => t.id !== id));
  }

  async function saveRename(id: string) {
    const title = renameValue.trim();
    if (!title) return;
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/trips/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const d = await res.json();
      if (d.trip) setTrips(p => p.map(t => t.id === id ? { ...t, title: d.trip.title } : t));
    } catch { /**/ } finally {
      setRenameSaving(false);
      setRenamingId(null);
    }
  }

  function continueTrip(trip: TripDraft) {
    // Route into the design-faithful summary view — savedTripId loads the
    // itinerary from the DB; passing the rest of the trip context as URL
    // params populates the masthead immediately while the API call is
    // in flight. (Used to push to /plan/style which is the legacy UI.)
    const p = new URLSearchParams();
    p.set('savedTripId', trip.id);
    p.set('location',    trip.location);
    if (trip.startDate) p.set('startDate', trip.startDate);
    if (trip.endDate)   p.set('endDate',   trip.endDate);
    if (trip.nights)    p.set('nights',    String(trip.nights));
    if (trip.style) {
      try {
        const s = JSON.parse(trip.style) as { style?: string; budget?: string; purpose?: string; interests?: string; constraints?: string };
        if (s.style)       p.set('style',       s.style);
        if (s.budget)      p.set('budget',      s.budget);
        if (s.purpose)     p.set('purpose',     s.purpose);
        if (s.interests)   p.set('interests',   s.interests);
        if (s.constraints) p.set('constraints', s.constraints);
      } catch {
        // Non-JSON style (Atlas saves it as a bare style id like "relaxed")
        p.set('style', trip.style);
      }
    }
    router.push(`/plan/summary?${p.toString()}`);
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
    // Prefer the saved trip's actual TripDraft.id over the location hash.
    // The chat API authorizes through TripMember rows, which are keyed by
    // TripDraft.id — if we send a hashed id, getTripAccess() finds no
    // matching member and rejects every POST with 403, silently breaking
    // chat for invited users (and even the owner once their session
    // refreshes). Falls back to the hash only when no saved trip exists
    // for this location (anonymous exploration mode).
    const savedTrip = trips.find(t => t.location === location);
    const id = savedTrip?.id ?? hashStr(location.toLowerCase().trim());
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

  function activeTripDbIdFor(g: { location: string } | null): string | null {
    if (!g) return null;
    return trips.find(t => t.location === g.location)?.id ?? null;
  }

  const loadMembers = useCallback(async () => {
    const tripDbId = activeTripDbIdFor(activeGroup);
    if (!tripDbId) { setMembers([]); return; }
    try {
      const r = await fetch(`/api/trips/${tripDbId}/members`);
      if (!r.ok) { setMembers([]); return; }
      const d = await r.json();
      setMembers(d.members ?? []);
    } catch { setMembers([]); }
  }, [activeGroup, trips]);

  async function inviteMember(override?: { email?: string; username?: string }) {
    const tripDbId = activeTripDbIdFor(activeGroup);
    if (!tripDbId) return;
    const usingOverride = !!override && (!!override.email || !!override.username);
    if (!usingOverride && !memberInput.trim()) return;
    setMemberError(null);
    setMemberLoading(true);
    let body: { email?: string; username?: string };
    if (usingOverride) {
      body = override!;
    } else {
      const raw = memberInput.trim();
      body = raw.includes('@')
        ? { email: raw.toLowerCase() }
        : { username: raw.toLowerCase().replace(/^@/, '') };
    }
    try {
      const r = await fetch(`/api/trips/${tripDbId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMemberError(d?.error ?? 'Could not invite that user');
      } else {
        if (!usingOverride) setMemberInput('');
        await loadMembers();
      }
    } catch {
      setMemberError('Network error');
    } finally {
      setMemberLoading(false);
    }
  }

  // Favorite friends — persisted in localStorage (per-browser, no DB roundtrip).
  // Stored as a JSON array of friendshipId strings.
  const FAVORITES_KEY = 'travel-ai:favoriteFriends';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) setFavoriteFriends(new Set(ids.filter(x => typeof x === 'string')));
      }
    } catch { /* ignore */ }
  }, []);

  function toggleFavoriteFriend(friendshipId: string) {
    setFavoriteFriends(prev => {
      const next = new Set(prev);
      if (next.has(friendshipId)) next.delete(friendshipId);
      else next.add(friendshipId);
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  async function removeMember(targetUserId: string) {
    const tripDbId = activeTripDbIdFor(activeGroup);
    if (!tripDbId) return;
    if (!confirm('Remove this member from the trip?')) return;
    try {
      await fetch(`/api/trips/${tripDbId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId }),
      });
      await loadMembers();
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!activeGroup) { setMembers([]); setShowInviteRow(false); setMemberError(null); return; }
    loadMembers();
  }, [activeGroup, loadMembers]);

  // Lock body scroll while the panel is open — otherwise iOS lets the user
  // drag the entire page underneath the panel, which pulls the OS status bar
  // into the modal title area and exposes Safari's white default background
  // at the bottom (the "white bar" the user reported 2026-06-04).
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open) return null;

  // ── Style constants ────────────────────────────────────────────────────────
  const BTN  = (bg = 'linear-gradient(135deg,#a78bfa,#7dd3fc)'): React.CSSProperties => ({ background: bg, border: 'none', borderRadius: 10, color: '#0a0a1f', fontSize: 12, fontWeight: 700, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' });
  const GHOST: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,208,0.18)', borderRadius: 10, color: '#a8a8c0', fontSize: 12, fontWeight: 500, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' };
  const INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,208,0.18)', borderRadius: 10, color: '#f2f2f8', fontSize: 13, padding: '9px 12px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
  const CARD:  React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,163,208,0.12)', borderRadius: 14, padding: '14px 16px', marginBottom: 10 };
  const TAB   = (active: boolean): React.CSSProperties => ({ flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', borderBottom: `2px solid ${active ? '#a78bfa' : 'transparent'}`, borderRadius: 0, background: 'transparent', color: active ? '#f2f2f8' : '#a8a8c0', transition: 'all 0.15s', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: -1 });

  const myAuthor = username ? `@${username}` : myName;

  return (
    <>
      {/* Backdrop */}
      <div onClick={() => {
        if (activeFilesTrip) setActiveFilesTrip(null);
        else if (activeGroup) { setActiveGroup(null); setChatMsgs([]); }
        else onClose();
      }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49, animation: 'modalFadeIn 0.25s ease-out' }} />

      {/* Panel — fixed full-height, safe-area-aware, overscroll-locked so
          the user can't drag-bounce the modal past the screen edges (which
          previously exposed Safari's white default background and crashed
          the title into the iOS status bar). Width is 100% on mobile, fixed
          drawer width on tablets/desktop. */}
      <div style={{
        position: 'fixed',
        // Anchor to all four edges so the dark background fills the
        // ENTIRE screen, including the safe-area regions around the
        // notch / home indicator. height:100svh was wrong — svh excludes
        // those regions, so the cream body background showed through as
        // "white banners" at the top and bottom on iPhone 15 Pro in
        // light mode (user feedback 2026-06-04).
        top: 0, right: 0, bottom: 0,
        // 100vw on mobile (full screen), drawer width on tablets/desktop.
        width: 'min(100vw, 420px)',
        background: 'rgba(6,8,22,0.98)',
        WebkitBackdropFilter: 'blur(24px)', backdropFilter: 'blur(24px)',
        borderLeft: '1px solid rgba(167, 139, 250,0.2)',
        zIndex: 50,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
        animation: 'panelSlideIn 0.3s ease-out',
        overscrollBehavior: 'contain',
        // Reserve iOS Dynamic Island / notch + home indicator inside the
        // panel so child content stays clear of system chrome. The
        // background already covers those areas via the four-edge anchor
        // above, so this padding is purely about content layout.
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>

        {/* ── Header ── */}
        {!activeGroup ? (
          <>
            {/* ── Header (design layout) ───────────────────────────────────── */}
            <div style={{
              padding: '18px 22px 14px',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(148,163,208,0.12)',
              flexShrink: 0,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-display, Georgia, serif)',
                  fontSize: 22, fontWeight: 400,
                  letterSpacing: '-0.01em',
                  color: '#f2f2f8',
                }}>
                  Trips &amp; Friends
                </div>
                {!editingUsername ? (
                  <div style={{
                    fontSize: 11, color: '#a8a8c0',
                    letterSpacing: '0.06em', marginTop: 4,
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  }}>
                    <span style={{ color: username ? '#a78bfa' : '#6b6b85' }}>
                      {username ? `@${username}` : 'no username'}
                    </span>
                    <span>·</span>
                    <span>{trips.length} trip{trips.length === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span>{friends.length} friend{friends.length === 1 ? '' : 's'}</span>
                    <button
                      onClick={() => { setEditingUsername(true); setUsernameInput(username ?? ''); setUsernameError(''); }}
                      style={{ background: 'none', border: 'none', color: '#6b6b85', fontSize: 10, cursor: 'pointer', padding: 0, marginLeft: 4 }}
                    >
                      {username ? 'edit' : '+ set username'}
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#a78bfa', fontSize: 12, pointerEvents: 'none' }}>@</span>
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
                      <button onClick={saveUsername} disabled={usernameSaving} style={{ ...BTN(), padding: '5px 12px', fontSize: 11 }}>
                        {usernameSaving ? '…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingUsername(false)} style={{ ...GHOST, padding: '5px 8px' }}>{String.fromCodePoint(0x2715)}</button>
                    </div>
                    {usernameError && <div style={{ fontSize: 11, color: '#f87171', marginTop: 3 }}>{usernameError}</div>}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: '#a8a8c0', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4, flexShrink: 0 }}
              >
                {String.fromCodePoint(0x00D7)}
              </button>
            </div>

            {/* Tabs (underline indicator per design) */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(148,163,208,0.12)', flexShrink: 0 }}>
              <button style={TAB(tab === 'trips')} onClick={() => { setTab('trips'); markTabRead('trip_update'); }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <rect x="3" y="5" width="10" height="8" rx="1.5" />
                  <path d="M6 5V3.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V5" strokeLinecap="round" />
                  <line x1="3" y1="8.5" x2="13" y2="8.5" />
                </svg>
                <span>Trips</span>
                {tripNotifCount > 0 && (
                  <span style={{ marginLeft: 5, background: '#f59e0b', color: '#000', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
                    {tripNotifCount}
                  </span>
                )}
              </button>
              <button style={TAB(tab === 'friends')} onClick={() => { setTab('friends'); markTabRead('friend_message', 'friend_request'); }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <path d="M5 8a2 2 0 1 0 4 0 2 2 0 0 0-4 0z" />
                  <path d="M11.5 10a1.5 1.5 0 1 0 0-3" strokeLinecap="round" />
                  <path d="M1.5 13c.5-2 2.5-3 5.5-3s5 1 5.5 3" strokeLinecap="round" />
                </svg>
                <span>Friends</span>
                {(pendingIncoming.length + friendNotifCount) > 0 && (
                  <span style={{ marginLeft: 5, background: friendNotifCount > 0 ? '#f59e0b' : '#ef4444', color: friendNotifCount > 0 ? '#000' : '#fff', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
                    {pendingIncoming.length + friendNotifCount}
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
                  <button
                    onClick={() => setShowSaveForm(true)}
                    style={{
                      width: '100%',
                      marginBottom: 16,
                      padding: '12px',
                      background: 'transparent',
                      border: '1px dashed rgba(148,163,208,0.3)',
                      borderRadius: 12,
                      color: '#a8a8c0',
                      fontSize: 12, fontWeight: 500,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    + Save current trip
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
                  <div style={{ textAlign: 'center', color: '#6b6b85', fontSize: 13, marginTop: 40, fontFamily: 'inherit' }}>
                    <svg width="36" height="36" viewBox="0 0 16 16" fill="none" stroke="rgba(167,139,250,0.45)" strokeWidth="1.2" style={{ margin: '0 auto 12px', display: 'block' }} aria-hidden>
                      <rect x="2" y="5" width="12" height="9" rx="1.5" />
                      <path d="M5.5 5V3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V5" strokeLinecap="round" />
                      <line x1="2" y1="9" x2="14" y2="9" />
                    </svg>
                    <div style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: 16, color: '#a8a8c0', marginBottom: 4 }}>
                      No saved trips yet
                    </div>
                    <div style={{ fontSize: 12, color: '#6b6b85' }}>
                      Start planning and save a draft.
                    </div>
                  </div>
                )}
                {trips.map(trip => {
                  const isActive = !!currentLocation && trip.location.toLowerCase() === currentLocation.toLowerCase();
                  const isRenaming = renamingId === trip.id;
                  return (
                  <div
                    key={trip.id}
                    role={isRenaming ? undefined : 'button'}
                    onClick={isRenaming ? undefined : () => continueTrip(trip)}
                    style={{
                      ...CARD,
                      background: isActive ? 'linear-gradient(135deg, rgba(167,139,250,0.10), rgba(255,255,255,0.02))' : (CARD.background as string),
                      borderColor: isActive ? 'rgba(167,139,250,0.45)' : (CARD.border as string).split(' ').pop() ?? 'rgba(148,163,208,0.12)',
                      position: 'relative',
                      cursor: isRenaming ? 'default' : 'pointer',
                      transition: 'background 150ms',
                    }}
                  >
                    {isActive && (
                      <span style={{
                        position: 'absolute', top: 12, right: 14,
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                        color: '#a78bfa', display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa' }} />
                        ACTIVE
                      </span>
                    )}
                    {isRenaming ? (
                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveRename(trip.id); if (e.key === 'Escape') setRenamingId(null); }}
                          style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(167, 139, 250,0.5)', borderRadius: 6, color: '#e0e7ff', fontSize: 13, padding: '3px 8px', outline: 'none' }}
                        />
                        <button onClick={() => saveRename(trip.id)} disabled={renameSaving} style={{ ...BTN(), fontSize: 11, padding: '3px 10px' }}>
                          {renameSaving ? '…' : 'Save'}
                        </button>
                        <button onClick={() => setRenamingId(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 13 }}>{String.fromCodePoint(0x2715)}</button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            fontFamily: 'var(--font-display, Georgia, serif)',
                            fontSize: 15, fontWeight: 500, color: '#f2f2f8',
                            letterSpacing: '-0.01em', lineHeight: 1.25,
                            paddingRight: isActive ? 64 : 24,
                          }}
                          onDoubleClick={e => {
                            e.stopPropagation();
                            setRenamingId(trip.id); setRenameValue(trip.title);
                          }}
                          title="Double-click to rename"
                        >
                          {trip.title}
                        </div>
                        <div style={{ fontSize: 12, color: '#a8a8c0', marginTop: 2 }}>
                          {trip.location}
                        </div>
                        {trip.startDate && (() => {
                          const today = new Date().toISOString().slice(0, 10);
                          const isLive = !!trip.endDate && today >= trip.startDate && today <= trip.endDate;
                          const isPast = !!trip.endDate && today > trip.endDate;
                          const isFuture = today < trip.startDate;
                          return (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                              <div style={{ fontSize: 11, color: '#6b6b85', letterSpacing: '0.02em' }}>
                                {fmtDate(trip.startDate)}{trip.endDate ? ` \u2013 ${fmtDate(trip.endDate)}` : ''}{trip.nights ? ` \u00B7 ${trip.nights} nights` : ''}
                              </div>
                              {(isLive || isPast || isFuture) && (
                                <span style={{
                                  padding: '2px 8px', borderRadius: 999,
                                  fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                                  textTransform: 'uppercase',
                                  color: isLive ? '#86efac' : isPast ? '#94a3b8' : '#a78bfa',
                                  background: isLive ? 'rgba(134,239,172,0.14)'
                                    : isPast ? 'rgba(148,163,184,0.14)'
                                    : 'rgba(167,139,250,0.14)',
                                  border: `1px solid ${isLive ? 'rgba(134,239,172,0.35)' : isPast ? 'rgba(148,163,184,0.35)' : 'rgba(167,139,250,0.35)'}`,
                                }}>
                                  {isLive ? 'Live now' : isPast ? 'Dates passed' : 'Upcoming'}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {(() => {
                          const today = new Date().toISOString().slice(0, 10);
                          const isLiveNow = !!trip.startDate && !!trip.endDate && today >= trip.startDate && today <= trip.endDate;
                          const isPast = !!trip.endDate && today > trip.endDate;
                          const label = isLiveNow ? 'LIVE NOW' : isPast ? 'Recap' : 'Go Live';
                          return (
                            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                onClick={e => { e.stopPropagation(); router.push(`/trip/${trip.id}/live`); }}
                                aria-label={isLiveNow ? 'Open live planner' : 'Preview live planner'}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '5px 10px',
                                  borderRadius: 999,
                                  background: isLiveNow ? 'linear-gradient(135deg,#a78bfa,#7dd3fc)' : 'rgba(167,139,250,0.12)',
                                  border: isLiveNow ? 'none' : '1px solid rgba(167,139,250,0.32)',
                                  color: isLiveNow ? '#0a0a1f' : '#c7d2fe',
                                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                                  cursor: 'pointer', fontFamily: 'inherit',
                                }}
                              >
                                {isLiveNow && (
                                  <span style={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: '#0a0a1f',
                                  }} />
                                )}
                                {label}
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); openGroup(trip.location); }}
                                aria-label="Open group chat"
                                title="Group chat"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 8,
                                  padding: '9px 16px',
                                  borderRadius: 999,
                                  background: 'linear-gradient(135deg, rgba(56,189,248,0.22), rgba(167,139,250,0.22))',
                                  border: '1px solid rgba(56,189,248,0.45)',
                                  color: '#e0f2fe',
                                  fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                                  cursor: 'pointer', fontFamily: 'inherit',
                                  boxShadow: '0 4px 14px rgba(14,165,233,0.18)',
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                CHAT
                              </button>
                            </div>
                          );
                        })()}
                        <button
                          onClick={e => { e.stopPropagation(); setActiveFilesTrip({ id: trip.id, name: trip.title }); }}
                          aria-label="Open files"
                          title="Files for this trip"
                          style={{
                            position: 'absolute', bottom: 6, right: 36,
                            background: 'none', border: 'none',
                            color: 'rgba(168,168,192,0.55)',
                            cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 4,
                          }}
                        >{String.fromCodePoint(0x1F4C2)}</button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteTrip(trip.id); }}
                          aria-label="Delete trip"
                          style={{
                            position: 'absolute', bottom: 8, right: 10,
                            background: 'none', border: 'none',
                            color: 'rgba(168,168,192,0.35)',
                            cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 4,
                          }}
                        >{String.fromCodePoint(0x00D7)}</button>
                      </>
                    )}
                  </div>
                  );
                })}

                                {/* ── Plan change history ── */}
                {(() => {
                  const tripNotifs = notifications.filter(n => n.type === 'trip_update');
                  if (tripNotifs.length === 0) return null;
                  return (
                    <div style={{ marginTop: 24 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
                        PLAN CHANGE HISTORY
                      </div>
                      {tripNotifs.map(n => {
                        const diff = Date.now() - new Date(n.createdAt).getTime();
                        const age = diff < 60_000 ? 'just now'
                          : diff < 3_600_000 ? `${Math.floor(diff / 60_000)}m ago`
                          : diff < 86_400_000 ? `${Math.floor(diff / 3_600_000)}h ago`
                          : `${Math.floor(diff / 86_400_000)}d ago`;
                        return (
                          <div key={n.id} style={{
                            display: 'flex', gap: 10, alignItems: 'flex-start',
                            padding: '10px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                          }}>
                            {/* Timeline dot */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3, flexShrink: 0 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? 'rgba(255,255,255,0.2)' : '#f59e0b' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: n.read ? 'rgba(255,255,255,0.5)' : '#e0e7ff', marginBottom: 2 }}>{n.title}</div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{n.body}</div>
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 3 }}>{age}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
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
                      <div style={{ fontSize: 10, color: 'rgba(167, 139, 250,0.5)', marginBottom: 6 }}>@username or email address</div>
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

                {/* Group chats moved out of Friends tab — each trip card in the
                    Trips tab has its own "Chat" link. Friends tab is now scoped
                    purely to friend management. */}

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
                  <div style={{ textAlign: 'center', color: '#6b6b85', fontSize: 13, marginTop: 24, fontFamily: 'inherit' }}>
                    <svg width="36" height="36" viewBox="0 0 16 16" fill="none" stroke="rgba(167,139,250,0.45)" strokeWidth="1.2" style={{ margin: '0 auto 12px', display: 'block' }} aria-hidden>
                      <path d="M5 8a2 2 0 1 0 4 0 2 2 0 0 0-4 0z" />
                      <path d="M11.5 10a1.5 1.5 0 1 0 0-3" strokeLinecap="round" />
                      <path d="M1.5 13c.5-2 2.5-3 5.5-3s5 1 5.5 3" strokeLinecap="round" />
                    </svg>
                    <div style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: 16, color: '#a8a8c0', marginBottom: 4 }}>
                      No friends yet
                    </div>
                    <div style={{ fontSize: 12, color: '#6b6b85' }}>
                      Add them by @username or email above.
                    </div>
                  </div>
                )}
                {friends.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                      FRIENDS · {friends.filter(f => f.online).length} ONLINE
                    </div>
                    {[...friends]
                      .sort((a, b) => {
                        const aFav = favoriteFriends.has(a.friendshipId) ? 1 : 0;
                        const bFav = favoriteFriends.has(b.friendshipId) ? 1 : 0;
                        if (aFav !== bFav) return bFav - aFav;
                        return (b.online ? 1 : 0) - (a.online ? 1 : 0);
                      })
                      .map(f => {
                        const isFav = favoriteFriends.has(f.friendshipId);
                        return (
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
                            <button
                              onClick={() => toggleFavoriteFriend(f.friendshipId)}
                              aria-label={isFav ? 'Unfavorite' : 'Favorite'}
                              title={isFav ? 'Unfavorite' : 'Favorite'}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1, color: isFav ? '#fbbf24' : 'rgba(255,255,255,0.25)' }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <polygon points="12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.3 9 8.5 12 2" />
                              </svg>
                            </button>
                            <button onClick={() => removeFriend(f.friendshipId)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}>×</button>
                          </div>
                        );
                      })}
                  </>
                )}
              </>
            )}

          </div>
        ) : (
          /* ── Group chat body ── */
          <>
            {/* ── Members strip ── */}
            {(() => {
              const tripDbId = activeTripDbIdFor(activeGroup);
              if (!tripDbId) return null;
              const isOwner = members.find(m => m.user.id === userId)?.role === 'owner';
              return (
                <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {members.map(m => {
                      const label = m.user.name || m.user.username || (m.user.email ?? '?').split('@')[0];
                      const isSelf = m.user.id === userId;
                      const canRemove = isOwner && !isSelf && m.role !== 'owner';
                      return (
                        <span
                          key={m.id}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: m.role === 'owner' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${m.role === 'owner' ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 999,
                            padding: '3px 9px',
                            fontSize: 11,
                            color: m.role === 'owner' ? '#ddd6fe' : '#e2e8f0',
                          }}
                          title={m.user.email ?? undefined}
                        >
                          {label}{m.role === 'owner' ? ' · owner' : ''}
                          {canRemove && (
                            <button
                              onClick={() => removeMember(m.user.id)}
                              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
                              title="Remove from trip"
                              aria-label={`Remove ${label}`}
                            >×</button>
                          )}
                        </span>
                      );
                    })}
                    {isOwner && (
                      <button
                        onClick={() => setShowInviteRow(v => !v)}
                        style={{
                          background: 'rgba(56,189,248,0.15)',
                          border: '1px solid rgba(56,189,248,0.35)',
                          color: '#bae6fd',
                          borderRadius: 999,
                          padding: '3px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >+ Invite</button>
                    )}
                  </div>
                  {showInviteRow && isOwner && (() => {
                    const memberUserIds = new Set(members.map(m => m.user.id));
                    const invitable = friends.filter(f => !memberUserIds.has(f.id));
                    return (
                      <div
                        style={{
                          marginTop: 10,
                          background: 'rgba(10, 12, 30, 0.95)',
                          border: '1px solid rgba(167, 139, 250, 0.28)',
                          borderRadius: 12,
                          padding: 12,
                          boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
                          display: 'flex', flexDirection: 'column', gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#c7d2fe', textTransform: 'uppercase' }}>
                            Invite to trip
                          </span>
                          <button
                            onClick={() => setShowInviteRow(false)}
                            aria-label="Close invite menu"
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', padding: 0, fontSize: 18, lineHeight: 1 }}
                          >×</button>
                        </div>

                        {friends.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: '4px 0' }}>
                            You don&apos;t have any friends yet. Add them on the Friends tab, then come back.
                          </div>
                        ) : invitable.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: '4px 0' }}>
                            All your friends are already on this trip.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                            {invitable.map(f => {
                              const label = f.name || (f.username ? `@${f.username}` : f.email);
                              const sub = f.username ? `@${f.username}` : f.email;
                              return (
                                <button
                                  key={f.friendshipId}
                                  onClick={() => inviteMember(f.username ? { username: f.username } : { email: f.email })}
                                  disabled={memberLoading}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: '#e2e8f0',
                                    fontSize: 12,
                                    cursor: memberLoading ? 'wait' : 'pointer',
                                    textAlign: 'left',
                                    transition: 'background 120ms',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.10)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                >
                                  <span style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: 'linear-gradient(135deg,#a78bfa,#7dd3fc)',
                                    color: '#0a0a1f',
                                    display: 'grid', placeItems: 'center',
                                    fontSize: 12, fontWeight: 700,
                                    overflow: 'hidden',
                                    flexShrink: 0,
                                  }}>
                                    {f.image
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      ? <img src={f.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      : (label[0]?.toUpperCase() ?? '?')
                                    }
                                  </span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                                    {label !== sub && <div style={{ color: 'rgba(167, 139, 250, 0.7)', fontSize: 10, marginTop: 1 }}>{sub}</div>}
                                  </div>
                                  <span style={{ color: '#bae6fd', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>+ ADD</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            Or by email / @username
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input
                              value={memberInput}
                              onChange={e => setMemberInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !memberLoading) inviteMember(); }}
                              placeholder="someone@example.com"
                              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 12, padding: '7px 10px', outline: 'none' }}
                            />
                            <button
                              onClick={() => inviteMember()}
                              disabled={memberLoading || !memberInput.trim()}
                              style={{
                                padding: '7px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background: memberInput.trim() && !memberLoading ? 'linear-gradient(135deg,#0ea5e9,#a78bfa)' : 'rgba(255,255,255,0.08)',
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: memberInput.trim() && !memberLoading ? 'pointer' : 'not-allowed',
                              }}
                            >Invite</button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {memberError && (
                    <div style={{ marginTop: 6, color: '#fca5a5', fontSize: 11 }}>{memberError}</div>
                  )}
                </div>
              );
            })()}

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chatMsgs.length === 0 && (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13, marginTop: 40 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{String.fromCodePoint(0x1F4AC)}</div>
                  Quiet so far — say hi to your fellow wanderers!
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
                        ? 'linear-gradient(135deg,rgba(56,189,248,0.2),rgba(167, 139, 250,0.2))'
                        : 'rgba(255,255,255,0.07)',
                      border: isMe ? '1px solid rgba(56,189,248,0.3)' : '1px solid rgba(255,255,255,0.08)',
                      color: '#e2e8f0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    }}>{msg.content}</div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* AI suggestions: button to generate + inline list of pending
                suggestions. Without the inline section, the button looked
                broken — it generated suggestions on the server but the user
                stayed in the chat panel and never saw them (SuggestionsSection
                was previously only mounted on /plan/[tripId]/itinerary). */}
            {(() => {
              const trip = trips.find(t => t.location === activeGroup.location);
              const activeTripDbId = trip?.id ?? null;
              if (!CHAT_SUGGESTIONS_ENABLED || !activeTripDbId || !userId) return null;
              const isOwner = (trip?.userId ?? '') === userId;
              const voteMode = trip?.suggestionVoteMode ?? 'advisory';
              return (
                <div style={{ padding: '0 14px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/trips/${activeTripDbId}/suggest-from-chat`, { method: 'POST' });
                      if (res.status === 429) {
                        alert('Daily AI-suggestion limit reached. Try again tomorrow.');
                        return;
                      }
                      if (res.status === 404) {
                        alert('AI suggestions are disabled in this environment.');
                        return;
                      }
                      if (!res.ok) {
                        alert('Could not get suggestions right now.');
                        return;
                      }
                      window.dispatchEvent(new CustomEvent('suggestions:refresh'));
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#fde68a', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {String.fromCodePoint(0x2728)} Suggest itinerary changes
                  </button>
                  <SuggestionsSection
                    tripId={activeTripDbId}
                    currentUserId={userId}
                    isOwner={isOwner}
                    voteMode={voteMode}
                  />
                </div>
              );
            })()}

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
                  background: chatInput.trim() && !chatSending ? 'linear-gradient(135deg,#0ea5e9,#a78bfa)' : 'rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: 15, cursor: chatInput.trim() && !chatSending ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >{String.fromCodePoint(0x27A4)}</button>
            </div>
          </>
        )}

        {/* ── Files overlay (per-trip) ─────────────────────────────────── */}
        {activeFilesTrip && userId && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(6,8,22,0.97)',
            WebkitBackdropFilter: 'blur(24px)', backdropFilter: 'blur(24px)',
            display: 'flex', flexDirection: 'column',
            zIndex: 2,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              // Top-anchored UI MUST clear the iPhone Dynamic Island
              // on Capacitor iOS. The overlay's absolute positioning
              // breaks out of the parent panel's safe-area padding so we
              // re-apply it here directly. See feedback_dynamic_island_top_offset.md.
              padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 18px 14px',
              borderBottom: '1px solid rgba(167,139,250,0.18)',
            }}>
              <button
                onClick={() => setActiveFilesTrip(null)}
                aria-label="Back"
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(148,163,208,0.18)',
                  borderRadius: 8, color: '#e0e7ff', cursor: 'pointer',
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, lineHeight: 1, padding: 0,
                }}
              >{String.fromCodePoint(0x2190)}</button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(167,139,250,0.7)', textTransform: 'uppercase' }}>
                  Files
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#f2f2f8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeFilesTrip.name}
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >{String.fromCodePoint(0x00D7)}</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
              <FileVault tripId={activeFilesTrip.id} currentUserId={userId} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
