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
  // Alias — MONUMENT_LATLON uses `notreDame` (no F) while every other
  // map here uses `notreDameF`. Adding both points to the same prefix so
  // consumers that iterate MONUMENT_LATLON (e.g. CapacitorGlobe) resolve
  // the right filename without forcing a risky rename of either key.
  notreDame: 'notre_dame',
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
  stonehenge: new Set(['bronze', 'meshy']),
  neuschwanstein: new Set(['bronze']),
  acropolis: new Set(['bronze']),
  goldenGate: new Set(['bronze']),
  pyramidGiza: new Set(['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'meshy']),
  angkorWat: new Set(['bronze', 'meshy']),
  // Generated from blob inventory by bin/blob-sync-available-skins.mjs.
  // Re-run that script after uploading new GLBs.
  bigBen:         new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'damascus']),
  christRedeem:   new Set(['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'damascus']),
  colosseum:      new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'natural', 'meshy']),
  eiffelTower:    new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'damascus', 'natural']),
  greatWall:      new Set(['bronze', 'gold', 'diamond', 'aurora', 'celestial', 'silver']),
  machuPicchu:    new Set(['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'meshy']),
  sagradaFamilia: new Set(['bronze', 'celestial', 'meshy']),
  statueLiberty:  new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'meshy']),
  sydneyOpera:    new Set(['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial']),
  tajMahal:       new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'meshy']),
  mountFuji:      new Set(['bronze']),
  petra:          new Set(['bronze', 'meshy']),
  niagaraFalls:   new Set(['bronze']),
  chichenItza:    new Set(['bronze']),
  burjKhalifa:    new Set(['bronze']),
  hagiaSophia:    new Set(['bronze', 'meshy']),
  notreDameF:     new Set(['bronze']),
  forbiddenCity:  new Set(['bronze']),
  uluru:          new Set(['bronze']),
  mtRushmore:     new Set(['bronze']),
  easterIsland:   new Set(['bronze']),
  fushimiInari:   new Set(['bronze']),
};

// Per-monument visual scale override, applied on top of the uniform landmark
// boost in landmark.tsx (effS). Default for any monument not listed = 1.0.
// Use values < 1 to shrink monuments whose GLBs are visually larger than the
// uniform baseline (typically wide-aspect-ratio ones like waterfalls or
// island clusters where the maxDim normalization over-inflates them).
// Use values > 1 to grow tiny detail monuments. Keep edits small (±20%
// per pass) and verify in Safari before tuning further.
export const MONUMENT_SCALE_OVERRIDE: Record<string, number> = {
  // iguazuFalls's GLB renders visually larger than peers at the same
  // effS — 0.5 halves it so it doesn't exceed the global upper-limit
  // cap (its own pre-2026-05-29 visual size).
  iguazuFalls: 0.5,
};

// Raw lat/lon for each collectable monument. Consumed by:
//   - CityMapView (Google Maps Circle overlays at real coords)
//   - CapacitorGlobe (Mapbox markers + 3D sprite projection)
//   - /u/[handle] profile page (labels)
//   - Future: creator geolocation verification
//
// Precision: 4 decimals (~11m). Previously 2 decimals (~1.1km), which on
// z=14 monument zoom planted the sprite a full street block off-target
// (Taj Mahal landed 600m SW of the building, etc). Where a complex spans
// area (Great Wall, Iguazu, Easter Island, Petra), the point is the
// iconic / most-photographed sub-feature, noted in the trailing comment.
export const MONUMENT_LATLON: Record<string, { lat: number; lon: number }> = {
  eiffelTower:    { lat: 48.8584, lon: 2.2945 },
  colosseum:      { lat: 41.8902, lon: 12.4922 },
  tajMahal:       { lat: 27.1751, lon: 78.0421 },
  greatWall:      { lat: 40.4319, lon: 116.5704 },   // Mutianyu section
  statueLiberty:  { lat: 40.6892, lon: -74.0445 },
  sagradaFamilia: { lat: 41.4036, lon: 2.1744 },
  machuPicchu:    { lat: -13.1631, lon: -72.5450 },
  christRedeem:   { lat: -22.9519, lon: -43.2105 },
  angkorWat:      { lat: 13.4125, lon: 103.8670 },
  pyramidGiza:    { lat: 29.9792, lon: 31.1342 },    // Khufu / Great Pyramid
  goldenGate:     { lat: 37.8199, lon: -122.4783 },  // mid-span
  bigBen:         { lat: 51.5007, lon: -0.1246 },    // Elizabeth Tower
  acropolis:      { lat: 37.9715, lon: 23.7267 },    // Parthenon
  sydneyOpera:    { lat: -33.8568, lon: 151.2153 },
  neuschwanstein: { lat: 47.5576, lon: 10.7498 },
  stonehenge:     { lat: 51.1789, lon: -1.8262 },
  iguazuFalls:    { lat: -25.6953, lon: -54.4367 },  // Devil's Throat
  tokyoSkytree:   { lat: 35.7101, lon: 139.8107 },
  victoriaFalls:  { lat: -17.9243, lon: 25.8572 },   // Main Falls
  niagaraFalls:   { lat: 43.0796, lon: -79.0747 },   // Horseshoe Falls
  forbiddenCity:  { lat: 39.9163, lon: 116.3972 },
  fushimiInari:   { lat: 34.9671, lon: 135.7727 },
  mountFuji:      { lat: 35.3606, lon: 138.7274 },   // summit
  petra:          { lat: 30.3225, lon: 35.4513 },    // Al-Khazneh / Treasury
  uluru:          { lat: -25.3444, lon: 131.0369 },
  mtRushmore:     { lat: 43.8791, lon: -103.4591 },
  notreDame:      { lat: 48.8530, lon: 2.3499 },
  chichenItza:    { lat: 20.6829, lon: -88.5686 },   // El Castillo (Kukulkan)
  easterIsland:   { lat: -27.1257, lon: -109.2769 }, // Ahu Tongariki (15 moai)
  hagiaSophia:    { lat: 41.0086, lon: 28.9802 },
  burjKhalifa:    { lat: 25.1972, lon: 55.2744 },
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
  // 'meshy' tier = Meshy-generated alt-bronze (image-to-3D from monument
  // snap). Same rank as bronze; copper ring matches bronze so it doesn't
  // imply a new rarity level.
  meshy: '#cd7f32',
};

// Rarity rank — higher = rarer. Used by /u/[handle] to count "rare" collections
// and pick the highest-tier skin for display. natural=0 so it sorts BELOW
// every other tier (the unlocked baseline, no rarity bonus).
export const SKIN_RANK: Record<string, number> = {
  natural: 0, stone: 1, bronze: 2, meshy: 2, silver: 3, gold: 4, diamond: 5, aurora: 6, celestial: 7,
};
