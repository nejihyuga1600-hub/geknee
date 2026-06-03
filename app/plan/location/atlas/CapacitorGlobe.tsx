"use client";

// Capacitor-only globe — Mapbox GL JS in globe projection.
//
// Why not Three.js (our web globe)?
//
//   Capacitor's WKWebView in third-party iOS apps doesn't have JIT, so JS
//   runs ~3-5x slower than mobile Safari. Three.js mount (60fps useFrame
//   loops + custom shaders + R3F overhead) pins the CPU long enough that
//   iOS's WebKit watchdog kills the renderer process every 2-3 seconds.
//   We tried every memory + CPU cut — texture, lazy GLBs, session recording,
//   text labels, frameloop=demand — and the cold-load still blinks.
//
//   Polarsteps faced the same problem and solved it the same way: Mapbox
//   GL JS on web, native Mapbox SDK on mobile. Mapbox GL JS is engineered
//   for mobile WebView: vector tiles load incrementally, smart culling,
//   one compiled WebGL program for the whole scene, atmosphere built in.
//
// Trade-offs vs the Three.js globe:
//
//   - Monuments are 2D pin icons here, not interactive 3D GLB models on the
//     globe surface. The 3D models still appear when the user TAPS a pin
//     and opens the monument card (preserves the rarity reveal moment).
//   - We don't get our custom atmosphere shader; we use Mapbox's built-in.
//   - Requires NEXT_PUBLIC_MAPBOX_TOKEN env var (free up to 50k MAU).
//
// Long-term answer is a native Capacitor Mapbox plugin (what Polarsteps
// actually does on mobile) — but this WebView swap unblocks ship today.

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MONUMENT_LATLON, MONUMENT_FILE_PREFIX } from "../globe/skins";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function CapacitorGlobe() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { data: session } = useSession();
  const isAuthed = !!session?.user;
  const initialView = { center: [0, 20] as [number, number], zoom: 1.2, pitch: 0, bearing: 0 };

  useEffect(() => {
    if (!containerRef.current || !TOKEN) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      // Standard satellite style with the globe projection — looks like Earth
      // from space without us authoring a custom style. Switch to a custom
      // style URL later if we want geknee brand colours.
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      projection: "globe",
      center: initialView.center,
      zoom: initialView.zoom,
      // No interaction throttling — Mapbox handles touch on iOS natively.
      pitchWithRotate: true,
      // Faster mount on iOS: don't compute initial fog/atmosphere until
      // after the first frame paints. Reduces cold-load CPU spike.
      fadeDuration: 0,
    });

    mapRef.current = map;

    // Surface Mapbox errors visibly — WKWebView swallows console output and
    // silent style/tile failures show as "black globe with markers", which
    // is identical to a successful mount visually. Route everything to
    // Sentry-equivalent logging and a debug overlay element.
    map.on("error", (e) => {
      const msg = (e?.error?.message || String(e?.error) || "unknown").slice(0, 200);
      console.warn("[CapacitorGlobe mapbox error]", msg, e);
      try {
        const el = document.getElementById("mapbox-err-overlay");
        if (el) el.textContent = `mapbox: ${msg}`;
      } catch {}
    });

    // Bridge to the AtlasShell Initialize button. Matches the Three.js
    // globe's resetGlobeTilt — only the camera ANGLES home (pitch + bearing
    // → 0), the center + zoom stay where the user left them. Initialize
    // isn't "teleport home", it's "level out my view".
    const onInitialize = () => {
      map.easeTo({ pitch: 0, bearing: 0, duration: 1200, essential: true });
    };
    window.addEventListener("geknee:globe-initialize", onInitialize);

    map.on("style.load", () => {
      // Atmosphere settings — Mapbox's native rendering, free.
      map.setFog({
        color: "rgb(186, 210, 235)",
        "high-color": "rgb(36, 92, 223)",
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)",
        "star-intensity": 0.6,
      });

      // Guests don't see monuments — only authed users get the pins. Mirrors
      // the Three.js globe behavior where Lm self-gates on viewerAuthed.
      if (!isAuthed) return;

      // ──── 3D monument layer DISABLED ────
      // The Mapbox v3 model layer (experimental) was blanking the satellite
      // raster tiles on iOS WKWebView — confirmed in the field 2026-06-03.
      // The atmosphere + markers continued rendering but tiles went black,
      // which means the model layer's WebGL state was corrupting the raster
      // pass. Gated behind ?mapbox-3d=1 so it only activates for explicit
      // PoC testing in a desktop browser, never on iOS.
      const enable3DModels = typeof location !== "undefined" &&
        new URLSearchParams(location.search).has("mapbox-3d");
      if (enable3DModels) {
        try {
          map.addModel("eiffel", "/models/mapbox/eiffel_tower.glb");
          map.addSource("monument-models-3d", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [{
                type: "Feature",
                properties: { "model-id": "eiffel" },
                geometry: { type: "Point", coordinates: [2.2945, 48.8584] },
              }],
            },
          });
          map.addLayer({
            id: "monument-models-3d-layer",
            type: "model",
            source: "monument-models-3d",
            layout: { "model-id": ["get", "model-id"] },
            paint: {
              "model-scale": ["literal", [50000, 50000, 50000]],
              "model-cast-shadows": false,
            },
          });
        } catch (err) {
          console.warn("[CapacitorGlobe] model layer init failed", err);
        }
      }

      // ──── Real 3D Meshy monuments via Mapbox custom layer ────
      // Per rules.md non-negotiable #1, monuments must render with 3D quality.
      // The Mapbox v3 `model` layer blanked tiles on WKWebView (see earlier
      // 6a52121), so we use the CUSTOM LAYER pattern instead: a Three.js
      // scene that shares Mapbox's WebGL context. One context, no R3F frame
      // loop (which is what caused the original iOS blink loop) — just
      // static GLBs positioned at lat/lon and re-rendered when the camera
      // moves. Source GLBs pre-compressed by bin/compress-mapbox-glbs.mjs
      // from 407MB → 8MB total (51× reduction, ~260KB avg per monument).
      const customLayer: mapboxgl.CustomLayerInterface = {
        id: "geknee-3d-monuments",
        type: "custom",
        renderingMode: "3d",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onAdd(_map: mapboxgl.Map, gl: WebGLRenderingContext) {
          const self = this as unknown as {
            scene: THREE.Scene;
            camera: THREE.Camera;
            renderer: THREE.WebGLRenderer;
            models: Array<{ obj: THREE.Object3D; merc: mapboxgl.MercatorCoordinate }>;
            loaded: number;
          };
          self.scene = new THREE.Scene();
          self.camera = new THREE.Camera();
          self.models = [];
          self.loaded = 0;
          // Soft sun + ambient — enough to read Meshy PBR detail without
          // over-saturating at globe zoom where each monument is tiny.
          const sun = new THREE.DirectionalLight(0xffffff, 1.3);
          sun.position.set(0.6, 1.0, 0.4);
          self.scene.add(sun);
          self.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
          // Reuse Mapbox's WebGL context — critical for sharing the GPU
          // pipeline (no second context = no extra memory pressure).
          self.renderer = new THREE.WebGLRenderer({
            canvas: _map.getCanvas(),
            context: gl as unknown as WebGL2RenderingContext,
            antialias: true,
          });
          self.renderer.autoClear = false;

          const loader = new GLTFLoader();
          for (const [mk, latlon] of Object.entries(MONUMENT_LATLON)) {
            const file = MONUMENT_FILE_PREFIX[mk] ?? mk;
            const merc = mapboxgl.MercatorCoordinate.fromLngLat(
              [latlon.lon, latlon.lat],
              0,
            );
            loader.load(
              `/models/mapbox/${file}.glb`,
              (gltf) => {
                const obj = gltf.scene;
                // Mercator world units: 1 unit = 1 globe. To place a model
                // at meter scale, multiply by `meterInMercatorCoordinateUnits()`
                // then by the desired tall-in-meters. 80km tall reads at
                // globe zoom 1.2 without dominating the surface.
                const mpu = merc.meterInMercatorCoordinateUnits();
                const TALL_METERS = 80000;
                obj.scale.set(mpu * TALL_METERS, mpu * TALL_METERS, mpu * TALL_METERS);
                obj.position.set(merc.x, merc.y, merc.z ?? 0);
                // Mapbox Mercator world is Y-down, Z-up; GLBs are Y-up.
                // Rotate +X by 90° so the model stands "up" on the surface.
                obj.rotation.x = Math.PI / 2;
                // Tag for click-handling raycast.
                obj.traverse((c) => { (c as THREE.Object3D & { userData: { mk?: string } }).userData.mk = mk; });
                self.scene.add(obj);
                self.models.push({ obj, merc });
                self.loaded++;
                _map.triggerRepaint();
              },
              undefined,
              (err) => console.warn(`[CapacitorGlobe] GLB load fail ${mk}`, err),
            );
          }
        },
        render(_gl: WebGLRenderingContext, matrix: number[]) {
          const self = this as unknown as {
            scene: THREE.Scene;
            camera: THREE.Camera;
            renderer: THREE.WebGLRenderer;
          };
          // Mapbox's MVP matrix maps Mercator world (0..1) to clip space.
          // Set it directly on the camera's projection matrix and render —
          // each model's position/scale in the scene is already in Mercator.
          self.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
          self.renderer.resetState();
          self.renderer.render(self.scene, self.camera);
        },
      };
      try {
        map.addLayer(customLayer);
      } catch (err) {
        console.warn("[CapacitorGlobe] custom layer add failed", err);
      }

      // Tap targets — invisible HTML markers over each monument for click
      // handling. Raycasting onto a custom layer is doable but slow on
      // WKWebView; a 64x64 transparent <div> overlay is dirt cheap and
      // gives a comfortable tap zone for finger touch on small sprites.
      for (const [mk, { lat, lon }] of Object.entries(MONUMENT_LATLON)) {
        const el = document.createElement("div");
        el.setAttribute("aria-label", mk);
        el.style.cssText = "width:64px;height:64px;background:transparent;cursor:pointer;";
        el.addEventListener("click", () => {
          window.dispatchEvent(
            new CustomEvent("geknee:monument-select", { detail: { mk } }),
          );
        });
        new mapboxgl.Marker({
          element: el,
          anchor: "center",
          rotationAlignment: "viewport",
          pitchAlignment: "viewport",
        })
          .setLngLat([lon, lat])
          .addTo(map);
      }
    });

    return () => {
      window.removeEventListener("geknee:globe-initialize", onInitialize);
      map.remove();
      mapRef.current = null;
    };
  // Re-mount when auth state flips so signing in mid-session refreshes
  // the markers (guest → authed users see their pins without a reload).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  if (!TOKEN) {
    // Fallback when no token is configured — show the static gradient so
    // the page doesn't render a confusing blank. Brand owner can set
    // NEXT_PUBLIC_MAPBOX_TOKEN in Vercel env to enable.
    return (
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 45%, #1e3a8a 0%, #0c1e4a 40%, #050818 75%, #02030a 100%)",
        }}
      />
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100svh",
          zIndex: 1,
          touchAction: "none",
        }}
      />
      {/* Mapbox error overlay — WKWebView swallows console output so a
          visible debug element is the only reliable signal when iOS users
          hit a tile/style failure. Empty by default; populated by the
          map.on("error") handler above. Top-left so it doesn't clash
          with the Initialize button or auth chips. */}
      <div
        id="mapbox-err-overlay"
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top) + 88px)",
          left: 12,
          right: 12,
          maxWidth: 360,
          zIndex: 60,
          padding: "8px 12px",
          background: "rgba(220,50,50,0.92)",
          color: "#fff",
          borderRadius: 8,
          fontSize: 12,
          fontFamily: "ui-monospace, monospace",
          pointerEvents: "none",
          opacity: 0.95,
        }}
      />
    </>
  );
}
