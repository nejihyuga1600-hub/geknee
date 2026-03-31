"""
Meshy Batch 3D Monument Generator
===================================
Submits all monuments to Meshy's text-to-3D API, polls until done,
then downloads the GLB files into public/models/.

Usage:
  1. Set MESHY_API_KEY below (or export as env var)
  2. pip install requests
  3. python meshy_batch.py

Meshy API docs: https://docs.meshy.ai/api-text-to-3d
"""

import os
import re
import time
import requests
import json
from pathlib import Path

# ── Load .env.local automatically ────────────────────────────────────────────
def _load_env():
    env_path = Path(__file__).parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())
_load_env()

# ── Config ────────────────────────────────────────────────────────────────────
MESHY_API_KEY = os.environ.get("MESHY_API_KEY", "")
OUTPUT_DIR    = Path(__file__).parent / "public" / "models"
POLL_INTERVAL = 10        # seconds between status checks
MAX_WAIT      = 600       # seconds before giving up on a single job
CONCURRENT    = 3         # how many jobs to submit at once (stay under rate limit)

BASE_URL = "https://api.meshy.ai/openapi/v2/text-to-3d"
HEADERS  = {"Authorization": f"Bearer {MESHY_API_KEY}", "Content-Type": "application/json"}

STYLE_SUFFIX = (
    "super mario galaxy style, nintendo 3D platformer aesthetic, "
    "chunky rounded shapes, bright saturated colors, glossy candy surface, "
    "toon shading, exaggerated proportions, miniature toy scale, "
    "soft cel shadows, game asset, GLB"
)

NEG_PROMPT = "photorealistic, dark, horror, sharp edges, thin fragile parts, text, letters"

