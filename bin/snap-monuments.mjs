#!/usr/bin/env node
// Snapshots every wired monument GLB at a curated camera angle and writes
// transparent PNGs to public/monument-snaps/.
//
// Usage:
//   npm run dev               # in another terminal — must be on :3000
//   node bin/snap-monuments.mjs                # snap every monument
//   node bin/snap-monuments.mjs eiffelTower    # snap one
//   node bin/snap-monuments.mjs --skin=gold    # use a specific skin
//   node bin/snap-monuments.mjs --base=https://geknee.com  # against prod (needs ALLOW_MONUMENT_SNAP=1)
//
// Why a script and not just a CLI screenshot of the live globe? The globe
// shows monuments at globe-scale next to a sphere; the cards need each
// monument framed in isolation at a known angle. Same source-of-truth GLB,
// different camera. Reusable for any future "render this monument and check
// it" automation: bug repro, regression baselines, marketing assets.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'monument-snaps');

// Only monuments with Meshy GLBs uploaded to Vercel Blob — mirrors
// AVAILABLE_SKINS in app/plan/location/globe/skins.ts. If you add a new
// monument's GLBs (via bin/meshy-promote.mjs), add it here too.
const MONUMENTS = [
  'eiffelTower', 'colosseum', 'tajMahal', 'greatWall', 'statueLiberty',
  'sagradaFamilia', 'christRedeem', 'bigBen', 'sydneyOpera',
  // Second wave — all 22 remaining with available bronze (or better) GLBs.
  'machuPicchu', 'angkorWat', 'pyramidGiza', 'goldenGate', 'acropolis',
  'neuschwanstein', 'stonehenge', 'iguazuFalls', 'tokyoSkytree', 'victoriaFalls',
  'mountFuji', 'petra', 'niagaraFalls', 'chichenItza', 'burjKhalifa',
  'hagiaSophia', 'notreDameF', 'forbiddenCity', 'uluru', 'mtRushmore',
  'easterIsland', 'fushimiInari',
];

// Default skin per monument — picks the most "iconic" finish. Override via --skin.
// Falls back to the first available skin in skins.ts AVAILABLE_SKINS if missing.
const DEFAULT_SKIN = {
  eiffelTower: 'gold', colosseum: 'bronze', tajMahal: 'silver',
  greatWall: 'bronze', statueLiberty: 'aurora', sagradaFamilia: 'celestial',
  christRedeem: 'celestial', bigBen: 'diamond', sydneyOpera: 'silver',
  // Second wave: cherry-pick the best tier where multiple exist, bronze
  // otherwise (the only available tier for the 19 long-tail monuments).
  machuPicchu: 'gold', pyramidGiza: 'gold',
  angkorWat: 'bronze', goldenGate: 'bronze', acropolis: 'bronze',
  neuschwanstein: 'bronze', stonehenge: 'bronze', iguazuFalls: 'bronze',
  tokyoSkytree: 'bronze', victoriaFalls: 'bronze', mountFuji: 'bronze',
  petra: 'bronze', niagaraFalls: 'bronze', chichenItza: 'bronze',
  burjKhalifa: 'bronze', hagiaSophia: 'bronze', notreDameF: 'bronze',
  forbiddenCity: 'bronze', uluru: 'bronze', mtRushmore: 'bronze',
  easterIsland: 'bronze', fushimiInari: 'bronze',
};

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (const a of argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v ?? true;
    } else positional.push(a);
  }
  return { flags, positional };
}

async function main() {
  const { flags, positional } = parseArgs(process.argv);
  const base = flags.base ?? 'http://localhost:3000';
  const width = parseInt(flags.w ?? '600', 10);
  const height = parseInt(flags.h ?? '800', 10);
  const targets = positional.length > 0 ? positional : MONUMENTS;

  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log(`[snap] launching chromium (headed=false)`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  // Viewport is taller than the snap target so the Next.js dev HMR chip falls
  // into the empty space below — we clip-screenshot just the target area.
  const PORTAL_GUTTER = 220;
  const ctx = await browser.newContext({
    viewport: { width, height: height + PORTAL_GUTTER },
    deviceScaleFactor: 2,
  });

  // Persistent kill switch for the Next.js dev portal — installed before any
  // page script runs. The dev panel keeps re-mounting itself, so a one-shot
  // delete loses the race; a MutationObserver removes it the moment it appears.
  await ctx.addInitScript(() => {
    const nuke = () => {
      document
        .querySelectorAll('nextjs-portal, [data-next-mark], [data-next-mark-loading]')
        .forEach((el) => el.remove());
    };
    const arm = () => {
      new MutationObserver(nuke).observe(document.documentElement, { childList: true, subtree: true });
      nuke();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', arm);
    } else {
      arm();
    }
  });

  let ok = 0, fail = 0;
  for (const mk of targets) {
    const skin = flags.skin ?? DEFAULT_SKIN[mk] ?? 'stone';
    const url = `${base}/dev/monument-snap/${mk}?skin=${skin}&w=${width}&h=${height}`;
    console.log(`[snap] ${mk} (${skin}) ← ${url}`);

    const page = await ctx.newPage();
    page.on('pageerror', err => console.log(`  [page error] ${err.message}`));
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(
        () => Boolean(window.__snapReady),
        null,
        { timeout: 30000 },
      );
      // Extra settle for the renderer to flush after framing AND for the IBL
      // Environment HDR to finish decoding (PBR materials look black until then).
      await page.waitForTimeout(1200);

      // Strip the Next.js dev portal (HMR indicator, error overlay, etc.) — it
      // lives in a Shadow DOM root that our page-level CSS can't reach.
      await page.evaluate(() => {
        document.querySelectorAll('nextjs-portal, [data-next-mark], [data-next-mark-loading]')
          .forEach(el => el.remove());
      });
      await page.waitForTimeout(100);

      // Clip-screenshot the top region only, leaving the dev-portal chip
      // outside the captured area.
      const out = path.join(OUT_DIR, `${mk}.png`);
      await page.screenshot({
        path: out,
        omitBackground: true,
        clip: { x: 0, y: 0, width, height },
      });
      const stat = await fs.stat(out);
      console.log(`  ✓ ${out} (${(stat.size / 1024).toFixed(1)} KB)`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${mk}: ${err.message}`);
      fail++;
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log(`[snap] done — ${ok} ok, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
