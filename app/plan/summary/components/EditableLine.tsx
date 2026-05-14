'use client';

import { useState } from 'react';
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
  line, isEditing, editValue,
  onStartEdit, onEditChange, onCommit, onCancel, onAskGenie,
}: EditableLineProps) {
  const [hovered, setHovered] = useState(false);
  const STAR = String.fromCodePoint(0x2726);

  if (!line.trim()) return <div style={{ height: 8 }} />;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', marginBottom: 2 }}
    >
      {isEditing ? (
        <textarea
          autoFocus
          value={editValue}
          rows={2}
          onChange={e => onEditChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.09)',
            border: '1px solid rgba(129,140,248,0.5)', borderRadius: 8,
            color: '#fff', fontSize: 14, padding: '8px 10px',
            outline: 'none', resize: 'vertical', lineHeight: 1.6,
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      ) : (
        <div
          // stopPropagation so the parent activity row's click handler
          // (which opens the place panel) doesn't fire when the user
          // is actually trying to edit the text inline.
          onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
          style={{
            cursor: 'text', borderRadius: 6, padding: '3px 6px',
            background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
            transition: 'background 0.15s',
          }}
        >
          <MarkdownLine line={line} />
        </div>
      )}

      {/* Genie ✦ button — uses onMouseDown to avoid stealing blur from textarea */}
      {hovered && !isEditing && (
        <button
          onMouseDown={e => { e.preventDefault(); onAskGenie(line); }}
          title="Ask GeKnee for alternatives"
          style={{
            position: 'absolute', top: '50%', right: 4,
            transform: 'translateY(-50%)',
            width: 26, height: 26, borderRadius: '50%', border: 'none',
            background: 'linear-gradient(135deg, rgba(251,191,36,0.8), rgba(167,139,250,0.8))',
            color: '#fff', fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(167,139,250,0.4)',
          }}
        >
          {STAR}
        </button>
      )}
    </div>
  );
}
