'use client';
// Tiny R3F scene used inside UnlockCeremony's travel-phase orb. A small
// emissive sphere spins on Y while floating slightly on X, surrounded by an
// inner "core" sphere that pulses to add depth + tiny floating shards as
// embers. The whole thing renders inside a 64x64 canvas — fixed-size so it
// stays cheap (one frame per second on idle costs nothing here).
//
// Why R3F over CSS-3D: we already ship `three`, `@react-three/fiber`,
// `@react-three/drei`. The Canvas remains active for only ~1.1s during the
// travel phase, then unmounts, so there's no long-running GL context.

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { Color } from 'three';

interface Spinning3DOrbProps {
  color: string;
  size?: number;
}

export function Spinning3DOrb({ color, size = 56 }: Spinning3DOrbProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        pointerEvents: 'none',
        // The R3F canvas paints inside this; the parent (UnlockCeremony) handles
        // the screen-space translation + boxShadow halo.
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 3], fov: 38 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[2, 2, 2]} intensity={2.4} color={color} />
        <pointLight position={[-2, -1, -2]} intensity={1.0} color="#ffffff" />
        <SpinningGem color={color} />
        <CorePulse color={color} />
        <Shards color={color} />
      </Canvas>
    </div>
  );
}

function SpinningGem({ color }: { color: string }) {
  const mesh = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (!mesh.current) return;
    mesh.current.rotation.y += dt * 2.2;
    mesh.current.rotation.x += dt * 0.6;
  });
  // Octahedron reads as a gemstone — facets catch light during rotation.
  return (
    <mesh ref={mesh}>
      <octahedronGeometry args={[0.85, 0]} />
      <meshStandardMaterial
        color={color}
        emissive={new Color(color)}
        emissiveIntensity={0.85}
        metalness={0.55}
        roughness={0.18}
      />
    </mesh>
  );
}

function CorePulse({ color }: { color: string }) {
  const mesh = useRef<Mesh>(null);
  const t0 = useRef(performance.now());
  useFrame(() => {
    if (!mesh.current) return;
    const t = (performance.now() - t0.current) / 1000;
    const s = 1.0 + 0.25 * Math.sin(t * 6);
    mesh.current.scale.setScalar(s);
  });
  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[0.42, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} />
    </mesh>
  );
}

function Shards({ color }: { color: string }) {
  // 6 tiny shards orbiting on a tilted ring — pure aesthetic specks that
  // imply velocity. Computed positions are static; the parent group rotates.
  const group = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.rotation.y -= dt * 1.4;
  });
  const shards = Array.from({ length: 6 }).map((_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return { x: Math.cos(a) * 1.25, y: Math.sin(a * 1.3) * 0.15, z: Math.sin(a) * 1.25 };
  });
  return (
    <mesh ref={group}>
      <boxGeometry args={[0, 0, 0]} />
      <meshBasicMaterial visible={false} />
      {shards.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <boxGeometry args={[0.08, 0.08, 0.08]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </mesh>
  );
}
