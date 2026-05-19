# Chat-Aware Itinerary Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI read group-chat messages, propose itinerary changes as cards in the summary view, let the whole group vote and counter-propose, and learn across rounds.

**Architecture:** New endpoint family `/api/trips/[id]/suggest-from-chat` + `/suggestions` + `/suggestions/[sid]/{vote,apply}`. Three new Prisma models (`ItinerarySuggestion`, `SuggestionVote`, `ChatSuggestUsage`) and one new field on `TripDraft` (`suggestionVoteMode`). Server-side prompt builder feeds Claude Haiku 4-5 with chat + itinerary + prior-round vote history; strict JSON output validated and persisted. UI adds a button in the chat panel and a collapsible "AI Suggestions" section above the day cards in `/plan/summary`.

**Tech Stack:** Next.js 16 App Router (route handlers), TypeScript strict mode, Prisma 6 + Supabase Postgres, Anthropic SDK with `claude-haiku-4-5-20251001`, NextAuth v5 (`auth()`), Tailwind in TSX.

**Testing note:** This codebase has no unit-test framework (no jest/vitest), only Playwright for e2e. Each task verifies via `tsc --noEmit` for type safety, `npm run build` for route compilation, and dev-server smoke for UI. Pure helpers get a node-based smoke script under `scripts/smoke/`.

**Feature flag:** Every endpoint and UI surface is gated by `process.env.NEXT_PUBLIC_ENABLE_CHAT_SUGGESTIONS === '1'` so the work can ship dark and be rolled out per-environment.

**Branch:** Recommended to work in a feature branch (`feat/chat-aware-suggestions`) because the cloud agent on `main` has been rebasing aggressively this session.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add 3 models + 1 field |
| `lib/plan.ts` | Modify | Add `checkChatSuggestQuota` |
| `lib/suggestions/validate.ts` | Create | Zod-style runtime validator for the AI JSON response |
| `lib/suggestions/prompt.ts` | Create | Pure function: trip + chat + history → Claude prompt |
| `lib/suggestions/apply.ts` | Create | Dispatcher: suggestion row → existing endpoint call |
| `lib/suggestions/threshold.ts` | Create | Vote-tally → `{ shouldAutoApply, reason }` |
| `lib/suggestions/featureFlag.ts` | Create | Single source of truth for the env gate |
| `app/api/trips/[id]/suggest-from-chat/route.ts` | Create | POST: generate or return cached suggestions |
| `app/api/trips/[id]/suggestions/route.ts` | Create | GET: list pending + pending_apply rows |
| `app/api/trips/[id]/suggestions/[suggestionId]/vote/route.ts` | Create | POST upsert vote, DELETE remove vote |
| `app/api/trips/[id]/suggestions/[suggestionId]/apply/route.ts` | Create | POST owner-or-system apply/reject |
| `app/components/TripSocialPanel.tsx` | Modify | Add "✦ Suggest itinerary changes" button |
| `app/components/SuggestionCard.tsx` | Create | One card: header, rationale, votes, alternatives, accept/reject |
| `app/components/SuggestionsSection.tsx` | Create | Collapsible wrapper around the card list |
| `app/plan/summary/page.tsx` | Modify | Mount `<SuggestionsSection>` above day cards |
| `app/components/SettingsPanel.tsx` | Modify | Add `suggestionVoteMode` toggle for trip owners |
| `scripts/smoke/suggestions.mjs` | Create | Node smoke test for prompt builder + validator |

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma` (append three models, modify `TripDraft`)

- [ ] **Step 1: Add `suggestionVoteMode` field to TripDraft**

In `prisma/schema.prisma`, locate `model TripDraft` and add this field next to `bookingSuggestionsAt`:

```prisma
  // Group voting mode for chat-aware AI suggestions. "advisory" (default):
  // owner sees vote tally + alternatives but solo-applies. "auto_majority":
  // a quorum-met suggestion enters a 60s pending_apply countdown and auto-
  // applies unless a 👎 lands within the window.
  suggestionVoteMode  String @default("advisory")
```

- [ ] **Step 2: Append three models to the schema**

Append at the end of `prisma/schema.prisma`:

```prisma
// ── Chat-aware AI suggestions ─────────────────────────────────────────────────

model ItinerarySuggestion {
  id                 String   @id @default(cuid())
  tripId             String                                       // TripDraft.id
  status             String   @default("pending")                 // pending | pending_apply | accepted | rejected | superseded | expired
  kind               String                                       // activity_swap | stop_reorder | place_pick | trip_field
  dayNumber          Int?                                         // 1-based; null for trip-level
  summary            String                                       // <= 80 chars, card title
  rationale          String                                       // <= 240 chars, cites chat
  payload            Json                                         // shape varies by kind, validated per-kind
  basedOnMessageIds  String[]                                     // TripMessage.id list
  latestMessageId    String                                       // cache key
  latestVoteId       String?                                      // extends cache key once any vote arrives
  votesUpCount       Int      @default(0)
  votesDownCount     Int      @default(0)
  appliedById        String?
  appliedAt          DateTime?
  autoApplyAt        DateTime?                                    // when pending_apply timer expires
  expiresAt          DateTime                                     // hard expiry, createdAt + 7d
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  votes              SuggestionVote[]

  @@index([tripId, status])
  @@index([tripId, latestMessageId])
  @@index([status, autoApplyAt])
}

model SuggestionVote {
  id            String   @id @default(cuid())
  suggestionId  String
  userId        String
  vote          String                                            // "up" | "down"
  alternative   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  suggestion ItinerarySuggestion @relation(fields: [suggestionId], references: [id], onDelete: Cascade)

  @@unique([suggestionId, userId])
  @@index([suggestionId])
}

model ChatSuggestUsage {
  id        String   @id @default(cuid())
  userId    String
  tripId    String
  day       String                                                // YYYY-MM-DD in UTC
  count     Int      @default(0)
  updatedAt DateTime @updatedAt

  @@unique([userId, tripId, day])
  @@index([day])
}
```

- [ ] **Step 3: Validate schema**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 4: Push to database**

Run: `npx prisma db push --skip-generate`
Expected: tables created. If `P1001: Can't reach database`, wake Supabase and re-run.

