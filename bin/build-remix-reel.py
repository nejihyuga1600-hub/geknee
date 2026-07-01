#!/usr/bin/env python3
"""Build one geknee remix reel from stock footage + optional reference stills.

For a given concept (search queries + cut list + caption + optional image_refs),
pulls N Pexels clips and normalizes them to 1080x1920 vertical. If image_refs
is set, Ken-Burns animates each reference still into a same-size clip. Stills
are appended after the video clips, then a @geknee.travel watermark + hook
overlay is burned in. Outputs MP4 + caption.txt + sources.txt.

image_refs sources (see bin/fetch-reddit-travel.py + bin/list-influencer-virals.py):
  {"source": "reddit", "id": "<post_id>", "secs": 5.0, "motion": "zoom-in"}
      → resolves via ad-assets/reddit-travel/index.jsonl
  {"source": "influencer-thumb", "code": "<ig_code>", "secs": 4.0, "motion": "pan-right"}
      → resolves via hq-creative-loop/reference/scraped-reels-*/
  {"source": "path", "path": "/abs/path.jpg"}
      → arbitrary local file

Motion options: "zoom-in" (default), "zoom-out", "pan-right", "pan-left".

usage:
  python3 bin/build-remix-reel.py <concept_id>
  # where concept_id is one of the CONCEPTS keys defined below.
"""
from __future__ import annotations
import json, os, subprocess, sys
from pathlib import Path
from datetime import date

sys.path.insert(0, str(Path(__file__).parent))
from pexels_fetch import search_videos, download, best_file
from badge_reveal_gen import make_reveal_card

BADGES = Path.home() / "geknee" / "public" / "brand" / "monuments"
CARDS = Path.home() / "geknee" / "public" / "monument-cards"

OUT_ROOT = Path.home() / "geknee" / "ad-assets" / "instagram" / "remix" / date.today().isoformat()
TMP_ROOT = OUT_ROOT / "_tmp"

