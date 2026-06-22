'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Geknee-branded glyphs \u2014 clean line-art replacing the prior generic emojis.
// Each SVG inherits currentColor so we can tint per-tag via TAG_COLORS.
// Passport label is "Passport (backup)" \u2014 virtual passports aren't accepted
// at immigration internationally, but a digital backup is useful for
// embassy replacement / insurance claims / sharing with travel buddies.
const TAG_LABELS: Record<string, string> = {
  passport:  'Passport (backup)',
  booking:   'Booking',
  insurance: 'Insurance',
  photo:     'Photo',
  other:     'Document',
};

const TAG_ICONS: Record<string, React.ReactElement> = {
  passport: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 2.5h8.5a1 1 0 0 1 1 1V14H4a1 1 0 0 1-1-1V2.5z" />
      <circle cx="7.75" cy="7" r="2" />
      <path d="M5.5 11.5h4.5" />
    </svg>
  ),
  booking: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 6.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a1.5 1.5 0 0 0 0 3v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1a1.5 1.5 0 0 0 0-3v-1z" />
      <path d="M9 5.5v1m0 1.25v1m0 1.25v1" strokeDasharray="0.5 1" />
    </svg>
  ),
  insurance: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 1.5l5.5 1.75v4.5c0 3-2.4 5.5-5.5 6.75-3.1-1.25-5.5-3.75-5.5-6.75v-4.5L8 1.5z" />
      <path d="M5.75 7.5l1.75 1.75 3-3.25" />
    </svg>
  ),
  photo: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="1.75" y="3.5" width="12.5" height="10" rx="1.5" />
      <circle cx="6" cy="7" r="1.25" />
      <path d="M2 12l3-3 3 2.5 2.5-2 3.5 3" />
    </svg>
  ),
  other: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 1.75h6.25L13 5v9.25H3.5z" />
      <path d="M9.5 1.75V5h3.5" />
      <path d="M5.5 8.5h5M5.5 11h5" />
    </svg>
  ),
};

const TAG_COLORS: Record<string, string> = {
  passport:  'rgba(99,102,241,0.25)',
  booking:   'rgba(14,165,233,0.25)',
  insurance: 'rgba(234,179,8,0.25)',
  photo:     'rgba(236,72,153,0.25)',
  other:     'rgba(255,255,255,0.1)',
};

interface TripFile {
  id: string; name: string; url: string; size: number; tag: string; createdAt: string;
  visibility: 'public' | 'private';
  isOwner: boolean;
  user: { name: string | null; image: string | null };
}

function fmtSize(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileVault({ tripId, currentUserId }: { tripId: string; currentUserId: string }) {
  const [files,      setFiles]      = useState<TripFile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [filterTag,  setFilterTag]  = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('other');
  const [selectedVis, setSelectedVis] = useState<'public' | 'private'>('public');
  const [error,      setError]      = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/trips/${tripId}/files`);
      const data = await res.json() as { files: TripFile[] };
      setFiles(data.files ?? []);
    } finally { setLoading(false); }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('tag', selectedTag);
      form.append('visibility', selectedVis);
      const res  = await fetch(`/api/trips/${tripId}/files`, { method: 'POST', body: form });
      const data = await res.json() as { file?: TripFile; error?: string };
      if (data.error) { setError(data.error); return; }
      if (data.file)  setFiles(prev => [data.file!, ...prev]);
    } catch { setError('Upload failed — check your connection.'); }
    finally  { setUploading(false); }
  }, [tripId, selectedTag, selectedVis]);

  const handleDelete = useCallback(async (fileId: string) => {
    await fetch(`/api/trips/${tripId}/files/${fileId}`, { method: 'DELETE' });
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, [tripId]);

  const toggleVisibility = useCallback(async (fileId: string, next: 'public' | 'private') => {
    const res = await fetch(`/api/trips/${tripId}/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: next }),
    });
    if (!res.ok) return;
    setFiles(prev => prev.map(f => (f.id === fileId ? { ...f, visibility: next } : f)));
  }, [tripId]);

  const displayed = filterTag === 'all' ? files : files.filter(f => f.tag === filterTag);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Upload row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selectedTag}
          onChange={e => setSelectedTag(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8, color: '#e2e8f0', fontSize: 12, padding: '7px 10px', outline: 'none',
          }}
        >
          {Object.entries(TAG_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          value={selectedVis}
          onChange={e => setSelectedVis(e.target.value as 'public' | 'private')}
          title="Who can see this file"
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8, color: '#e2e8f0', fontSize: 12, padding: '7px 10px', outline: 'none',
          }}
        >
          <option value="public">Public &mdash; everyone in trip</option>
          <option value="private">Private &mdash; only me</option>
        </select>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleUpload} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            flex: 1, padding: '7px 14px', borderRadius: 8, border: 'none', cursor: uploading ? 'not-allowed' : 'pointer',
            background: uploading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#7c3aed,#4f46e5)',
            color: '#fff', fontSize: 12, fontWeight: 700,
          }}
        >
          {uploading ? 'Uploading...' : '\u2B06\uFE0F Upload file'}
        </button>
      </div>

      {error && <div style={{ fontSize: 11, color: '#f87171' }}>{error}</div>}

      {/* Tag filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['all', ...Object.keys(TAG_LABELS)].map(t => (
          <button key={t} onClick={() => setFilterTag(t)} style={{
            padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
            background: filterTag === t ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.06)',
            color: filterTag === t ? '#a78bfa' : 'rgba(255,255,255,0.45)', fontWeight: filterTag === t ? 700 : 400,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            {t !== 'all' && TAG_ICONS[t]}
            {t === 'all' ? 'All' : TAG_LABELS[t]}
          </button>
        ))}
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', marginTop: 24 }}>Loading...</p>}
        {!loading && displayed.length === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', marginTop: 24, lineHeight: 1.7 }}>
            No files yet.{'\n'}Upload passports, bookings, or photos to share with your group.
          </p>
        )}
        {displayed.map(f => (
          <div key={f.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.05)', borderRadius: 10,
            padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
              background: TAG_COLORS[f.tag] ?? TAG_COLORS.other,
              color: '#e2e8f0', whiteSpace: 'nowrap', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {TAG_ICONS[f.tag] ?? TAG_ICONS.other}
              {TAG_LABELS[f.tag] ?? f.tag}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={f.url} target="_blank" rel="noreferrer" style={{
                color: '#a5b4fc', fontSize: 13, fontWeight: 600,
                textDecoration: 'none', display: 'block',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {f.name}
              </a>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                {fmtSize(f.size)} &middot; {f.user.name ?? 'You'}
                {f.visibility === 'private' && (
                  <span style={{ marginLeft: 6, color: '#fbbf24' }}>&middot; Private</span>
                )}
              </span>
            </div>
            {f.isOwner && (
              <button
                onClick={() => toggleVisibility(f.id, f.visibility === 'public' ? 'private' : 'public')}
                title={f.visibility === 'public' ? 'Make private (only you)' : 'Make public (whole trip)'}
                style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)',
                  cursor: 'pointer', fontSize: 12, lineHeight: 1, flexShrink: 0, padding: '2px 4px',
                }}
              >
                {f.visibility === 'public' ? String.fromCodePoint(0x1F513) : String.fromCodePoint(0x1F512)}
              </button>
            )}
            {f.isOwner && (
              <button
                onClick={() => handleDelete(f.id)}
                title="Delete"
                style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                  cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0,
                }}
              >
                {String.fromCodePoint(0x1F5D1)}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