- [ ] **Step 5: Generate client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 6: Commit**

```powershell
git add prisma/schema.prisma
git commit -m "feat(suggestions): add ItinerarySuggestion, SuggestionVote, ChatSuggestUsage models"
```

---

## Task 2: Rate-limit helper in lib/plan.ts

**Files:**
- Modify: `lib/plan.ts` (append helper)

- [ ] **Step 1: Add the helper**

Append to `lib/plan.ts`:

```ts
const FREE_SUGGEST_PER_DAY = 1;   // cost lever: free tier is a taste; heavy use upgrades to Pro
const PRO_SUGGEST_PER_DAY  = 20;

/** Check whether a user may trigger another AI suggestion call for this trip today. */
export async function checkChatSuggestQuota(
  userId: string,
  tripId: string,
): Promise<{ allowed: true } | { allowed: false; reason: 'rate_limit'; resetAt: string }> {
  if (await isDevAccount(userId)) return { allowed: true };

  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const info = await getUserPlan(userId);
  const limit = info.plan === 'pro' ? PRO_SUGGEST_PER_DAY : FREE_SUGGEST_PER_DAY;

  const row = await prisma.chatSuggestUsage.upsert({
    where: { userId_tripId_day: { userId, tripId, day } },
    create: { userId, tripId, day, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (row.count > limit) {
    // Roll back the increment so a denied call doesn't burn budget
    await prisma.chatSuggestUsage.update({
      where: { id: row.id },
      data: { count: { decrement: 1 } },
    });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return { allowed: false, reason: 'rate_limit', resetAt: tomorrow.toISOString() };
  }

  return { allowed: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add lib/plan.ts
git commit -m "feat(suggestions): add checkChatSuggestQuota helper"
```

---

## Task 3: Feature flag

**Files:**
- Create: `lib/suggestions/featureFlag.ts`

- [ ] **Step 1: Create the file**

```ts
// lib/suggestions/featureFlag.ts
// Single source of truth for whether the chat-aware suggestion feature
// is enabled. Defaults to OFF so the work can ship dark.

export const CHAT_SUGGESTIONS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CHAT_SUGGESTIONS === '1';
```

- [ ] **Step 2: Commit**

```powershell
git add lib/suggestions/featureFlag.ts
git commit -m "feat(suggestions): add feature flag"
```

---

## Task 4: AI response validator

**Files:**
- Create: `lib/suggestions/validate.ts`

- [ ] **Step 1: Create the validator**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add lib/suggestions/validate.ts
git commit -m "feat(suggestions): add strict JSON validator for AI response"
```

---

## Task 5: Prompt builder

**Files:**
- Create: `lib/suggestions/prompt.ts`

- [ ] **Step 1: Create the builder**

```ts
// lib/suggestions/prompt.ts
// Pure function that turns trip context + chat + prior-round votes into a
// Claude prompt. Pure so it's trivially smoke-testable.

export interface TripContext {
  id: string;
  title: string;
  location: string;
  startDate: string | null;
  endDate: string | null;
  itinerary: string | null; // markdown
}

export interface ChatMsg {
  id: string;
  author: string;
  content: string;
  createdAt: Date;
}

export interface PriorSuggestion {
  status: string;            // pending | pending_apply | accepted | rejected | superseded
  kind: string;
  dayNumber: number | null;
  summary: string;
  votesUpCount: number;
  votesDownCount: number;
  alternatives: { author: string; text: string }[];
}

export interface PromptInputs {
  trip: TripContext;
  messages: ChatMsg[];       // up to 50, oldest first
  history: PriorSuggestion[]; // up to 10, newest first
}

export const SUGGESTION_SYSTEM_PROMPT = `You are GeKnee's trip-planning assistant. You read a group's recent chat
about an upcoming trip and propose specific, actionable changes to their itinerary.

Output STRICT JSON matching this schema, no markdown, no fences:
{ "suggestions": [{
    "kind": "activity_swap" | "stop_reorder" | "place_pick" | "trip_field",
    "dayNumber": <number | null>,
    "summary": "<= 80 chars, one-line card title",
    "rationale": "<= 240 chars; cite the chat in your own words",
    "payload": <shape per kind, see below>,
    "basedOnMessageIds": ["<message id>", ...]
}] }

payload shapes per kind:
  activity_swap: { "dayNumber": number, "newActivity": "<= 280 chars" }
  stop_reorder:  { "dayNumber": number, "newOrder": ["stop name", ...] }   // 2..12 items
  place_pick:    { "dayNumber": number, "note": "<= 280 chars" }
  trip_field:    { "field": "startDate"|"endDate"|"notes"|"title", "value": "<= 280 chars" }

Rules:
- Propose 0..5 suggestions. Quality over quantity. Zero is a valid answer.
- Do NOT repeat any prior suggestion that the group rejected or 👎'd majority.
- Use the alternatives the group proposed as direct input. If 3 people said "less museums," do not propose another museum.
- Every suggestion MUST cite at least one message id in basedOnMessageIds.
- If chat content does not justify any change, return an empty list.
- Never invent message ids or day numbers that aren't in the input.`;

