'use client';
// Step thumbnail for itinerary cards. Google Maps imagery only — Wikipedia/
// Wikidata fallbacks removed per user direction.
//
//   1. Google Places textsearch (/api/place-images) — what pops up first
//      on Google Maps when you search the venue. Storefront / food /
//      interior depending on category.
//   2. Google Street View Static API at the step's coords — for generic
//      street references and any place that Places couldn't resolve.
//
// Resolved URLs are cached per (place, city) so re-renders are free.

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

const imgCache = new Map<string, string | null>();

async function resolveImage(place: string, city: string | null): Promise<string | null> {
  const key = `${place}|${city ?? ''}`;
  if (imgCache.has(key)) return imgCache.get(key) ?? null;

  try {
    const sp = new URLSearchParams({ name: place });
    if (city) sp.set('location', city);
    const r = await fetch(`/api/place-images?${sp.toString()}`);
    if (r.ok) {
      const d = await r.json() as { images?: string[]; status?: string };
      // Surface the API status to the console once per (place,city) so we
      // can diagnose why a thumb fell back to Street View — most commonly
      // "no-google-key" (env var missing on Vercel) vs "empty" (key set
      // but Places returned no usable photos for this query).
      if (d.status && d.status !== 'ok-google' && d.status !== 'ok-foursquare') {
        console.warn(`[StepThumb] place-images status=${d.status} for "${place}"${city ? ` in ${city}` : ''}`);
      }
      const first = d.images?.[0];
      if (first) {
        imgCache.set(key, first);
        return first;
      }
    } else {
      console.warn(`[StepThumb] place-images http ${r.status} for "${place}"`);
    }
  } catch (err) {
    console.warn(`[StepThumb] place-images threw for "${place}":`, err);
  }

  // No Places hit — caller falls through to Street View.
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
            // Scale up ~8% and shift up slightly so the Google watermark at
            // the bottom-left of Street View Static + Maps Static images is
            // cropped out by the container's overflow:hidden. Attribution
            // for the maps data remains on the in-app trip map (UnifiedTripMap)
            // which is the user-facing maps surface; the thumb is a
            // glance-grade preview only.
            width: '108%', height: '108%',
            marginLeft: '-4%', marginTop: '-7%',
            objectFit: 'cover', display: 'block',
          }}
        />
      )}
    </div>
  );
}
