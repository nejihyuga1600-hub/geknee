'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

type PriceMap = Record<string, number>;
const WINDOW = 31; // show full month at once
const DOT_HIT = 10; // SVG-unit radius for hit detection

function priceColor(rank: number): string {
  if (rank < 0.20) return '#22c55e';
  if (rank < 0.42) return '#84cc16';
  if (rank < 0.62) return '#eab308';
  if (rank < 0.82) return '#f97316';
  return '#ef4444';
}

const NAV_BTN: React.CSSProperties = {
  background: 'none', border: 'none',
  color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
  fontSize: 20, padding: '0 8px', lineHeight: 1,
};

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function diffDays(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

// ─── Chart constants ──────────────────────────────────────────────────────────
const W = 500, H = 130;
const PL = 46, PR = 8, PT = 14, PB = 26;
const cW = W - PL - PR;
const cH = H - PT - PB;

export default function FlightPriceChart({
  originIata, destIata, startDate, endDate, onSelectStart, onSelectEnd,
}: {
  originIata: string; destIata: string;
  startDate: string; endDate: string;
  onSelectStart: (d: string) => void;
  onSelectEnd:   (d: string) => void;
}) {
  const nights = startDate && endDate ? Math.max(1, diffDays(startDate, endDate)) : 7;

  const departureMonth = startDate
    ? startDate.slice(0, 7)
    : (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; })();

  const [viewMonth, setViewMonth] = useState(departureMonth);
  const [prices,    setPrices]    = useState<PriceMap>({});
  const [loading,   setLoading]   = useState(false);
  const [noData,    setNoData]    = useState(false);
  const [hovered,   setHovered]   = useState<string | null>(null);
  const [source,    setSource]    = useState<'skyscanner'|'amadeus'|'ai-estimate'|null>(null);
  const [cache,     setCache]     = useState<Record<string, { prices: PriceMap; source: 'skyscanner'|'amadeus'|'ai-estimate' }>>({});

  // For cursor styling only — actual drag state lives in dragRef
  const [dragType, setDragType] = useState<'start'|'end'|'pan'|null>(null);

  // ── Scroll ────────────────────────────────────────────────────────────────
  const [viewStart, setViewStart] = useState(1);

  const [vy, vm]   = viewMonth.split('-').map(Number);
  const monthLabel  = new Date(vy, vm-1).toLocaleString('default', { month:'long', year:'numeric' });
  const daysInMonth = new Date(vy, vm, 0).getDate();
  const today       = new Date().toISOString().split('T')[0];
  const canScroll   = daysInMonth > WINDOW;
  const maxStart    = Math.max(1, daysInMonth - WINDOW + 1);
  const windowEnd   = Math.min(viewStart + WINDOW - 1, daysInMonth);
  const visibleDays = windowEnd - viewStart + 1;

  function xOf(day: number)    { return PL + ((day - viewStart) / Math.max(visibleDays - 1, 1)) * cW; }
  function yOf(price: number)  { return PT + cH - ((price - minP) / span) * cH; }
  function rank(price: number) { return (price - minP) / span; }

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchPrices = useCallback(async (orig: string, dest: string, month: string, n: number) => {
    const key = `${orig}-${dest}-${month}-${n}`;
    if (cache[key]) { setPrices(cache[key].prices); setSource(cache[key].source); setNoData(false); return; }
    setLoading(true); setNoData(false);
    try {
      const res  = await fetch(`/api/flight-prices?origin=${orig}&destination=${dest}&month=${month}&nights=${n}`);
      const data = await res.json();
      const p: PriceMap = data.prices ?? {};
      const src: 'skyscanner'|'amadeus'|'ai-estimate' = data.source === 'skyscanner' ? 'skyscanner' : data.source === 'amadeus' ? 'amadeus' : 'ai-estimate';
      if (Object.keys(p).length > 0) {
        setPrices(p); setSource(src); setCache(c => ({ ...c, [key]: { prices: p, source: src } })); setNoData(false);
      } else { setPrices({}); setSource(null); setNoData(true); }
    } catch { setPrices({}); setSource(null); setNoData(true); }
    finally { setLoading(false); }
  }, [cache]);

  useEffect(() => {
    if (!originIata || !destIata) return;
    fetchPrices(originIata, destIata, viewMonth, nights);
  }, [originIata, destIata, viewMonth, nights]); // eslint-disable-line

  useEffect(() => {
    if (startDate && !startDate.startsWith(viewMonth)) setViewMonth(startDate.slice(0, 7));
  }, [startDate]); // eslint-disable-line

  useEffect(() => {
    if (startDate?.startsWith(viewMonth)) {
      const day   = parseInt(startDate.split('-')[2]);
      const ideal = Math.max(1, day - Math.floor(WINDOW / 2));
      setViewStart(Math.min(ideal, Math.max(1, daysInMonth - WINDOW + 1)));
    } else { setViewStart(1); }
  }, [viewMonth]); // eslint-disable-line

  function changeMonth(delta: number) {
    const [y, m] = viewMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  // ── Build point data ──────────────────────────────────────────────────────
  const allPts = Array.from({ length: daysInMonth }, (_, i) => {
    const day     = i + 1;
    const dateStr = `${viewMonth}-${String(day).padStart(2,'0')}`;
    return { date: dateStr, day, price: prices[dateStr] ?? null };
  });
  const allPrices = allPts.filter(p => p.price != null).map(p => p.price as number);
  const minP = allPrices.length ? Math.min(...allPrices) : 0;
  const maxP = allPrices.length ? Math.max(...allPrices) : 1;
  const span = maxP - minP || 1;

  const pts   = allPts.filter(p => p.day >= viewStart && p.day <= windowEnd);
  const known = pts.filter(p => p.price !== null) as { date: string; day: number; price: number }[];

  const linePath = known.length > 1
    ? known.map((p, i) => `${i===0?'M':'L'}${xOf(p.day).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(' ') : '';
  const areaPath = known.length > 1
    ? `${linePath} L${xOf(known[known.length-1].day).toFixed(1)},${(H-PB).toFixed(1)} L${xOf(known[0].day).toFixed(1)},${(H-PB).toFixed(1)} Z` : '';

  const yTicks  = [0, 0.5, 1].map(t => ({ price: minP + t * span, y: PT + cH - t * cH }));
  const xLabels = pts.filter((_,i) => i===0 || i===pts.length-1 || i%5===0).map(p => p.day);

  const selectedPrice   = startDate ? prices[startDate] : null;
  const endDateInView   = endDate?.startsWith(viewMonth) ?? false;
  const endDay          = endDate ? parseInt(endDate.split('-')[2]) : null;
  const endDayInWindow  = endDay != null && endDay >= viewStart && endDay <= windowEnd;
  // Return dot is always a flat marker at the bottom of the chart area — it marks the date,
  // not a price (the round-trip price belongs to the DEPARTURE date, not the return date).
  const endDotY = H - PB - 8;

  const scrollFrac = canScroll ? (viewStart - 1) / (maxStart - 1) : 0;
  const thumbW     = canScroll ? WINDOW / daysInMonth : 1;
  const thumbLeft  = scrollFrac * (1 - thumbW);

  // ── Centralised mouse handling ────────────────────────────────────────────
  const svgRef  = useRef<SVGSVGElement>(null);

  // All live drag state in a ref — no stale-closure issues
  const dragRef = useRef<{
    type: 'start' | 'end' | 'pan' | null;
    moved: boolean;
    panVs: number;
    startClientX: number;
    startClientY: number;
  }>({ type: null, moved: false, panVs: 1, startClientX: 0, startClientY: 0 });

  // Convert client X → date string using current view geometry
  function clientXToDate(clientX: number): string | null {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    const raw  = ((svgX - PL) / cW) * (visibleDays - 1) + viewStart;
    const day  = Math.max(1, Math.min(daysInMonth, Math.round(raw)));
    return `${viewMonth}-${String(day).padStart(2,'0')}`;
  }

  // Convert client X → SVG X
  function clientToSvgX(clientX: number): number {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const svgX = clientToSvgX(e.clientX);

    let target: 'start' | 'end' | 'pan' = 'pan';

    // Check proximity to departure dot first
    if (startDate?.startsWith(viewMonth)) {
      const sDay = parseInt(startDate.split('-')[2]);
      if (sDay >= viewStart && sDay <= windowEnd) {
        if (Math.abs(svgX - xOf(sDay)) <= DOT_HIT) target = 'start';
      }
    }
    // Check proximity to return dot
    if (target === 'pan' && endDateInView && endDayInWindow && endDay != null) {
      if (Math.abs(svgX - xOf(endDay)) <= DOT_HIT) target = 'end';
    }

    dragRef.current = {
      type: target,
      moved: false,
      panVs: viewStart,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
    setDragType(target);
  }

  // Attach window-level move + up so drag works outside the SVG
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const dr = dragRef.current;
      if (!dr.type) return;
      const dx = Math.abs(e.clientX - dr.startClientX);
      const dy = Math.abs(e.clientY - dr.startClientY);
      if (dx > 3 || dy > 3) dr.moved = true;

      if (dr.type === 'pan' && canScroll) {
        const rect     = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pxPerDay = (rect.width * cW / W) / Math.max(visibleDays - 1, 1);
        const dDay     = Math.round(-(e.clientX - dr.startClientX) / pxPerDay);
        setViewStart(vs => Math.max(1, Math.min(maxStart, dr.panVs + dDay)));
      } else if (dr.type === 'start') {
        const date = clientXToDate(e.clientX);
        if (date && date >= today) {
          onSelectStart(date);
          onSelectEnd(addDays(date, nights));
        }
      } else if (dr.type === 'end') {
        const date = clientXToDate(e.clientX);
        if (date && startDate && date > startDate) {
          onSelectEnd(date);
        }
      }
    }

    function onUp(e: MouseEvent) {
      const dr = dragRef.current;
      if (!dr.type) return;

      // If mouse barely moved → treat as a click
      if (!dr.moved) {
        const date = clientXToDate(e.clientX);
        if (date && date >= today) {
          if (dr.type === 'end') {
            // Clicked return dot — no-op (it's already on its date)
          } else {
            // Clicked anywhere else → set departure (and auto-set return)
            onSelectStart(date);
            onSelectEnd(addDays(date, nights));
          }
        }
      }

      dragRef.current = { type: null, moved: false, panVs: 1, startClientX: 0, startClientY: 0 };
      setDragType(null);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canScroll, maxStart, visibleDays, viewMonth, viewStart, startDate, endDate, nights, today]);

  // ── Hover via SVG mousemove (only when not dragging) ─────────────────────
  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (dragRef.current.type) return; // let window handler manage movement
    const svgX = clientToSvgX(e.clientX);
    // Find nearest visible dot
    let best: string | null = null;
    let bestDist = DOT_HIT;
    for (const p of known) {
      const d = Math.abs(svgX - xOf(p.day));
      if (d < bestDist) { bestDist = d; best = p.date; }
    }
    // Check return dot too
    if (endDateInView && endDayInWindow && endDay != null) {
      const d = Math.abs(svgX - xOf(endDay));
      if (d < bestDist) { best = '__end__'; }
    }
    setHovered(best);
  }
  function handleSvgMouseLeave() { setHovered(null); }

  // ── No route guard ────────────────────────────────────────────────────────
  if (!originIata || !destIata) {
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>{String.fromCodePoint(0x2708, 0xFE0F)}</div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.5 }}>
            {!originIata && !destIata ? 'Fill in "Traveling from" and "Traveling to" above to see flight price trends'
              : !originIata ? 'Fill in "Traveling from" above to see flight price trends'
              : 'Fill in "Traveling to" above to see flight price trends'}
          </p>
        </div>
      </div>
    );
  }

  const cursorStyle =
    dragType === 'pan'   ? 'grabbing' :
    dragType === 'start' ? 'ew-resize' :
    dragType === 'end'   ? 'ew-resize' :
    hovered              ? 'pointer'   :
    canScroll            ? 'grab'      : 'default';

  return (
    <div style={{ marginTop: 14 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 7 }}>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:'rgba(255,255,255,0.35)' }}>
          {String.fromCodePoint(0x2708,0xFE0F)} ROUND TRIP &nbsp;{originIata} {'\u2192'} {destIata}
          {nights > 0 && <span style={{ fontWeight:400 }}> &nbsp;&middot;&nbsp; {nights} night{nights!==1?'s':''}</span>}
        </span>
        <div style={{ display:'flex', alignItems:'center' }}>
          <button onClick={() => changeMonth(-1)} style={NAV_BTN}>‹</button>
          <span style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.65)', minWidth:124, textAlign:'center' }}>{monthLabel}</span>
          <button onClick={() => changeMonth(1)}  style={NAV_BTN}>›</button>
        </div>
      </div>

      {/* Chart card */}
      <div style={{ background:'rgba(0,0,0,0.28)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, overflow:'hidden' }}>
        {loading && (
          <div style={{ height:H, display:'flex', alignItems:'center', justifyContent:'center', gap:9 }}>
            <div style={{ width:14, height:14, borderRadius:'50%', border:'2px solid rgba(56,189,248,0.25)', borderTopColor:'#38bdf8', animation:'spin 0.8s linear infinite' }} />
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>Loading price data…</span>
          </div>
        )}
        {!loading && noData && (
          <div style={{ height:H, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)' }}>Price data unavailable for this route</span>
          </div>
        )}
        {!loading && !noData && known.length > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
            style={{ display:'block', cursor: cursorStyle, userSelect:'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={handleSvgMouseLeave}
          >
            <defs>
              <linearGradient id="fpcArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="rgba(56,189,248,0.15)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0)" />
              </linearGradient>
            </defs>

            {/* Grid */}
            {yTicks.map(t => (
              <g key={t.y}>
                <line x1={PL} y1={t.y} x2={W-PR} y2={t.y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                <text x={PL-5} y={t.y+4} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={9} fontFamily="system-ui">${Math.round(t.price)}</text>
              </g>
            ))}
            {xLabels.map(d => (
              <text key={d} x={xOf(d)} y={H-8} textAnchor="middle" fill="rgba(255,255,255,0.22)" fontSize={9} fontFamily="system-ui">{d}</text>
            ))}

            {/* Area + price line */}
            {areaPath && <path d={areaPath} fill="url(#fpcArea)" style={{ pointerEvents:'none' }} />}
            {linePath  && <path d={linePath}  fill="none" stroke="rgba(56,189,248,0.4)" strokeWidth={1.5} strokeLinejoin="round" style={{ pointerEvents:'none' }} />}

            {/* Departure vertical marker */}
            {startDate?.startsWith(viewMonth) && (() => {
              const day = parseInt(startDate.split('-')[2]);
              if (day < viewStart || day > windowEnd) return null;
              return <line x1={xOf(day)} y1={PT} x2={xOf(day)} y2={H-PB} stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3,3" opacity={0.8} style={{ pointerEvents:'none' }} />;
            })()}

            {/* Return vertical marker */}
            {endDateInView && endDayInWindow && endDay != null && (
              <line x1={xOf(endDay)} y1={PT} x2={xOf(endDay)} y2={H-PB} stroke="#818cf8" strokeWidth={1.5} strokeDasharray="3,3" opacity={0.7} style={{ pointerEvents:'none' }} />
            )}

            {/* Price dots */}
            {known.map(p => {
              const x       = xOf(p.day);
              const y       = yOf(p.price);
              const col     = priceColor(rank(p.price));
              const isStart = p.date === startDate;
              const isHov   = p.date === hovered;
              const isPast  = p.date < today;
              return (
                <g key={p.date} style={{ pointerEvents:'none' }}>
                  {isStart && <circle cx={x} cy={y} r={7} fill="none" stroke="#38bdf8" strokeWidth={1} opacity={0.35} />}
                  <circle cx={x} cy={y}
                    r={isStart ? 4 : isHov ? 3.5 : 2}
                    fill={isStart ? '#38bdf8' : isPast ? 'rgba(255,255,255,0.12)' : col}
                    stroke={isStart || isHov ? '#fff' : 'none'} strokeWidth={1.5}
                    opacity={isPast ? 0.4 : 1}
                    style={{ transition:'r 0.1s' }}
                  />
                </g>
              );
            })}

            {/* Return date marker — pinned at bottom axis, NOT on price curve */}
            {endDateInView && endDayInWindow && endDay != null && (() => {
              const x = xOf(endDay);
              const y = H - PB; // sits right on the x-axis baseline
              return (
                <g style={{ pointerEvents:'none' }}>
                  {/* vertical dashed line from top to baseline */}
                  <line x1={x} y1={PT} x2={x} y2={y} stroke="#818cf8" strokeWidth={1.5} strokeDasharray="3,3" opacity={0.5} />
                  {/* diamond marker on the baseline */}
                  <polygon
                    points={`${x},${y-8} ${x+5},${y} ${x},${y+5} ${x-5},${y}`}
                    fill="#818cf8" stroke="#fff" strokeWidth={1}
                  />
                  {/* label below */}
                  <text x={x} y={y+14} textAnchor="middle" fill="rgba(129,140,248,0.6)" fontSize={7.5} fontFamily="system-ui">RETURN</text>
                </g>
              );
            })()}

            {/* Price dot hover tooltip */}
            {hovered && hovered !== '__end__' && (() => {
              const hovPt = pts.find(p => p.date === hovered && p.price != null);
              if (!hovPt || hovPt.price == null) return null;
              const x       = xOf(hovPt.day);
              const y       = yOf(hovPt.price);
              const retDate = addDays(hovPt.date, nights);
              const line1   = `Depart ${fmtDate(hovPt.date)}  \u2192  Return ${fmtDate(retDate)}`;
              const line2   = `Round trip: $${Math.round(hovPt.price)}`;
              const tW = Math.max(line1.length, line2.length) * 5.2 + 22;
              const tH = 44;
              const tx = Math.min(Math.max(x - tW/2, 2), W - tW - 2);
              const ty = Math.max(PT + 2, y - tH - 10);
              const isStart = hovPt.date === startDate;
              return (
                <g style={{ pointerEvents:'none' }}>
                  <rect x={tx} y={ty} width={tW} height={tH} rx={5} fill="rgba(0,0,0,0.92)" />
                  <text x={tx+tW/2} y={ty+14} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={8.5} fontFamily="system-ui">{line1}</text>
                  <text x={tx+tW/2} y={ty+29} textAnchor="middle" fill="#fbbf24" fontSize={10} fontFamily="system-ui" fontWeight="700">{line2}</text>
                  <text x={x} y={ty+tH+10} textAnchor="middle" fill={isStart ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.3)'} fontSize={8} fontFamily="system-ui">
                    {isStart ? 'drag to move departure' : 'click to select departure'}
                  </text>
                </g>
              );
            })()}

            {/* Return dot hover tooltip */}
            {hovered === '__end__' && endDateInView && endDayInWindow && endDay != null && (() => {
              const x    = xOf(endDay);
              const y    = endDotY;
              const line = `Return ${fmtDate(endDate!)}  ·  drag to change`;
              const tW   = line.length * 5.2 + 20;
              const tH   = 24;
              const tx   = Math.min(Math.max(x - tW/2, 2), W - tW - 2);
              const ty   = Math.max(PT + 2, y - tH - 10);
              return (
                <g style={{ pointerEvents:'none' }}>
                  <rect x={tx} y={ty} width={tW} height={tH} rx={5} fill="rgba(0,0,0,0.92)" />
                  <text x={tx+tW/2} y={ty+15} textAnchor="middle" fill="#818cf8" fontSize={9} fontFamily="system-ui" fontWeight="700">{line}</text>
                </g>
              );
            })()}
          </svg>
        )}

        {/* Scroll thumb */}
        {!loading && !noData && canScroll && (
          <div style={{ padding:'4px 10px 8px', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:9, color:'rgba(255,255,255,0.2)', whiteSpace:'nowrap' }}>{viewStart}–{windowEnd} / {daysInMonth}</span>
            <div style={{ flex:1, height:3, background:'rgba(255,255,255,0.07)', borderRadius:99, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, height:'100%', left:`${thumbLeft*100}%`, width:`${thumbW*100}%`, background:'rgba(56,189,248,0.5)', borderRadius:99, transition: dragType==='pan' ? 'none' : 'left 0.15s' }} />
            </div>
            <span style={{ fontSize:9, color:'rgba(255,255,255,0.15)', whiteSpace:'nowrap' }}>drag to scroll</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6, flexWrap:'wrap', gap:6 }}>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'rgba(56,189,248,0.8)' }}>
            <span style={{ width:12, height:12, borderRadius:'50%', background:'#38bdf8', display:'inline-block' }} /> Departure
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'rgba(129,140,248,0.8)' }}>
            <span style={{ width:12, height:12, borderRadius:'50%', background:'#818cf8', display:'inline-block' }} /> Return
          </span>
          {selectedPrice != null && selectedPrice > 0 && (
            <span style={{ fontSize:11, fontWeight:700, color:'#fbbf24', background:'rgba(251,191,36,0.12)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:6, padding:'2px 8px' }}>
              {startDate && endDate ? `${fmtDate(startDate)} – ${fmtDate(endDate)}: ~$${Math.round(selectedPrice)}` : `~$${Math.round(selectedPrice)}`}
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          {['#22c55e','#84cc16','#eab308','#f97316','#ef4444'].map(c => (
            <div key={c} style={{ width:14, height:3, borderRadius:2, background:c }} />
          ))}
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)', marginLeft:2 }}>cheap {'\u2192'} expensive</span>
        </div>
      </div>
      {/* Source badge + disclaimer */}
      <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {source === 'skyscanner' && (
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.06em', color:'#0770e3', background:'rgba(7,112,227,0.12)', border:'1px solid rgba(7,112,227,0.3)', borderRadius:5, padding:'2px 7px' }}>
            LIVE · Skyscanner
          </span>
        )}
        {source === 'amadeus' && (
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.06em', color:'#22c55e', background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:5, padding:'2px 7px' }}>
            LIVE · Amadeus GDS
          </span>
        )}
        {source === 'ai-estimate' && (
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.06em', color:'rgba(251,191,36,0.8)', background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:5, padding:'2px 7px' }}>
            AI ESTIMATE
          </span>
        )}
        <span style={{ fontSize:9.5, color:'rgba(255,255,255,0.22)', lineHeight:1.4 }}>
          {source === 'skyscanner'
            ? 'Live prices pulled directly from Skyscanner.'
            : source === 'amadeus'
            ? 'Prices from Amadeus GDS — same data used by Skyscanner & Kayak.'
            : 'Estimated prices. Add RAPIDAPI_KEY to .env.local for live Skyscanner data.'}
        </span>
      </div>
    </div>
  );
}
