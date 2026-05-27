#!/usr/bin/env node
// bin/meshy-promote.mjs
// Takes an approved skin from models/preview/ → live at models/<prefix>_<style>.glb,
// wires it into AVAILABLE_SKINS, and produces an influencer launch brief.
//
// Reads state from /tmp/meshy-preview/<prefix>_<style>.json (written by
// bin/meshy-new-skin.mjs), so the only required args are --mk and --style.
//
// ── Asset layout (2026-05-19+) ───────────────────────────────────────────────
// public/models/   — local copies of GLBs whose monument key IS in
//                    MONUMENT_FILE_PREFIX (the active 19-monument lineup).
//                    Gitignored. Browser fetches the styled variants
//                    (eiffel_tower_bronze.glb etc.) from Vercel Blob.
//
// meshy-staging/   — generated GLBs that are "done" in meshy_progress.json
//                    but NOT yet promoted into AVAILABLE_SKINS. Kept here
//                    so the work isn't lost while staying out of public/ so
//                    it never ships to the browser. Gitignored.
//
// This script itself operates entirely on Vercel Blob (`put`/`del`); the
// local filesystem folders above are a parallel staging concern for the
// human + Meshy generation workflow, not for this promote step.
//
// Usage:
//   node bin/meshy-promote.mjs --mk eiffelTower --style obsidian
//   node bin/meshy-promote.mjs --mk eiffelTower --style obsidian --mission "Visit the Eiffel at sunrise and frame it through a café window"
//
// Does NOT auto-commit — prints the suggested commit command so you stay
// in control. Does NOT post to socials — hands you the brief, you hand
// it to the creator.

import { put, del } from '@vercel/blob';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import process from 'process';

const BLOB_BASE = 'https://mrfgpxw07gmgmriv.public.blob.vercel-storage.com';

// ─── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

const args = parseArgs();
const mk   = args.mk;
const style = args.style;
const missionOverride = args.mission;
if (!mk || !style) {
  console.error('Usage: node bin/meshy-promote.mjs --mk <monument> --style <skin> [--mission "..."]');
  process.exit(1);
}

// Lookup preview state
const previewState = (() => {
  const prefixGuess = mk === 'colosseum' ? 'Colosseum'
    : mk.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  const path = `/tmp/meshy-preview/${prefixGuess}_${style}.json`;
  if (!existsSync(path)) {
    // fallback: search files by mk+style (filename may differ if prefix mapping changed)
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
})();

if (!previewState) {
  console.error(`No preview state at /tmp/meshy-preview/*_${style}.json`);
  console.error('Run bin/meshy-new-skin.mjs first, or pass --preview-url manually.');
  process.exit(1);
}

const { prefix, previewUrl } = previewState;

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) { console.error('BLOB_READ_WRITE_TOKEN missing'); process.exit(1); }

// ─── 1) Promote blob: copy preview → live, delete preview ──────────────────────

console.log(`\n→ Promoting ${mk}/${style}`);
console.log(`  Preview: ${previewUrl}`);

console.log('1/5 · Downloading preview GLB…');
const glbRes = await fetch(previewUrl);
if (!glbRes.ok) throw new Error(`Preview GLB fetch failed: ${glbRes.status}`);
const glbBytes = Buffer.from(await glbRes.arrayBuffer());

console.log('2/5 · Uploading to live path…');
const liveKey = `models/${prefix}_${style}.glb`;
const uploaded = await put(liveKey, glbBytes, {
  access: 'public',
  contentType: 'model/gltf-binary',
  addRandomSuffix: false,
  allowOverwrite: true,
  token: BLOB_TOKEN,
});
console.log(`   ✓ ${uploaded.url}`);

console.log('3/5 · Deleting preview…');
try {
  await del(previewUrl, { token: BLOB_TOKEN });
  console.log('   ✓ preview removed');
} catch (e) {
  console.warn(`   ! preview delete failed (non-fatal): ${e.message}`);
}

// ─── 1b) Persist per-skin hero PNG for share cards ─────────────────────────────
// When the skin was generated via image-mode (Nano Banana → Meshy), the source
// 2D image already exists at previewState.imageRef. Mirror it into Blob at a
// predictable path so /api/og/share can render it without an extra MCP call.
// Modes without a source image (text, retexture) skip this — the share card
// falls back to the Wikipedia thumbnail for those skins.
if (previewState.imageRef) {
  console.log('3b/5 · Persisting share hero PNG…');
  try {
    const heroRes = await fetch(previewState.imageRef);
    if (!heroRes.ok) throw new Error(`hero fetch ${heroRes.status}`);
    const heroBytes = Buffer.from(await heroRes.arrayBuffer());
    const heroKey = `share/${prefix}_${style}_hero.png`;
    const heroUploaded = await put(heroKey, heroBytes, {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
      allowOverwrite: true,
      token: BLOB_TOKEN,
    });
    console.log(`   ✓ ${heroUploaded.url}`);
  } catch (e) {
    console.warn(`   ! hero PNG persist failed (non-fatal, OG falls back to Wikipedia): ${e.message}`);
  }
} else {
  console.log('3b/5 · No imageRef in preview state — skipping hero PNG (OG falls back to Wikipedia)');
}

