"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sphere, Stars, Html, useGLTF, Text, useTexture, Sparkles } from "@react-three/drei";
// EffectComposer/Bloom from @react-three/postprocessing was removed —
// see comment near GlobeScene render. Re-add when guarded.
import { useEffect, useRef, useState, useMemo, Component, Suspense, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getCityInfo, getExtraCities, loadCityInfo, loadExtraCities, useExtraCitiesVersion } from "./globe/cityData";

// ─── Mobile performance detection ────────────────────────────────────────────
const isMobile = typeof window !== "undefined" && (
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768
);
import * as THREE from "three";
import { useRouter } from "next/navigation";
import { consumeGlobeTarget, consumeCameraZoom, flyToGlobe, zoomCamera, resetGlobeTilt, consumeResetTilt } from "@/lib/globeAnim";
import HomeAirportBanner from "@/app/components/HomeAirportBanner";
import { track } from "@/lib/analytics";
import { R, geo, geoPos, type SurfPos } from "./globe/geo";
import { INFO, type LmInfo } from "./globe/info";
import { L, LM_DENSITY } from "./globe/locations";
import { MONUMENT_LATLON, SKIN_RING_COLOR } from "./globe/skins";
import {
  Lm,
  LandmarkLabel,
  wikiSummary,
  useMonumentBridge,
  useCollectedMonumentSet,
  Mat,
  MatStone,
  MatMarble,
  MatMetal,
  MatPatina,
  MatGold,
  MatSand,
  MatGlass,
  Box,
  Cone,
  Cyl,
  Ball,
  GlbModel,
  BLOB_BASE,
  MODELS,
  _setLmNav,
  _setLmNavDirect,
  _setGlobeClick,
  _setCollectedMonuments,
  _setActiveSkins,
  _setOnGlobeReady,
  _triggerLmNav,
  _triggerLmNavDirect,
  _triggerGlobeClick,
  _triggerGlobeReady,
} from "./globe/landmark";
import AllLandmarks from "./globe/AllLandmarks";
import UnlockShareToast from "./UnlockShareToast";
// ─── GeoJSON types ────────────────────────────────────────────────────────────
type GeoFeature = {
  geometry: { type: string; coordinates: number[][][][] | number[][][] } | null;
  properties: Record<string, string>;
};
type GeoCollection = { features: GeoFeature[] };

