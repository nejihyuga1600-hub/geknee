#!/usr/bin/env node
/**
 * bake-overlays.mjs — build-time pre-baker for the globe label overlays.
 *
 * Produces two transparent WebP files in /public/baked/ that the runtime
 * can load instead of:
 *   (a) fetching the 40 MB ne_10m_admin_1_states_provinces.json
 *   (b) running the in-browser canvas bake (state border draw + state
 *       label placement + city label placement, ~3-5 s on cold load)
 *
 * The bake JS inside page.evaluate is a faithful port of the state +
 * city paint passes in createEarthTexture (app/plan/location/
 * LocationClient.tsx). If you change the paint behavior there, ALSO
 * update this script AND bump OVERLAY_CACHE_VERSION in lib/globeCache.ts
 * so existing IndexedDB caches invalidate cleanly.
 *
 * Usage:
 *   node bin/bake-overlays.mjs
 *
 * Inputs (read from disk, no network):
 *   public/ne_110m_admin_0_countries.json       (only used to validate presence)
 *   public/ne_10m_admin_1_states_provinces.json (state polygons + names)
 *   app/plan/location/globe/cities-curated.json (curated city coordinates)
 *
 * Writes:
 *   public/baked/states-overlay.webp
 *   public/baked/cities-overlay.webp
 *
 * Idempotent — safe to re-run. Takes ~10-20 s end-to-end.
 */

import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicDir = join(projectRoot, "public");
const globeDir = join(projectRoot, "app/plan/location/globe");

// Output dimensions — match the desktop runtime: base canvas 8192 × 4096,
// overlay at 2× = 16384 × 8192. Mobile uses 1× at runtime but reads the
// same static file (browsers downscale at load — sphere only shows
// ~0.05% of texels at once, no visible difference). 16384 is the max
// texture size on most GPUs; staying at this cap.
const OUTPUT_W = 16384;
const OUTPUT_H = 8192;
const BASE_W = 8192;
const OS_SCALE = OUTPUT_W / BASE_W; // = 2 — matches runtime overlayScale on desktop

