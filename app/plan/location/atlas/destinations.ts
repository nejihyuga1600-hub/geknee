// Atlas v0 destination resolver. Matches a typed destination string against
// the monument catalog so Step 0 can record a location without a real
// geocoder. Full Google Places Autocomplete lives in CityMapView; this list
// 80% of the search intent and unmatched strings still pass through as
// free-text destinations (lat/lon left null).

import { MONUMENT_LATLON } from "@/app/plan/location/globe/skins";
import { INFO } from "@/app/plan/location/globe/info";

export type Suggestion = {
  mk: string;
  name: string;       // e.g. "Eiffel Tower"
  location: string;   // e.g. "Paris, France"
  lat: number;
  lon: number;
  emoji: string;
};

// 9 popular destinations to render as the suggestion grid in Step 0. Picked
// for global spread + name recognition. Any of these match by city or
// monument name in the resolver below.
export const POPULAR_SUGGESTIONS: Suggestion[] = [
  { mk: "eiffelTower",   name: "Eiffel Tower",      location: INFO.eiffelTower.location,   lat: MONUMENT_LATLON.eiffelTower.lat,   lon: MONUMENT_LATLON.eiffelTower.lon,   emoji: String.fromCodePoint(0x1F5FC) },
  { mk: "tajMahal",      name: "Taj Mahal",         location: INFO.tajMahal.location,      lat: MONUMENT_LATLON.tajMahal.lat,      lon: MONUMENT_LATLON.tajMahal.lon,      emoji: String.fromCodePoint(0x1F54C) },
  { mk: "colosseum",     name: "The Colosseum",     location: INFO.colosseum.location,     lat: MONUMENT_LATLON.colosseum.lat,     lon: MONUMENT_LATLON.colosseum.lon,     emoji: String.fromCodePoint(0x1F3DB) },
  { mk: "machuPicchu",   name: "Machu Picchu",      location: INFO.machuPicchu.location,   lat: MONUMENT_LATLON.machuPicchu.lat,   lon: MONUMENT_LATLON.machuPicchu.lon,   emoji: String.fromCodePoint(0x1F3D4) },
  { mk: "greatWall",     name: "Great Wall",        location: INFO.greatWall.location,     lat: MONUMENT_LATLON.greatWall.lat,     lon: MONUMENT_LATLON.greatWall.lon,     emoji: String.fromCodePoint(0x1F9F1) },
  { mk: "pyramidGiza",   name: "Pyramids of Giza",  location: INFO.pyramidGiza.location,   lat: MONUMENT_LATLON.pyramidGiza.lat,   lon: MONUMENT_LATLON.pyramidGiza.lon,   emoji: String.fromCodePoint(0x1F3DC) },
  { mk: "tokyoSkytree",  name: "Tokyo",             location: INFO.tokyoSkytree.location,  lat: MONUMENT_LATLON.tokyoSkytree.lat,  lon: MONUMENT_LATLON.tokyoSkytree.lon,  emoji: String.fromCodePoint(0x1F5FE) },
  { mk: "statueLiberty", name: "New York",          location: INFO.statueLiberty.location, lat: MONUMENT_LATLON.statueLiberty.lat, lon: MONUMENT_LATLON.statueLiberty.lon, emoji: String.fromCodePoint(0x1F5FD) },
  { mk: "sydneyOpera",   name: "Sydney",            location: INFO.sydneyOpera.location,   lat: MONUMENT_LATLON.sydneyOpera.lat,   lon: MONUMENT_LATLON.sydneyOpera.lon,   emoji: String.fromCodePoint(0x1F3D9) },
];

// Match a free-text destination against the catalog. Substring on name,
// location, or mk key — tolerant to "kyoto", "Eiffel", "japan", etc.
// Returns the first hit, or null if nothing matches. Caller decides what
// to do with no match (Atlas accepts the raw string and proceeds without
// a globe pin).
export function resolveDestination(query: string): Suggestion | null {
  const hits = searchDestinations(query, [], 1);
  return hits[0] ?? null;
}

// Lightweight city shape — anything with name + lat/lon + optional country.
// Caller passes the curated CITIES + getExtraCities() since those are
// already loaded in the runtime.
export type CityLike = { n: string; lat: number; lon: number; c?: string };

// Searches monuments first, then the supplied city list. Returns up to
// `limit` matches. Used to power the destination autocomplete dropdown.
// Case-insensitive substring on name/location. Monument matches outrank
// city matches so "tokyo" → Tokyo Skytree first, then Tokyo city.
export function searchDestinations(query: string, cities: CityLike[] = [], limit = 6): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: Suggestion[] = [];
  const seen = new Set<string>();

  // 1. Exact mk match wins (handles paste of the canonical key)
  const exact = POPULAR_SUGGESTIONS.find(s => s.mk.toLowerCase() === q);
  if (exact) { out.push(exact); seen.add(exact.name.toLowerCase()); }

  // 2. Monument substring matches — known landmarks + adjacent cities.
  for (const mk in INFO) {
    if (out.length >= limit) break;
    const info = INFO[mk as keyof typeof INFO];
    if (
      info.name.toLowerCase().includes(q) ||
      info.location.toLowerCase().includes(q) ||
      mk.toLowerCase().includes(q)
    ) {
      const coords = MONUMENT_LATLON[mk];
      if (coords && !seen.has(info.name.toLowerCase())) {
        out.push({
          mk,
          name: info.name,
          location: info.location,
          lat: coords.lat,
          lon: coords.lon,
          emoji: String.fromCodePoint(0x1F4CD),
        });
        seen.add(info.name.toLowerCase());
      }
    }
  }

  // 3. City matches from the supplied list. Prefer prefix matches over
  // substring so "san" surfaces "San Francisco" before "Buenos Aires".
  const startsWith: CityLike[] = [];
  const contains: CityLike[] = [];
  for (const c of cities) {
    if (out.length + startsWith.length + contains.length >= limit * 3) break;
    const name = c.n.toLowerCase();
    if (seen.has(name)) continue;
    if (name.startsWith(q)) startsWith.push(c);
    else if (name.includes(q)) contains.push(c);
  }
  for (const c of [...startsWith, ...contains]) {
    if (out.length >= limit) break;
    out.push({
      mk: `city:${c.n}`,
      name: c.n,
      location: c.c ?? "",
      lat: c.lat,
      lon: c.lon,
      emoji: String.fromCodePoint(0x1F30D), // 🌍 — distinguishes city from landmark 📍
    });
    seen.add(c.n.toLowerCase());
  }

  return out;
}
