import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader"] });
// iPhone 14 Pro viewport
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/plan/location?mapbox-globe=1&mapbox-globe-dev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
try {
  await page.waitForSelector('button:has-text("Tap to open the globe")', { timeout: 15000 });
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Tap to open the globe')); if (b) b.click(); });
} catch {}
await page.waitForTimeout(8000);
await page.screenshot({ path: '/tmp/mobile-nav.png' });
console.log('saved');
await browser.close();
