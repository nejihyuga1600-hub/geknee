#!/usr/bin/env node
// Compress every .glb in public/models-source/ into public/models/.
//
// Geometry: Draco (lossless mesh compression) + Meshopt (vertex layout)
// Textures: WebP @ max 2048px (download size win; GPU memory still RGBA)
//           If `toktx` is on PATH, swap WEBP_MODE='ktx2' to also cut GPU memory.
//
// Run:  npm run compress
// First run downloads @gltf-transform/cli into npm cache (~30 MB, one-time).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(ROOT, 'public', 'models-source');
const DST  = join(ROOT, 'public', 'models');

const WEBP_MODE = process.env.COMPRESS_KTX2 === '1' ? 'ktx2' : 'webp';
const TEXTURE_SIZE = process.env.TEXTURE_SIZE ?? '2048';

mkdirSync(DST, { recursive: true });

let files;
try {
  files = readdirSync(SRC).filter(f => f.toLowerCase().endsWith('.glb'));
} catch {
  console.error(`No source dir at ${SRC}. Move public/models/*.glb there first.`);
  process.exit(1);
}

if (!files.length) {
  console.error(`No .glb files found in ${SRC}.`);
  process.exit(1);
}

console.log(`Compressing ${files.length} GLBs → ${DST}`);
console.log(`Texture mode: ${WEBP_MODE} @ max ${TEXTURE_SIZE}px`);
console.log('');

let totalIn = 0, totalOut = 0;
for (const name of files) {
  const inPath  = join(SRC, name);
  const outPath = join(DST, name);
  const inSize  = statSync(inPath).size;
  totalIn += inSize;

  process.stdout.write(`${name} (${(inSize / 1e6).toFixed(1)} MB) ... `);
  try {
    execFileSync('npx', ['--yes', '@gltf-transform/cli@4', 'optimize', inPath, outPath,
      '--compress', 'draco',
      '--texture-compress', WEBP_MODE,
      '--texture-size', TEXTURE_SIZE,
      '--instance', 'true',
      '--prune', 'true',
      '--simplify', 'false',
    ], { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
    const outSize = statSync(outPath).size;
    totalOut += outSize;
    const ratio = ((1 - outSize / inSize) * 100).toFixed(0);
    console.log(`${(outSize / 1e6).toFixed(1)} MB (-${ratio}%)`);
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
  }
}

console.log('');
console.log(`Total: ${(totalIn / 1e6).toFixed(0)} MB → ${(totalOut / 1e6).toFixed(0)} MB (-${((1 - totalOut / totalIn) * 100).toFixed(0)}%)`);
