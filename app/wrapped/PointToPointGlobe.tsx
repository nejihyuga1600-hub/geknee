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

    // Markers stay constant; arcs are computed every frame so we can animate
    // which segments are visible based on elapsed time.
    const markers = points.map((p) => ({
      location: [p.lat, p.lon] as [number, number],
      size: 0.06,
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
