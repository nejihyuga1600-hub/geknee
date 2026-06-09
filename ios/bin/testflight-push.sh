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
  TEAM_ID=$(grep -m1 "DEVELOPMENT_TEAM = " "$PROJECT/project.pbxproj" | head -n1 | awk -F'"' '{print $2}' || true)
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
echo "▶ Archiving (this can take 2-4 min)…"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  archive | tail -20

# ──── 6. Export signed .ipa ─────────────────────────────────────────────────
echo "▶ Exporting signed .ipa…"
rm -rf "$EXPORT_DIR"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_DIR" | tail -10

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
