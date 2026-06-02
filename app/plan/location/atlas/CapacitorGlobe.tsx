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
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MONUMENT_LATLON } from "../globe/skins";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function CapacitorGlobe() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

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
      center: [0, 20],
      zoom: 1.2,
      // No interaction throttling — Mapbox handles touch on iOS natively.
      pitchWithRotate: true,
      // Faster mount on iOS: don't compute initial fog/atmosphere until
      // after the first frame paints. Reduces cold-load CPU spike.
      fadeDuration: 0,
    });

    mapRef.current = map;

    map.on("style.load", () => {
      // Atmosphere settings — Mapbox's native rendering, free.
      map.setFog({
        color: "rgb(186, 210, 235)",
        "high-color": "rgb(36, 92, 223)",
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)",
        "star-intensity": 0.6,
      });

      // Monuments with pre-rendered Meshy GLB sprites in public/monument-snaps/.
      // Re-run bin/snap-monuments.mjs to add more. Sprites are 1200x1600 PNG
      // with transparent background — displayed at 56x75 on the globe.
      const SPRITED = new Set([
        "bigBen", "christRedeem", "colosseum", "eiffelTower", "greatWall",
        "sagradaFamilia", "statueLiberty", "sydneyOpera", "tajMahal",
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
        })
          .setLngLat([lon, lat])
          .addTo(map);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
  );
}
