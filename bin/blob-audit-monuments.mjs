#!/usr/bin/env node
// bin/blob-audit-monuments.mjs
//
// Cross-references what monuments/skins EXIST in Vercel Blob against what
// the app DECLARES (MONUMENT_LATLON, MONUMENT_FILE_PREFIX, AVAILABLE_SKINS
// in skins.ts). Produces a plain-text audit with:
//   1. Monuments missing base GLB (can't render at all)
//   2. Monuments missing MONUMENT_FILE_PREFIX (broken lookup, silent 404)
//   3. Rare-skin variants declared but not shipped
//   4. Orphan blobs (uploaded but no monument uses them)
//
// Used to plan the meshy generation queue.
//
// Usage: node bin/blob-audit-monuments.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

// ─── Parse skins.ts ──────────────────────────────────────────────
const skinsSrc = readFileSync('app/plan/location/globe/skins.ts', 'utf8');

// MONUMENT_LATLON — the ground truth of what monuments exist
const latlonBlock = skinsSrc.match(/export const MONUMENT_LATLON[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!latlonBlock) { console.error('cannot find MONUMENT_LATLON'); process.exit(1); }
const declaredMonuments = new Set();
for (const line of latlonBlock[1].split('\n')) {
  const m = line.match(/^\s*(\w+):\s*\{\s*lat:/);
  if (m) declaredMonuments.add(m[1]);
}

// MONUMENT_FILE_PREFIX — camelCase mk → snake_case file prefix
const prefixBlock = skinsSrc.match(/MONUMENT_FILE_PREFIX[^=]*=\s*\{([^}]+)\}/s);
const prefixByMk = new Map(); // camelCase → snake_case
const mkByPrefix = new Map(); // snake_case → camelCase
if (prefixBlock) {
  for (const line of prefixBlock[1].split('\n')) {
    const m = line.match(/^\s*(\w+):\s*['"]([^'"]+)['"]/);
    if (m) { prefixByMk.set(m[1], m[2]); mkByPrefix.set(m[2], m[1]); }
  }
}

// AVAILABLE_SKINS — declared expected skins per monument
const availSkinsBlock = skinsSrc.match(/AVAILABLE_SKINS[^=]*=\s*\{([\s\S]*?)\n\}/);
const declaredSkins = new Map(); // mk → Set<tier>
if (availSkinsBlock) {
  for (const line of availSkinsBlock[1].split('\n')) {
    const m = line.match(/^\s*(\w+):\s*new Set\(\[([^\]]+)\]/);
    if (m) {
      const tiers = new Set([...m[2].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]));
      declaredSkins.set(m[1], tiers);
    }
  }
}

console.error(`Parsed: ${declaredMonuments.size} monuments in MONUMENT_LATLON, ${prefixByMk.size} file prefixes, ${declaredSkins.size} monuments with declared skins`);

