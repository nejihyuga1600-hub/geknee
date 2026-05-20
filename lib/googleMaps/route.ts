// Draws a polyline on a Google Map matching the Mapbox dashed-purple
// line style we used for itinerary routes. Returns the polyline + a
// bounds object the caller can fitBounds against.

export type RouteMode = 'walking' | 'driving' | 'cycling' | 'transit' | 'flight' | 'ferry';

export interface RouteSegment {
  polyline: google.maps.Polyline;
  bounds: google.maps.LatLngBounds;
  remove: () => void;
}

// Flight + ferry have no Google Directions equivalent — fall back to
// straight-line. Other modes can use Directions API server-side.
export function modeUsesDirections(mode: RouteMode): boolean {
  return mode !== 'flight' && mode !== 'ferry';
}

// Maps app mode to Google Directions TravelMode enum value (string form).
export function modeToGoogleTravelMode(mode: RouteMode): string {
  switch (mode) {
    case 'walking': return 'WALKING';
    case 'driving': return 'DRIVING';
    case 'cycling': return 'BICYCLING';
    case 'transit': return 'TRANSIT';
    default: return 'WALKING';
  }
}

export function drawRoute(
  map: google.maps.Map,
  points: Array<{ lat: number; lng: number }>,
  opts: { color?: string; weight?: number; dashed?: boolean; geodesic?: boolean } = {},
): RouteSegment {
  const path = points.map((p) => new google.maps.LatLng(p.lat, p.lng));
  const polyline = new google.maps.Polyline({
    path,
    geodesic: opts.geodesic ?? false,
    strokeColor: opts.color ?? '#a78bfa',
    strokeOpacity: opts.dashed ? 0 : 0.9,
    strokeWeight: opts.weight ?? 4,
    icons: opts.dashed ? [{
      icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
      offset: '0',
      repeat: '14px',
    }] : undefined,
    map,
  });
  const bounds = new google.maps.LatLngBounds();
  path.forEach((p) => bounds.extend(p));
  return {
    polyline,
    bounds,
    remove: () => polyline.setMap(null),
  };
}
