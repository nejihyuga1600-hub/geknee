# Trip-Planning Playbook — Using GeKnee

A strategic guide for planning a trip end-to-end with GeKnee. Written for travelers planning their own trips, and for the team (and the AI) to share a mental model of what each surface is *for*.

The product thesis: **most travel apps optimize for booking; GeKnee optimizes for the decisions that happen *before* booking.** Where are we going? What's the vibe? Who's coming? What do we actually want to do once we're there? This playbook is the strategy for using GeKnee to answer those questions well, with a group, before you ever touch a payment form.

---

## 0. The five-stage flow

```
Inspiration  →  Shape  →  Schedule  →  Itinerary  →  Decide together  →  Book
   Globe         Style      Dates       Summary     Group chat + AI       Affiliate
                                                    + voting              links
```

Stage 0 (Inspiration) happens on the globe. Stage 4 (Decide together) is where the new chat-aware AI lives. Each stage has a job; doing the job poorly costs you twice the time at the next stage.

---

## 1. Stage 1 — Inspiration on the globe

**Where:** `/plan/location` (the 3D globe)
**Job:** *narrow the world down to one or two destinations you actually care about.*

**Strategy:**

- **Don't pick a destination first.** Spin the globe. Click pins. The globe is a forcing function for breadth — you'll find yourself hovering over places you'd never have typed into a search bar.
- **Use the AI chat (the floating Geknee.png button) for "I want to feel X" prompts.** "I want a slow trip with cold mornings and good bread" works better than "where should I go?". The chat will fly the globe to a candidate and you can decide on the visual.
- **Drop a photo into the chat for inspiration mode.** The AI identifies it (or the vibe) and suggests destinations with that exact feel. Useful when a friend shared an Instagram reel and you only have an image.
- **Treat the monument shop as a wishlist, not gamification fluff.** The monuments you've unlocked are the AI's reference for "places you've been or want to go" — affects later suggestions.

**Anti-patterns:**

- Typing the destination into the URL bar. Skips the whole point of the globe.
- Picking the *first* place the AI suggests. The globe is fast; explore three or four.
- Treating monuments as a separate game. They feed your taste profile.

**Exit criteria:** You have a destination string in your hand (a city or region) that you'd be willing to start planning. Click the pin → continue to Stage 2.

---

## 2. Stage 2 — Shape on the style page

**Where:** `/plan/style?location=...`
**Job:** *tell the AI what kind of trip this is, not what you want to do.*

The style page is a five-step preferences form. People want to skip it. **Don't.** Every answer here narrows the AI's day-by-day itinerary in Stage 4 by an order of magnitude. The difference between "chill couple's trip" and "active solo trip" is not adjective polish — it changes which restaurants show up, how packed the days are, whether the AI suggests guided tours, everything.

**Strategy:**

- **Answer honestly about pace.** "Slow" doesn't mean lazy; it means the AI will leave breathing room and not stack three museums in a day. People who pick "fast" because they want to "make the most of it" usually regret day 2.
- **Group size matters more than you think.** Six people don't fit in most restaurants without a booking. The AI factors this in.
- **Budget tier is a soft filter, not a wall.** "Mid-range" trips still see splurge experiences flagged as optional.
- **If you have allergies or dietary restrictions, set them on your account profile, not just here.** They're fed into every restaurant prompt going forward.

**Mini-tool: the flight-price chart.** The little chart on this page (`FlightPriceChart.tsx` calling `/api/flight-prices`) is for sanity-checking, not for booking. It pulls from Travelpayouts → SerpAPI → Amadeus → Claude estimate (4-tier fallback). A real booking happens via affiliate links later.

**Exit criteria:** Five preferences answered honestly. Continue.

---

## 3. Stage 3 — Schedule on the dates page

**Where:** `/plan/dates`
**Job:** *commit to a date range so the AI can plan against real days.*

**Strategy:**

- **Trip length is a multiplier on everything downstream.** A 4-day trip and a 10-day trip aren't the same plan stretched — they're different plans. Be honest about how long you can actually be away, not how long you wish.
- **Avoid the temptation of "open dates."** GeKnee can still generate, but day-by-day reasoning gets soft. Pick dates.
- **The price preview is seeded random.** It's directional, not real. Real prices come from the flight-prices API on the previous page.

**Exit criteria:** Start and end dates set. Move to Stage 4.

---

## 4. Stage 4 — Itinerary in the summary view

