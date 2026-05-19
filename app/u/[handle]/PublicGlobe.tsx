"use client";
// Read-only spectator globe for public profile pages. Composes the split
// globe modules (AllLandmarks + Lm + skins bridge) but strips everything
// that belongs to the planner: no Mapbox swap, no animals, no city labels,
// no trip flow, no unlock celebration triggering. Visitors can pan/zoom
// to inspect what the owner has collected, period.

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Sphere } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import * as THREE from "three";
import {
  _setCollectedMonuments,
  _setActiveSkins,
  _setViewerAuthed,
} from "@/app/plan/location/globe/landmark";
import { L } from "@/app/plan/location/globe/locations";
import AllLandmarks from "@/app/plan/location/globe/AllLandmarks";

type CollectedEntry = { mk: string; displaySkin: string };

// Inside the Canvas: when focusMk is set (visitor landed via a share link),
// fly the camera so the shared monument is dead-centre. Has to live inside
// Canvas because useThree only works in r3f context.
function CameraFocus({ mk }: { mk?: string }) {
  const { camera } = useThree();
  const done = useRef(false);
  useEffect(() => {
    if (!mk || done.current) return;
    const surf = (L as Record<string, { pos: [number, number, number] } | undefined>)[mk];
    if (!surf) return;
    // Sit the camera 18 units out along the monument's surface normal so the
    // monument fills roughly a third of the frame on a 16:10 viewport.
    const dir = new THREE.Vector3(...surf.pos).normalize();
    const target = dir.clone().multiplyScalar(18);
    camera.position.copy(target);
    camera.lookAt(0, 0, 0);
    done.current = true;
  }, [mk, camera]);
  return null;
}

export default function PublicGlobe({ collected, focusMk }: { collected: CollectedEntry[]; focusMk?: string }) {
  const { data: session, status } = useSession();
  const isViewerAuthed = status === "authenticated" && !!session?.user;

  // Push the owner's collection into the bridge so every <Lm /> in
  // AllLandmarks renders the right skin GLB (when available) or the
  // primitive fallback. The bridge is module-singleton; that's fine on a
  // public profile page since only one user's globe is loaded at a time.
  //
  // Gated on viewer-auth: an anonymous visitor would otherwise leak the
  // profile owner's collected skins into the shared _activeSkins singleton,
  // which other globe instances on the same page would then render.
  useEffect(() => {
    if (!isViewerAuthed) {
      _setViewerAuthed(false);
      _setCollectedMonuments(new Set());
      _setActiveSkins(new Map());
      return;
    }
    const ids = new Set(collected.map((c) => c.mk));
    const skins = new Map(collected.map((c) => [c.mk, c.displaySkin]));
    _setCollectedMonuments(ids);
    _setActiveSkins(skins);
    _setViewerAuthed(true);
  }, [collected, isViewerAuthed]);

  return (
    <Canvas
      style={{ width: "100%", height: "100%", touchAction: "none", borderRadius: "inherit" }}
      camera={{ position: [0, 0, 28], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 8, 12]} intensity={0.9} />
      <Stars radius={140} depth={60} count={4000} factor={4} saturation={0} fade speed={0.3} />

      {/* Cartoon-globe planet — no Mapbox/terrain, this is a spectator view. */}
      <Sphere args={[10, 96, 96]}>
        <meshStandardMaterial color="#3a7bd5" roughness={0.7} metalness={0.05} />
      </Sphere>

      <AllLandmarks />
      <CameraFocus mk={focusMk} />

      <OrbitControls
        makeDefault
        enableZoom
        enablePan={false}
        enableRotate
        minDistance={13}
        maxDistance={45}
        zoomSpeed={0.9}
        rotateSpeed={0.6}
        enableDamping
        dampingFactor={0.12}
        autoRotate={!focusMk}
        autoRotateSpeed={0.45}
      />
    </Canvas>
  );
}
