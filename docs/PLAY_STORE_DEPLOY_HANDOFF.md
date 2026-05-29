# Play Store deploy — session handoff (2026-05-29)

State: **signed AAB is built and ready to upload**. The remaining work is in the Play Console web UI, which cannot be automated from this repo without a service-account JSON (deliberately not configured yet).

---

## The artifact

```
Path:     android/app/build/outputs/bundle/release/app-release.aab
Size:     7.7 MB
SHA-256:  36fc4d155a892e942127001bbd73595625ba446a8a19e86f298e605e5cbde43f
Built:    2026-05-28 15:57 (local)
```

Manifest values from this build:

| Key | Value |
|---|---|
| `applicationId` | `com.geknee.app` |
| `versionCode` | `1` |
| `versionName` | `1.0` |
| `minSdkVersion` | (resolved from `rootProject.ext.minSdkVersion`) |
| `targetSdkVersion` | (resolved from `rootProject.ext.targetSdkVersion`) |

Signing (verified with `jarsigner -verify`):

| Key | Value |
|---|---|
| Keystore | `~/keystores/geknee-upload.jks` (gitignored, outside repo) |
| Password file | `~/keystores/geknee-upload.password.txt` |
| Cert expiry | **2053-10-13** |
| `jarsigner` status | `jar verified.` |
| PKIX warning | Expected (self-signed upload cert; Play Console validates by registered fingerprint) |

`local.properties` (gitignored) at `android/local.properties` already has the four `signing.*` keys. Don't commit it.

---

## What was done this session

1. `npx cap sync android` — pulled the latest `capacitor.config.ts` (Play-Store-safe `webContentsDebuggingEnabled = false`) into the Android project.
2. `JAVA_HOME=Android Studio JBR; ./gradlew bundleRelease` — produced the signed AAB.
3. `jarsigner -verify app-release.aab` — confirmed signature is valid.

No code commits were made in this session — the prior session (`566172c` + `89b1da8`) had already shipped the capacitor + signing prep. The build steps above are reproducible from main.

---

## Why the upload is manual

Play Console accepts uploads via:
- Web UI (no auth artifacts on disk)
- Play Developer API + service-account JSON
- `gradle-play-publisher` plugin (which uses the API key)

We deliberately did not set up the API path yet — it requires storing a Google service-account JSON, registering it in Play Console, and writing the upload workflow. Tracked as a future-automation bullet in `docs/PUBLISH_CHECKLIST.md`.

Until that's done, every Play upload happens via the web UI.

---

## Resume here — Internal testing upload

1. Open https://play.google.com/console → pick **geknee** (`com.geknee.app`).
2. Left nav → **Testing → Internal testing** → **Create new release**.
3. Drag-drop `android/app/build/outputs/bundle/release/app-release.aab`. Play scans it (~1-2 min) and parses the manifest.
4. **Release name**: auto-fills to `1 (1.0)`. Fine.
5. **Release notes** (English-US is mandatory):
   > First Play internal-testing build. Capacitor 8 shell wrapping https://www.geknee.com. Release-build hygiene applied (debugging off, signed with upload key).
6. **Next** → review → **Save** → **Review release** → **Start rollout to Internal testing**.
7. Internal-testers list (left nav under Internal testing → **Testers**): you, plus any Google account you whitelist. Play emails them the opt-in link; build is on their device 5-15 min later.

### If Play rejects the upload

The most likely causes for a first-time AAB upload, in descending probability:

- **Signing-cert mismatch** — if you registered a *different* upload key at first-app creation, this AAB will be rejected with "Your Android App Bundle is signed with the wrong key." Fix: either rotate the upload key in Play Console (Setup → App integrity), or re-sign with the registered keystore.
- **`targetSdkVersion` too low** — Play requires API 34 (Android 14) for new uploads as of 2026. Check `android/variables.gradle`. Bump if needed, rebuild.
- **64-bit native library missing** — Capacitor's defaults include both `arm64-v8a` and `armeabi-v7a`. Should be fine, but the error message is explicit if it isn't.
- **Permissions not declared in Play form** — push, location, camera all need explanations in the **Permissions declaration** form under App content. Required before upload accepted on Production track; usually a warning on Internal.

---

## Before promoting Internal → Production

These Play Console sections must be filled out — Play blocks Production rollout without them:

| Section | What to set | Source |
|---|---|---|
| **Privacy policy** | URL to a hosted policy | Use the same URL configured in App Store Connect |
| **Data safety form** | Declared collection types | PostHog session replay → "Analytics"; NextAuth user data → "Account Information"; geolocation prompts → "Location → Approximate or Precise"; Stripe → "Financial info → Payment info" |
| **Content rating** | Questionnaire | Defaults are fine — travel app, no UGC moderation surface today |
| **App access** | Test login credentials | Reviewers must reach inside the login wall; create a throwaway account and put credentials in the form |
| **Target audience** | Age groups served | 18+ (travel + payments) |
| **Government apps** | Declare no | Standard |
| **News apps** | Declare no | Standard |
| **COVID-19 contact tracing** | Declare no | Standard |

Once filled, **Production** track → **Create new release** → same flow as Internal → recommend **20% staged rollout** initially. Play lets you halt or accelerate from the Production dashboard.

Production review takes 1-7 days for the first-ever submission; subsequent updates are usually <24h.

---

## Versioning rules for the next build

If you upload this AAB and Play accepts it (even if you later remove it from a testing track), **versionCode 1 is consumed permanently** for `com.geknee.app`. The next build must use `versionCode 2`.

Edit `android/app/build.gradle`:

```gradle
defaultConfig {
    versionCode 2
    versionName "1.0.1"
}
```

`versionName` is for users to read; `versionCode` is for Play to compare. Always bump both, but `versionCode` is the one Play enforces.

---

## When to ship a new native build vs. relying on the Capacitor live URL

The Capacitor shell loads `https://www.geknee.com` over the network. Most web changes flow through Vercel and are picked up by both apps on next launch with no Play upload.

You **must** ship a new native build only when:

- A Capacitor plugin is added or removed (`@capacitor/*` package.json changes)
- `capacitor.config.ts` changes the appId, app name, splash, icon, or navigation allowlist
- A new permission string is added (camera, geolocation, push, etc.) — these require both manifest entries AND Play's permission-declaration form
- Native shell bug fixes (Capacitor core, WebView config)
- Marketing-version bump requested by Play policy (rare — usually announced ~6mo in advance)

For everything else, `git push origin main` → Vercel deploy → both apps pick up the new web.

---

## After this Play upload succeeds — checklist

- Add the Play Console upload date and release notes to `docs/PLAY_STORE_DEPLOY_HANDOFF.md` history table at the bottom of this file.
- Bump `versionCode` to 2 in `android/app/build.gradle` for the next build.
- Tag the commit: `git tag android-v1.0 && git push origin android-v1.0` (so the deployed artifact is traceable to a specific code state).
- Add a Sentry release annotation matching `android-v1.0` so post-launch crash reports group cleanly.
- Verify install via the internal-testing opt-in link on a physical Android device. Smoke-test: globe loads, login works, push permission prompt fires, geolocation prompt fires when expected.

---

## History

| Date | versionCode / versionName | Track | Notes |
|---|---|---|---|
| 2026-05-28 | 1 / 1.0 | (built, not yet uploaded) | First signed AAB. Awaiting Play Console upload. |
