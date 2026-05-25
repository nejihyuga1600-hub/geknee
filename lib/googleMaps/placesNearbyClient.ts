// lib/googleMaps/placesNearbyClient.ts
export interface NearbyPlace {
  name: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  openNow: boolean | null;
  address: string | null;
}

export async function fetchNearby(
  type: 'pharmacy' | 'hospital',
  lat: number,
  lng: number,
): Promise<NearbyPlace[]> {
  const params = new URLSearchParams({ type, lat: String(lat), lng: String(lng) });
  const res = await fetch(`/api/places/nearby?${params.toString()}`);
  if (!res.ok) throw new Error(`nearby ${type} failed: ${res.status}`);
  const data = await res.json();
  return (data.places ?? []) as NearbyPlace[];
}
