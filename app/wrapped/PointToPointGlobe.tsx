'use client';
// COBE-driven point-to-point globe with city pill labels + chronological
// connector arcs. We do the canvas with cobe (5KB, no Three) and overlay an
// SVG that's transformed each frame to match the globe's current rotation.
// On every rAF tick we re-project each (lat, lon) to screen coordinates and
// repaint city labels + curved arcs between consecutive visits. Labels on
// the back hemisphere are faded out.
//
// Why SVG overlay instead of cobe's `markers` for labels: cobe only renders
// glowing dots in the WebGL pass — there's no API for text or arcs. So we
// keep cobe for the dot markers + the dotted sphere itself, then layer an
// SVG sized to the canvas on top for everything else.

import { useEffect, useRef } from 'react';
import createGlobe, { type COBEOptions } from 'cobe';

export interface PointToPointGlobeProps {
  points: Array<{ lat: number; lon: number; mk: string; name?: string }>;
  size?: number;
  className?: string;
}

const PHI_OFFSET = 0;
const THETA = 0.3;
const SKIN_GOLD: [number, number, number] = [1.0, 0.7, 0.25];

// Convert (lat, lon, phi, theta) to screen-space position. `cx/cy/radius`
// position the projection inside our SVG viewBox (matching the canvas size).
// Returns visibility (z > 0 = front hemisphere) so back-side labels can fade.
function projectLatLon(
  lat: number,
  lon: number,
  phi: number,
  theta: number,
  cx: number,
  cy: number,
  radius: number,
) {
  const λ = (lon * Math.PI) / 180;
  const φ = (lat * Math.PI) / 180;
  // Unit-sphere position with lon=0,lat=0 toward +Z (matches cobe default).
  const x0 = Math.cos(φ) * Math.sin(λ);
  const y0 = Math.sin(φ);
  const z0 = Math.cos(φ) * Math.cos(λ);
  // Rotate around Y by -phi (cobe rotates the globe in this direction).
  const cp = Math.cos(-phi);
  const sp = Math.sin(-phi);
  const x1 = x0 * cp + z0 * sp;
  const z1 = -x0 * sp + z0 * cp;
  // Rotate around X by theta.
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const y2 = y0 * ct - z1 * st;
  const z2 = y0 * st + z1 * ct;
  return {
    x: cx + x1 * radius,
    y: cy - y2 * radius,
    z: z2, // > 0 = front
    visible: z2 > 0,
  };
}

