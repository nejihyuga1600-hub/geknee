#!/usr/bin/env python3
"""
1. Extend MODELS registry with all new landmarks.
2. Add mk="key" to every new <Lm> call that doesn't have one.
3. Write public/models/README.txt listing every file path.
"""
import re, os

# ── All new landmarks: key -> filename stem ────────────────────────────────────
NEW_MODELS = {
  # US States
  "alabamaRocket":    "alabama_rocket",
  "alaskaDenali":     "alaska_denali",
  "arkansasCrystal":  "arkansas_crystal",
  "californiaYosemite":"california_yosemite",
  "coloradoRocky":    "colorado_rocky",
  "connecticutMark":  "connecticut_mark_twain",
  "delawareCape":     "delaware_cape_henlopen",
  "floridaKSC":       "florida_kennedy_space_center",
  "georgiaStone":     "georgia_stone_mountain",
  "hawaiiDiamond":    "hawaii_diamond_head",
  "idahoCraters":     "idaho_craters_moon",
  "illinoisBean":     "illinois_cloud_gate",
  "indianaSpeedway":  "indiana_speedway",
  "iowaFields":       "iowa_field_of_dreams",
  "kansasPrairie":    "kansas_tallgrass_prairie",
  "kentuckyMammoth":  "kentucky_mammoth_cave",
  "louisianaFrench":  "louisiana_french_quarter",
  "maineAcadia":      "maine_acadia",
  "marylandFort":     "maryland_fort_mchenry",
  "massFreedom":      "massachusetts_freedom_trail",
  "michiganPictured": "michigan_pictured_rocks",
  "minnesotaMall":    "minnesota_mall_of_america",
  "mississippiNatch": "mississippi_natchez_trace",
  "missouriArch":     "missouri_gateway_arch",
  "montanaGlacier":   "montana_glacier_np",
  "nebraskaChimney":  "nebraska_chimney_rock",
  "nevadaVegas":      "nevada_las_vegas_strip",
  "nhWashington":     "nh_mount_washington",
  "njAtlantic":       "nj_atlantic_city",
  "nmWhiteSands":     "nm_white_sands",
  "nyEmpire":         "ny_empire_state",
  "ncBlueRidge":      "nc_blue_ridge",
  "ndTheodore":       "nd_theodore_roosevelt",
  "ohioRock":         "ohio_rock_hall",
  "oklahomaMemorial": "oklahoma_memorial",
  "oregonCrater":     "oregon_crater_lake",
  "paLibertyBell":    "pa_liberty_bell",
  "riCliffWalk":      "ri_cliff_walk",
  "scFortSumter":     "sc_fort_sumter",
  "tnGraceland":      "tn_graceland",
  "txAlamo":          "tx_alamo",
  "utahArches":       "utah_arches",
  "vtStowe":          "vt_stowe_mountain",
  "vaMonticello":     "va_monticello",
  "waSpaceNeedle":    "wa_space_needle",
  "wvNewRiver":       "wv_new_river_gorge",
  "wiHouseRock":      "wi_house_on_the_rock",
  "wyOldFaithful":    "wy_old_faithful",
  # France
  "montSaintMichelF": "mont_saint_michel",
  "versaillesF":      "versailles",
  "notreDameF":       "notre_dame",
  "niceRiviera":      "nice_riviera",
  "pontDuGard":       "pont_du_gard",
  "chamonixAlps":     "chamonix_alps",
  "carcassonneF":     "carcassonne",
  "chambordF":        "chambord_castle",
  "bordeauxWine":     "bordeaux",
  "colmarAlsace":     "colmar",
  # Spain
  "alhambra":         "alhambra",
  "parkGuell":        "park_guell",
  "sevilleCathedral": "seville_cathedral",
  "guggenheimBilbao": "guggenheim_bilbao",
  "teideVolcano":     "teide_volcano",
  "santiagoDeComp":   "santiago_de_compostela",
  "toledoSpain":      "toledo_spain",
  "ibizaSpain":       "ibiza",
  "costaBrava":       "costa_brava",
  "pampalonaFiesta":  "pamplona",
  # Italy
  "leaningPisa":      "leaning_tower_pisa",
  "veniceCanals":     "venice_canals",
  "amalfiCoast":      "amalfi_coast",
  "vaticanCity":      "vatican_city",
  "pompeii":          "pompeii",
  "cinqueTerre":      "cinque_terre",
  "lakeComo":         "lake_como",
  "dolomites":        "dolomites",
  "treviFountain":    "trevi_fountain",
  "siciliaTemple":    "sicily_valley_temples",
  # UK
  "bigBen":           "big_ben",
  "towerBridge":      "tower_bridge",
  "edinburghCastle":  "edinburgh_castle",
  "buckinghamPalace": "buckingham_palace",
  "bathRomans":       "bath_roman_baths",
  "giantsCauseway":   "giants_causeway",
  "lakeDistrict":     "lake_district",
  "windsorCastle":    "windsor_castle",
  "hadrianWall":      "hadrians_wall",
  "cotswolds":        "cotswolds",
  # Germany
  "brandenburgGate":  "brandenburg_gate",
  "neuschwanstein":   "neuschwanstein_castle",
  "cologneGermany":   "cologne_cathedral",
  "rhineValley":      "rhine_valley",
  "blackForest":      "black_forest",
  "heidelbergCastle": "heidelberg_castle",
  "bavAlps":          "bavarian_alps",
  "hamburgHarbor":    "hamburg_harbor",
  "rothenburg":       "rothenburg",
  "munichMarien":     "munich_marienplatz",
  # Japan
  "mountFuji":        "mount_fuji",
  "fushimiInari":     "fushimi_inari",
  "hiroshimaPeace":   "hiroshima_peace_memorial",
  "naraDeer":         "nara_deer_park",
  "osakaCastle":      "osaka_castle",
  "arashiyamaBamboo": "arashiyama_bamboo",
  "himejCastle":      "himeji_castle",
  "hokkaidoLav":      "hokkaido_lavender",
  "shibuyaCrossing":  "shibuya_crossing",
  "kyotoTemple":      "kyoto_golden_pavilion",
  # Australia
  "sydneyOpera":      "sydney_opera_house",
  "uluru":            "uluru",
  "blueMountains":    "blue_mountains",
  "greatOceanRoad":   "great_ocean_road",
  "kakaduNP":         "kakadu_np",
  "whitsundays":      "whitsunday_islands",
  "bondiBeach":       "bondi_beach",
  "daintreeRF":       "daintree_rainforest",
  "purnululu":        "purnululu_bungle_bungle",
  "tasmaniaFreycinet":"tasmania_freycinet",
  # China
  "forbiddenCity":    "forbidden_city",
  "terracottaArmy":   "terracotta_army",
  "liRiverChina":     "li_river",
  "zhangjiajie":      "zhangjiajie",
  "yellowMountain":   "huangshan_yellow_mountain",
  "potalaLhasa":      "potala_palace",
  "westLakeHangzhou": "west_lake_hangzhou",
  "guilinKarst":      "guilin_karst",
  "summerPalaceB":    "summer_palace_beijing",
  "lijiangOldTown":   "lijiang_old_town",
  # India
  "jaipurAmber":      "jaipur_amber_fort",
  "keralaBackwaters": "kerala_backwaters",
  "varanasiGhats":    "varanasi_ghats",
  "goaBeaches":       "goa_beaches",
  "goldenTempleAm":   "golden_temple_amritsar",
  "mumbaiGateway":    "mumbai_gateway_of_india",
  "hawaMahal":        "hawa_mahal",
  "ajantaCaves":      "ajanta_caves",
  "ranthambore":      "ranthambore",
  "delhiQutub":       "delhi_qutub_minar",
  # Thailand
  "grandPalaceBKK":   "grand_palace_bangkok",
  "phiPhiIslands":    "phi_phi_islands",
  "chiangMaiTemple":  "chiang_mai_doi_suthep",
  "ayutthaya":        "ayutthaya",
  "railayBeach":      "railay_beach",
  "whiteTempleCR":    "white_temple_chiang_rai",
  "erawanFalls":      "erawan_waterfall",
  "sukhothai":        "sukhothai",
  # Greece
  "santoriniGreece":  "santorini",
  "meteora":          "meteora",
  "delphi":           "delphi",
  "olympia":          "ancient_olympia",
  "rhodesOldCity":    "rhodes_old_city",
  "corfuOldTown":     "corfu_old_town",
  "knossosCrete":     "knossos",
  "mykonos":          "mykonos_windmills",
  "navagioBeach":     "navagio_beach",
  "nafplio":          "nafplio",
  # Turkey
  "pamukkale":        "pamukkale",
  "ephesus":          "ephesus",
  "blueMosque":       "blue_mosque",
  "topkapiPalace":    "topkapi_palace",
  "bodrumTurkey":     "bodrum_castle",
  "gobekliTepe":      "gobekli_tepe",
  "nemrutDag":        "nemrut_dag",
  "sumelaMonastery":  "sumela_monastery",
  # Brazil
  "amazonManaus":     "amazon_manaus",
  "copacabana":       "copacabana_beach",
  "pantanal":         "pantanal",
  "fernandoNoronha":  "fernando_de_noronha",
  "salvadorHistoric": "salvador_pelourinho",
  "lencoisM":         "lencois_maranhenses",
  "ouroPreto":        "ouro_preto",
  # Mexico
  "teotihuacan":      "teotihuacan",
  "palenqueMx":       "palenque",
  "tulumMx":          "tulum",
  "copperCanyonMx":   "copper_canyon",
  "oaxacaMontAlban":  "monte_alban_oaxaca",
  "mexicoCathedral":  "mexico_city_cathedral",
  "guanajuatoMx":     "guanajuato",
  "caboSanLucas":     "cabo_san_lucas",
  # Peru
  "lakeTiticaca":     "lake_titicaca",
  "nazcaLines":       "nazca_lines",
  "cusco":            "cusco",
  "colcaCanyon":      "colca_canyon",
  "chanChan":         "chan_chan",
  # Egypt
  "valleyOfKings":    "valley_of_the_kings",
  "karnakTemple":     "karnak_temple",
  "luxorTemple":      "luxor_temple",
  "alexandriaEgypt":  "alexandria",
  "mountSinai":       "mount_sinai",
  # Africa
  "maasaiMara":       "maasai_mara",
  "serengeti":        "serengeti",
  "kilimanjaro":      "kilimanjaro",
  "krugerNP":         "kruger_np",
  "capePointSA":      "cape_point",
  "moroccoMar":       "marrakech_medina",
  "moroccoSahara":    "sahara_dunes",
  "zanzibar":         "zanzibar_stone_town",
  "lalibelaEth":      "lalibela_rock_churches",
  "drakensberg":      "drakensberg",
  "nairobiNP":        "nairobi_np",
  "ngorongoroCrater": "ngorongoro_crater",
  # Iceland
  "reykjavikH":       "reykjavik_hallgrimskirkja",
  "geysirIceland":    "geysir",
  "skogafoss":        "skogafoss_waterfall",
  # Norway
  "geirangerfjord":   "geiranger_fjord",
  "tromsoLights":     "tromso_northern_lights",
  "bergenWharf":      "bergen_bryggen",
  # Canada
  "banffNP":          "banff_np",
  "quebecOldCity":    "old_quebec_city",
  "whistlerBC":       "whistler_mountain",
  "haida":            "haida_gwaii",
  # New Zealand
  "hobbiton":         "hobbiton",
  "rotoruaNZ":        "rotorua_geothermal",
  "fiordlandNZ":      "fiordland_np",
  # Jordan
  "wadiRum":          "wadi_rum",
  "deadSea":          "dead_sea",
  # Russia
  "stBasils":         "st_basils_cathedral",
  "lakeBaikal":       "lake_baikal",
  "hermitageSPB":     "hermitage_museum",
  # Vietnam
  "hoiAnVietnam":     "hoi_an",
  "hanoiHoanKiem":    "hanoi_hoan_kiem",
  # Indonesia
  "baliUluwatu":      "bali_uluwatu",
  "komodoPark":       "komodo_park",
  "prambananJava":    "prambanan_temple",
  # Portugal
  "lisbonBelem":      "lisbon_belem_tower",
  "sintraPortugal":   "sintra_palace",
  # Netherlands
  "keukenhofTulips":  "keukenhof_tulips",
  "kinderdijkMills":  "kinderdijk_windmills",
  # Czech Republic
  "pragueCastle":     "prague_castle",
  # Austria
  "hallstatt":        "hallstatt",
  # Switzerland
  "interlaken":       "interlaken",
  # Cambodia
  "taProhm":          "ta_prohm_temple",
  # Sri Lanka
  "sigiriya":         "sigiriya_rock",
  "dalleTeaFields":   "nuwara_eliya_tea_fields",
  # South Korea
  "gyeongbokgung":    "gyeongbokgung_palace",
  "jejuIsland":       "jeju_island",
  # Argentina
  "buenosAires":      "buenos_aires_obelisk",
  "patagoniaArg":     "patagonia_torres_del_paine",
  # Chile
  "atacamaDesert":    "atacama_desert",
  "easterIsland":     "easter_island_moai",
  # Colombia
  "cartagenaCO":      "cartagena_walled_city",
  # Cuba
  "havanaOldCity":    "old_havana",
  # Nepal
  "kathmanduPatan":   "kathmandu_patan",
  # Myanmar
  "bagan":            "bagan_temples",
  # Iran
  "persepolisIran":   "persepolis",
}

