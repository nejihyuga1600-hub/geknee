// Place-name extraction + image lookup chain.
// Extracted from app/plan/summary/page.tsx as part of the summary-page split.
// `extractPlace` is a pure heuristic over markdown bold runs; `fetchPlaceImage`
// is the Google → Wikidata → Wikipedia → Commons fallback chain that powers
// the inline place image overlays. Module-scoped imgCache survives across
// component re-mounts within the same client session.

const _GENERIC_TERMS = new Set([
  'morning','afternoon','evening','night','breakfast','lunch','dinner','brunch',
  'day','hotel','hostel','accommodation','transport','taxi','bus','train','metro',
  'subway','flight','airport','station','overview','tips','highlights','optional',
  'note','budget','local','traditional','free','time','check','arrive','depart',
  'explore','walk','wander','visit','stop','area','region','neighborhood','district',
  'center','centre','road',
]);
const _FOOD_COMMERCIAL = new Set([
  'banana','ramen','sushi','croissant','baumkuchen','mochi','takoyaki','tempura',
  'tonkatsu','udon','soba','matcha','sake','beer','wine','coffee','tea','cake',
  'cookie','candy','chocolate','snack','sandwich','pizza','pasta','noodle',
  'dumpling','gyoza','onigiri','kebab','burger','taco','curry','pho','crepe',
  'waffle','gelato','souvenir','shop','store','sweets','treats',
]);
const _PLACE_INDICATORS = new Set([
  'temple','shrine','museum','gallery','park','garden','palace','castle',
  'tower','bridge','market','bazaar','quarter','harbor','harbour','beach',
  'lake','river','mountain','hill','street','avenue','square','plaza',
  'cathedral','church','mosque','fort','ruins','monument','memorial','arena',
  'stadium','hall','crossing','viewpoint','waterfall','canyon','valley',
  'island','peninsula','bay','cliff','cave','falls','pagoda','gate',
]);

export function extractPlace(text: string): string | null {
  // Capture each bold AND whether it sits inside parentheses in the
  // source text. Parenthetical bolds are typically context — "Lunch at
  // **Mama Chicken** (near **Sadar Bazaar**)" — and should never beat
  // the subject. Without this guard, "Sadar Bazaar" would win on the
  // place-indicator bonus and the pin would resolve to the area, not
  // the restaurant.
  const bolds: { name: string; index: number; inParens: boolean }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let m: RegExpExecArray | null;
  let order = 0;
  while ((m = re.exec(text)) !== null) {
    // Walk backward from the match start to find the last unmatched
    // ( or ). If ( is the latest unmatched bracket, we're inside parens.
    let depth = 0;
    let inParens = false;
    for (let i = m.index - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === ')') depth++;
      else if (ch === '(') {
        if (depth === 0) { inParens = true; break; }
        depth--;
      }
    }
    bolds.push({ name: m[1].trim(), index: order++, inParens });
  }
  if (!bolds.length) return null;

  function score(b: { name: string; index: number; inParens: boolean }): number {
    const { name, index, inParens } = b;
    if (/^[\d:]+\s*[AP]M$/i.test(name)) return -9999;
    if (name.length < 4) return -9999;
    if (!/^[A-Z]/.test(name)) return -9000;
    const lower = name.toLowerCase();
    const words = lower.split(/\s+/);
    if (words.every(w => _GENERIC_TERMS.has(w))) return -8000;
    if (words.some(w => _FOOD_COMMERCIAL.has(w)) || _FOOD_COMMERCIAL.has(lower)) return -7000;
    const hasIndicator = words.some(w => _PLACE_INDICATORS.has(w));
    let s = name.length + words.length * 3;
    if (hasIndicator) s += 30; // halved from 60 so a strong business name competes
    // First-position bias: subject usually comes first in natural language.
    // "Lunch at MAMA CHICKEN (near SADAR BAZAAR)" — Mama Chicken at
    // index 0 should beat Sadar Bazaar at index 1 even when Sadar
    // carries an indicator word.
    s += Math.max(0, 20 - index * 12);
    // Parenthetical bolds are context, not subject. Hard penalty so
    // they never outscore the headline subject.
    if (inParens) s -= 100;
    if (words.length === 1 && !hasIndicator) return -500;
    return s;
  }

  const best = bolds.reduce<{ name: string; score: number } | null>((acc, b) => {
    const s = score(b);
    return !acc || s > acc.score ? { name: b.name, score: s } : acc;
  }, null);
  return best && best.score >= 15 ? best.name : null;
}

