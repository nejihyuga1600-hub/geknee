# App Store Privacy Nutrition Labels — geknee

Fill these in at App Store Connect → your app → App Privacy → Manage Data Types.

Apple's framing is: for each Data Type, declare (1) **whether you collect it**, (2) **how it's linked to the user**, (3) **whether it's used for tracking across other companies' apps/sites**, and (4) **the purposes** (Analytics, App Functionality, etc.).

geknee does **NOT** track users across other companies' apps/sites — all "Used to Track" answers below are **No**.

---

## Contact Info

| Data Type | Collected? | Linked to User? | Used to Track? | Purposes |
|---|---|---|---|---|
| Email Address | ✅ Yes | Yes | No | App Functionality, Analytics |
| Name | ✅ Yes | Yes | No | App Functionality, Analytics |

**Source:** `prisma/schema.prisma` User.email (unique, required), User.name (optional). Set during sign-up (Credentials + Google + Apple).

---

## User Content

| Data Type | Collected? | Linked to User? | Used to Track? | Purposes |
|---|---|---|---|---|
| Photos or Videos | ❌ No | — | — | — |
| Other User Content | ✅ Yes | Yes | No | App Functionality |

**Note:** `@capacitor/camera` is installed (hence `NSCameraUsageDescription` in Info.plist) but no call sites in the codebase use it yet — leave Photos/Videos as **Not Collected**. If you add capture later, re-declare.

**Other User Content** = trip drafts, itineraries, monument collections, vault uploads (`TripDraft`, `TripFile`, `TripExpense`, `TripMember` Prisma models).

---

## Identifiers

| Data Type | Collected? | Linked to User? | Used to Track? | Purposes |
|---|---|---|---|---|
| User ID | ✅ Yes | Yes | No | App Functionality, Analytics |
| Device ID | ✅ Yes | Yes | No | App Functionality |

**Source:**
- User ID = `User.id` (cuid) propagated to PostHog `identify()` and Sentry `setUser()`.
- Device ID = APNS push token (`app/components/PushPermissionPrompt.tsx:69` posts `token.value` to `/api/push/register`).

---

## Usage Data

| Data Type | Collected? | Linked to User? | Used to Track? | Purposes |
|---|---|---|---|---|
| Product Interaction | ✅ Yes | Yes | No | Analytics |
| Other Usage Data | ✅ Yes | Yes | No | Analytics |

**Source:**
- PostHog `capture_pageview: true` + explicit events (`lib/analytics.ts`)
- Vercel Analytics + Speed Insights (`app/layout.tsx`)
- `User.itineraryGenerations` counter (Prisma)

---

## Diagnostics

| Data Type | Collected? | Linked to User? | Used to Track? | Purposes |
|---|---|---|---|---|
| Crash Data | ✅ Yes | Yes | No | App Functionality, Analytics |
| Performance Data | ✅ Yes | Yes | No | App Functionality, Analytics |
| Other Diagnostic Data | ✅ Yes | Yes | No | App Functionality, Analytics |

**Source:** Sentry (`lib/sentry.ts`, used across `app/api/*` and `LocationClient.tsx`). User scoped via `setUser` so issues group per-account.

---

## Purchases

| Data Type | Collected? | Linked to User? | Used to Track? | Purposes |
|---|---|---|---|---|
| Purchase History | ✅ Yes | Yes | No | App Functionality |

**Source:** Stripe (`app/api/stripe/checkout/route.ts`, `User.stripeCustomerId`, `User.stripeSubscriptionId`, `User.plan`, `User.planExpiresAt`).

---

## Location

| Data Type | Collected? | Linked to User? | Used to Track? | Purposes |
|---|---|---|---|---|
| Precise Location | ✅ Yes | Yes | No | App Functionality |

**Source:** `navigator.geolocation.getCurrentPosition` in `app/plan/dates/page.tsx`, `app/plan/style/page.tsx`, and `BookView.tsx` (`captureUserHomeFromGeolocation`). Used to set the user's home airport for trip planning. **Only on user action**, not background.

**Note:** Declare **Precise** (not Coarse) because `getCurrentPosition` returns full GPS coordinates. No background location → no `NSLocationAlwaysAndWhenInUseUsageDescription` user-facing use (the Info.plist key exists only because the Capacitor SDK references the API — not because we call it).

---

## Sensitive Info, Health & Fitness, Browsing History, Search History, Financial Info, Other Data

All **Not Collected** unless you add features that change this. Specifically:
- **Financial Info** = Not Collected (Stripe handles card data; we never touch PAN).
- **Other Data — Email Vault contents** = If you turn on Gmail/Outlook polling (`User.lastGmailSyncAt`, `User.lastOutlookSyncAt`), declare **Other User Content → User Content** for the parsed booking confirmations. As of today the worker is implemented but inactive by default.

---

## Privacy Policy URL

**Required.** Apple checks it loads. Use `https://www.geknee.com/privacy` (the page exists per `next build` output: `/privacy` is prerendered static).

---

## Data Use Disclosure on the App Store

Once you submit these, Apple shows them publicly on your listing as the "App Privacy" section. Users see them before installing. Mismatches between declared and actual behavior are Apple's #1 metadata reject — keep this file updated whenever a new SDK or data-collection feature ships.
