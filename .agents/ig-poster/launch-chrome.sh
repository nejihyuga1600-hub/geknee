#!/usr/bin/env bash
# Launch macOS Chrome with the remote-debugging port enabled.
# IMPORTANT: quit your normal Chrome BEFORE running this — Chrome can't run two
# instances on the same profile.
#
# After launching, sign into instagram.com in this Chrome window (or it'll
# already be signed in if you use your default profile).
#
# To run the poster script, leave this Chrome open and in another terminal:
#   cd ~/geknee/.agents/ig-poster
#   uv run python post.py --image /abs/path.jpg --caption "..."

set -euo pipefail

PORT="${PORT:-9222}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# IMPORTANT: must be a dedicated dir, NOT the user's default Chrome profile.
# Recent Chrome versions silently disable --remote-debugging-port when the flag
# is used against the default profile (anti-credential-theft policy). Using a
# dedicated dir restores CDP support — but the user must log into IG once in
# this Chrome window. The session persists in cookies for future runs.
PROFILE_DIR="${PROFILE_DIR:-$HOME/.gekneetravel-chrome-data}"

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at: $CHROME"
  echo "Install Chrome or edit this script's CHROME path."
  exit 1
fi

# Bail out if something is already on the port.
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Port $PORT is already in use. If it's a previous Chrome you launched,"
  echo "you can attach to it directly — no need to relaunch."
  exit 0
fi

# Make sure the user's main Chrome isn't running on this profile.
if pgrep -fl "Google Chrome.app" >/dev/null; then
  echo "A 'Google Chrome' process is already running."
  echo "Quit Chrome first (Cmd+Q), then re-run this script."
  exit 1
fi

echo "[launch-chrome] Launching Chrome with DevTools on http://localhost:$PORT"
echo "[launch-chrome] Using profile: $PROFILE_DIR"
"$CHROME" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE_DIR" \
  "https://www.instagram.com/" \
  >/tmp/chrome-cdp.log 2>&1 &

echo "[launch-chrome] Chrome PID $! — logs at /tmp/chrome-cdp.log"
echo "[launch-chrome] Wait a few seconds, then verify:"
echo "   curl -s http://localhost:$PORT/json/version | head -20"
