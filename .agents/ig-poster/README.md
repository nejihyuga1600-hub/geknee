# ig-poster

Browser-automated Instagram posting via [browser-use](https://github.com/browser-use/browser-use) attached to **your real, logged-in Chrome** through Chrome DevTools Protocol. Bypasses the Meta Business verification blocker for the IG feed-post flow.

> **Risk note.** This drives your real IG session. Meta's automation detection is less aggressive against your actual Chrome + your real cookies + human-like cadence, but it's not zero. Keep usage modest: ≤2 posts/day, varied timing, never run it on a loop. Browser automation of IG can result in account flags or temporary blocks.

## What's here

| File | Purpose |
|------|---------|
| `post.py` | The main script — drives browser-use to publish one image |
| `launch-chrome.sh` | Helper to launch Chrome with `--remote-debugging-port=9222` |
| `.env.example` | LLM API key template |
| `pyproject.toml` | uv-managed Python 3.12 env, browser-use installed |

## One-time setup

1. **Set your LLM key** (browser-use needs one to drive the agent):
   ```bash
   cd ~/geknee/.agents/ig-poster
   cp .env.example .env
   # paste ANTHROPIC_API_KEY=... (or OPENAI_API_KEY=...)
   ```
   You can get an Anthropic key at https://console.anthropic.com → API keys. Cost per IG post is well under $0.10.

2. **Make the launcher executable**:
   ```bash
   chmod +x launch-chrome.sh
   ```

## Posting flow (every time)

1. **Quit your normal Chrome** (Cmd+Q).
2. **Launch Chrome with the debug port:**
   ```bash
   ~/geknee/.agents/ig-poster/launch-chrome.sh
   ```
   A Chrome window opens at instagram.com using your normal profile (so you're already logged in).
3. **Confirm CDP is listening:**
   ```bash
   curl -s http://localhost:9222/json/version | head -5
   ```
4. **Post**:
   ```bash
   cd ~/geknee/.agents/ig-poster
   # dry-run first time (uploads + types caption, stops before clicking Share):
   uv run python post.py \
       --image ~/geknee/ad-assets/instagram/gk-aud-2-discover.jpg \
       --caption "Not sure where to go? Spin the globe and let GeKnee plan it." \
       --dry-run

   # if dry-run looks right, drop the flag to actually post:
   uv run python post.py \
       --image ~/geknee/ad-assets/instagram/gk-aud-2-discover.jpg \
       --caption "Not sure where to go? Spin the globe and let GeKnee plan it."
   ```
5. **For long captions**, put the text in a file and use `--caption-file`:
   ```bash
   uv run python post.py --image ~/geknee/ad-assets/instagram/gk-aud-5-collect.jpg \
       --caption-file caption-a5.txt
   ```

## Hardened defaults

The agent prompt explicitly:

- Restricts navigation to the create-post flow only.
- Forbids likes, comments, follows, DMs, profile edits.
- Stops immediately on captcha / suspicious-activity warnings (does not try to log in or solve them).
- Preserves caption line breaks exactly as provided.

## Troubleshooting

- **`Port 9222 already in use`** → an old Chrome is still bound. Either reuse it (skip step 2) or kill it: `lsof -ti:9222 | xargs kill`.
- **`No LLM key found`** → `.env` not loaded or wrong file location. The script uses `python-dotenv` and looks in the cwd; run it from `~/geknee/.agents/ig-poster`.
- **`Image not found`** → use an absolute path.
- **Agent says "I see a login screen"** → your CDP-launched Chrome isn't actually logged into IG. Log in manually in that Chrome window, then rerun the script.
- **Agent loops or fails on the create dialog** → IG sometimes A/B tests new layouts. Re-run with `--max-steps 50`. If it persists, the prompt in `post.py` needs a tweak for the new UI.
- **Caption pasted with weird character substitutions** → some LLMs auto-"correct" punctuation. Inspect the agent's reported actions; if needed, use `--caption-file` (the agent treats file contents as literal payload).

## How this fits with the rest of GeKnee's ad stack

- **Long-term canonical**: the `geknee-meta` MCP server (`~/geknee/.agents/mcp-meta/`) using the Instagram Graph API. Unblocks ad-campaign automation in addition to posting. Currently paused on Meta Business verification.
- **This (ig-poster)**: the workaround for *posting* while verification is pending. Does NOT manage ad campaigns — only feed posts.
- **When Meta verification clears**, switch back to `geknee-meta` for posts and ads. Keep `ig-poster` around as a fallback.
