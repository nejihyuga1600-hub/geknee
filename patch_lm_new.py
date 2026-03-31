#!/usr/bin/env python3
"""Generate and inject Lm blocks for all new landmarks added by patch_expand.py."""

# ── Shape template helpers ─────────────────────────────────────────────────────
def beacon(key, color, glow=False):
    g = f' emissive="{color}" emissiveIntensity={{0.3}}' if glow else ''
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.06,0]}}><cylinderGeometry args={{[0.09,0.11,0.12,8]}}/><meshStandardMaterial color="{color}" roughness={{0.6}}/></mesh>
        <mesh position={{[0,0.21,0]}}><cylinderGeometry args={{[0.045,0.09,0.18,8]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[0,0.33,0]}}><sphereGeometry args={{[0.065,12,8]}}/><meshStandardMaterial color="{color}"{g}/></mesh>
      </Lm>'''

def mountain(key, col_base, col_snow="#e8f4ff"):
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.18,0]}}><coneGeometry args={{[0.32,0.5,7]}}/><meshStandardMaterial color="{col_base}" roughness={{0.8}}/></mesh>
        <mesh position={{[0,0.46,0]}}><coneGeometry args={{[0.18,0.28,6]}}/><meshStandardMaterial color="{col_base}" roughness={{0.7}}/></mesh>
        <mesh position={{[0,0.62,0]}}><coneGeometry args={{[0.12,0.22,6]}}/><meshStandardMaterial color="{col_snow}" roughness={{0.5}}/></mesh>
      </Lm>'''

def volcano(key, col_base):
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.16,0]}}><coneGeometry args={{[0.35,0.38,8]}}/><meshStandardMaterial color="{col_base}" roughness={{0.8}}/></mesh>
        <mesh position={{[0,0.38,0]}}><coneGeometry args={{[0.22,0.26,8]}}/><meshStandardMaterial color="{col_base}" roughness={{0.7}}/></mesh>
        <mesh position={{[0,0.5,0]}}><cylinderGeometry args={{[0.09,0.14,0.06,8]}}/><meshStandardMaterial color="#cc4400"/></mesh>
      </Lm>'''

def tower(key, color, glow=False):
    g = f' emissive="{color}" emissiveIntensity={{0.35}}' if glow else ''
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.08,0]}}><cylinderGeometry args={{[0.1,0.13,0.16,8]}}/><meshStandardMaterial color="{color}" roughness={{0.5}}/></mesh>
        <mesh position={{[0,0.35,0]}}><cylinderGeometry args={{[0.06,0.1,0.38,8]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[0,0.56,0]}}><cylinderGeometry args={{[0.09,0.06,0.06,8]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[0,0.72,0]}}><coneGeometry args={{[0.04,0.18,8]}}/><meshStandardMaterial color="{color}"{g}/></mesh>
      </Lm>'''

