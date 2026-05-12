'use client';
// Chronological journey arcs on the main 3D globe. Subscribes to the
// collected-monuments bridge for the user's ordered visits, computes a
// great-circle bow between each consecutive pair, and renders them as
// thin glowing lines on top of the sphere surface.
//
// Each arc is generated as a sampled curve in 3D — we lerp along the chord
// between two surface points then re-project to a slightly-elevated sphere
// (R * (1 + bow * sin(πt))) so the line arcs above the globe instead of
// cutting through it. A custom shader gradient (gold → purple) ties it to
// the Wrapped globe's arc style.
//
// Filtered by active issue year so old years don't clutter the current
// passport. Use `?year=YYYY` on the URL to override (preview prior years).

import { useMemo } from 'react';
import * as THREE from 'three';
import { MONUMENT_LATLON } from './skins';
import { geoPos, R } from './geo';
import { useCollectedMonumentOrder } from './landmark';

const ARC_SEGMENTS = 64;
const ARC_LIFT = 0.18; // peak bow as a fraction of R (R=10 → ~1.8 units)
// Brand palette — matches --brand-accent / --brand-accent-2 in globals.css.
// Gold (#fbbf24) is reserved for "magic-moment highlights only" per the
// brand notes, so we use the lavender → icy-blue spectrum instead. Older
// arcs get the primary lavender (anchor), newer arcs fade to icy blue —
// implying journey direction without arrowheads.
const COLOR_FROM = new THREE.Color('#a78bfa'); // brand lavender (older)
const COLOR_TO = new THREE.Color('#7dd3fc');   // brand icy blue (newer)

/**
 * Sampled great-circle-ish arc between two surface points. We lerp along
 * the chord, normalize back onto the sphere, then push outward by a
 * sin-bow so the curve rises above the surface in the middle. Result is a
 * smooth bow that hugs the globe and never punches through it.
 */
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
   * If provided, only show arcs between monuments collected in this year.
   * If omitted, shows the full lifetime journey on the main globe — that's
   * the default because the main globe is the user's permanent record, not
   * a per-year view (year filtering lives on /wrapped instead).
   */
  year?: number;
}

export function JourneyArcs({ year }: JourneyArcsProps) {
  const order = useCollectedMonumentOrder();

  // Build one BufferGeometry per arc. When `year` is given, restrict the
  // ordered list to collections inside that calendar year first; otherwise
  // use the full chronological history.
  const arcs = useMemo(() => {
    const filtered = year
      ? order.filter((e) => {
          const t = new Date(e.collectedAt).getUTCFullYear();
          return t === year;
        })
      : order;
    if (filtered.length < 2) return [];

    const out: { geom: THREE.BufferGeometry; colorStart: THREE.Color; colorEnd: THREE.Color }[] = [];
    const lift = R * ARC_LIFT;

    for (let i = 0; i < filtered.length - 1; i++) {
      const a = MONUMENT_LATLON[filtered[i].monumentId];
      const b = MONUMENT_LATLON[filtered[i + 1].monumentId];
      if (!a || !b) continue;

      const va = new THREE.Vector3(...geoPos(a.lat, a.lon, R));
      const vb = new THREE.Vector3(...geoPos(b.lat, b.lon, R));
      const points = buildArc(va, vb, lift);

      const geom = new THREE.BufferGeometry().setFromPoints(points);
      // Per-vertex gradient along the arc — gold at start, purple at end —
      // implies direction without needing arrowheads.
      const colors = new Float32Array((ARC_SEGMENTS + 1) * 3);
      for (let s = 0; s <= ARC_SEGMENTS; s++) {
        const c = new THREE.Color().lerpColors(COLOR_FROM, COLOR_TO, s / ARC_SEGMENTS);
        colors[s * 3 + 0] = c.r;
        colors[s * 3 + 1] = c.g;
        colors[s * 3 + 2] = c.b;
      }
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      out.push({ geom, colorStart: COLOR_FROM, colorEnd: COLOR_TO });
    }
    return out;
  }, [order, year]);

  // Dispose old geometries when the arcs list changes — long-running r3f
  // scenes leak GPU memory otherwise.
  useMemo(() => {
    return () => {
      arcs.forEach(({ geom }) => geom.dispose());
    };
  }, [arcs]);

  if (arcs.length === 0) return null;

  return (
    <group renderOrder={2}>
      {arcs.map(({ geom }, i) => (
        <line key={i}>
          <primitive object={geom} attach="geometry" />
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={0.85}
            depthWrite={false}
            depthTest
            // Additive blending so arcs glow against the dark earth without
            // appearing as flat ribbons.
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </line>
      ))}
    </group>
  );
}

export default JourneyArcs;
