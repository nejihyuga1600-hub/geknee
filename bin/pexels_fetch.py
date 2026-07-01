#!/usr/bin/env python3
"""Pexels video search + download.

Reads PEXELS_API_KEY from .env.local. Searches by query, filters to vertical
clips when possible, downloads MP4 to a target dir, returns the local paths.

usage:
  from pexels_fetch import search_videos, download
  hits = search_videos("mountain valley pakistan", per_page=8, orient="portrait")
  for h in hits[:3]: download(h, dest_dir)
"""
from __future__ import annotations
import json, os, urllib.request, urllib.parse
from pathlib import Path

ENDPOINT = "https://api.pexels.com/videos/search"
ROOT = Path.home() / "geknee"


def _key() -> str:
    if os.environ.get("PEXELS_API_KEY"):
        return os.environ["PEXELS_API_KEY"]
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("PEXELS_API_KEY="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                if v: return v
    raise RuntimeError("PEXELS_API_KEY not set in env or .env.local")


def search_videos(query: str, per_page: int = 10, orient: str = "portrait") -> list[dict]:
    """orient: portrait|landscape|square. Returns list of video dicts."""
    params = {"query": query, "per_page": str(per_page), "orientation": orient}
    url = f"{ENDPOINT}?{urllib.parse.urlencode(params)}"
    # Pexels 403s on the default Python UA; supply a normal browser UA.
    req = urllib.request.Request(url, headers={
        "Authorization": _key(),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read())
    return data.get("videos", [])


def get_video(video_id: int | str) -> dict:
    """Fetch one video by Pexels ID. Returns the same dict shape as search hits."""
    url = f"https://api.pexels.com/videos/videos/{video_id}"
    req = urllib.request.Request(url, headers={
        "Authorization": _key(),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def best_file(video: dict, max_height: int = 1280) -> dict | None:
    """Pick the best MP4 link <= max_height, prefer HD vertical."""
    files = [f for f in video.get("video_files", []) if f.get("file_type") == "video/mp4"]
    if not files: return None
    # Prefer vertical, then closest height to max
    def key(f):
        h = f.get("height", 0); w = f.get("width", 0)
        vertical = h > w
        over = max(0, h - max_height)
        return (-int(vertical), over, abs(h - max_height))
    files.sort(key=key)
    return files[0]


def download(video: dict, dest_dir: Path, prefix: str = "") -> Path:
    f = best_file(video)
    if not f: raise RuntimeError(f"no mp4 link in video {video.get('id')}")
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / f"{prefix}{video.get('id')}.mp4"
    if out.exists(): return out
    req = urllib.request.Request(f["link"], headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        out.write_bytes(r.read())
    return out


if __name__ == "__main__":
    # CLI smoke test
    import sys
    q = sys.argv[1] if len(sys.argv) > 1 else "mountain valley pakistan"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    hits = search_videos(q, per_page=n)
    print(f"  '{q}' → {len(hits)} hits")
    for h in hits:
        f = best_file(h)
        print(f"    id={h['id']} dur={h.get('duration','?')}s size={f.get('width')}x{f.get('height') if f else '?'} link={(f or {}).get('link','')[:80]}")
