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

const ALIASES: Record<string, string[]> = {
  eiffelTower:    ['eiffel', 'tour eiffel'],
  colosseum:      ['coliseum', 'colosseo'],
  tajMahal:       ['taj'],
  greatWall:      ['great wall china'],
  statueLiberty:  ['lady liberty', 'liberty statue'],
  sagradaFamilia: ['sagrada', 'basilica sagrada familia'],
  machuPicchu:    ['machu'],
  pyramidGiza:    ['giza', 'great pyramid'],
  goldenGate:     ['golden gate bridge'],
  bigBen:         ['elizabeth tower'],
  acropolis:      ['parthenon'],
  sydneyOpera:    ['sydney opera house', 'opera house'],
  neuschwanstein: ['neuschwanstein castle'],
  tokyoSkytree:   ['skytree'],
  forbiddenCity:  ['gugong'],
  fushimiInari:   ['fushimi', 'inari shrine'],
  mountFuji:      ['fuji', 'mt fuji'],
  mtRushmore:     ['rushmore'],
  notreDame:      ['notre dame de paris'],
  chichenItza:    ['el castillo', 'kukulkan'],
  hagiaSophia:    ['ayasofya'],
  burjKhalifa:    ['burj'],
  christRedeem:   ['christ redeemer', 'cristo redentor'],
  angkorWat:      ['angkor'],
  stonehenge:     [],
  petra:          ['al khazneh', 'treasury petra'],
  iguazuFalls:    ['iguacu', 'iguassu'],
  victoriaFalls:  ['mosi oa tunya'],
  niagaraFalls:   ['niagara'],
  easterIsland:   ['rapa nui', 'moai'],
  uluru:          ['ayers rock'],
  montSaintMichel: ['mont saint michel'],
  alhambra:       [],
  petronasTowers: ['petronas'],
  marinaBaySands: ['marina bay sands'],
  brandenburgGate: ['brandenburg'],
  budapestParliament: ['hungarian parliament'],
  stBasils:       ['st basil cathedral', 'saint basils'],
  stPeters:       ['st peters basilica', 'st peters basilica vatican'],
  cologneCathedral: ['kolner dom', 'koln cathedral'],
  blueMosque:     ['sultanahmet', 'sultan ahmed'],
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

// Match a stop's place/name against known monuments. Tries exact
// normalized hit first, then substring-contains in either direction
// (guarding against gibberish by requiring ≥ 5 shared characters).
export function matchMonumentQuest(placeOrName: string | null | undefined): MonumentQuest | null {
  if (!placeOrName) return null;
  if (!INDEX) INDEX = buildIndex();
  const q = normalize(placeOrName);
  if (q.length < 3) return null;
  const direct = INDEX.get(q);
  if (direct) return direct;
  for (const [key, quest] of INDEX.entries()) {
    if (key.length < 5) continue;
    if (q.includes(key) || key.includes(q)) return quest;
  }
  return null;
}
