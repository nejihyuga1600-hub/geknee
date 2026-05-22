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
  const [statesJson, citiesJson] = await Promise.all([
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
    async ({ statesJson, cities, OW, OH, BASE_W, OS, terrainPresent }) => {
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

      function featurePixelBox(f) {
        const geom = f.geometry;
        if (!geom) return null;
        let polys = [];
        if (geom.type === "Polygon") polys = [geom.coordinates];
        else if (geom.type === "MultiPolygon") polys = geom.coordinates;
        if (!polys.length) return null;
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
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [lon, lat] of biggest) {
          const [x, y] = px(lon, lat);
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        const w = maxX - minX, h = maxY - minY;
        return { cx: minX + w / 2, cy: minY + h / 2, w, h, area: w * h };
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

      // ── state borders → statesCtx ─────────────────────────────────────
      const stateBorderWidth = (terrainPresent ? 1.0 : 1.25) * OS;
      const stateBorderAlpha = terrainPresent ? 0.85 : 0.9;
      statesCtx.strokeStyle = `rgba(255,255,255,${stateBorderAlpha})`;
      statesCtx.lineWidth = stateBorderWidth;
      for (const f of states.features) {
        if (!STATE_FILTER_ADM0.has(f.properties?.adm0_a3)) continue;
        const geom = f.geometry;
        if (!geom) continue;
        const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
        for (const polygon of polys) {
          for (const ring of polygon) {
            let prevLon = ring[0][0];
            statesCtx.beginPath();
            let started = false;
            for (const [lon, lat] of ring) {
              if (started && Math.abs(lon - prevLon) > 180) {
                statesCtx.stroke(); statesCtx.beginPath(); started = false;
              }
              const [bx, by] = px(lon, lat);
              const x = bx * OS, y = by * OS;
              if (!started) { statesCtx.moveTo(x, y); started = true; }
              else { statesCtx.lineTo(x, y); }
              prevLon = lon;
            }
            statesCtx.stroke();
          }
        }
      }

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
      const [statesBlob, citiesBlob] = await Promise.all([
        new Promise(r => statesCanvas.toBlob(b => r(b), "image/webp", 0.85)),
        new Promise(r => citiesCanvas.toBlob(b => r(b), "image/webp", 0.85)),
      ]);
      if (!statesBlob || !citiesBlob) throw new Error("toBlob returned null");

      return {
        statesPlaced,
        citiesPlaced,
        statesBytes: Array.from(new Uint8Array(await statesBlob.arrayBuffer())),
        citiesBytes: Array.from(new Uint8Array(await citiesBlob.arrayBuffer())),
      };
    },
    { statesJson, cities, OW: OUTPUT_W, OH: OUTPUT_H, BASE_W, OS: OS_SCALE, terrainPresent: true }
  );

  await browser.close();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`[bake] paint complete in ${elapsed}s — placed ${result.statesPlaced} state labels, ${result.citiesPlaced} city labels`);

  const outDir = join(publicDir, "baked");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "states-overlay.webp"), Buffer.from(result.statesBytes));
  await writeFile(join(outDir, "cities-overlay.webp"), Buffer.from(result.citiesBytes));

  const stKb = (result.statesBytes.length / 1024).toFixed(0);
  const ciKb = (result.citiesBytes.length / 1024).toFixed(0);
  console.log(`[bake] wrote public/baked/states-overlay.webp (${stKb} KB)`);
  console.log(`[bake] wrote public/baked/cities-overlay.webp  (${ciKb} KB)`);
}

main().catch((err) => {
  console.error("[bake] failed:", err);
  process.exit(1);
});
