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
  // Added 2026-07-01 batch — 16 new Meshy-generated monuments.
  sigiriya: 'sigiriya',
  borobudur: 'borobudur',
  bagan: 'bagan',
  montSaintMichel: 'mont_saint_michel',
  salarUyuni: 'salar_uyuni',
  meteora: 'meteora',
  alhambra: 'alhambra',
  petronasTowers: 'petronas_towers',
  marinaBaySands: 'marina_bay_sands',
  pamukkale: 'pamukkale',
  tikal: 'tikal',
  stBasils: 'st_basils',
  stPeters: 'st_peters',
  ergChebbi: 'erg_chebbi',
  antelopeCanyon: 'antelope_canyon',
  cliffsOfMoher: 'cliffs_of_moher',
  // Added 2026-07-02 batch 2 — 10 more Meshy-generated monuments.
  blueMosque: 'blue_mosque',
  brandenburgGate: 'brandenburg_gate',
  budapestParliament: 'budapest_parliament',
  ajantaCaves: 'ajanta_caves',
  baliUluwatu: 'bali_uluwatu',
  chanChan: 'chan_chan',
  bathRomans: 'bath_romans',
  cologneCathedral: 'cologne_cathedral',
  persepolis: 'persepolis',
  trulli: 'trulli',
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
  // Added 2026-07-01 batch — 16 new Meshy-generated monuments (meshy tier only).
  sigiriya:         new Set(['meshy']),
  borobudur:        new Set(['meshy']),
  bagan:            new Set(['meshy']),
  montSaintMichel:  new Set(['meshy']),
  salarUyuni:       new Set(['meshy']),
  meteora:          new Set(['meshy']),
  alhambra:         new Set(['meshy']),
  petronasTowers:   new Set(['meshy']),
  marinaBaySands:   new Set(['meshy']),
  pamukkale:        new Set(['meshy']),
  tikal:            new Set(['meshy']),
  stBasils:         new Set(['meshy']),
  stPeters:         new Set(['meshy']),
  ergChebbi:        new Set(['meshy']),
  antelopeCanyon:   new Set(['meshy']),
  cliffsOfMoher:    new Set(['meshy']),
  // Added 2026-07-02 batch 2 — 10 more Meshy-generated monuments (meshy tier only).
  blueMosque:           new Set(['meshy']),
  brandenburgGate:      new Set(['meshy']),
  budapestParliament:   new Set(['meshy']),
  ajantaCaves:          new Set(['meshy']),
  baliUluwatu:          new Set(['meshy']),
  chanChan:             new Set(['meshy']),
  bathRomans:           new Set(['meshy']),
  cologneCathedral:     new Set(['meshy']),
  persepolis:           new Set(['meshy']),
  trulli:               new Set(['meshy']),
  // Added 2026-07-20 batch 3 — 20 more Meshy-generated monuments (meshy tier only).
  mountEverest:         new Set(['meshy']),
  kaaba:                new Set(['meshy']),
  charlesBridge:        new Set(['meshy']),
  grandCanyon:          new Set(['meshy']),
  kilimanjaro:          new Set(['meshy']),
  matterhorn:           new Set(['meshy']),
  halongBay:            new Set(['meshy']),
  cappadocia:           new Set(['meshy']),
  chateauChambord:      new Set(['meshy']),
  tableMountain:        new Set(['meshy']),
  goldenTemple:         new Set(['meshy']),
  watArun:              new Set(['meshy']),
  prambanan:            new Set(['meshy']),
  ayutthaya:            new Set(['meshy']),
  konarkTemple:         new Set(['meshy']),
  devilsTower:          new Set(['meshy']),
  monumentValley:       new Set(['meshy']),
  milfordSound:         new Set(['meshy']),
  palenque:             new Set(['meshy']),
  lakeBled:             new Set(['meshy']),
  // Added 2026-07-21 batch 4 — 20 more Meshy-generated monuments (meshy tier only).
  terracottaArmy:       new Set(['meshy']),
  sensoji:              new Set(['meshy']),
  meenakshiTemple:      new Set(['meshy']),
  branCastle:           new Set(['meshy']),
  alcatraz:             new Set(['meshy']),
  treviFountain:        new Set(['meshy']),
  pantheonRome:         new Set(['meshy']),
  leaningTower:         new Set(['meshy']),
  versailles:           new Set(['meshy']),
  kinkakuji:            new Set(['meshy']),
  himejiCastle:         new Set(['meshy']),
  abuSimbel:            new Set(['meshy']),
  karnakTemple:         new Set(['meshy']),
  greatSphinx:          new Set(['meshy']),
  genghisKhanStatue:    new Set(['meshy']),
  torresDelPaine:       new Set(['meshy']),
  peritoMoreno:         new Set(['meshy']),
  halfDome:             new Set(['meshy']),
  delicateArch:         new Set(['meshy']),
  giantsCauseway:       new Set(['meshy']),
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

  // Added 2026-07-01 batch — 16 new Meshy-generated monuments.
  sigiriya:         { lat: 7.957, lon: 80.7603 },
  borobudur:        { lat: -7.6079, lon: 110.2038 },
  bagan:            { lat: 21.1717, lon: 94.8585 },  // Ananda Temple area
  montSaintMichel:  { lat: 48.636, lon: -1.5115 },
  salarUyuni:       { lat: -20.1338, lon: -67.4891 },  // center of salt flat
  meteora:          { lat: 39.7217, lon: 21.6303 },  // Varlaam monastery
  alhambra:         { lat: 37.1761, lon: -3.5881 },  // Nasrid Palaces
  petronasTowers:   { lat: 3.1579, lon: 101.7116 },
  marinaBaySands:   { lat: 1.2834, lon: 103.8607 },  // SkyPark
  pamukkale:        { lat: 37.9203, lon: 29.1215 },  // travertines
  tikal:            { lat: 17.2222, lon: -89.6237 },  // Temple I
  stBasils:         { lat: 55.7525, lon: 37.6231 },  // Red Square
  stPeters:         { lat: 41.9022, lon: 12.4539 },
  ergChebbi:        { lat: 31.15, lon: -4.0 },  // dune center Merzouga
  antelopeCanyon:   { lat: 36.8619, lon: -111.3743 },  // Upper Canyon
  cliffsOfMoher:    { lat: 52.9715, lon: -9.4309 },  // O'Brien's Tower
  // Added 2026-07-02 batch 2 — 10 more Meshy-generated monuments.
  blueMosque:           { lat: 41.0055, lon: 28.9769 },  // Sultanahmet
  brandenburgGate:      { lat: 52.5163, lon: 13.3777 },
  budapestParliament:   { lat: 47.5072, lon: 19.0459 },  // Danube facade
  ajantaCaves:          { lat: 20.5522, lon: 75.7033 },  // Cave 26
  baliUluwatu:          { lat: -8.829, lon: 115.0849 },  // Pura Luhur Uluwatu
  chanChan:             { lat: -8.1069, lon: -79.0762 },  // Tschudi complex
  bathRomans:           { lat: 51.3811, lon: -2.3596 },  // Great Bath
  cologneCathedral:     { lat: 50.9413, lon: 6.9583 },
  persepolis:           { lat: 29.935, lon: 52.8916 },  // Apadana
  trulli:               { lat: 40.7853, lon: 17.2358 },  // Alberobello, Puglia

  // Added 2026-07-20 batch 3 — 20 new Meshy-generated monuments.
  mountEverest:      { lat: 27.9881, lon: 86.9250 },   // summit
  kaaba:             { lat: 21.4225, lon: 39.8262 },   // Masjid al-Haram, Mecca
  charlesBridge:     { lat: 50.0865, lon: 14.4114 },   // Old Town Bridge Tower
  grandCanyon:       { lat: 36.0544, lon: -112.1401 }, // South Rim / Mather Point
  kilimanjaro:       { lat: -3.0674, lon: 37.3556 },   // Uhuru Peak
  matterhorn:        { lat: 45.9763, lon: 7.6586 },    // summit
  halongBay:         { lat: 20.9101, lon: 107.1839 },  // main bay
  cappadocia:        { lat: 38.6431, lon: 34.8289 },   // Göreme fairy chimneys
  chateauChambord:   { lat: 47.6161, lon: 1.5169 },
  tableMountain:     { lat: -33.9628, lon: 18.4098 },  // upper cable station
  goldenTemple:      { lat: 31.6200, lon: 74.8765 },   // Harmandir Sahib
  watArun:           { lat: 13.7437, lon: 100.4889 },  // central prang
  prambanan:         { lat: -7.7520, lon: 110.4914 },
  ayutthaya:         { lat: 14.3532, lon: 100.5680 },  // Wat Mahathat
  konarkTemple:      { lat: 19.8876, lon: 86.0946 },   // Sun Temple
  devilsTower:       { lat: 44.5902, lon: -104.7146 },
  monumentValley:    { lat: 36.9987, lon: -110.0985 }, // The Mittens overlook
  milfordSound:      { lat: -44.6740, lon: 167.9231 }, // Mitre Peak
  palenque:          { lat: 17.4844, lon: -92.0451 },  // Temple of Inscriptions
  lakeBled:          { lat: 46.3625, lon: 14.0895 },   // Bled Island church

  // Added 2026-07-21 batch 4 — 20 more Meshy-generated monuments.
  terracottaArmy:    { lat: 34.3841, lon: 109.2785 },  // Pit 1
  sensoji:           { lat: 35.7148, lon: 139.7967 },  // Kaminarimon
  meenakshiTemple:   { lat: 9.9195, lon: 78.1194 },    // Madurai
  branCastle:        { lat: 45.5149, lon: 25.3672 },
  alcatraz:          { lat: 37.8267, lon: -122.4230 }, // main cellhouse
  treviFountain:     { lat: 41.9009, lon: 12.4833 },
  pantheonRome:      { lat: 41.8986, lon: 12.4769 },
  leaningTower:      { lat: 43.7229, lon: 10.3966 },   // Piazza dei Miracoli
  versailles:        { lat: 48.8049, lon: 2.1204 },    // Château
  kinkakuji:         { lat: 35.0394, lon: 135.7292 },  // Golden Pavilion
  himejiCastle:      { lat: 34.8394, lon: 134.6939 },  // main keep
  abuSimbel:         { lat: 22.3372, lon: 31.6258 },   // Great Temple
  karnakTemple:      { lat: 25.7188, lon: 32.6573 },   // Hypostyle Hall
  greatSphinx:       { lat: 29.9753, lon: 31.1376 },
  genghisKhanStatue: { lat: 47.8083, lon: 107.5308 },  // Tsonjin Boldog
  torresDelPaine:    { lat: -50.9423, lon: -73.4068 }, // Base Torres
  peritoMoreno:      { lat: -50.4967, lon: -73.1377 }, // glacier terminus
  halfDome:          { lat: 37.7459, lon: -119.5332 }, // Yosemite summit
  delicateArch:      { lat: 38.7436, lon: -109.4993 }, // Arches NP
  giantsCauseway:    { lat: 55.2408, lon: -6.5117 },   // County Antrim
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
