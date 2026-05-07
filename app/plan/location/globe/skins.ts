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
};

// Skins actually uploaded to Vercel Blob. Requesting a skin not in this map
// 404s and the dev overlay surfaces it even though ModelErrorBoundary catches
// it at runtime — so we gate skinPath on this whitelist to avoid the fetch.
// Updated by bin/meshy-promote.mjs as new skins go live.
export const AVAILABLE_SKINS: Record<string, Set<string>> = {
  // Generated from blob inventory by bin/blob-sync-available-skins.mjs.
  // Re-run that script after uploading new GLBs.
  bigBen:         new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'damascus']),
  christRedeem:   new Set(['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'damascus']),
  colosseum:      new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial']),
  eiffelTower:    new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial', 'damascus']),
  greatWall:      new Set(['bronze', 'gold', 'diamond', 'aurora', 'celestial']),
  sagradaFamilia: new Set(['bronze', 'celestial']),
  statueLiberty:  new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial']),
  sydneyOpera:    new Set(['bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial']),
  tajMahal:       new Set(['stone', 'bronze', 'silver', 'gold', 'diamond', 'aurora', 'celestial']),
};

// Raw lat/lon for each collectable monument. Consumed by:
//   - CityMapView (Mapbox ring overlays at real coords)
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
};

// Rarity tier colors — used by the ring around collected monuments on the
// globe and by the ring overlay on Mapbox.
export const SKIN_RING_COLOR: Record<string, string> = {
  stone: '#808080',
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  diamond: '#b9f2ff',
  aurora: '#00ff88',
  celestial: '#9370db',
};

// Rarity rank — higher = rarer. Used by /u/[handle] to count "rare" collections
// and pick the highest-tier skin for display.
export const SKIN_RANK: Record<string, number> = {
  stone: 1, bronze: 2, silver: 3, gold: 4, diamond: 5, aurora: 6, celestial: 7,
};
