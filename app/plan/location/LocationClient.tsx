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
// Curated city list — single source of truth, also consumed by
// bin/bake-overlays.mjs to build the pre-baked cities-overlay.webp.
// JSON keeps the data static-extractable (Next.js + the bake script
// can both read it without TypeScript) while preserving the same
// shape the bake + runtime expect.
import CITIES_JSON from "./globe/cities-curated.json";
const CITIES: { n: string; lat: number; lon: number }[] = CITIES_JSON;
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
  _setCollectedOrder,
  _setActiveSkins,
  _setViewerAuthed,
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

// ─── Country-name abbreviation table ──────────────────────────────────────────
// Long country names get the abbreviated form before any further shrink-to-fit
// kicks in. Anything not in this table is rendered as-is and shrunk only if
// it would spill out of its country's bounding box.
const COUNTRY_ABBREVIATIONS: Record<string, string> = {
  "Democratic Republic of the Congo": "DR Congo",
  "Dem. Rep. Congo": "DR Congo",
  "Republic of the Congo": "Congo",
  "Congo (Brazzaville)": "Congo",
  "Bosnia and Herzegovina": "Bosnia",
  "Bosnia and Herz.": "Bosnia",
  "Central African Republic": "C.A.R.",
  "Central African Rep.": "C.A.R.",
  "Equatorial Guinea": "Eq. Guinea",
  "Eq. Guinea": "Eq. Guinea",
  "United Arab Emirates": "UAE",
  "United Kingdom": "UK",
  "United States of America": "United States",
  "Czech Republic": "Czechia",
  "Papua New Guinea": "PNG",
  "São Tomé and Príncipe": "São Tomé",
  "Sao Tome and Principe": "São Tomé",
  "Saint Vincent and the Grenadines": "St. Vincent",
  "Saint Kitts and Nevis": "St. Kitts",
  "Trinidad and Tobago": "Trinidad",
  "North Macedonia": "N. Macedonia",
  "South Sudan": "S. Sudan",
  "Solomon Islands": "Solomon Is.",
  "Falkland Islands": "Falklands",
  "Antigua and Barbuda": "Antigua",
  "Dominican Republic": "Dominican Rep.",
  "Dominican Rep.": "Dominican Rep.",
  "Western Sahara": "W. Sahara",
  "Côte d'Ivoire": "Ivory Coast",
  "Ivory Coast": "Ivory Coast",
  "Russian Federation": "Russia",
  "Korea, Republic of": "South Korea",
  "Republic of Korea": "South Korea",
  "Korea, Democratic People's Republic of": "North Korea",
  "Democratic People's Republic of Korea": "North Korea",
};

// Area-weighted centroid (signed shoelace) of a polygon ring in
// (lon, lat) space. The unweighted vertex average used previously
// pulled the label toward whichever coastline had the most digitized
// vertices — for Norway and Chile that landed the label well off the
// country's visual center. The shoelace centroid sits on the ring's
// true geometric center of mass, which reads as the right spot when
// the label hits the sphere.
function ringCentroidLonLat(ring: number[][]): [number, number] {
  let A = 0, cx = 0, cy = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    const f = x0 * y1 - x1 * y0;
    A += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  A *= 0.5;
  if (Math.abs(A) < 1e-9) {
    // Degenerate ring — fall back to vertex mean so callers still get a point.
    let sx = 0, sy = 0;
    for (const p of ring) { sx += p[0]; sy += p[1]; }
    return [sx / n, sy / n];
  }
  return [cx / (6 * A), cy / (6 * A)];
}

// Pixel bbox + centroid of the largest polygon ring of a GeoFeature on an
// equirectangular canvas of size W x H. The label baker uses this to size
// text against the country's actual screen footprint and to anchor the
// text at the visual center of the country.
function featurePixelBox(f: GeoFeature, W: number, H: number): {
  cx: number; cy: number; w: number; h: number; area: number;
} | null {
  if (!f.geometry) return null;
  const polys: number[][][][] =
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates as number[][][]]
      : f.geometry.type === "MultiPolygon"
      ? f.geometry.coordinates as number[][][][]
      : [];
  let bestRing: number[][] = [];
  for (const poly of polys)
    if (poly[0] && poly[0].length > bestRing.length) bestRing = poly[0] as number[][];
  if (!bestRing.length) return null;
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const pt of bestRing) {
    if (pt[0] < minLon) minLon = pt[0]; if (pt[0] > maxLon) maxLon = pt[0];
    if (pt[1] < minLat) minLat = pt[1]; if (pt[1] > maxLat) maxLat = pt[1];
  }
  // Antimeridian-crossing features produce huge bboxes; skip — labels would
  // render across both canvas edges and look broken.
  if (maxLon - minLon > 180) return null;
  const [cLon, cLat] = ringCentroidLonLat(bestRing);
  const cx = (cLon + 180) / 360 * W;
  const cy = (90 - cLat) / 180 * H;
  const w = (maxLon - minLon) / 360 * W;
  const h = (maxLat - minLat) / 180 * H;
  return { cx, cy, w, h, area: w * h };
}

// Greedy non-overlapping placement of baked labels. Mutates the shared
// `placed` array so the country + city baking passes share one overlap
// registry — keeps city names from colliding with country names.
function tryPlaceLabel(
  placed: Array<{ x: number; y: number; w: number; h: number }>,
  x: number, y: number, w: number, h: number,
  pad: number,
): boolean {
  const left = x - w / 2 - pad, right = x + w / 2 + pad;
  const top  = y - h / 2 - pad, bot   = y + h / 2 + pad;
  for (const p of placed) {
    if (left < p.x + p.w / 2 &&
        right > p.x - p.w / 2 &&
        top  < p.y + p.h / 2 &&
        bot  > p.y - p.h / 2) return false;
  }
  placed.push({ x, y, w: w + pad * 2, h: h + pad * 2 });
  return true;
}

// Pick a font size that fits `text` within `maxWidthPx`, between min and max.
// Returns the chosen size, or null when even at minPx the text overflows
// the box by >5%. Caller can then abbreviate, multi-line, or skip.
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number,
  minPx: number,
  maxPx: number,
  fontFamily: string,
): number | null {
  let size = maxPx;
  while (size >= minPx) {
    ctx.font = `700 ${size}px ${fontFamily}`;
    const w = ctx.measureText(text).width;
    if (w <= maxWidthPx) return size;
    size = Math.floor(size * 0.92);
  }
  ctx.font = `700 ${minPx}px ${fontFamily}`;
  return ctx.measureText(text).width <= maxWidthPx * 1.05 ? minPx : null;
}

