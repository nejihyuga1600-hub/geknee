'use client';

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function nightsBetween(a: string, b: string) {
  if (!a || !b) return null;
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  return diff > 0 ? Math.round(diff) : null;
}

function dateToStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function strToDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s: string, n: number) {
  const d = strToDate(s);
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}

function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function genPrices(location: string, count: number) {
  const seed = location.split('').reduce((a, c) => a + c.charCodeAt(0), 42);
  const rand = seededRand(seed);
  const base = 200 + rand() * 250;
  return Array.from({ length: count }, (_, i) => {
    const wave = Math.sin(i * 0.4) * 35 + Math.sin(i * 0.9 + 1) * 20;
    const noise = (rand() - 0.5) * 30;
    return Math.round(base + wave + noise);
  });
}

function fmtShort(d: string) {
  return strToDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Price Chart ──────────────────────────────────────────────────────────────
// All drag state is internal — parent only gets notified on pointerup.
// This prevents re-render loops that cause chart flickering.
function PriceChart({
  location, startDate, endDate, today,
  onDepChange, onRetChange,
}: {
  location: string; startDate: string; endDate: string; today: string;
  onDepChange: (d: string) => void; onRetChange: (d: string) => void;
}) {
  const svgRef    = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef   = useRef<'dep' | 'ret' | null>(null);

  // Refs hold the current values — never stale inside event handlers
  const depRef = useRef(startDate);
  const retRef = useRef(endDate);

  // Render state — only for display, driven by refs
  const [localDep, setLocalDep] = useState(startDate);
  const [localRet, setLocalRet] = useState(endDate);

  // Sync from parent only when not dragging
  useEffect(() => {
    if (!dragRef.current) { depRef.current = startDate; setLocalDep(startDate); }
  }, [startDate]);
  useEffect(() => {
    if (!dragRef.current) { retRef.current = endDate; setLocalRet(endDate); }
  }, [endDate]);

  // Build 60-day window starting 2 days before today
  const dates = useMemo(() => {
    const arr: string[] = [];
    const base = strToDate(today);
    base.setDate(base.getDate() - 2);
    for (let i = 0; i < 60; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      arr.push(dateToStr(d));
    }
    return arr;
  }, [today]);

  const prices = useMemo(() => genPrices(location, dates.length), [location, dates.length]);

  const COL_W  = 34;
  const PAD_L  = 44;
  const PAD_R  = 16;
  const H      = 130;
  const PAD_T  = 18;
  const PAD_B  = 26;
  const totalW = PAD_L + dates.length * COL_W + PAD_R;
  const chartH = PAD_T + H + PAD_B;

  const minP = Math.min(...prices) - 15;
  const maxP = Math.max(...prices) + 15;

  const priceY  = (p: number) => PAD_T + H - ((p - minP) / (maxP - minP)) * H;
  const idxToX  = (i: number) => PAD_L + i * COL_W + COL_W / 2;
  const dateToX = (d: string) => { const i = dates.indexOf(d); return i >= 0 ? idxToX(i) : null; };

  function xToDate(clientX: number) {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    const i = Math.round((x - PAD_L - COL_W / 2) / COL_W);
    const clamped = Math.max(0, Math.min(dates.length - 1, i));
    return dates[clamped];
  }

  // Scroll to departure on mount only
  useEffect(() => {
    if (!startDate || !scrollRef.current) return;
    const i = dates.indexOf(startDate);
    if (i < 0) return;
    const x = idxToX(i);
    scrollRef.current.scrollLeft = x - scrollRef.current.clientWidth / 2;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  function dotColor(p: number) {
    const pct = (p - minP) / (maxP - minP);
    if (pct > 0.75) return '#ef4444';
    if (pct > 0.5)  return '#f97316';
    if (pct > 0.25) return '#eab308';
    return '#22c55e';
  }

  const linePoints = dates.map((_, i) => `${idxToX(i)},${priceY(prices[i])}`).join(' ');
  const labelDates = dates.filter((_, i) => i % 5 === 0);

  // ── Pointer handlers — each handle sets dragRef explicitly ──
  const startDrag = useCallback((which: 'dep' | 'ret', e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = which;
    svgRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const d = xToDate(e.clientX);
    if (!d) return;
    if (dragRef.current === 'dep') {
      if (!retRef.current || d < retRef.current) {
        depRef.current = d;
        setLocalDep(d);
      }
    } else {
      if (!depRef.current || d > depRef.current) {
        retRef.current = d;
        setLocalRet(d);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates]);

  const onPointerUp = useCallback(() => {
    if (dragRef.current === 'dep') onDepChange(depRef.current);
    if (dragRef.current === 'ret') onRetChange(retRef.current);
    dragRef.current = null;
  }, [onDepChange, onRetChange]);

  const depX = localDep ? dateToX(localDep) : null;
  const retX = localRet ? dateToX(localRet) : null;
  const depIdx = localDep ? dates.indexOf(localDep) : -1;
  const retIdx = localRet ? dates.indexOf(localRet) : -1;
  const depY = depIdx >= 0 ? priceY(prices[depIdx]) : null;
  const retY = retIdx >= 0 ? priceY(prices[retIdx]) : null;
  const depP = depIdx >= 0 ? prices[depIdx] : null;
  const retP = retIdx >= 0 ? prices[retIdx] : null;

  return (
    <div style={{ margin: '0 0 24px', borderRadius: 16, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', fontWeight: 600 }}>
          ✈ {location ? `FLIGHTS TO ${location.toUpperCase()}` : 'PRICE CALENDAR'} — ESTIMATED
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
          {depP && <span style={{ color: '#38bdf8', fontWeight: 600 }}>DEP ${depP}</span>}
          {retP && <span style={{ color: '#a78bfa', fontWeight: 600 }}>RET ${retP}</span>}
        </div>
      </div>

      {/* Scrollable chart area */}
      <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
        <svg
          ref={svgRef}
          width={totalW}
          height={chartH}
          style={{ display: 'block', userSelect: 'none', touchAction: 'none' }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Y grid + labels */}
          {([minP + 15, minP + (maxP - minP) / 2, maxP - 15] as number[]).map((p, i) => (
            <g key={i}>
              <line x1={PAD_L} y1={priceY(p)} x2={totalW - PAD_R} y2={priceY(p)}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={PAD_L - 6} y={priceY(p) + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)">
                ${Math.round(p)}
              </text>
            </g>
          ))}

          {/* Shaded range between dep and ret */}
          {depX !== null && retX !== null && (
            <rect
              x={depX} y={PAD_T} width={retX - depX} height={H}
              fill="rgba(56,189,248,0.07)"
            />
          )}

          {/* Price line */}
          <polyline points={linePoints} fill="none" stroke="#1d4ed8" strokeWidth={1.5} strokeLinejoin="round" />

          {/* Price dots */}
          {dates.map((_, i) => (
            <circle key={i} cx={idxToX(i)} cy={priceY(prices[i])} r={3.5} fill={dotColor(prices[i])} />
          ))}

          {/* Departure marker */}
          {depX !== null && depY !== null && (
            <g style={{ cursor: 'ew-resize' }} onPointerDown={e => startDrag('dep', e)}>
              <line x1={depX} y1={PAD_T} x2={depX} y2={PAD_T + H}
                stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4 3" />
              <rect x={depX - 24} y={PAD_T - 16} width={48} height={14} rx={4} fill="#0ea5e9" />
              <text x={depX} y={PAD_T - 5} textAnchor="middle" fontSize={9} fill="#fff" fontWeight="700" style={{ pointerEvents: 'none' }}>
                {fmtShort(localDep)}
              </text>
              {/* Larger invisible hit area */}
              <circle cx={depX} cy={depY} r={18} fill="transparent" />
              <circle cx={depX} cy={depY} r={10} fill="#0ea5e9" stroke="#fff" strokeWidth={2} style={{ pointerEvents: 'none' }} />
              <text x={depX} y={depY + 4} textAnchor="middle" fontSize={8} fill="#fff" fontWeight="bold" style={{ pointerEvents: 'none' }}>DEP</text>
            </g>
          )}

          {/* Return marker */}
          {retX !== null && retY !== null && (
            <g style={{ cursor: 'ew-resize' }} onPointerDown={e => startDrag('ret', e)}>
              <line x1={retX} y1={PAD_T} x2={retX} y2={PAD_T + H}
                stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 3" />
              <rect x={retX - 24} y={PAD_T - 16} width={48} height={14} rx={4} fill="#7c3aed" />
              <text x={retX} y={PAD_T - 5} textAnchor="middle" fontSize={9} fill="#fff" fontWeight="700" style={{ pointerEvents: 'none' }}>
                {fmtShort(localRet)}
              </text>
              {/* Larger invisible hit area */}
              <circle cx={retX} cy={retY} r={18} fill="transparent" />
              <polygon
                points={`${retX},${retY - 11} ${retX + 10},${retY} ${retX},${retY + 11} ${retX - 10},${retY}`}
                fill="#7c3aed" stroke="#fff" strokeWidth={2} style={{ pointerEvents: 'none' }}
              />
              <text x={retX} y={retY + 4} textAnchor="middle" fontSize={8} fill="#fff" fontWeight="bold" style={{ pointerEvents: 'none' }}>RET</text>
            </g>
          )}

          {/* X axis labels */}
          {labelDates.map(d => {
            const i = dates.indexOf(d);
            const x = idxToX(i);
            const dt = strToDate(d);
            return (
              <text key={d} x={x} y={PAD_T + H + 16} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.3)">
                {dt.getDate() === 1
                  ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : dt.getDate()}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ padding: '5px 14px 9px', fontSize: 10, color: 'rgba(255,255,255,0.3)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span>Drag ◯ departure &nbsp; ◇ return independently</span>
        <span><span style={{ color: '#22c55e' }}>●</span> low &nbsp;<span style={{ color: '#eab308' }}>●</span> mid &nbsp;<span style={{ color: '#ef4444' }}>●</span> high</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 12, color: '#fff', fontSize: 16,
  padding: '12px 16px', width: '100%', outline: 'none',
  colorScheme: 'dark', boxSizing: 'border-box',
};

function DatesForm() {
  const params = useSearchParams();
  const router = useRouter();

  const location       = params.get('location')    ?? '';
  const purpose        = params.get('purpose')     ?? '';
  const style          = params.get('style')       ?? '';
  const budget         = params.get('budget')      ?? '';
  const interests      = params.get('interests')   ?? '';
  const constraints    = params.get('constraints') ?? '';
  const extraCitiesRaw = params.get('extraCities') ?? '';

  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [fromCity,  setFromCity]  = useState(params.get('travelingFrom') ?? '');

  const [cities, setCities] = useState<string[]>(() =>
    extraCitiesRaw ? extraCitiesRaw.split(',').filter(Boolean).map(c => c.trim()) : []
  );
  const [cityInput, setCityInput] = useState('');
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'done' | 'denied'>('idle');

  useEffect(() => {
    if (fromCity || !navigator.geolocation) return;
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${pos.coords.latitude},${pos.coords.longitude}&key=${key}`
          );
          const data = await res.json() as { results?: Array<{ address_components: Array<{ long_name: string; types: string[] }>; formatted_address: string }> };
          const comps = data.results?.[0]?.address_components;
          const city = comps?.find(c => c.types.includes('locality'))?.long_name
            ?? data.results?.[0]?.formatted_address?.split(',')[0]?.trim();
          if (city) { setFromCity(city); setGeoStatus('done'); } else setGeoStatus('idle');
        } catch { setGeoStatus('idle'); }
      },
      () => setGeoStatus('denied'),
      { timeout: 8000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalNights = nightsBetween(startDate, endDate);
  const allValid = !!totalNights;

  function addCity() {
    const t = cityInput.trim();
    if (t && !cities.includes(t)) setCities(c => [...c, t]);
    setCityInput('');
  }

  // Stable callbacks so PriceChart doesn't re-render when parent re-renders
  const handleDepChange = useCallback((d: string) => {
    setStartDate(d);
    setEndDate(prev => (prev && prev <= d) ? addDays(d, 4) : prev);
  }, []);

  const handleRetChange = useCallback((d: string) => setEndDate(d), []);

  function handleNext() {
    if (!allValid) return;
    const q = new URLSearchParams({ location, purpose, style, budget, interests, constraints, startDate, endDate, nights: String(totalNights) });
    if (fromCity.trim()) q.set('travelingFrom', fromCity.trim());
    if (cities.length > 0) q.set('stops', JSON.stringify(cities.map(city => ({ city }))));
    router.push(`/plan/summary?${q.toString()}`);
  }

  return (
    <main style={{
      minHeight: '100vh', background: '#060816',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 16px', fontFamily: "'Segoe UI',system-ui,sans-serif",
    }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 40% 45%, rgba(30,70,200,0.4) 0%, rgba(6,8,22,0.96) 58%, #030510 100%)' }} />

      <div style={{
        position: 'relative', zIndex: 10,
        background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.13)', borderRadius: 24,
        padding: '40px 36px', maxWidth: 620, width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Progress */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Step 3 of 4</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>75%</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 999 }}>
            <div style={{ height: '100%', width: '75%', borderRadius: 999, background: 'linear-gradient(90deg,#38bdf8,#818cf8)' }} />
          </div>
        </div>

        <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 700, marginBottom: 6 }}>When are you going?</h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginBottom: 28 }}>
          {location ? <>Heading to: <span style={{ color: '#38bdf8' }}>{location}</span></> : 'Set your travel dates.'}
        </p>

        {/* Traveling from */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>
            Where are you traveling from?
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder={geoStatus === 'loading' ? 'Detecting your location...' : 'e.g. New York, London, Sydney...'}
              value={fromCity}
              onChange={e => setFromCity(e.target.value)}
              style={{ ...INPUT, paddingRight: geoStatus === 'loading' ? 42 : 16 }}
            />
            {geoStatus === 'loading' && (
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(56,189,248,0.3)', borderTopColor: '#38bdf8', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
            )}
          </div>
          <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
        </div>

        {/* Date inputs */}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>TRAVEL DATES</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>Departure</label>
            <input type="date" min={today} value={startDate}
              onChange={e => handleDepChange(e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>Return</label>
            <input type="date" min={startDate || today} value={endDate}
              onChange={e => handleRetChange(e.target.value)} style={INPUT} />
          </div>
        </div>

        {totalNights !== null && (
          <p style={{ color: '#38bdf8', fontSize: 14, fontWeight: 600, textAlign: 'center', margin: '0 0 16px' }}>
            {totalNights} night{totalNights !== 1 ? 's' : ''}{location ? ` in ${location}` : ''}
          </p>
        )}

        {/* Price chart — stable component, internal drag state */}
        <PriceChart
          location={location}
          startDate={startDate}
          endDate={endDate}
          today={today}
          onDepChange={handleDepChange}
          onRetChange={handleRetChange}
        />

        {/* City stops */}
        {cities.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 8 }}>
              {String.fromCodePoint(0x2728)} AI will schedule optimal time at each stop
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cities.map(city => (
                <div key={city} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 999, padding: '5px 10px 5px 13px', color: '#fbbf24', fontSize: 13, fontWeight: 600 }}>
                  {city}
                  <button onClick={() => setCities(c => c.filter(x => x !== city))} style={{ background: 'none', border: 'none', color: 'rgba(251,191,36,0.55)', fontSize: 15, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>&times;</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          <input
            placeholder={cities.length > 0 ? 'Add another stop...' : '+ Add a stop to your trip...'}
            value={cityInput}
            onChange={e => setCityInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCity()}
            style={{ ...INPUT, fontSize: 14 }}
          />
          {cityInput.trim() && (
            <button onClick={addCity} style={{ padding: '12px 16px', borderRadius: 12, border: 'none', flexShrink: 0, background: 'rgba(56,189,248,0.7)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Add</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => router.back()} style={{ flex: 1, padding: '15px 0', borderRadius: 14, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontSize: 15, cursor: 'pointer' }}>Back</button>
          <button onClick={handleNext} disabled={!allValid} style={{ flex: 2, padding: '15px 0', borderRadius: 14, border: 'none', background: allValid ? 'linear-gradient(135deg,#38bdf8,#818cf8)' : 'rgba(255,255,255,0.1)', color: allValid ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 15, fontWeight: 600, cursor: allValid ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
            See my trip plan {String.fromCodePoint(0x2192)}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function DatesPage() {
  return <Suspense><DatesForm /></Suspense>;
}
