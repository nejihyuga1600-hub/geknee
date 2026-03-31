with open(r'app\plan\location\page.tsx', 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. New L entries ─────────────────────────────────────────────────────────
new_L = """
  // ── Europe (new) ──
  louvre:              geo( 48.861,   2.336),
  notredame:           geo( 48.853,   2.350),
  versailles:          geo( 48.805,   2.120),
  bigBen:              geo( 51.500,  -0.124),
  towerLondon:         geo( 51.508,  -0.076),
  buckinghamPalace:    geo( 51.501,  -0.141),
  edinburghCastle:     geo( 55.948,  -3.200),
  neuschwanstein:      geo( 47.557,  10.750),
  brandenburgGate:     geo( 52.516,  13.378),
  cologneCathedral:    geo( 50.941,   6.958),
  praguecastle:        geo( 50.091,  14.400),
  budapestParliament:  geo( 47.507,  19.046),
  schoenbrunnPalace:   geo( 48.185,  16.312),
  hallstatt:           geo( 47.562,  13.649),
  amsterdamCanals:     geo( 52.374,   4.890),
  treviFountain:       geo( 41.901,  12.483),
  leaningTower:        geo( 43.723,  10.397),
  florenceDuomo:       geo( 43.773,  11.256),
  veniceGrandCanal:    geo( 45.440,  12.331),
  amalfiCoast:         geo( 40.634,  14.602),
  alhambra:            geo( 37.176,  -3.588),
  dubrovnik:           geo( 42.641,  18.111),
  santorini:           geo( 36.393,  25.461),
  meteora:             geo( 39.721,  21.631),
  cliffsOfMoher:       geo( 52.971,  -9.426),
  giantsCauseway:      geo( 55.240,  -6.512),
  matterhorn:          geo( 45.977,   7.659),
  northernLightsIce:   geo( 64.128, -21.944),
  blueLagoonIce:       geo( 63.880, -22.449),
  lofotenNorway:       geo( 68.130,  13.960),
  // ── Asia (new) ──
  mtFuji:              geo( 35.361, 138.729),
  fushimiInari:        geo( 34.967, 135.772),
  kinkakuji:           geo( 35.040, 135.729),
  sensoji:             geo( 35.715, 139.796),
  hiroshimaPeace:      geo( 34.396, 132.453),
  osakacastle:         geo( 34.687, 135.526),
  forbiddenCity:       geo( 39.917, 116.390),
  terracottaArmy:      geo( 34.384, 109.278),
  zhangjiajie:         geo( 29.117, 110.479),
  victoriaHarbourHK:   geo( 22.283, 114.158),
  marinaBaySands:      geo(  1.284, 103.861),
  petronasTowers:      geo(  3.158, 101.712),
  batuCaves:           geo(  3.237, 101.682),
  tanaLotBali:         geo( -8.621, 115.087),
  burjKhalifa:         geo( 25.197,  55.274),
  sheikhZayedMosque:   geo( 24.413,  54.476),
  westernWall:         geo( 31.778,  35.235),
  hagiaSophia:         geo( 41.008,  28.980),
  cappadocia:          geo( 38.644,  34.828),
  pamukkale:           geo( 37.920,  29.121),
  tigersNestBhutan:    geo( 27.491,  89.362),
  sigiriyaSriLanka:    geo(  7.957,  80.760),
  varanasi:            geo( 25.317,  83.013),
  amberFort:           geo( 26.985,  75.851),
  // ── Africa (new) ──
  kilimanjaro:         geo( -3.065,  37.359),
  serengeti:           geo( -2.333,  34.833),
  zanzibar:            geo( -6.165,  39.202),
  masaiMara:           geo( -1.489,  35.142),
  capeOfGoodHope:      geo(-34.358,  18.474),
  marrakechMedina:     geo( 31.629,  -7.981),
  saharaDunes:         geo( 25.000,   0.000),
  abuSimbel:           geo( 22.337,  31.626),
  karnakTemple:        geo( 25.719,  32.657),
  valleyOfKings:       geo( 25.746,  32.600),
  // ── Americas (new) ──
  yellowstone:         geo( 44.428,-110.588),
  yosemite:            geo( 37.745,-119.598),
  monumentValley:      geo( 36.998,-110.098),
  antelopeCanyon:      geo( 36.862,-111.374),
  bryceCanyon:         geo( 37.593,-112.187),
  horseshoeBend:       geo( 36.880,-111.510),
  grandTeton:          geo( 43.740,-110.803),
  timesSquare:         geo( 40.758, -73.985),
  washingtonMonument:  geo( 38.889, -77.035),
  lincolnMemorial:     geo( 38.889, -77.050),
  hooverDam:           geo( 36.016,-114.737),
  lasVegasStrip:       geo( 36.120,-115.171),
  hollywoodSign:       geo( 34.134,-118.321),
  alcatraz:            geo( 37.827,-122.423),
  teotihuacan:         geo( 19.693, -98.844),
  tulumRuins:          geo( 20.215, -87.429),
  banffNP:             geo( 51.179,-115.570),
  cnTower:             geo( 43.642, -79.387),
  oldQuebecCity:       geo( 46.813, -71.207),
  panamaCanal:         geo(  9.080, -79.680),
  angelFalls:          geo(  5.967, -62.535),
  lakeTiticaca:        geo(-15.840, -69.340),
  salarDeUyuni:        geo(-20.137, -67.489),
  cartagena:           geo( 10.423, -75.535),
  torresDePaine:       geo(-50.942, -73.406),
  easterIsland:        geo(-27.112,-109.349),
  atacamaDesert:       geo(-24.500, -69.250),
  // ── Oceania (new) ──
  sydneyOperaHouse:    geo(-33.857, 151.215),
  sydneyHarbourBridge: geo(-33.852, 151.211),
  uluru:               geo(-25.345, 131.036),
  greatOceanRoad:      geo(-38.660, 143.100),
  hobbiton:            geo(-37.872, 175.682),
  rotuaGeothermal:     geo(-38.137, 176.252),
"""

src = src.replace(
    '  snowLeopardHim:   geo( 34.00,   77.00),  // Snow Leopard, Himalaya\n};',
    '  snowLeopardHim:   geo( 34.00,   77.00),  // Snow Leopard, Himalaya\n' + new_L + '};'
)

# ── 2. New INFO entries ───────────────────────────────────────────────────────
new_INFO = """
  louvre:              { name: "Louvre Museum",             location: "Paris, France",                  fact: "The world's most visited art museum holds 35,000 works on display including the Mona Lisa in a former 12th-century royal palace." },
  notredame:           { name: "Notre-Dame Cathedral",      location: "Paris, France",                  fact: "Construction took nearly 200 years (1163-1345). Its iconic gargoyles were added in the 19th century and actually serve as water spouts." },
  versailles:          { name: "Palace of Versailles",      location: "Versailles, France",             fact: "The Hall of Mirrors has 357 mirrors and 20,000 candles. The palace grounds cover 800 hectares with 50 fountains." },
  bigBen:              { name: "Big Ben",                   location: "London, UK",                     fact: "The bell weighs 13.5 tonnes and the clock faces are 7 metres wide. Its four clock faces use 32 litres of black oil for their hands." },
  towerLondon:         { name: "Tower of London",           location: "London, UK",                     fact: "Home to the Crown Jewels, it has served as palace, prison, and zoo. Its resident ravens are said to protect the Crown." },
  buckinghamPalace:    { name: "Buckingham Palace",         location: "London, UK",                     fact: "Has 775 rooms including 188 staff bedrooms and 78 bathrooms. The palace is the administrative headquarters of the monarch." },
  edinburghCastle:     { name: "Edinburgh Castle",          location: "Edinburgh, Scotland",            fact: "Perched on volcanic rock, it has been a royal residence since the 12th century. The One O'Clock Gun has fired daily since 1861." },
  neuschwanstein:      { name: "Neuschwanstein Castle",     location: "Bavaria, Germany",               fact: "Built for eccentric King Ludwig II as a personal retreat. He lived there only 172 days before his mysterious death. It inspired Disney's Sleeping Beauty Castle." },
  brandenburgGate:     { name: "Brandenburg Gate",          location: "Berlin, Germany",                fact: "Built in 1791 as a symbol of peace, it became a Cold War icon when the Berlin Wall divided it. Napoleon once took the Quadriga chariot to Paris." },
  cologneCathedral:    { name: "Cologne Cathedral",         location: "Cologne, Germany",               fact: "Took 632 years to complete (1248-1880) and was the world's tallest structure for 4 years. It miraculously survived WWII bombing raids around it." },
  praguecastle:        { name: "Prague Castle",             location: "Prague, Czech Republic",         fact: "The largest coherent castle complex in the world at 70,000 sq m, continuously inhabited since the 9th century." },
  budapestParliament:  { name: "Budapest Parliament",       location: "Budapest, Hungary",              fact: "Built 1885-1904 with 691 rooms and 19 km of stairs. Its central dome is exactly the same height as St. Stephen's Basilica - 96 m." },
  schoenbrunnPalace:   { name: "Schoenbrunn Palace",        location: "Vienna, Austria",                fact: "The Habsburg imperial summer residence has 1,441 rooms. Its zoo, founded in 1752, is the world's oldest continuously operating zoo." },
  hallstatt:           { name: "Hallstatt Village",         location: "Salzkammergut, Austria",         fact: "A UNESCO site so beautiful that China built an exact replica of it. The salt mine beneath it is the oldest in the world, operating for 7,000 years." },
  amsterdamCanals:     { name: "Amsterdam Canal Ring",      location: "Amsterdam, Netherlands",         fact: "17th-century canal ring with 165 canals. Amsterdam has more bridges (1,500) than Venice and more bicycles (800,000) than people." },
  treviFountain:       { name: "Trevi Fountain",            location: "Rome, Italy",                    fact: "Collects about 3,000 euros per day from tourist coins, all donated to charity. Throwing a coin supposedly ensures your return to Rome." },
  leaningTower:        { name: "Leaning Tower of Pisa",     location: "Pisa, Italy",                    fact: "Began leaning during construction in 1173 due to soft soil. Engineers corrected it from 5.5 degrees to 3.99 degrees tilt - it leans 3.9 metres off vertical." },
  florenceDuomo:       { name: "Florence Cathedral",        location: "Florence, Italy",                fact: "Brunelleschi's dome (completed 1436) was the world's largest for 500 years. He invented new machinery to build it and kept the blueprints secret." },
  veniceGrandCanal:    { name: "Venice Grand Canal",        location: "Venice, Italy",                  fact: "Built on 118 islands connected by 400+ bridges. The city is slowly sinking 1-2mm per year. No cars - gondolas are the only transport." },
  amalfiCoast:         { name: "Amalfi Coast",              location: "Campania, Italy",                fact: "14 villages clinging to cliffs above the Tyrrhenian Sea. The narrow coastal road SS163 was blasted from sheer rock in the 1850s." },
  alhambra:            { name: "Alhambra",                  location: "Granada, Spain",                 fact: "A Moorish palace-city with intricate geometric tile work and muqarnas ceilings. Washington Irving's 1832 book made it famous to the Western world." },
  dubrovnik:           { name: "Dubrovnik Old Town",        location: "Dubrovnik, Croatia",             fact: "Its 2 km medieval walls were never breached by siege. George R.R. Martin used it as inspiration for King's Landing in Game of Thrones." },
  santorini:           { name: "Santorini",                 location: "Cyclades, Greece",               fact: "The iconic blue-domed churches sit on the rim of a massive volcanic caldera. Some believe the island is the lost city of Atlantis." },
  meteora:             { name: "Meteora Monasteries",       location: "Thessaly, Greece",               fact: "Six monasteries perched atop 400-metre sandstone pillars. Monks climbed by rope and basket until the 1920s when steps were carved into the rock." },
  cliffsOfMoher:       { name: "Cliffs of Moher",           location: "County Clare, Ireland",          fact: "Rise 214 m above the Atlantic Ocean and stretch 14 km along Ireland's west coast. On a clear day you can see the Aran Islands from the top." },
  giantsCauseway:      { name: "Giant's Causeway",          location: "County Antrim, Northern Ireland", fact: "40,000 interlocking basalt columns formed 60 million years ago by volcanic cooling. Legend says giant Finn McCool built it to walk to Scotland." },
  matterhorn:          { name: "Matterhorn",                location: "Zermatt, Switzerland",           fact: "One of the most photographed mountains in the world at 4,478 m. It took 7 attempts before Whymper's team first summited in 1865 - 4 died descending." },
  northernLightsIce:   { name: "Northern Lights",           location: "Reykjavik, Iceland",             fact: "Aurora borealis occurs when charged solar particles hit Earth's atmosphere at 72 million km/h. Iceland sits directly under the auroral oval." },
  blueLagoonIce:       { name: "Blue Lagoon",               location: "Grindavik, Iceland",             fact: "Its milky-blue geothermal waters reach 37-40 degrees Celsius year-round. The same water that creates the lagoon drives a nearby geothermal power plant." },
  lofotenNorway:       { name: "Lofoten Islands",           location: "Nordland, Norway",               fact: "A dramatic archipelago above the Arctic Circle with jagged peaks rising from the sea. Home to the world's largest cod fishery for over 1,000 years." },
  mtFuji:              { name: "Mount Fuji",                location: "Honshu, Japan",                  fact: "Japan's highest peak at 3,776 m has been climbed by over 300,000 people every summer season. It is an active stratovolcano that last erupted in 1707." },
  fushimiInari:        { name: "Fushimi Inari Shrine",      location: "Kyoto, Japan",                   fact: "Famous for thousands of vermilion torii gates winding 4 km up the mountain. There are 32,000 sub-shrines dedicated to Inari, the Shinto god of foxes." },
  kinkakuji:           { name: "Kinkaku-ji Golden Pavilion", location: "Kyoto, Japan",                  fact: "The top two floors are covered in pure gold leaf. A Zen monk burned it down in 1950 out of obsession - the event inspired a famous Mishima novel." },
  sensoji:             { name: "Senso-ji Temple",           location: "Asakusa, Tokyo, Japan",          fact: "Tokyo's oldest temple, founded in 628 AD. The giant red lantern at Kaminarimon Gate weighs 670 kg. It receives 30 million visitors annually." },
  hiroshimaPeace:      { name: "Hiroshima Peace Memorial",  location: "Hiroshima, Japan",               fact: "The Genbaku Dome was one of the few structures left standing near the 1945 atomic bomb hypocenter. It became a UNESCO World Heritage Site in 1996." },
  osakacastle:         { name: "Osaka Castle",              location: "Osaka, Japan",                   fact: "Built in 1583 by Toyotomi Hideyoshi and surrounded by a double moat. The current structure is a 1931 concrete reconstruction housing a museum." },
  forbiddenCity:       { name: "Forbidden City",            location: "Beijing, China",                 fact: "The world's largest palace complex with 980 buildings and 8,886 rooms. For 500 years, ordinary citizens could not enter on pain of death." },
  terracottaArmy:      { name: "Terracotta Army",           location: "Xi'an, China",                   fact: "8,000+ life-size clay soldiers buried with Emperor Qin Shi Huang in 210 BC. Each face is unique - no two soldiers look exactly alike." },
  zhangjiajie:         { name: "Zhangjiajie Pillars",       location: "Hunan, China",                   fact: "The towering sandstone pillars that inspired the floating mountains in Avatar. The 'Avatar Hallelujah Mountain' pillar was officially renamed after the film." },
  victoriaHarbourHK:   { name: "Victoria Harbour",          location: "Hong Kong",                      fact: "One of the world's busiest deepwater ports and most spectacular urban skylines. The nightly Symphony of Lights laser show uses 44 buildings on both shores." },
  marinaBaySands:      { name: "Marina Bay Sands",          location: "Singapore",                      fact: "The world's most expensive standalone casino at 8 billion USD. Its SkyPark observatory stretches 340 m atop three 55-storey towers like a giant surfboard." },
  petronasTowers:      { name: "Petronas Twin Towers",      location: "Kuala Lumpur, Malaysia",         fact: "Were the world's tallest buildings 1998-2004 at 452 m. The two towers are connected by a sky bridge on floors 41-42, 170 m above street level." },
  batuCaves:           { name: "Batu Caves",                location: "Selangor, Malaysia",             fact: "A Hindu temple complex inside 400-million-year-old limestone caves. The 272-step staircase is guarded by a 42.7 m golden statue of Lord Murugan." },
  tanaLotBali:         { name: "Tanah Lot Temple",          location: "Bali, Indonesia",                fact: "A Hindu sea temple perched on a coastal rock, accessible only at low tide. Sea snakes living in the caves are considered holy guardians of the temple." },
  burjKhalifa:         { name: "Burj Khalifa",              location: "Dubai, UAE",                     fact: "The world's tallest building at 828 m has 163 floors. The elevator travels at 10 m/s and the building sways up to 1.5 m in strong winds." },
  sheikhZayedMosque:   { name: "Sheikh Zayed Grand Mosque", location: "Abu Dhabi, UAE",                 fact: "Can accommodate 41,000 worshippers at once. The main prayer hall has the world's largest hand-knotted carpet at 5,627 sq m." },
  westernWall:         { name: "Western Wall",              location: "Jerusalem, Israel",              fact: "The last remaining wall of the Second Temple, destroyed in 70 AD. Jews worldwide face this wall when praying - millions of notes are placed between its stones." },
  hagiaSophia:         { name: "Hagia Sophia",              location: "Istanbul, Turkey",               fact: "Built in 537 AD, its 55.6 m dome was the world's largest for nearly 1,000 years. It has served as a Byzantine cathedral, Ottoman mosque, museum, and mosque again." },
  cappadocia:          { name: "Cappadocia Fairy Chimneys", location: "Nevsehir, Turkey",               fact: "Volcanic eruptions 9 million years ago created these rock formations. Hot air balloon rides over them are considered one of the world's top travel experiences." },
  pamukkale:           { name: "Pamukkale Cotton Castle",   location: "Denizli, Turkey",                fact: "Calcium-rich thermal springs cascade over white terraced pools at 35 degrees Celsius. The ancient Greco-Roman city of Hierapolis sits directly on top." },
  tigersNestBhutan:    { name: "Tiger's Nest Monastery",    location: "Paro Valley, Bhutan",            fact: "Clings to a 3,000 m cliff face with no road access - only a 2-hour hike up. Legend says Guru Rinpoche flew here on a tigress to meditate in the cave." },
  sigiriyaSriLanka:    { name: "Sigiriya Rock Fortress",    location: "Central Province, Sri Lanka",    fact: "A 200 m-high rock fortress with a palace at the top, built around 477 AD. The 5th-century frescoes of the Cloud Maidens on the rock face are still vivid today." },
  varanasi:            { name: "Varanasi Ghats",            location: "Uttar Pradesh, India",           fact: "The world's oldest continuously inhabited city at 3,000+ years. Hindus believe dying here grants liberation. 80 ghats line the sacred Ganges river." },
  amberFort:           { name: "Amber Fort",                location: "Jaipur, India",                  fact: "A stunning hilltop fort built from yellow sandstone and white marble. Its Sheesh Mahal (Hall of Mirrors) is lined with thousands of tiny mirror tiles." },
  kilimanjaro:         { name: "Mount Kilimanjaro",         location: "Tanzania",                       fact: "Africa's highest peak at 5,895 m is a free-standing volcanic massif. Glaciers that took 11,700 years to form have lost 85% of their ice since 1912." },
  serengeti:           { name: "Serengeti National Park",   location: "Tanzania",                       fact: "Home to the largest land migration on Earth - 1.5 million wildebeest, 200,000 zebras, and 350,000 gazelles move in an endless annual cycle." },
  zanzibar:            { name: "Zanzibar Stone Town",       location: "Zanzibar, Tanzania",             fact: "A UNESCO World Heritage trading port fusing Arab, Persian, Indian, and European architecture. Freddie Mercury of Queen was born here in 1946." },
  masaiMara:           { name: "Maasai Mara",               location: "Kenya",                          fact: "Africa's most famous game reserve hosts the Great Migration crossing of the Mara River. The Big Five all live here." },
  capeOfGoodHope:      { name: "Cape of Good Hope",         location: "Western Cape, South Africa",     fact: "Once thought to be Africa's southernmost tip (it's actually Cape Agulhas). Bartolomeu Dias first rounded it in 1488, opening the sea route to India." },
  marrakechMedina:     { name: "Marrakech Medina",          location: "Morocco",                        fact: "A labyrinthine 12th-century walled city with the Djemaa el-Fna square at its heart. Snake charmers and storytellers have gathered there for 1,000 years." },
  saharaDunes:         { name: "Sahara Desert",             location: "North Africa",                   fact: "The world's largest hot desert at 9.2 million sq km - roughly the size of the USA. Sand dunes can reach 180 m high." },
  abuSimbel:           { name: "Abu Simbel Temples",        location: "Aswan, Egypt",                   fact: "Two temples carved directly into a mountainside by Ramesses II around 1264 BC. UNESCO moved the entire complex 65 m up in 1968 to save it from Lake Nasser." },
  karnakTemple:        { name: "Karnak Temple",             location: "Luxor, Egypt",                   fact: "The largest religious building ever constructed, built by 30 different pharaohs over 1,300 years. Its 134 massive columns are still the world's largest." },
  valleyOfKings:       { name: "Valley of the Kings",       location: "Luxor, Egypt",                   fact: "Burial site of pharaohs for 500 years (1539-1075 BC) with 63 known tombs. Tutankhamun's nearly intact tomb was discovered here by Howard Carter in 1922." },
  yellowstone:         { name: "Yellowstone National Park", location: "Wyoming, USA",                   fact: "The world's first national park sits atop a supervolcano. It contains half of Earth's active geysers, including Old Faithful which erupts every 44-125 minutes." },
  yosemite:            { name: "Yosemite Valley",           location: "California, USA",                fact: "El Capitan's sheer granite face rises 914 m - the world's largest monolith. The park's iconic Half Dome was once thought unclimbable." },
  monumentValley:      { name: "Monument Valley",           location: "Arizona/Utah, USA",              fact: "The iconic red sandstone buttes rise up to 300 m from the flat desert floor. The Navajo Nation has managed this sacred landscape for centuries." },
  antelopeCanyon:      { name: "Antelope Canyon",           location: "Arizona, USA",                   fact: "A slot canyon formed by millions of years of water erosion through Navajo sandstone. Light beams at midday create one of photography's most iconic images." },
  bryceCanyon:         { name: "Bryce Canyon",              location: "Utah, USA",                      fact: "Contains the world's largest concentration of hoodoos (odd-shaped pillars). The park sits so high (2,400-2,700 m) that it gets more snow than rain." },
  horseshoeBend:       { name: "Horseshoe Bend",            location: "Arizona, USA",                   fact: "The Colorado River makes a 270-degree bend around a 300 m sandstone promontory. An estimated 2 million visitors photograph the viewpoint each year." },
  grandTeton:          { name: "Grand Teton National Park", location: "Wyoming, USA",                   fact: "The youngest mountains in the Rockies rose just 9 million years ago. The Snake River S-curve with the Teton range is Ansel Adams' most iconic photograph." },
  timesSquare:         { name: "Times Square",              location: "New York City, USA",             fact: "Known as The Crossroads of the World with 330,000+ pedestrians daily. The New Year's Eve ball drop has occurred every year since 1907." },
  washingtonMonument:  { name: "Washington Monument",       location: "Washington D.C., USA",           fact: "An obelisk 169 m tall - the world's tallest stone structure. Its upper third is slightly lighter because construction was paused 23 years during the Civil War." },
  lincolnMemorial:     { name: "Lincoln Memorial",          location: "Washington D.C., USA",           fact: "The seated Lincoln statue is 5.8 m tall. Martin Luther King Jr. delivered his 'I Have a Dream' speech on its steps in 1963." },
  hooverDam:           { name: "Hoover Dam",                location: "Nevada/Arizona, USA",            fact: "Built during the Great Depression (1931-36) and completed 2 years ahead of schedule. It contains enough concrete to build a two-lane highway coast to coast." },
  lasVegasStrip:       { name: "Las Vegas Strip",           location: "Nevada, USA",                    fact: "A 6.7 km stretch of casino-lined road visible from space due to light output. Las Vegas uses more electricity per capita than any other US city." },
  hollywoodSign:       { name: "Hollywood Sign",            location: "Los Angeles, USA",               fact: "Originally read 'HOLLYWOODLAND' in 1923, advertising a real estate development. The letters are 13.7 m tall and visible from 50 km away." },
  alcatraz:            { name: "Alcatraz Island",           location: "San Francisco Bay, USA",         fact: "The maximum-security penitentiary (1934-63) held Al Capone and Machine Gun Kelly. No inmate ever successfully escaped - at least 36 tried." },
  teotihuacan:         { name: "Teotihuacan",               location: "Mexico City, Mexico",            fact: "The Pyramid of the Sun is the third-largest pyramid on Earth. At its peak, Teotihuacan was one of the largest cities in the ancient world with 125,000 inhabitants." },
  tulumRuins:          { name: "Tulum Ruins",               location: "Quintana Roo, Mexico",           fact: "The only major Mayan coastal city, perched on 12 m cliffs above turquoise Caribbean water. It was one of the last cities built and inhabited by the Maya." },
  banffNP:             { name: "Banff National Park",       location: "Alberta, Canada",                fact: "Canada's first national park (1885). Lake Louise's turquoise colour comes from rock flour - glacial silt suspended in the water." },
  cnTower:             { name: "CN Tower",                  location: "Toronto, Canada",                fact: "Stood as the world's tallest free-standing structure 1976-2007 at 553 m. Lightning strikes it about 75 times per year - it acts as a lightning rod for the city." },
  oldQuebecCity:       { name: "Old Quebec City",           location: "Quebec, Canada",                 fact: "The only walled city north of Mexico in North America. The Chateau Frontenac hotel is the world's most photographed hotel." },
  panamaCanal:         { name: "Panama Canal",              location: "Panama",                         fact: "Cut 15,000 km from the voyage between New York and San Francisco. Each ship transit uses 197 million litres of fresh water - all by gravity, no pumps needed." },
  angelFalls:          { name: "Angel Falls",               location: "Bolivar, Venezuela",             fact: "The world's highest uninterrupted waterfall at 979 m - 15 times the height of Niagara. Named after American bush pilot Jimmy Angel who flew over it in 1933." },
  lakeTiticaca:        { name: "Lake Titicaca",             location: "Peru/Bolivia",                   fact: "The world's highest navigable lake at 3,812 m. The Uros people have lived on 40+ floating totora-reed islands here for centuries." },
  salarDeUyuni:        { name: "Salar de Uyuni",            location: "Potosi, Bolivia",                fact: "The world's largest salt flat covers 10,582 sq km and contains 50-70% of the world's lithium reserves. After rain, it creates a perfect mirror reflection of the sky." },
  cartagena:           { name: "Cartagena Old City",        location: "Bolivar, Colombia",              fact: "A UNESCO-listed walled colonial city. Gabriel Garcia Marquez set many stories here. The 13 km of city walls built to repel pirates remain largely intact after 400 years." },
  torresDePaine:       { name: "Torres del Paine",          location: "Patagonia, Chile",               fact: "Three granite towers rising 2,800 m above the Patagonian steppe. The park is so remote it took 3 days by horseback just to reach the base of the towers until the 1970s." },
  easterIsland:        { name: "Easter Island Moai",        location: "Rapa Nui, Chile",                fact: "887 monolithic statues carved 1250-1500 AD. The largest completed moai stands 10 m tall and weighs 82 tonnes - moved without wheels or modern machinery." },
  atacamaDesert:       { name: "Atacama Desert",            location: "Northern Chile",                 fact: "The driest non-polar desert on Earth - some weather stations have never recorded rain. Its high altitude and clear skies make it the world's top astronomy site." },
  sydneyOperaHouse:    { name: "Sydney Opera House",        location: "Sydney, Australia",              fact: "Designed by Danish architect Jorn Utzon, its shell-like roof vaults were revolutionary. Built 1959-73, it hosts 8 million visitors and 1,500+ performances annually." },
  sydneyHarbourBridge: { name: "Sydney Harbour Bridge",     location: "Sydney, Australia",              fact: "The world's largest steel arch bridge at 1,149 m long. 16 workers died during construction. You can climb the arch to the 134 m summit." },
  uluru:               { name: "Uluru (Ayers Rock)",        location: "Northern Territory, Australia",  fact: "A sacred sandstone monolith 348 m high and 9.4 km around. It glows red at sunset due to iron oxide. Climbing was banned in 2019 out of respect for the Anangu people." },
  greatOceanRoad:      { name: "Twelve Apostles",           location: "Victoria, Australia",            fact: "Limestone stacks carved by the Southern Ocean. Originally called The Sow and Piglets, only 8 remain - one collapsed in 2005. The road took 13 years to build." },
  hobbiton:            { name: "Hobbiton Movie Set",        location: "Matamata, New Zealand",          fact: "The real Shire from The Lord of the Rings and The Hobbit films on a working sheep farm. The set was rebuilt in permanent materials for The Hobbit trilogy." },
  rotuaGeothermal:     { name: "Rotorua Geothermal Park",   location: "Bay of Plenty, New Zealand",     fact: "Sits on top of the Taupo Volcanic Zone, one of the most active geothermal regions on Earth. Boiling mud pools and geysers shoot up to 30 m into the sky." },
"""

src = src.replace(
    '  snowLeopardHim:   { name: "Snow Leopard",',
    new_INFO + '  snowLeopardHim:   { name: "Snow Leopard",'
)

# ── 3. New Lm JSX blocks ──────────────────────────────────────────────────────
new_LM = """
      {/* ══ Europe — new ════════════════════════════════════════════════════ */}
      <Lm p={L.louvre} info={INFO.louvre}>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.7,0.08,0.5]}/><meshStandardMaterial color="#d4c9a8" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.18,0.2,4]}/><meshStandardMaterial color="#88aacc" roughness={0.2} metalness={0.4}/></mesh>
      </Lm>
      <Lm p={L.notredame} info={INFO.notredame}>
        <mesh position={[0,0.12,0]}><boxGeometry args={[0.5,0.24,0.2]}/><meshStandardMaterial color="#c8bda0" roughness={0.8}/></mesh>
        <mesh position={[-0.18,0.3,0]}><coneGeometry args={[0.06,0.22,4]}/><meshStandardMaterial color="#b8ad90"/></mesh>
        <mesh position={[0.18,0.3,0]}><coneGeometry args={[0.06,0.22,4]}/><meshStandardMaterial color="#b8ad90"/></mesh>
      </Lm>
      <Lm p={L.versailles} info={INFO.versailles}>
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.8,0.12,0.3]}/><meshStandardMaterial color="#f0e8c0" roughness={0.6}/></mesh>
        <mesh position={[0,0.16,0]}><boxGeometry args={[0.6,0.08,0.28]}/><meshStandardMaterial color="#e8deb0"/></mesh>
        <mesh position={[0,0.24,0]}><coneGeometry args={[0.12,0.14,4]}/><meshStandardMaterial color="#a09060"/></mesh>
      </Lm>
      <Lm p={L.bigBen} info={INFO.bigBen}>
        <mesh position={[0,0.15,0]}><boxGeometry args={[0.14,0.3,0.14]}/><meshStandardMaterial color="#c8c0a0" roughness={0.7}/></mesh>
        <mesh position={[0,0.34,0]}><boxGeometry args={[0.16,0.08,0.16]}/><meshStandardMaterial color="#b8b090"/></mesh>
        <mesh position={[0,0.44,0]}><coneGeometry args={[0.09,0.2,4]}/><meshStandardMaterial color="#909878"/></mesh>
      </Lm>
      <Lm p={L.towerLondon} info={INFO.towerLondon}>
        <mesh position={[0,0.08,0]}><boxGeometry args={[0.4,0.16,0.4]}/><meshStandardMaterial color="#b0a888" roughness={0.8}/></mesh>
        <mesh position={[-0.16,0.2,0.16]}><boxGeometry args={[0.1,0.14,0.1]}/><meshStandardMaterial color="#a09878"/></mesh>
        <mesh position={[0.16,0.2,0.16]}><boxGeometry args={[0.1,0.14,0.1]}/><meshStandardMaterial color="#a09878"/></mesh>
        <mesh position={[-0.16,0.28,0.16]}><coneGeometry args={[0.06,0.1,4]}/><meshStandardMaterial color="#888060"/></mesh>
        <mesh position={[0.16,0.28,0.16]}><coneGeometry args={[0.06,0.1,4]}/><meshStandardMaterial color="#888060"/></mesh>
      </Lm>
      <Lm p={L.buckinghamPalace} info={INFO.buckinghamPalace}>
        <mesh position={[0,0.07,0]}><boxGeometry args={[0.7,0.14,0.25]}/><meshStandardMaterial color="#e8e0c8" roughness={0.6}/></mesh>
        <mesh position={[0,0.18,0]}><boxGeometry args={[0.5,0.06,0.23]}/><meshStandardMaterial color="#d8d0b8"/></mesh>
        <mesh position={[0.3,0.14,0]}><boxGeometry args={[0.08,0.12,0.24]}/><meshStandardMaterial color="#e0d8c0"/></mesh>
        <mesh position={[-0.3,0.14,0]}><boxGeometry args={[0.08,0.12,0.24]}/><meshStandardMaterial color="#e0d8c0"/></mesh>
      </Lm>
      <Lm p={L.edinburghCastle} info={INFO.edinburghCastle}>
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.5,0.12,0.35]}/><meshStandardMaterial color="#888878" roughness={0.9}/></mesh>
        <mesh position={[0,0.18,0]}><boxGeometry args={[0.35,0.12,0.25]}/><meshStandardMaterial color="#808070"/></mesh>
        <mesh position={[0,0.3,0]}><boxGeometry args={[0.22,0.14,0.18]}/><meshStandardMaterial color="#909080"/></mesh>
        <mesh position={[0,0.42,0]}><coneGeometry args={[0.12,0.16,4]}/><meshStandardMaterial color="#707060"/></mesh>
      </Lm>
      <Lm p={L.neuschwanstein} info={INFO.neuschwanstein}>
        <mesh position={[0,0.1,0]}><boxGeometry args={[0.36,0.2,0.22]}/><meshStandardMaterial color="#f0ece0" roughness={0.6}/></mesh>
        <mesh position={[0.14,0.3,0.08]}><cylinderGeometry args={[0.06,0.06,0.2,8]}/><meshStandardMaterial color="#e8e4d8"/></mesh>
        <mesh position={[-0.14,0.3,0.08]}><cylinderGeometry args={[0.06,0.06,0.2,8]}/><meshStandardMaterial color="#e8e4d8"/></mesh>
        <mesh position={[0.14,0.44,0.08]}><coneGeometry args={[0.07,0.18,8]}/><meshStandardMaterial color="#4488aa"/></mesh>
        <mesh position={[-0.14,0.44,0.08]}><coneGeometry args={[0.07,0.18,8]}/><meshStandardMaterial color="#4488aa"/></mesh>
      </Lm>
      <Lm p={L.brandenburgGate} info={INFO.brandenburgGate}>
        <mesh position={[-0.18,0.14,0]}><boxGeometry args={[0.1,0.28,0.12]}/><meshStandardMaterial color="#d4c89a" roughness={0.7}/></mesh>
        <mesh position={[0.18,0.14,0]}><boxGeometry args={[0.1,0.28,0.12]}/><meshStandardMaterial color="#d4c89a"/></mesh>
        <mesh position={[0,0.3,0]}><boxGeometry args={[0.5,0.08,0.12]}/><meshStandardMaterial color="#c8bc90"/></mesh>
        <mesh position={[0,0.38,0]}><boxGeometry args={[0.2,0.06,0.1]}/><meshStandardMaterial color="#c0b488"/></mesh>
      </Lm>
      <Lm p={L.cologneCathedral} info={INFO.cologneCathedral}>
        <mesh position={[0,0.15,0]}><boxGeometry args={[0.3,0.3,0.18]}/><meshStandardMaterial color="#888880" roughness={0.9}/></mesh>
        <mesh position={[-0.1,0.38,0]}><boxGeometry args={[0.1,0.16,0.16]}/><meshStandardMaterial color="#808078"/></mesh>
        <mesh position={[0.1,0.38,0]}><boxGeometry args={[0.1,0.16,0.16]}/><meshStandardMaterial color="#808078"/></mesh>
        <mesh position={[-0.1,0.52,0]}><coneGeometry args={[0.07,0.22,4]}/><meshStandardMaterial color="#707068"/></mesh>
        <mesh position={[0.1,0.52,0]}><coneGeometry args={[0.07,0.22,4]}/><meshStandardMaterial color="#707068"/></mesh>
      </Lm>
      <Lm p={L.praguecastle} info={INFO.praguecastle}>
        <mesh position={[0,0.07,0]}><boxGeometry args={[0.6,0.14,0.3]}/><meshStandardMaterial color="#c8c0a8" roughness={0.8}/></mesh>
        <mesh position={[-0.24,0.2,0]}><boxGeometry args={[0.1,0.12,0.28]}/><meshStandardMaterial color="#c0b8a0"/></mesh>
        <mesh position={[0.24,0.2,0]}><boxGeometry args={[0.1,0.12,0.28]}/><meshStandardMaterial color="#c0b8a0"/></mesh>
        <mesh position={[0,0.22,0]}><coneGeometry args={[0.1,0.18,4]}/><meshStandardMaterial color="#a09880"/></mesh>
      </Lm>
      <Lm p={L.budapestParliament} info={INFO.budapestParliament}>
        <mesh position={[0,0.08,0]}><boxGeometry args={[0.7,0.16,0.22]}/><meshStandardMaterial color="#e8dfc0" roughness={0.6}/></mesh>
        <mesh position={[0,0.22,0]}><cylinderGeometry args={[0.08,0.1,0.18,8]}/><meshStandardMaterial color="#d4c8a0"/></mesh>
        <mesh position={[0,0.36,0]}><sphereGeometry args={[0.09,8,6]}/><meshStandardMaterial color="#c8a820" metalness={0.5}/></mesh>
      </Lm>
      <Lm p={L.schoenbrunnPalace} info={INFO.schoenbrunnPalace}>
        <mesh position={[0,0.07,0]}><boxGeometry args={[0.75,0.14,0.25]}/><meshStandardMaterial color="#f0e080" roughness={0.5}/></mesh>
        <mesh position={[0,0.17,0]}><boxGeometry args={[0.55,0.06,0.23]}/><meshStandardMaterial color="#e8d870"/></mesh>
        <mesh position={[0,0.25,0]}><coneGeometry args={[0.13,0.14,4]}/><meshStandardMaterial color="#c8a830"/></mesh>
      </Lm>
      <Lm p={L.hallstatt} info={INFO.hallstatt}>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.45,0.08,0.25]}/><meshStandardMaterial color="#5588aa" roughness={0.4}/></mesh>
        <mesh position={[-0.12,0.14,0]}><boxGeometry args={[0.1,0.12,0.1]}/><meshStandardMaterial color="#d8c0a0"/></mesh>
        <mesh position={[0.08,0.14,0]}><boxGeometry args={[0.09,0.1,0.09]}/><meshStandardMaterial color="#cc9988"/></mesh>
        <mesh position={[0.18,0.16,0]}><coneGeometry args={[0.06,0.12,4]}/><meshStandardMaterial color="#884422"/></mesh>
      </Lm>
      <Lm p={L.amsterdamCanals} info={INFO.amsterdamCanals}>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.5,0.08,0.15]}/><meshStandardMaterial color="#3366aa" roughness={0.3}/></mesh>
        <mesh position={[-0.14,0.15,0]}><boxGeometry args={[0.1,0.14,0.1]}/><meshStandardMaterial color="#cc6633"/></mesh>
        <mesh position={[0.08,0.13,0]}><boxGeometry args={[0.09,0.1,0.09]}/><meshStandardMaterial color="#994422"/></mesh>
        <mesh position={[-0.14,0.24,0]}><coneGeometry args={[0.055,0.1,4]}/><meshStandardMaterial color="#555544"/></mesh>
      </Lm>
      <Lm p={L.treviFountain} info={INFO.treviFountain}>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.5,0.08,0.35]}/><meshStandardMaterial color="#c8c0a8" roughness={0.7}/></mesh>
        <mesh position={[0,0.16,0]}><boxGeometry args={[0.35,0.16,0.22]}/><meshStandardMaterial color="#d0c8b0"/></mesh>
        <mesh position={[0,0.3,0]}><sphereGeometry args={[0.08,8,6]}/><meshStandardMaterial color="#e0d8c0"/></mesh>
      </Lm>
      <Lm p={L.leaningTower} info={INFO.leaningTower}>
        <mesh position={[0.04,0.2,0]} rotation={[0,0,-0.07]}><cylinderGeometry args={[0.09,0.1,0.4,10]}/><meshStandardMaterial color="#f0ece0" roughness={0.5}/></mesh>
        <mesh position={[0.06,0.42,0]} rotation={[0,0,-0.07]}><cylinderGeometry args={[0.1,0.09,0.06,10]}/><meshStandardMaterial color="#e8e4d8"/></mesh>
        <mesh position={[0.07,0.46,0]} rotation={[0,0,-0.07]}><coneGeometry args={[0.07,0.1,8]}/><meshStandardMaterial color="#d8d4c8"/></mesh>
      </Lm>
      <Lm p={L.florenceDuomo} info={INFO.florenceDuomo}>
        <mesh position={[0,0.08,0]}><boxGeometry args={[0.45,0.16,0.3]}/><meshStandardMaterial color="#f0e8e0" roughness={0.6}/></mesh>
        <mesh position={[0,0.24,0]}><cylinderGeometry args={[0.12,0.15,0.14,8]}/><meshStandardMaterial color="#cc3322" roughness={0.7}/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.12,10,8]}/><meshStandardMaterial color="#cc3322"/></mesh>
        <mesh position={[0,0.51,0]}><sphereGeometry args={[0.03,6,4]}/><meshStandardMaterial color="#d4a020" metalness={0.6}/></mesh>
      </Lm>
      <Lm p={L.veniceGrandCanal} info={INFO.veniceGrandCanal}>
        <mesh position={[0,0.03,0]}><boxGeometry args={[0.5,0.06,0.18]}/><meshStandardMaterial color="#2255aa" roughness={0.2}/></mesh>
        <mesh position={[-0.15,0.12,0]}><boxGeometry args={[0.09,0.12,0.09]}/><meshStandardMaterial color="#cc8844"/></mesh>
        <mesh position={[0.12,0.11,0]}><boxGeometry args={[0.08,0.1,0.08]}/><meshStandardMaterial color="#aa6633"/></mesh>
      </Lm>
      <Lm p={L.amalfiCoast} info={INFO.amalfiCoast}>
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.5,0.12,0.2]}/><meshStandardMaterial color="#3388cc" roughness={0.3}/></mesh>
        <mesh position={[-0.14,0.18,0]}><boxGeometry args={[0.1,0.14,0.1]}/><meshStandardMaterial color="#ffee88"/></mesh>
        <mesh position={[0.1,0.17,0]}><boxGeometry args={[0.09,0.12,0.09]}/><meshStandardMaterial color="#ff8844"/></mesh>
      </Lm>
      <Lm p={L.alhambra} info={INFO.alhambra}>
        <mesh position={[0,0.07,0]}><boxGeometry args={[0.55,0.14,0.32]}/><meshStandardMaterial color="#d4a860" roughness={0.7}/></mesh>
        <mesh position={[-0.2,0.2,0.12]}><cylinderGeometry args={[0.055,0.06,0.16,8]}/><meshStandardMaterial color="#c89850"/></mesh>
        <mesh position={[0.2,0.2,0.12]}><cylinderGeometry args={[0.055,0.06,0.16,8]}/><meshStandardMaterial color="#c89850"/></mesh>
        <mesh position={[-0.2,0.3,0.12]}><coneGeometry args={[0.065,0.1,8]}/><meshStandardMaterial color="#a87830"/></mesh>
        <mesh position={[0.2,0.3,0.12]}><coneGeometry args={[0.065,0.1,8]}/><meshStandardMaterial color="#a87830"/></mesh>
      </Lm>
      <Lm p={L.dubrovnik} info={INFO.dubrovnik}>
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.55,0.12,0.3]}/><meshStandardMaterial color="#d0b888" roughness={0.8}/></mesh>
        <mesh position={[-0.24,0.14,0]}><boxGeometry args={[0.08,0.1,0.28]}/><meshStandardMaterial color="#c8b080"/></mesh>
        <mesh position={[0.24,0.14,0]}><boxGeometry args={[0.08,0.1,0.28]}/><meshStandardMaterial color="#c8b080"/></mesh>
        <mesh position={[0,0.2,0]}><boxGeometry args={[0.3,0.08,0.14]}/><meshStandardMaterial color="#cc4422"/></mesh>
      </Lm>
      <Lm p={L.santorini} info={INFO.santorini}>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.4,0.08,0.25]}/><meshStandardMaterial color="#f0f0e8" roughness={0.4}/></mesh>
        <mesh position={[-0.1,0.12,0]}><sphereGeometry args={[0.07,8,6]}/><meshStandardMaterial color="#2266cc"/></mesh>
        <mesh position={[0.1,0.1,0]}><sphereGeometry args={[0.06,8,6]}/><meshStandardMaterial color="#2266cc"/></mesh>
        <mesh position={[0,0.11,0.08]}><sphereGeometry args={[0.055,8,6]}/><meshStandardMaterial color="#2266cc"/></mesh>
      </Lm>
      <Lm p={L.meteora} info={INFO.meteora}>
        <mesh position={[0,0.12,0]}><cylinderGeometry args={[0.06,0.1,0.24,6]}/><meshStandardMaterial color="#b09878" roughness={0.9}/></mesh>
        <mesh position={[0,0.27,0]}><boxGeometry args={[0.16,0.08,0.12]}/><meshStandardMaterial color="#d4c0a0"/></mesh>
        <mesh position={[0,0.34,0]}><coneGeometry args={[0.09,0.1,4]}/><meshStandardMaterial color="#a08860"/></mesh>
      </Lm>
      <Lm p={L.cliffsOfMoher} info={INFO.cliffsOfMoher}>
        <mesh position={[0,0.1,0]}><boxGeometry args={[0.6,0.2,0.12]}/><meshStandardMaterial color="#5a6a40" roughness={0.9}/></mesh>
        <mesh position={[0,0.04,0.1]}><boxGeometry args={[0.6,0.08,0.1]}/><meshStandardMaterial color="#2244aa" roughness={0.2}/></mesh>
      </Lm>
      <Lm p={L.giantsCauseway} info={INFO.giantsCauseway}>
        <mesh position={[-0.1,0.04,0]}><cylinderGeometry args={[0.06,0.06,0.08,6]}/><meshStandardMaterial color="#444454" roughness={0.8}/></mesh>
        <mesh position={[0.06,0.06,0]}><cylinderGeometry args={[0.06,0.06,0.12,6]}/><meshStandardMaterial color="#3a3a4a"/></mesh>
        <mesh position={[0.18,0.03,0]}><cylinderGeometry args={[0.06,0.06,0.06,6]}/><meshStandardMaterial color="#484858"/></mesh>
        <mesh position={[-0.04,0.06,-0.1]}><cylinderGeometry args={[0.06,0.06,0.12,6]}/><meshStandardMaterial color="#404050"/></mesh>
      </Lm>
      <Lm p={L.matterhorn} info={INFO.matterhorn}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.14,0.36,4]}/><meshStandardMaterial color="#888898" roughness={0.8}/></mesh>
        <mesh position={[0,0.38,0]}><coneGeometry args={[0.06,0.18,4]}/><meshStandardMaterial color="#ddd8e8" roughness={0.5}/></mesh>
      </Lm>
      <Lm p={L.northernLightsIce} info={INFO.northernLightsIce}>
        <mesh position={[0,0.08,0]}><boxGeometry args={[0.5,0.16,0.04]}/><meshStandardMaterial color="#44ffaa" roughness={0.1} metalness={0.2} emissive="#22cc88" emissiveIntensity={0.4}/></mesh>
        <mesh position={[0,0.18,0]}><boxGeometry args={[0.4,0.08,0.04]}/><meshStandardMaterial color="#88aaff" roughness={0.1} emissive="#4466cc" emissiveIntensity={0.3}/></mesh>
      </Lm>
      <Lm p={L.blueLagoonIce} info={INFO.blueLagoonIce}>
        <mesh position={[0,0.02,0]}><cylinderGeometry args={[0.2,0.22,0.04,12]}/><meshStandardMaterial color="#66ccdd" roughness={0.1} metalness={0.3}/></mesh>
        <mesh position={[0,0.04,0]}><cylinderGeometry args={[0.22,0.22,0.02,12]}/><meshStandardMaterial color="#44aacc" roughness={0.05}/></mesh>
      </Lm>
      <Lm p={L.lofotenNorway} info={INFO.lofotenNorway}>
        <mesh position={[0,0.15,0]}><coneGeometry args={[0.1,0.3,5]}/><meshStandardMaterial color="#667788" roughness={0.8}/></mesh>
        <mesh position={[0.18,0.08,0]}><coneGeometry args={[0.07,0.16,5]}/><meshStandardMaterial color="#556677"/></mesh>
        <mesh position={[0,0.02,0]}><boxGeometry args={[0.4,0.04,0.2]}/><meshStandardMaterial color="#2255aa" roughness={0.2}/></mesh>
      </Lm>

      {/* ══ Asia — new ═══════════════════════════════════════════════════════ */}
      <Lm p={L.mtFuji} info={INFO.mtFuji}>
        <mesh position={[0,0.16,0]}><coneGeometry args={[0.28,0.32,12]}/><meshStandardMaterial color="#6677aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.35,0]}><coneGeometry args={[0.1,0.16,8]}/><meshStandardMaterial color="#eeeeff" roughness={0.3}/></mesh>
      </Lm>
      <Lm p={L.fushimiInari} info={INFO.fushimiInari}>
        <mesh position={[-0.1,0.12,0]}><boxGeometry args={[0.06,0.24,0.06]}/><meshStandardMaterial color="#cc3311"/></mesh>
        <mesh position={[0.1,0.12,0]}><boxGeometry args={[0.06,0.24,0.06]}/><meshStandardMaterial color="#cc3311"/></mesh>
        <mesh position={[0,0.26,0]}><boxGeometry args={[0.3,0.04,0.1]}/><meshStandardMaterial color="#cc3311"/></mesh>
        <mesh position={[0,0.22,0]}><boxGeometry args={[0.28,0.03,0.09]}/><meshStandardMaterial color="#cc3311"/></mesh>
      </Lm>
      <Lm p={L.kinkakuji} info={INFO.kinkakuji}>
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.32,0.12,0.24]}/><meshStandardMaterial color="#c8a820" metalness={0.6}/></mesh>
        <mesh position={[0,0.18,0]}><boxGeometry args={[0.28,0.1,0.2]}/><meshStandardMaterial color="#d4b428" metalness={0.7}/></mesh>
        <mesh position={[0,0.3,0]}><coneGeometry args={[0.16,0.16,4]}/><meshStandardMaterial color="#c8a020" metalness={0.6}/></mesh>
      </Lm>
      <Lm p={L.sensoji} info={INFO.sensoji}>
        <mesh position={[0,0.07,0]}><boxGeometry args={[0.4,0.14,0.25]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[0,0.2,0]}><boxGeometry args={[0.44,0.04,0.28]}/><meshStandardMaterial color="#884422"/></mesh>
        <mesh position={[0,0.28,0]}><coneGeometry args={[0.22,0.14,4]}/><meshStandardMaterial color="#884422"/></mesh>
      </Lm>
      <Lm p={L.hiroshimaPeace} info={INFO.hiroshimaPeace}>
        <mesh position={[0,0.1,0]}><cylinderGeometry args={[0.12,0.14,0.2,8]}/><meshStandardMaterial color="#a09888" roughness={0.9}/></mesh>
        <mesh position={[0,0.24,0]}><sphereGeometry args={[0.1,10,8]}/><meshStandardMaterial color="#b0a898"/></mesh>
        <mesh position={[0,0.14,0]}><boxGeometry args={[0.3,0.04,0.3]}/><meshStandardMaterial color="#c0b8a8"/></mesh>
      </Lm>
      <Lm p={L.osakacastle} info={INFO.osakacastle}>
        <mesh position={[0,0.07,0]}><boxGeometry args={[0.4,0.14,0.35]}/><meshStandardMaterial color="#f0f0e8" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]}><boxGeometry args={[0.34,0.1,0.3]}/><meshStandardMaterial color="#e8e8e0"/></mesh>
        <mesh position={[0,0.3,0]}><boxGeometry args={[0.28,0.1,0.24]}/><meshStandardMaterial color="#e0e0d8"/></mesh>
        <mesh position={[0,0.4,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#336644"/></mesh>
      </Lm>
      <Lm p={L.forbiddenCity} info={INFO.forbiddenCity}>
        <mesh position={[0,0.05,0]}><boxGeometry args={[0.7,0.1,0.45]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[0,0.14,0]}><boxGeometry args={[0.65,0.08,0.4]}/><meshStandardMaterial color="#c84020"/></mesh>
        <mesh position={[0,0.22,0]}><coneGeometry args={[0.36,0.16,4]}/><meshStandardMaterial color="#886622"/></mesh>
        <mesh position={[0,0.3,0]}><coneGeometry args={[0.2,0.12,4]}/><meshStandardMaterial color="#cc9900"/></mesh>
      </Lm>
      <Lm p={L.terracottaArmy} info={INFO.terracottaArmy}>
        <mesh position={[-0.14,0.08,0]}><boxGeometry args={[0.06,0.16,0.06]}/><meshStandardMaterial color="#c8a878" roughness={0.8}/></mesh>
        <mesh position={[0,0.08,0]}><boxGeometry args={[0.06,0.16,0.06]}/><meshStandardMaterial color="#c0a070"/></mesh>
        <mesh position={[0.14,0.08,0]}><boxGeometry args={[0.06,0.16,0.06]}/><meshStandardMaterial color="#c8a878"/></mesh>
        <mesh position={[-0.14,0.18,0]}><sphereGeometry args={[0.04,8,6]}/><meshStandardMaterial color="#c8a878"/></mesh>
        <mesh position={[0,0.18,0]}><sphereGeometry args={[0.04,8,6]}/><meshStandardMaterial color="#c0a070"/></mesh>
        <mesh position={[0.14,0.18,0]}><sphereGeometry args={[0.04,8,6]}/><meshStandardMaterial color="#c8a878"/></mesh>
      </Lm>
      <Lm p={L.zhangjiajie} info={INFO.zhangjiajie}>
        <mesh position={[-0.14,0.2,0]}><cylinderGeometry args={[0.05,0.07,0.4,6]}/><meshStandardMaterial color="#558844" roughness={0.9}/></mesh>
        <mesh position={[0.06,0.16,0]}><cylinderGeometry args={[0.04,0.06,0.32,6]}/><meshStandardMaterial color="#4a7838"/></mesh>
        <mesh position={[0.2,0.24,0]}><cylinderGeometry args={[0.05,0.07,0.48,6]}/><meshStandardMaterial color="#558844"/></mesh>
        <mesh position={[-0.14,0.42,0]}><sphereGeometry args={[0.06,8,6]}/><meshStandardMaterial color="#3a6830"/></mesh>
        <mesh position={[0.2,0.5,0]}><sphereGeometry args={[0.06,8,6]}/><meshStandardMaterial color="#3a6830"/></mesh>
      </Lm>
      <Lm p={L.victoriaHarbourHK} info={INFO.victoriaHarbourHK}>
        <mesh position={[0,0.14,0]}><boxGeometry args={[0.12,0.28,0.12]}/><meshStandardMaterial color="#445566" roughness={0.6}/></mesh>
        <mesh position={[0.18,0.1,0]}><boxGeometry args={[0.1,0.2,0.1]}/><meshStandardMaterial color="#556677"/></mesh>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.5,0.08,0.25]}/><meshStandardMaterial color="#2244aa" roughness={0.2}/></mesh>
      </Lm>
      <Lm p={L.marinaBaySands} info={INFO.marinaBaySands}>
        <mesh position={[-0.12,0.2,0]}><boxGeometry args={[0.08,0.4,0.1]}/><meshStandardMaterial color="#c8d4d8" roughness={0.4}/></mesh>
        <mesh position={[0,0.2,0]}><boxGeometry args={[0.08,0.4,0.1]}/><meshStandardMaterial color="#c8d4d8"/></mesh>
        <mesh position={[0.12,0.2,0]}><boxGeometry args={[0.08,0.4,0.1]}/><meshStandardMaterial color="#c8d4d8"/></mesh>
        <mesh position={[0,0.44,0]}><boxGeometry args={[0.38,0.06,0.12]}/><meshStandardMaterial color="#a8b8c0" roughness={0.3}/></mesh>
      </Lm>
      <Lm p={L.petronasTowers} info={INFO.petronasTowers}>
        <mesh position={[-0.1,0.22,0]}><cylinderGeometry args={[0.06,0.08,0.44,8]}/><meshStandardMaterial color="#c8d0cc" roughness={0.3} metalness={0.4}/></mesh>
        <mesh position={[0.1,0.22,0]}><cylinderGeometry args={[0.06,0.08,0.44,8]}/><meshStandardMaterial color="#c8d0cc" roughness={0.3} metalness={0.4}/></mesh>
        <mesh position={[0,0.26,0]}><boxGeometry args={[0.12,0.04,0.06]}/><meshStandardMaterial color="#a8b0ac"/></mesh>
        <mesh position={[-0.1,0.46,0]}><coneGeometry args={[0.04,0.1,6]}/><meshStandardMaterial color="#a0a8a4"/></mesh>
        <mesh position={[0.1,0.46,0]}><coneGeometry args={[0.04,0.1,6]}/><meshStandardMaterial color="#a0a8a4"/></mesh>
      </Lm>
      <Lm p={L.batuCaves} info={INFO.batuCaves}>
        <mesh position={[0,0.18,0]}><cylinderGeometry args={[0.1,0.14,0.36,6]}/><meshStandardMaterial color="#c0b088" roughness={0.9}/></mesh>
        <mesh position={[0,0.1,0.12]}><boxGeometry args={[0.08,0.06,0.06]}/><meshStandardMaterial color="#cc8800"/></mesh>
        <mesh position={[0,0.28,0.06]}><sphereGeometry args={[0.06,8,6]}/><meshStandardMaterial color="#d4a020" metalness={0.3}/></mesh>
      </Lm>
      <Lm p={L.tanaLotBali} info={INFO.tanaLotBali}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.12,0.16,0.12,8]}/><meshStandardMaterial color="#888878" roughness={0.9}/></mesh>
        <mesh position={[0,0.16,0]}><boxGeometry args={[0.22,0.1,0.18]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[0,0.24,0]}><coneGeometry args={[0.12,0.14,4]}/><meshStandardMaterial color="#884422"/></mesh>
      </Lm>
      <Lm p={L.burjKhalifa} info={INFO.burjKhalifa}>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.1,0.56,8]}/><meshStandardMaterial color="#aabbcc" roughness={0.2} metalness={0.5}/></mesh>
        <mesh position={[0,0.6,0]}><cylinderGeometry args={[0.02,0.04,0.12,6]}/><meshStandardMaterial color="#99aacc"/></mesh>
        <mesh position={[0,0.68,0]}><coneGeometry args={[0.015,0.1,6]}/><meshStandardMaterial color="#88aacc"/></mesh>
      </Lm>
      <Lm p={L.sheikhZayedMosque} info={INFO.sheikhZayedMosque}>
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.6,0.12,0.4]}/><meshStandardMaterial color="#f8f4ec" roughness={0.4}/></mesh>
        <mesh position={[0,0.2,0]}><sphereGeometry args={[0.12,10,8]}/><meshStandardMaterial color="#f0ece4"/></mesh>
        <mesh position={[-0.22,0.22,0.16]}><cylinderGeometry args={[0.03,0.04,0.26,8]}/><meshStandardMaterial color="#f8f4ec"/></mesh>
        <mesh position={[0.22,0.22,0.16]}><cylinderGeometry args={[0.03,0.04,0.26,8]}/><meshStandardMaterial color="#f8f4ec"/></mesh>
        <mesh position={[-0.22,0.37,0.16]}><coneGeometry args={[0.04,0.08,8]}/><meshStandardMaterial color="#f0ece4"/></mesh>
        <mesh position={[0.22,0.37,0.16]}><coneGeometry args={[0.04,0.08,8]}/><meshStandardMaterial color="#f0ece4"/></mesh>
      </Lm>
      <Lm p={L.westernWall} info={INFO.westernWall}>
        <mesh position={[0,0.1,0]}><boxGeometry args={[0.5,0.2,0.1]}/><meshStandardMaterial color="#d4c8a0" roughness={0.9}/></mesh>
        <mesh position={[0,0.22,0]}><boxGeometry args={[0.5,0.04,0.1]}/><meshStandardMaterial color="#c8bc98"/></mesh>
        <mesh position={[0,0.28,0]}><boxGeometry args={[0.5,0.04,0.1]}/><meshStandardMaterial color="#d0c4a2"/></mesh>
      </Lm>
      <Lm p={L.hagiaSophia} info={INFO.hagiaSophia}>
        <mesh position={[0,0.08,0]}><boxGeometry args={[0.44,0.16,0.38]}/><meshStandardMaterial color="#d8c8a0" roughness={0.7}/></mesh>
        <mesh position={[0,0.24,0]}><sphereGeometry args={[0.14,10,8]}/><meshStandardMaterial color="#c8b890"/></mesh>
        <mesh position={[-0.2,0.22,0.16]}><cylinderGeometry args={[0.035,0.04,0.22,8]}/><meshStandardMaterial color="#c0aa80"/></mesh>
        <mesh position={[0.2,0.22,0.16]}><cylinderGeometry args={[0.035,0.04,0.22,8]}/><meshStandardMaterial color="#c0aa80"/></mesh>
        <mesh position={[-0.2,0.35,0.16]}><coneGeometry args={[0.045,0.1,6]}/><meshStandardMaterial color="#b89a70"/></mesh>
        <mesh position={[0.2,0.35,0.16]}><coneGeometry args={[0.045,0.1,6]}/><meshStandardMaterial color="#b89a70"/></mesh>
      </Lm>
      <Lm p={L.cappadocia} info={INFO.cappadocia}>
        <mesh position={[-0.12,0.14,0]}><cylinderGeometry args={[0.05,0.08,0.28,6]}/><meshStandardMaterial color="#d4a870" roughness={0.8}/></mesh>
        <mesh position={[0.06,0.12,0]}><cylinderGeometry args={[0.04,0.07,0.24,6]}/><meshStandardMaterial color="#c89860"/></mesh>
        <mesh position={[0.2,0.16,0]}><cylinderGeometry args={[0.05,0.08,0.32,6]}/><meshStandardMaterial color="#d4a870"/></mesh>
        <mesh position={[0.06,0.06,0]}><boxGeometry args={[0.45,0.08,0.2]}/><meshStandardMaterial color="#e8d4a0" roughness={0.6}/></mesh>
      </Lm>
      <Lm p={L.pamukkale} info={INFO.pamukkale}>
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.5,0.12,0.3]}/><meshStandardMaterial color="#f0eeea" roughness={0.3}/></mesh>
        <mesh position={[0,0.12,0.12]}><boxGeometry args={[0.4,0.02,0.1]}/><meshStandardMaterial color="#88ccdd" roughness={0.1}/></mesh>
        <mesh position={[0,0.16,0.1]}><boxGeometry args={[0.35,0.02,0.08]}/><meshStandardMaterial color="#88ccdd"/></mesh>
      </Lm>
      <Lm p={L.tigersNestBhutan} info={INFO.tigersNestBhutan}>
        <mesh position={[0,0.1,0]}><boxGeometry args={[0.22,0.2,0.15]}/><meshStandardMaterial color="#f0e8d0" roughness={0.6}/></mesh>
        <mesh position={[0,0.24,0]}><coneGeometry args={[0.12,0.14,4]}/><meshStandardMaterial color="#884422"/></mesh>
        <mesh position={[0,0.06,-0.12]}><boxGeometry args={[0.08,0.14,0.06]}/><meshStandardMaterial color="#888878" roughness={0.9}/></mesh>
      </Lm>
      <Lm p={L.sigiriyaSriLanka} info={INFO.sigiriyaSriLanka}>
        <mesh position={[0,0.18,0]}><cylinderGeometry args={[0.1,0.16,0.36,8]}/><meshStandardMaterial color="#c09060" roughness={0.8}/></mesh>
        <mesh position={[0,0.4,0]}><boxGeometry args={[0.24,0.1,0.2]}/><meshStandardMaterial color="#c8a870"/></mesh>
        <mesh position={[0,0.48,0]}><coneGeometry args={[0.13,0.14,4]}/><meshStandardMaterial color="#a87840"/></mesh>
      </Lm>
      <Lm p={L.varanasi} info={INFO.varanasi}>
        <mesh position={[0,0.03,0]}><boxGeometry args={[0.5,0.06,0.15]}/><meshStandardMaterial color="#cc8844" roughness={0.3}/></mesh>
        <mesh position={[-0.16,0.14,0]}><cylinderGeometry args={[0.04,0.05,0.18,8]}/><meshStandardMaterial color="#f0c060"/></mesh>
        <mesh position={[0.1,0.14,0]}><cylinderGeometry args={[0.04,0.05,0.18,8]}/><meshStandardMaterial color="#f0c060"/></mesh>
        <mesh position={[-0.16,0.25,0]}><sphereGeometry args={[0.05,8,6]}/><meshStandardMaterial color="#d4a020" metalness={0.4}/></mesh>
        <mesh position={[0.1,0.25,0]}><sphereGeometry args={[0.05,8,6]}/><meshStandardMaterial color="#d4a020" metalness={0.4}/></mesh>
      </Lm>
      <Lm p={L.amberFort} info={INFO.amberFort}>
        <mesh position={[0,0.07,0]}><boxGeometry args={[0.5,0.14,0.35]}/><meshStandardMaterial color="#e8cc88" roughness={0.7}/></mesh>
        <mesh position={[-0.22,0.2,0.14]}><cylinderGeometry args={[0.055,0.06,0.16,8]}/><meshStandardMaterial color="#e0c480"/></mesh>
        <mesh position={[0.22,0.2,0.14]}><cylinderGeometry args={[0.055,0.06,0.16,8]}/><meshStandardMaterial color="#e0c480"/></mesh>
        <mesh position={[-0.22,0.3,0.14]}><coneGeometry args={[0.065,0.1,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0.22,0.3,0.14]}><coneGeometry args={[0.065,0.1,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>

      {/* ══ Africa — new ═════════════════════════════════════════════════════ */}
      <Lm p={L.kilimanjaro} info={INFO.kilimanjaro}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.28,0.36,10]}/><meshStandardMaterial color="#8899aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.4,0]}><coneGeometry args={[0.1,0.2,8]}/><meshStandardMaterial color="#eeeeff" roughness={0.4}/></mesh>
      </Lm>
      <Lm p={L.serengeti} info={INFO.serengeti}>
        <mesh position={[0,0.03,0]}><boxGeometry args={[0.55,0.06,0.4]}/><meshStandardMaterial color="#c8a840" roughness={0.9}/></mesh>
        <mesh position={[-0.15,0.1,0]}><coneGeometry args={[0.05,0.1,6]}/><meshStandardMaterial color="#556633"/></mesh>
        <mesh position={[0.1,0.1,0.1]}><coneGeometry args={[0.04,0.08,6]}/><meshStandardMaterial color="#556633"/></mesh>
      </Lm>
      <Lm p={L.zanzibar} info={INFO.zanzibar}>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.4,0.08,0.25]}/><meshStandardMaterial color="#e8d8a0" roughness={0.7}/></mesh>
        <mesh position={[0,0.12,0]}><boxGeometry args={[0.3,0.1,0.2]}/><meshStandardMaterial color="#cc8844"/></mesh>
        <mesh position={[0,0.2,0]}><coneGeometry args={[0.1,0.1,4]}/><meshStandardMaterial color="#aa6633"/></mesh>
      </Lm>
      <Lm p={L.masaiMara} info={INFO.masaiMara}>
        <mesh position={[0,0.03,0]}><boxGeometry args={[0.5,0.06,0.38]}/><meshStandardMaterial color="#c8a030" roughness={0.9}/></mesh>
        <mesh position={[0.14,0.1,0]}><sphereGeometry args={[0.06,8,6]}/><meshStandardMaterial color="#cc8811"/></mesh>
        <mesh position={[-0.12,0.08,0.1]}><sphereGeometry args={[0.05,8,6]}/><meshStandardMaterial color="#aa7710"/></mesh>
      </Lm>
      <Lm p={L.capeOfGoodHope} info={INFO.capeOfGoodHope}>
        <mesh position={[0,0.1,0]}><boxGeometry args={[0.4,0.2,0.12]}/><meshStandardMaterial color="#558844" roughness={0.8}/></mesh>
        <mesh position={[0,0.03,0.1]}><boxGeometry args={[0.4,0.06,0.1]}/><meshStandardMaterial color="#2266aa" roughness={0.2}/></mesh>
        <mesh position={[0,0.24,0]}><cylinderGeometry args={[0.02,0.02,0.12,6]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
      </Lm>
      <Lm p={L.marrakechMedina} info={INFO.marrakechMedina}>
        <mesh position={[0,0.07,0]}><boxGeometry args={[0.45,0.14,0.35]}/><meshStandardMaterial color="#cc5533" roughness={0.7}/></mesh>
        <mesh position={[0,0.2,0]}><boxGeometry args={[0.3,0.08,0.28]}/><meshStandardMaterial color="#c04422"/></mesh>
        <mesh position={[0,0.28,0]}><sphereGeometry args={[0.1,8,6]}/><meshStandardMaterial color="#c84422"/></mesh>
        <mesh position={[0,0.38,0]}><coneGeometry args={[0.04,0.1,6]}/><meshStandardMaterial color="#d4a020" metalness={0.4}/></mesh>
      </Lm>
      <Lm p={L.saharaDunes} info={INFO.saharaDunes}>
        <mesh position={[0,0.08,0]}><coneGeometry args={[0.22,0.16,12]}/><meshStandardMaterial color="#e8c870" roughness={0.9}/></mesh>
        <mesh position={[0.16,0.06,0.1]}><coneGeometry args={[0.14,0.12,10]}/><meshStandardMaterial color="#e0c060"/></mesh>
      </Lm>
      <Lm p={L.abuSimbel} info={INFO.abuSimbel}>
        <mesh position={[0,0.08,0]}><boxGeometry args={[0.5,0.16,0.12]}/><meshStandardMaterial color="#d4aa60" roughness={0.8}/></mesh>
        <mesh position={[-0.16,0.18,0.06]}><boxGeometry args={[0.1,0.2,0.06]}/><meshStandardMaterial color="#c8a050"/></mesh>
        <mesh position={[0,0.18,0.06]}><boxGeometry args={[0.1,0.2,0.06]}/><meshStandardMaterial color="#c8a050"/></mesh>
        <mesh position={[0.16,0.18,0.06]}><boxGeometry args={[0.1,0.2,0.06]}/><meshStandardMaterial color="#c8a050"/></mesh>
      </Lm>
      <Lm p={L.karnakTemple} info={INFO.karnakTemple}>
        <mesh position={[0,0.1,0]}><boxGeometry args={[0.55,0.2,0.38]}/><meshStandardMaterial color="#d4b068" roughness={0.8}/></mesh>
        {[-0.2,-0.07,0.06,0.19].map((x,i)=>(
          <mesh key={i} position={[x,0.22,0.14]}><cylinderGeometry args={[0.04,0.05,0.2,8]}/><meshStandardMaterial color="#c4a058"/></mesh>
        ))}
      </Lm>
      <Lm p={L.valleyOfKings} info={INFO.valleyOfKings}>
        <mesh position={[0,0.1,0]}><coneGeometry args={[0.3,0.2,4]}/><meshStandardMaterial color="#c8a060" roughness={0.9}/></mesh>
        <mesh position={[-0.16,0.04,0.1]}><boxGeometry args={[0.08,0.06,0.04]}/><meshStandardMaterial color="#a88040"/></mesh>
        <mesh position={[0.12,0.04,0.1]}><boxGeometry args={[0.07,0.06,0.04]}/><meshStandardMaterial color="#a88040"/></mesh>
      </Lm>

      {/* ══ Americas — new ═══════════════════════════════════════════════════ */}
      <Lm p={L.yellowstone} info={INFO.yellowstone}>
        <mesh position={[0,0.03,0]}><boxGeometry args={[0.4,0.06,0.3]}/><meshStandardMaterial color="#6a8858" roughness={0.8}/></mesh>
        <mesh position={[0,0.16,0]}><cylinderGeometry args={[0.04,0.06,0.2,8]}/><meshStandardMaterial color="#88aacc" roughness={0.2}/></mesh>
        <mesh position={[0,0.3,0]}><sphereGeometry args={[0.05,8,6]}/><meshStandardMaterial color="#ccddee"/></mesh>
      </Lm>
      <Lm p={L.yosemite} info={INFO.yosemite}>
        <mesh position={[0,0.2,0]}><boxGeometry args={[0.16,0.4,0.2]}/><meshStandardMaterial color="#888898" roughness={0.7}/></mesh>
        <mesh position={[0.22,0.1,0]}><coneGeometry args={[0.14,0.2,8]}/><meshStandardMaterial color="#7a9060" roughness={0.8}/></mesh>
      </Lm>
      <Lm p={L.monumentValley} info={INFO.monumentValley}>
        <mesh position={[-0.16,0.14,0]}><cylinderGeometry args={[0.06,0.1,0.28,6]}/><meshStandardMaterial color="#cc6633" roughness={0.9}/></mesh>
        <mesh position={[0.12,0.18,0]}><cylinderGeometry args={[0.07,0.11,0.36,6]}/><meshStandardMaterial color="#c85a2a"/></mesh>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.5,0.08,0.3]}/><meshStandardMaterial color="#d4784a" roughness={0.9}/></mesh>
      </Lm>
      <Lm p={L.antelopeCanyon} info={INFO.antelopeCanyon}>
        <mesh position={[0,0.12,0]}><boxGeometry args={[0.1,0.24,0.3]}/><meshStandardMaterial color="#cc6633" roughness={0.8}/></mesh>
        <mesh position={[0.08,0.16,0]}><boxGeometry args={[0.08,0.2,0.28]}/><meshStandardMaterial color="#dd8844"/></mesh>
        <mesh position={[-0.08,0.18,0]}><boxGeometry args={[0.06,0.16,0.26]}/><meshStandardMaterial color="#ee9966"/></mesh>
      </Lm>
      <Lm p={L.bryceCanyon} info={INFO.bryceCanyon}>
        <mesh position={[-0.1,0.12,0]}><cylinderGeometry args={[0.04,0.07,0.24,5]}/><meshStandardMaterial color="#dd8855" roughness={0.8}/></mesh>
        <mesh position={[0.06,0.16,0]}><cylinderGeometry args={[0.04,0.06,0.32,5]}/><meshStandardMaterial color="#cc7744"/></mesh>
        <mesh position={[0.18,0.1,0]}><cylinderGeometry args={[0.04,0.07,0.2,5]}/><meshStandardMaterial color="#dd8855"/></mesh>
      </Lm>
      <Lm p={L.horseshoeBend} info={INFO.horseshoeBend}>
        <mesh position={[0,0.06,0]}><torusGeometry args={[0.18,0.04,6,18,Math.PI*1.5]}/><meshStandardMaterial color="#cc6633" roughness={0.8}/></mesh>
        <mesh position={[0,0.02,0]}><boxGeometry args={[0.5,0.04,0.4]}/><meshStandardMaterial color="#c85a2a" roughness={0.9}/></mesh>
      </Lm>
      <Lm p={L.grandTeton} info={INFO.grandTeton}>
        <mesh position={[0,0.2,0]}><coneGeometry args={[0.22,0.4,8]}/><meshStandardMaterial color="#889aaa" roughness={0.7}/></mesh>
        <mesh position={[0.2,0.12,0]}><coneGeometry args={[0.14,0.24,8]}/><meshStandardMaterial color="#7a8a9a"/></mesh>
      </Lm>
      <Lm p={L.timesSquare} info={INFO.timesSquare}>
        <mesh position={[0,0.18,0]}><boxGeometry args={[0.1,0.36,0.1]}/><meshStandardMaterial color="#445566" roughness={0.4}/></mesh>
        <mesh position={[0.14,0.14,0]}><boxGeometry args={[0.09,0.28,0.09]}/><meshStandardMaterial color="#334455"/></mesh>
        <mesh position={[-0.14,0.2,0]}><boxGeometry args={[0.1,0.4,0.1]}/><meshStandardMaterial color="#556677"/></mesh>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.5,0.08,0.35]}/><meshStandardMaterial color="#333344" roughness={0.8}/></mesh>
      </Lm>
      <Lm p={L.washingtonMonument} info={INFO.washingtonMonument}>
        <mesh position={[0,0.22,0]}><cylinderGeometry args={[0.04,0.07,0.44,4]}/><meshStandardMaterial color="#e8e4d8" roughness={0.5}/></mesh>
        <mesh position={[0,0.48,0]}><coneGeometry args={[0.04,0.08,4]}/><meshStandardMaterial color="#d8d4c8"/></mesh>
      </Lm>
      <Lm p={L.lincolnMemorial} info={INFO.lincolnMemorial}>
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.5,0.12,0.3]}/><meshStandardMaterial color="#e8e4d8" roughness={0.6}/></mesh>
        {[-0.2,-0.1,0,0.1,0.2].map((x,i)=>(
          <mesh key={i} position={[x,0.17,0.13]}><cylinderGeometry args={[0.025,0.025,0.1,8]}/><meshStandardMaterial color="#e0dcd0"/></mesh>
        ))}
        <mesh position={[0,0.24,0]}><boxGeometry args={[0.52,0.04,0.32]}/><meshStandardMaterial color="#d8d4c8"/></mesh>
      </Lm>
      <Lm p={L.hooverDam} info={INFO.hooverDam}>
        <mesh position={[0,0.1,0]}><boxGeometry args={[0.55,0.2,0.1]}/><meshStandardMaterial color="#c8c0a8" roughness={0.7}/></mesh>
        <mesh position={[0,0.04,0.08]}><boxGeometry args={[0.45,0.08,0.12]}/><meshStandardMaterial color="#c0b8a0"/></mesh>
      </Lm>
      <Lm p={L.lasVegasStrip} info={INFO.lasVegasStrip}>
        <mesh position={[-0.14,0.18,0]}><boxGeometry args={[0.1,0.36,0.1]}/><meshStandardMaterial color="#ffcc44" roughness={0.3} emissive="#cc8800" emissiveIntensity={0.2}/></mesh>
        <mesh position={[0.06,0.12,0]}><boxGeometry args={[0.09,0.24,0.09]}/><meshStandardMaterial color="#ff8844" roughness={0.3}/></mesh>
        <mesh position={[0.18,0.2,0]}><boxGeometry args={[0.1,0.4,0.1]}/><meshStandardMaterial color="#44aaff" roughness={0.3}/></mesh>
      </Lm>
      <Lm p={L.hollywoodSign} info={INFO.hollywoodSign}>
        <mesh position={[0,0.08,0]}><boxGeometry args={[0.5,0.16,0.04]}/><meshStandardMaterial color="#e8e8e8" roughness={0.5}/></mesh>
        <mesh position={[0,0.02,0]}><boxGeometry args={[0.5,0.04,0.15]}/><meshStandardMaterial color="#8a9878" roughness={0.9}/></mesh>
      </Lm>
      <Lm p={L.alcatraz} info={INFO.alcatraz}>
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.4,0.12,0.28]}/><meshStandardMaterial color="#c8c0a0" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]}><cylinderGeometry args={[0.04,0.05,0.16,8]}/><meshStandardMaterial color="#d0c8a8"/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.05,0.04,0.04,8]}/><meshStandardMaterial color="#e8e0c8"/></mesh>
      </Lm>
      <Lm p={L.teotihuacan} info={INFO.teotihuacan}>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.5,0.08,0.5]}/><meshStandardMaterial color="#d4a860" roughness={0.8}/></mesh>
        <mesh position={[0,0.12,0]}><boxGeometry args={[0.38,0.08,0.38]}/><meshStandardMaterial color="#c89850"/></mesh>
        <mesh position={[0,0.2,0]}><boxGeometry args={[0.26,0.08,0.26]}/><meshStandardMaterial color="#bc8840"/></mesh>
        <mesh position={[0,0.28,0]}><boxGeometry args={[0.16,0.1,0.16]}/><meshStandardMaterial color="#b07830"/></mesh>
        <mesh position={[0,0.37,0]}><coneGeometry args={[0.08,0.1,4]}/><meshStandardMaterial color="#a06820"/></mesh>
      </Lm>
      <Lm p={L.tulumRuins} info={INFO.tulumRuins}>
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.35,0.12,0.22]}/><meshStandardMaterial color="#d4c090" roughness={0.8}/></mesh>
        <mesh position={[0,0.16,0]}><boxGeometry args={[0.26,0.08,0.18]}/><meshStandardMaterial color="#c8b080"/></mesh>
        <mesh position={[0,0.03,0.12]}><boxGeometry args={[0.3,0.06,0.06]}/><meshStandardMaterial color="#2266aa" roughness={0.2}/></mesh>
      </Lm>
      <Lm p={L.banffNP} info={INFO.banffNP}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.2,0.36,8]}/><meshStandardMaterial color="#7799aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.45,0.08,0.3]}/><meshStandardMaterial color="#44aacc" roughness={0.2}/></mesh>
      </Lm>
      <Lm p={L.cnTower} info={INFO.cnTower}>
        <mesh position={[0,0.24,0]}><cylinderGeometry args={[0.03,0.07,0.48,8]}/><meshStandardMaterial color="#aabbcc" roughness={0.4} metalness={0.3}/></mesh>
        <mesh position={[0,0.5,0]}><cylinderGeometry args={[0.06,0.05,0.06,12]}/><meshStandardMaterial color="#99aabb"/></mesh>
        <mesh position={[0,0.58,0]}><cylinderGeometry args={[0.015,0.015,0.16,6]}/><meshStandardMaterial color="#aabbcc"/></mesh>
      </Lm>
      <Lm p={L.oldQuebecCity} info={INFO.oldQuebecCity}>
        <mesh position={[0,0.07,0]}><boxGeometry args={[0.45,0.14,0.28]}/><meshStandardMaterial color="#88aa66" roughness={0.7}/></mesh>
        <mesh position={[0,0.2,0]}><boxGeometry args={[0.35,0.1,0.22]}/><meshStandardMaterial color="#779955"/></mesh>
        <mesh position={[0,0.3,0]}><coneGeometry args={[0.18,0.18,4]}/><meshStandardMaterial color="#556644"/></mesh>
      </Lm>
      <Lm p={L.panamaCanal} info={INFO.panamaCanal}>
        <mesh position={[0,0.03,0]}><boxGeometry args={[0.55,0.06,0.2]}/><meshStandardMaterial color="#3388aa" roughness={0.3}/></mesh>
        <mesh position={[-0.22,0.1,0]}><boxGeometry args={[0.06,0.12,0.18]}/><meshStandardMaterial color="#888888" roughness={0.7}/></mesh>
        <mesh position={[0.22,0.1,0]}><boxGeometry args={[0.06,0.12,0.18]}/><meshStandardMaterial color="#888888"/></mesh>
      </Lm>
      <Lm p={L.angelFalls} info={INFO.angelFalls}>
        <mesh position={[0,0.2,0]}><boxGeometry args={[0.12,0.4,0.1]}/><meshStandardMaterial color="#558844" roughness={0.8}/></mesh>
        <mesh position={[0,0.06,0.07]}><boxGeometry args={[0.06,0.12,0.04]}/><meshStandardMaterial color="#66aadd" roughness={0.2}/></mesh>
        <mesh position={[0,0.14,0]}><coneGeometry args={[0.14,0.1,8]}/><meshStandardMaterial color="#4a7838"/></mesh>
      </Lm>
      <Lm p={L.lakeTiticaca} info={INFO.lakeTiticaca}>
        <mesh position={[0,0.02,0]}><cylinderGeometry args={[0.22,0.24,0.04,10]}/><meshStandardMaterial color="#3366cc" roughness={0.2}/></mesh>
        <mesh position={[0.1,0.06,0]}><boxGeometry args={[0.12,0.06,0.08]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      <Lm p={L.salarDeUyuni} info={INFO.salarDeUyuni}>
        <mesh position={[0,0.02,0]}><boxGeometry args={[0.55,0.04,0.4]}/><meshStandardMaterial color="#f8f8f0" roughness={0.1}/></mesh>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.55,0.01,0.4]}/><meshStandardMaterial color="#ccddee" roughness={0.05}/></mesh>
      </Lm>
      <Lm p={L.cartagena} info={INFO.cartagena}>
        <mesh position={[0,0.07,0]}><boxGeometry args={[0.45,0.14,0.3]}/><meshStandardMaterial color="#cc8844" roughness={0.7}/></mesh>
        <mesh position={[-0.18,0.18,0.12]}><cylinderGeometry args={[0.055,0.06,0.14,8]}/><meshStandardMaterial color="#c07733"/></mesh>
        <mesh position={[0.18,0.18,0.12]}><cylinderGeometry args={[0.055,0.06,0.14,8]}/><meshStandardMaterial color="#c07733"/></mesh>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.12,0.14,4]}/><meshStandardMaterial color="#aa5522"/></mesh>
      </Lm>
      <Lm p={L.torresDePaine} info={INFO.torresDePaine}>
        <mesh position={[-0.14,0.22,0]}><boxGeometry args={[0.1,0.44,0.12]}/><meshStandardMaterial color="#888898" roughness={0.7}/></mesh>
        <mesh position={[0,0.2,0]}><boxGeometry args={[0.09,0.4,0.11]}/><meshStandardMaterial color="#9999aa"/></mesh>
        <mesh position={[0.14,0.24,0]}><boxGeometry args={[0.1,0.48,0.12]}/><meshStandardMaterial color="#888898"/></mesh>
      </Lm>
      <Lm p={L.easterIsland} info={INFO.easterIsland}>
        <mesh position={[-0.16,0.14,0]}><boxGeometry args={[0.1,0.28,0.12]}/><meshStandardMaterial color="#8a7a68" roughness={0.8}/></mesh>
        <mesh position={[0.04,0.14,0]}><boxGeometry args={[0.09,0.28,0.11]}/><meshStandardMaterial color="#7a6a58"/></mesh>
        <mesh position={[0.18,0.12,0]}><boxGeometry args={[0.1,0.24,0.12]}/><meshStandardMaterial color="#8a7a68"/></mesh>
        <mesh position={[-0.16,0.3,0]}><boxGeometry args={[0.12,0.04,0.14]}/><meshStandardMaterial color="#aa6644"/></mesh>
        <mesh position={[0.04,0.3,0]}><boxGeometry args={[0.11,0.04,0.13]}/><meshStandardMaterial color="#aa6644"/></mesh>
        <mesh position={[0.18,0.26,0]}><boxGeometry args={[0.12,0.04,0.14]}/><meshStandardMaterial color="#aa6644"/></mesh>
      </Lm>
      <Lm p={L.atacamaDesert} info={INFO.atacamaDesert}>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.55,0.08,0.4]}/><meshStandardMaterial color="#c8a860" roughness={0.9}/></mesh>
        <mesh position={[0.14,0.12,0]}><cylinderGeometry args={[0.02,0.02,0.14,6]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[-0.1,0.1,0.1]}><cylinderGeometry args={[0.015,0.015,0.1,6]}/><meshStandardMaterial color="#888888"/></mesh>
      </Lm>

      {/* ══ Oceania — new ════════════════════════════════════════════════════ */}
      <Lm p={L.sydneyOperaHouse} info={INFO.sydneyOperaHouse}>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.5,0.08,0.3]}/><meshStandardMaterial color="#e8e4e0" roughness={0.5}/></mesh>
        <mesh position={[-0.1,0.16,0]} rotation={[0,0,0.3]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#f0eeea"/></mesh>
        <mesh position={[0.1,0.14,0.06]} rotation={[0,0.2,-0.2]}><sphereGeometry args={[0.1,10,6]}/><meshStandardMaterial color="#eceae6"/></mesh>
      </Lm>
      <Lm p={L.sydneyHarbourBridge} info={INFO.sydneyHarbourBridge}>
        <mesh position={[0,0.08,0]}><torusGeometry args={[0.22,0.03,6,16,Math.PI]}/><meshStandardMaterial color="#445566" roughness={0.6}/></mesh>
        <mesh position={[0,0.02,0]}><boxGeometry args={[0.5,0.04,0.1]}/><meshStandardMaterial color="#334455" roughness={0.7}/></mesh>
        <mesh position={[-0.22,0.08,0]}><boxGeometry args={[0.04,0.16,0.08]}/><meshStandardMaterial color="#445566"/></mesh>
        <mesh position={[0.22,0.08,0]}><boxGeometry args={[0.04,0.16,0.08]}/><meshStandardMaterial color="#445566"/></mesh>
      </Lm>
      <Lm p={L.uluru} info={INFO.uluru}>
        <mesh position={[0,0.1,0]}><cylinderGeometry args={[0.22,0.28,0.2,10]}/><meshStandardMaterial color="#cc5533" roughness={0.9}/></mesh>
        <mesh position={[0,0.22,0]}><sphereGeometry args={[0.18,10,6]}/><meshStandardMaterial color="#c44422" roughness={0.8}/></mesh>
      </Lm>
      <Lm p={L.greatOceanRoad} info={INFO.greatOceanRoad}>
        <mesh position={[-0.12,0.1,0]}><cylinderGeometry args={[0.05,0.07,0.2,6]}/><meshStandardMaterial color="#c8c0a0" roughness={0.7}/></mesh>
        <mesh position={[0.06,0.12,0]}><cylinderGeometry args={[0.06,0.08,0.24,6]}/><meshStandardMaterial color="#c0b898"/></mesh>
        <mesh position={[0.2,0.08,0]}><cylinderGeometry args={[0.05,0.07,0.16,6]}/><meshStandardMaterial color="#c8c0a0"/></mesh>
        <mesh position={[0,0.03,0.1]}><boxGeometry args={[0.45,0.06,0.1]}/><meshStandardMaterial color="#3388aa" roughness={0.2}/></mesh>
      </Lm>
      <Lm p={L.hobbiton} info={INFO.hobbiton}>
        <mesh position={[0,0.04,0]}><sphereGeometry args={[0.12,8,6]}/><meshStandardMaterial color="#4a8830" roughness={0.9}/></mesh>
        <mesh position={[0,0.04,0]}><boxGeometry args={[0.08,0.06,0.05]}/><meshStandardMaterial color="#885533"/></mesh>
        <mesh position={[0.18,0.05,0]}><sphereGeometry args={[0.1,8,6]}/><meshStandardMaterial color="#558838"/></mesh>
        <mesh position={[0.18,0.04,0]}><boxGeometry args={[0.07,0.05,0.05]}/><meshStandardMaterial color="#664422"/></mesh>
      </Lm>
      <Lm p={L.rotuaGeothermal} info={INFO.rotuaGeothermal}>
        <mesh position={[0,0.03,0]}><cylinderGeometry args={[0.16,0.18,0.06,10]}/><meshStandardMaterial color="#886644" roughness={0.8}/></mesh>
        <mesh position={[0,0.14,0]}><cylinderGeometry args={[0.03,0.05,0.16,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.2}/></mesh>
        <mesh position={[0.14,0.1,0]}><cylinderGeometry args={[0.02,0.04,0.12,6]}/><meshStandardMaterial color="#bbccdd"/></mesh>
      </Lm>
"""

src = src.replace(
    '    </>\n  );\n}',
    new_LM + '    </>\n  );\n}',
    1
)

with open(r'app\plan\location\page.tsx', 'w', encoding='utf-8') as f:
    f.write(src)
print("Done. Lines:", src.count('\n'))
