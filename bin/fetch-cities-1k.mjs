#!/usr/bin/env node
// Fetches GeoNames cities1000 (CC BY 4.0) and writes a minimal JSON to
// public/data/cities-geonames-1k.json. Schema mirrors cities-geonames-15k.json:
//   { n: string, lat: number, lon: number, c: string, p: number }
//
// Manual run: `node bin/fetch-cities-1k.mjs`
// Source: https://download.geonames.org/export/dump/cities1000.zip
// License: CC BY 4.0 — attribution already in the existing footer credits.
//
// Inlines a tiny zip-local-file reader so we don't need an external unzip
// binary or a new npm dep. cities1000.zip has a single member, which
// keeps the reader trivial.

import { mkdirSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { join } from "node:path";

const URL = "https://download.geonames.org/export/dump/cities1000.zip";
const outDir = "public/data";
const outPath = join(outDir, "cities-geonames-1k.json");

console.log(`[fetch] ${URL}`);
const res = await fetch(URL);
if (!res.ok) {
  console.error(`Download failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const zip = Buffer.from(await res.arrayBuffer());
console.log(`[fetch] ${(zip.length / 1024 / 1024).toFixed(2)} MB`);

// Parse the first local file header (PK\x03\x04). cities1000.zip has one
// entry, so we don't need to walk the central directory.
if (zip.readUInt32LE(0) !== 0x04034b50) {
  console.error("Not a zip file (missing local file header signature)");
  process.exit(1);
}
const compMethod    = zip.readUInt16LE(8);
const flags         = zip.readUInt16LE(6);
const filenameLen   = zip.readUInt16LE(26);
const extraLen      = zip.readUInt16LE(28);
const filename      = zip.subarray(30, 30 + filenameLen).toString("utf8");
const dataStart     = 30 + filenameLen + extraLen;
// When the data-descriptor bit (0x08) is set in the general-purpose flags,
// the compressed size in the local header is 0 — the real size lives in a
// data descriptor that follows the compressed payload. Easier than walking
// the central directory: pass everything after dataStart to inflateRawSync;
// the DEFLATE stream's own end-of-stream marker tells it when to stop.
const usesDataDescriptor = (flags & 0x08) !== 0;
console.log(`[zip] entry "${filename}" — method ${compMethod}, data-descriptor=${usesDataDescriptor}`);

let tsv;
if (compMethod === 0) {
  tsv = zip.subarray(dataStart).toString("utf8");
} else if (compMethod === 8) {
  tsv = inflateRawSync(zip.subarray(dataStart)).toString("utf8");
} else {
  console.error(`Unsupported zip compression method: ${compMethod}`);
  process.exit(1);
}

console.log(`[parse] ${(tsv.length / 1024 / 1024).toFixed(2)} MB TSV`);
const lines = tsv.split("\n");
const out = [];
for (const line of lines) {
  if (!line) continue;
  // GeoNames TSV columns: 0 geonameid | 1 name | 2 asciiname | 3 alternatenames
  // | 4 latitude | 5 longitude | 6 feature class | 7 feature code
  // | 8 country code | ... | 14 population | ...
  const cols = line.split("\t");
  if (cols.length < 15) continue;
  const n = cols[1];
  const lat = Number(cols[4]);
  const lon = Number(cols[5]);
  const c = cols[8];
  const p = Number(cols[14]) || 0;
  if (!n || !Number.isFinite(lat) || !Number.isFinite(lon) || !c) continue;
  if (p < 1000) continue; // cities1000 is already filtered, but defend
  out.push({ n, lat, lon, c, p });
}
out.sort((a, b) => b.p - a.p); // largest first — predictable mesh batching

mkdirSync(outDir, { recursive: true });
const json = JSON.stringify(out);
writeFileSync(outPath, json);
console.log(`[write] ${outPath} — ${out.length.toLocaleString()} rows, ${(json.length / 1024 / 1024).toFixed(2)} MB`);
