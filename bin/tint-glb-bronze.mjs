#!/usr/bin/env node
// "Default skin" alignment for CapacitorGlobe.
//
// Fresh Meshy image-to-3D outputs bake the source snap's colors into
// baseColor, which for pale monuments (Taj Mahal, Kilimanjaro, Sensoji,
// Trevi Fountain, etc.) reads as WHITE on iOS. Shipped-earlier
// monuments were downloaded from Vercel Blob as their `_bronze` variant
// and renamed to <prefix>.glb — that's why eiffel_tower/colosseum/petra
// all look copper on iOS. Fresh meshy gens skip that step.
//
// This script sets `baseColorFactor` to bronze copper (#cd7f32, matches
// SKIN_RING_COLOR.bronze in globe/skins.ts) on any base GLB whose mean
// baseColor texture is too bright/gray to look bronze on its own. The
// factor multiplies the texture per-channel at render time, giving
// warm copper wherever the underlying texture is pale.
//
// Skips:
//   - skin-variant files (<prefix>_<tier>.glb) — those are supposed to
//     be pure tier colors, not overridden.
//   - base GLBs whose mean is already bronze-toned (r+g+b < 500).
//   - base GLBs already sufficiently warm (spread > 60 AND r > b).
//
// This should be run automatically after every meshy batch + copy to
// mapbox/, alongside bin/fix-glb-emissive.mjs.
//
// Usage:
//   npx --package=@gltf-transform/core@^4.4.2 --package=@gltf-transform/extensions@^4.4.2 --package=meshoptimizer --package=sharp -- node bin/tint-glb-bronze.mjs             # dry-run
//   npx --package=@gltf-transform/core@^4.4.2 --package=@gltf-transform/extensions@^4.4.2 --package=meshoptimizer --package=sharp -- node bin/tint-glb-bronze.mjs --apply     # write

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;

const APPLY = process.argv.includes('--apply');
const dir = process.argv.find(a => !a.startsWith('--') && a.endsWith('mapbox'))
  || '/Users/geknee/geknee/public/models/mapbox';

// Bronze copper — matches SKIN_RING_COLOR.bronze = #cd7f32
const BRONZE = [205 / 255, 127 / 255, 50 / 255, 1];

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// Load MONUMENT_FILE_PREFIX so we know which stems are base names
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const skinsSrc = await fs.readFile(path.join(repoRoot, 'app/plan/location/globe/skins.ts'), 'utf8');
const mpMatch = skinsSrc.match(/MONUMENT_FILE_PREFIX[^{]*\{([\s\S]*?)\n\};/);
const basePrefixes = new Set();
for (const line of mpMatch[1].split('\n')) {
  const m = line.match(/^\s*[a-zA-Z]+\s*:\s*['"]([A-Za-z_0-9]+)['"]/);
  if (m) basePrefixes.add(m[1]);
}

const files = (await fs.readdir(dir)).filter(f => f.endsWith('.glb')).sort();
let applied = 0;

for (const f of files) {
  const stem = f.replace(/\.glb$/, '');
  if (!basePrefixes.has(stem)) continue; // skin variant — skip
  const p = path.join(dir, f);
  let doc;
  try { doc = await io.read(p); } catch { continue; }
  const mats = doc.getRoot().listMaterials();
  if (mats.length === 0) continue;
  let touched = false;
  for (const m of mats) {
    const t = m.getBaseColorTexture();
    if (!t) continue;
    const img = t.getImage();
    if (!img) continue;
    // Already tinted (factor not white)? Leave alone — script is idempotent.
    const bcf = m.getBaseColorFactor();
    if (bcf[0] < 0.95 || bcf[1] < 0.95 || bcf[2] < 0.95) continue;
    let mean;
    try {
      const raw = await sharp(Buffer.from(img)).resize(8, 8).raw().toBuffer({ resolveWithObject: true });
      const px = raw.data; const ch = raw.info.channels;
      let r=0, g=0, b=0, n=0;
      for (let i=0; i<px.length; i+=ch) { r+=px[i]; g+=px[i+1]; b+=px[i+2]; n++; }
      mean = [r/n|0, g/n|0, b/n|0];
    } catch { continue; }
    const brightness = mean[0] + mean[1] + mean[2];
    if (brightness < 500) continue;
    const spread = Math.max(...mean) - Math.min(...mean);
    if (spread > 60 && mean[0] > mean[2]) continue; // already warm-toned
    console.log(`  ${APPLY ? 'APPLY' : 'FLAG '} ${f}  mean=rgb(${mean.join(',')})`);
    if (APPLY) { m.setBaseColorFactor(BRONZE); touched = true; }
  }
  if (APPLY && touched) { await io.write(p, doc); applied++; }
}

console.log(`\n${APPLY ? 'Applied' : 'Would apply'} bronze factor to ${applied} monuments.`);
