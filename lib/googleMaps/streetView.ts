export interface SVOpts {
  heading?: number;
  pitch?: number;
  fov?: number;
  size?: string;
}

export function streetViewSrc(lat: number, lng: number, opts: SVOpts = {}): string {
  const p = new URLSearchParams();
  p.set('lat', String(lat));
  p.set('lng', String(lng));
  if (opts.heading !== undefined) p.set('heading', String(opts.heading));
  if (opts.pitch !== undefined) p.set('pitch', String(opts.pitch));
  if (opts.fov !== undefined) p.set('fov', String(opts.fov));
  if (opts.size) p.set('size', opts.size);
  return `/api/streetview?${p.toString()}`;
}
