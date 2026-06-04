// Headless verify: navigate to ?mapbox-globe=1&mapbox-globe-dev=1,
// wait for the diagnostic banner to read loaded=31/31, screenshot.
import { chromium } from "playwright";

const URL = "http://localhost:3000/plan/location?mapbox-globe=1&mapbox-globe-dev=1";

const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 1400 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", (msg) => console.log(`  [console.${msg.type()}]`, msg.text().slice(0, 200)));
page.on("pageerror", (err) => console.log("  [pageerror]", err.message));

console.log(`Navigating to ${URL}`);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

// First-open landing CTA needs to be clicked to mount the globe
try {
  await page.waitForSelector('button:has-text("Tap to open the globe")', { timeout: 15000 });
  console.log("Clicking 'Tap to open the globe' CTA");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const b = btns.find((b) => b.textContent?.includes("Tap to open the globe"));
    if (b) b.click();
  });
} catch {
  console.log("No CTA — already mounted");
}

// Wait for either the diagnostic banner to populate OR a timeout
console.log("Waiting for diagnostic banner...");
const text = await page.waitForFunction(
  () => {
    const el = document.getElementById("mapbox-err-overlay");
    return el?.textContent?.includes("loaded=") ? el.textContent : false;
  },
  null,
  { timeout: 60000 },
).then((h) => h.jsonValue()).catch(() => null);
console.log("Banner:", text);

// Give models time to load + render
await page.waitForTimeout(8000);
const finalBanner = await page.evaluate(() => document.getElementById("mapbox-err-overlay")?.textContent || "(empty)");
console.log("Final banner:", finalBanner);

await page.screenshot({ path: "/tmp/mapbox-verify.png", fullPage: false });
console.log("Screenshot → /tmp/mapbox-verify.png");

await browser.close();