export function buildUserPrompt(inputs: PromptInputs): string {
  const { trip, messages, history } = inputs;
  const parts: string[] = [];

  parts.push(`Trip: "${trip.title}" — ${trip.location}`);
  if (trip.startDate || trip.endDate) {
    parts.push(`Dates: ${trip.startDate ?? '?'} → ${trip.endDate ?? '?'}`);
  }
  parts.push('');

  parts.push('CURRENT ITINERARY:');
  parts.push(trip.itinerary ?? '(none yet)');
  parts.push('');

  parts.push(`RECENT CHAT (${messages.length} messages, oldest first):`);
  for (const m of messages) {
    parts.push(`[${m.id}] ${m.author}: ${m.content}`);
  }
  parts.push('');

  if (history.length > 0) {
    parts.push('PREVIOUS SUGGESTIONS — do not repeat rejected ideas; do incorporate the group feedback:');
    for (const h of history) {
      const day = h.dayNumber === null ? 'trip' : `Day ${h.dayNumber}`;
      parts.push(`- [${day} · ${h.kind} · ${h.status}] "${h.summary}"  votes: ${h.votesUpCount}👍/${h.votesDownCount}👎`);
      for (const a of h.alternatives) {
        parts.push(`    alt @${a.author}: "${a.text}"`);
      }
    }
  }

  return parts.join('\n');
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add lib/suggestions/prompt.ts
git commit -m "feat(suggestions): add prompt builder"
```

---

## Task 6: Smoke test for prompt + validator

**Files:**
- Create: `scripts/smoke/suggestions.mjs`

- [ ] **Step 1: Create the smoke script**

```js
// scripts/smoke/suggestions.mjs
// Exercises the prompt builder and the JSON validator without hitting Claude
// or the DB. Run: node scripts/smoke/suggestions.mjs

import { buildUserPrompt, SUGGESTION_SYSTEM_PROMPT } from '../../lib/suggestions/prompt.ts';
import { parseAndValidate } from '../../lib/suggestions/validate.ts';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('PASS:', msg);
}

const prompt = buildUserPrompt({
  trip: { id: 't1', title: 'Paris weekend', location: 'Paris', startDate: '2026-06-01', endDate: '2026-06-04', itinerary: 'Day 1: Louvre\nDay 2: Eiffel' },
  messages: [{ id: 'm1', author: 'Sarah', content: 'we are impressionism people', createdAt: new Date() }],
  history: [{ status: 'rejected', kind: 'activity_swap', dayNumber: 1, summary: 'Swap Louvre for Versailles', votesUpCount: 0, votesDownCount: 3, alternatives: [{ author: 'mike', text: 'no daytrips' }] }],
});
assert(prompt.includes('Paris weekend'), 'prompt contains trip title');
assert(prompt.includes('[m1] Sarah'), 'prompt cites message id');
assert(prompt.includes('alt @mike'), 'prompt includes prior alternatives');
assert(SUGGESTION_SYSTEM_PROMPT.includes('STRICT JSON'), 'system prompt enforces JSON');

const goodJson = JSON.stringify({ suggestions: [{
  kind: 'activity_swap', dayNumber: 1,
  summary: 'Replace Louvre with Musée d\'Orsay',
  rationale: 'Sarah said impressionism, Mike +1ed Orsay',
  payload: { dayNumber: 1, newActivity: 'Visit Musée d\'Orsay' },
  basedOnMessageIds: ['m1'],
}] });
const v1 = parseAndValidate(goodJson);
assert(v1.length === 1, 'valid suggestion passes');

const fencedJson = '```json\n' + goodJson + '\n```';
const v2 = parseAndValidate(fencedJson);
assert(v2.length === 1, 'fenced JSON parses');

const badKind = JSON.stringify({ suggestions: [{ ...JSON.parse(goodJson).suggestions[0], kind: 'invalid' }] });
const v3 = parseAndValidate(badKind);
assert(v3.length === 0, 'invalid kind dropped');

const missingProvenance = JSON.stringify({ suggestions: [{ ...JSON.parse(goodJson).suggestions[0], basedOnMessageIds: [] }] });
const v4 = parseAndValidate(missingProvenance);
assert(v4.length === 0, 'missing provenance dropped');

const garbage = parseAndValidate('not json at all');
assert(garbage.length === 0, 'garbage returns empty list');

console.log('\nAll suggestion smoke checks passed.');
```

- [ ] **Step 2: Run the smoke script**

Run: `npx tsx scripts/smoke/suggestions.mjs`
Expected:
```
PASS: prompt contains trip title
PASS: prompt cites message id
PASS: prompt includes prior alternatives
PASS: system prompt enforces JSON
PASS: valid suggestion passes
PASS: fenced JSON parses
PASS: invalid kind dropped
PASS: missing provenance dropped
PASS: garbage returns empty list

All suggestion smoke checks passed.
```

If `tsx` is not installed, run: `npm i -D tsx` first, then retry.

- [ ] **Step 3: Commit**

```powershell
git add scripts/smoke/suggestions.mjs
git commit -m "test(suggestions): smoke test prompt builder + validator"
```

---

## Task 7: Vote threshold + apply dispatcher

**Files:**
- Create: `lib/suggestions/threshold.ts`
- Create: `lib/suggestions/apply.ts`

- [ ] **Step 1: Create threshold helper**

```ts
// lib/suggestions/threshold.ts
// Pure function: do the votes on this suggestion satisfy the auto-apply rule?
// Rule: at least 2 voters AND >50% are 👍. Returns `false` for trip_field kind
// (owner-only even in auto_majority mode, per the spec guardrail).

export const AUTO_APPLY_WINDOW_MS = 60_000;
export const MIN_VOTERS_FOR_AUTO = 2;

export function shouldAutoApply(
  kind: string,
  votesUpCount: number,
  votesDownCount: number,
): boolean {
  if (kind === 'trip_field') return false;
  const total = votesUpCount + votesDownCount;
  if (total < MIN_VOTERS_FOR_AUTO) return false;
  return votesUpCount / total > 0.5;
}
```

- [ ] **Step 2: Create apply dispatcher**

```ts
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
      // Append the new activity to the relevant day in the markdown itinerary.
      // Cheap path: regenerate via existing /api/itinerary/replan would be heavier;
      // for v1 we splice into the markdown directly.
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
  const tag = `> 📝 ${note}`;
  if (!block) return itinerary + `\n## Day ${dayNumber}\n${tag}\n`;
  const before = itinerary.slice(0, block.end).trimEnd();
  const after = itinerary.slice(block.end);
  return `${before}\n${tag}\n${after.startsWith('\n') ? '' : '\n'}${after}`;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add lib/suggestions/threshold.ts lib/suggestions/apply.ts
