import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader"] });
// Light-mode mobile context — was the failing case
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, colorScheme: "light" });
const page = await ctx.newPage();
// Hit landing first
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
const landingBg = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor }));
console.log('landing:', JSON.stringify(landingBg));
// Navigate to planner
await page.goto("http://localhost:3000/plan/location", { waitUntil: "domcontentloaded", timeout: 60000 });
const plannerBg = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor }));
console.log('planner:', JSON.stringify(plannerBg));
await browser.close();
