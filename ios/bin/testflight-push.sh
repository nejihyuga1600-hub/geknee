#!/usr/bin/env bash
# One-shot TestFlight push.
#
#   ./ios/bin/testflight-push.sh
#
# Requires the one-time setup in ios/TESTFLIGHT_SETUP.md:
#   - Apple Developer Program membership
#   - App Store Connect API key (.p8) on disk
#   - App record created at com.geknee.app
#   - Distribution provisioning profile in Keychain
#   - APP_STORE_CONNECT_API_KEY_ID / _ISSUER_ID / _PATH exported
#
# The script bumps the build number, archives, exports a signed .ipa,
# and uploads to App Store Connect. Apple processes it (~5 min) and
# pushes a TestFlight notification to your internal testers.

set -euo pipefail

# ──── 1. Sanity checks ──────────────────────────────────────────────────────
require_env() {
  local name=$1
  if [ -z "${!name:-}" ]; then
    echo "❌ Missing env var: $name"
    echo "   See ios/TESTFLIGHT_SETUP.md → 'Tell the script where the API key lives'"
    exit 1
  fi
}
require_env APP_STORE_CONNECT_API_KEY_ID
require_env APP_STORE_CONNECT_API_KEY_ISSUER_ID
require_env APP_STORE_CONNECT_API_KEY_PATH

if [ ! -f "$APP_STORE_CONNECT_API_KEY_PATH" ]; then
  echo "❌ API key file not found at: $APP_STORE_CONNECT_API_KEY_PATH"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IOS_DIR="$REPO_ROOT/ios/App"
PROJECT="$IOS_DIR/App.xcodeproj"
SCHEME="App"
ARCHIVE_DIR="/tmp/geknee-archive"
ARCHIVE_PATH="$ARCHIVE_DIR/App.xcarchive"
EXPORT_DIR="$ARCHIVE_DIR/export"
EXPORT_OPTIONS="$IOS_DIR/ExportOptions.plist"

mkdir -p "$ARCHIVE_DIR"

# ──── 2. Cap sync — copy current web shell + plugin list into iOS ───────────
echo "▶ npx cap sync ios"
cd "$REPO_ROOT"
npx cap sync ios

# ──── 3. Bump build number ──────────────────────────────────────────────────
INFO_PLIST="$IOS_DIR/App/Info.plist"
CURRENT_BUILD=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$INFO_PLIST")
NEW_BUILD=$((CURRENT_BUILD + 1))
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $NEW_BUILD" "$INFO_PLIST"
echo "▶ Build number bumped: $CURRENT_BUILD → $NEW_BUILD"

# ──── 4. Write ExportOptions.plist (per-run, since method/team can change) ──
TEAM_ID=$(/usr/libexec/PlistBuddy -c "Print :DEVELOPMENT_TEAM" "$INFO_PLIST" 2>/dev/null || echo "")
if [ -z "$TEAM_ID" ]; then
  echo "ℹ Reading team id from project.pbxproj…"
  # pbxproj stores it as `DEVELOPMENT_TEAM = 42PQV5L5PT;` (no quotes). Older
  # form used quotes; handle both by extracting whatever follows the '=' up to
  # the trailing semicolon, then stripping whitespace and any quotes.
  TEAM_ID=$(grep -m1 "DEVELOPMENT_TEAM = " "$PROJECT/project.pbxproj" \
    | head -n1 \
    | sed -E 's/.*DEVELOPMENT_TEAM = "?([^";]+)"?;.*/\1/' \
    | tr -d '[:space:]' || true)
fi
if [ -z "$TEAM_ID" ]; then
  echo "❌ Could not determine Apple Team ID. Open the project in Xcode once, set Signing → Team."
  exit 1
fi

cat > "$EXPORT_OPTIONS" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>teamID</key>
  <string>$TEAM_ID</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
  <key>compileBitcode</key>
  <false/>
</dict>
</plist>
EOF

# ──── 5. Archive ────────────────────────────────────────────────────────────
# `-allowProvisioningUpdates` lets xcodebuild register new bundle IDs (like
# com.geknee.app.share) and regenerate profiles when entitlements change (App
# Groups, Sign in with Apple, push). Without it xcodebuild refuses to touch
# provisioning and archive fails on any capability drift.
#
# The `-authenticationKey*` flags let xcodebuild call App Store Connect to
# perform those updates when a browser session isn't logged in.
echo "▶ Archiving (this can take 2-4 min)…"
# Note: we intentionally do NOT pass -authenticationKey* here. The App Store
# Connect API key `TKDRMU78L2` was minted with role "App Manager", which can
# upload builds via altool but cannot modify identifiers/profiles. Passing
# the key makes xcodebuild use ONLY that key for auth and fail. Without the
# flags xcodebuild falls back to the Keychain-cached Apple ID session (the
# same one that made Xcode's Signing panel go green). altool still gets the
# key later for the upload step, where App-Manager scope is sufficient.
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  archive | tail -30

# ──── 6. Export signed .ipa ─────────────────────────────────────────────────
echo "▶ Exporting signed .ipa…"
rm -rf "$EXPORT_DIR"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates | tail -10

IPA_PATH=$(find "$EXPORT_DIR" -name "*.ipa" | head -1)
if [ -z "$IPA_PATH" ]; then
  echo "❌ No .ipa produced under $EXPORT_DIR"
  exit 1
fi
echo "▶ Built: $IPA_PATH"

# ──── 7. Upload to App Store Connect ───────────────────────────────────────
echo "▶ Uploading to App Store Connect…"
xcrun altool \
  --upload-app \
  -f "$IPA_PATH" \
  --type ios \
  --apiKey "$APP_STORE_CONNECT_API_KEY_ID" \
  --apiIssuer "$APP_STORE_CONNECT_API_KEY_ISSUER_ID"

echo ""
echo "✅ Upload submitted."
echo "   Apple processes the build (~5 min). When it goes 'Ready to Test'"
echo "   you (and any internal testers) get a TestFlight push."
echo ""
echo "   App Store Connect: https://appstoreconnect.apple.com/apps"