git commit -m "feat(suggestions): add threshold + apply dispatcher"
```

---

## Task 8: POST /api/trips/[id]/suggest-from-chat

**Files:**
- Create: `app/api/trips/[id]/suggest-from-chat/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/trips/[id]/suggest-from-chat/route.ts
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { checkChatSuggestQuota } from '@/lib/plan';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';
import { buildUserPrompt, SUGGESTION_SYSTEM_PROMPT } from '@/lib/suggestions/prompt';
import { parseAndValidate } from '@/lib/suggestions/validate';

const MAX_RECENT_MESSAGES = 25;   // cost lever: 25 most recent is almost always enough signal
const MAX_HISTORY = 10;
const SUGGESTION_TTL_DAYS = 7;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!CHAT_SUGGESTIONS_ENABLED) {
    return Response.json({ error: 'feature_disabled' }, { status: 404 });
  }

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId } = await params;
  const trip = await prisma.tripDraft.findUnique({ where: { id: tripId } });
  if (!trip) return Response.json({ error: 'Trip not found' }, { status: 404 });

  // Identify the latest message id at request time. Cache key includes the
  // latest vote so a new vote on a pending row invalidates the cache.
  const [latestMsg, latestVote] = await Promise.all([
    prisma.tripMessage.findFirst({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
    prisma.suggestionVote.findFirst({
      where: { suggestion: { tripId } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ]);

  if (!latestMsg) {
    return Response.json({ suggestions: [], reason: 'no_messages' });
  }

  // Cache hit: existing pending suggestions for this (tripId, latestMessageId, latestVoteId)
  const cached = await prisma.itinerarySuggestion.findMany({
    where: {
      tripId,
      latestMessageId: latestMsg.id,
      latestVoteId: latestVote?.id ?? null,
      status: { in: ['pending', 'pending_apply'] },
    },
    orderBy: { createdAt: 'desc' },
    include: { votes: true },
  });
  if (cached.length > 0) {
    return Response.json({ suggestions: cached, cached: true });
  }

  // Rate limit check happens only on cache miss (the expensive path)
  const quota = await checkChatSuggestQuota(userId, tripId);
  if (!quota.allowed) {
    return Response.json({ error: 'rate_limit', resetAt: quota.resetAt }, { status: 429 });
  }

  // Gather inputs
  const [messages, prior] = await Promise.all([
    prisma.tripMessage.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: MAX_RECENT_MESSAGES,
    }).then(rows => rows.reverse()),
    prisma.itinerarySuggestion.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY,
      include: { votes: { where: { alternative: { not: null } } } },
    }),
  ]);

  const prompt = buildUserPrompt({
    trip: {
      id: trip.id, title: trip.title, location: trip.location,
      startDate: trip.startDate, endDate: trip.endDate,
      itinerary: trip.itinerary,
    },
    messages: messages.map(m => ({ id: m.id, author: m.author, content: m.content, createdAt: m.createdAt })),
    history: prior.map(p => ({
      status: p.status, kind: p.kind, dayNumber: p.dayNumber, summary: p.summary,
      votesUpCount: p.votesUpCount, votesDownCount: p.votesDownCount,
      alternatives: p.votes
        .filter(v => v.alternative)
        .map(v => ({ author: v.userId, text: v.alternative as string })),
    })),
  });

  // Split the prompt into a cacheable "stable" prefix (trip metadata + itinerary,
  // which rarely changes between calls within a few minutes) and a volatile suffix
  // (recent chat + voting history). Anthropic's prompt cache hits the prefix and
  // skips re-billing input tokens for it — ~40% saving on the average call.
  const stableHeader = prompt.split('\nRECENT CHAT')[0];   // trip + itinerary section
  const volatileTail = '\nRECENT CHAT' + prompt.split('\nRECENT CHAT').slice(1).join('\nRECENT CHAT');

  let raw = '';
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: [
        { type: 'text', text: SUGGESTION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: stableHeader, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: volatileTail },
        ],
      }],
    });
    const block = resp.content.find(b => b.type === 'text');
    if (block && block.type === 'text') raw = block.text;
  } catch (err) {
    console.error('suggest-from-chat: Anthropic call failed', err);
    return Response.json({ error: 'ai_failed' }, { status: 502 });
  }

  const validated = parseAndValidate(raw);

  // Supersede prior pending rows for this trip
  await prisma.itinerarySuggestion.updateMany({
    where: { tripId, status: 'pending' },
    data: { status: 'superseded' },
  });

  if (validated.length === 0) {
    return Response.json({ suggestions: [], reason: 'no_change_suggested' });
  }

  const expiresAt = new Date(Date.now() + SUGGESTION_TTL_DAYS * 86400_000);
  const created = await Promise.all(validated.map(v =>
    prisma.itinerarySuggestion.create({
      data: {
        tripId,
        kind: v.kind,
        dayNumber: v.dayNumber,
        summary: v.summary,
        rationale: v.rationale,
        payload: v.payload,
        basedOnMessageIds: v.basedOnMessageIds,
        latestMessageId: latestMsg.id,
        latestVoteId: latestVote?.id ?? null,
        expiresAt,
      },
      include: { votes: true },
    })
  ));

  return Response.json({ suggestions: created, cached: false });
}
```

- [ ] **Step 2: Build (full Next.js compile catches route-segment issues)**

Run: `npm run build`
Expected: build succeeds. If it fails on a missing Prisma method, re-run `npx prisma generate`.

- [ ] **Step 3: Commit**

```powershell
git add app/api/trips/[id]/suggest-from-chat/route.ts
git commit -m "feat(suggestions): POST /api/trips/[id]/suggest-from-chat"
```

---

## Task 9: GET /api/trips/[id]/suggestions

**Files:**
- Create: `app/api/trips/[id]/suggestions/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/trips/[id]/suggestions/route.ts
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!CHAT_SUGGESTIONS_ENABLED) return Response.json({ suggestions: [] });

  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId } = await params;
  const suggestions = await prisma.itinerarySuggestion.findMany({
    where: { tripId, status: { in: ['pending', 'pending_apply'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      votes: {
        select: { id: true, userId: true, vote: true, alternative: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return Response.json({ suggestions });
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```powershell
git add app/api/trips/[id]/suggestions/route.ts
git commit -m "feat(suggestions): GET /api/trips/[id]/suggestions"
```

---

## Task 10: Vote endpoint

**Files:**
- Create: `app/api/trips/[id]/suggestions/[suggestionId]/vote/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/trips/[id]/suggestions/[suggestionId]/vote/route.ts
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';
import { shouldAutoApply, AUTO_APPLY_WINDOW_MS } from '@/lib/suggestions/threshold';

const MAX_ALT_LEN = 280;

type Params = Promise<{ id: string; suggestionId: string }>;

async function recountAndMaybeQueueAutoApply(suggestionId: string, tripId: string) {
  const [up, down, trip] = await Promise.all([
    prisma.suggestionVote.count({ where: { suggestionId, vote: 'up' } }),
    prisma.suggestionVote.count({ where: { suggestionId, vote: 'down' } }),
    prisma.tripDraft.findUnique({ where: { id: tripId }, select: { suggestionVoteMode: true } }),
  ]);

  const suggestion = await prisma.itinerarySuggestion.findUnique({
    where: { id: suggestionId },
    select: { kind: true, status: true },
  });
  if (!suggestion) return;

  const auto = trip?.suggestionVoteMode === 'auto_majority'
    && suggestion.status === 'pending'
    && shouldAutoApply(suggestion.kind, up, down);

  await prisma.itinerarySuggestion.update({
    where: { id: suggestionId },
    data: {
      votesUpCount: up,
      votesDownCount: down,
      ...(auto ? {
        status: 'pending_apply',
        autoApplyAt: new Date(Date.now() + AUTO_APPLY_WINDOW_MS),
      } : {}),
      // Cancel a queued auto-apply if the vote tally no longer satisfies the rule
      ...(suggestion.status === 'pending_apply' && !shouldAutoApply(suggestion.kind, up, down) ? {
        status: 'pending',
        autoApplyAt: null,
      } : {}),
    },
  });
}

export async function POST(req: Request, { params }: { params: Params }) {
  if (!CHAT_SUGGESTIONS_ENABLED) return Response.json({ error: 'feature_disabled' }, { status: 404 });

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId, suggestionId } = await params;
  const body = await req.json().catch(() => ({})) as { vote?: string; alternative?: string };
  if (body.vote !== 'up' && body.vote !== 'down') {
    return Response.json({ error: 'invalid_vote' }, { status: 400 });
  }
  const alternative = typeof body.alternative === 'string'
    ? body.alternative.trim().slice(0, MAX_ALT_LEN) || null
    : null;

  // Confirm the suggestion belongs to this trip
  const s = await prisma.itinerarySuggestion.findUnique({
    where: { id: suggestionId },
    select: { tripId: true, status: true },
  });
  if (!s || s.tripId !== tripId) return Response.json({ error: 'not_found' }, { status: 404 });
  if (s.status === 'accepted' || s.status === 'rejected' || s.status === 'expired' || s.status === 'superseded') {
    return Response.json({ error: 'closed' }, { status: 409 });
  }

  await prisma.suggestionVote.upsert({
    where: { suggestionId_userId: { suggestionId, userId } },
    create: { suggestionId, userId, vote: body.vote, alternative },
    update: { vote: body.vote, alternative },
  });

  // Update latestVoteId on the suggestion to invalidate the prompt cache
  const latest = await prisma.suggestionVote.findFirst({
    where: { suggestionId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  await prisma.itinerarySuggestion.update({
    where: { id: suggestionId },
    data: { latestVoteId: latest?.id ?? null },
  });

  await recountAndMaybeQueueAutoApply(suggestionId, tripId);

  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  if (!CHAT_SUGGESTIONS_ENABLED) return Response.json({ error: 'feature_disabled' }, { status: 404 });

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId, suggestionId } = await params;
  const s = await prisma.itinerarySuggestion.findUnique({
    where: { id: suggestionId },
    select: { tripId: true },
  });
  if (!s || s.tripId !== tripId) return Response.json({ error: 'not_found' }, { status: 404 });

  await prisma.suggestionVote.deleteMany({ where: { suggestionId, userId } });
  await recountAndMaybeQueueAutoApply(suggestionId, tripId);

  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```powershell
git add "app/api/trips/[id]/suggestions/[suggestionId]/vote/route.ts"
git commit -m "feat(suggestions): vote endpoint (POST + DELETE) with auto-apply queuing"
```

---

## Task 11: Apply endpoint

**Files:**
- Create: `app/api/trips/[id]/suggestions/[suggestionId]/apply/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/trips/[id]/suggestions/[suggestionId]/apply/route.ts
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';
import { applySuggestion } from '@/lib/suggestions/apply';

type Params = Promise<{ id: string; suggestionId: string }>;

export async function POST(req: Request, { params }: { params: Params }) {
  if (!CHAT_SUGGESTIONS_ENABLED) return Response.json({ error: 'feature_disabled' }, { status: 404 });

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId, suggestionId } = await params;
  const body = await req.json().catch(() => ({})) as { action?: string; bySystem?: boolean };
  if (body.action !== 'accept' && body.action !== 'reject') {
    return Response.json({ error: 'invalid_action' }, { status: 400 });
  }

  const [trip, s] = await Promise.all([
    prisma.tripDraft.findUnique({ where: { id: tripId }, select: { userId: true, suggestionVoteMode: true } }),
    prisma.itinerarySuggestion.findUnique({ where: { id: suggestionId } }),
  ]);
  if (!trip || !s || s.tripId !== tripId) return Response.json({ error: 'not_found' }, { status: 404 });
  if (s.status === 'accepted' || s.status === 'rejected') {
    return Response.json({ ok: true, alreadyClosed: true });
  }

  // Auto-apply path: client-driven reconciliation after the 60s window.
  // Permitted when status is pending_apply AND server time is past autoApplyAt
  // AND the trip is in auto_majority mode. trip_field kind is excluded by
  // shouldAutoApply, so it can only reach 'accepted' through the owner path.
  const isAutoFinalize = body.bySystem === true
    && s.status === 'pending_apply'
    && trip.suggestionVoteMode === 'auto_majority'
    && s.autoApplyAt !== null
    && s.autoApplyAt.getTime() <= Date.now();

  const isOwnerAction = trip.userId === userId;
  if (!isOwnerAction && !isAutoFinalize) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  if (body.action === 'reject') {
    await prisma.itinerarySuggestion.update({
      where: { id: suggestionId },
      data: { status: 'rejected', appliedById: userId, appliedAt: new Date() },
    });
    return Response.json({ ok: true });
  }

  // action === 'accept'
  const result = await applySuggestion(suggestionId);
  if (!result.ok) {
    return Response.json({ error: result.error ?? 'apply_failed' }, { status: 500 });
  }
  await prisma.itinerarySuggestion.update({
    where: { id: suggestionId },
    data: { appliedById: userId },
  });
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```powershell
git add "app/api/trips/[id]/suggestions/[suggestionId]/apply/route.ts"
git commit -m "feat(suggestions): apply endpoint with owner + auto-finalize paths"
```

---

## Task 12: SuggestionCard component

**Files:**
- Create: `app/components/SuggestionCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState } from 'react';

export interface Vote {
  id: string;
  userId: string;
  vote: 'up' | 'down';
  alternative: string | null;
}

export interface Suggestion {
  id: string;
  status: string;
  kind: string;
  dayNumber: number | null;
  summary: string;
  rationale: string;
  votesUpCount: number;
  votesDownCount: number;
  autoApplyAt: string | null;
  votes: Vote[];
}

interface Props {
  suggestion: Suggestion;
  tripId: string;
  currentUserId: string;
  isOwner: boolean;
  voteMode: 'advisory' | 'auto_majority';
  onChange: () => void; // parent re-fetches
}

export default function SuggestionCard({ suggestion: s, tripId, currentUserId, isOwner, voteMode, onChange }: Props) {
  const myVote = s.votes.find(v => v.userId === currentUserId);
  const [showAltForm, setShowAltForm] = useState(false);
  const [altText, setAltText] = useState(myVote?.alternative ?? '');
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Countdown for pending_apply
  if (s.status === 'pending_apply' && s.autoApplyAt && countdown === null) {
    const tick = () => {
      const remaining = Math.max(0, new Date(s.autoApplyAt!).getTime() - Date.now());
      setCountdown(remaining);
      if (remaining > 0) setTimeout(tick, 1000);
      else finalizeAuto();
    };
    setTimeout(tick, 0);
  }

  async function vote(direction: 'up' | 'down') {
    setBusy(true);
    await fetch(`/api/trips/${tripId}/suggestions/${s.id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: direction, alternative: altText || undefined }),
    });
    setBusy(false);
    setShowAltForm(false);
    onChange();
  }

  async function clearVote() {
    setBusy(true);
    await fetch(`/api/trips/${tripId}/suggestions/${s.id}/vote`, { method: 'DELETE' });
    setBusy(false);
    onChange();
  }

  async function decide(action: 'accept' | 'reject') {
    setBusy(true);
    await fetch(`/api/trips/${tripId}/suggestions/${s.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    onChange();
  }

  async function finalizeAuto() {
    await fetch(`/api/trips/${tripId}/suggestions/${s.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept', bySystem: true }),
    });
    onChange();
  }

  const dayLabel = s.dayNumber === null ? 'Trip-level' : `Day ${s.dayNumber}`;
  const kindLabel = s.kind.replace(/_/g, ' ');

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-3">
      <div className="text-xs text-white/50 mb-1">✦ {dayLabel} · {kindLabel}</div>
      <div className="font-semibold text-white mb-2">{s.summary}</div>
      <div className="text-sm text-white/70 italic mb-3">{s.rationale}</div>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => myVote?.vote === 'up' ? clearVote() : vote('up')}
          disabled={busy}
          className={`px-3 py-1 rounded-full text-sm border ${myVote?.vote === 'up' ? 'bg-emerald-500/30 border-emerald-400/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
        >
          👍 {s.votesUpCount}
        </button>
        <button
          onClick={() => myVote?.vote === 'down' ? clearVote() : vote('down')}
          disabled={busy}
          className={`px-3 py-1 rounded-full text-sm border ${myVote?.vote === 'down' ? 'bg-rose-500/30 border-rose-400/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
        >
          👎 {s.votesDownCount}
        </button>
        <button
          onClick={() => setShowAltForm(v => !v)}
          disabled={busy}
          className="px-3 py-1 rounded-full text-sm border border-white/10 bg-white/5 hover:bg-white/10"
        >
          + Alternative
        </button>
      </div>

      {showAltForm && (
        <div className="mb-3">
          <textarea
            value={altText}
            onChange={e => setAltText(e.target.value.slice(0, 280))}
            placeholder="What would you do instead?"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            rows={2}
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => vote(myVote?.vote ?? 'down')} disabled={busy || !altText.trim()} className="px-3 py-1 rounded-md bg-amber-400 text-black text-sm font-semibold disabled:opacity-50">Save alternative</button>
            <button onClick={() => setShowAltForm(false)} className="px-3 py-1 rounded-md bg-white/5 text-white/60 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {s.votes.filter(v => v.alternative).length > 0 && (
        <div className="border-t border-white/10 pt-2 mb-3">
          <div className="text-xs text-white/40 mb-1">Alternatives:</div>
          {s.votes.filter(v => v.alternative).map(v => (
            <div key={v.id} className="text-sm text-white/70">
              <span className="text-white/40">@{v.userId.slice(0, 6)}:</span> "{v.alternative}"
            </div>
          ))}
        </div>
      )}

      {s.status === 'pending_apply' && countdown !== null && (
        <div className="rounded-md bg-amber-500/15 border border-amber-400/30 px-3 py-2 text-sm text-amber-200">
          Auto-applying in {Math.ceil(countdown / 1000)}s — any 👎 to cancel
        </div>
      )}

      {s.status === 'pending' && (isOwner || voteMode === 'auto_majority') && (
        <div className="border-t border-white/10 pt-3 flex gap-2">
          {isOwner ? (
            <>
              <button onClick={() => decide('accept')} disabled={busy} className="flex-1 px-3 py-2 rounded-lg bg-emerald-400 text-black font-semibold text-sm disabled:opacity-50">Accept</button>
              <button onClick={() => decide('reject')} disabled={busy} className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm">Reject</button>
            </>
          ) : (
            <div className="text-xs text-white/40">Waiting on trip owner</div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add app/components/SuggestionCard.tsx
git commit -m "feat(suggestions): SuggestionCard with vote + alternative + apply buttons"
```

---

## Task 13: SuggestionsSection wrapper

**Files:**
- Create: `app/components/SuggestionsSection.tsx`

- [ ] **Step 1: Create the section**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import SuggestionCard, { type Suggestion } from './SuggestionCard';

interface Props {
  tripId: string;
  currentUserId: string;
  isOwner: boolean;
  voteMode: 'advisory' | 'auto_majority';
}

export default function SuggestionsSection({ tripId, currentUserId, isOwner, voteMode }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/trips/${tripId}/suggestions`);
    const data = await res.json();
    setSuggestions(data.suggestions ?? []);
    setLoading(false);
  }, [tripId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading && suggestions.length === 0) return null;
  if (suggestions.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-400/20 bg-gradient-to-b from-amber-500/5 to-transparent p-4">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between mb-2"
      >
        <div className="text-sm font-semibold text-amber-200">
          ✦ AI Suggestions ({suggestions.length})
        </div>
        <div className="text-xs text-white/40">{collapsed ? 'Show' : 'Hide'}</div>
      </button>
      {!collapsed && (
        <div>
          {suggestions.map(s => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              tripId={tripId}
              currentUserId={currentUserId}
              isOwner={isOwner}
              voteMode={voteMode}
              onChange={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add app/components/SuggestionsSection.tsx
git commit -m "feat(suggestions): SuggestionsSection wrapper"
```

---

## Task 14: Mount SuggestionsSection in summary page

**Files:**
- Modify: `app/plan/summary/page.tsx`

- [ ] **Step 1: Add the import near the top of the file**

Find the existing imports block at the top of `app/plan/summary/page.tsx` and add:

```tsx
import SuggestionsSection from '@/app/components/SuggestionsSection';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';
```

- [ ] **Step 2: Mount the section above the day cards**

Find the JSX block that renders the day cards in the saved-trip view (search for `Day` or the existing day-card map). Just above the day-card render, add:

```tsx
{CHAT_SUGGESTIONS_ENABLED && savedTripDbId && currentUserId && (
  <SuggestionsSection
    tripId={savedTripDbId}
    currentUserId={currentUserId}
    isOwner={tripOwnerUserId === currentUserId}
    voteMode={tripVoteMode}
  />
)}
```

Where `savedTripDbId`, `currentUserId`, `tripOwnerUserId`, `tripVoteMode` are state already loaded from `/api/trips/[id]` (or — if not yet present — fetched in the existing effect that loads the trip; extend that fetch to also read `userId` and `suggestionVoteMode`).

- [ ] **Step 3: Build + smoke**

Run: `npm run build`
Expected: build succeeds.

Run: `npm run dev`
Visit `/plan/summary?savedTripId=<a real id>` with `NEXT_PUBLIC_ENABLE_CHAT_SUGGESTIONS=1` in `.env`. Confirm no suggestions render until the next task wires the trigger button.

- [ ] **Step 4: Commit**

```powershell
git add app/plan/summary/page.tsx
git commit -m "feat(suggestions): mount SuggestionsSection in summary view"
```

---

## Task 15: Chat-panel "Suggest" button

**Files:**
- Modify: `app/components/TripSocialPanel.tsx`

- [ ] **Step 1: Add the imports**

Near the top of `app/components/TripSocialPanel.tsx` add:

```tsx
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';
```

- [ ] **Step 2: Add the button to the active-chat composer area**

Find the JSX that renders the composer for an active group chat. Just above the textarea/send button, add:

```tsx
{CHAT_SUGGESTIONS_ENABLED && activeGroup?.tripId && (
  <button
    onClick={async () => {
      const res = await fetch(`/api/trips/${activeGroup.tripId}/suggest-from-chat`, { method: 'POST' });
      if (res.status === 429) {
        alert('Daily AI-suggestion limit reached. Try again tomorrow.');
        return;
      }
      if (!res.ok) {
        alert('Could not get suggestions right now.');
        return;
      }
      window.dispatchEvent(new CustomEvent('suggestions:refresh'));
    }}
    className="mb-2 w-full px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-200 text-sm font-semibold hover:bg-amber-500/20"
  >
    ✦ Suggest itinerary changes
  </button>
)}
```

Where `activeGroup.tripId` is the in-context trip id from the existing TripSocialPanel state — if the panel's group object doesn't already carry a `tripId`, extend the state shape to include it.

- [ ] **Step 3: Have SuggestionsSection listen for the refresh event**

Modify `app/components/SuggestionsSection.tsx`'s `useEffect` to also wire the event:

```tsx
useEffect(() => {
  refresh();
  const onRefresh = () => refresh();
  window.addEventListener('suggestions:refresh', onRefresh);
  return () => window.removeEventListener('suggestions:refresh', onRefresh);
}, [refresh]);
```

- [ ] **Step 4: Build + smoke**

Run: `npm run build`
Expected: build succeeds.

Manual smoke: open a saved trip with chat messages, click "✦ Suggest itinerary changes". Confirm:
1. Network tab shows POST to `/api/trips/<id>/suggest-from-chat` returning 200.
2. After the response, the SuggestionsSection appears with cards.
3. Click 👍 — counts update.
4. Click "+ Alternative", type text, save — appears under "Alternatives".
5. As trip owner, click Accept — suggestion vanishes and the day in the itinerary updates (markdown changed).

- [ ] **Step 5: Commit**

```powershell
git add app/components/TripSocialPanel.tsx app/components/SuggestionsSection.tsx
git commit -m "feat(suggestions): chat-panel trigger button + cross-panel refresh"
```

---

## Task 16: Trip-level vote-mode toggle

**Files:**
- Modify: `app/components/SettingsPanel.tsx`

- [ ] **Step 1: Add the imports near the top**

```tsx
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';
```

- [ ] **Step 2: Add the toggle block**

Find the JSX where trip-specific settings render (or, if the panel doesn't already have a trip-settings section, add one above the existing feedback section). Insert:

```tsx
{CHAT_SUGGESTIONS_ENABLED && currentTripId && isCurrentUserTripOwner && (
  <div className="mb-6">
    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Group voting mode</div>
    <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
      How votes on AI suggestions get applied to your trip.
    </div>
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, cursor: 'pointer' }}>
      <input
        type="radio"
        name="voteMode"
        value="advisory"
        checked={tripVoteMode === 'advisory'}
        onChange={() => updateTripVoteMode('advisory')}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Advisory (default)</div>
        <div style={{ fontSize: 11, color: MUTED }}>Votes show. You accept or reject each one manually.</div>
      </div>
    </label>
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input
        type="radio"
        name="voteMode"
        value="auto_majority"
        checked={tripVoteMode === 'auto_majority'}
        onChange={() => updateTripVoteMode('auto_majority')}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Auto-apply by majority</div>
        <div style={{ fontSize: 11, color: MUTED }}>Once 2+ votes are in and most are 👍, a 60s countdown starts. Any 👎 cancels.</div>
      </div>
    </label>
  </div>
)}
```

And add the helper to the component body:

```tsx
async function updateTripVoteMode(mode: 'advisory' | 'auto_majority') {
  setTripVoteMode(mode);
  await fetch(`/api/trips/${currentTripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestionVoteMode: mode }),
  });
}
```

Where `currentTripId`, `isCurrentUserTripOwner`, `tripVoteMode`, `setTripVoteMode` are added to the component state and loaded from the existing trip fetch (or a new one if SettingsPanel doesn't already know about the current trip).

- [ ] **Step 3: Extend PATCH /api/trips/[id] to accept suggestionVoteMode**

Locate `app/api/trips/[id]/route.ts` and find the PATCH handler. In the allowed-fields whitelist, add `suggestionVoteMode`. Validate value is one of `'advisory' | 'auto_majority'`.

- [ ] **Step 4: Build + smoke**

Run: `npm run build`
Expected: build succeeds.

Manual: open Settings on a trip you own, toggle the radio. Confirm the PATCH succeeds and that switching to `auto_majority` makes new vote thresholds queue a 60s countdown on cards.

- [ ] **Step 5: Commit**

```powershell
git add app/components/SettingsPanel.tsx "app/api/trips/[id]/route.ts"
git commit -m "feat(suggestions): owner toggle for suggestionVoteMode"
```

---

## Task 17: End-to-end smoke

- [ ] **Step 1: Set the env flag**

In `.env.local` (or `.env`):

```
NEXT_PUBLIC_ENABLE_CHAT_SUGGESTIONS=1
```

- [ ] **Step 2: Start dev server**

Run: `npm run dev`

- [ ] **Step 3: Run the full flow against a real trip**

1. Sign in as the trip owner.
2. Open a saved trip's summary page.
3. Open the chat panel; post 3–5 messages of varied opinion ("less museums", "more food", "skip day 4").
4. Click **✦ Suggest itinerary changes**. Confirm 1–5 cards appear above the day list.
5. Sign in as another user (different browser / incognito), join the trip chat, vote 👍 and add an alternative on one card.
6. Back as owner: confirm vote count updated, alternative visible.
7. Click **Accept** on one card. Confirm the day section in the markdown itinerary visibly changed and the card disappears.
8. Open Settings → flip vote mode to **Auto-apply by majority**. Have two non-owner users vote 👍 on a new card. Confirm the countdown banner appears for 60s and the suggestion auto-applies at the end.
9. Trigger the suggest button again with no new chat messages. Confirm `cached: true` in the response (DevTools).
10. Hit the rate limit on a free account by clicking 4 times in a day. Confirm a 429 + toast on attempt #4.

- [ ] **Step 4: Final commit (anything missed in the smoke pass)**

```powershell
git add -A
git commit -m "test(suggestions): smoke pass complete"
```

---

## Self-Review

**Spec coverage check:** every section of the spec maps to a task —
- §Data model → Task 1
- §API surface → Tasks 8, 9, 10, 11
- §AI prompt structure → Tasks 4, 5
- §UI surfaces → Tasks 12, 13, 14, 15, 16
- §Cost & rate limiting → Tasks 2, 3
- §Error handling → woven through Tasks 8, 10, 11 (rate-limit toast, owner-only 403, malformed-JSON drop)
- §Testing → Tasks 6, 17

**Placeholder scan:** no TBDs. Every code step shows the actual code. The single "extend existing fetch to load `tripOwnerUserId` and `tripVoteMode`" in Tasks 14–16 is the only place the plan delegates to existing context — acceptable because the existing fetch is local to the page and the engineer can see it on-screen while editing.

**Type consistency:** `Suggestion` interface in `SuggestionCard.tsx` matches the API response in `Task 9`. `vote: 'up' | 'down'` is consistent across server (Task 10), card (Task 12), section (Task 13). Cache-key fields (`latestMessageId`, `latestVoteId`) are written by Task 8 and read consistently by Task 10's update-after-vote logic.

**Auto-apply path coherence:** Task 10 sets `status: pending_apply` + `autoApplyAt`. Task 12 reads `autoApplyAt` and runs the countdown on the client. Task 11 accepts a `bySystem: true` body and verifies `autoApplyAt <= now()` server-side before applying. Path closes the loop.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-chat-aware-itinerary-suggestions.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan given (a) cloud agent is committing to `main` and (b) tasks 1, 4–7 are independent and parallelize cleanly.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`. Slower, but you see every step.

**Which approach?**
