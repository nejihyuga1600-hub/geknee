'use client';
// Step thumbnail for itinerary cards. Picks the most relevant image per step
// via a four-stage fallback chain so we don't end up with parking lots:
//
//   1. Google Places textsearch (/api/place-images) — what pops up first on
//      Google Maps when you search the venue. Best when GOOGLE_PLACES_API_KEY
//      is configured; returns storefront / food / interior.
//   2. Wikidata P18 — canonical exterior photo for the place (great for
//      landmarks: Tjörnin, Hallgrímskirkja, etc.).
//   3. Wikipedia REST summary thumbnail — for places with articles but no
//      P18 image. Landscape-filtered to avoid portraits.
//   4. Wikipedia search → top hit summary thumbnail — last-resort lookup
//      using the "name + city" query.
//   5. Google Street View at the coords — final fallback for generic
//      street/area references.
//
// All sources cached in memory per (place, city) so re-renders are free.

import { useEffect, useRef, useState } from 'react';
import { streetViewSrc, type SVOpts } from '@/lib/googleMaps/streetView';

export interface StepThumbProps extends SVOpts {
  lat: number;
  lng: number;
  alt: string;
  place?: string | null;
  city?: string | null;
  className?: string;
  aspectRatio?: string;
}

// Cache survives across re-mounts within the same session — itinerary lists
// can have 30+ steps and re-render on edit; without this every render fired
// a fresh waterfall of network calls.
const imgCache = new Map<string, string | null>();

const PERSON_FILE_RE = /portrait|selfie|headshot/i;

function isLandscapeEnough(width?: number, height?: number) {
  if (!width || !height) return true;
  return width / height >= 0.95;
}

async function resolveImage(place: string, city: string | null): Promise<string | null> {
  const key = `${place}|${city ?? ''}`;
  if (imgCache.has(key)) return imgCache.get(key) ?? null;

  // 1. Google Places via our proxy.
  try {
    const sp = new URLSearchParams({ name: place });
    if (city) sp.set('location', city);
    const r = await fetch(`/api/place-images?${sp.toString()}`);
    if (r.ok) {
      const d = await r.json() as { images?: string[] };
      if (d.images && d.images.length > 0) {
        imgCache.set(key, d.images[0]);
        return d.images[0];
      }
    }
  } catch {}

  // 2. Wikidata P18 — canonical photo for the entity.
  try {
    const sp = new URLSearchParams({
      action: 'wbsearchentities',
      search: city ? `${place} ${city}` : place,
      language: 'en', limit: '3', format: 'json', origin: '*',
    });
    const r = await fetch(`https://www.wikidata.org/w/api.php?${sp.toString()}`);
    const d = await r.json();
    type Entity = { id: string; description?: string };
    for (const e of (d.search ?? []).slice(0, 3) as Entity[]) {
      const r2 = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${e.id}.json`);
      const d2 = await r2.json();
      const p18 = d2.entities?.[e.id]?.claims?.P18;
      const filename: string | undefined = p18?.[0]?.mainsnak?.datavalue?.value;
      if (filename && !PERSON_FILE_RE.test(filename)) {
        const slug = encodeURIComponent(filename.replace(/\s+/g, '_'));
        const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${slug}?width=800`;
        imgCache.set(key, url);
        return url;
      }
    }
  } catch {}

  // 3. Wikipedia REST summary — direct page lookup by place name.
  try {
    const slug = encodeURIComponent(place.replace(/\s+/g, '_'));
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
    if (r.ok) {
      const d = await r.json();
      const cand = d.originalimage ?? d.thumbnail;
      if (cand && isLandscapeEnough(cand.width, cand.height) && !PERSON_FILE_RE.test(cand.source)) {
        imgCache.set(key, cand.source);
        return cand.source;
      }
    }
  } catch {}

  // 4. Wikipedia search with city context.
  try {
    const p = new URLSearchParams({
      action: 'query', list: 'search',
      srsearch: city ? `${place} ${city}` : place,
      srlimit: '3', format: 'json', origin: '*',
    });
    const r = await fetch(`https://en.wikipedia.org/w/api.php?${p.toString()}`);
    const d = await r.json();
    for (const hit of (d.query?.search ?? []) as { title: string }[]) {
      const slug = encodeURIComponent(hit.title.replace(/\s+/g, '_'));
      const r2 = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
      if (r2.ok) {
        const d2 = await r2.json();
        const cand = d2.originalimage ?? d2.thumbnail;
        if (cand && isLandscapeEnough(cand.width, cand.height) && !PERSON_FILE_RE.test(cand.source)) {
          imgCache.set(key, cand.source);
          return cand.source;
        }
      }
    }
  } catch {}

  imgCache.set(key, null);
  return null;
}

export default function StepThumb({
  lat,
  lng,
  alt,
  place,
  city,
  className,
  aspectRatio = '1/1',
  ...opts
}: StepThumbProps) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [resolvedErrored, setResolvedErrored] = useState(false);
  const [streetErrored, setStreetErrored] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!place) { setResolved(null); return; }
    const my = ++reqId.current;
    setResolved(null);
    setResolvedErrored(false);
    resolveImage(place, city ?? null).then((url) => {
      if (reqId.current !== my) return;
      setResolved(url);
    });
  }, [place, city]);

  const streetSrc = streetViewSrc(lat, lng, opts);
  const useResolved = !!resolved && !resolvedErrored;
  const showImg = useResolved ? resolved : (streetErrored ? null : streetSrc);

  return (
    <div
      className={className}
      style={{
        aspectRatio,
        background: 'linear-gradient(135deg, #1d2c4d 0%, #304a7d 100%)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {showImg && (
        <img
          src={showImg}
          alt={alt}
          loading="lazy"
          onError={() => {
            if (useResolved) setResolvedErrored(true);
            else setStreetErrored(true);
          }}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover', display: 'block',
          }}
        />
      )}
    </div>
  );
}