// ─── Canvas sharpening (unsharp mask) ─────────────────────────────────────────
function sharpenCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, amount = 0.4) {
  const img = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(img.data);
  const d = img.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = src[i + c];
        const blur = (
          src[((y-1)*w + x)*4 + c] + src[((y+1)*w + x)*4 + c] +
          src[(y*w + x-1)*4 + c] + src[(y*w + x+1)*4 + c]
        ) * 0.25;
        d[i + c] = Math.min(255, Math.max(0, center + (center - blur) * amount));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ─── Canvas Earth texture ─────────────────────────────────────────────────────
function createEarthTexture(
  countriesGeo: GeoCollection | null,
  statesGeo: GeoCollection | null,
  terrainBitmap?: ImageBitmap | null,
  maxTexSize = 8192,
): THREE.CanvasTexture {
  const W = Math.min(maxTexSize, 8192), H = W / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  // miter joins + butt caps render crisper polygon corners than round.
  ctx.lineJoin = "miter";
  ctx.miterLimit = 4;
  ctx.lineCap  = "butt";

  // lon/lat → canvas pixel
  function px(lon: number, lat: number): [number, number] {
    return [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
  }

  if (terrainBitmap) {
    // ── NASA/USGS terrain: draw satellite imagery as the base layer ──────────
    ctx.drawImage(terrainBitmap, 0, 0, W, H);
    sharpenCanvas(ctx, W, H, 0.5);
    // Subtle polar darkening to match real Earth photography
    const polar = ctx.createLinearGradient(0, 0, 0, H);
    polar.addColorStop(0,    "rgba(0,10,40,0.28)");
    polar.addColorStop(0.13, "rgba(0,0,0,0)");
    polar.addColorStop(0.87, "rgba(0,0,0,0)");
    polar.addColorStop(1,    "rgba(0,10,40,0.28)");
    ctx.fillStyle = polar;
    ctx.fillRect(0, 0, W, H);
  } else {
    // ── Mario Galaxy cartoon ocean — vivid candy cyan-blue ───────────────────
    const sea = ctx.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0,    "#0048c8");   // polar deep blue
    sea.addColorStop(0.3,  "#0078f0");   // mid-latitude vivid
    sea.addColorStop(0.5,  "#10a8ff");   // equatorial bright cyan
    sea.addColorStop(0.7,  "#0078f0");
    sea.addColorStop(1,    "#0048c8");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Helper: fill one GeoJSON feature's geometry ───────────────────────────
  // Uses evenodd so polygon holes (e.g. lake-islands) render correctly.
  // Breaks the path at antimeridian crossings to avoid horizontal bands.
  function fillGeometry(geom: NonNullable<GeoFeature["geometry"]>) {
    const polygons: number[][][][] =
      geom.type === "Polygon"      ? [geom.coordinates as number[][][]] :
      geom.type === "MultiPolygon" ?  geom.coordinates as number[][][][] :
      [];

    for (const polygon of polygons) {
      ctx.beginPath();
      for (const ring of polygon) {
        let prevLon = (ring[0] as number[])[0];
        let started = false;
        for (const coord of ring as number[][]) {
          const [lon, lat] = coord;
          // At the antimeridian, close + fill the current segment, then restart
          if (started && Math.abs(lon - prevLon) > 180) {
            ctx.closePath();
            ctx.fill("evenodd");
            ctx.beginPath();
            started = false;
          }
          const [x, y] = px(lon, lat);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else          { ctx.lineTo(x, y); }
          prevLon = lon;
        }
        ctx.closePath();
      }
      ctx.fill("evenodd");
    }
  }

  // ── Helper: stroke borders for every feature in a GeoJSON collection ──────
  function drawBorders(
    data: GeoCollection | null,
    color: string,
    width: number,
    filter?: (f: GeoFeature) => boolean,
  ) {
    if (!data) return;
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;

    for (const feature of data.features) {
      if (filter && !filter(feature)) continue;
      const geom = feature.geometry;
      if (!geom) continue;

      const polygons: number[][][][] =
        geom.type === "Polygon"      ? [geom.coordinates as number[][][]] :
        geom.type === "MultiPolygon" ?  geom.coordinates as number[][][][] :
        [];

      for (const polygon of polygons) {
        for (const ring of polygon) {
          let prevLon = (ring[0] as number[])[0];
          ctx.beginPath();
          let started = false;
          for (const coord of ring as number[][]) {
            const [lon, lat] = coord;
            if (started && Math.abs(lon - prevLon) > 180) {
              ctx.stroke(); ctx.beginPath(); started = false;
            }
            const [x, y] = px(lon, lat);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else          { ctx.lineTo(x, y); }
            prevLon = lon;
          }
          ctx.stroke();
        }
      }
    }
  }

  // ── Land fills — only in fallback mode; satellite imagery has its own colours
  if (!terrainBitmap && countriesGeo) {
    // ── Mario Galaxy cartoon continent palette — vivid, supersaturated ────────
    const CONTINENT_COLOR: Record<string, string> = {
      "North America": "#58e020",  // vivid lime green
      "South America": "#18d848",  // vivid emerald
      "Europe":        "#80ec40",  // bright yellow-green
      "Africa":        "#d0c020",  // vivid golden savanna (default)
      "Asia":          "#50d828",  // vivid medium green
      "Oceania":       "#60e828",  // vivid lime
      "Antarctica":    "#f0f8ff",  // pure bright white ice
    };

    // Per-country cartoon overrides — bold, clearly distinct biome colours
    const COUNTRY_COLOR: Record<string, string> = {
      // ── Saharan North Africa — blazing golden sand ───────────────────────
      "MAR": "#ffc820", "DZA": "#ffb810", "TUN": "#ffbe18",
      "LBY": "#ffb010", "EGY": "#ffa808", "ESH": "#ffc020",
      "MRT": "#f8b010", "MLI": "#f4aa08", "NER": "#f0a808",
      "TCD": "#e8a010", "SDN": "#e09808",
      // ── Arabian peninsula — vivid warm amber ────────────────────────────
      "SAU": "#ffb820", "YEM": "#f0a010", "OMN": "#f8aa10",
      "ARE": "#ffc028", "KWT": "#ffc028", "QAT": "#ffb820",
      "BHR": "#ffb820", "JOR": "#f0a818", "IRQ": "#d89820",
      "IRN": "#b8a840", "AFG": "#c0a040", "PAK": "#c8a838",
      // ── Central & West African tropics — vivid jungle green ──────────────
      "COD": "#10d838", "COG": "#18d840", "GAB": "#18d840",
      "CMR": "#28dc48", "CAF": "#28dc48", "NGA": "#38e050",
      "GHA": "#40e058", "CIV": "#38e050", "SEN": "#48e058",
      "GIN": "#40e058", "SLE": "#40e058", "LBR": "#40e058",
      // ── Australia — blazing vivid orange-red outback ──────────────────────
      "AUS": "#ff5808",
      // ── Greenland & Iceland — vivid ice blue-white ───────────────────────
      "GRL": "#c8f0ff", "ISL": "#b8e8ff",
      // ── Russia — bright boreal green ────────────────────────────────────
      "RUS": "#40d858",
      // ── Canada — fresh forest green ──────────────────────────────────────
      "CAN": "#50e030",
      // ── USA — vivid mid green ─────────────────────────────────────────────
      "USA": "#68e838",
      // ── Brazil — vivid Amazon ─────────────────────────────────────────────
      "BRA": "#10e040",
      // ── China — bright green ──────────────────────────────────────────────
      "CHN": "#58d828",
      // ── India — warm green-gold ───────────────────────────────────────────
      "IND": "#90d828",
      // ── Scandinavia / Nordic — cool fresh green ───────────────────────────
      "NOR": "#70e840", "SWE": "#70e840", "FIN": "#68e038",
    };

    for (const feature of countriesGeo.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      const iso = (feature.properties.ISO_A3 ?? feature.properties.iso_a3 ?? "") as string;
      const continent =
        (feature.properties.CONTINENT ?? feature.properties.continent ?? "") as string;
      ctx.fillStyle = COUNTRY_COLOR[iso] ?? CONTINENT_COLOR[continent] ?? "#5a8c30";
      fillGeometry(geom);
    }
  } else if (!terrainBitmap) {
    // Fallback cartoon fills while GeoJSON loads — vivid Mario Galaxy palette
    function poly(pts: [number, number][], fill: string) {
      ctx.beginPath();
      ctx.moveTo(...px(pts[0][0], pts[0][1]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(...px(pts[i][0], pts[i][1]));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.fillStyle = "#f0f8ff";
    ctx.fillRect(0, px(0, -67)[1], W, H - px(0, -67)[1]); // Antarctica — bright white
    poly([[-168,71],[-140,72],[-110,70],[-85,70],[-75,63],[-62,63],[-60,47],[-66,44],[-70,41],[-74,40],[-75,35],[-80,25],[-85,10],[-78,8],[-75,8],[-84,10],[-88,16],[-90,21],[-97,22],[-105,22],[-110,24],[-117,32],[-122,37],[-124,49],[-135,58],[-152,59],[-165,54],[-168,63]], "#58e020"); // N America vivid lime
    poly([[-44,83],[-17,83],[-17,77],[-20,70],[-25,67],[-45,60],[-52,68],[-56,78],[-52,83]], "#c8f0ff"); // Greenland ice blue
    poly([[-80,9],[-75,11],[-60,12],[-50,5],[-35,5],[-34,-8],[-36,-15],[-39,-22],[-42,-23],[-45,-30],[-52,-34],[-65,-44],[-70,-55],[-74,-55],[-68,-52],[-63,-40],[-60,-30],[-58,-20],[-60,-5],[-70,-3],[-78,0]], "#18d848"); // S America vivid emerald
    poly([[-9,36],[5,36],[15,37],[28,41],[30,46],[27,57],[27,61],[22,65],[18,62],[5,58],[0,50],[-5,46]], "#80ec40"); // Europe bright
    poly([[5,58],[8,58],[15,66],[20,71],[28,71],[30,68],[26,63],[18,60],[10,57]], "#70e840"); // Scandinavia
    poly([[-17,15],[-17,22],[-14,29],[-2,36],[10,37],[25,37],[37,30],[40,22],[45,14],[51,12],[44,12],[41,3],[42,-2],[35,-5],[35,-11],[32,-25],[26,-34],[18,-35],[12,-28],[8,-5],[4,5],[-5,5],[-15,12]], "#d0c020"); // Africa golden
    poly([[44,-12],[50,-15],[51,-22],[46,-26],[44,-24],[44,-18]], "#40e058"); // Madagascar
    poly([[26,37],[36,37],[42,30],[37,22],[43,15],[50,12],[58,20],[60,22],[65,25],[68,24],[80,28],[88,22],[100,14],[104,10],[108,5],[120,22],[130,33],[140,40],[145,43],[148,48],[142,54],[140,58],[138,65],[130,70],[100,73],[80,74],[60,70],[55,65],[45,60],[38,65],[30,60],[27,57],[30,50],[26,46]], "#50d828"); // Asia
    poly([[68,23],[74,22],[80,28],[88,22],[88,14],[80,8],[77,8],[72,14]], "#90d828"); // India warm
    poly([[36,30],[37,22],[43,15],[50,12],[58,20],[58,27],[55,28],[50,30],[44,30],[38,30]], "#ffb820"); // Arabia vivid amber
    poly([[114,-22],[122,-22],[129,-14],[136,-12],[140,-16],[145,-18],[152,-26],[153,-28],[151,-35],[145,-38],[138,-35],[130,-32],[124,-34],[115,-35],[114,-32]], "#ff5808"); // Australia vivid orange
    poly([[174,-37],[178,-38],[178,-41],[175,-43],[173,-41],[173,-39]], "#60e828"); // NZ North
    poly([[166,-45],[172,-44],[172,-47],[168,-47],[166,-46]], "#60e828"); // NZ South
    poly([[-5,50],[2,51],[2,55],[-1,58],[-5,58],[-5,54],[-3,52]], "#80ec40"); // Great Britain
    poly([[-10,52],[-6,52],[-6,54],[-8,55],[-10,54]], "#80ec40"); // Ireland
    poly([[-24,63],[-13,63],[-13,66],[-18,68],[-24,65]], "#b8e8ff"); // Iceland
  }

  // Hairline borders. Pulled down again per user request — countries 2px
  // / states 1px on the 8K canvas. Alpha pushed near opaque white so the
  // thin stroke holds against the satellite imagery underneath.
  const bdrAlpha  = terrainBitmap ? 0.98 : 1.0;
  const bdrWidth  = terrainBitmap ? 2.0  : 2.5;
  const stateWdth = terrainBitmap ? 1.0  : 1.25;
  drawBorders(countriesGeo, `rgba(255,255,255,${bdrAlpha})`, bdrWidth);

  const STATE_FILTER = new Set(["USA", "CAN", "AUS", "BRA", "MEX", "RUS", "CHN", "IND", "ARG"]);
  drawBorders(statesGeo, `rgba(255,255,255,${terrainBitmap ? 0.85 : 0.9})`, stateWdth,
    f => STATE_FILTER.has(f.properties.adm0_a3));

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
function featureCentroid(f: GeoFeature): [number, number] | null {
  if (!f.geometry) return null;
  const polys: number[][][][] =
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates as number[][][]]
      : f.geometry.type === "MultiPolygon"
      ? f.geometry.coordinates as number[][][][]
      : [];
  if (!polys.length) return null;
  let best: number[][] = [];
  for (const poly of polys)
    if (poly[0] && poly[0].length > best.length) best = poly[0] as number[][];
  if (!best.length) return null;
  let lon = 0, lat = 0;
  for (const pt of best) { lon += pt[0]; lat += pt[1]; }
  return [lon / best.length, lat / best.length];
}

// geoPos imported from ./globe/geo
const STATE_COUNTRIES = new Set([
  "United States of America", "Canada", "Australia", "Brazil", "Russia",
  "China", "India", "Mexico", "Argentina", "Germany", "France", "Italy",
  "Spain", "South Africa", "Nigeria", "Indonesia", "Saudi Arabia",
  "United Kingdom", "Pakistan", "Japan", "Thailand", "Turkey",
]);


// Quaternion that makes a Three.js Text mesh lie flat on the sphere surface,
// face pointing outward (front-face culling hides labels on the globe's back side).
function computeOrientation(pos: [number, number, number]): THREE.Quaternion {
  const N = new THREE.Vector3(...pos).normalize();          // outward normal
  const UP = new THREE.Vector3(0, 1, 0);
  const dot = UP.dot(N);
  const T = UP.clone().sub(N.clone().multiplyScalar(dot));  // north tangent
  if (T.lengthSq() < 1e-6) T.set(1, 0, 0);               // pole fallback
  T.normalize();
  const R = new THREE.Vector3().crossVectors(T, N).normalize(); // east tangent
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(R, T, N)                 // right=R, up=T, forward=N
  );
}

// Countries with high average elevation whose labels need extra clearance above
// the displacement-map terrain (displacementScale=0.65, max lift ≈ 0.53 units).
const HIGH_ELEVATION_COUNTRIES = new Set([
  "Afghanistan", "Nepal", "Bhutan", "Tibet", "Bolivia", "Lesotho",
  "Kyrgyzstan", "Tajikistan", "Rwanda", "Burundi", "Ethiopia",
  "Peru", "Ecuador", "Colombia", "Switzerland", "Austria", "Norway",
  "Mongolia", "Iran", "Turkey", "Pakistan", "Georgia", "Armenia",
  "Azerbaijan", "Morocco", "Algeria", "Andorra", "Liechtenstein",
  "China", "India", "Mexico", "Chile", "Argentina",
]);

// Cache for geo (country/state) info cards
const _geoCardCache = new Map<string, { imgUrl: string | null; fact: string }>();

// Interactive country/state label that shows a Wikipedia info card on hover.
// Used for: countries without state subdivisions, and states without city labels.
function GeoInfoLabel({ name, pos, orientation, fontSize, kind, lat: latProp, lon: lonProp }: {
  name: string;
  pos: [number, number, number];
  orientation: THREE.Quaternion;
  fontSize: number;
  kind: "country" | "state";
  lat: number;
  lon: number;
}) {
  const [hovered, setHovered]           = useState(false);
  const [mobileActive, setMobileActive] = useState(false);
  const [imgUrl, setImgUrl]             = useState<string | null>(null);
  const [fact, setFact]                 = useState<string>("");
  const fetchedRef = useRef(false);

  // Dismiss when another geo card is activated on mobile
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>).detail.key;
      if (key !== `geo:${name}`) setMobileActive(false);
    };
    window.addEventListener("geknee:mobilegeo", handler);
    return () => window.removeEventListener("geknee:mobilegeo", handler);
  }, [name]);

  const showCard = mobileActive;

  useEffect(() => {
    if (!showCard || fetchedRef.current) return;
    if (_geoCardCache.has(name)) {
      const c = _geoCardCache.get(name)!;
      setImgUrl(c.imgUrl);
      if (c.fact) setFact(c.fact);
      fetchedRef.current = true;
      return;
    }
    fetchedRef.current = true;
    wikiSummary(name).then(({ img, extract, description }) => {
      const resolved = extract ? pickBestFact(extract) : (description || "");
      _geoCardCache.set(name, { imgUrl: img, fact: resolved });
      setImgUrl(img);
      if (resolved) setFact(resolved);
    }).catch(() => { _geoCardCache.set(name, { imgUrl: null, fact: "" }); });
  }, [showCard, name]);

  const handleClick = (e: any) => {
    e.stopPropagation();
    const key = `geo:${name}`;
    if (!mobileActive) {
      window.dispatchEvent(new CustomEvent("geknee:mobilegeo", { detail: { key } }));
    }
    setMobileActive(prev => !prev);
  };

  const cardWidth = kind === "country" ? "220px" : "200px";

  return (
    <group position={pos} quaternion={orientation}>
      <Text
        fontSize={fontSize}
        color={mobileActive ? "#ffe066" : "#ffffff"}
        outlineWidth={fontSize * 0.55}
        outlineColor="#000000"
        outlineOpacity={0.55}
        outlineBlur={fontSize * 0.85}
        anchorX="center"
        anchorY="middle"
        letterSpacing={kind === "country" ? 0.10 : 0.04}
        sdfGlyphSize={128}
        renderOrder={2}
        material-side={THREE.FrontSide}
        material-depthTest={false}
        material-depthWrite={false}
        material-toneMapped={false}
      >
        {name.toUpperCase()}
      </Text>

      {showCard && (
        <Html as="div" zIndexRange={[0, 0]} style={{ pointerEvents: "none", width: 0, height: 0 }}>
          {typeof document !== "undefined" && createPortal(
            <div style={{
              position: "fixed",
              top: "calc(64px + 1vh)",
              left: "calc(8px + 1vw)",
              // Always small relative to the viewport; never grows past 220px.
              width: "clamp(280px, 32vw, 440px)",
              zIndex: 200,
              pointerEvents: mobileActive ? "auto" : "none",
              background: "rgba(13,13,36,0.96)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(167,139,250,0.35)",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
              fontFamily: "var(--font-ui), Inter, system-ui, sans-serif",
              // Belt-and-suspenders: a fixed-position element shouldn't scale
              // with globe zoom, but if anything in the parent stack ever
              // applies a transform, this wrapper isolates from it.
              transform: "translateZ(0)",
            }}>
              {/* Close button — works for touch and cursor. 32×32 hit target
                  meets touch-friendly minimum and gives cursor users obvious
                  affordance. */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMobileActive(false); }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Close"
                style={{
                  position: "absolute", top: 8, right: 8,
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(15,15,35,0.85)",
                  border: "1px solid rgba(167,139,250,0.35)",
                  color: "rgba(199,210,254,0.9)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, lineHeight: 1, cursor: "pointer",
                  zIndex: 1, fontFamily: "inherit",
                  WebkitTapHighlightColor: "transparent",
                }}
              >×</button>
              {imgUrl && (
                <img src={imgUrl} alt="" style={{
                  display: "block", width: "100%", height: 168,
                  objectFit: "cover",
                  borderBottom: "1px solid rgba(167,139,250,0.25)",
                }} />
              )}
              <div style={{ padding: "16px 20px 20px" }}>
                <div style={{
                  fontSize: "clamp(22px, 2.1vw, 26px)", fontWeight: 600,
                  fontFamily: "var(--font-display, Georgia, serif)",
                  color: "#f2f2f8",
                  letterSpacing: "-0.01em",
                  marginBottom: 3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>{name}</div>
                {fact && (
                  <div style={{
                    fontSize: "clamp(18px, 1.7vw, 20px)",
                    color: "#a8a8c0", lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {fact}
                  </div>
                )}
                {mobileActive && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMobileActive(false);
                        window.dispatchEvent(new CustomEvent("geknee:opencitymap", {
                          detail: { name, lat: latProp, lon: lonProp },
                        }));
                      }}
                      style={{
                        padding: "8px 0", borderRadius: 10,
                        background: "rgba(167,139,250,0.14)",
                        border: "1px solid rgba(167,139,250,0.35)",
                        color: "#c7d2fe",
                        fontSize: "clamp(18px, 1.7vw, 20px)",
                        fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      Open map
                    </button>
                    <a
                      href={`/plan?location=${encodeURIComponent(name)}`}
                      style={{
                        display: "block",
                        padding: "8px 0", borderRadius: 10,
                        background: "linear-gradient(135deg,#a78bfa,#7dd3fc)",
                        color: "#0a0a1f",
                        fontSize: "clamp(18px, 1.7vw, 20px)",
                        fontWeight: 700,
                        textAlign: "center", textDecoration: "none",
                      }}
                    >
                      Plan trip →
                    </a>
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )}
        </Html>
      )}

      <sprite
        scale={[kind === "country" ? 1.8 : 0.9, kind === "country" ? 0.28 : 0.18, 1]}
        renderOrder={2}
        onClick={handleClick}
        onPointerOver={(e: any) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={(e: any) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
      >
        <spriteMaterial transparent opacity={0} depthTest={false} />
      </sprite>
    </group>
  );
}

// --- Country + State labels ----------------------------------------------------
function GeoLabels({ countries, states, zoomLevel }: {
  countries:  GeoCollection | null;
  states:     GeoCollection | null;
  zoomLevel:  number;
}) {
  const items = useMemo(() => {
    const result: Array<{
      key: string; name: string; pos: [number, number, number];
      lat: number; lon: number;
      kind: "country" | "state"; orientation: THREE.Quaternion;
      isInfoLabel: boolean;
    }> = [];

    if (countries) {
      for (const f of countries.features) {
        const name = (f.properties?.NAME || f.properties?.ADMIN || f.properties?.name) as string | undefined;
        if (!name) continue;
        const c = featureCentroid(f);
        if (!c) continue;
        const labelR = R * (HIGH_ELEVATION_COUNTRIES.has(name) ? 1.075 : 1.019);
        const cPos = geoPos(c[1], c[0], labelR);
        // Countries without state subdivisions become interactive info labels
        const isInfoLabel = !STATE_COUNTRIES.has(name);
        result.push({ key: `c-${name}`, name, pos: cPos, lat: c[1], lon: c[0], kind: "country", orientation: computeOrientation(cPos), isInfoLabel });
      }
    }

    if (states) {
      for (const f of states.features) {
        const name  = (f.properties?.name  || f.properties?.NAME)  as string | undefined;
        const admin = (f.properties?.admin || f.properties?.adm0_name || "") as string;
        if (!name || !STATE_COUNTRIES.has(admin)) continue;
        const c = featureCentroid(f);
        if (!c) continue;
        const geom = f.geometry;
        if (!geom) continue;
        // Find the largest polygon ring (same logic as featureCentroid) so that
        // multi-polygon features like Northwest Territories aren't mis-measured
        // by a tiny island that happens to be first in the array.
        const allPolys: number[][][][] =
          geom.type === "Polygon"
            ? [geom.coordinates as number[][][]]
            : geom.type === "MultiPolygon"
            ? geom.coordinates as number[][][][]
            : [];
        let ring: number[][] = [];
        for (const poly of allPolys)
          if (poly[0] && poly[0].length > ring.length) ring = poly[0] as number[][];
        if (!ring.length) continue;
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const pt of ring) {
          if (pt[0] < minLon) minLon = pt[0]; if (pt[0] > maxLon) maxLon = pt[0];
          if (pt[1] < minLat) minLat = pt[1]; if (pt[1] > maxLat) maxLat = pt[1];
        }
        // No size minimum for North America — show every state/province/territory.
        const isNorthAmerica = admin === "United States of America" || admin === "Canada" || admin === "Mexico";
        if (!isNorthAmerica && Math.max(maxLon - minLon, maxLat - minLat) < 2.5) continue;
        const sPos = geoPos(c[1], c[0], R * 1.019);
        // States with no city label in their bounding box become interactive info labels
        const hasCity = CITIES.some(city => city.lat >= minLat && city.lat <= maxLat && city.lon >= minLon && city.lon <= maxLon);
        result.push({ key: `s-${admin}-${name}`, name, pos: sPos, lat: c[1], lon: c[0], kind: "state", orientation: computeOrientation(sPos), isInfoLabel: !hasCity });
      }
    }
    return result;
  }, [countries, states]);

  const visible = items.filter(it => {
    if (zoomLevel >= 2) return false;
    if (it.kind === "country") return true;
    return zoomLevel >= 1;
  });

  // Scale font size down for densely-packed labels: find each label's nearest
  // angular neighbour and shrink proportionally when below the threshold.
  const visibleWithSize = useMemo(() => {
    if (visible.length === 0) return [];
    const units = visible.map(it => new THREE.Vector3(...it.pos).normalize());
    return visible.map((it, i) => {
      let minDeg = 180;
      for (let j = 0; j < units.length; j++) {
        if (i === j) continue;
        const dot = Math.max(-1, Math.min(1, units[i].dot(units[j])));
        const deg = Math.acos(dot) * (180 / Math.PI);
        if (deg < minDeg) minDeg = deg;
      }
      const base = it.kind === "country" ? 0.22 : 0.13;
      const thr  = it.kind === "country" ? 18   : 12;
      // Bumped minimums so labels stay readable when the camera is close
      // and many neighbours crush the dynamic font size down.
      const min  = it.kind === "country" ? 0.11  : 0.08;
      const fontSize = minDeg >= thr ? base : Math.max(min, base * (minDeg / thr));
      return { ...it, fontSize };
    });
  }, [visible]);

  return (
    <>
      {visibleWithSize.map(({ key, name, pos, lat, lon, kind, orientation, fontSize, isInfoLabel }) => (
        isInfoLabel
          ? <GeoInfoLabel key={key} name={name} pos={pos} lat={lat} lon={lon} orientation={orientation} fontSize={fontSize} kind={kind} />
          : (
            <Text
              key={key}
              position={pos}
              quaternion={orientation}
              fontSize={fontSize}
              color="#ffffff"
              outlineWidth={fontSize * 0.55}
              outlineColor="#000000"
              outlineOpacity={0.55}
              outlineBlur={fontSize * 0.85}
              anchorX="center"
              anchorY="middle"
              letterSpacing={kind === "country" ? 0.10 : 0.04}
              sdfGlyphSize={128}
              renderOrder={2}
              material-side={THREE.FrontSide}
              material-depthTest={false}
              material-depthWrite={false}
              material-toneMapped={false}
            >
              {name.toUpperCase()}
            </Text>
          )
      ))}
    </>
  );
}

// --- Major world city labels (coords: WGS-84 decimal degrees) -----------------
const CITIES: { n: string; lat: number; lon: number }[] = [
  // ── United States ────────────────────────────────────────────────────────────
  { n: "New York",         lat:  40.71, lon:  -74.01 },
  { n: "Los Angeles",      lat:  34.05, lon: -118.24 },
  { n: "Chicago",          lat:  41.88, lon:  -87.63 },
  { n: "Houston",          lat:  29.76, lon:  -95.37 },
  { n: "Phoenix",          lat:  33.45, lon: -112.07 },
  { n: "Philadelphia",     lat:  39.95, lon:  -75.17 },
  { n: "San Antonio",      lat:  29.42, lon:  -98.49 },
  { n: "San Diego",        lat:  32.72, lon: -117.15 },
  { n: "Dallas",           lat:  32.78, lon:  -96.80 },
  { n: "Austin",           lat:  30.27, lon:  -97.74 },
  { n: "Jacksonville",     lat:  30.33, lon:  -81.66 },
  { n: "San Francisco",    lat:  37.77, lon: -122.42 },
  { n: "Seattle",          lat:  47.61, lon: -122.33 },
  { n: "Denver",           lat:  39.74, lon: -104.98 },
  { n: "Washington DC",    lat:  38.91, lon:  -77.04 },
  { n: "Nashville",        lat:  36.17, lon:  -86.78 },
  { n: "Oklahoma City",    lat:  35.47, lon:  -97.52 },
  { n: "Las Vegas",        lat:  36.17, lon: -115.14 },
  { n: "Portland",         lat:  45.52, lon: -122.68 },
  { n: "Memphis",          lat:  35.15, lon:  -90.05 },
  { n: "Louisville",       lat:  38.25, lon:  -85.76 },
  { n: "Baltimore",        lat:  39.29, lon:  -76.61 },
  { n: "Milwaukee",        lat:  43.04, lon:  -87.91 },
  { n: "Albuquerque",      lat:  35.08, lon: -106.65 },
  { n: "Tucson",           lat:  32.22, lon: -110.97 },
  { n: "Atlanta",          lat:  33.75, lon:  -84.39 },
  { n: "Kansas City",      lat:  39.10, lon:  -94.58 },
  { n: "Omaha",            lat:  41.26, lon:  -96.01 },
  { n: "Cleveland",        lat:  41.50, lon:  -81.69 },
  { n: "Raleigh",          lat:  35.78, lon:  -78.64 },
  { n: "Colorado Springs", lat:  38.83, lon: -104.82 },
  { n: "Miami",            lat:  25.77, lon:  -80.19 },
  { n: "Minneapolis",      lat:  44.98, lon:  -93.27 },
  { n: "New Orleans",      lat:  29.95, lon:  -90.07 },
  { n: "Detroit",          lat:  42.33, lon:  -83.05 },
  { n: "Charlotte",        lat:  35.23, lon:  -80.84 },
  { n: "St. Louis",        lat:  38.63, lon:  -90.20 },
  { n: "Pittsburgh",       lat:  40.44, lon:  -80.00 },
  { n: "Tampa",            lat:  27.95, lon:  -82.46 },
  { n: "Cincinnati",       lat:  39.10, lon:  -84.51 },
  { n: "Orlando",          lat:  28.54, lon:  -81.38 },
  { n: "Salt Lake City",   lat:  40.76, lon: -111.89 },
  { n: "Sacramento",       lat:  38.58, lon: -121.49 },
  { n: "Indianapolis",     lat:  39.77, lon:  -86.16 },
  { n: "Columbus",         lat:  39.96, lon:  -82.99 },
  { n: "Virginia Beach",   lat:  36.85, lon:  -76.29 },
  { n: "Fresno",           lat:  36.74, lon: -119.79 },
  { n: "Baton Rouge",      lat:  30.44, lon:  -91.13 },
  { n: "Tulsa",            lat:  36.15, lon:  -95.99 },
  { n: "Wichita",          lat:  37.69, lon:  -97.34 },
  { n: "Honolulu",         lat:  21.31, lon: -157.86 },
  { n: "Anchorage",        lat:  61.22, lon: -149.90 },
  { n: "El Paso",          lat:  31.76, lon: -106.49 },
  { n: "Fort Worth",       lat:  32.75, lon:  -97.33 },
  { n: "Corpus Christi",   lat:  27.80, lon:  -97.40 },
  { n: "Lexington",        lat:  38.04, lon:  -84.50 },
  { n: "Greensboro",       lat:  36.07, lon:  -79.79 },
  { n: "Plano",            lat:  33.02, lon:  -96.70 },
  { n: "Henderson",        lat:  36.04, lon: -114.98 },
  { n: "Newark",           lat:  40.74, lon:  -74.17 },
  { n: "St. Paul",         lat:  44.95, lon:  -93.09 },
  { n: "Chandler",         lat:  33.30, lon: -111.84 },
  { n: "Laredo",           lat:  27.50, lon:  -99.51 },
  { n: "Madison",          lat:  43.07, lon:  -89.40 },
  { n: "Durham",           lat:  35.99, lon:  -78.90 },
  { n: "Lubbock",          lat:  33.58, lon: -101.86 },
  { n: "Garland",          lat:  32.91, lon:  -96.64 },
  { n: "Glendale",         lat:  33.53, lon: -112.19 },
  { n: "Winston-Salem",    lat:  36.10, lon:  -80.24 },
  { n: "Scottsdale",       lat:  33.49, lon: -111.93 },
  { n: "Birmingham",       lat:  33.52, lon:  -86.80 },
  { n: "Montgomery",       lat:  32.36, lon:  -86.30 },
  { n: "Tuscaloosa",       lat:  33.21, lon:  -87.57 },
  { n: "Dothan",           lat:  31.22, lon:  -85.39 },
  { n: "Decatur",          lat:  34.61, lon:  -86.98 },
  { n: "Norfolk",          lat:  36.85, lon:  -76.29 },
  { n: "Spokane",          lat:  47.66, lon: -117.43 },
  { n: "Richmond",         lat:  37.54, lon:  -77.43 },
  { n: "Des Moines",       lat:  41.60, lon:  -93.61 },
  { n: "Boise",            lat:  43.62, lon: -116.20 },
  { n: "Fayetteville",     lat:  35.05, lon:  -78.88 },
  { n: "Tacoma",           lat:  47.25, lon: -122.44 },
  { n: "Oxnard",           lat:  34.20, lon: -119.18 },
  { n: "Knoxville",        lat:  35.96, lon:  -83.92 },
  { n: "Providence",       lat:  41.82, lon:  -71.42 },
  { n: "Akron",            lat:  41.08, lon:  -81.52 },
  { n: "Little Rock",      lat:  34.75, lon:  -92.29 },
  { n: "Huntsville",       lat:  34.73, lon:  -86.59 },
  { n: "Tempe",            lat:  33.42, lon: -111.94 },
  { n: "Augusta",          lat:  33.47, lon:  -82.00 },
  { n: "Grand Rapids",     lat:  42.96, lon:  -85.66 },
  { n: "Chattanooga",      lat:  35.05, lon:  -85.31 },
  { n: "Jackson",          lat:  32.30, lon:  -90.18 },
  { n: "Mobile",           lat:  30.69, lon:  -88.04 },
  { n: "Savannah",         lat:  32.08, lon:  -81.10 },
  { n: "Fort Lauderdale",  lat:  26.12, lon:  -80.14 },
  { n: "Cape Coral",       lat:  26.63, lon:  -81.95 },
  { n: "Sioux Falls",      lat:  43.55, lon:  -96.73 },
  { n: "Tallahassee",      lat:  30.44, lon:  -84.28 },
  { n: "Peoria",           lat:  40.69, lon:  -89.59 },
  { n: "Rockford",         lat:  42.27, lon:  -89.09 },
  { n: "Syracuse",         lat:  43.05, lon:  -76.15 },
  { n: "Shreveport",       lat:  32.53, lon:  -93.75 },
  { n: "Buffalo",          lat:  42.89, lon:  -78.87 },
  { n: "Reno",             lat:  39.53, lon: -119.81 },
  { n: "Hartford",         lat:  41.76, lon:  -72.68 },
  { n: "Missoula",         lat:  46.87, lon: -113.99 },
  { n: "Billings",         lat:  45.78, lon: -108.50 },
  { n: "Rapid City",       lat:  44.08, lon: -103.23 },
  { n: "Fargo",            lat:  46.88, lon:  -96.79 },
  { n: "Bismarck",         lat:  46.81, lon: -100.78 },
  { n: "Cheyenne",         lat:  41.14, lon: -104.82 },
  { n: "Arlington",        lat:  32.74, lon:  -97.11 },
  { n: "Amarillo",         lat:  35.22, lon: -101.83 },
  { n: "Brownsville",      lat:  25.90, lon:  -97.50 },
  { n: "McKinney",         lat:  33.20, lon:  -96.64 },
  { n: "Frisco",           lat:  33.15, lon:  -96.82 },
  { n: "Denton",           lat:  33.21, lon:  -97.13 },
  { n: "Waco",             lat:  31.55, lon:  -97.14 },
  { n: "Tyler",            lat:  32.35, lon:  -95.30 },
  { n: "Beaumont",         lat:  30.08, lon:  -94.13 },
  { n: "Killeen",          lat:  31.12, lon:  -97.73 },
  { n: "Midland",          lat:  31.99, lon: -102.08 },
  { n: "Abilene",          lat:  32.45, lon:  -99.73 },
  { n: "Wilmington",       lat:  34.23, lon:  -77.94 },
  { n: "Gainesville",      lat:  29.65, lon:  -82.32 },
  { n: "St. Petersburg",   lat:  27.77, lon:  -82.64 },
  { n: "Lakeland",         lat:  28.04, lon:  -81.95 },
  { n: "Pensacola",        lat:  30.42, lon:  -87.22 },
  { n: "Daytona Beach",    lat:  29.21, lon:  -81.02 },
  { n: "Fort Myers",       lat:  26.64, lon:  -81.87 },
  { n: "Hialeah",          lat:  25.86, lon:  -80.28 },
  { n: "Eugene",           lat:  44.05, lon: -123.09 },
  { n: "Salem",            lat:  44.94, lon: -123.04 },
  { n: "Bakersfield",      lat:  35.37, lon: -119.02 },
  { n: "Stockton",         lat:  37.97, lon: -121.29 },
  { n: "Long Beach",       lat:  33.77, lon: -118.19 },
  { n: "Riverside",        lat:  33.98, lon: -117.37 },
  { n: "San Bernardino",   lat:  34.11, lon: -117.29 },
  { n: "Irvine",           lat:  33.68, lon: -117.79 },
  { n: "Santa Ana",        lat:  33.75, lon: -117.87 },
  { n: "Anaheim",          lat:  33.84, lon: -117.91 },
  { n: "Aurora",           lat:  39.73, lon: -104.83 },
  { n: "Fort Collins",     lat:  40.59, lon: -105.08 },
  { n: "Boulder",          lat:  40.01, lon: -105.27 },
  { n: "Pueblo",           lat:  38.25, lon: -104.61 },
  { n: "Allentown",        lat:  40.60, lon:  -75.49 },
  { n: "Erie",             lat:  42.13, lon:  -80.08 },
  { n: "Lancaster",        lat:  40.04, lon:  -76.31 },
  { n: "Stamford",         lat:  41.05, lon:  -73.54 },
  { n: "New Haven",        lat:  41.31, lon:  -72.92 },
  { n: "Springfield",      lat:  42.10, lon:  -72.59 },
  { n: "Worcester",        lat:  42.26, lon:  -71.80 },
  { n: "Bridgeport",       lat:  41.18, lon:  -73.19 },
  { n: "Jersey City",      lat:  40.73, lon:  -74.07 },
  { n: "Yonkers",          lat:  40.93, lon:  -73.90 },
  { n: "Rochester",        lat:  43.16, lon:  -77.61 },
  { n: "Albany",           lat:  42.65, lon:  -73.76 },
  { n: "Trenton",          lat:  40.22, lon:  -74.76 },
  { n: "Wilmington DE",    lat:  39.74, lon:  -75.55 },
  { n: "Columbia SC",      lat:  34.00, lon:  -81.03 },
  { n: "Charleston SC",    lat:  32.78, lon:  -79.93 },
  { n: "Greenville SC",    lat:  34.85, lon:  -82.40 },
  { n: "Columbia MO",      lat:  38.95, lon:  -92.33 },
  { n: "Springfield MO",   lat:  37.21, lon:  -93.29 },
  { n: "Jefferson City",   lat:  38.57, lon:  -92.17 },
  { n: "Topeka",           lat:  39.05, lon:  -95.69 },
  { n: "Wichita Falls",    lat:  33.91, lon:  -98.49 },
  { n: "Lincoln",          lat:  40.81, lon:  -96.68 },
  { n: "Sioux City",       lat:  42.50, lon:  -96.40 },
  { n: "Davenport",        lat:  41.52, lon:  -90.58 },
  { n: "Cedar Rapids",     lat:  42.00, lon:  -91.64 },
  { n: "Green Bay",        lat:  44.52, lon:  -88.02 },
  { n: "Appleton",         lat:  44.26, lon:  -88.41 },
  { n: "Duluth",           lat:  46.79, lon:  -92.10 },
  { n: "Rochester MN",     lat:  44.02, lon:  -92.46 },
  { n: "Flint",            lat:  43.01, lon:  -83.69 },
  { n: "Lansing",          lat:  42.73, lon:  -84.56 },
  { n: "Ann Arbor",        lat:  42.28, lon:  -83.74 },
  { n: "Kalamazoo",        lat:  42.29, lon:  -85.59 },
  { n: "Fort Wayne",       lat:  41.08, lon:  -85.14 },
  { n: "Evansville",       lat:  37.97, lon:  -87.57 },
  { n: "South Bend",       lat:  41.68, lon:  -86.25 },
  { n: "Dayton",           lat:  39.76, lon:  -84.19 },
  { n: "Toledo",           lat:  41.66, lon:  -83.56 },
  { n: "Youngstown",       lat:  41.10, lon:  -80.65 },
  { n: "Lexington KY",     lat:  38.04, lon:  -84.50 },
  { n: "Bowling Green KY", lat:  36.99, lon:  -86.44 },
  { n: "Charleston WV",    lat:  38.35, lon:  -81.63 },
  { n: "Morgantown",       lat:  39.63, lon:  -79.96 },
  { n: "Concord NH",       lat:  43.21, lon:  -71.54 },
  { n: "Burlington VT",    lat:  44.48, lon:  -73.21 },
  { n: "Portland ME",      lat:  43.66, lon:  -70.26 },
  { n: "Fairbanks",        lat:  64.84, lon: -147.72 },
  { n: "Juneau",           lat:  58.30, lon: -134.42 },
  // ── Canada ───────────────────────────────────────────────────────────────────
  { n: "Toronto",          lat:  43.65, lon:  -79.38 },
  { n: "Montreal",         lat:  45.51, lon:  -73.55 },
  { n: "Vancouver",        lat:  49.25, lon: -123.12 },
  { n: "Calgary",          lat:  51.05, lon: -114.07 },
  { n: "Ottawa",           lat:  45.42, lon:  -75.70 },
  { n: "Edmonton",         lat:  53.55, lon: -113.47 },
  { n: "Winnipeg",         lat:  49.90, lon:  -97.14 },
  { n: "Quebec City",      lat:  46.81, lon:  -71.21 },
  { n: "Hamilton",         lat:  43.26, lon:  -79.87 },
  { n: "Halifax",          lat:  44.65, lon:  -63.58 },
  { n: "Saskatoon",        lat:  52.13, lon: -106.67 },
  { n: "Regina",           lat:  50.45, lon: -104.62 },
  { n: "Victoria",         lat:  48.43, lon: -123.37 },
  // ── Mexico & Central America ─────────────────────────────────────────────────
  { n: "Mexico City",      lat:  19.43, lon:  -99.13 },
  { n: "Guadalajara",      lat:  20.67, lon: -103.35 },
  { n: "Monterrey",        lat:  25.69, lon: -100.32 },
  { n: "Tijuana",          lat:  32.52, lon: -117.04 },
  { n: "Puebla",           lat:  19.04, lon:  -98.20 },
  { n: "Cancun",           lat:  21.16, lon:  -86.85 },
  { n: "Leon",             lat:  21.12, lon: -101.68 },
  { n: "Havana",           lat:  23.11, lon:  -82.37 },
  { n: "Santo Domingo",    lat:  18.48, lon:  -69.93 },
  { n: "San Juan",         lat:  18.47, lon:  -66.12 },
  { n: "Guatemala City",   lat:  14.64, lon:  -90.51 },
  { n: "San Jose",         lat:   9.93, lon:  -84.08 },
  { n: "Panama City",      lat:   8.99, lon:  -79.52 },
  { n: "Tegucigalpa",      lat:  14.07, lon:  -87.21 },
  { n: "Managua",          lat:  12.14, lon:  -86.28 },
  // ── South America ────────────────────────────────────────────────────────────
  { n: "Sao Paulo",        lat: -23.55, lon:  -46.63 },
  { n: "Rio de Janeiro",   lat: -22.91, lon:  -43.17 },
  { n: "Buenos Aires",     lat: -34.60, lon:  -58.38 },
  { n: "Bogota",           lat:   4.71, lon:  -74.07 },
  { n: "Lima",             lat: -12.05, lon:  -77.04 },
  { n: "Santiago",         lat: -33.45, lon:  -70.67 },
  { n: "Caracas",          lat:  10.48, lon:  -66.88 },
  { n: "Medellin",         lat:   6.25, lon:  -75.56 },
  { n: "Quito",            lat:  -0.22, lon:  -78.51 },
  { n: "Belo Horizonte",   lat: -19.92, lon:  -43.94 },
  { n: "Fortaleza",        lat:  -3.72, lon:  -38.54 },
  { n: "Recife",           lat:  -8.05, lon:  -34.90 },
  { n: "Manaus",           lat:  -3.10, lon:  -60.02 },
  { n: "Brasilia",         lat: -15.78, lon:  -47.93 },
  { n: "Salvador",         lat: -12.97, lon:  -38.51 },
  { n: "Montevideo",       lat: -34.90, lon:  -56.19 },
  { n: "Asuncion",         lat: -25.29, lon:  -57.65 },
  { n: "La Paz",           lat: -16.50, lon:  -68.15 },
  { n: "Guayaquil",        lat:  -2.19, lon:  -79.89 },
  { n: "Cali",             lat:   3.43, lon:  -76.52 },
  { n: "Curitiba",         lat: -25.43, lon:  -49.27 },
  { n: "Cartagena",        lat:  10.39, lon:  -75.48 },
  // ── Europe ───────────────────────────────────────────────────────────────────
  { n: "London",           lat:  51.51, lon:   -0.13 },
  { n: "Paris",            lat:  48.86, lon:    2.35 },
  { n: "Berlin",           lat:  52.52, lon:   13.40 },
  { n: "Madrid",           lat:  40.42, lon:   -3.70 },
  { n: "Rome",             lat:  41.90, lon:   12.50 },
  { n: "Barcelona",        lat:  41.39, lon:    2.16 },
  { n: "Amsterdam",        lat:  52.37, lon:    4.90 },
  { n: "Vienna",           lat:  48.21, lon:   16.37 },
  { n: "Stockholm",        lat:  59.33, lon:   18.07 },
  { n: "Warsaw",           lat:  52.23, lon:   21.01 },
  { n: "Brussels",         lat:  50.85, lon:    4.35 },
  { n: "Prague",           lat:  50.08, lon:   14.44 },
  { n: "Lisbon",           lat:  38.72, lon:   -9.14 },
  { n: "Budapest",         lat:  47.50, lon:   19.04 },
  { n: "Oslo",             lat:  59.91, lon:   10.75 },
  { n: "Copenhagen",       lat:  55.68, lon:   12.57 },
  { n: "Helsinki",         lat:  60.17, lon:   24.94 },
  { n: "Zurich",           lat:  47.38, lon:    8.54 },
  { n: "Milan",            lat:  45.47, lon:    9.19 },
  { n: "Munich",           lat:  48.14, lon:   11.58 },
  { n: "Athens",           lat:  37.97, lon:   23.73 },
  { n: "Bucharest",        lat:  44.43, lon:   26.10 },
  { n: "Hamburg",          lat:  53.55, lon:    9.99 },
  { n: "Kyiv",             lat:  50.45, lon:   30.52 },
  { n: "Minsk",            lat:  53.90, lon:   27.57 },
  { n: "Dublin",           lat:  53.33, lon:   -6.25 },
  { n: "Edinburgh",        lat:  55.95, lon:   -3.19 },
  { n: "Manchester",       lat:  53.48, lon:   -2.24 },
  { n: "Lyon",             lat:  45.75, lon:    4.85 },
  { n: "Marseille",        lat:  43.30, lon:    5.37 },
  { n: "Frankfurt",        lat:  50.11, lon:    8.68 },
  { n: "Cologne",          lat:  50.94, lon:    6.96 },
  { n: "Stuttgart",        lat:  48.78, lon:    9.18 },
  { n: "Dusseldorf",       lat:  51.23, lon:    6.79 },
  { n: "Naples",           lat:  40.85, lon:   14.27 },
  { n: "Turin",            lat:  45.07, lon:    7.69 },
  { n: "Florence",         lat:  43.77, lon:   11.25 },
  { n: "Venice",           lat:  45.44, lon:   12.33 },
  { n: "Seville",          lat:  37.39, lon:   -5.99 },
  { n: "Valencia",         lat:  39.47, lon:   -0.38 },
  { n: "Bilbao",           lat:  43.26, lon:   -2.93 },
  { n: "Porto",            lat:  41.16, lon:   -8.63 },
  { n: "Geneva",           lat:  46.20, lon:    6.14 },
  { n: "Krakow",           lat:  50.06, lon:   19.94 },
  { n: "Gdansk",           lat:  54.35, lon:   18.65 },
  { n: "Bratislava",       lat:  48.15, lon:   17.11 },
  { n: "Ljubljana",        lat:  46.05, lon:   14.51 },
  { n: "Zagreb",           lat:  45.81, lon:   15.98 },
  { n: "Sarajevo",         lat:  43.85, lon:   18.36 },
  { n: "Belgrade",         lat:  44.80, lon:   20.46 },
  { n: "Sofia",            lat:  42.70, lon:   23.32 },
  { n: "Riga",             lat:  56.95, lon:   24.11 },
  { n: "Tallinn",          lat:  59.44, lon:   24.75 },
  { n: "Vilnius",          lat:  54.69, lon:   25.28 },
  { n: "Reykjavik",        lat:  64.13, lon:  -21.82 },
  { n: "Nice",             lat:  43.71, lon:    7.26 },
  { n: "Palermo",          lat:  38.12, lon:   13.36 },
  { n: "Thessaloniki",     lat:  40.64, lon:   22.94 },
  // ── Russia & Central Asia ────────────────────────────────────────────────────
  { n: "Moscow",           lat:  55.75, lon:   37.62 },
  { n: "Saint Petersburg", lat:  59.94, lon:   30.32 },
  { n: "Novosibirsk",      lat:  54.99, lon:   82.90 },
  { n: "Yekaterinburg",    lat:  56.84, lon:   60.60 },
  { n: "Kazan",            lat:  55.80, lon:   49.13 },
  { n: "Vladivostok",      lat:  43.12, lon:  131.90 },
  { n: "Tashkent",         lat:  41.30, lon:   69.24 },
  { n: "Almaty",           lat:  43.24, lon:   76.95 },
  { n: "Baku",             lat:  40.41, lon:   49.87 },
  { n: "Tbilisi",          lat:  41.69, lon:   44.83 },
  { n: "Yerevan",          lat:  40.18, lon:   44.51 },
  { n: "Bishkek",          lat:  42.87, lon:   74.59 },
  { n: "Ashgabat",         lat:  37.95, lon:   58.38 },
  // ── Middle East ──────────────────────────────────────────────────────────────
  { n: "Istanbul",         lat:  41.01, lon:   28.96 },
  { n: "Tehran",           lat:  35.69, lon:   51.39 },
  { n: "Riyadh",           lat:  24.69, lon:   46.72 },
  { n: "Baghdad",          lat:  33.34, lon:   44.40 },
  { n: "Dubai",            lat:  25.20, lon:   55.27 },
  { n: "Abu Dhabi",        lat:  24.45, lon:   54.38 },
  { n: "Doha",             lat:  25.29, lon:   51.53 },
  { n: "Kuwait City",      lat:  29.37, lon:   47.98 },
  { n: "Muscat",           lat:  23.61, lon:   58.59 },
  { n: "Amman",            lat:  31.95, lon:   35.93 },
  { n: "Beirut",           lat:  33.89, lon:   35.50 },
  { n: "Tel Aviv",         lat:  32.09, lon:   34.79 },
  { n: "Jerusalem",        lat:  31.77, lon:   35.22 },
  { n: "Ankara",           lat:  39.92, lon:   32.85 },
  { n: "Izmir",            lat:  38.42, lon:   27.14 },
  { n: "Jeddah",           lat:  21.52, lon:   39.22 },
  { n: "Sanaa",            lat:  15.35, lon:   44.21 },
  // ── South Asia ───────────────────────────────────────────────────────────────
  { n: "Delhi",            lat:  28.61, lon:   77.23 },
  { n: "Mumbai",           lat:  19.08, lon:   72.88 },
  { n: "Karachi",          lat:  24.86, lon:   67.01 },
  { n: "Dhaka",            lat:  23.72, lon:   90.41 },
  { n: "Kolkata",          lat:  22.57, lon:   88.36 },
  { n: "Bangalore",        lat:  12.97, lon:   77.59 },
  { n: "Lahore",           lat:  31.55, lon:   74.35 },
  { n: "Chennai",          lat:  13.08, lon:   80.27 },
  { n: "Hyderabad",        lat:  17.38, lon:   78.49 },
  { n: "Ahmedabad",        lat:  23.03, lon:   72.59 },
  { n: "Pune",             lat:  18.52, lon:   73.86 },
  { n: "Colombo",          lat:   6.93, lon:   79.85 },
  { n: "Kathmandu",        lat:  27.72, lon:   85.32 },
  { n: "Islamabad",        lat:  33.72, lon:   73.06 },
  { n: "Kabul",            lat:  34.53, lon:   69.17 },
  { n: "Jaipur",           lat:  26.91, lon:   75.79 },
  { n: "Surat",            lat:  21.17, lon:   72.83 },
  { n: "Kochi",            lat:   9.94, lon:   76.26 },
  // ── East & Southeast Asia ────────────────────────────────────────────────────
  { n: "Tokyo",            lat:  35.68, lon:  139.69 },
  { n: "Shanghai",         lat:  31.23, lon:  121.47 },
  { n: "Beijing",          lat:  39.91, lon:  116.39 },
  { n: "Chongqing",        lat:  29.56, lon:  106.55 },
  { n: "Tianjin",          lat:  39.14, lon:  117.18 },
  { n: "Shenzhen",         lat:  22.54, lon:  114.06 },
  { n: "Wuhan",            lat:  30.59, lon:  114.31 },
  { n: "Guangzhou",        lat:  23.13, lon:  113.26 },
  { n: "Chengdu",          lat:  30.66, lon:  104.07 },
  { n: "Osaka",            lat:  34.69, lon:  135.50 },
  { n: "Seoul",            lat:  37.57, lon:  126.98 },
  { n: "Taipei",           lat:  25.05, lon:  121.53 },
  { n: "Bangkok",          lat:  13.75, lon:  100.52 },
  { n: "Ho Chi Minh City", lat:  10.82, lon:  106.63 },
  { n: "Hanoi",            lat:  21.03, lon:  105.85 },
  { n: "Jakarta",          lat:  -6.21, lon:  106.85 },
  { n: "Manila",           lat:  14.60, lon:  120.98 },
  { n: "Singapore",        lat:   1.35, lon:  103.82 },
  { n: "Kuala Lumpur",     lat:   3.14, lon:  101.69 },
  { n: "Yangon",           lat:  16.87, lon:   96.19 },
  { n: "Phnom Penh",       lat:  11.57, lon:  104.92 },
  { n: "Vientiane",        lat:  17.97, lon:  102.60 },
  { n: "Ulaanbaatar",      lat:  47.89, lon:  106.91 },
  { n: "Pyongyang",        lat:  39.02, lon:  125.75 },
  { n: "Nagoya",           lat:  35.18, lon:  136.90 },
  { n: "Sapporo",          lat:  43.06, lon:  141.35 },
  { n: "Fukuoka",          lat:  33.59, lon:  130.40 },
  { n: "Busan",            lat:  35.10, lon:  129.03 },
  { n: "Hong Kong",        lat:  22.32, lon:  114.17 },
  { n: "Macau",            lat:  22.19, lon:  113.55 },
  { n: "Xi'an",            lat:  34.27, lon:  108.95 },
  { n: "Nanjing",          lat:  32.06, lon:  118.80 },
  { n: "Hangzhou",         lat:  30.27, lon:  120.16 },
  { n: "Surabaya",         lat:  -7.25, lon:  112.75 },
  { n: "Bandung",          lat:  -6.92, lon:  107.61 },
  { n: "Medan",            lat:   3.58, lon:   98.66 },
  { n: "Cebu",             lat:  10.32, lon:  123.90 },
  { n: "Da Nang",          lat:  16.07, lon:  108.22 },
  { n: "Phuket",           lat:   7.89, lon:   98.40 },
  { n: "Chiang Mai",       lat:  18.79, lon:   98.99 },
  { n: "Bali",             lat:  -8.34, lon:  115.09 },
  // ── Africa ───────────────────────────────────────────────────────────────────
  { n: "Cairo",            lat:  30.06, lon:   31.25 },
  { n: "Lagos",            lat:   6.52, lon:    3.38 },
  { n: "Kinshasa",         lat:  -4.32, lon:   15.32 },
  { n: "Johannesburg",     lat: -26.20, lon:   28.04 },
  { n: "Cape Town",        lat: -33.93, lon:   18.42 },
  { n: "Nairobi",          lat:  -1.29, lon:   36.82 },
  { n: "Addis Ababa",      lat:   9.03, lon:   38.74 },
  { n: "Khartoum",         lat:  15.55, lon:   32.53 },
  { n: "Dar es Salaam",    lat:  -6.79, lon:   39.21 },
  { n: "Abidjan",          lat:   5.35, lon:   -4.00 },
  { n: "Accra",            lat:   5.56, lon:   -0.20 },
  { n: "Casablanca",       lat:  33.59, lon:   -7.62 },
  { n: "Luanda",           lat:  -8.84, lon:   13.23 },
  { n: "Kampala",          lat:   0.32, lon:   32.58 },
  { n: "Algiers",          lat:  36.74, lon:    3.06 },
  { n: "Tunis",            lat:  36.82, lon:   10.17 },
  { n: "Dakar",            lat:  14.72, lon:  -17.47 },
  { n: "Maputo",           lat: -25.97, lon:   32.59 },
  { n: "Kigali",           lat:  -1.94, lon:   30.06 },
  { n: "Lusaka",           lat: -15.42, lon:   28.29 },
  { n: "Harare",           lat: -17.83, lon:   31.05 },
  { n: "Antananarivo",     lat: -18.91, lon:   47.54 },
  { n: "Abuja",            lat:   9.07, lon:    7.40 },
  { n: "Douala",           lat:   4.05, lon:    9.70 },
  { n: "Conakry",          lat:   9.54, lon:  -13.68 },
  { n: "Bamako",           lat:  12.65, lon:   -8.00 },
  { n: "Ouagadougou",      lat:  12.36, lon:   -1.53 },
  { n: "Tripoli",          lat:  32.90, lon:   13.18 },
  { n: "Alexandria",       lat:  31.20, lon:   29.92 },
  { n: "Durban",           lat: -29.86, lon:   31.02 },
  { n: "Mombasa",          lat:  -4.05, lon:   39.67 },
  // ── Oceania ──────────────────────────────────────────────────────────────────
  { n: "Sydney",           lat: -33.87, lon:  151.21 },
  { n: "Melbourne",        lat: -37.81, lon:  144.96 },
  { n: "Brisbane",         lat: -27.47, lon:  153.03 },
  { n: "Perth",            lat: -31.95, lon:  115.86 },
  { n: "Adelaide",         lat: -34.93, lon:  138.60 },
  { n: "Auckland",         lat: -36.87, lon:  174.77 },
  { n: "Canberra",         lat: -35.28, lon:  149.13 },
  { n: "Gold Coast",       lat: -28.02, lon:  153.40 },
  { n: "Christchurch",     lat: -43.53, lon:  172.64 },
  { n: "Wellington",       lat: -41.29, lon:  174.78 },
  { n: "Suva",             lat: -18.14, lon:  178.44 },
  { n: "Port Moresby",     lat:  -9.44, lon:  147.18 },
  { n: "Noumea",           lat: -22.27, lon:  166.46 },
  { n: "Honiara",          lat:  -9.43, lon:  160.05 },
  { n: "Apia",             lat: -13.83, lon: -171.77 },
  { n: "Nuku'alofa",       lat: -21.14, lon: -175.22 },
  { n: "Papeete",          lat: -17.54, lon: -149.57 },
  // ── Caribbean & Atlantic ─────────────────────────────────────────────────────
  { n: "Kingston",         lat:  17.99, lon:  -76.79 },
  { n: "Port-au-Prince",   lat:  18.54, lon:  -72.34 },
  { n: "Nassau",           lat:  25.05, lon:  -77.35 },
  { n: "Bridgetown",       lat:  13.10, lon:  -59.62 },
  { n: "Port of Spain",    lat:  10.65, lon:  -61.52 },
  // ── Central Asia extras ──────────────────────────────────────────────────────
  { n: "Dushanbe",         lat:  38.56, lon:   68.77 },
  { n: "Nur-Sultan",       lat:  51.18, lon:   71.45 },
  { n: "Samarkand",        lat:  39.65, lon:   66.96 },
  // ── Additional Middle East ───────────────────────────────────────────────────
  { n: "Aden",             lat:  12.78, lon:   45.04 },
  { n: "Mosul",            lat:  36.34, lon:   43.13 },
  { n: "Aleppo",           lat:  36.20, lon:   37.16 },
  { n: "Damascus",         lat:  33.51, lon:   36.29 },
  // ── Additional Africa ────────────────────────────────────────────────────────
  { n: "Mogadishu",        lat:   2.05, lon:   45.34 },
  { n: "Kano",             lat:  12.00, lon:    8.52 },
  { n: "Ibadan",           lat:   7.39, lon:    3.90 },
  { n: "Kumasi",           lat:   6.69, lon:   -1.62 },
  { n: "Lome",             lat:   6.14, lon:    1.22 },
  { n: "Cotonou",          lat:   6.37, lon:    2.43 },
  { n: "Brazzaville",      lat:  -4.27, lon:   15.28 },
  { n: "Libreville",       lat:   0.39, lon:    9.45 },
  { n: "Malabo",           lat:   3.75, lon:    8.78 },
  { n: "N'Djamena",        lat:  12.10, lon:   15.04 },
  { n: "Niamey",           lat:  13.51, lon:    2.12 },
  { n: "Windhoek",         lat: -22.56, lon:   17.08 },
  { n: "Gaborone",         lat: -24.65, lon:   25.91 },
  { n: "Maseru",           lat: -29.32, lon:   27.48 },
  { n: "Mbabane",          lat: -26.32, lon:   31.13 },
  { n: "Lilongwe",         lat: -13.97, lon:   33.79 },
  { n: "Bujumbura",        lat:  -3.38, lon:   29.36 },
  { n: "Moroni",           lat: -11.70, lon:   43.26 },
  { n: "Djibouti",         lat:  11.59, lon:   43.15 },
  { n: "Asmara",           lat:  15.34, lon:   38.93 },
  // ── Additional Europe ────────────────────────────────────────────────────────
  { n: "Chisinau",         lat:  47.01, lon:   28.86 },
  { n: "Tirana",           lat:  41.33, lon:   19.82 },
  { n: "Pristina",         lat:  42.66, lon:   21.17 },
  { n: "Skopje",           lat:  42.00, lon:   21.43 },
  { n: "Podgorica",        lat:  42.44, lon:   19.26 },
  { n: "Andorra",          lat:  42.51, lon:    1.52 },
  { n: "Valletta",         lat:  35.90, lon:   14.51 },
  { n: "Nicosia",          lat:  35.17, lon:   33.36 },
  { n: "Luxembourg City",  lat:  49.61, lon:    6.13 },
  { n: "Vaduz",            lat:  47.14, lon:    9.52 },
  { n: "Bern",             lat:  46.95, lon:    7.44 },
  { n: "Basel",            lat:  47.56, lon:    7.59 },
  { n: "Antwerp",          lat:  51.22, lon:    4.40 },
  { n: "Ghent",            lat:  51.05, lon:    3.72 },
  { n: "Rotterdam",        lat:  51.93, lon:    4.48 },
  { n: "The Hague",        lat:  52.08, lon:    4.31 },
  { n: "Utrecht",          lat:  52.09, lon:    5.12 },
  { n: "Eindhoven",        lat:  51.44, lon:    5.48 },
  { n: "Leeds",            lat:  53.80, lon:   -1.55 },
  { n: "Glasgow",          lat:  55.86, lon:   -4.26 },
  { n: "Bristol",          lat:  51.45, lon:   -2.59 },
  { n: "Birmingham UK",    lat:  52.48, lon:   -1.90 },
  { n: "Liverpool",        lat:  53.41, lon:   -2.98 },
  { n: "Bordeaux",         lat:  44.84, lon:   -0.58 },
  { n: "Toulouse",         lat:  43.60, lon:    1.44 },
  { n: "Strasbourg",       lat:  48.57, lon:    7.75 },
  { n: "Nantes",           lat:  47.22, lon:   -1.55 },
  { n: "Montpellier",      lat:  43.61, lon:    3.88 },
  { n: "Rennes",           lat:  48.11, lon:   -1.68 },
  { n: "Dortmund",         lat:  51.51, lon:    7.47 },
  { n: "Essen",            lat:  51.46, lon:    7.01 },
  { n: "Leipzig",          lat:  51.34, lon:   12.38 },
  { n: "Dresden",          lat:  51.05, lon:   13.74 },
  { n: "Bremen",           lat:  53.08, lon:    8.80 },
  { n: "Hannover",         lat:  52.37, lon:    9.73 },
  { n: "Nuremberg",        lat:  49.45, lon:   11.08 },
  { n: "Gothenburg",       lat:  57.71, lon:   11.97 },
  { n: "Malmo",            lat:  55.60, lon:   13.00 },
  { n: "Tampere",          lat:  61.50, lon:   23.77 },
  { n: "Oulu",             lat:  65.01, lon:   25.47 },
  { n: "Turku",            lat:  60.45, lon:   22.27 },
  { n: "Wroclaw",          lat:  51.11, lon:   17.04 },
  { n: "Poznan",           lat:  52.41, lon:   16.93 },
  { n: "Lodz",             lat:  51.76, lon:   19.46 },
  { n: "Lublin",           lat:  51.25, lon:   22.57 },
  { n: "Debrecen",         lat:  47.53, lon:   21.63 },
  { n: "Graz",             lat:  47.07, lon:   15.44 },
  { n: "Linz",             lat:  48.31, lon:   14.29 },
  { n: "Salzburg",         lat:  47.80, lon:   13.05 },
  { n: "Innsbruck",        lat:  47.27, lon:   11.39 },
  { n: "Brno",             lat:  49.20, lon:   16.61 },
  { n: "Ostrava",          lat:  49.84, lon:   18.29 },
  { n: "Banja Luka",       lat:  44.77, lon:   17.19 },
  // ── Additional South/Southeast Asia ─────────────────────────────────────────
  { n: "Lucknow",          lat:  26.85, lon:   80.92 },
  { n: "Nagpur",           lat:  21.15, lon:   79.09 },
  { n: "Patna",            lat:  25.60, lon:   85.12 },
  { n: "Indore",           lat:  22.72, lon:   75.86 },
  { n: "Bhopal",           lat:  23.26, lon:   77.41 },
  { n: "Visakhapatnam",    lat:  17.69, lon:   83.22 },
  { n: "Vadodara",         lat:  22.31, lon:   73.18 },
  { n: "Coimbatore",       lat:  11.02, lon:   76.97 },
  { n: "Thiruvananthapuram", lat: 8.49, lon:   76.95 },
  { n: "Guwahati",         lat:  26.19, lon:   91.74 },
  { n: "Mandalay",         lat:  21.98, lon:   96.08 },
  { n: "Makassar",         lat:  -5.15, lon:  119.41 },
  { n: "Palembang",        lat:  -2.99, lon:  104.76 },
  { n: "Semarang",         lat:  -6.97, lon:  110.42 },
  { n: "Yogyakarta",       lat:  -7.80, lon:  110.36 },
  { n: "Davao",            lat:   7.07, lon:  125.61 },
  { n: "Quezon City",      lat:  14.68, lon:  121.06 },
  // ── Additional East Asia ─────────────────────────────────────────────────────
  { n: "Harbin",           lat:  45.75, lon:  126.64 },
  { n: "Shenyang",         lat:  41.80, lon:  123.43 },
  { n: "Dalian",           lat:  38.91, lon:  121.60 },
  { n: "Qingdao",          lat:  36.07, lon:  120.38 },
  { n: "Xiamen",           lat:  24.48, lon:  118.09 },
  { n: "Kunming",          lat:  25.04, lon:  102.71 },
  { n: "Urumqi",           lat:  43.82, lon:   87.60 },
  { n: "Lanzhou",          lat:  36.06, lon:  103.79 },
  { n: "Zhengzhou",        lat:  34.75, lon:  113.66 },
  { n: "Jinan",            lat:  36.67, lon:  116.99 },
  { n: "Taiyuan",          lat:  37.87, lon:  112.55 },
  { n: "Changsha",         lat:  28.23, lon:  112.94 },
  { n: "Nanchang",         lat:  28.68, lon:  115.86 },
  { n: "Hefei",            lat:  31.82, lon:  117.23 },
  { n: "Fuzhou",           lat:  26.07, lon:  119.30 },
  { n: "Incheon",          lat:  37.46, lon:  126.71 },
  { n: "Daegu",            lat:  35.87, lon:  128.60 },
  { n: "Gwangju",          lat:  35.15, lon:  126.91 },
  { n: "Sendai",           lat:  38.27, lon:  140.87 },
  { n: "Hiroshima",        lat:  34.39, lon:  132.45 },
  { n: "Kyoto",            lat:  35.01, lon:  135.77 },
  { n: "Kobe",             lat:  34.69, lon:  135.20 },
  // ── World cities expansion ──────────────────────────────────────────────────
  { n: "Freetown",            lat:    8.48, lon:   -13.23 },
  { n: "Monrovia",            lat:    6.30, lon:   -10.80 },
  { n: "Lomé",                lat:    6.14, lon:     1.21 },
  { n: "Yaoundé",             lat:    3.87, lon:    11.52 },
  { n: "Port Harcourt",       lat:    4.78, lon:     7.01 },
  { n: "Zanzibar City",       lat:   -6.16, lon:    39.19 },
  { n: "Pretoria",            lat:  -25.75, lon:    28.19 },
  { n: "Lubumbashi",          lat:  -11.66, lon:    27.48 },
  { n: "Fez",                 lat:   34.03, lon:    -5.00 },
  { n: "Marrakech",           lat:   31.63, lon:    -8.01 },
  { n: "Tangier",             lat:   35.76, lon:    -5.80 },
  { n: "Oran",                lat:   35.70, lon:    -0.63 },
  { n: "San Salvador",        lat:   13.69, lon:   -89.22 },
  { n: "San José",            lat:    9.93, lon:   -84.08 },
  { n: "Belize City",         lat:   17.50, lon:   -88.20 },
  { n: "Medellín",            lat:    6.25, lon:   -75.56 },
  { n: "Barranquilla",        lat:   10.96, lon:   -74.78 },
  { n: "Santa Cruz",          lat:  -17.78, lon:   -63.18 },
  { n: "Asunción",            lat:  -25.26, lon:   -57.58 },
  { n: "Georgetown",          lat:    6.80, lon:   -58.16 },
  { n: "Paramaribo",          lat:    5.85, lon:   -55.20 },
  { n: "Porto Alegre",        lat:  -30.03, lon:   -51.23 },
  { n: "Córdoba",             lat:  -31.42, lon:   -64.18 },
  { n: "Rosario",             lat:  -32.95, lon:   -60.65 },
  { n: "Mendoza",             lat:  -32.89, lon:   -68.83 },
  { n: "Valparaíso",          lat:  -33.05, lon:   -71.62 },
  { n: "Concepción",          lat:  -36.83, lon:   -73.05 },
  { n: "Manama",              lat:   26.23, lon:    50.59 },
  { n: "Mecca",               lat:   21.43, lon:    39.83 },
  { n: "Medina",              lat:   24.47, lon:    39.61 },
  { n: "Sharjah",             lat:   25.34, lon:    55.41 },
  { n: "Erbil",               lat:   36.19, lon:    44.01 },
  { n: "Basra",               lat:   30.51, lon:    47.81 },
  { n: "Sana'a",              lat:   15.35, lon:    44.21 },
  { n: "Faisalabad",          lat:   31.42, lon:    73.08 },
  { n: "Rawalpindi",          lat:   33.60, lon:    73.05 },
  { n: "Peshawar",            lat:   34.01, lon:    71.58 },
  { n: "Chittagong",          lat:   22.34, lon:    91.83 },
  { n: "Kanpur",              lat:   26.45, lon:    80.35 },
  { n: "Cebu City",           lat:   10.31, lon:   123.89 },
  { n: "Davao City",          lat:    7.07, lon:   125.61 },
  { n: "Yokohama",            lat:   35.44, lon:   139.64 },
  { n: "Kaohsiung",           lat:   22.63, lon:   120.30 },
  { n: "Taichung",            lat:   24.15, lon:   120.67 },
  { n: "Suzhou",              lat:   31.30, lon:   120.62 },
  { n: "Changchun",           lat:   43.88, lon:   125.32 },
  { n: "Lhasa",               lat:   29.65, lon:    91.17 },
  { n: "Malmö",               lat:   55.60, lon:    13.00 },
  { n: "Düsseldorf",          lat:   51.23, lon:     6.78 },
  { n: "Kraków",              lat:   50.06, lon:    19.94 },
  { n: "Gdańsk",              lat:   54.35, lon:    18.65 },
  { n: "Wrocław",             lat:   51.11, lon:    17.04 },
  { n: "Belfast",             lat:   54.60, lon:    -5.93 },
  { n: "Cork",                lat:   51.90, lon:    -8.47 },
  { n: "Galway",              lat:   53.27, lon:    -9.06 },
  { n: "Krasnoyarsk",         lat:   56.01, lon:    92.87 },
  { n: "Sochi",               lat:   43.59, lon:    39.73 },
  { n: "Irkutsk",             lat:   52.29, lon:   104.28 },
  { n: "Kaliningrad",         lat:   54.71, lon:    20.51 },
  { n: "Hobart",              lat:  -42.88, lon:   147.33 },
  { n: "Darwin",              lat:  -12.46, lon:   130.84 },
  { n: "Nouméa",              lat:  -22.28, lon:   166.46 },
  { n: "Mesa",                lat:   33.42, lon:  -111.83 },
  { n: "St. John's",          lat:   47.56, lon:   -52.71 },
];

// Tier-1: major world cities always shown first when zooming in.
// Everything not in this set is tier-2 and only appears when the user zooms closer.
const CITY_TIER1 = new Set([
  // Americas
  "New York","Los Angeles","Chicago","Houston","Miami","Atlanta","Dallas",
  "San Francisco","Seattle","Boston","Washington DC","Phoenix","Denver",
  "Toronto","Montreal","Vancouver","Mexico City","Guadalajara","Monterrey",
  "Bogota","Lima","Santiago","Buenos Aires","Sao Paulo","Rio de Janeiro",
  "Havana","San Juan",
  // Europe
  "London","Paris","Berlin","Madrid","Rome","Barcelona","Amsterdam","Vienna",
  "Stockholm","Warsaw","Brussels","Prague","Lisbon","Budapest","Oslo",
  "Copenhagen","Helsinki","Zurich","Milan","Munich","Athens","Bucharest",
  "Hamburg","Kyiv","Istanbul","Dublin","Edinburgh",
  // Africa & Middle East
  "Cairo","Lagos","Nairobi","Johannesburg","Cape Town","Casablanca",
  "Addis Ababa","Dar es Salaam","Accra","Algiers","Tunis","Khartoum",
  "Riyadh","Dubai","Tel Aviv","Tehran","Amman","Beirut","Baghdad",
  // Asia
  "Tokyo","Shanghai","Beijing","Mumbai","Delhi","Karachi","Dhaka",
  "Bangkok","Ho Chi Minh City","Hanoi","Jakarta","Manila","Singapore",
  "Seoul","Taipei","Hong Kong","Kuala Lumpur","Kolkata","Bangalore",
  "Chennai","Hyderabad","Osaka","Chengdu","Shenzhen","Guangzhou",
  "Colombo","Kathmandu","Tashkent","Almaty","Ulaanbaatar",
  // Oceania
  "Sydney","Melbourne","Brisbane","Perth","Auckland",
]);

// ─── City fun facts ──────────────────────────────────────────────────────────
const CITY_FACTS: Record<string, string> = {
  // Americas
  "New York":         "Home to 800+ languages — the world's most linguistically diverse city!",
  "Los Angeles":      "More car lanes than any other U.S. city, yet traffic still wins every time.",
  "Chicago":          "The first skyscraper in history was built here in 1885.",
  "Houston":          "The most ethnically diverse major U.S. city, with 145 languages spoken.",
  "Phoenix":          "The only U.S. state capital with over 1 million residents.",
  "Philadelphia":     "Birthplace of both the U.S. Constitution and the Philly cheesesteak.",
  "San Antonio":      "The Alamo, fought over in 1836, sits in the middle of its downtown.",
  "San Diego":        "Enjoys 266 sunny days per year — most of any major U.S. city.",
  "Dallas":           "Home to more restaurants per capita than New York City.",
  "Austin":           "Live music capital of the world with 250+ live music venues.",
  "San Francisco":    "The Golden Gate's famous red is officially called 'International Orange'.",
  "Seattle":          "Birthplace of Amazon, Starbucks, and Boeing — all within a few miles.",
  "Denver":           "Exactly one mile above sea level — the 'Mile High City' takes it literally.",
  "Washington DC":    "The city was designed in a 10-mile diamond with grand diagonal avenues.",
  "Nashville":        "Over 180 live music venues make it the 'Music City' of the world.",
  "Las Vegas":        "The Strip's hotels use more electricity than some small countries.",
  "Portland":         "Has more food carts per capita than any other U.S. city.",
  "Memphis":          "Birthplace of blues, soul, and rock 'n' roll — Elvis included.",
  "Miami":            "Over 70% of Miami's residents speak a language other than English at home.",
  "Minneapolis":      "Has more theater seats per capita than any city outside New York.",
  "New Orleans":      "The U.S. city most below sea level — some spots sit 6 feet underwater.",
  "Atlanta":          "Delta Air Lines, Coca-Cola, CNN, and Home Depot all started here.",
  "Detroit":          "Invented the moving assembly line, which changed manufacturing forever.",
  "Boston":           "Home to the oldest public park in the U.S., dating back to 1634.",
  "Charlotte":        "Second largest U.S. banking center after New York City.",
  "St. Louis":        "The Gateway Arch is taller than the Statue of Liberty and the Eiffel Tower.",
  "Orlando":          "The world's most visited tourist destination with 75 million visitors/year.",
  "Salt Lake City":   "Has the widest streets of any city in the U.S. — wide enough for a U-turn.",
  "Indianapolis":     "Hosts the world's largest single-day sporting event: the Indy 500.",
  "Columbus":         "Home to the largest university campus by enrollment in the U.S.",
  "Tampa":            "Ybor City here rolled the first commercially made cigars in the U.S.",
  "Pittsburgh":       "Has more bridges than any other city in the world — 446 in total!",
  "Cincinnati":       "Birthplace of professional baseball — the Reds are the oldest MLB team.",
  "Sacramento":       "California's capital, founded during the Gold Rush of 1848.",
  "Baltimore":        "Home of the first umbrella factory in the United States (1828).",
  "Milwaukee":        "Brewing capital of the U.S. — once home to four of the world's largest breweries.",
  "Kansas City":      "Claims the most fountains of any city in the world after Rome.",
  "Cleveland":        "Home of the Rock & Roll Hall of Fame — rock music was named here.",
  "Honolulu":         "The only U.S. state capital that is also an island city.",
  "Anchorage":        "25% of the world's air cargo passes through Ted Stevens airport annually.",
  "Fairbanks":        "One of the best places on Earth to see the Northern Lights.",
  "Toronto":          "The most multicultural city in the world — half its residents are foreign-born.",
  "Montreal":         "The second-largest French-speaking city after Paris.",
  "Vancouver":        "Rated one of the world's most livable cities for 30 years running.",
  "Calgary":          "Hosts the world-famous Calgary Stampede, the greatest outdoor show on Earth.",
  "Ottawa":           "Canada's capital has the world's largest naturally frozen skating rink.",
  "Edmonton":         "Hosts the world's longest stretch of connected urban parkland.",
  "Quebec City":      "The only walled city north of Mexico — its walls are still standing.",
  "Mexico City":      "One of the largest cities on Earth, built on an ancient Aztec lake bed.",
  "Guadalajara":      "Birthplace of tequila, mariachi music, and the Mexican hat dance.",
  "Cancun":           "Was a tiny fishing village of just 117 people before 1970.",
  "Havana":           "Home to more vintage American cars from the 1950s than anywhere else.",
  "Bogota":           "At 8,660 ft elevation, it's one of the highest capital cities in the world.",
  "Lima":             "Home to some of the world's best restaurants — a global foodie destination.",
  "Santiago":         "Backed by the Andes mountains, which are visible on clear days.",
  "Buenos Aires":     "Has more bookstores per person than any other city in the world.",
  "Sao Paulo":        "The largest city in the Southern Hemisphere with 22 million people.",
  "Rio de Janeiro":   "Home to the world's largest Carnival celebration with 2 million revelers/day.",
  "Cartagena":        "A UNESCO World Heritage walled city with some of the best-preserved colonial architecture.",
  "Medellin":         "Once the most dangerous city in the world, now a global model for urban renewal.",
  // Europe
  "London":           "Has over 170 museums, more than any other city in the world.",
  "Paris":            "The Eiffel Tower was meant to be torn down after 20 years — it's now 135 years old.",
  "Berlin":           "Has more bridges than Venice — 1,700 vs Venice's 400.",
  "Madrid":           "At 2,188 ft, it's the highest capital city in the European Union.",
  "Rome":             "Built on seven hills and home to the world's smallest country: Vatican City.",
  "Barcelona":        "Gaudí's Sagrada Família has been under construction since 1882.",
  "Amsterdam":        "Has more bicycles (900,000) than residents (875,000).",
  "Vienna":           "Produced Mozart, Beethoven, Schubert, and Brahms — classical music's home.",
  "Stockholm":        "Built on 14 islands connected by 57 bridges.",
  "Warsaw":           "After WWII, 90% of the city was destroyed — it was entirely rebuilt from scratch.",
  "Brussels":         "Headquarters of NATO and the European Union.",
  "Prague":           "Its Old Town astronomical clock has been running since 1410.",
  "Lisbon":           "One of the oldest capital cities in Europe, founded before Rome.",
  "Budapest":         "Has the oldest metro system in continental Europe (opened 1896).",
  "Oslo":             "The Nobel Peace Prize is awarded here every December 10.",
  "Copenhagen":       "Consistently ranked as the world's happiest and most livable city.",
  "Helsinki":         "Over 30% of the city is covered by sea, lake, or river.",
  "Zurich":           "Consistently ranks as the city with the world's highest quality of life.",
  "Milan":            "Fashion and design capital of the world — hosts 4 fashion weeks annually.",
  "Munich":           "Hosts Oktoberfest, which serves 7–8 million liters of beer annually.",
  "Athens":           "The world's oldest continuously inhabited city, occupied for 7,000 years.",
  "Bucharest":        "Has the world's second-largest administrative building (Palace of Parliament).",
  "Hamburg":          "Europe's second-largest port handles 134 million tons of cargo per year.",
  "Kyiv":             "One of Europe's oldest cities, founded in the 5th century AD.",
  "Istanbul":         "The only city in the world that straddles two continents: Europe and Asia.",
  "Dublin":           "More Nobel Prize winners in literature per capita than any other country.",
  "Edinburgh":        "Has more listed buildings per square mile than anywhere else in the world.",
  "Manchester":       "Birthplace of the Industrial Revolution and the modern music scene.",
  "Venice":           "Built on 118 small islands connected by 400+ bridges — no cars allowed!",
  "Florence":         "Produced more great artists than any other city in history.",
  "Naples":           "Pizza was invented here — the original Margherita was made in Naples in 1889.",
  "Seville":          "In summer, temperatures can exceed 50°C — the hottest city in Western Europe.",
  "Porto":            "Its name gave Portugal its name — originally 'Portus Cale'.",
  "Geneva":           "Home to 40+ international organizations, including the UN and Red Cross.",
  "Krakow":           "One of the few major European cities that wasn't bombed in WWII.",
  "Reykjavik":        "The world's northernmost capital city, powered almost entirely by geothermal energy.",
  "Tallinn":          "One of the best-preserved medieval cities in Northern Europe.",
  "Vilnius":          "Has 65 churches — more per capita than almost any other European city.",
  "Riga":             "Home to the world's first decorated Christmas tree (1510).",
  // Russia & Central Asia
  "Moscow":           "The Moscow Metro is one of the most beautiful subway systems in the world.",
  "Saint Petersburg": "Built on 101 islands across the Neva Delta — the 'Venice of the North'.",
  "Vladivostok":      "Sits closer to San Francisco (by sea) than to Moscow.",
  "Samarkand":        "One of the oldest continuously inhabited cities in Central Asia.",
  // Middle East
  "Dubai":            "Home to the world's tallest building — the Burj Khalifa at 828 meters.",
  "Abu Dhabi":        "Sits on one of the world's largest oil reserves.",
  "Doha":             "Hosted the 2022 FIFA World Cup — the first in the Middle East.",
  "Riyadh":           "One of the fastest-growing cities in the world — population doubled in 20 years.",
  "Tehran":           "One of the world's highest capital cities, flanked by the Alborz mountains.",
  "Jerusalem":        "Sacred to three of the world's major religions: Judaism, Christianity, Islam.",
  "Tel Aviv":         "The world's second-largest concentration of startups after Silicon Valley.",
  "Beirut":           "Known as the 'Paris of the Middle East' for its vibrant culture and cuisine.",
  "Amman":            "One of the world's oldest continuously inhabited cities — dating back 9,000 years.",
  "Kuwait City":      "Was once the wealthiest country per capita in the world.",
  // South Asia
  "Delhi":            "One of the world's oldest and most historically rich cities — over 3,000 years old.",
  "Mumbai":           "Bollywood produces more films per year than Hollywood.",
  "Karachi":          "One of the world's largest cities with the world's largest bus rapid transit system.",
  "Dhaka":            "One of the world's most densely populated cities — 44,000 people per sq km.",
  "Kolkata":          "Home to Asia's oldest operating tramway system (1873).",
  "Bangalore":        "Silicon Valley of India — home to 1,000+ tech companies.",
  "Chennai":          "The Detroit of India — produces 30% of all automobiles in the country.",
  "Hyderabad":        "Famous for the Hyderabadi biryani, considered one of the world's greatest dishes.",
  "Kathmandu":        "Gateway to 8 of the world's 14 highest mountains above 8,000 meters.",
  "Colombo":          "One of the largest natural harbors in South Asia.",
  // East & Southeast Asia
  "Tokyo":            "The world's largest metropolitan area with 37.4 million people.",
  "Shanghai":         "Has the world's largest metro system by total route length (831 km).",
  "Beijing":          "Has been China's capital for most of the last 700 years.",
  "Seoul":            "Has the fastest average internet speed of any major city in the world.",
  "Osaka":            "Known as Japan's kitchen — Japanese consider its food the best in the country.",
  "Kyoto":            "Was Japan's capital for over 1,000 years and home to 1,600+ temples.",
  "Hong Kong":        "Has the world's most skyscrapers per capita — 482 buildings over 100m tall.",
  "Singapore":        "The only city-state in Southeast Asia — an entire country in one city.",
  "Bangkok":          "Has the world's longest city name — 169 characters in Thai.",
  "Ho Chi Minh City": "Named after Vietnam's famous revolutionary leader — formerly Saigon.",
  "Jakarta":          "Home to the world's largest bus rapid transit (TransJakarta) system.",
  "Manila":           "One of the world's most densely populated cities with over 71,000 people/km².",
  "Kuala Lumpur":     "The Petronas Towers were the world's tallest buildings from 1998 to 2004.",
  "Taipei":           "Home to Taipei 101, which was the world's tallest building until 2010.",
  "Chengdu":          "Home of the Giant Panda Breeding Research Base — pandas are everywhere!",
  "Ulaanbaatar":      "The world's coldest capital city, with temperatures reaching -40°C in winter.",
  "Bali":             "One of the world's top island destinations with 6 million visitors yearly.",
  "Phuket":           "Thailand's largest island has more dive sites than almost anywhere in Asia.",
  // Africa
  "Cairo":            "The largest city in Africa, home to the 4,500-year-old Great Pyramids.",
  "Lagos":            "Africa's largest city and fastest-growing megacity — adds 77 people per hour.",
  "Nairobi":          "The only city in the world with a national park inside city limits.",
  "Johannesburg":     "The world's largest city NOT on a river, lake, or coastline.",
  "Cape Town":        "Table Mountain is one of the world's oldest mountains — 600 million years old.",
  "Casablanca":       "Morocco's economic capital and home to Africa's largest mosque.",
  "Addis Ababa":      "Headquarters of the African Union and home to the UN's African offices.",
  "Accra":            "Labadi Beach draws crowds year-round — one of West Africa's best beaches.",
  "Dar es Salaam":    "Tanzania's largest city means 'Haven of Peace' in Arabic.",
  "Kigali":           "Consistently ranked as Africa's cleanest city — plastic bags are banned.",
  // Oceania
  "Sydney":           "The Opera House & the Harbour Bridge — took over 1,400 workers and decades to build.",
  "Melbourne":        "Has the world's largest tram network outside Europe.",
  "Brisbane":         "Hosted the 1982 and 2032 Summer Olympics — 50 years apart!",
  "Perth":            "The most isolated major city in the world — 2,700 km from the next city.",
  "Auckland":         "Nicknamed the 'City of Sails' — has more boats per capita than anywhere on Earth.",
};


// ─── City hover card cache ────────────────────────────────────────────────────
const _cityCardCache = new Map<string, { imgUrl: string | null; fact: string }>();

function scoreSentence(s: string): number {
  let score = 0;
  if (/\b(founded|established|built|constructed|opened|completed)\b/i.test(s)) score += 5;
  if (/\b(oldest|tallest|largest|first|only|deepest|longest|highest|smallest|biggest)\b/i.test(s)) score += 5;
  if (/\b(century|ancient|historic|medieval|empire|dynasty|war|battle|revolution|olymp)\b/i.test(s)) score += 4;
  if (/\b(world|record|famous|renowned|landmark|wonder|heritage|unesco)\b/i.test(s)) score += 3;
  if (/\b(known for|home to|site of|birthplace|invented|origin|first ever)\b/i.test(s)) score += 3;
  if (/\b(1[0-9]{3}|20[0-2][0-9])\b/.test(s)) score += 2;
  // Only penalise the most generic openers — be more lenient than before
  if (/^[A-Z][a-zA-Z ]+is (a|the) (city|town|municipality|commune) (in|of)/i.test(s.trim())) score -= 5;
  if (/most populous city\b/i.test(s)) score -= 3;
  if (/\bpopulation of [0-9]|census|sq(uare)? (km|mi)\b/i.test(s)) score -= 4;
  const words = s.split(/\s+/).length;
  if (words >= 8 && words <= 45) score += 1;
  return score;
}

function looksLikeStatLine(s: string): boolean {
  const lower = s.toLowerCase();
  if (/^its (population|area|density)/i.test(lower)) return true;
  if (/^the (population|area|density)/i.test(lower)) return true;
  if (/(^| )population (was|of|is) /i.test(lower)) return true;
  if (/^postal code/i.test(lower)) return true;
  if (/^as of \d+ census/i.test(lower)) return true;
  return false;
}

function pickBestFact(extract: string): string {
  const sentences = (extract.match(/[^.!?]+[.!?]+/g) ?? []).map((s) => s.trim()).filter(Boolean);
  if (!sentences.length) return extract.slice(0, 200);
  // First non-stat sentence wins — usually the descriptive opener
  // ("X is a municipality in...") is more interesting than the population
  // dump that often follows. Scoring kept as a tiebreaker for tied articles.
  const meaty = sentences.filter((s) => !looksLikeStatLine(s));
  const candidates = meaty.length ? meaty : sentences;
  let best = candidates[0];
  let bestScore = scoreSentence(best);
  for (const s of candidates.slice(1)) {
    const sc = scoreSentence(s);
    if (sc > bestScore + 1) { best = s; bestScore = sc; }
  }
  return best.length > 220 ? best.slice(0, 217) + "…" : best;
}

function CityLabel({ n, lat, lon, pos, orientation, fontSize, leaderTo }: {
  n: string;
  lat: number;
  lon: number;
  pos: [number, number, number];
  orientation: THREE.Quaternion;
  fontSize: number;
  // When the label was nudged to clear a collected monument, this is the
  // monument's surface position — used to draw a leader line from label to
  // monument so the user can still associate the two.
  leaderTo?: [number, number, number];
}) {
  const [hovered,      setHovered]      = useState(false);
  const [mobileActive, setMobileActive] = useState(false);
  const [imgUrl,       setImgUrl]       = useState<string | null>(null);
  const [fact,         setFact]         = useState<string>(CITY_FACTS[n] ?? "");
  const fetchedRef = useRef(false);

  // Dismiss when another mobile city card is activated
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>).detail.key;
      if (key !== `city:${n}`) setMobileActive(false);
    };
    window.addEventListener('geknee:mobilecity', handler);
    return () => window.removeEventListener('geknee:mobilecity', handler);
  }, [n]);

  const showCard = mobileActive;

  useEffect(() => {
    if (!showCard || fetchedRef.current) return;
    // Load from cache immediately if available
    if (_cityCardCache.has(n)) {
      const c = _cityCardCache.get(n)!;
      setImgUrl(c.imgUrl);
      if (c.fact) setFact(c.fact);
      fetchedRef.current = true;
      return;
    }
    fetchedRef.current = true; // mark so we don't re-fetch on re-hover
    // Pre-scraped cache wins — zero network hit, hand-disambiguated.
    const cached = getCityInfo(n, lat, lon);
    if (cached && (cached.img || cached.fact)) {
      _cityCardCache.set(n, { imgUrl: cached.img, fact: cached.fact });
      setImgUrl(cached.img);
      if (cached.fact) setFact(cached.fact);
      return;
    }
    // Otherwise hit Wikipedia with disambig + geosearch fallback.
    const extra = getExtraCities().find((c) => c.n === n && Math.abs(c.lat - lat) < 0.01 && Math.abs(c.lon - lon) < 0.01) as
      | { c?: string }
      | undefined;
    wikiSummary(n, 800, { lat, lon, country: extra?.c }).then(({ img, extract, description }) => {
      const wikiF = extract ? pickBestFact(extract) : "";
      const resolved = wikiF || CITY_FACTS[n] || description || "";
      _cityCardCache.set(n, { imgUrl: img, fact: resolved });
      setImgUrl(img);
      if (resolved) setFact(resolved);
    }).catch(() => {
      _cityCardCache.set(n, { imgUrl: null, fact: CITY_FACTS[n] || "" });
      if (CITY_FACTS[n]) setFact(CITY_FACTS[n]);
    });
  }, [showCard, n]);

  const handleClick = (e: any) => {
    e.stopPropagation();
    const key = `city:${n}`;
    if (!mobileActive) {
      window.dispatchEvent(new CustomEvent('geknee:mobilecity', { detail: { key } }));
    }
    setMobileActive(prev => !prev);
  };

  // Per-frame zoom-aware scale on the text group only — keeps SDF mesh
  // intact (no rebuild on size change) and the click sprite at full size.
  // Smooth at 60fps regardless of how coarsely camDist updates in React state.
  const textGroupRef = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (!textGroupRef.current) return;
    const camDist = camera.position.length();
    textGroupRef.current.scale.setScalar(Math.pow(camDist / 15, 1.4));
  });

  return (
    <>
    {leaderTo && (
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([pos[0], pos[1], pos[2], leaderTo[0], leaderTo[1], leaderTo[2]]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.55} depthTest={false} depthWrite={false} />
      </line>
    )}
    <group position={pos} quaternion={orientation}>
      <group ref={textGroupRef}>
      <Text
        fontSize={fontSize}
        color={mobileActive ? "#ffe066" : "#ffffff"}
        outlineWidth={fontSize * 0.55}
        outlineColor="#000000"
        outlineOpacity={0.55}
        outlineBlur={fontSize * 0.85}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.01}
        sdfGlyphSize={128}
        renderOrder={3}
        material-depthWrite={false}
        material-depthTest={false}
        material-side={THREE.FrontSide}
        material-toneMapped={false}
      >
        {n}
      </Text>
      </group>

      {showCard && (
        <Html as="div" zIndexRange={[0, 0]} style={{ pointerEvents: "none", width: 0, height: 0 }}>
          {typeof document !== "undefined" && createPortal(
            <div style={{
              position: "fixed",
              top: "calc(64px + 1vh)",
              left: "calc(8px + 1vw)",
              width: "clamp(280px, 32vw, 440px)",
              zIndex: 200,
              pointerEvents: mobileActive ? "auto" : "none",
              background: "rgba(13,13,36,0.96)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(167,139,250,0.35)",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
              fontFamily: "var(--font-ui), Inter, system-ui, sans-serif",
              transform: "translateZ(0)",
            }}>
              {/* Close button — works for touch and cursor. 32×32 hit target
                  meets touch-friendly minimum and gives cursor users obvious
                  affordance. */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMobileActive(false); }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Close"
                style={{
                  position: "absolute", top: 8, right: 8,
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(15,15,35,0.85)",
                  border: "1px solid rgba(167,139,250,0.35)",
                  color: "rgba(199,210,254,0.9)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, lineHeight: 1, cursor: "pointer",
                  zIndex: 1, fontFamily: "inherit",
                  WebkitTapHighlightColor: "transparent",
                }}
              >×</button>
              {imgUrl && (
                <img src={imgUrl} alt="" style={{
                  display: "block", width: "100%", height: 168,
                  objectFit: "cover",
                  borderBottom: "1px solid rgba(167,139,250,0.25)",
                }} />
              )}
              <div style={{ padding: "16px 20px 20px" }}>
                <div style={{
                  fontSize: "clamp(22px, 2.1vw, 26px)", fontWeight: 600,
                  fontFamily: "var(--font-display, Georgia, serif)",
                  color: "#f2f2f8",
                  letterSpacing: "-0.01em",
                  marginBottom: 3,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{n}</div>
                {fact && (
                  <div style={{
                    fontSize: "clamp(18px, 1.7vw, 20px)",
                    color: "#a8a8c0", lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {fact}
                  </div>
                )}
                {mobileActive && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMobileActive(false);
                        window.dispatchEvent(new CustomEvent("geknee:opencitymap", {
                          detail: { name: n, lat, lon },
                        }));
                      }}
                      style={{
                        padding: "8px 0", borderRadius: 10,
                        background: "rgba(167,139,250,0.14)",
                        border: "1px solid rgba(167,139,250,0.35)",
                        color: "#c7d2fe",
                        fontSize: "clamp(18px, 1.7vw, 20px)",
                        fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      Open map
                    </button>
                    <a
                      href={`/plan?location=${encodeURIComponent(n)}`}
                      style={{
                        display: "block",
                        padding: "8px 0", borderRadius: 10,
                        background: "linear-gradient(135deg,#a78bfa,#7dd3fc)",
                        color: "#0a0a1f",
                        fontSize: "clamp(18px, 1.7vw, 20px)",
                        fontWeight: 700,
                        textAlign: "center", textDecoration: "none",
                      }}
                    >
                      Plan trip →
                    </a>
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )}
        </Html>
      )}

      <sprite
        scale={[0.65, 0.16, 1]}
        renderOrder={2}
        onClick={handleClick}
        onPointerOver={(e: any) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={(e: any) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
      >
        <spriteMaterial transparent opacity={0} depthTest={false} />
      </sprite>
    </group>
    </>
  );
}

function CityLabels({ camDist }: { camDist: number }) {
  // Dynamic separation threshold: wider zoom = stricter = fewer cities shown.
  // camDist ~21 → thresh ~4°, camDist ~14 → thresh ~1.5°, camDist <12 → ~0.6°
  // Tightened so more cities pass the spatial-dedup at any given zoom.
  const sepThresh = camDist > 22 ? 6.0 : camDist > 18 ? 3.5 : camDist > 14 ? 1.8 : camDist > 11 ? 0.9 : 0.5;
  const extraVersion = useExtraCitiesVersion();
  // Population threshold for extras (curated CITIES always pass through).
  // Far zoom = only big cities; close zoom = full long tail. Loosened so
  // mid-zoom (continental) shows more regional centers.
  const popMin = camDist > 22 ? 1_500_000
              : camDist > 18 ?   400_000
              : camDist > 14 ?   100_000
              : camDist > 11 ?    30_000
              :                        0;

  const items = useMemo(() => {
    const base = CITIES.map(({ n, lat, lon }) => ({
      n, lat, lon,
      pos: geoPos(lat, lon, R * 1.019),
      tier: CITY_TIER1.has(n) ? 1 : 2,
      pop: Infinity,
    }));
    const extra = getExtraCities()
      .filter((c) => (c.p ?? 0) >= popMin)
      .map((c) => ({
        n: c.n, lat: c.lat, lon: c.lon,
        pos: geoPos(c.lat, c.lon, R * 1.019),
        tier: 3,
        pop: c.p ?? 0,
      }));
    return [...base, ...extra].map((it) => ({
      ...it,
      orientation: computeOrientation(it.pos),
    }));
  // extraVersion bumps when the GeoNames JSON arrives — recompute then.
  // popMin is camDist-derived so it's in deps too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraVersion, popMin]);

  // Collected monuments — used to nudge city labels off the monument GLB and
  // draw a leader line so the user can still associate label and landmark.
  const collectedSet = useCollectedMonumentSet();
  const collectedMonumentPositions = useMemo(() => {
    const out: { pos: [number, number, number]; unit: THREE.Vector3 }[] = [];
    collectedSet.forEach((mk) => {
      const ll = MONUMENT_LATLON[mk];
      if (!ll) return;
      const p = geoPos(ll.lat, ll.lon, R * 1.019);
      out.push({ pos: p, unit: new THREE.Vector3(...p).normalize() });
    });
    return out;
  }, [collectedSet]);

  // Greedy spatial dedup: sort tier-1 first, then pick cities that are
  // at least sepThresh° away from any already-selected city.
  const visible = useMemo(() => {
    if (camDist >= 25) return [];
    const sorted = [...items].sort((a, b) => a.tier - b.tier);
    const selected: typeof sorted = [];
    const selUnits: THREE.Vector3[] = [];
    for (const city of sorted) {
      const u = new THREE.Vector3(...city.pos).normalize();
      // all tiers appear at the same zoom level — spacing handles density
      let tooClose = false;
      for (const su of selUnits) {
        const dot = Math.max(-1, Math.min(1, u.dot(su)));
        const deg = Math.acos(dot) * (180 / Math.PI);
        if (deg < sepThresh) { tooClose = true; break; }
      }
      if (!tooClose) { selected.push(city); selUnits.push(u); }
    }
    // Density-based base size only. Per-frame zoom scaling lives in CityLabel's
    // useFrame so it's smooth at 60fps and doesn't rebuild SDF text meshes.
    const NUDGE_TRIGGER_DEG = 2.0;   // monument within this arc → nudge label
    const NUDGE_OFFSET_DEG  = 0.8;   // small upward bump — keeps label "just above" the monument
    const sphereR = R * 1.019;
    const NORTH = new THREE.Vector3(0, 1, 0);
    return selected.map((city, i) => {
      const u = selUnits[i];
      let minDeg = 180;
      for (let j = 0; j < selUnits.length; j++) {
        if (i === j) continue;
        const dot = Math.max(-1, Math.min(1, u.dot(selUnits[j])));
        const deg = Math.acos(dot) * (180 / Math.PI);
        if (deg < minDeg) minDeg = deg;
      }
      const fontSize = minDeg >= 6 ? 0.07 : Math.max(0.045, 0.07 * (minDeg / 6));

      // If a collected monument is sitting near this city label, nudge the
      // label slightly NORTH on the sphere so it floats above the monument
      // GLB instead of being shoved into another state. Earlier away-tangent
      // logic could land Rio's label in the ocean or NYC's in Pennsylvania.
      let onTopOfMonument = false;
      for (const mon of collectedMonumentPositions) {
        const dot = Math.max(-1, Math.min(1, u.dot(mon.unit)));
        const deg = Math.acos(dot) * (180 / Math.PI);
        if (deg < NUDGE_TRIGGER_DEG) { onTopOfMonument = true; break; }
      }

      let pos = city.pos;
      if (onTopOfMonument) {
        // Tangent at city pointing toward the north pole on the sphere.
        // Falls back to an arbitrary tangent only at the poles.
        const tangent = NORTH.clone().sub(u.clone().multiplyScalar(NORTH.dot(u)));
        if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
        tangent.normalize();
        const axis = new THREE.Vector3().crossVectors(u, tangent).normalize();
        const offsetVec = u.clone().applyAxisAngle(axis, NUDGE_OFFSET_DEG * Math.PI / 180).multiplyScalar(sphereR);
        pos = [offsetVec.x, offsetVec.y, offsetVec.z];
      }

      // Recompute orientation for the offset position so text still hugs the surface
      const orientation = pos === city.pos ? city.orientation : computeOrientation(pos);

      // No leader line — the label is now visually attached to the monument
      // (sitting just above it) so a leader would be visual noise.
      return { ...city, pos, orientation, fontSize, leaderTo: undefined };
    });
  }, [items, camDist, sepThresh, collectedMonumentPositions]);

  if (camDist >= 21) return null;

  return (
    <>
      {visible.map(({ n, lat, lon, pos, orientation, fontSize, leaderTo }) => (
        <CityLabel key={n} n={n} lat={lat} lon={lon} pos={pos} orientation={orientation} fontSize={fontSize} leaderTo={leaderTo} />
      ))}
    </>
  );
}


// ─── Camera zoom handler (inside Canvas) ─────────────────────────────────────
function CameraZoomHandler() {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as any;
  const animRef = useRef<{
    startDist: number; targetDist: number; elapsed: number; onDone?: () => void;
  } | null>(null);

  useFrame((_, delta) => {
    const pending = consumeCameraZoom();
    if (pending) {
      animRef.current = {
        startDist: camera.position.length(),
        targetDist: pending.distance,
        elapsed: 0,
        onDone: pending.onDone,
      };
    }
    if (!animRef.current) return;
    animRef.current.elapsed += delta;
    const duration = 1.8;
    const t = Math.min(animRef.current.elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 0.8);
    const dist = animRef.current.startDist +
      (animRef.current.targetDist - animRef.current.startDist) * ease;
    // Sync OrbitControls' internal spherical radius so it doesn't override us
    if (controls?._spherical) controls._spherical.radius = dist;
    camera.position.setLength(dist);
    if (t >= 1) { animRef.current.onDone?.(); animRef.current = null; }
    controls?.update();
  }, 1); // priority 1 = runs after OrbitControls (priority 0)

  return null;
}

// ─── Keeps OrbitControls damping ticking every frame ─────────────────────────
function DampingUpdater() {
  const controls = useThree((s) => s.controls) as any;
  useFrame(() => { controls?.update(); });
  return null;
}

// ─── Nearby-city glow pins shown after a globe click ─────────────────────────

function CitySelectionPin({
  city, index,
}: { city: { n: string; lat: number; lon: number }; index: number }) {
  const { pos, q } = useMemo(() => geo(city.lat, city.lon), [city.lat, city.lon]);
  const groupRef   = useRef<THREE.Group>(null);
  const elapsed    = useRef(0);
  const hovRef     = useRef(false);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const delay = index * 0.12;
    const t     = Math.max(0, Math.min((elapsed.current - delay) / 0.45, 1));
    const ease  = 1 - Math.pow(1 - t, 3);
    if (groupRef.current) {
      groupRef.current.position.y = 0.06 + ease * 0.28;
      groupRef.current.scale.setScalar(ease);
    }
  });

  const handleOver  = (e: any) => { e.stopPropagation(); hovRef.current = true;  setHovered(true);  document.body.style.cursor = 'pointer'; };
  const handleOut   = (e: any) => { e.stopPropagation(); hovRef.current = false; setHovered(false); document.body.style.cursor = 'auto'; };
  const handleClick = (e: any) => { e.stopPropagation(); isMobile ? _triggerLmNavDirect(city.n) : _triggerLmNav(city.n); };

  return (
    <group position={pos} quaternion={q}>
      <group ref={groupRef} position={[0, 0.06, 0]}>
        {/* Invisible hover/click hitbox */}
        <mesh onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <pointLight color="#c084fc" intensity={hovered ? 4 : 1.5} distance={1.5} decay={2} />
      </group>
    </group>
  );
}

// Haversine angular distance in degrees
function angDist(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toR = Math.PI / 180;
  const dlat = (lat2 - lat1) * toR;
  const dlon = (lon2 - lon1) * toR;
  const a = Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dlon / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a)) * (180 / Math.PI);
}

const NEARBY_MILES = 120;
const NEARBY_DEG   = NEARBY_MILES / 69.0; // 1° ≈ 69 miles
const MIN_SEP_DEG  = 0.65;                // ~45 miles min gap between shown pins

function NearbyCities({ lat, lon }: { lat: number; lon: number }) {
  const extraVersion = useExtraCitiesVersion();
  const nearby = useMemo(() => {
    const all = [...CITIES, ...getExtraCities()];
    const candidates = all
      .map(c => ({ ...c, deg: angDist(lat, lon, c.lat, c.lon) }))
      .filter(c => c.deg <= NEARBY_DEG)
      .sort((a, b) => a.deg - b.deg);

    // Greedy spatial dedup: skip a city if another already-selected city is too close
    const selected: typeof candidates = [];
    for (const c of candidates) {
      const tooClose = selected.some(s => angDist(c.lat, c.lon, s.lat, s.lon) < MIN_SEP_DEG);
      if (!tooClose) {
        selected.push(c);
        if (selected.length >= 5) break;
      }
    }
    return selected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, extraVersion]);

  return (
    <>
      {nearby.map((city, i) => (
        <CitySelectionPin key={city.n} city={city} index={i} />
      ))}
    </>
  );
}

// ─── DroppedStar — animated Geknee pin that falls onto the globe ──────────────
function DroppedStar({ lat, lon }: { lat: number; lon: number }) {
  const { pos, q } = useMemo(() => geo(lat, lon), [lat, lon]);
  const portalRef  = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (portalRef.current) {
      portalRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <group position={pos} quaternion={q}>
      {/* Purple portal — two concentric rings flat on the globe surface */}
      <group ref={portalRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
          <torusGeometry args={[0.09, 0.012, 8, 48]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.9} depthTest={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, Math.PI / 3]} renderOrder={10}>
          <torusGeometry args={[0.065, 0.007, 8, 48]} />
          <meshBasicMaterial color="#c084fc" transparent opacity={0.6} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
}

function GlobeScene() {
  const globeRef  = useRef<THREE.Group>(null);
  const currentQ  = useRef(new THREE.Quaternion());
  const animRef   = useRef<{
    startQ: THREE.Quaternion; targetQ: THREE.Quaternion;
    startT: number; onDone: () => void;
  } | null>(null);
  const [flying, setFlying] = useState(false);
  const { gl, camera } = useThree();

  // Dropped star pin state
  const [starPos, setStarPos] = useState<{ lat: number; lon: number; key: number } | null>(null);

  // ── Axis-locked drag rotation ─────────────────────────────────────────────
  // Detects dominant drag direction (H or V) after a small threshold, then
  // locks that gesture to one axis only — no diagonal globe rotation.
  const dragRef = useRef<{
    active: boolean; lastX: number; lastY: number;
    startX: number; startY: number; axis: 'h' | 'v' | null; didDrag: boolean;
  } | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const THRESHOLD = 6;
    const SENS = 0.005;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Second finger arriving — cancel single-finger drag so OrbitControls can handle pinch-zoom
      if (!e.isPrimary) { if (dragRef.current) dragRef.current.active = false; return; }
      dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, axis: null, didDrag: false };
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d?.active) return;
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      if (!d.axis) {
        const adx = Math.abs(e.clientX - d.startX);
        const ady = Math.abs(e.clientY - d.startY);
        if (adx > THRESHOLD || ady > THRESHOLD) { d.axis = adx >= ady ? 'h' : 'v'; d.didDrag = true; }
      }
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      if (!d.axis || animRef.current) return;
      if (d.axis === 'h') {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * SENS);
        currentQ.current.premultiply(q);
      } else {
        const camDir = camera.position.clone().normalize();
        const right = new THREE.Vector3(0, 1, 0).cross(camDir).normalize();
        const q = new THREE.Quaternion().setFromAxisAngle(right, dy * SENS);
        currentQ.current.premultiply(q);
      }
    };

    const onUp = () => { if (dragRef.current) dragRef.current.active = false; };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera]);

  // ── Separate state for each async input so any update rebuilds the texture ─
  const [countries,     setCountries]     = useState<GeoCollection | null>(null);
  const [states,        setStates]        = useState<GeoCollection | null>(null);
  const [terrainBitmap, setTerrainBitmap] = useState<ImageBitmap   | null>(null);
  const [bumpMap,       setBumpMap]       = useState<THREE.Texture  | null>(null);
  const [texture,       setTexture]       = useState<THREE.CanvasTexture | null>(null);
  // 0 = countries only | 1 = + states | 2 = + cities
  const [zoomLevel, setZoomLevel] = useState(0);
  const zoomLevelRef = useRef(0);
  const [camDist, setCamDist] = useState(30);
  const camDistRef = useRef(30);
  // (Mapbox auto-zoom hysteresis ref deleted — entry is now an explicit
  // two-tap on the city card's "Open map" button.)

  // Signal LocationPage when border data AND canvas texture are ready — prevents spinner
  // disappearing before borders are actually painted on the globe surface
  useEffect(() => {
    if (countries && states && texture) _triggerGlobeReady();
  }, [countries, states, texture]);

  // Rebuild canvas texture whenever GeoJSON borders or terrain image change
  useEffect(() => {
    const tex = createEarthTexture(countries, states, terrainBitmap, gl.capabilities.maxTextureSize);
    tex.minFilter  = THREE.LinearMipmapLinearFilter;
    tex.magFilter  = THREE.LinearFilter;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    setTexture(tex);
    return () => { tex.dispose(); };
  }, [countries, states, terrainBitmap, gl]);

  // Load all async resources once on mount
  useEffect(() => {
    let cancelled = false;
    let loadedBump: THREE.Texture | null = null;
    let loadedBitmap: ImageBitmap | null = null;

    // ── GeoJSON border data ──────────────────────────────────────────────────
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          fetch("/ne_110m_admin_0_countries.json"),
          fetch("/ne_10m_admin_1_states_provinces.json"),
        ]);
        if (!cRes.ok || !sRes.ok || cancelled) return;
        const [c, s]: [GeoCollection, GeoCollection] = await Promise.all([
          cRes.json(), sRes.json(),
        ]);
        if (!cancelled) { setCountries(c); setStates(s); }
      } catch { /* keep border-free texture */ }
    })();

    // ── NASA Blue Marble Next Generation — monthly terrain textures ───────────
    // Files: /public/earth_terrain_01.jpg … earth_terrain_12.jpg
    // Download all 12 months from NASA Visible Earth → Blue Marble Next Generation
    // Rename each: world.topo.bathy.2004XX.3x5400x2700.jpg → earth_terrain_XX.jpg
    // Falls back through remaining months if current month's file is absent.
    (async () => {
      const month = new Date().getMonth() + 1; // 1–12
      const pad   = (n: number) => String(n).padStart(2, '0');
      // Build candidate list: current month first, then wrap around
      const candidates = Array.from({ length: 12 }, (_, i) => ((month - 1 + i) % 12) + 1);
      for (const m of candidates) {
        try {
          const res = await fetch(`/earth_terrain_${pad(m)}.jpg`);
          if (!res.ok) continue;
          const blob = await res.blob();
          const maxTex = gl.capabilities.maxTextureSize;
          // GPU memory: 8192×4096 RGBA8 = 128MB per texture, which crashes
          // iOS standalone PWAs (~250MB tab budget). Cap at 4096 on mobile —
          // imperceptible on phone screens (sphere shows ~0.05% of texels at
          // once) and drops GPU upload to 32MB. Desktop keeps 8K.
          const texW = Math.min(maxTex, isMobile ? 4096 : 8192), texH = texW / 2;
          const bmp  = await createImageBitmap(blob, { resizeWidth: texW, resizeHeight: texH, resizeQuality: "high" });
          if (cancelled) { bmp.close?.(); break; }
          loadedBitmap = bmp;
          setTerrainBitmap(bmp);
          break; // found one — stop
        } catch { continue; }
      }
    })();

    // ── SRTM/USGS elevation bump map (/public/earth_bump.jpg) ───────────────
    // Download a grayscale SRTM shaded-relief image:
    // NASA Visible Earth → search "Earth topology bump" → earth_bump.jpg
    // Or use Natural Earth's grayscale DEM: https://www.naturalearthdata.com/
    new THREE.TextureLoader().load(
      "/earth_bump.jpg",
      t  => {
        if (cancelled) { t.dispose(); return; }
        // Only use bump map if it's high enough resolution to look good
        // (low-res maps create blocky stepped displacement on the 256-seg sphere)
        const img = t.image as HTMLImageElement;
        if (img && img.naturalWidth >= 1024) {
          t.minFilter  = THREE.LinearMipmapLinearFilter;
          t.anisotropy = gl.capabilities.getMaxAnisotropy();
          t.needsUpdate = true;
          loadedBump = t;
          setBumpMap(t);
        } else {
          t.dispose(); // too low-res — skip and release
        }
        // If too small, skip displacement — flat surface looks better than blocky steps
      },
      undefined,
      () => { /* file absent — run without bump map */ },
    );

    return () => {
      cancelled = true;
      loadedBump?.dispose();
      // Bitmap close is owned by the state-watching effect below, NOT here.
      // Closing in this cleanup races with HMR/strict-mode re-runs:
      // cleanup closes the bitmap, but `terrainBitmap` state still references
      // it, then createEarthTexture re-runs and drawImage throws InvalidStateError.
    };
  }, [gl]);

  // Close the previous bitmap when a new one replaces it, or on unmount.
  // Plugs the off-heap ImageBitmap leak (~32MB at 4096×2048) without
  // racing the React render cycle.
  useEffect(() => {
    return () => { terrainBitmap?.close?.(); };
  }, [terrainBitmap]);

  // Real-world rotation speed: one revolution per sidereal day
  const EARTH_ROT = (2 * Math.PI) / 86164;
  // Reusable objects — allocated once outside useFrame to avoid per-frame GC
  const _yAxis  = useRef(new THREE.Vector3(0, 1, 0)).current;
  const _deltaQ = useRef(new THREE.Quaternion()).current;

  useFrame(({ clock, camera }, delta) => {
    if (!globeRef.current) return;

    const pending = consumeGlobeTarget();
    if (pending && !animRef.current) {
      // Build target quaternion: rotate globe so (lat,lon) faces the camera,
      // then correct roll so the north pole stays as "up" as possible.
      const phi = (pending.lat * Math.PI) / 180;
      const lam = (pending.lon * Math.PI) / 180;
      const nx =  Math.cos(phi) * Math.cos(lam);
      const ny =  Math.sin(phi);
      const nz = -Math.cos(phi) * Math.sin(lam);
      const camDir = camera.position.clone().normalize();
      // Step 1: shortest-arc rotation that puts the target point at camDir
      const Q1 = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(nx, ny, nz), camDir,
      );
      // Step 2: find where the north pole ends up after Q1
      const northWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(Q1);
      // Step 3: project both northWorld and worldY onto the plane perpendicular to camDir
      const worldY = new THREE.Vector3(0, 1, 0);
      const northProj = northWorld.clone().sub(camDir.clone().multiplyScalar(northWorld.dot(camDir)));
      const worldYProj = worldY.clone().sub(camDir.clone().multiplyScalar(worldY.dot(camDir)));
      // Step 4: rotate around camDir to align northProj with worldYProj (no more diagonal roll)
      let targetQ = Q1;
      if (northProj.lengthSq() > 1e-6 && worldYProj.lengthSq() > 1e-6) {
        northProj.normalize();
        worldYProj.normalize();
        const rollAngle = Math.atan2(
          camDir.dot(new THREE.Vector3().crossVectors(northProj, worldYProj)),
          northProj.dot(worldYProj),
        );
        const Qroll = new THREE.Quaternion().setFromAxisAngle(camDir, rollAngle);
        targetQ = new THREE.Quaternion().multiplyQuaternions(Qroll, Q1);
      }
      setFlying(true);
      const origDone = pending.onDone;
      animRef.current = {
        startQ: currentQ.current.clone(),
        targetQ,
        startT: clock.getElapsedTime(),
        onDone: () => { setFlying(false); origDone(); },
      };
    }

    if (consumeResetTilt() && !animRef.current) {
      // De-roll globe so north pole appears at top of screen, keeping the same longitude facing.
      const Q = currentQ.current.clone();
      const camDir = camera.position.clone().normalize();
      const northWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
      const worldY = new THREE.Vector3(0, 1, 0);
      const northProj = northWorld.clone().sub(camDir.clone().multiplyScalar(northWorld.dot(camDir)));
      const worldYProj = worldY.clone().sub(camDir.clone().multiplyScalar(worldY.dot(camDir)));
      let uprightQ = Q;
      if (northProj.lengthSq() > 1e-6 && worldYProj.lengthSq() > 1e-6) {
        northProj.normalize();
        worldYProj.normalize();
        const rollAngle = Math.atan2(
          camDir.dot(new THREE.Vector3().crossVectors(northProj, worldYProj)),
          northProj.dot(worldYProj),
        );
        const Qroll = new THREE.Quaternion().setFromAxisAngle(camDir, rollAngle);
        uprightQ = new THREE.Quaternion().multiplyQuaternions(Qroll, Q);
      }
      animRef.current = { startQ: Q, targetQ: uprightQ, startT: clock.getElapsedTime(), onDone: () => {} };
    }

    if (animRef.current) {
      const elapsed = clock.getElapsedTime() - animRef.current.startT;
      const duration = 2.4;
      const t = Math.min(elapsed / duration, 1);
      // Damped spring: overshoots slightly then settles — feels organic
      const ease = Math.min(1, 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 0.8));
      currentQ.current.slerpQuaternions(animRef.current.startQ, animRef.current.targetQ, ease);
      globeRef.current.quaternion.copy(currentQ.current);
      if (t >= 1) { animRef.current.onDone(); animRef.current = null; }
    } else {
      // Continuous auto-rotation around world Y axis
      _deltaQ.setFromAxisAngle(_yAxis, delta * EARTH_ROT);
      currentQ.current.premultiply(_deltaQ);
      globeRef.current.quaternion.copy(currentQ.current);
    }
    // Update zoom level only when crossing thresholds (avoids per-frame setState)
    const dist = camera.position.length();
    const newZoom = dist < 17 ? 2 : dist < 28 ? 1 : 0;
    if (newZoom !== zoomLevelRef.current) {
      zoomLevelRef.current = newZoom;
      setZoomLevel(newZoom);
    }
    // Track camDist at 0.5-unit granularity to avoid per-frame setState
    const rounded = Math.round(dist * 2) / 2;
    if (rounded !== camDistRef.current) {
      camDistRef.current = rounded;
      setCamDist(rounded);
      // Publish for any chrome that wants to render a zoom badge.
      window.dispatchEvent(new CustomEvent("geknee:camdist", { detail: { camDist: rounded } }));
    }

    // Mapbox entry is now an explicit two-tap on the city card (Open map button)
    // rather than a zoom-distance trigger — the implicit zoom kept firing when
    // users were just exploring close-up. See memory: project_planner_mapbox_entry.
  });

  // Key encodes loaded assets so Three.js recreates the material on each upgrade
  const matKey = `${texture ? "t" : ""}${bumpMap ? "b" : ""}`;

  return (
    <>
      {/* Stars fill the full canvas / scene. Mobile gets 1/4 the count —
          6000 stars × sprite material is ~10MB extra GPU memory that's
          imperceptible at phone resolution and contributes to iOS PWA OOM. */}
      <Stars radius={140} depth={60} count={isMobile ? 1500 : 6000} factor={5} saturation={0} fade speed={0.4} />

      {/* Scene-level lighting: pulled WAY down from the previous Mario Galaxy
          intensities (ambient 1.4 / dir 1.6 / fill 2.0 / rim 1.0). Combined with
          the bright yellow city rings + per-monument spotlights, the old values
          produced a glaring halo around every landmark and washed out the
          Meshy GLB silhouettes. Per-landmark pointLights inside Lm now do the
          heavy lifting; the scene just provides bounce + shadow softening. */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 5, 14]} intensity={1.0} color="#fff4d0" />
      <pointLight position={[0, 3, 28]} intensity={1.0} color="#ffffff" />
      <pointLight position={[0, 20, 0]} intensity={0.5} color="#ffe8aa" />
      {/* Cool back-fill for atmospheric depth contrast */}
      <pointLight position={[-14, -8, -12]} intensity={0.4} color="#2040c0" />
      {/* Vivid colour bounce — saturated cyan from below like ocean reflection */}
      <pointLight position={[0, -18, 0]} intensity={0.5} color="#00ccff" />

      <group ref={globeRef}>
        {/*
          256×256 segments needed for displacementMap to push vertices into
          real 3-D mountains (Mario Galaxy planet silhouette).
          displacementScale 0.65 = exaggerated cartoon peaks.
          displacementBias -0.12 = ocean (black=0) sinks below surface,
          mountains (white=1) pop above — classic Nintendo planet look.
          Glossy candy roughness 0.18 + metalness 0.14.
        */}
        <Sphere args={[R, 256, 256]} onClick={(e) => {
          e.stopPropagation();
          if (dragRef.current?.didDrag) return; // was a drag, not a click
          if (!globeRef.current) { _triggerGlobeClick(); return; }
          // Convert world-space hit → globe-local → lat/lon
          const local = globeRef.current.worldToLocal(e.point.clone());
          const lat = Math.asin(Math.max(-1, Math.min(1, local.y / R))) * (180 / Math.PI);
          const lon = Math.atan2(-local.z, local.x) * (180 / Math.PI);
          // Drop the star pin and light up nearby cities
          setStarPos({ lat, lon, key: Date.now() });
          // Fly + zoom in the background
          flyToGlobe(lat, lon, () => zoomCamera(14));
        }}>
          <meshStandardMaterial
            key={matKey}
            map={texture ?? undefined}
            color={texture ? "#ffffff" : "#10a8ff"}
            roughness={0.72}
            metalness={0.0}
            displacementMap={bumpMap ?? undefined}
            displacementScale={bumpMap ? 0.65 : 0}
            displacementBias={bumpMap ? -0.12 : 0}
          />
        </Sphere>


        {/* Sparkle burst during fly-to animation (desktop only) */}
        {flying && !isMobile && (
          <Sparkles count={60} scale={R * 2.5} size={3} speed={1.5} color="#88bbff" opacity={0.6} />
        )}

        {/* Animals removed — now unlockable via the Explorer Collection shop */}

        {/* Landmarks — Lm self-gates on isCollected so only unlocked monuments appear */}
        <AllLandmarks />

        {/* Dropped star pin + nearby city selection pins */}
        {starPos && <DroppedStar key={starPos.key} lat={starPos.lat} lon={starPos.lon} />}
        {starPos && zoomLevel >= 1 && <NearbyCities key={`nc-${starPos.key}`} lat={starPos.lat} lon={starPos.lon} />}

        {/* Geographic labels floating above surface */}
        <GeoLabels countries={countries} states={states} zoomLevel={zoomLevel} />
        <CityLabels camDist={camDist} />

      </group>
    </>
  );
}

