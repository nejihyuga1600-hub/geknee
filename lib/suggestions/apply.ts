// lib/suggestions/apply.ts
// Turns an accepted ItinerarySuggestion row into the right downstream call.
// Called both by the manual /apply route (owner accept) and the auto-apply
// reconciliation (post-countdown). Idempotent at the row level — callers
// check status before invoking.

import { prisma } from '@/lib/prisma';

interface ApplyResult {
  ok: boolean;
  error?: string;
}

export async function applySuggestion(suggestionId: string): Promise<ApplyResult> {
  const s = await prisma.itinerarySuggestion.findUnique({ where: { id: suggestionId } });
  if (!s) return { ok: false, error: 'not_found' };
  if (s.status === 'accepted') return { ok: true }; // idempotent

  const payload = s.payload as Record<string, unknown>;

  switch (s.kind) {
    case 'activity_swap': {
      const dayNumber = payload.dayNumber as number;
      const newActivity = payload.newActivity as string;
      const trip = await prisma.tripDraft.findUnique({ where: { id: s.tripId } });
      if (!trip?.itinerary) return { ok: false, error: 'no_itinerary' };
      const updated = spliceActivityIntoDay(trip.itinerary, dayNumber, newActivity);
      await prisma.tripDraft.update({
        where: { id: s.tripId },
        data: { itinerary: updated, itineraryUpdatedAt: new Date() },
      });
      break;
    }

    case 'stop_reorder': {
      const dayNumber = payload.dayNumber as number;
      const newOrder = payload.newOrder as string[];
      const trip = await prisma.tripDraft.findUnique({ where: { id: s.tripId } });
      if (!trip?.itinerary) return { ok: false, error: 'no_itinerary' };
      const updated = replaceDayStops(trip.itinerary, dayNumber, newOrder);
      await prisma.tripDraft.update({
        where: { id: s.tripId },
        data: { itinerary: updated, itineraryUpdatedAt: new Date() },
      });
      break;
    }

    case 'place_pick': {
      const dayNumber = payload.dayNumber as number;
      const note = payload.note as string;
      const trip = await prisma.tripDraft.findUnique({ where: { id: s.tripId } });
      if (!trip?.itinerary) return { ok: false, error: 'no_itinerary' };
      const updated = appendNoteToDay(trip.itinerary, dayNumber, note);
      await prisma.tripDraft.update({
        where: { id: s.tripId },
        data: { itinerary: updated, itineraryUpdatedAt: new Date() },
      });
      break;
    }

    case 'trip_field': {
      const field = payload.field as string;
      const value = payload.value as string;
      if (!['startDate', 'endDate', 'notes', 'title'].includes(field)) {
        return { ok: false, error: 'bad_field' };
      }
      await prisma.tripDraft.update({
        where: { id: s.tripId },
        data: { [field]: value },
      });
      break;
    }

    default:
      return { ok: false, error: 'unknown_kind' };
  }

  await prisma.itinerarySuggestion.update({
    where: { id: suggestionId },
    data: { status: 'accepted', appliedAt: new Date() },
  });
  return { ok: true };
}

// — Markdown splicers ----------------------------------------------------------
// The itinerary is markdown, e.g.:
//   ## Day 1: Arrival
//   - Drop bags at hotel
//   - Dinner at Le Comptoir
//   ## Day 2: Museum day
//   ...

function dayHeaderRegex(n: number): RegExp {
  return new RegExp(`^##\\s+Day\\s+${n}\\b.*$`, 'mi');
}

function findDayBlock(itinerary: string, dayNumber: number): { start: number; end: number } | null {
  const m = itinerary.match(dayHeaderRegex(dayNumber));
  if (!m || m.index === undefined) return null;
  const start = m.index;
  const nextHeader = itinerary.slice(start + m[0].length).match(/^##\s+Day\s+\d+/m);
  const end = nextHeader && nextHeader.index !== undefined
    ? start + m[0].length + nextHeader.index
    : itinerary.length;
  return { start, end };
}

export function spliceActivityIntoDay(itinerary: string, dayNumber: number, newActivity: string): string {
  const block = findDayBlock(itinerary, dayNumber);
  if (!block) return itinerary + `\n## Day ${dayNumber}\n- ${newActivity}\n`;
  const before = itinerary.slice(0, block.end).trimEnd();
  const after = itinerary.slice(block.end);
  return `${before}\n- ${newActivity}\n${after.startsWith('\n') ? '' : '\n'}${after}`;
}

export function replaceDayStops(itinerary: string, dayNumber: number, newOrder: string[]): string {
  const block = findDayBlock(itinerary, dayNumber);
  if (!block) return itinerary;
  const original = itinerary.slice(block.start, block.end);
  const headerEnd = original.indexOf('\n');
  const header = original.slice(0, headerEnd);
  const newBody = newOrder.map(s => `- ${s}`).join('\n');
  return itinerary.slice(0, block.start) + `${header}\n${newBody}\n` + itinerary.slice(block.end);
}

export function appendNoteToDay(itinerary: string, dayNumber: number, note: string): string {
  const block = findDayBlock(itinerary, dayNumber);
  const tag = `> \u{1F4DD} ${note}`;
  if (!block) return itinerary + `\n## Day ${dayNumber}\n${tag}\n`;
  const before = itinerary.slice(0, block.end).trimEnd();
  const after = itinerary.slice(block.end);
  return `${before}\n${tag}\n${after.startsWith('\n') ? '' : '\n'}${after}`;
}
