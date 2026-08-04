// Detect when a live-trip activity is a QUEST — visiting a stop that
// unlocks a monument skin/badge in the geknee globe. Used by the day
// timeline + LEAVE-BY hero to visually flag "this one matters, don't
// scroll past it."
//
// Match strategy: fuzzy string comparison of the activity place/name
// against the curated globe monument names. Kept in this file (not
// inline) so the same detector can be reused by other surfaces later.

import { INFO } from '@/app/plan/location/globe/info';
import { MONUMENT_LATLON } from '@/app/plan/location/globe/skins';

export interface MonumentQuest {
  id: string;                   // e.g. "eiffelTower"
  name: string;                 // human name — "Eiffel Tower"
  location: string;             // "Paris, France"
  hasCoords: boolean;           // MONUMENT_LATLON coverage
}

// Normalize a string for fuzzy compare: strip diacritics, punctuation,
// articles, lower-case, collapse whitespace.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|la|le|el|il|de|del|de la|di|du|des|of)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a lookup table: normalized-key → { id, name, ... }
// Includes both the display name AND additional aliases so common
// alternates (e.g. "Sagrada Familia" for "Sagrada Família") still hit.
type NormalizedIndex = Map<string, MonumentQuest>;
let INDEX: NormalizedIndex | null = null;

// Curated aliases — full-phrase variants only. No single common English
// words (they'd catch things like "Fuji film store" or "Taj restaurant").
// Every alias must be ≥ 8 chars OR at least two words.
const ALIASES: Record<string, string[]> = {
  eiffelTower:    ['tour eiffel', 'eiffel tower paris'],
  colosseum:      ['coliseum rome', 'colosseo'],
  tajMahal:       ['taj mahal agra'],
  greatWall:      ['great wall of china', 'great wall china'],
  statueLiberty:  ['lady liberty', 'liberty statue'],
  sagradaFamilia: ['basilica sagrada familia', 'sagrada familia basilica'],
  machuPicchu:    ['machu picchu peru'],
  pyramidGiza:    ['great pyramid of giza', 'great pyramid giza', 'pyramid of giza'],
  goldenGate:     ['golden gate bridge'],
  bigBen:         ['elizabeth tower', 'big ben clock'],
  acropolis:      ['acropolis athens', 'parthenon athens'],
  sydneyOpera:    ['sydney opera house', 'opera house sydney'],
  neuschwanstein: ['neuschwanstein castle'],
  tokyoSkytree:   ['tokyo sky tree'],
  forbiddenCity:  ['forbidden city beijing'],
  fushimiInari:   ['fushimi inari shrine', 'fushimi inari taisha'],
  mountFuji:      ['mount fuji', 'mt fuji'],
  mtRushmore:     ['mount rushmore', 'mt rushmore'],
  notreDame:      ['notre dame cathedral', 'notre dame paris', 'notre dame de paris'],
  chichenItza:    ['chichen itza pyramid', 'el castillo kukulkan'],
  hagiaSophia:    ['hagia sophia istanbul', 'ayasofya'],
  burjKhalifa:    ['burj khalifa tower'],
  christRedeem:   ['christ the redeemer', 'christ redeemer', 'cristo redentor'],
  angkorWat:      ['angkor wat temple'],
  petra:          ['al khazneh', 'petra jordan'],
  iguazuFalls:    ['iguazu falls'],
  victoriaFalls:  ['victoria falls', 'mosi oa tunya'],
  niagaraFalls:   ['niagara falls'],
  easterIsland:   ['easter island', 'rapa nui'],
  uluru:          ['ayers rock'],
  montSaintMichel: ['mont saint michel'],
  petronasTowers: ['petronas towers', 'petronas twin towers'],
  marinaBaySands: ['marina bay sands'],
  brandenburgGate: ['brandenburg gate'],
  budapestParliament: ['hungarian parliament'],
  stBasils:       ['st basil cathedral', 'saint basils cathedral'],
  stPeters:       ['st peters basilica', 'saint peters basilica'],
  cologneCathedral: ['cologne cathedral', 'kolner dom'],
  blueMosque:     ['blue mosque istanbul', 'sultan ahmed mosque'],
};

function buildIndex(): NormalizedIndex {
  const map = new Map<string, MonumentQuest>();
  const infoRec = INFO as Record<string, { name: string; location: string; fact: string } | undefined>;
  for (const id of Object.keys(infoRec)) {
    const info = infoRec[id];
    if (!info?.name) continue;
    const quest: MonumentQuest = {
      id,
      name: info.name,
      location: info.location,
      hasCoords: !!MONUMENT_LATLON[id],
    };
    map.set(normalize(info.name), quest);
    for (const alias of ALIASES[id] ?? []) {
      map.set(normalize(alias), quest);
    }
  }
  return map;
}

// Match a stop's place/name against known monuments. Two-layer check
// tightened 2026-08-04 after the initial pass caught too many false
// positives ("Petra bookstore" → Petra):
//
//   1. Exact normalized equality against the full monument display
//      name or a full alias phrase.
//   2. Word-boundary containment: the FULL monument phrase must appear
//      as its own token run inside the activity (not just embedded in
//      a longer word). Phrase length must be ≥ 8 chars AND ≥ 2 words
//      so common short strings like "fuji" or "taj" can't trip alone.
//
// Reverse substring (activity name contained inside the monument) was
// removed — too weak a signal to justify the false positives.
export function matchMonumentQuest(placeOrName: string | null | undefined): MonumentQuest | null {
  if (!placeOrName) return null;
  if (!INDEX) INDEX = buildIndex();
  const q = normalize(placeOrName);
  if (q.length < 4) return null;

  // (1) Exact match — normalized display name or alias.
  const direct = INDEX.get(q);
  if (direct) return direct;

  // (2) Word-boundary containment. Preload the activity's word list so
  // we can compare each key as a token run without needing regex.
  const qTokens = q.split(' ');
  for (const [key, quest] of INDEX.entries()) {
    if (key.length < 8) continue; // "big ben" is 7 → excluded from fuzzy tier
    const keyTokens = key.split(' ');
    if (keyTokens.length < 2) continue;
    // Slide the key token list along the activity tokens.
    for (let i = 0; i + keyTokens.length <= qTokens.length; i++) {
      let match = true;
      for (let j = 0; j < keyTokens.length; j++) {
        if (qTokens[i + j] !== keyTokens[j]) { match = false; break; }
      }
      if (match) return quest;
    }
  }
  return null;
}
