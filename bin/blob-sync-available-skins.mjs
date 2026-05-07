#!/usr/bin/env node
// bin/blob-sync-available-skins.mjs
//
// Regenerates the AVAILABLE_SKINS block in skins.ts to match whatever skin
// GLBs are actually live in Vercel Blob under models/. Idempotent — run any
// time after blob-upload-models.mjs to bring skins.ts back in sync.
//
// Strategy:
//   1. List models/*.glb in blob
//   2. Parse "<prefix>_<tier>.glb" → {prefix → Set<tier>}
//   3. Reverse-lookup prefix → monument key via MONUMENT_FILE_PREFIX
//   4. Emit a new AVAILABLE_SKINS block (printed; pipe to clipboard or eyeball)
//
// Usage: node bin/blob-sync-available-skins.mjs

import { readFileSync, existsSync } from 'node:fs';
import { list } from '@vercel/blob';

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

// Parse MONUMENT_FILE_PREFIX from skins.ts (no JS module evaluation needed)
const skinsSrc = readFileSync('app/plan/location/globe/skins.ts', 'utf8');
const prefixBlock = skinsSrc.match(/MONUMENT_FILE_PREFIX[^=]*=\s*\{([^}]+)\}/s);
if (!prefixBlock) { console.error('cannot find MONUMENT_FILE_PREFIX'); process.exit(1); }

const prefixToKey = new Map(); // 'statue_liberty' → 'statueLiberty'
for (const line of prefixBlock[1].split('\n')) {
  const m = line.match(/^\s*(\w+):\s*['"]([^'"]+)['"]/);
  if (m) prefixToKey.set(m[2], m[1]);
}

console.error(`Loaded ${prefixToKey.size} prefix mappings from skins.ts`);

// Walk blob
const remoteByPrefix = new Map(); // 'statue_liberty' → Set('aurora','bronze',...)
let cursor;
do {
  const page = await list({ token: TOKEN, prefix: 'models/', cursor, limit: 1000 });
  for (const b of page.blobs) {
    const fname = b.pathname.replace(/^models\//, '');
    const m = fname.match(/^(.+)_(stone|bronze|silver|gold|diamond|aurora|celestial|damascus)\.glb$/);
    if (!m) continue;
    const [, prefix, tier] = m;
    if (!remoteByPrefix.has(prefix)) remoteByPrefix.set(prefix, new Set());
    remoteByPrefix.get(prefix).add(tier);
  }
  cursor = page.cursor;
} while (cursor);

console.error(`Found ${remoteByPrefix.size} unique prefixes in blob.`);

// Emit
const TIER_ORDER = ['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'damascus'];
const orphans = [];
console.log('export const AVAILABLE_SKINS: Record<string, Set<string>> = {');
const sortedPrefixes = [...remoteByPrefix.keys()].sort();
for (const prefix of sortedPrefixes) {
  const tiers = [...remoteByPrefix.get(prefix)].sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b));
  const monumentKey = prefixToKey.get(prefix);
  if (!monumentKey) {
    orphans.push({ prefix, tiers });
    continue;
  }
  console.log(`  ${monumentKey}: new Set([${tiers.map(t => `'${t}'`).join(', ')}]),`);
}
console.log('};');

if (orphans.length) {
  console.error(`\n# ${orphans.length} blob prefixes have no MONUMENT_FILE_PREFIX entry — won't render until added:`);
  for (const o of orphans) {
    console.error(`#   ${o.prefix} → ${o.tiers.length} tiers (${o.tiers.join(',')})`);
  }
}
