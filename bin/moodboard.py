#!/usr/bin/env python3
"""Moodboard: scrape reference thumbnails from Pinterest (primary) + TikTok
tag pages (best-effort) for a given monument. Outputs a labelled contact
sheet you scan to inform Pexels queries, Higgsfield prompts, and reel hooks.

NOT for reposting. NOT for reel B-roll. Thumbnails only, saved locally to
ad-assets/moodboards/<slug>/, contact sheet at moodboard.jpg. Use only for
composition/angle/season reference.

usage:
  python3 bin/moodboard.py --slug chan-chan --tags "chanchan,peruruins,trujilloperu"
  python3 bin/moodboard.py --slug brandenburg-gate --tags "brandenburgertor,berlin,brandenburggate" --n 24

sources:
  Pinterest — public search results (login-walled sometimes; falls back to
              their unauth JSON endpoint used by the /search/pins/ page)
  TikTok    — public tag pages via web (rate-limited, best-effort)
"""
from __future__ import annotations
import argparse, json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
OUT_ROOT = Path.home() / "geknee" / "ad-assets" / "moodboards"


def _get(url: str, timeout: int = 15) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/json,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def pinterest_search(query: str, n: int = 24) -> list[dict]:
    """Pinterest search returns pins with cached image thumbnails. Uses the
    Pinterest resource endpoint which powers their unauth search page."""
    url = ("https://www.pinterest.com/resource/BaseSearchResource/get/?"
           "source_url=%2Fsearch%2Fpins%2F%3Fq%3D" + urllib.parse.quote(query) +
           "&data=" + urllib.parse.quote(json.dumps({
               "options": {"query": query, "scope": "pins", "page_size": n},
               "context": {},
           })))
    try:
        raw = _get(url)
        data = json.loads(raw)
    except Exception as e:
        print(f"  ! pinterest {query}: {e}")
        return []
    results = ((data.get("resource_response") or {}).get("data") or {}).get("results") or []
    hits = []
    for r in results[:n]:
        img = ((r.get("images") or {}).get("orig") or {}).get("url") \
              or ((r.get("images") or {}).get("564x") or {}).get("url")
        if not img: continue
        hits.append({
            "source": "pinterest",
            "id": r.get("id", "?"),
            "img_url": img,
            "title": (r.get("title") or r.get("grid_title") or "")[:120],
            "page_url": f"https://pinterest.com/pin/{r.get('id','')}/",
        })
    return hits