// ─── Walk the blob ───────────────────────────────────────────────
const remoteBaseByPrefix = new Set(); // 'tokyo_skytree'
const remoteSkinsByPrefix = new Map(); // 'tokyo_skytree' → Set<tier>
let cursor;
let totalBlobs = 0;
do {
  const page = await list({ token: TOKEN, prefix: 'models/', cursor, limit: 1000 });
  for (const b of page.blobs) {
    totalBlobs++;
    const fname = b.pathname.replace(/^models\//, '');
    if (!fname.endsWith('.glb')) continue;
    const stem = fname.slice(0, -4);
    const tierMatch = stem.match(/^(.+)_(stone|bronze|silver|gold|diamond|aurora|celestial|damascus|natural|meshy)$/);
    if (tierMatch) {
      const [, prefix, tier] = tierMatch;
      if (!remoteSkinsByPrefix.has(prefix)) remoteSkinsByPrefix.set(prefix, new Set());
      remoteSkinsByPrefix.get(prefix).add(tier);
    } else {
      remoteBaseByPrefix.add(stem);
    }
  }
  cursor = page.cursor;
} while (cursor);
console.error(`Blob has ${totalBlobs} .glb files: ${remoteBaseByPrefix.size} base prefixes, ${remoteSkinsByPrefix.size} prefixes with skin variants`);

// ─── Walk public/models/mapbox/ (CapacitorGlobe source of truth) ─
const localBaseByPrefix = new Set();
const localSkinsByPrefix = new Map();
const LOCAL_DIR = 'public/models/mapbox';
if (existsSync(LOCAL_DIR)) {
  for (const fname of readdirSync(LOCAL_DIR)) {
    if (!fname.endsWith('.glb')) continue;
    const stem = fname.slice(0, -4);
    const tierMatch = stem.match(/^(.+)_(stone|bronze|silver|gold|diamond|aurora|celestial|damascus|natural|meshy)$/);
    if (tierMatch) {
      const [, prefix, tier] = tierMatch;
      if (!localSkinsByPrefix.has(prefix)) localSkinsByPrefix.set(prefix, new Set());
      localSkinsByPrefix.get(prefix).add(tier);
    } else {
      localBaseByPrefix.add(stem);
    }
  }
}
console.error(`Local ${LOCAL_DIR}: ${localBaseByPrefix.size} base, ${localSkinsByPrefix.size} prefixes with skins`);
console.error('');

// ─── AUDIT ────────────────────────────────────────────────────────
const RARE_TIERS = ['diamond', 'aurora', 'celestial', 'damascus'];
const COMMON_TIERS = ['stone', 'bronze', 'silver', 'gold'];

// Section 1: monuments with NO MONUMENT_FILE_PREFIX entry
const noPrefix = [...declaredMonuments].filter((mk) => !prefixByMk.has(mk));

// Section 2: monuments where the base GLB is missing (public/models/mapbox/)
// This is the CapacitorGlobe source of truth — served from Next.js static
// under /models/mapbox/*.glb. Missing here = monument can't render in the
// iOS app or the unified web CapacitorGlobe path at all.
const missingBase = [];
for (const mk of declaredMonuments) {
  const prefix = prefixByMk.get(mk) ?? mk;
  if (!localBaseByPrefix.has(prefix)) missingBase.push({ mk, prefix });
}

// Section 3+4: skin variants declared but not shipped anywhere.
// Union of local + blob so we don't double-flag a variant that lives in
// one storage layer even if not the other.
const shippedTiers = (prefix) => {
  const s = new Set();
  for (const t of localSkinsByPrefix.get(prefix) ?? []) s.add(t);
  for (const t of remoteSkinsByPrefix.get(prefix) ?? []) s.add(t);
  return s;
};

const missingRareSkins = [];
for (const [mk, tiers] of declaredSkins) {
  const prefix = prefixByMk.get(mk) ?? mk;
  const shipped = shippedTiers(prefix);
  for (const tier of tiers) {
    if (RARE_TIERS.includes(tier) && !shipped.has(tier)) {
      missingRareSkins.push({ mk, prefix, tier });
    }
  }
}

const missingCommonSkins = [];
for (const [mk, tiers] of declaredSkins) {
  const prefix = prefixByMk.get(mk) ?? mk;
  const shipped = shippedTiers(prefix);
  for (const tier of tiers) {
    if (COMMON_TIERS.includes(tier) && !shipped.has(tier)) {
      missingCommonSkins.push({ mk, prefix, tier });
    }
  }
}

// Section 5: orphan blob prefixes with no monument
const orphans = [];
for (const prefix of remoteBaseByPrefix) {
  if (!mkByPrefix.has(prefix) && !declaredMonuments.has(prefix)) {
    orphans.push(prefix);
  }
}

// ─── REPORT ──────────────────────────────────────────────────────
const w = (s) => process.stdout.write(s + '\n');

w('# Monument asset audit');
w(`Generated: ${new Date().toISOString()}`);
w('');
w(`- Declared monuments: ${declaredMonuments.size}`);
w(`- Prefix mappings: ${prefixByMk.size}`);
w(`- Blob .glb files: ${totalBlobs}`);
w(`- Base GLBs in blob: ${remoteBaseByPrefix.size}`);
w(`- Prefixes with skin variants in blob: ${remoteSkinsByPrefix.size}`);
w('');

w('## 1. Monuments missing MONUMENT_FILE_PREFIX entry (silent 404 in app)');
if (noPrefix.length === 0) w('_none_');
else for (const mk of noPrefix) w(`- \`${mk}\``);
w('');

w('## 2. Monuments missing base GLB in blob (cannot render at all)');
if (missingBase.length === 0) w('_none_');
else for (const { mk, prefix } of missingBase) w(`- \`${mk}\` → expects \`${prefix}.glb\``);
w('');

w('## 3. Rare-skin variants declared but missing (falls back to base)');
if (missingRareSkins.length === 0) w('_none_');
else {
  const byMk = new Map();
  for (const { mk, tier } of missingRareSkins) {
    if (!byMk.has(mk)) byMk.set(mk, []);
    byMk.get(mk).push(tier);
  }
  for (const [mk, tiers] of byMk) {
    w(`- \`${mk}\` needs: ${tiers.map((t) => `**${t}**`).join(', ')}`);
  }
}
w('');

w('## 4. Common-skin variants declared but missing');
if (missingCommonSkins.length === 0) w('_none_');
else {
  const byMk = new Map();
  for (const { mk, tier } of missingCommonSkins) {
    if (!byMk.has(mk)) byMk.set(mk, []);
    byMk.get(mk).push(tier);
  }
  for (const [mk, tiers] of byMk) {
    w(`- \`${mk}\` needs: ${tiers.join(', ')}`);
  }
}
w('');

w('## 5. Orphan blob prefixes (uploaded but no monument uses them)');
if (orphans.length === 0) w('_none_');
else for (const p of orphans) w(`- \`${p}.glb\``);
