#!/usr/bin/env node
// Scans public/monument-cards/ and rewrites the MONUMENT_CARD_IMAGES set
// in app/components/MonumentShop.tsx so every card image present on disk
// renders as full-bleed art. Run after gen-monument-cards.mjs.

import fs from 'node:fs/promises';
import path from 'node:path';

const REPO = '/Users/geknee/geknee';
const DIR = path.join(REPO, 'public/monument-cards');
const SRC = path.join(REPO, 'app/components/MonumentShop.tsx');

const ids = (await fs.readdir(DIR))
  .filter(f => f.endsWith('.jpg'))
  .map(f => f.replace(/\.jpg$/, ''))
  .sort();

const src = await fs.readFile(SRC, 'utf8');
const startMarker = 'const MONUMENT_CARD_IMAGES = new Set<string>([';
const endMarker = ']);';
const start = src.indexOf(startMarker);
if (start === -1) { console.error('start marker not found'); process.exit(1); }
const end = src.indexOf(endMarker, start);
if (end === -1) { console.error('end marker not found'); process.exit(1); }

const block = startMarker + '\n' +
  ids.map(id => `  '${id}',`).join('\n') +
  '\n' + endMarker;

const next = src.slice(0, start) + block + src.slice(end + endMarker.length);
await fs.writeFile(SRC, next);
console.log(`Synced ${ids.length} ids into MONUMENT_CARD_IMAGES`);
