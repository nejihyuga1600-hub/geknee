'use client';
import { useState } from 'react';
import { streetViewSrc, type SVOpts } from '@/lib/googleMaps/streetView';

interface Props extends SVOpts {
  lat: number;
  lng: number;
  alt: string;
  className?: string;
  aspectRatio?: string;
}

export default function StreetViewThumb({
  lat,
  lng,
  alt,
  className,
  aspectRatio = '4/3',
  ...opts
}: Props) {
  const [errored, setErrored] = useState(false);
  const src = streetViewSrc(lat, lng, opts);
  return (
    <div
      className={className}
      style={{
        aspectRatio,
        background: 'linear-gradient(135deg, #1d2c4d 0%, #304a7d 100%)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {!errored && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setErrored(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
    </div>
  );
}
