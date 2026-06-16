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