// Looser place extraction — falls back to capitalized phrases that are NOT
// inside markdown bold runs. Used when the per-activity bold-only extractor
// returns null but the line text mentions a real place ("Visit the National
// Museum after lunch" → "National Museum"). Conservative: requires at least
// two capitalized words OR one word containing a known place indicator
// (Temple, Park, Garden, etc.) so we don't pick up random proper nouns
// like "April" or "Shah Jahan".
export function extractCapitalizedPlace(text: string): string | null {
  // Strip bold/italic markers so we treat the body uniformly.
  const cleaned = text.replace(/[*_`]/g, ' ');
  // Match runs of 1-4 capitalized words, optionally hyphenated/comma'd.
  const matches = [...cleaned.matchAll(/\b([A-Z][a-z]{2,}(?:[\s\-'][A-Z][a-z]+){0,3})\b/g)]
    .map(m => m[1].trim());
  let best: { name: string; score: number } | null = null;
  for (const name of matches) {
    const lower = name.toLowerCase();
    const words = lower.split(/\s+/);
    if (words.every(w => _GENERIC_TERMS.has(w))) continue;
    if (words.some(w => _FOOD_COMMERCIAL.has(w))) continue;
    const hasIndicator = words.some(w => _PLACE_INDICATORS.has(w));
    let s = name.length + words.length * 4;
    if (hasIndicator) s += 50;
    if (words.length === 1 && !hasIndicator) continue;
    if (s > 0 && (!best || s > best.score)) best = { name, score: s };
  }
  return best ? best.name : null;
}

// Combined extractor for an activity group — tries the strict bold-only
// extractor on headline first, then on each detail line, then the looser
// capitalized-phrase extractor across both. Designed for day-map pin
// extraction where we want SOME meaningful coordinate per activity rather
// than dropping the activity entirely.
export function extractActivityPlace(headline: string, details: string[] = []): string | null {
  const strictHeadline = extractPlace(headline);
  if (strictHeadline) return strictHeadline;
  for (const d of details) {
    const s = extractPlace(d);
    if (s) return s;
  }
  const looseHeadline = extractCapitalizedPlace(headline);
  if (looseHeadline) return looseHeadline;
  for (const d of details) {
    const l = extractCapitalizedPlace(d);
    if (l) return l;
  }
  return null;
}

// Returns up to N candidate place names per activity, in priority order. The
// first candidate is the most specific (extracted via strict bold-only on
// the headline) and subsequent candidates are fallbacks that broaden out
// (detail lines, looser capitalized phrases). The day-map geocoder tries
// each in turn until one resolves inside the city bbox — fictional LLM
// names ("Shankara Vegis Restaurant") fail but the activity still gets a
// pin via the next candidate, which is usually a real neighborhood.
export function extractActivityCandidates(headline: string, details: string[] = [], max = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  function push(name: string | null) {
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (out.length < max) out.push(name);
  }

  // Pull every bold name from the headline + each detail line — not just
  // the best-scored one. extractPlace returns the single winner; we want
  // all viable alternatives.
  function bolds(text: string): string[] {
    return [...text.matchAll(/\*\*([^*]+)\*\*/g)]
      .map(m => m[1].trim())
      .filter(n => n.length >= 4 && /^[A-Z]/.test(n) && !/^[\d:]+\s*[AP]M$/i.test(n));
  }

  // Strict bold candidates from the headline (priority 1).
  for (const b of bolds(headline)) push(b);
  // Strict bold candidates from each detail line (priority 2).
  for (const d of details) for (const b of bolds(d)) push(b);
  // Loose capitalized phrases from the headline (priority 3).
  push(extractCapitalizedPlace(headline));
  // Loose capitalized phrases from each detail line (priority 4).
  for (const d of details) push(extractCapitalizedPlace(d));

  return out;
}

// Google Directions travel mode that matches the transit emoji the LLM emits
// in its activity transitions. The prompt instructs the model to lead each
// transit line with one of: 🚶 walk · 🚴 bike · 🚇 subway · 🚌 bus · 🚂🚆 train ·
// 🚕🚖 taxi · ✈️🛩🛬 flight · ⛵ ferry. Google Directions covers walk/bike/
// drive/transit; flight + ferry have no routing equivalent so they collapse
// to a straight-line polyline (drawRoute with { dashed: true, geodesic: true }).
export type TransitMode = 'walking' | 'cycling' | 'driving' | null;

const _MODE_FROM_EMOJI: Record<string, TransitMode> = {
  '🚶': 'walking',
  '🚴': 'cycling',
  '🚇': 'driving', '🚊': 'driving', '🚋': 'driving',
  '🚌': 'driving', '🚍': 'driving',
  '🚂': 'driving', '🚆': 'driving', '🚄': 'driving', '🚅': 'driving',
  '🚕': 'driving', '🚖': 'driving', '🚗': 'driving', '🚙': 'driving', '🛺': 'driving',
  '✈️': null, '🛩': null, '🛬': null, '🚁': null,
  '⛵': null, '🛥': null, '🚤': null,
};

export function extractTransitMode(line: string): TransitMode {
  // Iterate emoji-by-emoji because some line variants chain modes
  // ("🚶 short walk / 🚕 5 min"); preferred picks pull "minutes" anyway, so
  // for the routing profile we just take the first known mode.
  for (const ch of line) {
    if (_MODE_FROM_EMOJI[ch] !== undefined) return _MODE_FROM_EMOJI[ch];
  }
  // Fall back to keyword sniffing if the model omitted the emoji.
  const lower = line.toLowerCase();
  if (/\bwalk(ing)?\b|\bon foot\b/.test(lower)) return 'walking';
  if (/\bbike\b|\bbicycl/.test(lower)) return 'cycling';
  if (/\bdriv|taxi|uber|ola|car|metro|subway|bus|train\b/.test(lower)) return 'driving';
  return null;
}

// ── Place image — Google Places → Wikidata P18 → Wikipedia → Commons ──────
// '' means "no image found", undefined means "not yet fetched".
export const imgCache = new Map<string, string>();

// Google Maps imagery only — Wikipedia/Wikidata/Commons fallbacks
// removed 2026-06-21. They were producing portrait/person photos and
// causing geo-mismatch via Wikipedia name collisions. Google Places +
// the place-photo proxy gives consistent, location-true imagery.
export async function fetchPlaceImage(place: string, city?: string): Promise<string | null> {
  try {
    const sp = new URLSearchParams({ name: place, ...(city ? { location: city } : {}) });
    const r = await fetch(`/api/place-images?${sp}`);
    const d: { images: string[] } = await r.json();
    if (d.images.length > 0) return d.images[0];
  } catch {}
  return null;
}