def castle(key, color):
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.1,0]}} scale={{[0.6,0.2,0.45]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}" roughness={{0.7}}/></mesh>
        <mesh position={{[0,0.26,0]}} scale={{[0.5,0.18,0.38]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[-0.22,0.4,0]}}><coneGeometry args={{[0.06,0.22,8]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[ 0.22,0.4,0]}}><coneGeometry args={{[0.06,0.22,8]}}/><meshStandardMaterial color="{color}"/></mesh>
      </Lm>'''

def dome(key, color):
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.06,0]}} scale={{[0.7,0.12,0.7]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}" roughness={{0.6}}/></mesh>
        <mesh position={{[0,0.2,0]}} scale={{[0.5,0.2,0.5]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[0,0.38,0]}}><sphereGeometry args={{[0.22,16,12]}}/><meshStandardMaterial color="{color}" roughness={{0.3}} metalness={{0.1}}/></mesh>
      </Lm>'''

def arch(key, color):
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[-0.18,0.2,0]}} scale={{[0.09,0.4,0.09]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}" roughness={{0.7}}/></mesh>
        <mesh position={{[ 0.18,0.2,0]}} scale={{[0.09,0.4,0.09]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[0,0.44,0]}} scale={{[0.45,0.1,0.09]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}"/></mesh>
      </Lm>'''

def obelisk(key, color):
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.04,0]}} scale={{[0.14,0.08,0.14]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}" roughness={{0.6}}/></mesh>
        <mesh position={{[0,0.28,0]}}><cylinderGeometry args={{[0.04,0.08,0.44,8]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[0,0.54,0]}}><coneGeometry args={{[0.04,0.14,8]}}/><meshStandardMaterial color="{color}" metalness={{0.3}}/></mesh>
      </Lm>'''

def geyser(key, color="#b8e8f8"):
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.06,0]}}><cylinderGeometry args={{[0.12,0.15,0.12,10]}}/><meshStandardMaterial color="#888880" roughness={{0.8}}/></mesh>
        <mesh position={{[0,0.28,0]}}><cylinderGeometry args={{[0.04,0.08,0.32,10]}}/><meshStandardMaterial color="{color}" roughness={{0.3}} transparent opacity={{0.85}}/></mesh>
        <mesh position={{[0,0.5,0]}}><sphereGeometry args={{[0.1,10,8]}}/><meshStandardMaterial color="{color}" roughness={{0.3}} transparent opacity={{0.7}}/></mesh>
      </Lm>'''

def natural_cluster(key, color):
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.1,0]}}><sphereGeometry args={{[0.22,12,8]}}/><meshStandardMaterial color="{color}" roughness={{0.8}}/></mesh>
        <mesh position={{[0.15,0.18,0.1]}}><sphereGeometry args={{[0.14,10,6]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[-0.1,0.14,-0.12]}}><sphereGeometry args={{[0.12,10,6]}}/><meshStandardMaterial color="{color}"/></mesh>
      </Lm>'''

