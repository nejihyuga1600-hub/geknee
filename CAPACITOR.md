# Capacitor — iOS + Android shells for geknee

This directory wraps the live web app at `https://geknee.com` in a native
shell so it can ship to the App Store and Google Play.

## Status

- ✅ **Phase 1**: Capacitor scaffolded, plugins installed, config written.
- ⏳ **Phase 2**: Add native platforms (`ios/` + `android/`), wire native
  plugins (camera proof-of-presence, push notifications, share).
- ⏳ **Phase 3**: Store accounts, listings, screenshots, privacy policy.
- ⏳ **Phase 4**: TestFlight + Play Internal Testing builds.
- ⏳ **Phase 5**: Submit, review, launch.

## What's installed

```text
@capacitor/core              8.3.x   - bridge runtime
@capacitor/cli               8.3.x   - npx cap commands
@capacitor/ios               8.3.x   - iOS native runner
@capacitor/android           8.3.x   - Android native runner
@capacitor/app               - app lifecycle events (resume, deep links)
@capacitor/camera            - native camera + EXIF (monument check-in moat)
@capacitor/geolocation       - native GPS (location verification)
@capacitor/push-notifications- APNs / FCM token registration
@capacitor/share             - native share sheet (trip share links)
@capacitor/status-bar        - status bar styling
@capacitor/splash-screen     - launch screen
```

`capacitor.config.ts` points the WebView at `https://geknee.com` so the
native app picks up every Vercel deploy automatically. No static export
needed.

## What you (the human) need to install before Phase 2

### iOS toolchain

```sh
# Full Xcode (the App Store version, not just command line tools)
# Install from the Mac App Store. ~7GB download.

# After installing, point xcode-select at it:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# Cocoapods (manages iOS native deps Capacitor pulls in):
brew install cocoapods
# OR: sudo gem install cocoapods
```

### Android toolchain

```sh
# Android Studio bundles the JDK and Android SDK:
brew install --cask android-studio

# After install, open Android Studio once and accept license prompts so it
# downloads the SDK platform-tools and an emulator system image.

# Then add to your shell rc (~/.zshrc):
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

Verify with:

```sh
which pod && pod --version
xcode-select -p
java -version    # should report a JDK from Android Studio
echo $ANDROID_HOME
```

## Phase 2 commands (run after the toolchain is installed)

```sh
# From the repo root:
npx cap add ios          # creates ios/App/ Xcode project
npx cap add android      # creates android/ Gradle project

# Open the native projects:
npx cap open ios         # launches Xcode
npx cap open android     # launches Android Studio

# Push web/config changes into the native projects:
npx cap sync             # run after editing capacitor.config.ts or installing new plugins
```

In Xcode: pick a simulator (e.g. iPhone 16) → Product → Run. The simulator
boots, the WebView loads `https://geknee.com`, and you have the geknee web
app running inside the iOS shell.

In Android Studio: Tools → Device Manager → create an emulator → Run. Same
outcome on Android.

## Detecting native context from web code

The web codebase can detect when it's running inside the native shell and
selectively enable native-only features:

```ts
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) {
  // mount native camera button instead of file <input type="file">
}
if (Capacitor.getPlatform() === 'ios') { ... }
```

This lets us keep one codebase that runs as a regular website AND inside the
native wrappers.

## App Store gotchas to plan for

1. **Apple Guideline 3.1.1 — In-App Purchase.** Monument unlocks via Stripe
   will be rejected on iOS unless they go through Apple IAP (30% cut).
   Travel bookings (hotels/flights) are fine via Stripe — physical goods.
   Pick a strategy in Phase 1 of submission planning.

2. **Apple Guideline 4.2 — Minimum Functionality.** Pure web wrappers get
   rejected. The native plugins above (camera with EXIF metadata for
   "phone proves you were there", native push, GPS-verified check-ins)
   give Apple enough native value-add to clear this bar.

3. **Privacy nutrition labels.** Required on both stores. Inventory the
   data you collect (location, photos via camera, contacts if any). Geknee
   already has Sentry + PostHog (analytics) — both must be disclosed.

4. **Privacy policy + terms URLs.** Required by Apple before submission.
   Host at `geknee.com/privacy` and `/terms`.

## Files in this scaffold

- `capacitor.config.ts` — central config; loads geknee.com, allows Stripe
  / OAuth navigation, configures splash and status bar
- `capacitor-shell/index.html` — fallback first-paint shell (shown only
  while the WebView is connecting to geknee.com)
- `CAPACITOR.md` — this file
