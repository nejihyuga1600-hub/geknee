// Pure-data module — quest engine for the 366 monuments in info.ts.
//
// Two axes that must NOT be conflated:
//   1. Monument rarity ("Common"/"Rare"/"Epic"/"Legendary") — drives the
//      collection-card frame; based on physical reach difficulty + fame.
//   2. Skin tier ("bronze"/"silver"/"gold"/"diamond"/"aurora"/"celestial")
//      — what 3D model variant you unlocked PER monument; based on which quest
//      you completed.
//
// We hand-write metadata for nothing. Both rarity and quest set are derived
// from the monument's existing `name`/`location`/`fact` fields via small,
// auditable heuristics. Override any monument in OVERRIDES below.

import { INFO } from "./info";

export type MonumentRarity = "common" | "rare" | "epic" | "legendary";
export type SkinTier = "bronze" | "silver" | "gold" | "diamond" | "aurora" | "celestial";

export interface QuestTemplate {
  id: string;
  tier: SkinTier;
  // Whether this quest can fire for a given monument, based on derived flags.
  applies: (m: DerivedMeta) => boolean;
  // Render the quest's user-facing label for a given monument.
  render: (m: DerivedMeta) => string;
  verify: VerificationKind;
  // If true, doing this quest with a friend bumps the unlocked skin one tier.
  // We don't write a separate "with-a-friend" quest; the bump stacks on any.
  companionBumpEligible: boolean;
}

export type VerificationKind =
  | "geofence"
  | "photo"
  | "photo+time"
  | "duration"
  | "altitude"
  | "plaque-quiz"
  | "receipt"
  | "hidden-geofence";

export interface Quest {
  id: string;          // unique per (monument, template)
  monumentKey: string;
  templateId: string;
  tier: SkinTier;
  label: string;
  verify: VerificationKind;
  companionBumpEligible: boolean;
}

// ── Derived metadata per monument ─────────────────────────────────────────────
// All fields auto-derived from name/fact/location strings via keyword match.
// Any monument can be overridden via OVERRIDES below.

export interface DerivedMeta {
  key: string;
  name: string;
  location: string;
  fact: string;
  rarity: MonumentRarity;
  // type flags drive which quest templates fire
  isTower: boolean;        // has summit / observation deck → altitude quest
  isNatural: boolean;      // no plaque, no urban purchase, has hidden viewpoint
  isUrban: boolean;        // has nearby purchases / cafés / lawns
  isReligious: boolean;    // has plaque / cultural quiz, no purchase
  isRemote: boolean;       // hard to reach; quests skew higher tier
  isIconic: boolean;       // globally recognizable; bumps to common (busy)
  hasNearbyLawn: boolean;  // can do duration/picnic quest
  hasIconicTime: boolean;  // sparkle hour, chime, illumination time
  hasHiddenSpot: boolean;  // engineer's signature, secret viewpoint
  hasPlaque: boolean;      // history quiz applicable
}

// Rarity heuristic — score then bucket.
// +3 isIconic (Eiffel/Pyramids/Taj-style household name)
// −2 isRemote (Antarctica/Faroe/remote islands)
// +1 isUrban  (easy access)
// +1 hasIconicTime / hasNearbyLawn (lots to do → more visited)
// −1 isNatural (often requires effort to reach)
// Final bucket: ≥3 common, 1–2 rare, 0 epic, ≤−1 legendary

type RarityFlags = Pick<DerivedMeta,
  "isTower" | "isNatural" | "isUrban" | "isReligious" | "isRemote" |
  "isIconic" | "hasNearbyLawn" | "hasIconicTime" | "hasHiddenSpot" | "hasPlaque">;

