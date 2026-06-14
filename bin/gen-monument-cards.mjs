#!/usr/bin/env node
// Batch-generate monument card art via Gemini 3 Pro Image Preview (REST).
//
// Input:  /tmp/monuments_todo.json — [{id, name, location}, ...]
// Output: public/monument-cards/{id}.jpg, downsized to ~1031x1280 @ 85%
//
// Usage:
//   node bin/gen-monument-cards.mjs                  # all remaining
//   node bin/gen-monument-cards.mjs --limit 25       # first 25 only
//   node bin/gen-monument-cards.mjs --concurrency 8  # tune parallel
//
// Skips ids whose target file already exists, so re-running picks up
// where the last batch stopped.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = '/Users/geknee/geknee';
const TODO = '/tmp/monuments_todo.json';
const OUT_DIR = path.join(REPO, 'public/monument-cards');
const MODEL = 'gemini-3-pro-image-preview';

const args = process.argv.slice(2);
const argMap = Object.fromEntries(
  args.flatMap((a, i) => a.startsWith('--') ? [[a.slice(2), args[i + 1]]] : []),
);
const LIMIT = argMap.limit ? Number(argMap.limit) : Infinity;
const CONCURRENCY = argMap.concurrency ? Number(argMap.concurrency) : 5;

const envFile = await fs.readFile(path.join(REPO, '.env.local'), 'utf8');
const apiKey = envFile.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const all = JSON.parse(await fs.readFile(TODO, 'utf8'));
const queue = all
  .filter(m => !existsSync(path.join(OUT_DIR, `${m.id}.jpg`)))
  .slice(0, LIMIT);

console.log(`To generate: ${queue.length} (concurrency=${CONCURRENCY}, model=${MODEL})`);

const promptFor = ({ name, location }) =>
  `Photorealistic medium-format photograph of ${name} in ${location} at golden hour. ` +
  `The ${name} is CENTERED in the frame and FILLS the composition. ` +
  `Dramatic warm sunlight, deep navy sky transitioning to amber and rose gold at the horizon, ` +
  `ultra-detailed, soft atmospheric haze, cinematic depth, premium travel photography. ` +
  `ABSOLUTELY NO text, letters, words, signage, captions, labels, or watermarks anywhere. ` +
  `No frame, no border — image extends edge to edge. Portrait composition 4:5, monument centered, ` +
  `no negative space on the sides, no large empty regions.`;

let done = 0, failed = 0;
const failures = [];

async function generateOne(m) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: promptFor(m) }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '4:5' },
    },
  };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const data = await resp.json();
    const part = data?.candidates?.[0]?.content?.parts?.find(p => p?.inlineData?.data);
    if (!part) throw new Error(`no image part in response: ${JSON.stringify(data).slice(0, 200)}`);
    const out = path.join(OUT_DIR, `${m.id}.jpg`);
    await fs.writeFile(out, Buffer.from(part.inlineData.data, 'base64'));
    // Downsize to keep repo small. sips is idempotent on already-small images.
    spawnSync('sips', ['-Z', '1280', '-s', 'formatOptions', '85', out, '--out', out], { stdio: 'ignore' });
    done++;
    console.log(`[${done + failed}/${queue.length}] ✓ ${m.id} — ${m.name}`);
  } catch (e) {
    failed++;
    failures.push({ id: m.id, name: m.name, error: String(e?.message ?? e) });
    console.log(`[${done + failed}/${queue.length}] ✗ ${m.id} — ${String(e?.message ?? e).slice(0, 120)}`);
  }
}

const cursor = { i: 0 };
async function worker() {
  while (cursor.i < queue.length) {
    const my = cursor.i++;
    await generateOne(queue[my]);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\nDone. success=${done} failed=${failed}`);
if (failures.length) {
  await fs.writeFile('/tmp/monument_failures.json', JSON.stringify(failures, null, 2));
  console.log(`Failures written to /tmp/monument_failures.json`);
}
