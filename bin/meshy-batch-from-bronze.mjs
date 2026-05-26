#!/usr/bin/env node
// bin/meshy-batch-from-bronze.mjs
//
// Credit-efficient batch generator: takes the photoreal bronze coin renders
// we generated for each monument and pipes them through the existing meshy
// pipeline. Per monument:
//   1. Upload the bronze JPG to Vercel Blob (one-time, public URL).
//   2. meshy-new-skin --mode image --style stone   → produces the BASE GLB.
//   3. Read /tmp/meshy-preview/<prefix>_stone.json → get base GLB URL.
//   4. meshy-new-skin --mode retexture --base-url ...  → re-texture into
//      bronze, silver, gold, diamond, aurora, celestial.
//   5. Download every GLB locally to public/models/preview/ so the operator
//      can open them in Preview/Finder and confirm before promoting.
//
// Why this saves credits:
//   - image-to-3D once (anchored to a real reference) beats text-to-3D for
//     silhouette accuracy; no re-rolls.
//   - Retexture for each subsequent skin is much cheaper than fresh
//     text-to-3D per skin.
//
// Usage:
//   node bin/meshy-batch-from-bronze.mjs --all
//   node bin/meshy-batch-from-bronze.mjs --mk statueLiberty
//   node bin/meshy-batch-from-bronze.mjs --mk colosseum --skins bronze,silver,gold
//   node bin/meshy-batch-from-bronze.mjs --dry-run --all
//
// Env:
//   MESHY_API_KEY            (required for meshy-new-skin)
//   BLOB_READ_WRITE_TOKEN    (required for upload + meshy-new-skin)

import { put } from '@vercel/blob';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { resolve, basename } from 'path';

const BRONZE_DIR = resolve(process.cwd(), 'public/brand/monuments/bronze');
const PREVIEW_GLB_DIR = resolve(process.cwd(), 'public/models/preview');

// monumentKey → { bronze JPG file, file prefix used by meshy-new-skin }
// Add new entries as you generate more bronze ref renders.
const MONUMENTS = {
  // Wave 1 (already done for Eiffel pre-existing)
  eiffelTower:    { file: 'eiffel_tower_bronze.jpg',     prefix: 'eiffel_tower' },
  // Wave 1 cont.
  statueLiberty:  { file: 'statue_of_liberty_bronze.jpg', prefix: 'statue_liberty' },
  bigBen:         { file: 'big_ben_bronze.jpg',           prefix: 'big_ben' },
  colosseum:      { file: 'colosseum_bronze.jpg',         prefix: 'Colosseum' },
  tajMahal:       { file: 'taj_mahal_bronze.jpg',         prefix: 'taj_mahal' },
  christRedeem:   { file: 'christ_redeemer_bronze.jpg',   prefix: 'christ_redeemer' },
  sydneyOpera:    { file: 'sydney_opera_bronze.jpg',      prefix: 'sydney_opera' },
  // Wave 2
  greatWall:      { file: 'great_wall_bronze.jpg',        prefix: 'great_wall' },
  sagradaFamilia: { file: 'sagrada_familia_bronze.jpg',   prefix: 'sagrada_familia' },
  machuPicchu:    { file: 'machu_picchu_bronze.jpg',      prefix: 'machu_picchu' },
  angkorWat:      { file: 'angkor_wat_bronze.jpg',        prefix: 'angkor_wat' },
  pyramidGiza:    { file: 'pyramid_giza_bronze.jpg',      prefix: 'pyramid_giza' },
  goldenGate:     { file: 'golden_gate_bronze.jpg',       prefix: 'golden_gate' },
  acropolis:      { file: 'acropolis_bronze.jpg',         prefix: 'acropolis' },
  neuschwanstein: { file: 'neuschwanstein_bronze.jpg',    prefix: 'neuschwanstein' },
  stonehenge:     { file: 'stonehenge_bronze.jpg',        prefix: 'stonehenge' },
  iguazuFalls:    { file: 'iguazu_falls_bronze.jpg',      prefix: 'iguazu_falls' },
  tokyoSkytree:   { file: 'tokyo_skytree_bronze.jpg',     prefix: 'tokyo_skytree' },
  victoriaFalls:  { file: 'victoria_falls_bronze.jpg',    prefix: 'victoria_falls' },
  // Wave 3 (popularity-ordered)
  mountFuji:      { file: 'mount_fuji_bronze.jpg',        prefix: 'mount_fuji' },
  petra:          { file: 'petra_bronze.jpg',             prefix: 'petra' },
  niagaraFalls:   { file: 'niagara_falls_bronze.jpg',     prefix: 'niagara_falls' },
  chichenItza:    { file: 'chichen_itza_bronze.jpg',      prefix: 'chichen_itza' },
  burjKhalifa:    { file: 'burj_khalifa_bronze.jpg',      prefix: 'burj_khalifa' },
  hagiaSophia:    { file: 'hagia_sophia_bronze.jpg',      prefix: 'hagia_sophia' },
  notreDameF:     { file: 'notre_dame_bronze.jpg',        prefix: 'notre_dame' },
  forbiddenCity:  { file: 'forbidden_city_bronze.jpg',    prefix: 'forbidden_city' },
  uluru:          { file: 'uluru_bronze.jpg',             prefix: 'uluru' },
  mtRushmore:     { file: 'mt_rushmore_bronze.jpg',       prefix: 'mt_rushmore' },
  easterIsland:   { file: 'easter_island_bronze.jpg',     prefix: 'easter_island' },
  fushimiInari:   { file: 'fushimi_inari_bronze.jpg',     prefix: 'fushimi_inari' },
};

