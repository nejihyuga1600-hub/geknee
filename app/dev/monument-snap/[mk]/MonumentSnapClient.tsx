"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment } from "@react-three/drei";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { MONUMENT_FILE_PREFIX, AVAILABLE_SKINS } from "@/app/plan/location/globe/skins";

const BLOB_BASE = "https://mrfgpxw07gmgmriv.public.blob.vercel-storage.com/models";

// Per-monument camera framing tweaks. Tune by snapshotting and adjusting.
const FRAMING: Record<string, { fov: number; elevation: number; azimuth: number; padding: number }> = {
  default:        { fov: 28, elevation: 0.20, azimuth: 0.4, padding: 1.25 },
  eiffelTower:    { fov: 32, elevation: 0.30, azimuth: 0.3, padding: 1.35 },
  bigBen:         { fov: 30, elevation: 0.25, azimuth: 0.35, padding: 1.30 },
  statueLiberty:  { fov: 30, elevation: 0.18, azimuth: 0.40, padding: 1.30 },
  tokyoSkytree:   { fov: 32, elevation: 0.30, azimuth: 0.30, padding: 1.40 },
  greatWall:      { fov: 28, elevation: 0.45, azimuth: 0.35, padding: 1.20 },
  pyramidGiza:    { fov: 28, elevation: 0.30, azimuth: 0.50, padding: 1.20 },
  iguazuFalls:    { fov: 28, elevation: 0.40, azimuth: 0.30, padding: 1.20 },
  victoriaFalls:  { fov: 28, elevation: 0.40, azimuth: 0.30, padding: 1.20 },
};

// Centers the GLB at the origin and frames the camera around its bounding
// sphere. Runs inside Suspense so it only fires after the GLB is loaded —
// no race with the screenshot script. Sets window.__snapReady once the
// renderer has flushed two frames after framing.
function MonumentGLB({ mk, skin }: { mk: string; skin: string }) {
  const prefix = MONUMENT_FILE_PREFIX[mk] ?? mk;
  const tiers = AVAILABLE_SKINS[mk];
  const finalSkin = tiers && tiers.has(skin) ? skin : tiers ? Array.from(tiers)[0] : skin;
  const url = `${BLOB_BASE}/${prefix}_${finalSkin}.glb`;
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  const { camera, size } = useThree();
  useEffect(() => {
    const f = FRAMING[mk] ?? FRAMING.default;

    // Recenter the GLB at origin so framing math is straightforward.
    const box = new THREE.Box3().setFromObject(cloned);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);
    cloned.position.sub(center);

    // Recompute bbox post-recenter for the bounding sphere.
    const recentered = new THREE.Box3().setFromObject(cloned);
    const sphere = new THREE.Sphere();
    recentered.getBoundingSphere(sphere);
    const radius = Math.max(sphere.radius, 0.01);

    const persp = camera as THREE.PerspectiveCamera;
    persp.fov = f.fov;
    persp.aspect = size.width / size.height;
    persp.near = 0.01;
    persp.far = 1000;
    const fovRad = (persp.fov * Math.PI) / 180;
    const distance = (radius * f.padding) / Math.sin(fovRad / 2);

    const az = f.azimuth * Math.PI;
    const el = f.elevation * Math.PI;
    persp.position.set(
      sphere.center.x + distance * Math.sin(az) * Math.cos(el),
      sphere.center.y + distance * Math.sin(el),
      sphere.center.z + distance * Math.cos(az) * Math.cos(el),
    );
    persp.lookAt(sphere.center);
    persp.updateProjectionMatrix();

    // Two flushes before signalling ready so the screenshot catches the framed
    // pose, not the initial 0,0,5 pose.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof window !== "undefined")
          (window as unknown as { __snapReady?: boolean }).__snapReady = true;
      });
    });
  }, [cloned, camera, size, mk]);

  return <primitive object={cloned} />;
}

export default function MonumentSnapClient({
  mk,
  skin,
  width,
  height,
}: {
  mk: string;
  skin: string;
  width: number;
  height: number;
}) {
  return (
    <>
      {/* Hide every flavor of Next.js dev chrome so they don't bleed into the screenshot.
          Next 16 puts the floating dev panel in <nextjs-portal>, but it can also render
          things outside that root, so we cast a wide net. */}
      <style>{`
        html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
        nextjs-portal,
        [data-nextjs-toast],
        [data-nextjs-dialog-overlay],
        [data-nextjs-dialog],
        #__next-build-watcher,
        #__next-prerender-indicator,
        [data-next-mark],
        [data-next-mark-loading] { display: none !important; visibility: hidden !important; }
      `}</style>
      <div
        id="monument-snap-target"
        style={{
          width,
          height,
          background: "transparent",
          position: "fixed",
          top: 0,
          left: 0,
        }}
      >
        <Canvas
          gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, toneMappingExposure: 2.4 }}
          camera={{ position: [0, 0, 5], fov: 30 }}
          style={{ background: "transparent", width: "100%", height: "100%" }}
        >
          {/* IBL via drei Environment — feeds PBR materials so metallic skins
              (gold, diamond, aurora, celestial) actually reflect something
              instead of rendering as solid black silhouettes. */}
          <Suspense fallback={null}>
            {/* "city" preset has the strongest reflection range of the bundled
                presets — important for metallic gold/diamond skins. */}
            <Environment preset="city" background={false} environmentIntensity={1.6} />
            <MonumentGLB mk={mk} skin={skin} />
          </Suspense>
          {/* Direct lights on top of IBL: a strong key light and a fill so
              edges read clearly. Hemisphere adds a sky/ground separation. */}
          <ambientLight intensity={1.2} />
          <hemisphereLight args={["#ffffff", "#404060", 0.8]} />
          <directionalLight position={[5, 8, 6]} intensity={2.5} />
          <directionalLight position={[-4, 3, -4]} intensity={1.0} />
          <directionalLight position={[0, -3, 5]} intensity={0.6} />
          <OrbitControls enableZoom enablePan={false} />
        </Canvas>
      </div>
    </>
  );
}