export function PointToPointGlobe({ points, size = 380, className }: PointToPointGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const phiRef = useRef(PHI_OFFSET);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const widthRef = useRef(size);
  // Refs to the DOM nodes for each label + the arc path so we can mutate
  // their `transform` / `d` each rAF without React re-renders.
  const labelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const arcRefs = useRef<Array<SVGPathElement | null>>([]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const start = Date.now();

    // Markers + chronological journey wave — same as before; the pulse still
    // travels through the points in collection order so the eye reads the
    // sequence even if you ignore the arcs.
    const BASE_SIZE = 0.05;
    const PEAK_SIZE = 0.12;
    const CYCLE_S = 6;
    const N = Math.max(points.length, 1);
    const markers = points.map((p) => ({
      location: [p.lat, p.lon] as [number, number],
      size: BASE_SIZE,
    }));

    const opts = {
      devicePixelRatio: 2,
      width: size * 2,
      height: size * 2,
      phi: 0,
      theta: THETA,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.3, 0.3, 0.6],
      markerColor: SKIN_GOLD,
      glowColor: [1, 0.85, 0.4],
      markers,
      onRender: (state: Record<string, unknown>) => {
        if (pointerInteracting.current === null) {
          phiRef.current += 0.003;
        }
        const phi = phiRef.current + pointerInteractionMovement.current / 200;
        (state as { phi: number }).phi = phi;
        (state as { width: number }).width = widthRef.current * 2;
        (state as { height: number }).height = widthRef.current * 2;

        // Pulse wave.
        const elapsed = (Date.now() - start) / 1000;
        const phase = (elapsed % CYCLE_S) / CYCLE_S;
        for (let i = 0; i < markers.length; i++) {
          const slot = i / N;
          let d = Math.abs(phase - slot);
          if (d > 0.5) d = 1 - d;
          const proximity = Math.max(0, 1 - d * N * 1.2);
          markers[i].size = BASE_SIZE + (PEAK_SIZE - BASE_SIZE) * Math.pow(proximity, 2);
        }

        // Per-frame overlay sync. The SVG covers the same client rect as the
        // canvas, so we use size for our projection center + radius.
        const cx = size / 2;
        const cy = size / 2;
        const radius = size * 0.42; // matches cobe's apparent globe radius
        const positions = points.map((p) =>
          projectLatLon(p.lat, p.lon, phi, THETA, cx, cy, radius),
        );

        // Move each city pill label to its projected position. Front-side
        // labels are fully visible; back-side labels fade.
        for (let i = 0; i < positions.length; i++) {
          const el = labelRefs.current[i];
          if (!el) continue;
          const pos = positions[i];
          el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -150%)`;
          // Labels stay readable on the back hemisphere too — they're part of
          // the permanent year record, not transient anchors. Front: full.
          // Back: dimmed so it reads as "behind the globe" without vanishing.
          el.style.opacity = pos.visible ? '1' : '0.35';
          el.style.zIndex = pos.visible ? '2' : '1';
        }

        // Redraw chronological arcs. Each arc connects consecutive points
        // with a quadratic Bezier whose control point lifts above the chord
        // — visually reads as "flight path". An arc is only drawn if at
        // least one endpoint is on the visible hemisphere.
        for (let i = 0; i < positions.length - 1; i++) {
          const a = positions[i];
          const b = positions[i + 1];
          const arc = arcRefs.current[i];
          if (!arc) continue;
          if (!a.visible && !b.visible) {
            arc.setAttribute('opacity', '0');
            continue;
          }
          // Midpoint, lifted up + slightly outward so the arc bows over the
          // globe rather than cutting through it.
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const lift = Math.min(60, 16 + len * 0.18);
          // Bow outward from globe center.
          const ox = mx - cx;
          const oy = my - cy;
          const olen = Math.hypot(ox, oy) || 1;
          const cxArc = mx + (ox / olen) * lift - (dy / len) * lift * 0.2;
          const cyArc = my + (oy / olen) * lift + (dx / len) * lift * 0.2;
          arc.setAttribute(
            'd',
            `M ${a.x} ${a.y} Q ${cxArc} ${cyArc} ${b.x} ${b.y}`,
          );
          // Arcs are permanent for the issue — they record the full year's
          // journey and stay drawn on every frame regardless of rotation.
          // Back-hemisphere arcs only dim slightly so the journey reads as
          // a continuous record that wraps the globe.
          const op = a.visible && b.visible ? 0.9 : 0.6;
          arc.setAttribute('opacity', String(op));
        }
      },
    } as unknown as COBEOptions;

    const globe = createGlobe(canvasRef.current, opts);
    canvasRef.current.style.opacity = '0';
    requestAnimationFrame(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = '1';
    });

    const onDown = (e: PointerEvent) => {
      pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    };
    const onUp = () => {
      pointerInteracting.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    };
    const onMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        pointerInteractionMovement.current = e.clientX - pointerInteracting.current;
      }
    };

    canvasRef.current.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);

    return () => {
      globe.destroy();
      canvasRef.current?.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
    };
  }, [points, size]);

  // Reset refs each render so unused slots from a prior render don't leak.
  labelRefs.current = [];
  arcRefs.current = [];

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        maxWidth: '100%',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size,
          height: size,
          aspectRatio: '1',
          cursor: 'grab',
          transition: 'opacity 600ms ease',
          contain: 'layout paint size',
          display: 'block',
        }}
      />

      {/* SVG arc overlay — sits on top of the canvas, sized to match. */}
      <svg
        ref={overlayRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          width: size,
          height: size,
        }}
      >
        <defs>
          {/* Brand palette: lavender (--brand-accent) → icy blue (--brand-accent-2).
              Older end of the journey starts lavender, newer end fades to icy
              blue. Matches the JourneyArcs gradient on the main 3D globe. */}
          <linearGradient id="geknee-arc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        {points.slice(0, -1).map((_, i) => (
          <path
            key={i}
            ref={(el) => { arcRefs.current[i] = el; }}
            d=""
            fill="none"
            stroke="url(#geknee-arc-gradient)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="3 4"
            opacity="0"
            style={{ transition: 'opacity 200ms ease' }}
          />
        ))}
      </svg>

      {/* City pill labels — absolute children of the wrapper. They get their
          transforms updated in onRender each frame. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          width: size,
          height: size,
        }}
      >
        {points.map((p, i) => (
          <div
            key={`${p.mk}-${i}`}
            ref={(el) => { labelRefs.current[i] = el; }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: 'translate(-9999px, -9999px)',
              transition: 'opacity 220ms ease',
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(10, 10, 31, 0.85)',
              border: '1px solid rgba(255,255,255,0.15)',
              fontSize: 9,
              fontFamily: 'var(--font-mono-display, monospace)',
              letterSpacing: '0.14em',
              color: 'rgba(255,255,255,0.92)',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              willChange: 'transform, opacity',
            }}
          >
            {(p.name ?? p.mk).toUpperCase()}
          </div>
        ))}
      </div>
    </div>
  );
}
