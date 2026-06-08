'use client';
// Wrapped hero globe — cobe-rendered dotted earth + a Three.js overlay that
// renders the actual GLB monument models the user collected this year, sized
// and lit the same way as the iOS Mapbox globe (CapacitorGlobe). Each
// monument is anchored to its (lat, lon); the cobe phi value drives both
// the dotted globe's rotation and the Three.js model projection so the two
// layers stay locked together.
//
// Why not just use cobe markers: cobe can only draw glowing dots in its
// WebGL pass — no GLBs, no skins. The Wrapped hero card now mirrors what
// the user sees on the iOS planner globe, so they recognise their own
// collection rather than a generic dot map.

import { useEffect, useRef } from 'react';
import createGlobe, { type COBEOptions } from 'cobe';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MONUMENT_FILE_PREFIX } from '@/app/plan/location/globe/skins';

const PHI_OFFSET = 0;
const THETA = 0.3;

export interface MonumentWrappedPoint {
  mk: string;
  lat: number;
  lon: number;
  // Active skin tier (e.g. "default", "gold", "diamond"). When non-default we
  // try `{file}_{skin}.glb` first and fall back to the base GLB if the skin
  // variant isn't deployed yet.
  skin?: string;
  name?: string;
}

export interface MonumentWrappedGlobeProps {
  points: MonumentWrappedPoint[];
  size?: number;
  className?: string;
}

// Same projection cobe uses internally. Returns screen (x, y), the back-z
// component for visibility, and a unit-sphere normal for dot-product culling
// the back hemisphere.
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
  const x0 = Math.cos(φ) * Math.sin(λ);
  const y0 = Math.sin(φ);
  const z0 = Math.cos(φ) * Math.cos(λ);
  const cp = Math.cos(-phi);
  const sp = Math.sin(-phi);
  const x1 = x0 * cp + z0 * sp;
  const z1 = -x0 * sp + z0 * cp;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const y2 = y0 * ct - z1 * st;
  const z2 = y0 * st + z1 * ct;
  return {
    x: cx + x1 * radius,
    y: cy - y2 * radius,
    z: z2,
    visible: z2 > 0,
  };
}

