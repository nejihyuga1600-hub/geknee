#!/usr/bin/env node
// Download every monument's base GLB from Vercel Blob and compress to a
// mobile-friendly size for the iOS Capacitor globe (Mapbox custom layer).
//
// For each monument we pick the same tier the web preview uses (per
// `previewTierFor` in landmark.tsx) so the iOS render matches what users
// see when they tap the monument card on the web globe.
//
// Output: public/models/mapbox/<prefix>.glb — typically 200-800 KB each.
// CDN-cached by Vercel.

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "models", "mapbox");
const TMP_DIR = path.join(os.tmpdir(), "geknee-glb-compress");
const BLOB_BASE = "https://mrfgpxw07gmgmriv.public.blob.vercel-storage.com/models";

// Mirrors MONUMENT_FILE_PREFIX + previewTierFor in app/plan/location/globe/.
// Picking the LIGHTEST visually-defensible tier per monument to keep cold-
// load bandwidth bounded. Most monuments only have 'bronze' anyway.
const MONUMENTS = [
  // [outputName, blobFilename, tier]
  ["eiffel_tower",    "eiffel_tower",    "natural"],
  ["Colosseum",       "Colosseum",       "natural"],
  ["taj_mahal",       "taj_mahal",       "bronze"],
  ["great_wall",      "great_wall",      "bronze"],
  ["statue_liberty",  "statue_liberty",  "bronze"],
  ["sagrada_familia", "sagrada_familia", "bronze"],
  ["machu_picchu",    "machu_picchu",    "bronze"],
  ["christ_redeemer", "christ_redeemer", "bronze"],
  ["angkor_wat",      "angkor_wat",      "bronze"],
  ["pyramid_giza",    "pyramid_giza",    "bronze"],
  ["golden_gate",     "golden_gate",     "bronze"],
  ["big_ben",         "big_ben",         "bronze"],
  ["acropolis",       "acropolis",       "bronze"],
  ["sydney_opera",    "sydney_opera",    "bronze"],
  ["neuschwanstein",  "neuschwanstein",  "bronze"],
  ["stonehenge",      "stonehenge",      "bronze"],
  ["iguazu_falls",    "iguazu_falls",    "bronze"],
  ["tokyo_skytree",   "tokyo_skytree",   "bronze"],
  ["victoria_falls",  "victoria_falls",  "bronze"],
  ["mount_fuji",      "mount_fuji",      "bronze"],
  ["petra",           "petra",           "bronze"],
  ["niagara_falls",   "niagara_falls",   "bronze"],
  ["chichen_itza",    "chichen_itza",    "bronze"],
  ["burj_khalifa",    "burj_khalifa",    "bronze"],
  ["hagia_sophia",    "hagia_sophia",    "bronze"],
  ["notre_dame",      "notre_dame",      "bronze"],
  ["forbidden_city",  "forbidden_city",  "bronze"],
  ["uluru",           "uluru",           "bronze"],
  ["mt_rushmore",     "mt_rushmore",     "bronze"],
  ["easter_island",   "easter_island",   "bronze"],
  ["fushimi_inari",   "fushimi_inari",   "bronze"],
];

async function fetchToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });

  let ok = 0, fail = 0, totalIn = 0, totalOut = 0;
  for (const [outName, blobFile, tier] of MONUMENTS) {
    const url = `${BLOB_BASE}/${blobFile}_${tier}.glb`;
    const inPath = path.join(TMP_DIR, `${outName}.in.glb`);
    const outPath = path.join(OUT_DIR, `${outName}.glb`);
    process.stdout.write(`[${outName}] `);
    try {
      const inSize = await fetchToFile(url, inPath);
      totalIn += inSize;
      execSync(
        `npx --no gltf-transform optimize "${inPath}" "${outPath}" ` +
        `--texture-compress webp --texture-size 512 --simplify-error 0.01`,
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const stat = await fs.stat(outPath);
      totalOut += stat.size;
      console.log(`${(inSize / 1024 / 1024).toFixed(1)}MB → ${(stat.size / 1024).toFixed(0)}KB`);
      ok++;
    } catch (err) {
      console.log(`FAIL ${err.message.slice(0, 80)}`);
      fail++;
    }
  }
  console.log(`\n[summary] ${ok} ok, ${fail} failed`);
  console.log(`  total in:  ${(totalIn / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  total out: ${(totalOut / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  ratio:     ${(totalIn / totalOut).toFixed(1)}x reduction`);
}

main().catch(err => { console.error(err); process.exit(1); });