// Rarity is about access difficulty, not fame. Most tourist sites are easy
// enough to reach that they read as "common" or "rare". Epic/legendary is
// reserved for monuments that demand real effort: remote, extreme, or wild.
//   Base 3 (rare-leaning common)
//   +2 if iconic globally (Eiffel, Pyramids, etc.) — bullseye common
//   +1 if urban (metro/major city)
//   +1 if hasIconicTime (signals popularity infrastructure)
//   −1 if natural site (often outdoors / weather-dependent)
//   −2 if remote (Antarctica, Patagonia, expedition territory)
// Final: ≥4 common, 3 rare, 2 epic, ≤1 legendary
function deriveRarity(flags: RarityFlags): MonumentRarity {
  let score = 3;
  if (flags.isIconic) score += 2;
  if (flags.isUrban) score += 1;
  if (flags.hasIconicTime) score += 1;
  if (flags.isNatural) score -= 1;
  if (flags.isRemote) score -= 2;
  if (score >= 4) return "common";
  if (score === 3) return "rare";
  if (score === 2) return "epic";
  return "legendary";
}

// Curated icon list — these are too famous for the heuristic alone to catch.
// Bumps to isIconic = true.
const ICONIC_KEYS = new Set<string>([
  "eiffelTower", "bigBen", "statueLiberty", "tajMahal", "colosseum",
  "pyramidGiza", "greatWall", "machuPicchu", "christRedeem", "sydneyOpera",
  "goldenGate", "stonehenge", "tokyoSkytree", "neuschwanstein", "acropolis",
  "sagradaFamilia", "angkorWat", "petra", "chichenItza", "borobudur",
  "mtRushmore", "grandCanyon", "niagaraFalls", "iguazuFalls", "victoriaFalls",
  "mtEverest", "tableMountain", "haLongBay", "milfordSound", "galapagos",
]);

// Manual rarity overrides for monuments where the heuristic misfires.
const RARITY_OVERRIDES: Record<string, MonumentRarity> = {
  mtEverest: "legendary",
  victoriaFalls: "legendary",
  iguazuFalls: "legendary",
  machuPicchu: "legendary",
  galapagos: "legendary",
  mountKilimanjaro: "legendary",
  antarcticPeninsula: "legendary",
};

// Keyword-driven flag derivation. Single pass over name+fact+location.
function deriveFlags(key: string, name: string, location: string, fact: string) {
  const blob = `${name} ${location} ${fact}`.toLowerCase();
  const has = (...words: string[]) => words.some(w => blob.includes(w));

  const isTower = has("tower", "skytree", "burj", "spire", "minaret");
  const isNatural = has("falls", "canyon", "mountain", "peak", "volcano",
    "lake", "river", "glacier", "fjord", "desert", "forest", "reef",
    "cave", "geyser", "hot spring", "sand dune", "island", "atoll", "summit",
    "rocky", "rockies");
  const isReligious = has("temple", "cathedral", "church", "mosque", "shrine",
    "monastery", "abbey", "basilica", "synagogue", "stupa", "pagoda");
  const isRemote = has("antarctic", "arctic", "faroe", "svalbard", "patagonia",
    "outback", "remote", "uninhabited", "expedition", "trek");
  const isUrban = has("downtown", "square", "plaza", "boulevard", "avenue",
    "metro", "subway") || has("paris", "london", "tokyo", "new york",
    "rome", "barcelona", "berlin", "amsterdam", "san francisco", "chicago",
    "shanghai", "hong kong", "singapore", "dubai");
  const isIconic = ICONIC_KEYS.has(key);

  const hasNearbyLawn = isUrban && !isNatural;
  const hasIconicTime = has("sparkles", "lights up", "illuminat", "chime",
    "sunrise", "sunset", "golden hour", "fireworks", "after dark",
    "night", "evening");
  // Hidden viewpoint applies broadly — natural sites have lookouts; rural
  // cultural sites have lesser-trafficked angles; only purely-urban-icon
  // sites with fixed sightlines (Eiffel from Trocadéro etc.) lean toward
  // false, but even those usually have known offbeat spots.
  const hasHiddenSpot = isNatural || !isUrban || has("hidden", "secret",
    "lesser-known", "engraving", "signature");
  // Plaque-quiz applies anywhere there's interpretive signage. Natural-park
  // visitor centers count.
  const hasPlaque = true;

  return {
    isTower, isNatural, isUrban, isReligious, isRemote, isIconic,
    hasNearbyLawn, hasIconicTime, hasHiddenSpot, hasPlaque,
  };
}

