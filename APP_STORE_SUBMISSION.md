# App Store submission — geknee 1.0

Everything you need to hand Apple, derived from the shipped code (build 16, commit `8bd698c`). Copy-paste the sections marked **[ASC]** into App Store Connect.

---

## 🚨 Read this first — one submission blocker

**Paywall + IAP (Guideline 3.1.1).** `app/api/stripe/checkout/route.ts` sells a `pro` subscription that unlocks in-app AI features (`itineraryGenerations`, monument skins). Apple requires **In-App Purchase** for any recurring subscription that unlocks digital features consumed inside the app. Stripe is only allowed for physical goods/services (hotel bookings via Duffel/Hotelbeds would qualify — the pro plan does not).

**Three ways to unblock, safest first:**

| Option | Effort | Risk |
|---|---|---|
| **Hide the pro paywall on Capacitor** — `Capacitor.isNativePlatform()` gates it off; iOS ships as free-tier only for 1.0 | 30 min | Lowest — Apple only sees free features. Add IAP in 1.1. |
| **Wire RevenueCat + StoreKit** for the pro plan | 1–2 days | Right long-term answer. Requires new SKUs in ASC. |
| **Argue it's a "Reader" app** under 3.1.3(a) | 1 hr write-up | High — the AI generation feature makes this thin. Likely rejected. |

Recommend option 1 for the 1.0 submission. Document the plan for RevenueCat in the review notes.

---

## [ASC] App Information