# ── Monument list ─────────────────────────────────────────────────────────────
# Format: (output_filename_no_ext, prompt_description, dominant_color_hint)
MONUMENTS = [
    # New Seven Wonders
    ("great_wall",        "Great Wall of China, ancient stone fortification, watchtowers on ridge",        "weathered grey granite and faded brown brick, dark green moss patches"),
    ("petra",             "Petra Treasury, ornate facade carved into sheer cliff face",                    "deep rose-pink sandstone, warm salmon and amber streaks, rust-red rock"),
    ("christ_redeemer",   "Christ the Redeemer statue, arms outstretched on granite mountain peak",        "bright white soapstone tiles, pale cream surface, dark grey granite base"),
    ("machu_picchu",      "Machu Picchu Inca citadel, stone terraces on Andean ridge above clouds",        "pale silver-grey granite blocks, vivid emerald green grass terraces"),
    ("chichen_itza",      "Chichen Itza El Castillo stepped pyramid, Mayan architecture",                  "warm cream-beige limestone, aged light tan stone, faint orange lichen"),
    ("colosseum",         "Roman Colosseum, ancient amphitheatre with tiered arched facade",               "travertine cream-ivory stone, weathered warm beige, rust-brown iron stains"),
    ("taj_mahal",         "Taj Mahal, perfectly symmetrical white mausoleum with central onion dome",      "pure white Makrana marble, subtle blush-pink in warm light, black inlay detail, teal-green dome"),
    # Europe
    ("eiffel_tower",      "Eiffel Tower, iron lattice tower with four curved arched legs",                 "warm dark brown iron, Eiffel brown paint color, subtle rust-orange undertone"),
    ("acropolis",         "Acropolis Parthenon, Doric columns on rocky hilltop Athens",                    "warm cream Pentelic marble, honey-gold weathered limestone, pale grey shadow"),
    ("stonehenge",        "Stonehenge, ring of massive upright grey sarsen stones on chalk plain",         "mottled mid-grey sarsen sandstone, dark charcoal lichen patches, pale buff soil"),
    ("sagrada_familia",   "Sagrada Familia, towering spired basilica with organic carved stone facade",    "warm sandy-beige Montjuic stone, golden ochre carved detail, cream-white towers"),
    ("big_ben",           "Elizabeth Tower Big Ben, tall Gothic clock tower beside Thames",                "pale cream Portland stone, verdigris green copper clock faces, bright gold clock hands and numerals"),
    ("edin_castle",       "Edinburgh Castle, medieval fortress on black volcanic basalt rock",             "dark charcoal basalt crag, rough mid-grey stone walls, muted brown battlements"),
    ("neuschwanstein",    "Neuschwanstein Castle, fairy-tale castle on forested alpine cliff",             "bright white limestone walls, blue-grey slate roof tiles, warm cream cylindrical towers"),
    ("notre_dame",        "Notre-Dame Cathedral Paris, Gothic cathedral with flying buttresses and towers","cool medium grey limestone, darker aged stone, pale buff mortar joints"),
    ("tower_bridge",      "Tower Bridge London, Victorian bascule bridge with two Gothic towers",          "pale Portland stone towers, dark slate-blue painted steelwork, white ironwork railings"),
    ("colognecathedral",  "Cologne Cathedral, twin-spired Gothic cathedral soaring above Rhine river",    "very dark charcoal-grey limestone, nearly black aged facade, light grey mortar lines"),
    ("versailles",        "Palace of Versailles, grand baroque palace with golden iron gate",              "warm cream stone facade, soft gold leaf accents, grey-blue mansard roof, emerald garden"),
    ("santorini",         "Santorini Oia village, whitewashed cubic buildings with iconic domed church",   "brilliant chalk white washed walls, iconic cobalt blue domes, warm terracotta accents"),
    ("meteora",           "Meteora monasteries, stone monastery buildings atop sheer conglomerate pillars","honey-gold conglomerate rock pillars, warm amber-orange stone, terracotta roof tiles"),
    ("matterhorn",        "Matterhorn, perfect pyramid peak rising above alpine valley",                   "dark charcoal grey rocky ridges and faces, brilliant white glacial snow cap, sharp black summit"),
    ("cliffs_moher",      "Cliffs of Moher, dramatic sheer vertical sea cliffs on Irish Atlantic coast",   "near-black dark grey shale and siltstone layers, vivid emerald green grass on cliff top, white surf"),
    # Asia
    ("angkor_wat",        "Angkor Wat, grand Khmer temple with five lotus towers and jungle",              "warm grey-brown sandstone blocks, dark green moss and jungle overgrowth, amber weathering"),
    ("borobudur",         "Borobudur, terraced Buddhist stupa with rows of latticed stone bell stupas",    "dark grey andesite volcanic stone, charcoal-black lichen, cool blue-grey shadow"),
    ("tokyo_skytree",     "Tokyo Skytree, ultra-tall tapering lattice communications tower",               "pale blue-white gradient tower body, deep indigo-blue upper observation bands, white tip"),
    ("mount_fuji",        "Mount Fuji, iconic symmetrical stratovolcano sacred mountain Japan",            "brilliant white snow and glacial ice cap, dark charcoal-grey volcanic ash slopes below"),
    ("fushimi_inari",     "Fushimi Inari shrine, dense tunnel of vermillion torii gates in cedar forest",  "bright vermillion-red lacquered wood, jet black kanji text on pillars, dark green cedar"),
    ("osaka_castle",      "Osaka Castle, multi-tiered Japanese castle keep with decorative gables",        "bright white plaster walls, vivid emerald-green glazed tile roofs, gold shachi ornament"),
    ("burj_khalifa",      "Burj Khalifa, world's tallest slender tapering glass and steel skyscraper",    "polished silver reflective glass curtain wall, pale blue sky reflection, champagne gold steel fins"),
    ("ta_prohm",          "Ta Prohm temple, ancient ruins with massive strangler fig tree roots on stone", "dark grey-brown laterite stone, warm amber sandstone, vivid green jungle roots and moss"),
    ("potala_palace",     "Potala Palace Lhasa, massive multi-storey palace on Marpo Ri hill",             "brilliant white lower Potrang Karpo palace, deep crimson-red Potrang Marpo upper palace, bright gold roofs"),
    ("forbidden_city",    "Forbidden City Beijing, red walled imperial palace complex with grand gate",    "deep vermillion-red walls, gleaming golden-yellow glazed tile roof, white marble terrace"),
    ("petronas",          "Petronas Twin Towers, twin postmodern steel skyscrapers with sky bridge",        "polished stainless steel silver, pale warm grey concrete, reflective blue-silver glass"),
    ("hagia_sophia",      "Hagia Sophia Istanbul, vast domed mosque with four tall pencil minarets",       "warm buff limestone exterior, pale rose-cream lead dome, bright white pencil minarets"),
    ("cappadocia",        "Cappadocia fairy chimneys, tall cone-shaped volcanic tuff rock formations",     "soft honey-beige volcanic tuff, warm ochre and cream rock, dusty rose-pink cones"),
    ("terracotta_army",   "Terracotta Army, thousands of life-size ancient clay warrior statues in rows",  "muted earthy terracotta orange-brown clay, grey unglazed clay, faded remnant pigment"),
    ("tigers_nest",       "Tiger's Nest Paro Taktsang monastery, clinging to sheer vertical cliff face",   "brilliant white painted walls, dark maroon-red window trim and roof, colourful prayer flags"),
    ("sigiriya",          "Sigiriya Lion Rock Fortress, dramatic flat-topped red rock monolith",           "deep brick-red laterite rock, warm rust-orange, vivid dark green jungle base"),
    ("western_wall",      "Western Wall Jerusalem, ancient massive limestone ashlar block retaining wall", "pale buff-cream Jerusalem limestone, warm honey-gold stone, aged grey mortar joints"),
    # Africa
    ("pyramid_giza",      "Great Pyramid of Giza with Sphinx, massive ancient Egyptian limestone pyramid", "warm pale tan-beige limestone, aged sandy-gold casing stone, golden desert sand base"),
    ("table_mountain",    "Table Mountain, perfectly flat-topped sandstone massif above Cape Town city",   "warm russet-brown Table Mountain sandstone, grey cliff face, patches of green fynbos shrub"),
    ("kilimanjaro",       "Mount Kilimanjaro, snow-capped dormant stratovolcano rising above savanna",     "brilliant white glacial ice cap, dark brown-black volcanic rock, golden savanna below"),
    ("victoria_falls",    "Victoria Falls Mosi-oa-Tunya, massive curtain waterfall with rainbow mist",    "brilliant white spray mist, deep jade-green river water above, vivid emerald jungle"),
    ("morocco_mar",       "Marrakech Medina Djemaa el-Fna square, terracotta city with ornate arches",    "warm dusty rose-pink terracotta buildings, turquoise and cobalt zellige tile, saffron gold lanterns"),
    ("maasai_mara",       "Maasai Mara, lone umbrella acacia tree silhouette on golden savanna at sunset", "warm amber-gold savanna grass, flat-topped dark green acacia, burnt-orange sunset sky"),
    # Americas
    ("statue_liberty",    "Statue of Liberty, full figure with raised torch and crown on granite pedestal","pale blue-green verdigris copper, oxidised teal-turquoise patina, pale cream granite pedestal"),
    ("mt_rushmore",       "Mount Rushmore, four US presidents carved in grey granite mountain face",       "cool medium grey granite, lighter grey carved portrait faces, dark pine-green forest below"),
    ("golden_gate",       "Golden Gate Bridge, iconic suspension bridge with tall towers over bay",        "international orange red-orange paint, warm burnt sienna, pale grey concrete tower bases"),
    ("grand_canyon",      "Grand Canyon, vast layered canyon walls with Colorado River far below",         "deep rust-red Redwall limestone, purple-grey Tonto platform, bright buff Coconino sandstone layers"),
    ("iguazu_falls",      "Iguazu Falls, wide horseshoe waterfall system surrounded by rainforest",        "brilliant turquoise-blue churning water, vivid emerald green jungle, white mist spray"),
    ("galapagos",         "Galapagos volcanic island shoreline with black lava and marine iguanas",        "jet black aa lava rock shoreline, deep sapphire-blue Pacific, teal-green prickly pear cactus"),
    ("teotihuacan",       "Teotihuacan Pyramid of the Sun, massive ancient three-tier stepped pyramid",    "weathered pale grey-tan volcanic stone, dusty beige limestone, warm ochre adobe plaster"),
    ("easter_island",     "Easter Island Moai, row of large stone head statues on grassy volcanic slope",  "rough dark grey basalt volcanic stone, warm brown-grey tuff topknots, lush green grass hillside"),
    ("tulum",             "Tulum El Castillo ruin, stone temple on limestone cliff above Caribbean sea",   "weathered pale grey limestone walls, warm cream stone, vivid turquoise Caribbean below"),
    ("angel_falls",       "Angel Falls, world's tallest waterfall ribbon on flat-topped tepui mountain",   "white waterfall ribbon, burnt orange-red sandstone tepui cliff face, lush dark green jungle"),
    ("salar_uyuni",       "Salar de Uyuni Bolivia, vast perfectly flat white salt flat sky mirror",        "brilliant white hexagonal salt crystal crust, perfect mirror-blue sky reflection, pale horizon"),
    ("niagara_falls",     "Niagara Falls Horseshoe Falls, massive curved waterfall with mist",             "deep jade-green river water flowing over edge, brilliant white churning foam, pale rainbow mist"),
    # Oceania
    ("sydney_opera",      "Sydney Opera House, interlocking white shell vault roof on harbour peninsula",  "bright off-white precast concrete chevron tile panels, cream surface, deep blue harbour water"),
    ("uluru",             "Uluru Ayers Rock, enormous smooth rounded red sandstone monolith in desert",    "deep burnt-orange red arkose sandstone, vivid rust-red surface, warm terracotta, red ochre soil"),
    ("great_barrier_reef","Great Barrier Reef underwater scene, vivid coral reef with tropical fish",      "vivid coral pink and orange staghorn coral, purple sea fan, electric turquoise shallow water"),
    ("milford_sound",     "Milford Sound Piopiotahi, deep fjord with Mitre Peak and hanging waterfall",    "dark charcoal-grey granite Mitre Peak, deep emerald-green fjord water, white waterfall ribbon"),
    # Natural
    ("mt_everest",        "Mount Everest summit pyramid, world's highest peak in Himalayas",               "brilliant white glacial snow and blue ice, dark grey-black rocky ridges, deep cobalt blue sky"),
    ("ha_long_bay",       "Ha Long Bay, thousands of grey limestone karst islands rising from sea",        "dark grey-green karst limestone pillars, deep jade-emerald green water, pale morning mist"),
    ("swiss_alps",        "Jungfraujoch, jagged snow-covered Alps peaks with glacier and blue sky",        "brilliant white glacial snow, pale blue-white glacial ice, dark grey rocky ridges, cobalt blue sky"),
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def submit_job(name: str, prompt: str, color: str) -> str | None:
    full_prompt = f"{prompt}, {color}, {STYLE_SUFFIX}"
    body = {
        "mode": "preview",
        "prompt": full_prompt,
        "negative_prompt": NEG_PROMPT,
        "art_style": "realistic",
        "topology": "quad",
        "target_polycount": 30000,
    }
    r = requests.post(BASE_URL, headers=HEADERS, json=body, timeout=30)
    if r.status_code in (200, 201, 202):
        task_id = r.json().get("result")
        print(f"  [SUBMIT] {name} → task {task_id}")
        return task_id
    else:
        print(f"  [ERROR]  {name} → {r.status_code} {r.text[:120]}")
        return None


def poll_until_done(task_id: str, name: str) -> str | None:
    deadline = time.time() + MAX_WAIT
    while time.time() < deadline:
        r = requests.get(f"{BASE_URL}/{task_id}", headers=HEADERS, timeout=15)
        data = r.json()
        status = data.get("status", "")
        if status == "SUCCEEDED":
            glb_url = data.get("model_urls", {}).get("glb")
            print(f"  [DONE]   {name} → {glb_url}")
            return glb_url
        elif status in ("FAILED", "EXPIRED"):
            print(f"  [FAIL]   {name} → {status}: {data.get('task_error', {}).get('message', '')}")
            return None
        else:
            pct = data.get("progress", 0)
            print(f"  [WAIT]   {name} ({status} {pct}%) …")
            time.sleep(POLL_INTERVAL)
    print(f"  [TIMEOUT] {name}")
    return None


def download_glb(url: str, name: str):
    out_path = OUTPUT_DIR / f"{name}.glb"
    if out_path.exists():
        print(f"  [SKIP]   {name}.glb already exists")
        return
    r = requests.get(url, timeout=120, stream=True)
    out_path.write_bytes(r.content)
    print(f"  [SAVED]  {out_path.name} ({len(r.content)//1024} KB)")


def load_progress() -> dict:
    p = Path("meshy_progress.json")
    return json.loads(p.read_text()) if p.exists() else {}


def save_progress(progress: dict):
    Path("meshy_progress.json").write_text(json.dumps(progress, indent=2))


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    progress = load_progress()  # {name: task_id or "done"}

    pending = [(n, p, c) for n, p, c in MONUMENTS if progress.get(n) != "done"]
    print(f"\n{len(MONUMENTS)} monuments total — {len(pending)} remaining\n")

    # Process in batches of CONCURRENT
    i = 0
    while i < len(pending):
        batch = pending[i:i+CONCURRENT]
        task_ids = {}

        # Submit batch
        print(f"── Batch {i//CONCURRENT + 1} ({'  '.join(n for n,_,_ in batch)}) ──")
        for name, prompt, color in batch:
            if name in progress and progress[name] not in ("done",):
                # Resume existing task
                task_ids[name] = progress[name]
                print(f"  [RESUME] {name} → task {progress[name]}")
            else:
                tid = submit_job(name, prompt, color)
                if tid:
                    task_ids[name] = tid
                    progress[name] = tid
                    save_progress(progress)
                time.sleep(1)  # avoid rate limit

        # Poll all in batch until done
        remaining = dict(task_ids)
        while remaining:
            for name in list(remaining):
                r = requests.get(f"{BASE_URL}/{remaining[name]}", headers=HEADERS, timeout=15)
                data = r.json()
                status = data.get("status", "")
                if status == "SUCCEEDED":
                    glb_url = data.get("model_urls", {}).get("glb")
                    if glb_url:
                        download_glb(glb_url, name)
                    progress[name] = "done"
                    save_progress(progress)
                    del remaining[name]
                elif status in ("FAILED", "EXPIRED"):
                    print(f"  [FAIL]   {name} → {data.get('task_error', {})}")
                    del remaining[name]
                else:
                    pct = data.get("progress", 0)
                    print(f"  [WAIT]   {name} {pct}%")
            if remaining:
                time.sleep(POLL_INTERVAL)

        i += CONCURRENT

    print(f"\n✓ Done. GLBs saved to {OUTPUT_DIR}")
    print("Next: update the MODELS registry in app/plan/location/page.tsx to reference each file.")


if __name__ == "__main__":
    if not MESHY_API_KEY:
        print("ERROR: MESHY_API_KEY is not set.")
        print("Add it to .env.local:  MESHY_API_KEY=msy_xxxxxxxxxxxx")
        print("Get your key at https://www.meshy.ai → Account → API Key")
        exit(1)
    main()
