# App Store Copy — geknee 1.0

Paste each field into App Store Connect → your app → 1.0 Prepare for Submission → English (U.S.).

Character limits are Apple-enforced. Counts in parentheses below are current.

---

## App Name (30 chars max)

```
geknee
```
*(6 chars)*

## Subtitle (30 chars max)

```
go there. prove it.
```
*(19 chars — matches the brand)*

Alternates if you want to A/B test later (you can change subtitle per release):
- `Travel-proof your bucket list.` *(30 chars)*
- `Collect 60 real-world wonders.` *(30 chars)*
- `Real trips. Real proofs. No loot.` *(33 — too long, drop the period)*

## Promotional Text (170 chars max — updatable without re-review)

```
60 monuments. 7 rarity tiers. Your phone verifies you were actually there — no couch unlocks, no loot boxes. Plan trips, collect wonders, share proof.
```
*(149 chars)*

## Description (4000 chars max — full marketing copy)

```
geknee turns the world's wonders into something you actually have to visit.

60 monuments. 7 rarity tiers. Your phone checks you're actually there.

THE BUCKET LIST THAT KNOWS THE DIFFERENCE
Most travel apps let you pin a place from your couch. geknee doesn't. To unlock a monument — Eiffel Tower, Petra, Machu Picchu, Iguazu Falls, the rest — you have to be standing near it. GPS verification, no shortcuts. The bronze tier comes free with the visit. Higher rarities (silver, gold, diamond, aurora, celestial, damascus) require coming back, going deeper, or doing the kind of travel that turns a checklist into a story.

PLAN A REAL TRIP, NOT A WISH LIST
- Spin a 3D globe of every wired wonder. Tap one. See where it is, who's been, what the route looks like.
- Build itineraries that match your style — solo dropout, weekend escape, slow culture month, family fly-in.
- Routes via Google Maps. Flights, transit, drive times built in.
- Live weather, street view, time zones — everything you need to leave tomorrow.

COLLECT WHAT YOU'VE ACTUALLY DONE
Every visit becomes a monument in your vault. Each one carries the date you went, the photos you took, who you went with. Share a trip recap link and friends see exactly the same proof. Nothing gameable, nothing exaggerated.

WHY 7 TIERS
Bronze for the visit. Silver for coming back with a friend. Gold for the off-season. Diamond for the unloved sub-monument no tour group bothers with. Aurora, celestial, damascus — the kinds of trips that take a year to plan and ten to tell. Rarity earned, not bought.

PRO ($)
- Unlimited AI-built itineraries
- Trip vault for receipts, boarding passes, room photos
- Live trip mode with offline maps + group expense split
- All future monuments first

PRIVACY THAT'S ACTUALLY PRIVATE
Your location is only checked when you tap to verify a monument. It never runs in the background. We never sell your data. Read the full policy at https://www.geknee.com/privacy.

WHO THIS IS FOR
Travellers who think the best souvenir is the trip itself. Bucket-list keepers who want the list to mean something. Anyone tired of an algorithm telling them where they should have gone.

geknee. go there. prove it.

---

Support: support@geknee.com
Web: https://www.geknee.com
```
*(~2,150 chars — well under the 4,000 cap. Trim if you want; the description-truncation point is roughly the first 3 lines on most devices, so the opening is the working part.)*

## Keywords (100 chars total, comma-separated, no spaces around commas)

```
travel,bucket list,itinerary planner,landmarks,trip planner,wonders,passport stamps,travel game,GPS
```
*(99 chars — at the limit)*

**Notes on keyword strategy:**
- Don't repeat words from the app name or description — Apple already indexes those.
- "travel" + "bucket list" are the two highest-intent searches for this category.
- "passport stamps" hits the gamified-real-world-collection mental model.
- "trip planner" / "itinerary planner" are the practical-use search terms.
- "wonders" / "landmarks" / "GPS" cover the unique-mechanic angle.

## Support URL (required)

```
https://www.geknee.com/support
```

**Action item:** Make sure `/support` exists and renders. If it doesn't, use `https://www.geknee.com/` as a fallback for v1, then add a real support page in v1.0.1.

## Marketing URL (optional, recommended)

```
https://www.geknee.com
```

## Privacy Policy URL (required)

```
https://www.geknee.com/privacy
```

Confirmed exists per the `next build` output (route `/privacy` is static).

## Copyright

```
© 2026 geknee
```

## Age Rating

Run the App Store Connect questionnaire. Expected answers based on the codebase:
- **Cartoon or Fantasy Violence:** None
- **Realistic Violence:** None
- **Sexual Content or Nudity:** None
- **Profanity or Crude Humor:** None
- **Alcohol, Tobacco, or Drug Use:** None
- **Mature/Suggestive Themes:** None
- **Horror/Fear Themes:** None
- **Gambling and Contests:** None
- **Medical/Treatment Information:** None
- **Unrestricted Web Access:** **Yes** (the app embeds www.geknee.com — Apple may bump rating because of this)
- **User-Generated Content:** **Yes** (trip notes, vault uploads — pick "May contain mature content" → No)

Expected final rating: **4+** unless Unrestricted Web Access bumps it to 17+. If 17+, add a basic in-app filter or content moderation explanation in review notes.

## Primary Category

`Travel`

## Secondary Category

`Lifestyle` (or `Games` if you want to lean into the rarity-collection mechanic — Travel is the safer call for an unknown brand)

## What's New (for version 1.0)

```
Welcome to geknee.

— 60 monuments wired into the 3D globe
— GPS-verified collection — no couch unlocks
— 7 rarity tiers, bronze through damascus
— Trip planner with Google Maps routes, weather, street view
— Sign in with Google, Apple, or email
```

---

## Submit Checklist

Before clicking **Submit for Review**, confirm:

- [ ] All fields above filled (paste from this doc)
- [ ] Screenshots uploaded for 6.5" iPhone, 5.5" iPhone, **and** iPad 12.9" (see `bin/snap-appstore.mjs`)
- [ ] App Privacy nutrition labels filled (see `docs/APP_STORE_PRIVACY.md`)
- [ ] Build 1.0 (2) selected — NOT build 1
- [ ] Review Notes (bottom of submission form):
  ```
  Native bridges in use: push notifications (@capacitor/push-notifications),
  geolocation (@capacitor/geolocation), camera (@capacitor/camera, installed for v1.1),
  deep links via the geknee:// URL scheme. The globe is real-time 3D WebGL —
  not a static site wrapper. Test account if needed: testflight@geknee.com /
  asks-for-prod-creds (configure before submitting).
  ```
- [ ] Privacy Policy URL loads at https://www.geknee.com/privacy
- [ ] Support URL loads (or fall back to https://www.geknee.com/)
