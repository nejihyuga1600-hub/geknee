#!/usr/bin/env node
// bin/meshy-ship.mjs
//
// One command to ship newly generated Meshy GLBs to the live globe.
//
// What it does (idempotent — safe to re-run):
//   1) Verify env: BLOB_READ_WRITE_TOKEN must be set.
//   2) Mirror public/models/preview/*.glb     → blob models/*.glb   (skip dupes)
//   3) Mirror public/generated-images/*.jpg   → blob images/*.jpg   (skip dupes)
//   4) Regenerate AVAILABLE_SKINS from blob inventory.
//   5) Diff the new map against the current skins.ts.
//   6) Print exactly what changed; ask before patching skins.ts (unless --apply).
//
// Usage:
//   node bin/meshy-ship.mjs              # full pipeline, prompt before patching
//   node bin/meshy-ship.mjs --apply      # auto-patch skins.ts after sync
//   node bin/meshy-ship.mjs --dry-run    # show what would happen, upload nothing
//   node bin/meshy-ship.mjs --no-images  # skip image upload (GLBs only)
//
// Env: BLOB_READ_WRITE_TOKEN (loaded from .env.local automatically)

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

for (const p of ['./.env.local', './.env']) {
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('FATAL: BLOB_READ_WRITE_TOKEN missing. Add it to .env.local first.');
  process.exit(1);
}

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const apply = has('--apply');
const dryRun = has('--dry-run');
const skipImages = has('--no-images');

const SKINS_PATH = 'app/plan/location/globe/skins.ts';

function run(cmd, args, label) {
  console.log(`\n━━━ ${label} ━━━`);
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.status !== 0) {
    console.error(`FAIL — ${label} exited ${r.status}`);
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

// ─── Step 1: GLB upload ────────────────────────────────────────────────────
const glbArgs = ['bin/blob-upload-models.mjs'];
if (dryRun) glbArgs.push('--dry-run');
run('node', glbArgs, '1/4 · Upload GLBs to blob');

// ─── Step 2: Image upload (optional) ──────────────────────────────────────
if (!skipImages) {
  const imgArgs = ['bin/blob-upload-images.mjs'];
  if (dryRun) imgArgs.push('--dry-run');
  run('node', imgArgs, '2/4 · Upload skin images to blob');
} else {
  console.log('\n━━━ 2/4 · Skipping image upload (--no-images) ━━━');
}

// ─── Step 3: Regenerate AVAILABLE_SKINS ────────────────────────────────────
const newBlock = run('node', ['bin/blob-sync-available-skins.mjs'], '3/4 · Sync AVAILABLE_SKINS from blob');

// ─── Step 4: Diff + (maybe) patch skins.ts ─────────────────────────────────
console.log('\n━━━ 4/4 · Diff + patch skins.ts ━━━');
const skinsSrc = readFileSync(SKINS_PATH, 'utf8');
const blockMatch = skinsSrc.match(/(\/\/[^\n]*\n)*export const AVAILABLE_SKINS:[^=]*=\s*\{[^}]+\};/);
if (!blockMatch) {
  console.error(`FAIL — cannot locate AVAILABLE_SKINS block in ${SKINS_PATH}`);
  process.exit(1);
}
const oldBlock = blockMatch[0];
// newBlock is the raw output; extract just the export const block.
const newBlockMatch = newBlock.match(/export const AVAILABLE_SKINS[^=]*=\s*\{[^}]+\};/);
if (!newBlockMatch) {
  console.error('FAIL — sync script did not emit a parseable AVAILABLE_SKINS block.');
  console.error(newBlock);
  process.exit(1);
}
const newBlockClean =
  '// Generated from blob inventory by bin/blob-sync-available-skins.mjs.\n' +
  '// Re-run bin/meshy-ship.mjs to regenerate after uploading new GLBs.\n' +
  newBlockMatch[0];

if (oldBlock.trim() === newBlockClean.trim()) {
  console.log('No changes to skins.ts — already in sync with blob.');
  process.exit(0);
}

console.log('\n--- DIFF ---');
const oldLines = oldBlock.split('\n');
const newLines = newBlockClean.split('\n');
for (const line of oldLines) console.log(`- ${line}`);
console.log('   ↓');
for (const line of newLines) console.log(`+ ${line}`);

if (dryRun) {
  console.log('\n--dry-run: not patching skins.ts');
  process.exit(0);
}

if (!apply) {
  console.log('\nRun with --apply to patch skins.ts.');
  process.exit(0);
}

const patched = skinsSrc.replace(oldBlock, newBlockClean);
writeFileSync(SKINS_PATH, patched);
console.log(`\nPatched ${SKINS_PATH}.`);
console.log('Next: review, run `npx tsc --noEmit`, commit, push.');
