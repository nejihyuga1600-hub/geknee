# ig-scraper

Read-only IG competitor benchmarking via [browser-use](https://github.com/browser-use/browser-use) attached to **your real, logged-in Chrome** through Chrome DevTools Protocol. Mirrors the architecture of `~/geknee/.agents/ig-poster/`.

**Risk note.** This drives your real IG session against competitor profiles. IG aggressively defends profile-scraping against automation. Hardening enforced by the agent prompt:

- Navigates ONLY to public profile URLs and their recent posts.
- NEVER follows, likes, comments, DMs, or saves.
- NEVER opens stories, reels feeds, search history, or any "Suggested" links.
- Rate-limits to one profile per 60s and one post per 15s. Exponential backoff on any 429 / "Try again later" / "Action Blocked" surface.
- Stops on any captcha or suspicious-activity warning.

Keep usage modest: ≤ 1 full benchmark run per day. Pause for 24h on any block notice.

## What's here

| File | Purpose |
|------|---------|
| `scrape.py` | The main script — drives browser-use to capture profile metadata + recent posts JSON |
| `pyproject.toml` | uv-managed Python 3.12 env, browser-use installed |
| `.env.example` | LLM API key template (shares the same `ANTHROPIC_API_KEY` as ig-poster) |

## One-time setup

```bash
cd ~/geknee/.agents/ig-scraper
cp .env.example .env
# Paste ANTHROPIC_API_KEY=… (same key as ig-poster works)
uv sync
```

### Why a separate Chrome

Run this scraper from a SECOND Chrome instance signed into your PERSONAL Instagram account — NOT @gekneetravel.

Reasons:
- Visiting competitor profiles from the brand account leaks profile-views into their business insights.
- The IG algorithm tags @gekneetravel as interested in those competitors and starts surfacing their content in our brand feed's "Suggested for you" — polluting the recommendation signal we want clean.
- The two Chromes coexist: ig-poster on `http://localhost:9222` (brand login) + ig-scraper on `http://localhost:9223` (personal login).

### Launch the scraper Chrome

```bash
bash ~/geknee/.agents/ig-scraper/launch-chrome.sh
# A new Chrome window opens at instagram.com on port 9223.
# Sign into your PERSONAL IG account (not the brand) in this window.
# Cookies persist in ~/.gkscrape-chrome-data for future runs.

# Verify CDP:
curl -s http://localhost:9223/json/version | head -5
```

## Run a benchmark pass

```bash
# Single competitor
uv run python scrape.py --handle layla.tripplanner --posts 12

# Batch from the competitor list
uv run python scrape.py --handles-file ~/geknee/ad-assets/competitors/handles.txt --posts 12
```

Output lands at `~/geknee/ad-assets/competitors/scrapes/<handle>-<YYYY-MM-DD>.json` with:

```json
{
  "handle": "layla.tripplanner",
  "scraped_at": "2026-05-28T22:00:00Z",
  "profile": {
    "display_name": "...",
    "bio": "...",
    "external_url": "...",
    "follower_count": 12345,
    "following_count": 678,
    "post_count": 234
  },
  "recent_posts": [
    {
      "post_url": "https://www.instagram.com/p/...",
      "post_type": "carousel" | "single" | "reel",
      "slide_count": 5,
      "caption": "first 500 chars...",
      "caption_chars": 1234,
      "hashtag_count": 8,
      "likes_visible": 4567,
      "comments_visible": 123,
      "posted_at_relative": "2 days ago"
    }
  ]
}
```

## What this is NOT

- Not a tool for posting (use `ig-poster` for that).
- Not a tool for engagement (no liking, commenting, following).
- Not for private accounts — public profiles only.
- Not a substitute for proper IG Insights data when Meta verification clears.

## Synthesis

The raw JSON files in `~/geknee/ad-assets/competitors/scrapes/` are then synthesized by a follow-up Claude session into `~/geknee/ad-assets/competitors/benchmark-report-<DATE>.md` covering:

- Posting cadence per competitor (posts/week, time-of-day clustering)
- Format mix (carousel %, single %, reel %)
- Caption length + hashtag-stack patterns
- Top-performing post breakdown (by likes/comments)
- Cross-segment trends

That report becomes input to GeKnee's own caption-pool refresh + cron-config tuning.
