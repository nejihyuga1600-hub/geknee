// Creates a purple dot marker matching the Mapbox-era pin visual.
// Uses google.maps.marker.AdvancedMarkerElement which REQUIRES the
// owning Map to be constructed with a mapId. Provide GOOGLE_MAPS_MAP_ID
// (or fall back to 'DEMO_MAP_ID') in the Map constructor.

export interface PurpleMarkerOpts {
  label?: string;
  onClick?: () => void;
  onRightClick?: () => void;
}

export interface PurpleMarker {
  marker: google.maps.marker.AdvancedMarkerElement;
  el: HTMLDivElement;
  remove: () => void;
}

export function createPurpleMarker(
  map: google.maps.Map,
  position: { lat: number; lng: number },
  opts: PurpleMarkerOpts = {},
): PurpleMarker {
  const el = document.createElement('div');
  el.style.cssText =
    'width:14px;height:14px;border-radius:50%;background:#a78bfa;' +
    'border:2px solid #fff;box-shadow:0 0 8px rgba(167,139,250,0.8);' +
    'cursor:pointer;';

  if (opts.onClick) {
    el.addEventListener('click', (e) => { e.stopPropagation(); opts.onClick?.(); });
  }
  if (opts.onRightClick) {
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); opts.onRightClick?.(); });
  }

  const marker = new google.maps.marker.AdvancedMarkerElement({
    map,
    position,
    content: el,
    title: opts.label,
  });

  return {
    marker,
    el,
    remove: () => { marker.map = null; },
  };
}
