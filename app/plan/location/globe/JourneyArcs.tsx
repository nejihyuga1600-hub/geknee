'use client';
// Chronological journey arcs on the main 3D globe. Subscribes to the
// collected-monuments bridge for the user's ordered visits, computes a
// great-circle bow between each consecutive pair, and renders them with
// drei's <Line> so the stroke has actual screen-space width.
//
// Each arc is generated as a sampled curve in 3D — we lerp along the chord
// between two surface points then re-project to a slightly-elevated sphere
// (R * (1 + bow * sin(πt))) so the line arcs above the globe instead of
// cutting through it. Per-vertex gradient (lavender → icy-blue, the
// brand-accent / brand-accent-2 tokens) implies direction without needing
// arrowheads.
//
// Why drei's <Line>: bare three.js <line> with LineBasicMaterial is locked
// to 1px screen width on every WebGL platform (a longstanding GL spec
// limit). Drei's <Line> uses three's Line2 + LineMaterial which fakes
// thickness via two triangles per segment — gives us actual visible
// arcs against the dark earth texture.

import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { MONUMENT_LATLON } from './skins';
import { geoPos, R } from './geo';
import { useCollectedMonumentOrder } from './landmark';

const ARC_SEGMENTS = 64;
const ARC_LIFT = 0.18; // peak bow as a fraction of R (R=10 → ~1.8 units)
// Brand palette — matches --brand-accent / --brand-accent-2 in globals.css.
// Gold is reserved for "magic-moment highlights only" per brand notes, so
// permanent year arcs use the lavender → icy-blue spectrum instead.
const COLOR_FROM = new THREE.Color('#a78bfa'); // brand lavender (older)
const COLOR_TO = new THREE.Color('#7dd3fc');   // brand icy blue (newer)

function buildArc(a: THREE.Vector3, b: THREE.Vector3, lift: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const v = new THREE.Vector3().lerpVectors(a, b, t).normalize();
    const bow = Math.sin(t * Math.PI) * lift;
    v.multiplyScalar(R + bow);
    points.push(v);
  }
  return points;
}

interface JourneyArcsProps {
  /**
   * If provided, restrict arcs to monuments collected in this calendar year.
   * Omit for the lifetime journey (default on the main globe).
   */
  year?: number;
}

export function JourneyArcs({ year }: JourneyArcsProps) {
  const order = useCollectedMonumentOrder();

  const arcs = useMemo(() => {
    const filtered = year
      ? order.filter((e) => {
          const t = new Date(e.collectedAt).getUTCFullYear();
          return t === year;
        })
      : order;

    if (typeof window !== 'undefined') {
      // Soft diagnostic — only logs when the result is empty, so a healthy
      // session stays quiet.
      if (filtered.length < 2) {
        // eslint-disable-next-line no-console
        console.info(
          `[JourneyArcs] no arcs — order.length=${order.length}, filtered.length=${filtered.length}, year=${year ?? '(all)'}`,
        );
      }
    }

    if (filtered.length < 2) return [];

    const out: { points: THREE.Vector3[]; vertexColors: [number, number, number][] }[] = [];
    const lift = R * ARC_LIFT;

    for (let i = 0; i < filtered.length - 1; i++) {
      const a = MONUMENT_LATLON[filtered[i].monumentId];
      const b = MONUMENT_LATLON[filtered[i + 1].monumentId];
      if (!a || !b) {
        // eslint-disable-next-line no-console
        console.warn(`[JourneyArcs] missing lat/lon for ${filtered[i].monumentId} or ${filtered[i + 1].monumentId}`);
        continue;
      }

      const va = new THREE.Vector3(...geoPos(a.lat, a.lon, R));
      const vb = new THREE.Vector3(...geoPos(b.lat, b.lon, R));
      const points = buildArc(va, vb, lift);

      // Per-vertex gradient (drei's <Line> accepts vertexColors as
      // [r,g,b] tuples). Each arc fades through the same gradient locally
      // so direction reads at arc level — the older→newer reading comes
      // from arc adjacency, not from globe-wide hue mapping.
      const vertexColors = points.map((_, s) => {
        const c = new THREE.Color().lerpColors(COLOR_FROM, COLOR_TO, s / ARC_SEGMENTS);
        return [c.r, c.g, c.b] as [number, number, number];
      });

      out.push({ points, vertexColors });
    }
    return out;
  }, [order, year]);

  if (arcs.length === 0) return null;

  return (
    <group renderOrder={2}>
      {arcs.map(({ points, vertexColors }, i) => (
        <Line
          key={i}
          points={points}
          vertexColors={vertexColors}
          lineWidth={2.5}
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
        />
      ))}
    </group>
  );
}

export default JourneyArcs;
