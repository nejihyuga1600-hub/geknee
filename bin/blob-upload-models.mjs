#!/usr/bin/env node
// bin/blob-upload-models.mjs
//
// Mirrors public/models/preview/*.glb → models/*.glb in Vercel Blob so the
// globe's landmark.tsx (which reads from BLOB_BASE) can serve them.
// Idempotent: lists existing blob entries first, skips anything already
// uploaded with a matching size.
//
// Usage:
//   node bin/blob-upload-models.mjs                # upload all missing
//   node bin/blob-upload-models.mjs --dry-run      # list only
//   node bin/blob-upload-models.mjs --prefix eiffel  # filter by prefix
//   node bin/blob-upload-models.mjs --force        # re-upload existing
//
// Env: BLOB_READ_WRITE_TOKEN (loaded from .env.local automatically)

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { list, put } from '@vercel/blob';

// ─── env loader (same pattern marketing-brain uses) ────────────────────────
const ENV_PATHS = ['./.env.local', './.env'];
for (const p of ENV_PATHS) {
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
const filter = get('--prefix');
const concurrency = Number(get('--concurrency') ?? 3);

const SRC_DIR = 'public/models/preview';
const TARGET_PREFIX = 'models/';

const fmt = (n) =>
  n < 1024 ? `${n}B`
  : n < 1024**2 ? `${(n/1024).toFixed(1)}KB`
  : n < 1024**3 ? `${(n/1024/1024).toFixed(1)}MB`
  : `${(n/1024**3).toFixed(2)}GB`;

// ─── inventory local + remote ──────────────────────────────────────────────
const localFiles = readdirSync(SRC_DIR)
  .filter(f => f.endsWith('.glb'))
  .filter(f => !filter || f.startsWith(filter))
  .map(f => ({
    name: f,
    path: join(SRC_DIR, f),
    size: statSync(join(SRC_DIR, f)).size,
    targetKey: TARGET_PREFIX + f,
  }));

console.log(`Local: ${localFiles.length} GLBs (${fmt(localFiles.reduce((s, f) => s + f.size, 0))})`);

console.log('Listing existing blob entries under models/ ...');
const remote = new Map();
let cursor;
do {
  const page = await list({ token: TOKEN, prefix: TARGET_PREFIX, cursor, limit: 1000 });
  for (const b of page.blobs) remote.set(b.pathname, b.size);
  cursor = page.cursor;
} while (cursor);
console.log(`Remote: ${remote.size} blobs already in models/`);

// ─── partition: skip vs upload ─────────────────────────────────────────────
const toUpload = [];
const skip = [];
for (const f of localFiles) {
  const remoteSize = remote.get(f.targetKey);
  if (!force && remoteSize === f.size) skip.push(f);
  else if (!force && remoteSize !== undefined) {
    console.log(`SIZE MISMATCH ${f.targetKey}: local=${fmt(f.size)} remote=${fmt(remoteSize)} → re-uploading`);
    toUpload.push(f);
  } else toUpload.push(f);
}

console.log(`\nSkip (already up to date): ${skip.length}`);
console.log(`Upload: ${toUpload.length} (${fmt(toUpload.reduce((s, f) => s + f.size, 0))})`);

if (dryRun) {
  console.log('\n--dry-run, exiting');
  for (const f of toUpload) console.log(`  WOULD UPLOAD ${f.targetKey} (${fmt(f.size)})`);
  process.exit(0);
}
if (toUpload.length === 0) { console.log('Nothing to do.'); process.exit(0); }

// ─── upload with bounded concurrency ───────────────────────────────────────
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
        contentType: 'model/gltf-binary',
      });
      done++;
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[${done + failed}/${toUpload.length}] OK   ${f.targetKey}  ${fmt(f.size)}  ${dt}s`);
    } catch (e) {
      failed++;
      console.error(`[${done + failed}/${toUpload.length}] FAIL ${f.targetKey}: ${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

const totalDt = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\nDone: ${done} ok, ${failed} failed, ${totalDt}s total.`);
process.exit(failed > 0 ? 1 : 0);
