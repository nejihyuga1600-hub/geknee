#!/usr/bin/env python3
"""Pixabay video search + download.

Complements bin/pexels_fetch.py — same shape so build-remix-reel.py can call
either behind a common interface. Reads PIXABAY_API_KEY from .env.local. Get
a free key at https://pixabay.com/api/docs/.

Videos come back in nested `videos.{large,medium,small,tiny}` blocks; we
pick the smallest that's ≥720p tall so downloads stay reasonable.

usage:
  from pixabay_fetch import search_videos, download, best_file, get_video
  hits = search_videos("chan chan peru", per_page=15, orient="vertical")
  for h in hits[:3]:
      p = download(h, dest_dir, prefix="src_")
"""
from __future__ import annotations
import json, os, urllib.request, urllib.parse
from pathlib import Path

ENDPOINT = "https://pixabay.com/api/videos/"
ROOT = Path.home() / "geknee"


def _key() -> str:
    if os.environ.get("PIXABAY_API_KEY"):
        return os.environ["PIXABAY_API_KEY"]
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("PIXABAY_API_KEY="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                if v: return v
    raise RuntimeError(
        "PIXABAY_API_KEY not set. Get a free key at https://pixabay.com/api/docs/"
        " and add PIXABAY_API_KEY=... to ~/geknee/.env.local"
    )


def _to_pexels_shape(hit: dict) -> dict:
    """Normalize Pixabay hit → the shape build-remix-reel.py expects (id,
    duration, user, video_files[]). Pixabay's per-quality blocks (large,
    medium, small, tiny) become entries in video_files[] mirroring Pexels."""
    files = []
    for q, blk in (hit.get("videos") or {}).items():
        if not blk or not blk.get("url"): continue
        files.append({
            "file_type": "video/mp4",
            "link": blk["url"],
            "width": blk.get("width", 0),
            "height": blk.get("height", 0),
            "quality": q,
        })
    return {
        "id": hit["id"],
        "duration": hit.get("duration", 0),
        "user": {"name": hit.get("user", "?")},
        "video_files": files,
        "_source": "pixabay",  # tag so callers know provenance
        "_page_url": hit.get("pageURL", ""),
    }


def search_videos(query: str, per_page: int = 10, orient: str = "vertical") -> list[dict]:
    """orient: vertical|horizontal|all. Returns list of normalized hits."""
    params = {
        "key": _key(),
        "q": query,
        "per_page": max(3, min(200, per_page)),  # Pixabay minimum 3
        "video_type": "film",
        "safesearch": "true",
    }
    if orient in ("vertical", "horizontal"):
        params["orientation"] = orient
    url = f"{ENDPOINT}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read())
    return [_to_pexels_shape(h) for h in data.get("hits", [])]


def get_video(video_id: int | str) -> dict:
    """Pixabay doesn't expose a public single-video endpoint — but the
    search endpoint accepts an id= filter which returns just that video."""
    params = {"key": _key(), "id": str(video_id)}
    url = f"{ENDPOINT}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read())
    hits = data.get("hits", [])
    if not hits:
        raise RuntimeError(f"pixabay id {video_id} not found")
    return _to_pexels_shape(hits[0])


def best_file(video: dict, max_height: int = 1280) -> dict | None:
    """Pick the smallest MP4 whose height is >= 720, capped at max_height.
    Prefer vertical when both aspects exist at the target height."""
    files = video.get("video_files", [])
    if not files: return None

    def key(f):
        h = f.get("height", 0); w = f.get("width", 0)
        vertical = h > w
        # Score: prefer vertical, then closest to max_height without going way over
        over = max(0, h - max_height)
        under = max(0, 720 - h)  # penalize too-small
        return (-int(vertical), under, over)

    files_sorted = sorted(files, key=key)
    return files_sorted[0]


def download(video: dict, dest_dir: Path, prefix: str = "") -> Path:
    f = best_file(video)
    if not f: raise RuntimeError(f"no mp4 link in pixabay video {video.get('id')}")
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / f"{prefix}pxb{video['id']}.mp4"
    if out.exists(): return out
    req = urllib.request.Request(f["link"], headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        out.write_bytes(r.read())
    return out


if __name__ == "__main__":
    import sys
    q = sys.argv[1] if len(sys.argv) > 1 else "sunrise mountain"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    hits = search_videos(q, per_page=n)
    print(f"  '{q}' → {len(hits)} hits")
    for h in hits:
        f = best_file(h)
        print(f"    id={h['id']} dur={h.get('duration','?')}s "
              f"size={(f or {}).get('width')}x{(f or {}).get('height')} "
              f"user={h['user']['name']}")
