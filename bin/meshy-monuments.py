#!/usr/bin/env python3
"""Generate 3D .glb monument models via Meshy.ai image-to-3D API.

Feeds existing /public/monument-snaps/<key>.png into Meshy's image-to-3D
endpoint, polls until done, downloads the .glb, and drops it at
/public/models/<key>.glb so the globe view picks it up.

Image-to-3D (not text-to-3D) is the right call: the existing 31 snaps were
art-directed in a copper-stylized look, and image-to-3D preserves that style
across the new gens — text-to-3D would drift into "photoreal" and break
visual consistency.

ONE-TIME SETUP:
  1. Sign up at https://www.meshy.ai (free trial gives ~200 credits, enough
     for ~10 image-to-3D gens at 20 credits each).
  2. Account → API keys → Generate
  3. export MESHY_API_KEY="msy_..."
     OR add MESHY_API_KEY=msy_... to ~/geknee/.env.local

usage:
  python3 bin/meshy-monuments.py --pilot               # the 10-monument pilot list below
  python3 bin/meshy-monuments.py --key petra           # one monument by key
  python3 bin/meshy-monuments.py --dry-run --pilot     # show what would generate
  python3 bin/meshy-monuments.py --list-missing        # show every slot missing a .glb

Output:
  /Users/geknee/geknee/public/models/<key>.glb        — the model
  /Users/geknee/geknee/public/models/<key>.preview.png — Meshy's render preview
  /Users/geknee/geknee/public/models/_meshy-jobs.jsonl — append-only log of jobs run

Cost (Meshy standard tier as of 2026-06):
  image-to-3D = 20 credits/job ≈ $0.20
  pilot 10 ≈ $2 spend
"""
from __future__ import annotations
import argparse, json, os, sys, time
from pathlib import Path
from urllib.request import Request, urlopen, urlretrieve
from urllib.error import HTTPError

ROOT = Path.home() / "geknee"
SNAPS = ROOT / "public" / "monument-snaps"
MODELS = ROOT / "public" / "models"
JOB_LOG = MODELS / "_meshy-jobs.jsonl"

API_BASE = "https://api.meshy.ai"

# Pilot list: monuments slotted in MONUMENT_LATLON with a snap PNG but no
# .glb. Ordered so today's reel CTAs (petra, hagiaSophia, angkorWat) gen
# first — if the trial budget runs out, those land in app first.
PILOT_KEYS = [
    "petra",
    "hagiaSophia",
    "angkorWat",
    "tajMahal",
    "machuPicchu",
    "pyramidGiza",
    "colosseum",
    "sagradaFamilia",
    "statueLiberty",
    "stonehenge",
]


def get_token() -> str:
    tok = os.environ.get("MESHY_API_KEY", "").strip()
    if not tok:
        envf = ROOT / ".env.local"
        if envf.exists():
            for line in envf.read_text().splitlines():
                if line.startswith("MESHY_API_KEY="):
                    tok = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not tok:
        sys.exit(
            "MESHY_API_KEY not set. One-time setup:\n"
            "  1. https://www.meshy.ai → account → API keys → Generate\n"
            "  2. export MESHY_API_KEY=\"msy_...\"\n"
            "     OR add MESHY_API_KEY=msy_... to .env.local\n"
        )
    return tok


