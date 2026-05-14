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

// Mapbox Directions profile that matches the transit emoji the LLM emits
// in its activity transitions. The prompt instructs the model to lead each
// transit line with one of: 🚶 walk · 🚴 bike · 🚇 subway · 🚌 bus · 🚂🚆 train ·
// 🚕🚖 taxi · ✈️🛩🛬 flight · ⛵ ferry. Mapbox doesn't have transit/flight/
// ferry routing, so those collapse to the closest road-based equivalent
// (driving) or null (no route possible at all).
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

const _FOOD_DESC_RE = /\b(dish|cuisine|food|recipe|meal|dessert|drink|beverage|cocktail|snack|sauce|bread|cake|soup|noodle|rice dish|pasta)\b/i;
// Wikipedia descriptions starting with these strongly imply the article is
// about a person, not a place. The fallback chain was returning portrait
// shots / selfies for ambiguous queries like "Sadar Bazaar" because the
// matching Wikipedia article happened to be a person with that name. Skip.
const _PERSON_DESC_RE = /\b(person|man|woman|politician|actor|actress|musician|singer|writer|author|athlete|scientist|director|player|artist|painter|sculptor|chef|prime minister|president|king|queen|emperor|monk|priest|philosopher|warrior|general|ruler|spouse|wife|husband|son of|daughter of|fictional character|character in|composer|poet|journalist|activist|footballer|basketball|cricketer|model|youtuber|streamer|rapper|dj|guitarist)\b/i;
// Files whose names hint at people-shots (selfies, portraits, headshots)
// — Commons fallback occasionally surfaces these for market/bazaar
// queries; reject by name-match before we ever load them.
const _PERSON_FILE_RE = /(selfie|portrait|headshot|profile.?pic|me_at|me-at|me\.jpg|wedding|family|posing|posed|profilbild)/i;

function _landscapeScore(w?: number, h?: number): number {
  if (!w || !h) return 0;
  return w / h;
}

// Reject anything taller than wide × 1.0 (portrait). Place photos are
// almost always landscape; portrait orientation is a strong signal of a
// person/selfie. Returns true when safe to use.
function _isLandscapeEnough(w?: number, h?: number): boolean {
  if (!w || !h) return true; // unknown — don't reject
  return w / h >= 1.05;
}

function _isClean(desc: string): boolean {
  return !_FOOD_DESC_RE.test(desc) && !_PERSON_DESC_RE.test(desc);
}

export async function fetchPlaceImage(place: string, city?: string): Promise<string | null> {
  const q = city ? `${place} ${city}` : place;

  // 1. Google Places textsearch → place-photo proxy (best: actual location photos)
  try {
    const sp = new URLSearchParams({ name: place, ...(city ? { location: city } : {}) });
    const r = await fetch(`/api/place-images?${sp}`);
    const d: { images: string[] } = await r.json();
    if (d.images.length > 0) return d.images[0];
  } catch {}

  // 2. Wikidata P18 — canonical exterior/building photo
  try {
    const sp = new URLSearchParams({ action:'wbsearchentities', search: q, language:'en', limit:'3', format:'json', origin:'*' });
    const r = await fetch(`https://www.wikidata.org/w/api.php?${sp}`);
    const d = await r.json();
    type WikidataEntity = { id: string; description?: string };
    for (const entity of (d.search ?? []).slice(0, 3) as WikidataEntity[]) {
      // Skip person entities outright — Wikidata's `description` says
      // things like "American actress", "Indian politician" for those.
      if (entity.description && _PERSON_DESC_RE.test(entity.description)) continue;
      const r2 = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${entity.id}.json`);
      const d2 = await r2.json();
      const p18 = d2.entities?.[entity.id]?.claims?.P18;
      const filename: string | undefined = p18?.[0]?.mainsnak?.datavalue?.value;
      if (filename && !_PERSON_FILE_RE.test(filename)) {
        const slug = encodeURIComponent(filename.replace(/\s+/g, '_'));
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${slug}?width=800`;
      }
    }
  } catch {}

  // 3. Wikipedia REST summary — skip if description is food OR person, and
  //    reject portrait-aspect images (selfies are almost always portrait).
  try {
    const slug = encodeURIComponent(place.replace(/\s+/g, '_'));
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
    if (r.ok) {
      const d = await r.json();
      const desc: string = d.description ?? '';
      const orig = d.originalimage as { source: string; width?: number; height?: number } | undefined;
      const thumb = d.thumbnail as { source: string; width?: number; height?: number } | undefined;
      const candidate = orig ?? thumb;
      if (candidate && _isClean(desc) && _isLandscapeEnough(candidate.width, candidate.height)
          && !_PERSON_FILE_RE.test(candidate.source)) {
        return candidate.source;
      }
    }
  } catch {}

  // 4. Wikipedia search (with city context) → top 3 results, same filters
  try {
    const p = new URLSearchParams({ action:'query', list:'search', srsearch: q, srlimit:'3', format:'json', origin:'*' });
    const r = await fetch(`https://en.wikipedia.org/w/api.php?${p}`);
    const d = await r.json();
    for (const hit of (d.query?.search ?? []) as {title:string}[]) {
      const slug = encodeURIComponent(hit.title.replace(/\s+/g, '_'));
      const r2 = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
      if (r2.ok) {
        const d2 = await r2.json();
        const desc: string = d2.description ?? '';
        const orig = d2.originalimage as { source: string; width?: number; height?: number } | undefined;
        const thumb = d2.thumbnail as { source: string; width?: number; height?: number } | undefined;
        const candidate = orig ?? thumb;
        if (candidate && _isClean(desc) && _isLandscapeEnough(candidate.width, candidate.height)
            && !_PERSON_FILE_RE.test(candidate.source)) {
          return candidate.source;
        }
      }
    }
  } catch {}

  // 5. Wikimedia Commons — exterior bias + reject portrait + reject person filenames
  try {
    const searchTerm = `${q} (exterior OR building OR street OR entrance OR facade OR view)`;
    const p = new URLSearchParams({
      action:'query', generator:'search', gsrsearch: searchTerm,
      gsrnamespace:'6', gsrlimit:'12', prop:'imageinfo', iiprop:'url|mime|size',
      format:'json', origin:'*',
    });
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${p}`);
    const d = await r.json();
    type PageInfo = { imageinfo?: { url: string; mime: string; width?: number; height?: number }[] };
    const pages = (Object.values(d.query?.pages ?? {}) as PageInfo[])
      .filter(pg => {
        const info = pg.imageinfo?.[0];
        if (!info || !info.mime.startsWith('image/') || info.url.endsWith('.svg')) return false;
        if (_PERSON_FILE_RE.test(info.url)) return false;
        if (!_isLandscapeEnough(info.width, info.height)) return false;
        return true;
      })
      .sort((a, b) =>
        _landscapeScore(b.imageinfo![0].width, b.imageinfo![0].height) -
        _landscapeScore(a.imageinfo![0].width, a.imageinfo![0].height)
      );
    if (pages.length > 0) return pages[0].imageinfo![0].url;
  } catch {}

  return null;
}
