// lib/suggestions/validate.ts
// Strict runtime validation for the JSON Claude returns. Anything that
// doesn't match is dropped silently (logged) — we never persist garbage.

export type SuggestionKind = 'activity_swap' | 'stop_reorder' | 'place_pick' | 'trip_field';

export interface ValidatedSuggestion {
  kind: SuggestionKind;
  dayNumber: number | null;
  summary: string;
  rationale: string;
  payload: Record<string, unknown>;
  basedOnMessageIds: string[];
}

const KINDS: ReadonlySet<SuggestionKind> = new Set([
  'activity_swap', 'stop_reorder', 'place_pick', 'trip_field',
]);

const MAX_SUMMARY = 80;
const MAX_RATIONALE = 240;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validatePayload(kind: SuggestionKind, p: unknown): boolean {
  if (!isObject(p)) return false;
  switch (kind) {
    case 'activity_swap':
      return typeof p.dayNumber === 'number'
        && typeof p.newActivity === 'string'
        && p.newActivity.length > 0 && p.newActivity.length <= 280;
    case 'stop_reorder':
      return typeof p.dayNumber === 'number'
        && isStringArray(p.newOrder)
        && p.newOrder.length >= 2 && p.newOrder.length <= 12;
    case 'place_pick':
      return typeof p.dayNumber === 'number'
        && typeof p.note === 'string'
        && p.note.length > 0 && p.note.length <= 280;
    case 'trip_field':
      return typeof p.field === 'string'
        && ['startDate', 'endDate', 'notes', 'title'].includes(p.field as string)
        && typeof p.value === 'string' && p.value.length <= 280;
  }
}

function validateOne(raw: unknown): ValidatedSuggestion | null {
  if (!isObject(raw)) return null;
  const { kind, dayNumber, summary, rationale, payload, basedOnMessageIds } = raw;
  if (typeof kind !== 'string' || !KINDS.has(kind as SuggestionKind)) return null;
  if (typeof summary !== 'string' || summary.length === 0 || summary.length > MAX_SUMMARY) return null;
  if (typeof rationale !== 'string' || rationale.length === 0 || rationale.length > MAX_RATIONALE) return null;
  if (dayNumber !== null && (typeof dayNumber !== 'number' || dayNumber < 1)) return null;
  if (!isStringArray(basedOnMessageIds) || basedOnMessageIds.length === 0) return null;
  if (!validatePayload(kind as SuggestionKind, payload)) return null;
  return {
    kind: kind as SuggestionKind,
    dayNumber: dayNumber === null ? null : dayNumber as number,
    summary,
    rationale,
    payload: payload as Record<string, unknown>,
    basedOnMessageIds,
  };
}

/** Parse Claude's text response and return the suggestions that pass schema. */
export function parseAndValidate(raw: string): ValidatedSuggestion[] {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(stripped); } catch { return []; }
  if (!isObject(parsed) || !Array.isArray((parsed as { suggestions?: unknown[] }).suggestions)) {
    return [];
  }
  const out: ValidatedSuggestion[] = [];
  for (const s of (parsed as { suggestions: unknown[] }).suggestions) {
    const v = validateOne(s);
    if (v) out.push(v);
  }
  return out;
}
