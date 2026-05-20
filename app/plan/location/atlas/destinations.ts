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
  const q = query.trim().toLowerCase();
  if (!q) return null;
  // Exact mk match wins
  const exact = POPULAR_SUGGESTIONS.find(s => s.mk.toLowerCase() === q);
  if (exact) return exact;
  // Substring against all known monuments — broader than just popular,
  // so "fushimi" matches even though it's not in the suggestion grid.
  for (const mk in INFO) {
    const info = INFO[mk as keyof typeof INFO];
    if (
      info.name.toLowerCase().includes(q) ||
      info.location.toLowerCase().includes(q) ||
      mk.toLowerCase().includes(q)
    ) {
      const coords = MONUMENT_LATLON[mk];
      // Only return a hit when we have coords — the monument might not be
      // in MONUMENT_LATLON yet (only ~19 monuments are listed there for now).
      if (coords) {
        return {
          mk,
          name: info.name,
          location: info.location,
          lat: coords.lat,
          lon: coords.lon,
          emoji: String.fromCodePoint(0x1F4CD),
        };
      }
    }
  }
  return null;
}