def post(path: str, token: str, body: dict) -> dict:
    req = Request(
        f"{API_BASE}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        sys.exit(f"Meshy POST {path} → {e.code}: {e.read().decode('utf-8', errors='replace')[:500]}")


def get(path: str, token: str) -> dict:
    req = Request(f"{API_BASE}{path}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        sys.exit(f"Meshy GET {path} → {e.code}: {e.read().decode('utf-8', errors='replace')[:500]}")


def upload_image_to_data_uri(p: Path) -> str:
    """Meshy accepts data: URIs for image inputs — simpler than running our
    own host. PNG snaps are <500KB so payload is well under limits."""
    import base64
    mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
    b64 = base64.b64encode(p.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def create_image_to_3d(token: str, image_uri: str, prompt_hint: str) -> str:
    """Returns task_id. Default settings tuned for cheap, fast iteration."""
    body = {
        "image_url": image_uri,
        "ai_model": "meshy-6",          # meshy-4 deprecated 2026; -6 is current
        "topology": "triangle",
        "target_polycount": 30000,
        "should_remesh": True,
        "should_texture": True,
        "enable_pbr": False,            # save credits; PBR not used by app
        # text_prompt biases the silhouette interpretation — helpful for
        # ambiguous snaps (e.g. iguazuFalls is mostly water).
        "text_prompt": prompt_hint,
    }
    r = post("/openapi/v1/image-to-3d", token, body)
    return r.get("result") or r.get("id")


def poll_until_done(token: str, task_id: str, timeout: int = 600) -> dict:
    deadline = time.monotonic() + timeout
    last_progress = -1
    while time.monotonic() < deadline:
        info = get(f"/openapi/v1/image-to-3d/{task_id}", token)
        st = info.get("status")
        prog = info.get("progress", 0)
        if prog != last_progress:
            print(f"    [{task_id[:8]}] {st} {prog}%")
            last_progress = prog
        if st == "SUCCEEDED":
            return info
        if st in ("FAILED", "EXPIRED", "CANCELED"):
            sys.exit(f"Meshy task {task_id} {st}: {info.get('task_error', {})}")
        time.sleep(5)
    sys.exit(f"Meshy task {task_id} timed out after {timeout}s")


def append_log(rec: dict) -> None:
    JOB_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(JOB_LOG, "a") as f:
        f.write(json.dumps(rec) + "\n")


def list_missing() -> list[str]:
    """Slots that have a snap PNG but no .glb under public/models."""
    import re
    skin_file = ROOT / "app" / "plan" / "location" / "globe" / "skins.ts"
    src = skin_file.read_text()
    m = re.search(r"MONUMENT_LATLON[^{]*\{(.*?)^\};", src, re.DOTALL | re.MULTILINE)
    if not m:
        sys.exit("could not locate MONUMENT_LATLON in skins.ts")
    keys = re.findall(r"^\s*([a-zA-Z]+):", m.group(1), re.MULTILINE)
    have_glb = set()
    if MODELS.exists():
        for p in MODELS.glob("*.glb"):
            # skip skin-tier variants like "eiffel_tower_aurora.glb"
            stem = p.stem.split("_")[0]
            have_glb.add(stem)
    missing = []
    for k in keys:
        snap = SNAPS / f"{k}.png"
        # notreDame slot uses notreDameF.png — special-case
        if not snap.exists() and k == "notreDame":
            snap = SNAPS / "notreDameF.png"
        if not snap.exists():
            continue
        if k.lower() not in have_glb and not any(k.lower() in g for g in have_glb):
            missing.append(k)
    return missing


def humanize(key: str) -> str:
    """petra → 'petra monument', hagiaSophia → 'hagia sophia monument' — gives
    Meshy enough silhouette context for ambiguous snaps."""
    import re
    spaced = re.sub(r"([a-z])([A-Z])", r"\1 \2", key).lower()
    return f"{spaced} monument, stylized 3d model, copper-toned, isolated on white"


def generate_one(token: str, key: str, dry: bool) -> None:
    snap = SNAPS / f"{key}.png"
    if not snap.exists() and key == "notreDame":
        snap = SNAPS / "notreDameF.png"
    if not snap.exists():
        print(f"  ! {key}: no snap PNG to feed (expected {snap.name})")
        return
    out_glb = MODELS / f"{key}.glb"
    out_preview = MODELS / f"{key}.preview.png"
    if out_glb.exists():
        print(f"  skip {key}: {out_glb.name} already exists")
        return
    prompt = humanize(key)
    print(f"== {key} ==  prompt={prompt!r}")
    if dry:
        print(f"  [dry-run] would POST image-to-3d with {snap.name} (~20 credits)")
        return
    image_uri = upload_image_to_data_uri(snap)
    task_id = create_image_to_3d(token, image_uri, prompt)
    print(f"  task_id: {task_id}")
    info = poll_until_done(token, task_id)
    glb_url = (info.get("model_urls") or {}).get("glb")
    prev_url = info.get("thumbnail_url")
    if not glb_url:
        sys.exit(f"  ! {key}: no glb URL in response: {info}")
    MODELS.mkdir(parents=True, exist_ok=True)
    print(f"  -> {out_glb.name}")
    urlretrieve(glb_url, out_glb)
    if prev_url:
        urlretrieve(prev_url, out_preview)
    append_log({
        "key": key, "task_id": task_id,
        "snap": str(snap.relative_to(ROOT)),
        "glb": str(out_glb.relative_to(ROOT)),
        "credits_estimated": 20,
    })


def main() -> None:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--pilot", action="store_true",
                   help=f"generate the pilot list: {', '.join(PILOT_KEYS)}")
    g.add_argument("--key", action="append",
                   help="one monument key; repeat for multiple")
    g.add_argument("--list-missing", action="store_true",
                   help="list slotted monuments missing a .glb and exit")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.list_missing:
        missing = list_missing()
        print(f"# slotted monuments with snap but no .glb ({len(missing)}):")
        for k in missing:
            print(f"  {k}")
        return

    token = get_token() if not args.dry_run else "<dry>"
    keys = PILOT_KEYS if args.pilot else args.key
    print(f"will generate {len(keys)} monuments — pilot? {args.pilot}, dry? {args.dry_run}")
    for k in keys:
        try:
            generate_one(token, k, args.dry_run)
        except SystemExit:
            raise
        except Exception as e:
            print(f"  ! {k} failed: {e}")


if __name__ == "__main__":
    main()
