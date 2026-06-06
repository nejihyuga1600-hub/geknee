'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

// ─── E4 · File vault ───────────────────────────────────────────────────────
// Passport-sticker grid. Loads files from every trip the signed-in user
// owns and aggregates into a single grid, matching the design intent
// ("Everything in one passport"). Falls back to a friendly empty state when
// the user is signed out or has no files yet. Backend tags from
// /api/trips/[id]/files (passport / booking / insurance / photo / other)
// are mapped to the design's kinds.

const MONO = 'var(--font-mono-display), ui-monospace, monospace';
const DISPLAY = 'var(--font-display), Georgia, serif';

interface ApiTripFile {
  id: string;
  name: string;
  url: string;
  size: number;
  tag: string; // 'passport' | 'booking' | 'insurance' | 'photo' | 'other'
  createdAt: string;
}
interface ApiTrip {
  id: string;
  title: string;
  location: string;
}

interface VaultFile {
  id: string;
  kind: 'passport' | 'booking' | 'insurance' | 'photo' | 'other';
  label: string;
  meta: string;
  glyph: string;
  color: string;
  stamp: string;
  url: string;
}

const KIND_PRESET: Record<VaultFile['kind'], { glyph: string; color: string; stamp: string }> = {
  passport:  { glyph: String.fromCodePoint(0x23DA), color: '#fbbf24', stamp: 'CURRENT' },
  booking:   { glyph: String.fromCodePoint(0x25EC), color: '#a78bfa', stamp: 'CONFIRMED' },
  insurance: { glyph: String.fromCodePoint(0x25C8), color: '#fb923c', stamp: 'ACTIVE' },
  photo:     { glyph: String.fromCodePoint(0x25C9), color: '#fbbf24', stamp: 'SAVED' },
  other:     { glyph: String.fromCodePoint(0x25F7), color: '#7dd3fc', stamp: 'FILED' },
};

const FILTERS = ['All', 'Passports', 'Bookings', 'Insurance', 'Photos', 'Other'] as const;
type FilterTab = typeof FILTERS[number];

const FILTER_KIND: Record<FilterTab, VaultFile['kind'] | null> = {
  All:        null,
  Passports:  'passport',
  Bookings:   'booking',
  Insurance:  'insurance',
  Photos:     'photo',
  Other:      'other',
};

function fmtDateUpper(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
  } catch { return ''; }
}

