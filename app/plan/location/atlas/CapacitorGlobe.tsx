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
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
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
      // DEV BYPASS: ?mapbox-globe-dev=1 (dev builds only) lets Playwright
      // verify the 3D layer without going through the login flow. Strictly
      // NODE_ENV-gated so it never reaches production users.
      const devBypass = process.env.NODE_ENV !== "production" &&
        typeof location !== "undefined" &&
        new URLSearchParams(location.search).has("mapbox-globe-dev");
      if (!isAuthed && !devBypass) return;

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
      // Diagnostic — surfaces custom layer state in the error overlay so
      // we can see what's actually happening on iOS without a console.
      const diag = { added: false, loaded: 0, errors: 0, lastErr: "", renders: 0 };
      const reportDiag = () => {
        try {
          const el = document.getElementById("mapbox-err-overlay");
          if (!el) return;
          el.textContent = `3d-layer: added=${diag.added} loaded=${diag.loaded}/31 errs=${diag.errors} renders=${diag.renders}${diag.lastErr ? " | " + diag.lastErr : ""}`;
          el.style.background = diag.errors > 0 ? "rgba(220,50,50,0.92)" : "rgba(40,140,60,0.85)";
        } catch {}
      };
      reportDiag();

      // ──── Overlay Canvas approach (replaces failed custom-layer attempt) ────
      // The Mapbox v3 custom layer pattern proved unreliable on globe
      // projection — even a bright red probe box at Paris lat/lon never
      // appeared, despite render() firing and GLBs loading. Three.js
      // sharing Mapbox's WebGL context just doesn't work cleanly in globe
      // mode in v3.24. Instead:
      //
      //   1. A transparent <canvas> overlays the Mapbox canvas
      //   2. A standalone Three.js scene renders all 31 GLBs once
      //   3. Each frame, every model's screen position is computed via
      //      map.project(latlon) and applied as an x,y translation in
      //      orthographic camera space
      //   4. Models facing the camera-facing hemisphere render; back-side
      //      ones are hidden via the dot product of the surface normal
      //      vs the view direction
      //
      // Trade-offs vs custom layer:
      //   + Reliable rendering (two-context overhead is small for 31 models)
      //   + Independent depth — no z-fighting against satellite tiles
      //   + Easy to update positions every frame
      //   – Two WebGL contexts (more memory, but bounded)
      //   – Orthographic projection — monuments don't shrink with distance
      //     (acceptable at globe zoom; they're already tiny)
      const overlayCanvas = document.createElement("canvas");
      overlayCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;";
      const mapContainer = map.getContainer();
      mapContainer.appendChild(overlayCanvas);

      const overlayRenderer = new THREE.WebGLRenderer({
        canvas: overlayCanvas,
        alpha: true,
        antialias: true,
      });
      overlayRenderer.setPixelRatio(window.devicePixelRatio);
      overlayRenderer.setClearColor(0x000000, 0);
      // sRGB output + ACES tone mapping so Meshy PBR materials don't
      // render as dark silhouettes. Without sRGB conversion, embedded
      // diffuse maps look ~2x darker than authored.
      overlayRenderer.outputColorSpace = THREE.SRGBColorSpace;
      overlayRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      overlayRenderer.toneMappingExposure = 1.2;

      const overlayScene = new THREE.Scene();
      // Bright ambient so even back-lit faces stay readable at icon size.
      overlayScene.add(new THREE.AmbientLight(0xffffff, 1.5));
      // Key light positioned toward the viewer + slightly up so monuments
      // catch a sunlit-from-top-front read at glance distance.
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(0.3, 0.6, 1.0);
      overlayScene.add(keyLight);
      // Cool fill from below-side to give silhouette read on the dark globe.
      const fillLight = new THREE.DirectionalLight(0xa5b8d8, 0.6);
      fillLight.position.set(-0.4, -0.2, 0.6);
      overlayScene.add(fillLight);
      const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
      overlayCamera.position.z = 100;

      const resize = () => {
        const w = mapContainer.clientWidth;
        const h = mapContainer.clientHeight;
        overlayRenderer.setSize(w, h, false);
        // Y-up camera (Three.js native). Top=h, bottom=0 — when we position
        // models we'll translate screen-y to Three-y as (h - screenY) so
        // CSS pixel coords still feel natural at the call-site. Without
        // this, the projection inverts model geometry — Eiffel Tower would
        // render upside-down because GLB +Y (up) maps to camera -Y.
        overlayCamera.left = 0;
        overlayCamera.right = w;
        overlayCamera.top = h;
        overlayCamera.bottom = 0;
        overlayCamera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(mapContainer);

      // Models: load all GLBs, attach each to a wrapper Object3D positioned
      // at projected screen coords each frame.
      type ModelEntry = { mk: string; latlon: { lat: number; lon: number }; wrapper: THREE.Object3D; loaded: boolean };
      const entries: ModelEntry[] = [];
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);

      // Fetch the user's collection + equipped skins. Mirrors what the
      // web globe does in LocationClient — /api/monuments returns
      // { collected: [...], activeSkins: { eiffelTower: 'gold', ... } }.
      // If a monument has an active skin we load <prefix>_<skin>.glb;
      // otherwise we fall back to the default tier <prefix>.glb that
      // ships pre-compressed for everyone. Skin variants are compressed
      // by bin/compress-mapbox-skin-variants.mjs; missing ones 404 and
      // the .catch below silently retries with the default.
      const loadAllMonuments = async () => {
        let activeSkins: Record<string, string> = {};
        try {
          const res = await fetch("/api/monuments", { credentials: "include" });
          if (res.ok) {
            const data = await res.json() as { activeSkins?: Record<string, string> };
            if (data.activeSkins) activeSkins = data.activeSkins;
          }
        } catch {
          // Not authed or offline — fall through with empty map.
        }

        for (const [mk, latlon] of Object.entries(MONUMENT_LATLON)) {
          const file = MONUMENT_FILE_PREFIX[mk] ?? mk;
          const skin = activeSkins[mk];
          // Try the user's equipped skin first; on any failure (404 because
          // the skin variant isn't compressed yet, or any network error)
          // retry with the default base GLB so the monument still appears.
          const skinUrl = skin && skin !== "default" ? `/models/mapbox/${file}_${skin}.glb` : null;
          const defaultUrl = `/models/mapbox/${file}.glb`;
          const wrapper = new THREE.Object3D();
          wrapper.visible = false;
          overlayScene.add(wrapper);
          const entry: ModelEntry = { mk, latlon, wrapper, loaded: false };
          entries.push(entry);
          const tryLoad = (url: string, isFallback: boolean) => {
            loader.load(url, (gltf) => {
          const obj = gltf.scene;
          // Normalize the GLB to a unit cube centered at origin, then scale
          // to display size in pixels. Y-up GLB stands upright in orthographic.
          const bbox = new THREE.Box3().setFromObject(obj);
          const size = new THREE.Vector3(); bbox.getSize(size);
          const center = new THREE.Vector3(); bbox.getCenter(center);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          obj.position.sub(center);
          obj.position.y += size.y / 2; // anchor at base
          const DISPLAY_PX = 44;
          obj.scale.setScalar(DISPLAY_PX / maxDim);
          wrapper.add(obj);
          // Wrapper rotation is set every frame in updatePositions() to
          // keep each monument laminated to the globe surface — radial Z
          // alignment + dot-product-based X tilt. Don't set a static value
          // here.
          (wrapper as THREE.Object3D & { userData: { mk?: string } }).userData.mk = mk;
          entry.loaded = true;
          diag.loaded++;
          reportDiag();
          map.triggerRepaint();
            }, undefined, (err) => {
              // Skin variant didn't exist (404) → fall back to default tier.
              // Other failures (parse/network) → log to diag overlay.
              if (!isFallback && skinUrl) {
                tryLoad(defaultUrl, true);
                return;
              }
              diag.errors++;
              diag.lastErr = `${mk}: ${(err as Error)?.message || err}`.slice(0, 80);
              reportDiag();
            });
          };
          tryLoad(skinUrl ?? defaultUrl, !skinUrl);
        }
      };
      loadAllMonuments();

      // Each frame: project each lat/lon to screen pixels, hide back-of-globe
      // models, and orient each so it appears LAMINATED to the globe surface
      // (its base anchored at the surface point, its "up" pointing radially
      // outward, foreshortened toward the limb so we never see its underside).
      const updatePositions = () => {
        const w = mapContainer.clientWidth;
        const h = mapContainer.clientHeight;
        const center = map.getCenter();
        const camLat = (center.lat * Math.PI) / 180;
        const camLon = (center.lng * Math.PI) / 180;
        const cx = Math.cos(camLat) * Math.cos(camLon);
        const cy = Math.cos(camLat) * Math.sin(camLon);
        const cz = Math.sin(camLat);
        // Screen position of the globe centre — used to compute each
        // monument's radial direction on screen.
        const centerScreen = map.project([center.lng, center.lat]);
        for (const e of entries) {
          if (!e.loaded) continue;
          const lat = (e.latlon.lat * Math.PI) / 180;
          const lon = (e.latlon.lon * Math.PI) / 180;
          const nx = Math.cos(lat) * Math.cos(lon);
          const ny = Math.cos(lat) * Math.sin(lon);
          const nz = Math.sin(lat);
          const dot = nx * cx + ny * cy + nz * cz;
          if (dot < 0.05) { e.wrapper.visible = false; continue; }

          const pt = map.project([e.latlon.lon, e.latlon.lat]);
          if (pt.x < -100 || pt.x > w + 100 || pt.y < -100 || pt.y > h + 100) {
            e.wrapper.visible = false; continue;
          }
          e.wrapper.visible = true;
          // Y-up camera → flip CSS y to Three y.
          const tx = pt.x;
          const ty = h - pt.y;
          const ccx = centerScreen.x;
          const ccy = h - centerScreen.y;
          e.wrapper.position.set(tx, ty, 0);

          // ──── Laminated-on-globe orientation ────
          // (1) Z-rotation: monument's +Y (up) aligns with the screen-radial
          //     direction (outward from globe centre). At the top of the
          //     visible hemisphere, +Y points straight up; at the right
          //     edge it points right; at the bottom it points down.
          const dx = tx - ccx;
          const dy = ty - ccy;
          const radialAngle = Math.atan2(-dx, dy);
          // (2) X-rotation: as the monument moves toward the limb (dot → 0)
          //     it leans away from the camera so we see less of its top and
          //     more of its side, never its underside. dot=1 (face-on) →
          //     small forward tilt for legibility. dot=0 (limb) → full
          //     edge-on. Clamped so even limb monuments don't fully flatten.
          const tiltX = (1 - dot) * 1.2;
          e.wrapper.rotation.set(tiltX, 0, radialAngle);
          // (3) Mild Y-scale squash so foreshortening at the limb reads
          //     correctly (a monument seen edge-on shouldn't be tall).
          const yScale = Math.max(0.5, dot);
          e.wrapper.scale.set(1, yScale, 1);
        }
        overlayRenderer.render(overlayScene, overlayCamera);
        diag.renders++;
        if (diag.renders % 30 === 1) reportDiag();
      };
      map.on("render", updatePositions);
      diag.added = true;
      reportDiag();

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