# ── 1. Extend MODELS registry ─────────────────────────────────────────────────
new_entries = "\n".join(
    f'  {key}:{" " * max(1, 22-len(key))}{{ path: "/models/{stem}.glb", scale: 0.01 }},'
    for key, stem in NEW_MODELS.items()
)

with open('app/plan/location/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

OLD_MODELS_END = '  milfordSound:     { path: "/models/milford_sound.glb",       scale: 0.01 },\n};'
NEW_MODELS_END  = f'  milfordSound:     {{ path: "/models/milford_sound.glb",       scale: 0.01 }},\n  // ── New landmarks ──────────────────────────────\n{new_entries}\n}};'

if OLD_MODELS_END in content:
    content = content.replace(OLD_MODELS_END, NEW_MODELS_END, 1)
    print('MODELS registry extended OK')
else:
    print('MODELS end anchor not found!')

# ── 2. Add mk="key" to every new <Lm> that is missing it ─────────────────────
# Pattern: <Lm p={L.KEY} info={INFO.KEY}> with no mk= prop
def add_mk(text, key):
    old = f'<Lm p={{L.{key}}} info={{INFO.{key}}}>'
    new = f'<Lm p={{L.{key}}} info={{INFO.{key}}} mk="{key}">'
    return text.replace(old, new)

for key in NEW_MODELS:
    content = add_mk(content, key)

with open('app/plan/location/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print(f'mk props added for {len(NEW_MODELS)} landmarks')

# ── 3. Write reference file ────────────────────────────────────────────────────
os.makedirs('public/models', exist_ok=True)

ORIGINAL_30 = {
  "greatWall":        "great_wall",
  "petra":            "petra",
  "christRedeem":     "christ_redeemer",
  "machuPicchu":      "machu_picchu",
  "chichenItza":      "chichen_itza",
  "colosseum":        "colosseum",
  "tajMahal":         "taj_mahal",
  "eiffelTower":      "eiffel_tower",
  "acropolis":        "acropolis",
  "stonehenge":       "stonehenge",
  "sagradaFamilia":   "sagrada_familia",
  "angkorWat":        "angkor_wat",
  "borobudur":        "borobudur",
  "tokyoSkytree":     "tokyo_skytree",
  "pyramidGiza":      "pyramids",
  "tableMountain":    "table_mountain",
  "statueLiberty":    "statue_liberty",
  "mtRushmore":       "mt_rushmore",
  "goldenGate":       "golden_gate",
  "grandCanyon":      "grand_canyon",
  "niagaraFalls":     "niagara_falls",
  "iguazuFalls":      "iguazu_falls",
  "galapagos":        "galapagos",
  "plitviceLakes":    "plitvice_lakes",
  "swissAlps":        "swiss_alps",
  "mtEverest":        "mt_everest",
  "haLongBay":        "ha_long_bay",
  "victoriaFalls":    "victoria_falls",
  "greatBarrierReef": "great_barrier_reef",
  "milfordSound":     "milford_sound",
}

ALL_MODELS = {**ORIGINAL_30, **NEW_MODELS}

lines = [
    "GLOBE 3D MODEL FILE LOCATIONS",
    "==============================",
    "Upload .glb files to:  travel-ai/public/models/<filename>",
    "Once uploaded, the globe automatically shows your model instead of the primitive shape.",
    "",
    f"Total landmarks: {len(ALL_MODELS)}",
    "",
]

# Group by region
groups = {
    "Original 30 World Wonders": list(ORIGINAL_30.items()),
    "United States (by state)": [(k,v) for k,v in NEW_MODELS.items() if any(k.startswith(p) for p in ["alabama","alaska","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","mass","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","nh","nj","nm","ny","nc","nd","ohio","oklahoma","oregon","pa","ri","sc","tn","tx","utah","vt","va","wa","wv","wi","wy"])],
    "France":        [(k,v) for k,v in NEW_MODELS.items() if k.endswith("F") or k in ["niceRiviera","pontDuGard","chamonixAlps","bordeauxWine","colmarAlsace"]],
    "Spain":         [(k,v) for k,v in NEW_MODELS.items() if k in ["alhambra","parkGuell","sevilleCathedral","guggenheimBilbao","teideVolcano","santiagoDeComp","toledoSpain","ibizaSpain","costaBrava","pampalonaFiesta"]],
    "Italy":         [(k,v) for k,v in NEW_MODELS.items() if k in ["leaningPisa","veniceCanals","amalfiCoast","vaticanCity","pompeii","cinqueTerre","lakeComo","dolomites","treviFountain","siciliaTemple"]],
    "United Kingdom":[(k,v) for k,v in NEW_MODELS.items() if k in ["bigBen","towerBridge","edinburghCastle","buckinghamPalace","bathRomans","giantsCauseway","lakeDistrict","windsorCastle","hadrianWall","cotswolds"]],
    "Germany":       [(k,v) for k,v in NEW_MODELS.items() if k in ["brandenburgGate","neuschwanstein","cologneGermany","rhineValley","blackForest","heidelbergCastle","bavAlps","hamburgHarbor","rothenburg","munichMarien"]],
    "Japan":         [(k,v) for k,v in NEW_MODELS.items() if k in ["mountFuji","fushimiInari","hiroshimaPeace","naraDeer","osakaCastle","arashiyamaBamboo","himejCastle","hokkaidoLav","shibuyaCrossing","kyotoTemple"]],
    "Australia":     [(k,v) for k,v in NEW_MODELS.items() if k in ["sydneyOpera","uluru","blueMountains","greatOceanRoad","kakaduNP","whitsundays","bondiBeach","daintreeRF","purnululu","tasmaniaFreycinet"]],
    "China":         [(k,v) for k,v in NEW_MODELS.items() if k in ["forbiddenCity","terracottaArmy","liRiverChina","zhangjiajie","yellowMountain","potalaLhasa","westLakeHangzhou","guilinKarst","summerPalaceB","lijiangOldTown"]],
    "India":         [(k,v) for k,v in NEW_MODELS.items() if k in ["jaipurAmber","keralaBackwaters","varanasiGhats","goaBeaches","goldenTempleAm","mumbaiGateway","hawaMahal","ajantaCaves","ranthambore","delhiQutub"]],
    "Thailand":      [(k,v) for k,v in NEW_MODELS.items() if k in ["grandPalaceBKK","phiPhiIslands","chiangMaiTemple","ayutthaya","railayBeach","whiteTempleCR","erawanFalls","sukhothai"]],
    "Greece":        [(k,v) for k,v in NEW_MODELS.items() if k in ["santoriniGreece","meteora","delphi","olympia","rhodesOldCity","corfuOldTown","knossosCrete","mykonos","navagioBeach","nafplio"]],
    "Turkey":        [(k,v) for k,v in NEW_MODELS.items() if k in ["pamukkale","ephesus","blueMosque","topkapiPalace","bodrumTurkey","gobekliTepe","nemrutDag","sumelaMonastery"]],
    "Brazil":        [(k,v) for k,v in NEW_MODELS.items() if k in ["amazonManaus","copacabana","pantanal","fernandoNoronha","salvadorHistoric","lencoisM","ouroPreto"]],
    "Mexico":        [(k,v) for k,v in NEW_MODELS.items() if k.endswith("Mx") or k in ["teotihuacan","caboSanLucas"]],
    "Peru":          [(k,v) for k,v in NEW_MODELS.items() if k in ["lakeTiticaca","nazcaLines","cusco","colcaCanyon","chanChan"]],
    "Egypt":         [(k,v) for k,v in NEW_MODELS.items() if k in ["valleyOfKings","karnakTemple","luxorTemple","alexandriaEgypt","mountSinai"]],
    "Africa":        [(k,v) for k,v in NEW_MODELS.items() if k in ["maasaiMara","serengeti","kilimanjaro","krugerNP","capePointSA","moroccoMar","moroccoSahara","zanzibar","lalibelaEth","drakensberg","nairobiNP","ngorongoroCrater"]],
    "Iceland":       [(k,v) for k,v in NEW_MODELS.items() if k in ["reykjavikH","geysirIceland","skogafoss"]],
    "Norway":        [(k,v) for k,v in NEW_MODELS.items() if k in ["geirangerfjord","tromsoLights","bergenWharf"]],
    "Canada":        [(k,v) for k,v in NEW_MODELS.items() if k in ["banffNP","quebecOldCity","whistlerBC","haida"]],
    "New Zealand":   [(k,v) for k,v in NEW_MODELS.items() if k in ["hobbiton","rotoruaNZ","fiordlandNZ"]],
    "Jordan":        [(k,v) for k,v in NEW_MODELS.items() if k in ["wadiRum","deadSea"]],
    "Russia":        [(k,v) for k,v in NEW_MODELS.items() if k in ["stBasils","lakeBaikal","hermitageSPB"]],
    "Vietnam":       [(k,v) for k,v in NEW_MODELS.items() if k in ["hoiAnVietnam","hanoiHoanKiem"]],
    "Indonesia":     [(k,v) for k,v in NEW_MODELS.items() if k in ["baliUluwatu","komodoPark","prambananJava"]],
    "Portugal":      [(k,v) for k,v in NEW_MODELS.items() if k in ["lisbonBelem","sintraPortugal"]],
    "Netherlands":   [(k,v) for k,v in NEW_MODELS.items() if k in ["keukenhofTulips","kinderdijkMills"]],
    "Czech Republic":[(k,v) for k,v in NEW_MODELS.items() if k in ["pragueCastle"]],
    "Austria":       [(k,v) for k,v in NEW_MODELS.items() if k in ["hallstatt"]],
    "Switzerland":   [(k,v) for k,v in NEW_MODELS.items() if k in ["interlaken"]],
    "Cambodia":      [(k,v) for k,v in NEW_MODELS.items() if k in ["taProhm"]],
    "Sri Lanka":     [(k,v) for k,v in NEW_MODELS.items() if k in ["sigiriya","dalleTeaFields"]],
    "South Korea":   [(k,v) for k,v in NEW_MODELS.items() if k in ["gyeongbokgung","jejuIsland"]],
    "Argentina":     [(k,v) for k,v in NEW_MODELS.items() if k in ["buenosAires","patagoniaArg"]],
    "Chile":         [(k,v) for k,v in NEW_MODELS.items() if k in ["atacamaDesert","easterIsland"]],
    "Colombia":      [(k,v) for k,v in NEW_MODELS.items() if k in ["cartagenaCO"]],
    "Cuba":          [(k,v) for k,v in NEW_MODELS.items() if k in ["havanaOldCity"]],
    "Nepal":         [(k,v) for k,v in NEW_MODELS.items() if k in ["kathmanduPatan"]],
    "Myanmar":       [(k,v) for k,v in NEW_MODELS.items() if k in ["bagan"]],
    "Iran":          [(k,v) for k,v in NEW_MODELS.items() if k in ["persepolisIran"]],
}

for region, entries in groups.items():
    if not entries:
        continue
    lines.append(f"\n── {region} {'─'*(50-len(region))}")
    for key, stem in entries:
        path = f"/models/{stem}.glb"
        lines.append(f"  {key:<28}  public{path}")

ref_text = "\n".join(lines)
with open('public/models/UPLOAD_GUIDE.txt', 'w', encoding='utf-8') as f:
    f.write(ref_text)
print(f'Written public/models/UPLOAD_GUIDE.txt  ({len(ALL_MODELS)} entries)')
