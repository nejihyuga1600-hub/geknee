'use client';

import { useEffect, useRef, useState } from 'react';

const THUMB_UP = '\u{1F44D}';
const THUMB_DOWN = '\u{1F44E}';
const SPARK = '✨';
const NOTE = '\u{1F4DD}';

export interface Vote {
  id: string;
  userId: string;
  vote: 'up' | 'down';
  alternative: string | null;
}

export interface Suggestion {
  id: string;
  status: string;
  kind: string;
  dayNumber: number | null;
  summary: string;
  rationale: string;
  votesUpCount: number;
  votesDownCount: number;
  autoApplyAt: string | null;
  votes: Vote[];
}

interface Props {
  suggestion: Suggestion;
  tripId: string;
  currentUserId: string;
  isOwner: boolean;
  voteMode: 'advisory' | 'auto_majority';
  onChange: () => void;
}

export default function SuggestionCard({ suggestion: s, tripId, currentUserId, isOwner, voteMode, onChange }: Props) {
  const myVote = s.votes.find(v => v.userId === currentUserId);
  const [showAltForm, setShowAltForm] = useState(false);
  const [altText, setAltText] = useState(myVote?.alternative ?? '');
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const finalizedRef = useRef(false);

  useEffect(() => {
    if (s.status !== 'pending_apply' || !s.autoApplyAt) {
      setCountdown(null);
      return;
    }
    const target = new Date(s.autoApplyAt).getTime();
    const id = setInterval(async () => {
      const remaining = Math.max(0, target - Date.now());
      setCountdown(remaining);
      if (remaining <= 0 && !finalizedRef.current) {
        finalizedRef.current = true;
        clearInterval(id);
        await fetch(`/api/trips/${tripId}/suggestions/${s.id}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'accept', bySystem: true }),
        });
        onChange();
      }
    }, 500);
    return () => clearInterval(id);
  }, [s.status, s.autoApplyAt, s.id, tripId, onChange]);

  async function vote(direction: 'up' | 'down') {
    setBusy(true);
    await fetch(`/api/trips/${tripId}/suggestions/${s.id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: direction, alternative: altText || undefined }),
    });
    setBusy(false);
    setShowAltForm(false);
    onChange();
  }

  async function clearVote() {
    setBusy(true);
    await fetch(`/api/trips/${tripId}/suggestions/${s.id}/vote`, { method: 'DELETE' });
    setBusy(false);
    onChange();
  }

  async function decide(action: 'accept' | 'reject') {
    setBusy(true);
    await fetch(`/api/trips/${tripId}/suggestions/${s.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    onChange();
  }

  const dayLabel = s.dayNumber === null ? 'Trip-level' : `Day ${s.dayNumber}`;
  const kindLabel = s.kind.replace(/_/g, ' ');

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-3">
      <div className="text-xs text-white/50 mb-1">{SPARK} {dayLabel} {'·'} {kindLabel}</div>
      <div className="font-semibold text-white mb-2">{s.summary}</div>
      <div className="text-sm text-white/70 italic mb-3">{s.rationale}</div>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => myVote?.vote === 'up' ? clearVote() : vote('up')}
          disabled={busy}
          className={`px-3 py-1 rounded-full text-sm border ${myVote?.vote === 'up' ? 'bg-emerald-500/30 border-emerald-400/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
        >
          {THUMB_UP} {s.votesUpCount}
        </button>
        <button
          onClick={() => myVote?.vote === 'down' ? clearVote() : vote('down')}
          disabled={busy}
          className={`px-3 py-1 rounded-full text-sm border ${myVote?.vote === 'down' ? 'bg-rose-500/30 border-rose-400/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
        >
          {THUMB_DOWN} {s.votesDownCount}
        </button>
        <button
          onClick={() => setShowAltForm(v => !v)}
          disabled={busy}
          className="px-3 py-1 rounded-full text-sm border border-white/10 bg-white/5 hover:bg-white/10"
        >
          + Alternative
        </button>
      </div>

      {showAltForm && (
        <div className="mb-3">
          <textarea
            value={altText}
            onChange={e => setAltText(e.target.value.slice(0, 280))}
            placeholder="What would you do instead?"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            rows={2}
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => vote(myVote?.vote ?? 'down')} disabled={busy || !altText.trim()} className="px-3 py-1 rounded-md bg-amber-400 text-black text-sm font-semibold disabled:opacity-50">Save alternative</button>
            <button onClick={() => setShowAltForm(false)} className="px-3 py-1 rounded-md bg-white/5 text-white/60 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {s.votes.filter(v => v.alternative).length > 0 && (
        <div className="border-t border-white/10 pt-2 mb-3">
          <div className="text-xs text-white/40 mb-1">Alternatives:</div>
          {s.votes.filter(v => v.alternative).map(v => (
            <div key={v.id} className="text-sm text-white/70">
              <span className="text-white/40">@{v.userId.slice(0, 6)}:</span> &quot;{v.alternative}&quot;
            </div>
          ))}
        </div>
      )}

      {s.status === 'pending_apply' && countdown !== null && (
        <div className="rounded-md bg-amber-500/15 border border-amber-400/30 px-3 py-2 text-sm text-amber-200">
          Auto-applying in {Math.ceil(countdown / 1000)}s {NOTE} any {THUMB_DOWN} to cancel
        </div>
      )}

      {s.status === 'pending' && (
        <div className="border-t border-white/10 pt-3 flex gap-2">
          {isOwner ? (
            <>
              <button onClick={() => decide('accept')} disabled={busy} className="flex-1 px-3 py-2 rounded-lg bg-emerald-400 text-black font-semibold text-sm disabled:opacity-50">Accept</button>
              <button onClick={() => decide('reject')} disabled={busy} className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm">Reject</button>
            </>
          ) : voteMode === 'auto_majority' ? (
            <div className="text-xs text-white/40">Will auto-apply if the group votes {THUMB_UP}</div>
          ) : (
            <div className="text-xs text-white/40">Waiting on trip owner</div>
          )}
        </div>
      )}
    </div>
  );
}