// ─── Auth imports ──────────────────────────────────────────────────────────────
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
const AuthModal      = dynamic(() => import("@/app/components/AuthModal"),      { ssr: false });
const TripSocialPanel = dynamic(() => import("@/app/components/TripSocialPanel"), { ssr: false });
const SettingsPanel   = dynamic(() => import("@/app/components/SettingsPanel"),   { ssr: false });
const LanguageBanner  = dynamic(() => import("@/app/components/LanguageBanner"),  { ssr: false });
const UpgradeModal    = dynamic(() => import("@/app/components/UpgradeModal"),    { ssr: false });
const MonumentShop    = dynamic(() => import("@/app/components/MonumentShop"),    { ssr: false });
const CityMapView     = dynamic(() => import("@/app/components/CityMapView"),     { ssr: false });

// ─── Page ─────────────────────────────────────────────────────────────────────
// `chromeless` mounts only the globe Canvas + loading overlay so other
// surfaces (e.g. the Atlas shell at /plan/location/atlas) can render the
// real planet as their background without bringing the planner chrome.
export default function LocationPage({ chromeless = false }: { chromeless?: boolean } = {}) {
  const [location, setLocation] = useState("");
  const [authOpen,      setAuthOpen]      = useState(false);
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [upgradeOpen,   setUpgradeOpen]   = useState(false);
  const [shopOpen,      setShopOpen]      = useState(false);
  const [cityMap, setCityMap] = useState<{ name: string; lat: number; lon: number } | null>(null);
  const [collectedMonuments, setCollectedMonumentsState] = useState<{ monumentId: string; skin: string; active: boolean }[]>([]);
  const [notifUnread,   setNotifUnread]   = useState(0);
  const [globeReady,    setGlobeReady]    = useState(false);
  // Bumped to force a Canvas remount when WebGL context is lost (Safari tab
  // switch, GPU pressure, dev HMR). Without this, the canvas stays blank.
  const [glKey, setGlKey] = useState(0);

  // Pull in the long-tail GeoNames cities + the pre-scraped city-info cache
  // (image + fact, generated by bin/scrape-city-info.mjs) once on mount.
  useEffect(() => {
    const seen = new Set(CITIES.map((c) => c.n));
    void loadExtraCities(seen);
    void loadCityInfo();
  }, []);

  // Listen for "Explore on map" requests from city labels
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ name: string; lat: number; lon: number }>).detail;
      if (d) setCityMap(d);
    };
    window.addEventListener('geknee:opencitymap', h);
    return () => window.removeEventListener('geknee:opencitymap', h);
  }, []);
  const router = useRouter();
  const { data: session } = useSession();

  // Poll for unread notification count (background, when panel is closed)
  useEffect(() => {
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return;
    const poll = async () => {
      try {
        const d = await (await fetch('/api/notifications')).json();
        setNotifUnread(d.unreadCount ?? 0);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 30_000);
    return () => clearInterval(iv);
  }, [(session?.user as { id?: string })?.id]);
  // Register globe-click navigation so Lm can navigate without prop-drilling
  useState(() => {
    _setLmNav((loc: string) => {
      setLocation(loc);
      window.dispatchEvent(new CustomEvent('geknee:globeselect', { detail: { location: loc } }));
    });
    _setLmNavDirect((loc: string) => {
      router.push(`/plan?location=${encodeURIComponent(loc)}`);
    });
    _setGlobeClick(() => {
      window.dispatchEvent(new CustomEvent('geknee:globeselect', { detail: { location: '' } }));
    });
    _setOnGlobeReady(() => setGlobeReady(true));
  });

  // Fetch collected monuments and update the bridge so Lm can show them
  useEffect(() => {
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return;
    (async () => {
      try {
        const res = await fetch('/api/monuments');
        if (!res.ok) return;
        const data = await res.json() as { collected: { monumentId: string; skin: string; active: boolean }[]; activeSkins?: Record<string, string> };
        const ids = new Set(data.collected.map((c: { monumentId: string }) => c.monumentId));
        _setCollectedMonuments(ids);
        setCollectedMonumentsState(data.collected);
        if (data.activeSkins) {
          _setActiveSkins(new Map(Object.entries(data.activeSkins)));
        }
      } catch { /* silent */ }
    })();

    // Re-fetch when monument shop closes (user may have collected something)
    const handler = () => {
      fetch('/api/monuments').then(r => r.ok ? r.json() : null).then(data => {
        if (!data) return;
        const ids = new Set<string>(data.collected.map((c: { monumentId: string }) => c.monumentId));
        _setCollectedMonuments(ids);
        setCollectedMonumentsState(data.collected);
        if (data.activeSkins) {
          _setActiveSkins(new Map(Object.entries(data.activeSkins)));
        }
      }).catch(() => {});
    };
    window.addEventListener('geknee:monuments-updated', handler);
    return () => window.removeEventListener('geknee:monuments-updated', handler);
  }, [(session?.user as { id?: string })?.id]);

  const handleInitialize = () => {
    resetGlobeTilt();
  };

  // <main> at the top route, plain <div> when mounted as background so we
  // don't emit two <main> tags on /plan/location/atlas.
  const Wrapper = chromeless ? "div" : "main";

  return (
    // position:fixed on canvas bypasses the entire layout chain — no parent
    // needs explicit height. The wrapper just provides the stacking context.
    <Wrapper style={{
      position: chromeless ? "absolute" : "fixed",
      inset: 0,
      overflow: "hidden",
      background: chromeless ? "transparent" : "#060816",
      touchAction: "none",
    }}>
      {/* One-time geolocation prompt — saves the closest airport so the
          Flights tab can pre-fill origin on every trip the user plans.
          Self-dismissing; only mounts when not already asked/captured. */}
      {!chromeless && <HomeAirportBanner />}

      {/* Deep-space gradient background. Hidden when chromeless so the host
          surface (AtlasShell) provides its own backdrop. */}
      {!chromeless && <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background:
          "radial-gradient(ellipse at 40% 45%, rgba(30,70,200,0.4) 0%, rgba(6,8,22,0.96) 58%, #030510 100%)",
      }} />}

      {/* Full-page 3D canvas — fixed to viewport so it always fills edge-to-edge */}
      <Canvas
        key={glKey}
        style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100svh", zIndex: 1, touchAction: "none" }}
        camera={{ position: [0, 0, 26], fov: 50 }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{
          antialias: !isMobile,
          powerPreference: isMobile ? "default" : "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          gl.domElement.style.touchAction = "none";
          // WebGL context loss handling. The previous remount-on-loss strategy
          // caused a crash cascade on iPhone Safari: iOS reclaimed the context
          // because it was tight on memory, we immediately bumped the Canvas
          // key, R3F tried to allocate a fresh context before iOS released the
          // old one, second allocation OOM'd → "problem repeatedly occurred."
          // New strategy: tell the host (AtlasShell) to swap to the static
          // backdrop for the rest of this session. The user keeps a usable app
          // instead of a crashing tab. preventDefault still asks the browser
          // not to permanently kill the page.
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            setGlobeReady(false);
            window.dispatchEvent(new Event("geknee:webgl-fallback"));
          }, false);
        }}
      >
        <OrbitControls
          makeDefault
          enableZoom
          enablePan={false}
          enableRotate={false}
          minDistance={11.5}
          maxDistance={45}
          zoomSpeed={isMobile ? 0.6 : 1.2}
          enableDamping
          dampingFactor={0.12}
          touches={{ ONE: 0, TWO: 2 }}
        />
        <DampingUpdater />
        <GlobeScene />
        {/* @react-three/postprocessing's EffectComposer was crashing the
            entire Canvas with "null is not an object (renderer.getContext()
            .getContextAttributes().alpha)" — getContext() returned null at
            mount time on some browsers / with current dep versions.
            Reported by user 2026-04-24 as the globe not loading. Bloom is
            decorative; safer to ship without it. To re-enable, gate it
            behind a useState that flips true only AFTER the first frame
            renders, so getContext() is guaranteed available. */}
      </Canvas>

      {/* Globe loading overlay. Suppressed in chromeless mode so the host
          surface (AtlasShell) stays visible while the globe builds its texture. */}
      {!chromeless && !globeReady && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(4,5,16,0.92)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: "3px solid rgba(167, 139, 250,0.25)",
            borderTopColor: "#a78bfa",
            animation: "spin 0.9s linear infinite",
          }} />
          <span style={{ color: "#818cf8", fontSize: 13, fontWeight: 600, letterSpacing: "0.08em" }}>
            Loading Globe…
          </span>
        </div>
      )}

      {/* Fraunces hero overlay — Atlas voice on the planner. Floats over
          the globe near the top-center, fades out once the user has picked
          a destination so it doesn't crowd the planning chrome. */}
      {!chromeless && globeReady && !location && (
        <div style={{
          position: "fixed", top: 80, left: 0, right: 0, zIndex: 15,
          textAlign: "center", pointerEvents: "none",
          padding: "0 24px",
        }}>
          <h1 style={{
            margin: 0,
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "clamp(36px, 6vw, 56px)",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            lineHeight: 1.08,
            color: "var(--brand-ink)",
            textShadow: "0 2px 30px rgba(6,8,22,0.85)",
          }}>
            Where are you{" "}
            <em style={{ fontStyle: "italic", color: "var(--brand-accent)" }}>wandering</em>
            ?
          </h1>
          <div style={{
            marginTop: 8,
            color: "var(--brand-ink-dim)",
            fontSize: 13,
            letterSpacing: "0.04em",
            textShadow: "0 2px 10px rgba(6,8,22,0.85)",
          }}>
            Spin the globe · tap a landmark · or search a city
          </div>
        </div>
      )}

      {!chromeless && (<>
      {/* Initialize / home button — top-center */}
      <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}>
        <button
          onClick={handleInitialize}
          title="Reset globe orientation"
          style={{
            background: "rgba(6,8,22,0.80)", border: "1px solid rgba(167, 139, 250,0.35)",
            backdropFilter: "blur(14px)", borderRadius: 12, color: "#c7d2fe",
            fontSize: 12, fontWeight: 700, padding: "8px 16px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
            letterSpacing: "0.05em", textTransform: "uppercase",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          Home
        </button>
      </div>

      {/* Auth / user area — top-right corner, above canvas (zIndex 20) */}
      <div style={{ position: "fixed", top: 18, right: 14, zIndex: 20, display: "flex", alignItems: "center", gap: isMobile ? 5 : 8 }}>
        {session?.user ? (
          <>
            {/* Monument Shop button */}
            <button
              onClick={() => setShopOpen(true)}
              title="Monument Collection"
              style={{
                background: "rgba(6,8,22,0.75)", border: "1px solid rgba(167, 139, 250,0.4)",
                backdropFilter: "blur(12px)", borderRadius: 10,
                color: "#c4b5fd", fontSize: isMobile ? 16 : 12, fontWeight: 700,
                padding: isMobile ? "6px 8px" : "8px 14px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: isMobile ? 0 : 6,
                boxShadow: "0 2px 12px rgba(167, 139, 250,0.2)",
              }}
            >
              {String.fromCodePoint(0x1F3DB)}{!isMobile && " Collection"}
            </button>

            {/* Go Pro button — opens the contextual pricing modal. /pricing exists
                as a standalone SEO/shareable URL but in-app goes through the modal. */}
            <button
              onClick={() => { track('upgrade_click', { surface: 'header' }); setUpgradeOpen(true); }}
              style={{
                background: "linear-gradient(135deg,#a78bfa,#7dd3fc)",
                border: "none", borderRadius: 10,
                color: "#fff", fontSize: 12, fontWeight: 700,
                padding: isMobile ? "7px 10px" : "8px 14px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                boxShadow: "0 2px 12px rgba(167, 139, 250,0.4)",
              }}
            >
              {String.fromCodePoint(0x2728)} {isMobile ? "Pro" : "Go Pro"}
            </button>

            {/* Trips & Friends button */}
            <button
              onClick={() => { setPanelOpen(true); setNotifUnread(0); }}
              title="Trips &amp; Friends"
              style={{
                background: "rgba(6,8,22,0.75)", border: "1px solid rgba(167, 139, 250,0.35)",
                backdropFilter: "blur(12px)", borderRadius: 10, color: "#c7d2fe",
                fontSize: isMobile ? 16 : 12, fontWeight: 600,
                padding: isMobile ? "6px 8px" : "8px 14px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: isMobile ? 0 : 6,
                boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
                position: "relative",
              }}
            >
              {/* Suitcase icon */}
              <svg width={isMobile ? 17 : 13} height={isMobile ? 17 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
              {!isMobile && "Trips \u0026 Friends"}
              {notifUnread > 0 && (
                <span style={{
                  position: "absolute", top: -6, right: -6,
                  background: "#f59e0b", color: "#000",
                  borderRadius: 99, fontSize: 10, fontWeight: 800,
                  padding: "1px 5px", minWidth: 16, textAlign: "center",
                  boxShadow: "0 0 0 2px rgba(6,8,22,0.9)",
                }}>
                  {notifUnread}
                </span>
              )}
            </button>

            {/* Avatar — also opens panel */}
            <button
              onClick={() => setPanelOpen(true)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 8 }}
            >
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name ?? "avatar"}
                  style={{ width: isMobile ? 30 : 34, height: isMobile ? 30 : 34, borderRadius: "50%", border: "2px solid rgba(167, 139, 250,0.5)" }}
                />
              ) : (
                <div style={{ width: isMobile ? 30 : 34, height: isMobile ? 30 : 34, borderRadius: "50%", background: "rgba(167, 139, 250,0.25)", border: "2px solid rgba(167, 139, 250,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 12 : 13, fontWeight: 700, color: "#0a0a1f" }}>
                  {(session.user.name ?? session.user.email ?? "?")[0].toUpperCase()}
                </div>
              )}
            </button>

          </>
        ) : (
          <button
            onClick={() => setAuthOpen(true)}
            style={{
              background: "rgba(6,8,22,0.75)", border: "1px solid rgba(167, 139, 250,0.35)",
              backdropFilter: "blur(12px)",
              borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600,
              padding: "9px 18px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 7,
              boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Sign in
          </button>
        )}
        {/* Hamburger / Settings — always far right */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          style={{
            background: "rgba(6,8,22,0.75)", border: "1px solid rgba(167, 139, 250,0.3)",
            backdropFilter: "blur(12px)", borderRadius: 10, color: "rgba(200,210,255,0.8)",
            width: 36, height: 36, cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 4, padding: 0,
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
          }}
        >
          <span style={{ display: "block", width: 14, height: 1.5, background: "currentColor", borderRadius: 1 }} />
          <span style={{ display: "block", width: 14, height: 1.5, background: "currentColor", borderRadius: 1 }} />
          <span style={{ display: "block", width: 14, height: 1.5, background: "currentColor", borderRadius: 1 }} />
        </button>
      </div>

      {/* Auth modal */}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      {/* Trips & Friends panel */}
      <TripSocialPanel open={panelOpen} onClose={() => setPanelOpen(false)} currentLocation={location} />

      {/* Monument collection shop */}
      <MonumentShop open={shopOpen} onClose={() => setShopOpen(false)} />
      {/* CityMapView lives below the chromeless gate so it surfaces even
          when AtlasShell mounts us as the background globe. */}

      {/* Upgrade modal */}
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

      {/* Settings panel */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Language detection banner */}
      <LanguageBanner onSwitch={(lang) => {
        try {
          const raw = localStorage.getItem("geknee_settings");
          const current = raw ? JSON.parse(raw) : {};
          localStorage.setItem("geknee_settings", JSON.stringify({ ...current, language: lang }));
        } catch { /* ignore */ }
        window.location.reload();
      }} />

      {/* Share-this-unlock toast — fires whenever Lm flips a monument from
          uncollected → collected (Phase C of the unlock-share flow). */}
      <UnlockShareToast />

      </>)}

      {cityMap && typeof document !== "undefined" && createPortal(
        <CityMapView
          name={cityMap.name}
          lat={cityMap.lat}
          lon={cityMap.lon}
          monuments={(() => {
            const activeByMk = new Map<string, string>();
            for (const c of collectedMonuments) {
              if (c.active && c.skin !== 'default') activeByMk.set(c.monumentId, c.skin);
            }
            const out: { mk: string; name: string; lat: number; lon: number; ringColor: string }[] = [];
            activeByMk.forEach((skin, mk) => {
              const coords = MONUMENT_LATLON[mk];
              const info   = INFO[mk as keyof typeof INFO] as LmInfo | undefined;
              if (!coords) return;
              const ringColor = SKIN_RING_COLOR[skin] ?? '#ffd700';
              out.push({ mk, name: info?.name ?? mk, lat: coords.lat, lon: coords.lon, ringColor });
            });
            return out;
          })()}
          onClose={() => {
            zoomCamera(20);
            setCityMap(null);
          }}
        />,
        // Portal to document.body so the city map view escapes the parent's
        // transform stacking context — without this, AtlasShell's transformed
        // wrapper traps `position: fixed` and the AtlasShell <nav> ends up
        // intercepting clicks on Search input and Return-to-globe button.
        document.body,
      )}
    </Wrapper>
  );
}
