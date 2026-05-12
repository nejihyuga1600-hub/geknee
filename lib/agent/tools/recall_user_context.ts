import type { AgentTool } from '../tools';
import { prisma } from '@/lib/prisma';

type Facet = 'dietary' | 'past_trips' | 'collected_monuments' | 'plan_tier';

// Pulls structured per-user context the agent needs to personalize
// recommendations. The agent can request specific facets so we only
// hit Prisma for what's actually used in this turn.
export const recallUserContextTool: AgentTool = {
  name: 'recall_user_context',
  description:
    'Look up the current user\'s personalization signals: dietary tags / allergens, recent past trip locations, monuments they\'ve collected (interest signal), and plan tier. Always call this BEFORE recommending restaurants so dietary restrictions are honored.',
  input_schema: {
    type: 'object',
    properties: {
      facets: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['dietary', 'past_trips', 'collected_monuments', 'plan_tier'],
        },
        description: 'Which facets to fetch. Pick only what you need this turn.',
      },
    },
    required: ['facets'],
  },
  handler: async (input, ctx) => {
    const { facets } = input as { facets: Facet[] };
    if (!ctx.userId) return { error: 'no userId in context' };

    const out: Record<string, unknown> = {};

    if (facets.includes('dietary') || facets.includes('plan_tier')) {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { dietaryTags: true, dietaryNotes: true, plan: true },
      });
      if (facets.includes('dietary')) {
        out.dietary = {
          tags: user?.dietaryTags ?? null,
          notes: user?.dietaryNotes ?? null,
        };
      }
      if (facets.includes('plan_tier')) {
        out.plan_tier = user?.plan ?? 'free';
      }
    }

    if (facets.includes('past_trips')) {
      const trips = await prisma.tripDraft.findMany({
        where: { userId: ctx.userId },
        select: { location: true, startDate: true, endDate: true, title: true },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      });
      out.past_trips = trips;
    }

    if (facets.includes('collected_monuments')) {
      const collected = await prisma.collectedMonument.findMany({
        where: { userId: ctx.userId },
        select: { monumentId: true, skin: true, collectedAt: true },
        orderBy: { collectedAt: 'desc' },
        take: 20,
      });
      out.collected_monuments = collected;
    }

    return out;
  },
};