// Render text with a soft black halo for readability against the cartoon
// biome fills or satellite imagery. Used for CITY labels where the
// background varies wildly across the dot's neighbourhood. Country
// labels use paintLabelClean instead — they read on top of a single
// biome fill and an outline makes them feel cluttered.
function paintLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  fontSize: number,
  fontFamily: string,
  weight: number = 600,
): void {
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(2, fontSize * 0.22);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

// Country labels: clean white type, no hard outline. A faint translucent
// drop shadow keeps it legible where the biome fill happens to be light
// (Antarctica, sand) without making the label feel sticker-y.
function paintLabelClean(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  fontSize: number,
  fontFamily: string,
  weight: number = 500,
): void {
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = Math.max(2, fontSize * 0.18);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
  // Reset shadow so it doesn't bleed onto subsequent paint passes.
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

// ─── Canvas Earth texture ─────────────────────────────────────────────────────
type LabelCity = { n: string; lat: number; lon: number; p?: number };

// Returns two textures: the base earth sphere (biome + borders + country
// labels) and a transparent label overlay (state + city + pin labels).
// The overlay is rendered on a separate sphere with opacity faded by
// camera distance — state + city labels only show at the "Local" zoom
// tier (camDist ≤ 10), invisible above camDist ≥ 13. Overlay can be
// rendered at higher resolution than the base so labels stay crisp at
// zoom-in.
function createEarthTexture(
  countriesGeo: GeoCollection | null,
  statesGeo: GeoCollection | null,
  terrainBitmap?: ImageBitmap | null,
  maxTexSize = 8192,
  cities: LabelCity[] = [],
  overlayScale = 1,
): { base: THREE.CanvasTexture; statesOverlay: THREE.CanvasTexture; citiesOverlay: THREE.CanvasTexture } {
  const W = Math.min(maxTexSize, 8192), H = W / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  // Overlay canvases — same lon/lat mapping as the base, optionally higher
  // resolution for crisp labels at zoom-in. Split into TWO transparent
  // overlays so each tier can fade in at its own camDist threshold:
  //   • statesCanvas → state labels (fade in at the Country/Mid boundary,
  //     d ≤ 27.7). Mirrors the prior GeoLabels zoomLevel ≥ 1 gate.
  //   • citiesCanvas → curated city labels + pins (fade in deeper at
  //     d ≤ 21.7). Mirrors the prior CityLabels camDist < 22 gate.
  // Small/regional cities (GeoNames extras) continue to render through
  // the mesh-based CityLabels with popMin-based progressive disclosure.
  // Cap at 16384 to stay within WebGL MAX_TEXTURE_SIZE on most GPUs.
  const OW = Math.min(W * overlayScale, 16384);
  const OH = OW / 2;
  const statesCanvas = document.createElement("canvas");
  statesCanvas.width = OW;
  statesCanvas.height = OH;
  const statesCtx = statesCanvas.getContext("2d")!;
  const citiesCanvas = document.createElement("canvas");
  citiesCanvas.width = OW;
  citiesCanvas.height = OH;
  const citiesCtx = citiesCanvas.getContext("2d")!;
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
    targetCtx?: CanvasRenderingContext2D,
    scale: number = 1,
  ) {
    if (!data) return;
    const c = targetCtx ?? ctx;
    c.strokeStyle = color;
    c.lineWidth   = width * scale;

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
          c.beginPath();
          let started = false;
          for (const coord of ring as number[][]) {
            const [lon, lat] = coord;
            if (started && Math.abs(lon - prevLon) > 180) {
              c.stroke(); c.beginPath(); started = false;
            }
            const [bx, by] = px(lon, lat);
            const x = bx * scale, y = by * scale;
            if (!started) { c.moveTo(x, y); started = true; }
            else          { c.lineTo(x, y); }
            prevLon = lon;
          }
          c.stroke();
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

  // State borders moved onto the STATES overlay canvas (was on the base).
  // Two motivations: (1) so the base bake doesn't depend on the 40MB states
  // JSON — it can run as soon as countries + terrain arrive — and (2) so
  // the IndexedDB cache in lib/globeCache.ts can store the entire states
  // layer (borders + labels) as a single WebP blob. Trade-off: borders
  // share the overlay's opacity gate (d ≤ 27.7), so they hide at the same
  // "Country" zoom tier where state labels do — at that range the borders
  // are sub-pixel hairlines on the screen-mapped sphere anyway.
  const STATE_FILTER = new Set(["USA", "CAN", "AUS", "BRA", "MEX", "RUS", "CHN", "IND", "ARG"]);
  const OS_state = OW / W;
  drawBorders(statesGeo, `rgba(255,255,255,${terrainBitmap ? 0.85 : 0.9})`, stateWdth,
    f => STATE_FILTER.has(f.properties.adm0_a3), statesCtx, OS_state);

  // ── Labels baked into the earth texture (no z-offset, truly laminated) ────
  // Country + city labels are painted directly onto the equirectangular
  // canvas so the text rides the sphere surface when the texture is
  // sampled. There is no Three.js mesh for these labels — they live in
  // the same pixels as the biome fills and borders. Natural texture-
  // sampling scaling gives a zoom-tier effect: city labels at small
  // texel sizes become unreadable at far zoom and gradually reveal as
  // the user zooms in, mimicking the previous floating-mesh popup-by-
  // population behavior without per-frame mesh management.
  if (countriesGeo) {
    // Pull GeKnee's UI font (Inter Tight, declared in app/layout.tsx as
    // var(--font-ui)) at bake time. Canvas font strings can't resolve CSS
    // variables, so we read the computed value from the document root and
    // fall back to a chain that still feels modern if the font hasn't
    // loaded yet. Inter Tight is the brand-aligned label font; matches
    // the rest of the chrome.
    let uiFont = '"Inter Tight", "Inter", system-ui, sans-serif';
    try {
      if (typeof document !== 'undefined') {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim();
        if (v) uiFont = `${v}, "Inter Tight", "Inter", system-ui, sans-serif`;
      }
    } catch { /* SSR or detached document — fall through */ }
    const fontFamily = uiFont;
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];

    type Candidate = {
      name: string; rawName: string; cx: number; cy: number;
      boxW: number; boxH: number; area: number;
    };
    const candidates: Candidate[] = [];
    for (const f of countriesGeo.features) {
      const rawName = (f.properties?.NAME || f.properties?.ADMIN || f.properties?.name) as string | undefined;
      if (!rawName) continue;
      const box = featurePixelBox(f, W, H);
      if (!box) continue;
      // Tiny countries below ~0.06% of canvas area get a dot/leader line
      // (or just no label) — labelling them inside their bbox always
      // overflows. Pushed into candidates with a 0 area so they sort last
      // and the greedy pass naturally skips when neighbours win first.
      candidates.push({ name: rawName, rawName, cx: box.cx, cy: box.cy, boxW: box.w, boxH: box.h, area: box.area });
    }
    candidates.sort((a, b) => b.area - a.area);

    // Per-feature font caps scale with sqrt(area) so a huge country gets a
    // proportionally bigger label without dwarfing its neighbours. Tuned
    // for an 8K canvas; mobile 4K canvas halves the budgets and that
    // halves the rendered size — labels stay legible on both.
    // Country label sizing system. Three concerns layered:
    //
    //   1. The user-facing baseline is 75% smaller than the previous pass
    //      (MAX_FONT was 90; now 22). That alone made every country read
    //      as the same size, which is wrong — Russia's label should feel
    //      bigger than Belgium's. So:
    //
    //   2. Each country picks a target font from a log-scaled curve over
    //      its canvas-pixel area. log scaling matches how country sizes
    //      actually distribute (Russia is ~600× Belgium's area; linear
    //      scaling buries everything mid-tier). The curve maps:
    //         areaRef ≥ AREA_MAX  → MAX_FONT
    //         areaRef ≤ AREA_MIN  → MIN_FONT
    //         in between          → log-interpolated
    //
    //   3. The picked font is still subject to fit-to-bbox shrinking
    //      after abbreviation lookup. So a wide-bbox country with a long
    //      name (DR Congo) gets the abbreviation; a narrow country whose
    //      name still won't fit at MIN_FONT gets skipped (better than a
    //      blurry sub-pixel label).
    const SCALE_FACTOR = W / 8192;
    // Bumped 22 → 27 (~25% larger) per user request — country names read
    // bigger now that they're the only labels visible above the "Local"
    // zoom tier.
    const MAX_FONT = 27 * SCALE_FACTOR;
    const MIN_FONT = 12 * SCALE_FACTOR;
    const PAD = 6 * SCALE_FACTOR;
    const WIDTH_BUDGET_FRAC = 0.80;
    const MIN_AREA_FOR_LABEL = (W * H) * 0.00012;
    const AREA_MAX = (W * H) * 0.05;     // Russia / antarctica scale
    const AREA_MIN = (W * H) * 0.0008;   // Belgium-ish scale

    // Overlay coordinate scale — placed[] is in BASE coords, but state +
    // city draw calls go to statesCtx / citiesCtx using these scaled
    // positions so the high-res overlay canvases stay in pixel-perfect
    // alignment with the base. OS = 1 when overlays match base; 2 when
    // overlays are 2×. Shared across both overlay tiers since they share
    // the same canvas resolution.
    const OS = OW / W;

    // ── State labels — drawn ONTO the STATES overlay canvas (fades in at
    //   the Country/Mid zoom boundary, d ≤ 27.7). Placed BEFORE countries
    //   so a country label can slide off its centroid when a state name
    //   sits there. Sizing + bbox + halo identical to the prior pass;
    //   only difference is the target canvas + scaled coordinates.
    if (statesGeo) {
      const STATE_MAX_FONT = 17 * SCALE_FACTOR;  // ~75% of country MAX
      const STATE_MIN_FONT = 8  * SCALE_FACTOR;
      const STATE_MIN_AREA = (W * H) * 0.00006;
      const STATE_AREA_MAX = (W * H) * 0.01;
      const STATE_AREA_MIN = (W * H) * 0.0003;

      type StateCandidate = { name: string; cx: number; cy: number; boxW: number; boxH: number; area: number };
      const states: StateCandidate[] = [];
      for (const f of statesGeo.features) {
        const sname = (f.properties?.name || f.properties?.NAME) as string | undefined;
        const admin = (f.properties?.admin || f.properties?.adm0_name || '') as string;
        if (!sname || !STATE_COUNTRIES.has(admin)) continue;
        const box = featurePixelBox(f, W, H);
        if (!box) continue;
        states.push({ name: sname, cx: box.cx, cy: box.cy, boxW: box.w, boxH: box.h, area: box.area });
      }
      states.sort((a, b) => b.area - a.area);

      for (const s of states) {
        if (s.area < STATE_MIN_AREA) continue;
        const widthBudget = s.boxW * WIDTH_BUDGET_FRAC;
        const t = Math.min(1, Math.max(0,
          (Math.log(s.area) - Math.log(STATE_AREA_MIN)) /
          (Math.log(STATE_AREA_MAX) - Math.log(STATE_AREA_MIN))
        ));
        const tierFont = STATE_MIN_FONT + (STATE_MAX_FONT - STATE_MIN_FONT) * t;
        const heightCap = s.boxH * 0.50;
        const maxFont = Math.min(tierFont, Math.max(STATE_MIN_FONT, heightCap));
        const size = fitFontSize(ctx, s.name, widthBudget, STATE_MIN_FONT, maxFont, fontFamily);
        if (size == null) continue;
        const measuredW = ctx.measureText(s.name).width;
        const labelH = size * 1.1;
        if (!tryPlaceLabel(placed, s.cx, s.cy, measuredW, labelH, PAD)) continue;
        statesCtx.font = `400 ${size * OS}px ${fontFamily}`;
        statesCtx.textAlign = 'center';
        statesCtx.textBaseline = 'middle';
        statesCtx.shadowColor = 'rgba(0,0,0,0.5)';
        statesCtx.shadowBlur = Math.max(2, size * OS * 0.16);
        statesCtx.fillStyle = 'rgba(255,255,255,0.85)';
        statesCtx.fillText(s.name, s.cx * OS, s.cy * OS);
        statesCtx.shadowColor = 'transparent';
        statesCtx.shadowBlur = 0;
      }
    }

    // ── City labels — drawn ONTO the CITIES overlay canvas (fades in
    //   deeper than states, d ≤ 21.7). Place BEFORE countries so the
    //   country label yields when a city pin overlaps the country's
    //   centroid. Pin marker + label both at scaled overlay coords;
    //   placed[] stays in base coords for cross-tier overlap math.
    if (cities.length > 0) {
      const sortedCities = [...cities]
        .filter(c => (c.p ?? 0) >= 0)
        .sort((a, b) => (b.p ?? 1_000_000) - (a.p ?? 1_000_000));
      const CITY_MAX_FONT = 12 * SCALE_FACTOR;
      const CITY_MIN_FONT = 6  * SCALE_FACTOR;
      const DOT_R = 2.25 * SCALE_FACTOR;
      const CITY_PAD = 3 * SCALE_FACTOR;

      for (const city of sortedCities) {
        if (city.lat > 85 || city.lat < -85) continue;
        const x = (city.lon + 180) / 360 * W;
        const y = (90 - city.lat) / 180 * H;
        const pop = city.p ?? 1_000_000;
        const popFactor = Math.min(1, Math.max(0.5, Math.log10(Math.max(pop, 10_000) / 10_000) / 3));
        const size = Math.max(CITY_MIN_FONT, CITY_MAX_FONT * popFactor);

        ctx.font = `600 ${size}px ${fontFamily}`;  // for measureText in base coords
        const textW = ctx.measureText(city.n).width;
        const labelH = size * 1.1;

        const offsets: Array<[number, number]> = [
          [0, size * 0.95],
          [textW * 0.55 + DOT_R * 2, 0],
          [0, -size * 0.95],
          [-(textW * 0.55 + DOT_R * 2), 0],
        ];
        let placedOK = false;
        let lx = x, ly = y;
        for (const [dx, dy] of offsets) {
          const tx = x + dx, ty = y + dy;
          if (tryPlaceLabel(placed, tx, ty, textW, labelH, CITY_PAD)) {
            lx = tx; ly = ty; placedOK = true; break;
          }
        }
        if (!placedOK) continue;

        citiesCtx.beginPath();
        citiesCtx.arc(x * OS, y * OS, (DOT_R + 1.5 * SCALE_FACTOR) * OS, 0, Math.PI * 2);
        citiesCtx.fillStyle = "rgba(0,0,0,0.85)";
        citiesCtx.fill();
        citiesCtx.beginPath();
        citiesCtx.arc(x * OS, y * OS, DOT_R * OS, 0, Math.PI * 2);
        citiesCtx.fillStyle = "#ffffff";
        citiesCtx.fill();
        paintLabel(citiesCtx, city.n, lx * OS, ly * OS, size * OS, fontFamily);
      }
    }

    // ── Country labels — drawn on the BASE canvas. Runs LAST so it can
    //   yield to placed city + state positions. If the centroid is
    //   blocked, the label tries four offset positions (N/S/E/W shift
    //   ~22% of bbox) before giving up entirely. Centroid is still the
    //   strong preference; offsets only kick in when needed.
    for (const c of candidates) {
      if (c.area < MIN_AREA_FOR_LABEL) continue;
      const tryNames: string[] = [];
      const abbr = COUNTRY_ABBREVIATIONS[c.rawName];
      if (abbr && abbr !== c.rawName) tryNames.push(abbr);
      tryNames.push(c.rawName);

      const widthBudget = c.boxW * WIDTH_BUDGET_FRAC;
      const t = Math.min(1, Math.max(0,
        (Math.log(c.area) - Math.log(AREA_MIN)) /
        (Math.log(AREA_MAX) - Math.log(AREA_MIN))
      ));
      const tierFont = MIN_FONT + (MAX_FONT - MIN_FONT) * t;
      const heightCap = c.boxH * 0.55;
      const maxFont = Math.min(tierFont, Math.max(MIN_FONT, heightCap));

      let chosen: { text: string; size: number } | null = null;
      for (const candidate of tryNames) {
        const size = fitFontSize(ctx, candidate, widthBudget, MIN_FONT, maxFont, fontFamily);
        if (size != null) { chosen = { text: candidate, size }; break; }
      }
      if (!chosen) continue;

      const measuredW = ctx.measureText(chosen.text).width;
      const labelH = chosen.size * 1.1;

      // Try centroid first, then offset positions within the country bbox.
      // Lets the country label slide off a city pin instead of vanishing.
      const offsets: Array<[number, number]> = [
        [0, 0],                                    // centroid (preferred)
        [0, -c.boxH * 0.22],                       // shift north
        [0,  c.boxH * 0.22],                       // shift south
        [-c.boxW * 0.22, 0],                       // shift west
        [ c.boxW * 0.22, 0],                       // shift east
      ];
      let placedAt: [number, number] | null = null;
      for (const [dx, dy] of offsets) {
        const tx = c.cx + dx, ty = c.cy + dy;
        if (tryPlaceLabel(placed, tx, ty, measuredW, labelH, PAD)) {
          placedAt = [tx, ty]; break;
        }
      }
      if (!placedAt) continue;

      paintLabelClean(ctx, chosen.text, placedAt[0], placedAt[1], chosen.size, fontFamily, 500);
    }

    // (Prior in-base-texture state + city paint passes lived here. They
    // were superseded by the tier-gated overlay canvases above — state
    // labels paint to statesCtx, curated city labels paint to citiesCtx,
    // each fading in at its own camDist threshold. Deleted entirely so
    // cities at "Country" tier (where the overlay is invisible) stay
    // hidden, matching the legacy CityLabels camDist gate.)

  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const statesTex = new THREE.CanvasTexture(statesCanvas);
  statesTex.needsUpdate = true;
  const citiesTex = new THREE.CanvasTexture(citiesCanvas);
  citiesTex.needsUpdate = true;
  return { base: tex, statesOverlay: statesTex, citiesOverlay: citiesTex };
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

  // Dismiss when another geo card is activated on mobile.
  // Ref-guarded so non-matching geo labels skip setState entirely.
  const mobileActiveRef = useRef(mobileActive);
  mobileActiveRef.current = mobileActive;
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>).detail.key;
      if (key !== `geo:${name}` && mobileActiveRef.current) setMobileActive(false);
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
      // Also dismiss any open city card — only one info card should be
      // visible at a time regardless of which kind it is.
      window.dispatchEvent(new CustomEvent("geknee:mobilecity", { detail: { key: '__dismiss__' } }));
    }
    setMobileActive(prev => !prev);
  };

  const cardWidth = kind === "country" ? "220px" : "200px";

  return (
    <group position={pos} quaternion={orientation}>
      {/* Country AND state labels are now both baked into the earth
          canvas texture (see createEarthTexture's label + state pass).
          This <group> only carries the invisible click sprite below
          that opens the Wikipedia info card on tap — no visible Text
          mesh ever renders here. */}

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
        // Flush at the sphere surface — depthTest:false on the Text material
        // means we can't z-fight even at exactly R, but a hair of epsilon
        // (1.001) keeps the orientation math stable and gives high-elevation
        // countries a slightly bigger ceiling so monument GLBs don't poke
        // through. The huge offsets used previously (1.075 / 1.019) are gone
        // now that labels visually paint on the surface rather than levitating.
        const labelR = R * (HIGH_ELEVATION_COUNTRIES.has(name) ? 1.004 : 1.001);
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
        const sPos = geoPos(c[1], c[0], R * 1.001);
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
      // Country labels are baked into the texture; the fontSize value
      // here is unused for the country render path but still consumed
      // by GeoInfoLabel's invisible click sprite for sizing the
      // hitbox, so we keep it around. State labels are still mesh-rendered
      // and target 25% smaller than the equivalent rendered country
      // label (baked country MAX_FONT 22 texels ≈ 0.169 world units →
      // states at 0.127). Density crush floor stays proportional.
      const base = it.kind === "country" ? 0.169 : 0.127;
      const thr  = it.kind === "country" ? 18    : 12;
      const min  = it.kind === "country" ? 0.090 : 0.080;
      const fontSize = minDeg >= thr ? base : Math.max(min, base * (minDeg / thr));
      return { ...it, fontSize };
    });
  }, [visible]);

  return (
    <>
      {visibleWithSize.map(({ key, name, pos, lat, lon, kind, orientation, fontSize, isInfoLabel }) => {
        // ALL country and state labels are baked into the earth texture.
        // The only thing rendered for them here is the GeoInfoLabel
        // click-hitbox sprite (when isInfoLabel is true), which fires
        // the Wikipedia info card on tap. Non-info-label sections (eg
        // countries with state subdivisions, states that have city
        // labels covering them) get no mesh at all — the baked label
        // on the texture is the entire visible affordance.
        if (!isInfoLabel) return null;
        return <GeoInfoLabel key={key} name={name} pos={pos} lat={lat} lon={lon} orientation={orientation} fontSize={fontSize} kind={kind} />;
      })}
    </>
  );
}

