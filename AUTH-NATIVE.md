# Native Auth Runbook

How OAuth works inside the Capacitor (iOS / Android) shell, and what to set up
for each provider before sign-in works on the native app.

## Why this is different from desktop

Google, Apple, and Microsoft all reject OAuth from embedded WebViews
(`Error 403: disallowed_useragent` or equivalent). The native app routes the
OAuth dance through `SFSafariViewController` (iOS) / Custom Tabs (Android),
then deep-links the session back into the WKWebView via `geknee://auth?t=<jwt>`.

End-to-end flow:

```
WKWebView                                SFSafariViewController
  │ Browser.open(/auth/native-start/<provider>)
  ├──────────────────────────────────────►│
  │                                       │ NextAuth signIn() → 302 to provider
  │                                       │ user signs in
  │                                       │ provider → /api/auth/callback/<p>
  │                                       │ NextAuth sets session cookie
  │                                       │ → /auth/native-handoff
  │                                       │ mints HS256 JWT (60s, jti, iss, aud)
  │                                       │ → geknee://auth?t=<jwt>
  │  appUrlOpen ◄─────────────────────────┤
  │  Browser.close()                      │
  │  → /auth/mobile-cb?t=<jwt>            │
  │  signIn('native-handoff', { token })  │
  │  session in WKWebView jar             │
  │  → /                                  ▼
```

Code split:
- `lib/handoff-token.ts` — JWT mint/verify with in-memory replay LRU
- `lib/native-auth-bridge.ts` — Capacitor App.appUrlOpen listener
- `app/auth/native-start/[provider]/route.ts` — server-side signIn() trigger
- `app/auth/native-handoff/page.tsx` — token mint + deep-link emit
- `app/auth/mobile-cb/page.tsx` — token verification + WKWebView session
- `auth.ts` — `native-handoff` Credentials provider

URL scheme `geknee://` registered in `ios/App/App/Info.plist` (CFBundleURLTypes)
and `android/app/src/main/AndroidManifest.xml` (intent-filter on MainActivity).

---

## Google

**Status:** Working in production. Client in **Testing** mode — only emails
in the Test Users list can sign in.

### Vercel env (Production + Preview)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Google Cloud Console — Authorized redirect URIs
- `https://www.geknee.com/api/auth/callback/google` (prod, required)
- `http://localhost:3000/api/auth/callback/google` (dev)
- Each Vercel preview URL when needed for testing:
  `https://geknee-travel-ai-git-<branch>-nejihyuga1600-hubs-projects.vercel.app/api/auth/callback/google`

### Test Users (while in Testing mode)
- Console: https://console.cloud.google.com/auth/audience
- Add up to 100 emails. Required because the OAuth client requests
  `gmail.readonly` (sensitive scope). Production verification will let
  any Google user sign in but takes weeks.

### Pre-App-Store-launch
- Submit OAuth client for **Production verification** at
  https://console.cloud.google.com/auth/branding (~weeks for sensitive scopes)
- Without this, only test users can sign in via Google → blocks all real users

---

## Apple

**Status:** Not configured. Hidden in the AuthModal until env vars are set.

### Vercel env (Production)
- `APPLE_CLIENT_ID` — the Services ID identifier (e.g. `com.geknee.signin`)
- `APPLE_CLIENT_SECRET` — JWT minted from your `.p8` Auth Key (regenerate every 6 months)
- `NEXT_PUBLIC_APPLE_AUTH_ENABLED=true` — surfaces the button in AuthModal

### Apple Developer Console steps

#### 1. App ID (one-time)
- https://developer.apple.com/account/resources/identifiers/list
- Click **+** → **App IDs** → **App** → Continue
- Description: `geknee`
- Bundle ID: **Explicit** → `com.geknee.app`
- Capabilities: ☑ **Sign In with Apple** (just check the box)
- Continue → Register

#### 2. Services ID
- Click **+** again → **Services IDs** → Continue
- Description: `geknee Sign In with Apple`
- Identifier: `com.geknee.signin` (this becomes `APPLE_CLIENT_ID`)
- Continue → Register
- Click the new Services ID → ☑ **Sign In with Apple** → **Configure**
- Primary App ID: `com.geknee.app` (the App ID from step 1)
- Domains: `www.geknee.com`
- Return URLs: `https://www.geknee.com/api/auth/callback/apple`
- Save

#### 3. Domain verification
- Apple gives you `apple-developer-domain-association.txt`
- Place it at `public/.well-known/apple-developer-domain-association.txt`
  (already gitignored exception scaffolded — file path is reserved for this)
