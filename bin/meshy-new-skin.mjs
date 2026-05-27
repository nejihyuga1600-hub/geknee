#!/usr/bin/env node
// bin/meshy-new-skin.mjs
// Generates a new monument skin via Meshy and uploads the refined GLB to
// Vercel Blob under the preview/ prefix. Never touches AVAILABLE_SKINS and
// never visible to regular users — that happens in bin/meshy-promote.mjs.
//
// Three modes:
//   image      — Meshy image-to-3D from a reference image. Use for the FIRST
//                skin of a monument so geometry is anchored to reality.
//   retexture  — Meshy retexture on an existing base GLB. Use for every
//                subsequent skin so silhouette stays consistent across tiers.
//   text       — Meshy text-to-3D (preview → refine). Fallback when no base
//                GLB and no reference image.
//
// Usage:
//   node bin/meshy-new-skin.mjs --mk eiffelTower --style stone   --mode image     --image https://.../ref.jpg
//   node bin/meshy-new-skin.mjs --mk eiffelTower --style gold    --mode retexture --base-url https://.../eiffel_tower_stone.glb
//   node bin/meshy-new-skin.mjs --mk eiffelTower --style obsidian                                        # auto-detects best mode
//
// Env:
//   MESHY_API_KEY            (required)
//   BLOB_READ_WRITE_TOKEN    (required)

import { put, head } from '@vercel/blob';
import { writeFileSync, mkdirSync } from 'fs';
import process from 'process';

// ─── config ────────────────────────────────────────────────────────────────────

const MESHY_BASE     = 'https://api.meshy.ai/openapi';
const TEXT_TO_3D     = `${MESHY_BASE}/v2/text-to-3d`;
const IMAGE_TO_3D    = `${MESHY_BASE}/v1/image-to-3d`;
const RETEXTURE      = `${MESHY_BASE}/v1/retexture`;
const POLL_MS        = 10_000;
const MAX_POLLS      = 120; // ≤20 minutes total
const BLOB_BASE_PUB  = 'https://mrfgpxw07gmgmriv.public.blob.vercel-storage.com';

// Maps monument key → filename prefix (same as MONUMENT_FILE_PREFIX in client)
const PREFIX = {
  eiffelTower: 'eiffel_tower', colosseum: 'Colosseum', tajMahal: 'taj_mahal',
  greatWall: 'great_wall', statueLiberty: 'statue_liberty', sagradaFamilia: 'sagrada_familia',
  machuPicchu: 'machu_picchu', christRedeem: 'christ_redeemer', angkorWat: 'angkor_wat',
  pyramidGiza: 'pyramid_giza', goldenGate: 'golden_gate', bigBen: 'big_ben',
  acropolis: 'acropolis', sydneyOpera: 'sydney_opera', neuschwanstein: 'neuschwanstein',
  stonehenge: 'stonehenge', iguazuFalls: 'iguazu_falls', tokyoSkytree: 'tokyo_skytree',
  victoriaFalls: 'victoria_falls',
  // Wave 3
  mountFuji: 'mount_fuji', petra: 'petra', niagaraFalls: 'niagara_falls',
  chichenItza: 'chichen_itza', burjKhalifa: 'burj_khalifa', hagiaSophia: 'hagia_sophia',
  notreDameF: 'notre_dame', forbiddenCity: 'forbidden_city', uluru: 'uluru',
  mtRushmore: 'mt_rushmore', easterIsland: 'easter_island', fushimiInari: 'fushimi_inari',
};

const DISPLAY = {
  eiffelTower: 'Eiffel Tower', colosseum: 'Colosseum', tajMahal: 'Taj Mahal',
  greatWall: 'Great Wall of China', statueLiberty: 'Statue of Liberty',
  sagradaFamilia: 'Sagrada Família', machuPicchu: 'Machu Picchu',
  christRedeem: 'Christ the Redeemer', angkorWat: 'Angkor Wat',
  pyramidGiza: 'Pyramids of Giza', goldenGate: 'Golden Gate Bridge',
  bigBen: 'Big Ben', acropolis: 'Acropolis Parthenon',
  sydneyOpera: 'Sydney Opera House', neuschwanstein: 'Neuschwanstein Castle',
  stonehenge: 'Stonehenge', iguazuFalls: 'Iguazu Falls',
  tokyoSkytree: 'Tokyo Skytree', victoriaFalls: 'Victoria Falls',
  // Wave 3
  mountFuji: 'Mount Fuji', petra: 'Petra Treasury', niagaraFalls: 'Niagara Falls',
  chichenItza: 'Chichen Itza Pyramid', burjKhalifa: 'Burj Khalifa', hagiaSophia: 'Hagia Sophia',
  notreDameF: 'Notre-Dame Cathedral', forbiddenCity: 'Forbidden City', uluru: 'Uluru',
  mtRushmore: 'Mount Rushmore', easterIsland: 'Easter Island Moai', fushimiInari: 'Fushimi Inari',
};

