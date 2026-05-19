'use client';

import { useCallback, useEffect, useState } from 'react';
import SuggestionCard, { type Suggestion } from './SuggestionCard';

const SPARK = '✨';

interface Props {
  tripId: string;
  currentUserId: string;
  isOwner: boolean;
  voteMode: 'advisory' | 'auto_majority';
}

export default function SuggestionsSection({ tripId, currentUserId, isOwner, voteMode }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/suggestions`);
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    refresh();
    const onRefresh = () => refresh();
    window.addEventListener('suggestions:refresh', onRefresh);
    return () => window.removeEventListener('suggestions:refresh', onRefresh);
  }, [refresh]);

  if (loading && suggestions.length === 0) return null;
  if (suggestions.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-400/20 bg-gradient-to-b from-amber-500/5 to-transparent p-4">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between mb-2"
      >
        <div className="text-sm font-semibold text-amber-200">
          {SPARK} AI Suggestions ({suggestions.length})
        </div>
        <div className="text-xs text-white/40">{collapsed ? 'Show' : 'Hide'}</div>
      </button>
      {!collapsed && (
        <div>
          {suggestions.map(s => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              tripId={tripId}
              currentUserId={currentUserId}
              isOwner={isOwner}
              voteMode={voteMode}
              onChange={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
