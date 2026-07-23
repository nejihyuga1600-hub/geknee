# GekneeShare — Xcode target setup

**Automated as of 2026-07-05.** The GekneeShare Share Extension target
has been added to `ios/App/App.xcodeproj` programmatically via
`bin/add-share-extension-target.rb` (Ruby xcodeproj gem). App Groups
capability enabled on both targets via `bin/enable-app-groups-capability.rb`.

Verified: xcodebuild builds the `GekneeShare.appex` target cleanly.

## What's already wired

- ✅ Share Extension target `GekneeShare` created
- ✅ Bundle ID: `com.geknee.app.share`
- ✅ Sources: `ShareViewController.swift`
- ✅ Info.plist + entitlements linked via build settings
- ✅ Extension embedded in main App bundle (Copy Files phase → PlugIns)
- ✅ Build dependency: App depends on GekneeShare
- ✅ App Groups capability enabled on both targets (SystemCapabilities)
- ✅ `SharedGroupPlugin.swift` added to main App target sources
- ✅ App.entitlements + GekneeShare.entitlements list `group.com.geknee.shared`

## What YOU still need to do (once, one time)

### 1. Register App IDs in Apple Developer portal

Auto-provisioning needs Apple to know about the App Group + the new
extension bundle ID. Fastest path — just open Xcode once:

- `open /Users/geknee/geknee/ios/App/App.xcworkspace`
- Select the **App** target → **Signing & Capabilities**
- Xcode may prompt to register `com.geknee.app.share` — click through.
- Both targets should show a green checkmark next to "Automatically manage signing".

If the App Group row shows `⚠ group.com.geknee.shared` with a red x:
- Click the small refresh icon next to your team, or
- Log in to https://developer.apple.com → **Identifiers**:
  - Verify `com.geknee.app` has App Groups capability + `group.com.geknee.shared` selected
  - Add App ID `com.geknee.app.share` with App Groups capability + the same group
  - Xcode → **Settings** → **Accounts** → **Download Manual Profiles**

### 2. Sync + build

```bash
npm run build
npx cap sync ios
```

Then in Xcode: **App** scheme → your iPhone (or Simulator) → Run.

## Verification

1. Sign in to geknee on the device once — `NativeShareBridge` mirrors
   the session cookie into shared UserDefaults.
2. Kill Instagram/TikTok, reopen, tap Share on a reel/video.
3. Scroll the app-icon row on the share sheet → **geknee** appears.
4. Tap it → the mini picker slides up ("Add {venue} to which trip?") →
   pick a trip → **Add to itinerary**.
5. Open geknee → the trip's itinerary shows the shared location.

## Troubleshooting

| Symptom | Fix |
|---|---|
| geknee doesn't appear in share sheet | Restart iPhone once — iOS caches the extension list. |
| "Sign in to geknee first" error | Open geknee on the device, sign in, background it, retry share. |
| API 401 in extension | Session cookie expired. Sign out + in inside geknee. |
| App Group ⚠ in Xcode | Re-download provisioning profiles (Settings → Accounts). |

## Rebuild the target from scratch

If the target ever gets nuked, re-run the scripts:

```bash
bin/xcodeproj-run.sh bin/add-share-extension-target.rb
bin/xcodeproj-run.sh bin/enable-app-groups-capability.rb
```

Both are idempotent — safe to run against a project that already has
the target.

## What's next (Phase 2)

- Video thumbnail scan (Vision framework OCR on first frame)
- Photo support with EXIF GPS
- Deep-link back to main app for a fuller "Review + confirm" flow
- Android share intent (separate target, different mechanism)
