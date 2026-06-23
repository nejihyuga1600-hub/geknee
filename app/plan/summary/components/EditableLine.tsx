'use client';

import { useEffect, useRef, useState } from 'react';
import { MarkdownLine } from './MarkdownLine';

// Click-to-edit single line. Renders the line as markdown until clicked,
// then swaps in a textarea. Hovering shows a small ✦ "ask the genie" button
// that emits onAskGenie(line) to escalate the line into the chat panel.

export interface EditableLineProps {
  line: string;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onAskGenie: (line: string) => void;
}

export function EditableLine({
  line,
  // Edit-related props kept on the type for API stability but no longer
  // drive any UI. Per user direction the itinerary is now read-only at
  // the line level — the geknee genie mascot is the canonical way to
  // request changes (it edits via /api/agent/edit and writes back to
  // TripDraft.itinerary). The Ask-genie ✦ button still fires on hover
  // so users can escalate a specific line into the chat with one tap.
  onAskGenie,
}: EditableLineProps) {
  const [hovered, setHovered] = useState(false);
  const STAR = String.fromCodePoint(0x2726);
  // Textarea ref retained for future use if we re-enable inline edit
  // for power users; currently the editing branch never renders.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  void textareaRef;

  // Auto-grow effect is a no-op when isEditing is locked false, but
  // keep the import so ESLint doesn't flag the unused-import path on
  // useEffect when we narrow the body below.
  useEffect(() => { /* edit disabled */ }, []);

  if (!line.trim()) return <div style={{ height: 8 }} />;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', marginBottom: 2 }}
    >
      {/* Read-only line render. The previous textarea branch is gone —
          per user direction, itinerary edits route through the genie
          mascot so the AI always sees the full context and persists
          via /api/agent/edit. The line is no longer clickable for
          edit, but still bubbles its click to the parent activity row
          so tapping the text opens the place panel on the map. */}
      <div
        style={{
          borderRadius: 6, padding: '3px 6px',
          background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        <MarkdownLine line={line} />
      </div>

      {/* Removed 2026-06-23: inline ✦ "ask genie" star button.
          Users now edit itineraries through the geknee chat mascot AI
          (chat panel → "change Day 3 lunch to ramen"). Inline edit
          chrome on every line was redundant + visually noisy. The
          onAskGenie prop stays available in case another surface
          re-introduces the affordance later. */}
    </div>
  );
}
