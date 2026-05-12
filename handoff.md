# geknee — session handoff (2026-05-12)

## Goal we're working toward

Replace generic Unicode emojis (🚶 🚕 🏛 🌍 ✨ 🔓 🏆 etc.) across the
geknee web app with a single coherent **custom icon set** built in
`lib/icons.tsx`. Two render layers:

1. **Bare line glyph** — inline UI chrome, nav labels, tight rows
2. **`<IconBadge icon={X} tier="gold">`** — hex shards with tier-tinted
   ring + cosmic glow for "trophy moments" (monument unlocks, quest
   claims, leaderboard ranks, achievement toasts)

Design language: cosmic-editorial, trading-card / collectible-shard
feel, adult traveler audience (20s-40s). Tiers map directly to the
existing monument skin ladder (bronze/silver/gold/diamond/aurora/celestial)
so badge color and skin color speak the same vocabulary.

## Current state of the code

**Live and committed:**

- `lib/icons.tsx` — 23 named SVG glyph components + `<IconBadge>` wrapper
  + `TIER_TINT` map + `ICON_REGISTRY` (for future scripts that iterate
  over the set). v2 styling now in: stroke 2.0, accent fills, burst
  rays on Trophy/Unlock/Monument/Sparkle.
- `public/brand/geknee-icons.svg` + `.png` — flat contact sheet (v1)
- `public/brand/geknee-icons-badges.svg` + `.png` — hex-shard contact
  sheet
- `public/brand/geknee-icons-v2.svg` + `.png` — approved v2 mockup
  (rendered with tier fills + bursts + monument pennant flag)

**Replacements done across the site:** zero, deliberately. v2 styling
just landed in `lib/icons.tsx` (this commit). The user approved v2 in
the mockup — they want to **see it live in real surfaces** next.

## Files you're actively editing

- `lib/icons.tsx` — v2 styling now lives in: Trophy + Unlock + Monument
  + Sparkle have burst details / accent fills. Stroke bumped 1.8 → 2.0.
- `public/brand/geknee-icons*.{svg,png}` — contact sheets, four files

## What's been tried that needs care

- **Transit emojis in itinerary AI generation are load-bearing.** The
  `🚶 🚇 🚌 🚕 🚂 🚴 ⛵ ✈️` tokens are baked into the
  `/api/itinerary` SYSTEM prompt and parsed by
  `app/plan/summary/components/ActivityBlock.tsx` (`TRANSIT_EMOJI` regex
  on line ~140) to choose between walking / cycling / driving routing
  on the day map. **Do NOT swap these to SVGs in the AI prompt without
  also rewriting the parser.** Plan: change the prompt to emit text
  tokens like `[walk]` / `[subway]`, update the parser to recognise
  them, then render via `<Walk />` in ActivityBlock's rendered output.
  Substantial coordinated change — needs its own focused commit so
  in-flight itineraries don't break mid-trip.

- **Tried** scripted find-and-replace across the codebase for high-
  frequency emojis. **Failed** because most usages are inside template
  strings the AI generates, not static UI strings. The static-string
  usages worth swapping are concentrated in:
  - `app/components/MonumentShop.tsx` — 🏛 fallback emoji, 📷 in
    "Claim" buttons (`ms.verify === 'photo'`), 🔓 lock/unlock states
  - `app/plan/[tripId]/(tabs)/itinerary/PhotoToItinerary.tsx` — already
    uses SVG paperclip, but the `✦` literals could become `<Sparkle/>`
  - `app/wrapped/WrappedClient.tsx` — `✦` opportunities
  - `app/components/SettingsPanel.tsx` — Wrap link uses `✦` literal
  - `app/plan/[tripId]/(tabs)/NextStepHint.tsx` — `✦ NEXT` label

## The next step you'd take

1. **MonumentShop.tsx swap** (highest leverage — the user's main
   trophy-moment surface). Replace:
   - The 🏛 fallback emoji in `DetailView` glyph with `<Monument />`
   - The 📷 in `Claim` button with `<Camera size={12} />`
   - The 🔓 / 🔒 lock states with `<Unlock />` / `<Lock />`
   - The monument card "Collected" checkmark → `<IconBadge icon={Unlock}
     tier={skinTier}>` for the unlock moment animation in
     `UnlockCeremony.tsx`

2. **Sparkle ✦ literal hunt** — grep for `'✦'` and replace inline
   `<span>✦</span>` with `<Sparkle size={10} />`. ~10 sites, ~20 lines.
   Cheap visual win.

3. **Itinerary token swap** (carefully). Two-commit sequence:
   - Commit A: update `/api/itinerary` SYSTEM prompt to emit
     `[walk]` / `[subway]` / `[bus]` / `[taxi]` / `[train]` / `[bike]` /
     `[ferry]` / `[flight]` tokens. Update the `TRANSIT_EMOJI` regex
     in `ActivityBlock.tsx` to recognise BOTH (old emoji + new tokens)
     so existing itineraries keep working.
   - Commit B: switch the rendered output in `ActivityBlock` to use
     `<Walk />` / `<Subway />` etc. based on the parsed token.

4. **Wrapped recap** — the year-in-review cards use 🏆 / 🌍 / ✦. Swap
   with `<IconBadge icon={Trophy} tier="celestial">` for the rarest-find
   card; bare glyphs elsewhere.

## Open questions / known gotchas

- IconBadge uses inline SVG with `fill: 'currentColor'` on accent
  paths — when wrapped in a tier-tinted parent the fills inherit from
  CSS context. If a consumer overrides `color` mid-tree the fills will
  drift; pass an explicit tier prop and let TIER_TINT drive the look.
- Stroke 2.0 looks slightly chunky at 14px. If we want a "small inline"
  variant, add a `weight: 1.6 | 2.0` prop to base() in `lib/icons.tsx`.
- Two SVG contact sheets in `public/brand/` — keep them in sync if you
  add new icons (or write a `bin/render-icon-sheet.mjs` that generates
  from `ICON_REGISTRY`).

## Commits this session, latest first

- `???????` (this one) — v2 styling live in lib/icons.tsx + handoff.md
- `1e704e7` — IconBadge wrapper + hex contact sheet
- `521708d` — initial icon set v1 + flat contact sheet
- earlier in session: photo attach polish, quest revamp, recs caching,
  Google Places destination-bias fix, booking suggestions cache +
  Haiku swap, NextStepHint cohesion chips

## Pickup script for next session

```
cd /Users/geknee/geknee
git pull
# Open the v2 mockup + the live icons file side-by-side
code public/brand/geknee-icons-v2.png lib/icons.tsx
# Start with the MonumentShop swap (most user-visible win):
code app/components/MonumentShop.tsx
```

Quote the user's last directive verbatim when picking back up:
> "make it live and continue the handoff"

What landed in this commit: v2 styling is live in `lib/icons.tsx` —
the visual rules from the approved mockup are now the canonical
glyphs. Next session: actual swap-in across MonumentShop + Wrapped
+ ✦ literals as ordered above.