**Where:** `/plan/summary`
**Job:** *get a complete day-by-day plan you can actually run with.*

This is the page where the AI does its biggest single job — streaming a complete itinerary via `/api/itinerary` (claude-sonnet-4-6, rate-limited, language-aware). The output is markdown the rest of the app reads.

**Strategy:**

- **Read the first generation top-to-bottom before touching anything.** The temptation is to immediately ask the AI to change things. Resist for one read-through — the structure often makes sense once you see how the days flow together.
- **Use `/api/itinerary/replan` (the "regenerate this day" button) for big rewrites of a single day.** Use `/api/itinerary/optimize` (the "reorder stops" action) for "the morning stops are right, just shuffle them."
- **The Book tab is for inspiration, not booking.** The flight cards there are AI-generated (`/api/flights`) — directional only. Real booking goes through the affiliate links (`AffiliateLinks.tsx`) which deep-link to Google Flights / Hotels / Booking.com.
- **Save the trip early.** Saved trips (`/api/trips`) get their own URL you can share with travel mates. Sharing the URL is what unlocks Stage 5.

**Mini-tools you should actually use:**

- **DayMap** — visualizes one day's stops on a real Google Maps view. Catch logistical nightmares (two stops on opposite ends of town) before they happen.
- **Trip files** — pop boarding passes, hotel confirmations, and visa PDFs into the file vault. Signed Supabase URLs survive 7 days; refresh from the trip page if a link goes stale.
- **Weather per stop** — `/api/weather` gives you a forecast per city. If day 6 in Reykjavik is forecasted at -10°C, your "outdoor hike" suggestion needs a rewrite.

**Anti-patterns:**

- Asking the AI to "make it better" with no specifics. The AI is good at executing on a constraint, bad at guessing what dissatisfies you.
- Treating the markdown itinerary as a contract. It's a *strong default* the group can edit collaboratively in Stage 5.

**Exit criteria:** A saved trip with a shareable URL. Hand it to the group.

---

## 5. Stage 5 — Decide together (the new layer)

**Where:** Trip social panel + chat + AI suggestions section in the itinerary view
**Job:** *let the group push back on the plan and refine it without endless texting in iMessage.*

This is the stage most travel apps don't have. The group chat (`/api/trip-messages` → `TripMessage` model) is durable, persisted in Postgres, and — critically — readable by the AI on demand.

**The chat-aware AI loop** (see `docs/superpowers/specs/2026-05-18-chat-aware-itinerary-suggestions-design.md`):

1. Anyone in the chat taps **"✦ Suggest itinerary changes"** in the chat panel.
2. The AI reads the last 50 messages since the previous analysis, the current itinerary, and the trip's prior suggestion history (with votes and counter-proposals). Returns structured suggestion cards.
3. The whole group can **👍 / 👎** each suggestion and attach a free-text **alternative** ("or skip museums day 3, do crepes").
4. Two modes, owner's choice in trip settings:
   - **`advisory`** (default) — owner reads the votes and applies suggestions manually.
   - **`auto_majority`** — once ≥2 votes are in and >50% are 👍, a 60-second countdown starts; any 👎 in the window cancels; otherwise auto-applies.
5. Next round of suggestions, the AI sees how the group voted and what alternatives they wrote, and refines.

**Strategy for trip owners:**

- **Start in `advisory`.** Until you trust the group's voting cadence, keep the apply button in your hand. Switch to `auto_majority` for the last 48 hours before departure when speed matters more than scrutiny.
- **Treat AI suggestions as a conversation starter, not a directive.** The point isn't "the AI knows best"; it's that the AI surfaces what the group was already saying in chat and turns it into a clean Accept/Reject moment.
- **Counter-propose with alternative text, not separate chat messages.** Alternatives attached to a card travel with that card into the AI's next analysis. A free-form chat message might or might not be associated with the right suggestion.
- **Don't spam the suggest button.** It's rate-limited (3/day/trip free, 20/day/trip Pro) and cache-aware — re-clicking with no new chat or votes returns instantly without an AI call. But repeated clicks across the day burn through the limit and won't surface anything new until the chat moves.

**Strategy for group members:**

- **Vote on everything you have an opinion on.** Silent abstention reads as ambivalence to the AI, which means it'll keep proposing similar things.
- **Write an alternative when you 👎.** A 👎 without context tells the AI "no"; a 👎 with "or hike instead of museum" tells the AI what to try next.
- **The chat is where the AI gets its source material.** "We want a relaxed morning" in chat is more useful than the same thing said over WhatsApp where the AI can't see it.

