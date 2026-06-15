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

    const { kind, name, district, meta, price } = input as unknown as EditInput;

    const userMsg =
      `Existing itinerary for ${trip.location ?? "this trip"}:\n\n` +
      trip.itinerary +
      `\n\n---\n\nAdd this ${kind} with the smallest possible edit:\n` +
      `- Name: ${name}\n` +
      (district ? `- District: ${district}\n` : "") +
      (meta ? `- When: ${meta}\n` : "") +
      (price ? `- Price: ${price}\n` : "") +
      `\nReturn the revised itinerary in full.`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: REVISE_SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });

    const revised = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .replace(/^\s*```(?:markdown|md)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    if (!revised) {
      return { error: "The reviser model returned an empty response." };
    }

    await prisma.tripDraft.update({
      where: { id: ctx.tripId },
      data: { itinerary: revised, itineraryUpdatedAt: new Date() },
    });

    const dayMatch = meta?.match(/Day\s*\d+/i)?.[0] ?? null;
    return {
      ok: true,
      kind,
      name,
      day: dayMatch,
      message: `Added ${name} to ${dayMatch ?? "the itinerary"}.`,
    };
  },
};