| Field | Value |
|---|---|
| **Name** | geknee |
| **Subtitle** (30 char) | Plan trips on a living globe |
| **Primary Category** | Travel |
| **Secondary Category** | Lifestyle |
| **Content Rights** | Does not contain third-party content (unless you're shipping any user-uploaded photos publicly — then Yes) |
| **Age Rating** | 4+ (see questionnaire below) |
| **Support URL** | `https://www.geknee.com/support` ✅ shipped in `app/support/page.tsx` |
| **Marketing URL** | `https://www.geknee.com` |
| **Privacy Policy URL** | `https://www.geknee.com/privacy` ✅ exists at `app/privacy/page.tsx` |
| **Copyright** | © 2026 Geknee |

---

## [ASC] App Privacy — data collection

Answer these in ASC → App Privacy. Every "Yes" needs a data type + purpose + tracking flag.

### Data types you collect

| Category | Type | Linked to identity | Used to track | Purpose |
|---|---|---|---|---|
| **Contact Info** | Email address | Yes | No | App Functionality, Account |
| **Contact Info** | Name | Yes | No | App Functionality (display name / username) |
| **User Content** | Photos (if user attaches) | Yes | No | App Functionality (trip vault) |
| **User Content** | Other — trip notes, itineraries, saved places | Yes | No | App Functionality |
| **Identifiers** | User ID | Yes | No | App Functionality, Analytics |
| **Identifiers** | Device ID (PostHog `distinct_id`) | No (anon until login) | No | Analytics, Product Personalization |
| **Location** | Precise Location | Yes | No | App Functionality (nearby monuments, geofence alerts) |
| **Location** | Coarse Location | Yes | No | App Functionality |
| **Usage Data** | Product Interaction (PostHog `capture()` events) | Yes | No | Analytics, Product Personalization |
| **Diagnostics** | Crash Data (Sentry) | Yes | No | App Functionality |
| **Diagnostics** | Performance Data (Sentry) | Yes | No | App Functionality |
| **Purchases** | Purchase History (Stripe) | Yes | No | App Functionality |

### Data NOT collected — confirm with "No" for these

- Health & Fitness · Financial Info (card handled by Stripe — you never touch PAN) · Sensitive Info · Contacts · Browsing History · Search History · Audio Data · Gameplay Content · Customer Support (email only, standard) · Advertising Data

### "Do you use data to track users?" → **No**

- No IDFA usage
- No cross-app/website tracking
- No data shared with data brokers
- PostHog `session_recording` is **disabled on Capacitor** (`lib/analytics.ts:102`) ✅

---

## [ASC] Version 1.0 metadata

### Promotional text (170 char, updatable without review)
> Turn any trip idea into a plan you can hold. Save places from anywhere, generate day-by-day itineraries, and collect landmarks as 3D souvenirs.

### Description (draft — 4000 char max)
```
Geknee turns trip planning into something you actually look forward to.

Spin a living 3D globe, save landmarks with a tap, and let AI build a day-by-day itinerary that respects your pace, your budget, and the way you actually travel.

FEATURES
• Living globe — every landmark on Earth, rendered in 3D
• AI itinerary — describe your trip, get a plan
• Save from anywhere — share any link, photo, or note into geknee
• Nearby alerts — quiet notifications when you pass a place you saved
• Monument collectibles — earn a 3D souvenir for every place you visit
• Trip vault — one place for photos, notes, bookings, and receipts
• Works offline — your saved trips stay with you when the signal doesn't
• Share with friends — invite travel companions to co-plan

WHY GEKNEE
Most travel apps are booking funnels. Geknee is for the planning half you actually enjoy: the daydreaming, the "what if we…", the shortlist that becomes a trip.

Free forever for the core planning tools. Optional Pro tier unlocks unlimited AI generations, exclusive monument skins, and priority support.

Privacy: we never sell your data, never use ad IDs, and mask every input in analytics by default. See geknee.com/privacy.
```

### Keywords (100 char, comma-separated, no spaces)
```
travel,trip,itinerary,planner,ai,globe,map,places,landmarks,vacation,journey,bucket list,3d,explore
```

### What's New in this version (v1.0)
> Welcome to geknee. First release.

---

## [ASC] App Review Information (this is what gets you approved fast)

### Contact Info
- **First name**: Nghia
- **Last name**: Phan
- **Phone**: `+1 [your number]` — fill in an inbox you check within 24 hr
- **Email**: `nghiaphan081301@gmail.com`

### Sign-in required
- **Yes.**

### Demo account
- **Username**: `apple-review@geknee.com`
- **Password**: (generate a fresh one, put it here)
- ⚠️ **Create this account before submitting.** Reviewer will lock you out if it doesn't exist. Ideally seed it with 1 saved trip and 2 collected monuments so the reviewer can see the experience without generating anything.

### Notes (paste this whole block into the Review Notes field)
```
Thank you for reviewing geknee.

WHAT THE APP DOES
Geknee is a travel planning app. Users spin a 3D globe, save landmarks
they'd like to visit, and generate AI-powered itineraries. Optional
geofence notifications alert them when they're physically near a place
they've saved.

HOW TO REVIEW
1. Sign in with the demo account above (or with Sign in with Apple).
2. The globe loads with 3 pre-saved landmarks on the demo account.
3. Tap any landmark → view details, weather, add to a trip.
4. Tap the + button → "New Trip" → type "Weekend in Rome" → AI
   generates a 3-day itinerary in ~10 seconds.
5. Share Extension: from Safari, tap Share → geknee → save the URL
   to a trip. (Also works from Photos, TikTok, Instagram, Google Maps
   — anything with a system Share sheet.)
6. Monument collection: the demo account exposes a "Cheat mode:
   Colosseum" toggle in Settings → Developer that fakes a GPS ping
   at the Colosseum coordinates so you can unlock a monument without
   traveling. The toggle is disabled for real users and only exists
   for review purposes.

PERMISSIONS EXPLAINED

• Location When In Use — used to sort landmarks by distance and place
  the user on the globe. Requested when they open the map.

• Location Always — used ONLY to trigger local notifications when the
  user passes near a place they've explicitly saved with alerts enabled.
  We do not send location data to our servers in the background. The
  geofence runs entirely on-device via CLLocationManager region
  monitoring. Users can disable per-pin alerts or revoke the permission
  entirely; the app degrades gracefully.

• Camera + Photo Library — used only when the user attaches a photo to
  a trip. Not accessed otherwise.

• Push Notifications — used for geofence alerts, trip reminders, and
  friend invites. Opt-in.

• Background Modes (location, remote-notification, fetch) — needed for
  the geofence and to sync trip changes made on the web when the app
  wakes.

PAYMENTS
geknee 1.0 ships as free-tier only. A Pro subscription exists on the
web (Stripe) but is intentionally hidden inside the iOS app for this
release. We are integrating StoreKit + RevenueCat for a follow-up
release; there is no way for an iOS user to purchase anything in 1.0.

SIGN IN WITH APPLE
Available on the login screen alongside Google, Microsoft, and email.

SUPPORT
support@geknee.com — replies within 24 hours.

Thank you.
```

---

## [ASC] Version release
- **Manual release** after approval (recommended for 1.0 — lets you coordinate marketing).

---

## Pre-submission checklist

Do these before clicking Submit for Review:

- [ ] **Hide paywall on Capacitor.** `if (Capacitor.isNativePlatform()) return null` on the pro upgrade UI. Rebuild + upload as build 17.
- [ ] **Create the `apple-review@geknee.com` account** and seed 1 trip + 2 monuments.
- [ ] **Verify Sign in with Apple** actually completes on the shipped build. This is Apple's #1 4.8 rejection reason.
- [ ] **Test on a real device** via TestFlight — install build 16, walk through the reviewer flow above.
- [ ] **Capture screenshots** at 6.9" (1320×2868) on the device or via simulator. Min 3, up to 10. Use the screenshot generator (see below).
- [ ] **Confirm privacy policy at `/privacy` reflects what you declared** in ASC. Discrepancy = Guideline 5.1.1 rejection.
- [ ] **1024×1024 app icon** — opaque, no rounded corners, sRGB. `public/brand/geknee-app-icon-v1.png` looks like it should work; verify it's actually 1024×1024 with `sips -g pixelWidth -g pixelHeight`.
- [ ] **Fill in ASC → App Privacy** exactly per the table above.
- [ ] **Fill in ASC → Age Rating** as 4+ (no objectionable content, no unrestricted web access — you use in-app browser via Capacitor).

---

## Typical Apple rejection reasons for apps like geknee — and how you're covered

| Guideline | Risk | Mitigation |
|---|---|---|
| **2.1 Performance / Crashes** | AI generation timeout or globe WebGL crash | Sentry live, watchdog for globe stall (`LocationClient.tsx`), tested on iPhone 17 Pro |
| **2.3.10 Beta features** | Anything looking half-shipped | `handoff.md` and dev tooling in `.agents/` never ship to the bundle |
| **3.1.1 IAP** | 🔴 See top of doc | Hide paywall on Capacitor for 1.0 |
| **4.8 SIWA required** | Any 3rd-party sign-in without SIWA | ✅ Apple provider registered in `auth.ts` |
| **5.1.1 Data collection consistency** | Privacy policy ≠ ASC declaration | Cross-check /privacy against the table above |
| **5.1.5 Location** | Always-authorization without justification | Review notes explain on-device geofence |
| **5.2.3 Content** | Third-party landmark photos, Wikipedia excerpts | Attribute in Info screens, or use own imagery |

---

## After submission

- **Median review time:** 24–48 hr. Can be faster.
- **If rejected:** the resolution center message will cite a specific guideline. Reply in the resolution center — don't submit a new build unless they ask for one. Most rejections resolve in one back-and-forth.
- **If approved but held for release:** click "Release This Version" when you're ready (only if you chose Manual release).

---

## What geknee is NOT declaring (double-check these are true)

- No IDFA / ATT prompt — confirmed, no ad SDKs
- No third-party analytics identifiers linked to advertising
- No purchases inside the iOS app (for 1.0 with paywall hidden)
- No user-generated content shown publicly to other users (trips are private / shared with invited friends only)
- No gambling / adult / regulated content
- No HealthKit / HomeKit / CarPlay / Wallet
