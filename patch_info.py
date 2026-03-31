#!/usr/bin/env python3
"""Adds INFO entries for all new landmarks and animals."""

with open('app/plan/location/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

INFO_ANCHOR = '  milfordSound:    { name: "Milford Sound",          location: "Fiordland, New Zealand",              fact: "Carved by ancient glaciers, its granite walls plunge 120 m below the waterline — a true fjord hidden within a fjord." },'

INFO_NEW = """\
  milfordSound:    { name: "Milford Sound",          location: "Fiordland, New Zealand",              fact: "Carved by ancient glaciers, its granite walls plunge 120 m below the waterline — a true fjord hidden within a fjord." },

  // ── US States ──────────────────────────────────────────────────────────
  alabamaRocket:    { name: "US Space & Rocket Center",  location: "Huntsville, Alabama",        fact: "Home to the world's largest space museum and the actual Saturn V rocket that sent astronauts to the Moon." },
  alaskaDenali:     { name: "Denali National Park",      location: "Alaska, USA",                fact: "Denali (6,190 m) is North America's highest peak — its base-to-summit rise of 5,500 m is greater than Everest's." },
  arkansasCrystal:  { name: "Crystal Bridges Museum",    location: "Bentonville, Arkansas",      fact: "Built by Walmart heir Alice Walton, it houses $1.2 billion in American art nestled in a forested Ozark canyon." },
  californiaYosemite:{ name: "Yosemite National Park",  location: "Sierra Nevada, California",   fact: "El Capitan's granite wall is 900 m tall — the world's premier big-wall climbing destination." },
  coloradoRocky:    { name: "Rocky Mountain NP",         location: "Colorado, USA",              fact: "Trail Ridge Road crosses the Continental Divide at 3,713 m — the highest paved through-road in the USA." },
  connecticutMark:  { name: "Mark Twain House",          location: "Hartford, Connecticut",      fact: "Twain lived here 17 years and wrote Tom Sawyer, Adventures of Huckleberry Finn, and six other masterpieces inside." },
  delawareCape:     { name: "Cape Henlopen",             location: "Lewes, Delaware",            fact: "Delaware's oldest state park sits where the Delaware Bay meets the Atlantic — a vital shorebird migration stop." },
  floridaKSC:       { name: "Kennedy Space Center",      location: "Merritt Island, Florida",    fact: "Every crewed US space mission since 1968 launched from KSC — from Apollo 11 to SpaceX Crew Dragon." },
  georgiaStone:     { name: "Stone Mountain",            location: "Georgia, USA",               fact: "The exposed granite dome is 268 m tall and contains the largest relief carving in the world on its north face." },
  hawaiiDiamond:    { name: "Diamond Head",              location: "Honolulu, Oahu, Hawaii",     fact: "This extinct 300,000-year-old volcanic crater was named by British sailors who mistook calcite crystals for diamonds." },
  idahoCraters:     { name: "Craters of the Moon",       location: "Idaho, USA",                 fact: "NASA trained Apollo astronauts here because this alien volcanic landscape is the closest thing to the Moon on Earth." },
  illinoisBean:     { name: "Cloud Gate (The Bean)",     location: "Millennium Park, Chicago",   fact: "Anish Kapoor's 110-tonne polished steel sculpture distorts the Chicago skyline into a surreal, warped mirror." },
  indianaSpeedway:  { name: "Indianapolis Motor Speedway",location: "Indianapolis, Indiana",     fact: "The 'Brickyard' seats 250,000 spectators — the single-day attendance record for any sporting event on Earth." },
  iowaFields:       { name: "Field of Dreams",           location: "Dyersville, Iowa",           fact: "The 1989 film's actual baseball diamond still stands in a cornfield and hosts real MLB games every August." },
  kansasPrairie:    { name: "Tallgrass Prairie NP",      location: "Chase County, Kansas",       fact: "Less than 4% of North America's original tallgrass prairie survives — this preserve protects the largest remnant." },
  kentuckyMammoth:  { name: "Mammoth Cave NP",           location: "Kentucky, USA",              fact: "With over 680 km of surveyed passages, Mammoth Cave is the world's longest known cave system." },
  louisianaFrench:  { name: "French Quarter",            location: "New Orleans, Louisiana",     fact: "Built by French colonists in 1718, the Quarter survived Katrina almost unscathed thanks to its elevated location." },
  maineAcadia:      { name: "Acadia National Park",      location: "Mount Desert Island, Maine", fact: "Cadillac Mountain is the first place in the USA to see sunrise for most of the year — the summit is 466 m above sea level." },
  marylandFort:     { name: "Fort McHenry",              location: "Baltimore, Maryland",        fact: "The fort's successful defense in 1814 inspired Francis Scott Key to write what became the US National Anthem." },
  massFreedom:      { name: "Freedom Trail",             location: "Boston, Massachusetts",      fact: "A 4 km red brick line connects 16 sites from Boston's revolutionary history, including Paul Revere's house." },
  michiganPictured: { name: "Pictured Rocks",            location: "Munising, Michigan",         fact: "Mineral-streaked sandstone cliffs glow turquoise, pink, and gold at sunrise along 64 km of Lake Superior shoreline." },
  minnesotaMall:    { name: "Mall of America",           location: "Bloomington, Minnesota",     fact: "The largest mall in the USA has an indoor theme park, aquarium, and chapel — and 12,000 parking spaces." },
  mississippiNatch: { name: "Natchez Trace Parkway",     location: "Mississippi, USA",           fact: "This 716 km scenic road follows a 10,000-year-old trail used by Native Americans, explorers, and soldiers." },
  missouriArch:     { name: "Gateway Arch",              location: "St. Louis, Missouri",        fact: "At 192 m, the stainless steel arch is taller than the Statue of Liberty — and its two legs are exactly 192 m apart." },
  montanaGlacier:   { name: "Glacier National Park",     location: "Montana, USA",               fact: "Known as the 'Crown of the Continent', it had 150 glaciers in 1850 — climate change has reduced that to just 25." },
  nebraskaChimney:  { name: "Chimney Rock",              location: "Bayard, Nebraska",           fact: "This 91 m spire was the most-noted landmark on the Oregon Trail — pioneers could see it for days before reaching it." },
  nevadaVegas:      { name: "Las Vegas Strip",           location: "Las Vegas, Nevada",          fact: "The Strip produces so much light pollution it can be seen from space — and generates $7 billion a year in casino revenue." },
  nhWashington:     { name: "Mount Washington",          location: "White Mountains, NH",        fact: "The summit recorded a wind speed of 372 km/h in 1934 — a world record that stood for 76 years." },
  njAtlantic:       { name: "Atlantic City Boardwalk",   location: "Atlantic City, New Jersey",  fact: "Built in 1870, it was the world's first boardwalk and inspired the property names in the original US Monopoly board." },
  nmWhiteSands:     { name: "White Sands National Park", location: "New Mexico, USA",            fact: "The world's largest gypsum dune field covers 710 km² — the dazzling white sand stays cool even in blazing sun." },
  nyEmpire:         { name: "Empire State Building",     location: "Midtown Manhattan, New York",fact: "It took just 410 days to build in 1930–31, using 7 million man-hours — the top 30 floors were lit in 2 minutes each night." },
  ncBlueRidge:      { name: "Blue Ridge Parkway",        location: "North Carolina / Virginia",  fact: "America's most visited NPS site — 755 km of scenic road along the Appalachian ridge with no traffic lights." },
  ndTheodore:       { name: "Theodore Roosevelt NP",     location: "North Dakota, USA",          fact: "Roosevelt ranched here after his wife and mother died on the same day — the Badlands landscape helped him recover." },
  ohioRock:         { name: "Rock & Roll Hall of Fame",  location: "Cleveland, Ohio",            fact: "Cleveland won the right to host it in 1986 after a fan vote — the city's radio DJs coined the term 'rock and roll' in 1951." },
  oklahomaMemorial: { name: "OKC National Memorial",     location: "Oklahoma City, Oklahoma",    fact: "168 empty bronze chairs mark where each victim of the 1995 bombing sat — 19 smaller chairs honour the children killed." },
  oregonCrater:     { name: "Crater Lake",               location: "Oregon, USA",                fact: "At 592 m deep, it's the deepest lake in the USA — filled entirely by snow and rain, with no rivers flowing in or out." },
  paLibertyBell:    { name: "Liberty Bell",              location: "Philadelphia, Pennsylvania", fact: "The bell cracked on its very first test ring in 1752 — the famous crack you see today formed around 1846." },
  riCliffWalk:      { name: "Cliff Walk",                location: "Newport, Rhode Island",      fact: "A 5 km National Recreation Trail runs past Gilded Age mansions clinging to the ocean cliffs of Aquidneck Island." },
  scFortSumter:     { name: "Fort Sumter",               location: "Charleston Harbor, SC",      fact: "The Confederate attack on Fort Sumter on April 12, 1861 fired the opening shots of the American Civil War." },
  tnGraceland:      { name: "Graceland",                 location: "Memphis, Tennessee",         fact: "Elvis Presley's mansion attracts 650,000 visitors a year — America's second most-visited private home after the White House." },
  txAlamo:          { name: "The Alamo",                 location: "San Antonio, Texas",         fact: "In 1836, 189 defenders held the mission for 13 days against 1,800 Mexican troops — 'Remember the Alamo' rallied Texas independence." },
  utahArches:       { name: "Arches National Park",      location: "Moab, Utah",                 fact: "Over 2,000 natural sandstone arches dot this park — the world's greatest concentration — including the iconic Delicate Arch." },
  vtStowe:          { name: "Stowe Mountain Resort",     location: "Stowe, Vermont",             fact: "Vermont's highest ski mountain rises 1,339 m and is home to New England's longest continuous vertical ski descent." },
  vaMonticello:     { name: "Monticello",                location: "Charlottesville, Virginia",  fact: "Thomas Jefferson designed and redesigned his home over 40 years — the nickel coin still features its distinctive dome." },
  waSpaceNeedle:    { name: "Space Needle",              location: "Seattle, Washington",        fact: "Built for the 1962 World's Fair in just 13 months, its saucer top can sway up to 45 cm in a major earthquake." },
  wvNewRiver:       { name: "New River Gorge",           location: "West Virginia, USA",         fact: "One of the world's oldest rivers, the New River Gorge Bridge was the world's longest steel arch span for 26 years." },
  wiHouseRock:      { name: "House on the Rock",         location: "Spring Green, Wisconsin",    fact: "Alex Jordan's fantastical house built atop a 60 m chimney rock holds one of the world's largest carousel collections." },
  wyOldFaithful:    { name: "Old Faithful, Yellowstone", location: "Wyoming, USA",               fact: "Erupts every 44–125 min, shooting 14,000–32,000 L of boiling water up to 56 m — for at least 150 consecutive years." },

  // ── France ─────────────────────────────────────────────────────────────
  montSaintMichelF: { name: "Mont Saint-Michel",         location: "Normandy, France",           fact: "At high tide it becomes a sea-girt island — pilgrims have climbed its abbey since 708 AD when the Archangel Michael appeared in a dream." },
  versaillesF:      { name: "Palace of Versailles",      location: "Versailles, France",         fact: "Built by Louis XIV, it has 700 rooms, 2,000 windows, and 20,000 workers who maintained it — yet had no indoor toilets." },
  notreDameF:       { name: "Notre-Dame de Paris",       location: "Île de la Cité, Paris",      fact: "Construction took 182 years (1163–1345). The 2019 fire that collapsed its spire was seen live by 1 billion viewers." },
  niceRiviera:      { name: "French Riviera",            location: "Nice, Côte d'Azur, France",  fact: "The Promenade des Anglais was built in 1820 by English tourists wintering here — they invented the French Riviera holiday." },
  pontDuGard:       { name: "Pont du Gard",              location: "Vers-Pont-du-Gard, France",  fact: "This 2,000-year-old Roman aqueduct bridge carries water 50 km — built with no mortar and still standing perfectly level." },
  chamonixAlps:     { name: "Chamonix Mont Blanc",       location: "Haute-Savoie, France",       fact: "The 1924 Winter Olympics were held here — and Mont Blanc at 4,808 m is Western Europe's highest peak." },
  carcassonneF:     { name: "Carcassonne",               location: "Aude, Occitanie, France",    fact: "The double-walled medieval citadel with 52 towers inspired Walt Disney's Sleeping Beauty castle and the board game Carcassonne." },
  chambordF:        { name: "Château de Chambord",       location: "Loire Valley, France",       fact: "Built for François I as a hunting lodge, its double-helix staircase was reportedly designed by Leonardo da Vinci." },
  bordeauxWine:     { name: "Bordeaux Wine Region",      location: "Bordeaux, Gironde, France",  fact: "Bordeaux is home to 6,000 châteaux and produces 700 million bottles of wine annually — a quarter of France's total output." },
  colmarAlsace:     { name: "Colmar, Alsace",            location: "Colmar, Haut-Rhin, France",  fact: "Its perfectly preserved half-timbered waterfront district inspired the village in the Disney film Beauty and the Beast." },

  // ── Spain ──────────────────────────────────────────────────────────────
  alhambra:         { name: "Alhambra",                  location: "Granada, Andalusia, Spain",  fact: "The Nasrid Palaces contain 10,000 unique geometric tile patterns — Islamic craftsmen considered repetition sacred." },
  parkGuell:        { name: "Park Güell",                location: "Barcelona, Catalonia, Spain",fact: "Gaudí's mosaic wonderland was originally a failed housing project — only 2 of the planned 60 houses were ever built." },
  sevilleCathedral: { name: "Seville Cathedral",         location: "Seville, Andalusia, Spain",  fact: "The world's largest Gothic cathedral took 100 years to build and contains the tomb of Christopher Columbus." },
  guggenheimBilbao: { name: "Guggenheim Bilbao",         location: "Bilbao, Basque Country",     fact: "Frank Gehry's titanium masterpiece sparked the 'Bilbao Effect' — a struggling industrial city transformed by bold architecture." },
  teideVolcano:     { name: "Mount Teide",               location: "Tenerife, Canary Islands",   fact: "At 3,715 m above sea level but measuring 7,500 m from the ocean floor, Teide is the world's third-tallest volcanic island." },
  santiagoDeComp:   { name: "Santiago de Compostela",    location: "Galicia, Spain",             fact: "The endpoint of the 800 km Camino de Santiago pilgrimage — St. James' bones are said to rest in its cathedral crypt." },
  toledoSpain:      { name: "Toledo Old City",           location: "Castilla–La Mancha, Spain",  fact: "Called 'City of Three Cultures' — Christians, Muslims, and Jews lived and worked side-by-side here for centuries." },
  ibizaSpain:       { name: "Ibiza",                     location: "Balearic Islands, Spain",    fact: "The Phoenicians founded it 2,700 years ago; today it hosts more nightclubs per km² than anywhere else on Earth." },
  costaBrava:       { name: "Costa Brava",               location: "Catalonia, Spain",           fact: "Salvador Dalí grew up here, called it 'the most surreal landscape in the world', and built his museum in Figueres." },
  pampalonaFiesta:  { name: "Running of the Bulls",      location: "Pamplona, Navarre, Spain",   fact: "Since 1592, runners have raced 850 m ahead of 6 fighting bulls through cobbled streets — the run lasts about 3 minutes." },

  // ── Italy ──────────────────────────────────────────────────────────────
  leaningPisa:      { name: "Leaning Tower of Pisa",     location: "Pisa, Tuscany, Italy",       fact: "It started leaning during construction in 1173 due to soft soil — engineers have stabilized it to lean exactly 3.97°." },
  veniceCanals:     { name: "Venice",                    location: "Veneto, Italy",               fact: "Built on 118 islands linked by 400 bridges, Venice is slowly sinking 1–2 mm per year into the Adriatic lagoon." },
  amalfiCoast:      { name: "Amalfi Coast",              location: "Campania, Italy",             fact: "Car-free clifftop villages cling 200 m above the sea — lemons the size of softballs grow on the terraced hillsides." },
  vaticanCity:      { name: "Vatican City",              location: "Rome, Italy",                 fact: "The world's smallest country (0.44 km²) contains the world's largest church, greatest art collection, and its own stamps and coins." },
  pompeii:          { name: "Pompeii",                   location: "Campania, Italy",             fact: "Vesuvius buried 2,000 people in 25 m of ash in 79 AD — their body-shaped voids have been filled with plaster to reveal them." },
  cinqueTerre:      { name: "Cinque Terre",              location: "Liguria, Italy",              fact: "Five cliff-side fishing villages linked only by a hiking trail for centuries — cars are still banned from the villages." },
  lakeComo:         { name: "Lake Como",                 location: "Lombardy, Italy",             fact: "Pliny the Younger had two villas here in 77 AD — it remains the playground of European nobility and Hollywood stars." },
  dolomites:        { name: "Dolomites",                 location: "Trentino-Alto Adige, Italy",  fact: "These pale limestone peaks glow rose-pink at sunset in a phenomenon called 'enrosadira' — 'turning to roses' in Ladin." },
  treviFountain:    { name: "Trevi Fountain",            location: "Rome, Italy",                 fact: "€1.5 million in coins are thrown in annually — the money is collected nightly and donated to a Rome food bank." },
  siciliaTemple:    { name: "Valley of the Temples",     location: "Agrigento, Sicily, Italy",    fact: "Seven Doric temples built by Greek colonists in 5 BC — the Temple of Concordia is the best-preserved Greek temple outside Greece." },

  // ── UK ─────────────────────────────────────────────────────────────────
  bigBen:           { name: "Big Ben",                   location: "Westminster, London, UK",     fact: "Big Ben is actually the bell, not the tower — the tower is officially called the Elizabeth Tower since 2012." },
  towerBridge:      { name: "Tower Bridge",              location: "London, UK",                  fact: "Though it looks medieval, Tower Bridge was built in 1894 using steel frames clad in Victorian Gothic stone." },
  edinburghCastle:  { name: "Edinburgh Castle",          location: "Edinburgh, Scotland",         fact: "Built on a 340 million-year-old volcanic rock, it's the most attacked castle in Great Britain — besieged 26 times." },
  buckinghamPalace: { name: "Buckingham Palace",         location: "London, UK",                  fact: "The Changing of the Guard ceremony uses 700 soldiers and takes 45 minutes — the palace has 775 rooms." },
  bathRomans:       { name: "Roman Baths",               location: "Bath, Somerset, UK",          fact: "The natural hot spring delivers 1.1 million litres of 45°C water daily — the Romans built these baths in 70 AD." },
  giantsCauseway:   { name: "Giant's Causeway",          location: "County Antrim, N. Ireland",   fact: "60 million years ago, volcanic lava cooled into 40,000 interlocking hexagonal basalt columns — legend says Finn McCool built it." },
  lakeDistrict:     { name: "Lake District",             location: "Cumbria, England",            fact: "England's largest national park inspired Wordsworth's poetry and Beatrix Potter's Peter Rabbit — it rains 330 days a year." },
  windsorCastle:    { name: "Windsor Castle",            location: "Windsor, Berkshire, UK",      fact: "Continuously occupied for 1,000 years, Windsor is the world's oldest and largest inhabited castle — home to 40 monarchs." },
  hadrianWall:      { name: "Hadrian's Wall",            location: "Northern England, UK",        fact: "The Emperor Hadrian built this 118 km wall in 122 AD to separate Roman Britain from the unconquered Scots." },
  cotswolds:        { name: "Cotswolds",                 location: "Central England, UK",         fact: "Honey-coloured limestone villages built by medieval wool merchants — some streets haven't changed in 500 years." },

  // ── Germany ────────────────────────────────────────────────────────────
  brandenburgGate:  { name: "Brandenburg Gate",          location: "Berlin, Germany",             fact: "Built in 1791 as a symbol of peace, it became the symbol of division during the Cold War and reunification in 1989." },
  neuschwanstein:   { name: "Neuschwanstein Castle",     location: "Bavaria, Germany",            fact: "Mad King Ludwig II built this fairy-tale castle but lived here only 172 days before dying mysteriously at age 40." },
  cologneGermany:   { name: "Cologne Cathedral",         location: "Cologne, Germany",            fact: "Construction ran from 1248 to 1880 — 632 years — making it one of the longest-built structures in human history." },
  rhineValley:      { name: "Rhine Valley",              location: "Rhineland-Palatinate, Germany",fact: "The Middle Rhine gorge has 40 castles in 65 km and the legendary Lorelei rock where a siren lured sailors to their doom." },
  blackForest:      { name: "Black Forest",              location: "Baden-Württemberg, Germany",  fact: "The dense fir trees block so much sunlight the Romans called it Selva Nigra (Black Forest) — it inspired the Brothers Grimm." },
  heidelbergCastle: { name: "Heidelberg Castle",         location: "Heidelberg, Germany",         fact: "Home to the world's largest wine barrel — the 'Heidelberger Tun' holds 221,726 litres and has its own dance floor on top." },
  bavAlps:          { name: "Bavarian Alps",             location: "Bavaria, Germany",            fact: "The Zugspitze at 2,962 m is Germany's highest peak — you can ski here on 3 different glaciers year-round." },
  hamburgHarbor:    { name: "Hamburg Speicherstadt",     location: "Hamburg, Germany",            fact: "The world's largest warehouse district in a UNESCO World Heritage Site — its canals hold more bridges than Venice and Amsterdam combined." },
  rothenburg:       { name: "Rothenburg ob der Tauber",  location: "Bavaria, Germany",            fact: "One of the world's best-preserved medieval walled towns, it inspired Disney's Pinocchio village — largely untouched since 1400." },
  munichMarien:     { name: "Munich Marienplatz",        location: "Munich, Germany",             fact: "The Glockenspiel above the New Town Hall re-enacts a 1568 royal tournament every day — with 43 bells and 32 life-size figures." },

  // ── Japan ──────────────────────────────────────────────────────────────
  mountFuji:        { name: "Mount Fuji",                location: "Honshu, Japan",               fact: "Japan's highest peak (3,776 m) is an active stratovolcano — it last erupted in 1707, covering Tokyo in 6 cm of ash." },
  fushimiInari:     { name: "Fushimi Inari Shrine",      location: "Kyoto, Japan",                fact: "Over 10,000 vermilion torii gates donated by businesses snake up the mountain — one for every prayer answered." },
  hiroshimaPeace:   { name: "Hiroshima Peace Memorial",  location: "Hiroshima, Japan",            fact: "The A-Bomb Dome is the only structure near the hypocentre that survived — it was 160 m away when the bomb exploded." },
  naraDeer:         { name: "Nara Deer Park",            location: "Nara, Japan",                 fact: "1,200 sika deer roam freely — they're considered sacred messengers of the gods and will bow to visitors who bow first." },
  osakaCastle:      { name: "Osaka Castle",              location: "Osaka, Japan",                fact: "Toyotomi Hideyoshi built it in 1583 to unify Japan — it was the most heavily fortified castle in the country at the time." },
  arashiyamaBamboo: { name: "Arashiyama Bamboo Grove",   location: "Kyoto, Japan",                fact: "The towering bamboo stalks creak and rustle in the wind — the sound is registered as one of Japan's 100 Soundscapes." },
  himejCastle:      { name: "Himeji Castle",             location: "Himeji, Hyogo, Japan",        fact: "The 'White Heron Castle' survived WWII bombing and two earthquakes — still the most complete original castle in Japan." },
  hokkaidoLav:      { name: "Hokkaido Lavender Fields",  location: "Furano, Hokkaido, Japan",     fact: "Farm Tomita's lavender fields bloom every July and were so beautiful they re-appeared on a calendar by accident — sparking Japan's lavender tourism." },
  shibuyaCrossing:  { name: "Shibuya Crossing",          location: "Shibuya, Tokyo, Japan",       fact: "Up to 3,000 pedestrians cross simultaneously from all directions every 2 minutes — the world's busiest intersection." },
  kyotoTemple:      { name: "Kinkaku-ji Golden Pavilion", location: "Kyoto, Japan",               fact: "The top two floors are covered in 20 kg of pure gold leaf — a monk burnt it down in 1950 after becoming obsessed with it." },

  // ── Australia ──────────────────────────────────────────────────────────
  sydneyOpera:      { name: "Sydney Opera House",        location: "Bennelong Point, Sydney",     fact: "Danish architect Jørn Utzon won the design competition in 1956 with a sketch on a napkin — and never saw it finished." },
  uluru:            { name: "Uluru (Ayers Rock)",        location: "Northern Territory, Australia",fact: "The sandstone monolith stands 348 m tall but extends 2.5 km underground — 86% of Uluru is hidden beneath the surface." },
  blueMountains:    { name: "Blue Mountains",            location: "New South Wales, Australia",  fact: "The blue haze is from oil droplets emitted by eucalyptus forests — billions of tiny droplets scatter blue light." },
  greatOceanRoad:   { name: "Great Ocean Road",          location: "Victoria, Australia",         fact: "Built by WWI veterans as a memorial between 1919–1932, it runs 243 km along the Southern Ocean past the Twelve Apostles." },
  kakaduNP:         { name: "Kakadu National Park",      location: "Northern Territory, Australia",fact: "Rock art here dates back 20,000 years — one of the oldest continuous artistic traditions on Earth, still added to today." },
  whitsundays:      { name: "Whitsunday Islands",        location: "Queensland, Australia",       fact: "Whitehaven Beach's silica sand is so pure it doesn't absorb heat — you can walk barefoot in 35°C temperatures." },
  bondiBeach:       { name: "Bondi Beach",               location: "Sydney, New South Wales",     fact: "Bondi has had lifeguards since 1906 — making it one of the world's first patrolled beaches. 40,000 visit on peak days." },
  daintreeRF:       { name: "Daintree Rainforest",       location: "Queensland, Australia",       fact: "At 180 million years old, it's the world's oldest surviving tropical rainforest — predating the Amazon by 80 million years." },
  purnululu:        { name: "Bungle Bungle Range",        location: "Western Australia",           fact: "These striped beehive-shaped sandstone domes were unknown to science until 1983 — Aboriginal people had known them for 20,000 years." },
  tasmaniaFreycinet:{ name: "Freycinet NP, Tasmania",    location: "East Coast, Tasmania",        fact: "Wineglass Bay has a near-perfect semicircular beach — and Tasmania's air is the cleanest measured anywhere on Earth." },

  // ── China ──────────────────────────────────────────────────────────────
  forbiddenCity:    { name: "Forbidden City",            location: "Beijing, China",              fact: "With 9,999 rooms, it was the world's largest palace complex — Chinese cosmology held that only Heaven had 10,000 rooms." },
  terracottaArmy:   { name: "Terracotta Army",           location: "Xi'an, Shaanxi, China",       fact: "8,000 life-size terracotta soldiers were buried with Emperor Qin Shi Huang in 210 BC — each face is individually unique." },
  liRiverChina:     { name: "Li River",                  location: "Guilin, Guangxi, China",      fact: "The dramatic karst peaks along this river appear on China's 20-yuan banknote — they inspired the landscape in Avatar." },
  zhangjiajie:      { name: "Zhangjiajie Mountains",    location: "Hunan, China",                fact: "These 243 m sandstone pillar mountains were renamed 'Avatar Hallelujah Mountain' after the film used them as inspiration." },
  yellowMountain:   { name: "Huangshan (Yellow Mountain)",location: "Anhui Province, China",      fact: "Its sea of clouds between granite peaks has inspired 500 years of Chinese landscape painting — and 60 million visitors a year." },
  potalaLhasa:      { name: "Potala Palace",             location: "Lhasa, Tibet",                fact: "At 3,700 m above sea level, the Dalai Lama's former winter palace has 1,000 rooms and took 50 years to build." },
  westLakeHangzhou: { name: "West Lake",                 location: "Hangzhou, Zhejiang, China",   fact: "Marco Polo called Hangzhou 'the finest city in the world' in 1275 — West Lake has inspired Chinese poets for 2,000 years." },
  guilinKarst:      { name: "Guilin Karst Peaks",        location: "Guilin, Guangxi, China",      fact: "Formed 300 million years ago under a tropical sea, these tooth-like limestone towers rise 100-300 m from rice paddies." },
  summerPalaceB:    { name: "Summer Palace",             location: "Beijing, China",              fact: "Empress Dowager Cixi rebuilt it after French-British forces destroyed it in 1860 — spending navy funds on the project." },
  lijiangOldTown:   { name: "Lijiang Old Town",          location: "Yunnan Province, China",      fact: "The Naxi minority's 800-year-old stone-paved town survived a 7.0 earthquake in 1996 — while the modern city around it crumbled." },

  // ── India ──────────────────────────────────────────────────────────────
  jaipurAmber:      { name: "Amber Fort",                location: "Jaipur, Rajasthan, India",    fact: "Maharajas entered on elephants decorated with marigolds — the Sheesh Mahal (Hall of Mirrors) sparkles with a single candle." },
  keralaBackwaters: { name: "Kerala Backwaters",         location: "Kerala, India",               fact: "900 km of interconnected rivers, lakes, and canals — houseboat travelers sleep on converted rice barges amid water hyacinths." },
  varanasiGhats:    { name: "Varanasi Ghats",            location: "Uttar Pradesh, India",        fact: "The world's oldest continuously inhabited city — Hindus believe dying in Varanasi guarantees moksha (liberation from rebirth)." },
  goaBeaches:       { name: "Goa Beaches",               location: "Goa, India",                  fact: "Portuguese colonists ruled Goa for 451 years — their spiced sausages, vindaloo, and whitewashed churches remain today." },
  goldenTempleAm:   { name: "Golden Temple, Amritsar",   location: "Amritsar, Punjab, India",     fact: "The Sikh holy of holies feeds 100,000 people free every day in the world's largest free community kitchen (langar)." },
  mumbaiGateway:    { name: "Gateway of India",          location: "Mumbai, Maharashtra, India",  fact: "Built in 1924 to receive King George V — and then used in 1948 as the exit point for the last British troops leaving India." },
  hawaMahal:        { name: "Hawa Mahal (Palace of Winds)",location: "Jaipur, Rajasthan, India",  fact: "Its 953 small windows were designed so royal women could observe street life without being seen — it's only one room deep." },
  ajantaCaves:      { name: "Ajanta Caves",              location: "Maharashtra, India",          fact: "30 Buddhist cave temples carved between 2 BC and 650 AD contain the world's finest surviving ancient murals." },
  ranthambore:      { name: "Ranthambore Tiger Reserve",  location: "Rajasthan, India",           fact: "Tigers here have been photographed napping in the 10th-century fort's ruins — unique in having a medieval castle inside a tiger reserve." },
  delhiQutub:       { name: "Qutub Minar",               location: "New Delhi, India",            fact: "The 72.5 m minaret begun in 1193 is the world's tallest brick minaret — its 379 steps spiral up 5 tapering tiers of red sandstone." },

  // ── Thailand ───────────────────────────────────────────────────────────
  grandPalaceBKK:   { name: "Grand Palace, Bangkok",     location: "Bangkok, Thailand",           fact: "The Emerald Buddha inside is 66 cm tall, carved from a single jade block, and changed into 3 seasonal robes by the King himself." },
  phiPhiIslands:    { name: "Phi Phi Islands",           location: "Krabi Province, Thailand",    fact: "The beach in 'The Beach' was filmed on Ko Phi Phi Leh — it became so overrun it was closed to tourists for 3 years to recover." },
  chiangMaiTemple:  { name: "Doi Suthep Temple",         location: "Chiang Mai, Thailand",        fact: "Legend says a white elephant chose the temple's location by climbing the mountain and trumpeting three times before dying." },
  ayutthaya:        { name: "Ayutthaya Historical Park", location: "Ayutthaya, Thailand",         fact: "Capital of the Ayutthaya Kingdom for 417 years, it was sacked by the Burmese in 1767 — Buddha heads are still found in tree roots." },
  railayBeach:      { name: "Railay Beach",              location: "Krabi, Thailand",             fact: "Accessible only by longtail boat due to towering limestone cliffs — world-class rock climbing and some of Thailand's clearest water." },
  whiteTempleCR:    { name: "White Temple (Wat Rong Khun)",location: "Chiang Rai, Thailand",      fact: "Artist Chalermchai Kositpipat started building his all-white dream temple in 1997 and says it won't be finished until 2070." },
  erawanFalls:      { name: "Erawan Waterfall",          location: "Kanchanaburi, Thailand",      fact: "Seven emerald tiers of waterfall where fish nibble your feet — named after the three-headed white elephant of Hindu mythology." },
  sukhothai:        { name: "Sukhothai Historical Park", location: "Sukhothai, Thailand",         fact: "The 13th-century Sukhothai Kingdom invented the Thai alphabet and the first recorded form of Thai democratic government." },

  // ── Greece ─────────────────────────────────────────────────────────────
  santoriniGreece:  { name: "Santorini",                 location: "Cyclades, Greece",            fact: "A volcanic caldera eruption around 1600 BC created the crescent shape — some historians believe this inspired the Atlantis legend." },
  meteora:          { name: "Meteora Monasteries",       location: "Thessaly, Greece",            fact: "6 monasteries perch atop 400 m sandstone pillars — monks were once hauled up in net baskets; now there are 140-step staircases." },
  delphi:           { name: "Delphi",                    location: "Phocis, Central Greece",      fact: "For 1,000 years the Oracle of Delphi was the most influential person in the ancient world — kings and generals sought her advice." },
  olympia:          { name: "Ancient Olympia",           location: "Elis, Peloponnese, Greece",   fact: "The original Olympic Games were held here every 4 years from 776 BC to 393 AD — a 1,169-year unbroken sporting tradition." },
  rhodesOldCity:    { name: "Rhodes Medieval City",      location: "Rhodes, Dodecanese, Greece",  fact: "The world's best-preserved medieval fortified city — the Street of the Knights is exactly as it was in 1309 when the Knights Hospitaller built it." },
  corfuOldTown:     { name: "Corfu Old Town",            location: "Corfu, Ionian Islands, Greece",fact: "Under Venetian rule for 400 years, its narrow alleyways (kantounia) were built labyrinthine on purpose to confuse invaders." },
  knossosCrete:     { name: "Palace of Knossos",         location: "Crete, Greece",               fact: "Europe's oldest city and the legendary palace of King Minos — the multi-storey palace with 1,000 rooms inspired the Minotaur labyrinth myth." },
  mykonos:          { name: "Mykonos Windmills",         location: "Mykonos, Cyclades, Greece",   fact: "The 16 whitewashed windmills were built by the Venetians in the 16th century to grind grain brought by trading ships." },
  navagioBeach:     { name: "Navagio (Shipwreck) Beach",  location: "Zakynthos, Ionian Islands",  fact: "A smugglers' ship ran aground here in 1980 — the rusting wreck now lies on the most photographed beach in the world." },
  nafplio:          { name: "Nafplio",                   location: "Argolis, Peloponnese, Greece", fact: "Greece's first capital after independence in 1829 — reached via 999 steps cut into the rock up to Palamidi Fortress." },

  // ── Turkey ─────────────────────────────────────────────────────────────
  pamukkale:        { name: "Pamukkale Travertines",     location: "Denizli Province, Turkey",    fact: "Calcium-rich hot springs have built cotton-white terraced pools for 14,000 years — the ancient spa city of Hierapolis sits above." },
  ephesus:          { name: "Ephesus Ancient City",      location: "Selçuk, Izmir, Turkey",       fact: "The Temple of Artemis here was one of the Seven Wonders of the Ancient World — only a single column survives today." },
  blueMosque:       { name: "Blue Mosque",               location: "Istanbul, Turkey",             fact: "Its 20,000 İznik tiles glow blue inside — and it's the only mosque in Istanbul with 6 minarets, causing a scandal in 1616." },
  topkapiPalace:    { name: "Topkapi Palace",            location: "Istanbul, Turkey",             fact: "The Ottoman Sultans ruled their empire from this palace for 400 years — it housed 4,000 people including 300 harem women." },
  bodrumTurkey:     { name: "Bodrum Castle",             location: "Bodrum, Mugla, Turkey",       fact: "Built in 1402 by the Crusaders using stones from the Mausoleum of Halicarnassus — one of the original Seven Wonders." },
  gobekliTepe:      { name: "Göbekli Tepe",              location: "Şanlıurfa, Turkey",           fact: "T-shaped stone pillars built 12,000 years ago — 6,000 years before Stonehenge — rewrote the history of human civilisation." },
  nemrutDag:        { name: "Nemrut Dağ",                location: "Adıyaman, Turkey",            fact: "King Antiochus I built a burial tomb here in 62 BC — giant god statues whose heads roll to the ground as they decay." },
  sumelaMonastery:  { name: "Sümela Monastery",          location: "Trabzon, Turkey",             fact: "Founded in 386 AD, this Greek Orthodox monastery clings to a 300 m sheer cliff in the Pontic Mountains." },

  // ── Brazil ─────────────────────────────────────────────────────────────
  amazonManaus:     { name: "Amazon Rainforest",         location: "Manaus, Amazonas, Brazil",    fact: "The Amazon produces 20% of Earth's oxygen and holds 10% of all species — a single hectare can have 400 tree species." },
  copacabana:       { name: "Copacabana Beach",          location: "Rio de Janeiro, Brazil",      fact: "The iconic black-and-white wave mosaic pavement was designed by Burle Marx in 1970 — it stretches 4 km of golden sand." },
  pantanal:         { name: "Pantanal Wetlands",         location: "Mato Grosso, Brazil",         fact: "The world's largest tropical wetland (150,000 km²) has the highest concentration of crocodilians on Earth — 10 million caimans." },
  fernandoNoronha:  { name: "Fernando de Noronha",       location: "Pernambuco, Brazil",          fact: "This remote volcanic archipelago has some of the clearest Atlantic water — dolphins gather here in groups of 400+" },
  salvadorHistoric: { name: "Pelourinho, Salvador",      location: "Bahia, Brazil",               fact: "The historic centre of Salvador, Brazil's first capital, is the largest collection of 17th-18th century colonial Baroque architecture in the Americas." },
  lencoisM:         { name: "Lençóis Maranhenses",       location: "Maranhão, Brazil",            fact: "A desert of white dunes filled with brilliant blue freshwater lagoons after the rains — it only exists from January to June." },
  ouroPreto:        { name: "Ouro Preto",                location: "Minas Gerais, Brazil",        fact: "Brazil's gold rush capital produced 80% of the world's gold in the 18th century — the opulent Baroque churches are still gilded inside." },

  // ── Mexico ─────────────────────────────────────────────────────────────
  teotihuacan:      { name: "Teotihuacan",               location: "State of Mexico, Mexico",     fact: "The Pyramid of the Sun (65 m) was the world's third-largest pyramid when built in 100 AD — its builders remain unknown." },
  palenqueMx:       { name: "Palenque",                  location: "Chiapas, Mexico",             fact: "Hidden deep in jungle until 1773, Palenque's temples and royal tombs are the finest examples of Maya artistic achievement." },
  tulumMx:          { name: "Tulum",                     location: "Quintana Roo, Mexico",        fact: "The only Maya city built on a cliff overlooking the Caribbean — its lighthouse guided canoes through the coral reefs below." },
  copperCanyonMx:   { name: "Copper Canyon",             location: "Chihuahua, Mexico",           fact: "4 times larger than the Grand Canyon and 300 m deeper — the Copper Canyon Railway is considered one of the world's great train journeys." },
  oaxacaMontAlban:  { name: "Monte Albán",               location: "Oaxaca, Mexico",              fact: "Zapotec kings levelled a mountain top in 500 BC to build the first true city in the Americas — it housed 25,000 people." },
  mexicoCathedral:  { name: "Mexico City Cathedral",     location: "Mexico City, Mexico",         fact: "Built over 240 years (1573–1813) on the site of an Aztec temple using its very stones — it's slowly sinking into the lakebed beneath." },
  guanajuatoMx:     { name: "Guanajuato",                location: "Guanajuato State, Mexico",    fact: "A city of colourful houses and underground roads built in flood tunnels — Diego Rivera was born here in 1886." },
  caboSanLucas:     { name: "Cabo San Lucas",            location: "Baja California Sur, Mexico", fact: "El Arco de Cabo San Lucas marks the exact meeting point of the Pacific Ocean and the Sea of Cortez." },

  // ── Peru ───────────────────────────────────────────────────────────────
  lakeTiticaca:     { name: "Lake Titicaca",             location: "Puno, Peru / Bolivia",        fact: "The world's highest navigable lake at 3,812 m — the floating Uros islands are made entirely of totora reeds that also rot away." },
  nazcaLines:       { name: "Nazca Lines",               location: "Ica Region, Peru",            fact: "Created between 500 BC and 500 AD, hundreds of giant geoglyphs — spiders, monkeys, hummingbirds — only fully visible from the air." },
  cusco:            { name: "Cusco",                     location: "Cusco Region, Peru",          fact: "The Inca called it the 'Navel of the World' — their masonry was so precise that a knife blade can't fit between the stone joints." },
  colcaCanyon:      { name: "Colca Canyon",              location: "Arequipa Region, Peru",       fact: "At 3,270 m deep it's twice as deep as the Grand Canyon — home to the Andean condor with a wingspan up to 3.3 m." },
  chanChan:         { name: "Chan Chan",                 location: "La Libertad, Peru",           fact: "The largest pre-Columbian city in South America once housed 60,000 people in a mud-brick city covering 20 km²." },

  // ── Egypt ──────────────────────────────────────────────────────────────
  valleyOfKings:    { name: "Valley of the Kings",       location: "Luxor, Egypt",                fact: "64 pharaonic tombs are cut into the desert rock here, including Tutankhamun's — discovered in 1922 with its curse intact." },
  karnakTemple:     { name: "Karnak Temple Complex",     location: "Luxor, Egypt",                fact: "The largest ancient religious site ever built — its Hypostyle Hall has 134 columns, each 23 m tall and 3 m in diameter." },
  luxorTemple:      { name: "Luxor Temple",              location: "Luxor, Egypt",                fact: "Connected to Karnak by a 3 km Avenue of Sphinxes — an Abu symbol obelisk from here has stood in Paris since 1836." },
  alexandriaEgypt:  { name: "Alexandria",                location: "Alexandria, Egypt",           fact: "Founded by Alexander the Great in 331 BC, it was home to the ancient world's greatest library — holding 700,000 scrolls." },
  mountSinai:       { name: "Mount Sinai",               location: "South Sinai, Egypt",          fact: "The 2,285 m peak where Moses is said to have received the Ten Commandments — pilgrims climb 3,750 stone steps by moonlight." },

  // ── Africa ─────────────────────────────────────────────────────────────
  maasaiMara:       { name: "Maasai Mara",               location: "Narok County, Kenya",         fact: "Site of the greatest wildlife migration on Earth — 2 million wildebeest cross the Mara River between July and October." },
  serengeti:        { name: "Serengeti",                 location: "Tanzania",                    fact: "Serengeti means 'endless plains' in Maasai — the Great Migration's 300 km circular route has continued for a million years." },
  kilimanjaro:      { name: "Mount Kilimanjaro",         location: "Tanzania",                    fact: "Africa's highest peak (5,895 m) is a free-standing volcano — its glaciers are shrinking and may disappear by 2050." },
  krugerNP:         { name: "Kruger National Park",      location: "Limpopo/Mpumalanga, SA",      fact: "One of Africa's largest game reserves (19,485 km²) hosts the Big Five — and more bird species than the entire US." },
  capePointSA:      { name: "Cape Point",                location: "Western Cape, South Africa",  fact: "Where the Atlantic and Indian Oceans meet — though the actual meeting point is at Cape Agulhas, 150 km further east." },
  moroccoMar:       { name: "Marrakech Medina",          location: "Marrakech, Morocco",          fact: "The Djemaa el-Fna square is the only UNESCO World Heritage cultural space — snake charmers, storytellers, and musicians perform nightly." },
  moroccoSahara:    { name: "Sahara Dunes (Erg Chebbi)",  location: "Merzouga, Morocco",          fact: "The Sahara's star-shaped dunes change shape daily — and the desert is expanding southward at 48 km per year due to climate change." },
  zanzibar:         { name: "Stone Town, Zanzibar",      location: "Zanzibar, Tanzania",          fact: "Freddie Mercury of Queen was born here in 1946 — the island's spice trade made it the clove capital of the world." },
  lalibelaEth:      { name: "Lalibela Rock Churches",    location: "Amhara Region, Ethiopia",     fact: "King Lalibela carved 11 interconnected churches from solid red volcanic rock in the 12th century — each from a single stone block." },
  drakensberg:      { name: "Drakensberg Mountains",     location: "KwaZulu-Natal, South Africa", fact: "The 'Dragon Mountains' have 600+ km of hiking trails and the world's largest collection of San rock art — 40,000 paintings." },

  // ── Iceland ────────────────────────────────────────────────────────────
  reykjavikH:       { name: "Hallgrímskirkja",           location: "Reykjavík, Iceland",          fact: "Iceland's largest church took 41 years to build (1945–1986) — its pipe organ has 5,275 pipes and weighs 25 tonnes." },
  geysirIceland:    { name: "Geysir Hot Spring",         location: "Haukadalur Valley, Iceland",  fact: "The word 'geyser' comes from this specific spring — it first erupted in 1294 and the nearby Strokkur now erupts every 5 minutes." },
  skogafoss:        { name: "Skógafoss Waterfall",       location: "Rangárþing eystra, Iceland",  fact: "The 60 m waterfall hides a cave behind it — legend says a Viking buried a chest of gold there, and a ring from it is in a museum." },

  // ── Norway ─────────────────────────────────────────────────────────────
  geirangerfjord:   { name: "Geirangerfjord",            location: "Møre og Romsdal, Norway",     fact: "A UNESCO World Heritage fjord 15 km long with walls rising 1,700 m — the Seven Sisters waterfall has 7 strands of falling water." },
  tromsoLights:     { name: "Northern Lights, Tromsø",   location: "Troms, Norway",               fact: "Tromsø at 69°N is in the auroral oval — the Northern Lights appear on 78 nights per year above the Arctic city." },
  bergenWharf:      { name: "Bryggen Wharf, Bergen",     location: "Bergen, Vestland, Norway",    fact: "The colourful Hanseatic wooden wharf buildings date to the 14th century — the leaning facades are built on permafrost." },

  // ── Canada ─────────────────────────────────────────────────────────────
  banffNP:          { name: "Banff National Park",       location: "Alberta, Canada",             fact: "Canada's oldest national park (1885) — Lake Louise's turquoise colour comes from rock flour glaciers grind into the water." },
  quebecOldCity:    { name: "Old Quebec City",           location: "Quebec, Canada",              fact: "The only walled city north of Mexico in North America — its 4.6 km of stone walls were built by the French in 1690." },
  whistlerBC:       { name: "Whistler Mountain",         location: "British Columbia, Canada",    fact: "The longest gondola in North America connects Whistler and Blackcomb peaks at 422 m above the valley — 11 km of cable." },
  haida:            { name: "Haida Gwaii",               location: "British Columbia, Canada",    fact: "These remote islands evolved in isolation for 10,000 years — the Haida people's totem pole tradition is unbroken over 2,000 years." },

  // ── New Zealand ────────────────────────────────────────────────────────
  hobbiton:         { name: "Hobbiton Movie Set",        location: "Matamata, Waikato, NZ",       fact: "Peter Jackson filmed both Hobbit series here on a real sheep farm — 37 hobbit holes were built and preserved permanently." },
  rotoruaNZ:        { name: "Rotorua Geothermal",        location: "Bay of Plenty, NZ",           fact: "The entire city smells of sulfur from geysers — it sits on the Taupo Volcanic Zone which last erupted 26,500 years ago." },
  fiordlandNZ:      { name: "Fiordland National Park",   location: "Southland, New Zealand",      fact: "One of the world's least-visited national parks due to its remoteness — it receives 7 m of rain per year and has no roads." },

  // ── Jordan ─────────────────────────────────────────────────────────────
  wadiRum:          { name: "Wadi Rum Desert",           location: "Aqaba Governorate, Jordan",   fact: "Lawrence of Arabia called it 'vast, echoing and God-like' — it served as a film set for The Martian and Rogue One." },
  deadSea:          { name: "Dead Sea",                  location: "Jordan / Israel / Palestine",  fact: "At 430 m below sea level, it's the world's lowest point on land — with 34% salinity you float effortlessly without swimming." },

  // ── Russia ─────────────────────────────────────────────────────────────
  stBasils:         { name: "St. Basil's Cathedral",     location: "Moscow, Russia",              fact: "Ivan the Terrible allegedly blinded the architects after completion so they couldn't build anything more beautiful elsewhere." },
  lakeBaikal:       { name: "Lake Baikal",               location: "Siberia, Russia",             fact: "The world's deepest lake (1,642 m) contains 20% of Earth's unfrozen freshwater — and unique species found nowhere else." },
  hermitageSPB:     { name: "Hermitage Museum",          location: "St. Petersburg, Russia",      fact: "With 3 million artworks in 365 rooms, seeing every piece for 1 minute would take 11 years — it houses 70 cats to guard against mice." },

  // ── Vietnam ────────────────────────────────────────────────────────────
  hoiAnVietnam:     { name: "Hội An Ancient Town",       location: "Quảng Nam, Vietnam",         fact: "Preserved exactly as it was 500 years ago — the Japanese Covered Bridge has stood since 1593 and is on Vietnam's 20,000 dong note." },
  hanoiHoanKiem:    { name: "Hoan Kiem Lake",            location: "Hanoi, Vietnam",              fact: "Legend says Emperor Le Loi returned a magic sword to the Golden Turtle God in this lake in 1428 — the turtle species still lives there." },

  // ── Indonesia ──────────────────────────────────────────────────────────
  baliUluwatu:      { name: "Uluwatu Temple",            location: "Bali, Indonesia",             fact: "Perched on a 70 m sea cliff, the temple was founded in the 11th century and is guarded by a troop of sacred macaque monkeys." },
  komodoPark:       { name: "Komodo National Park",      location: "East Nusa Tenggara, Indonesia",fact: "Home to the Komodo dragon — Earth's largest lizard at 3 m — which kills prey with bacteria-laden saliva, then tracks it for days." },
  prambananJava:    { name: "Prambanan Temple",          location: "Yogyakarta, Java, Indonesia",  fact: "248 Hindu temples built in 850 AD — the central Shiva tower stands 47 m tall and was only rediscovered by the Dutch in 1811." },

  // ── Portugal ───────────────────────────────────────────────────────────
  lisbonBelem:      { name: "Belém Tower",               location: "Lisbon, Portugal",            fact: "Built in 1516 to guard the Tagus river entrance, Vasco da Gama sailed past this tower on his way to discover the sea route to India." },
  sintraPortugal:   { name: "Sintra Palaces",            location: "Sintra, Lisbon Region, Portugal",fact: "Lord Byron called Sintra 'glorious Eden' — its fairy-tale palaces atop forested hills convinced UNESCO to protect an entire cultural landscape." },

  // ── Netherlands ────────────────────────────────────────────────────────
  keukenhofTulips:  { name: "Keukenhof Tulip Gardens",  location: "Lisse, South Holland",        fact: "7 million bulbs bloom every spring across 32 hectares — open for only 8 weeks a year and visited by 1.5 million people." },
  kinderdijkMills:  { name: "Kinderdijk Windmills",      location: "South Holland, Netherlands",  fact: "19 windmills built in 1740 pump water from a polder 2 m below sea level — they've run continuously for 275 years." },

  // ── Other ──────────────────────────────────────────────────────────────
  pragueCastle:     { name: "Prague Castle",             location: "Prague, Czech Republic",       fact: "The world's largest ancient castle complex by area (70,000 m²) — it contains a palace, three churches, and a golden lane of tiny houses." },
  hallstatt:        { name: "Hallstatt",                 location: "Upper Austria, Austria",       fact: "3,000 years of continuous habitation — it was so beautiful China built an exact replica of the entire village in Guangdong." },
  interlaken:       { name: "Interlaken",                location: "Bernese Oberland, Switzerland",fact: "Squeezed between Lakes Thun and Brienz at 568 m, with the Eiger, Mönch, and Jungfrau towering above — the adventure sports capital of the Alps." },
  taProhm:          { name: "Ta Prohm Temple",           location: "Siem Reap, Cambodia",          fact: "Left un-restored so strangler fig trees wrap around its towers — the jungle 'swallowing' the temple was used in Tomb Raider." },
  sigiriya:         { name: "Sigiriya Rock Fortress",    location: "Central Province, Sri Lanka",  fact: "A 5th-century palace built atop a 200 m granite monolith — its frescoes of 'cloud maidens' are painted at a height of 100 m." },
  dalleTeaFields:   { name: "Nuwara Eliya Tea Fields",   location: "Central Province, Sri Lanka",  fact: "Ceylon tea was born here in 1867 when James Taylor planted the first commercial tea estate — the fields carpet the entire mountain range." },
  gyeongbokgung:    { name: "Gyeongbokgung Palace",      location: "Seoul, South Korea",           fact: "Built in 1395 for the Joseon Dynasty, it was deliberately destroyed by Japanese colonizers in 1910 — 100 of 330 buildings survive." },
  jejuIsland:       { name: "Jeju Island",               location: "Jeju, South Korea",            fact: "A shield volcano island where female divers called haenyeo hold their breath up to 2 minutes to harvest seafood — a 1,500-year tradition." },
  buenosAires:      { name: "Buenos Aires Obelisk",      location: "Buenos Aires, Argentina",      fact: "Built in 31 days in 1936 for the city's 400th anniversary — it's 67 m tall and hollow, with 206 steps to a viewing window at the top." },
  patagoniaArg:     { name: "Torres del Paine",          location: "Magallanes, Chile/Argentina",  fact: "The three Torres (towers) of pink granite rise 2,800 m — they were thrust upward by magma cooling underground then exposed by glaciers." },
  atacamaDesert:    { name: "Atacama Desert",            location: "Northern Chile",               fact: "The driest non-polar desert on Earth — some weather stations have never recorded rain. The Atacama has the world's clearest skies." },
  easterIsland:     { name: "Easter Island Moai",        location: "Easter Island (Rapa Nui), Chile",fact: "887 massive stone heads were carved between 1250–1500 AD — each weighs up to 80 tonnes and was moved up to 21 km using only ropes and manpower." },
  cartagenaCO:      { name: "Cartagena Walled City",     location: "Bolívar, Colombia",            fact: "Built by Spain in 1533, its 11 km of colonial walls once protected the greatest treasure port in the Americas from pirate attacks." },
  havanaOldCity:    { name: "Old Havana (La Habana Vieja)",location: "Havana, Cuba",               fact: "Frozen in time since the 1959 revolution — 1950s American cars still cruise past crumbling Baroque facades of pastel-painted mansions." },
  nairobiNP:        { name: "Nairobi National Park",     location: "Nairobi, Kenya",               fact: "The world's only wildlife park inside a capital city — lions roam with the Nairobi skyline as a backdrop just 7 km from downtown." },
  ngorongoroCrater: { name: "Ngorongoro Crater",         location: "Arusha Region, Tanzania",      fact: "The world's largest intact volcanic caldera (260 km²) traps 25,000 animals in a natural enclosure — including Africa's densest lion population." },
  kathmanduPatan:   { name: "Patan Durbar Square",       location: "Lalitpur, Nepal",              fact: "The medieval royal square has more ancient temples per km² than anywhere else on Earth — over 55 in a single city block." },
  bagan:            { name: "Bagan Temple Plains",       location: "Mandalay Region, Myanmar",     fact: "Over 2,200 Buddhist temples, pagodas, and monasteries spread across 42 km² — built between the 9th and 13th centuries." },
  persepolisIran:   { name: "Persepolis",                location: "Fars Province, Iran",          fact: "The Persian Empire's ceremonial capital built by Darius I in 518 BC — Alexander the Great burned it to the ground in 330 BC after a wild party." },

  // ── Ocean Animals ──────────────────────────────────────────────────────
  blueWhaleCA:      { name: "Blue Whale",                location: "Pacific Ocean, California",   fact: "The largest animal ever to live on Earth — up to 33 m long and 190 tonnes, with a heart the size of a small car." },
  blueWhaleSL:      { name: "Blue Whale",                location: "Indian Ocean, Sri Lanka",     fact: "Blue whale calls are the loudest sounds produced by any animal — heard 800 km away at 188 decibels." },
  blueWhaleAnt:     { name: "Blue Whale",                location: "Southern Ocean, Antarctica",  fact: "Blue whale populations were reduced to 1% of original numbers by whaling — now recovering at roughly 7% per year." },
  humpbackAtl:      { name: "Humpback Whale",            location: "North Atlantic Ocean",        fact: "Male humpbacks sing complex songs lasting up to 20 hours — all males in a population sing the same song, which evolves yearly." },
  humpbackHI:       { name: "Humpback Whale",            location: "Hawaiian Islands, Pacific",   fact: "3,000 humpbacks winter in Hawaiian waters to breed — mothers and calves can be seen from the shore from December to May." },
  humpbackAK:       { name: "Humpback Whale",            location: "Gulf of Alaska",              fact: "Humpbacks bubble-net feed cooperatively — groups circle prey with rising columns of bubbles to concentrate fish." },
  humpbackSA:       { name: "Humpback Whale",            location: "South Atlantic Ocean",        fact: "Southern humpbacks feed in Antarctica all summer then migrate 8,000 km to tropical breeding grounds — among Earth's longest migrations." },
  orcaPacNW:        { name: "Orca (Killer Whale)",       location: "Pacific Northwest, USA/Canada",fact: "Orca pods have distinct cultures — Southern Resident orcas even have their own dialect of clicks and whistles unique to their family." },
  orcaNorway:       { name: "Orca (Killer Whale)",       location: "Norwegian Sea, Norway",       fact: "Norwegian orcas herd herring into tight balls using bubble rings and tail slaps — then stun them with tail strikes to feed." },
  orcaNZ:           { name: "Orca (Killer Whale)",       location: "South Island, New Zealand",   fact: "NZ orcas deliberately beach themselves on stingrays — mothers teach calves this dangerous hunting technique over many years." },
  dolphinMed:       { name: "Common Dolphin Pod",        location: "Mediterranean Sea",           fact: "Common dolphins race alongside ships at 60 km/h — Mediterranean pods of up to 1,000 were seen by ancient Greek sailors." },
  dolphinCarib:     { name: "Bottlenose Dolphin Pod",    location: "Caribbean Sea",               fact: "Caribbean dolphins use sponges as tools to dig in sand — a behaviour taught mother to daughter, one of few animal cultures." },
  dolphinGulfMex:   { name: "Spinner Dolphin Pod",       location: "Gulf of Mexico",              fact: "Spinner dolphins earn their name by leaping and spinning up to 7 times in a single leap — no one knows exactly why they spin." },
  dolphinPacific:   { name: "Pacific White-sided Dolphin",location: "Eastern Pacific Ocean",      fact: "These aerobatic dolphins leap 6 m out of the water in precise synchronised jumps — they travel in superpods of 1,000+." },
  dolphinIndian:    { name: "Spinner Dolphin Pod",       location: "Indian Ocean",                fact: "Spinner dolphins sleep by 'logging' — floating motionless at the surface with half their brain resting while the other half stays alert." },
  dolphinAustralia: { name: "Indo-Pacific Bottlenose Dolphin",location: "Western Australia",      fact: "Shark Bay's dolphins use sponges on their beaks to dig seafloor — a skill 1,000 years old passed down through 5 female lineages." },
  spermAzores:      { name: "Sperm Whale",               location: "Azores, Atlantic Ocean",      fact: "Sperm whales dive 2 km deep and hold their breath for 90 min hunting giant squid — their clicks are the loudest animal sounds on Earth." },

  // ── Land Animals ───────────────────────────────────────────────────────
  lionKenya:        { name: "African Lion",              location: "Masai Mara, Kenya",           fact: "Lion prides are led by females who do 85% of hunting — a male's roar can be heard 8 km away and is used to advertise territory." },
  elephantBots:     { name: "African Elephant",          location: "Okavango Delta, Botswana",    fact: "Elephants mourn their dead, returning to bones for years — they can detect water 5 km underground with their feet." },
  polarBearArctic:  { name: "Polar Bear",                location: "Canadian Arctic",             fact: "Polar bears are the world's largest land predators — their fur appears white but is actually transparent and hollow, trapping heat." },
  penguinAntarct:   { name: "Emperor Penguin Colony",    location: "Weddell Sea, Antarctica",     fact: "Emperor penguins huddle in groups of 5,000 and take turns at the cold outer edge — the inside reaches 37°C in -50°C conditions." },
  penguinSA:        { name: "African Penguin Colony",    location: "Eastern Cape, South Africa",  fact: "African penguins were once called 'jackass penguins' because their call is an exact donkey bray — and equally loud." },
  kangarooAus:      { name: "Red Kangaroo",              location: "Outback, Central Australia",  fact: "Red kangaroos are the world's largest marsupials — they can jump 9 m in a single bound and reach 56 km/h." },
  giraffeSerengeti: { name: "Giraffe",                   location: "Serengeti, Tanzania",         fact: "Giraffes sleep only 30 minutes a day in 5-minute bursts — lying down makes them vulnerable to lions, so they often sleep standing up." },
  pandaSichuan:     { name: "Giant Panda",               location: "Sichuan Province, China",     fact: "Giant pandas have a 'false thumb' — an enlarged wrist bone they use to grip bamboo. They eat 12–38 kg of bamboo daily." },
  komodoDragonL:    { name: "Komodo Dragon",             location: "Komodo Island, Indonesia",    fact: "The world's largest lizard (3 m, 70 kg) can run 20 km/h and has venom glands — they can detect prey from 9.5 km away." },
  snowLeopardHim:   { name: "Snow Leopard",              location: "Himalayan Range",             fact: "Snow leopards cannot roar — they communicate with chuffs and yowls. Their thick tails (90 cm) double as scarves in the cold." },"""

if INFO_ANCHOR in content:
    content = content.replace(INFO_ANCHOR, INFO_NEW, 1)
    print('INFO entries injected OK')
else:
    print('INFO_ANCHOR not found!')

with open('app/plan/location/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Step 2 done')
