// Geknee's identity vocabulary.
//
// One of the few things that makes a travel app feel personal vs.
// transactional is what it calls you. "Wanderer", "explorer",
// "traveler" — these signal that the user is a character in a story,
// not a row in a database. Centralising the vocabulary here so the AI
// system prompts and visible UI strings use the same words; mixing
// freely so it doesn't feel scripted.
//
// Usage:
//   import { pickIdentity, IDENTITY, IDENTITY_VOICE_PRIMER } from "@/lib/voice/identity";
//   const greeting = `Welcome back, ${pickIdentity()}.`;
//   // → "Welcome back, explorer." (varies per call)

/** The default, most-loaded term. Use when you want consistency. */
export const IDENTITY = "wanderer" as const;
export const IDENTITY_PLURAL = "wanderers" as const;

/** Capitalised form for headlines. */
export const IDENTITY_CAPS = "Wanderer" as const;
export const IDENTITY_CAPS_PLURAL = "Wanderers" as const;

/**
 * The vocabulary, ranked by weight. Heaviest words appear most often
 * when pickIdentity() rolls. Keep this list short and on-tone — every
 * addition shows up everywhere from chat greetings to error screens.
 */
const VOCAB = [
  { word: "wanderer", weight: 3 },
  { word: "explorer", weight: 3 },
  { word: "traveler", weight: 2 },
  { word: "voyager",  weight: 1 },
  { word: "adventurer", weight: 1 },
] as const;

const TOTAL_WEIGHT = VOCAB.reduce((s, v) => s + v.weight, 0);

/**
 * Returns one of the identity terms, weighted. Pass a `seed` (string
 * or number) to make the choice deterministic — useful when you want
 * the same user to see the same word across a session, or want SSR
 * and the client to render the same thing without hydration mismatch.
 *
 * No seed → uses Math.random(). DON'T call this at module top-level in
 * code paths the workflow runtime touches; pass a seed (e.g. user id
 * or trip id) for any server-side call site that must be deterministic.
 */
export function pickIdentity(seed?: string | number): string {
  let r: number;
  if (seed !== undefined) {
    // Deterministic hash → 0..1. Cheap FNV-1a so we don't depend on a
    // hash library for a 5-element pick.
    const s = String(seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    r = ((h >>> 0) % 1000) / 1000;
  } else {
    r = Math.random();
  }
  let acc = 0;
  for (const v of VOCAB) {
    acc += v.weight / TOTAL_WEIGHT;
    if (r <= acc) return v.word;
  }
  return VOCAB[0].word;
}

/** Capitalised variant of pickIdentity for headline / button copy. */
export function pickIdentityCaps(seed?: string | number): string {
  const w = pickIdentity(seed);
  return w[0].toUpperCase() + w.slice(1);
}

/**
 * Drop into any AI system prompt to teach the model geknee's voice.
 * Lets the model vary naturally instead of repeating one word every
 * response.
 */
export const IDENTITY_VOICE_PRIMER = `VOICE — geknee treats every user as a character in a travel story, not a "customer" or "user". Address the person as a wanderer, explorer, traveler, voyager, or adventurer — rotate the words so it doesn't feel scripted. Pick whichever best fits the moment (e.g. "explorer" for discovery, "wanderer" for open-ended planning, "voyager" for long trips). Never default to "user". Keep the warmth — these aren't ironic nicknames, they're how geknee sees the person on the other side of the screen.`;
