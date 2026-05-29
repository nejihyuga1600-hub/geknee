#!/usr/bin/env python3
"""
ig-poster — drive browser-use to publish a single image OR carousel to
Instagram via the user's existing logged-in Chrome session (CDP attach).

Usage (single image):
    uv run python post.py --image /abs/path/to/ad.jpg \\
        --caption "your caption text" \\
        [--cdp-url http://localhost:9222] [--dry-run]

Usage (carousel — 2 to 10 images):
    uv run python post.py \\
        --image /abs/path/to/slide1.jpg \\
        --image /abs/path/to/slide2.jpg \\
        --image /abs/path/to/slide3.jpg \\
        --caption-file caption.txt

    # caption from a file (for long captions with hashtag stacks):
    uv run python post.py --image /abs/path/to/ad.jpg --caption-file caption.txt

Prereqs:
    1. Chrome launched with `--remote-debugging-port=9222` (see launch-chrome.sh).
    2. You're already logged into instagram.com in that Chrome.
    3. ANTHROPIC_API_KEY (or OPENAI_API_KEY) set in env or .env.

Safety:
    --dry-run navigates and uploads but stops BEFORE clicking Share.
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
    sys.exit(
        "No LLM key found. Set ANTHROPIC_API_KEY (recommended) or OPENAI_API_KEY "
        "in env or in ~/geknee/.agents/ig-poster/.env"
    )


def build_single_image_task(image_path: str, caption: str, dry_run: bool) -> str:
    stop_clause = (
        "STOP after the caption is entered. Do NOT click Share. Report what you see."
        if dry_run
        else "Then click 'Share' to publish. Confirm the post succeeded and report the result."
    )
    return f"""You are on Instagram (instagram.com) in a logged-in browser session for the GeKnee brand account (@gekneetravel).

Goal: publish a single-image feed post.