// ─── 2) Codemod AVAILABLE_SKINS ───────────────────────────────────────────────

// AVAILABLE_SKINS was extracted from LocationClient.tsx into globe/skins.ts
// during the LocationClient split. Codemod targets the new location.
console.log('4/5 · Wiring AVAILABLE_SKINS in globe/skins.ts…');
const locPath = 'app/plan/location/globe/skins.ts';
const src = readFileSync(locPath, 'utf8');

// Find: <mk>: new Set(['stone', ...])  — allow multi-line, flexible whitespace
const setRegex = new RegExp(
  `(${mk}:\\s*new Set\\(\\[)([^\\]]*)(\\]\\))`,
  'm',
);
const match = src.match(setRegex);

let newSrc = src;
if (match) {
  const listRaw = match[2];
  // Parse existing skins
  const existing = Array.from(listRaw.matchAll(/'([^']+)'/g)).map(m => m[1]);
  if (existing.includes(style)) {
    console.log(`   (already present) — AVAILABLE_SKINS.${mk} already contains '${style}', skipping`);
  } else {
    const updated = [...existing, style];
    const newList = updated.map(s => `'${s}'`).join(', ');
    newSrc = src.replace(setRegex, `$1${newList}$3`);
    console.log(`   ✓ added '${style}' to AVAILABLE_SKINS.${mk}  (now: ${updated.join(', ')})`);
  }
} else {
  // Monument not in AVAILABLE_SKINS yet — add a new entry
  const insertPoint = src.indexOf('const AVAILABLE_SKINS:');
  if (insertPoint < 0) throw new Error('Could not find AVAILABLE_SKINS in globe/skins.ts');
  const openBrace = src.indexOf('{', insertPoint);
  const insertion = `\n  ${mk}: new Set(['${style}']),`;
  newSrc = src.slice(0, openBrace + 1) + insertion + src.slice(openBrace + 1);
  console.log(`   ✓ added new monument entry AVAILABLE_SKINS.${mk} = Set(['${style}'])`);
}

writeFileSync(locPath, newSrc);

// ─── 3) Influencer brief + captions ────────────────────────────────────────────

console.log('5/5 · Generating influencer brief…');

const CITY = {
  eiffelTower: 'Paris, France',
  colosseum: 'Rome, Italy',
  tajMahal: 'Agra, India',
  greatWall: 'Badaling, China',
  statueLiberty: 'New York, USA',
  sagradaFamilia: 'Barcelona, Spain',
  machuPicchu: 'Cusco Region, Peru',
  christRedeem: 'Rio de Janeiro, Brazil',
  angkorWat: 'Siem Reap, Cambodia',
  pyramidGiza: 'Giza, Egypt',
  goldenGate: 'San Francisco, USA',
  bigBen: 'London, UK',
  acropolis: 'Athens, Greece',
  sydneyOpera: 'Sydney, Australia',
  neuschwanstein: 'Bavaria, Germany',
  stonehenge: 'Wiltshire, UK',
  iguazuFalls: 'Foz do Iguaçu, Brazil / Argentina',
  tokyoSkytree: 'Tokyo, Japan',
  victoriaFalls: 'Zimbabwe / Zambia',
};
const NAMES = {
  eiffelTower: 'Eiffel Tower', colosseum: 'Colosseum', tajMahal: 'Taj Mahal',
  greatWall: 'Great Wall of China', statueLiberty: 'Statue of Liberty',
  sagradaFamilia: 'Sagrada Família', machuPicchu: 'Machu Picchu',
  christRedeem: 'Christ the Redeemer', angkorWat: 'Angkor Wat',
  pyramidGiza: 'Pyramids of Giza', goldenGate: 'Golden Gate Bridge',
  bigBen: 'Big Ben', acropolis: 'Acropolis', sydneyOpera: 'Sydney Opera House',
  neuschwanstein: 'Neuschwanstein Castle', stonehenge: 'Stonehenge',
  iguazuFalls: 'Iguazu Falls', tokyoSkytree: 'Tokyo Skytree',
  victoriaFalls: 'Victoria Falls',
};
const TIER_COLOR = {
  stone: '#a8a8a8', bronze: '#cd7f32', silver: '#e8e8e8', gold: '#ffd700',
  diamond: '#b9f2ff', aurora: '#7cff97', celestial: '#c4a7ff', obsidian: '#1a1a2e',
};
const TIER_RANK = {
  stone: 1, bronze: 2, silver: 3, gold: 4, diamond: 5, aurora: 6, celestial: 7,
};

const monName = NAMES[mk] ?? mk;
const city    = CITY[mk] ?? 'Unknown';
const tier    = TIER_RANK[style] ?? '?';
const color   = TIER_COLOR[style] ?? '#ffd700';

const defaultMission = missionOverride || `Visit the ${monName} in ${city}, upload a photo within 50km of the coordinates, and tag geknee. Completing the mission unlocks the ${style.toUpperCase()} tier — a collectible that lives on your public profile at geknee.com/u/<your-handle>.`;

