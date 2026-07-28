#!/usr/bin/env node
// Fix the "white monument" bug: Meshy image-to-3D outputs bake a
// near-white emissive texture (~500-800 byte WebP) into monument GLBs.
// Under our lighting, the emissive channel overwhelms baseColor -> the
// monument renders as a solid-white silhouette.
//
// This script scans every GLB in a directory, identifies affected
// materials by fingerprint (emissiveTexture present AND its image data
// is under ~1200 bytes -> a near-solid tiny WebP), zeros the
// emissiveFactor, and removes the emissive texture reference. Orphan
// textures are pruned before re-writing.
//
// Usage:
//   # dry-run (report only)
//   npx --package=@gltf-transform/core@^4.4.2 --package=@gltf-transform/extensions@^4.4.2 --package=meshoptimizer -- node bin/fix-glb-emissive.mjs public/models/mapbox
//
//   # apply the fix in place
//   npx --package=@gltf-transform/core@^4.4.2 --package=@gltf-transform/extensions@^4.4.2 --package=meshoptimizer -- node bin/fix-glb-emissive.mjs public/models/mapbox --apply
//
// This should be run automatically after every meshy batch, before the
// gltf-transform optimize + copy-to-mapbox step in the ship pipeline.

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs/promises';
import path from 'node:path';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const dir = args.find(a => !a.startsWith('--')) || 'public/models/mapbox';

// Any emissive image data smaller than this is treated as a Meshy stub.
// Real emissive textures are 5-50 KB; the broken ones are 500-800 bytes.
const EMISSIVE_MAX = 1200;

const files = (await fs.readdir(dir)).filter(f => f.endsWith('.glb')).sort();
console.log(`Scanning ${files.length} GLBs in ${dir}  (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'})`);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

let affected = 0;
let cleaned = 0;

for (const f of files) {
  const p = path.join(dir, f);
  let doc;
  try {
    doc = await io.read(p);
  } catch (e) {
    console.log(`  SKIP ${f}: read failed (${e.message})`);
    continue;
  }
  let hitInThisFile = false;
  for (const m of doc.getRoot().listMaterials()) {
    const tex = m.getEmissiveTexture();
    if (!tex) continue;
    const imgSize = (tex.getImage() || Buffer.alloc(0)).byteLength;
    if (imgSize < EMISSIVE_MAX) {
      hitInThisFile = true;
      if (APPLY) {
        m.setEmissiveFactor([0, 0, 0]);
        m.setEmissiveTexture(null);
      }
    }
  }
  if (hitInThisFile) {
    affected += 1;
    console.log(`  ${APPLY ? 'FIXING' : 'FLAG  '} ${f}`);
    if (APPLY) {
      doc.getRoot().listTextures().forEach(t => {
        if (t.listParents().length <= 1) t.dispose();
      });
      await io.write(p, doc);
      cleaned += 1;
    }
  }
}

console.log(`\nDone. ${affected} affected, ${cleaned} written.`);
