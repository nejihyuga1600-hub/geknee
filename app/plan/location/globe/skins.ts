// Pure-data module — no React, no Three.js. Safe to import from anywhere
// (client pages, server components, API routes, Node scripts).
//
// First split extracted from the 7k-line LocationClient.tsx. The audit
// flagged the monolith as the #1 technical liability; this is the
// smallest-risk lever. Follow-ups in docs/NAVAL_AUDIT_FLOWS.md.

// Monument-to-filename mapping for skin GLBs (e.g. eiffelTower → eiffel_tower)
export const MONUMENT_FILE_PREFIX: Record<string, string> = {
  eiffelTower: 'eiffel_tower',
  colosseum: 'Colosseum',
  tajMahal: 'taj_mahal',
  greatWall: 'great_wall',
  statueLiberty: 'statue_liberty',
  sagradaFamilia: 'sagrada_familia',
  machuPicchu: 'machu_picchu',
  christRedeem: 'christ_redeemer',
  angkorWat: 'angkor_wat',
  pyramidGiza: 'pyramid_giza',
  goldenGate: 'golden_gate',
  bigBen: 'big_ben',
  acropolis: 'acropolis',
  sydneyOpera: 'sydney_opera',
  neuschwanstein: 'neuschwanstein',
  stonehenge: 'stonehenge',
  iguazuFalls: 'iguazu_falls',
  tokyoSkytree: 'tokyo_skytree',
  victoriaFalls: 'victoria_falls',
  // Added with the second-wave bronze promotion (May 2026).
  mountFuji: 'mount_fuji',
  petra: 'petra',
  niagaraFalls: 'niagara_falls',
  chichenItza: 'chichen_itza',
  burjKhalifa: 'burj_khalifa',
  hagiaSophia: 'hagia_sophia',
  notreDameF: 'notre_dame',
  forbiddenCity: 'forbidden_city',
  uluru: 'uluru',
  mtRushmore: 'mt_rushmore',
  easterIsland: 'easter_island',
  fushimiInari: 'fushimi_inari',
};

// Skins actually uploaded to Vercel Blob. Requesting a skin not in this map
// 404s and the dev overlay surfaces it even though ModelErrorBoundary catches
// it at runtime — so we gate skinPath on this whitelist to avoid the fetch.
// Updated by bin/meshy-promote.mjs as new skins go live.
export const AVAILABLE_SKINS: Record<string, Set<string>> = {
  victoriaFalls: new Set(['bronze']),
  tokyoSkytree: new Set(['bronze']),
  iguazuFalls: new Set(['bronze']),
  stonehenge: new Set(['bronze']),
  neuschwanstein: new Set(['bronze']),
  acropolis: new Set(['bronze']),
  goldenGate: new Set(['bronze']),
  pyramidGiza: new Set(['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial']),
  angkorWat: new Set(['bronze']),
  // Generated from blob inventory by bin/blob-sync-available-skins.mjs.
  // Re-run that script after uploading new GLBs.
  bigBen:         new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'damascus']),
  christRedeem:   new Set(['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'damascus']),
  colosseum:      new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'natural']),
  eiffelTower:    new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'damascus', 'natural']),
  greatWall:      new Set(['bronze', 'gold', 'diamond', 'aurora', 'celestial', 'silver']),
  machuPicchu:    new Set(['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial']),
  sagradaFamilia: new Set(['bronze', 'celestial']),
  statueLiberty:  new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial']),
  sydneyOpera:    new Set(['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial']),
  tajMahal:       new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial']),
  mountFuji:      new Set(['bronze']),
  petra:          new Set(['bronze']),
  niagaraFalls:   new Set(['bronze']),
  chichenItza:    new Set(['bronze']),
  burjKhalifa:    new Set(['bronze']),
  hagiaSophia:    new Set(['bronze']),
  notreDameF:     new Set(['bronze']),
  forbiddenCity:  new Set(['bronze']),
  uluru:          new Set(['bronze']),
  mtRushmore:     new Set(['bronze']),
  easterIsland:   new Set(['bronze']),
  fushimiInari:   new Set(['bronze']),
};

// Raw lat/lon for each collectable monument. Consumed by:
//   - CityMapView (Google Maps Circle overlays at real coords)
//   - /u/[handle] profile page (labels)
//   - Future: creator geolocation verification
export const MONUMENT_LATLON: Record<string, { lat: number; lon: number }> = {
  eiffelTower:    { lat: 48.86, lon: 2.29 },
  colosseum:      { lat: 41.89, lon: 12.49 },
  tajMahal:       { lat: 27.17, lon: 78.04 },
  greatWall:      { lat: 40.43, lon: 116.57 },
  statueLiberty:  { lat: 40.69, lon: -74.04 },
  sagradaFamilia: { lat: 41.40, lon: 2.17 },
  machuPicchu:    { lat: -13.16, lon: -72.54 },
  christRedeem:   { lat: -22.95, lon: -43.21 },
  angkorWat:      { lat: 13.41, lon: 103.87 },
  pyramidGiza:    { lat: 29.98, lon: 31.13 },
  goldenGate:     { lat: 37.82, lon: -122.48 },
  bigBen:         { lat: 51.50, lon: -0.12 },
  acropolis:      { lat: 37.97, lon: 23.73 },
  sydneyOpera:    { lat: -33.86, lon: 151.21 },
  neuschwanstein: { lat: 47.56, lon: 10.75 },
  stonehenge:     { lat: 51.18, lon: -1.83 },
  iguazuFalls:    { lat: -25.69, lon: -54.44 },
  tokyoSkytree:   { lat: 35.71, lon: 139.81 },
  victoriaFalls:  { lat: -17.92, lon: 25.86 },
  niagaraFalls:   { lat: 43.10, lon: -79.06 },
  forbiddenCity:  { lat: 39.92, lon: 116.39 },
  fushimiInari:   { lat: 34.97, lon: 135.78 },
  mountFuji:      { lat: 35.36, lon: 138.73 },
  petra:          { lat: 30.33, lon: 35.44 },
  uluru:          { lat: -25.34, lon: 131.04 },
  mtRushmore:     { lat: 43.88, lon: -103.46 },
  notreDame:      { lat: 48.85, lon: 2.35 },
  chichenItza:    { lat: 20.68, lon: -88.57 },
  easterIsland:   { lat: -27.11, lon: -109.36 },
  hagiaSophia:    { lat: 41.01, lon: 28.98 },
  burjKhalifa:    { lat: 25.20, lon: 55.27 },
  // animals (no globe-position; intentionally omitted): blueWhale, bear, …
};

// Rarity tier colors — used by the ring around collected monuments on the
// globe and by the Google Maps Circle ring overlay in CityMapView.
export const SKIN_RING_COLOR: Record<string, string> = {
  // natural = entry tier (rank 1) showing the monument's real-world
  // colors. Off-white ring so the chip is visible on the dark globe
  // without implying any rarity bonus.
  natural: '#e5e7eb',
  stone: '#808080',
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  diamond: '#b9f2ff',
  aurora: '#00ff88',
  celestial: '#9370db',
  damascus: '#7c5e3c',
};

// Rarity rank — higher = rarer. Used by /u/[handle] to count "rare" collections
// and pick the highest-tier skin for display. natural=0 so it sorts BELOW
// every other tier (the unlocked baseline, no rarity bonus).
export const SKIN_RANK: Record<string, number> = {
  natural: 0, stone: 1, bronze: 2, silver: 3, gold: 4, diamond: 5, aurora: 6, celestial: 7,
};
