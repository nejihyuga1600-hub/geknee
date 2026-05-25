'use client';
import { useState } from 'react';
import { CardShell } from './CardShell';
import { emergencyNumbersFor } from '@/lib/safety/emergencyNumbers';
import { LOST_DOC_STEPS } from '@/lib/safety/lostDocs';
import { fetchNearby, type NearbyPlace } from '@/lib/googleMaps/placesNearbyClient';

const DISPLAY = 'var(--font-display), Georgia, serif';
// Calm, legible-under-stress red. Distinct from the gold weather / amber crowds
// accents so the eye reads "safety net" without alarm. Falls back if the token
// isn't defined in the theme.
const ACCENT = 'var(--brand-danger, #f87171)';

type FinderType = 'pharmacy' | 'hospital';

export function SafetyCard({
  countryCode,
  anchor,
  online,
}: {
  countryCode: string | null;
  anchor: { lat: number; lng: number } | null;
  online: boolean;
}) {
  const { numbers, isFallback } = emergencyNumbersFor(countryCode);
  const [finding, setFinding] = useState<FinderType | null>(null);
  const [shown, setShown] = useState<FinderType | null>(null);
  const [results, setResults] = useState<NearbyPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);

  async function findNearest(type: FinderType) {
    setFinding(type);
    setShown(type);
    setError(null);
    setResults(null);
    // One-time geolocation at the moment of need; fall back to the trip's
    // anchor city if the user denies or it times out.
    const coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(anchor);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(anchor),
        { timeout: 8000 },
      );
    });
    if (!coords) {
      setError('No location available — enable location or set a trip city.');
      setFinding(null);
      return;
    }
    try {
      setResults(await fetchNearby(type, coords.lat, coords.lng));
    } catch {
      setError('Could not search right now. Try again.');
    } finally {
      setFinding(null);
    }
  }

  return (
    <CardShell accent={ACCENT} label="SAFETY">
      {/* Emergency numbers — the universal number leads, tinted; the rest follow. */}
      <div style={{ display: 'flex', gap: 8 }}>
        {([
          { k: 'universal', tag: 'EMERGENCY', lead: true },
          { k: 'ambulance', tag: 'AMBULANCE', lead: false },
          { k: 'fire', tag: 'FIRE', lead: false },
        ] as const).map(({ k, tag, lead }) => (
          <a
            key={k}
            href={`tel:${numbers[k]}`}
            aria-label={`Call ${tag.toLowerCase()} ${numbers[k]}`}
            style={{
              flex: 1, minHeight: 56, textDecoration: 'none',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              padding: '8px 4px', borderRadius: 10,
              background: lead ? 'color-mix(in srgb, var(--brand-danger, #f87171) 14%, transparent)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${lead ? 'color-mix(in srgb, var(--brand-danger, #f87171) 45%, transparent)' : 'var(--brand-border)'}`,
            }}
          >
            <span style={{ fontFamily: DISPLAY, fontSize: 20, lineHeight: 1, color: lead ? ACCENT : 'var(--brand-ink)' }}>
              {numbers[k]}
            </span>
            <span className="brand-mono-label" style={{ fontSize: 8 }}>{tag}</span>
          </a>
        ))}
      </div>
      {isFallback && (
        <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)', marginTop: 6 }}>
          Showing the universal GSM number (112). Confirm the local number on arrival.
        </div>
      )}

      {/* On-demand nearest finder — never auto-loads; one tap when needed. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {(['pharmacy', 'hospital'] as const).map((t) => (
          <button
            key={t}
            onClick={() => findNearest(t)}
            disabled={!online || finding !== null}
            title={!online ? 'Needs an internet connection' : undefined}
            style={{
              flex: 1, minHeight: 44, padding: '0 10px', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--brand-border)',
              color: online ? 'var(--brand-ink)' : 'var(--brand-ink-mute)',
              fontSize: 12, fontWeight: 600,
              cursor: online ? 'pointer' : 'not-allowed',
              opacity: !online ? 0.6 : 1,
            }}
          >
            {finding === t ? 'Searching…' : !online ? `${cap(t)} · offline` : `Nearest ${t}`}
          </button>
        ))}
      </div>

      {error && <div style={{ fontSize: 12, color: ACCENT, marginTop: 8 }}>{error}</div>}
      {shown && results && results.length === 0 && !error && (
        <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 8 }}>
          No open {shown} found within 5&nbsp;km.
        </div>
      )}
      {results && results.slice(0, 3).map((p, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 8,
            paddingTop: 8, borderTop: i === 0 ? '1px solid var(--brand-border)' : 'none',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: p.openNow === true ? 'var(--brand-success, #34d399)'
                : p.openNow === false ? 'var(--brand-warn, #f59e0b)' : 'var(--brand-ink-mute)',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--brand-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {p.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)' }}>
              {p.openNow === true ? 'Open now' : p.openNow === false ? 'May be closed' : 'Hours unknown'}
            </div>
          </div>
          {p.phone && (
            <a href={`tel:${p.phone}`} className="brand-mono-label" style={{ textDecoration: 'none', color: ACCENT }}>CALL</a>
          )}
          {p.lat != null && p.lng != null && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="brand-mono-label"
              style={{ textDecoration: 'none', color: 'var(--brand-accent)' }}
            >
              GO
            </a>
          )}
        </div>
      ))}

      {/* Lost-docs checklist — collapsed by default, calm chevron rotation. */}
      <button
        onClick={() => setDocsOpen((v) => !v)}
        aria-expanded={docsOpen}
        style={{
          marginTop: 12, width: '100%', minHeight: 44,
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--brand-ink-dim)', fontSize: 12, textAlign: 'left',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block', transition: 'transform 0.2s ease',
            transform: docsOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: ACCENT,
          }}
        >
          ▸
        </span>
        Lost passport or wallet?
      </button>
      {docsOpen && (
        <ol style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none' }}>
          {LOST_DOC_STEPS.map((s, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <span
                aria-hidden
                style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: DISPLAY, fontSize: 11, color: ACCENT,
                  background: 'color-mix(in srgb, var(--brand-danger, #f87171) 14%, transparent)',
                }}
              >
                {i + 1}
              </span>
              <div>
                <div style={{ fontSize: 13, color: 'var(--brand-ink)' }}>{s.title}</div>
                <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)', marginTop: 1 }}>{s.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </CardShell>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