// --- Major world city labels (coords: WGS-84 decimal degrees) -----------------

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

function CityLabel({ n, lat, lon, pos, orientation, fontSize, leaderTo, tier }: {
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
  // 1 = mega city, 2 = curated rest, 3 = GeoNames long-tail extras.
  // Currently used only by callers for population-tier sorting; the
  // visible Text mesh is rendered for every tier now that labels are
  // mesh-painted on the sphere surface (the previous baked-cities path
  // suppressed tier 1/2 to avoid double-render, but the baked path is
  // disabled — see createEarthTexture).
  tier: 1 | 2 | 3;
}) {
  void tier;
  const [hovered,      setHovered]      = useState(false);
  const [mobileActive, setMobileActive] = useState(false);
  const [imgUrl,       setImgUrl]       = useState<string | null>(null);
  const [fact,         setFact]         = useState<string>(CITY_FACTS[n] ?? "");
  const fetchedRef = useRef(false);

  // Dismiss when another mobile city card is activated.
  // Ref-guarded so non-matching city labels skip setState entirely.
  const mobileActiveRef = useRef(mobileActive);
  mobileActiveRef.current = mobileActive;
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>).detail.key;
      if (key !== `city:${n}` && mobileActiveRef.current) setMobileActive(false);
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
      // Also dismiss any open state/country card — only one info card
      // should be visible at a time regardless of which kind it is.
      window.dispatchEvent(new CustomEvent('geknee:mobilegeo', { detail: { key: '__dismiss__' } }));
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
      {/* All curated cities are baked into the earth texture. The
          tier-3 GeoNames long-tail extras used to render a floating
          Text mesh here, but those are being removed per the user's
          ask to make all labels "land printed" — the 33K-feature
          extras are too dense to bake without blowing the texture
          build budget, so they're dropped entirely. The <group> and
          textGroupRef stay so the per-frame zoom-scale animation
          continues to work for any future visible children. */}
      <group ref={textGroupRef} />

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
      pos: geoPos(lat, lon, R * 1.001),
      tier: CITY_TIER1.has(n) ? 1 : 2,
      pop: Infinity,
    }));
    const extra = getExtraCities()
      .filter((c) => (c.p ?? 0) >= popMin)
      .map((c) => ({
        n: c.n, lat: c.lat, lon: c.lon,
        pos: geoPos(c.lat, c.lon, R * 1.001),
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
      const p = geoPos(ll.lat, ll.lon, R * 1.001);
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
    const sphereR = R * 1.001;
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
      // Mesh-based label sizing. Cities target 25% smaller than the
      // country base font (0.13 → 0.0975), then another 25% smaller per
      // the latest pass. Result: 0.0975 * 0.75 ≈ 0.073 world units at
      // default density. Density-shrink floor scales with the base.
      // Per-frame zoom scaling in CityLabel keeps the screen footprint
      // roughly constant across camDist.
      const fontSize = minDeg >= 6 ? 0.073 : Math.max(0.05, 0.073 * (minDeg / 6));

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
      {visible.map(({ n, lat, lon, pos, orientation, fontSize, leaderTo, tier }) => (
        <CityLabel key={n} n={n} lat={lat} lon={lon} pos={pos} orientation={orientation} fontSize={fontSize} leaderTo={leaderTo} tier={tier as 1 | 2 | 3} />
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

  // ── Long-press = mobile equivalent of desktop double-click zoom ─────────
  // iOS Haptic Touch + Android long-press are both ~500ms holds. Gated to
  // touch pointers so a held mouse on desktop doesn't trigger it.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

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
  // Tier-gated label overlay textures. Each fades in at a different
  // camDist threshold so the user gets progressive disclosure matching
  // the legacy hover-label rules:
  //   • statesOverlay → state labels, full opacity at d ≤ 27.7,
  //     invisible at d ≥ 28.0 (mirrors GeoLabels zoomLevel ≥ 1 gate).
  //   • citiesOverlay → curated city labels + pins, full opacity at
  //     d ≤ 21.7, invisible at d ≥ 22.0 (mirrors CityLabels camDist
  //     < 22 gate). The mesh-based CityLabels still handles smaller
  //     GeoNames extras with popMin progressive disclosure.
  // Each overlay paints onto its own transparent sphere with opacity
  // controlled per-frame. Overlay canvases render at higher resolution
  // than the base so labels stay crisp when the user zooms in.
  // Texture (not CanvasTexture) so the same state slot can hold either
  // a freshly-baked CanvasTexture from createEarthTexture OR an
  // image-loaded Texture from the IndexedDB cache (cached WebP blob →
  // Image → Texture). Both inherit from THREE.Texture and behave the
  // same in the .map slot of meshBasicMaterial.
  const [statesOverlayTexture, setStatesOverlayTexture] = useState<THREE.Texture | null>(null);
  const [citiesOverlayTexture, setCitiesOverlayTexture] = useState<THREE.Texture | null>(null);
  const statesOverlayMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const citiesOverlayMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  // 0 = countries only | 1 = + states | 2 = + cities
  const [zoomLevel, setZoomLevel] = useState(0);
  const zoomLevelRef = useRef(0);
  const [camDist, setCamDist] = useState(30);
  const camDistRef = useRef(30);

  // Deferred-mount gate for the two heaviest non-essential scene
  // subtrees: <AllLandmarks /> (276 monuments × ~10 primitive meshes
  // ≈ 2,800 meshes) and <CityLabels /> (Troika SDF text generation for
  // every visible city, expensive on first paint). Both are visually
  // additive — the user sees the earth + labels overlay first, then
  // monuments and city-label meshes pop in ~16ms later on the next
  // animation frame. Cuts hydration cost on cold load by ~1-2s on
  // desktop, ~2-3s on phone CPUs. Flag stays true once flipped so a
  // tab-switch / WebGL context loss doesn't yank the monuments back.
  const [deferredMount, setDeferredMount] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDeferredMount(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // (Mapbox auto-zoom hysteresis ref deleted — entry is now an explicit
  // two-tap on the city card's "Open map" button.)

  // Signal LocationPage when the base layer is paintable: countries +
  // base texture. Previously also waited on states, but states is a 40MB
  // JSON that can take 15s+ to fetch — and it's painted into the additive
  // state-labels overlay, NOT the base. Holding "ready" on states meant
  // the loading state hung for the slowest asset even though the user
  // already had a usable globe with terrain, country borders, country
  // labels, and curated city labels.
  useEffect(() => {
    if (countries && texture) _triggerGlobeReady();
  }, [countries, texture]);

  // Pre-baked overlay loader. Three-tier fallback for the heaviest cold-
  // load assets:
  //   1. IndexedDB cache       — ~50 ms (returning visitors)
  //   2. /baked/*.webp (CDN)   — ~500 ms-1 s (first-time visitors; produced
  //                              by bin/bake-overlays.mjs at build time,
  //                              ~3 MB combined)
  //   3. In-browser bake       — ~15-20 s (fallback if both miss, e.g.
  //                              baked files not deployed yet or IDB
  //                              disabled in Safari private mode)
  // When tier 2 hits, we ALSO save the blobs to IDB so the next visit
  // becomes tier 1.
  //   • overlayCacheHit === null  → check still in flight (gates downstream effects)
  //   • overlayCacheHit === true  → overlays already in state; skip states JSON fetch + skip overlay-state assignment after bake
  //   • overlayCacheHit === false → no cache + no static; run normal bake flow + save blobs to IDB after bake completes
  const [overlayCacheHit, setOverlayCacheHit] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const installTextures = async (statesBlob: Blob, citiesBlob: Blob) => {
        const { blobToImage } = await import('@/lib/globeCache');
        const [stImg, ciImg] = await Promise.all([blobToImage(statesBlob), blobToImage(citiesBlob)]);
        if (cancelled || !stImg || !ciImg) return false;
        const anis = gl.capabilities.getMaxAnisotropy();
        const stTex = new THREE.Texture(stImg);
        const ciTex = new THREE.Texture(ciImg);
        for (const t of [stTex, ciTex]) {
          t.minFilter  = THREE.LinearMipmapLinearFilter;
          t.magFilter  = THREE.LinearFilter;
          t.anisotropy = anis;
          t.colorSpace = THREE.SRGBColorSpace;
          t.needsUpdate = true;
        }
        setStatesOverlayTexture(stTex);
        setCitiesOverlayTexture(ciTex);
        return true;
      };

      try {
        // Tier 1: IDB cache.
        const { getCachedOverlays, saveCachedOverlays } = await import('@/lib/globeCache');
        const cached = await getCachedOverlays();
        if (cancelled) return;
        if (cached) {
          const installed = await installTextures(cached.states, cached.cities);
          if (cancelled) return;
          if (installed) { setOverlayCacheHit(true); return; }
        }

        // Tier 2: static /baked/*.webp (also caches to IDB on success).
        // credentials: 'omit' so the request matches the layout's
        // <link rel="preload" as="fetch" crossorigin="anonymous">, which
        // would otherwise be reported as "preloaded but not used" since
        // default fetch credentials are "same-origin" (= credentials sent).
        try {
          const [stRes, ciRes] = await Promise.all([
            fetch('/baked/states-overlay.webp', { credentials: 'omit' }),
            fetch('/baked/cities-overlay.webp', { credentials: 'omit' }),
          ]);
          if (cancelled) return;
          if (stRes.ok && ciRes.ok) {
            const [stBlob, ciBlob] = await Promise.all([stRes.blob(), ciRes.blob()]);
            if (cancelled) return;
            const installed = await installTextures(stBlob, ciBlob);
            if (cancelled) return;
            if (installed) {
              // Promote to IDB so next visit is tier-1 instant.
              void saveCachedOverlays(stBlob, ciBlob).catch(() => { /* non-fatal */ });
              setOverlayCacheHit(true);
              return;
            }
          }
        } catch { /* network failure / not deployed yet — fall through */ }

        // Tier 3: in-browser bake.
        setOverlayCacheHit(false);
      } catch {
        if (!cancelled) setOverlayCacheHit(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gl]);

  // Gated states JSON fetch — desktop-only AND only on overlay-cache MISS.
  // The 40MB ne_10m_admin_1_states_provinces.json is the single most
  // expensive asset on cold load (~13s fetch + ~3s parse + ~100MB heap).
  // On cache hit, the cached states overlay already contains both labels
  // and borders, so this fetch is pure waste — skip it entirely. On miss
  // we fetch normally; the bake then writes the resulting overlay to IDB
  // for next time. Mobile never fetches states regardless (memory).
  useEffect(() => {
    if (overlayCacheHit !== false) return; // wait for cache check OR skip on hit
    if (isMobile) return;
    let cancelled = false;
    (async () => {
      try {
        const sRes = await fetch("/ne_10m_admin_1_states_provinces.json");
        if (!sRes.ok || cancelled) return;
        const s: GeoCollection = await sRes.json();
        if (!cancelled) setStates(s);
      } catch { /* state borders skipped */ }
    })();
    return () => { cancelled = true; };
  }, [overlayCacheHit]);

  // Terrain "settled" gate — used by the bake effect below. Becomes true
  // when the terrain bitmap loads OR after an 8s fallback (which covers
  // the case where the loader exhausts all 12 monthly candidates and
  // gives up). Without this gate, the first bake would run as soon as
  // countries arrives (~T+1s) with no terrain, producing a cartoon-ocean
  // texture that flashes to NASA imagery a few seconds later when the
  // terrain arrives and triggers a second bake. Worse, both bakes upload
  // ~32-128MB of GPU texture and block the main thread for 1-3s each.
  // Waiting for terrain (or its timeout) collapses that to a single
  // initial bake. The states JSON arrives later and still triggers a
  // second bake, but that's additive (states overlay), not a re-paint.
  const [terrainSettled, setTerrainSettled] = useState(false);
  useEffect(() => {
    if (terrainBitmap) {
      if (!terrainSettled) setTerrainSettled(true);
      return;
    }
    if (terrainSettled) return;
    const t = setTimeout(() => setTerrainSettled(true), 8000);
    return () => clearTimeout(t);
  }, [terrainBitmap, terrainSettled]);

  // Rebuild canvas texture whenever GeoJSON borders or terrain image change.
  // Gated on terrainSettled so the first bake fires once terrain is ready
  // (or after the 8s fallback above) rather than firing immediately with
  // an empty terrainBitmap and re-firing when terrain arrives. Extra
  // GeoNames cities deliberately skipped here — 33K extras × measureText
  // per rebake would blow past the 50ms texture-build budget. The curated
  // CITIES (~500) carry most of the label intent and stay snappy.
  useEffect(() => {
    if (!countries) return;
    if (!terrainSettled) return;
    if (overlayCacheHit === null) return; // wait for IDB cache check to resolve first
    // Match the mobile cap used for the terrain bitmap below — keeps GPU
    // upload at ~32MB on iOS WKWebView instead of the 128MB+ that an 8K
    // canvas implies. Phones can't perceive the difference (sphere shows
    // only ~0.05% of texels on-screen at any moment).
    const texCap = isMobile ? 4096 : 8192;
    // Overlay canvas scale: mobile keeps 1:1 (memory-constrained), desktop
    // renders the label overlay at 2× so the state + city labels stay
    // crisp when the user zooms in to the "Local" tier where they fade in.
    const overlayScale = isMobile ? 1 : 2;
    const { base: tex, statesOverlay: stTex, citiesOverlay: ciTex } = createEarthTexture(countries, states, terrainBitmap, Math.min(gl.capabilities.maxTextureSize, texCap), CITIES, overlayScale);
    const anis = gl.capabilities.getMaxAnisotropy();
    for (const t of [tex, stTex, ciTex]) {
      t.minFilter  = THREE.LinearMipmapLinearFilter;
      t.magFilter  = THREE.LinearFilter;
      t.anisotropy = anis;
      t.needsUpdate = true;
    }
    setTexture(tex);
    // Only commit the freshly-baked overlays when we DIDN'T already
    // populate them from the IDB cache — otherwise we'd overwrite the
    // cached blobs with potentially-empty bakes (e.g., when states JSON
    // was skipped on cache hit). Dispose the unused freshly-baked
    // textures so they don't leak.
    if (overlayCacheHit) {
      stTex.dispose();
      ciTex.dispose();
    } else {
      setStatesOverlayTexture(stTex);
      setCitiesOverlayTexture(ciTex);
      // Cache-miss path: save the freshly-baked overlays to IDB so the
      // NEXT cold load skips the states JSON fetch + bake entirely.
      // Fire-and-forget; we don't block on this. WebP at q=0.85 is
      // ~1-3 MB per overlay vs ~5 MB raw PNG — small enough that
      // even iOS Safari's tight quota tolerates it. On desktop we
      // only save when states has loaded (otherwise we'd cache an
      // incomplete overlay and then write again 15s later when states
      // arrives — two cache writes + the user gets stale labels on
      // the next visit if they refresh during the gap). Mobile saves
      // unconditionally since states is never fetched there.
      const haveCompleteData = isMobile || states !== null;
      if (haveCompleteData) {
        const stCanvas = stTex.image as HTMLCanvasElement;
        const ciCanvas = ciTex.image as HTMLCanvasElement;
        void (async () => {
          try {
            const [stBlob, ciBlob] = await Promise.all([
              new Promise<Blob | null>(r => stCanvas.toBlob(b => r(b), 'image/webp', 0.85)),
              new Promise<Blob | null>(r => ciCanvas.toBlob(b => r(b), 'image/webp', 0.85)),
            ]);
            if (stBlob && ciBlob) {
              const { saveCachedOverlays } = await import('@/lib/globeCache');
              await saveCachedOverlays(stBlob, ciBlob);
            }
          } catch { /* IDB quota / private mode — non-fatal, just re-bake next time */ }
        })();
      }
    }
    return () => {
      tex.dispose();
      if (!overlayCacheHit) {
        stTex.dispose();
        ciTex.dispose();
      }
    };
  }, [countries, states, terrainBitmap, terrainSettled, overlayCacheHit, gl]);

  // Per-frame tier-gated opacity for the two label overlays. Each tier
  // fades in at its own camDist threshold so the user gets progressive
  // disclosure that matches the legacy hover-label rules (GeoLabels
  // zoomLevel ≥ 1 for states, CityLabels camDist < 22 for cities).
  // 0.3-unit fade band before each threshold keeps the snap-on feel
  // from the 576d712 commit (no slow ghost fades, but no instant pop
  // either).
  useFrame(() => {
    const d = camDistRef.current;
    // Sharp tier snap with a 0.3-unit fade just before the threshold.
    //   tierOpacity(d, 28)  → full at d ≤ 27.7, zero at d ≥ 28.0
    //   tierOpacity(d, 22)  → full at d ≤ 21.7, zero at d ≥ 22.0
    const tierOpacity = (dist: number, threshold: number) =>
      dist >= threshold      ? 0
      : dist <= threshold - 0.3 ? 1
      : (threshold - dist) / 0.3;

    // States — fade in at the Country/Mid boundary (camDist 28).
    const stM = statesOverlayMaterialRef.current;
    if (stM) {
      const o = tierOpacity(d, 28);
      if (Math.abs(stM.opacity - o) > 0.001) stM.opacity = o;
    }
    // Curated big cities — fade in at the Mid/Near boundary (camDist 22).
    const ciM = citiesOverlayMaterialRef.current;
    if (ciM) {
      const o = tierOpacity(d, 22);
      if (Math.abs(ciM.opacity - o) > 0.001) ciM.opacity = o;
    }
  });

  // Load all async resources once on mount
  useEffect(() => {
    let cancelled = false;
    let loadedBump: THREE.Texture | null = null;
    let loadedBitmap: ImageBitmap | null = null;

    // ── GeoJSON border data ──────────────────────────────────────────────────
    // Countries (820KB) always; states/provinces (39MB) only on desktop.
    // Parsing the states JSON allocates 100MB+ of JS heap — fatal on iOS Safari.
    (async () => {
      try {
        const cRes = await fetch("/ne_110m_admin_0_countries.json");
        if (!cRes.ok || cancelled) return;
        const c: GeoCollection = await cRes.json();
        if (!cancelled) setCountries(c);
      } catch { /* keep border-free texture */ }
    })();
    // States JSON fetch moved to its own effect below — gated on the IDB
    // overlay cache miss. On a returning visit (cache hit) we skip this
    // ~40MB asset entirely; on first visit we fetch it normally and the
    // resulting overlay bake gets stored to IDB for the next time.

    // ── NASA Blue Marble Next Generation — monthly terrain textures ───────────
    // Files: /public/earth_terrain_01.{webp,jpg} … earth_terrain_12.{webp,jpg}
    // WebP variants (~3 MB each, produced by bin/convert-terrain.mjs) are
    // preferred — saves ~6 MB per cold load over the JPG (~9 MB). Falls
    // back to JPG for compatibility / months that haven't been re-encoded.
    // Then falls through remaining months if current month's file is absent.
    (async () => {
      const month = new Date().getMonth() + 1; // 1–12
      const pad   = (n: number) => String(n).padStart(2, '0');
      // Build candidate list: current month first, then wrap around
      const candidates = Array.from({ length: 12 }, (_, i) => ((month - 1 + i) % 12) + 1);
      for (const m of candidates) {
        try {
          // Try WebP first (smaller), JPG as fallback. Browser sends Accept
          // header but cheaper to just try both URLs sequentially — fetch
          // is async, the failed one returns quickly with 404 from CDN.
          // credentials: 'omit' for the WebP to match the layout's
          // <link rel="preload" as="fetch" crossorigin="anonymous">.
          let res = await fetch(`/earth_terrain_${pad(m)}.webp`, { credentials: 'omit' });
          if (!res.ok) {
            res = await fetch(`/earth_terrain_${pad(m)}.jpg`);
          }
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

    // City map entry is now an explicit two-tap on the city card (Open map button)
    // rather than a zoom-distance trigger — the implicit zoom kept firing when
    // users were just exploring close-up.
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
        <Sphere
          args={[R, 256, 256]}
          onClick={(e) => {
            e.stopPropagation();
            // Long-press just fired — suppress the post-release click so it
            // doesn't re-place the portal without zoom right after the hold.
            if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
            if (dragRef.current?.didDrag) return; // was a drag, not a click
            if (!globeRef.current) { _triggerGlobeClick(); return; }
            // Convert world-space hit → globe-local → lat/lon
            const local = globeRef.current.worldToLocal(e.point.clone());
            const lat = Math.asin(Math.max(-1, Math.min(1, local.y / R))) * (180 / Math.PI);
            const lon = Math.atan2(-local.z, local.x) * (180 / Math.PI);
            // Single click: drop the portal + rotate-to-face only.
            // Double click (desktop) / long-press (mobile) adds the zoom.
            setStarPos({ lat, lon, key: Date.now() });
            flyToGlobe(lat, lon, () => {});
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (dragRef.current?.didDrag) return;
            if (!globeRef.current) return;
            const local = globeRef.current.worldToLocal(e.point.clone());
            const lat = Math.asin(Math.max(-1, Math.min(1, local.y / R))) * (180 / Math.PI);
            const lon = Math.atan2(-local.z, local.x) * (180 / Math.PI);
            // Double click: place + fly + zoom. Works on cities AND non-city land.
            setStarPos({ lat, lon, key: Date.now() });
            flyToGlobe(lat, lon, () => zoomCamera(14));
          }}
          onPointerDown={(e) => {
            // Mobile long-press = same as desktop double-click. Touch only.
            if (e.pointerType !== 'touch') return;
            if (!globeRef.current) return;
            const local = globeRef.current.worldToLocal(e.point.clone());
            const lat = Math.asin(Math.max(-1, Math.min(1, local.y / R))) * (180 / Math.PI);
            const lon = Math.atan2(-local.z, local.x) * (180 / Math.PI);
            longPressStartRef.current = { x: e.clientX, y: e.clientY };
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = setTimeout(() => {
              longPressTimerRef.current = null;
              longPressStartRef.current = null;
              if (dragRef.current?.didDrag) return;
              longPressFiredRef.current = true;
              setStarPos({ lat, lon, key: Date.now() });
              flyToGlobe(lat, lon, () => zoomCamera(14));
            }, 500);
          }}
          onPointerMove={(e) => {
            if (!longPressStartRef.current || !longPressTimerRef.current) return;
            const dx = e.clientX - longPressStartRef.current.x;
            const dy = e.clientY - longPressStartRef.current.y;
            // 8px movement cancels the hold (it's a scroll/rotation, not a press)
            if (dx * dx + dy * dy > 64) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
              longPressStartRef.current = null;
            }
          }}
          onPointerUp={() => {
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
            longPressStartRef.current = null;
          }}
          onPointerLeave={() => {
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
            longPressStartRef.current = null;
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

        {/* Tier-gated label overlay spheres. Each lives at a slightly
            different radius so the alpha blending order stays stable
            and they don't z-fight each other or the base sphere:
              • base (countries)    at R
              • states overlay      at R * 1.0007 (fade in at d=28)
              • cities overlay      at R * 1.0009 (fade in at d=22)
            Both materials are meshBasicMaterial so scene lighting
            doesn't tint the labels; depthWrite is off so they stack
            cleanly. Opacities are driven by the useFrame above. */}
        {statesOverlayTexture && (
          <Sphere args={[R * 1.0007, 128, 128]}>
            <meshBasicMaterial
              ref={statesOverlayMaterialRef}
              map={statesOverlayTexture}
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </Sphere>
        )}
        {citiesOverlayTexture && (
          <Sphere args={[R * 1.0009, 128, 128]}>
            <meshBasicMaterial
              ref={citiesOverlayMaterialRef}
              map={citiesOverlayTexture}
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </Sphere>
        )}


        {/* Sparkle burst during fly-to animation (desktop only) */}
        {flying && !isMobile && (
          <Sparkles count={60} scale={R * 2.5} size={3} speed={1.5} color="#88bbff" opacity={0.6} />
        )}

        {/* Animals removed — now unlockable via the Explorer Collection shop */}

        {/* Landmarks — Lm self-gates on isCollected so only unlocked monuments appear.
            Deferred to the second animation frame so cold-load hydration ships the
            globe + labels first, then mounts the ~2,800 primitive meshes. */}
        {deferredMount && <AllLandmarks />}

        {/* Dropped star pin + nearby city selection pins */}
        {starPos && <DroppedStar key={starPos.key} lat={starPos.lat} lon={starPos.lon} />}
        {starPos && <NearbyCities key={`nc-${starPos.key}`} lat={starPos.lat} lon={starPos.lon} />}

        {/* Geographic labels floating above surface. GeoLabels stays eager — it's
            mostly invisible click-hitbox sprites for country info popups, cheap to
            mount. CityLabels defers to the second frame because Troika SDF text
            mesh generation per visible city is the heaviest non-essential work. */}
        <GeoLabels countries={countries} states={states} zoomLevel={zoomLevel} />
        {deferredMount && <CityLabels camDist={camDist} />}

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

  // Pause the R3F render loop while the app is backgrounded. On Capacitor
  // (iOS/Android), useFrame ticking in the background burns battery AND keeps
  // the GPU context warm even when the user can't see the canvas. iOS would
  // eventually kill us under memory pressure; Android stays alive but drains
  // battery. Listen to @capacitor/app's appStateChange and the standard
  // visibilitychange so both web and native get the same behavior.
  const [renderPaused, setRenderPaused] = useState(false);
  useEffect(() => {
    let removeNative: (() => void) | null = null;
    (async () => {
      try {
        const cap = await import('@capacitor/core').catch(() => null);
        if (cap?.Capacitor.isNativePlatform()) {
          const { App } = await import('@capacitor/app');
          const handle = await App.addListener('appStateChange', ({ isActive }) => {
            setRenderPaused(!isActive);
          });
          removeNative = () => { handle.remove().catch(() => {}); };
        }
      } catch { /* @capacitor not installed at runtime */ }
    })();
    const onVis = () => setRenderPaused(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      removeNative?.();
    };
  }, []);

  // M1.2 — Memory-pressure proxy. iOS doesn't expose UIApplication memory
  // warnings to web/Capacitor, so we use sustained background time as a
  // proxy: 30s of renderPaused → dispatch geknee:mem-pressure. Listeners
  // (landmark.tsx, chat history, notifications) flush their own caches.
  // Reactivation before the timeout cancels the dispatch.
  useEffect(() => {
    if (!renderPaused) return;
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('geknee:mem-pressure'));
    }, 30_000);
    return () => clearTimeout(t);
  }, [renderPaused]);

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
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      poll();
    }, 30_000);
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

  // Drive the global viewer-auth flag so <Lm> knows whether to render
  // any monuments at all. Anonymous viewers get an empty globe; the flag
  // flips back to false on sign-out and the bridge is cleared.
  useEffect(() => {
    const userId = (session?.user as { id?: string })?.id;
    if (userId) {
      _setViewerAuthed(true);
    } else {
      _setViewerAuthed(false);
      _setCollectedMonuments(new Set());
      _setActiveSkins(new Map());
    }
  }, [(session?.user as { id?: string })?.id]);

  // Fetch collected monuments and update the bridge so Lm can show them
  useEffect(() => {
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return;
    (async () => {
      try {
        const res = await fetch('/api/monuments');
        if (!res.ok) return;
        const data = await res.json() as { collected: { monumentId: string; skin: string; active: boolean; collectedAt?: string }[]; activeSkins?: Record<string, string> };
        const ids = new Set(data.collected.map((c: { monumentId: string }) => c.monumentId));
        _setCollectedMonuments(ids);
        // Ordered list (default-skin rows only — that's the "first collected"
        // event used for journey arcs).
        _setCollectedOrder(
          data.collected
            .filter(c => c.skin === 'default' && c.collectedAt)
            .map(c => ({ monumentId: c.monumentId, collectedAt: c.collectedAt! })),
        );
        setCollectedMonumentsState(data.collected);
        if (data.activeSkins) {
          _setActiveSkins(new Map(Object.entries(data.activeSkins)));
        }
      } catch { /* silent */ }
    })();

    // Re-fetch when monument shop closes (user may have collected something)
    const handler = () => {
      fetch('/api/monuments').then(r => r.ok ? r.json() : null).then((data: { collected: { monumentId: string; skin: string; active: boolean; collectedAt?: string }[]; activeSkins?: Record<string, string> } | null) => {
        if (!data) return;
        const ids = new Set<string>(data.collected.map((c: { monumentId: string }) => c.monumentId));
        _setCollectedMonuments(ids);
        _setCollectedOrder(
          data.collected
            .filter(c => c.skin === 'default' && c.collectedAt)
            .map(c => ({ monumentId: c.monumentId, collectedAt: c.collectedAt! })),
        );
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
      {/* Deep-space gradient backdrop behind the WebGL canvas. Without this
          the transparent Canvas would show whatever `<main>` background the
          parent sets — in AtlasShell light mode that's cream `#f7f5ee`,
          against which the Stars sprite (white) is invisible. We render this
          on BOTH chromeless and non-chromeless modes so the starfield always
          has a dark sky to sit on regardless of the surrounding chrome's
          color scheme. AtlasShell chrome (top nav, sheet, etc.) lives at
          higher z-indexes and still floats on top. */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background:
          "radial-gradient(ellipse at 40% 45%, rgba(30,70,200,0.4) 0%, rgba(6,8,22,0.96) 58%, #030510 100%)",
      }} />

      {/* Full-page 3D canvas — fixed to viewport so it always fills edge-to-edge */}
      <Canvas
        key={glKey}
        style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100svh", zIndex: 1, touchAction: "none" }}
        camera={{ position: [0, 0, 26], fov: 50 }}
        dpr={[1, isMobile ? 1.5 : 2]}
        // Halt the entire render loop when backgrounded (Capacitor app
        // background OR tab hidden). useFrame stops ticking; GPU stays
        // idle. Returns to "always" on resume.
        frameloop={renderPaused ? "never" : "always"}
        // R3F fires onPointerMissed when a click hits the canvas but no
        // interactive 3D object intercepted it. We use that as "user clicked
        // empty space" → broadcast a dismiss signal so any open city/geo
        // info card closes. Cleaner than per-card click-outside listeners.
        onPointerMissed={() => {
          // Dismiss both card types — they listen to separate event channels
          // (mobilecity vs mobilegeo) but both should clear when the user
          // clicks anywhere outside an active card.
          window.dispatchEvent(new CustomEvent('geknee:mobilecity', { detail: { key: '__dismiss__' } }));
          window.dispatchEvent(new CustomEvent('geknee:mobilegeo', { detail: { key: '__dismiss__' } }));
        }}
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

      {/* Lazy-mount: defer chunk load + state hooks until the user opens
          the panel. See AtlasShell.tsx for matching pattern. TripSocialPanel
          stays eager because users open it almost every session. */}
      {authOpen     && <AuthModal      open={authOpen}     onClose={() => setAuthOpen(false)} />}
      <TripSocialPanel open={panelOpen} onClose={() => setPanelOpen(false)} currentLocation={location} />
      {shopOpen     && <MonumentShop   open={shopOpen}     onClose={() => setShopOpen(false)} />}
      {upgradeOpen  && <UpgradeModal   open={upgradeOpen}  onClose={() => setUpgradeOpen(false)} />}
      {settingsOpen && <SettingsPanel  open={settingsOpen} onClose={() => setSettingsOpen(false)} />}

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
