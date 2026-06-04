import { chromium } from "playwright";
const URL = "http://localhost:3000/plan/location?mapbox-globe=1&mapbox-globe-dev=1";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 1400 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
try {
  await page.waitForSelector('button:has-text("Tap to open the globe")', { timeout: 15000 });
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Tap to open the globe')); if (b) b.click(); });
} catch {}
await page.waitForFunction(() => document.getElementById("mapbox-err-overlay")?.textContent?.includes("loaded="), null, { timeout: 60000 });
await page.waitForTimeout(8000);
const banner = await page.evaluate(() => document.getElementById("mapbox-err-overlay")?.textContent);
console.log("banner:", banner);
await page.screenshot({ path: '/tmp/flyto-before.png' });
console.log('before saved');

await page.evaluate(() => { window.dispatchEvent(new CustomEvent('geknee:globe-fly-to', { detail: { lat: 48.86, lon: 2.29 } })); });
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/flyto-after.png' });
console.log('after saved');
await browser.close();
