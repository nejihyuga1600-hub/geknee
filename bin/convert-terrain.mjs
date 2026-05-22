#!/usr/bin/env node
/**
 * convert-terrain.mjs — one-time JPG → WebP conversion for the monthly
 * NASA Blue Marble terrain assets in /public/.
 *
 * Each earth_terrain_NN.jpg (~9 MB) becomes earth_terrain_NN.webp
 * (~3 MB) at quality 80 — visually identical on a sphere where the
 * texture maps to ~0.05% of texels on-screen at any moment, but
 * shaves ~6 MB per cold load.
 *
 * The original .jpg files stay in place so legacy callers
 * (/plan/style/page.tsx still loads earth_terrain.jpg by name) keep
 * working until they're migrated separately. The LocationClient
 * terrain loader tries .webp first, falls back to .jpg if absent.
 *
 * Usage: node bin/convert-terrain.mjs
 */

import sharp from "sharp";
import { readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

async function main() {
  const files = (await readdir(publicDir))
    .filter((f) => /^earth_terrain_\d{2}\.jpg$/.test(f))
    .sort();

  if (files.length === 0) {
    console.error("[terrain] no earth_terrain_NN.jpg files found");
    process.exit(1);
  }

  let totalJpg = 0;
  let totalWebp = 0;
  for (const f of files) {
    const inPath = join(publicDir, f);
    const outPath = join(publicDir, f.replace(/\.jpg$/, ".webp"));
    const inSize = (await stat(inPath)).size;
    totalJpg += inSize;

    await sharp(inPath)
      .webp({ quality: 80, effort: 5 })
      .toFile(outPath);

    const outSize = (await stat(outPath)).size;
    totalWebp += outSize;
    const ratio = ((outSize / inSize) * 100).toFixed(0);
    console.log(`[terrain] ${f}  ${(inSize / 1024 / 1024).toFixed(1)} MB → ${(outSize / 1024 / 1024).toFixed(1)} MB (${ratio}%)`);
  }

  const savedMB = ((totalJpg - totalWebp) / 1024 / 1024).toFixed(1);
  console.log(`[terrain] total: ${(totalJpg / 1024 / 1024).toFixed(1)} MB → ${(totalWebp / 1024 / 1024).toFixed(1)} MB (saved ${savedMB} MB)`);
}

main().catch((err) => {
  console.error("[terrain] failed:", err);
  process.exit(1);
});
