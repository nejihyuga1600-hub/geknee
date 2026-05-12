// Hot-path geocode cache. The agent calls geocode on the trip city as
// the very first thing in nearly every turn — paying Google's API cost
// (and ~150ms of latency) for "Paris" or "Tokyo" is wasteful when these
// coordinates are stable for years.
//
// List is curated to top global travel destinations. Extending it is
// safe — just append. Lookups normalize on lower-case + strip diacritics
// + drop ", country" tail so "Paris", "PARIS", "París", "Paris, France"
// all hit the same row.

interface CityRow {
  name: string;
  lat: number;
  lon: number;
  country: string;
}

const CITIES: CityRow[] = [
  { name: 'paris', lat: 48.8566, lon: 2.3522, country: 'France' },
  { name: 'london', lat: 51.5074, lon: -0.1278, country: 'United Kingdom' },
  { name: 'new york', lat: 40.7128, lon: -74.0060, country: 'United States' },
  { name: 'tokyo', lat: 35.6762, lon: 139.6503, country: 'Japan' },
  { name: 'rome', lat: 41.9028, lon: 12.4964, country: 'Italy' },
  { name: 'barcelona', lat: 41.3851, lon: 2.1734, country: 'Spain' },
  { name: 'madrid', lat: 40.4168, lon: -3.7038, country: 'Spain' },
  { name: 'berlin', lat: 52.5200, lon: 13.4050, country: 'Germany' },
  { name: 'amsterdam', lat: 52.3676, lon: 4.9041, country: 'Netherlands' },
  { name: 'lisbon', lat: 38.7223, lon: -9.1393, country: 'Portugal' },
  { name: 'prague', lat: 50.0755, lon: 14.4378, country: 'Czechia' },
  { name: 'vienna', lat: 48.2082, lon: 16.3738, country: 'Austria' },
  { name: 'budapest', lat: 47.4979, lon: 19.0402, country: 'Hungary' },
  { name: 'athens', lat: 37.9838, lon: 23.7275, country: 'Greece' },
  { name: 'istanbul', lat: 41.0082, lon: 28.9784, country: 'Turkey' },
  { name: 'dubai', lat: 25.2048, lon: 55.2708, country: 'United Arab Emirates' },
  { name: 'cairo', lat: 30.0444, lon: 31.2357, country: 'Egypt' },
  { name: 'marrakech', lat: 31.6295, lon: -7.9811, country: 'Morocco' },
  { name: 'cape town', lat: -33.9249, lon: 18.4241, country: 'South Africa' },
  { name: 'mumbai', lat: 19.0760, lon: 72.8777, country: 'India' },
  { name: 'delhi', lat: 28.7041, lon: 77.1025, country: 'India' },
  { name: 'bangkok', lat: 13.7563, lon: 100.5018, country: 'Thailand' },
  { name: 'singapore', lat: 1.3521, lon: 103.8198, country: 'Singapore' },
  { name: 'hong kong', lat: 22.3193, lon: 114.1694, country: 'Hong Kong' },
  { name: 'seoul', lat: 37.5665, lon: 126.9780, country: 'South Korea' },
  { name: 'kyoto', lat: 35.0116, lon: 135.7681, country: 'Japan' },
  { name: 'osaka', lat: 34.6937, lon: 135.5023, country: 'Japan' },
  { name: 'bali', lat: -8.3405, lon: 115.0920, country: 'Indonesia' },
  { name: 'sydney', lat: -33.8688, lon: 151.2093, country: 'Australia' },
  { name: 'melbourne', lat: -37.8136, lon: 144.9631, country: 'Australia' },
  { name: 'auckland', lat: -36.8485, lon: 174.7633, country: 'New Zealand' },
  { name: 'rio de janeiro', lat: -22.9068, lon: -43.1729, country: 'Brazil' },
  { name: 'buenos aires', lat: -34.6037, lon: -58.3816, country: 'Argentina' },
  { name: 'mexico city', lat: 19.4326, lon: -99.1332, country: 'Mexico' },
  { name: 'cancun', lat: 21.1619, lon: -86.8515, country: 'Mexico' },
  { name: 'havana', lat: 23.1136, lon: -82.3666, country: 'Cuba' },
  { name: 'lima', lat: -12.0464, lon: -77.0428, country: 'Peru' },
  { name: 'cusco', lat: -13.5319, lon: -71.9675, country: 'Peru' },
  { name: 'los angeles', lat: 34.0522, lon: -118.2437, country: 'United States' },
  { name: 'san francisco', lat: 37.7749, lon: -122.4194, country: 'United States' },
  { name: 'chicago', lat: 41.8781, lon: -87.6298, country: 'United States' },
  { name: 'miami', lat: 25.7617, lon: -80.1918, country: 'United States' },
  { name: 'las vegas', lat: 36.1699, lon: -115.1398, country: 'United States' },
  { name: 'seattle', lat: 47.6062, lon: -122.3321, country: 'United States' },
  { name: 'boston', lat: 42.3601, lon: -71.0589, country: 'United States' },
  { name: 'washington', lat: 38.9072, lon: -77.0369, country: 'United States' },
  { name: 'new orleans', lat: 29.9511, lon: -90.0715, country: 'United States' },
  { name: 'austin', lat: 30.2672, lon: -97.7431, country: 'United States' },
  { name: 'denver', lat: 39.7392, lon: -104.9903, country: 'United States' },
  { name: 'honolulu', lat: 21.3099, lon: -157.8581, country: 'United States' },
  { name: 'toronto', lat: 43.6532, lon: -79.3832, country: 'Canada' },
  { name: 'vancouver', lat: 49.2827, lon: -123.1207, country: 'Canada' },
  { name: 'montreal', lat: 45.5017, lon: -73.5673, country: 'Canada' },
  { name: 'edinburgh', lat: 55.9533, lon: -3.1883, country: 'United Kingdom' },
  { name: 'dublin', lat: 53.3498, lon: -6.2603, country: 'Ireland' },
  { name: 'reykjavik', lat: 64.1466, lon: -21.9426, country: 'Iceland' },
  { name: 'stockholm', lat: 59.3293, lon: 18.0686, country: 'Sweden' },
  { name: 'copenhagen', lat: 55.6761, lon: 12.5683, country: 'Denmark' },
  { name: 'oslo', lat: 59.9139, lon: 10.7522, country: 'Norway' },
  { name: 'helsinki', lat: 60.1699, lon: 24.9384, country: 'Finland' },
  { name: 'zurich', lat: 47.3769, lon: 8.5417, country: 'Switzerland' },
  { name: 'munich', lat: 48.1351, lon: 11.5820, country: 'Germany' },
  { name: 'florence', lat: 43.7696, lon: 11.2558, country: 'Italy' },
  { name: 'venice', lat: 45.4408, lon: 12.3155, country: 'Italy' },
  { name: 'milan', lat: 45.4642, lon: 9.1900, country: 'Italy' },
  { name: 'naples', lat: 40.8518, lon: 14.2681, country: 'Italy' },
  { name: 'santorini', lat: 36.3932, lon: 25.4615, country: 'Greece' },
  { name: 'mykonos', lat: 37.4467, lon: 25.3289, country: 'Greece' },
  { name: 'jerusalem', lat: 31.7683, lon: 35.2137, country: 'Israel' },
  { name: 'tel aviv', lat: 32.0853, lon: 34.7818, country: 'Israel' },
  { name: 'doha', lat: 25.2854, lon: 51.5310, country: 'Qatar' },
  { name: 'abu dhabi', lat: 24.4539, lon: 54.3773, country: 'United Arab Emirates' },
  { name: 'kuala lumpur', lat: 3.1390, lon: 101.6869, country: 'Malaysia' },
  { name: 'ho chi minh city', lat: 10.8231, lon: 106.6297, country: 'Vietnam' },
  { name: 'hanoi', lat: 21.0285, lon: 105.8542, country: 'Vietnam' },
  { name: 'taipei', lat: 25.0330, lon: 121.5654, country: 'Taiwan' },
  { name: 'beijing', lat: 39.9042, lon: 116.4074, country: 'China' },
  { name: 'shanghai', lat: 31.2304, lon: 121.4737, country: 'China' },
  { name: 'kathmandu', lat: 27.7172, lon: 85.3240, country: 'Nepal' },
  { name: 'colombo', lat: 6.9271, lon: 79.8612, country: 'Sri Lanka' },
  { name: 'manila', lat: 14.5995, lon: 120.9842, country: 'Philippines' },
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/,.*$/, '') // drop ", France" tail
    .trim();
}

const INDEX = new Map(CITIES.map((c) => [c.name, c]));

export interface CachedCity {
  lat: number;
  lon: number;
  formatted_address: string;
  source: 'cache';
}

export function lookupCity(query: string): CachedCity | null {
  const hit = INDEX.get(normalize(query));
  if (!hit) return null;
  return {
    lat: hit.lat,
    lon: hit.lon,
    formatted_address: `${hit.name.replace(/\b\w/g, (c) => c.toUpperCase())}, ${hit.country}`,
    source: 'cache',
  };
}