# ─── Concepts: each = one finished reel ────────────────────────────────
# `queries` is searched in order; clips deduped across queries.
# `hook` shows top-center, watermark always bottom-right.
# `caption` is the IG-post body.
#
# ── Authoring rules (locked 2026-06-22 v2) ──
# 1. NO apostrophes in hook/body/cta_text — ffmpeg drawtext escaping breaks.
#    Use "isnt" not "isn't", "cant" not "can't", etc.
# 2. NO colons in burned-in text — ffmpeg escapes a colon at sub-line end as
#    literal `\` which breaks the word. Use the middle dot `·` separator.
#
# ── 3-Act timing (engineered for 5s+ retention) ──
# Act 1 — HOOK            0   → 3.0s   : pattern-interrupt, viral-hook template
# Act 2 — BODY (FACTS)    3.0 → 6.0s   : 2-3 lines of pure facts, no quest
# Act 3 — CTA (QUEST)     6.0 → end    : "go to <X>" / "do this · <X>" action
# Reveal card             (appended)   : monument skin + save geknee
#
# 3. Hook: apply viral hook templates — "what if I told you...", "stop X do Y",
#    "watch this before...", "the X no one talks about", "never thought I'd...",
#    "you used to think...". Keep it 6-12 words across ≤3 short lines.
# 4. Body: ONLY facts. e.g. "82m drop · 2.7km wide · rainforest on both sides".
#    No quest, no @geknee. 2-3 short lines. Each fact ≤25 chars to avoid wrap.
# 5. CTA: starts with "go to" or "do this ·" — a concrete action the viewer
#    can plan around. e.g. "go to garganta del diablo at high noon".
#    Keep ≤35 chars total, ≤2 lines.
# 6. Reveal: vary the tier (Stone / Bronze / Silver / Gold / Diamond / Aurora /
#    Celestial / Damascus) per concept for visual variety. Verify badge file
#    exists at /public/brand/monuments/<tier>/<key>_<tier>.jpg before authoring.
# 7. NEVER compare monuments to each other anywhere — comparisons read as
#    dismissive by viewers who love the other monument.
# 8. Pacing: n_clips=6, clip_secs=1.8 (more cuts = better retention).
# 9. First search query MUST be a detail/close-up, not a wide aerial.
CONCEPTS = {
    "spin-the-globe": {
        "search_queries": ["spinning globe earth", "world map travel", "compass map travel"],
        "n_clips": 4,
        "clip_secs": 4.5,
        "hook": "every AI planner\nmakes you type.\ngeknee makes\nyou spin.",
        "caption": (
            "spin earth. plan a trip.\n\n"
            "every other planner asks \"where to?\" — @geknee.travel asks \"spin.\"\n"
            "you tap a city. a quest drops. stand under the monument. badge unlocks.\n\n"
            "275 monuments. real-life check-in.\n"
            "save this for the next saturday.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#TravelGlobe #PassportChronicles #BucketListProof #SoloTravelTips #gekneequest\n\n"
            "🎵 PAIR WITH: trending cinematic-travel audio (sample from @polarsteps / @beautifuldestinations recent reels)"
        ),
        "based_on": "polarsteps DKO7zJ3ssf5 — 'This is our story (so far)' brand-story format",
    },
    "hidden-valley": {
        "search_queries": ["mountain valley fog", "green meadow himalaya", "glacier river mountains"],
        "n_clips": 4,
        "clip_secs": 5.0,
        "hook": "the valleys\ngoogle won't\nshow you.\nspin earth instead.",
        "caption": (
            "the valleys google won't show you.\n\n"
            "275 monuments on @geknee.travel — half of them you've never heard of. "
            "spin the globe, drop on chunda valley, machu picchu, the bagan plain. quest drops. "
            "stand under it. badge unlocks. proof you were there.\n\n"
            "no algorithm choosing for you. just earth.\n\n"
            "save this for the next time you want OUT of the algorithm.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#HiddenTravel #OffTheBeatenPath #SlowTravel #MysticOutlands #gekneequest"
        ),
        "based_on": "beautifuldestinations DUyGb6tjKhv — Chunda Valley Pakistan destination spotlight",
    },
    "jurassic-island": {
        "search_queries": ["jurassic park waterfall island", "tropical waterfall jungle", "volcanic cliffs ocean"],
        "n_clips": 4,
        "clip_secs": 5.0,
        "hook": "this island in portugal\nfeels like jurassic park.\n12 monuments.\n1 quest.",
        "caption": (
            "this island in portugal feels like jurassic park.\n\n"
            "flores. azores. waterfalls crashing into the ocean. volcanic cliffs.\n"
            "@geknee.travel maps 12 monuments across the azores. one is on flores. one is on faial. "
            "stand under each. badge unlocks. you have receipts.\n\n"
            "save this for the next time someone says \"there's nothing to do.\"\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#AzoresTravel #PortugalTravel #IslandHopping #BucketListProof #gekneequest"
        ),
        "based_on": "beautifuldestinations DY44AthKj80 — Flores Island Portugal comparison hook",
    },
    "forget-maldives": {
        "search_queries": ["okinawa beach drone", "tropical beach turquoise water", "snorkeling coral reef"],
        "n_clips": 4,
        "clip_secs": 4.5,
        "hook": "forget\nthe maldives.\n27 monuments.\nzero crowds.",
        "caption": (
            "forget the maldives.\n\n"
            "okinawa: 27 monuments on @geknee.travel. zero crowds. "
            "shurijo castle. churaumi aquarium. emerald beach.\n"
            "spin the globe. tap okinawa. quest drops. stand under it. badge unlocks.\n\n"
            "april–june. car rental. that's it.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#OkinawaTravel #JapanTravel #BeachEscape #HiddenGems #gekneequest"
        ),
        "based_on": "beautifuldestinations DGLUo_6tKgY — Okinawa 'Forget the Maldives' contrarian hook",
    },
    "wild-camping": {
        "search_queries": ["wild camping tent sunset", "campervan night stars", "remote campsite mountain"],
        "n_clips": 4,
        "clip_secs": 5.0,
        "hook": "wild camping\nis the cheat code.\n365 sunrises.\n365 badges.",
        "caption": (
            "wild camping is the cheat code.\n\n"
            "no booking. no check-in. change spot every night. "
            "@geknee.travel maps every monument within walking distance of every campsite. "
            "drop the pin. drive there. badge unlocks.\n\n"
            "365 different sunrises. 365 different badges.\n\n"
            "save this for the next time you want OUT of a hotel.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#WildCamping #VanLife #SlowTravel #OffGrid #gekneequest"
        ),
        "based_on": "polarsteps DZHWD0_oer7 — 'WILD CAMPING is one of our favorite things' adventure",
    },
    # ── Reddit-pain-derived concepts (carousel-concepts-from-reddit.md) ──
    "spreadsheet-trauma": {
        "search_queries": [
            "laptop coffee shop overwhelmed",
            "writing notebook frustrated",
            "spinning globe earth",
            "tokyo skyline aerial",
        ],
        "n_clips": 4,
        "clip_secs": 4.0,
        "hook": "you built\na spreadsheet\nfor a trip.\nnow it IS\nthe trip.",
        "caption": (
            "column A: place. column B: cost. column C: regret.\n\n"
            "every japan trip starts as a spreadsheet. by the time you land, the spreadsheet is the trip.\n\n"
            "geknee makes you spin earth instead. AI cuts the days you'd skip anyway. "
            "it shows up as an itinerary, not a tab.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SpontaneousTravel #JapanTravel #TravelGlobe #PlanYourTrip #gekneequest\n\n"
            "🎵 PAIR WITH: SPEND DAT SAX (Corey Staggers) audio ID 27043767605285229 — product-reveal beat"
        ),
        "based_on": "carousel #1 — Reddit r/JapanTravel spreadsheet trauma (T3, 48 posts × 12 subs)",
    },
    "prove-3-of-47": {
        "search_queries": [
            "passport blank page hand",
            "eiffel tower sunset",
            "machu picchu sunrise mist",
            "world map pin travel",
        ],
        "n_clips": 4,
        "clip_secs": 4.0,
        "hook": "47 countries.\ni can only\nprove 3.\nthe EU stopped\nstamping in april.",
        "image_refs": [
            {"source": "influencer-thumb", "code": "DUyGb6tjKhv", "secs": 4.0, "motion": "zoom-in"},
        ],
        "caption": (
            "i've been to 47 countries. i can only prove 3.\n\n"
            "the EU stopped stamping passports in april. your travel history is now a vibe.\n\n"
            "geknee built the digital stamp. stand under the monument. phone verifies via GPS + street view. "
            "badge unlocks. rarity tiers from stone to celestial. couch flexes don't count.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#PassportStamps #BucketListProof #PassportChronicles #ProofOfTravel #gekneequest\n\n"
            "🎵 PAIR WITH: Wings (Birdy sped-up nightcore) audio ID 500331368617006 — cinematic emotional"
        ),
        "based_on": "carousel #3 — Reddit r/PassportPorn + r/travel post-EES (T6, 22 posts, 21/22 in PassportPorn)",
    },
    "tokyo-day-1-check": {
        "search_queries": [
            "tokyo shibuya crowd",
            "tokyo metro station rush",
            "solo traveler tokyo street",
            "tokyo neon night street",
        ],
        "n_clips": 4,
        "clip_secs": 4.0,
        "hook": "day 1 in tokyo.\nreal quote:\n\"i check the train\n10x before\nleaving the hotel.\"",
        "caption": (
            "\"i have to check like 10x just to make sure i don't mess anything up.\"\n\n"
            "actual quote from a first-day solo traveler in tokyo. you've felt it.\n\n"
            "the issue isn't tokyo. it's starting cold. geknee runs day 1. narita to shibuya, "
            "the train, the cheap restaurant at 6pm, the back-up plan.\n\n"
            "you don't plan. you spin and step off the plane.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SoloTravelDiaries #JapanTravel #TravelGlobe #CityGuide #gekneequest\n\n"
            "🎵 PAIR WITH: Life Feels So Good (napsea) audio ID 1500685161139439 — carefree antidote"
        ),
        "based_on": "carousel #4 — Reddit r/solotravel quoted user (T2, 86 posts × 13 subs)",
    },
    "most-asked-question": {
        "search_queries": ["solo female traveler", "backpacker hiking trail", "woman traveler mountains"],
        "n_clips": 4,
        "clip_secs": 5.0,
        "hook": "most asked:\n\"how do you decide\nwhere to go?\"\nhonest answer:\ni don't. i spin.",
        "caption": (
            "one of my most asked questions ever:\nhow do you decide where to go?\n\n"
            "honest answer: i don't.\ni spin the globe on @geknee.travel.\ntap a city.\nquest drops.\n"
            "go.\n\n"
            "no algorithm. no top-10 list. no tripadvisor. just earth, picking for me.\n\n"
            "save this for the next time you're paralyzed by choice.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SoloTravel #TravelHacks #SpinTheGlobe #BucketList #gekneequest"
        ),
        "based_on": "polarsteps DY9_4peI6ru — hitchhikercourtney solo travel POV (193 likes, Shania Twain audio)",
    },
    # ── batch 2 — variety set (comedy / jaw-drop / motivation) ─────────────
    # Snappier rhythm: clip_secs=2.5 + n_clips=5 lands a B-roll cut every
    # 2-3s (memory rule project_pinterest_in_pipeline.md). Each concept
    # ends with a reusable lavender CTA still-card (image_refs path) that
    # drives traffic to the waitlist.
    "spreadsheet-monster": {
        "search_queries": [
            "typing laptop close up",
            "messy desk paperwork",
            "frustrated person laptop",
            "spreadsheet office computer",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "pov your trip spreadsheet ate your trip.",
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "pov your trip spreadsheet ate your trip.\n\n"
            "tab 47. row 312. you opened it to plan a weekend in lisbon.\n"
            "now it has its own version history. its own opinions. its own enemies.\n\n"
            "close it. spin earth instead. geknee runs day 1. you just go.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SpontaneousTravel #TravelHacks #PlanYourTrip #SoloTravelDiaries #gekneequest\n\n"
            "🎵 PAIR WITH: trending escalating-chaos audio (Cassidy 'wait til the beat drop' or similar)"
        ),
        "based_on": "comedy bucket — spreadsheet-trauma sibling, escalates the absurdism instead of the relief",
    },
    "socotra-alien-trees": {
        "search_queries": [
            "dragon blood tree socotra",
            "desert island sunset rocks",
            "remote island formations",
            "alien landscape island",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "this island has trees that bleed red sap.",
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "this island has trees that bleed red sap.\n\n"
            "socotra. yemen. unesco-protected. dragon-blood trees, endemic to one island only — 1,000 years old, look like umbrellas from a different planet.\n\n"
            "zero direct flights. 1 charter every 3 months. that's why the @geknee.travel badge for socotra sits in celestial tier — the rarest in the game.\n\n"
            "save this for the bucket-list scroll you keep doing.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Socotra #HiddenTravel #BucketList #MysticOutlands #gekneequest\n\n"
            "🎵 PAIR WITH: cinematic-discovery audio (sample from @beautifuldestinations Socotra reels — Hans Zimmer-coded)"
        ),
        "based_on": "jaw-drop bucket — rarity-tier framing, leans into the 'mystic outlands' aesthetic memory rule",
    },
    "one-saturday-rule": {
        "search_queries": [
            "airplane window sunrise",
            "passport boarding pass close up",
            "subway commute monday morning",
            "city street weekend traveler",
            "cafe morning coffee window",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "your next trip starts on a saturday.",
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "your next trip starts on a saturday.\n\n"
            "5 days at a desk. one saturday in a city you've never been. the math always works.\n\n"
            "@geknee.travel turns 'someday' into 'this weekend' — pick a city tonight, fly saturday morning, badge unlocks by sunday. you're back at the desk monday with a real story.\n\n"
            "couch flexes don't count.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#WeekendTrip #SoloTravelDiaries #SpontaneousTravel #TravelHacks #gekneequest\n\n"
            "🎵 PAIR WITH: motivational montage audio (sample from @hitchhikercourtney 'lift off' reels — building synth)"
        ),
        "based_on": "motivation bucket — anti-procrastination framing, ties planning friction to a specific weekday CTA",
    },
    # ── batch 3 — variety set #2 (comedy / jaw-drop / motivation) ───────────
    "tabs-vs-globe": {
        "search_queries": [
            "many tabs browser screen",
            "frustrated person screen",
            "laptop close up typing fast",
            "spinning globe earth animation",
            "world map travel planning",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "27 chrome tabs. zero plans.",
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "27 chrome tabs. zero plans.\n\n"
            "tripadvisor, reddit, two booking tabs, the wirecutter \"best\" guide, a youtube travel vlog you watched 3 minutes of.\n\n"
            "close them. one tab. one globe. tap a city. trip drops.\n"
            "geknee turns research-paralysis into an itinerary in under a minute.\n\n"
            "save this for the next time chrome eats your saturday.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#TravelPlanning #TravelHacks #SpontaneousTravel #PlanYourTrip #gekneequest\n\n"
            "🎵 PAIR WITH: relief/release audio (calm beat-drop after chaos build — sample from @polarsteps recent travel-hack reels)"
        ),
        "based_on": "comedy bucket — research-paralysis caricature, ties the tab-hoarder archetype to a one-tap relief CTA",
    },
    "norway-fjords": {
        "search_queries": [
            "norway fjord drone aerial",
            "scandinavia mountains snow",
            "fjord boat cruise water",
            "norway waterfall cliff",
            "geirangerfjord drone",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "this is one ferry away from your office.",
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "this is one ferry away from your office.\n\n"
            "geirangerfjord. norway. 9 hours london to bergen, then 6 hours by ferry through cliffs that drop 4,000 feet into the water.\n\n"
            "@geknee.travel maps 18 monuments across the norwegian fjords — stand at any of them, gps + street view verifies, badge unlocks. silver-tier minimum because effort earns the rarity.\n\n"
            "save this for the next time \"too far\" stops you.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#NorwayTravel #Fjords #ScandinaviaTravel #BucketList #gekneequest\n\n"
            "🎵 PAIR WITH: cinematic-discovery audio (sample from @beautifuldestinations Norway reels — orchestral swell)"
        ),
        "based_on": "jaw-drop bucket — Pexels has dense fjord coverage, anti-'too far' framing converts hesitation",
    },
    "grandparent-regret": {
        "search_queries": [
            "elderly hands holding photo",
            "old hands wrinkled fingers",
            "vintage travel polaroid photos",
            "passport stamps close up",
            "airplane window flying over mountains",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "ask anyone over 70 about regret.",
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "ask anyone over 70 about regret.\n\n"
            "it's never the trip they took. it's always the one they postponed.\n"
            "the one they were going to take \"next year.\" the one the kids made too complicated. the one the spreadsheet ate.\n\n"
            "@geknee.travel makes \"next year\" a saturday.\n\n"
            "pick a city tonight. you'll thank yourself at 70.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SoloTravelDiaries #SlowTravel2026 #BucketListProof #TravelMotivation #gekneequest\n\n"
            "🎵 PAIR WITH: emotional cinematic audio (sample from @nasdaily \"the trip you'll regret\" reels — minor-key piano)"
        ),
        "based_on": "motivation bucket — memento-mori framing, leverages elder-regret as proof-from-authority",
    },
    # ── batch 4 — variety set #3 (comedy / jaw-drop / motivation) ───────────
    "dating-app-but-cities": {
        "search_queries": [
            "person scrolling phone close up",
            "lisbon city aerial sunset",
            "tokyo cityscape neon night",
            "paris eiffel tower street",
            "person holding phone outdoors travel",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "what if dating apps were for cities.",
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "what if dating apps were for cities.\n\n"
            "swipe left: been there. swipe right: never.\n"
            "lisbon's bio says \"30°C and pastéis.\" tokyo's says \"i'm complicated.\" reykjavik says \"i'll change you.\"\n\n"
            "@geknee.travel turns the globe into your saturday matchmaker — earth picks the city, quest drops, you go.\n\n"
            "save this for the next time tripadvisor ghosts you.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#TravelHumor #SoloTravelDiaries #SpinTheGlobe #TravelMatchmaker #gekneequest\n\n"
            "🎵 PAIR WITH: gen-Z lofi dating-app parody audio (sample from tiktok dating-app meme trends)"
        ),
        "based_on": "comedy bucket — Tinder parody applied to cities, lands the algorithm/swipe metaphor that already lives in everyone's pocket",
    },
    "iceland-black-sand": {
        "search_queries": [
            "reynisfjara black sand beach iceland",
            "iceland basalt columns rock",
            "iceland waterfall cliff",
            "iceland glacier ice cave blue",
            "iceland aurora northern lights",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "the beach with no color.",
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "the beach with no color.\n\n"
            "reynisfjara. iceland's south coast. black volcanic sand, basalt columns 60 feet tall, sneaker-waves that have pulled tourists into the atlantic.\n\n"
            "6 hours by car from reykjavik. 8 monuments on @geknee.travel just along this one drive — diamond tier on the sneaker-wave one because you have to be brave enough to stand close.\n\n"
            "save this for the next iceland trip you keep researching.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#IcelandTravel #Reynisfjara #BucketList #MysticOutlands #gekneequest\n\n"
            "🎵 PAIR WITH: dark cinematic audio (sample from @beautifuldestinations Iceland reels — Sigur Rós-coded ambient)"
        ),
        "based_on": "jaw-drop bucket — Pexels has dense Iceland coverage; rarity-tier hook ties danger to badge value",
    },
    "friday-5pm-airport": {
        "search_queries": [
            "office workers leaving evening",
            "subway commute rush hour",
            "airport sunset terminal travelers",
            "airplane window sunset golden hour",
            "person walking airport luggage",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "5pm friday. your boss won't notice.",
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "5pm friday. your boss won't notice.\n\n"
            "the trick to weekend travel: the flight leaves before they finish reading your slack message.\n\n"
            "@geknee.travel runs the boring part. you tap a city tonight, geknee picks the 6:40pm flight, drops a 36-hour itinerary, books the airbnb near the metro. monday you're back at the desk with one new badge.\n\n"
            "save this for the next \"i need a long weekend.\"\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#WeekendTrip #DigitalNomadDiaries #SoloTravelDiaries #TravelHacks #gekneequest\n\n"
            "🎵 PAIR WITH: lift-off motivational audio (sample from @hitchhikercourtney friday-night escape reels — building synth)"
        ),
        "based_on": "motivation bucket — Pareto-optimal scarcity (the weekend) tied to specific timestamps for relatability",
    },
    # ── batch 5 — 3-ACT FORMAT (hook → body → CTA, time-gated overlays) ──
    # Research note: top-performing 2026 IG Reels structure copy as 3 acts:
    #   0-3s   HOOK — pattern interrupt or curiosity gap
    #   3-10s  BODY — specifics / proof that pay off the hook
    #   10-end CTA  — explicit action ("save this", URL, comment trigger)
    # apply_overlays() now time-gates each act via ffmpeg `enable=`. Concept
    # below is the 3-act re-cut of iceland-black-sand — same Pexels queries
    # so the comparison is apples-to-apples on copy structure only.
    "iceland-3act": {
        "search_queries": [
            "reynisfjara black sand beach iceland",
            "iceland basalt columns rock",
            "iceland waterfall cliff",
            "iceland glacier ice cave blue",
            "iceland aurora northern lights",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        # 0-3s
        "hook": "the beach with no color.",
        # 3-10s — pays off the hook with the proof + specificity
        "body": "reynisfjara · iceland\n60-ft basalt cliffs\nsneaker-waves that kill",
        # 10s-end — explicit action right before the end-card hits
        "cta_text": "save → next iceland trip",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "the beach with no color.\n\n"
            "reynisfjara. iceland's south coast. black volcanic sand, basalt columns 60 feet tall, sneaker-waves that have pulled tourists into the atlantic.\n\n"
            "6 hours by car from reykjavik. 8 monuments on @geknee.travel along this one drive — diamond tier on the sneaker-wave one because you have to be brave enough to stand close.\n\n"
            "save this for the next iceland trip you keep researching.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#IcelandTravel #Reynisfjara #BucketList #MysticOutlands #gekneequest\n\n"
            "🎵 PAIR WITH: dark cinematic audio (Sigur Rós-coded ambient)"
        ),
        "based_on": "3-act format demo — same source as iceland-black-sand, restructured copy as hook + body + CTA",
    },

    # ── batch 6 — 3-ACT FORMAT, fresh concepts (2026-06-17) ──
    # All three are authored hook + body + cta_text so every act burns into
    # the video via apply_overlays time-gating. Pexels coverage triple-checked
    # against the queries (avoiding socotra-style "no real footage" mismatch).
    "lofoten-red-houses": {
        "search_queries": [
            "lofoten norway aerial drone",
            "norway fjord mountain drone",
            "scandinavian fishing village aerial",
            "arctic ocean cliffs",
            "aurora borealis mountains",
            "norway coastline drone",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "norway hid a village this red.",
        "body": "reine · lofoten\n68°N · arctic circle\n7 monuments along\none ferry line",
        "cta_text": "save → next norway trip",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "norway hid a village this red.\n\n"
            "reine. lofoten islands. 68°N — north of the arctic circle, 7 monuments on @geknee.travel sit along the one ferry line that connects them.\n\n"
            "red fishing huts on stilts, granite peaks straight out of the sea, aurora visible from september to march. the kind of place you book a ticket for and ten people text you asking how.\n\n"
            "save this for the next time you scroll right past a flight deal.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Lofoten #NorwayTravel #ArcticCircle #MysticOutlands #gekneequest\n\n"
            "🎵 PAIR WITH: cinematic-cold ambient (Ólafur Arnalds-coded piano)"
        ),
        "based_on": "jaw-drop bucket, 3-act — Norway fjords reframed as hook (color) → body (location specifics) → CTA (save).",
    },

    "sunday-scaries-fix": {
        "search_queries": [
            "santorini sunset aerial",
            "japan cherry blossom street",
            "swiss alps train scenic",
            "amalfi coast aerial drone",
            "bali rice terraces aerial",
            "airplane window sunrise clouds",
            "tropical beach overhead drone",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "the sunday scaries\nare a passport problem.",
        "body": "you dont hate monday.\nyou hate that nothing\nis on the calendar.\nput one thing on it.",
        "cta_text": "book the flight →",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "the sunday scaries are a passport problem.\n\n"
            "you don't hate monday. you hate that nothing is on the calendar between here and christmas.\n\n"
            "put one thing on it. spin the globe on @geknee.travel — drop on a city — quest unlocks — flight prices in the panel. 8 minutes from \"scroll\" to \"booked.\"\n\n"
            "save this for next sunday at 9pm.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SundayScaries #TravelMotivation #BookTheFlight #SoloTravelTips #gekneequest\n\n"
            "🎵 PAIR WITH: slow-build-to-drop audio (Fred again-coded build) so the CTA hits on the beat"
        ),
        "based_on": "motivation bucket, 3-act — universal Sunday-night feeling → reframe as fixable → book-the-flight CTA.",
    },

    "passport-stamp-debt": {
        "search_queries": [
            "eiffel tower paris aerial",
            "machu picchu peru drone",
            "taj mahal india sunrise",
            "great wall china aerial",
            "santorini greece sunset",
            "venice italy canals aerial",
            "petra jordan ancient",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "your passport\nis in stamp debt.",
        "body": "average us passport:\n3 stamps in 10 years.\n@geknee.travel has\n275 monuments\nyou can stand under.",
        "cta_text": "save → start paying it down",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [
            {"source": "path", "path": "ad-assets/instagram/cta-card-waitlist.png", "secs": 2.5, "motion": "zoom-in"},
        ],
        "caption": (
            "your passport is in stamp debt.\n\n"
            "average us passport: 3 stamps in 10 years (state dept, 2024). meanwhile @geknee.travel has 275 monuments — eiffel, machu picchu, lofoten, socotra — that count when you actually stand under them.\n\n"
            "not posts. not bucket lists. proof.\n\n"
            "save this for the next time \"someday\" comes out of your mouth.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#PassportStamps #TravelMotivation #BucketListProof #SoloTravelTips #gekneequest\n\n"
            "🎵 PAIR WITH: stat-drop trending audio (\"did you know\"-coded reveal beat)"
        ),
        "based_on": "motivation bucket, 3-act — stat as hook (3 stamps in 10 years) → reframe (275 to chase) → save CTA. Uses fact-stat opener, a high-retention 2026 IG Reels pattern.",
    },

    # ── batch 7 — 3-ACT FORMAT, fresh destinations (2026-06-17 pm) ──
    # None of these destinations/themes overlap with the 25 prior reels.
    # Dedup logic in build() auto-excludes any Pexels ID already used.
    "cappadocia-balloon-wake": {
        "search_queries": [
            "cappadocia hot air balloons sunrise",
            "cappadocia turkey aerial",
            "balloon valley dawn",
            "cave hotel turkey",
            "anatolia rock formations",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "wake up to this once.\nyou stop scrolling\nfor a month.",
        "body": "cappadocia · turkey\n80+ balloons at dawn\nover fairy chimneys\nmonument tier: celestial",
        "cta_text": "save → unlock hagia sophia",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        # `reveal` replaces the lavender CTA card with the same "BADGE UNLOCKED"
        # frame the quest-* reels use (badge JPG + tier glow + how-to micro-card).
        # Matches the archived quest-eiffel / quest-machu-picchu format.
        "reveal": {
            "badge": BADGES / "bronze" / "hagia_sophia_bronze.jpg",
            "monument": "Hagia Sophia",
            "tier": "Bronze",
            "subtitle": "Istanbul, Türkiye  ·  stand under the central dome",
            "secs": 4.5,
        },
        "caption": (
            "wake up to this once. you stop scrolling for a month.\n\n"
            "cappadocia. turkey. 80+ hot-air balloons drift over fairy chimneys at 5:30am every clear day from april through november. one of 275 monuments on @geknee.travel — celestial tier because the balloon ride is half the badge.\n\n"
            "stay in a cave hotel. wake before the call to prayer. step onto the roof. you'll know.\n\n"
            "save this for the next time you say \"someday cappadocia.\"\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Cappadocia #TurkeyTravel #HotAirBalloon #BucketList #MysticOutlands #gekneequest\n\n"
            "🎵 PAIR WITH: ethereal-dawn audio (Ludovico Einaudi-coded piano + strings)"
        ),
        "based_on": "jaw-drop bucket, 3-act — universally-recognizable bucket-list visual the prior reels didn't touch. Builds on the same hook→body→CTA cadence as iceland-3act.",
    },

    "23-weekends-math": {
        "search_queries": [
            "airplane window clouds aerial",
            "european city street travel",
            "tropical beach aerial drone",
            "mountain summit hiker view",
            "weekend road trip car aerial",
            "rooftop city sunset travel",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "you have 23\nfree weekends\nleft this year.",
        "body": "minus holidays\nminus weddings\nminus the ones\nyou waste recovering.",
        "cta_text": "spend 1 → unlock angkor wat",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "angkor_wat_bronze.jpg",
            "monument": "Angkor Wat",
            "tier": "Bronze",
            "subtitle": "Siem Reap, Cambodia  ·  enter through the west gate",
            "secs": 4.5,
        },
        "caption": (
            "you have 23 free weekends left this year.\n\n"
            "52 weekends − 8 holidays you're already booked − 4 weddings − 6 you'll spend recovering from work weeks = 23. that's it. that's the budget.\n\n"
            "spend one on @geknee.travel. spin the globe, pick a city, fly out friday, badge unlocked sunday. 23 chances becomes 22 — but the photo is real.\n\n"
            "save this for next monday's calendar review.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#WeekendTravel #TravelMotivation #BookTheFlight #SoloTravelTips #gekneequest\n\n"
            "🎵 PAIR WITH: ticking-clock trending audio (low-key urgency, no drop needed)"
        ),
        "based_on": "motivation bucket, 3-act — math/stat opener (high-retention pattern) the prior reels didn't use. Builds on the urgency hook the friday-5pm-airport reel hinted at but never quantified.",
    },

    "petra-carved-city": {
        "search_queries": [
            "petra jordan ancient",
            "petra treasury rose city",
            "jordan desert canyon",
            "ancient ruins desert",
            "siq canyon walk",
            "middle east desert sunset",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "they carved\na city into\na cliff.",
        "body": "petra · jordan\n2,000 years old\nhidden in a slot canyon\n until 1812.",
        "cta_text": "save → unlock petra",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "petra_bronze.jpg",
            "monument": "Petra",
            "tier": "Bronze",
            "subtitle": "Wadi Musa, Jordan  ·  walk the siq, treasury reveals",
            "secs": 4.5,
        },
        "caption": (
            "they carved a city into a cliff.\n\n"
            "petra. jordan. nabataean kingdom, 2,000 years old, carved straight into rose-colored sandstone. hidden inside a slot canyon — the world didn't see it until a swiss explorer stumbled in in 1812.\n\n"
            "one of 275 monuments on @geknee.travel — celestial tier because you have to walk the 1.2km siq canyon before the treasury reveals itself. no shortcut. that's the badge.\n\n"
            "save this for the next time someone says \"i've seen it all on instagram.\"\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Petra #Jordan #BucketList #MysticOutlands #gekneequest\n\n"
            "🎵 PAIR WITH: middle-east-ambient (Yann Tiersen-coded oud or low strings)"
        ),
        "based_on": "jaw-drop bucket, 3-act — Petra is in /public/monument-snaps so user actually collects this badge. Reveal-after-the-canyon body fits geknee's 'stand under it' gameplay loop.",
    },

    # ── batch 8 — 3-ACT + BADGE UNLOCKED reveal (2026-06-17 pm wave 2) ──
    "fuji-postcard": {
        "search_queries": [
            "mount fuji japan sunrise",
            "mount fuji cherry blossom",
            "fuji aerial drone japan",
            "japan rural village mountain",
            "lake kawaguchiko fuji",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "japan has one mountain\non every postcard.",
        "body": "fuji-san · 3,776m\nclimbing season\njuly 1 → sep 10\nthats the whole window.",
        "cta_text": "save → unlock fuji",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "mount_fuji_bronze.jpg",
            "monument": "Mount Fuji",
            "tier": "Bronze",
            "subtitle": "Honshū, Japan  ·  summit at sunrise = bronze locked",
            "secs": 4.5,
        },
        "caption": (
            "japan has one mountain on every postcard.\n\n"
            "fuji-san. 3,776 meters. dormant volcano, perfect cone, the only one in the country that looks like that. climbing season is just july 1 → september 10 — that's the whole window every year.\n\n"
            "stand at the summit when the sun comes up — goraikō, the \"arrival of light.\" badge unlocks on @geknee.travel the second your gps pings the crater rim.\n\n"
            "save this for the next time someone says \"japan in cherry blossom season\" like it's the only season.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#MountFuji #JapanTravel #FujiSan #BucketList #gekneequest\n\n"
            "🎵 PAIR WITH: koto-strings ambient (Joe Hisaishi-coded)"
        ),
        "based_on": "jaw-drop, 3-act + badge reveal. Climbing-window stat hooks travel-curious; reveal frame teaches the goraikō ritual that maps to the bronze unlock.",
    },

    "uluru-red-heart": {
        "search_queries": [
            "uluru australia red rock",
            "australian outback desert",
            "ayers rock sunset",
            "australian desert sky",
            "remote outback australia",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "the rock at the\ncenter of australia\nchanges color\n6 times a day.",
        "body": "uluru · northern territory\nsacred to the anangu\nclimbing banned 2019\nyou walk the base instead.",
        "cta_text": "save → unlock uluru",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "uluru_bronze.jpg",
            "monument": "Uluru",
            "tier": "Bronze",
            "subtitle": "Northern Territory, Australia  ·  walk the 10.6km base loop",
            "secs": 4.5,
        },
        "caption": (
            "the rock at the center of australia changes color 6 times a day.\n\n"
            "uluru. northern territory. one massive sandstone monolith — 348m tall, 9.4km circumference — sacred to the anangu people for 30,000+ years. climbing was permanently banned in 2019.\n\n"
            "the bronze badge on @geknee.travel unlocks when you walk the base loop (10.6km, ~3.5 hrs) — the way the traditional owners ask you to experience it.\n\n"
            "save this for the next trip down under.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Uluru #AustraliaTravel #AyersRock #MysticOutlands #gekneequest\n\n"
            "🎵 PAIR WITH: didgeridoo-ambient (low + slow, no drop)"
        ),
        "based_on": "jaw-drop, 3-act + badge reveal. Visual rarity (6 colors/day) + cultural-respect ritual (base walk vs climb) — Mystic Outlands aesthetic fit.",
    },

    "fushimi-torii-tunnel": {
        "search_queries": [
            "fushimi inari kyoto torii gates",
            "kyoto temple red gates",
            "japanese shrine forest",
            "kyoto bamboo forest path",
            "japan zen garden steps",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "10,000 red gates.\nyou walk through\nevery single one.",
        "body": "fushimi inari · kyoto\n233m up the mountain\n4 hours round trip\nbring water + light shoes",
        "cta_text": "save → unlock fushimi inari",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "fushimi_inari_bronze.jpg",
            "monument": "Fushimi Inari",
            "tier": "Bronze",
            "subtitle": "Kyoto, Japan  ·  reach the summit shrine — yotsutsuji",
            "secs": 4.5,
        },
        "caption": (
            "10,000 red gates. you walk through every single one.\n\n"
            "fushimi inari taisha. kyoto. shinto shrine dedicated to inari, the rice god — every torii was donated by a business asking for prosperity. the trail climbs 233m up mount inari, ~4 hours round trip.\n\n"
            "bronze badge on @geknee.travel unlocks at yotsutsuji intersection (about halfway up) — the first viewpoint where you can see all of kyoto framed between the gates.\n\n"
            "save this for the kyoto trip everyone else does wrong by stopping at the entrance.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#FushimiInari #KyotoTravel #JapanTravel #gekneequest\n\n"
            "🎵 PAIR WITH: shakuhachi-flute ambient (slow, contemplative)"
        ),
        "based_on": "jaw-drop, 3-act + badge reveal. Visual hook (10K gates) + insider tip (most stop at entrance) — strong save-rate pattern.",
    },

    # ── batch 9 — daily wave (2026-06-17 pm, set 3) ──
    "taj-marble-color": {
        "search_queries": [
            "taj mahal india sunrise",
            "taj mahal aerial drone",
            "agra india travel",
            "indian marble architecture",
            "india palace garden",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "the marble that changes color\nfrom sunrise\nto moonrise.",
        "body": "taj mahal · agra\nbuilt 1632 → 1653\n20,000 workers\n28 kinds of gemstone.",
        "cta_text": "save → unlock taj mahal",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "taj_mahal_bronze.jpg",
            "monument": "Taj Mahal",
            "tier": "Bronze",
            "subtitle": "Agra, India  ·  enter at sunrise for the pink wash",
            "secs": 4.5,
        },
        "caption": (
            "the marble that changes color from sunrise to moonrise.\n\n"
            "taj mahal. agra. built 1632 → 1653 — 22 years, 20,000 workers, 28 different kinds of gemstone inlaid into white marble that picks up pink at dawn and gold at dusk and silver under a full moon.\n\n"
            "bronze badge on @geknee.travel unlocks the second you step through the great gate at first light — before the buses arrive, when the reflecting pool is glass.\n\n"
            "save this for the trip you keep saying you will take.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#TajMahal #IndiaTravel #BucketList #gekneequest\n\n"
            "🎵 PAIR WITH: \"Aaoge Jab Tum\" — Rashid Khan (Jab We Met OST). Slow sitar build through the body, no drop — lets the visuals carry."
        ),
        "based_on": "jaw-drop, 3-act + badge reveal. Color-stat hook leverages the most-known fact about the Taj. Sunrise-entry ritual maps to the actual visitor experience.",
    },

    "niagara-thunder": {
        "search_queries": [
            "niagara falls aerial",
            "niagara falls horseshoe",
            "waterfall mist rainbow",
            "great lakes river canada",
            "powerful waterfall closeup",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "5,750,000 liters\nover the edge.\nevery second.",
        "body": "niagara falls\nUS / canada border\n12,000 years old\nstill carving the gorge.",
        "cta_text": "save → unlock niagara",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "niagara_falls_bronze.jpg",
            "monument": "Niagara Falls",
            "tier": "Bronze",
            "subtitle": "Ontario / New York  ·  stand on the Hornblower boat deck",
            "secs": 4.5,
        },
        "caption": (
            "5,750,000 liters over the edge. every single second.\n\n"
            "niagara falls. straddles the US/canada border. formed 12,000 years ago when the last ice sheet receded — still eroding the gorge at ~1 foot per year. by the year 50,000 the falls will have retreated all the way back to lake erie.\n\n"
            "bronze badge on @geknee.travel unlocks when your gps pings the Hornblower (canadian side) or Maid of the Mist (US side) boat deck — the only way to feel the mist hit you.\n\n"
            "save this for the next road trip across the border.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#NiagaraFalls #CanadaTravel #USTravel #gekneequest\n\n"
            "🎵 PAIR WITH: \"A Moment Apart\" — ODESZA. Build through hook + body, drop hits exactly when the reveal card lands."
        ),
        "based_on": "stat-bomb hook (gallons/sec) + future-fact body (will retreat to Erie) + ritual reveal. ODESZA's build matches the 3-act timing perfectly.",
    },

    "sydney-opera-shells": {
        "search_queries": [
            "sydney opera house aerial",
            "sydney harbour bridge",
            "sydney australia skyline",
            "opera house white shells",
            "sydney aerial drone",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "1 million white tiles.\n14 concrete shells.\n0 right angles.",
        "body": "sydney opera house\nbennelong point\n233 architects entered\nthe danish guy won.",
        "cta_text": "save → unlock sydney opera",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "sydney_opera_bronze.jpg",
            "monument": "Sydney Opera House",
            "tier": "Bronze",
            "subtitle": "Bennelong Point, Sydney  ·  walk the forecourt at blue hour",
            "secs": 4.5,
        },
        "caption": (
            "1 million white tiles. 14 concrete shells. zero right angles.\n\n"
            "sydney opera house. bennelong point. 233 architects entered the 1957 design competition — jørn utzon, a young dane who had never built anything this scale, won. construction took 14 years over budget. he resigned mid-build. he was never invited to the opening.\n\n"
            "bronze badge on @geknee.travel unlocks when you walk the forecourt at blue hour — the 20 minutes after sunset when the shells go from white to opal.\n\n"
            "save this for the next time you think your project is taking forever.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SydneyOperaHouse #AustraliaTravel #Architecture #gekneequest\n\n"
            "🎵 PAIR WITH: \"Experience\" — Ludovico Einaudi. Slow piano through hook + body, swells exactly when blue hour reveal hits."
        ),
        "based_on": "tri-stat hook (1M tiles / 14 shells / 0 right angles) sets up the design-process body which then humanizes with the Utzon backstory. Blue-hour timing maps to the actual best-photo window.",
    },

    # ── batch 10 — daily 2026-06-18 ──
    "victoria-falls-mosi": {
        "search_queries": [
            "victoria falls zimbabwe aerial",
            "victoria falls zambia drone",
            "waterfall mist gorge africa",
            "zambezi river africa",
            "african waterfall landscape",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "the locals call it\nMosi-oa-Tunya.\nthe smoke that thunders.",
        "body": "victoria falls\nzambia / zimbabwe\n108m drop · 1.7km wide\nspray visible from 50km away.",
        "cta_text": "save → unlock victoria",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "victoria_falls_bronze.jpg",
            "monument": "Victoria Falls",
            "tier": "Bronze",
            "subtitle": "Livingstone, Zambia  ·  walk Knife-Edge Bridge in mist gear",
            "secs": 4.5,
        },
        "caption": (
            "the locals call it Mosi-oa-Tunya. the smoke that thunders.\n\n"
            "victoria falls. on the zambezi river, straddling zambia and zimbabwe. 108m drop, 1.7km wide — twice as tall as niagara and almost twice as wide. the spray plume is visible from 50km away on a clear day.\n\n"
            "bronze badge on @geknee.travel unlocks when your gps pings the Knife-Edge Bridge — full mist drench, bring waterproofs or pay for the disposable poncho at the gate.\n\n"
            "save this for the next time anyone says \"africa is far.\"\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#VictoriaFalls #ZambiaTravel #ZimbabweTravel #AfricaTravel #gekneequest\n\n"
            "🎵 PAIR WITH: \"Africa\" — Toto. The opening rain-stick percussion lines up with the hook, the chorus drop hits when the reveal card lands."
        ),
        "based_on": "jaw-drop, 3-act + badge reveal. Indigenous-name hook (Mosi-oa-Tunya) educates while pattern-interrupting; vs-Niagara comparison gives scale. Africa underrep'd in prior reels.",
    },

    "neuschwanstein-disney": {
        "search_queries": [
            "neuschwanstein castle germany",
            "bavarian alps castle aerial",
            "german castle forest",
            "bavaria mountain village",
            "alpine castle snow winter",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "this castle inspired\nevery disney logo\nyou have ever seen.",
        "body": "neuschwanstein\nbavaria, germany\nking ludwig built it\nhe died before it was done.",
        "cta_text": "save → unlock the castle",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "neuschwanstein_bronze.jpg",
            "monument": "Neuschwanstein",
            "tier": "Bronze",
            "subtitle": "Schwangau, Bavaria  ·  cross Marienbrücke for the shot",
            "secs": 4.5,
        },
        "caption": (
            "this castle inspired every disney logo you have ever seen.\n\n"
            "neuschwanstein. bavaria, germany. king ludwig II commissioned it in 1869 — a private fantasy, opera-set theatrical, never meant to host the public. he was deposed for being \"too mad\" and died mysteriously in a lake three days later. construction was unfinished. the castle opened to tours within weeks of his death.\n\n"
            "bronze badge on @geknee.travel unlocks when you cross Marienbrücke — the iron footbridge over Pöllat gorge that gives you the postcard view.\n\n"
            "save this for the next time you think your fairy-tale was made up.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Neuschwanstein #GermanyTravel #BavariaTravel #Castle #gekneequest\n\n"
            "🎵 PAIR WITH: \"Sleeping Beauty Waltz\" — Tchaikovsky. Slow waltz through the hook, swells exactly when the reveal card lands — same orchestration Disney built their castle theme from."
        ),
        "based_on": "jaw-drop + story-hook, 3-act + badge reveal. Disney-connection hook converts on familiarity; tragic-king body adds depth. Marienbrücke ritual maps to the most photographed angle.",
    },

    "great-wall-2300": {
        "search_queries": [
            "great wall china aerial drone",
            "great wall mutianyu",
            "chinese mountain landscape",
            "ancient wall stone china",
            "china mountain ridge",
        ],
        "n_clips": 5,
        "clip_secs": 2.5,
        "hook": "13,000 miles long.\nbuilt over 2,300 years.\nnot visible from space.",
        "body": "great wall · china\nstarted 7th century BC\ngenghis khan got through anyway\nyou hike it for the silence.",
        "cta_text": "save → unlock the wall",
        "hook_end_secs": 3.0,
        "body_end_secs": 10.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "great_wall_bronze.jpg",
            "monument": "Great Wall of China",
            "tier": "Bronze",
            "subtitle": "Mutianyu, China  ·  hike a restored section at dawn",
            "secs": 4.5,
        },
        "caption": (
            "13,000 miles long. built over 2,300 years. not visible from space.\n\n"
            "great wall of china. the longest structure humans have ever made. started in the 7th century BC, mostly built by the Ming dynasty (1368-1644). genghis khan and his mongols got through anyway — turns out a wall is only as strong as the gatekeeper you bribe.\n\n"
            "bronze badge on @geknee.travel unlocks when you hike a restored section at dawn — Mutianyu is the move, 90 min from Beijing, less crowded than Badaling, full silence before 9am.\n\n"
            "save this for the next time you think a wall solves anything.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#GreatWall #ChinaTravel #BucketList #gekneequest\n\n"
            "🎵 PAIR WITH: \"Tu Hua\" — Faye Wong. Slow chinese vocal through hook + body, the long-held note lands on the reveal."
        ),
        "based_on": "stat-myth-bust hook (NOT visible from space — common misconception) + bribery body (humanizes ancient history) + dawn-Mutianyu ritual (insider tip, beats the crowds).",
    },

    # ── batch 11 — daily 2026-06-19 ──
    "acropolis-marble-time": {
        # First clip is a tight detail (column carving, marble texture) so the
        # viewer sees something specific in second 1, not a generic wide shot.
        "search_queries": [
            "ancient greek marble column close",
            "parthenon marble detail",
            "acropolis athens greece aerial",
            "parthenon athens sunset golden",
            "athens greece skyline night",
            "ancient greek temple ruins",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "older than the bible.\nstill open today.",
        "body": "parthenon · athens\ngeknee quest · golden hour climb\nevery column secretly curves\nso the eye reads them straight.",
        "cta_text": "save → unlock the acropolis",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "acropolis_bronze.jpg",
            "monument": "Acropolis",
            "tier": "Bronze",
            "subtitle": "Athens, Greece  ·  climb the marble steps at golden hour",
            "secs": 4.5,
        },
        "caption": (
            "the building still standing 2,500 years after its architects died.\n\n"
            "the parthenon. acropolis of athens. built 447–438 BC under pericles. 22,000 tons of pentelic marble quarried 13km away and dragged uphill — every column tapers and curves slightly so the eye reads them as straight (entasis). it has survived ottoman gunpowder explosions, british \"acquisition,\" and 25 centuries of weather.\n\n"
            "bronze badge on @geknee.travel unlocks when you climb the marble steps at golden hour — the limestone catches the last light and the parthenon goes amber.\n\n"
            "save this for the next greek-island trip everyone uses to skip athens.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Acropolis #Parthenon #GreeceTravel #Athens #gekneequest\n\n"
            "🎵 PAIR WITH: \"Time\" — Hans Zimmer (Inception). Slow piano through hook + body, the orchestral swell hits exactly when the reveal card lands."
        ),
        "based_on": "jaw-drop + survivor-story bucket, 3-act + badge reveal. Survival-stat hook + entasis fact (eye-tricks tied to design genius) + golden-hour ritual.",
    },

    "iguazu-275-falls": {
        # Lead with a roaring water close-up, not the wide drone.
        "search_queries": [
            "powerful waterfall closeup spray",
            "rushing water rocks closeup",
            "iguazu falls aerial drone",
            "garganta del diablo iguazu",
            "rainforest waterfall south america",
            "iguazu argentina brazil",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "275 separate waterfalls.\non one river.",
        "body": "iguazu · argentina\ngeknee quest · garganta del diablo at noon\n82m drop · 2.7km wide\nrainforest on both sides.",
        "cta_text": "save → unlock iguazu",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "iguazu_falls_bronze.jpg",
            "monument": "Iguazu Falls",
            "tier": "Bronze",
            "subtitle": "Misiones, Argentina  ·  walk Garganta del Diablo at noon",
            "secs": 4.5,
        },
        "caption": (
            "275 separate waterfalls on one river. the locals call it iguazu — big water in guarani.\n\n"
            "iguazu falls. straddles argentina and brazil. 2.7km wide, 82m at the devils throat plunge. the rainforest on both sides is its own UNESCO site — jaguars, capuchins, and toco toucans living in the spray zone.\n\n"
            "bronze badge on @geknee.travel unlocks when you walk the Garganta del Diablo boardwalk at noon — full rainbow guaranteed if the sun is out.\n\n"
            "save this for the next south america trip you keep pushing to next year.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#IguazuFalls #ArgentinaTravel #BrazilTravel #SouthAmerica #gekneequest\n\n"
            "🎵 PAIR WITH: \"On Earth as in Heaven\" — Ennio Morricone (The Mission). The film was literally shot at Iguazu — flute solo matches the hook, full orchestra hits the reveal."
        ),
        "based_on": "jaw-drop + scale-comparison, 3-act + badge reveal. Eleanor Roosevelt quote humanizes the stat. Morricone's score from The Mission ties the audio to the location at meta level.",
    },

    "chichen-itza-snake": {
        # Open on the carved serpent head at the pyramid base for instant
        # "what is that" recognition, then pull back to the full pyramid.
        "search_queries": [
            "mayan stone serpent carving",
            "ancient mexican stone steps",
            "chichen itza pyramid mexico",
            "mayan ruins yucatan aerial",
            "mexico jungle temple ruins",
            "ancient mexican pyramid sunset",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "march 21.\nthis pyramid grows\na snake.",
        "body": "el castillo · yucatan\ngeknee quest · 4pm on equinox day\nthe shadow snake appears\n45 mins only. twice a year.",
        "cta_text": "save → unlock chichen itza",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "chichen_itza_bronze.jpg",
            "monument": "Chichen Itza",
            "tier": "Bronze",
            "subtitle": "Yucatán, Mexico  ·  arrive 4pm on equinox day",
            "secs": 4.5,
        },
        "caption": (
            "twice a year a snake of shadow slides down this pyramid.\n\n"
            "el castillo at chichen itza. yucatán, mexico. built ~9th century by the maya. on march 21 and september 22 (spring + autumn equinox), the late-afternoon sun hits the northwest balustrade at an exact angle — projecting a serpent of triangular shadows that appears to slither down the stone steps toward the carved snake head at the base. it lasts ~45 minutes. the maya engineered this 1,200 years ago.\n\n"
            "bronze badge on @geknee.travel unlocks when you arrive by 4pm on equinox day — get there earlier than that or the crowds make the photo impossible.\n\n"
            "save this for your equinox-aware travel calendar.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#ChichenItza #MexicoTravel #MayanRuins #Equinox #gekneequest\n\n"
            "🎵 PAIR WITH: \"Conquest of Paradise\" — Vangelis. The slow choral build maps to the body, the synth bass drop hits when the reveal card lands."
        ),
        "based_on": "jaw-drop + astronomical phenomenon hook, 3-act + badge reveal. The snake-shadow story is a rare visual fact that maps directly to a specific date — natural urgency.",
    },

    # ── batch 12 — daily 2026-06-19 set 2 ──
    # Body engineered to mention geknee at ~5s mark (line 2 of 4 lines that
    # span 2.5s→8.5s = ~1.5s per line → geknee mention lands at ~4-5.5s).
    "pyramids-still-counting": {
        "search_queries": [
            "pyramid stone close up",
            "egyptian hieroglyphics detail",
            "giza pyramids aerial drone",
            "egypt desert sunset",
            "great pyramid giza camel",
            "egyptian sphinx pyramids",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "older than the wheel.\nstill counting time.",
        "body": "giza · egypt · 2,600 BC\n@geknee.travel bronze unlocks\nat the great pyramid base\nstand where pharaohs stood.",
        "cta_text": "save → unlock giza",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "pyramid_giza_bronze.jpg",
            "monument": "Pyramids of Giza",
            "tier": "Bronze",
            "subtitle": "Giza, Egypt  ·  stand at the great pyramid base at dawn",
            "secs": 4.5,
        },
        "caption": (
            "older than the wheel. still counting time.\n\n"
            "great pyramid of giza. built around 2,600 BC for pharaoh khufu — 2.3 million stone blocks, each weighing 2-15 tons, hauled into place without iron, without the wheel, without a single horse. for almost 4,000 years it was the tallest structure on earth.\n\n"
            "bronze badge on @geknee.travel unlocks when your gps pings the base of the great pyramid at dawn — go before the heat and the camel guys arrive.\n\n"
            "save this for the egypt trip you keep meaning to take.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#PyramidsOfGiza #EgyptTravel #AncientWonder #BucketList #gekneequest\n\n"
            "🎵 PAIR WITH: \"Dies Irae\" — Hans Zimmer (Lawrence of Arabia-coded percussion). Slow rhythm through the hook, full strings hit on the reveal."
        ),
        "based_on": "5s-retention engineered: hook = 6-word punch; body line 2 (@geknee.travel) lands at ~4s; pyramid stat opens curiosity loop closed by reveal.",
    },

    "sagrada-still-building": {
        "search_queries": [
            "sagrada familia gaudi interior columns",
            "stained glass colored light",
            "sagrada familia barcelona aerial",
            "barcelona spain architecture",
            "gothic cathedral interior",
            "sagrada familia spires",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "still under construction.\nsince 1882.",
        "body": "barcelona · spain\n@geknee.travel unlocks here\nwhen you stand inside\ngaudis stone forest lights up.",
        "cta_text": "save → unlock sagrada",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "sagrada_familia_bronze.jpg",
            "monument": "Sagrada Familia",
            "tier": "Bronze",
            "subtitle": "Barcelona, Spain  ·  step inside at 4pm for stained-glass light",
            "secs": 4.5,
        },
        "caption": (
            "still under construction. since 1882.\n\n"
            "sagrada familia. barcelona. antoni gaudi started it in 1882 — the projected completion is 2026 (yes, this year). 144 years to finish a church because gaudi died in 1926 (hit by a tram) and successive architects refused to compromise his vision. inside, columns branch like a stone forest and stained glass throws colored light onto the white surfaces.\n\n"
            "bronze badge on @geknee.travel unlocks when you step inside at 4pm — late-afternoon sun is when the west-side stained glass hits the columns and the whole interior glows.\n\n"
            "save this for the barcelona trip everyone uses to eat tapas and forget the church.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SagradaFamilia #BarcelonaTravel #Gaudi #ArchitectureTravel #gekneequest\n\n"
            "🎵 PAIR WITH: \"Spiegel im Spiegel\" — Arvo Pärt. Sparse piano + violin through hook + body — final note swells on the reveal."
        ),
        "based_on": "5s-retention engineered: hook = 5-word jaw-drop (construction-still-active is unbelievable); body line 2 = @geknee.travel at ~4s; final-completion timing creates urgency.",
    },

    "burj-4-sunsets": {
        "search_queries": [
            "dubai burj khalifa skyline aerial",
            "dubai cityscape sunset",
            "skyscraper top down looking",
            "modern city lights night",
            "skyscraper glass facade closeup",
            "dubai marina aerial",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "828 meters of glass.\nyou see 4 sunsets a day.",
        "body": "burj khalifa · dubai\n@geknee.travel pings up top\n160 floors above the desert\nthe earth literally curves.",
        "cta_text": "save → unlock the burj",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "burj_khalifa_bronze.jpg",
            "monument": "Burj Khalifa",
            "tier": "Bronze",
            "subtitle": "Dubai, UAE  ·  reach Sky Lounge floor 154 at golden hour",
            "secs": 4.5,
        },
        "caption": (
            "828 meters of glass. you see 4 sunsets a day.\n\n"
            "burj khalifa. dubai. 828m tall, 163 floors above ground — so tall that if you take the elevator from the lobby to the top observation deck, you can watch the sun set, ride down 200 floors, and watch it set again. people on the top floor see TWO additional sunsets after the ground floor sees the first one.\n\n"
            "bronze badge on @geknee.travel unlocks when your gps pings the Sky Lounge on floor 154 at golden hour — 555m up, the highest bar in the world.\n\n"
            "save this for the next \"layover in dubai\" you book on purpose.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#BurjKhalifa #DubaiTravel #UAE #SkyscraperViews #gekneequest\n\n"
            "🎵 PAIR WITH: \"Sun Models\" — ODESZA. Modern electronic drop hits exactly when the reveal card lands."
        ),
        "based_on": "5s-retention engineered: hook = pattern-interrupt stat (4 sunsets/day is provably weird); body line 2 = @geknee.travel at ~4s; 'earth literally curves' = save-worthy unbelievable fact.",
    },

    # ── batch 13 — daily 2026-06-20 ──
    "big-ben-mythbust": {
        "search_queries": [
            "big ben clock face close up",
            "westminster bridge london night",
            "london thames river aerial",
            "houses of parliament london",
            "london double decker bus",
            "westminster abbey aerial",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "everyone calls it Big Ben.\nBig Ben isnt a tower.",
        "body": "Big Ben is the 13.5-ton bell\n@geknee.travel unlocks at Elizabeth Tower\nthe building everyone photographs\nis named after the queen.",
        "cta_text": "save → unlock big ben",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "big_ben_bronze.jpg",
            "monument": "Big Ben",
            "tier": "Bronze",
            "subtitle": "Westminster, London  ·  cross Westminster Bridge at 6pm chimes",
            "secs": 4.5,
        },
        "caption": (
            "everyone calls it Big Ben. Big Ben isnt a tower.\n\n"
            "Big Ben is the 13.5-tonne bronze bell hanging INSIDE Elizabeth Tower at the north end of Westminster Palace. The tower itself was renamed in 2012 (queen's diamond jubilee) — before that it was just the Clock Tower. The bell has been ringing every quarter hour since 1859. tourists have been getting the name wrong for 170 years.\n\n"
            "bronze badge on @geknee.travel unlocks when your gps pings Westminster Bridge at 6pm — you cross with the chimes ringing.\n\n"
            "save this for the next person who insists the building IS Big Ben.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#BigBen #ElizabethTower #LondonTravel #UKTravel #gekneequest\n\n"
            "🎵 PAIR WITH: \"Royals\" — Lorde. Ironic-British vibes; chorus hits when reveal lands."
        ),
        "based_on": "5s-retention: myth-bust hook (everyone-is-wrong is high-engagement); body line 2 = @geknee.travel at ~4s. Bell-vs-tower confusion is universally known and immediately corrects.",
    },

    "stonehenge-no-wheels": {
        "search_queries": [
            "stonehenge close up stones",
            "stonehenge england aerial drone",
            "salisbury plain england landscape",
            "ancient stone circle sunset",
            "stonehenge sunrise mist",
            "english countryside hills",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "no one knows\nhow they moved\nthese stones.",
        "body": "stonehenge · wiltshire\ngeknee quest · solstice dawn entry\nbluestones quarried 240km away\n5,000 years ago. no wheels.",
        "cta_text": "save → unlock stonehenge",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "stonehenge_bronze.jpg",
            "monument": "Stonehenge",
            "tier": "Bronze",
            "subtitle": "Wiltshire, England  ·  inner-circle access at solstice dawn",
            "secs": 4.5,
        },
        "caption": (
            "no one knows how they moved these stones.\n\n"
            "stonehenge. wiltshire, england. built in stages between 3000 BC and 2000 BC — the largest stones (sarsens) weigh up to 30 tonnes; the bluestones came from a quarry in pembrokeshire, wales — 240km away. neolithic britons had no wheels, no horses, no metal tools. there are competing theories (rolled on logs, dragged on sleds over wet clay) but no proof.\n\n"
            "bronze badge on @geknee.travel unlocks at the inner-circle viewing — book the solstice dawn slot 6 months out for the only legal way past the rope line.\n\n"
            "save this for the next time someone calls history boring.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Stonehenge #UKTravel #AncientHistory #MysticOutlands #gekneequest\n\n"
            "🎵 PAIR WITH: \"Untitled #3\" — Sigur Rós. Otherworldly drone matches the mystery; vocals swell on the reveal."
        ),
        "based_on": "5s-retention: open-loop hook (mystery = save-trigger); body line 2 = @geknee.travel at ~4s; specific geography (Pembrokeshire→Wiltshire) makes the impossibility feel real.",
    },

    "tokyo-skytree-circuit": {
        "search_queries": [
            "tokyo skytree night close up",
            "tokyo city aerial neon",
            "tokyo skyline at night",
            "tokyo street neon lights",
            "tokyo skytree at sunset",
            "japan modern architecture",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "634 meters.\ntallest tower on earth.",
        "body": "tokyo skytree · sumida\n@geknee.travel pings floor 450\nengineered to flex in earthquakes\nat dusk tokyo looks like a circuit board.",
        "cta_text": "save → unlock tokyo skytree",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "tokyo_skytree_bronze.jpg",
            "monument": "Tokyo Skytree",
            "tier": "Bronze",
            "subtitle": "Sumida, Tokyo  ·  reach Tembo Galleria at sunset",
            "secs": 4.5,
        },
        "caption": (
            "634 meters. tallest tower on earth.\n\n"
            "tokyo skytree. sumida ward. opened 2012 — at 634m it overtook canton tower as the tallest free-standing tower on the planet. designed to sway up to 1m at the top during earthquakes (japan has ~1,500 a year). from the tembo galleria at 450m, tokyo at dusk reads less like a city and more like a glowing motherboard.\n\n"
            "bronze badge on @geknee.travel unlocks when you reach tembo galleria at sunset — magic hour with the city lights coming on under you.\n\n"
            "save this for the tokyo trip you keep planning around shibuya only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#TokyoSkytree #JapanTravel #TokyoTravel #ModernArchitecture #gekneequest\n\n"
            "🎵 PAIR WITH: \"Wonder\" — Yutaka Hirasaka. Lofi-Japan piano through hook+body, drum brushes on the reveal."
        ),
        "based_on": "5s-retention: record-stat hook (tallest tower); body line 2 = @geknee.travel at ~4s; circuit-board visual = save-worthy.",
    },

    # ── batch 14 — daily 2026-06-21 ──
    "forbidden-city-9999": {
        "search_queries": [
            "forbidden city roof tile detail",
            "chinese imperial palace red",
            "forbidden city beijing aerial",
            "chinese architecture courtyard",
            "beijing palace ceremonial gate",
            "ancient chinese palace roof",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "9,999 rooms.\n500 years closed\nto the public.",
        "body": "forbidden city · beijing\ngeknee quest · meridian gate at sunrise\n720,000 square meters\nlast emperor exiled 1924.",
        "cta_text": "save → unlock forbidden city",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "forbidden_city_bronze.jpg",
            "monument": "Forbidden City",
            "tier": "Bronze",
            "subtitle": "Beijing, China  ·  enter through Meridian Gate at sunrise",
            "secs": 4.5,
        },
        "caption": (
            "9,999 rooms. 500 years closed to the public.\n\n"
            "forbidden city. beijing. 720,000 square meters of imperial palace, built 1406-1420 by 1 million laborers. for nearly 500 years it was off-limits — death penalty if you crossed the wall without invitation. the last emperor, puyi, was 6 years old when the qing dynasty fell. he was finally expelled in 1924.\n\n"
            "@geknee.travel quest: walk through the meridian gate at sunrise — the southern entrance, before the tour buses arrive. bronze badge unlocks.\n\n"
            "save this for the beijing trip you never planned past the great wall.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#ForbiddenCity #BeijingTravel #ChinaTravel #ImperialPalace #gekneequest\n\n"
            "🎵 PAIR WITH: \"In the Mood for Love Theme\" — Shigeru Umebayashi. The string slide builds through hook + body, climaxes on the reveal."
        ),
        "based_on": "5s-retention: secret-history hook (death-penalty + 500 years); quest body line 2; puyi-detail humanizes the dynasty.",
    },

    "golden-gate-orange": {
        "search_queries": [
            "golden gate bridge cable closeup",
            "san francisco fog bridge",
            "golden gate aerial drone",
            "san francisco coastline bridge",
            "bridge tower architecture",
            "san francisco bay sunset",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "the red bridge\nisnt red.\nits international orange.",
        "body": "golden gate · san francisco\ngeknee quest · cross on foot in fog\n2.7km long\nbuilt during the great depression.",
        "cta_text": "save → unlock golden gate",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "golden_gate_bronze.jpg",
            "monument": "Golden Gate Bridge",
            "tier": "Bronze",
            "subtitle": "San Francisco, USA  ·  walk the deck at the fog rollin",
            "secs": 4.5,
        },
        "caption": (
            "the red bridge isnt red. its international orange.\n\n"
            "golden gate bridge. san francisco. opened may 27, 1937 — at the time, the longest suspension span on earth (2.7km). engineer joseph strauss picked international orange specifically because the navy wanted it painted yellow with black stripes, the army wanted black-and-white, and orange split the difference and held up against the fog. built through the great depression in 4 years and 4 months.\n\n"
            "@geknee.travel quest: cross the deck on foot at the fog rollin — the south tower disappears into mist, you walk into it. bronze badge unlocks.\n\n"
            "save this for the next sf trip you take that isnt about tech.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#GoldenGateBridge #SanFrancisco #USATravel #Architecture #gekneequest\n\n"
            "🎵 PAIR WITH: \"(Sittin On) The Dock of the Bay\" — Otis Redding. SF anthem — opening whistles match the hook, full chorus hits on the reveal."
        ),
        "based_on": "5s-retention: contrarian-fact hook (not red, orange); navy/army color compromise detail in caption is the bonus humanizer.",
    },

    "notre-dame-rebuild": {
        "search_queries": [
            "notre dame stained glass detail",
            "gothic cathedral interior stone",
            "notre dame paris aerial",
            "paris cathedral facade close",
            "paris seine bridge cathedral",
            "gothic rose window stained glass",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "burned down in 2019.\nopened again in 2024.\nfaster than they built it.",
        "body": "notre dame · paris\ngeknee quest · nave at vespers 5pm\ngothic limestone\nthe rose window survived.",
        "cta_text": "save → unlock notre dame",
        "hook_end_secs": 2.5,
        "body_end_secs": 8.5,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "notre_dame_bronze.jpg",
            "monument": "Notre Dame",
            "tier": "Bronze",
            "subtitle": "Paris, France  ·  enter at vespers 5pm bell",
            "secs": 4.5,
        },
        "caption": (
            "burned down in 2019. opened again in 2024. faster than they built it.\n\n"
            "notre dame de paris. île de la cité. construction started in 1163 and took 182 years. on april 15 2019 the spire collapsed during a renovation fire — molten lead, ash, the world watching live. it reopened on december 7 2024, less than 6 years later. the great rose windows survived the fire intact. 800-year-old stained glass.\n\n"
            "@geknee.travel quest: stand in the nave at vespers — the 5pm bell, low light through the rose window, gregorian chant if youre lucky. bronze badge unlocks.\n\n"
            "save this for the paris trip you keep saying is too touristy.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#NotreDame #ParisTravel #FranceTravel #Gothic #gekneequest\n\n"
            "🎵 PAIR WITH: \"Ave Maria\" — Schubert (Pavarotti recording). Tenor enters at the hook, full swell hits on the reveal."
        ),
        "based_on": "5s-retention: rebuild-faster-than-build hook is a real fact; quest at line 2; rose-window-survived detail = save-worthy emotional anchor.",
    },

    # ── batch 15 — daily 2026-06-22 ──
    "liberty-penny-green": {
        "search_queries": [
            "statue of liberty close up torch",
            "statue of liberty crown detail",
            "new york harbor liberty aerial",
            "manhattan skyline ferry",
            "statue of liberty island",
            "new york bay sunset",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "what if I told you\nshe used to be\nthe color of a penny.",
        "body": "copper turned green by 1920\n354 steps to the crown\n7 spikes · 7 continents",
        "cta_text": "go to liberty island\nclimb to the crown at sunrise",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "silver" / "statue_of_liberty_silver.jpg",
            "monument": "Statue of Liberty",
            "tier": "Silver",
            "subtitle": "Liberty Island, NY  ·  climb 354 steps to the crown",
            "secs": 4.5,
        },
        "caption": (
            "she used to be the color of a penny.\n\n"
            "statue of liberty. liberty island, new york harbor. dedicated october 28, 1886 — a gift from france to mark a century of american independence. her skin is copper, 3/32 of an inch thick. when she arrived she was the warm shiny brown of a fresh penny. by 1920 oxidation had turned her the green you know. her 7-pointed crown represents the 7 continents and 7 seas.\n\n"
            "@geknee.travel quest: climb the 354 steps to the crown — booked 4 months out, no shortcut. bronze badge unlocks.\n\n"
            "save this for the new york trip that isnt about times square.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#StatueOfLiberty #NewYorkTravel #USATravel #LadyLiberty #gekneequest\n\n"
            "🎵 PAIR WITH: \"Empire State of Mind\" — Jay-Z & Alicia Keys. Piano opening on the hook, chorus drop hits the reveal."
        ),
        "based_on": "5s-retention: color-change hook is a fact most viewers know but havent thought about; 7-spikes-for-7-continents is bonus save trigger.",
    },

    "machu-picchu-mortar": {
        "search_queries": [
            "machu picchu stone close up",
            "inca stonework masonry detail",
            "machu picchu peru aerial",
            "andes mountains peru",
            "peru ancient ruins mist",
            "andean mountain landscape",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "stop saving the maldives.\nsave this instead.",
        "body": "inca stones · no mortar\nrazor wont slide between\nthe jungle hid it 400 years",
        "cta_text": "do this · sun gate at dawn\nthe inca trail terminus",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "machu_picchu_bronze.jpg",
            "monument": "Machu Picchu",
            "tier": "Bronze",
            "subtitle": "Cusco Region, Peru  ·  reach Sun Gate at first light",
            "secs": 4.5,
        },
        "caption": (
            "stones cut so tight you cant slide a razor between them.\n\n"
            "machu picchu. peru. built around 1450 by inca emperor pachacuti — granite blocks shaped without iron tools, fitted without mortar, so precisely that 5 centuries of earthquakes havent moved a stone. abandoned during the spanish conquest. the jungle reclaimed it. nobody outside the local quechua knew it was there until hiram bingham followed a child up the mountain in 1911.\n\n"
            "@geknee.travel quest: reach the sun gate (inti punku) at first light — the inca trail terminus where the sun rises directly through the gate twice a year. bronze badge unlocks.\n\n"
            "save this for the peru trip you keep talking about.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#MachuPicchu #PeruTravel #IncaTrail #SouthAmerica #gekneequest\n\n"
            "🎵 PAIR WITH: \"El Condor Pasa\" — Simon & Garfunkel. Andean pan flute opens with the hook, harmony swells on the reveal."
        ),
        "based_on": "5s-retention: tactile hook (razor-between) is sensory; 1911-discovery body humanizes; sun gate quest is the most iconic photo angle.",
    },

    "easter-island-eyes": {
        "search_queries": [
            "easter island moai close up",
            "moai stone face detail",
            "rapa nui chile aerial",
            "easter island sunset moai",
            "pacific island volcanic stone",
            "south pacific remote island",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "watch this before\nyou call any island\nremote.",
        "body": "rapa nui · 3,500km offshore\n887 walking moai\neyes of coral and obsidian",
        "cta_text": "go to ahu tongariki\nsunrise · 15 statues facing inland",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "gold" / "easter_island_gold.jpg",
            "monument": "Easter Island",
            "tier": "Gold",
            "subtitle": "Rapa Nui, Chile  ·  arrive Ahu Tongariki at sunrise",
            "secs": 4.5,
        },
        "caption": (
            "they used to have eyes. the islanders walked them into place.\n\n"
            "rapa nui (easter island). a triangular volcanic speck in the south pacific, 3,500km from the nearest continent. 887 moai statues, carved between 1100 and 1680 from the volcanic crater at rano raraku. they were transported up to 18km — and a 2012 experiment proved the polynesian oral tradition right: the moai were rocked walking, upright, by 18 people pulling alternating ropes. they originally had eyes made from white coral and obsidian, looted or lost over centuries.\n\n"
            "@geknee.travel quest: arrive at ahu tongariki for sunrise — 15 moai backlit by the rising sun, all facing inland watching their islanders. bronze badge unlocks.\n\n"
            "save this for the trip that everyone says is too remote to bother.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#EasterIsland #RapaNui #ChileTravel #Polynesia #gekneequest\n\n"
            "🎵 PAIR WITH: \"Hawaii\" — High Tyde. Polynesian-percussion ambient through hook + body, drop on the reveal."
        ),
        "based_on": "5s-retention: walking-statues hook is unbelievable but true (2012 experiment); 887-statues + isolation body builds scale; tongariki sunrise = iconic photo.",
    },

    # ── batch 16 — daily 2026-06-23 ──
    "christ-redeemer-95": {
        "search_queries": [
            "christ the redeemer statue close up",
            "corcovado mountain rio aerial",
            "rio de janeiro skyline drone",
            "sugarloaf mountain brazil",
            "rio brazil sunset aerial",
            "brazil coastline mountains",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "you used to think\nhe was always there.\nhe is 95 years old.",
        "body": "rio · brazil · 38m tall\narms span 28 meters\nstruck by lightning 6x a year",
        "cta_text": "go to corcovado at 5pm\nride the cog train up",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "aurora" / "christ_redeemer_aurora.jpg",
            "monument": "Christ the Redeemer",
            "tier": "Aurora",
            "subtitle": "Rio de Janeiro, Brazil  ·  cog train to Corcovado at 5pm",
            "secs": 4.5,
        },
        "caption": (
            "you used to think he was always there. he is 95 years old.\n\n"
            "christ the redeemer. rio de janeiro. opened october 12, 1931 — designed by polish-french sculptor paul landowski, built atop corcovado mountain at 700m above sea level. the statue is 38 meters tall with an arm span of 28 meters. lightning strikes it ~6 times a year and a small repair team rappels down to patch the soapstone after each major hit.\n\n"
            "go to corcovado at 5pm. ride the cog train up — golden hour over guanabara bay frames him perfectly. aurora badge unlocks.\n\n"
            "save this for the rio trip you keep saying is for carnival only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#ChristTheRedeemer #RioDeJaneiro #BrazilTravel #SouthAmerica #gekneequest\n\n"
            "🎵 PAIR WITH: \"Aguas de Marco\" — Antonio Carlos Jobim & Elis Regina. Bossa nova bossa-pulse through hook + body, sax swells on reveal."
        ),
        "based_on": "5s-retention: 'you used to think' viral template + 95-year stat reframes a 'timeless' icon as recent. Lightning-strike body line is a wild fact.",
    },

    "colosseum-real-floor": {
        "search_queries": [
            "colosseum stone close up detail",
            "roman gladiator helmet",
            "colosseum rome aerial drone",
            "rome italy ancient ruins",
            "colosseum interior arena",
            "rome italy sunset cathedral",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "the floor you see\nisnt the floor.\nthe real one was sand.",
        "body": "rome · italy · 80 AD\n50,000 spectators\n80 entrances · 76 numbered",
        "cta_text": "do this · arena floor tour\nbook 3 months out",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "diamond" / "colosseum_diamond.jpg",
            "monument": "Colosseum",
            "tier": "Diamond",
            "subtitle": "Rome, Italy  ·  arena floor tour at sunset",
            "secs": 4.5,
        },
        "caption": (
            "the floor you see isnt the floor. the real one was sand.\n\n"
            "the colosseum. rome. opened 80 AD under emperor titus. 50,000 spectators packed in through 80 numbered entrances — exits 1-76 for the public, the remaining 4 for the emperor, vestal virgins, and gladiators. the wooden arena floor was covered in sand (latin: harena) to soak up blood. what you see today is the hypogeum — the subterranean tunnel network underneath that held the cages, traps, and elevators.\n\n"
            "do this: book the arena floor tour 3 months out — sunset slot puts you standing where the gladiators entered. diamond badge unlocks.\n\n"
            "save this for the roma trip you keep planning around the vatican only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Colosseum #RomeTravel #ItalyTravel #AncientRome #gekneequest\n\n"
            "🎵 PAIR WITH: \"Now We Are Free\" — Hans Zimmer (Gladiator). Vocal opens on the hook, full orchestra hits the reveal."
        ),
        "based_on": "5s-retention: pattern-interrupt visual fact ('the floor isnt the floor') + harena etymology + hypogeum body. Hans Zimmer's Gladiator score is the literal music for this monument.",
    },

    "rushmore-dynamite": {
        "search_queries": [
            "mount rushmore face close up",
            "presidents stone carving detail",
            "mount rushmore south dakota aerial",
            "black hills south dakota",
            "rushmore patriotic monument",
            "american mountain landscape",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "never thought a mountain\ncould blow off\nits own face.",
        "body": "south dakota · 1927-1941\n4 presidents · 18m tall\n90% carved by dynamite",
        "cta_text": "go to the avenue of flags\nfirst light at 6am",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "celestial" / "mt_rushmore_celestial.jpg",
            "monument": "Mount Rushmore",
            "tier": "Celestial",
            "subtitle": "Black Hills, South Dakota  ·  Avenue of Flags at first light",
            "secs": 4.5,
        },
        "caption": (
            "never thought a mountain could blow off its own face.\n\n"
            "mount rushmore. black hills, south dakota. carved 1927-1941 by gutzon borglum and ~400 workers. each presidential face is ~18 meters tall — roughly 60 feet. 90% of the material was removed using DYNAMITE, not chisels. the precision blasting got within 7-10cm of the final surface, then handheld jackhammers and small charges did the rest. no worker died on the project.\n\n"
            "go to the avenue of flags at first light (6am) — eastern light hits the faces straight on and the morning crowd hasnt shown up yet. celestial badge unlocks.\n\n"
            "save this for the road trip you keep saying youll take across the dakotas.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#MountRushmore #SouthDakota #USATravel #AmericanHistory #gekneequest\n\n"
            "🎵 PAIR WITH: \"Fanfare for the Common Man\" — Aaron Copland. Brass swell on the hook, full brass + percussion hit the reveal."
        ),
        "based_on": "5s-retention: pattern-interrupt hook ('mountain blew off its face') + dynamite stat = unbelievable-but-true. Copland fanfare = literal american icon score.",
    },

    # ── batch 17 — daily 2026-06-24 set (6 reels) ──
    # 1 net-new monument (Eiffel) + 5 second-take concepts on existing
    # monuments with fresh viral hooks + different skin tiers (the 31-
    # monument catalog has been fully covered once).

    "eiffel-iron-lady": {
        "search_queries": [
            "eiffel tower iron lattice closeup",
            "eiffel tower base detail",
            "eiffel tower paris aerial",
            "paris cityscape sunset",
            "champ de mars paris evening",
            "paris seine river evening",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "the iron lady\nwas supposed to be\ntorn down in 1909.",
        "body": "paris · 1889 worlds fair\nrust-proof iron · 18,038 parts\nsaved by radio antennas",
        "cta_text": "go to trocadero at twilight\nbest paris postcard angle",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "damascus" / "eiffel_tower_damascus.jpg",
            "monument": "Eiffel Tower",
            "tier": "Damascus",
            "subtitle": "Paris, France  ·  Trocadéro platform at twilight",
            "secs": 4.5,
        },
        "caption": (
            "the iron lady was supposed to be torn down in 1909.\n\n"
            "eiffel tower. paris. built for the 1889 worlds fair as a temporary structure to celebrate the centennial of the french revolution. 18,038 wrought-iron parts, 2.5 million rivets. parisian artists hated it. it was scheduled for demolition in 1909 — saved at the last minute because the french military realized it made an unbeatable radio antenna.\n\n"
            "go to trocadero at twilight. the elevated platform across the seine frames her against the paris skyline — best postcard angle in the city. damascus badge unlocks.\n\n"
            "save this for the paris trip you keep saying is overrated.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#EiffelTower #ParisTravel #FranceTravel #IronLady #gekneequest\n\n"
            "🎵 PAIR WITH: \"La Vie en Rose\" — Edith Piaf. Accordion opens on the hook, vocal lands on the reveal."
        ),
        "based_on": "5s-retention: 'supposed to be torn down' reframes a permanent icon as nearly-lost. Damascus skin is rare, gives reveal premium feel.",
    },

    "taj-symmetry-trick": {
        "search_queries": [
            "taj mahal symmetry close up",
            "taj mahal reflection pool",
            "taj mahal india aerial",
            "agra india pink dawn",
            "white marble inlay close",
            "indian palace garden",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "every line you see\nhas a perfect mirror.\nexcept one.",
        "body": "agra · india · 1653\nmumtaz tomb dead center\nshah jahan tomb broke the rule",
        "cta_text": "do this · cross the gardens\nat first light",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "silver" / "taj_mahal_silver.jpg",
            "monument": "Taj Mahal",
            "tier": "Silver",
            "subtitle": "Agra, India  ·  cross the reflecting gardens at first light",
            "secs": 4.5,
        },
        "caption": (
            "every line you see has a perfect mirror. except one.\n\n"
            "taj mahal. agra. built 1632-1653 by shah jahan as a mausoleum for his wife mumtaz mahal. obsessively symmetrical — twin minarets, mirror-image gardens, four identical facades. mumtaz lies dead center under the dome. when shah jahan died in 1666, his son buried him next to her — the only asymmetric element in the entire complex.\n\n"
            "do this: cross the reflecting gardens at first light. the marble blushes pink while the crowd is still at breakfast. silver badge unlocks.\n\n"
            "save this for the india trip you keep researching but never booking.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#TajMahal #IndiaTravel #AgraTravel #Symmetry #gekneequest\n\n"
            "🎵 PAIR WITH: \"Aaj Phir Jeene Ki Tamanna Hai\" — Lata Mangeshkar. Sitar opens on the hook, vocal swells on the reveal."
        ),
        "based_on": "5s-retention: rule-then-exception hook. The shah jahan asymmetry detail is a save-trigger fact most viewers dont know.",
    },

    "sagrada-stone-forest": {
        "search_queries": [
            "sagrada familia column branch interior",
            "stained glass colored light cathedral",
            "sagrada familia barcelona aerial",
            "barcelona church architecture",
            "gothic cathedral light beam",
            "barcelona modern architecture",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "gaudi thought\ngod was a forester.\nso he built a forest in stone.",
        "body": "barcelona · spain\ncolumns branch like trees\nlight filters through stained glass",
        "cta_text": "go to the central nave at 4pm\nthe colors arrive",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "celestial" / "sagrada_familia_celestial.jpg",
            "monument": "Sagrada Familia",
            "tier": "Celestial",
            "subtitle": "Barcelona, Spain  ·  step into the central nave at 4pm",
            "secs": 4.5,
        },
        "caption": (
            "gaudi thought god was a forester. so he built a forest in stone.\n\n"
            "sagrada familia. barcelona. antoni gaudi believed nature was the highest form of architecture — straight lines were a human invention, curves were divine. the interior columns branch upward into a hyperboloid canopy, mimicking a redwood forest. west-side stained glass throws warm orange light onto the columns in the late afternoon; east-side cool blue in the morning. the building literally changes color with the time of day.\n\n"
            "go to the central nave at 4pm. the warm-side stained glass arrives — orange and red soaked into the stone forest. celestial badge unlocks.\n\n"
            "save this for the barcelona trip you keep using for tapas only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SagradaFamilia #BarcelonaTravel #Gaudi #StainedGlass #gekneequest\n\n"
            "🎵 PAIR WITH: \"Spiegel im Spiegel\" — Arvo Pärt. Sparse piano + violin matches the slow-light reveal."
        ),
        "based_on": "5s-retention: poetic-paradox hook (god + forester) + light-changes-with-time-of-day body. Celestial purple tier matches the stained-glass mood.",
    },

    "petra-indiana-jones": {
        "search_queries": [
            "petra treasury facade close detail",
            "siq canyon walls petra",
            "petra jordan aerial drone",
            "rose city sandstone close",
            "desert canyon golden light",
            "petra treasury reveal",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "indiana jones\nfound it at the end\nof a canyon.",
        "body": "jordan · wadi musa\ncarved into rose sandstone\nhidden for 2,000 years",
        "cta_text": "do this · walk the siq at dawn\ntreasury reveals",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "diamond" / "petra_diamond.jpg",
            "monument": "Petra",
            "tier": "Diamond",
            "subtitle": "Wadi Musa, Jordan  ·  walk the Siq at dawn for the treasury reveal",
            "secs": 4.5,
        },
        "caption": (
            "indiana jones found it at the end of a canyon. so did the nabateans.\n\n"
            "petra. jordan. the treasury (al-khazneh) was carved into rose-pink sandstone around 100 BC by the nabateans — a wealthy trading civilization that controlled the incense routes from arabia to the mediterranean. abandoned after roman conquest. the world forgot about it until 1812 when swiss explorer johann burckhardt walked the siq canyon disguised as a bedouin. indiana jones and the last crusade used the same reveal shot in 1989.\n\n"
            "do this: walk the 1.2km siq canyon at dawn. the slot canyon narrows to a sliver — then the treasury opens up in front of you. diamond badge unlocks.\n\n"
            "save this for the jordan trip everyone keeps saying is too far.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Petra #JordanTravel #IndianaJones #BucketList #gekneequest\n\n"
            "🎵 PAIR WITH: \"Raiders March\" — John Williams. Brass fanfare hits exactly when the treasury reveals."
        ),
        "based_on": "5s-retention: pop-culture reference hook (Indiana Jones is universally recognized) + 1812 rediscovery story. Diamond tier matches the treasury facade.",
    },

    "fushimi-business-prayer": {
        "search_queries": [
            "fushimi inari torii gate inscription",
            "japanese shrine red gates close",
            "kyoto fushimi inari aerial",
            "japanese temple stone fox",
            "kyoto bamboo forest",
            "japanese shrine forest path",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "every red gate here\nwas paid for\nby a business owner.",
        "body": "kyoto · japan\n10,000+ donated torii\nprayers for prosperity",
        "cta_text": "go to mt inari at 6am\nbeat the tour buses",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "aurora" / "fushimi_inari_aurora.jpg",
            "monument": "Fushimi Inari",
            "tier": "Aurora",
            "subtitle": "Kyoto, Japan  ·  start the climb before 7am",
            "secs": 4.5,
        },
        "caption": (
            "every red gate here was paid for by a business owner.\n\n"
            "fushimi inari taisha. kyoto. inari is the shinto god of rice, sake, and prosperity. every torii on the mountain was donated by a company or merchant asking for inari favor — name and donation date carved into the back of each gate. the smallest donations cost a few hundred dollars; the largest, gates near the summit, cost millions. there are over 10,000 of them total along a 4km trail up mount inari.\n\n"
            "go to mt inari at 6am. start the climb before 7am — empty trail, no tour buses, only the carved inscriptions for company. aurora badge unlocks.\n\n"
            "save this for the kyoto trip everyone stops at the entrance of.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#FushimiInari #KyotoTravel #JapanTravel #Shinto #gekneequest\n\n"
            "🎵 PAIR WITH: \"Sakura\" — koto traditional. Sparse plucked strings through hook + body, swell on the reveal."
        ),
        "based_on": "5s-retention: capitalism-meets-religion hook (transaction-as-prayer) is unexpected. 6am-empty-trail body is a save-worthy insider tip.",
    },

    "hagia-sophia-pivot": {
        "search_queries": [
            "hagia sophia dome interior close",
            "byzantine mosaic detail gold",
            "hagia sophia istanbul aerial",
            "istanbul old city minarets",
            "ottoman architecture interior",
            "istanbul bosphorus sunset",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "this building\nhas changed religions\n4 times.",
        "body": "istanbul · turkey\nchurch 537 · mosque 1453\nmuseum 1934 · mosque again 2020",
        "cta_text": "do this · stand under the dome\nfirst prayer · 5am",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "gold" / "hagia_sophia_gold.jpg",
            "monument": "Hagia Sophia",
            "tier": "Gold",
            "subtitle": "Istanbul, Türkiye  ·  stand under the central dome at first prayer",
            "secs": 4.5,
        },
        "caption": (
            "this building has changed religions 4 times.\n\n"
            "hagia sophia. istanbul. completed 537 AD by emperor justinian as the largest cathedral in christendom for nearly 1,000 years. converted to a mosque in 1453 when constantinople fell to the ottomans. secularized as a museum in 1934 under atatürk. reverted to a mosque again in 2020. the byzantine gold-leaf mosaics of christ pantocrator are still visible above the islamic calligraphy — both faiths layered on the same dome.\n\n"
            "do this: stand under the central dome at first prayer (5am). the gold mosaics catch the first warm light and the whole space goes amber. gold badge unlocks.\n\n"
            "save this for the istanbul trip you keep planning around the bazaar.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#HagiaSophia #IstanbulTravel #TurkeyTravel #ByzantineHistory #gekneequest\n\n"
            "🎵 PAIR WITH: \"Cantemir Bey Pesrevi\" — Yorgo Bacanos (oud). Ottoman classical opens on the hook, builds to the reveal."
        ),
        "based_on": "5s-retention: stat-of-the-pivot hook (4 religions in 1 building) + dual-faith mosaic body. Gold tier matches the byzantine mosaics.",
    },

    # ── batch 18 — daily 2026-06-25 (second-take wave) ──
    # 31-monument catalog fully covered; each picks an existing monument
    # with a new viral-hook angle + a different skin tier than the first take.

    "burj-wind-sway": {
        "search_queries": [
            "burj khalifa top close detail",
            "dubai skyscraper glass facade",
            "burj khalifa dubai aerial",
            "dubai marina night skyline",
            "dubai cityscape sunset",
            "modern city neon lights",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "what if I told you\nthe top floors\nsway 5 feet in the wind.",
        "body": "dubai · 828m · 163 floors\nbuilt to flex in storms\nlongest elevator on earth",
        "cta_text": "go to floor 154 at golden hour\nthe earth bends in front of you",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "damascus" / "burj_khalifa_damascus.jpg",
            "monument": "Burj Khalifa",
            "tier": "Damascus",
            "subtitle": "Dubai, UAE  ·  Sky Lounge floor 154 at golden hour",
            "secs": 4.5,
        },
        "caption": (
            "what if I told you the top floors sway 5 feet in the wind.\n\n"
            "burj khalifa. dubai. 828 meters tall, 163 floors. the tuned-mass-damper-free design lets the top of the building flex up to 1.5m (about 5 feet) in each direction during storms — by design, not failure. the elevator from ground to observation deck is the longest single-shaft elevator on earth at 504m. the foundation contains 110,000 tonnes of concrete poured in a single continuous 22-hour event so the curing was uniform.\n\n"
            "go to floor 154 at golden hour. the city below shrinks to a circuit board; the earth visibly curves at the horizon. damascus badge unlocks.\n\n"
            "save this for the next layover in dubai you book on purpose.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#BurjKhalifa #DubaiTravel #UAE #SkyscraperViews #gekneequest\n\n"
            "🎵 PAIR WITH: \"Daydreaming\" — Radiohead. Sparse piano through hook, builds to the reveal with a slow swell."
        ),
        "based_on": "5s-retention: 'what if I told you' hook + sway-stat is provably surprising. Damascus tier (warm brown) contrasts the glass-and-steel imagery.",
    },

    "opera-ugly-toilet": {
        "search_queries": [
            "sydney opera house shell close up",
            "sydney opera tile detail",
            "sydney opera house aerial drone",
            "sydney harbour bridge sunset",
            "circular quay ferry sydney",
            "sydney australia skyline",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "everyone hated this\nbefore it was built.\nnow we sell magnets.",
        "body": "sydney · bennelong point\n233 architects rejected\njorn utzon never saw it open",
        "cta_text": "do this · circular quay ferry\nat blue hour",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "aurora" / "sydney_opera_aurora.jpg",
            "monument": "Sydney Opera House",
            "tier": "Aurora",
            "subtitle": "Sydney, Australia  ·  ride Circular Quay ferry at blue hour",
            "secs": 4.5,
        },
        "caption": (
            "everyone hated this before it was built. now we sell magnets.\n\n"
            "sydney opera house. bennelong point. the 1957 design competition pulled 233 entries — judges rejected every single conventional submission and pulled jorn utzon, an unknown danish architect, out of the discard pile. critics called the proposal a giant white turtle, an insect, and worse. construction took 14 years and ran 1,357% over budget. utzon resigned mid-build, never returned to australia, never saw the building open.\n\n"
            "do this: ride the circular quay ferry at blue hour. the shells shift from white to opal in the 20 minutes after sunset. aurora badge unlocks.\n\n"
            "save this for the next time your idea gets called ugly.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SydneyOperaHouse #AustraliaTravel #Architecture #Utzon #gekneequest\n\n"
            "🎵 PAIR WITH: \"Chandelier\" — Sia. Slow build through the hook, drop hits exactly when the reveal card lands."
        ),
        "based_on": "5s-retention: contrarian-history hook (everyone hated it) + Utzon backstory humanizes. Aurora green-teal matches the harbour mood.",
    },

    "great-wall-graveyard": {
        # Pexels VIDEO library has weak Great Wall tagging (most hits return
        # generic hiking or unrelated stone arches). Switching to Pexels
        # IMAGE library — 8000+ results — and Ken-Burns'ing 6 stills.
        # 1 video clip kept as a minimum (builder requires >=1).
        "search_queries": ["beijing china aerial"],
        "n_clips": 1,
        "clip_secs": 1.8,
        "hook": "the longest graveyard\non earth\nruns 13,000 miles.",
        "body": "china · 7th century BC\nworkers buried in foundations\nmillions died building it",
        "cta_text": "go to mutianyu at dawn\nrestored · 90 mins from beijing",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [
            {"source": "path", "path": str(Path.home() / "geknee" / "ad-assets" / "great-wall-photos" / "gw-37099875.jpg"), "secs": 1.8, "motion": "zoom-in"},
            {"source": "path", "path": str(Path.home() / "geknee" / "ad-assets" / "great-wall-photos" / "gw-2304791.jpg"),  "secs": 1.8, "motion": "pan-right"},
            {"source": "path", "path": str(Path.home() / "geknee" / "ad-assets" / "great-wall-photos" / "gw-34021118.jpg"), "secs": 1.8, "motion": "zoom-out"},
            {"source": "path", "path": str(Path.home() / "geknee" / "ad-assets" / "great-wall-photos" / "gw-2412603.jpg"),  "secs": 1.8, "motion": "pan-left"},
            {"source": "path", "path": str(Path.home() / "geknee" / "ad-assets" / "great-wall-photos" / "gw-18709769.jpg"), "secs": 1.8, "motion": "zoom-in"},
            {"source": "path", "path": str(Path.home() / "geknee" / "ad-assets" / "great-wall-photos" / "gw-18764168.jpg"), "secs": 1.8, "motion": "pan-right"},
        ],
        "reveal": {
            "badge": BADGES / "gold" / "great_wall_gold.jpg",
            "monument": "Great Wall of China",
            "tier": "Gold",
            "subtitle": "Mutianyu, China  ·  hike a restored section at dawn",
            "secs": 4.5,
        },
        "caption": (
            "the longest graveyard on earth runs 13,000 miles.\n\n"
            "great wall of china. construction spanned over 2,300 years, peaking under the ming dynasty (1368-1644). estimates of worker deaths range from 400,000 to over a million — many soldiers, peasants, and prisoners died on site and were buried directly into the wall's foundations, a practice meant to bind the souls of the dead to the wall as eternal guardians. it earned the wall the nickname \"the longest cemetery on earth.\"\n\n"
            "go to mutianyu at dawn. 90 minutes from beijing, restored, far less crowded than badaling — pure silence on the watchtowers before the 9am crowds arrive. gold badge unlocks.\n\n"
            "save this for the china trip you keep planning around shopping malls.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#GreatWall #ChinaTravel #BucketList #AncientHistory #gekneequest\n\n"
            "🎵 PAIR WITH: \"Endure\" — Hua Yi Brothers. Slow erhu through hook + body, percussion swells on the reveal."
        ),
        "based_on": "5s-retention: dark-history hook (graveyard) + buried-workers fact is morbid but documented. Gold tier matches sunrise.",
    },

    # ── batch 19 — daily 2026-06-25 ──
    # Template: replicate taj-symmetry-trick (1.3K views). Rule-then-exception
    # hook + story-fact body + specific-timing CTA + premium tier + native song.

    "easter-akivi-7-sea": {
        "search_queries": [
            "ahu akivi moai sunset",
            "moai stone face detail",
            "rapa nui chile aerial",
            "easter island pacific sunset",
            "pacific volcanic island remote",
            "moai silhouette dusk",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "887 moai face inland.\n7 of them face the sea.",
        "body": "rapa nui · ahu akivi\nlegend · 7 explorer scouts\nwatching the horizon for home",
        "cta_text": "go to ahu akivi at sunset\nbacklit by the pacific",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "diamond" / "easter_island_diamond.jpg",
            "monument": "Easter Island",
            "tier": "Diamond",
            "subtitle": "Rapa Nui, Chile  ·  reach Ahu Akivi at sunset",
            "secs": 4.5,
        },
        "caption": (
            "887 moai face inland. 7 of them face the sea.\n\n"
            "rapa nui (easter island). of the 887 moai carved between 1100 and 1680, every single one was placed to watch over the islanders — except the 7 at Ahu Akivi, in the island's interior. according to rapa nui oral tradition, they represent the 7 polynesian scouts sent by king hotu matua to find this island. they were the first to see it. they still face the horizon they crossed to get here.\n\n"
            "go to ahu akivi at sunset. backlit by the pacific, 7 statues silhouetted against orange water. diamond badge unlocks.\n\n"
            "save this for the trip everyone says is too far.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#EasterIsland #RapaNui #AhuAkivi #Polynesia #gekneequest\n\n"
            "🎵 PAIR WITH: \"Te Vaka — Tamahere\". Polynesian percussion + chant builds through hook + body, drum drop on the reveal."
        ),
        "based_on": "Taj-template clone: rule-then-exception hook (887 vs 7) + emotional-anchor scout legend + sunset-silhouette ritual. Diamond tier premium feel.",
    },

    "angkor-west-facing": {
        "search_queries": [
            "angkor wat sunset close detail",
            "khmer temple stone carving",
            "angkor wat aerial drone",
            "cambodia ancient temple jungle",
            "angkor wat moat reflection",
            "siem reap temple sunrise",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "every khmer temple\nfaces sunrise.\nexcept this one.",
        "body": "siem reap · cambodia\n12th century khmer\nbuilt facing sunset · not sunrise",
        "cta_text": "go to angkor wat at dusk\nwalk in from the west gate",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "angkor_wat_bronze.jpg",
            "monument": "Angkor Wat",
            "tier": "Bronze",
            "subtitle": "Siem Reap, Cambodia  ·  enter through the west gate at dusk",
            "secs": 4.5,
        },
        "caption": (
            "every khmer temple faces sunrise. except this one.\n\n"
            "angkor wat. siem reap, cambodia. built in the 12th century by king suryavarman II as a hindu temple to vishnu. every other major khmer temple is oriented east toward the sunrise — the direction of life. angkor wat faces west toward the sunset, the direction associated with death and the afterlife. historians believe suryavarman built it as his own funerary temple. you read his tomb from the back, walking in.\n\n"
            "go to angkor wat at dusk. enter through the west gate — the way you were meant to. bronze badge unlocks.\n\n"
            "save this for the cambodia trip everyone uses for sunrise instagram only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#AngkorWat #CambodiaTravel #KhmerTemple #SiemReap #gekneequest\n\n"
            "🎵 PAIR WITH: \"Pinpeat Ensemble — Khmer Classical\". Traditional cambodian percussion + flute through hook + body, gong on the reveal."
        ),
        "based_on": "Taj-template clone: rule-then-exception (all temples face east, this one faces west) + funerary-temple emotional anchor + dusk west-gate ritual.",
    },

    "rushmore-jefferson-twice": {
        "search_queries": [
            "mount rushmore face close detail",
            "presidents stone carving detail",
            "mount rushmore south dakota aerial",
            "black hills south dakota mountain",
            "american mountain landscape sunset",
            "national monument visitor america",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "3 presidents got carved once.\njefferson got carved twice.",
        "body": "black hills · 1934\nfirst attempt failed · blasted off\nrecarved on the other side",
        "cta_text": "do this · presidential trail loop\ngutzon studio at the end",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "silver" / "mt_rushmore_silver.jpg",
            "monument": "Mount Rushmore",
            "tier": "Silver",
            "subtitle": "Black Hills, SD  ·  walk the Presidential Trail at first light",
            "secs": 4.5,
        },
        "caption": (
            "3 presidents got carved once. jefferson got carved twice.\n\n"
            "mount rushmore. black hills, south dakota. gutzon borglum started carving thomas jefferson to washington's right in 1934. the granite proved structurally unsound — after 2 years of work, the partially-carved face was completely blasted off the mountain. borglum restarted from scratch on washington's left, where you see jefferson today. you can still see the ghost outline of the first attempt if you know where to look.\n\n"
            "do this: walk the presidential trail loop. it ends at the gutzon borglum sculptor studio with the original 1/12-scale plaster model. silver badge unlocks.\n\n"
            "save this for the road trip across the dakotas that you keep delaying.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#MountRushmore #SouthDakota #USATravel #PresidentialTrail #gekneequest\n\n"
            "🎵 PAIR WITH: \"Country Roads — John Denver\". Acoustic opens the hook, harmony swells on the reveal."
        ),
        "based_on": "Taj-template clone: rule-then-exception (3 carved once vs jefferson twice) + ghost-of-first-attempt story + studio-at-trail-end ritual. Silver tier for premium feel.",
    },

    # ── batch 20 — daily 2026-06-26 ──
    "fushimi-summit-empty": {
        "search_queries": [
            "fushimi inari fox stone statue",
            "kyoto torii gate close detail",
            "fushimi inari kyoto aerial",
            "japanese shrine forest steps",
            "kyoto bamboo path morning",
            "japanese mountain trail mist",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "10,000 gates draw the crowd.\nthe summit is empty.",
        "body": "kyoto · mount inari\n4 hours up · 233 meters\n90% turn back at 30 mins",
        "cta_text": "do this · summit before noon\nstone foxes guard the top",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "diamond" / "fushimi_inari_diamond.jpg",
            "monument": "Fushimi Inari",
            "tier": "Diamond",
            "subtitle": "Kyoto, Japan  ·  reach the summit shrine before noon",
            "secs": 4.5,
        },
        "caption": (
            "10,000 gates draw the crowd. the summit is empty.\n\n"
            "fushimi inari taisha. kyoto. inari is the shinto god of rice, sake, and prosperity. the iconic torii tunnel runs from the base for the first 30 minutes of the climb — where 90% of visitors turn back. past that the gates thin, the crowd disappears, and the trail climbs another 200 meters through cedar forest to a summit shrine guarded by carved stone foxes (kitsune), inaris messengers.\n\n"
            "do this: summit before noon. start at 6am, you have the top to yourself by 8. diamond badge unlocks.\n\n"
            "save this for the kyoto trip everyone stops at the entrance of.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#FushimiInari #KyotoTravel #JapanTravel #ShintoShrine #gekneequest\n\n"
            "🎵 PAIR WITH: \"Mononoke Forest Spirit\" — Joe Hisaishi. Sparse koto + strings build through hook + body, swell on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (crowd vs empty summit) + insider-tip body + stone-fox emotional anchor. Diamond tier premium.",
    },

    "petra-monastery-800-steps": {
        "search_queries": [
            "petra monastery ad deir close",
            "petra rock carving facade",
            "petra jordan aerial drone",
            "siq canyon walls petra",
            "jordan desert sandstone",
            "bedouin petra mountain trail",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "everyone photographs the treasury.\nthe monastery is bigger.",
        "body": "petra · jordan\nad deir · 47m tall\n800 steps · 2 hour climb",
        "cta_text": "go to ad deir at 4pm\nlast light hits the facade",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "gold" / "petra_gold.jpg",
            "monument": "Petra",
            "tier": "Gold",
            "subtitle": "Wadi Musa, Jordan  ·  climb 800 steps to Ad Deir at 4pm",
            "secs": 4.5,
        },
        "caption": (
            "everyone photographs the treasury. the monastery is bigger.\n\n"
            "petra. jordan. the treasury (al-khazneh) is the famous facade indiana jones made world-famous. but 800 steps up the mountain, deep in the back of the city, sits ad deir — the monastery. 47 meters tall, 50 meters wide, carved into the cliff face around 100 BC. most tourists never climb. the bedouin tea stand at the top sells mint tea you drink across from a thousand-year-old facade in complete silence.\n\n"
            "go to ad deir at 4pm. late-afternoon sun hits the facade dead on, the climb is in shade. gold badge unlocks.\n\n"
            "save this for the petra trip you keep planning around the treasury only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Petra #JordanTravel #AdDeir #HiddenTravel #gekneequest\n\n"
            "🎵 PAIR WITH: \"Ya Tara — Trio Joubran\". Oud + percussion through hook + body, vocal swell on the reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (treasury crowd vs monastery silence) + 800-steps body fact + bedouin tea emotional anchor + late-light ritual. Gold tier.",
    },

    "hagia-mosaic-uncovered": {
        "search_queries": [
            "hagia sophia mosaic close gold",
            "byzantine mosaic detail",
            "hagia sophia istanbul aerial",
            "istanbul bosphorus skyline",
            "ottoman calligraphy interior",
            "istanbul old city dome",
        ],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "they whitewashed the mosaics.\nuntil 1934.",
        "body": "istanbul · hagia sophia\nbyzantine gold under plaster\nrediscovered after 481 years",
        "cta_text": "do this · upper gallery at 7am\nthe mosaics still hide here",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "celestial" / "hagia_sophia_celestial.jpg",
            "monument": "Hagia Sophia",
            "tier": "Celestial",
            "subtitle": "Istanbul, Türkiye  ·  climb the upper gallery at 7am",
            "secs": 4.5,
        },
        "caption": (
            "they whitewashed the mosaics. until 1934.\n\n"
            "hagia sophia. istanbul. when mehmed II converted the cathedral to a mosque in 1453, the figurative byzantine mosaics of christ, mary, and the saints were considered idolatrous under islamic law. instead of destroying them, the ottomans plastered over them. the gold tesserae sat hidden for 481 years. atatürks 1934 secularization restored the building as a museum, and conservators began carefully removing plaster. the mosaics were back, in full color, glittering under the dome.\n\n"
            "do this: climb to the upper gallery at 7am. some original mosaics survive only in that quiet corner. celestial badge unlocks.\n\n"
            "save this for the istanbul trip you keep planning around the bazaar only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#HagiaSophia #IstanbulTravel #ByzantineMosaics #TurkeyTravel #gekneequest\n\n"
            "🎵 PAIR WITH: \"Adhan + Byzantine Chant\" — Capella Romana. Layered sacred vocals build through hook + body, swell on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (mosaics covered vs uncovered) + 481-year hidden body + upper-gallery ritual. Celestial premium tier matches the gold mosaics.",
    },
    "sigiriya-mirror-wall": {
        "search_queries": [
            "sigiriya",
            "sigiriya rock",
            "sigiriya frescoes",
            "dambulla sri lanka",
            "habarana sri lanka",
            "sri lanka village rural",
        ],
        "pexels_ids": [29038151, 18466622, 18466623, 18466624, 35153451, 29143993],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "the mirror wall holds\n1,500 years of graffiti.\nstill readable.",
        "body": "sri lanka · sigiriya\n200m carved rock fortress\nbuilt 477 AD by kashyapa",
        "cta_text": "do this · 5am climb in dark\nfresco gallery breaks dawn",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "sigiriya_bronze.jpg",
            "monument": "Sigiriya",
            "tier": "Bronze",
            "subtitle": "Central Sri Lanka  ·  5am headlamp climb for the empty fresco gallery",
            "secs": 4.5,
        },
        "caption": (
            "the mirror wall holds 1,500 years of graffiti. still readable.\n\n"
            "sigiriya. central sri lanka. a 200-meter column of magma-cooled rock that king kashyapa I carved into a fortress city between 477 and 495 AD, paranoid that his brother would return from exile to take the throne. the fortress was abandoned shortly after his death and became a buddhist monastery for the next 800 years. halfway up the climb, behind a polished plaster wall — once so smooth the king could see his reflection in it — sit the sigiriya frescoes, life-sized portraits of court women painted directly onto the rock face. visitors to that wall, starting around 600 AD, began carving their names and short verses into the plaster. those inscriptions are still legible today, the oldest known graffiti in the world, and a continuous record of 1,500 years of people standing where you stand.\n\n"
            "do this: start the climb at 5am with a headlamp. the fresco gallery breaks at first light and you have it to yourself before the tour buses arrive at 8.\n\n"
            "save this for the sri lanka trip you keep planning around the beaches only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Sigiriya #SriLanka #LionRock #SriLankaTravel #gekneequest\n\n"
            "🎵 PAIR WITH: cinematic-discovery sitar + tabla. Sparse build through hook + body, drone-strike on the climb reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (wall pristine vs covered in graffiti) + 1,500-year continuous record + dawn climb ritual. No badge tier yet.",
    },
    "borobudur-504-buddhas": {
        "search_queries": [
            "borobudur",
            "borobudur sunrise",
            "borobudur stupa",
            "yogyakarta indonesia",
            "central java temple",
            "javanese village culture",
        ],
        "pexels_ids": [28332560, 31579288, 34431391, 12333782, 35278660],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "504 buddhas.\none path. you walk\nthe whole way up.",
        "body": "indonesia · borobudur\nbuilt 800 AD · 9 platforms\n2,672 relief panels",
        "cta_text": "do this · manohara sunrise gate\nclimb during morning chants",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "gold" / "borobudur_gold.jpg",
            "monument": "Borobudur",
            "tier": "Gold",
            "subtitle": "Central Java, Indonesia  ·  manohara sunrise gate at 4:30am",
            "secs": 4.5,
        },
        "caption": (
            "504 buddhas. one path. you walk the whole way up.\n\n"
            "borobudur. central java, indonesia. the largest buddhist temple in the world. constructed around 800 AD under the sailendra dynasty, abandoned in the 14th century when the population converted to islam, swallowed by jungle, and not rediscovered until 1814 when raffles sent a survey team in. the structure is 9 stacked platforms — 6 square, 3 circular, capped by a central stupa — representing the buddhist cosmology of kāmadhātu (the world of desire), rūpadhātu (forms), and arūpadhātu (formlessness). 504 buddha statues sit across the levels, and the gallery walls hold 2,672 individual relief panels — the longest continuous narrative bas-relief on earth. the temple is not viewed. it is walked. clockwise. all the way up. it is a 3D pilgrimage carved in stone.\n\n"
            "do this: enter through the manohara hotel sunrise gate. you start the climb at 4:30am, while the monks chant in the lower galleries, and reach the top stupa as first light hits.\n\n"
            "save this for the indonesia trip everyone plans around bali only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Borobudur #Indonesia #JavaTravel #BuddhistTemple #gekneequest\n\n"
            "🎵 PAIR WITH: gamelan + sparse strings. Builds through hook + body, deep gong on the stupa reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (temple viewed vs temple walked) + 504-buddha 2672-panel body + manohara sunrise ritual. No badge tier yet.",
    },
    "bagan-2200-temples": {
        "search_queries": [
            "bagan",
            "bagan pagoda",
            "bagan balloon",
            "irrawaddy river myanmar",
            "myanmar countryside",
            "burmese monk procession",
        ],
        "pexels_ids": [35973307, 36401539, 36401541, 32633384, 16032143, 35266695],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "they built 1 temple\nper family.\nfor 250 years.",
        "body": "myanmar · bagan plain\n10,000 built · 2,200 stand\n9th to 13th century",
        "cta_text": "do this · balloon ride sunrise\nfrom nyaung u airfield",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "bagan_bronze.jpg",
            "monument": "Bagan",
            "tier": "Bronze",
            "subtitle": "Central Myanmar  ·  Nyaung U airfield sunrise balloon in November",
            "secs": 4.5,
        },
        "caption": (
            "they built one temple per family. for 250 years.\n\n"
            "bagan. central myanmar. the capital of the pagan kingdom from 1044 to 1297, the empire that unified the region for the first time. theravāda buddhism was the state religion, and merit-making — building a temple to earn karmic credit — was the dominant cultural practice. every family with means built one. over 250 years, more than 10,000 temples, stupas, and monasteries went up across a 26-square-mile plain on the banks of the irrawaddy river. the kingdom collapsed under the mongol invasion in 1287. earthquakes and neglect have taken most of the rest. 2,200 of those original structures are still standing today, scattered across the plain in every direction, and you can rent a bike and reach 30 of them in a single morning.\n\n"
            "do this: book the sunrise balloon launch from nyaung u airfield in november. the hot air sits a few hundred feet over the temples in the cold dawn air and you watch the plain wake up beneath you.\n\n"
            "save this for the southeast asia trip everyone reduces to thailand.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Bagan #Myanmar #BurmaTravel #BaganTemples #gekneequest\n\n"
            "🎵 PAIR WITH: sparse pat-keh xylophone + drone. Builds through hook + body, balloon-burner whoosh on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (1 temple vs 10,000) + pagan-empire body + sunrise balloon ritual. No badge tier yet.",
    },
    "mont-saint-michel-tide": {
        "search_queries": [
            "mont saint michel",
            "mont saint michel abbey",
            "mont saint michel tide",
            "normandy coast france",
            "normandy village",
            "french abbey gothic interior",
        ],
        "pexels_ids": [26568890, 28754006, 34168417, 27739875, 14147294, 37273760],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "it becomes an island.\ntwice a day.\nevery day.",
        "body": "france · mont saint-michel\n7th-century abbey\n14m tide swing in the bay",
        "cta_text": "do this · low tide on foot\ncross the sand at dawn",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "silver" / "mont_saint_michel_silver.jpg",
            "monument": "Mont Saint-Michel",
            "tier": "Silver",
            "subtitle": "Normandy, France  ·  low-tide barefoot crossing from Bec dAndaine",
            "secs": 4.5,
        },
        "caption": (
            "it becomes an island. twice a day. every day.\n\n"
            "mont saint-michel. normandy coast, france. a tidal island anchored by a benedictine abbey first built in 708 AD by aubert, bishop of avranches, after the archangel michael appeared to him three times. the abbey was extended over the next thousand years into the gothic complex you see now. the island sits in the mont saint-michel bay, which has the largest tidal range in continental europe — up to 14 meters between high and low tide. at low tide you can walk to the abbey across firm sand. at high tide the sea reclaims the causeway and the abbey is genuinely cut off, the way it was for pilgrims for 1,200 years. the bridge built in 2014 stays above water so the modern access is no longer interrupted, but the island below it still drowns on schedule.\n\n"
            "do this: time your visit so you cross at low tide on foot from bec dandaine with a licensed guide. the bay is full of quicksand and you do not go alone. you arrive at the abbey gates the way pilgrims have for 13 centuries.\n\n"
            "save this for the france trip everyone plans around paris only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#MontSaintMichel #NormandyFrance #FranceTravel #TidalIsland #gekneequest\n\n"
            "🎵 PAIR WITH: gregorian chant + sparse organ. Builds through hook + body, bell-toll on the reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (peninsula vs tidal island) + 14m-tide-swing body + barefoot pilgrim crossing ritual. No badge tier yet.",
    },
    "uyuni-mirror-desert": {
        "search_queries": [
            "salar de uyuni",
            "uyuni mirror",
            "salt flats bolivia",
            "altiplano bolivia",
            "bolivia andean culture",
            "atacama salt landscape",
        ],
        "pexels_ids": [37899440, 37899948, 11884427, 13408287, 19896916, 28164939],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "the biggest mirror\non earth is a desert.\nyou can drive across it.",
        "body": "bolivia · salar de uyuni\n10,582 sq km salt crust\nseasonal water · sky reflects",
        "cta_text": "do this · february at sunset\nrain layer holds the sky",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "diamond" / "salar_de_uyuni_diamond.jpg",
            "monument": "Salar de Uyuni",
            "tier": "Diamond",
            "subtitle": "Southwest Bolivia  ·  February sunset for the perfect mirror",
            "secs": 4.5,
        },
        "caption": (
            "the biggest mirror on earth is a desert. you can drive across it.\n\n"
            "salar de uyuni. southwest bolivia. 10,582 square kilometers of salt crust — the largest salt flat in the world — sitting at 3,656 meters above sea level on the altiplano. the flat is the remnant of lake minchin, which evaporated around 30,000 years ago and left a 10-meter-thick layer of salt behind. during the dry season (april through november) it is a hard white crust you can drive a 4x4 across in any direction without a road. during the wet season (december through march) a few centimeters of rainwater settle on the surface, and the entire 10,000-square-kilometer expanse turns into the largest natural mirror on earth — clear enough that astronauts use it to calibrate satellites. the horizon disappears. the sky doubles. you stop being sure which way is up.\n\n"
            "do this: go in february at sunset. the rain layer is still thin enough to walk in, and the sun setting over the flat is reflected directly back at the sun setting over the flat.\n\n"
            "save this for the south america trip everyone plans around peru only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#SalarDeUyuni #BoliviaTravel #SaltFlats #SouthAmericaTravel #gekneequest\n\n"
            "🎵 PAIR WITH: ambient pad + andean charango. Builds through hook + body, vocal swell on the mirror reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (desert vs mirror) + 10,582-sqkm body + february-sunset ritual. No badge tier yet.",
    },
    "meteora-monks-in-nets": {
        "search_queries": [
            "meteora monastery",
            "meteora greece",
            "meteora cliff",
            "kalambaka greece",
            "thessaly greece",
            "greek orthodox monastery",
        ],
        "pexels_ids": [14132699, 38087087, 38087091, 38087079, 38087084, 35061994],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "they hauled monks up\nin nets. for 600 years.\nif rope broke · gods will.",
        "body": "greece · meteora\nbuilt 14th century · 400m\n6 monasteries left of 24",
        "cta_text": "do this · sunset hike st nikolas\nrope-lift museum at varlaam",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "silver" / "meteora_silver.jpg",
            "monument": "Meteora",
            "tier": "Silver",
            "subtitle": "Thessaly, Greece  ·  sunset hike Agios Nikolaos Anapavsas",
            "secs": 4.5,
        },
        "caption": (
            "they hauled monks up in nets. for 600 years. if the rope broke, it was gods will.\n\n"
            "meteora. thessaly, central greece. a cluster of 400-meter sandstone pillars rising vertically out of the plain near the town of kalambaka, formed 60 million years ago when a river delta solidified and the surrounding rock eroded away. greek orthodox monks, fleeing turkish raids in the 14th century, climbed the pillars and built monasteries on top of them, exactly because the only way up was straight vertical and only god (or a strong rope) could deliver you. at the height of the community there were 24 monasteries. six remain active today. for the first 600 years the only way to reach any of them was a hand-cranked windlass that hauled visitors up the cliff face in a knotted rope net. when asked how often the rope was replaced, the monks famously answered: \"when the lord lets it break.\" stairs were finally cut into the rock in the 1920s.\n\n"
            "do this: hike the trail to agios nikolaos anapavsas at sunset for the best light, then visit varlaam the next morning — its monastery museum displays the original windlass mechanism the monks used to haul up everything for centuries.\n\n"
            "save this for the greece trip everyone plans around the islands only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Meteora #GreeceTravel #OrthodoxMonastery #ThessalyGreece #gekneequest\n\n"
            "🎵 PAIR WITH: byzantine choral chant + sparse strings. Builds through hook + body, bell-strike on the cliff reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (visit monastery vs hauled in a net) + 600-year-windlass body + sunset hike ritual. No badge tier yet.",
    },
    "alhambra-17-symmetries": {
        "search_queries": [
            "alhambra granada",
            "alhambra palace spain",
            "alhambra moorish",
            "granada spain",
            "andalusia spain",
            "moorish architecture spain",
        ],
        "pexels_ids": [16847896, 32131681, 34106135, 34220857, 34270310, 34452563],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "no two rooms\nhave the same tile pattern.\n2,000 rooms.",
        "body": "spain · alhambra\nmoorish palace · 1238\n8,000 sqm of mathematics",
        "cta_text": "do this · nasrid palace 8am\ntimed entry only",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "alhambra_bronze.jpg",
            "monument": "Alhambra",
            "tier": "Bronze",
            "subtitle": "Granada, Spain  ·  Nasrid Palaces 8am timed-entry slot",
            "secs": 4.5,
        },
        "caption": (
            "no two rooms have the same tile pattern. 2,000 rooms.\n\n"
            "the alhambra. granada, spain. begun in 1238 as a small fortress by the first nasrid sultan, expanded over the next 250 years into a city-sized palace complex of nearly 2,000 rooms. the geometric tile work (zellige) covers nearly every wall and ceiling. mathematicians have proven that the alhambra contains examples of all 17 mathematically possible wallpaper symmetry groups — the only building in the world that does. the nasrid craftsmen worked out every possible way to tile a flat plane symmetrically, by hand, 500 years before mathematicians proved there were no others.\n\n"
            "do this: book the nasrid palaces timed-entry slot for 8am, the first slot of the day. you get the court of lions to yourself before the morning tour groups arrive.\n\n"
            "save this for the spain trip everyone plans around barcelona only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Alhambra #GranadaSpain #SpainTravel #AndalusianHeritage #gekneequest\n\n"
            "🎵 PAIR WITH: spanish flamenco guitar + oud. Sparse build through hook + body, lift on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (2,000 rooms, no two same) + 17-symmetry-group body + dawn timed-entry ritual. Bronze tier.",
    },
    "petronas-skybridge-sways": {
        "search_queries": [
            "petronas towers",
            "petronas kuala lumpur",
            "kuala lumpur skyline",
            "petronas night",
            "malaysia twin towers",
            "kuala lumpur city",
        ],
        "pexels_ids": [10741262, 10963091, 18316540, 19715183, 31255795, 20789721],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "the skybridge moves\n30 cm in wind.\nthe towers move more.",
        "body": "kuala lumpur · petronas\n452m twin towers · 1996\nbridge slides on bearings",
        "cta_text": "do this · skybridge 8 30am\n200 free tickets per day",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "silver" / "petronas_towers_silver.jpg",
            "monument": "Petronas Towers",
            "tier": "Silver",
            "subtitle": "Kuala Lumpur, Malaysia  ·  skybridge 8:30am, 200 free tickets per day",
            "secs": 4.5,
        },
        "caption": (
            "the skybridge moves 30 cm in the wind. the towers move more.\n\n"
            "petronas twin towers. kuala lumpur, malaysia. completed 1996, 452 meters tall, the tallest twin towers in the world. the double-deck skybridge connecting floors 41 and 42 is the architectural detail most people miss: it is not rigidly attached to either tower. it sits on sliding bearings on both ends, so when the towers sway independently in monsoon winds — up to 38 centimeters at the bridge level — the skybridge slides with them instead of being torn apart. you can stand on it during a storm and feel the floor flex beneath your feet.\n\n"
            "do this: line up at the visitor center at 8am for the free skybridge tickets. only 200 per day, gone by 9. you get the 8:30am or 9am slot.\n\n"
            "save this for the kuala lumpur trip you keep skipping for singapore.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#PetronasTowers #KualaLumpur #MalaysiaTravel #Skybridge #gekneequest\n\n"
            "🎵 PAIR WITH: ambient synth + traditional gamelan. Builds through hook + body, swell on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (rigid bridge vs sliding) + 38cm-sway body + free-ticket dawn ritual. Silver tier.",
    },
    "marina-bay-sands-pool-edge": {
        "search_queries": [
            "marina bay sands",
            "singapore skyline marina bay",
            "marina bay sands pool",
            "singapore city",
            "marina bay night",
            "singapore harbor",
        ],
        "pexels_ids": [32001885, 32035817, 32035829, 32250600, 34186550, 34495884],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "the pool ends\nat the edge of the building.\n191 meters up.",
        "body": "singapore · marina bay sands\n3 towers · skypark boat on top\nworlds largest infinity pool",
        "cta_text": "do this · book a room not deck\nguest-only at 6am sunrise",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "silver" / "marina_bay_sands_silver.jpg",
            "monument": "Marina Bay Sands",
            "tier": "Silver",
            "subtitle": "Singapore  ·  hotel-guest only, 6am sunrise on the SkyPark pool",
            "secs": 4.5,
        },
        "caption": (
            "the pool ends at the edge of the building. 191 meters up.\n\n"
            "marina bay sands. singapore. three 55-story towers connected at the top by a 1.2-hectare skypark shaped like a boat, designed by moshe safdie, opened 2010. on top of the boat-shaped skypark sits the worlds largest rooftop infinity pool — 150 meters long, ending in a vanishing edge that drops 191 meters straight to the bay. the observation deck a few floors below is open to the public; the infinity pool itself is hotel-guest only. that is the entire point of the building.\n\n"
            "do this: book a room — even the cheapest — and use the pool at 6am. you get the empty edge to yourself before the sun fully clears the harbor.\n\n"
            "save this for the singapore trip everyone reduces to gardens by the bay.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#MarinaBaySands #SingaporeTravel #InfinityPool #Skypark #gekneequest\n\n"
            "🎵 PAIR WITH: chillout ambient electronic. Builds through hook + body, drop on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (deck vs pool) + 191m drop body + guest-only sunrise ritual. Silver tier.",
    },
    "pamukkale-1mm-year": {
        "search_queries": [
            "pamukkale turkey",
            "pamukkale terraces",
            "pamukkale travertine",
            "pamukkale thermal",
            "denizli turkey",
            "hierapolis turkey",
        ],
        "pexels_ids": [29153307, 29153315, 30404182, 34940178, 34940212, 6047892],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "the white terraces\ngrew 1mm per year.\nfor 14,000 years.",
        "body": "turkey · pamukkale\ncalcium-carbonate terraces\nthermal springs 35 degrees",
        "cta_text": "do this · barefoot at dawn\nshoes prohibited on travertine",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "diamond" / "pamukkale_diamond.jpg",
            "monument": "Pamukkale",
            "tier": "Diamond",
            "subtitle": "Denizli Province, Turkey  ·  barefoot dawn on the travertine terraces",
            "secs": 4.5,
        },
        "caption": (
            "the white terraces grew 1mm per year. for 14,000 years.\n\n"
            "pamukkale. denizli province, turkey. the name means cotton castle in turkish. for at least 14,000 years, thermal springs at the top of the hillside have been depositing dissolved calcium carbonate as the water cools and runs down the slope, building up the layer of brilliant white travertine you see today — a sloping hillside of cascading semi-circular pool terraces that look like frozen waterfalls. the romans built the city of hierapolis on top of the springs around 200 BC because they believed the water had healing properties. to protect the surface from staining and erosion, all visitors today must remove shoes before walking on the travertine.\n\n"
            "do this: arrive at dawn. walk barefoot up the terraces while the water reflects the pink morning sky and you have the white slope to yourself before the tour buses from kusadasi arrive at 10.\n\n"
            "save this for the turkey trip you keep planning around istanbul only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Pamukkale #TurkeyTravel #Travertine #Hierapolis #gekneequest\n\n"
            "🎵 PAIR WITH: turkish ney flute + water sounds. Sparse build through hook + body, lift on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (instant vs 14,000 years) + 1mm-per-year body + barefoot dawn ritual. Diamond tier.",
    },
    "tikal-jungle-ate-it": {
        "search_queries": [
            "tikal guatemala",
            "tikal pyramid",
            "tikal mayan ruins",
            "tikal temple",
            "mayan jungle ruins",
            "guatemala jungle",
        ],
        "pexels_ids": [28892245, 30514510, 30514512, 31579293, 32082759, 35278660],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "they built it.\nthey left.\njungle ate it 900 years.",
        "body": "guatemala · tikal\nmaya capital 200-900 AD\nrediscovered 1848",
        "cta_text": "do this · temple iv at 4am\nhowler monkeys sound jaguar",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "tikal_bronze.jpg",
            "monument": "Tikal",
            "tier": "Bronze",
            "subtitle": "Petén, Guatemala  ·  Temple IV summit at 4am for howler-monkey dawn",
            "secs": 4.5,
        },
        "caption": (
            "they built it. they left. the jungle ate it for 900 years.\n\n"
            "tikal. peten, guatemala. capital of the classic maya civilization from roughly 200 to 900 AD. at its peak the city held over 100,000 people, with stepped limestone pyramids rising 65 meters above the rainforest canopy. then the maya collapsed — climate change, overpopulation, internal warfare — and tikal was abandoned around 900 AD. the peten jungle swallowed it. for nearly a thousand years it sat under vines and root systems, completely covered, with the local population aware of its existence but no outside contact, until a guatemalan government expedition in 1848 began the modern excavation.\n\n"
            "do this: hire a pre-dawn guide and hike to temple iv (the tallest pyramid) for 4am. you arrive in the dark, climb to the summit above the canopy, and watch the sun rise while the howler monkeys begin their dawn calls. they sound exactly like jaguars.\n\n"
            "save this for the guatemala trip everyone routes through belize instead.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#Tikal #GuatemalaTravel #MayanRuins #TempleIV #gekneequest\n\n"
            "🎵 PAIR WITH: mayan flute + jungle ambient. Builds through hook + body, howler-monkey call on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (built vs abandoned 900yr) + jungle-ate-it body + pre-dawn howler ritual. Bronze tier.",
    },
    "st-basils-blinded-architect": {
        "search_queries": [
            "st basils moscow",
            "saint basils cathedral",
            "red square moscow",
            "moscow kremlin",
            "moscow cathedral",
            "russia moscow",
        ],
        "pexels_ids": [10967338, 32464049, 37789252, 20394339, 10529145, 10942670],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "ivan blinded\nthe architect.\nso he could never\nrepeat it.",
        "body": "moscow · st basils\nbuilt 1555 by ivan IV\n9 chapels · 9 unique domes",
        "cta_text": "do this · red square at sunset\ndomes catch the last light",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "gold" / "st_basils_cathedral_gold.jpg",
            "monument": "St. Basil's Cathedral",
            "tier": "Gold",
            "subtitle": "Moscow, Russia  ·  Red Square at sunset, the domes hold the last light",
            "secs": 4.5,
        },
        "caption": (
            "ivan blinded the architect. so he could never repeat it.\n\n"
            "saint basils cathedral. red square, moscow. built 1555 to 1561 by tsar ivan IV the terrible, to commemorate his capture of the kazan khanate. the cathedral is technically nine separate chapels arranged around a central tenth chapel, each one capped with its own ornate onion dome painted in a unique pattern of colors — no two the same. the legend, almost certainly apocryphal but persistent for 460 years, is that ivan had the architect postnik yakovlev blinded after completion so he could never design anything as beautiful for anyone else. the cathedral was officially renamed the cathedral of the intercession on the moat, but moscow never stopped calling it saint basils.\n\n"
            "do this: stand on red square at sunset on a clear day. the colored domes catch the last warm light and the patterns glow.\n\n"
            "save this for the russia trip you keep deferring.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#StBasils #MoscowTravel #RedSquare #RussiaTravel #gekneequest\n\n"
            "🎵 PAIR WITH: russian orthodox choral chant + balalaika. Builds through hook + body, bell-toll on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (architect celebrated vs blinded) + 9-chapel body + sunset on red square ritual. Gold tier.",
    },
    "st-peters-michelangelo-died": {
        "search_queries": [
            "saint peters basilica",
            "vatican basilica",
            "vatican rome",
            "st peters square",
            "vatican city",
            "rome basilica",
        ],
        "pexels_ids": [32175559, 32175563, 33070277, 12128746, 36490318, 34686551],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "michelangelo died.\nthe dome wasnt done.\n26 years later it was.",
        "body": "vatican · st peters\nbuilt 1506-1626\nmichelangelo dome 1547",
        "cta_text": "do this · climb the cupola\n551 steps to rome below",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "gold" / "st_peters_basilica_gold.jpg",
            "monument": "St. Peter's Basilica",
            "tier": "Gold",
            "subtitle": "Vatican City  ·  climb the cupola, 551 steps above Rome",
            "secs": 4.5,
        },
        "caption": (
            "michelangelo died. the dome wasnt done. 26 years later it was.\n\n"
            "saint peters basilica. vatican city. the largest church in the world, built over 120 years between 1506 and 1626 on the site believed to be the burial place of saint peter. michelangelo was appointed chief architect in 1547 at the age of 71. he inherited a half-finished project from antonio da sangallo and redesigned it almost entirely, including the massive central dome. he died in 1564 with construction only at the drum level — the dome itself had not yet been raised. giacomo della porta and domenico fontana completed the dome between 1588 and 1590, 26 years after michelangelos death, finally raising the 136-meter cupola he had designed but never seen finished.\n\n"
            "do this: buy the basilica-plus-cupola combo ticket and climb the 551 steps inside the dome to the top. the staircase tilts as it spirals — you are following the curve of the dome on the inside.\n\n"
            "save this for the rome trip everyone plans around the colosseum only.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#StPetersBasilica #VaticanCity #RomeTravel #Michelangelo #gekneequest\n\n"
            "🎵 PAIR WITH: sacred classical organ + choir. Builds through hook + body, bell-toll on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (designed vs unfinished at death) + 26-year-completion body + 551-step cupola ritual. Gold tier.",
    },
    "erg-chebbi-singing-dunes": {
        "search_queries": [
            "erg chebbi morocco",
            "sahara dunes morocco",
            "merzouga morocco",
            "morocco desert",
            "sahara camel sunset",
            "morocco dunes",
        ],
        "pexels_ids": [12902301, 34535416, 34076898, 34392959, 36204321, 30783917],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "the dunes sing.\nwhen wind hits right.\nlow B flat.",
        "body": "morocco · erg chebbi\nsahara dunes 150m\nwind 40,000 years",
        "cta_text": "do this · camel trek sunset\nberber camp at the base",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "erg_chebbi_bronze.jpg",
            "monument": "Erg Chebbi",
            "tier": "Bronze",
            "subtitle": "Merzouga, Morocco  ·  sunset camel trek into a Berber camp at the dunes",
            "secs": 4.5,
        },
        "caption": (
            "the dunes sing. when the wind hits them right. low B-flat.\n\n"
            "erg chebbi. merzouga, southeastern morocco. a 22-kilometer-long ridge of orange sand dunes on the edge of the sahara, formed by 40,000 years of wind carrying mineral grains from the atlas mountains and depositing them here. the highest dunes reach 150 meters. when the wind drives sand grains avalanching down certain dunes, friction between the grains creates a low-frequency hum — researchers measured it at around 100 hertz, roughly the musical note B-flat. scientists only worked out the mechanism in the early 2000s, but bedouin traders crossing this stretch have known the dunes sing for centuries.\n\n"
            "do this: book a 1-hour sunset camel trek from merzouga. you arrive at a berber tent camp at the base of the dunes in time for tea and a stargazing dinner under unfiltered sky.\n\n"
            "save this for the morocco trip everyone confines to marrakech.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#ErgChebbi #MoroccoTravel #SaharaDesert #Merzouga #gekneequest\n\n"
            "🎵 PAIR WITH: oud + bedouin chant + wind. Builds through hook + body, drum-hit on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (silent desert vs singing dunes) + 40,000-year wind body + sunset-camel ritual. Bronze tier.",
    },
    "antelope-canyon-light-beams": {
        "search_queries": [
            "antelope canyon arizona",
            "antelope canyon slot",
            "navajo slot canyon",
            "arizona slot canyon",
            "page arizona canyon",
            "antelope canyon light",
        ],
        "pexels_ids": [17292559, 28344358, 37497803, 7624035, 34328266, 11800887],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "the light beams\nonly enter\n6 weeks a year.\nby noon.",
        "body": "arizona · antelope canyon\nnavajo nation slot canyon\ncarved by flash floods",
        "cta_text": "do this · upper canyon 11-1\nnavajo-guided tour only",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "silver" / "antelope_canyon_silver.jpg",
            "monument": "Antelope Canyon",
            "tier": "Silver",
            "subtitle": "Navajo Nation, Arizona  ·  Upper Canyon 11am-1pm for the light beams",
            "secs": 4.5,
        },
        "caption": (
            "the light beams only enter 6 weeks a year. by noon.\n\n"
            "antelope canyon. navajo nation, near page, arizona. a slot canyon cut through navajo sandstone by tens of thousands of years of flash floods funneling rainwater down a narrow drainage. the walls are 40 meters tall in places and only a meter wide at the bottom, with the rock carved into smooth flowing s-curves by the floodwater. the iconic shafts of light that drop straight down through the slit openings at the top of the canyon and illuminate the floor only happen when the sun is high enough — roughly march through october, and only between approximately 11am and 1pm. outside that window the canyon is in deep shadow. the entire site is on navajo land; you cannot enter without a navajo-guided tour.\n\n"
            "do this: book the upper canyon midday tour — 11am, noon, or 1pm slot. that is the only window the light beams appear. lower canyon is also worth it but the beams concentrate in the upper.\n\n"
            "save this for the southwest trip you keep doing as a las vegas day trip.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#AntelopeCanyon #ArizonaTravel #NavajoNation #SlotCanyon #gekneequest\n\n"
            "🎵 PAIR WITH: native american flute + drone. Sparse build through hook + body, light-strike on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (light always vs 6-week window) + navajo-guided body + midday slot ritual. Silver tier.",
    },
    "cliffs-of-moher-200m": {
        "search_queries": [
            "cliffs of moher",
            "cliffs of moher ireland",
            "moher cliffs atlantic",
            "ireland coast cliffs",
            "county clare ireland",
            "doolin ireland cliffs",
        ],
        "pexels_ids": [15789465, 15789466, 30326499, 31083974, 15789468, 10344364],
        "n_clips": 6,
        "clip_secs": 1.8,
        "hook": "8 km of cliffs.\n200 m straight down.\nan ocean alone.",
        "body": "ireland · cliffs of moher\nco clare · atlantic coast\nformed 320 million years",
        "cta_text": "do this · doolin to liscannor\n14km coastal trail walk",
        "hook_end_secs": 3.0,
        "body_end_secs": 6.0,
        "image_refs": [],
        "reveal": {
            "badge": BADGES / "bronze" / "cliffs_of_moher_bronze.jpg",
            "monument": "Cliffs of Moher",
            "tier": "Bronze",
            "subtitle": "County Clare, Ireland  ·  Doolin-to-Liscannor 14km coastal trail",
            "secs": 4.5,
        },
        "caption": (
            "8 kilometers of cliffs. 200 meters straight down. an ocean to yourself.\n\n"
            "the cliffs of moher. county clare, west coast of ireland. eight kilometers of vertical sea cliffs facing the atlantic, formed from horizontally layered sedimentary rocks deposited around 320 million years ago. the highest point, near obriens tower, drops 214 meters straight into the ocean. the cliffs are the most visited natural attraction in ireland and the visitor center concentration point can feel crowded, but the 14-kilometer coastal walking trail running from doolin in the north to liscannor in the south gives you the cliff edges to yourself for nearly the entire length. you walk past puffin colonies in spring and atlantic storms in winter that throw spray 200 meters up to where you are standing.\n\n"
            "do this: do the full doolin-to-liscannor trail in one direction with a taxi pickup at the other end. start in doolin to keep the wind at your back most of the day.\n\n"
            "save this for the ireland trip everyone reduces to dublin pubs.\n\n"
            "geknee.com\napply for iOS early access → geknee.com/waitlist\n\n"
            "#CliffsOfMoher #IrelandTravel #CountyClare #WildAtlanticWay #gekneequest\n\n"
            "🎵 PAIR WITH: celtic harp + uilleann pipes. Sparse build through hook + body, swell on reveal."
        ),
        "based_on": "Taj-template: rule-then-exception (crowded visitor center vs empty 14km trail) + 320-million-year body + Doolin-Liscannor ritual. Bronze tier.",
    },
}

W, H = 1080, 1920

# Hook overlay font. Impact: condensed, heavy, designed for headlines, AND
# readable by both ffmpeg-drawtext and PIL (so we can measure-fit per hook
# instead of guessing char-width ratios). Switched from SF Pro Display Heavy
# 2026-06-08 — SFP-Display can't be read by PIL (TTC + restricted), causing
# overflow because we had to estimate text width.
HOOK_FONT_PATH = "/System/Library/Fonts/Supplemental/Impact.ttf"


def _best_font_size(lines: list[str], max_w: int, lo: int = 56, hi: int = 160) -> int:
    """Largest even font size where every line fits within max_w pixels.
    Uses PIL with the same TTF that ffmpeg will render, so the fit is exact."""
    from PIL import ImageFont
    for s in range(hi, lo - 1, -2):
        try:
            f = ImageFont.truetype(HOOK_FONT_PATH, s)
            if all((f.getbbox(ln)[2] - f.getbbox(ln)[0]) <= max_w for ln in lines):
                return s
        except OSError:
            continue
    return lo


def _soft_wrap_hook(text: str, max_w: int, height_budget: int,
                    lo: int = 36, hi: int = 72,
                    line_ratio: float = 1.18) -> tuple[int, list[str]]:
    """Greedy word-wrap that picks the largest font size where:
      (a) every wrapped line fits horizontally inside max_w pixels, and
      (b) total height (n_lines * line_h) stays within height_budget.

    Manual \\n breaks ARE respected — each line in the source string wraps
    independently, so the body authoring contract holds (line 2 = quest
    line stays on its own visual row). This was changed from "strip all
    \\n" 2026-06-21 because the geknee-quest prefix was getting collapsed
    onto line 1 with the monument name and clipping off the canvas."""
    from PIL import ImageFont
    raw_lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    if not raw_lines:
        return lo, []

    def wrap_at(font) -> list[str] | None:
        meas = lambda t: font.getbbox(t)[2] - font.getbbox(t)[0]
        out: list[str] = []
        for ln in raw_lines:
            words = ln.split()
            if not words:
                continue
            cur = words[0]
            if meas(cur) > max_w:
                return None
            for word in words[1:]:
                trial = cur + " " + word
                if meas(trial) <= max_w:
                    cur = trial
                else:
                    if meas(word) > max_w:
                        return None
                    out.append(cur)
                    cur = word
            out.append(cur)
        return out

    for s in range(hi, lo - 1, -2):
        try:
            f = ImageFont.truetype(HOOK_FONT_PATH, s)
        except OSError:
            continue
        lines = wrap_at(f)
        if lines is None:
            continue
        line_h = int(s * line_ratio)
        if len(lines) * line_h <= height_budget:
            return s, lines

    # Fallback: render at lo regardless of overflow (better than crashing).
    f = ImageFont.truetype(HOOK_FONT_PATH, lo)
    return lo, (wrap_at(f) or [text])


# Resolve ffmpeg binary. Priority:
#   1. FFMPEG_BIN env var (if set and non-empty)
#   2. bin/ffmpeg-static-arm64 in the repo (drawtext-enabled fallback when
#      Homebrew's ffmpeg 8.x is missing libfreetype)
#   3. system ffmpeg on PATH
_REPO_STATIC = Path(__file__).parent / "ffmpeg-static-arm64"
FFMPEG_BIN = (
    os.environ.get("FFMPEG_BIN")
    or (str(_REPO_STATIC) if _REPO_STATIC.exists() else "ffmpeg")
)


def ff(args: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run([FFMPEG_BIN, "-y", *args], capture_output=True, text=True, **kw)


def normalize_clip(src: Path, dst: Path, secs: float):
    """Trim + scale + crop to 1080x1920 vertical, 30fps, silent audio."""
    vf = (
        f"trim=duration={secs},setpts=PTS-STARTPTS,"
        f"scale={W}:{H}:force_original_aspect_ratio=increase,"
        f"crop={W}:{H},fps=30"
    )
    r = ff([
        "-i", str(src),
        "-vf", vf,
        "-an",  # drop audio
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "22",
        "-t", f"{secs}",
        str(dst),
    ])
    if r.returncode != 0:
        raise RuntimeError(f"normalize failed: {r.stderr[-500:]}")


def concat(parts: list[Path], dst: Path):
    listf = dst.parent / "_concat.txt"
    listf.write_text("\n".join(f"file '{p.absolute()}'" for p in parts))
    r = ff([
        "-f", "concat", "-safe", "0", "-i", str(listf),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "22",
        str(dst),
    ])
    if r.returncode != 0:
        raise RuntimeError(f"concat failed: {r.stderr[-500:]}")


def apply_overlays(src: Path, dst: Path, hook: str,
                   body: str | None = None, cta_text: str | None = None,
                   hook_end: float = 3.0, body_end: float = 10.0):
    """Burn 3-act text overlays + @geknee.travel watermark.

    Three-act structure (industry-standard IG Reels storytelling):
      0   → hook_end : HOOK — pattern interrupt, grabs attention in first 3s
      hook_end → body_end : BODY — pays off the hook with specifics / proof
      body_end → end : CTA — tells the viewer what to do ("save this", URL)

    When body / cta_text are None, the hook stays on screen for the full
    duration (legacy single-act mode). The lavender end-card image_ref still
    plays as the visual CTA finale regardless.

    Each act is independently soft-wrapped + sized so short copy renders big.
    """
    def esc(t: str) -> str:
        return (t.replace("\\", "\\\\\\\\")
                 .replace(":", "\\\\:")
                 .replace("'", "\\\\\\'")
                 .replace(",", "\\\\,"))

    MAX_W = W - 80              # 1000px safe text area
    HEIGHT_BUDGET = 360         # ~18.75% of 1920 — total stack ceiling
    MAX_FONT, MIN_FONT = 72, 36
    line_ratio = 1.18
    SAFE_TOP = 320              # inside 4:5 IG-POST crop safe zone

    def _wrap(text: str) -> tuple[int, list[str]]:
        return _soft_wrap_hook(text, max_w=MAX_W, height_budget=HEIGHT_BUDGET,
                               lo=MIN_FONT, hi=MAX_FONT, line_ratio=line_ratio)

    def _drawtexts_for(text: str, time_filter: str | None) -> list[str]:
        """Render a 3-act overlay block. time_filter is ffmpeg enable=
        expression (e.g. lt(t\\,3), between(t\\,3\\,10)). When None, no time
        gating (legacy mode). Each line is its own drawtext so wrapping
        works."""
        fs, lines = _wrap(text)
        lh = int(fs * line_ratio)
        out = []
        # ffmpeg enable= uses commas as filter separators internally, so we
        # escape them inside the expression.
        enable_clause = f":enable='{time_filter}'" if time_filter else ""
        for i, ln in enumerate(lines):
            out.append(
                f"drawtext=fontfile={HOOK_FONT_PATH}"
                f":text='{esc(ln)}':fontsize={fs}:fontcolor=white"
                ":borderw=6:bordercolor=black@0.75"
                f":x=(w-text_w)/2:y={SAFE_TOP + i*lh}"
                f"{enable_clause}"
            )
        return out

    drawtexts: list[str] = []
    has_acts = bool(body) or bool(cta_text)
    if not has_acts:
        # Legacy single-act mode: hook visible the whole video.
        drawtexts.extend(_drawtexts_for(hook, None))
    else:
        # Three-act mode. Each phase is time-gated via ffmpeg enable= expr.
        # Commas inside the expression must be escaped (\,) because the outer
        # filter graph already uses commas as filter separators.
        drawtexts.extend(_drawtexts_for(hook, f"lt(t\\,{hook_end})"))
        if body:
            drawtexts.extend(_drawtexts_for(body, f"between(t\\,{hook_end}\\,{body_end})"))
        if cta_text:
            drawtexts.extend(_drawtexts_for(cta_text, f"gte(t\\,{body_end})"))

    # Watermark always on (sits in 4:5 safe zone, doesn't compete with hook).
    drawtexts.append(
        "drawtext=fontfile=/System/Library/Fonts/Supplemental/SF-Pro-Display-Semibold.otf"
        ":text='@geknee.travel':fontsize=38:fontcolor=white@0.85:borderw=2:bordercolor=black@0.5"
        ":x=w-text_w-44:y=h-text_h-360"
    )
    vf = ",".join(drawtexts)
    r = ff([
        "-i", str(src),
        "-vf", vf,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "20",
        "-an",
        str(dst),
    ])
    if r.returncode != 0:
        raise RuntimeError(f"overlays failed: {r.stderr[-500:]}")


# ─── Image-ref handling (Reddit / influencer-thumb / arbitrary path) ─
REDDIT_INDEX = Path.home() / "geknee" / "ad-assets" / "reddit-travel" / "index.jsonl"
PINTEREST_INDEX = Path.home() / "geknee" / "ad-assets" / "pinterest" / "index.jsonl"
INFLUENCER_THUMB_DIRS = [
    Path.home() / "geknee" / "hq-creative-loop" / "reference" / "scraped-reels-2026-06-05",
]


def resolve_image_ref(ref: dict) -> tuple[Path | None, str]:
    """Map an image_ref dict to a local image path + one-line source credit."""
    src = ref.get("source")
    if src == "reddit":
        rid = ref.get("id")
        if not REDDIT_INDEX.exists() or not rid:
            return None, f"reddit:{rid} (index missing — run bin/fetch-reddit-travel.py)"
        for line in REDDIT_INDEX.read_text().splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("id") == rid and rec.get("local_path"):
                p = Path(rec["local_path"])
                credit = f"reddit.com{rec.get('permalink','')} (u/{rec.get('author','?')}, score {rec.get('score','?')})"
                return (p if p.exists() else None), credit
        return None, f"reddit:{rid} (not in index)"
    if src == "pinterest":
        pid = ref.get("id")
        if not PINTEREST_INDEX.exists() or not pid:
            return None, f"pinterest:{pid} (index missing — run bin/fetch-pinterest-board.py)"
        for line in PINTEREST_INDEX.read_text().splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("id") == pid and rec.get("path"):
                # path is stored relative to ~/geknee
                p = Path.home() / "geknee" / rec["path"]
                board = rec.get("board_name", "?")
                kind = rec.get("kind", "image")
                # Video pins are downloaded as .mp4 — still_to_clip only
                # handles stills, so video-kind pins fall back to None
                # (consumer should use pexels-style video clips for those).
                if kind == "video":
                    return None, f"pinterest:{pid} (video pin — use video clip path instead, board: {board})"
                credit = f"pinterest.com/pin/{pid}/ (board: {board})"
                return (p if p.exists() else None), credit
        return None, f"pinterest:{pid} (not in index)"
    if src == "influencer-thumb":
        code = ref.get("code")
        if not code:
            return None, "influencer-thumb:? (no code)"
        for d in INFLUENCER_THUMB_DIRS:
            for ext in (".jpg", ".jpeg", ".png", ".webp"):
                p = d / f"{code}{ext}"
                if p.exists():
                    return p, f"instagram.com/p/{code}/ (scraped thumb, ref only)"
        return None, f"influencer-thumb:{code} (file missing in {INFLUENCER_THUMB_DIRS[0].name})"
    if src == "path":
        p = Path(ref.get("path", "")).expanduser()
        return (p if p.exists() else None), f"local:{p}"
    return None, f"unknown source: {src}"


def still_to_clip(img: Path, dst: Path, secs: float, motion: str = "zoom-in"):
    """Ken-Burns a still into a 1080x1920 30fps silent clip."""
    d_frames = max(int(secs * 30), 30)
    base = f"scale=1620:2880:force_original_aspect_ratio=increase,crop=1620:2880,setsar=1"
    if motion == "zoom-out":
        zp = (f"zoompan=z='if(lte(zoom\\,1.0)\\,1.18\\,max(zoom-0.0008\\,1.0))'"
              f":d={d_frames}:s={W}x{H}:fps=30")
    elif motion == "pan-right":
        zp = (f"zoompan=z=1.15:x='(iw-iw/zoom)*on/{d_frames}'"
              f":y='ih/2-(ih/zoom/2)':d={d_frames}:s={W}x{H}:fps=30")
    elif motion == "pan-left":
        zp = (f"zoompan=z=1.15:x='(iw-iw/zoom)*(1-on/{d_frames})'"
              f":y='ih/2-(ih/zoom/2)':d={d_frames}:s={W}x{H}:fps=30")
    else:  # zoom-in default
        zp = f"zoompan=z='min(zoom+0.0008\\,1.18)':d={d_frames}:s={W}x{H}:fps=30"
    r = ff([
        "-loop", "1", "-i", str(img),
        "-vf", f"{base},{zp}",
        "-t", f"{secs}",
        "-an",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "22",
        str(dst),
    ])
    if r.returncode != 0:
        raise RuntimeError(f"still_to_clip failed for {img.name}: {r.stderr[-500:]}")


def _scan_used_pexels_ids() -> set[str]:
    """Scan every sibling reel's sources.txt for Pexels video IDs so a new
    build can exclude clips that have already shipped. Looks across:
      - OUT_ROOT.parent (e.g. .../instagram/remix/<date>/<concept>/) — live reels
      - .../instagram/remix-archive/<date>/<concept>/ — archived reels
    Archived reels still count as "used" so we don't re-pull the same Pexels
    clip after clearing the viewer. Cheap O(n) glob — no caching needed."""
    import re
    used: set[str] = set()
    roots = [OUT_ROOT.parent, OUT_ROOT.parent.parent / "remix-archive"]
    pat = re.compile(r"pexels\.com/video/(\d+)/")
    for root in roots:
        if not root.exists():
            continue
        for src in root.glob("*/*/sources.txt"):
            try:
                for m in pat.finditer(src.read_text()):
                    used.add(m.group(1))
            except OSError:
                continue
    return used


def build(concept_id: str):
    cfg = CONCEPTS[concept_id]
    out_dir = OUT_ROOT / concept_id
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = TMP_ROOT / concept_id
    tmp.mkdir(parents=True, exist_ok=True)
    print(f"== {concept_id} ==")

    # Pull clips. Exclude any Pexels video ID already used in a prior reel
    # (scanned out of every */sources.txt under OUT_ROOT.parent) so no clip
    # repeats across reels.
    used_ids = _scan_used_pexels_ids()
    print(f"  excluding {len(used_ids)} Pexels IDs used in prior reels")
    seen_ids = set()
    pulled: list[tuple[Path, dict]] = []
    # Curated `pexels_ids`: explicit clip IDs hand-verified to show the
    # target monument. Pulled first; remaining slots filled by
    # `search_queries` fallback below. Order preserved in the final reel.
    from pexels_fetch import get_video
    for vid in cfg.get("pexels_ids", []):
        if len(pulled) >= cfg["n_clips"]: break
        if str(vid) in used_ids:
            print(f"  curated {vid} already used, skipping")
            continue
        try:
            h = get_video(vid)
            seen_ids.add(h["id"])
            p = download(h, tmp, prefix="src_")
            print(f"  curated + {h['id']}  dur={h.get('duration','?')}s")
            pulled.append((p, h))
        except Exception as e:
            print(f"  ! curated {vid} fetch failed: {e}")
    for q in cfg["search_queries"]:
        if len(pulled) >= cfg["n_clips"]: break
        print(f"  searching: '{q}'")
        hits = search_videos(q, per_page=20, orient="portrait")
        for h in hits:
            if len(pulled) >= cfg["n_clips"]: break
            if h["id"] in seen_ids: continue
            if str(h["id"]) in used_ids:
                continue
            seen_ids.add(h["id"])
            try:
                p = download(h, tmp, prefix="src_")
                print(f"    + {h['id']}  dur={h.get('duration','?')}s")
                pulled.append((p, h))
            except Exception as e:
                print(f"    ! download {h['id']} failed: {e}")
    if not pulled:
        raise RuntimeError("no clips pulled — Pexels returned nothing usable")

    # Normalize each video clip
    normed: list[Path] = []
    for i, (p, h) in enumerate(pulled):
        out_p = tmp / f"norm_{i:02d}.mp4"
        normalize_clip(p, out_p, cfg["clip_secs"])
        normed.append(out_p)

    # Ken-Burns image_refs (Reddit + influencer-thumb + arbitrary path)
    still_credits: list[str] = []
    for j, ref in enumerate(cfg.get("image_refs", [])):
        img_path, credit = resolve_image_ref(ref)
        if not img_path:
            print(f"  ! skipping image_ref {j}: {credit}")
            still_credits.append(f"- SKIPPED: {credit}")
            continue
        secs = ref.get("secs", cfg["clip_secs"])
        motion = ref.get("motion", "zoom-in")
        out_p = tmp / f"still_{j:02d}.mp4"
        print(f"    + still: {img_path.name} ({motion}, {secs}s)")
        still_to_clip(img_path, out_p, secs, motion)
        normed.append(out_p)
        still_credits.append(f"- {credit} ({motion}, {secs}s)")

    # Concat + overlays. Story segment = pexels clips + image_refs with the
    # 3-act drawtext stack burned in. Then if a `reveal` block is set, render
    # the BADGE UNLOCKED card as its own clean clip (no drawtext overlay) and
    # append AFTER the overlay-baked story segment — matches the quest-reel
    # archived format where the reveal frame breathes without the hook bar.
    cat = tmp / "concat.mp4"
    concat(normed, cat)
    story = out_dir / "_story.mp4" if cfg.get("reveal") else (out_dir / "video.mp4")
    apply_overlays(
        cat, story,
        hook=cfg["hook"],
        body=cfg.get("body"),
        cta_text=cfg.get("cta_text"),
        hook_end=cfg.get("hook_end_secs", 3.0),
        body_end=cfg.get("body_end_secs", 10.0),
    )

    final = out_dir / "video.mp4"
    if cfg.get("reveal"):
        r = cfg["reveal"]
        reveal_png = tmp / "reveal.png"
        make_reveal_card(Path(r["badge"]), r["monument"], r["tier"], r["subtitle"], reveal_png)
        reveal_mp4 = tmp / "reveal.mp4"
        still_to_clip(reveal_png, reveal_mp4, r.get("secs", 4.5), motion="zoom-in")
        concat([story, reveal_mp4], final)
        story.unlink(missing_ok=True)
        print(f"  + reveal: {r['monument']} {r['tier'].lower()}")
    print(f"  -> {final}")

    # Write caption + sources
    (out_dir / "caption.txt").write_text(cfg["caption"])
    sources_lines = [
        f"# Stock-footage remix — {concept_id}",
        f"",
        f"## Based on (formula reference, NOT used)",
        f"- {cfg['based_on']}",
        f"",
        f"## Pexels clips used (all royalty-free, no attribution required)",
    ]
    for p, h in pulled:
        sources_lines.append(
            f"- pexels.com/video/{h['id']}/ — {h.get('user',{}).get('name','?')} ({h.get('duration','?')}s)"
        )
    if still_credits:
        sources_lines += [
            "",
            "## Reference stills (Ken-Burns animated)",
            *still_credits,
        ]
    sources_lines += [
        f"",
        f"## License",
        "Pexels License: free to use, no attribution required, no permission needed.",
        "Reddit images: posted under user license; r/<sub> rules vary — verify before",
        "  commercial use. For organic IG remixing of high-engagement Reddit posts,",
        "  credit the OP in the IG caption when reposting recognizable user-shot images.",
        "Influencer thumbs: reference-only inputs (Ken-Burns reframing of a public IG",
        "  thumbnail). Do NOT use as direct B-roll; treat as moodboard anchor only.",
        "Music: NOT included — add a trending IG audio at upload time.",
    ]
    (out_dir / "sources.txt").write_text("\n".join(sources_lines))
    return final


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in CONCEPTS:
        print(f"usage: python3 bin/build-remix-reel.py <concept_id>")
        print(f"concepts: {', '.join(CONCEPTS.keys())}")
        sys.exit(2)
    build(sys.argv[1])
