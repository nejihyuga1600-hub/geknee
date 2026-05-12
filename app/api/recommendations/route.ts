// AI-curated trip recommendations endpoint.
//
// Reads the user's saved travel style (TripDraft.style JSON: pace, dietary,
// traveler type, budget) + destination, asks Claude to return a small set
// of editorial picks. NOT a TripAdvisor scrape — these are curated like a
// travel-magazine "If you only have 3 days in Rome…" feature.
//
// Returns typed Rec[] with categorisation so the client can color-code the
// rail by type. Each rec carries a one-line "why it fits" reference to the
// user's stated preferences — the personalisation surface.

import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { geocodeTool } from "@/lib/agent/tools/geocode";
import { findPlacesTool } from "@/lib/agent/tools/find_places";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface Rec {
  id: string;
  name: string;
  category: "restaurant" | "sight" | "experience" | "off-beat" | "neighborhood";
  blurb: string;
  whyItFits: string;
  duration?: string;
  priceTier?: 1 | 2 | 3;
}

const SYSTEM = `You are an editorial travel writer producing curated recommendations for a single traveler's trip. Tone: confident, specific, like a friend who lives in the city — NOT a generic listicle.

Rules:
- Return 6 recommendations balanced across categories: restaurant (2), sight (1), experience (1), off-beat (1), neighborhood (1)
- Each "whyItFits" must reference 1-2 specific items from the user's style preferences
- "blurb" is 2-3 sentences, specific (name a dish, an angle, a time of day)
- Avoid obvious tourist traps unless the user's style says "classic must-sees"
- Use stable IDs: lowercase + dashes derived from the name
- Output ONLY a JSON array. No commentary, no code fences.`;

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { tripId } = (await req.json().catch(() => ({}))) as { tripId?: string };
  if (!tripId) return Response.json({ error: "tripId required" }, { status: 400 });

  const trip = await prisma.tripDraft.findUnique({
    where: { id: tripId },
    select: { id: true, userId: true, location: true, nights: true, style: true },
  });
  if (!trip) return Response.json({ error: "Not found" }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!trip.location) return Response.json({ error: "Trip missing destination" }, { status: 400 });

  let stylePrefs: Record<string, unknown> = {};
  if (trip.style) {
    try { stylePrefs = JSON.parse(trip.style); } catch { /* malformed style — skip */ }
  }

  // Ground recommendations in real Google Places hits so Haiku doesn't
  // hallucinate restaurant names. Geocode the city (often free via the
  // top-cities cache), fan out to find_places for the two categories
  // most likely to be invented (restaurants + sights), then hand the
  // real candidates to Haiku to curate. Best-effort: if any of these
  // calls fail we fall through to the legacy unguarded prompt.
  let candidatesBlock = "";
  try {
    const geo = (await geocodeTool.handler({ query: trip.location }, { userId })) as {
      best?: { lat: number; lon: number };
    };
    if (geo.best) {
      const near = { lat: geo.best.lat, lon: geo.best.lon };
      const [restaurants, sights] = await Promise.all([
        findPlacesTool.handler({ query: "well-rated restaurants", near, radius_m: 4000 }, { userId }),
        findPlacesTool.handler({ query: "iconic sights and museums", near, radius_m: 6000 }, { userId }),
      ]) as Array<{ places?: Array<{ name: string; rating?: number; price_level?: number; address?: string }> }>;
      const fmt = (label: string, list?: Array<{ name: string; rating?: number; price_level?: number; address?: string }>) =>
        list?.length
          ? `${label}:\n${list
              .slice(0, 8)
              .map((p) => `  - ${p.name}${p.rating ? ` (★${p.rating})` : ""}${p.price_level ? ` ${"$".repeat(p.price_level)}` : ""}${p.address ? ` — ${p.address}` : ""}`)
              .join("\n")}`
          : "";
      const blocks = [fmt("REAL RESTAURANTS NEARBY", restaurants.places), fmt("REAL SIGHTS NEARBY", sights.places)].filter(Boolean);
      if (blocks.length) {
        candidatesBlock = `\n\nGROUND TRUTH — pick names ONLY from these lists, never invent. If something doesn't fit any candidate, omit that category rather than fabricate:\n${blocks.join("\n\n")}\n`;
      }
    }
  } catch (err) {
    captureError(err, { route: "/api/recommendations", phase: "grounding", userId, tripId });
  }

  const userMessage = `Destination: ${trip.location}
Length: ${trip.nights ?? 3} nights

Traveler's style preferences (JSON):
${JSON.stringify(stylePrefs, null, 2)}
${candidatesBlock}
Return 6 recommendations as a JSON array shaped like:
[
  { "id": "trattoria-da-enzo", "name": "...", "category": "restaurant", "blurb": "...", "whyItFits": "...", "duration": "...", "priceTier": 2 },
  ...
]`;

  let raw: string;
  try {
    const result = await client.messages.create({
      // Haiku is 3-4x faster than Sonnet for this kind of structured-JSON
      // extraction-style task. Quality of curated recs is well within
      // Haiku's envelope; users felt Sonnet was too slow on this surface.
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1400,
      system: SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });
    raw = result.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("")
      .trim();
  } catch (err) {
    console.error("[recommendations] Anthropic error:", err);
    return Response.json({ error: "Generation failed" }, { status: 502 });
  }

  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); }
  catch { return Response.json({ error: "Invalid model output" }, { status: 502 }); }

  if (!Array.isArray(parsed)) {
    return Response.json({ error: "Expected JSON array" }, { status: 502 });
  }

  const recs: Rec[] = parsed.filter((p): p is Rec => {
    if (typeof p !== "object" || p === null) return false;
    const r = p as Record<string, unknown>;
    return typeof r.id === "string"
      && typeof r.name === "string"
      && typeof r.category === "string"
      && typeof r.blurb === "string"
      && typeof r.whyItFits === "string";
  });

  return Response.json({ recommendations: recs });
}
