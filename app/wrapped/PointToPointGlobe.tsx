'use client';
// COBE-driven point-to-point globe. Each monument the user collected in the
// year shows as a marker; consecutive collections are joined by a great-circle
// arc, traced in chronological order. The cobe library handles the WebGL globe
// + arc rendering with a small JS API (~5KB).
//
// We animate which arcs are currently visible via a progress value that ticks
// up over ~6s, drawing the user's journey across the year.

import { useEffect, useRef } from 'react';
import createGlobe, { type COBEOptions } from 'cobe';

export interface PointToPointGlobeProps {
  points: Array<{ lat: number; lon: number; mk: string }>;
  size?: number;
  className?: string;
}

const PHI_OFFSET = 0; // initial rotation
const SKIN_GOLD: [number, number, number] = [1.0, 0.7, 0.25];

export function PointToPointGlobe({ points, size = 380, className }: PointToPointGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(PHI_OFFSET);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const widthRef = useRef(size);

  useEffect(() => {
    if (!canvasRef.current) return;
    const start = Date.now();

    // Markers + chronological journey wave. Each marker pulses to peak in
    // the order the user collected the monuments — a "voyage trace" that
    // sweeps around the globe across a 6s cycle. Even when paused on the
    // hero card, the eye reads the order of visits because the brightness
    // wave travels through the points sequentially.
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
      theta: 0.3,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.3, 0.3, 0.6],
      markerColor: SKIN_GOLD,
      glowColor: [1, 0.85, 0.4],
      markers,
      onRender: (state: Record<string, unknown>) => {
        // Auto-rotate + pointer drag
        if (pointerInteracting.current === null) {
          phiRef.current += 0.003;
        }
        (state as { phi: number }).phi = phiRef.current + pointerInteractionMovement.current / 200;
        (state as { width: number }).width = widthRef.current * 2;
        (state as { height: number }).height = widthRef.current * 2;

        // Chronological journey wave — peak size travels through markers
        // in the order they were collected, completing one full pass every
        // CYCLE_S seconds. Each marker stays at base size most of the time
        // and briefly blooms to peak when its slot in the wave arrives.
        const elapsed = (Date.now() - start) / 1000;
        const phase = (elapsed % CYCLE_S) / CYCLE_S; // 0..1 across the cycle
        for (let i = 0; i < markers.length; i++) {
          const slot = i / N;
          // Distance from this marker's slot to the current phase position,
          // wrapping around 0..1. Closer = brighter.
          let d = Math.abs(phase - slot);
          if (d > 0.5) d = 1 - d;
          // Gaussian-ish falloff — only the nearest marker(s) bloom.
          const proximity = Math.max(0, 1 - d * N * 1.2);
          markers[i].size = BASE_SIZE + (PEAK_SIZE - BASE_SIZE) * Math.pow(proximity, 2);
        }
      },
    } as unknown as COBEOptions;

    const globe = createGlobe(canvasRef.current, opts);
    canvasRef.current.style.opacity = '0';
    requestAnimationFrame(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = '1';
    });

    // Pointer drag for manual rotation
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

    void start; // mark elapsed timer for future arc-progress phase

    return () => {
      globe.destroy();
      canvasRef.current?.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
    };
  }, [points, size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: size,
        height: size,
        maxWidth: '100%',
        aspectRatio: '1',
        cursor: 'grab',
        transition: 'opacity 600ms ease',
        contain: 'layout paint size',
      }}
    />
  );
}