// Default material/aesthetic per skin rarity (used by all three modes)
const SKIN_PROMPT = {
  // natural = entry-tier default shown on first unlock. Translucent base
  // material with the monument's real-world colors faintly visible
  // through, like frosted glass / polished resin with embedded color.
  // Per user spec: real-world colors + translucent foundation. Sits
  // below bronze in the rarity ranking so unlocked players see this
  // immediately without earning anything else first.
  natural:   'monument figure rendered in its authentic real-world colors (accurate stone / metal / wood / vegetation hues, photorealistic palette, NO bronze tint), sitting on a translucent clear-glass coin base / pedestal that is fully see-through like crystal. The monument itself is solid and naturally colored; ONLY the round disc / coin base underneath the monument is translucent glass.',
  stone:     'weathered grey granite with detailed chisel marks',
  bronze:    'aged bronze with green patina accents and metallic sheen',
  silver:    'polished silver with reflective chrome highlights',
  gold:      'lustrous solid gold with intricate engraving',
  diamond:   'clear diamond with prismatic refraction and crystalline facets',
  damascus:  'iridescent CoD Modern Warfare Damascus camo — vibrant emerald and teal base with hot pink coral and magenta wavy contour bands, deep violet outline rings, topographic flow-line pattern, glossy oil-slick rainbow chrome shimmer, bright high-contrast saturation',
  aurora:    'iridescent aurora-green holographic surface with northern-lights glow',
  celestial: 'cosmic purple nebula material with star particles',
  obsidian:  'polished black obsidian with subtle red volcanic veins',
};

// ─── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

const args        = parseArgs();
const mk          = args.mk;
const style       = args.style;
const userMode    = args.mode;                                  // 'image' | 'retexture' | 'text'
const imageArg    = args.image     || args['image-url'];        // for image mode
const baseUrlArg  = args['base-url'] || args.baseUrl;           // for retexture mode
const promptOver  = args.prompt;

if (!mk || !style) {
  console.error('Usage: node bin/meshy-new-skin.mjs --mk <monument> --style <skin> [--mode image|retexture|text] [...]');
  console.error('  image     : --image <url>         reference image, first-of-kind geometry');
  console.error('  retexture : --base-url <glb-url>  re-skin an existing GLB (same geometry)');
  console.error('  text      :                       pure text-to-3D fallback');
  console.error('\nmonuments:', Object.keys(PREFIX).join(', '));
  console.error('skins:    ', Object.keys(SKIN_PROMPT).join(', '));
  process.exit(1);
}
if (!PREFIX[mk]) { console.error(`Unknown monument: ${mk}`); process.exit(1); }
if (!SKIN_PROMPT[style] && !promptOver) {
  console.error(`Unknown skin: ${style} — pass --prompt to override`);
  process.exit(1);
}

const MESHY_API_KEY = process.env.MESHY_API_KEY;
const BLOB_TOKEN    = process.env.BLOB_READ_WRITE_TOKEN;
if (!MESHY_API_KEY) { console.error('MESHY_API_KEY missing'); process.exit(1); }
if (!BLOB_TOKEN)    { console.error('BLOB_READ_WRITE_TOKEN missing'); process.exit(1); }

// ─── Meshy client ──────────────────────────────────────────────────────────────

