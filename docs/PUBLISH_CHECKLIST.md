# geknee — App Store + Play Store publish checklist

Manual steps. No `fastlane/` or `.github/workflows/` exist; everything below is run from your laptop.

The Capacitor shell loads `https://www.geknee.com` over the network (see `capacitor.config.ts`), so app-side updates only ship when web behavior changes that affect the shell — which is rare. Most of your iteration is `git push origin main` → Vercel deploy → both apps pick up the new web on next launch.

You ship a new native build when:
- a Capacitor plugin is added/removed or its native config changes
- `appName`, `appId`, splash, or icon assets change
- a permissions string is added (camera, geolocation, push, etc.)
- a marketing-version bump is requested by App Store / Play Store policy
- bug fixes in the WebView shell (Capacitor core, navigation allowlist, etc.)

---

## Prerequisites (one time)

### Apple
- Apple ID enrolled in the Apple Developer Program ($99/yr)
- App Store Connect record exists for **com.geknee.app** with: name, subtitle, description, keywords, support URL, privacy policy URL, age rating, screenshots (6.5", 5.5", iPad 12.9" if supporting tablet)
- Xcode (latest, currently 15.4+) signed in to the Apple Developer team
- Distribution provisioning profile + Distribution certificate present in Keychain
- Push notification entitlement enabled if app uses push (it does — `app/api/push/`)

### Google
- Google Play Console developer account ($25 one-time)
- Play Console app record exists for **com.geknee.app** with: title, short description, full description, screenshots (phone + tablet if supported), feature graphic 1024×500, app icon 512×512, privacy policy URL, content rating questionnaire complete
- Android Studio (latest) installed
- Upload signing key generated and registered with Play Console (Play App Signing handles the production key)
- Service account JSON if you want to script future uploads via `gradle-play-publisher` (deferred — manual upload for now)

---

## Pre-flight (every release)

1. `git pull origin main`
2. `npm install`
3. Sanity check `next build` succeeds locally and the web is shippable.
4. **Bump versions** if this is not a hot-fix shell rebuild:
   - iOS: open `ios/App/App.xcodeproj` in Xcode → select **App** target → General tab → bump **Version** (marketing) and **Build** (uniquely incremented per upload, even for the same Version).
   - Android: edit `android/app/build.gradle` → `versionCode` (integer, must increase) and `versionName` (semver).
5. Update `release-notes.md` (or write notes ad hoc in the store console — neither is enforced today).

---

## iOS — TestFlight / App Store

1. `npx cap sync ios` — copies the latest Capacitor JS/config into the iOS project.
2. `npx cap open ios` — opens the workspace in Xcode.
3. In Xcode:
   - Top bar device selector → **Any iOS Device (arm64)**.
   - Menu **Product → Archive** (5-10 min on M-series Mac).
4. When the Organizer opens with the new archive:
   - **Validate App** → fix any errors (signing, missing icons, missing privacy strings).
   - **Distribute App** → **App Store Connect** → **Upload** → defaults are usually fine.
5. Wait for the email "App Store Connect processed your build" (5-30 min). If it fails, the email lists what failed (almost always entitlement/signing/privacy-string drift from Apple's latest review rules).
6. In App Store Connect web:
   - **TestFlight** tab → add the new build to your internal testing group → it goes live to internal testers in ~minutes.
   - For external testers (any account not on the dev team): submit for Beta App Review. Apple usually approves in <24h for non-major changes.
   - For App Store release: **Distribution** tab → **Add Build** → fill out **What's New** → submit for review (1-3 days typical).

### Common iOS reject reasons
- Missing `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSPhotoLibraryUsageDescription` strings in `ios/App/App/Info.plist` for any Capacitor plugin that needs the permission, even if the plugin will only ever be called conditionally.
- Sign in with Apple required if you offer any other third-party sign-in (you have Google + NextAuth → Apple is mandatory).
- "Web wrapper" rejection: if reviewer finds the app is "just a website," cite native-bridge use (push notifications, deep links via the `capacitor://` scheme, geolocation prompts) in the review notes box.
- Privacy nutrition labels in App Store Connect must match what the app actually collects (PostHog session replay → "Analytics", auth user data → "Account Information").

---

## Android — Play Console Internal Testing / Production

1. `npx cap sync android`
2. `npx cap open android` — opens Android Studio.
3. In Android Studio:
   - Menu **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.
   - Pick the upload keystore (you registered the cert fingerprint with Play Console at first publish).
   - Build variant: **release**.
   - Click Finish → builds in ~3 min → finder window opens to the `.aab` file.
4. In Play Console:
   - Pick the app → **Testing → Internal testing** → **Create new release**.
   - Upload the `.aab` → Play Console runs automated checks (~minutes).
   - Add release notes per locale (English-US minimum).
   - **Review release** → **Start rollout to Internal testing**.
5. For production: **Production** track → same flow → **Start rollout to Production**. Pick a rollout percentage (start at 20% if you're nervous, 100% if confident).

### Common Android reject reasons
- Target SDK below current Google requirement (currently API 34 / Android 14 as of 2026; bumps each August). Capacitor's default Android target tracks this — check `android/variables.gradle` if you see this rejection.
- Missing privacy policy URL in **App content → Privacy Policy**.
- **Data safety** form mismatches actual data collection (same gotcha as Apple's nutrition labels).
- Permissions declared in `AndroidManifest.xml` that aren't justified in the **Permissions declaration** form.

---

## After ship

- TestFlight builds expire 90 days after upload. Set a calendar reminder if you rely on internal testing for QA.
- Play Console "Internal app sharing" links expire 60 days after upload — useful for quick share-to-tester without publishing through the testing track.
- Both stores show crash reports separately from Sentry — check both, since Apple's TestFlight crashes catch native-side issues Sentry's JS errors miss.
- The native shells load `https://www.geknee.com` — any Vercel deploy ships to both apps without re-uploading. Only re-upload when one of the "you ship a new native build when" bullets at the top applies.

---

## Future automation (not yet in repo)

- `fastlane/` for `fastlane ios beta` (Xcode archive + TestFlight upload) and `fastlane android internal` (gradle bundle + Play upload).
- `.github/workflows/ios-release.yml` running on `release` tag push with macos-latest runner.
- `gradle-play-publisher` for direct Play upload from CI.
- iOS over-the-air update via Capacitor Live Updates if we want to ship JS-only shell changes without store review.

Adding any of these requires storing signing keys + a service-account JSON in repo secrets, which we haven't done yet.
