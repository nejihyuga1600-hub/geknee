#!/usr/bin/env node
// Generate App Store screenshots at Apple's required pixel dimensions.
//
// Captures geknee.com at three viewport sizes:
//   - iPhone 6.5"  → 1290 × 2796 (iPhone 16/15/14 Pro Max)
//   - iPhone 5.5"  → 1242 × 2208 (iPhone 8 Plus — legacy required)
//   - iPad 12.9"   → 2048 × 2732 (iPad Pro)
//
// Saves to ad-assets/appstore/<device>/<order>-<name>.png.
//
// USAGE
//   node bin/snap-appstore.mjs                     # public pages only
//   node bin/snap-appstore.mjs --base http://localhost:3000
//
// LIMITATION
//   The 3D globe at /plan/location and the trip planner require auth. This
//   script captures the public marketing pages only. For the auth-gated
//   hero shots, sign in via Safari and use screencapture (per docs/PLAY_STORE_DEPLOY_HANDOFF.md)
//   or extend this script with a NextAuth credentials POST → cookie injection.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv.indexOf('--base') > -1
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'https://www.geknee.com';
const OUT = path.resolve('ad-assets/appstore');

const DEVICES = [
  { name: 'iphone-6.5', width: 1290, height: 2796, deviceScaleFactor: 1 },
  { name: 'iphone-5.5', width: 1242, height: 2208, deviceScaleFactor: 1 },
  { name: 'ipad-12.9',  width: 2048, height: 2732, deviceScaleFactor: 1 },
];

// Public pages only — anything more requires an auth cookie.
const PAGES = [
  { name: 'landing',     path: '/',          waitMs: 2500 },
  { name: 'pricing',     path: '/pricing',   waitMs: 1500 },
  { name: 'leaderboard', path: '/leaderboard', waitMs: 1500 },
  { name: 'privacy',     path: '/privacy',   waitMs: 1000 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });

for (const dev of DEVICES) {
  const deviceDir = path.join(OUT, dev.name);
  await mkdir(deviceDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: dev.deviceScaleFactor,
    isMobile: dev.name.startsWith('iphone'),
    hasTouch: dev.name.startsWith('iphone') || dev.name.startsWith('ipad'),
    userAgent: dev.name.startsWith('iphone')
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();

  for (let i = 0; i < PAGES.length; i++) {
    const p = PAGES[i];
    const url = BASE + p.path;
    const file = path.join(deviceDir, `${String(i + 1).padStart(2, '0')}-${p.name}.png`);
    process.stderr.write(`${dev.name}  ${url} → ${path.relative('.', file)}\n`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(p.waitMs);
      await page.screenshot({ path: file, fullPage: false });
    } catch (err) {
      process.stderr.write(`  ⚠ ${err.message}\n`);
    }
  }

  await ctx.close();
}

await browser.close();
process.stderr.write(`\nDone. Screenshots in ${path.relative('.', OUT)}/\n`);
