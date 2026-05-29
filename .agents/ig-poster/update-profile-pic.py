#!/usr/bin/env python3
"""
ig-poster — update Instagram profile picture for @gekneetravel via browser-use
(CDP attach to the user's real, logged-in Chrome).

Usage:
    uv run python update-profile-pic.py --image /abs/path/to/avatar.jpg \\
        [--handle gekneetravel] [--cdp-url http://localhost:9222] [--dry-run]

Prereqs (same as post.py):
    1. Chrome launched with `--remote-debugging-port=9222` (launch-chrome.sh)
    2. Logged into instagram.com as the target handle
    3. ANTHROPIC_API_KEY (or OPENAI_API_KEY) in .env

Safety:
    --dry-run navigates and selects the file but stops BEFORE clicking Save.
    The agent prompt forbids any other navigation or edits.
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from browser_use import Agent, BrowserSession, ChatAnthropic, ChatOpenAI

load_dotenv()


def build_llm():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return ChatAnthropic(model="claude-sonnet-4-6")
    if os.environ.get("OPENAI_API_KEY"):
        return ChatOpenAI(model="gpt-4o")
    sys.exit("No LLM key. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env")


def build_task(image_path: str, handle: str, dry_run: bool) -> str:
    save_clause = (
        "STOP after the file is selected and the preview shows. Do NOT click Save / Apply. Report what you see."
        if dry_run
        else "Click 'Save' (or 'Apply'). Confirm the new profile picture is set. Report the result."
    )
    return f"""You are on Instagram (instagram.com) in a logged-in browser session for @{handle}.

Goal: replace the profile picture with the file at: {image_path}

Steps:
1. If not already there, navigate to https://www.instagram.com/{handle}/
2. Open the profile-picture edit dialog. Instagram exposes this in one of two ways depending on the variant the account is on:
   (a) Click on the current profile picture / avatar — a dialog appears with options like 'Upload photo', 'Remove current photo', 'Cancel'. Click 'Upload photo'.
   (b) Click 'Edit profile' (button just below the bio). On the edit page, click 'Change photo' next to the current avatar. A small menu appears — choose 'Upload photo'.
3. When the file picker opens (or when the file input appears), use the upload-file tool to attach: {image_path}
4. Instagram may show a crop / preview screen. Keep the default crop (the file is already a square 1:1 image, so no cropping is needed). If asked, confirm with 'Next' or 'Use photo'.
5. {save_clause}

CONSTRAINTS:
- Do NOT change any other profile field (name, bio, username, links, category).
- Do NOT navigate to feed, DMs, Reels, or any other account.
- Do NOT like, comment, follow, unfollow, or post anything.
- If the page asks you to log in, STOP and report it — do not attempt to log in.
- If a 'Suspicious activity' or captcha screen appears, STOP and report it.
"""


async def main():
    p = argparse.ArgumentParser(description="Update IG profile picture via your logged-in Chrome session.")
    p.add_argument("--image", required=True, help="Absolute path to a square image (jpg/png, ≥320px)")
    p.add_argument("--handle", default="gekneetravel", help="IG handle (default: gekneetravel)")
    p.add_argument("--cdp-url", default="http://localhost:9222")
    p.add_argument("--dry-run", action="store_true", help="Stop before clicking Save")
    p.add_argument("--max-steps", type=int, default=20)
    args = p.parse_args()

    image_path = Path(args.image).expanduser().resolve()
    if not image_path.exists():
        sys.exit(f"Image not found: {image_path}")

    print(f"[update-profile-pic] handle=@{args.handle}")
    print(f"[update-profile-pic] image={image_path}")
    print(f"[update-profile-pic] dry_run={args.dry_run}  cdp={args.cdp_url}")

    llm = build_llm()
    session = BrowserSession(cdp_url=args.cdp_url, is_local=True)

    task = build_task(str(image_path), args.handle, args.dry_run)
    agent = Agent(task=task, llm=llm, browser_session=session)
    result = await agent.run(max_steps=args.max_steps)
    print("\n[update-profile-pic] ----- agent result -----")
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
