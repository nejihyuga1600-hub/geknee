// Google Places `types` → user-facing display categories.
//
// The Places API returns an array of type strings for each place, e.g.
//   ["restaurant", "food", "point_of_interest", "establishment"]
// We roll that to a single top-level category the /saves filter chips
// can key on. Priority order matters — the first matching category wins.

export type SavedPlaceCategory =
  | "restaurant"
  | "cafe"
  | "bar"
  | "hotel"
  | "museum"
  | "landmark"
  | "outdoor"
  | "beach"
  | "shopping"
  | "nightlife"
  | "toddler"
  | "other";

// ── CATEGORIES: label + emoji + which google-types map into it ─────────────
export const CATEGORY_DEFS: Array<{
  key: SavedPlaceCategory;
  label: string;
  emoji: string;
  types: readonly string[];
}> = [
  {
    key: "restaurant",
    label: "Restaurants",
    emoji: "🍽️",
    types: [
      "restaurant",
      "meal_takeaway",
      "meal_delivery",
      "food",
    ],
  },
  {
    key: "cafe",
    label: "Cafés",
    emoji: "☕",
    types: ["cafe", "bakery", "coffee_shop"],
  },
  {
    key: "bar",
    label: "Bars",
    emoji: "🍸",
    types: ["bar", "pub", "wine_bar"],
  },
  {
    key: "nightlife",
    label: "Nightlife",
    emoji: "🌃",
    types: ["night_club", "casino"],
  },
  {
    key: "hotel",
    label: "Hotels",
    emoji: "🏨",
    types: ["lodging", "hotel", "hostel", "resort", "bed_and_breakfast"],
  },
  {
    key: "museum",
    label: "Museums",
    emoji: "🏛️",
    types: ["museum", "art_gallery", "library"],
  },
  {
    key: "beach",
    label: "Beaches",
    emoji: "🏖️",
    types: ["beach", "natural_feature"],
  },
  {
    key: "outdoor",
    label: "Outdoor",
    emoji: "🥾",
    types: [
      "park",
      "campground",
      "national_park",
      "hiking_area",
      "zoo",
      "aquarium",
    ],
  },
  {
    key: "toddler",
    label: "Toddler spots",
    emoji: "🧸",
    types: [
      "amusement_park",
      "playground",
      "child_care",
      "toy_store",
    ],
  },
  {
    key: "landmark",
    label: "Landmarks",
    emoji: "🗿",
    types: [
      "tourist_attraction",
      "point_of_interest",
      "church",
      "mosque",
      "temple",
      "synagogue",
      "hindu_temple",
      "historical_landmark",
      "monument",
    ],
  },
  {
    key: "shopping",
    label: "Shopping",
    emoji: "🛍️",
    types: [
      "shopping_mall",
      "store",
      "clothing_store",
      "book_store",
      "market",
      "supermarket",
      "convenience_store",
    ],
  },
];

// Reverse lookup: place-type → category. Priority = order of CATEGORY_DEFS.
const TYPE_TO_CATEGORY: Map<string, SavedPlaceCategory> = (() => {
  const m = new Map<string, SavedPlaceCategory>();
  for (const def of CATEGORY_DEFS) {
    for (const t of def.types) {
      // First writer wins so the CATEGORY_DEFS order controls precedence.
      if (!m.has(t)) m.set(t, def.key);
    }
  }
  return m;
})();

export function mapCategory(types: readonly string[] | null | undefined): SavedPlaceCategory {
  if (!types || types.length === 0) return "other";
  for (const t of types) {
    const hit = TYPE_TO_CATEGORY.get(t);
    if (hit) return hit;
  }
  return "other";
}

export function categoryLabel(key: SavedPlaceCategory): string {
  return CATEGORY_DEFS.find(d => d.key === key)?.label ?? "Other";
}

export function categoryEmoji(key: SavedPlaceCategory): string {
  return CATEGORY_DEFS.find(d => d.key === key)?.emoji ?? "📍";
}
