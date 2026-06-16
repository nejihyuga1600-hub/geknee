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

OUT_ROOT = Path.home() / "geknee" / "ad-assets" / "instagram" / "remix" / date.today().isoformat()
TMP_ROOT = OUT_ROOT / "_tmp"

# ─── Concepts: each = one finished reel ────────────────────────────────
# `queries` is searched in order; clips deduped across queries.
# `hook` shows top-center, watermark always bottom-right.
# `caption` is the IG-post body.
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

    Manual \\n breaks in the hook are stripped — the renderer rewraps based
    on what actually fits at the chosen font. This lets us write hooks as
    natural sentences and trust the wrap, rather than hand-chunking 2 words
    per line."""
    from PIL import ImageFont
    words = " ".join(text.split()).split()  # strip any \n + collapse whitespace
    if not words:
        return lo, []

    def wrap_at(font) -> list[str] | None:
        meas = lambda t: font.getbbox(t)[2] - font.getbbox(t)[0]
        lines, cur = [], words[0]
        if meas(cur) > max_w:
            return None
        for word in words[1:]:
            trial = cur + " " + word
            if meas(trial) <= max_w:
                cur = trial
            else:
                if meas(word) > max_w:
                    return None
                lines.append(cur)
                cur = word
        lines.append(cur)
        return lines

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


def build(concept_id: str):
    cfg = CONCEPTS[concept_id]
    out_dir = OUT_ROOT / concept_id
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = TMP_ROOT / concept_id
    tmp.mkdir(parents=True, exist_ok=True)
    print(f"== {concept_id} ==")

    # Pull clips
    seen_ids = set()
    pulled: list[tuple[Path, dict]] = []
    for q in cfg["search_queries"]:
        if len(pulled) >= cfg["n_clips"]: break
        print(f"  searching: '{q}'")
        hits = search_videos(q, per_page=12, orient="portrait")
        for h in hits:
            if len(pulled) >= cfg["n_clips"]: break
            if h["id"] in seen_ids: continue
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

    # Concat + overlays
    cat = tmp / "concat.mp4"
    concat(normed, cat)
    final = out_dir / "video.mp4"
    apply_overlays(
        cat, final,
        hook=cfg["hook"],
        body=cfg.get("body"),
        cta_text=cfg.get("cta_text"),
        hook_end=cfg.get("hook_end_secs", 3.0),
        body_end=cfg.get("body_end_secs", 10.0),
    )
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
