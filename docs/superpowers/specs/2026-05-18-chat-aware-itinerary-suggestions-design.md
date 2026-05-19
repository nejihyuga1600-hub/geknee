# Chat-Aware Itinerary Suggestions — Design Spec

**Date:** 2026-05-18
**Status:** Approved, not yet implemented
**Author:** Brainstormed in session

## Purpose

The GeKnee group chat captures the back-and-forth a group has while planning a trip — "we want a chill morning," "skip the museum," "I'd rather hike." Today, those messages are invisible to the AI itinerary planner. This feature lets the AI read the group chat on demand, propose itinerary changes, let the group vote and counter-propose, and learn from each round so subsequent suggestions reflect what the group actually wants.

## Out of scope (v1)

- Automatic background analysis (without a button press). Future v2.
- Free-form chat-prefix alternatives (`/alt ...`). Card-attached only.
- AI-initiated chat messages. The AI's output is surface-bound to the suggestion card, not posted into the chat thread.
- Trip-level changes (dates, destination) auto-applying. Trip-level suggestions are accepted manually by the owner even in `auto_majority` mode (guardrail).

## User-facing flow

1. A group member taps **"✦ Suggest itinerary changes"** in the chat panel.
2. Server reads the last 50 chat messages since the previous analysis + the current itinerary + the trip's recent suggestion history (with votes and alternatives) and asks Claude Haiku 4-5 for structured suggestions.
3. Suggestion cards render in a collapsible **AI Suggestions** section pinned above the day cards in the itinerary view.
4. Anyone in the chat can 👍/👎 a card and attach an optional **alternative text** (e.g., "or skip museums day 3, do crepes").
5. Depending on the trip's `suggestionVoteMode`:
   - **`advisory`** (default): owner reviews vote tally + alternatives, taps Accept or Reject.
   - **`auto_majority`**: once ≥2 votes are in and >50% are 👍, the suggestion enters a 60-second `pending_apply` countdown banner. A new 👎 within the window cancels. After the window, the suggestion auto-applies.
6. Accept (or auto-apply) dispatches to the correct existing endpoint based on `kind`:
   - `activity_swap` → `POST /api/itinerary/replan`
   - `stop_reorder` → `POST /api/itinerary/optimize`
   - `place_pick` → appended to the day as a note
   - `trip_field` → `PATCH /api/trips/[id]` (owner-only even in auto_majority)
7. Next time anyone taps **Suggest itinerary changes**, the AI sees what the group did with each prior suggestion and adjusts.

## Data model

Add to `prisma/schema.prisma`:

```prisma
model ItinerarySuggestion {
  id                 String   @id @default(cuid())
  tripId             String                                       // TripDraft.id
  status             String   @default("pending")                 // pending | pending_apply | accepted | rejected | superseded | expired
  kind               String                                       // activity_swap | stop_reorder | place_pick | trip_field
  dayNumber          Int?                                         // 1-based; null for trip-level
  summary            String                                       // one-line card title
  rationale          String                                       // why the AI suggests this, citing chat
  payload            Json                                         // structured args for the apply dispatch
  basedOnMessageIds  String[]                                     // TripMessage.id list for provenance
  latestMessageId    String                                       // cache key
  votesUpCount       Int      @default(0)
  votesDownCount     Int      @default(0)
  appliedById        String?
  appliedAt          DateTime?
  expiresAt          DateTime                                     // createdAt + 7 days
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  votes              SuggestionVote[]

  @@index([tripId, status])
  @@index([tripId, latestMessageId])
}

model SuggestionVote {
  id            String   @id @default(cuid())
  suggestionId  String
  userId        String
  vote          String                                            // up | down
  alternative   String?                                           // optional counter-proposal
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  suggestion ItinerarySuggestion @relation(fields: [suggestionId], references: [id], onDelete: Cascade)

  @@unique([suggestionId, userId])
  @@index([suggestionId])
}
```

Add to `TripDraft`:

```prisma
suggestionVoteMode  String  @default("advisory")                  // advisory | auto_majority
```

## API surface

All endpoints auth-gated; `[id]` is the `TripDraft.id`.

