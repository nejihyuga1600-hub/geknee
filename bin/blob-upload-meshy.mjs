#!/usr/bin/env node
// Upload Meshy-generated _meshy.glb files to Vercel Blob under
// /models/<prefix>_meshy.glb so the globe loader can hit them via the
// existing skin pipeline. Idempotent — calls `put` with allowOverwrite:false
// so a re-run won't trample what's there. Run after bin/meshy-monuments.py
// has generated + the user has renamed to <prefix>_meshy.glb.
//
// usage:
//   node bin/blob-upload-meshy.mjs
//
// Reads BLOB_READ_WRITE_TOKEN from process.env (vercel env pull writes it
// to .env.local — load via dotenv-load or `npm run` which inlines it).

import { put } from '@vercel/blob';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const MODELS_DIR = join(ROOT, 'public', 'models');

// Manually load .env.local so this script doesn't need a wrapper.
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN missing — run `vercel env pull` first');
  process.exit(1);
}

const files = readdirSync(MODELS_DIR)
  .filter((f) => f.endsWith('_meshy.glb'))
  .sort();

if (files.length === 0) {
  console.error(`no *_meshy.glb files in ${MODELS_DIR}`);
  process.exit(1);
}

console.log(`uploading ${files.length} files to Vercel Blob...`);
const results = [];
for (const f of files) {
  const buf = readFileSync(join(MODELS_DIR, f));
  const path = `models/${f}`;
  try {
    const blob = await put(path, buf, {
      access: 'public',
      contentType: 'model/gltf-binary',
      allowOverwrite: false,
      addRandomSuffix: false,
    });
    console.log(`  + ${f} (${(buf.length / 1024 / 1024).toFixed(1)}MB) → ${blob.url}`);
    results.push({ file: f, url: blob.url, bytes: buf.length });
  } catch (e) {
    if (String(e).includes('already exists') || String(e).includes('blob_exists')) {
      console.log(`  skip ${f} — already in Blob (use --overwrite to replace)`);
      results.push({ file: f, url: null, bytes: buf.length, skipped: true });
    } else {
      console.error(`  ! ${f} failed: ${e.message}`);
      results.push({ file: f, error: e.message });
    }
  }
}
console.log('\ndone — ' + results.filter((r) => r.url).length + ' uploaded.');
