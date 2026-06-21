// edit_itinerary — surgically add ONE activity or hotel to the user's
// current trip itinerary. Mirrors the logic in /api/itinerary/adjust
// but runs in-process so the chat agent can edit during a conversation
// turn.
//
// Per rules.md non-negotiable #2 ("AI itinerary"), the chat must be
// able to act on the user's confirmation ("Yes, add it") instead of
// telling the user to do it themselves. This tool closes that loop.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { checkItineraryEditQuota } from "@/lib/plan";
import type { AgentTool } from "../tools";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REVISE_SYSTEM = `You make minimal, surgical edits to existing travel itineraries to incorporate ONE new booking. Output ONLY the revised itinerary as markdown — no commentary, no preamble, no code fences. Preserve the original structure (## Day N: Title headings, activity time-stamps, transit segments, budget breakdown, practical tips) exactly. Change at most 1-2 lines on at most ONE day section. Never regenerate or rewrite other days, the budget, or the tips.`;

interface EditInput {
  kind: "activity" | "hotel";
  name: string;
  district?: string;
  meta?: string;
  price?: string;
}

export const editItineraryTool: AgentTool = {
  name: "edit_itinerary",
  description:
    "Add ONE new activity or hotel to the current trip's itinerary. The change is persisted to the trip immediately and visible on the next reload. Only call AFTER the user has explicitly confirmed they want this added (e.g. responding 'yes' to your prior offer). Requires the conversation to be scoped to a specific trip — fails with an error otherwise.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["activity", "hotel"],
        description: "Whether this is a daytime activity or an overnight hotel.",
      },
      name: {
        type: "string",
        description:
          "Name of the place or activity, exactly as it should appear in the itinerary (e.g. 'Pokémon Center Mega Tokyo').",
      },
      district: {
        type: "string",
        description:
          "Neighborhood / address hint (e.g. 'Sunshine City, 2F, Ikebukuro'). Optional but improves the model's slot-in accuracy.",
      },
      meta: {
        type: "string",
        description:
          "Day-and-time hint (e.g. 'Day 2 · 10:00 AM · ~1.5 hrs'). Tells the reviser where to slot the new line.",
      },
      price: {
        type: "string",
        description: "Optional price hint (e.g. '~¥0', 'free', '$25').",
      },
    },
    required: ["kind", "name"],
  },
  handler: async (input, ctx) => {
    if (!ctx.tripId) {
      return {
        error:
          "No trip context. This tool only works when the conversation is opened from a specific trip page.",
      };
    }
    const trip = await prisma.tripDraft.findUnique({
      where: { id: ctx.tripId },
      select: { userId: true, itinerary: true, location: true },
    });
    if (!trip || trip.userId !== ctx.userId) {
      return { error: "Trip not found or you do not have access to it." };
    }
    if (!trip.itinerary) {
      return {
        error:
          "This trip doesn't have an itinerary yet — generate one before adding activities to it.",
      };
    }

    // Plan-tier quota. Free = 3 edits/trip/day, Pro = 30. Burn first
    // and roll back inside checkItineraryEditQuota so concurrent calls
    // can't race past the limit.
    const quota = await checkItineraryEditQuota(ctx.userId, ctx.tripId);
    if (!quota.allowed) {
      const resetIso = quota.resetAt.slice(0, 10);
      const upgradeHint =
        quota.plan === "free"
          ? " Upgrade to Pro for 10× more itinerary edits per trip per day."
          : "";
      return {
        error: `Daily itinerary-edit limit reached (${quota.limit}/day on the ${quota.plan} plan). Resets ${resetIso}.${upgradeHint}`,
        rateLimited: true,
        plan: quota.plan,
        limit: quota.limit,
        resetAt: quota.resetAt,
      };
    }

    const { kind, name, district, meta, price } = input as unknown as EditInput;

    // ── PRE-FLIGHT: location mismatch guard ────────────────────────────
    // If the new booking is clearly in a different city/country from the
    // trip, refuse before calling the reviser. Prevents Tokyo activities
    // landing in Reykjavik itineraries (regression 2026-06-21).
    //
    // Strategy: pull all geographic tokens from trip.location + the
    // existing itinerary's known city/country mentions, and check
    // whether any of them appear in the candidate's name/district/meta.
    // If the candidate has its own clear city signal (proper noun in
    // district or meta) and zero overlap with the trip's geography, fail.
    const mismatch = detectLocationMismatch(
      trip.location ?? "",
      trip.itinerary,
      { name, district, meta },
    );
    if (mismatch) {
      return {
        error:
          `This booking appears to be in ${mismatch.candidate}, but the trip is in ${mismatch.trip}. ` +
          `If this is for a different trip, please switch trips first. Otherwise tell me which day to add it to.`,
        locationMismatch: true,
        tripLocation: mismatch.trip,
        candidateLocation: mismatch.candidate,
      };
    }

    // ── PERF: send only the affected day to Haiku, not the whole trip ────
    // Pre-optimization: rewriting a full 7-day itinerary ran 30-40s of the
    // 52s end-to-end happy-multi test. Output tokens dominated (Haiku
    // re-emits the ~3000-char doc). Slice to the single "## Day N" section
    // when meta gives us the day, splice the revised section back in.
    //
    // Fallback: when meta has no day hint OR the day header isn't found,
    // send the whole itinerary as before — correctness wins over speed.
    const dayHint = meta?.match(/Day\s*(\d+)/i)?.[1] ?? null;
    const slice = dayHint ? extractDaySection(trip.itinerary, parseInt(dayHint, 10)) : null;

    const editsPrompt =
      `Add this ${kind} with the smallest possible edit:\n` +
      `- Name: ${name}\n` +
      (district ? `- District: ${district}\n` : "") +
      (meta ? `- When: ${meta}\n` : "") +
      (price ? `- Price: ${price}\n` : "");

    let revisedFull: string;
    if (slice) {
      const userMsg =
        `Existing Day ${dayHint} section of the ${trip.location ?? "trip"} itinerary:\n\n` +
        slice.text +
        `\n\n---\n\n${editsPrompt}\nReturn the revised Day section only (preserve the leading ## Day heading).`;
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        // Cache the system prompt — same across every itinerary edit, hits
        // 10% input rate after first call within the 5-minute TTL window.
        system: [{ type: "text", text: REVISE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMsg }],
      });
      const revisedSection = extractText(resp).trim();
      if (!revisedSection) {
        return { error: "The reviser model returned an empty response." };
      }
      revisedFull =
        trip.itinerary.slice(0, slice.start) + revisedSection + trip.itinerary.slice(slice.end);
    } else {
      // Whole-itinerary path (no day hint or header miss).
      const userMsg =
        `Existing itinerary for ${trip.location ?? "this trip"}:\n\n` +
        trip.itinerary +
        `\n\n---\n\n${editsPrompt}\nReturn the revised itinerary in full.`;
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: [{ type: "text", text: REVISE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMsg }],
      });
      revisedFull = extractText(resp).trim();
      if (!revisedFull) {
        return { error: "The reviser model returned an empty response." };
      }
    }

    await prisma.tripDraft.update({
      where: { id: ctx.tripId },
      data: { itinerary: revisedFull, itineraryUpdatedAt: new Date() },
    });

    const dayLabel = dayHint ? `Day ${dayHint}` : null;
    return {
      ok: true,
      kind,
      name,
      day: dayLabel,
      editsRemainingToday: quota.remaining,
      message: `Added ${name} to ${dayLabel ?? "the itinerary"}.`,
    };
  },
};