export default function VaultPage() {
  const [filter, setFilter] = useState<FilterTab>('All');
  const [files,  setFiles]  = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // We attach uploads to the most recently updated trip — the API requires a
  // trip context, and "most recent" matches the user's mental model of
  // "current trip". If the user has no trips yet, upload is disabled.
  const [primaryTripId, setPrimaryTripId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const tripsRes = await fetch('/api/trips');
      if (tripsRes.status === 401) {
        setError('Sign in to see your file vault.');
        setFiles([]);
        return;
      }
      if (!tripsRes.ok) throw new Error('trips');
      const { trips } = await tripsRes.json() as { trips: ApiTrip[] };
      setPrimaryTripId(trips[0]?.id ?? null);

      // Parallel fan-out across trips. Each trip's files endpoint is its own
      // round trip so a slow one doesn't block the rest.
      const all = await Promise.all(trips.map(async t => {
        try {
          const r = await fetch(`/api/trips/${t.id}/files`);
          if (!r.ok) return [] as VaultFile[];
          const { files: tripFiles } = await r.json() as { files: ApiTripFile[] };
          return tripFiles.map<VaultFile>(f => {
            const kind = (KIND_PRESET[f.tag as VaultFile['kind']] ? f.tag : 'other') as VaultFile['kind'];
            const preset = KIND_PRESET[kind];
            return {
              id: f.id,
              kind,
              label: f.name,
              meta: `${t.location.toUpperCase()} · ${fmtDateUpper(f.createdAt)}`,
              glyph: preset.glyph,
              color: preset.color,
              stamp: preset.stamp,
              url: f.url,
            };
          });
        } catch { return [] as VaultFile[]; }
      }));
      setFiles(all.flat());
    } catch {
      setError('Could not load your files. Please refresh.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadAll(); }, []);

  const counts = useMemo(() => {
    const c: Record<FilterTab, number> = { All: files.length, Passports: 0, Bookings: 0, Insurance: 0, Photos: 0, Other: 0 };
    for (const f of files) {
      if (f.kind === 'passport')  c.Passports++;
      if (f.kind === 'booking')   c.Bookings++;
      if (f.kind === 'insurance') c.Insurance++;
      if (f.kind === 'photo')     c.Photos++;
      if (f.kind === 'other')     c.Other++;
    }
    return c;
  }, [files]);

  const filtered = useMemo(() => {
    const k = FILTER_KIND[filter];
    return k === null ? files : files.filter(f => f.kind === k);
  }, [files, filter]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !primaryTripId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      // Default tag for vault uploads is 'other'; users can re-tag from the
      // existing per-trip FileVault if they need something specific.
      form.append('tag', 'other');
      const res = await fetch(`/api/trips/${primaryTripId}/files`, { method: 'POST', body: form });
      if (res.ok) await loadAll();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100svh',
      background: 'var(--brand-bg)',
      color: 'var(--brand-ink)',
      fontFamily: 'var(--font-ui), system-ui, sans-serif',
    }}>
      {/* App bar */}
      <div style={{
        minHeight: 'calc(env(safe-area-inset-top) + 64px)',
        paddingTop: 'env(safe-area-inset-top)', paddingLeft: 24, paddingRight: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--brand-border)',
        background: 'rgba(5,5,15,0.85)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/plan" style={{ color: 'var(--brand-accent)', fontSize: 13, textDecoration: 'none' }}>
            {String.fromCodePoint(0x2190)} Itinerary
          </Link>
          <div style={{ fontFamily: DISPLAY, fontSize: 19, color: 'var(--brand-ink)' }}>
            File vault
          </div>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!primaryTripId || uploading}
          style={{
            padding: '8px 14px', borderRadius: 10,
            background: primaryTripId ? 'var(--brand-accent)' : 'rgba(167,139,250,0.2)',
            color: 'var(--brand-bg)',
            border: 'none', fontSize: 12, fontWeight: 700,
            fontFamily: 'inherit',
            cursor: primaryTripId && !uploading ? 'pointer' : 'not-allowed',
            opacity: primaryTripId && !uploading ? 1 : 0.55,
          }}
        >
          {uploading ? 'Uploading…' : '+ Upload'}
        </button>
        <input ref={fileInputRef} type="file" hidden onChange={handleUpload} />
      </div>

      {/* Header */}
      <div style={{ padding: '40px 24px 24px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
          color: 'var(--brand-accent-2)', marginBottom: 12, fontWeight: 600,
        }}>
          {String.fromCodePoint(0x00A7)} PASSPORTS · TICKETS · VOUCHERS · {files.length} FILES
        </div>
        <h1 style={{
          margin: 0,
          fontFamily: DISPLAY, fontSize: 'clamp(36px, 6vw, 56px)',
          fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1, marginBottom: 14,
          color: 'var(--brand-ink)',
        }}>
          Everything in <em style={{ fontStyle: 'italic', color: 'var(--brand-accent)' }}>one passport.</em>
        </h1>
        <p style={{
          fontSize: 13, color: 'var(--brand-ink-dim)', maxWidth: 540, lineHeight: 1.55, margin: 0,
        }}>
          Documents you might need offline. Encrypted at rest. Drag-drop a file or photo to upload.
        </p>
      </div>

      {/* Filter chips */}
      <div style={{
        padding: '0 24px 24px', maxWidth: 1280, margin: '0 auto',
        display: 'flex', gap: 8, overflowX: 'auto',
      }}>
        {FILTERS.map(f => {
          const active = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 12px', borderRadius: 999,
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              background: active ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${active ? 'var(--brand-border-hi)' : 'var(--brand-border)'}`,
              color: active ? 'var(--brand-accent)' : 'var(--brand-ink-dim)',
              whiteSpace: 'nowrap', cursor: 'pointer',
            }}>
              {f} · {counts[f]}
            </button>
          );
        })}
      </div>

      {/* States */}
      {error && (
        <div style={{
          maxWidth: 1280, margin: '0 auto', padding: '0 24px 60px',
          color: 'var(--brand-ink-dim)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* File grid */}
      <div style={{
        padding: '0 24px 60px', maxWidth: 1280, margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 20,
      }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonTile key={`sk-${i}`} />)
          : (
            <>
              {filtered.map(f => <VaultTile key={f.id} {...f} />)}
              {!loading && primaryTripId && (
                <DropTile onClick={() => fileInputRef.current?.click()} />
              )}
              {!loading && filtered.length === 0 && !error && (
                <div style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center', padding: '40px 0',
                  color: 'var(--brand-ink-mute)', fontSize: 13,
                }}>
                  Nothing here yet. Upload a passport, ticket, or voucher to get started.
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}

function VaultTile({ label, meta, glyph, color, stamp, url }: VaultFile) {
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      style={{
        aspectRatio: '3/4', borderRadius: 14,
        background: 'var(--brand-surface-solid)',
        border: '1px solid var(--brand-border)',
        padding: 18, position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        transition: 'transform 200ms var(--ease-out), border-color 200ms',
        textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{
        position: 'absolute', top: 18, right: -12, transform: 'rotate(8deg)',
        padding: '4px 16px',
        fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em',
        border: `2px solid ${color}`, color,
        background: 'rgba(10,10,31,0.7)', borderRadius: 3,
      }}>{stamp}</div>

      <div style={{
        fontSize: 64, color, opacity: 0.42, marginTop: 6,
        fontFamily: DISPLAY, lineHeight: 1,
      }}>{glyph}</div>

      <div>
        <div style={{
          fontFamily: DISPLAY, fontSize: 18, fontWeight: 400,
          letterSpacing: '-0.005em', lineHeight: 1.2, marginBottom: 6,
          color: 'var(--brand-ink)',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>{label}</div>
        <div style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
          color: 'var(--brand-ink-mute)',
        }}>{meta}</div>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 10, borderTop: '1px solid var(--brand-border)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--brand-ink-mute)' }}>
          {String.fromCodePoint(0x2193)} Open
        </span>
        <span style={{ fontSize: 14, color: 'var(--brand-ink-mute)' }}>
          {String.fromCodePoint(0x22EE)}
        </span>
      </div>
    </a>
  );
}

function DropTile({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      aspectRatio: '3/4', borderRadius: 14,
      border: '1.5px dashed rgba(167,139,250,0.35)',
      background: 'rgba(167,139,250,0.04)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 10,
      color: 'rgba(167,139,250,0.7)', fontSize: 13, fontWeight: 500,
      cursor: 'pointer',
      fontFamily: 'inherit',
    }}>
      <div style={{ fontSize: 30, fontFamily: DISPLAY, lineHeight: 1 }}>+</div>
      <div>Drop a file</div>
    </button>
  );
}

function SkeletonTile() {
  return (
    <div style={{
      aspectRatio: '3/4', borderRadius: 14,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--brand-border)',
      animation: 'shimmer 1.4s linear infinite',
      backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(167,139,250,0.06) 200px, rgba(255,255,255,0.02) 400px)',
      backgroundSize: '800px 100%',
    }} />
  );
}