| Method · Path | Purpose | Notes |
|---|---|---|
| `POST /api/trips/[id]/suggest-from-chat` | Generate or return cached suggestions | Rate limit via `lib/plan.ts` (free: 3/day/trip, pro: 20/day/trip, dev: unlimited). Cache lookup by `(tripId, latestMessageId, latestVoteId)` — return existing pending rows if hit. On miss, call Claude Haiku 4-5, validate JSON, persist, mark older pending suggestions for the trip as `superseded`. Returns `{ suggestions, cached, rateLimitRemaining }`. |
| `GET /api/trips/[id]/suggestions` | List `pending` + `pending_apply` rows for a trip | Used by the itinerary view to render cards. Includes `votes[]` for each. |
| `POST /api/trips/[id]/suggestions/[suggestionId]/vote` | Upsert vote | Body `{ vote: "up" \| "down", alternative?: string }`. Recomputes denormalized counts. In `auto_majority` mode, checks threshold and transitions to `pending_apply` with a 60s timer (server-scheduled via setTimeout fallback OR client-driven via a final apply call after countdown — see "Auto-apply scheduling" below). |
| `DELETE /api/trips/[id]/suggestions/[suggestionId]/vote` | Remove the current user's vote | Recomputes counts; cancels `pending_apply` if threshold breaks. |
| `POST /api/trips/[id]/suggestions/[suggestionId]/apply` | Owner-only (or system-triggered after countdown) | Body `{ action: "accept" \| "reject" }`. Dispatches to the right downstream endpoint, sets `appliedById`, `appliedAt`, status to `accepted` or `rejected`. |
| `PATCH /api/trips/[id]` | Existing endpoint; gains `suggestionVoteMode` support | Owner-only. |

### Auto-apply scheduling

Serverless instances can't reliably hold a `setTimeout` across cold starts. Implementation: when threshold is first met, mark row `pending_apply` with `expiresAt = now() + 60s`. The client itinerary view shows a countdown and, when it hits zero, calls `POST .../apply` with `action: "accept"`. A server cron (or on-read check in `GET /suggestions`) confirms `now() > expiresAt && status === 'pending_apply'` and forces the apply if the client never came back. This double-source (client UI + server reconciliation) avoids ghost suggestions.

## AI prompt structure

Sent to Claude Haiku 4-5 (cost-effective, plenty smart for structured extraction):

```
System: You are GeKnee's trip-planning assistant. You read a group's chat about
their upcoming trip and propose specific, actionable changes to their itinerary.
Output STRICT JSON matching the schema. Cite the message IDs you used.

User: <trip metadata>
       <current itinerary markdown>
       <last 50 chat messages since cutoff, with {id, author, content}>
       <last 10 prior suggestions with status, votes, alternatives>

Schema: { suggestions: [{
  kind: "activity_swap" | "stop_reorder" | "place_pick" | "trip_field",
  dayNumber: number | null,
  summary: string,           // <= 80 chars, one-line card title
  rationale: string,         // <= 240 chars, cite chat
  payload: {...},            // shape varies by kind, validated server-side
  basedOnMessageIds: string[]
}] }
```

Server validates the JSON shape and the `payload` per-kind (e.g., `activity_swap` requires `{ dayNumber: number, newActivity: string }`). Invalid suggestions are dropped silently and logged; we never persist garbage.

## UI surfaces

**`TripSocialPanel.tsx`** (chat panel): a button below the composer:

```
[✦ Suggest itinerary changes]  3 new since last check
```

Disabled while loading. Hidden if no current trip is in context.

**`app/plan/summary/page.tsx`** (itinerary view): a collapsible section pinned above day cards:

```
✦ AI Suggestions (3)                                   [×]
┌─────────────────────────────────────────────────────────┐
│ Day 3 · Activity swap                                   │
│ Replace Louvre with Musée d'Orsay                       │
│                                                         │
│ Sarah: "we're impressionism people"                     │
│ ─────────────────────────────────────────────────────── │
│ [👍 3]   [👎 1]   [+ Alternative]                       │
│                                                         │
│ @mike: "or skip museums day 3, do crepes"               │
│ ─────────────────────────────────────────────────────── │
│ [ Accept ]  [ Reject ]      (owner-only, advisory mode) │
│ — or —                                                  │
│ Auto-applying in 0:47 — any 👎 to cancel                │
└─────────────────────────────────────────────────────────┘
```