def beach_shape(key, water="#22aacc"):
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.02,0]}} scale={{[0.5,0.04,0.35]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="#f0d888" roughness={{0.9}}/></mesh>
        <mesh position={{[0,0.06,0.2]}} scale={{[0.5,0.08,0.14]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{water}" roughness={{0.3}} transparent opacity={{0.85}}/></mesh>
      </Lm>'''

def pyramid_shape(key, color):
    return f'''\
      {{/* {key} */}}
      <Lm p={{L.{key}}} info={{INFO.{key}}}>
        <mesh position={{[0,0.05,0]}} scale={{[0.8,0.1,0.8]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}" roughness={{0.7}}/></mesh>
        <mesh position={{[0,0.18,0]}} scale={{[0.55,0.16,0.55]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[0,0.35,0]}} scale={{[0.32,0.16,0.32]}}><boxGeometry args={{[1,1,1]}}/><meshStandardMaterial color="{color}"/></mesh>
        <mesh position={{[0,0.52,0]}}><coneGeometry args={{[0.16,0.18,4]}}/><meshStandardMaterial color="{color}"/></mesh>
      </Lm>'''

# ── Build all blocks ───────────────────────────────────────────────────────────
blocks = []

# ── US States ─────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ US State Landmarks ══════════════════════════════════════════ */}')
blocks.append(tower("alabamaRocket",    "#cc4422"))         # US Space & Rocket Center
blocks.append(mountain("alaskaDenali",  "#8899bb"))         # Denali
blocks.append(dome("arkansasCrystal",  "#6688aa"))          # Crystal Bridges Museum
blocks.append(mountain("californiaYosemite", "#5a8040"))    # Yosemite
blocks.append(mountain("coloradoRocky", "#7080a8"))         # Rocky Mountain NP
blocks.append(beacon("connecticutMark", "#8855aa"))         # Mark Twain House
blocks.append(beach_shape("delawareCape", "#3399cc"))       # Cape Henlopen
blocks.append(tower("floridaKSC",      "#aaaacc"))          # Kennedy Space Center
blocks.append(mountain("georgiaStone", "#888888"))          # Stone Mountain
blocks.append(volcano("hawaiiDiamond", "#884422"))          # Diamond Head
blocks.append(volcano("idahoCraters",  "#aa5522"))          # Craters of the Moon
blocks.append(natural_cluster("illinoisBean", "#aabbcc"))   # Cloud Gate (Bean)
blocks.append(beacon("indianaSpeedway","#cc4422"))          # Indy Speedway
blocks.append(beacon("iowaFields",     "#669944"))          # Field of Dreams
blocks.append(beacon("kansasPrairie",  "#88aa55"))          # Tallgrass Prairie
blocks.append(arch("kentuckyMammoth",  "#886644"))          # Mammoth Cave
blocks.append(castle("louisianaFrench","#cc7733"))          # French Quarter
blocks.append(mountain("maineAcadia",  "#778899"))          # Acadia NP
blocks.append(castle("marylandFort",   "#aa8844"))          # Fort McHenry
blocks.append(beacon("massFreedom",    "#cc5533"))          # Freedom Trail
blocks.append(beacon("michiganPictured","#4488cc"))         # Pictured Rocks
blocks.append(beacon("minnesotaMall",  "#4466aa"))          # Mall of America
blocks.append(beacon("mississippiNatch","#887766"))         # Natchez Trace
blocks.append(arch("missouriArch",     "#88aabb"))          # Gateway Arch
blocks.append(mountain("montanaGlacier","#aaccdd"))         # Glacier NP
blocks.append(obelisk("nebraskaChimney","#cc9966"))         # Chimney Rock
blocks.append(tower("nevadaVegas",     "#ffcc22", glow=True)) # Las Vegas Strip
blocks.append(mountain("nhWashington", "#99aabb"))          # Mount Washington
blocks.append(beacon("njAtlantic",     "#4466bb"))          # Atlantic City
blocks.append(beacon("nmWhiteSands",   "#eeeedc"))          # White Sands
blocks.append(tower("nyEmpire",        "#667799"))          # Empire State Building
blocks.append(mountain("ncBlueRidge",  "#88aa99"))          # Blue Ridge Parkway
blocks.append(mountain("ndTheodore",   "#bb9966"))          # Theodore Roosevelt NP
blocks.append(beacon("ohioRock",       "#4466aa"))          # Rock & Roll Hall of Fame
blocks.append(beacon("oklahomaMemorial","#886655"))         # OKC National Memorial
blocks.append(natural_cluster("oregonCrater","#2266aa"))    # Crater Lake
blocks.append(obelisk("paLibertyBell", "#886633"))          # Liberty Bell (bell-like)
blocks.append(beacon("riCliffWalk",    "#778899"))          # Cliff Walk Newport
blocks.append(castle("scFortSumter",   "#886655"))          # Fort Sumter
blocks.append(beacon("tnGraceland",    "#884433"))          # Graceland
blocks.append(castle("txAlamo",        "#ddccaa"))          # The Alamo
blocks.append(arch("utahArches",       "#cc8844"))          # Arches NP
blocks.append(mountain("vtStowe",      "#668844"))          # Stowe Mountain
blocks.append(dome("vaMonticello",     "#eeddcc"))          # Monticello
blocks.append(tower("waSpaceNeedle",   "#888888"))          # Space Needle
blocks.append(beacon("wvNewRiver",     "#666688"))          # New River Gorge
blocks.append(beacon("wiHouseRock",    "#664422"))          # House on the Rock
blocks.append(geyser("wyOldFaithful",  "#b8e8f8"))          # Old Faithful

# ── France ────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ France ═══════════════════════════════════════════════════════ */}')
blocks.append(castle("montSaintMichelF","#d0c090"))
blocks.append(castle("versaillesF",    "#e8d888"))
blocks.append(castle("notreDameF",     "#c8c0a0"))
blocks.append(beach_shape("niceRiviera","#30aacc"))
blocks.append(arch("pontDuGard",       "#d4b870"))
blocks.append(mountain("chamonixAlps", "#aabbcc"))
blocks.append(castle("carcassonneF",   "#c8b880"))
blocks.append(castle("chambordF",      "#e0d490"))
blocks.append(beacon("bordeauxWine",   "#882233"))
blocks.append(beacon("colmarAlsace",   "#dd8844"))

# ── Spain ─────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Spain ════════════════════════════════════════════════════════ */}')
blocks.append(castle("alhambra",       "#c09040"))
blocks.append(natural_cluster("parkGuell","#cc5533"))
blocks.append(castle("sevilleCathedral","#c0a050"))
blocks.append(beacon("guggenheimBilbao","#8899cc"))
blocks.append(volcano("teideVolcano",  "#884422"))
blocks.append(castle("santiagoDeComp", "#d0c0a0"))
blocks.append(castle("toledoSpain",    "#c0a870"))
blocks.append(beach_shape("ibizaSpain","#30bbcc"))
blocks.append(beach_shape("costaBrava","#2299bb"))
blocks.append(beacon("pampalonaFiesta","#cc3322"))

# ── Italy ─────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Italy ════════════════════════════════════════════════════════ */}')
blocks.append(tower("leaningPisa",     "#f0e8d0"))
blocks.append(beacon("veniceCanals",   "#3388cc"))
blocks.append(beacon("amalfiCoast",    "#ee8833"))
blocks.append(dome("vaticanCity",      "#f0ecff"))
blocks.append(castle("pompeii",        "#c8b888"))
blocks.append(beacon("cinqueTerre",    "#ee8844"))
blocks.append(natural_cluster("lakeComo","#3399bb"))
blocks.append(mountain("dolomites",    "#aabbcc"))
blocks.append(beacon("treviFountain",  "#d0c890"))
blocks.append(beacon("siciliaTemple",  "#d4b870"))

# ── United Kingdom ────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ United Kingdom ═══════════════════════════════════════════════ */}')
blocks.append(tower("bigBen",          "#c8b870"))
blocks.append(castle("towerBridge",    "#8899aa"))
blocks.append(castle("edinburghCastle","#888888"))
blocks.append(castle("buckinghamPalace","#e8d888"))
blocks.append(beacon("bathRomans",     "#d4c890"))
blocks.append(natural_cluster("giantsCauseway","#446688"))
blocks.append(natural_cluster("lakeDistrict",  "#5588aa"))
blocks.append(castle("windsorCastle",  "#c0b080"))
blocks.append(castle("hadrianWall",    "#999988"))
blocks.append(beacon("cotswolds",      "#aa9944"))

# ── Germany ───────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Germany ══════════════════════════════════════════════════════ */}')
blocks.append(arch("brandenburgGate",  "#d4c080"))
blocks.append(castle("neuschwanstein", "#e0eeff"))
blocks.append(castle("cologneGermany", "#aaaacc"))
blocks.append(beacon("rhineValley",    "#2266aa"))
blocks.append(mountain("blackForest",  "#226633", col_snow="#44aa44"))
blocks.append(castle("heidelbergCastle","#bb9944"))
blocks.append(mountain("bavAlps",      "#aabbcc"))
blocks.append(beacon("hamburgHarbor",  "#334466"))
blocks.append(castle("rothenburg",     "#cc9933"))
blocks.append(beacon("munichMarien",   "#cc8822"))

# ── Japan ─────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Japan ════════════════════════════════════════════════════════ */}')
blocks.append(mountain("mountFuji",    "#667799", col_snow="#ffffff"))
blocks.append(beacon("fushimiInari",   "#cc3322"))
blocks.append(beacon("hiroshimaPeace","#888888"))
blocks.append(beacon("naraDeer",       "#88aa44"))
blocks.append(castle("osakaCastle",    "#4488cc"))
blocks.append(natural_cluster("arashiyamaBamboo","#44aa44"))
blocks.append(castle("himejCastle",    "#f0f0f0"))
blocks.append(beacon("hokkaidoLav",    "#9944cc"))
blocks.append(beacon("shibuyaCrossing","#334466"))
blocks.append(beacon("kyotoTemple",    "#cc8822"))

# ── Australia ─────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Australia ════════════════════════════════════════════════════ */}')
blocks.append(dome("sydneyOpera",      "#f0f8ff"))
blocks.append(mountain("uluru",        "#cc5522", col_snow="#dd6633"))
blocks.append(mountain("blueMountains","#7799bb"))
blocks.append(beach_shape("greatOceanRoad","#2288cc"))
blocks.append(natural_cluster("kakaduNP","#44aa44"))
blocks.append(beach_shape("whitsundays","#22aacc"))
blocks.append(beach_shape("bondiBeach","#22aacc"))
blocks.append(natural_cluster("daintreeRF","#228833"))
blocks.append(mountain("purnululu",    "#cc7744", col_snow="#dd8855"))
blocks.append(mountain("tasmaniaFreycinet","#778899"))

# ── China ─────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ China ════════════════════════════════════════════════════════ */}')
blocks.append(castle("forbiddenCity",  "#cc4422"))
blocks.append(beacon("terracottaArmy", "#c8a866"))
blocks.append(mountain("liRiverChina", "#55aa88"))
blocks.append(mountain("zhangjiajie",  "#667799"))
blocks.append(mountain("yellowMountain","#9999bb"))
blocks.append(castle("potalaLhasa",    "#f0f0e8"))
blocks.append(natural_cluster("westLakeHangzhou","#33aacc"))
blocks.append(mountain("guilinKarst",  "#667799"))
blocks.append(beacon("summerPalaceB",  "#cc8822"))
blocks.append(beacon("lijiangOldTown","#aa6633"))

# ── India ─────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ India ════════════════════════════════════════════════════════ */}')
blocks.append(castle("jaipurAmber",    "#cc8833"))
blocks.append(beach_shape("keralaBackwaters","#22aacc"))
blocks.append(beacon("varanasiGhats",  "#ff8822"))
blocks.append(beach_shape("goaBeaches","#22ccbb"))
blocks.append(dome("goldenTempleAm",   "#d4c020"))
blocks.append(arch("mumbaiGateway",    "#c8b870"))
blocks.append(castle("hawaMahal",      "#ee8833"))
blocks.append(beacon("ajantaCaves",    "#cc9944"))
blocks.append(natural_cluster("ranthambore","#88aa44"))
blocks.append(obelisk("delhiQutub",    "#cc9944"))

# ── Thailand ──────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Thailand ═════════════════════════════════════════════════════ */}')
blocks.append(dome("grandPalaceBKK",   "#cc8820"))
blocks.append(beach_shape("phiPhiIslands","#22aacc"))
blocks.append(dome("chiangMaiTemple",  "#cc8822"))
blocks.append(pyramid_shape("ayutthaya","#cc9944"))
blocks.append(beach_shape("railayBeach","#22bbcc"))
blocks.append(dome("whiteTempleCR",    "#f0f0f0"))
blocks.append(natural_cluster("erawanFalls","#2299aa"))
blocks.append(pyramid_shape("sukhothai","#c8a866"))

# ── Greece ────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Greece ═══════════════════════════════════════════════════════ */}')
blocks.append(dome("santoriniGreece",  "#3399ff"))
blocks.append(mountain("meteora",      "#887766"))
blocks.append(beacon("delphi",         "#c8b870"))
blocks.append(beacon("olympia",        "#c8b060"))
blocks.append(castle("rhodesOldCity",  "#c8a060"))
blocks.append(castle("corfuOldTown",   "#aa8833"))
blocks.append(beacon("knossosCrete",   "#cc9944"))
blocks.append(beacon("mykonos",        "#3388ff"))
blocks.append(beach_shape("navagioBeach","#2299cc"))
blocks.append(castle("nafplio",        "#886644"))

# ── Turkey ────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Turkey ═══════════════════════════════════════════════════════ */}')
blocks.append(beacon("pamukkale",      "#f0f0f0"))
blocks.append(beacon("ephesus",        "#c8a866"))
blocks.append(dome("blueMosque",       "#5566aa"))
blocks.append(dome("topkapiPalace",    "#cc8833"))
blocks.append(beacon("bodrumTurkey",   "#3388cc"))
blocks.append(beacon("gobekliTepe",    "#997755"))
blocks.append(mountain("nemrutDag",    "#887766"))
blocks.append(castle("sumelaMonastery","#888888"))

# ── Brazil ────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Brazil ═══════════════════════════════════════════════════════ */}')
blocks.append(natural_cluster("amazonManaus","#228833"))
blocks.append(beach_shape("copacabana","#22aacc"))
blocks.append(natural_cluster("pantanal","#44aa66"))
blocks.append(beach_shape("fernandoNoronha","#22aacc"))
blocks.append(beacon("salvadorHistoric","#cc6633"))
blocks.append(beacon("lencoisM",       "#ddccaa"))
blocks.append(beacon("ouroPreto",      "#884422"))

# ── Mexico ────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Mexico ═══════════════════════════════════════════════════════ */}')
blocks.append(pyramid_shape("teotihuacan",  "#d4aa44"))
blocks.append(pyramid_shape("palenqueMx",   "#88aa44"))
blocks.append(pyramid_shape("tulumMx",      "#ddcc88"))
blocks.append(mountain("copperCanyonMx",    "#cc8844"))
blocks.append(pyramid_shape("oaxacaMontAlban","#cc9944"))
blocks.append(castle("mexicoCathedral",     "#c0a870"))
blocks.append(beacon("guanajuatoMx",        "#cc8833"))
blocks.append(beach_shape("caboSanLucas",   "#22aacc"))

# ── Peru ──────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Peru ═════════════════════════════════════════════════════════ */}')
blocks.append(natural_cluster("lakeTiticaca","#2266aa"))
blocks.append(beacon("nazcaLines",     "#cc9966"))
blocks.append(beacon("cusco",          "#cc8833"))
blocks.append(mountain("colcaCanyon",  "#8899aa"))
blocks.append(beacon("chanChan",       "#cc9966"))

# ── Egypt ─────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Egypt ════════════════════════════════════════════════════════ */}')
blocks.append(beacon("valleyOfKings",  "#c8a844"))
blocks.append(beacon("karnakTemple",   "#d4b860"))
blocks.append(beacon("luxorTemple",    "#d4b860"))
blocks.append(beacon("alexandriaEgypt","#3388cc"))
blocks.append(mountain("mountSinai",   "#887755"))

# ── Africa ────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Africa ═══════════════════════════════════════════════════════ */}')
blocks.append(natural_cluster("maasaiMara","#88aa44"))
blocks.append(natural_cluster("serengeti", "#aa9944"))
blocks.append(mountain("kilimanjaro",  "#aabbcc"))
blocks.append(natural_cluster("krugerNP","#88aa44"))
blocks.append(mountain("capePointSA",  "#778899"))
blocks.append(castle("moroccoMar",     "#cc8833"))
blocks.append(mountain("moroccoSahara","#ddbb44", col_snow="#eecc55"))
blocks.append(beach_shape("zanzibar",  "#22aacc"))
blocks.append(beacon("lalibelaEth",    "#cc6644"))
blocks.append(mountain("drakensberg",  "#889988"))
blocks.append(natural_cluster("nairobiNP",      "#88aa44"))
blocks.append(natural_cluster("ngorongoroCrater","#88aa66"))

# ── Iceland ───────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Iceland ══════════════════════════════════════════════════════ */}')
blocks.append(tower("reykjavikH",      "#cc9944"))
blocks.append(geyser("geysirIceland",  "#b8e8f8"))
blocks.append(natural_cluster("skogafoss","#2288cc"))

# ── Norway ────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Norway ═══════════════════════════════════════════════════════ */}')
blocks.append(natural_cluster("geirangerfjord","#2277aa"))
blocks.append(beacon("tromsoLights",   "#44aacc", glow=True))
blocks.append(beacon("bergenWharf",    "#cc6633"))

# ── Canada ────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Canada ═══════════════════════════════════════════════════════ */}')
blocks.append(mountain("banffNP",      "#7799aa"))
blocks.append(castle("quebecOldCity",  "#cc8833"))
blocks.append(mountain("whistlerBC",   "#aabbcc"))
blocks.append(natural_cluster("haida", "#228844"))

# ── New Zealand ───────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ New Zealand ══════════════════════════════════════════════════ */}')
blocks.append(natural_cluster("hobbiton","#44aa44"))
blocks.append(geyser("rotoruaNZ",      "#88aacc"))
blocks.append(mountain("fiordlandNZ",  "#5588aa"))

# ── Jordan ────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Jordan ═══════════════════════════════════════════════════════ */}')
blocks.append(mountain("wadiRum",      "#dd8833", col_snow="#ee9944"))
blocks.append(beach_shape("deadSea",   "#3399aa"))

# ── Russia ────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Russia ═══════════════════════════════════════════════════════ */}')
blocks.append(dome("stBasils",         "#cc3322"))
blocks.append(natural_cluster("lakeBaikal","#2266aa"))
blocks.append(castle("hermitageSPB",   "#44aacc"))

# ── Vietnam ───────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Vietnam ══════════════════════════════════════════════════════ */}')
blocks.append(beacon("hoiAnVietnam",   "#cc8833"))
blocks.append(natural_cluster("hanoiHoanKiem","#33aa88"))

# ── Indonesia ─────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Indonesia ════════════════════════════════════════════════════ */}')
blocks.append(beacon("baliUluwatu",    "#cc8833"))
blocks.append(beacon("komodoPark",     "#44aa44"))
blocks.append(pyramid_shape("prambananJava","#c8b066"))

# ── Portugal ──────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Portugal ═════════════════════════════════════════════════════ */}')
blocks.append(tower("lisbonBelem",     "#d4c880"))
blocks.append(castle("sintraPortugal", "#e8d080"))

# ── Netherlands ───────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Netherlands ══════════════════════════════════════════════════ */}')
blocks.append(beacon("keukenhofTulips","#ee44aa"))
blocks.append(beacon("kinderdijkMills","#cc8833"))

# ── Czech Republic ────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Czech Republic ═══════════════════════════════════════════════ */}')
blocks.append(castle("pragueCastle",   "#aabb88"))

# ── Austria ───────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Austria ══════════════════════════════════════════════════════ */}')
blocks.append(beacon("hallstatt",      "#44aacc"))

# ── Switzerland ───────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Switzerland ══════════════════════════════════════════════════ */}')
blocks.append(mountain("interlaken",   "#aabbcc"))

# ── Cambodia ──────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Cambodia ═════════════════════════════════════════════════════ */}')
blocks.append(natural_cluster("taProhm","#88aa44"))

# ── Sri Lanka ─────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Sri Lanka ════════════════════════════════════════════════════ */}')
blocks.append(mountain("sigiriya",     "#cc6633", col_snow="#dd7744"))
blocks.append(beacon("dalleTeaFields","#44aa44"))

# ── South Korea ───────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ South Korea ══════════════════════════════════════════════════ */}')
blocks.append(castle("gyeongbokgung",  "#cc4422"))
blocks.append(natural_cluster("jejuIsland","#44aa44"))

# ── Argentina ─────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Argentina ════════════════════════════════════════════════════ */}')
blocks.append(obelisk("buenosAires",   "#4466aa"))
blocks.append(mountain("patagoniaArg", "#7799bb"))

# ── Chile ─────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Chile ════════════════════════════════════════════════════════ */}')
blocks.append(mountain("atacamaDesert","#ddbb55", col_snow="#eecc66"))
blocks.append(beacon("easterIsland",   "#887766"))

# ── Colombia ──────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Colombia ═════════════════════════════════════════════════════ */}')
blocks.append(castle("cartagenaCO",    "#cc8833"))

# ── Cuba ──────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Cuba ═════════════════════════════════════════════════════════ */}')
blocks.append(beacon("havanaOldCity",  "#cc6633"))

# ── Nepal ─────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Nepal ════════════════════════════════════════════════════════ */}')
blocks.append(beacon("kathmanduPatan", "#cc8833"))

# ── Myanmar ───────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Myanmar ══════════════════════════════════════════════════════ */}')
blocks.append(pyramid_shape("bagan",   "#cc9944"))

# ── Iran ──────────────────────────────────────────────────────────────────────
blocks.append('\n      {/* ══ Iran ═════════════════════════════════════════════════════════ */}')
blocks.append(beacon("persepolisIran", "#d4aa60"))

# ── Assemble and inject ────────────────────────────────────────────────────────
NEW_LM_CODE = '\n'.join(blocks) + '\n'

ANCHOR = '    </>\n  );\n}\n\n// ─── Globe scene'

with open('app/plan/location/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if ANCHOR in content:
    injection = NEW_LM_CODE + '\n    </>'
    content = content.replace('    </>\n  );\n}\n\n// ─── Globe scene',
                              injection + '\n  );\n}\n\n// ─── Globe scene', 1)
    print(f'Injected {len(blocks)} new Lm blocks OK')
else:
    print('ANCHOR not found — check AllLandmarks closing')

with open('app/plan/location/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done.')
