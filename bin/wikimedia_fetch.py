#!/usr/bin/env python3
"""Wikimedia Commons video search + download.

Public MediaWiki API — no key required. License varies per file (CC BY,
CC BY-SA, or public domain); every returned hit includes the license
metadata so build-remix-reel.py can decide + record attribution.

Videos on Commons are typically .webm (VP9/VP8) or .ogv; ffmpeg in the
build pipeline handles both. Coverage skews to documentary/tourism board
footage — often surprisingly good for iconic monuments (Persepolis
drone flyovers, Brandenburg Gate historical clips) where Pexels is thin.

usage:
  from wikimedia_fetch import search_videos, download, best_file
  hits = search_videos("Brandenburg Gate", per_page=15)
  for h in hits[:3]: download(h, dest_dir)
"""
from __future__ import annotations
import json, urllib.request, urllib.parse
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"


def _to_pexels_shape(page: dict) -> dict:
    """Convert MediaWiki `imageinfo` page → Pexels-shaped hit."""
    info = (page.get("imageinfo") or [{}])[0]
    url = info.get("url", "")
    ext = info.get("extmetadata") or {}
    license_short = (ext.get("LicenseShortName") or {}).get("value", "unknown")
    artist_html = (ext.get("Artist") or {}).get("value", "")
    # Strip HTML tags cheaply
    import re
    artist = re.sub(r"<[^>]+>", "", artist_html).strip() or "Wikimedia Commons"
    return {
        "id": page.get("pageid") or page.get("title", "").replace("File:", ""),
        "duration": int(info.get("duration", 0)) if info.get("duration") else 0,
        "user": {"name": artist},
        "video_files": [{
            "file_type": info.get("mime", "video/webm"),
            "link": url,
            "width": info.get("width", 0),
            "height": info.get("height", 0),
        }] if url else [],
        "_source": "wikimedia",
        "_license": license_short,
        "_page_url": (info.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(page.get('title', ''))}"),
        "_title": page.get("title", ""),
    }


def search_videos(query: str, per_page: int = 10, orient: str = "any") -> list[dict]:
    """orient ignored on Commons — search returns whatever the query matches.
    We filter to file namespace and video mime type."""
    # Two-step: search returns titles, then imageinfo fills in file details.
    search_params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": f"{query} filetype:video",
        "srnamespace": "6",  # File namespace
        "srlimit": per_page,
    }
    url = f"{API}?{urllib.parse.urlencode(search_params)}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "geknee-remix/1.0 (https://geknee.com; noreply@geknee.com)",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read())
    titles = [h["title"] for h in (data.get("query", {}).get("search") or [])]
    if not titles: return []

    # Batch imageinfo lookup
    info_params = {
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "url|mime|size|duration|extmetadata",
        "iiurlwidth": "1280",
        "titles": "|".join(titles),
    }
    url = f"{API}?{urllib.parse.urlencode(info_params)}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "geknee-remix/1.0 (https://geknee.com; noreply@geknee.com)",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read())
    pages = (data.get("query", {}).get("pages") or {}).values()
    hits = []
    for p in pages:
        info = (p.get("imageinfo") or [{}])[0]
        mime = info.get("mime", "")
        # Only mp4/webm/ogv — skip .gif, .svg, etc if they slipped through
        if not any(x in mime for x in ("video/", "application/ogg")):
            continue
        hits.append(_to_pexels_shape(p))
    return hits


def best_file(video: dict, max_height: int = 1280) -> dict | None:
    """Commons only exposes one link per file (the original)."""
    files = video.get("video_files", [])
    return files[0] if files else None


def download(video: dict, dest_dir: Path, prefix: str = "") -> Path:
    f = best_file(video)
    if not f: raise RuntimeError(f"no video link on Commons file {video.get('id')}")
    dest_dir.mkdir(parents=True, exist_ok=True)
    # Preserve the original extension so ffmpeg picks the right decoder
    ext = f["link"].rsplit(".", 1)[-1].lower()
    if ext not in ("mp4", "webm", "ogv", "ogg"):
        ext = "webm"
    # Use pageid as filename-safe id
    vid = str(video["id"]).replace("File:", "").replace("/", "_")[:80]
    out = dest_dir / f"{prefix}wmc{vid}.{ext}"
    if out.exists(): return out
    req = urllib.request.Request(f["link"], headers={
        "User-Agent": "geknee-remix/1.0 (https://geknee.com; noreply@geknee.com)",
    })
    with urllib.request.urlopen(req, timeout=90) as r:
        out.write_bytes(r.read())
    return out


if __name__ == "__main__":
    import sys
    q = sys.argv[1] if len(sys.argv) > 1 else "Brandenburg Gate"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    hits = search_videos(q, per_page=n)
    print(f"  '{q}' → {len(hits)} hits")
    for h in hits:
        f = best_file(h)
        print(f"    {h['_title'][:60]:60}  {h.get('duration','?')}s  "
              f"{(f or {}).get('width')}x{(f or {}).get('height')}  "
              f"lic={h['_license']}")