// Gemini captions (best-effort; falls back to templates if key missing / API fails)
async function geminiCaption(platform) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const prompt = `Write a short ${platform} caption for a travel-creator launching a geknee.com quest.

The quest: ${defaultMission}
The reward: the ${style.toUpperCase()} tier ${monName} skin — tier ${tier}/7 rarity.
Location: ${city}.

Rules:
- Write in the creator's voice, first person, upbeat but not cheesy.
- Do NOT use the word "showcase" or "unlock your potential".
- Include one call to action linking to geknee.com/u/<handle> (placeholder ok).
- ${platform === 'tiktok' ? 'Hook in the first 6 words. Keep under 150 characters.' :
    platform === 'x' ? 'Under 240 characters. End with a hashtag-free line.' :
    platform === 'instagram' ? '3-5 sentences. End with 5 relevant hashtags.' :
    'LinkedIn voice — two short paragraphs, professional but warm.'}

Return only the caption text, no explanation.`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 500 },
      }),
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  } catch (e) {
    console.warn(`   ! Gemini ${platform} failed: ${e.message}`);
    return null;
  }
}

const [xCap, igCap, ttCap, liCap] = await Promise.all([
  geminiCaption('x'),
  geminiCaption('instagram'),
  geminiCaption('tiktok'),
  geminiCaption('linkedin'),
]);

const shareSlug = Buffer.from(JSON.stringify({ u: 'creator', mk, skin: style }))
  .toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const shareUrl = `https://www.geknee.com/share/${shareSlug}`;
const ogImg = `https://www.geknee.com/api/og/share?u=creator&mk=${mk}&skin=${style}`;

const briefDir = `/tmp/launch/${mk}-${style}`;
mkdirSync(briefDir, { recursive: true });

const brief = `# Launch Brief — ${style.toUpperCase()} ${monName}

**Tier:** ${tier}/7 rarity · color \`${color}\`
**Monument:** ${monName}
**City:** ${city}
**Live GLB:** ${uploaded.url}

## The quest

${defaultMission}

## The reward

Users who complete the quest unlock the **${style.toUpperCase()} ${monName}** on
geknee.com — a tier-${tier} rarity collectible that renders on their globe and
their public profile.

## Visual assets

- **Share card (OG):** ${ogImg}
- **Share URL:** ${shareUrl}

Embed the share URL in the video description — X / LinkedIn / Slack / Discord
will render the share card as a preview.

## Video direction (for the creator)

- Portrait, 1080×1920, 15–30s
- Hook in the first 3 seconds ("You can't collect ${city} from your couch")
- Show the real trip: establishing shot → journey moment → arrival at ${monName}
- Document the mission action (photo upload / geotag)
- Close with the app showing the new ${style.toUpperCase()} ${monName} in their collection

## Pre-drafted captions

### X
${xCap ?? `Just unlocked the ${style.toUpperCase()} ${monName} on geknee.com 🌍 Tier ${tier}/7 rarity — you earn it by actually going to ${city}. Not a feed scroll, a trip. ${shareUrl}`}

### Instagram
${igCap ?? `Crossed ${monName} off the list and unlocked the ${style.toUpperCase()} tier on geknee 🌍\n\nEvery monument has 7 rarity skins — and you only get them by actually showing up. Tier ${tier}/7 is now on my collection at ${shareUrl}\n\n#travel #${mk.toLowerCase()} #collection #geknee #realtravel`}

### TikTok
${ttCap ?? `POV: you're collecting the world one tower at a time 🏛️ ${style.toUpperCase()} tier ${monName} unlocked. ${shareUrl}`}

### LinkedIn
${liCap ?? `A little side quest from my trip to ${city}: geknee.com turns travel into a collection game, and I just unlocked the ${style.toUpperCase()} tier ${monName} — you earn rarity by physically being there.\n\nIf you like building something that makes a "boring" vertical playful again, check it out. ${shareUrl}`}

## Metadata

- mk: \`${mk}\`
- style: \`${style}\`
- generatedAt: ${new Date().toISOString()}
- livePath: \`${liveKey}\`
`;

writeFileSync(`${briefDir}/brief.md`, brief);
console.log(`   ✓ Brief at ${briefDir}/brief.md`);

// ─── Final summary ─────────────────────────────────────────────────────────────

console.log(`\n──────────────────────────────────────────────`);
console.log(`Promoted: ${monName} · ${style.toUpperCase()}`);
console.log(`──────────────────────────────────────────────\n`);
console.log(`Live GLB:      ${uploaded.url}`);
console.log(`Share card:    ${ogImg}`);
console.log(`Brief:         ${briefDir}/brief.md`);
console.log(`\nNext: commit + deploy. Suggested:`);
console.log(`  git add app/plan/location/LocationClient.tsx`);
console.log(`  git commit -m "Add ${style} skin for ${mk}"`);
console.log(`  git push`);
console.log(`\nThen hand the brief to the creator and set the launch tweet.\n`);
