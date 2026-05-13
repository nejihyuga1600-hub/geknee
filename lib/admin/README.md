# Mission Control · geknee admin dashboard

Single-page operator dashboard at **`/admin/dashboard`** plus a **7am email digest** sent every morning.

Gated to admin emails (default: `nghiaphan081301@gmail.com`). Override with the `ADMIN_EMAILS` env var (comma-separated).

## Surfaces

| Route                          | Purpose                                                      |
|--------------------------------|--------------------------------------------------------------|
| `/admin/dashboard`             | Live dashboard UI (auto-refresh every 5 min)                |
| `/api/admin/dashboard`         | JSON snapshot, admin-gated                                   |
| `/api/cron/dashboard-digest`   | Vercel cron — sends Resend email at 13:00 UTC daily          |

## Cards

- **Users** — Prisma `User` count, signups 24h/7d/30d, paid count, active 7d, sparkline
- **Revenue** — Stripe MRR/ARR, today/7d/30d gross, active subs, new vs canceled
- **Social Followers** — Instagram + TikTok totals
- **Social Views (7d)** — Instagram + TikTok
- **Ad Spend (today)** — Meta Ads + Google Ads + TikTok Ads, with active-campaign counts
- **Visitors (7d)** — PostHog: uniques, pageviews, signup conversion %, paid conversion %, top referrers
- **Product** — geknee internals: trips total/7d, itineraries 7d, agent token spend 7d, top destinations 7d

Each card surfaces one of three states: **RUNNING** (data) / **SETUP** (lists missing env vars) / **ERROR** (shows the upstream message). You can ship the dashboard now and wire each integration over time without breaking anything.

## Required env vars (per integration)

### Always-on (already exist in this project)
- `STRIPE_SECRET_KEY` — for revenue card
- `DATABASE_URL` — for users/product cards
- `CRON_SECRET` — Vercel cron auth

### New env vars to add for v1

#### Email digest (required for the 7am email)
```
RESEND_API_KEY=re_xxx                # https://resend.com/api-keys
DIGEST_FROM=geknee dashboard <dashboard@geknee.com>   # must be a verified Resend domain
DIGEST_TO_EMAIL=nghiaphan081301@gmail.com
```

#### Admin gating (optional override)
```
ADMIN_EMAILS=nghiaphan081301@gmail.com,coupbuilder@geknee.com
```

#### Instagram (followers + views)
```
IG_ACCESS_TOKEN=     # long-lived user token, scopes: instagram_basic, instagram_manage_insights
IG_USER_ID=          # IG Business account numeric id
```
Setup walkthrough: https://developers.facebook.com/docs/instagram-api/getting-started

#### TikTok (followers + views)
```
TIKTOK_ACCESS_TOKEN=
TIKTOK_OPEN_ID=
```
OAuth setup: https://developers.tiktok.com/doc/login-kit-web

#### Meta Ads (spend)
```
META_ADS_TOKEN=                # system-user or long-lived token, scope: ads_read
META_AD_ACCOUNT_ID=            # numeric ad account id (without "act_" prefix is fine)
```

#### Google Ads (spend)
```
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=        # 10 digits, no dashes
GOOGLE_ADS_LOGIN_CUSTOMER_ID=  # only if managed via MCC
```
Apply for a developer token via your Google Ads Manager account.

#### TikTok Ads (spend)
```
TIKTOK_ADS_ACCESS_TOKEN=
TIKTOK_ADVERTISER_ID=
```

#### PostHog (visitors + funnels)
```
POSTHOG_PROJECT_API_KEY=    # personal API key with query:read scope
POSTHOG_PROJECT_ID=394944   # your project's numeric id
POSTHOG_API_HOST=https://us.posthog.com   # default; set EU host if applicable
```

## Cron schedule

Schedule lives in `vercel.json` at `/api/cron/dashboard-digest`. Default is `0 13 * * *` which is **7:00 AM MDT** (Mountain Daylight Time, May–November). After DST ends in November the email arrives at 6:00 AM MST instead, since Vercel cron runs in UTC. Adjust the schedule to `0 14 * * *` if you'd rather lock to 7am MST year-round.

## Local testing

```bash
# Run dev server, sign in with admin email, then:
open http://localhost:3000/admin/dashboard

# Test the digest endpoint without sending email
curl http://localhost:3000/api/admin/dashboard | jq

# Test the email send (will actually email DIGEST_TO_EMAIL)
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/dashboard-digest
```

## Adding a new card

1. Create `lib/admin/providers/<name>.ts` returning `ProviderResult<T>`
2. Add `T` to `lib/admin/types.ts` and a slot in `DashboardSnapshot`
3. Wire into `lib/admin/aggregate.ts`
4. Add a `<KpiCard />` to `app/admin/dashboard/DashboardClient.tsx`
5. Add a card block to `lib/admin/digest-html.ts` so it shows up in the email too
