'use client';
// Step thumbnail for itinerary cards. Picks the right image source per step:
//
//   - Named destination (restaurant, museum, shop, landmark) → first photo
//     from Google Places textsearch via /api/place-images. That's what
//     pops up first when you search the place on Google Maps — usually a
//     storefront, food shot, or interior, depending on category.
//   - Generic street / area reference (no `place` name) → Google Street
//     View at the step's coords. Captures the actual street scene.
//
// Both fallback to a soft gradient if the image network call fails. The
// component is its own client island so the itinerary page can stay
// server-rendered with these as lazy hydration points.

import { useEffect, useState } from 'react';
import { streetViewSrc, type SVOpts } from '@/lib/googleMaps/streetView';

export interface StepThumbProps extends SVOpts {
  lat: number;
  lng: number;
  alt: string;
  // When set, we treat this step as a destination and try a Place photo
  // before falling back to Street View. When null, Street View is the
  // primary source — for "walk along Skólavörðustígur" type steps where
  // no single venue is being referenced.
  place?: string | null;
  city?: string | null;
  className?: string;
  aspectRatio?: string;
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
  // null = haven't decided yet, '' = no place image (use street view),
  // string = place image URL to render.
  const [placeImg, setPlaceImg] = useState<string | null>(null);
  const [placeImgErrored, setPlaceImgErrored] = useState(false);
  const [streetErrored, setStreetErrored] = useState(false);

  useEffect(() => {
    if (!place) { setPlaceImg(''); return; }
    let cancelled = false;
    const params = new URLSearchParams({ name: place });
    if (city) params.set('location', city);
    fetch(`/api/place-images?${params.toString()}`)
      .then((r) => r.ok ? r.json() : { images: [] })
      .then((data: { images?: string[] }) => {
        if (cancelled) return;
        const first = data.images?.[0];
        // Empty string signals "fall through to street view" to the render
        // branch below. Distinct from null (still loading).
        setPlaceImg(first ?? '');
      })
      .catch(() => { if (!cancelled) setPlaceImg(''); });
    return () => { cancelled = true; };
  }, [place, city]);

  const streetSrc = streetViewSrc(lat, lng, opts);
  const usePlace = !!placeImg && !placeImgErrored;
  const showImg = usePlace ? placeImg : (streetErrored ? null : streetSrc);

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
            if (usePlace) setPlaceImgErrored(true);
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