// Tier order. Stone tier was retired — it visually duplicated bronze, so we
// collapsed entry-level into a single bronze tier. Bronze becomes the
// auto-drop / default skin. Matches app/plan/location/globe/quests.ts:
//   common: bronze · rare: silver, gold · epic: diamond · legendary: aurora, celestial
const ALL_TIERS = ['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial'];
// Kept for backwards-compat with the script's wantsBase logic; harmless empty.
const TIERS_AFTER_BASE = ALL_TIERS;

// ─── CLI ───────────────────────────────────────────────────────────────────────
function parseArgs() {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const k = t.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    a[k] = v;
  }
  return a;
}

const args   = parseArgs();
const dryRun = !!args['dry-run'] || !!args.dry;

const targetKeys = (() => {
  if (args.all) return Object.keys(MONUMENTS);
  if (args.mk)  return [args.mk];
  console.error('Usage: --all | --mk <monumentKey> [--skins comma,sep,list] [--dry-run]');
  console.error('Available:', Object.keys(MONUMENTS).join(', '));
  process.exit(1);
})();

const skinsRequested = args.skins
  ? String(args.skins).split(',').map(s => s.trim()).filter(Boolean)
  : [...ALL_TIERS];

// ─── Env check ─────────────────────────────────────────────────────────────────
if (!dryRun) {
  if (!process.env.MESHY_API_KEY)         { console.error('MESHY_API_KEY missing'); process.exit(1); }
  if (!process.env.BLOB_READ_WRITE_TOKEN) { console.error('BLOB_READ_WRITE_TOKEN missing'); process.exit(1); }
}

mkdirSync(PREVIEW_GLB_DIR, { recursive: true });

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Resolve the local reference image for a (monument, tier) pair. Looks for
// public/brand/monuments/<tier>/<prefix>_<tier>.jpg first; falls back to the
// bronze reference if that tier-specific file doesn't exist yet. (You can
// generate per-tier coin renders via Nano Banana ahead of time so silver,
// gold, etc. each have a visually-distinct reference.)
function resolveReference(mk, tier) {
  const m = MONUMENTS[mk];
  if (!m) throw new Error(`No monument mapped for ${mk}.`);
  const baseDir = resolve(process.cwd(), 'public/brand/monuments');
  // Primary: derive the tier filename from the bronze filename pattern.
  // e.g. statue_of_liberty_bronze.jpg → statue_of_liberty_silver.jpg
  const tierFile = m.file.replace(/_bronze\.jpg$/i, `_${tier}.jpg`);
  const tierPath = resolve(baseDir, tier, tierFile);
  if (existsSync(tierPath)) return { local: tierPath, file: tierFile };
  // Secondary: substring match in the tier dir (handles odd casings).
  const altDir = resolve(baseDir, tier);
  if (existsSync(altDir)) {
    const candidates = readdirSync(altDir).filter(f => f.endsWith('.jpg'));
    const stem = m.file.replace(/_bronze\.jpg$/i, '');
    const hit = candidates.find(f => f.startsWith(stem) || f.includes(m.prefix));
    if (hit) return { local: resolve(altDir, hit), file: hit };
  }
  // Fallback: bronze (visually wrong for non-bronze tiers, but better than crashing).
  const bronzeLocal = resolve(BRONZE_DIR, m.file);
  if (!existsSync(bronzeLocal)) throw new Error(`Missing bronze fallback: ${bronzeLocal}`);
  return { local: bronzeLocal, file: m.file };
}

