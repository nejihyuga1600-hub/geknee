'use client';

import { useEffect, useState } from 'react';
import type { DashboardSnapshot, ProviderResult } from '@/lib/admin/types';

const MONO = 'var(--font-mono-display), ui-monospace, monospace';
const SERIF = 'Georgia, "Iowan Old Style", serif';

const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (n: number) => n.toLocaleString('en-US');
const pct = (n: number) => `${n.toFixed(1)}%`;

export default function DashboardClient() {
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dashboard', { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as DashboardSnapshot;
      setSnap(data);
      setRefreshedAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ minHeight: '100svh', background: '#0a0f1e', color: '#f1f5f9', fontFamily: MONO }}>
      <header style={{ padding: '32px 28px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div>
          <div style={{ color: '#a78bfa', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>geknee · mission control</div>
          <div style={{ color: '#f1f5f9', fontFamily: SERIF, fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em' }}>~/command-center / overview / live</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {refreshedAt && <span style={{ color: '#64748b', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase' }}>refreshed {refreshedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button
            onClick={load}
            disabled={loading}
            style={{ padding: '8px 14px', borderRadius: 999, background: 'rgba(167,139,250,.12)', border: '1px solid rgba(167,139,250,.32)', color: '#a78bfa', fontSize: 10, fontFamily: MONO, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? 'syncing…' : 'refresh'}
          </button>
        </div>
      </header>

      {error && <div style={{ padding: '14px 28px', color: '#fca5a5' }}>error loading: {error}</div>}

      {!snap ? (
        <div style={{ padding: 48, color: 'rgba(241,245,249,.55)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase' }}>Booting mission control…</div>
      ) : (
        <main style={{ padding: '24px 28px 64px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, maxWidth: 1400, margin: '0 auto' }}>
          <KpiCard
            title="TOTAL USERS"
            r={snap.users}
            renderOk={(d) => (
              <>
                <BigNum value={fmtN(d.total)} />
                <SubLine items={[`+${d.newLast24h} today`, `+${d.newLast7d} 7d`, `+${d.newLast30d} 30d`]} accent="#34d399" />
                <SubLine items={[`${d.activeLast7d} active`, `${d.paid} paid`, `${d.paidPct}% paid rate`]} />
                <Sparkbars values={d.spark7d} />
              </>
            )}
          />
          <KpiCard
            title="REVENUE · MRR"
            r={snap.revenue}
            renderOk={(d) => (
              <>
                <BigNum value={fmtUsd(d.mrrUsd)} suffix="MRR" />
                <SubLine items={[`today ${fmtUsd(d.todayUsd)}`, `7d ${fmtUsd(d.last7dUsd)}`, `30d ${fmtUsd(d.last30dUsd)}`]} accent="#34d399" />
                <SubLine items={[`${d.paidSubsActive} subs`, `+${d.newPaidLast7d} new 7d`, `-${d.cancelsLast7d} canceled 7d`]} />
              </>
            )}
          />
          <KpiCard
            title="SOCIAL FOLLOWERS"
            r={snap.followers}
            renderOk={(d) => (
              <>
                <BigNum value={fmtN(d.total)} />
                <SubLine items={d.perPlatform.map((p) => `${p.platform.toUpperCase()} ${fmtN(p.followers)}${p.handle ? ` @${p.handle}` : ''}`)} accent="#34d399" />
              </>
            )}
          />
          <KpiCard
            title="SOCIAL VIEWS · 7D"
            r={snap.socialViews}
            renderOk={(d) => (
              <>
                <BigNum value={fmtN(d.total7d)} />
                <SubLine items={d.perPlatform.map((p) => `${p.platform.toUpperCase()} ${fmtN(p.views7d)}`)} accent="#34d399" />
              </>
            )}
          />
          <KpiCard
            title="AD SPEND · TODAY"
            r={snap.adSpend}
            renderOk={(d) => (
              <>
                <BigNum value={fmtUsd(d.todayUsd)} />
                <SubLine items={[`7d ${fmtUsd(d.last7dUsd)}`]} accent="#34d399" />
                {d.perPlatform.map((p) => (
                  <SubLine key={p.platform} items={[`${p.platform.toUpperCase()} today ${fmtUsd(p.todayUsd)}`, `${p.activeCampaigns} active`]} />
                ))}
              </>
            )}
          />
          <KpiCard
            title="VISITORS · 7D"
            r={snap.posthog}
            renderOk={(d) => (
              <>
                <BigNum value={fmtN(d.uniqueVisitorsLast7d)} />
                <SubLine items={[`${fmtN(d.pageviewsLast7d)} pv`, `signup ${pct(d.signupConversionPct)}`, `paid ${pct(d.paidConversionPct)}`]} accent="#34d399" />
                {d.topReferrers.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <Label>TOP REFERRERS</Label>
                    {d.topReferrers.map((r) => (
                      <div key={r.referrer} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                        <span>{r.referrer}</span><span style={{ color: '#94a3b8' }}>{fmtN(r.visits)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          />
          <div style={{ gridColumn: '1 / -1' }}>
            <KpiCard
              title="PRODUCT · GEKNEE INTERNALS"
              r={snap.product}
              renderOk={(d) => (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 18 }}>
                  <Stat label="Trips total" value={fmtN(d.tripsTotal)} />
                  <Stat label="New trips 7d" value={fmtN(d.tripsLast7d)} />
                  <Stat label="Itineraries 7d" value={fmtN(d.itinerariesGeneratedLast7d)} />
                  <Stat label="Agent tokens 7d" value={fmtN(d.agentTokensLast7d)} sub={`~${fmtUsd(d.agentCostUsdLast7d)}`} />
                  <div>
                    <Label>TOP LOCATIONS 7D</Label>
                    {d.topLocationsLast7d.length === 0 && <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>no trips yet</div>}
                    {d.topLocationsLast7d.map((l, i) => (
                      <div key={l.location} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                        <span>{i + 1}. {l.location}</span><span style={{ color: '#94a3b8' }}>×{l.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            />
          </div>
        </main>
      )}

      <footer style={{ padding: '0 28px 36px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ color: '#64748b', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase' }}>geknee · v1 · daily digest fires 13:00 utc → nghiaphan081301@gmail.com</div>
      </footer>
    </div>
  );
}

// ───────────────────── helpers ─────────────────────

function StatusBadge({ status }: { status: 'ok' | 'unconfigured' | 'error' }) {
  const map = {
    ok: { bg: '#22c55e1a', col: '#22c55e', border: '#22c55e55', label: 'RUNNING' },
    unconfigured: { bg: '#3f3f461a', col: '#a1a1aa', border: '#71717a', label: 'SETUP' },
    error: { bg: '#ef44441a', col: '#ef4444', border: '#ef444455', label: 'ERROR' },
  } as const;
  const s = map[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, fontSize: 9, letterSpacing: '.16em', fontWeight: 700, background: s.bg, color: s.col, border: `1px solid ${s.border}` }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.col, boxShadow: status === 'ok' ? `0 0 8px ${s.col}` : 'none' }} />
      {s.label}
    </span>
  );
}

function KpiCard<T>({ title, r, renderOk }: { title: string; r: ProviderResult<T>; renderOk: (d: T) => React.ReactNode }) {
  return (
    <div style={{ background: '#0f1424', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '16px 18px', minHeight: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#a78bfa', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', fontWeight: 700 }}>{title}</span>
        <StatusBadge status={r.status} />
      </div>
      {r.status === 'ok' && renderOk(r.data)}
      {r.status === 'unconfigured' && (
        <div>
          <div style={{ color: '#cbd5e1', fontSize: 12, marginBottom: 8 }}>not configured</div>
          <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.6 }}>missing env vars:</div>
          {r.missing.map((m) => (
            <div key={m} style={{ color: '#fbbf24', fontSize: 11, marginTop: 2 }}>• {m}</div>
          ))}
        </div>
      )}
      {r.status === 'error' && (
        <div style={{ color: '#fca5a5', fontSize: 12, lineHeight: 1.5, wordBreak: 'break-word' }}>{r.error}</div>
      )}
    </div>
  );
}

function BigNum({ value, suffix }: { value: string; suffix?: string }) {
  return (
    <div style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 800, lineHeight: 1, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
      {value}
      {suffix && <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: MONO, marginLeft: 8, letterSpacing: '.14em' }}>{suffix}</span>}
    </div>
  );
}

function SubLine({ items, accent = '#94a3b8' }: { items: string[]; accent?: string }) {
  return <div style={{ marginTop: 6, fontSize: 11, color: accent, lineHeight: 1.5 }}>{items.join(' · ')}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ color: '#94a3b8', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', marginBottom: 4 }}>{children}</div>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.01em' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Sparkbars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28, marginTop: 12 }}>
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(4, (v / max) * 100)}%`,
            background: i === values.length - 1 ? '#a78bfa' : 'rgba(167,139,250,.45)',
            borderRadius: 2,
          }}
          title={`${v}`}
        />
      ))}
    </div>
  );
}
