'use client';

import {
  Suspense, useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';

const BookTabDynamic = dynamic(() => import('./BookTab'), { ssr: false });
const FileVault      = dynamic(() => import('@/app/components/FileVault'), { ssr: false });

const DayMap = dynamic(() => import('./DayMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 320, borderRadius: 12, background: 'rgba(255,255,255,0.04)' }} />
  ),
});

const PlanningMapDynamic = dynamic(() => import('./PlanningMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 460, borderRadius: 14, background: 'rgba(255,255,255,0.04)' }} />
  ),
});

// ── Types ──────────────────────────────────────────────────────────────────────
interface Section {
  id: string;
  heading: string;     // text after "## ", empty for preamble
  lines: string[];     // raw markdown lines (non-heading)
}

interface EditTarget {
  sectionIdx: number;
  lineIdx: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RouteStop {
  city: string;
  startDate?: string;
  endDate?: string;
}

interface DayWeather {
  date:      string;
  tempMin:   number;
  tempMax:   number;
  condition: string;
  icon:      string;
  iconUrl:   string;
  pop:       number;
}

type BookmarkCategory = 'food' | 'activities' | 'hotels' | 'shopping' | 'other';
interface Bookmark {
  id: string;
  name: string;
  coords: [number, number]; // [lng, lat]
  category: BookmarkCategory;
  placeId?: string;
}

// ── parseLines ─────────────────────────────────────────────────────────────────
function parseLines(rawLines: string[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { id: 's0', heading: '', lines: [] };
  let idx = 1;

  for (const line of rawLines) {
    const trimmed = line.trim();
    const boldDay = trimmed.match(/^\*\*(Day\s+\d+[^*]*)\*\*\s*:?\s*$/i);
    if (line.startsWith('## ') || line.startsWith('### ') || boldDay) {
      if (current.heading || current.lines.some(l => l.trim())) {
        sections.push(current);
      }
      let heading = '';
      if (line.startsWith('## '))       heading = line.slice(3).trim();
      else if (line.startsWith('### ')) heading = line.slice(4).trim();
      else if (boldDay)                 heading = boldDay[1].trim();
      current = { id: `s${idx++}`, heading, lines: [] };
    } else if (line !== '---') {
      current.lines.push(line);
    }
  }
  if (current.heading || current.lines.some(l => l.trim())) {
    sections.push(current);
  }

  // Drop fully-empty preamble sections
  return sections.filter(
    s => s.heading || s.lines.some(l => l.trim())
  );
}

// ── Inline markdown renderer ───────────────────────────────────────────────────
function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const bold = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/);
    if (bold) {
      if (bold[1]) parts.push(<span key={key++}>{bold[1]}</span>);
      parts.push(<strong key={key++} style={{ color: '#e2e8f0' }}>{bold[2]}</strong>);
      remaining = bold[3];
      continue;
    }
    const italic = remaining.match(/^(.*?)\*(.+?)\*(.*)/);
    if (italic) {
      if (italic[1]) parts.push(<span key={key++}>{italic[1]}</span>);
      parts.push(<em key={key++} style={{ color: '#cbd5e1' }}>{italic[2]}</em>);
      remaining = italic[3];
      continue;
    }
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function MarkdownLine({ line }: { line: string }) {
  if (line.startsWith('### ')) return (
    <h3 style={{ color: '#a5b4fc', fontSize: 15, fontWeight: 600, marginTop: 14, marginBottom: 4 }}>
      {line.slice(4)}
    </h3>
  );
  if (line.startsWith('# ')) return (
    <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, marginBottom: 12 }}>{line.slice(2)}</h1>
  );
  if (line.startsWith('- ') || line.startsWith('* ')) return (
    <li style={{ color: 'rgba(255,255,255,0.82)', marginBottom: 4, marginLeft: 16, listStyle: 'disc' }}>
      {renderInline(line.slice(2))}
    </li>
  );
  if (/^\d+\.\s/.test(line)) return (
    <li style={{ color: 'rgba(255,255,255,0.82)', marginBottom: 4, marginLeft: 16 }}>
      {renderInline(line.replace(/^\d+\.\s/, ''))}
    </li>
  );
  if (!line.trim()) return <div style={{ height: 8 }} />;
  return (
    <p style={{ color: 'rgba(255,255,255,0.82)', lineHeight: 1.75, marginBottom: 4 }}>
      {renderInline(line)}
    </p>
  );
}