// ── Quest templates ────────────────────────────────────────────────────────
// 9 templates total. Each monument gets up to 5 — companion bump stacks on top.

// Each tier has ONE primary template to keep the rarity ladder clean.
// Some tiers have a secondary fallback template that fires only if the
// primary doesn't apply — this prevents tier holes for atypical monuments.
export const QUEST_TEMPLATES: QuestTemplate[] = [
  // Bronze — auto-drop on geofence ping + photo proof. The default tier
  // every visit produces. Stone tier was retired (visually identical to
  // bronze; collapsed to a single entry-level tier).
  {
    id: "monument_photo",
    tier: "bronze",
    applies: () => true,
    render: m => `Step inside the perimeter at ${m.name} and capture a photo.`,
    verify: "photo",
    companionBumpEligible: true,
  },
  // Silver — read the history (primary) or buy something nearby (fallback).
  {
    id: "plaque_quiz",
    tier: "silver",
    applies: m => m.hasPlaque,
    render: m => `Photo a plaque at ${m.name} and answer 3 history questions.`,
    verify: "plaque-quiz",
    companionBumpEligible: false,
  },
  {
    id: "local_purchase",
    tier: "silver",
    applies: m => m.isUrban && !m.isReligious,
    render: m => `Receipt from a café or shop within 200m of ${m.name}.`,
    verify: "receipt",
    companionBumpEligible: true,
  },
  // Gold — time-of-day capture (primary) or duration in geofence (fallback).
  {
    id: "time_window",
    tier: "gold",
    applies: m => m.hasIconicTime,
    render: m => {
      const fact = m.fact.toLowerCase();
      if (fact.includes("sparkles") || fact.includes("lights up")) {
        return `Catch ${m.name} at the top of the hour after dark — when it sparkles.`;
      }
      if (fact.includes("sunset") || fact.includes("golden hour")) {
        return `Photograph ${m.name} during golden hour.`;
      }
      return `Photograph ${m.name} after dark, when it's lit.`;
    },
    verify: "photo+time",
    companionBumpEligible: true,
  },
  {
    id: "duration",
    tier: "gold",
    applies: m => m.hasNearbyLawn,
    render: m => `Spend 30+ min at the lawn or plaza near ${m.name}.`,
    verify: "duration",
    companionBumpEligible: true,
  },
  // Diamond — rare moment (full moon, equinox, fireworks).
  {
    id: "diamond_window",
    tier: "diamond",
    applies: m => m.hasIconicTime || m.isIconic,
    render: m => `Capture ${m.name} at a rare moment — full moon, equinox, or fireworks night.`,
    verify: "photo+time",
    companionBumpEligible: true,
  },
  // Aurora (legendary) — physical altitude or arrival challenge.
  {
    id: "altitude",
    tier: "aurora",
    applies: m => m.isTower || m.isNatural,
    render: m => m.isTower
      ? `Reach the highest accessible deck of ${m.name}.`
      : `Reach the iconic high vantage point at ${m.name}.`,
    verify: "altitude",
    companionBumpEligible: true,
  },
  // Celestial (legendary) — find the lesser-known angle, the engineer's
  // signature, the off-the-trail viewpoint.
  {
    id: "hidden_viewpoint",
    tier: "celestial",
    applies: m => m.hasHiddenSpot,
    render: m => `Find a lesser-known viewpoint of ${m.name}.`,
    verify: "hidden-geofence",
    companionBumpEligible: true,
  },
];