**Anti-patterns:**

- Owners flipping to `auto_majority` early in planning. Defeats the point of owner taste.
- Group members spamming alternatives on every card. The AI weights all of them; a flood waters down the signal.
- Treating the suggestion panel as a chat. Use the chat for chat.

**Exit criteria:** Itinerary that everyone has actually weighed in on. No surprises on day 1.

---

## 6. Stage 6 — Book

**Where:** Book tab inside the trip summary
**Job:** *convert the planned trip into actual reservations.*

GeKnee does not transact. Affiliate links (`AffiliateLinks.tsx`) deep-link to Google Flights, Google Hotels, and Booking.com pre-filled with the trip's origin, destination, and dates. The affiliate revenue funds the AI calls used in stages 1–5.

**Strategy:**

- **Book flights first, hotels second, activities last.** Flight availability is the hardest constraint; everything else shapes around it.
- **The transport tab (`/api/transport`, claude-haiku-4-5) is for inter-city ground transport** — train vs. bus vs. car between stops. Useful for multi-city trips; ignore for single-city ones.
- **Save confirmations to the file vault.** Then they live with the trip, accessible by everyone in the group.

---

## 7. Strategic principles (the why)

A few principles the surfaces above all serve. Useful when deciding "should I do X or Y in GeKnee."

### Principle 1: Visual breadth before textual narrowness
The globe (visual) goes before the style page (textual). Humans choose destinations emotionally then justify them rationally. The product order honors that.

### Principle 2: Make the AI work from constraint, not from blank page
Every stage feeds the AI more constraint (destination → style → dates → group preferences → votes → alternatives). Each constraint is a hand of cards the AI plays. Skipping stages doesn't make the AI work harder for you — it makes it guess.

### Principle 3: Group decisions need structure, not just channels
Group chat is necessary but not sufficient. A 200-message thread doesn't produce a decision; a vote on a specific proposal does. Stage 5's voting is the structural piece most travel apps skip.

### Principle 4: The AI gets smarter with feedback, not with prompts
The conversation-across-rounds design (the AI reads prior votes and alternatives) is more valuable than a smarter one-shot prompt. The same Claude Haiku model produces better suggestions in round 3 than in round 1 because the input is richer.

### Principle 5: Mobile is for consuming the plan; desktop is for making it
The mobile UA redirect (`middleware.ts` → `/mobile`) exists because the 3D globe + 1.8 GB of Meshy landmark models is a desktop experience by design. Planning happens on a laptop; living the plan happens on a phone (and the mobile app, when it ships).

---

## 8. Quick reference — what to use, when

| You want to... | Use | Notes |
|---|---|---|
| Find a destination you didn't know you wanted | Globe + AI chat (Stage 1) | Photo input works |
| Tell the AI what kind of trip this is | Style page (Stage 2) | Don't skip |
| Get a complete day-by-day plan | Summary page → first generation (Stage 4) | Read it all before editing |
| Rewrite one day | `/api/itinerary/replan` via the regenerate-day button | Cheaper than full regen |
| Reorder a day's stops | `/api/itinerary/optimize` via the reorder action | Same idea, smaller scope |
| Get the group to weigh in | Share the saved-trip URL → chat → "Suggest changes" button (Stage 5) | New chat-aware AI |
| Propose an alternative on a suggestion | The "Alternative" button on the suggestion card | Travels with the card into the AI's next pass |
| Apply suggestions automatically | Trip settings → `auto_majority` voting mode | Use late in planning, not early |
| Book a flight | Book tab → affiliate link to Google Flights | GeKnee doesn't transact |
| Send feedback or report a bug | Settings → Send Feedback | `/api/feedback` persists to DB |

---

## 9. Appendix — Where this playbook fits in the docs

- `docs/PLAYBOOK_TRIP_PLANNING.md` — this file. User-facing strategic guide.
- `docs/superpowers/specs/2026-05-18-chat-aware-itinerary-suggestions-design.md` — implementation spec for Stage 5's AI feature.
- `docs/NAVAL_AUDIT_FLOWS.md` — product strategy / phasing (internal).
- `architecture-map.html` — interactive map of the whole system.
- `CLAUDE.md` — operating instructions for the AI coding agents working on GeKnee.

When you change the way a stage works, update this playbook — the strategic narrative is the contract with users *and* with the AI that suggests changes inside the product.
