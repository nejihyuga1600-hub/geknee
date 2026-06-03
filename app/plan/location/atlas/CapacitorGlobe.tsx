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
import { MONUMENT_LATLON } from "../globe/skins";

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

      // Monuments with pre-rendered Meshy GLB sprites in public/monument-snaps/.
      // All 31 wired monuments now have sprites — re-run bin/snap-monuments.mjs
      // after promoting a new monument's GLBs (it'll skip already-existing
      // sprites unless --force). Sprites are 600x800 PNG with transparent
      // background — displayed at 56x75 on the globe. Source: actual Meshy
      // GLB rendered by the /dev/monument-snap/[mk] page on the dev server.
      const SPRITED = new Set([
        "bigBen", "christRedeem", "colosseum", "eiffelTower", "greatWall",
        "sagradaFamilia", "statueLiberty", "sydneyOpera", "tajMahal",
        // Second wave (2026-06-03) — wired all 22 long-tail monuments so iOS
        // no longer falls back to the generic purple pin for anyone unlocked.
        "machuPicchu", "angkorWat", "pyramidGiza", "goldenGate", "acropolis",
        "neuschwanstein", "stonehenge", "iguazuFalls", "tokyoSkytree",
        "victoriaFalls", "mountFuji", "petra", "niagaraFalls", "chichenItza",
        "burjKhalifa", "hagiaSophia", "notreDameF", "forbiddenCity", "uluru",
        "mtRushmore", "easterIsland", "fushimiInari",
      ]);

      for (const [mk, { lat, lon }] of Object.entries(MONUMENT_LATLON)) {
        const el = document.createElement("div");
        el.setAttribute("aria-label", mk);
        el.style.cursor = "pointer";
        if (SPRITED.has(mk)) {
          // Pre-rendered Meshy 3D monument as a 2D sprite — reads as 3D,
          // costs as 2D. The actual GLB still loads in the monument card
          // on tap so the rarity-tier reveal is preserved.
          el.style.cssText += `
            width: 56px; height: 75px;
            background: url('/monument-snaps/${mk}.png') center/contain no-repeat;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.55));
          `;
        } else {
          // No sprite yet — branded pin. Run bin/snap-monuments.mjs to
          // upgrade this monument to a real 3D-render sprite.
          el.style.cssText += `
            width: 28px; height: 28px; border-radius: 50%;
            background: radial-gradient(circle at 35% 35%, #c4b5fd, #7c3aed);
            border: 2px solid #fff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.45), 0 0 0 3px rgba(167,139,250,0.25);
          `;
        }
        el.addEventListener("click", () => {
          window.dispatchEvent(
            new CustomEvent("geknee:monument-select", { detail: { mk } }),
          );
        });
        new mapboxgl.Marker({
          element: el,
          anchor: SPRITED.has(mk) ? "bottom" : "center",
          // Stay glued to the globe surface — tilt + rotate WITH the globe
          // as the user spins, instead of staying screen-upright. Mapbox
          // also auto-hides markers on the back side of the globe.
          rotationAlignment: "map",
          pitchAlignment: "map",
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
