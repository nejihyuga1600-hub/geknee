#!/usr/bin/env python3
"""
Adds 200+ new landmarks (1 per US state, 10 per major country) plus
ocean whales/dolphins and land animals to the globe.
"""

with open('app/plan/location/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# ─────────────────────────────────────────────────────────────────────────────
# 1. NEW L ENTRIES  (injected just before the closing `};` of `const L = {`)
# ─────────────────────────────────────────────────────────────────────────────
L_ANCHOR = "  milfordSound:   geo(-44.64,  167.90),  // New Zealand\n};"

L_NEW = """\
  milfordSound:   geo(-44.64,  167.90),  // New Zealand

  // ── US States (1 per state; AZ/CA/NY/SD/AK already covered above) ────────
  alabamaRocket:    geo( 34.72,  -86.65),  // US Space & Rocket Center, AL
  alaskaDenali:     geo( 63.07, -151.00),  // Denali National Park, AK
  arkansasCrystal:  geo( 36.35,  -94.20),  // Crystal Bridges Museum, AR
  californiaYosemite: geo(37.74, -119.57), // Yosemite Valley, CA
  coloradoRocky:    geo( 40.34, -105.68),  // Rocky Mountain NP, CO
  connecticutMark:  geo( 41.77,  -72.70),  // Mark Twain House, CT
  delawareCape:     geo( 38.80,  -75.09),  // Cape Henlopen, DE
  floridaKSC:       geo( 28.52,  -80.68),  // Kennedy Space Center, FL
  georgiaStone:     geo( 33.67,  -84.15),  // Stone Mountain, GA
  hawaiiDiamond:    geo( 21.26, -157.80),  // Diamond Head, HI
  idahoCraters:     geo( 43.42, -113.52),  // Craters of the Moon, ID
  illinoisBean:     geo( 41.88,  -87.62),  // Cloud Gate (The Bean), IL
  indianaSpeedway:  geo( 39.79,  -86.24),  // Indianapolis Motor Speedway, IN
  iowaFields:       geo( 42.72,  -91.39),  // Field of Dreams, IA
  kansasPrairie:    geo( 38.84,  -96.56),  // Tallgrass Prairie NP, KS
  kentuckyMammoth:  geo( 37.19,  -86.09),  // Mammoth Cave NP, KY
  louisianaFrench:  geo( 29.96,  -90.06),  // French Quarter, LA
  maineAcadia:      geo( 44.34,  -68.27),  // Acadia NP, ME
  marylandFort:     geo( 39.27,  -76.58),  // Fort McHenry, MD
  massFreedom:      geo( 42.36,  -71.06),  // Freedom Trail, MA
  michiganPictured: geo( 46.55,  -86.50),  // Pictured Rocks, MI
  minnesotaMall:    geo( 44.85,  -93.24),  // Mall of America, MN
  mississippiNatch: geo( 32.30,  -90.21),  // Natchez Trace Parkway, MS
  missouriArch:     geo( 38.62,  -90.19),  // Gateway Arch, MO
  montanaGlacier:   geo( 48.70, -113.78),  // Glacier NP, MT
  nebraskaChimney:  geo( 41.70, -103.35),  // Chimney Rock, NE
  nevadaVegas:      geo( 36.11, -115.17),  // Las Vegas Strip, NV
  nhWashington:     geo( 44.27,  -71.30),  // Mount Washington, NH
  njAtlantic:       geo( 39.36,  -74.42),  // Atlantic City, NJ
  nmWhiteSands:     geo( 32.78, -106.17),  // White Sands NM, NM
  nyEmpire:         geo( 40.75,  -73.99),  // Empire State Building, NY
  ncBlueRidge:      geo( 35.60,  -82.55),  // Blue Ridge Parkway, NC
  ndTheodore:       geo( 46.90, -103.54),  // Theodore Roosevelt NP, ND
  ohioRock:         geo( 41.51,  -81.70),  // Rock & Roll Hall of Fame, OH
  oklahomaMemorial: geo( 35.47,  -97.52),  // OKC National Memorial, OK
  oregonCrater:     geo( 42.94, -122.10),  // Crater Lake, OR
  paLibertyBell:    geo( 39.95,  -75.15),  // Liberty Bell, PA
  riCliffWalk:      geo( 41.48,  -71.30),  // Cliff Walk, Newport RI
  scFortSumter:     geo( 32.75,  -79.87),  // Fort Sumter, SC
  tnGraceland:      geo( 35.05,  -90.02),  // Graceland, TN
  txAlamo:          geo( 29.43,  -98.49),  // The Alamo, TX
  utahArches:       geo( 38.73, -109.59),  // Arches NP, UT
  vtStowe:          geo( 44.46,  -72.69),  // Stowe Mountain, VT
  vaMonticello:     geo( 38.01,  -78.45),  // Monticello, VA
  waSpaceNeedle:    geo( 47.62, -122.35),  // Space Needle, WA
  wvNewRiver:       geo( 37.91,  -81.08),  // New River Gorge, WV
  wiHouseRock:      geo( 43.57,  -90.17),  // House on the Rock, WI
  wyOldFaithful:    geo( 44.46, -110.83),  // Old Faithful, Yellowstone WY

  // ── France (10) ─────────────────────────────────────────────────────────
  montSaintMichelF: geo( 48.64,   -1.51),  // Mont Saint-Michel
  versaillesF:      geo( 48.81,    2.12),  // Palace of Versailles
  notreDameF:       geo( 48.85,    2.35),  // Notre-Dame de Paris
  niceRiviera:      geo( 43.71,    7.26),  // French Riviera
  pontDuGard:       geo( 43.95,    4.53),  // Pont du Gard
  chamonixAlps:     geo( 45.92,    6.87),  // Chamonix Mont Blanc
  carcassonneF:     geo( 43.21,    2.35),  // Carcassonne Fortress
  chambordF:        geo( 47.61,    1.52),  // Château de Chambord
  bordeauxWine:     geo( 44.84,   -0.58),  // Bordeaux Wine Region
  colmarAlsace:     geo( 48.08,    7.36),  // Colmar, Alsace

  // ── Spain (10) ──────────────────────────────────────────────────────────
  alhambra:         geo( 37.18,   -3.59),  // Alhambra, Granada
  parkGuell:        geo( 41.41,    2.15),  // Park Güell, Barcelona
  sevilleCathedral: geo( 37.38,   -5.99),  // Seville Cathedral
  guggenheimBilbao: geo( 43.27,   -2.93),  // Guggenheim Bilbao
  teideVolcano:     geo( 28.27,  -16.64),  // Mount Teide, Tenerife
  santiagoDeComp:   geo( 42.88,   -8.54),  // Santiago de Compostela
  toledoSpain:      geo( 39.86,   -4.03),  // Toledo Old City
  ibizaSpain:       geo( 38.91,    1.43),  // Ibiza
  costaBrava:       geo( 41.75,    3.05),  // Costa Brava
  pampalonaFiesta:  geo( 42.82,   -1.64),  // Pamplona Bull Run

  // ── Italy (10) ──────────────────────────────────────────────────────────
  leaningPisa:      geo( 43.72,   10.40),  // Leaning Tower of Pisa
  veniceCanals:     geo( 45.43,   12.33),  // Venice Grand Canal
  amalfiCoast:      geo( 40.63,   14.60),  // Amalfi Coast
  vaticanCity:      geo( 41.90,   12.45),  // Vatican City
  pompeii:          geo( 40.75,   14.49),  // Pompeii
  cinqueTerre:      geo( 44.10,    9.73),  // Cinque Terre
  lakeComo:         geo( 45.99,    9.26),  // Lake Como
  dolomites:        geo( 46.45,   11.85),  // Dolomites
  treviFountain:    geo( 41.90,   12.48),  // Trevi Fountain, Rome
  siciliaTemple:    geo( 37.29,   13.59),  // Valley of the Temples, Sicily

  // ── United Kingdom (10) ─────────────────────────────────────────────────
  bigBen:           geo( 51.50,   -0.12),  // Big Ben, London
  towerBridge:      geo( 51.51,   -0.07),  // Tower Bridge, London
  edinburghCastle:  geo( 55.95,   -3.20),  // Edinburgh Castle
  buckinghamPalace: geo( 51.50,   -0.14),  // Buckingham Palace
  bathRomans:       geo( 51.38,   -2.36),  // Roman Baths, Bath
  giantsCauseway:   geo( 55.24,   -6.51),  // Giant's Causeway
  lakeDistrict:     geo( 54.46,   -3.08),  // Lake District
  windsorCastle:    geo( 51.48,   -0.60),  // Windsor Castle
  hadrianWall:      geo( 55.00,   -2.37),  // Hadrian's Wall
  cotswolds:        geo( 51.77,   -1.75),  // Cotswolds Villages

  // ── Germany (10) ────────────────────────────────────────────────────────
  brandenburgGate:  geo( 52.52,   13.38),  // Brandenburg Gate
  neuschwanstein:   geo( 47.56,   10.75),  // Neuschwanstein Castle
  cologneGermany:   geo( 50.94,    6.96),  // Cologne Cathedral
  rhineValley:      geo( 50.07,    7.70),  // Rhine Valley
  blackForest:      geo( 47.90,    8.20),  // Black Forest
  heidelbergCastle: geo( 49.41,    8.72),  // Heidelberg Castle
  bavAlps:          geo( 47.55,   11.00),  // Bavarian Alps
  hamburgHarbor:    geo( 53.55,    9.96),  // Hamburg Speicherstadt
  rothenburg:       geo( 49.38,   10.18),  // Rothenburg ob der Tauber
  munichMarien:     geo( 48.13,   11.55),  // Munich Marienplatz

  // ── Japan (10) ──────────────────────────────────────────────────────────
  mountFuji:        geo( 35.36,  138.73),  // Mount Fuji
  fushimiInari:     geo( 34.97,  135.77),  // Fushimi Inari Shrine
  hiroshimaPeace:   geo( 34.39,  132.45),  // Hiroshima Peace Memorial
  naraDeer:         geo( 34.68,  135.84),  // Nara Deer Park
  osakaCastle:      geo( 34.69,  135.52),  // Osaka Castle
  arashiyamaBamboo: geo( 35.02,  135.67),  // Arashiyama Bamboo Grove
  himejCastle:      geo( 34.84,  134.69),  // Himeji Castle
  hokkaidoLav:      geo( 43.35,  142.47),  // Hokkaido Lavender Fields
  shibuyaCrossing:  geo( 35.66,  139.70),  // Shibuya Crossing
  kyotoTemple:      geo( 35.01,  135.67),  // Kinkaku-ji Golden Pavilion

  // ── Australia (10) ──────────────────────────────────────────────────────
  sydneyOpera:      geo(-33.86,  151.21),  // Sydney Opera House
  uluru:            geo(-25.34,  131.03),  // Uluru (Ayers Rock)
  blueMountains:    geo(-33.71,  150.31),  // Blue Mountains
  greatOceanRoad:   geo(-38.66,  143.55),  // Great Ocean Road
  kakaduNP:         geo(-12.88,  132.59),  // Kakadu National Park
  whitsundays:      geo(-20.27,  149.00),  // Whitsunday Islands
  bondiBeach:       geo(-33.89,  151.28),  // Bondi Beach
  daintreeRF:       geo(-16.17,  145.42),  // Daintree Rainforest
  purnululu:        geo(-17.40,  128.36),  // Bungle Bungle Range
  tasmaniaFreycinet: geo(-42.13, 148.28),  // Freycinet NP, Tasmania

  // ── China (10) ──────────────────────────────────────────────────────────
  forbiddenCity:    geo( 39.92,  116.39),  // Forbidden City
  terracottaArmy:   geo( 34.38,  109.27),  // Terracotta Army, Xi'an
  liRiverChina:     geo( 25.06,  110.30),  // Li River, Guilin
  zhangjiajie:      geo( 29.11,  110.48),  // Zhangjiajie Mountains
  yellowMountain:   geo( 30.14,  118.17),  // Huangshan (Yellow Mountain)
  potalaLhasa:      geo( 29.66,   91.12),  // Potala Palace, Lhasa
  westLakeHangzhou: geo( 30.26,  120.15),  // West Lake, Hangzhou
  guilinKarst:      geo( 25.27,  110.29),  // Guilin Karst Peaks
  summerPalaceB:    geo( 40.00,  116.27),  // Summer Palace, Beijing
  lijiangOldTown:   geo( 26.88,  100.23),  // Lijiang Old Town

  // ── India (10) ──────────────────────────────────────────────────────────
  jaipurAmber:      geo( 26.99,   75.85),  // Amber Fort, Jaipur
  keralaBackwaters: geo(  9.49,   76.34),  // Kerala Backwaters
  varanasiGhats:    geo( 25.31,   83.01),  // Varanasi Ghats
  goaBeaches:       geo( 15.30,   73.92),  // Goa Beaches
  goldenTempleAm:   geo( 31.62,   74.88),  // Golden Temple, Amritsar
  mumbaiGateway:    geo( 18.92,   72.83),  // Gateway of India, Mumbai
  hawaMahal:        geo( 26.92,   75.83),  // Hawa Mahal, Jaipur
  ajantaCaves:      geo( 20.55,   75.70),  // Ajanta Caves
  ranthambore:      geo( 26.00,   76.50),  // Ranthambore Tiger Reserve
  delhiQutub:       geo( 28.52,   77.19),  // Qutub Minar, Delhi

  // ── Thailand (8) ────────────────────────────────────────────────────────
  grandPalaceBKK:   geo( 13.75,  100.49),  // Grand Palace, Bangkok
  phiPhiIslands:    geo(  7.74,   98.77),  // Phi Phi Islands
  chiangMaiTemple:  geo( 18.79,   98.99),  // Doi Suthep Temple
  ayutthaya:        geo( 14.36,  100.58),  // Ayutthaya Ruins
  railayBeach:      geo(  8.01,   98.84),  // Railay Beach, Krabi
  whiteTempleCR:    geo( 19.82,   99.76),  // White Temple, Chiang Rai
  erawanFalls:      geo( 14.36,   99.15),  // Erawan Waterfall
  sukhothai:        geo( 17.02,   99.82),  // Sukhothai Historical Park

  // ── Greece (10) ─────────────────────────────────────────────────────────
  santoriniGreece:  geo( 36.39,   25.46),  // Santorini Caldera
  meteora:          geo( 39.72,   21.63),  // Meteora Monasteries
  delphi:           geo( 38.48,   22.50),  // Delphi Oracle
  olympia:          geo( 37.64,   21.63),  // Ancient Olympia
  rhodesOldCity:    geo( 36.45,   28.22),  // Rhodes Medieval City
  corfuOldTown:     geo( 39.62,   19.92),  // Corfu Old Town
  knossosCrete:     geo( 35.30,   25.16),  // Palace of Knossos
  mykonos:          geo( 37.45,   25.33),  // Mykonos Windmills
  navagioBeach:     geo( 37.86,   20.62),  // Navagio Shipwreck Beach
  nafplio:          geo( 37.57,   22.80),  // Nafplio Old Town

  // ── Turkey (8) ──────────────────────────────────────────────────────────
  pamukkale:        geo( 37.92,   29.12),  // Pamukkale Travertines
  ephesus:          geo( 37.94,   27.34),  // Ephesus Ancient City
  blueMosque:       geo( 41.00,   28.97),  // Blue Mosque, Istanbul
  topkapiPalace:    geo( 41.01,   28.98),  // Topkapi Palace
  bodrumTurkey:     geo( 37.03,   27.43),  // Bodrum Castle
  gobekliTepe:      geo( 37.22,   38.92),  // Göbekli Tepe (12,000 yr old)
  nemrutDag:        geo( 37.98,   38.74),  // Nemrut Dağ
  sumelaMonastery:  geo( 40.69,   39.66),  // Sümela Monastery

  // ── Brazil (additional 7) ────────────────────────────────────────────────
  amazonManaus:     geo( -3.10,  -60.02),  // Amazon Rainforest, Manaus
  copacabana:       geo(-22.97,  -43.19),  // Copacabana Beach
  pantanal:         geo(-17.50,  -57.00),  // Pantanal Wetlands
  fernandoNoronha:  geo( -3.85,  -32.42),  // Fernando de Noronha
  salvadorHistoric: geo(-12.97,  -38.51),  // Pelourinho, Salvador
  lencoisM:         geo( -2.50,  -43.10),  // Lençóis Maranhenses
  ouroPreto:        geo(-20.38,  -43.50),  // Ouro Preto Historic City

  // ── Mexico (additional 8) ────────────────────────────────────────────────
  teotihuacan:      geo( 19.69,  -98.84),  // Teotihuacan Pyramids
  palenqueMx:       geo( 17.48,  -91.98),  // Palenque Maya Ruins
  tulumMx:          geo( 20.21,  -87.43),  // Tulum, Yucatan Coast
  copperCanyonMx:   geo( 27.54, -107.54),  // Copper Canyon (Barrancas)
  oaxacaMontAlban:  geo( 17.04,  -96.77),  // Monte Albán, Oaxaca
  mexicoCathedral:  geo( 19.43,  -99.13),  // Mexico City Cathedral
  guanajuatoMx:     geo( 21.02, -101.26),  // Guanajuato Historic City
  caboSanLucas:     geo( 22.89, -109.91),  // Cabo San Lucas

  // ── Peru (additional 5) ──────────────────────────────────────────────────
  lakeTiticaca:     geo(-15.84,  -69.33),  // Lake Titicaca
  nazcaLines:       geo(-14.73,  -75.12),  // Nazca Lines
  cusco:            geo(-13.53,  -71.96),  // Cusco Historic City
  colcaCanyon:      geo(-15.53,  -71.98),  // Colca Canyon
  chanChan:         geo( -8.11,  -79.06),  // Chan Chan Ruins

  // ── Egypt (additional 5) ─────────────────────────────────────────────────
  valleyOfKings:    geo( 25.74,   32.60),  // Valley of the Kings
  karnakTemple:     geo( 25.72,   32.66),  // Karnak Temple Complex
  luxorTemple:      geo( 25.70,   32.64),  // Luxor Temple
  alexandriaEgypt:  geo( 31.19,   29.91),  // Alexandria
  mountSinai:       geo( 28.54,   33.97),  // Mount Sinai

  // ── Africa ───────────────────────────────────────────────────────────────
  maasaiMara:       geo( -1.50,   35.15),  // Maasai Mara, Kenya
  serengeti:        geo( -2.33,   34.83),  // Serengeti, Tanzania
  kilimanjaro:      geo( -3.07,   37.35),  // Kilimanjaro, Tanzania
  krugerNP:         geo(-24.00,   31.50),  // Kruger NP, South Africa
  capePointSA:      geo(-34.36,   18.50),  // Cape Point, South Africa
  moroccoMar:       geo( 31.63,   -7.99),  // Marrakech Medina, Morocco
  moroccoSahara:    geo( 31.03,   -3.98),  // Sahara Dunes, Morocco
  zanzibar:         geo( -6.17,   39.20),  // Stone Town, Zanzibar
  lalibelaEth:      geo( 12.03,   39.04),  // Lalibela Rock Churches, Ethiopia
  drakensberg:      geo(-29.00,   29.50),  // Drakensberg Mountains, SA

  // ── Iceland (3) ─────────────────────────────────────────────────────────
  reykjavikH:       geo( 64.14,  -21.93),  // Hallgrímskirkja, Reykjavík
  geysirIceland:    geo( 64.31,  -20.30),  // Geysir Hot Spring
  skogafoss:        geo( 63.53,  -19.51),  // Skógafoss Waterfall

  // ── Norway (3) ──────────────────────────────────────────────────────────
  geirangerfjord:   geo( 62.10,    7.20),  // Geiranger Fjord
  tromsoLights:     geo( 69.65,   18.96),  // Northern Lights, Tromsø
  bergenWharf:      geo( 60.39,    5.32),  // Bryggen Wharf, Bergen

  // ── Canada (4) ──────────────────────────────────────────────────────────
  banffNP:          geo( 51.18, -115.57),  // Banff National Park
  quebecOldCity:    geo( 46.81,  -71.21),  // Old Quebec City
  whistlerBC:       geo( 50.12, -122.96),  // Whistler Mountain, BC
  haida:            geo( 53.10, -132.10),  // Haida Gwaii, BC

  // ── New Zealand (3) ─────────────────────────────────────────────────────
  hobbiton:         geo(-37.87,  175.68),  // Hobbiton Movie Set
  rotoruaNZ:        geo(-38.14,  176.25),  // Rotorua Geothermal
  fiordlandNZ:      geo(-45.41,  167.73),  // Fiordland NP

  // ── Jordan (2) ──────────────────────────────────────────────────────────
  wadiRum:          geo( 29.58,   35.42),  // Wadi Rum Desert
  deadSea:          geo( 31.56,   35.47),  // Dead Sea

  // ── Russia (3) ──────────────────────────────────────────────────────────
  stBasils:         geo( 55.75,   37.62),  // St. Basil's Cathedral
  lakeBaikal:       geo( 53.50,  108.17),  // Lake Baikal
  hermitageSPB:     geo( 59.94,   30.31),  // Hermitage Museum

  // ── Vietnam (2) ─────────────────────────────────────────────────────────
  hoiAnVietnam:     geo( 15.88,  108.32),  // Hoi An Ancient Town
  hanoiHoanKiem:    geo( 21.03,  105.85),  // Hoan Kiem Lake, Hanoi

  // ── Indonesia (3) ───────────────────────────────────────────────────────
  baliUluwatu:      geo( -8.83,  115.09),  // Uluwatu Temple, Bali
  komodoPark:       geo( -8.54,  119.49),  // Komodo National Park
  prambananJava:    geo( -7.75,  110.49),  // Prambanan Temple, Java

  // ── Portugal (2) ────────────────────────────────────────────────────────
  lisbonBelem:      geo( 38.69,   -9.22),  // Belém Tower, Lisbon
  sintraPortugal:   geo( 38.79,   -9.39),  // Sintra Palaces

  // ── Netherlands (2) ─────────────────────────────────────────────────────
  keukenhofTulips:  geo( 52.27,    4.55),  // Keukenhof Tulip Fields
  kinderdijkMills:  geo( 51.88,    4.64),  // Kinderdijk Windmills

  // ── Czech Republic (1) ───────────────────────────────────────────────────
  pragueCastle:     geo( 50.09,   14.40),  // Prague Castle

  // ── Austria (1) ──────────────────────────────────────────────────────────
  hallstatt:        geo( 47.56,   13.65),  // Hallstatt Village

  // ── Switzerland (1, separate from Swiss Alps) ────────────────────────────
  interlaken:       geo( 46.68,    7.85),  // Interlaken

  // ── Cambodia (already have Angkor Wat, add 1 more) ───────────────────────
  taProhm:          geo( 13.44,  103.89),  // Ta Prohm Temple

  // ── Sri Lanka (2) ────────────────────────────────────────────────────────
  sigiriya:         geo(  7.96,   80.76),  // Sigiriya Rock Fortress
  dalleTeaFields:   geo(  6.87,   80.65),  // Nuwara Eliya Tea Fields

  // ── South Korea (2) ─────────────────────────────────────────────────────
  gyeongbokgung:    geo( 37.58,  126.98),  // Gyeongbokgung Palace
  jejuIsland:       geo( 33.49,  126.49),  // Jeju Island

  // ── Argentina (2) ───────────────────────────────────────────────────────
  buenosAires:      geo(-34.60,  -58.38),  // Buenos Aires Obelisk
  patagoniaArg:     geo(-50.94,  -73.01),  // Torres del Paine (near border)

  // ── Chile (2) ───────────────────────────────────────────────────────────
  atacamaDesert:    geo(-23.87,  -69.32),  // Atacama Desert
  easterIsland:     geo(-27.12, -109.37),  // Easter Island Moai

  // ── Colombia (1) ─────────────────────────────────────────────────────────
  cartagenaCO:      geo( 10.42,  -75.55),  // Cartagena Walled City

  // ── Cuba (1) ─────────────────────────────────────────────────────────────
  havanaOldCity:    geo( 23.14,  -82.36),  // Old Havana

  // ── Morocco (already added above via moroccoMar) ─────────────────────────

  // ── Kenya (1 extra) ──────────────────────────────────────────────────────
  nairobiNP:        geo( -1.36,   36.88),  // Nairobi NP (lions vs skyline)

  // ── Tanzania (1 extra) ───────────────────────────────────────────────────
  ngorongoroCrater: geo( -3.22,   35.50),  // Ngorongoro Crater

  // ── Nepal (1) ────────────────────────────────────────────────────────────
  kathmanduPatan:   geo( 27.67,   85.32),  // Patan Durbar Square

  // ── Myanmar (1) ──────────────────────────────────────────────────────────
  bagan:            geo( 21.17,   94.86),  // Bagan Temples

  // ── Iran (1) ─────────────────────────────────────────────────────────────
  persepolisIran:   geo( 29.93,   52.88),  // Persepolis

  // ─── Ocean animal positions ───────────────────────────────────────────────
  // Blue Whales
  blueWhaleCA:      geo( 36.00, -125.00),  // Blue Whale, California coast
  blueWhaleSL:      geo(  6.00,   80.00),  // Blue Whale, Sri Lanka
  blueWhaleAnt:     geo(-60.00,  -40.00),  // Blue Whale, Southern Ocean
  // Humpback Whales
  humpbackAtl:      geo( 43.00,  -50.00),  // Humpback, N. Atlantic
  humpbackHI:       geo( 20.00, -156.00),  // Humpback, Hawaii
  humpbackAK:       geo( 58.00, -152.00),  // Humpback, Gulf of Alaska
  humpbackSA:       geo(-30.00,   15.00),  // Humpback, South Atlantic
  // Orca / Killer Whales
  orcaPacNW:        geo( 48.00, -126.00),  // Orca, Pacific Northwest
  orcaNorway:       geo( 69.00,   20.00),  // Orca, Norwegian Sea
  orcaNZ:           geo(-46.00,  168.00),  // Orca, New Zealand
  // Dolphins
  dolphinMed:       geo( 38.00,   15.00),  // Dolphin, Mediterranean
  dolphinCarib:     geo( 18.00,  -68.00),  // Dolphin, Caribbean Sea
  dolphinGulfMex:   geo( 26.00,  -91.00),  // Dolphin, Gulf of Mexico
  dolphinPacific:   geo( 10.00, -130.00),  // Dolphin, E. Pacific
  dolphinIndian:    geo( -5.00,   72.00),  // Dolphin, Indian Ocean
  dolphinAustralia: geo(-22.00,  115.00),  // Dolphin, W. Australia
  // Sperm Whales
  spermAzores:      geo( 38.50,  -28.00),  // Sperm Whale, Azores

  // ─── Land animal positions ────────────────────────────────────────────────
  lionKenya:        geo( -1.40,   35.20),  // Lion, Masai Mara
  elephantBots:     geo(-19.00,   23.50),  // Elephant, Okavango Delta
  polarBearArctic:  geo( 78.00, -104.00),  // Polar Bear, Canadian Arctic
  penguinAntarct:   geo(-72.00,   -8.00),  // Emperor Penguin, Antarctica
  penguinSA:        geo(-34.00,   26.50),  // African Penguin, SA coast
  kangarooAus:      geo(-25.00,  134.00),  // Red Kangaroo, Central Australia
  giraffeSerengeti: geo( -2.80,   34.90),  // Giraffe, Serengeti
  pandaSichuan:     geo( 30.60,  103.60),  // Giant Panda, Sichuan
  komodoDragonL:    geo( -8.54,  119.49),  // Komodo Dragon, Komodo Island
  snowLeopardHim:   geo( 34.00,   77.00),  // Snow Leopard, Himalaya
};"""

if L_ANCHOR in content:
    content = content.replace(L_ANCHOR, L_NEW, 1)
    print('L entries injected OK')
else:
    print('L_ANCHOR not found!')
    print(repr(content[content.find('milfordSound'):content.find('milfordSound')+120]))

with open('app/plan/location/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Step 1 done')
