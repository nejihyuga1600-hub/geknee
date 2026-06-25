// Closed-place filter for AI-generated itineraries.
//
// Extracts bold place names from generated markdown, batch-checks each
// against Google Places `business_status`, and reports any that are
// CLOSED_PERMANENTLY or CLOSED_TEMPORARILY. Callers (the itinerary
// routes) use this to re-prompt the model once, then strip on failure.
//
// Cache: 24h per (city, name). KV when KV_URL is set, in-memory Map
// otherwise (mirrors lib/cache/directionsCache.ts).

export type BusinessStatus =
  | 'OPERATIONAL'
  | 'CLOSED_TEMPORARILY'
  | 'CLOSED_PERMANENTLY'
  | 'UNKNOWN';

type CachedStatus = { status: BusinessStatus; cachedAt: number };

const memCache = new Map<string, CachedStatus>();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CONCURRENT = 5;

function cacheKey(name: string, city?: string) {
  const c = (city ?? '').toLowerCase().trim();
  const n = name.toLowerCase().trim();
  return `placestatus:${c}:${n}`;
}

type KvClient = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
};

async function tryKv(): Promise<KvClient | null> {
  if (!process.env.KV_URL && !process.env.KV_REST_API_URL) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('@vercel/kv' as any);
    return (mod.kv ?? null) as KvClient | null;
  } catch { return null; }
}

async function getCached(name: string, city?: string): Promise<BusinessStatus | null> {
  const key = cacheKey(name, city);
  const kv = await tryKv();
  if (kv) {
    const v = await kv.get<CachedStatus>(key);
    if (v && Date.now() - v.cachedAt < TTL_MS) return v.status;
    return null;
  }
  const v = memCache.get(key);
  if (v && Date.now() - v.cachedAt < TTL_MS) return v.status;
  if (v) memCache.delete(key);
  return null;
}

async function setCached(name: string, status: BusinessStatus, city?: string): Promise<void> {
  const key = cacheKey(name, city);
  const entry: CachedStatus = { status, cachedAt: Date.now() };
  const kv = await tryKv();
  if (kv) { await kv.set(key, entry, { ex: 86400 }); return; }
  memCache.set(key, entry);
  if (memCache.size > 5000) {
    const oldest = memCache.keys().next().value;
    if (oldest) memCache.delete(oldest);
  }
}

async function fetchStatus(name: string, city?: string): Promise<BusinessStatus> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return 'UNKNOWN';
  const query = city ? `${name} ${city}` : name;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`,
    );
    if (!res.ok) return 'UNKNOWN';
    const data = (await res.json()) as {
      results?: Array<{ business_status?: BusinessStatus }>;
    };
    const top = data.results?.[0];
    return top?.business_status ?? 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

async function checkPlaceStatus(name: string, city?: string): Promise<BusinessStatus> {
  const cached = await getCached(name, city);
  if (cached) return cached;
  const status = await fetchStatus(name, city);
  await setCached(name, status, city);
  return status;
}

async function checkPlacesBatch(names: string[], city?: string): Promise<Map<string, BusinessStatus>> {
  const out = new Map<string, BusinessStatus>();
  const queue = [...new Set(names)];
  async function worker() {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      out.set(next, await checkPlaceStatus(next, city));
    }
  }
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, worker);
  await Promise.all(workers);
  return out;
}

// Generic words we never want to query as places.
const GENERIC = new Set([
  'morning','afternoon','evening','night','breakfast','lunch','dinner','brunch',
  'day','hotel','hostel','accommodation','transport','taxi','bus','train','metro',
  'subway','flight','airport','station','overview','tips','highlights','optional',
  'note','budget','local','traditional','free','time','check','arrive','depart',
  'explore','walk','wander','visit','stop','area','region','neighborhood','district',
  'center','centre','road','estimated','daily','cost','total','per','person',
]);

function looksLikePlace(name: string): boolean {
  if (name.length < 4 || name.length > 80) return false;
  if (!/^[A-Z]/.test(name)) return false;
  if (/^[\d:]+\s*[AP]M$/i.test(name)) return false;
  const words = name.toLowerCase().split(/\s+/);
  if (words.every(w => GENERIC.has(w))) return false;
  // Strip leading currency/symbol-only tokens; need an actual proper noun.
  if (!/[A-Za-z]{3,}/.test(name)) return false;
  return true;
}

// Pull every bold-run name from the markdown that looks like a real place.
export function extractCandidateNames(markdown: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of markdown.matchAll(/\*\*([^*]+)\*\*/g)) {
    const name = m[1].trim().replace(/[.,;:!?]+$/, '');
    if (!looksLikePlace(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// Validate the whole itinerary and return the names that came back closed.
export async function findClosedVenues(markdown: string, city?: string): Promise<string[]> {
  const names = extractCandidateNames(markdown);
  if (!names.length) return [];
  const map = await checkPlacesBatch(names, city);
  return names.filter(n => {
    const s = map.get(n);
    return s === 'CLOSED_PERMANENTLY' || s === 'CLOSED_TEMPORARILY';
  });
}

// Remove any line that mentions a closed venue name. Conservative fallback
// for when the re-prompt still surfaces closed places — better to leave a
// gap than to ship the bad recommendation.
export function stripClosedMentions(markdown: string, closed: string[]): string {
  if (!closed.length) return markdown;
  const patterns = closed.map(n => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  return markdown
    .split('\n')
    .filter(line => !patterns.some(p => p.test(line)))
    .join('\n');
}