Steps:
0. SAFETY CHECK — Before doing anything else, confirm the logged-in account is @gekneetravel. Open the side nav and check the username at the bottom, or hover/click the profile avatar. If the logged-in handle is NOT @gekneetravel, STOP IMMEDIATELY and report which account you see — do not post to the wrong account.
1. If you are not already at instagram.com, navigate there.
2. Click the 'Create' button (it's the '+' icon in the left sidebar, or 'Create' in the menu — sometimes labelled 'New post').
3. Choose 'Post' if a sub-menu appears.
4. When the upload dialog opens, click 'Select from computer'. Then use the upload-file tool to attach the file at: {image_path}
5. After the file is loaded, click 'Next'. You may see crop/aspect options — leave them at the default (original) and click 'Next' again. Skip filter and editing screens by clicking 'Next' each time until you reach the caption step.
6. In the caption text area, paste exactly this caption (preserve line breaks):

<<<CAPTION_BEGIN>>>
{caption}
<<<CAPTION_END>>>

7. {stop_clause}

CONSTRAINTS:
- Do NOT navigate to any other Instagram screen (DMs, profile, settings, other people's posts).
- Do NOT like, comment, follow, or unfollow anything.
- Do NOT post anything else.
- If a popup, cookie banner, or notification permission prompt blocks the flow, dismiss it minimally and continue.
- If something looks wrong (login screen, suspicious activity warning, captcha), STOP and report it. Do not try to log in.
"""


def build_carousel_task(image_paths: list[str], caption: str, dry_run: bool) -> str:
    stop_clause = (
        "STOP after the caption is entered. Do NOT click Share. Report what you see."
        if dry_run
        else "Then click 'Share' to publish. Confirm the post succeeded and report the result."
    )

    n = len(image_paths)
    first = image_paths[0]
    rest = image_paths[1:]
    rest_block = "\n".join(f"   - Slide {i + 2}: {p}" for i, p in enumerate(rest))

    return f"""You are on Instagram (instagram.com) in a logged-in browser session for the GeKnee brand account (@gekneetravel).

Goal: publish a {n}-image CAROUSEL feed post (multi-image post that users swipe through).

Steps:
0. SAFETY CHECK — Before doing anything else, confirm the logged-in account is @gekneetravel. Open the side nav and check the username at the bottom, or hover/click the profile avatar. If the logged-in handle is NOT @gekneetravel, STOP IMMEDIATELY and report which account you see — do not post to the wrong account.

1. If you are not already at instagram.com, navigate there.

2. Click the 'Create' button (it's the '+' icon in the left sidebar, or 'Create' in the menu — sometimes labelled 'New post'). If a Create dialog is already open showing "Drag photos and videos here" / "Select from computer", skip ahead to step 4.

3. Choose 'Post' if a sub-menu appears.

4. UPLOAD SLIDE 1 — When the upload dialog opens, click 'Select from computer'. Then use the upload-file tool to attach this file:
   - Slide 1: {first}

5. ENABLE CAROUSEL MODE — After slide 1 loads, Instagram shows the image in a Crop screen. To add MORE images (turn this into a carousel/multi-image post), look for the carousel-toggle button. It is usually:
   - A small icon button near the bottom-right of the cropped image area, showing TWO STACKED RECTANGLES (representing multiple images), OR
   - An "Add" / "+" / "carousel" labelled control on the right rail.
   Click it. A thumbnail strip with a "+" button will appear at the bottom of the dialog showing the current slide(s) plus a "+" tile to add more.

6. UPLOAD ADDITIONAL SLIDES — For EACH of the remaining {len(rest)} slide(s), click the "+" tile in the thumbnail strip and use the upload-file tool to attach the next file. Upload them in ORDER:
{rest_block}

   After all slides are uploaded, the thumbnail strip should show {n} thumbnails total, in the order listed above.

7. Click 'Next' to leave the Crop screen. You may see crop/aspect options per slide — leave them at the default (original) for every slide. Continue clicking 'Next' to skip the filter/edit screen.

8. CAPTION — In the caption text area, paste exactly this caption (preserve line breaks):

<<<CAPTION_BEGIN>>>
{caption}
<<<CAPTION_END>>>

9. {stop_clause}

CONSTRAINTS:
- Do NOT navigate to any other Instagram screen (DMs, profile, settings, other people's posts).
- Do NOT like, comment, follow, or unfollow anything.
- Do NOT post anything else.
- Do NOT reorder the slides; upload them in the exact order listed.
- If a popup, cookie banner, or notification permission prompt blocks the flow, dismiss it minimally and continue.
- If something looks wrong (login screen, suspicious activity warning, captcha), STOP and report it. Do not try to log in.
- If you cannot find the carousel-toggle button after uploading slide 1, STOP and report what you see — do not publish a single-image post when a carousel was requested.
"""


async def main():
    p = argparse.ArgumentParser(description="Post a single image OR a carousel to Instagram via your open Chrome session.")
    p.add_argument("--image", action="append", required=True, help="Absolute path to an image (jpg/png). Repeat 2-10 times for a carousel.")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--caption", help="Caption text (inline)")
    g.add_argument("--caption-file", help="Path to a UTF-8 file containing the caption")
    p.add_argument("--cdp-url", default="http://localhost:9222", help="Chrome DevTools Protocol URL")
    p.add_argument("--dry-run", action="store_true", help="Stop before clicking Share")
    p.add_argument("--max-steps", type=int, default=30)
    args = p.parse_args()

    image_paths: list[Path] = []
    for raw in args.image:
        ip = Path(raw).expanduser().resolve()
        if not ip.exists():
            sys.exit(f"Image not found: {ip}")
        image_paths.append(ip)

    if len(image_paths) < 1:
        sys.exit("At least one --image is required.")
    if len(image_paths) > 10:
        sys.exit(f"Instagram carousel cap is 10 images; got {len(image_paths)}.")

    caption = args.caption if args.caption else Path(args.caption_file).expanduser().read_text(encoding="utf-8").strip()
    if len(caption) > 2200:
        sys.exit(f"Caption too long ({len(caption)} chars). Instagram cap is 2,200.")

    image_path_strs = [str(p) for p in image_paths]
    is_carousel = len(image_path_strs) > 1

    print(f"[ig-poster] {'CAROUSEL' if is_carousel else 'SINGLE'} images={len(image_path_strs)}")
    for i, p_ in enumerate(image_path_strs, 1):
        print(f"[ig-poster]   slide{i}: {p_}")
    print(f"[ig-poster] caption_chars={len(caption)} dry_run={args.dry_run}")
    print(f"[ig-poster] CDP url={args.cdp_url}")

    llm = build_llm()
    session = BrowserSession(cdp_url=args.cdp_url, is_local=True)

    if is_carousel:
        task = build_carousel_task(image_path_strs, caption, args.dry_run)
        # Carousel walk needs more steps than single-image
        max_steps = max(args.max_steps, 12 + 4 * len(image_path_strs))
    else:
        task = build_single_image_task(image_path_strs[0], caption, args.dry_run)
        max_steps = args.max_steps

    agent = Agent(
        task=task,
        llm=llm,
        browser_session=session,
        available_file_paths=image_path_strs,
    )
    result = await agent.run(max_steps=max_steps)
    print("\n[ig-poster] ----- agent result -----")
    print(result)
    print("[ig-poster] done.")


if __name__ == "__main__":
    asyncio.run(main())
