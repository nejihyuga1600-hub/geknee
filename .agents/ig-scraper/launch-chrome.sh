#!/usr/bin/env bash
# Launch a SECOND Chrome instance for ig-scraper.
#
# This Chrome:
#   - Listens on port 9223 (not 9222 — that's ig-poster's brand Chrome).
#   - Uses ~/.gkscrape-chrome-data (dedicated profile, NOT default Chrome).
#   - Should be signed into your PERSONAL Instagram account, NOT @gekneetravel.
#
# Why a separate account: visiting competitor profiles from the brand account
# leaks signals (profile-views show in their business insights; the algorithm
# tags @gekneetravel as interested in those competitors). Scraping from a
# personal research account keeps the brand surface clean.
#
# Both Chromes can run side-by-side. ig-poster's Chrome on 9222 keeps its
# @gekneetravel login. ig-scraper's Chrome on 9223 has your personal login.
#
# Usage:
#   bash ~/geknee/.agents/ig-scraper/launch-chrome.sh
#   # Then in the new window: sign into instagram.com with your PERSONAL account.
#   # Then in another terminal:
#   cd ~/geknee/.agents/ig-scraper
#   uv run python scrape.py --handle layla.tripplanner --posts 12

set -euo pipefail

PORT="${PORT:-9223}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Dedicated profile dir — same anti-CDP-on-default-profile workaround as
# ig-poster. Different path so the two Chromes don't clobber each other.
PROFILE_DIR="${PROFILE_DIR:-$HOME/.gkscrape-chrome-data}"

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at: $CHROME"
  echo "Install Chrome or edit this script's CHROME path."
  exit 1
fi

if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Port $PORT is already in use. If it's a previous ig-scraper Chrome,"
  echo "you can attach to it directly — no need to relaunch."
  exit 0
fi

# Note: we do NOT bail if another Chrome is running. ig-poster's Chrome on
# 9222 will already be running. Different --user-data-dir + different port
# means they coexist.

echo "[scraper-launch] Launching Chrome with DevTools on http://localhost:$PORT"
echo "[scraper-launch] Using profile: $PROFILE_DIR"
echo "[scraper-launch] IMPORTANT — sign into instagram.com with your PERSONAL"
echo "[scraper-launch] account in this window. Do NOT sign in as @gekneetravel."
"$CHROME" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE_DIR" \
  "https://www.instagram.com/" \
  >/tmp/chrome-cdp-scrape.log 2>&1 &

echo "[scraper-launch] Chrome PID $! — logs at /tmp/chrome-cdp-scrape.log"
echo "[scraper-launch] Verify in a few seconds:"
echo "   curl -s http://localhost:$PORT/json/version | head -5"
