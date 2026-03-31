const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
let promise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (promise) return promise;

  promise = new Promise<void>((resolve, reject) => {
    // Already fully loaded
    if ((window as { google?: { maps?: { Map?: unknown } } }).google?.maps?.Map) {
      resolve();
      return;
    }

    const cb = '__googleMapsReady__';
    (window as Record<string, unknown>)[cb] = () => {
      delete (window as Record<string, unknown>)[cb];
      resolve();
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places,geometry&callback=${cb}&loading=async`;
    script.async = true;
    script.onerror = () => {
      promise = null; // allow retry
      reject(new Error('Google Maps failed to load'));
    };
    document.head.appendChild(script);
  });

  return promise;
}
