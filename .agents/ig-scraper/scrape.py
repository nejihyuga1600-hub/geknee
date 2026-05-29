#!/usr/bin/env python3
"""
ig-scraper — drive browser-use READ-ONLY against competitor IG profiles
via CDP attach. Captures profile metadata + recent posts JSON.

Usage (single handle):
    uv run python scrape.py --handle layla.tripplanner --posts 12

Usage (batch):
    uv run python scrape.py \\
        --handles-file ~/geknee/ad-assets/competitors/handles.txt \\
        --posts 12

Prereqs:
    1. Chrome launched with --remote-debugging-port=9222 (use ig-poster/launch-chrome.sh).
    2. You're already logged into instagram.com in that Chrome (your own account, NOT
       the brand account — to avoid leaking visit-history into @gekneetravel's
       "Suggested for you" data).
    3. ANTHROPIC_API_KEY set in env or .env.

Safety:
    - Read-only. Hardened agent prompt forbids likes/follows/comments/DMs.
    - One profile per --pause-between-profiles seconds (default 60).
    - One post-detail open per 15s within a profile.
    - Stops on captcha / "Action Blocked" / 429.
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from browser_use import Agent, BrowserSession, ChatAnthropic, ChatOpenAI

load_dotenv()


def build_llm():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return ChatAnthropic(model="claude-sonnet-4-6")
    if os.environ.get("OPENAI_API_KEY"):
        return ChatOpenAI(model="gpt-4o")
    sys.exit("No LLM key found. Set ANTHROPIC_API_KEY in env or .env.")


def build_profile_task(handle: str, posts: int) -> str:
    return f"""You are on Instagram. Your job is to READ profile data and recent post metadata for the public account @{handle} — NOTHING ELSE.

Steps:
1. Navigate to https://www.instagram.com/{handle}/
2. If a login wall appears, STOP and report it.
3. If a "Suggested for you" / "Sign up" modal blocks the profile, dismiss it.
4. Capture from the profile header (return as JSON in your final report):
   - display_name (from the h2 / display name area, not the @handle)
   - bio (full text under display name)
   - external_url (any link in the bio area)
   - follower_count (number — convert "1.2M" → 1200000)
   - following_count
   - post_count
5. For each of the {posts} most recent posts on the profile grid (top-to-bottom, left-to-right):
   - Note the post URL
   - Identify post_type: "carousel" if the post overlay shows the stacked-rectangles icon; "reel" if it shows the play-triangle icon; "single" otherwise
   - For carousels, slide_count = visible dot count (if you have to open the post to count, do so)
   - For each post, briefly open the post (click it) to capture: caption (first 500 chars), caption_chars, hashtag_count, likes_visible (if shown), comments_visible
   - WAIT AT LEAST 15 SECONDS between opening posts
   - Close the post and return to the grid before moving to the next

CONSTRAINTS — HARDENED, DO NOT VIOLATE:
- READ ONLY. Do NOT like, save, follow, comment, DM, share, or any "engagement" action.
- Do NOT click "Follow" / "Message" / "..." menus.
- Do NOT navigate to Stories, Reels feed, Tagged, or any tab other than the default Posts grid.
- Do NOT navigate to "Suggested for you", "Search", or other profile links.
- Do NOT open the profile picture.
- If you see "Try again later", "Action Blocked", a captcha, a phone-verification prompt, or any rate-limit text, STOP IMMEDIATELY and report it. Do NOT retry.
- If a "Sign up" / "Log in" modal blocks the grid, dismiss the modal ONCE (X button only). If it reappears, STOP.

Return the final JSON in this exact shape:
{{
  "handle": "{handle}",
  "scraped_at": "<ISO8601 UTC timestamp>",
  "profile": {{ "display_name": "...", "bio": "...", "external_url": "...", "follower_count": 0, "following_count": 0, "post_count": 0 }},
  "recent_posts": [
    {{ "post_url": "...", "post_type": "carousel|single|reel", "slide_count": 0, "caption": "...", "caption_chars": 0, "hashtag_count": 0, "likes_visible": 0, "comments_visible": 0, "posted_at_relative": "..." }}
  ],
  "blocked": false,
  "block_reason": null
}}
"""


async def scrape_one(handle: str, posts: int, cdp_url: str, max_steps: int) -> dict | None:
    llm = build_llm()
    session = BrowserSession(cdp_url=cdp_url, is_local=True)
    task = build_profile_task(handle, posts)
    agent = Agent(task=task, llm=llm, browser_session=session)
    result = await agent.run(max_steps=max_steps)
    # browser-use returns a structured AgentHistory; the model's last `done` text
    # is the JSON payload. Parse defensively.
    final = None
    try:
        # AgentHistoryList.final_result() is the canonical accessor in 0.12.x
        final = result.final_result() if hasattr(result, "final_result") else str(result)
    except Exception:
        final = str(result)
    return final


async def main():
    p = argparse.ArgumentParser(description="Read-only IG profile scraper for competitor benchmarking.")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--handle", help="Single IG handle (no @ prefix)")
    g.add_argument("--handles-file", help="Path to UTF-8 file with one handle per line")
    p.add_argument("--posts", type=int, default=12, help="Recent posts to capture per profile")
    p.add_argument("--cdp-url", default="http://localhost:9223",
                   help="CDP URL of the ig-scraper Chrome (port 9223 by convention — do NOT use ig-poster's brand Chrome on 9222)")
    p.add_argument("--out-dir", default="~/geknee/ad-assets/competitors/scrapes")
    p.add_argument("--max-steps", type=int, default=80)
    p.add_argument("--pause-between-profiles", type=int, default=60, help="Seconds to wait between profiles")
    args = p.parse_args()

    handles: list[str] = []
    if args.handle:
        handles = [args.handle.lstrip("@")]
    else:
        path = Path(args.handles_file).expanduser().resolve()
        if not path.exists():
            sys.exit(f"Handles file not found: {path}")
        handles = [line.strip().lstrip("@") for line in path.read_text(encoding="utf-8").splitlines() if line.strip() and not line.strip().startswith("#")]

    out_dir = Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for i, handle in enumerate(handles):
        if i > 0:
            print(f"[ig-scraper] pausing {args.pause_between_profiles}s before {handle}")
            await asyncio.sleep(args.pause_between_profiles)
        out_path = out_dir / f"{handle}-{today}.json"
        if out_path.exists():
            print(f"[ig-scraper] skipping {handle} — already scraped today at {out_path}")
            continue
        print(f"[ig-scraper] scraping @{handle} → {out_path}")
        try:
            payload = await scrape_one(handle, args.posts, args.cdp_url, args.max_steps)
            out_path.write_text(json.dumps({"raw": payload, "handle": handle, "scraped_at": datetime.now(timezone.utc).isoformat()}, indent=2), encoding="utf-8")
            print(f"[ig-scraper] wrote {out_path}")
        except Exception as e:
            print(f"[ig-scraper] FAILED {handle}: {e}")
            out_path.with_suffix(".error.txt").write_text(f"{datetime.now(timezone.utc).isoformat()}\n{e}\n", encoding="utf-8")

    print("[ig-scraper] done.")


if __name__ == "__main__":
    asyncio.run(main())
