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

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MONUMENT_LATLON, MONUMENT_FILE_PREFIX } from "../globe/skins";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function CapacitorGlobe() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { data: session } = useSession();
  const isAuthed = !!session?.user;
  // Bumped on geknee:monuments-updated (MonumentShop dispatches after skin
  // equip / mission complete). Added to the effect deps below so the map +
  // GLB layer re-mount and pick up the new activeSkins. Heavy but
  // reliable; the alternative is wiring a per-monument GLB swap which is
  // out of scope right now.
  const [skinReloadKey, setSkinReloadKey] = useState(0);
  useEffect(() => {
    const bump = () => setSkinReloadKey(k => k + 1);
    window.addEventListener('geknee:monuments-updated', bump);
    return () => window.removeEventListener('geknee:monuments-updated', bump);
  }, []);
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

    // Search → fly. Fires when the bottom-sheet "Try Kyoto, Iceland…"
    // text input submits (or a suggestion is picked) — globeAnim.flyToGlobe
    // dispatches this so both the web Three.js globe AND this Capacitor
    // Mapbox globe react to the same user action. Zoom 3 keeps the globe
    // shape visible while focusing the chosen lat/lon at screen centre.
    const onFlyTo = (e: Event) => {
      const detail = (e as CustomEvent<{ lat: number; lon: number; zoom?: number }>).detail;
      if (!detail || typeof detail.lat !== "number" || typeof detail.lon !== "number") return;
      // Optional zoom from the caller: collection unlock asks for ~12
      // (city level so the user can see the monument standing in its
      // actual neighborhood). Search-box default stays at 3 (continent).
      const zoom = typeof detail.zoom === "number" ? detail.zoom : 3;
      map.flyTo({
        center: [detail.lon, detail.lat],
        zoom,
        duration: 2200,
        essential: true,
      });
    };
    window.addEventListener("geknee:globe-fly-to", onFlyTo);

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
      // Environment map (RoomEnvironment via PMREMGenerator) gives every
      // PBR Meshy material proper IBL reflections — without this, gold/
      // silver/diamond skins read as flat colours instead of metallic
      // surfaces with highlights. Setup is one-time and cached on the
      // GPU, so adding monuments later doesn't pay the cost again.
      const pmrem = new THREE.PMREMGenerator(overlayRenderer);
      overlayScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      // Sky/ground hemisphere — soft top-down gradient over the IBL so the
      // monument's TOP face reads brighter than its base (eagle-view cue).
      overlayScene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a2240, 1.0));
      // Key light from above-front so each monument gets a clear specular
      // highlight on its top face — user feedback was "looks 2D"; specular
      // hot spots are what sells 3D at icon scale.
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
      keyLight.position.set(0.3, 1.4, 0.8);
      overlayScene.add(keyLight);
      // Subtle cool rim from behind/below for silhouette read on dark globe.
      const rimLight = new THREE.DirectionalLight(0x88a8d8, 0.5);
      rimLight.position.set(-0.6, -0.2, -0.4);
      overlayScene.add(rimLight);
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
          // 50px — user dialed monuments back down 50% from the previous
          // 100 (which felt too dominant at globe zoom). Tap-target div
          // below scales in step (144 → 72) so touch padding stays
          // comfortable around the smaller sprite.
          const DISPLAY_PX = 50;
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
      let lastSpinTs = 0;
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
          e.wrapper.position.set(pt.x, h - pt.y, 0);
          // Eagle-view tilt: every visible monument leans 52° toward the
          // camera so we see its TOP face (not the side). Base stays
          // anchored at the lat/lon point (= "bottom of coin connected to
          // centre of globe"); top tilts forward. Same tilt for every
          // monument so spinning the globe doesn't visually rotate them
          // (user feedback: "monuments are spinning as I spin the globe").
          e.wrapper.rotation.set(0.9, 0, 0);
        }
        // Continuous Y-spin on each loaded model so the 3D form reads
        // unmistakably as 3D. Time-delta based so the spin rate is
        // INDEPENDENT of how often render() fires — previously the
        // per-frame increment made the spin appear to accelerate when
        // the globe was being dragged (more render events), which read
        // as "monuments spin with the globe". Real wall-clock rate:
        // ~8°/sec (0.14 rad/sec) regardless of fps or interaction.
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
        diag.renders++;
        if (diag.renders % 30 === 1) reportDiag();
      };
      map.on("render", updatePositions);
      // RAF loop so the monument auto-spin keeps animating even when the
      // user isn't interacting with the map. Mapbox only fires "render"
      // on its own state changes, which would freeze the Y-spin between
      // gestures.
      let rafId = 0;
      let paused = false;
      const tick = () => {
        updatePositions();
        rafId = requestAnimationFrame(tick);
      };
      const startTick = () => {
        if (paused) return;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tick);
      };
      startTick();
      // Pause both the Mapbox repaint chain (Three.js overlay rendered by
      // updatePositions on each Mapbox "render" + our rAF) when a heavy
      // overlay (MonumentShop modal) opens. On WKWebView the modal's
      // backdrop-filter blur compositing the two underlying WebGL canvases
      // (Mapbox + the Three.js monument overlay) every frame pegs the GPU
      // hard enough to OOM the WebView — Capacitor then auto-reloads the
      // URL, which reads as "globe crashes + force-refreshes" to the user.
      // Cancelling the rAF + suspending Mapbox rendering while the modal
      // is up keeps the iPhone GPU idle. Resume on close.
      const onPause = () => {
        paused = true;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        try { (map as unknown as { stop?: () => void }).stop?.(); } catch {}
      };
      const onResume = () => {
        if (!paused) return;
        paused = false;
        startTick();
      };
      window.addEventListener("geknee:globe-pause", onPause);
      window.addEventListener("geknee:globe-resume", onResume);
      // Store on the map for cleanup in the useEffect return below.
      (map as unknown as { __geknee_rafId?: number; __geknee_pauseHandlers?: () => void }).__geknee_rafId = rafId;
      (map as unknown as { __geknee_pauseHandlers?: () => void }).__geknee_pauseHandlers = () => {
        window.removeEventListener("geknee:globe-pause", onPause);
        window.removeEventListener("geknee:globe-resume", onResume);
      };
      diag.added = true;
      reportDiag();

      // Tap targets — invisible HTML markers over each monument for click
      // handling. Raycasting onto a custom layer is doable but slow on
      // WKWebView; a 64x64 transparent <div> overlay is dirt cheap and
      // gives a comfortable tap zone for finger touch on small sprites.
      for (const [mk, { lat, lon }] of Object.entries(MONUMENT_LATLON)) {
        const el = document.createElement("div");
        el.setAttribute("aria-label", mk);
        el.style.cssText = "width:72px;height:72px;background:transparent;cursor:pointer;";
        el.addEventListener("click", () => {
          // Existing select event — preserved for any legacy listeners.
          window.dispatchEvent(
            new CustomEvent("geknee:monument-select", { detail: { mk } }),
          );
          // Surface the collection panel scoped to this mk, matching the
          // Three.js landmark behavior on web. Without this, iOS Mapbox
          // taps fire monument-select into the void.
          window.dispatchEvent(
            new CustomEvent("geknee:open-monument-shop", { detail: { mk } }),
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
      window.removeEventListener("geknee:globe-fly-to", onFlyTo);
      const rafId = (map as unknown as { __geknee_rafId?: number }).__geknee_rafId;
      if (rafId) cancelAnimationFrame(rafId);
      const detachPause = (map as unknown as { __geknee_pauseHandlers?: () => void }).__geknee_pauseHandlers;
      if (detachPause) detachPause();
      map.remove();
      mapRef.current = null;
    };
  // Re-mount when auth state flips so signing in mid-session refreshes
  // the markers (guest → authed users see their pins without a reload).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, skinReloadKey]);

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
