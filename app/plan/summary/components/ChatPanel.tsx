'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../lib/types';

// Floating chat panel anchored to the genie button. Two tabs: AI Genie
// (assistant) and Friends (group chat). Pure controlled component — all
// state lives in the parent.

export interface ChatPanelProps {
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
  friendMessages: { id: string; author: string; content: string; timestamp: number }[];
  friendInput: string;
  friendAuthor: string;
  onFriendInputChange: (v: string) => void;
  onFriendAuthorChange: (v: string) => void;
  onFriendSend: () => void;
  onClose: () => void;
}

export function ChatPanel({
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
      background: 'rgba(6,8,22,0.96)', WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)',
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
          {tabBtn('genie',   String.fromCodePoint(0x2726) + ' geknee agent')}
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