def tiktok_tag(tag: str, n: int = 12) -> list[dict]:
    """TikTok public tag page. Their SIGI_STATE JSON is embedded in the HTML
    and includes item metadata + video cover thumbnails."""
    url = f"https://www.tiktok.com/tag/{urllib.parse.quote(tag.strip('#'))}"
    try:
        html = _get(url).decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  ! tiktok {tag}: {e}")
        return []
    m = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        m = re.search(r'<script id="SIGI_STATE"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except Exception:
        return []
    # Walk any nested "itemList" / "items" arrays
    hits = []
    def walk(node):
        if isinstance(node, dict):
            items = node.get("itemList") or node.get("items")
            if isinstance(items, list):
                for it in items[:n]:
                    if not isinstance(it, dict): continue
                    cover = ((it.get("video") or {}).get("cover")
                             or (it.get("video") or {}).get("originCover"))
                    if not cover: continue
                    hits.append({
                        "source": "tiktok",
                        "id": it.get("id", "?"),
                        "img_url": cover,
                        "title": (it.get("desc") or "")[:120],
                        "page_url": f"https://www.tiktok.com/@{(it.get('author') or {}).get('uniqueId','')}/video/{it.get('id','')}",
                    })
            for v in node.values(): walk(v)
        elif isinstance(node, list):
            for v in node: walk(v)
    walk(data)
    return hits[:n]



def bing_images(query: str, n: int = 24) -> list[dict]:
    """Bing Images public search. Works without auth. Parses the m= JSON
    attribute on result thumbnails — Bing's own client uses the same data."""
    url = f"https://www.bing.com/images/search?q={urllib.parse.quote(query)}&form=HDRSC2&first=1"
    try:
        html = _get(url).decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  ! bing {query}: {e}")
        return []
    # Each thumb tile carries m="{...json...}" with murl (full image), turl (thumb), t (title)
    hits = []
    for m in re.finditer(r'class="iusc"[^>]+m="([^"]+)"', html):
        try:
            raw = m.group(1).replace("&quot;", '"').replace("&amp;", "&")
            meta = json.loads(raw)
        except Exception:
            continue
        img = meta.get("turl") or meta.get("murl")
        if not img: continue
        hits.append({
            "source": "bing",
            "id": meta.get("id") or str(len(hits)),
            "img_url": img,
            "title": (meta.get("t") or "")[:120],
            "page_url": meta.get("purl", ""),
        })
        if len(hits) >= n: break
    return hits

def download_thumbs(hits: list[dict], out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for i, h in enumerate(hits):
        try:
            data = _get(h["img_url"])
            ext = "jpg" if "jpeg" in h["img_url"] or "jpg" in h["img_url"] else "webp"
            fn = out_dir / f"{h['source'][:3]}_{i:03d}_{h['id']}.{ext}"
            fn.write_bytes(data)
            saved.append(fn)
        except Exception as e:
            print(f"  ! thumb {h['id']}: {e}")
    return saved


def build_sheet(image_paths: list[Path], out_path: Path, cols: int = 4):
    from PIL import Image, ImageDraw, ImageFont
    thumb_w = 320
    imgs = []
    for p in image_paths:
        try:
            im = Image.open(p).convert("RGB")
            h = int(im.height * thumb_w / im.width)
            imgs.append((p, im.resize((thumb_w, min(h, 480)), Image.LANCZOS)))
        except Exception:
            continue
    if not imgs:
        print("  ! no thumbs to sheet")
        return
    max_h = max(im.height for _, im in imgs) + 22
    rows = (len(imgs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb_w, rows * max_h), "black")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12)
    except Exception:
        font = ImageFont.load_default()
    for i, (p, im) in enumerate(imgs):
        r, c = divmod(i, cols)
        sheet.paste(im, (c * thumb_w, r * max_h))
        label = p.stem[:38]
        draw.text((c * thumb_w + 4, r * max_h + im.height + 2), label, fill="white", font=font)
    sheet.save(out_path, quality=85)
    print(f"  sheet → {out_path} ({sheet.size[0]}x{sheet.size[1]})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True, help="monument slug, e.g. chan-chan")
    ap.add_argument("--tags", required=True, help="comma-separated tags to search")
    ap.add_argument("--n", type=int, default=24, help="thumbs per source per tag")
    ap.add_argument("--sources", default="bing,pinterest,tiktok",
                    help="comma-separated: bing,pinterest,tiktok")
    args = ap.parse_args()

    out_dir = OUT_ROOT / args.slug
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    sources = [s.strip() for s in args.sources.split(",") if s.strip()]

    all_hits = []
    for tag in tags:
        for src in sources:
            print(f"[{src}] tag: {tag}")
            if src == "pinterest":
                all_hits += pinterest_search(tag, n=args.n)
            elif src == "tiktok":
                all_hits += tiktok_tag(tag, n=args.n)
            elif src == "bing":
                all_hits += bing_images(tag, n=args.n)
            time.sleep(0.5)  # be polite

    print(f"total hits: {len(all_hits)}")
    thumbs = download_thumbs(all_hits, out_dir)
    print(f"downloaded {len(thumbs)} thumbs to {out_dir}")
    if thumbs:
        build_sheet(thumbs, out_dir / "moodboard.jpg")

    # Also write an index.jsonl for provenance
    with open(out_dir / "index.jsonl", "w") as f:
        for h in all_hits:
            f.write(json.dumps(h) + "\n")
    print(f"provenance → {out_dir / 'index.jsonl'}")


if __name__ == "__main__":
    main()