export function MonumentWrappedGlobe({
  points,
  size = 340,
  className,
}: MonumentWrappedGlobeProps) {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(PHI_OFFSET);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);

  useEffect(() => {
    if (!baseCanvasRef.current || !overlayCanvasRef.current) return;

    // ─── Three.js overlay ──────────────────────────────────────────────────
    const overlayRenderer = new THREE.WebGLRenderer({
      canvas: overlayCanvasRef.current,
      alpha: true,
      antialias: true,
    });
    overlayRenderer.setPixelRatio(window.devicePixelRatio);
    overlayRenderer.setClearColor(0x000000, 0);
    overlayRenderer.outputColorSpace = THREE.SRGBColorSpace;
    overlayRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    overlayRenderer.toneMappingExposure = 1.2;

    const overlayScene = new THREE.Scene();
    // Same IBL pipeline as CapacitorGlobe so PBR skins (gold, diamond, etc.)
    // light correctly out of the box.
    const pmrem = new THREE.PMREMGenerator(overlayRenderer);
    overlayScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    overlayScene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a2240, 1.0));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(0.3, 1.4, 0.8);
    overlayScene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x88a8d8, 0.5);
    rimLight.position.set(-0.6, -0.2, -0.4);
    overlayScene.add(rimLight);
    const overlayCamera = new THREE.OrthographicCamera(0, size, size, 0, -1000, 1000);
    overlayCamera.position.z = 100;
    overlayRenderer.setSize(size, size, false);

    // ─── Load GLBs for each collected monument ─────────────────────────────
    type Entry = {
      mk: string;
      lat: number;
      lon: number;
      wrapper: THREE.Object3D;
      loaded: boolean;
    };
    const entries: Entry[] = [];
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    for (const pt of points) {
      const file = MONUMENT_FILE_PREFIX[pt.mk];
      if (!file) continue;
      const wrapper = new THREE.Object3D();
      wrapper.visible = false;
      overlayScene.add(wrapper);
      const entry: Entry = { mk: pt.mk, lat: pt.lat, lon: pt.lon, wrapper, loaded: false };
      entries.push(entry);

      const skin = pt.skin && pt.skin !== 'default' ? pt.skin : null;
      const skinUrl = skin ? `/models/mapbox/${file}_${skin}.glb` : null;
      const defaultUrl = `/models/mapbox/${file}.glb`;

      const tryLoad = (url: string, isFallback: boolean) => {
        loader.load(
          url,
          (gltf) => {
            const obj = gltf.scene;
            const bbox = new THREE.Box3().setFromObject(obj);
            const sz = new THREE.Vector3(); bbox.getSize(sz);
            const center = new THREE.Vector3(); bbox.getCenter(center);
            const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
            obj.position.sub(center);
            obj.position.y += sz.y / 2;
            // Smaller than the iOS globe sprites since the Wrapped globe is
            // ~340px wide vs full-screen. ~36px reads clearly at this size.
            const DISPLAY_PX = 36;
            obj.scale.setScalar(DISPLAY_PX / maxDim);
            wrapper.add(obj);
            entry.loaded = true;
          },
          undefined,
          () => {
            // Skin variant missing → fall back to the base GLB once.
            if (!isFallback && url !== defaultUrl) tryLoad(defaultUrl, true);
          },
        );
      };
      tryLoad(skinUrl ?? defaultUrl, false);
    }

    // ─── cobe base globe + driver loop ─────────────────────────────────────
    const cx = size / 2;
    const cy = size / 2;
    // Matches cobe's apparent globe radius in screen pixels.
    const projectionRadius = size * 0.42;
    let lastSpinTs = 0;

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
      baseColor: [0.3, 0.3, 0.45],
      // Markers and glow toned down so the GLBs are the focal point — the
      // dots are just an anchor cue for "your collection lives here".
      markerColor: [0.66, 0.55, 0.98],
      glowColor: [0.66, 0.55, 0.98],
      markers: points.map((p) => ({ location: [p.lat, p.lon] as [number, number], size: 0.05 })),
      onRender: (state: Record<string, unknown>) => {
        if (pointerInteracting.current === null) {
          phiRef.current += 0.003;
        }
        const phi = phiRef.current + pointerInteractionMovement.current / 200;
        (state as { phi: number }).phi = phi;
        (state as { width: number }).width = size * 2;
        (state as { height: number }).height = size * 2;

        // Project each monument's (lat, lon) to screen space using the same
        // phi cobe is currently rendering at. Y is flipped (CSS-y → Three-y).
        for (const e of entries) {
          if (!e.loaded) continue;
          const pos = projectLatLon(e.lat, e.lon, phi, THETA, cx, cy, projectionRadius);
          if (!pos.visible) { e.wrapper.visible = false; continue; }
          e.wrapper.visible = true;
          e.wrapper.position.set(pos.x, size - pos.y, 0);
          // Match the iOS globe's eagle-view tilt so each monument reads as a
          // 3D solid leaning toward the camera.
          e.wrapper.rotation.set(0.9, 0, 0);
        }

        // Independent Y-spin per monument so they feel alive even when the
        // base globe is between frames. Time-delta based so the rate stays
        // constant regardless of how often render() fires.
        const tNow = performance.now();
        const dt = lastSpinTs ? Math.min(0.1, (tNow - lastSpinTs) / 1000) : 0;
        lastSpinTs = tNow;
        const yawDelta = 0.14 * dt;
        for (const e of entries) {
          if (!e.loaded) continue;
          const inner = e.wrapper.children[0];
          if (inner) inner.rotation.y += yawDelta;
        }

        overlayRenderer.render(overlayScene, overlayCamera);
      },
    } as unknown as COBEOptions;

    const globe = createGlobe(baseCanvasRef.current, opts);
    baseCanvasRef.current.style.opacity = '0';
    requestAnimationFrame(() => {
      if (baseCanvasRef.current) baseCanvasRef.current.style.opacity = '1';
    });

    const onDown = (e: PointerEvent) => {
      pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
      if (baseCanvasRef.current) baseCanvasRef.current.style.cursor = 'grabbing';
    };
    const onUp = () => {
      pointerInteracting.current = null;
      if (baseCanvasRef.current) baseCanvasRef.current.style.cursor = 'grab';
    };
    const onMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        pointerInteractionMovement.current = e.clientX - pointerInteracting.current;
      }
    };
    baseCanvasRef.current.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);

    return () => {
      globe.destroy();
      baseCanvasRef.current?.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      // Dispose Three.js resources so the page doesn't leak GPU memory across
      // re-mounts (Wrapped's framer-motion AnimatePresence re-mounts pages).
      for (const e of entries) {
        e.wrapper.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
          else mat?.dispose?.();
        });
      }
      pmrem.dispose();
      overlayRenderer.dispose();
    };
  }, [points, size]);

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
        ref={baseCanvasRef}
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
      <canvas
        ref={overlayCanvasRef}
        width={size}
        height={size}
        style={{
          position: 'absolute',
          inset: 0,
          width: size,
          height: size,
          pointerEvents: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}