function extractText(resp: Anthropic.Message): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/^\s*```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
}

// Detect when an incoming activity/hotel is in a different geography
// than the trip. Returns { trip, candidate } when the booking has a
// clear non-trip city/country signal; null otherwise.
//
// Heuristic — not perfect, but catches the obvious cross-continent
// errors (Asakusa→Tokyo vs Reykjavik). False negatives are fine
// (revise runs, possibly produces something odd); false positives
// would be bad (legit edits refused) so we only fire when the
// candidate text has STRONG city evidence.
const KNOWN_CITY_TOKENS: Record<string, string[]> = {
  tokyo: ["tokyo", "shibuya", "shinjuku", "asakusa", "ginza", "harajuku", "akihabara", "ikebukuro", "roppongi", "japan", "japanese"],
  kyoto: ["kyoto", "gion", "arashiyama"],
  osaka: ["osaka", "namba", "umeda", "dotonbori"],
  paris: ["paris", "montmartre", "marais", "louvre", "france", "french"],
  london: ["london", "soho", "shoreditch", "camden", "england", "british", "uk"],
  reykjavik: ["reykjavik", "iceland", "icelandic", "golden circle", "vik", "akureyri"],
  "new york": ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx", "harlem", "soho", "chelsea"],
  rome: ["rome", "roma", "trastevere", "vatican", "italy", "italian"],
  barcelona: ["barcelona", "gaudi", "ramblas", "spain", "spanish"],
  istanbul: ["istanbul", "turkey", "turkish", "galata", "sultanahmet"],
  bangkok: ["bangkok", "thailand", "thai", "sukhumvit"],
  bali: ["bali", "indonesia", "ubud", "seminyak", "canggu"],
  seoul: ["seoul", "korea", "korean", "gangnam", "myeongdong"],
  dubai: ["dubai", "uae", "emirates"],
  sydney: ["sydney", "australia", "aussie", "bondi"],
  "rio de janeiro": ["rio", "brazil", "ipanema", "copacabana"],
};

function detectLocationMismatch(
  tripLocation: string,
  itinerary: string,
  candidate: { name: string; district?: string; meta?: string },
): { trip: string; candidate: string } | null {
  const tripLc = tripLocation.toLowerCase();
  const candidateBlob = `${candidate.name} ${candidate.district ?? ""} ${candidate.meta ?? ""}`.toLowerCase();

  // Build the trip's geo token set: explicit city + tokens implied by KNOWN_CITY_TOKENS.
  const tripTokens = new Set<string>();
  for (const [city, tokens] of Object.entries(KNOWN_CITY_TOKENS)) {
    if (tripLc.includes(city) || tokens.some((t) => tripLc.includes(t))) {
      tokens.forEach((t) => tripTokens.add(t));
      tripTokens.add(city);
    }
  }
  // Also harvest from the existing itinerary's first 1000 chars (Day 1
  // header usually names the city explicitly).
  const itinHead = itinerary.slice(0, 1500).toLowerCase();
  for (const [city, tokens] of Object.entries(KNOWN_CITY_TOKENS)) {
    if (itinHead.includes(city) || tokens.some((t) => itinHead.includes(t))) {
      tokens.forEach((t) => tripTokens.add(t));
      tripTokens.add(city);
    }
  }

  // Find the candidate's strongest city signal: which known city's tokens does it match most?
  let bestCity: string | null = null;
  let bestHits = 0;
  for (const [city, tokens] of Object.entries(KNOWN_CITY_TOKENS)) {
    const hits = tokens.filter((t) => candidateBlob.includes(t)).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestCity = city;
    }
  }
  if (!bestCity || bestHits === 0) return null; // no strong signal — let the revise run

  // If the candidate's best city overlaps with any trip token, it's fine.
  const candidateTokens = KNOWN_CITY_TOKENS[bestCity];
  for (const t of candidateTokens) {
    if (tripTokens.has(t)) return null;
  }

  // Strong evidence of cross-location.
  const tripCity =
    [...tripTokens].find((t) => Object.keys(KNOWN_CITY_TOKENS).includes(t)) ?? tripLocation;
  return {
    trip: capitalize(tripCity),
    candidate: capitalize(bestCity),
  };
}

function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Find the `## Day N` section. Returns the section text plus [start, end)
// offsets so the caller can splice the revised section back into the
// original. Returns null if the header isn't found. The end-anchor is the
// next `##` heading (Day N+1, Budget, Tips, etc.) or end of doc.
function extractDaySection(
  itinerary: string,
  day: number,
): { text: string; start: number; end: number } | null {
  const re = new RegExp(`^##\\s*Day\\s*${day}\\b`, "im");
  const match = re.exec(itinerary);
  if (!match) return null;
  const start = match.index;
  const after = itinerary.slice(start + match[0].length);
  const nextHeader = /\n##\s+/.exec(after);
  const end = nextHeader ? start + match[0].length + nextHeader.index + 1 : itinerary.length;
  return { text: itinerary.slice(start, end), start, end };
}
