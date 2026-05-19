// lib/suggestions/prompt.ts
// Pure function that turns trip context + chat + prior-round votes into a
// Claude prompt. Pure so it's trivially smoke-testable.
//
// The user prompt is structured so the trip metadata + itinerary form a
// stable prefix; the API route splits on '\nRECENT CHAT' and wraps the
// prefix in an Anthropic prompt-cache block.

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
  messages: ChatMsg[];       // up to 25, oldest first
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
- Do NOT repeat any prior suggestion that the group rejected or \u{1F44E}'d majority.
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
      parts.push(`- [${day} · ${h.kind} · ${h.status}] "${h.summary}"  votes: ${h.votesUpCount}\u{1F44D}/${h.votesDownCount}\u{1F44E}`);
      for (const a of h.alternatives) {
        parts.push(`    alt @${a.author}: "${a.text}"`);
      }
    }
  }

  return parts.join('\n');
}
