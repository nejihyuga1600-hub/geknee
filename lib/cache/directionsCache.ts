// Server-side cache for /api/directions. Uses Vercel KV when KV_URL is
// configured; falls back to a per-Function-instance Map otherwise.
// Key: directions:{originLat},{originLng}:{destLat},{destLng}:{mode}
// TTL: 24h.

type CachedDirections = {
  polyline: string;
  durationSec: number | null;
  distanceM: number | null;
  cachedAt: number;
};

const memCache = new Map<string, CachedDirections>();
const TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(o: {lat:number; lng:number}, d: {lat:number; lng:number}, mode: string) {
  const r = (n: number) => n.toFixed(4);
  return `directions:${r(o.lat)},${r(o.lng)}:${r(d.lat)},${r(d.lng)}:${mode}`;
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

export async function getCached(o: {lat:number; lng:number}, d: {lat:number; lng:number}, mode: string): Promise<CachedDirections | null> {
  const key = cacheKey(o, d, mode);
  const kv = await tryKv();
  if (kv) {
    const v = await kv.get<CachedDirections>(key);
    if (v && Date.now() - v.cachedAt < TTL_MS) return v;
    return null;
  }
  const v = memCache.get(key);
  if (v && Date.now() - v.cachedAt < TTL_MS) return v;
  if (v) memCache.delete(key);
  return null;
}

export async function setCached(o: {lat:number; lng:number}, d: {lat:number; lng:number}, mode: string, value: Omit<CachedDirections, 'cachedAt'>): Promise<void> {
  const key = cacheKey(o, d, mode);
  const entry: CachedDirections = { ...value, cachedAt: Date.now() };
  const kv = await tryKv();
  if (kv) { await kv.set(key, entry, { ex: 86400 }); return; }
  memCache.set(key, entry);
  if (memCache.size > 5000) {
    const oldest = memCache.keys().next().value;
    if (oldest) memCache.delete(oldest);
  }
}
