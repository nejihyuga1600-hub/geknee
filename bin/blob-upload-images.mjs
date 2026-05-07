#!/usr/bin/env node
// bin/blob-upload-images.mjs
//
// Mirrors public/generated-images/<prefix>_<skin>.jpg → images/<filename>
// in Vercel Blob so CityMapView (and future surfaces) can render monument
// icons from a CDN instead of needing every JPG checked into git.
//
// Idempotent — skips files where blob size already matches local.
//
// Usage:
//   node bin/blob-upload-images.mjs                # upload all missing
//   node bin/blob-upload-images.mjs --dry-run      # list only
//   node bin/blob-upload-images.mjs --force        # re-upload existing
//
// Env: BLOB_READ_WRITE_TOKEN

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { list, put } from '@vercel/blob';

for (const p of ['./.env.local', './.env']) {
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) { console.error('BLOB_READ_WRITE_TOKEN missing'); process.exit(1); }

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const dryRun = has('--dry-run');
const force = has('--force');
const concurrency = Number(get('--concurrency') ?? 4);

const SRC_DIR = 'public/generated-images';
const TARGET_PREFIX = 'images/';
const SKIN_PATTERN = /^[a-z][a-z0-9_]*_(stone|bronze|silver|gold|diamond|aurora|celestial|damascus)\.(jpg|png)$/;

const fmt = (n) =>
  n < 1024 ? `${n}B`
  : n < 1024**2 ? `${(n/1024).toFixed(1)}KB`
  : n < 1024**3 ? `${(n/1024/1024).toFixed(1)}MB`
  : `${(n/1024**3).toFixed(2)}GB`;

const localFiles = readdirSync(SRC_DIR)
  .filter(f => SKIN_PATTERN.test(f))
  .map(f => ({
    name: f,
    path: join(SRC_DIR, f),
    size: statSync(join(SRC_DIR, f)).size,
    targetKey: TARGET_PREFIX + f,
    contentType: f.endsWith('.png') ? 'image/png' : 'image/jpeg',
  }));

console.log(`Local: ${localFiles.length} skin JPGs (${fmt(localFiles.reduce((s, f) => s + f.size, 0))})`);

console.log('Listing existing blob entries under images/ ...');
const remote = new Map();
let cursor;
do {
  const page = await list({ token: TOKEN, prefix: TARGET_PREFIX, cursor, limit: 1000 });
  for (const b of page.blobs) remote.set(b.pathname, b.size);
  cursor = page.cursor;
} while (cursor);
console.log(`Remote: ${remote.size} blobs already in images/`);

const toUpload = [];
for (const f of localFiles) {
  if (!force && remote.get(f.targetKey) === f.size) continue;
  toUpload.push(f);
}

console.log(`Upload: ${toUpload.length} (${fmt(toUpload.reduce((s, f) => s + f.size, 0))})`);

if (dryRun) {
  for (const f of toUpload) console.log(`  WOULD UPLOAD ${f.targetKey} (${fmt(f.size)})`);
  process.exit(0);
}
if (toUpload.length === 0) { console.log('Nothing to do.'); process.exit(0); }

let done = 0, failed = 0;
const start = Date.now();
const queue = [...toUpload];

async function worker() {
  while (queue.length) {
    const f = queue.shift();
    if (!f) return;
    const t0 = Date.now();
    try {
      const bytes = readFileSync(f.path);
      await put(f.targetKey, bytes, {
        token: TOKEN,
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: f.contentType,
      });
      done++;
      console.log(`[${done + failed}/${toUpload.length}] OK   ${f.targetKey}  ${fmt(f.size)}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
      failed++;
      console.error(`[${done + failed}/${toUpload.length}] FAIL ${f.targetKey}: ${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

console.log(`\nDone: ${done} ok, ${failed} failed, ${((Date.now() - start) / 1000).toFixed(1)}s total.`);
process.exit(failed > 0 ? 1 : 0);
