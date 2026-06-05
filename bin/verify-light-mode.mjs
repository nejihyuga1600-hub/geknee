import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader"] });
// iPhone 15 Pro viewport + light color scheme to reproduce the bug
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  colorScheme: "light",
});
const page = await ctx.newPage();
await page.goto("http://localhost:3000/plan/location?mapbox-globe=1&mapbox-globe-dev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
try {
  await page.waitForSelector('button:has-text("Tap to open the globe")', { timeout: 15000 });
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Tap to open the globe')); if (b) b.click(); });
} catch {}
await page.waitForTimeout(8000);
const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const htmlBg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
console.log('body bg:', bodyBg);
console.log('html bg:', htmlBg);
await page.screenshot({ path: '/tmp/light-mode-globe.png' });
console.log('saved');
await browser.close();