Trip settings (owner only): radio toggle for `suggestionVoteMode` with short copy under each option explaining what changes.

## Cost & rate limiting

- **Model:** `claude-haiku-4-5-20251001` (~5× cheaper than sonnet-4-6 at this payload size).
- **Per-call cost estimate:** ~6k input tokens (chat + itinerary + history) + ~1k output → ~$0.005–$0.008.
- **Caching:** every call first checks `(tripId, latestMessageId, latestVoteId)`. Re-clicks with no new state → $0.
- **Rate limit:** new helper in `lib/plan.ts`:
  ```ts
  export async function checkChatSuggestQuota(userId, tripId): { allowed; reason?; resetAt? }
  ```
  Tracks per-`(userId, tripId, day)` count in a new lightweight `ChatSuggestUsage` table. Free: 3/day/trip. Pro: 20/day/trip. Dev (`isDevAccount`): unlimited.
- **Worst-case spend** on free tier: 3 calls × $0.008 × 30 days × ~100 active free trips = **~$72/month**. Pro tier covers itself via subscription. Well within the project's >$10/month warning threshold — flag at launch but no further guardrail needed for v1.

## Error handling

| Scenario | Response |
|---|---|
| No new messages since last analysis | 200 `{ suggestions: cachedRows, reason: "no_new_messages" }`; UI shows "Nothing new in chat" if cached list is empty |
| Claude returns malformed JSON | Log + 200 `{ suggestions: [], reason: "parse_failed" }`; no retry on same content |
| Rate limit exceeded | 429 `{ reason: "rate_limit", resetAt }`; UI toast |
| Apply dispatch downstream fails | Suggestion stays `pending`; UI shows inline error with retry/reject |
| Owner-only check fails on apply | 403; UI hides buttons preemptively but server still enforces |
| Vote endpoint hit by non-trip-member | 403 |
| Auto-apply cron runs but suggestion already accepted/rejected | Idempotent — no-op |

## Testing

**Unit:**
- Prompt builder produces valid payload for fixture inputs
- JSON parser handles fenced and unfenced output
- Rate-limit boundaries (0/1/3/4 calls)
- Cache hit/miss matrix across `latestMessageId` + `latestVoteId`
- Vote threshold transitions: 1👍, 2👍/0👎, 2👍/1👎, 2👍/0👎+👎 in window
- Superseding logic when a new suggest call lands on a trip with pending rows

**Integration:**
- Full happy path with a test trip + seeded messages, mocking Claude with a fixture response
- Apply dispatch actually mutates `TripDraft.itinerary` for `activity_swap`
- Auto-apply countdown + cancel within the 60s window

**Manual / smoke:**
- End-to-end with a real trip on staging: chat → suggest → vote → alternative → owner accept → itinerary visibly changes
- Cost shadow check: monitor Anthropic dashboard for 24h after first cohort enabled

**Skipped:**
- UI snapshot tests for cards (small surface, churn-prone)
- Stress test of vote endpoint (low write volume expected)

## Migration / rollout

1. `prisma db push` adds `ItinerarySuggestion`, `SuggestionVote`, `ChatSuggestUsage`, `TripDraft.suggestionVoteMode`. Additive only; no data migration.
2. Ship API + UI behind a `NEXT_PUBLIC_ENABLE_CHAT_SUGGESTIONS` env flag. Internal dogfood first.
3. Cron job for cleaning `expired` rows (createdAt + 7 days) — reuse whatever cron infra `.agents/` uses, or skip for v1 and rely on on-read filtering.

## Open questions left for implementation

- Exact `payload` shape per `kind`. Will be pinned during plan-writing against the existing `/api/itinerary/replan` and `/optimize` body signatures.
- Whether `ChatSuggestUsage` is its own table or a JSON column on User. Lean toward its own table for query simplicity.
- Whether the chat panel button shows on the globe page (LocationClient) or only inside the trip-summary chat. Probably only inside trip context.
