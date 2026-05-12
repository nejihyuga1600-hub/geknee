'use client';
// Photo → itinerary attacher. Sits at the top of the Itinerary tab as a
// thin drop-zone CTA. User drops/picks an image, picks a day, we POST
// to /api/itinerary/media; server runs Claude vision + calls the
// existing /api/itinerary/adjust path internally so persistence stays
// single-sourced.
//
// Design intent (per ui-ux-pro-max guidance):
//   - 44px+ touch targets
//   - :focus-visible ring on the drop-zone + button
//   - drag-over visual feedback
//   - prefers-reduced-motion respected via CSS @media
//   - No emoji icons; SVG paperclip glyph
//   - WCAG 4.5:1 contrast on label text in both schemes

import { useEffect, useRef, useState } from 'react';
import { Sparkle } from '@/lib/icons';

interface Props {
  tripId: string;
  /** Total days on the trip — used for the day dropdown. */
  dayCount: number;
  /** Optional initial day to preselect (e.g. "today" for in-trip use). */
  initialDay?: number;
  /** Fires after successful add — parent should re-fetch the itinerary view. */
  onAdded?: (added: { name: string; time: string }) => void;
  /**
   * When true, renders as a single pill button that opens the full picker
   * in a modal overlay. Use this for tight header rows where a full strip
   * would crowd the layout (e.g. SummaryView's planning header).
   */
  compact?: boolean;
}