async function main() {
  console.log("[bake] reading geo + city data...");
  const [countriesJson, statesJson, citiesJson] = await Promise.all([
    readFile(join(publicDir, "ne_110m_admin_0_countries.json"), "utf8"),
    readFile(join(publicDir, "ne_10m_admin_1_states_provinces.json"), "utf8"),
    readFile(join(globeDir, "cities-curated.json"), "utf8"),
  ]);
  const cities = JSON.parse(citiesJson);
  console.log(`[bake] curated cities: ${cities.length}`);

  console.log("[bake] launching chromium...");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  await page.goto("about:blank");

  console.log("[bake] running paint pass...");
  const t0 = Date.now();

  const result = await page.evaluate(
    async ({ countriesJson, statesJson, cities, OW, OH, BASE_W, OS, terrainPresent }) => {
      const countries = JSON.parse(countriesJson);
      const states = JSON.parse(statesJson);
      const W = BASE_W;
      const H = W / 2;

      // ── helpers (ported from createEarthTexture) ───────────────────────
      const px = (lon, lat) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];

      const STATE_COUNTRIES = new Set([
        "United States of America",
        "Canada",
        "Mexico",
        "Brazil",
        "Russia",
        "China",
        "India",
        "Australia",
        "Argentina",
      ]);
      const STATE_FILTER_ADM0 = new Set(["USA", "CAN", "AUS", "BRA", "MEX", "RUS", "CHN", "IND", "ARG"]);

      // Ray-casting point-in-polygon test.
      function pointInRing(x, y, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const xi = ring[i][0], yi = ring[i][1];
          const xj = ring[j][0], yj = ring[j][1];
          const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      }

      // Squared distance from (px,py) to nearest edge of ring.
      function pointToRingDistSq(px_, py_, ring) {
        let minSq = Infinity;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const xi = ring[i][0], yi = ring[i][1];
          const xj = ring[j][0], yj = ring[j][1];
          const dx = xj - xi, dy = yj - yi;
          const len2 = dx * dx + dy * dy;
          let t = 0;
          if (len2 > 0) {
            t = ((px_ - xi) * dx + (py_ - yi) * dy) / len2;
            t = Math.max(0, Math.min(1, t));
          }
          const cx = xi + t * dx, cy = yi + t * dy;
          const d2 = (px_ - cx) * (px_ - cx) + (py_ - cy) * (py_ - cy);
          if (d2 < minSq) minSq = d2;
        }
        return minSq;
      }

      // Pole of inaccessibility — interior point farthest from any edge.
      // Always inside the ring (unlike the shoelace centroid which can
      // land in the ocean for concave shapes). Coarse 64×64 grid scan
      // over the bbox; sufficient for canvas-resolution label anchoring.
      function ringLabelAnchor(ring) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of ring) {
          if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
        }
        const w = maxX - minX, h = maxY - minY;
        if (w <= 0 || h <= 0) return null;
        const N = 64;
        let bestX = (minX + maxX) * 0.5, bestY = (minY + maxY) * 0.5, bestD2 = -1;
        for (let i = 1; i < N; i++) {
          const x = minX + (i / N) * w;
          for (let j = 1; j < N; j++) {
            const y = minY + (j / N) * h;
            if (!pointInRing(x, y, ring)) continue;
            const d2 = pointToRingDistSq(x, y, ring);
            if (d2 > bestD2) { bestX = x; bestY = y; bestD2 = d2; }
          }
        }
        return bestD2 < 0 ? null : [bestX, bestY];
      }

      // Pixel bbox + label anchor of the largest polygon ring of a
      // GeoFeature. Uses ringLabelAnchor (pole of inaccessibility) for
      // the label position to keep labels INSIDE concave countries.
      function featurePixelBox(f) {
        const geom = f.geometry;
        if (!geom) return null;
        let polys = [];
        if (geom.type === "Polygon") polys = [geom.coordinates];
        else if (geom.type === "MultiPolygon") polys = geom.coordinates;
        if (!polys.length) return null;
        // Pick the largest ring (handles Alaska/Hawaii — the contiguous
        // mainland is the dominant footprint).
        let biggest = polys[0][0];
        let biggestArea = 0;
        for (const poly of polys) {
          const ring = poly[0];
          if (!ring) continue;
          let area = 0;
          for (let i = 0; i < ring.length - 1; i++) {
            area += Math.abs((ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] - ring[i][1]));
          }
          if (area > biggestArea) { biggestArea = area; biggest = ring; }
        }
        // Bbox in pixel space for sizing.
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const [lon, lat] of biggest) {
          if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        }
        // Antimeridian crossings — skip; labels would span both edges.
        if (maxLon - minLon > 180) return null;
        // Anchor via pole-of-inaccessibility, in (lon,lat) space, then
        // project to canvas pixels. Falls back to bbox center if the
        // grid scan finds no interior point (rare, degenerate ring).
        const anchorLL = ringLabelAnchor(biggest) ?? [(minLon + maxLon) * 0.5, (minLat + maxLat) * 0.5];
        const [aLon, aLat] = anchorLL;
        const [ax, ay] = px(aLon, aLat);
        const [x0, y0] = px(minLon, maxLat);
        const [x1, y1] = px(maxLon, minLat);
        const w = x1 - x0, h = y1 - y0;
        return { cx: ax, cy: ay, w, h, area: w * h };
      }

      function tryPlaceLabel(placed, cx, cy, w, h, pad) {
        const x0 = cx - w / 2 - pad, x1 = cx + w / 2 + pad;
        const y0 = cy - h / 2 - pad, y1 = cy + h / 2 + pad;
        for (const p of placed) {
          if (!(x1 < p.x || x0 > p.x + p.w || y1 < p.y || y0 > p.y + p.h)) return false;
        }
        placed.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        return true;
      }

      function fitFontSize(mctx, text, widthBudget, minF, maxF, family) {
        for (let s = maxF; s >= minF; s -= 1) {
          mctx.font = `600 ${s}px ${family}`;
          if (mctx.measureText(text).width <= widthBudget) return s;
        }
        return null;
      }

      function paintLabel(c, text, x, y, size, family) {
        c.font = `600 ${size}px ${family}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.shadowColor = "rgba(0,0,0,0.95)";
        c.shadowBlur = Math.max(2, size * 0.18);
        c.fillStyle = "rgba(255,255,255,0.98)";
        c.fillText(text, x, y);
        c.shadowColor = "transparent";
        c.shadowBlur = 0;
      }

      // ── canvases ───────────────────────────────────────────────────────
      // Three canvases:
      //   • bordersCanvas → country + state borders, halo+white. Loaded
      //     by the runtime and drawImage'd into the BASE canvas after
      //     the terrain so borders sit on the same pixel plane as
      //     terrain + labels (no z-offset, no parallax). Lets us skip
      //     fetching the 40MB states JSON entirely on cold load.
      //   • statesCanvas  → state label TEXT only (tier-gated overlay).
      //   • citiesCanvas  → city label text + pins (tier-gated overlay).
      const bordersCanvas = document.createElement("canvas");
      bordersCanvas.width = OW; bordersCanvas.height = OH;
      const bordersCtx = bordersCanvas.getContext("2d");
      bordersCtx.lineJoin = "miter"; bordersCtx.miterLimit = 4; bordersCtx.lineCap = "butt";

      const statesCanvas = document.createElement("canvas");
      statesCanvas.width = OW; statesCanvas.height = OH;
      const statesCtx = statesCanvas.getContext("2d");
      statesCtx.lineJoin = "miter"; statesCtx.miterLimit = 4; statesCtx.lineCap = "butt";

      const citiesCanvas = document.createElement("canvas");
      citiesCanvas.width = OW; citiesCanvas.height = OH;
      const citiesCtx = citiesCanvas.getContext("2d");
      citiesCtx.lineJoin = "miter"; citiesCtx.miterLimit = 4; citiesCtx.lineCap = "butt";

      // Shared collision array. Country labels are NOT in this bake —
      // they're painted into the base canvas at runtime. Since base +
      // overlays sit on separate transparent spheres, occasional label
      // overlap between country (base) and city (overlay) is acceptable.
      const placed = [];
      const SCALE_FACTOR = W / 8192;
      const PAD = 6 * SCALE_FACTOR;
      const WIDTH_BUDGET_FRAC = 0.80;
      const fontFamily = '"Inter Tight", "Inter", system-ui, sans-serif';

      // ── border strokes → bordersCtx (countries + states, halo+white) ──
      // Two-pass per geometry: dark wide halo first, then white narrow
      // stroke on top. Same technique as the runtime country labels —
      // gives the line enough contrast to read on top of busy satellite
      // imagery when the runtime drawImage's this overlay onto the
      // BASE canvas.
      function paintRingsHalo(features, filter, baseWidth, alphaWhite, alphaHalo, haloPad) {
        const haloW = (baseWidth + haloPad) * OS;
        const whiteW = baseWidth * OS;
        // halo pass
        bordersCtx.strokeStyle = `rgba(0,0,0,${alphaHalo})`;
        bordersCtx.lineWidth = haloW;
        for (const f of features) {
          if (filter && !filter(f)) continue;
          const geom = f.geometry;
          if (!geom) continue;
          const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
          for (const polygon of polys) for (const ring of polygon) {
            let prevLon = ring[0][0];
            bordersCtx.beginPath();
            let started = false;
            for (const [lon, lat] of ring) {
              if (started && Math.abs(lon - prevLon) > 180) {
                bordersCtx.stroke(); bordersCtx.beginPath(); started = false;
              }
              const [bx, by] = px(lon, lat);
              const x = bx * OS, y = by * OS;
              if (!started) { bordersCtx.moveTo(x, y); started = true; }
              else { bordersCtx.lineTo(x, y); }
              prevLon = lon;
            }
            bordersCtx.stroke();
          }
        }
        // white pass
        bordersCtx.strokeStyle = `rgba(255,255,255,${alphaWhite})`;
        bordersCtx.lineWidth = whiteW;
        for (const f of features) {
          if (filter && !filter(f)) continue;
          const geom = f.geometry;
          if (!geom) continue;
          const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
          for (const polygon of polys) for (const ring of polygon) {
            let prevLon = ring[0][0];
            bordersCtx.beginPath();
            let started = false;
            for (const [lon, lat] of ring) {
              if (started && Math.abs(lon - prevLon) > 180) {
                bordersCtx.stroke(); bordersCtx.beginPath(); started = false;
              }
              const [bx, by] = px(lon, lat);
              const x = bx * OS, y = by * OS;
              if (!started) { bordersCtx.moveTo(x, y); started = true; }
              else { bordersCtx.lineTo(x, y); }
              prevLon = lon;
            }
            bordersCtx.stroke();
          }
        }
      }
      // Countries: 2px white with 1.6px halo padding, alpha 0.98 / 0.55
      paintRingsHalo(countries.features, null, terrainPresent ? 2.0 : 2.5, terrainPresent ? 0.98 : 1.0, 0.55, 1.6);
      // States: 1px white with 1.2px halo padding, alpha 0.85 / 0.45,
      // filtered to the 9 admin-0 codes with visible subdivisions.
      paintRingsHalo(states.features, (f) => STATE_FILTER_ADM0.has(f.properties?.adm0_a3),
        terrainPresent ? 1.0 : 1.25, terrainPresent ? 0.85 : 0.9, 0.45, 1.2);

      // ── state labels → statesCtx ──────────────────────────────────────
      const STATE_MAX_FONT = 17 * SCALE_FACTOR;
      const STATE_MIN_FONT = 8 * SCALE_FACTOR;
      const STATE_MIN_AREA = (W * H) * 0.00006;
      const STATE_AREA_MAX = (W * H) * 0.01;
      const STATE_AREA_MIN = (W * H) * 0.0003;
      const stateCandidates = [];
      for (const f of states.features) {
        const sname = f.properties?.name || f.properties?.NAME;
        const admin = f.properties?.admin || f.properties?.adm0_name || "";
        if (!sname || !STATE_COUNTRIES.has(admin)) continue;
        const box = featurePixelBox(f);
        if (!box) continue;
        stateCandidates.push({ name: sname, ...box });
      }
      stateCandidates.sort((a, b) => b.area - a.area);

      // measureText needs a base-coord ctx (same font scale as runtime placement math).
      const baseMeasureCanvas = document.createElement("canvas");
      baseMeasureCanvas.width = 1; baseMeasureCanvas.height = 1;
      const baseMeasureCtx = baseMeasureCanvas.getContext("2d");

      let statesPlaced = 0;
      for (const s of stateCandidates) {
        if (s.area < STATE_MIN_AREA) continue;
        const widthBudget = s.w * WIDTH_BUDGET_FRAC;
        const t = Math.min(1, Math.max(0,
          (Math.log(s.area) - Math.log(STATE_AREA_MIN)) /
          (Math.log(STATE_AREA_MAX) - Math.log(STATE_AREA_MIN))
        ));
        const tierFont = STATE_MIN_FONT + (STATE_MAX_FONT - STATE_MIN_FONT) * t;
        const heightCap = s.h * 0.50;
        const maxFont = Math.min(tierFont, Math.max(STATE_MIN_FONT, heightCap));
        const size = fitFontSize(baseMeasureCtx, s.name, widthBudget, STATE_MIN_FONT, maxFont, fontFamily);
        if (size == null) continue;
        const measuredW = baseMeasureCtx.measureText(s.name).width;
        const labelH = size * 1.1;
        if (!tryPlaceLabel(placed, s.cx, s.cy, measuredW, labelH, PAD)) continue;
        statesCtx.font = `400 ${size * OS}px ${fontFamily}`;
        statesCtx.textAlign = "center"; statesCtx.textBaseline = "middle";
        statesCtx.shadowColor = "rgba(0,0,0,0.5)";
        statesCtx.shadowBlur = Math.max(2, size * OS * 0.16);
        statesCtx.fillStyle = "rgba(255,255,255,0.85)";
        statesCtx.fillText(s.name, s.cx * OS, s.cy * OS);
        statesCtx.shadowColor = "transparent";
        statesCtx.shadowBlur = 0;
        statesPlaced++;
      }

      // ── city labels → citiesCtx ───────────────────────────────────────
      const sortedCities = [...cities]
        .filter(c => (c.p ?? 0) >= 0)
        .sort((a, b) => (b.p ?? 1_000_000) - (a.p ?? 1_000_000));
      const CITY_MAX_FONT = 12 * SCALE_FACTOR;
      const CITY_MIN_FONT = 6 * SCALE_FACTOR;
      const DOT_R = 2.25 * SCALE_FACTOR;
      const CITY_PAD = 3 * SCALE_FACTOR;

      let citiesPlaced = 0;
      for (const city of sortedCities) {
        if (city.lat > 85 || city.lat < -85) continue;
        const x = ((city.lon + 180) / 360) * W;
        const y = ((90 - city.lat) / 180) * H;
        const pop = city.p ?? 1_000_000;
        const popFactor = Math.min(1, Math.max(0.5, Math.log10(Math.max(pop, 10_000) / 10_000) / 3));
        const size = Math.max(CITY_MIN_FONT, CITY_MAX_FONT * popFactor);

        baseMeasureCtx.font = `600 ${size}px ${fontFamily}`;
        const textW = baseMeasureCtx.measureText(city.n).width;
        const labelH = size * 1.1;

        const offsets = [
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
        citiesPlaced++;
      }

      // ── encode → WebP ─────────────────────────────────────────────────
      const [bordersBlob, statesBlob, citiesBlob] = await Promise.all([
        new Promise(r => bordersCanvas.toBlob(b => r(b), "image/webp", 0.85)),
        new Promise(r => statesCanvas.toBlob(b => r(b), "image/webp", 0.85)),
        new Promise(r => citiesCanvas.toBlob(b => r(b), "image/webp", 0.85)),
      ]);
      if (!bordersBlob || !statesBlob || !citiesBlob) throw new Error("toBlob returned null");

      return {
        statesPlaced,
        citiesPlaced,
        bordersBytes: Array.from(new Uint8Array(await bordersBlob.arrayBuffer())),
        statesBytes:  Array.from(new Uint8Array(await statesBlob.arrayBuffer())),
        citiesBytes:  Array.from(new Uint8Array(await citiesBlob.arrayBuffer())),
      };
    },
    { countriesJson, statesJson, cities, OW: OUTPUT_W, OH: OUTPUT_H, BASE_W, OS: OS_SCALE, terrainPresent: true }
  );

  await browser.close();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`[bake] paint complete in ${elapsed}s — placed ${result.statesPlaced} state labels, ${result.citiesPlaced} city labels`);

  const outDir = join(publicDir, "baked");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "borders-overlay.webp"), Buffer.from(result.bordersBytes));
  await writeFile(join(outDir, "states-overlay.webp"),  Buffer.from(result.statesBytes));
  await writeFile(join(outDir, "cities-overlay.webp"),  Buffer.from(result.citiesBytes));

  const bdKb = (result.bordersBytes.length / 1024).toFixed(0);
  const stKb = (result.statesBytes.length  / 1024).toFixed(0);
  const ciKb = (result.citiesBytes.length  / 1024).toFixed(0);
  console.log(`[bake] wrote public/baked/borders-overlay.webp (${bdKb} KB)`);
  console.log(`[bake] wrote public/baked/states-overlay.webp  (${stKb} KB)`);
  console.log(`[bake] wrote public/baked/cities-overlay.webp  (${ciKb} KB)`);
}

main().catch((err) => {
  console.error("[bake] failed:", err);
  process.exit(1);
});