async function meshyFetch(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${MESHY_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meshy ${method} ${url} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function waitForTask(endpoint, id, label) {
  for (let i = 0; i < MAX_POLLS; i++) {
    const task = await meshyFetch(`${endpoint}/${id}`);
    const { status, progress } = task;
    process.stdout.write(`\r[${label}] ${status} ${progress ?? 0}%          `);
    if (status === 'SUCCEEDED') { process.stdout.write('\n'); return task; }
    if (status === 'FAILED' || status === 'CANCELED') {
      process.stdout.write('\n');
      throw new Error(`Meshy task ${status}: ${JSON.stringify(task.task_error ?? {})}`);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  throw new Error(`Meshy task ${id} did not complete within ${MAX_POLLS * POLL_MS / 1000}s`);
}

// ─── mode helpers ──────────────────────────────────────────────────────────────

const prefix      = PREFIX[mk];
const monName     = DISPLAY[mk];
const material    = promptOver || `${SKIN_PROMPT[style]}`;
const livePath    = `models/${prefix}_${style}.glb`;
const previewKey  = `models/preview/${prefix}_${style}.glb`;

// Auto-detect mode: if a base-GLB exists on blob for this monument, prefer retexture.
// Otherwise if --image was provided use image-to-3D, else text.
async function detectMode() {
  if (userMode) return userMode;
  if (baseUrlArg) return 'retexture';
  if (imageArg)   return 'image';
  // Probe blob: does any existing skin GLB for this monument exist?
  const candidates = Object.keys(SKIN_PROMPT).map(s => `${BLOB_BASE_PUB}/models/${prefix}_${s}.glb`);
  for (const u of candidates) {
    try { const r = await fetch(u, { method: 'HEAD' }); if (r.ok) return 'retexture-auto'; } catch {}
  }
  return 'text';
}

const mode = await detectMode();

// For retexture-auto, fill in base-url with the first existing skin we find
let baseUrl = baseUrlArg;
if (mode === 'retexture-auto' && !baseUrl) {
  for (const s of Object.keys(SKIN_PROMPT)) {
    const u = `${BLOB_BASE_PUB}/models/${prefix}_${s}.glb`;
    try { const r = await fetch(u, { method: 'HEAD' }); if (r.ok) { baseUrl = u; break; } } catch {}
  }
}

console.log(`\n→ Generating ${mk}/${style}`);
console.log(`  Mode:      ${mode === 'retexture-auto' ? 'retexture (auto-detected base)' : mode}`);
if (mode === 'retexture' || mode === 'retexture-auto') console.log(`  Base GLB:  ${baseUrl}`);
if (mode === 'image')    console.log(`  Reference: ${imageArg}`);
console.log(`  Material:  ${material}\n`);

// ─── dispatch ──────────────────────────────────────────────────────────────────

let refinedGlbUrl;

if (mode === 'image') {
  if (!imageArg) throw new Error('--image <url> required for image mode');

  // Image-to-3D: single stage, returns a refined model.
  // CRITICAL: do NOT include the monument name in texture_prompt. Meshy
  // applies strong training priors for famous landmarks (e.g. Statue of
  // Liberty → green-bronze patina) that override the visual material in
  // the input image. We pass ONLY the material/skin descriptor so meshy
  // is forced to take its color cues from the actual reference image
  // (which we pre-rendered in the target skin color via Nano Banana).
  console.log('1/1 · Meshy image-to-3d…');
  const created = await meshyFetch(IMAGE_TO_3D, 'POST', {
    image_url: imageArg,
    enable_pbr: true,
    should_remesh: true,
    texture_prompt: material,
  });
  const task = await waitForTask(IMAGE_TO_3D, created.result, 'image-to-3d');
  refinedGlbUrl = task.model_urls?.glb;

} else if (mode === 'retexture' || mode === 'retexture-auto') {
  if (!baseUrl) throw new Error('Retexture requires a base-url; none found. Pass --base-url explicitly.');

  // Retexture: applies a new texture to the base GLB, keeping the geometry.
  console.log('1/1 · Meshy retexture…');
  const created = await meshyFetch(RETEXTURE, 'POST', {
    model_url:         baseUrl,
    text_style_prompt: `${monName}, ${material}`,
    enable_pbr:        true,
  });
  const task = await waitForTask(RETEXTURE, created.result, 'retexture');
  refinedGlbUrl = task.model_urls?.glb;

} else {
  // text mode: preview → refine
  const textPrompt = `${monName}, ${material}, photorealistic, high detail, single centered object on transparent background`;
  console.log('1/2 · Meshy text-to-3d preview…');
  const previewCreate = await meshyFetch(TEXT_TO_3D, 'POST', {
    mode: 'preview',
    prompt: textPrompt,
    art_style: 'realistic',
    should_remesh: true,
  });
  await waitForTask(TEXT_TO_3D, previewCreate.result, 'preview');

  console.log('2/2 · Meshy refine…');
  const refineCreate = await meshyFetch(TEXT_TO_3D, 'POST', {
    mode: 'refine',
    preview_task_id: previewCreate.result,
    enable_pbr: true,
  });
  const refined = await waitForTask(TEXT_TO_3D, refineCreate.result, 'refine');
  refinedGlbUrl = refined.model_urls?.glb;
}

if (!refinedGlbUrl) throw new Error('No GLB URL from Meshy — check the task response');

// ─── download + upload to preview ──────────────────────────────────────────────

console.log('\n→ Downloading + uploading preview…');
const glbRes = await fetch(refinedGlbUrl);
if (!glbRes.ok) throw new Error(`Failed to download GLB: ${glbRes.status}`);
const glbBytes = Buffer.from(await glbRes.arrayBuffer());

const uploaded = await put(previewKey, glbBytes, {
  access: 'public',
  contentType: 'model/gltf-binary',
  addRandomSuffix: false,
  allowOverwrite: true,
  token: BLOB_TOKEN,
});

mkdirSync('/tmp/meshy-preview', { recursive: true });
writeFileSync(
  `/tmp/meshy-preview/${prefix}_${style}.json`,
  JSON.stringify({
    mk, style, prefix, mode,
    baseUrl: baseUrl ?? null,
    imageRef: imageArg ?? null,
    material,
    previewUrl: uploaded.url,
    livePath,
    generatedAt: new Date().toISOString(),
  }, null, 2),
);

console.log(`\n✓ Uploaded to ${uploaded.url}`);
console.log(`\nPreview on prod (dev account only):`);
console.log(`  https://www.geknee.com/dev/preview/skin?url=${encodeURIComponent(uploaded.url)}&mk=${mk}&style=${style}&name=${encodeURIComponent(monName)}`);
console.log(`\nPreview locally:`);
console.log(`  http://localhost:3000/dev/preview/skin?url=${encodeURIComponent(uploaded.url)}&mk=${mk}&style=${style}&name=${encodeURIComponent(monName)}`);
console.log(`\nApprove:  node bin/meshy-promote.mjs --mk ${mk} --style ${style}`);
console.log(`Reject:   delete ${previewKey} from the Vercel Blob dashboard\n`);