// ── Genie character (pure CSS, 64 × 118 px) ───────────────────────────────────
function GenieCharacter({ speaking }: { speaking: boolean }) {
  const STAR = String.fromCodePoint(0x2736);
  return (
    <div style={{ position: 'relative', width: 64, height: 118, pointerEvents: 'none' }}>

      {/* Jewel */}
      <div style={{
        position: 'absolute', top: 0, left: 27, width: 10, height: 10,
        background: 'radial-gradient(circle at 35% 35%, #7dd3fc, #0ea5e9)',
        borderRadius: '50%', boxShadow: '0 0 8px 3px rgba(56,189,248,0.8)', zIndex: 5,
      }} />

      {/* Turban */}
      <div style={{
        position: 'absolute', top: 6, left: 10, width: 44, height: 20,
        background: 'linear-gradient(135deg, #fbbf24, #d97706)',
        borderRadius: '50% 50% 20% 20%', zIndex: 4,
        boxShadow: '0 2px 8px rgba(245,158,11,0.4)',
      }}>
        <div style={{
          position: 'absolute', bottom: 4, left: 6, right: 6, height: 2,
          background: 'rgba(255,255,255,0.35)', borderRadius: 2,
        }} />
      </div>

      {/* Head */}
      <div style={{
        position: 'absolute', top: 20, left: 11, width: 42, height: 42,
        background: 'radial-gradient(circle at 40% 35%, #fde68a, #f59e0b)',
        borderRadius: '50%', zIndex: 3,
        boxShadow: '0 4px 12px rgba(251,191,36,0.3)',
      }}>
        {/* Left eye */}
        <div style={{ position: 'absolute', top: 12, left: 6, width: 13, height: 16, background: '#fff', borderRadius: '50%' }}>
          <div style={{ position: 'absolute', top: 3, left: 2, width: 8, height: 10, background: '#1d4ed8', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', top: 2, left: 7, width: 4, height: 4, background: '#fff', borderRadius: '50%' }} />
        </div>
        {/* Right eye */}
        <div style={{ position: 'absolute', top: 12, right: 6, width: 13, height: 16, background: '#fff', borderRadius: '50%' }}>
          <div style={{ position: 'absolute', top: 3, left: 2, width: 8, height: 10, background: '#1d4ed8', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', top: 2, left: 7, width: 4, height: 4, background: '#fff', borderRadius: '50%' }} />
        </div>
        {/* Cheeks */}
        <div style={{ position: 'absolute', top: 24, left: 2, width: 10, height: 6, background: 'rgba(251,113,133,0.45)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: 24, right: 2, width: 10, height: 6, background: 'rgba(251,113,133,0.45)', borderRadius: '50%' }} />
        {/* Smile */}
        <div style={{
          position: 'absolute', bottom: 9, left: '50%', transform: 'translateX(-50%)',
          width: 16, height: 7, border: '2px solid #92400e',
          borderTop: 'none', borderRadius: '0 0 8px 8px',
        }} />
      </div>

      {/* Body */}
      <div style={{
        position: 'absolute', top: 56, left: 10, width: 44, height: 28,
        background: 'linear-gradient(180deg, #6d28d9, #4c1d95)',
        borderRadius: '12px 12px 8px 8px', zIndex: 2,
        boxShadow: '0 4px 14px rgba(109,40,217,0.5)',
      }}>
        {/* Belt */}
        <div style={{
          position: 'absolute', top: 8, left: 0, right: 0, height: 5,
          background: 'linear-gradient(90deg, #d97706, #fbbf24 50%, #d97706)',
        }} />
        {/* Left arm */}
        <div style={{
          position: 'absolute', top: 4, left: -12, width: 16, height: 7,
          background: '#5b21b6', borderRadius: 999, transform: 'rotate(22deg)',
        }} />
        {/* Right arm */}
        <div style={{
          position: 'absolute', top: 4, right: -12, width: 16, height: 7,
          background: '#5b21b6', borderRadius: 999, transform: 'rotate(-22deg)',
        }} />
      </div>

      {/* Tail segments */}
      {([36, 26, 16] as const).map((w, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: 82 + i * 11,
          left: (64 - w) / 2,
          width: w,
          height: i === 2 ? 10 : 12,
          background: i === 0
            ? 'linear-gradient(180deg, #5b21b6, #4c1d95)'
            : i === 1
            ? 'linear-gradient(180deg, #4c1d95, #3b0764)'
            : 'linear-gradient(180deg, #3b0764, #2e1065)',
          borderRadius: i === 2 ? '0 0 10px 10px' : '0 0 6px 6px',
          zIndex: 1,
        }} />
      ))}

      {/* Speaking sparkles */}
      {speaking && (
        <>
          <span style={{ position: 'absolute', top: 8, right: -4, color: '#38bdf8', fontSize: 11, animation: 'genieSpark 1.1s ease-in-out infinite' }}>{STAR}</span>
          <span style={{ position: 'absolute', top: 40, left: -6, color: '#a78bfa', fontSize: 9, animation: 'genieSpark 0.9s ease-in-out infinite 0.4s' }}>{STAR}</span>
          <span style={{ position: 'absolute', bottom: 20, right: -8, color: '#fbbf24', fontSize: 13, animation: 'genieSpark 1.3s ease-in-out infinite 0.2s' }}>{STAR}</span>
        </>
      )}
    </div>
  );
}

// ── Chat panel ─────────────────────────────────────────────────────────────────
interface ChatPanelProps {
  tab: 'genie' | 'friends';
  onTabChange: (t: 'genie' | 'friends') => void;
  // genie
  genieMessages: ChatMessage[];
  chatStreaming: boolean;
  genieInput: string;
  onGenieInputChange: (v: string) => void;
  onGenieSend: () => void;
  // inspiration image
  inspImagePreview: string;
  inspIsVideo: boolean;
  inspFileRef: React.RefObject<HTMLInputElement | null>;
  onInspFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearInspImage: () => void;
  // friends
  friendMessages: {id:string;author:string;content:string;timestamp:number}[];
  friendInput: string;
  friendAuthor: string;
  onFriendInputChange: (v: string) => void;
  onFriendAuthorChange: (v: string) => void;
  onFriendSend: () => void;
  onClose: () => void;
}

function ChatPanel({
  tab, onTabChange,
  genieMessages, chatStreaming, genieInput, onGenieInputChange, onGenieSend,
  inspImagePreview, inspIsVideo, inspFileRef, onInspFileSelect, onClearInspImage,
  friendMessages, friendInput, friendAuthor, onFriendInputChange, onFriendAuthorChange, onFriendSend,
  onClose,
}: ChatPanelProps) {
  const genieEndRef  = useRef<HTMLDivElement>(null);
  const friendEndRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const STAR = String.fromCodePoint(0x2726);

  useEffect(() => { genieEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [genieMessages]);
  useEffect(() => { friendEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [friendMessages]);
  useEffect(() => { inputRef.current?.focus(); }, [tab]);

  const tabBtn = (t: 'genie'|'friends', label: string) => (
    <button onClick={() => onTabChange(t)} style={{
      flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 700,
      background: tab === t ? 'rgba(109,40,217,0.25)' : 'transparent',
      border: 'none', borderBottom: `2px solid ${tab === t ? '#a78bfa' : 'transparent'}`,
      color: tab === t ? '#a78bfa' : 'rgba(255,255,255,0.35)',
      cursor: 'pointer', transition: 'all 0.15s',
    }}>{label}</button>
  );

  return (
    <div style={{
      position: 'absolute', bottom: 96, right: 0, width: 340, maxHeight: '60vh',
      background: 'rgba(6,8,22,0.96)', backdropFilter: 'blur(20px)',
      border: '1px solid rgba(129,140,248,0.3)', borderRadius: 20,
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(167,139,250,0.08)',
      animation: 'chatSlideUp 0.22s ease-out', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px 0', borderBottom: '1px solid rgba(129,140,248,0.15)',
        background: 'rgba(109,40,217,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#a78bfa', fontSize: 13, fontWeight: 700 }}>GeKnee {STAR} Trip Chat</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px',
          }}>{String.fromCodePoint(0x00D7)}</button>
        </div>
        <div style={{ display: 'flex' }}>
          {tabBtn('genie',   String.fromCodePoint(0x2726) + ' AI Genie')}
          {tabBtn('friends', String.fromCodePoint(0x1F465) + ' Friends')}
        </div>
      </div>

      {/* ── AI Genie tab ── */}
      {tab === 'genie' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {genieMessages.length === 0 && (
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', marginTop: 24, lineHeight: 1.7 }}>
                Ask me anything about your trip!{'\n'}
                Try: &ldquo;Swap Day 2 dinner&rdquo; or &ldquo;What should I pack?&rdquo;
              </p>
            )}
            {genieMessages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%', padding: '9px 13px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(129,140,248,0.2))'
                  : 'rgba(255,255,255,0.07)',
                border: msg.role === 'user'
                  ? '1px solid rgba(56,189,248,0.3)'
                  : '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
                {i === genieMessages.length - 1 && msg.role === 'assistant' && chatStreaming && (
                  <span style={{
                    display: 'inline-block', width: 2, height: 12,
                    background: '#a78bfa', marginLeft: 2,
                    animation: 'blink 0.9s step-end infinite', verticalAlign: 'text-bottom',
                  }} />
                )}
              </div>
            ))}
            <div ref={genieEndRef} />
          </div>
          {(() => {
            const limitReached = genieMessages.filter(m => m.role === 'user').length >= 15;
            return limitReached ? (
              <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                  Message limit reached (15/15) {String.fromCodePoint(0x2728)}
                </span>
              </div>
            ) : (
              <>
                {inspImagePreview && (
                  <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={inspImagePreview} alt="preview" style={{ height: 52, width: 72, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(129,140,248,0.4)' }} />
                      {inspIsVideo && <div style={{ position: 'absolute', top: 3, left: 3, background: 'rgba(0,0,0,0.65)', borderRadius: 4, fontSize: 9, color: '#fff', padding: '1px 4px', fontWeight: 700 }}>VIDEO</div>}
                    </div>
                    <div style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{String.fromCodePoint(0x2728)} {inspIsVideo ? 'Video frame captured' : 'Image ready'} — caption optional</div>
                    <button onClick={onClearInspImage} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16 }}>{String.fromCodePoint(0x00D7)}</button>
                  </div>
                )}
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={inspFileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={onInspFileSelect} />
                <button onClick={() => inspFileRef.current?.click()} title="Add inspiration image/video"
                  style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: inspImagePreview ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.06)', color: inspImagePreview ? '#a78bfa' : 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {String.fromCodePoint(0x1F4F7)}
                </button>
                <input
                  ref={inputRef}
                  value={genieInput}
                  onChange={e => onGenieInputChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onGenieSend(); } }}
                  placeholder={inspImagePreview ? 'Add a caption (optional)...' : 'Ask your genie...'}
                  disabled={chatStreaming}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, color: '#fff', fontSize: 13,
                    padding: '9px 12px', outline: 'none',
                  }}
                />
                <button
                  onClick={onGenieSend}
                  disabled={chatStreaming || (!genieInput.trim() && !inspImagePreview)}
                  style={{
                    width: 36, height: 36, borderRadius: 10, border: 'none',
                    background: (genieInput.trim() || inspImagePreview) && !chatStreaming
                      ? 'linear-gradient(135deg, #7c3aed, #4f46e5)'
                      : 'rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: 15,
                    cursor: genieInput.trim() && !chatStreaming ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  {String.fromCodePoint(0x27A4)}
                </button>
              </div>
              </>
            );
          })()}
        </>
      )}

      {/* ── Friends tab ── */}
      {tab === 'friends' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {friendMessages.length === 0 && (
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', marginTop: 24, lineHeight: 1.7 }}>
                No messages yet.{'\n'}Share the invite link so friends can join!
              </p>
            )}
            {friendMessages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', paddingLeft: 4 }}>{msg.author}</span>
                <div style={{
                  alignSelf: msg.author === (friendAuthor || 'You') ? 'flex-end' : 'flex-start',
                  maxWidth: '88%', padding: '9px 13px',
                  borderRadius: msg.author === (friendAuthor || 'You') ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.author === (friendAuthor || 'You')
                    ? 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(129,140,248,0.2))'
                    : 'rgba(255,255,255,0.07)',
                  border: msg.author === (friendAuthor || 'You')
                    ? '1px solid rgba(56,189,248,0.3)'
                    : '1px solid rgba(255,255,255,0.08)',
                  color: '#e2e8f0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={friendEndRef} />
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              value={friendAuthor}
              onChange={e => onFriendAuthorChange(e.target.value)}
              placeholder="Your name..."
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: '#fff', fontSize: 12, padding: '6px 10px', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                ref={inputRef}
                value={friendInput}
                onChange={e => onFriendInputChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onFriendSend(); } }}
                placeholder="Message your group..."
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10, color: '#fff', fontSize: 13,
                  padding: '9px 12px', outline: 'none',
                }}
              />
              <button
                onClick={onFriendSend}
                disabled={!friendInput.trim()}
                style={{
                  width: 36, height: 36, borderRadius: 10, border: 'none',
                  background: friendInput.trim() ? 'linear-gradient(135deg, #0ea5e9, #6366f1)' : 'rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: 15,
                  cursor: friendInput.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                {String.fromCodePoint(0x27A4)}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Editable line ──────────────────────────────────────────────────────────────
interface EditableLineProps {
  line: string;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onAskGenie: (line: string) => void;
}

function EditableLine({
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
          onClick={onStartEdit}
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

// ── Day image strip ────────────────────────────────────────────────────────────
function DayImages({ heading, location }: { heading: string; location: string }) {
  const [imgs, setImgs] = useState<{ url: string; label: string }[]>([]);

  useEffect(() => {
    const cityMatch = heading.match(/:\s*([^—–\-|,\n]+)/);
    const city = cityMatch ? cityMatch[1].trim() : location;

    const queries = [
      `${city} travel sightseeing`,
      `${city} local food cuisine`,
      `${city} landmark monument`,
    ];

    let cancelled = false;
    Promise.all(
      queries.map(async (q, i) => {
        try {
          const res = await fetch(`/api/images?q=${encodeURIComponent(q)}&n=1`);
          const data: { images: string[] } = await res.json();
          const url = data.images[0] ?? '';
          const label = i === 0 ? 'Activities' : i === 1 ? 'Food' : 'Sights';
          return url ? { url, label } : null;
        } catch { return null; }
      })
    ).then(results => {
      if (!cancelled) setImgs(results.filter((r): r is { url: string; label: string } => !!r));
    });

    return () => { cancelled = true; };
  }, [heading, location]);

  if (imgs.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 4, overflowX: 'auto', paddingBottom: 2 }}>
      {imgs.map((img, i) => (
        <div key={i} style={{ flexShrink: 0, position: 'relative' }}>
          <img
            src={img.url}
            alt={img.label}
            style={{
              width: 140, height: 90, objectFit: 'cover', borderRadius: 10,
              display: 'block', border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
          <span style={{
            position: 'absolute', bottom: 5, left: 6,
            fontSize: 9, fontWeight: 700, color: '#fff',
            textShadow: '0 1px 4px #000',
            background: 'rgba(0,0,0,0.45)', borderRadius: 4, padding: '1px 5px',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            {img.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Weather bar ────────────────────────────────────────────────────────────────
function WeatherBar({ days, unit }: { days: DayWeather[]; unit: 'C' | 'F' }) {
  function toDisplay(c: number) {
    return unit === 'F' ? Math.round(c * 9 / 5 + 32) : c;
  }
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12, marginTop: 4 }}>
      {days.slice(0, 7).map(d => (
        <div key={d.date} style={{
          flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)',
          borderRadius: 10, padding: '6px 10px', minWidth: 72,
        }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 1, whiteSpace: 'nowrap' }}>
            {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <img src={d.iconUrl} alt={d.condition} style={{ width: 34, height: 34 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#7dd3fc', whiteSpace: 'nowrap' }}>
            {toDisplay(d.tempMax)}&deg;&thinsp;/&thinsp;{toDisplay(d.tempMin)}&deg;{unit}
          </span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 1, lineHeight: 1.3 }}>
            {d.condition}
          </span>
          {d.pop > 0.2 && (
            <span style={{ fontSize: 9, color: '#93c5fd', marginTop: 2 }}>
              {String.fromCodePoint(0x1F4A7)} {Math.round(d.pop * 100)}%
            </span>
          )}
        </div>
      ))}
      {days.length === 0 && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', padding: '8px 0' }}>
          Weather unavailable
        </span>
      )}
    </div>
  );
}

// ── Activity block grouping ────────────────────────────────────────────────────
/** Matches lines like **9:00 AM** or **12:30 PM** at the start */
function isTimeLine(line: string): boolean {
  return /^\*\*\d{1,2}:\d{2}\s*[AP]M\*\*/.test(line.trim());
}

type ActivityGroup =
  | { type: 'activity'; headline: string; headlineIdx: number; details: { line: string; idx: number }[] }
  | { type: 'plain';    line: string;     idx: number };

function groupLines(lines: string[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  let current: Extract<ActivityGroup, { type: 'activity' }> | null = null;
  lines.forEach((line, idx) => {
    if (isTimeLine(line)) {
      if (current) groups.push(current);
      current = { type: 'activity', headline: line, headlineIdx: idx, details: [] };
    } else if (current) {
      current.details.push({ line, idx });
    } else {
      groups.push({ type: 'plain', line, idx });
    }
  });
  if (current) groups.push(current);
  return groups;
}

// ── Place extraction (module-level, shared by ActivityBlock + SectionCard) ─────
const _GENERIC_TERMS = new Set([
  'morning','afternoon','evening','night','breakfast','lunch','dinner','brunch',
  'day','hotel','hostel','accommodation','transport','taxi','bus','train','metro',
  'subway','flight','airport','station','overview','tips','highlights','optional',
  'note','budget','local','traditional','free','time','check','arrive','depart',
  'explore','walk','wander','visit','stop','area','region','neighborhood','district',
  'center','centre','road',
]);
const _FOOD_COMMERCIAL = new Set([
  'banana','ramen','sushi','croissant','baumkuchen','mochi','takoyaki','tempura',
  'tonkatsu','udon','soba','matcha','sake','beer','wine','coffee','tea','cake',
  'cookie','candy','chocolate','snack','sandwich','pizza','pasta','noodle',
  'dumpling','gyoza','onigiri','kebab','burger','taco','curry','pho','crepe',
  'waffle','gelato','souvenir','shop','store','sweets','treats',
]);
const _PLACE_INDICATORS = new Set([
  'temple','shrine','museum','gallery','park','garden','palace','castle',
  'tower','bridge','market','bazaar','quarter','harbor','harbour','beach',
  'lake','river','mountain','hill','street','avenue','square','plaza',
  'cathedral','church','mosque','fort','ruins','monument','memorial','arena',
  'stadium','hall','crossing','viewpoint','waterfall','canyon','valley',
  'island','peninsula','bay','cliff','cave','falls','pagoda','gate',
]);

function extractPlace(text: string): string | null {
  const bolds = [...text.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1].trim());
  if (!bolds.length) return null;
  function score(name: string): number {
    if (/^[\d:]+\s*[AP]M$/i.test(name)) return -9999;
    if (name.length < 4) return -9999;
    if (!/^[A-Z]/.test(name)) return -9000;
    const lower = name.toLowerCase();
    const words = lower.split(/\s+/);
    if (words.every(w => _GENERIC_TERMS.has(w))) return -8000;
    if (words.some(w => _FOOD_COMMERCIAL.has(w)) || _FOOD_COMMERCIAL.has(lower)) return -7000;
    const hasIndicator = words.some(w => _PLACE_INDICATORS.has(w));
    let s = name.length + words.length * 3;
    if (hasIndicator) s += 60;
    // Single-word names only qualify if they contain a place indicator
    if (words.length === 1 && !hasIndicator) return -500;
    return s;
  }
  const best = bolds.reduce<{ name: string; score: number } | null>((acc, name) => {
    const s = score(name);
    return !acc || s > acc.score ? { name, score: s } : acc;
  }, null);
  // Require score >= 15 (multi-word proper noun) OR >= 65 (has place indicator)
  return best && best.score >= 15 ? best.name : null;
}

// ── Place image — Google Places → Wikidata P18 → Wikipedia → Commons ───────────
// imgCache: '' means "no image found", undefined means "not yet fetched"
const imgCache = new Map<string, string>();

const _FOOD_DESC_RE = /\b(dish|cuisine|food|recipe|meal|dessert|drink|beverage|cocktail|snack|sauce|bread|cake|soup|noodle|rice dish|pasta)\b/i;

function _landscapeScore(w?: number, h?: number): number {
  if (!w || !h) return 0;
  return w / h;
}

async function fetchPlaceImage(place: string, city?: string): Promise<string | null> {
  const q = city ? `${place} ${city}` : place;

  // 1. Google Places textsearch → place-photo proxy (best: actual location photos)
  try {
    const sp = new URLSearchParams({ name: place, ...(city ? { location: city } : {}) });
    const r = await fetch(`/api/place-images?${sp}`);
    const d: { images: string[] } = await r.json();
    if (d.images.length > 0) return d.images[0];
  } catch {}

  // 2. Wikidata P18 — canonical exterior/building photo
  try {
    const sp = new URLSearchParams({ action:'wbsearchentities', search: q, language:'en', limit:'3', format:'json', origin:'*' });
    const r = await fetch(`https://www.wikidata.org/w/api.php?${sp}`);
    const d = await r.json();
    for (const entity of (d.search ?? []).slice(0, 3) as {id:string}[]) {
      const r2 = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${entity.id}.json`);
      const d2 = await r2.json();
      const p18 = d2.entities?.[entity.id]?.claims?.P18;
      const filename: string | undefined = p18?.[0]?.mainsnak?.datavalue?.value;
      if (filename) {
        const slug = encodeURIComponent(filename.replace(/\s+/g, '_'));
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${slug}?width=800`;
      }
    }
  } catch {}

  // 2. Wikipedia REST summary — skip if description is food
  try {
    const slug = encodeURIComponent(place.replace(/\s+/g, '_'));
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
    if (r.ok) {
      const d = await r.json();
      const desc: string = d.description ?? '';
      const url: string | null = d.originalimage?.source ?? d.thumbnail?.source ?? null;
      if (url && !_FOOD_DESC_RE.test(desc)) return url;
    }
  } catch {}

  // 3. Wikipedia search (with city context) → top 3 results
  try {
    const p = new URLSearchParams({ action:'query', list:'search', srsearch: q, srlimit:'3', format:'json', origin:'*' });
    const r = await fetch(`https://en.wikipedia.org/w/api.php?${p}`);
    const d = await r.json();
    for (const hit of (d.query?.search ?? []) as {title:string}[]) {
      const slug = encodeURIComponent(hit.title.replace(/\s+/g, '_'));
      const r2 = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
      if (r2.ok) {
        const d2 = await r2.json();
        const desc: string = d2.description ?? '';
        const url: string | null = d2.originalimage?.source ?? d2.thumbnail?.source ?? null;
        if (url && !_FOOD_DESC_RE.test(desc)) return url;
      }
    }
  } catch {}

  // 4. Wikimedia Commons — search with exterior/location bias, prefer landscape images
  try {
    const searchTerm = `${q} (exterior OR building OR street OR entrance OR facade OR view)`;
    const p = new URLSearchParams({
      action:'query', generator:'search', gsrsearch: searchTerm,
      gsrnamespace:'6', gsrlimit:'12', prop:'imageinfo', iiprop:'url|mime|size',
      format:'json', origin:'*',
    });
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${p}`);
    const d = await r.json();
    type PageInfo = { imageinfo?: { url: string; mime: string; width?: number; height?: number }[] };
    const pages = (Object.values(d.query?.pages ?? {}) as PageInfo[])
      .filter(pg => {
        const info = pg.imageinfo?.[0];
        return info && info.mime.startsWith('image/') && !info.url.endsWith('.svg');
      })
      .sort((a, b) =>
        _landscapeScore(b.imageinfo![0].width, b.imageinfo![0].height) -
        _landscapeScore(a.imageinfo![0].width, a.imageinfo![0].height)
      );
    if (pages.length > 0) return pages[0].imageinfo![0].url;
  } catch {}

  return null;
}

function PlaceImage({ place, height, city }: { place: string; height: number; city?: string }) {
  const cacheKey = city ? `${place}||${city}` : place;
  const cached = imgCache.has(cacheKey) ? (imgCache.get(cacheKey) || null) : undefined;
  const [src, setSrc] = useState<string | null | undefined>(cached);

  useEffect(() => {
    if (imgCache.has(cacheKey)) { setSrc(imgCache.get(cacheKey) || null); return; }
    fetchPlaceImage(place, city).then(url => {
      imgCache.set(cacheKey, url ?? '');
      setSrc(url);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return (
    <div style={{
      width: '100%', height, borderRadius: 12, overflow: 'hidden',
      background: 'rgba(255,255,255,0.05)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      {src && (
        <>
          <img src={src} alt={place} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            background: 'linear-gradient(rgba(0,0,0,0.75), transparent)',
            padding: '10px 12px 24px',
          }}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: 0.2 }}>{place}</span>
          </div>
        </>
      )}
    </div>
  );
}

interface ActivityBlockProps {
  group: Extract<ActivityGroup, { type: 'activity' }>;
  sectionIdx: number;
  editTarget: EditTarget | null;
  editValue: string;
  onStartEdit: (sectionIdx: number, lineIdx: number, current: string) => void;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onAskGenie: (line: string) => void;
  onHoverPlace: (place: string | null) => void;
  activityNumber?: number;
}

function ActivityBlock({
  group, sectionIdx, editTarget, editValue,
  onStartEdit, onEditChange, onCommit, onCancel, onAskGenie, onHoverPlace, activityNumber,
}: ActivityBlockProps) {
  const [hovered, setHovered] = useState(false);
  const hasDetails = group.details.some(d => d.line.trim());

  return (
    <div
      style={{ marginBottom: 6 }}
      onMouseEnter={() => { setHovered(true); const p = extractPlace(group.headline); if (p) onHoverPlace(p); }}
      onMouseLeave={() => { setHovered(false); onHoverPlace(null); }}
    >
      {/* Headline row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        {activityNumber !== undefined ? (
          <div style={{
            flexShrink: 0, marginTop: 4,
            width: 20, height: 20, borderRadius: '50%',
            background: 'rgba(56,189,248,0.15)',
            border: '1.5px solid rgba(56,189,248,0.45)',
            color: '#38bdf8', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{activityNumber}</div>
        ) : (
          <div style={{ width: 20, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditableLine
            line={group.headline}
            isEditing={editTarget?.sectionIdx === sectionIdx && editTarget?.lineIdx === group.headlineIdx}
            editValue={editValue}
            onStartEdit={() => onStartEdit(sectionIdx, group.headlineIdx, group.headline)}
            onEditChange={onEditChange}
            onCommit={onCommit}
            onCancel={onCancel}
            onAskGenie={onAskGenie}
          />
        </div>
      </div>

      {/* Details — grid-row collapse: 0fr when closed (zero height, no layout shift) */}
      {hasDetails && (
        <div style={{
          display: 'grid',
          gridTemplateRows: hovered ? '1fr' : '0fr',
          opacity: hovered ? 1 : 0,
          transition: hovered
            ? 'grid-template-rows 0.12s ease, opacity 0.12s ease'
            : 'grid-template-rows 4s ease, opacity 4s ease',
          pointerEvents: hovered ? 'auto' : 'none',
        }}>
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              marginLeft: 24, marginTop: 2, marginBottom: 4,
              paddingLeft: 12,
              borderLeft: '2px solid rgba(56,189,248,0.2)',
            }}>
              {group.details.map(({ line, idx }) => {
                const detailPlace = extractPlace(line);
                return (
                  <div
                    key={idx}
                    onMouseEnter={detailPlace ? () => onHoverPlace(detailPlace) : undefined}
                  >
                    <EditableLine
                      line={line}
                      isEditing={editTarget?.sectionIdx === sectionIdx && editTarget?.lineIdx === idx}
                      editValue={editValue}
                      onStartEdit={() => onStartEdit(sectionIdx, idx, line)}
                      onEditChange={onEditChange}
                      onCommit={onCommit}
                      onCancel={onCancel}
                      onAskGenie={onAskGenie}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section card ───────────────────────────────────────────────────────────────
interface SectionCardProps {
  section: Section;
  sectionIdx: number;
  editTarget: EditTarget | null;
  editValue: string;
  onStartEdit: (sectionIdx: number, lineIdx: number, current: string) => void;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onAskGenie: (line: string) => void;
  location: string;
  allStops?: RouteStop[];
  weatherDays?: DayWeather[];
  weatherUnit: 'C' | 'F';
  replanning: boolean;
  onReplan: () => void;
}

function SectionCard({
  section, sectionIdx, editTarget, editValue,
  onStartEdit, onEditChange, onCommit, onCancel, onAskGenie, location, allStops,
  weatherDays, weatherUnit, replanning, onReplan,
}: SectionCardProps) {
  const isDay  = /day[\s\-]*\d|day\s+(one|two|three|four|five|six|seven|eight|nine|ten)/i.test(section.heading);
  const isCity = !isDay && (allStops ?? []).some(
    s => section.heading.trim().toLowerCase().includes(s.city.toLowerCase())
  );
  const isTips = /tip|advice|practical|budget|packing|note|reminder|essential|important|safety|currency|visa|weather|transport|getting|overview|summary|introduction|highlight|must.do|must.see/i.test(section.heading);
  // Show map for day/city sections AND any substantive non-tips section with content
  const isDayOrCity = isDay || isCity || (!isTips && section.lines.filter(l => l.trim()).length >= 3);
  const mapLocation = isCity ? section.heading.trim() : location;
  const groups = isDayOrCity ? groupLines(section.lines) : null;
  const [resolvedPlaces, setResolvedPlaces] = useState<string[]>([]);
  const [hoveredPlace, setHoveredPlace] = useState<string | null>(null);
  const [placeLeaving, setPlaceLeaving] = useState(false);
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hoverPlace = useCallback((place: string | null) => {
    if (hoverClearTimer.current) clearTimeout(hoverClearTimer.current);
    if (place !== null) {
      setPlaceLeaving(false);
      setHoveredPlace(place);
    } else {
      // Start fade-out immediately, remove from DOM after 2s
      setPlaceLeaving(true);
      hoverClearTimer.current = setTimeout(() => {
        setHoveredPlace(null);
        setPlaceLeaving(false);
      }, 2000);
    }
  }, []);

  // Build activity number map and ordered place list for DayMap
  const activityGroups = groups?.filter(g => g.type === 'activity') ?? [];
  const activityNumberMap = new Map<number, number>(
    activityGroups.map((g, i) => [g.headlineIdx, i + 1])
  );
  // One place per activity block (in order) — used to number DayMap pins
  const orderedActivityPlaces = activityGroups
    .map(g => extractPlace(g.headline))
    .filter((p): p is string => p !== null);

  function renderLines(linesToRender: typeof section.lines, baseIdx = 0) {
    if (!groups) {
      return linesToRender.map((line, i) => {
        const place = extractPlace(line);
        return (
          <div
            key={i + baseIdx}
            onMouseEnter={place ? () => hoverPlace(place) : undefined}
            onMouseLeave={place ? () => hoverPlace(null) : undefined}
          >
            <EditableLine
              line={line}
              isEditing={editTarget?.sectionIdx === sectionIdx && editTarget?.lineIdx === i + baseIdx}
              editValue={editValue}
              onStartEdit={() => onStartEdit(sectionIdx, i + baseIdx, line)}
              onEditChange={onEditChange}
              onCommit={onCommit}
              onCancel={onCancel}
              onAskGenie={onAskGenie}
            />
          </div>
        );
      });
    }
    return groups.map(group =>
      group.type === 'activity' ? (
        <ActivityBlock
          key={group.headlineIdx}
          group={group}
          sectionIdx={sectionIdx}
          editTarget={editTarget}
          editValue={editValue}
          onStartEdit={onStartEdit}
          onEditChange={onEditChange}
          onCommit={onCommit}
          onCancel={onCancel}
          onAskGenie={onAskGenie}
          onHoverPlace={hoverPlace}
          activityNumber={activityNumberMap.get(group.headlineIdx)}
        />
      ) : (
        <EditableLine
          key={group.idx}
          line={group.line}
          isEditing={editTarget?.sectionIdx === sectionIdx && editTarget?.lineIdx === group.idx}
          editValue={editValue}
          onStartEdit={() => onStartEdit(sectionIdx, group.idx, group.line)}
          onEditChange={onEditChange}
          onCommit={onCommit}
          onCancel={onCancel}
          onAskGenie={onAskGenie}
        />
      )
    );
  }

  return (
    <div id={section.id} style={{
      background: isDayOrCity ? 'rgba(56,189,248,0.04)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isDayOrCity ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 16, padding: '22px 28px 18px', marginBottom: 18,
    }}>
      {section.heading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: weatherDays ? 8 : 14, paddingBottom: 8,
          borderBottom: `1px solid ${isDayOrCity ? 'rgba(56,189,248,0.2)' : 'rgba(165,180,252,0.18)'}`,
        }}>
          <h2 style={{
            flex: 1, margin: 0,
            color: isDayOrCity ? '#38bdf8' : '#a5b4fc',
            fontSize: isDayOrCity ? 20 : 17, fontWeight: 700,
          }}>
            {section.heading}
          </h2>
          <button
            onClick={onReplan}
            disabled={replanning}
            title="Replan this section with AI"
            style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              border: '1px solid rgba(167,139,250,0.35)',
              background: replanning ? 'rgba(167,139,250,0.08)' : 'rgba(167,139,250,0.12)',
              color: replanning ? 'rgba(167,139,250,0.4)' : '#a78bfa',
              cursor: replanning ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {replanning ? (
              <>
                <span style={{
                  display: 'inline-block', width: 10, height: 10,
                  border: '1.5px solid rgba(167,139,250,0.4)', borderTopColor: '#a78bfa',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                Replanning&hellip;
              </>
            ) : (
              <>{String.fromCodePoint(0x2728)} Replan</>
            )}
          </button>
        </div>
      )}
      {weatherDays && <WeatherBar days={weatherDays} unit={weatherUnit} />}

      {isDayOrCity ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          {/* Left: activity list */}
          <div style={{ minWidth: 0 }}>
            {renderLines(section.lines)}
            <DayImages heading={section.heading} location={mapLocation} />
          </div>
          {/* Right: map always visible; image overlays it on hover if one is found */}
          <div style={{ position: 'relative', top: 0 }}>
            <DayMap
              heading={section.heading}
              lines={section.lines}
              location={mapLocation}
              height={340}
              namedPlaces={orderedActivityPlaces.length > 0 ? orderedActivityPlaces : undefined}
              onPlacesResolved={setResolvedPlaces}
            />
            {hoveredPlace && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden',
                opacity: placeLeaving ? 0 : 1,
                transition: placeLeaving ? 'opacity 2s ease' : 'opacity 0.15s ease',
                pointerEvents: 'none',
              }}>
                <PlaceImage place={hoveredPlace} height={340} city={mapLocation} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {renderLines(section.lines)}
          {!isTips && hoveredPlace && (
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: 220, height: 150, borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              pointerEvents: 'none', zIndex: 10,
              opacity: placeLeaving ? 0 : 1,
              transition: placeLeaving ? 'opacity 2s ease' : 'opacity 0.15s ease',
            }}>
              <PlaceImage place={hoveredPlace} height={150} city={mapLocation} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main content ───────────────────────────────────────────────────────────────
function SummaryContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string })?.id ?? '';

  const location    = params.get('location')    ?? '';
  const purpose     = params.get('purpose')     ?? '';
  const travelStyle = params.get('style')       ?? '';
  const budget      = params.get('budget')      ?? '';
  const interests   = params.get('interests')   ?? '';
  const constraints = params.get('constraints') ?? '';
  const startDate   = params.get('startDate')   ?? '';
  const endDate     = params.get('endDate')     ?? '';
  const nights        = params.get('nights')      ?? '';
  const stopsRaw      = params.get('stops')       ?? '';
  const travelingFrom = params.get('travelingFrom') ?? '';
  const travelingTo   = params.get('travelingTo')   ?? '';

  // ── Route / multi-stop ───────────────────────────────────────────────────────
  const parsedStops: RouteStop[] = useMemo(() => {
    try { return stopsRaw ? JSON.parse(stopsRaw) : []; } catch { return []; }
  }, [stopsRaw]);
  const allStops: RouteStop[] = useMemo(() => [
    { city: location, startDate, endDate },
    ...parsedStops,
  ], [location, startDate, endDate, parsedStops]);
  const isMultiStop = parsedStops.length > 0;

  // ── Saved trip DB state ───────────────────────────────────────────────────────
  const savedTripDbId  = params.get('savedTripId') ?? null;  // set when loaded from DB
  const [savedTripId,  setSavedTripId]  = useState<string | null>(savedTripDbId);
  const [saveState,    setSaveState]    = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveItineraryRef = useRef<(() => void) | null>(null);
  const loadedFromSave = useRef(!!savedTripDbId);

  // ── Weather state ─────────────────────────────────────────────────────────────
  const [weatherByCity,  setWeatherByCity]  = useState<Map<string, DayWeather[]>>(new Map());
  const [weatherUnit,    setWeatherUnit]    = useState<'C'|'F'>(() => {
    if (typeof window === 'undefined') return 'C';
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Match US-specific IANA timezones (excludes Canada/LatAm which also use America/)
      if (/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Adak|Detroit|Boise|Juneau|Nome|Sitka|Yakutat|Metlakatla|Unalaska|Indiana|Kentucky|North_Dakota)|Pacific\/Honolulu)/.test(tz)) {
        return 'F';
      }
    } catch { /* ignore */ }
    return 'C';
  });
  const weatherFetchedRef = useRef(false);

  // ── Replan state ──────────────────────────────────────────────────────────────
  const [replanningSection, setReplanningSection] = useState<number | null>(null);

  // ── Streaming state ──────────────────────────────────────────────────────────
  const [lines, setLines]         = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false); // only true once user triggers generation
  const [itineraryRequested, setItineraryRequested] = useState(loadedFromSave.current);
  const [error, setError]         = useState('');
  const bufferRef = useRef('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // ── Interactive state ────────────────────────────────────────────────────────
  const [sections, setSections] = useState<Section[]>([]);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editValue, setEditValue]   = useState('');

  // ── Genie state ──────────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen]           = useState(false);
  const [chatTab, setChatTab]             = useState<'genie' | 'friends'>('genie');
  const [chatMessages, setChatMessages]   = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]         = useState('');
  const [chatStreaming, setChatStreaming]  = useState(false);
  const [genieSpeak, setGenieSpeak]       = useState(false);
  const [geniePrefill, setGeniePrefill]   = useState('');
  const genieRef = useRef<HTMLDivElement>(null);

  // ── Inspiration image state ──────────────────────────────────────────────────
  const [inspImageFile,    setInspImageFile]    = useState<File | null>(null);
  const [inspImagePreview, setInspImagePreview] = useState('');
  const [inspIsVideo,      setInspIsVideo]      = useState(false);
  const inspFileRef = useRef<HTMLInputElement>(null);

  const handleInspFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const isVid = file.type.startsWith('video/');
    setInspIsVideo(isVid);
    if (isVid) {
      const videoEl = document.createElement('video');
      const objUrl  = URL.createObjectURL(file);
      videoEl.src = objUrl; videoEl.currentTime = 1; videoEl.muted = true; videoEl.playsInline = true;
      videoEl.onloadeddata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth || 640; canvas.height = videoEl.videoHeight || 360;
        canvas.getContext('2d')?.drawImage(videoEl, 0, 0);
        URL.revokeObjectURL(objUrl);
        canvas.toBlob(blob => {
          if (!blob) return;
          setInspImageFile(new File([blob], 'frame.jpg', { type: 'image/jpeg' }));
          setInspImagePreview(canvas.toDataURL('image/jpeg', 0.8));
        }, 'image/jpeg', 0.8);
      };
      videoEl.onerror = () => URL.revokeObjectURL(objUrl);
    } else {
      setInspImageFile(file);
      setInspImagePreview(URL.createObjectURL(file));
    }
  }, []);

  const clearInspImage = useCallback(() => {
    if (inspImagePreview && !inspImagePreview.startsWith('data:')) URL.revokeObjectURL(inspImagePreview);
    setInspImageFile(null); setInspImagePreview(''); setInspIsVideo(false);
  }, [inspImagePreview]);

  // ── Friends chat state ───────────────────────────────────────────────────────
  const [friendMessages, setFriendMessages] = useState<{id:string;author:string;content:string;timestamp:number}[]>([]);
  const [friendInput, setFriendInput]       = useState('');
  const [friendAuthor, setFriendAuthor]     = useState('');
  const friendPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Share / privacy state ────────────────────────────────────────────────────
  const [privacy, setPrivacy]       = useState<'public'|'friends'|'private'>('friends');
  const [shareOpen, setShareOpen]   = useState(false);
  const [copyDone, setCopyDone]     = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  // Stable trip ID (hash of key params) — same trip always gets same ID
  const tripId = useMemo(() => {
    const raw = `${location}|${startDate}|${endDate}|${nights}|${travelStyle}`;
    let h = 0;
    for (let i = 0; i < raw.length; i++) { h = Math.imul(31, h) + raw.charCodeAt(i) | 0; }
    return Math.abs(h).toString(36);
  }, [location, startDate, endDate, nights, travelStyle]);

  // ── Planning tab ──────────────────────────────────────────────────────────────
  const [mainTab, setMainTab]         = useState<'itinerary' | 'planning' | 'book' | 'files'>(loadedFromSave.current ? 'itinerary' : 'planning');
  const [bookmarks, setBookmarks]     = useState<Bookmark[]>([]);
  const [optimizingItinerary, setOptimizingItinerary] = useState(false);
  const [lastOptimized, setLastOptimized] = useState<Date | null>(null);
  const mapControlRef = useRef<{ panTo: (coords: [number, number]) => void; openPlace: (placeId: string, coords: [number, number]) => void } | null>(null);

  // ── Load itinerary from saved trip (if ?savedTripId= param present) ──────────
  useEffect(() => {
    if (!savedTripDbId) return;
    let cancelled = false;
    fetch(`/api/trips/${savedTripDbId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d.trip?.itinerary) return;
        const parsed = parseLines(d.trip.itinerary.split('\n'));
        setSections(parsed);
        setStreaming(false);
      })
      .catch(() => { if (!cancelled) setError('Could not load saved itinerary.'); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTripDbId]);

  // ── Fetch itinerary ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!itineraryRequested) return; // wait until user clicks "Generate"
    if (loadedFromSave.current) return; // skip — loading from DB instead
    let cancelled = false;
    async function fetch_() {
      try {
        const mustVisit = bookmarks.map(b => ({ name: b.name, category: b.category }));
        // Read language preference from localStorage
        let userLang = 'en';
        try { userLang = JSON.parse(localStorage.getItem('geknee_settings') ?? '{}').language ?? 'en'; } catch { /* ignore */ }
        const res = await fetch('/api/itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location, purpose, style: travelStyle, budget,
            interests, constraints, startDate, endDate, nights,
            stops: stopsRaw ? JSON.parse(stopsRaw) : undefined,
            mustVisit: mustVisit.length > 0 ? mustVisit : undefined,
            language: userLang !== 'en' ? userLang : undefined,
          }),
        });
        if (!res.ok || !res.body) {
          setError('Failed to generate itinerary. Check your API key and try again.');
          setStreaming(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          bufferRef.current += decoder.decode(value, { stream: true });
          const all = bufferRef.current.split('\n');
          bufferRef.current = all.pop() ?? '';
          setLines(prev => [...prev, ...all]);
        }
        if (bufferRef.current) {
          setLines(prev => [...prev, bufferRef.current]);
          bufferRef.current = '';
        }
      } catch {
        if (!cancelled) setError('Network error. Please try again.');
      } finally {
        if (!cancelled) setStreaming(false);
      }
    }
    fetch_();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraryRequested]);


  // ── Section-boundary detection — count ## headings to know when to commit ────
  //    Only re-parse & update sections when a new ## heading appears OR streaming
  //    ends. This avoids re-rendering every SectionCard on every streamed line.
  const headingCount = useMemo(
    () => lines.filter(l =>
      l.startsWith('## ') ||
      l.startsWith('### ') ||
      /^\*\*(Day\s+\d+[^*]*)\*\*\s*:?\s*$/i.test(l.trim())
    ).length,
    [lines],
  );

  useEffect(() => {
    if (lines.length === 0) return;
    const parsed = parseLines(lines);
    if (!streaming) {
      setSections(parsed);
    } else {
      setSections(parsed.length > 1 ? parsed.slice(0, -1) : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headingCount, streaming]);

  // ── Live streaming text — derived cheaply without re-parsing entire tree ─────
  //    These update on every line but only drive the lightweight raw text box.
  const streamingHeading = useMemo((): string | null => {
    if (!streaming) return null;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('## ')) return lines[i].slice(3).trim();
    }
    return null;
  }, [lines, streaming]);

  const streamingLines = useMemo((): string[] => {
    if (!streaming) return [];
    let lastIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('## ')) { lastIdx = i; break; }
    }
    return lastIdx >= 0 ? lines.slice(lastIdx + 1) : lines;
  }, [lines, streaming]);

  // ── Track user scroll intent ──────────────────────────────────────────────────
  useEffect(() => {
    function onScroll() {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
      userScrolledRef.current = !nearBottom;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Auto-scroll during streaming (only if user hasn't scrolled up) ────────────
  useEffect(() => {
    if (streaming && !userScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, streaming]);

  // ── Close chat on outside click ──────────────────────────────────────────────
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (genieRef.current && !genieRef.current.contains(e.target as Node)) {
        setChatOpen(false);
      }
    }
    if (chatOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [chatOpen]);

  // ── Consume geniePrefill ─────────────────────────────────────────────────────
  useEffect(() => {
    if (geniePrefill) {
      setChatOpen(true);
      setChatTab('genie');
      setChatInput(geniePrefill);
      setGeniePrefill('');
    }
  }, [geniePrefill]);

  // ── Share dropdown outside click ─────────────────────────────────────────────
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false);
    }
    if (shareOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [shareOpen]);

  // ── Load privacy from localStorage ───────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(`geknee_privacy_${tripId}`);
    if (saved === 'public' || saved === 'friends' || saved === 'private') setPrivacy(saved);
  }, [tripId]);

  // ── Friends chat — poll for new messages ─────────────────────────────────────
  useEffect(() => {
    async function poll() {
      try {
        const r = await fetch(`/api/trip-messages?tripId=${tripId}`);
        const d = await r.json() as { messages: typeof friendMessages };
        setFriendMessages(d.messages);
      } catch {}
    }
    poll();
    if (chatOpen && chatTab === 'friends') {
      friendPollRef.current = setInterval(poll, 3000);
    }
    return () => { if (friendPollRef.current) clearInterval(friendPollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, chatTab, tripId]);

  // ── Friends chat — send ───────────────────────────────────────────────────────
  const sendFriendMessage = useCallback(async () => {
    const content = friendInput.trim();
    const author  = friendAuthor.trim() || 'You';
    if (!content) return;
    setFriendInput('');
    try {
      const r = await fetch(`/api/trip-messages?tripId=${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, content }),
      });
      const d = await r.json() as { ok: boolean; message: typeof friendMessages[0] };
      if (d.ok) setFriendMessages(prev => [...prev, d.message]);
    } catch {}
  }, [friendInput, friendAuthor, tripId]);

  // ── Fetch weather for each stop once streaming ends ───────────────────────────
  useEffect(() => {
    if (streaming || weatherFetchedRef.current || allStops.length === 0) return;
    weatherFetchedRef.current = true;
    for (const stop of allStops) {
      fetch(`/api/weather?city=${encodeURIComponent(stop.city)}`)
        .then(r => r.json())
        .then(d => {
          if (d.days) setWeatherByCity(prev => new Map(prev).set(stop.city, d.days));
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  // ── Full itinerary string for chat context ────────────────────────────────────
  const fullItinerary = useMemo(() => {
    if (sections.length > 0) {
      return sections.map(s => {
        const h = s.heading ? `## ${s.heading}\n` : '';
        return h + s.lines.join('\n');
      }).join('\n\n');
    }
    return lines.join('\n');
  }, [sections, lines]);

  // ── Edit handlers ────────────────────────────────────────────────────────────
  const handleStartEdit = useCallback((sectionIdx: number, lineIdx: number, current: string) => {
    setEditTarget({ sectionIdx, lineIdx });
    setEditValue(current);
  }, []);

  const handleCommit = useCallback(() => {
    if (!editTarget) return;
    setSections(prev => prev.map((s, si) =>
      si !== editTarget.sectionIdx ? s : {
        ...s,
        lines: s.lines.map((l, li) => li !== editTarget.lineIdx ? l : editValue),
      }
    ));
    setEditTarget(null);
    setEditValue('');
    // Debounced auto-save (only if trip was already saved to DB)
    if (savedTripId) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveItineraryRef.current?.(), 2000);
    }
  }, [editTarget, editValue, savedTripId]);

  const handleCancel = useCallback(() => {
    setEditTarget(null);
    setEditValue('');
  }, []);

  function formatDate(d: string) {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  // ── Save itinerary to DB ──────────────────────────────────────────────────────
  const saveItinerary = useCallback(async () => {
    if (!fullItinerary) return;
    setSaveState('saving');
    try {
      if (!savedTripId) {
        const r = await fetch('/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${location}${startDate ? ' \u2013 ' + formatDate(startDate) : ''}`,
            location, startDate, endDate,
            nights: nights ? parseInt(nights) : null,
            style: JSON.stringify({ purpose, style: travelStyle, budget, interests, constraints }),
            itinerary: fullItinerary,
          }),
        });
        const d = await r.json();
        if (d.trip?.id) setSavedTripId(d.trip.id);
      } else {
        await fetch(`/api/trips/${savedTripId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itinerary: fullItinerary }),
        });
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }, [fullItinerary, savedTripId, location, startDate, endDate, nights, purpose, travelStyle, budget, interests, constraints]);

  // Keep ref current so handleCommit debounce can call latest version
  useEffect(() => { saveItineraryRef.current = saveItinerary; }, [saveItinerary]);

  // ── Replan a section with AI ──────────────────────────────────────────────────
  const handleReplan = useCallback(async (sectionIdx: number) => {
    const section = sections[sectionIdx];
    if (!section || replanningSection !== null) return;
    setReplanningSection(sectionIdx);
    const sectionText = `## ${section.heading}\n${section.lines.join('\n')}`;
    try {
      const res = await fetch('/api/itinerary/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: sectionText,
          itinerary: fullItinerary,
          tripInfo: { location, nights, purpose, style: travelStyle, budget },
        }),
      });
      if (!res.body) throw new Error('No body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const parsed = parseLines(acc.split('\n'));
        if (parsed.length > 0) {
          setSections(prev => prev.map((s, i) =>
            i !== sectionIdx ? s : { ...s, lines: parsed[0].lines }
          ));
        }
      }
    } catch {}
    finally { setReplanningSection(null); }
  }, [sections, replanningSection, fullItinerary, location, nights, purpose, travelStyle, budget]);

  const handleAskGenie = useCallback((rawLine: string) => {
    const clean = rawLine.replace(/\*\*/g, '').replace(/^[-*]\s/, '').replace(/^#+\s/, '').trim();
    setGeniePrefill(`Suggest 3 alternatives for: "${clean}"`);
  }, []);

  const handleOptimizeItinerary = useCallback(async () => {
    if (bookmarks.length === 0 || optimizingItinerary) return;
    setOptimizingItinerary(true);
    setMainTab('itinerary');
    try {
      const res = await fetch('/api/itinerary/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itinerary: fullItinerary,
          bookmarks: bookmarks.map(b => ({ name: b.name, coords: b.coords })),
          tripInfo: { location, nights, startDate, endDate, purpose, style: travelStyle, budget },
        }),
      });
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const parsed = parseLines(acc.split('\n'));
        if (parsed.length > 0) setSections(parsed);
      }
      setBookmarks([]);
      setLastOptimized(new Date());
    } catch { /* silent — itinerary stays as-is */ }
    finally { setOptimizingItinerary(false); }
  }, [bookmarks, optimizingItinerary, fullItinerary, location, nights, startDate, endDate, purpose, travelStyle, budget]);

  // ── Chat send ────────────────────────────────────────────────────────────────
  const GENIE_MSG_LIMIT = 15;
  const sendChat = useCallback(async () => {
    if ((!chatInput.trim() && !inspImageFile) || chatStreaming) return;

    // ── Image inspiration flow ──
    if (inspImageFile) {
      const caption = chatInput.trim() || 'How does this relate to my trip? What should I add or change?';
      setChatMessages(prev => [...prev,
        { role: 'user', content: `${String.fromCodePoint(0x1F4F8)} ${caption}` },
        { role: 'assistant', content: '' },
      ]);
      setChatInput(''); clearInspImage(); setChatStreaming(true); setGenieSpeak(true);
      try {
        const form = new FormData();
        form.append('image', inspImageFile);
        form.append('prompt', caption);
        const res = await fetch('/api/inspiration', { method: 'POST', body: form });
        if (!res.body) throw new Error('no body');
        const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = '';
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          acc += dec.decode(value, { stream: true });
          setChatMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: acc }]);
        }
      } catch {
        setChatMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: 'Could not analyze the image. Please try again.' }]);
      } finally { setChatStreaming(false); setGenieSpeak(false); }
      return;
    }

    if (!chatInput.trim() || chatStreaming) return;
    const userCount = chatMessages.filter(m => m.role === 'user').length;
    if (userCount >= GENIE_MSG_LIMIT) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `You\u2019ve reached the ${GENIE_MSG_LIMIT}-message limit for this trip session. Start a new trip to keep chatting! \u2728`,
      }]);
      setChatInput('');
      return;
    }
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() };
    const next = [...chatMessages, userMsg];
    setChatMessages([...next, { role: 'assistant', content: '' }]);
    setChatInput('');
    setChatStreaming(true);
    setGenieSpeak(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          itinerary: fullItinerary,
          tripInfo: { location, nights, purpose, style: travelStyle, budget },
        }),
      });
      if (!res.body) throw new Error('No body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setChatMessages(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: acc },
        ]);
      }
    } catch {
      setChatMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'My magic fizzled! Please try again.' },
      ]);
    } finally {
      setChatStreaming(false);
      setGenieSpeak(false);
    }
  }, [chatInput, chatStreaming, chatMessages, fullItinerary, location, nights, purpose, travelStyle, budget]);

  const showGenie = !streaming || lines.length > 8;
  const STAR = String.fromCodePoint(0x2726);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: '100vh', background: '#060816' }}>
      {/* Background gradient */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 40% 20%, rgba(30,70,200,0.35) 0%, rgba(6,8,22,0.96) 60%, #030510 100%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1720, margin: '0 auto', padding: '36px 40px 140px' }}>

        {/* Trip header */}
        <div style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: '24px 28px', marginBottom: 28,
        }}>
          <p style={{ color: '#38bdf8', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
            Your AI-generated itinerary
          </p>
          <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 800, marginBottom: 14 }}>{location}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {[
              startDate && `${formatDate(startDate)} \u2013 ${formatDate(endDate)}`,
              nights && `${nights} nights`,
              purpose, travelStyle, budget,
            ].filter(Boolean).map((tag, i) => (
              <span key={i} style={{
                background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)',
                borderRadius: 999, padding: '3px 11px', color: '#7dd3fc', fontSize: 12,
              }}>{tag}</span>
            ))}
          </div>

          {/* ── Weather unit toggle ───────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['C', 'F'] as const).map(u => (
              <button key={u} onClick={() => setWeatherUnit(u)} style={{
                padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                border: `1px solid ${weatherUnit === u ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.1)'}`,
                background: weatherUnit === u ? 'rgba(56,189,248,0.12)' : 'transparent',
                color: weatherUnit === u ? '#38bdf8' : 'rgba(255,255,255,0.35)',
                cursor: 'pointer',
              }}>&deg;{u}</button>
            ))}
          </div>

          {/* ── Share / Invite / Privacy row ─────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>

            {/* Privacy selector */}
            {(['public','friends','private'] as const).map(p => (
              <button key={p} onClick={() => {
                setPrivacy(p);
                localStorage.setItem(`geknee_privacy_${tripId}`, p);
              }} style={{
                padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                border: `1px solid ${privacy === p ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.12)'}`,
                background: privacy === p ? 'rgba(167,139,250,0.15)' : 'transparent',
                color: privacy === p ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer', textTransform: 'capitalize',
              }}>
                {p === 'public' ? String.fromCodePoint(0x1F310) : p === 'friends' ? String.fromCodePoint(0x1F465) : String.fromCodePoint(0x1F512)} {p}
              </button>
            ))}

            <div style={{ flex: 1 }} />

            {/* Invite / share dropdown */}
            <div ref={shareRef} style={{ position: 'relative' }}>
              <button onClick={() => setShareOpen(o => !o)} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)',
                color: '#38bdf8', cursor: 'pointer',
              }}>
                {String.fromCodePoint(0x1F517)} Invite friends
              </button>
              {shareOpen && (
                <div style={{
                  position: 'absolute', top: '110%', right: 0, zIndex: 40,
                  width: 300, background: 'rgba(6,8,22,0.97)', backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(56,189,248,0.25)', borderRadius: 14,
                  padding: '16px', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                  animation: 'chatSlideUp 0.18s ease-out',
                }}>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 10, letterSpacing: 0.3 }}>
                    SHARE THIS ITINERARY
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      readOnly
                      value={typeof window !== 'undefined' ? window.location.href : ''}
                      style={{
                        flex: 1, background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, color: 'rgba(255,255,255,0.6)',
                        fontSize: 11, padding: '7px 10px', outline: 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    />
                    <button onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      setCopyDone(true);
                      setTimeout(() => setCopyDone(false), 2000);
                    }} style={{
                      padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: copyDone ? 'rgba(34,197,94,0.2)' : 'rgba(56,189,248,0.15)',
                      border: `1px solid ${copyDone ? 'rgba(34,197,94,0.4)' : 'rgba(56,189,248,0.3)'}`,
                      color: copyDone ? '#86efac' : '#38bdf8', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      {copyDone ? String.fromCodePoint(0x2713) + ' Copied' : 'Copy'}
                    </button>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 10, lineHeight: 1.6 }}>
                    Friends with this link can view {privacy === 'private' ? '— set to Private, change above to share' : 'and chat on this itinerary'}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Main tab switcher ─────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', marginBottom: 20,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: -1 }}>
            {(['planning', 'itinerary', 'book', 'files'] as const).map(tab => (
              <button key={tab} onClick={() => setMainTab(tab)} style={{
                padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${mainTab === tab ? '#38bdf8' : 'transparent'}`,
                color: mainTab === tab ? '#38bdf8' : 'rgba(255,255,255,0.38)',
                transition: 'color 0.15s, border-color 0.15s',
              }}>
                {tab === 'itinerary'
                  ? String.fromCodePoint(0x1F5FA) + '\u00A0 Itinerary'
                  : tab === 'planning'
                  ? String.fromCodePoint(0x1F4CD) + '\u00A0 Planning'
                  : tab === 'files'
                  ? String.fromCodePoint(0x1F4C2) + '\u00A0 Files'
                  : String.fromCodePoint(0x1F4CB) + '\u00A0 Book'}
                {tab === 'planning' && bookmarks.length > 0 && (
                  <span style={{
                    marginLeft: 6, background: '#f59e0b', color: '#000',
                    borderRadius: 999, padding: '1px 6px', fontSize: 10, fontWeight: 800,
                  }}>
                    {bookmarks.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right side — optimize button + last optimized timestamp (itinerary tab only) */}
          {mainTab === 'itinerary' && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 4 }}>
            {lastOptimized && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                color: 'rgba(245,158,11,0.7)', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
              }}>
                {String.fromCodePoint(0x23F1)} Last optimized{' '}
                {lastOptimized.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                at {lastOptimized.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {bookmarks.length > 0 && (
              <button
                onClick={handleOptimizeItinerary}
                disabled={optimizingItinerary}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: optimizingItinerary
                    ? 'rgba(245,158,11,0.06)'
                    : 'linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(234,88,12,0.16) 100%)',
                  border: '1.5px solid rgba(245,158,11,0.5)',
                  color: '#fcd34d', cursor: optimizingItinerary ? 'not-allowed' : 'pointer',
                  opacity: optimizingItinerary ? 0.65 : 1,
                  whiteSpace: 'nowrap',
                  boxShadow: optimizingItinerary ? 'none' : '0 0 16px rgba(245,158,11,0.15)',
                  transition: 'all 0.2s ease',
                }}
              >
                {optimizingItinerary ? (
                  <>
                    <div style={{
                      width: 12, height: 12,
                      border: '2px solid rgba(245,158,11,0.3)', borderTopColor: '#f59e0b',
                      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                    }} />
                    Optimizing\u2026
                  </>
                ) : (
                  <>{String.fromCodePoint(0x2728)} Optimize with {bookmarks.length} destination{bookmarks.length !== 1 ? 's' : ''}</>
                )}
              </button>
            )}
          </div>}
        </div>

        {/* ── Planning tab ──────────────────────────────────────────────────── */}
        {mainTab === 'planning' && (() => {
          const CATS: { key: BookmarkCategory; label: string; icon: number; color: string }[] = [
            { key: 'food',       label: 'Food & Drink',    icon: 0x1F374, color: '#f87171' },
            { key: 'activities', label: 'Activities',      icon: 0x1F3AF, color: '#34d399' },
            { key: 'hotels',     label: 'Hotels & Stays',  icon: 0x1F3E8, color: '#60a5fa' },
            { key: 'shopping',   label: 'Shopping',        icon: 0x1F6CD, color: '#c084fc' },
            { key: 'other',      label: 'Other',           icon: 0x1F4CD, color: '#94a3b8' },
          ];
          const grouped = CATS.map(c => ({ ...c, items: bookmarks.filter(b => b.category === c.key) })).filter(g => g.items.length > 0);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <PlanningMapDynamic
                bookmarks={bookmarks}
                onAddBookmark={b => setBookmarks(prev => [...prev, b])}
                onRemoveBookmark={id => setBookmarks(prev => prev.filter(bm => bm.id !== id))}
                location={location}
                extraStops={parsedStops.map(s => s.city)}
                mapControlRef={mapControlRef}
              />
              {grouped.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Saved Destinations
                  </p>
                  {grouped.map(group => (
                    <div key={group.key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>{String.fromCodePoint(group.icon)}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: group.color, letterSpacing: '0.04em' }}>{group.label}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {group.items.map(bm => (
                          <div key={bm.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                            padding: '8px 12px', border: '1px solid rgba(255,255,255,0.07)',
                          }}>
                            <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bm.name}</span>
                            <button
                              onClick={() => {
                                if (bm.placeId) {
                                  mapControlRef.current?.openPlace(bm.placeId, bm.coords);
                                } else {
                                  mapControlRef.current?.panTo(bm.coords);
                                }
                              }}
                              style={{
                                padding: '3px 9px', borderRadius: 6, fontSize: 11, flexShrink: 0,
                                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                                color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
                              }}
                            >
                              View
                            </button>
                            <button
                              onClick={() => setBookmarks(prev => prev.filter(b => b.id !== bm.id))}
                              style={{
                                padding: '3px 9px', borderRadius: 6, fontSize: 11, flexShrink: 0,
                                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                color: '#f87171', cursor: 'pointer',
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Generate Itinerary CTA ─────────────────────────────────── */}
              <div style={{
                marginTop: 8, padding: '20px 24px',
                background: 'linear-gradient(135deg, rgba(56,189,248,0.08) 0%, rgba(167,139,250,0.08) 100%)',
                border: '1.5px solid rgba(56,189,248,0.2)',
                borderRadius: 14, display: 'flex', alignItems: 'center',
                gap: 16, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                    {bookmarks.length > 0
                      ? `${bookmarks.length} place${bookmarks.length !== 1 ? 's' : ''} saved \u2014 ready to build your itinerary?`
                      : 'Pin places above, then generate your itinerary'}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                    {bookmarks.length > 0
                      ? 'Your pinned places will be woven into the itinerary based on your travel personality.'
                      : 'Search and save restaurants, attractions, hotels, and activities you want to visit. Or skip straight to generation.'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setItineraryRequested(true);
                    setStreaming(true);
                    setLines([]);
                    setSections([]);
                    setError('');
                    setMainTab('itinerary');
                  }}
                  style={{
                    flexShrink: 0, padding: '12px 28px', borderRadius: 12,
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
                    border: 'none', color: '#0a0f1e',
                    boxShadow: '0 4px 20px rgba(56,189,248,0.3)',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {String.fromCodePoint(0x2728)} Generate Itinerary
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── Itinerary tab ─────────────────────────────────────────────────── */}
        {mainTab === 'itinerary' && (<>

        {/* Section nav — appears once we have committed sections */}
        {sections.length > 0 && sections.some(s => s.heading) && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20,
          }}>
            {sections.filter(s => s.heading).map(s => (
              <button
                key={s.id}
                onClick={() => {
                  const el = document.getElementById(s.id);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                  color: '#7dd3fc', cursor: 'pointer', letterSpacing: 0.2,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.22)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.1)')}
              >
                {s.heading}
              </button>
            ))}
          </div>
        )}

        {/* Not yet requested — prompt user to visit planning tab */}
        {!itineraryRequested && !error && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 16, padding: '60px 32px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48 }}>{String.fromCodePoint(0x1F5FA)}</div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>
              Start in the Planning tab
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.45)', maxWidth: 340, lineHeight: 1.6 }}>
              Pin the places you want to visit, then hit <strong style={{ color: '#38bdf8' }}>Generate Itinerary</strong> to build a day-by-day plan around your selections and travel personality.
            </p>
            <button
              onClick={() => setMainTab('planning')}
              style={{
                padding: '11px 28px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                background: 'rgba(56,189,248,0.12)', border: '1.5px solid rgba(56,189,248,0.35)',
                color: '#38bdf8', cursor: 'pointer',
              }}
            >
              {String.fromCodePoint(0x1F4CD)} Go to Planning
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            color: '#f87171', padding: '18px 22px',
            background: 'rgba(239,68,68,0.1)', borderRadius: 12,
            border: '1px solid rgba(239,68,68,0.3)',
          }}>
            {error}
          </div>
        )}

        {/* Committed sections — shown as interactive SectionCards as soon as each day is complete */}
        {!error && sections.length > 0 && (
          <>
            {!streaming && (
              <div style={{
                color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 14,
                textAlign: 'right', letterSpacing: 0.3,
              }}>
                Click any line to edit &nbsp;&middot;&nbsp; Hover for {STAR} genie suggestions
              </div>
            )}
            {sections.map((section, sectionIdx) => {
              // Match section to a weather city. Day sections → use first stop; city sections → match by name.
              const isDay  = /day\s*\d/i.test(section.heading);
              const isCity = !isDay && allStops.some(s => section.heading.toLowerCase().includes(s.city.toLowerCase()));
              let weatherDays: DayWeather[] | undefined;
              if (isDay) {
                weatherDays = weatherByCity.get(allStops[0]?.city ?? location);
              } else if (isCity) {
                const matchedStop = allStops.find(s => section.heading.toLowerCase().includes(s.city.toLowerCase()));
                if (matchedStop) weatherDays = weatherByCity.get(matchedStop.city);
              }
              return (
                <SectionCard
                  key={section.id}
                  section={section}
                  sectionIdx={sectionIdx}
                  editTarget={editTarget}
                  editValue={editValue}
                  onStartEdit={handleStartEdit}
                  onEditChange={setEditValue}
                  onCommit={handleCommit}
                  onCancel={handleCancel}
                  onAskGenie={handleAskGenie}
                  location={location}
                  allStops={allStops}
                  weatherDays={weatherDays}
                  weatherUnit={weatherUnit}
                  replanning={replanningSection === sectionIdx}
                  onReplan={() => handleReplan(sectionIdx)}
                />
              );
            })}
          </>
        )}

        {/* In-progress section — raw streaming text for the day currently being written */}
        {!error && streaming && (
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '28px 32px', minHeight: streamingHeading ? 0 : 200,
          }}>
            {lines.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.5)' }}>
                <div style={{
                  width: 18, height: 18,
                  border: '2px solid rgba(56,189,248,0.4)', borderTopColor: '#38bdf8',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                Crafting your personalized itinerary&hellip;
              </div>
            ) : (
              <>
                {streamingHeading && (
                  <h2 style={{ color: '#38bdf8', fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
                    {streamingHeading}
                  </h2>
                )}
                {streamingLines.map((line, i) => <MarkdownLine key={i} line={line} />)}
                <span style={{
                  display: 'inline-block', width: 2, height: 16,
                  background: '#38bdf8', marginLeft: 2,
                  animation: 'blink 0.9s step-end infinite', verticalAlign: 'text-bottom',
                }} />
                <div ref={bottomRef} />
              </>
            )}
          </div>
        )}

        {/* Action buttons — shown after streaming completes */}
        {!error && !streaming && sections.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <button
                onClick={() => router.push('/')}
                style={{
                  padding: '13px 24px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.7)', fontSize: 14, cursor: 'pointer',
                }}
              >
                Plan another trip
              </button>
              <button
                onClick={saveItinerary}
                disabled={saveState === 'saving'}
                style={{
                  padding: '13px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                  border: `1px solid ${saveState === 'saved' ? 'rgba(34,197,94,0.4)' : saveState === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(167,139,250,0.4)'}`,
                  background: saveState === 'saved' ? 'rgba(34,197,94,0.12)' : saveState === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(167,139,250,0.12)',
                  color: saveState === 'saved' ? '#86efac' : saveState === 'error' ? '#f87171' : '#c4b5fd',
                  cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                {saveState === 'saving' && (
                  <span style={{ width: 12, height: 12, border: '2px solid rgba(167,139,250,0.3)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                )}
                {saveState === 'saved'  ? String.fromCodePoint(0x2713) + ' Saved!' :
                 saveState === 'error'  ? 'Error — retry' :
                 saveState === 'saving' ? 'Saving\u2026' :
                 savedTripId            ? String.fromCodePoint(0x1F4BE) + ' Save changes' :
                                          String.fromCodePoint(0x1F4BE) + ' Save itinerary'}
              </button>
              <button
                onClick={() => window.print()}
                style={{
                  padding: '13px 24px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
                  border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Print / Save as PDF
              </button>
              <button
                onClick={() => setMainTab('book')}
                style={{
                  padding: '13px 28px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                  border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(249,115,22,0.4)',
                }}
              >
                {String.fromCodePoint(0x1F4CB)} View Book tab
              </button>
            </div>
          </>
        )}

        </>)}

        {/* ── Book tab — always mounted to preserve state across tab switches ── */}
        <div style={{ display: mainTab === 'book' ? 'block' : 'none' }}>
          <BookTabDynamic
            location={location}
            purpose={purpose}
            style={travelStyle}
            budget={budget}
            interests={interests}
            startDate={startDate}
            endDate={endDate}
            nights={nights}
            stops={stopsRaw}
            travelingFrom={travelingFrom}
            fullItinerary={fullItinerary}
          />
        </div>

        {mainTab === 'files' && (
          <div style={{ padding: '24px 28px', maxWidth: 680, margin: '0 auto' }}>
            {!savedTripId ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 14, marginTop: 40 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{String.fromCodePoint(0x1F4C2)}</div>
                Save your trip first to use the File Vault.
              </div>
            ) : (
              <FileVault
                tripId={savedTripId}
                currentUserId={currentUserId}
              />
            )}
          </div>
        )}
      </div>

      {/* Genie + Friends chat */}
      {showGenie && (
        <div ref={genieRef} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999 }}>
          {chatOpen && (
            <ChatPanel
              tab={chatTab}
              onTabChange={setChatTab}
              genieMessages={chatMessages}
              chatStreaming={chatStreaming}
              genieInput={chatInput}
              onGenieInputChange={setChatInput}
              onGenieSend={sendChat}
              inspImagePreview={inspImagePreview}
              inspIsVideo={inspIsVideo}
              inspFileRef={inspFileRef}
              onInspFileSelect={handleInspFileSelect}
              onClearInspImage={clearInspImage}
              friendMessages={friendMessages}
              friendInput={friendInput}
              friendAuthor={friendAuthor}
              onFriendInputChange={setFriendInput}
              onFriendAuthorChange={setFriendAuthor}
              onFriendSend={sendFriendMessage}
              onClose={() => setChatOpen(false)}
            />
          )}
          <button
            onClick={() => setChatOpen(p => !p)}
            title="Chat with your travel genie or friends"
            style={{
              width: 80, height: 80, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: chatOpen
                ? 'linear-gradient(135deg, rgba(109,40,217,0.95), rgba(30,58,138,0.95))'
                : 'linear-gradient(135deg, rgba(76,29,149,0.9), rgba(23,37,84,0.9))',
              boxShadow: chatOpen
                ? '0 0 0 2px rgba(167,139,250,0.6), 0 8px 32px rgba(109,40,217,0.5)'
                : '0 0 0 1px rgba(129,140,248,0.3), 0 8px 24px rgba(0,0,0,0.5)',
              animation: 'genieFloat 3s ease-in-out infinite',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'visible', position: 'relative',
              transition: 'background 0.3s, box-shadow 0.3s',
              padding: 0,
            }}
          >
            <GenieCharacter speaking={genieSpeak} />
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin        { to { transform: rotate(360deg); } }
        @keyframes blink       { 0%,100% { opacity:1; } 50% { opacity:0; } }
        @keyframes genieFloat  { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
        @keyframes genieSpark  { 0%,100% { opacity:0; transform:scale(0.5); } 50% { opacity:1; transform:scale(1.2); } }
        @keyframes chatSlideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @media print { [style*="position: fixed"] { display:none !important; } }
      `}</style>
    </main>
  );
}

export default function SummaryPage() {
  return (
    <Suspense>
      <SummaryContent />
    </Suspense>
  );
}
