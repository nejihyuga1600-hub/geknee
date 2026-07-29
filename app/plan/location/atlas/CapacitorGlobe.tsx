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
import { markMountPhase } from "@/lib/session-continuity";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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
    markMountPhase("capacitor-globe:mapbox-init");
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
      // Hard zoom cap — protects the WKWebView from Jetsam OOM. Reported
      // symptom: "globe refreshes when I zoom into a country". Root cause
      // was flyTo(zoom:14) on monument tap; the tile pyramid explosion at
      // that zoom combined with the Three.js overlay canvas + monument
      // GLBs killed the WebView content process on iOS, and Capacitor
      // auto-reloaded to the initial URL. 8 is enough to see a country's
      // shape / major landforms; deeper zoom is what the trip-map view
      // (Google Maps) is for.
      maxZoom: 8,
      // Cap Mapbox's in-memory tile cache. Default is unbounded up to
      // ~500MB on desktop; iOS WKWebView has ~150MB before Jetsam kills.
      // 60 tiles ≈ 30MB, plenty for cold-globe browsing.
      maxTileCacheSize: 60,
      // No interaction throttling — Mapbox handles touch on iOS natively.
      pitchWithRotate: true,
      // Faster mount on iOS: don't compute initial fog/atmosphere until
      // after the first frame paints. Reduces cold-load CPU spike.
      fadeDuration: 0,
    });

    mapRef.current = map;

    // Refresh hook for skin equip / mission completion. MonumentShop
    // dispatches geknee:monuments-updated; the previous fix triggered a
    // full map remount which leaked the appended Three.js overlay canvas
    // every cycle (visible as stacked-tower duplicates). Instead we
    // refresh in-place — assigned once `loadAllMonuments` exists inside
    // the style.load callback below.
    let refreshMonuments: (() => void) | null = null;
    const onMonumentsUpdated = () => { refreshMonuments?.(); };
    window.addEventListener("geknee:monuments-updated", onMonumentsUpdated);

    // Surface Mapbox errors visibly — WKWebView swallows console output and
    // silent style/tile failures show as "black globe with markers", which
    // is identical to a successful mount visually. Route everything to
    // Sentry-equivalent logging and a debug overlay element.
    // Same HUD gate as reportDiag() — hidden on Capacitor/iOS unless
    // ?debug=1 is set. Errors still route to Sentry via captureError().
    const HUD_ENABLED_ERR = (() => {
      try {
        if (typeof window === "undefined") return false;
        const isNative = !!(window as unknown as {
          Capacitor?: { isNativePlatform?: () => boolean };
        }).Capacitor?.isNativePlatform?.();
        const forceDebug = new URLSearchParams(window.location.search).get("debug") === "1";
        return forceDebug || !isNative;
      } catch { return false; }
    })();
    map.on("error", (e) => {
      const msg = (e?.error?.message || String(e?.error) || "unknown").slice(0, 200);
      console.warn("[CapacitorGlobe mapbox error]", msg, e);
      if (!HUD_ENABLED_ERR) return;
      try {
        const el = document.getElementById("mapbox-err-overlay");
        if (el) {
          el.style.display = "block";
          el.textContent = `mapbox: ${msg}`;
        }
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
      const detail = (e as CustomEvent<{
        lat: number; lon: number; zoom?: number; paddingBottom?: number;
      }>).detail;
      if (!detail || typeof detail.lat !== "number" || typeof detail.lon !== "number") return;
      // Optional zoom from the caller: collection unlock asks for ~12
      // (city level so the user can see the monument standing in its
      // actual neighborhood). Search-box default stays at 3 (continent).
      const zoom = typeof detail.zoom === "number" ? detail.zoom : 3;
      // paddingBottom: MonumentShop fires this with ~50svh because the
      // detail-view bottom-sheet covers the lower half of the viewport.
      // Without padding the target lands BEHIND the sheet at geometric
      // viewport center. With padding Mapbox treats the visible upper
      // half as the centering region, so the monument shows up centered
      // in the slice the user actually sees.
      const paddingBottom = typeof detail.paddingBottom === "number" ? detail.paddingBottom : 0;
      map.flyTo({
        center: [detail.lon, detail.lat],
        zoom,
        duration: 2200,
        essential: true,
        padding: { top: 0, right: 0, bottom: paddingBottom, left: 0 },
      });
    };
    window.addEventListener("geknee:globe-fly-to", onFlyTo);

    // Persistent padding while the MonumentShop detail sheet is open. The
    // one-shot padding inside flyTo only holds for the animation; any
    // user pan/zoom afterward would let the monument drift behind the
    // sheet again. setPadding keeps it pinned to the visible upper half
    // until the sheet is closed (paddingBottom: 0 resets).
    const onPaddingSet = (e: Event) => {
      const detail = (e as CustomEvent<{ paddingBottom?: number }>).detail;
      const pb = typeof detail?.paddingBottom === "number" ? detail.paddingBottom : 0;
      try {
        map.setPadding({ top: 0, right: 0, bottom: pb, left: 0 });
      } catch { /* setPadding can throw if camera mid-transition; ignore */ }
    };
    window.addEventListener("geknee:globe-padding-set", onPaddingSet);

    map.on("style.load", () => {
      markMountPhase("capacitor-globe:style-loaded");
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
      // Debug HUD gate: show only in web dev / non-native contexts (or when
      // ?debug=1 is set). On Capacitor (iOS app), errors are routed to
      // Sentry — the visible banner would leak into App Store screenshots.
      const HUD_ENABLED = (() => {
        try {
          if (typeof window === "undefined") return false;
          const isNative = !!(window as unknown as {
            Capacitor?: { isNativePlatform?: () => boolean };
          }).Capacitor?.isNativePlatform?.();
          const forceDebug = new URLSearchParams(window.location.search).get("debug") === "1";
          return forceDebug || !isNative;
        } catch { return false; }
      })();

      const reportDiag = () => {
        try {
          const el = document.getElementById("mapbox-err-overlay");
          if (!el) return;
          const hasIssue = diag.errors > 0 || !!diag.lastErr;
          if (!HUD_ENABLED || !hasIssue) {
            el.style.display = "none";
            el.textContent = "";
            return;
          }
          el.style.display = "block";
          el.textContent = `3d-layer: added=${diag.added} loaded=${diag.loaded}/31 errs=${diag.errors} renders=${diag.renders}${diag.lastErr ? " | " + diag.lastErr : ""}`;
          el.style.background = "rgba(220,50,50,0.92)";
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
      overlayCanvas.className = "geknee-monument-overlay";
      const mapContainer = map.getContainer();
      // Defensive: nuke any overlay canvases left over from previous
      // mounts of the buggy code path (where cleanup didn't remove the
      // canvas). Without this, users still running a cached old bundle
      // who upgrade will keep seeing stacked stale monuments until they
      // force-kill the app. Also safe in the steady-state — at most one
      // canvas with this class exists per mount, so the loop is a no-op.
      mapContainer.querySelectorAll(".geknee-monument-overlay").forEach((node) => {
        try { node.remove(); } catch {}
      });
      mapContainer.appendChild(overlayCanvas);

      // Capacitor iOS branch: cheaper renderer to keep the WKWebView from
      // slow-drift-OOM. Reported: "globe refreshes every minute" — the
      // 60fps rAF + 3x devicePixelRatio + 4x MSAA compounded into a
      // linear-growth memory pressure that Jetsam eventually snaps.
      const IS_NATIVE_WV = typeof window !== "undefined" && !!(window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      }).Capacitor?.isNativePlatform?.();
      const overlayRenderer = new THREE.WebGLRenderer({
        canvas: overlayCanvas,
        alpha: true,
        // 4x MSAA is one of the biggest WebGL memory sinks on mobile. The
        // monument sprites are ~60px on screen — AA has vanishing ROI here.
        antialias: !IS_NATIVE_WV,
        // Hints iOS to schedule on the low-power GPU instead of the
        // discrete one; halves the sustained thermal envelope.
        powerPreference: IS_NATIVE_WV ? "low-power" : "high-performance",
      });
      // Cap DPR at 2 on Capacitor — iPhone 15/16/17 report 3, which means
      // each pixel is 9 shaded pixels. Cap at 2 saves ~55% GPU per frame.
      overlayRenderer.setPixelRatio(
        IS_NATIVE_WV ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio,
      );
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

      // Hand the outer cleanup a teardown for the overlay we just
      // appended. Without this, every effect re-run (auth flip) leaves a
      // dead WebGL context + canvas behind in the map container, visible
      // as duplicated/stacked monuments on subsequent mounts.
      // Cluster badge container — HTML DOM, sibling of overlayCanvas.
      // Positioned absolutely; one child .geknee-cluster-badge per
      // active cluster this frame. Populated by updatePositions().
      // Cluster badge layer: pre-created pool of hidden DIVs, reused
      // frame-to-frame. Per-frame creation/removal was causing WebKit
      // layout thrash during spin — a visible "refresh" — and made the
      // badges flicker in and out. z-index bumped to 100 to sit above
      // every Mapbox internal layer without ambiguity.
      const clusterBadgeLayer = document.createElement("div");
      clusterBadgeLayer.className = "geknee-cluster-badges";
      clusterBadgeLayer.style.cssText =
        "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;";
      mapContainer.appendChild(clusterBadgeLayer);

      const BADGE_POOL_SIZE = 30;
      const badgePool: HTMLDivElement[] = [];
      for (let i = 0; i < BADGE_POOL_SIZE; i++) {
        const el = document.createElement("div");
        el.style.cssText = [
          "position:absolute", "top:0", "left:0",
          "min-width:22px", "height:22px",
          "padding:0 7px", "border-radius:11px",
          "background:linear-gradient(135deg,#a78bfa,#7dd3fc)",
          "color:#0a0a1f", "font-size:12px", "font-weight:800",
          "font-family:var(--font-ui),system-ui,sans-serif",
          "display:none", // shown only when assigned
          "align-items:center", "justify-content:center",
          "box-shadow:0 2px 8px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.55)",
          "pointer-events:none", "will-change:transform",
        ].join(";");
        clusterBadgeLayer.appendChild(el);
        badgePool.push(el);
      }

      (map as unknown as { __geknee_detachOverlay?: () => void }).__geknee_detachOverlay = () => {
        try { ro.disconnect(); } catch {}
        try { pmrem.dispose(); } catch {}
        try { overlayRenderer.dispose(); } catch {}
        try { mapContainer.removeChild(overlayCanvas); } catch {}
        try { mapContainer.removeChild(clusterBadgeLayer); } catch {}
      };

      // Models: load all GLBs, attach each to a wrapper Object3D positioned
      // at projected screen coords each frame.
      // priority ranks who yields ground when two monuments overlap in
      // screen space: highest priority stays put, lower priority pushes
      // outward. See the separation pass in updatePositions().
      //   3 = rare skin equipped (never moves)
      //   2 = collected (moves only to make room for tier 3)
      //   1 = uncollected fill (moves for everyone)
      type ModelEntry = { mk: string; latlon: { lat: number; lon: number }; wrapper: THREE.Object3D; loaded: boolean; priority: number; spawnAt?: number; tapEl?: HTMLDivElement };
      const entries: ModelEntry[] = [];
      const RARE_SKINS = new Set(["aurora", "celestial", "diamond"]);
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
      // Shared pause flag — wired below to geknee:globe-pause events
      // (fired by MonumentShop on open + our own zoom-in autopause).
      // The load loop awaits until this flips false so heavy GLB parses
      // never overlap with modal transitions or fly animations.
      let loadPaused = false;
      // loadInFlight = true from the moment a loader.loadAsync() promise
      // starts until applyGltf finishes. The tap handler waits for this
      // to be false (with a hard cap) before firing flyTo + shop mount —
      // stacking those on top of a live GLB parse is what was killing
      // WKWebView (Sentry `webview_respawn`, phase `monuments-glb-load`).
      let loadInFlight = false;
      const waitUntilResumed = async () => {
        while (loadPaused) {
          await new Promise<void>((r) => setTimeout(r, 250));
        }
      };
      // Wait until the load loop drains any in-flight parse. Called from
      // the tap handler with a hard cap so a stuck parse can't strand the
      // user staring at an unmoving map.
      const waitForLoadIdle = async (capMs: number) => {
        const deadline = Date.now() + capMs;
        while (loadInFlight && Date.now() < deadline) {
          await new Promise<void>((r) => setTimeout(r, 50));
        }
      };
      window.addEventListener("geknee:globe-pause", () => { loadPaused = true; });
      window.addEventListener("geknee:globe-resume", () => { loadPaused = false; });

      const loadAllMonuments = async () => {
        markMountPhase("capacitor-globe:monuments-fetch-skins");
        let activeSkins: Record<string, string> = {};
        let collected = new Set<string>();
        let isDev = false;
        try {
          const res = await fetch("/api/monuments", { credentials: "include" });
          if (res.ok) {
            const data = await res.json() as {
              activeSkins?: Record<string, string>;
              collected?: string[];
              isDev?: boolean;
            };
            if (data.activeSkins) activeSkins = data.activeSkins;
            if (Array.isArray(data.collected)) collected = new Set(data.collected);
            isDev = !!data.isDev;
          }
        } catch {
          // Not authed or offline — fall through with empty map.
        }

        // Only sensoji is still skiplisted — the GLB was never generated
        // and every load attempt 404s. The 5 formerly-oversized files
        // (montSaintMichel, cologneCathedral, stBasils, borobudur,
        // persepolis) are now sub-1MB after the glTF-transform pass,
        // safe to load everywhere.
        const OVERSIZED_SKIPLIST = new Set(["sensoji"]);
        const isNative = typeof window !== "undefined" && !!(window as unknown as {
          Capacitor?: { isNativePlatform?: () => boolean };
        }).Capacitor?.isNativePlatform?.();

        markMountPhase("capacitor-globe:monuments-glb-load");
        // Game-design rule: only render what the user has EARNED. Regular
        // accounts see only their `collected` monuments (must be present
        // + complete quests to unlock). Dev accounts (isDev = true)
        // render everything for testing.
        //
        // Web/non-native still renders all — the marketing web view is
        // meant to showcase the full catalog. Native app enforces the
        // collection gate.
        const allEntries = Object.entries(MONUMENT_LATLON)
          .filter(([mk]) => !(isNative && OVERSIZED_SKIPLIST.has(mk)));
        const orderedEntries = !isNative
          ? allEntries
          : isDev
            ? allEntries
            : allEntries.filter(([mk]) => collected.has(mk));
        for (const [mk, latlon] of orderedEntries) {
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
          const priority = skin && RARE_SKINS.has(skin) ? 3 : collected.has(mk) ? 2 : 1;
          const entry: ModelEntry = { mk, latlon, wrapper, loaded: false, priority };
          entries.push(entry);
          // Serialize monument loading so we never have more than one
          // parse in flight on the main thread. The prior RAF-yield fix
          // (d2ff835) only spaced KICKOFFS — all 26 fetches were still
          // in flight simultaneously, and their sync GLB parses stacked
          // when the promises resolved. Sentry regression on
          // JAVASCRIPT-NEXTJS-1K confirmed the same phase died 1817ms
          // in even with RAF yields.
          //
          // loadAsync + await = truly serial: fetch → parse → done →
          // next iteration. Plus a 120ms sleep between so the WebKit
          // watchdog gets breathing room even between heavy parses.
          const applyLoaded = (gltf: { scene: THREE.Object3D }) => {
            const obj = gltf.scene;
            const bbox = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3(); bbox.getSize(size);
            const center = new THREE.Vector3(); bbox.getCenter(center);
            obj.position.sub(center);
            obj.position.y += size.y / 2; // anchor at base
            const DISPLAY_PX = 63;
            const baseDim = Math.max(size.x, size.z) || 1;
            obj.scale.setScalar(DISPLAY_PX / baseDim);
            wrapper.add(obj);
            (wrapper as THREE.Object3D & { userData: { mk?: string } }).userData.mk = mk;
            entry.loaded = true;
            diag.loaded++;
            reportDiag();
            map.triggerRepaint();
          };
          loadInFlight = true;
          try {
            const gltf = await loader.loadAsync(skinUrl ?? defaultUrl);
            applyLoaded(gltf as { scene: THREE.Object3D });
          } catch {
            if (skinUrl) {
              try {
                const gltf = await loader.loadAsync(defaultUrl);
                applyLoaded(gltf as { scene: THREE.Object3D });
              } catch (err2) {
                diag.errors++;
                diag.lastErr = `${mk}: ${(err2 as Error)?.message || err2}`.slice(0, 80);
                reportDiag();
              }
            } else {
              diag.errors++;
              reportDiag();
            }
          } finally {
            loadInFlight = false;
          }
          if (isNative) {
            // 120ms lets the WebKit watchdog tick even after a heavy
            // parse. Total added time worst-case: 26 × 120ms ≈ 3s.
            await new Promise<void>((r) => setTimeout(r, 120));
            // Yield to user interactions — MonumentShop open or fly.
            // Prior behavior: mid-load, a tap kicked off flyTo + shop
            // mount while GLB parses were still stacking → combined
            // main-thread work killed the WebView. Now we pause the
            // load loop until any active pause signal clears.
            await waitUntilResumed();
          }
        }
      };

      // Incremental refresh — fires on `geknee:monuments-updated` after
      // the user unlocks or equips a skin in MonumentShop. The prior
      // teardown-and-reload path blanked every monument off the globe
      // for ~5-10s during serial loadAllMonuments(), which made the
      // just-collected one arrive well after the UnlockCeremony orb had
      // faded. Now:
      //
      //   1. Re-fetch /api/monuments to see who's newly collected + who
      //      has a different skin equipped
      //   2. For each NEW mk (not yet in entries): serial-load, stamp
      //      spawnAt so updatePositions() plays the scale-in bounce
      //   3. For each mk with a changed skin: tear down that ONE entry
      //      and reload it (with spawn animation so the skin swap reads)
      //   4. Existing untouched monuments stay put — no visual blank
      //
      // Rare-skin unlock path (celestial/aurora/diamond) also updates
      // priority so the separation pass promotes it to "never moves".
      refreshMonuments = async () => {
        let nextSkins: Record<string, string> = {};
        let nextCollected = new Set<string>();
        try {
          const res = await fetch("/api/monuments", { credentials: "include" });
          if (res.ok) {
            const data = await res.json() as { activeSkins?: Record<string, string>; collected?: string[] };
            if (data.activeSkins) nextSkins = data.activeSkins;
            if (Array.isArray(data.collected)) nextCollected = new Set(data.collected);
          }
        } catch { /* ignore */ }

        const disposeEntry = (e: ModelEntry) => {
          overlayScene.remove(e.wrapper);
          e.wrapper.traverse((node) => {
            const mesh = node as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else if (mat && typeof (mat as THREE.Material).dispose === "function") (mat as THREE.Material).dispose();
          });
        };

        // Pick up skin changes on existing loaded monuments — dispose +
        // reload just those. Skin swap is intentional user action so a
        // brief pop is fine.
        const existingByMk = new Map(entries.map((e) => [e.mk, e]));
        for (const e of entries.slice()) {
          const wantSkin = nextSkins[e.mk];
          const currentInfo = (e.wrapper.userData as { skin?: string }).skin;
          if (wantSkin && wantSkin !== currentInfo) {
            disposeEntry(e);
            const idx = entries.indexOf(e);
            if (idx >= 0) entries.splice(idx, 1);
          }
        }

        // Add newly-collected monuments that we haven't loaded yet.
        // Skiplist still applies (oversized files stay off Capacitor).
        const isNativeNow = typeof window !== "undefined" && !!(window as unknown as {
          Capacitor?: { isNativePlatform?: () => boolean };
        }).Capacitor?.isNativePlatform?.();
        const OVERSIZED = new Set(["sensoji"]);
        for (const mk of nextCollected) {
          if (isNativeNow && OVERSIZED.has(mk)) continue;
          if (existingByMk.has(mk)) continue;
          const latlon = MONUMENT_LATLON[mk as keyof typeof MONUMENT_LATLON];
          if (!latlon) continue;
          const file = MONUMENT_FILE_PREFIX[mk] ?? mk;
          const skin = nextSkins[mk];
          const skinUrl = skin && skin !== "default" ? `/models/mapbox/${file}_${skin}.glb` : null;
          const defaultUrl = `/models/mapbox/${file}.glb`;
          const wrapper = new THREE.Object3D();
          wrapper.visible = false;
          overlayScene.add(wrapper);
          const priority = skin && RARE_SKINS.has(skin) ? 3 : 2;
          const entry: ModelEntry = { mk, latlon, wrapper, loaded: false, priority };
          entries.push(entry);
          const applyGltf = (gltf: { scene: THREE.Object3D }, appliedSkin: string) => {
            const obj = gltf.scene;
            const bbox = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3(); bbox.getSize(size);
            const center = new THREE.Vector3(); bbox.getCenter(center);
            obj.position.sub(center);
            obj.position.y += size.y / 2;
            const baseDim = Math.max(size.x, size.z) || 1;
            obj.scale.setScalar(63 / baseDim);
            wrapper.add(obj);
            (wrapper as THREE.Object3D & { userData: { mk?: string; skin?: string } }).userData.mk = mk;
            (wrapper as THREE.Object3D & { userData: { skin?: string } }).userData.skin = appliedSkin;
            entry.loaded = true;
            entry.spawnAt = performance.now(); // trigger scale-in bounce
            diag.loaded++;
            reportDiag();
            map.triggerRepaint();
          };
          loadInFlight = true;
          try {
            const gltf = await loader.loadAsync(skinUrl ?? defaultUrl);
            applyGltf(gltf as { scene: THREE.Object3D }, skin ?? "default");
          } catch {
            // Skin variant 404 — many monuments don't have rare-skin GLBs
            // shipped yet (e.g. tokyo_skytree_celestial). Fall back to the
            // default tier GLB so the monument still renders. The rare skin
            // just doesn't visualize until the variant asset lands.
            if (skinUrl) {
              try {
                const gltf = await loader.loadAsync(defaultUrl);
                applyGltf(gltf as { scene: THREE.Object3D }, "default");
              } catch {
                diag.errors++;
                reportDiag();
              }
            } else {
              diag.errors++;
              reportDiag();
            }
          } finally {
            loadInFlight = false;
          }
          if (isNativeNow) {
            await new Promise<void>((r) => setTimeout(r, 120));
          }
        }
      };

      // Defer monument loading until the map is fully idle AND after a
      // 1s stabilization buffer. Prior behavior: loadAllMonuments started
      // immediately after style.load, keeping the main thread busy for
      // ~40s while the user might tap/spin — which combined with any
      // interaction (fly + shop mount + backdrop blur) tripped the
      // WebKit watchdog and killed the WebView.
      //
      // Now we wait for map.on('idle') (paint complete + no pending
      // tiles) THEN 1s extra breathing room, so the app is stable
      // before we start heavy work. Also, when a pause signal fires
      // (MonumentShop opens, user taps a monument), the load loop
      // yields until resume — no piling work during interactions.
      const startLoad = () => {
        setTimeout(() => { loadAllMonuments(); }, 1000);
      };
      if (map.loaded()) startLoad();
      else map.once("idle", startLoad);

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
          // Threshold was 0.05 (= 87° from camera-facing point) which let
          // borderline back-hemisphere monuments through. Their map.project()
          // returns screen coords *outside* the visible globe disc but still
          // inside the canvas, so the bounds check below passes and they
          // render as ghosts floating in space below the globe. 0.2 (= 78°)
          // hides them while keeping every monument that's actually visible
          // on the disc rim.
          if (dot < 0.2) { e.wrapper.visible = false; continue; }

          const pt = map.project([e.latlon.lon, e.latlon.lat]);
          if (pt.x < -100 || pt.x > w + 100 || pt.y < -100 || pt.y > h + 100) {
            e.wrapper.visible = false; continue;
          }
          e.wrapper.visible = true;
          // Defensive re-enable: if the clustering pass left this
          // tap zone at pointer-events:none in a prior frame AND we're
          // now visible + not currently clustered (that path is
          // handled below), guarantee it's clickable. Belt-and-
          // suspenders against the "monuments unresponsive" bug.
          if (e.tapEl && e.tapEl.style.pointerEvents === "none") {
            e.tapEl.style.pointerEvents = "auto";
          }
          // Y-up camera → flip CSS y to Three y.
          e.wrapper.position.set(pt.x, h - pt.y, 0);
          // Eagle-view tilt: every visible monument leans 52° toward the
          // camera so we see its TOP face (not the side). Base stays
          // anchored at the lat/lon point (= "bottom of coin connected to
          // centre of globe"); top tilts forward. Same tilt for every
          // monument so spinning the globe doesn't visually rotate them
          // (user feedback: "monuments are spinning as I spin the globe").
          e.wrapper.rotation.set(0.9, 0, 0);
          // Scale-in bounce for a monument that was JUST added via the
          // incremental refresh (unlock flow). 700ms total:
          //   0 → 350ms: cubic ease-out to 1.15 (overshoot)
          //   350 → 700ms: relax back to 1.0
          // Applied as a wrapper.scale multiplier so it composes with
          // the base 63/baseDim scale set at load time.
          if (e.spawnAt) {
            const dt = performance.now() - e.spawnAt;
            const DUR = 700;
            if (dt >= DUR) {
              e.wrapper.scale.set(1, 1, 1);
              e.spawnAt = undefined;
            } else if (dt < 350) {
              const t = dt / 350;
              const s = 1.15 * (1 - Math.pow(1 - t, 3));
              e.wrapper.scale.set(s, s, s);
            } else {
              const t = (dt - 350) / 350;
              const s = 1.15 - 0.15 * t;
              e.wrapper.scale.set(s, s, s);
            }
          }
        }
        // ─── Clustering (Mapbox-style + Snap Map cover icon) ─────────
        // At low zoom, overlapping monuments collapse into groups. The
        // "cover" (highest priority) monument stays visible; the others
        // are hidden. A +N badge sits on the cover to signal density.
        // Tapping any monument flies to zoom 5.5 (existing tap handler)
        // which is past CLUSTER_ZOOM_THRESHOLD, so the cluster dissolves.
        const CLUSTER_ZOOM_THRESHOLD = 4.0;
        const CLUSTER_RADIUS_PX = 90;
        const currentZoom = map.getZoom();
        const visible = entries.filter((e) => e.loaded && e.wrapper.visible);
        const clusterInfo = new Map<string, number>(); // cover mk → hidden count
        if (currentZoom < CLUSTER_ZOOM_THRESHOLD && visible.length > 1) {
          // Assign each visible monument to a cluster by scanning in
          // priority-desc order (rarest first becomes the seed). Any
          // later monument within CLUSTER_RADIUS_PX joins the nearest
          // existing cover. Greedy but stable per frame — good enough
          // at globe scale.
          const sorted = visible.slice().sort((a, b) => b.priority - a.priority);
          // Stable sort: priority DESC, then mk lexicographic so ties
          // resolve identically frame-to-frame. Without this, spin was
          // reshuffling which monument became the cover on each frame,
          // causing visible "reset" as the cover swapped mid-motion.
          sorted.sort((a, b) => b.priority - a.priority || a.mk.localeCompare(b.mk));
          const covers: typeof sorted = [];
          const memberCounts = new Map<string, number>();
          for (const e of sorted) {
            let joined = false;
            for (const cov of covers) {
              const dx = e.wrapper.position.x - cov.wrapper.position.x;
              const dy = e.wrapper.position.y - cov.wrapper.position.y;
              if (Math.hypot(dx, dy) < CLUSTER_RADIUS_PX) {
                if (e !== cov) e.wrapper.visible = false;
                memberCounts.set(cov.mk, (memberCounts.get(cov.mk) ?? 1) + 1);
                joined = true;
                break;
              }
            }
            if (!joined) { covers.push(e); memberCounts.set(e.mk, 1); }
          }
          for (const [mk, total] of memberCounts) {
            if (total > 1) clusterInfo.set(mk, total - 1);
          }
          // Tap-target routing: only cluster covers keep their tap zone.
          // Non-covers (hidden members) get pointer-events:none so a tap
          // on the visible cover always routes to the cover's shop, not
          // to a co-located hidden member. Every visible entry is a cover.
          // At high zoom (no clustering) every entry falls through the
          // else branch below and gets its tap zone re-enabled.
          const coverMks = new Set(covers.map((c) => c.mk));
          for (const e of entries) {
            if (!e.tapEl) continue;
            e.tapEl.style.pointerEvents = coverMks.has(e.mk) ? "auto" : "none";
          }
        } else {
          // Non-clustering path: everyone gets their tap zone back.
          for (const e of entries) {
            if (e.tapEl) e.tapEl.style.pointerEvents = "auto";
          }
        }
        // ─── Badge pool sync (no node churn) ─────────────────────────
        // Update at most BADGE_POOL_SIZE badges from the pool: for each
        // cluster, grab the next pool badge, set text + transform, and
        // make it visible. All unused badges are hidden. No DOM adds/
        // removes happen per frame — everything is a transform + text
        // update, which the compositor handles without layout thrash.
        let poolIdx = 0;
        for (const [mk, hidden] of clusterInfo) {
          if (poolIdx >= badgePool.length) break;
          const cov = entries.find((e) => e.mk === mk);
          if (!cov) continue;
          const el = badgePool[poolIdx++];
          const x = cov.wrapper.position.x + 22;
          const y = (h - cov.wrapper.position.y) - 32; // Three Y → CSS Y
          el.style.transform = `translate(${x}px, ${y}px)`;
          el.textContent = String(hidden + 1); // total incl cover
          el.style.display = "flex";
        }
        for (let i = poolIdx; i < badgePool.length; i++) {
          badgePool[i].style.display = "none";
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

      // ─── Visibility gate ────────────────────────────────────────────
      // When the tab is hidden (app backgrounded via Home button, task
      // switcher, or notification pull-down), iOS still ticks the rAF for
      // a short grace period before throttling — and our render loop keeps
      // burning WebGL memory the whole time. Explicit pause on hide + resume
      // on show is the single biggest fix for the "refreshes every minute"
      // symptom: without it, a user who backgrounds the app for a bit comes
      // back to a Jetsam-killed WebView.
      const onVisibility = () => {
        if (document.hidden) onPause();
        else onResume();
      };
      document.addEventListener("visibilitychange", onVisibility);

      // ─── Idle timeout (Capacitor only) ─────────────────────────────
      // After 6s of no user interaction with the globe, pause the render
      // loop. Nothing visible changes during idle (auto-spin sacrificed —
      // acceptable trade for a stable session). Any pointer/touch resumes
      // instantly. Web keeps its previous 60fps behavior.
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const IDLE_MS = 6000;
      const kickIdle = () => {
        if (!IS_NATIVE_WV) return;
        if (idleTimer) clearTimeout(idleTimer);
        // Resume immediately (in case we were idle-paused) — user is here.
        if (paused) onResume();
        idleTimer = setTimeout(onPause, IDLE_MS);
      };
      const idleEvents: (keyof WindowEventMap)[] = ["pointerdown", "touchstart", "wheel", "keydown"];
      for (const ev of idleEvents) window.addEventListener(ev, kickIdle, { passive: true });
      kickIdle(); // arm the first timer

      // Auto-pause the Three.js overlay when the map zooms past 5. At
      // that point every monument sprite is either off-screen or scaled
      // absurdly large; keeping the WebGL scene rendering just consumes
      // GPU budget that the Mapbox tile compositor needs. Combined with
      // the maxZoom:8 cap this keeps iOS Jetsam from ever escalating to
      // a WebView respawn.
      const ZOOM_AUTOPAUSE = 5;
      const onZoomEnd = () => {
        const z = map.getZoom();
        if (z >= ZOOM_AUTOPAUSE && !paused) onPause();
        else if (z < ZOOM_AUTOPAUSE && paused) onResume();
      };
      map.on("zoomend", onZoomEnd);
      // Store on the map for cleanup in the useEffect return below.
      (map as unknown as { __geknee_rafId?: number; __geknee_pauseHandlers?: () => void }).__geknee_rafId = rafId;
      (map as unknown as { __geknee_pauseHandlers?: () => void }).__geknee_pauseHandlers = () => {
        window.removeEventListener("geknee:globe-pause", onPause);
        window.removeEventListener("geknee:globe-resume", onResume);
        document.removeEventListener("visibilitychange", onVisibility);
        for (const ev of idleEvents) window.removeEventListener(ev, kickIdle);
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        map.off("zoomend", onZoomEnd);
      };
      diag.added = true;
      reportDiag();
      markMountPhase("capacitor-globe:mount-complete");

      // Tap targets — invisible HTML markers over each monument for click
      // handling. Raycasting onto a custom layer is doable but slow on
      // WKWebView; a transparent <div> overlay is dirt cheap and gives a
      // comfortable tap zone for finger touch on small sprites.
      //
      // Geometry: the Three.js sprite is anchored at the lat/lon GROUND
      // point and extends UPWARD (~40-50px visible after the 52° forward
      // tilt). The previous 90x90 / anchor:'center' marker centred its
      // tap zone on the ground point, so the visible top half of the
      // sprite fell OUTSIDE the tap zone — users tapping the floating
      // 3D shape were missing the box. Fix: anchor 'bottom' so the
      // element sits above the ground point (matches where the sprite
      // is rendered), and bump to 120x120 for finger tolerance.
      for (const [mk, { lat, lon }] of Object.entries(MONUMENT_LATLON)) {
        const el = document.createElement("div");
        el.setAttribute("aria-label", mk);
        el.dataset.mk = mk;
        // 140x140 (was 120): 20% larger fingertip zone — mobile
        // usability research suggests 44-48pt minimum, 140 covers a
        // Fitts-comfortable tap area even at the globe's edge.
        // touch-action:manipulation disables the WKWebView 300ms
        // click-delay AND scroll-recognition on this element.
        el.style.cssText = [
          "width:140px", "height:140px", "background:transparent",
          "cursor:pointer", "pointer-events:auto",
          "touch-action:manipulation",
          "transition:transform 120ms ease",
        ].join(";") + ";";
        // Explicit pressed-state visual: brief scale-down on press so
        // the user gets an INSTANT "tap registered" cue even before
        // any camera or shop movement. Was: nothing visible until
        // camera moved (took 1-2 frames).
        const showPressed = () => { el.style.transform = "scale(0.92)"; };
        const clearPressed = () => { el.style.transform = "scale(1)"; };
        el.addEventListener("pointerdown", showPressed, { passive: true });
        el.addEventListener("pointerup", clearPressed, { passive: true });
        el.addEventListener("pointercancel", clearPressed, { passive: true });
        el.addEventListener("pointerleave", clearPressed, { passive: true });

        const handleTap = (mkFired: string) => {
          // Instant response path — no awaits, no waits. Every side
          // effect that runs here MUST be either synchronous or
          // fire-and-forget. The drain-then-shop pattern from earlier
          // revisions made every tap feel dead for up to 1.5s while it
          // waited on GLB parse to finish; instant jumpTo + immediate
          // shop mount is the correct trade — the crash risk is
          // mitigated by the load-loop's own pause + jumpTo replacing
          // flyTo's rolling GL work (native path).
          const IS_NATIVE = typeof window !== "undefined" && !!(window as unknown as {
            Capacitor?: { isNativePlatform?: () => boolean };
          }).Capacitor?.isNativePlatform?.();
          window.dispatchEvent(new Event("geknee:globe-pause"));
          const paddingBottom = Math.round(window.innerHeight * 0.5);
          if (IS_NATIVE) {
            map.jumpTo({
              center: [lon, lat],
              zoom: 4.0,
              padding: { top: 0, bottom: paddingBottom, left: 0, right: 0 },
            });
          } else {
            map.flyTo({
              center: [lon, lat],
              zoom: 4.0,
              duration: 900,
              essential: true,
              padding: { top: 0, bottom: paddingBottom, left: 0, right: 0 },
            });
          }
          window.dispatchEvent(new CustomEvent("geknee:monument-select", { detail: { mk: mkFired } }));
          window.dispatchEvent(new CustomEvent("geknee:open-monument-shop", { detail: { mk: mkFired } }));
        };
        // Fire on pointerup (fastest reliable "tap complete" signal on
        // WKWebView) with a click fallback for keyboard/AT users.
        let tapArmed = false;
        el.addEventListener("pointerdown", () => { tapArmed = true; }, { passive: true });
        el.addEventListener("pointerup", (e) => {
          clearPressed();
          if (!tapArmed) return;
          tapArmed = false;
          e.preventDefault();
          e.stopPropagation();
          handleTap(mk);
        });
        el.addEventListener("pointercancel", () => { tapArmed = false; clearPressed(); }, { passive: true });
        el.addEventListener("click", (e) => {
          // Skip if pointerup already handled — but pointerup only fires
          // on pointer-aware browsers; keyboard Enter/Space fire click.
          if (!tapArmed) {
            const isKeyboardish = e.detail === 0; // synthesized keyboard click
            if (!isKeyboardish) return;
          }
          tapArmed = false;
          handleTap(mk);
        });
        new mapboxgl.Marker({
          element: el,
          anchor: "bottom",
          rotationAlignment: "viewport",
          pitchAlignment: "viewport",
        })
          .setLngLat([lon, lat])
          .addTo(map);
        // Stash the marker element on the eventual entry (created by
        // loadAllMonuments) so the clustering pass in updatePositions
        // can toggle pointer-events per-frame — non-cover members lose
        // their tap zone so a tap on a visible cover always routes to
        // the cover's shop, not to a hidden cluster member's marker.
        const found = entries.find((e) => e.mk === mk);
        if (found) found.tapEl = el;
        else {
          // Entry not yet created (still loading). Defer via short poll.
          const attach = () => {
            const later = entries.find((e) => e.mk === mk);
            if (later) later.tapEl = el;
            else setTimeout(attach, 500);
          };
          setTimeout(attach, 500);
        }
      }
    });

    return () => {
      window.removeEventListener("geknee:globe-initialize", onInitialize);
      window.removeEventListener("geknee:globe-fly-to", onFlyTo);
      window.removeEventListener("geknee:globe-padding-set", onPaddingSet);
      window.removeEventListener("geknee:monuments-updated", onMonumentsUpdated);
      const rafId = (map as unknown as { __geknee_rafId?: number }).__geknee_rafId;
      if (rafId) cancelAnimationFrame(rafId);
      const detachPause = (map as unknown as { __geknee_pauseHandlers?: () => void }).__geknee_pauseHandlers;
      if (detachPause) detachPause();
      // Tear down the Three.js overlay we appended into the Mapbox
      // container. Mapbox's own remove() only clears children it owns,
      // so without this the overlay canvas + WebGL context leak on
      // every effect re-run (auth flip etc.).
      const detachOverlay = (map as unknown as { __geknee_detachOverlay?: () => void }).__geknee_detachOverlay;
      if (detachOverlay) detachOverlay();
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
          display: "none",
        }}
      />
    </>
  );
}