- Deploy
- Back in Apple console, click **Verify** next to the domain entry

#### 4. Auth Key (for the Client Secret)
- Go to **Keys** → **+**
- Name: `geknee Sign In with Apple`
- ☑ **Sign In with Apple** → **Configure** → pick `com.geknee.app` Primary App ID
- Save → Continue → Register → **Download** the `.p8` (one-time download!)
- Note the **Key ID** (10 chars) and your **Team ID** (top-right of dev portal)

#### 5. Generate APPLE_CLIENT_SECRET (the JWT)
The client secret is a JWT signed with the `.p8` key. Use NextAuth's helper:
```ts
// Run once locally with: npx tsx scripts/mint-apple-secret.ts
import { SignJWT, importPKCS8 } from 'jose';
import * as fs from 'fs';

const TEAM_ID = 'YOUR_TEAM_ID';      // From Apple Dev console
const KEY_ID  = 'YOUR_KEY_ID';        // .p8 filename / Apple console
const CLIENT_ID = 'com.geknee.signin'; // your Services ID

const key = await importPKCS8(
  fs.readFileSync('./AuthKey_YOUR_KEY_ID.p8', 'utf8'),
  'ES256'
);
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
  .setIssuer(TEAM_ID)
  .setIssuedAt()
  .setExpirationTime('180d')  // Apple max — regenerate every 6 months
  .setAudience('https://appleid.apple.com')
  .setSubject(CLIENT_ID)
  .sign(key);
console.log(jwt);  // → APPLE_CLIENT_SECRET on Vercel
```

Apple secrets expire — set a calendar reminder for 5 months out to regenerate.

---

## Microsoft (Entra ID)

**Status:** Not configured. Hidden in the AuthModal until env vars are set.

### Vercel env (Production)
- `MICROSOFT_CLIENT_ID` (or `AUTH_MICROSOFT_ENTRA_ID_ID`)
- `MICROSOFT_CLIENT_SECRET` (or `AUTH_MICROSOFT_ENTRA_ID_SECRET`)
- `NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED=true` — surfaces the button in AuthModal

### Microsoft Entra Console steps

#### 1. App registration
- https://entra.microsoft.com/ → **Identity** → **Applications** → **App registrations**
- Click **+ New registration**
- Name: `geknee`
- Supported account types: **Personal Microsoft accounts** (or "all" if you want
  work + school accounts; matches `tenant: 'common'` in `auth.ts`)
- Redirect URI: **Web** → `https://www.geknee.com/api/auth/callback/microsoft-entra-id`
- Register

#### 2. Note the IDs
- From the **Overview** page:
  - **Application (client) ID** → `MICROSOFT_CLIENT_ID`

#### 3. Client secret
- Left nav: **Certificates & secrets** → **Client secrets** → **+ New client secret**
- Description: `prod`
- Expires: 24 months
- Add → **copy the Value column** (not Secret ID) → `MICROSOFT_CLIENT_SECRET`
- Like Apple, set a calendar reminder before expiration

#### 4. API permissions (for email-vault scope)
- Left nav: **API permissions** → **+ Add a permission** → **Microsoft Graph** → **Delegated**
- Add: `openid`, `profile`, `email`, `offline_access`, `Mail.Read`
- Click **Grant admin consent** if you want personal accounts to skip
  the per-user consent prompt

---

## Stripe

**Status:** Working in production for desktop. In-app behavior validated by
config (`allowNavigation` covers `*.stripe.com`, `checkout.stripe.com`,
`pay.stripe.com`). End-to-end test on iOS Simulator pending — gated on
having a signed-in test user + accepting risk of real charge.

### Recommended for safer iteration
- Use Stripe **test mode** keys for preview/staging deploys:
  - `STRIPE_SECRET_KEY=sk_test_...` (Vercel Preview env only)
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`
- Test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (decline)
- Production env stays on `sk_live_...` — no risk of real charges from preview

---

## Pinch-zoom on simulator

**Status:** Cannot automate via `idb`. Needs:
- **XcodeBuildMCP** (preferred — multi-touch synthesis via XCUITest, requires
  full Claude Code app quit + reopen to load the MCP server)
- OR a custom XCUITest target in the iOS project (significant native iOS work)
- OR manual: hold OPT in macOS Simulator window + click-drag

The `idb ui swipe` command only synthesizes one-finger gestures.