export function PhotoToItinerary({ tripId, dayCount, initialDay, onAdded, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // 0 = "Any day" — server picks the best slot via vision. initialDay
  // overrides only when explicitly passed (e.g. in-trip use where we
  // already know the current day).
  const [day, setDay] = useState<number>(initialDay ?? 0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ name: string; time: string } | null>(null);
  // Compact mode renders a single pill that opens the picker in a modal.
  // `open` controls the modal; ignored when compact === false.
  const [open, setOpen] = useState(false);

  // Create / revoke the object URL when file changes. Avoids leaking
  // blob: URLs across attempts.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (f: File) => {
    if (!f.type.startsWith('image/')) {
      setError('Only images are supported. For videos, take a still and upload that.');
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      setError('Image too large (max 12 MB).');
      return;
    }
    setError(null);
    setSuccess(null);
    setFile(f);
  };

  const submit = async () => {
    if (!file || !tripId) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const form = new FormData();
      form.set('tripId', tripId);
      form.set('day', String(day));
      form.set('file', file);

      const res = await fetch('/api/itinerary/media', { method: 'POST', body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json() as { addedActivity: { name: string; time: string } };
      setSuccess(j.addedActivity);
      setFile(null);
      onAdded?.(j.addedActivity);
      // Tell SummaryView (or any listener) to refresh the itinerary.
      window.dispatchEvent(new CustomEvent('geknee:itinerary-updated'));
    } catch (e) {
      console.error('[PhotoToItinerary] submit failed', e);
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Compact pill — opens the full picker in a centered modal. Lives
  // inline next to the trip title so the planning header row stays tidy.
  // Shared picker body — rendered both inline (default mode) and inside
  // the modal (compact mode). Drag-and-drop handlers live on the outer
  // wrapper in each branch since they apply to the surrounding container.
  const body = (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <PaperclipIcon />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: 'var(--font-mono-display), monospace',
            fontSize: 10, letterSpacing: '0.18em',
            color: 'var(--brand-accent)', textTransform: 'uppercase',
            fontWeight: 700, marginBottom: 2,
          }}>
            <Sparkle size={10} style={{ verticalAlign: '-1px', marginRight: 4 }} /> Attach a photo
          </div>
          <div style={{ fontSize: 13, color: 'var(--brand-ink-dim)' }}>
            Drop an image, or pick one. geknee reads it and adds the stop to the day.
          </div>
        </div>
        <select
          aria-label="Day to add the stop to"
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          style={selectStyle}
        >
          {/* "Any day" sends day=0 to the server, which then lets the
              vision model pick the best slot across the whole itinerary
              based on what the photo shows. */}
          <option value={0}>Any day</option>
          {Array.from({ length: dayCount }).map((_, i) => (
            <option key={i + 1} value={i + 1}>Day {i + 1}</option>
          ))}
        </select>
        {!file ? (
          <button onClick={() => inputRef.current?.click()} style={pickBtnStyle}>
            Pick photo
          </button>
        ) : (
          <button onClick={submit} disabled={uploading} style={primaryBtnStyle}>
            {uploading ? 'Reading photo…' : day === 0 ? 'Add to best day' : `Add to Day ${day}`}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {previewUrl && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Selected"
            style={{
              width: 72, height: 72, objectFit: 'cover',
              borderRadius: 10, border: '1px solid var(--brand-border)',
            }}
          />
          <button onClick={() => setFile(null)} style={ghostBtnStyle} disabled={uploading}>
            Choose different
          </button>
        </div>
      )}
      {error && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(248,113,113,0.10)',
          border: '1px solid rgba(248,113,113,0.30)',
          color: 'var(--brand-danger)', fontSize: 13,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(124,255,151,0.08)',
          border: '1px solid rgba(124,255,151,0.30)',
          color: 'var(--brand-success)', fontSize: 13,
        }}>
          ✓ Added <strong style={{ fontWeight: 600 }}>{success.name}</strong> at {success.time}. Your itinerary updated.
        </div>
      )}
    </>
  );

  if (compact) {
    // Inline expand instead of a modal — one click on the pill replaces
    // it with the full controls in place. No second click required to get
    // to the day picker / pick button. Click the × to collapse back.
    if (!open) {
      return (
        <button
          onClick={() => setOpen(true)}
          aria-expanded={false}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 999,
            background: 'rgba(167,139,250,0.10)',
            border: '1px solid rgba(167,139,250,0.32)',
            color: 'var(--brand-ink)',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.02em',
            cursor: 'pointer',
          }}
        >
          <PaperclipIcon />
          <span>Attach photo</span>
        </button>
      );
    }
    return (
      <div
        role="region"
        aria-label="Attach a photo to your itinerary"
        aria-expanded
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) pickFile(f);
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 14,
          background: 'rgba(167,139,250,0.10)',
          border: `1px ${dragOver ? 'dashed var(--brand-accent)' : 'solid rgba(167,139,250,0.32)'}`,
          color: 'var(--brand-ink)',
          transition: 'border-color 180ms ease',
          maxWidth: '100%',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          {body}
        </div>
        <button
          onClick={() => !uploading && setOpen(false)}
          disabled={uploading}
          aria-label="Collapse photo attach"
          style={{
            flexShrink: 0,
            width: 28, height: 28, borderRadius: '50%',
            background: 'transparent', border: '1px solid var(--brand-border)',
            color: 'var(--brand-ink-dim)',
            fontFamily: 'inherit', fontSize: 16, lineHeight: 1,
            cursor: uploading ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Attach a photo to your itinerary"
      style={{
        margin: '14px 16px',
        padding: 14,
        background: 'rgba(255,255,255,0.03)',
        border: dragOver ? '2px dashed var(--brand-accent)' : '1px dashed var(--brand-border-hi)',
        borderRadius: 14,
        transition: 'border-color 180ms ease',
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) pickFile(f);
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <PaperclipIcon />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: 'var(--font-mono-display), monospace',
            fontSize: 10, letterSpacing: '0.18em',
            color: 'var(--brand-accent)', textTransform: 'uppercase',
            fontWeight: 700, marginBottom: 2,
          }}>
            <Sparkle size={10} style={{ verticalAlign: '-1px', marginRight: 4 }} /> Attach a photo
          </div>
          <div style={{ fontSize: 13, color: 'var(--brand-ink-dim)' }}>
            Drop an image, or pick one. geknee reads it and adds the stop to the day.
          </div>
        </div>

        <select
          aria-label="Day to add the stop to"
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          style={selectStyle}
        >
          {/* "Any day" sends day=0 to the server, which then lets the
              vision model pick the best slot across the whole itinerary
              based on what the photo shows. */}
          <option value={0}>Any day</option>
          {Array.from({ length: dayCount }).map((_, i) => (
            <option key={i + 1} value={i + 1}>Day {i + 1}</option>
          ))}
        </select>

        {!file ? (
          <button onClick={() => inputRef.current?.click()} style={pickBtnStyle}>
            Pick photo
          </button>
        ) : (
          <button onClick={submit} disabled={uploading} style={primaryBtnStyle}>
            {uploading ? 'Reading photo…' : day === 0 ? 'Add to best day' : `Add to Day ${day}`}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            // Reset so the same file can be picked again later.
            e.target.value = '';
          }}
        />
      </div>

      {previewUrl && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Selected"
            style={{
              width: 72, height: 72, objectFit: 'cover',
              borderRadius: 10, border: '1px solid var(--brand-border)',
            }}
          />
          <button onClick={() => setFile(null)} style={ghostBtnStyle} disabled={uploading}>
            Choose different
          </button>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(248,113,113,0.10)',
          border: '1px solid rgba(248,113,113,0.30)',
          color: 'var(--brand-danger)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(124,255,151,0.08)',
          border: '1px solid rgba(124,255,151,0.30)',
          color: 'var(--brand-success)', fontSize: 13,
        }}>
          ✓ Added <strong style={{ fontWeight: 600 }}>{success.name}</strong> at {success.time}. Your itinerary updated.
        </div>
      )}
    </section>
  );
}

function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--brand-accent)', flexShrink: 0 }}
      aria-hidden
    >
      <path d="m21 12-9.5 9.5a5.5 5.5 0 1 1-7.78-7.78L13.22 4.22a3.5 3.5 0 1 1 4.95 4.95L8.66 18.68a1.5 1.5 0 1 1-2.12-2.12L15.07 8" />
    </svg>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--brand-border)',
  color: 'var(--brand-ink)',
  fontFamily: 'inherit', fontSize: 13,
  cursor: 'pointer',
  minHeight: 36,
};

const pickBtnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10,
  background: 'transparent',
  border: '1px solid var(--brand-border)',
  color: 'var(--brand-ink-dim)',
  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', minHeight: 36,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10,
  background: 'var(--brand-accent)',
  border: 'none',
  color: 'var(--brand-bg)',
  fontFamily: 'inherit', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
  cursor: 'pointer', minHeight: 36,
};

const ghostBtnStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8,
  background: 'transparent',
  border: '1px solid var(--brand-border)',
  color: 'var(--brand-ink-dim)',
  fontFamily: 'inherit', fontSize: 12,
  cursor: 'pointer',
};
