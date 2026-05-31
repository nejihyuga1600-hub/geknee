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
//   node bin/snap-appstore.mjs                            # public pages only
//   node bin/snap-appstore.mjs --base http://localhost:3000
//   node bin/snap-appstore.mjs --cookie-file /tmp/geknee-cookie  # auth-gated too
//
// AUTH COOKIE
//   Extract the geknee Auth.js session cookie from Chrome (Safari's sandbox
//   blocks reads) once:
//     python3 bin/extract-chrome-cookie.py --host www.geknee.com \
//       --name authjs.session-token > /tmp/geknee-cookie
//   Then pass --cookie-file /tmp/geknee-cookie to capture the globe, planner,
//   and other authenticated views in the same run.
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv;
const arg = (k) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : null; };
const BASE = arg('--base') ?? 'https://www.geknee.com';
const COOKIE_FILE = arg('--cookie-file');
const OUT = path.resolve('ad-assets/appstore');

const DEVICES = [
  { name: 'iphone-6.5', width: 1290, height: 2796, deviceScaleFactor: 1 },
  { name: 'iphone-5.5', width: 1242, height: 2208, deviceScaleFactor: 1 },
  { name: 'ipad-12.9',  width: 2048, height: 2732, deviceScaleFactor: 1 },
];

const PUBLIC_PAGES = [
  { name: 'landing',     path: '/',          waitMs: 2500 },
  { name: 'pricing',     path: '/pricing',   waitMs: 1500 },
  { name: 'leaderboard', path: '/leaderboard', waitMs: 1500 },
  { name: 'privacy',     path: '/privacy',   waitMs: 1000 },
];

// Pre-seed camera position so the globe spawns over a continent with visible
// landmarks instead of the empty Pacific default. Computed for a view centred
// on ~lat 40, lon 0 (Europe + North Africa) at the default OrbitControls distance.
// Storage key + payload shape per CLAUDE.md (geknee:globe-camera-v1, {x,y,z}).
const GLOBE_CAMERA_EUROPE = JSON.stringify({ x: 0, y: 10, z: 15 });

const AUTH_PAGES = [
  { name: 'globe',       path: '/plan/location', waitMs: 8000,
    preSeed: { 'geknee:globe-camera-v1': GLOBE_CAMERA_EUROPE } },
  { name: 'plan-dates',  path: '/plan/dates',    waitMs: 2500 },
  { name: 'plan-style',  path: '/plan/style',    waitMs: 2500 },
  { name: 'trips',       path: '/trips',         waitMs: 2000 },
  { name: 'vault',       path: '/vault',         waitMs: 2000 },
];

const cookieValue = COOKIE_FILE ? (await readFile(COOKIE_FILE, 'utf8')).trim() : null;
const PAGES = cookieValue ? [...PUBLIC_PAGES, ...AUTH_PAGES] : PUBLIC_PAGES;

const cookieHost = new URL(BASE).hostname;

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
  if (cookieValue) {
    await ctx.addCookies([{
      name: 'authjs.session-token',
      value: cookieValue,
      domain: cookieHost,
      path: '/',
      httpOnly: true,
      secure: BASE.startsWith('https'),
      sameSite: 'Lax',
    }]);
  }
  const page = await ctx.newPage();

  for (let i = 0; i < PAGES.length; i++) {
    const p = PAGES[i];
    const url = BASE + p.path;
    const file = path.join(deviceDir, `${String(i + 1).padStart(2, '0')}-${p.name}.png`);
    process.stderr.write(`${dev.name}  ${url} → ${path.relative('.', file)}\n`);
    try {
      // domcontentloaded — networkidle never resolves on globe (continuous WebGL).
      // Per-page waitMs covers texture/scene settle time.
      if (p.preSeed) {
        // Seed localStorage on the target origin before the page mounts.
        // Need to visit any same-origin page first so localStorage is bound
        // to that origin, then set values, then navigate to the real target.
        await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.evaluate((seeds) => {
          for (const [k, v] of Object.entries(seeds)) localStorage.setItem(k, v);
        }, p.preSeed);
      }
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
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
