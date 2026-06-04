#!/usr/bin/env node
// Compress every available skin variant for every monument into the
// mobile-friendly /public/models/mapbox/<prefix>_<skin>.glb format used
// by the iOS Capacitor globe. Source GLBs come from Vercel Blob (the same
// uncompressed Meshy outputs the web globe uses).
//
// Skips any variant that's already present at the output path — re-runs
// after promoting a new skin only compress what's new.
//
// Skin set is derived from AVAILABLE_SKINS in app/plan/location/globe/skins.ts.

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "models", "mapbox");
const TMP_DIR = path.join(os.tmpdir(), "geknee-skin-compress");
const BLOB_BASE = "https://mrfgpxw07gmgmriv.public.blob.vercel-storage.com/models";

// Mirrors MONUMENT_FILE_PREFIX in skins.ts
const FILE_PREFIX = {
  eiffelTower: "eiffel_tower", colosseum: "Colosseum", tajMahal: "taj_mahal",
  greatWall: "great_wall", statueLiberty: "statue_liberty",
  sagradaFamilia: "sagrada_familia", machuPicchu: "machu_picchu",
  christRedeem: "christ_redeemer", angkorWat: "angkor_wat",
  pyramidGiza: "pyramid_giza", goldenGate: "golden_gate", bigBen: "big_ben",
  acropolis: "acropolis", sydneyOpera: "sydney_opera",
  neuschwanstein: "neuschwanstein", stonehenge: "stonehenge",
  iguazuFalls: "iguazu_falls", tokyoSkytree: "tokyo_skytree",
  victoriaFalls: "victoria_falls", mountFuji: "mount_fuji", petra: "petra",
  niagaraFalls: "niagara_falls", chichenItza: "chichen_itza",
  burjKhalifa: "burj_khalifa", hagiaSophia: "hagia_sophia",
  notreDameF: "notre_dame", forbiddenCity: "forbidden_city", uluru: "uluru",
  mtRushmore: "mt_rushmore", easterIsland: "easter_island",
  fushimiInari: "fushimi_inari",
};

// Mirrors AVAILABLE_SKINS in skins.ts
const AVAILABLE = {
  victoriaFalls: ["bronze"], tokyoSkytree: ["bronze"], iguazuFalls: ["bronze"],
  stonehenge: ["bronze"], neuschwanstein: ["bronze"], acropolis: ["bronze"],
  goldenGate: ["bronze"], angkorWat: ["bronze"],
  pyramidGiza: ["bronze", "silver", "gold", "diamond", "aurora", "celestial"],
  bigBen: ["stone", "bronze", "silver", "gold", "diamond", "aurora", "celestial", "damascus"],
  christRedeem: ["bronze", "silver", "gold", "diamond", "aurora", "celestial", "damascus"],
  colosseum: ["stone", "bronze", "silver", "gold", "diamond", "aurora", "celestial", "natural"],
  eiffelTower: ["stone", "bronze", "silver", "gold", "diamond", "aurora", "celestial", "damascus", "natural"],
  greatWall: ["bronze", "gold", "diamond", "aurora", "celestial", "silver"],
  machuPicchu: ["bronze", "silver", "gold", "diamond", "aurora", "celestial"],
  sagradaFamilia: ["bronze", "celestial"],
  statueLiberty: ["stone", "bronze", "silver", "gold", "diamond", "aurora", "celestial"],
  sydneyOpera: ["bronze", "silver", "gold", "diamond", "aurora", "celestial"],
  tajMahal: ["stone", "bronze", "silver", "gold", "diamond", "aurora", "celestial"],
  mountFuji: ["bronze"], petra: ["bronze"], niagaraFalls: ["bronze"],
  chichenItza: ["bronze"], burjKhalifa: ["bronze"], hagiaSophia: ["bronze"],
  notreDameF: ["bronze"], forbiddenCity: ["bronze"], uluru: ["bronze"],
  mtRushmore: ["bronze"], easterIsland: ["bronze"], fushimiInari: ["bronze"],
};

async function fetchToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

async function exists(p) {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });

  let ok = 0, fail = 0, skip = 0, totalIn = 0, totalOut = 0;
  for (const [mk, prefix] of Object.entries(FILE_PREFIX)) {
    const skins = AVAILABLE[mk] || [];
    for (const skin of skins) {
      const outName = `${prefix}_${skin}.glb`;
      const outPath = path.join(OUT_DIR, outName);
      if (await exists(outPath)) {
        skip++;
        continue;
      }
      const url = `${BLOB_BASE}/${prefix}_${skin}.glb`;
      const inPath = path.join(TMP_DIR, `${prefix}_${skin}.in.glb`);
      process.stdout.write(`[${prefix}_${skin}] `);
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
  }
  console.log(`\n[summary] ${ok} ok, ${skip} already present, ${fail} failed`);
  console.log(`  total in:  ${(totalIn / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  total out: ${(totalOut / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(err => { console.error(err); process.exit(1); });