async function uploadReferenceForTier(mk, tier) {
  const ref = resolveReference(mk, tier);
  if (dryRun) return `https://example.blob/[dry-run]/${tier}/${basename(ref.file)}`;
  const bytes = readFileSync(ref.local);
  const uploaded = await put(`monument-refs/${mk}/${tier}/${ref.file}`, bytes, {
    access: 'public',
    contentType: 'image/jpeg',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return uploaded.url;
}

function callMeshyNewSkin(extraArgs) {
  const cmd = ['node', 'bin/meshy-new-skin.mjs', ...extraArgs];
  console.log('  →', cmd.join(' '));
  if (dryRun) return { ok: true };
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', env: process.env });
  if (r.status !== 0) throw new Error(`meshy-new-skin failed: ${extraArgs.join(' ')}`);
  return { ok: true };
}

function readPreviewManifest(prefix, style) {
  const path = `/tmp/meshy-preview/${prefix}_${style}.json`;
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

async function downloadGlbLocally(prefix, style, blobUrl) {
  if (dryRun || !blobUrl) return;
  const localPath = resolve(PREVIEW_GLB_DIR, `${prefix}_${style}.glb`);
  console.log(`  ↓ downloading GLB → ${localPath}`);
  // Retry transient EPIPE/network errors. The Meshy job already SUCCEEDED at
  // this point, so skipping the local download would silently lose progress
  // tracking. We just want to fetch a file that already exists in blob.
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(blobUrl);
      if (!res.ok) throw new Error(`GLB download failed: ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      writeFileSync(localPath, bytes);
      return;
    } catch (e) {
      lastErr = e;
      const wait = 1000 * attempt * attempt;
      console.warn(`  ⚠ download attempt ${attempt} failed (${e.code || e.message}); retrying in ${wait}ms…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  // After 5 retries, log and continue rather than aborting the whole batch —
  // the GLB exists in blob; operator can re-download manually.
  console.error(`  ✗ giving up local download for ${prefix}_${style} after 5 attempts: ${lastErr?.message}`);
  console.error(`    GLB is still available at ${blobUrl}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

// Stone tier was retired. Whatever skins were requested, we run them all
// through image-to-3D in the order listed.
const skinsToRun = skinsRequested.filter(s => ALL_TIERS.includes(s));

console.log(`monuments: ${targetKeys.length}`);
console.log(`skins per monument: ${skinsRequested.join(', ')}`);
console.log(`local preview dir: ${PREVIEW_GLB_DIR}`);
console.log(`mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

for (const mk of targetKeys) {
  const m = MONUMENTS[mk];
  if (!m) { console.warn(`unknown monument: ${mk}`); continue; }

  console.log(`\n=== ${mk} (${m.prefix}) ===`);

  // Image-to-3D for every skin, each with its OWN per-tier reference image
  // (silver coin, gold coin, etc. — generated ahead of time via Nano Banana).
  // Falls back to bronze if a tier-specific image doesn't exist.
  for (const tier of skinsToRun) {
    // Skip if the GLB for this (monument, skin) already exists locally.
    // The batch script is idempotent: re-running it should never burn
    // Meshy credits on a skin we've already shipped. Pass --force to
    // override and regenerate.
    const expectedGlb = resolve(PREVIEW_GLB_DIR, `${m.prefix}_${tier}.glb`);
    if (!args.force && existsSync(expectedGlb)) {
      console.log(`  [${tier}] ✓ already exists — skipping (${expectedGlb})`);
      continue;
    }
    const refUrl = await uploadReferenceForTier(mk, tier);
    console.log(`  [${tier}] ref → ${refUrl}`);
    callMeshyNewSkin([
      '--mk', mk, '--style', tier, '--mode', 'image', '--image', refUrl,
    ]);
    const manifest = readPreviewManifest(m.prefix, tier);
    if (manifest?.previewUrl) await downloadGlbLocally(m.prefix, tier, manifest.previewUrl);
    else console.warn(`  ⚠ no preview manifest for ${m.prefix}_${tier}`);
  }
}

console.log('\ndone.');
console.log(`local previews: ${PREVIEW_GLB_DIR}`);