// Skin tier → rarity-bucket badge shown in the UI. Aurora and Celestial
// share the legendary bucket per brand rule.
export const SKIN_RARITY: Record<SkinTier, MonumentRarity> = {
  bronze: "common",
  silver: "rare",
  gold: "rare",
  diamond: "epic",
  aurora: "legendary",
  celestial: "legendary",
};

// Per-monument quest pool, capped at 5. Bronze (monument_photo) always fires
// as the entry-level visit reward; rarer tiers gate on monument metadata.
const TIER_RANK: Record<SkinTier, number> = {
  bronze: 1, silver: 2, gold: 3, diamond: 4, aurora: 5, celestial: 6,
};

const MAX_QUESTS_PER_MONUMENT = 5;

// ── Public API ─────────────────────────────────────────────────────────────

export function deriveMeta(key: string): DerivedMeta | null {
  const info = (INFO as Record<string, { name: string; location: string; fact: string }>)[key];
  if (!info) return null;
  const flags = deriveFlags(key, info.name, info.location, info.fact);
  const computedRarity = deriveRarity(flags);
  const rarity = RARITY_OVERRIDES[key] ?? computedRarity;
  return { key, name: info.name, location: info.location, fact: info.fact, rarity, ...flags };
}

export function getQuests(key: string): Quest[] {
  const m = deriveMeta(key);
  if (!m) return [];
  // Build the rarity ladder: at most one quest per tier, picking the FIRST
  // template defined for that tier that applies. Stone+Bronze always fire.
  // Silver/Gold/Diamond/Aurora/Celestial fire when the monument qualifies.
  // This produces a clean ascending ladder rather than two bronzes + two
  // silvers + skipping diamond/aurora.
  const tierOrder: SkinTier[] = ["bronze", "silver", "gold", "diamond", "aurora", "celestial"];
  const picked: QuestTemplate[] = [];
  for (const tier of tierOrder) {
    if (picked.length >= MAX_QUESTS_PER_MONUMENT) break;
    const hit = QUEST_TEMPLATES.find(t => t.tier === tier && t.applies(m));
    if (hit) picked.push(hit);
  }
  return picked.map(t => ({
    id: `${key}__${t.id}`,
    monumentKey: key,
    templateId: t.id,
    tier: t.tier,
    label: t.render(m),
    verify: t.verify,
    companionBumpEligible: t.companionBumpEligible,
  }));
}

export function getRarity(key: string): MonumentRarity | null {
  return deriveMeta(key)?.rarity ?? null;
}

// Apply companion bump: if a quest was completed alongside a friend (both
// users pinged within 10 min), the unlocked tier moves up by one. Stacks on
// the quest's base tier. Capped at celestial.
export function applyCompanionBump(baseTier: SkinTier): SkinTier {
  const ordered: SkinTier[] = ["bronze", "silver", "gold", "diamond", "aurora", "celestial"];
  const i = ordered.indexOf(baseTier);
  if (i < 0 || i === ordered.length - 1) return baseTier;
  return ordered[i + 1]!;
}

// ── Bulk helpers (used by collection page + leaderboard) ────────────────────

export function allMonumentKeys(): string[] {
  return Object.keys(INFO);
}

export function rarityFor(keys: string[]): Record<string, MonumentRarity> {
  const out: Record<string, MonumentRarity> = {};
  for (const k of keys) {
    const r = getRarity(k);
    if (r) out[k] = r;
  }
  return out;
}

// Diagnostic: distribution of derived rarities. Useful in tests and during
// tuning. Run as: bun -e 'import("./quests.ts").then(m => console.log(m.rarityHistogram()))'
export function rarityHistogram(): Record<MonumentRarity, number> {
  const h: Record<MonumentRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const k of allMonumentKeys()) {
    const r = getRarity(k);
    if (r) h[r] += 1;
  }
  return h;
}
