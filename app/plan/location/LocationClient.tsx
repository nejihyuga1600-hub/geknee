"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sphere, Stars, Html, useGLTF, Text, useTexture } from "@react-three/drei";
import { useEffect, useRef, useState, useMemo, Component, Suspense, type ReactNode } from "react";
import * as THREE from "three";
import { useRouter } from "next/navigation";
import { consumeGlobeTarget, consumeCameraZoom, flyToGlobe, zoomCamera, resetGlobeTilt, consumeResetTilt } from "@/lib/globeAnim";

const R = 10;

// ─── Surface positioning helpers ──────────────────────────────────────────────
// Converts geographic coordinates to a 3-D position on the globe surface plus
// a quaternion that aligns the local Y-axis with the outward radial direction,
// so any child geometry "stands up" perpendicular to the sphere.
type SurfPos = { pos: [number, number, number]; q: THREE.Quaternion };
function geo(lat: number, lon: number): SurfPos {
  const φ = (lat * Math.PI) / 180;
  const λ = (lon * Math.PI) / 180;
  // Three.js SphereGeometry UV seam is at phi=0 → -X axis, with U increasing
  // counter-clockwise (viewed from above).  Its equirectangular mapping puts
  // lon=0° (Greenwich) at +X, lon=90°E at -Z, lon=90°W at +Z.
  // Matching that convention: x = cos(λ), z = -sin(λ) (at the equator).
  const x =  R * Math.cos(φ) * Math.cos(λ);
  const y =  R * Math.sin(φ);
  const z = -R * Math.cos(φ) * Math.sin(λ);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(x, y, z).normalize(),
  );
  return { pos: [x, y, z], q };
}

// Pre-computed positions for every landmark (runs once at module load)
const L = {
  // ── New Seven Wonders ───────────────────────────────────────────────────────
  greatWall:      geo( 40.43,  116.57),  // Badaling, China
  petra:          geo( 30.33,   35.44),  // Jordan
  christRedeem:   geo(-22.95,  -43.21),  // Rio de Janeiro
  machuPicchu:    geo(-13.16,  -72.54),  // Peru
  chichenItza:    geo( 20.68,  -88.57),  // Mexico
  colosseum:      geo( 41.89,   12.49),  // Rome
  tajMahal:       geo( 27.17,   78.04),  // Agra, India
  // ── Europe ──────────────────────────────────────────────────────────────────
  eiffelTower:    geo( 48.86,    2.29),  // Paris
  acropolis:      geo( 37.97,   23.73),  // Athens
  stonehenge:     geo( 51.18,   -1.83),  // Wiltshire, UK
  sagradaFamilia: geo( 41.40,    2.17),  // Barcelona
  // ── Asia ────────────────────────────────────────────────────────────────────
  angkorWat:      geo( 13.41,  103.87),  // Cambodia
  borobudur:      geo( -7.61,  110.20),  // Indonesia
  tokyoSkytree:   geo( 35.71,  139.81),  // Tokyo
  // ── Africa ──────────────────────────────────────────────────────────────────
  pyramidGiza:    geo( 29.98,   31.13),  // Egypt
  tableMountain:  geo(-33.96,   18.41),  // Cape Town
  // ── Americas ────────────────────────────────────────────────────────────────
  statueLiberty:  geo( 40.69,  -74.04),  // New York
  mtRushmore:     geo( 43.88, -103.46),  // South Dakota
  goldenGate:     geo( 37.82, -122.48),  // San Francisco
  // ── Natural attractions ─────────────────────────────────────────────────────
  grandCanyon:    geo( 36.06, -112.11),  // Arizona]
  niagaraFalls:   geo( 43.08,  -79.07),  // Ontario / New York
  iguazuFalls:    geo(-25.69,  -54.44),  // Argentina / Brazil
  galapagos:      geo( -0.60,  -91.00),  // Ecuador
  plitviceLakes:  geo( 44.88,   15.62),  // Croatia
  swissAlps:      geo( 46.54,    7.97),  // Jungfrau, Switzerland
  mtEverest:      geo( 27.99,   86.93),  // Nepal / China
  haLongBay:      geo( 20.91,  107.18),  // Vietnam
  victoriaFalls:  geo(-17.92,   25.86),  // Zimbabwe / Zambia
  greatBarrierReef: geo(-18.29, 147.70), // Queensland, Australia
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

  // ── Europe (new) ──
  louvre:              geo( 48.861,   2.336),
  notredame:           geo( 48.853,   2.350),
  versailles:          geo( 48.805,   2.120),
  towerLondon:         geo( 51.508,  -0.076),
  cologneCathedral:    geo( 50.941,   6.958),
  praguecastle:        geo( 50.091,  14.400),
  budapestParliament:  geo( 47.507,  19.046),
  schoenbrunnPalace:   geo( 48.185,  16.312),
  amsterdamCanals:     geo( 52.374,   4.890),
  leaningTower:        geo( 43.723,  10.397),
  florenceDuomo:       geo( 43.773,  11.256),
  veniceGrandCanal:    geo( 45.440,  12.331),
  dubrovnik:           geo( 42.641,  18.111),
  santorini:           geo( 36.393,  25.461),
  cliffsOfMoher:       geo( 52.971,  -9.426),
  matterhorn:          geo( 45.977,   7.659),
  northernLightsIce:   geo( 64.128, -21.944),
  blueLagoonIce:       geo( 63.880, -22.449),
  lofotenNorway:       geo( 68.130,  13.960),
  // ── Asia (new) ──
  mtFuji:              geo( 35.361, 138.729),
  kinkakuji:           geo( 35.040, 135.729),
  sensoji:             geo( 35.715, 139.796),
  osakacastle:         geo( 34.687, 135.526),
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
  tigersNestBhutan:    geo( 27.491,  89.362),
  sigiriyaSriLanka:    geo(  7.957,  80.760),
  varanasi:            geo( 25.317,  83.013),
  amberFort:           geo( 26.985,  75.851),
  // ── Africa (new) ──
  masaiMara:           geo( -1.489,  35.142),
  capeOfGoodHope:      geo(-34.358,  18.474),
  marrakechMedina:     geo( 31.629,  -7.981),
  saharaDunes:         geo( 25.000,   0.000),
  abuSimbel:           geo( 22.337,  31.626),
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
  tulumRuins:          geo( 20.215, -87.429),
  cnTower:             geo( 43.642, -79.387),
  oldQuebecCity:       geo( 46.813, -71.207),
  panamaCanal:         geo(  9.080, -79.680),
  angelFalls:          geo(  5.967, -62.535),
  salarDeUyuni:        geo(-20.137, -67.489),
  cartagena:           geo( 10.423, -75.535),
  torresDePaine:       geo(-50.942, -73.406),
  // ── Oceania (new) ──
  sydneyOperaHouse:    geo(-33.857, 151.215),
  sydneyHarbourBridge: geo(-33.852, 151.211),
  rotuaGeothermal:     geo(-38.137, 176.252),
};

// ─── Landmark density scale (precomputed at module load) ──────────────────────
// For each landmark, find its nearest angular neighbour. If landmarks are
// packed closer than DENSITY_THR degrees, shrink them proportionally so they
// don't overlap. Uses the SurfPos object reference as the map key.
const DENSITY_THR = 6;   // degrees — below this, models start shrinking
const DENSITY_MIN = 0.3; // floor — never smaller than 30 % of base size
const LM_DENSITY: Map<SurfPos, number> = (() => {
  const entries = Object.values(L) as SurfPos[];
  const units   = entries.map(p => new THREE.Vector3(...p.pos).normalize());
  const map     = new Map<SurfPos, number>();
  entries.forEach((p, i) => {
    let minDeg = 180;
    for (let j = 0; j < units.length; j++) {
      if (i === j) continue;
      const dot = Math.max(-1, Math.min(1, units[i].dot(units[j])));
      minDeg = Math.min(minDeg, (Math.acos(dot) * 180) / Math.PI);
    }
    map.set(p, minDeg >= DENSITY_THR ? 1 : Math.max(DENSITY_MIN, minDeg / DENSITY_THR));
  });
  return map;
})();

// ─── Hover label data ─────────────────────────────────────────────────────────
const INFO = {
  greatWall:       { name: "Great Wall of China",   location: "Badaling, China",                    fact: "At 13,170 miles long it could circle the Earth more than half a time — and it took 2,000 years to build." },
  petra:           { name: "Petra",                  location: "Ma'an Governorate, Jordan",           fact: "This entire rose-red city was carved straight into sandstone cliffs by the Nabataeans over 2,000 years ago." },
  christRedeem:    { name: "Christ the Redeemer",    location: "Rio de Janeiro, Brazil",              fact: "Its outstretched arms span 28 metres — wide enough to cast a shadow over a full-size swimming pool." },
  machuPicchu:     { name: "Machu Picchu",           location: "Cusco Region, Peru",                  fact: "Perched at 2,430 m in the clouds, this Inca citadel was completely unknown to the outside world until 1911." },
  chichenItza:     { name: "Chichen Itza",           location: "Yucatán, Mexico",                     fact: "Every equinox a shadow serpent appears to slither down the pyramid's staircase at sunset — a feat of ancient astronomy." },
  colosseum:       { name: "The Colosseum",          location: "Rome, Italy",                         fact: "Its 80 numbered arches let 50,000 spectators find their seats and exit in minutes — Rome's first crowd-control system." },
  tajMahal:        { name: "Taj Mahal",              location: "Agra, India",                         fact: "Emperor Shah Jahan hired 20,000 workers for 22 years to build this perfect marble mausoleum for his beloved wife." },
  eiffelTower:     { name: "Eiffel Tower",           location: "Paris, France",                       fact: "Its iron expands in summer heat — the tower grows up to 15 cm taller on a hot day than on a cold one." },
  acropolis:       { name: "Acropolis of Athens",    location: "Athens, Greece",                      fact: "The Parthenon's columns lean inward slightly — a deliberate optical illusion so they appear perfectly straight from below." },
  stonehenge:      { name: "Stonehenge",             location: "Wiltshire, England",                  fact: "The 25-tonne bluestones were dragged 200 miles from Wales around 2500 BC — and exactly how remains a mystery." },
  sagradaFamilia:  { name: "Sagrada Família",        location: "Barcelona, Spain",                    fact: "Construction began in 1882 and is still ongoing — making it the world's most ambitious unfinished building project." },
  angkorWat:       { name: "Angkor Wat",             location: "Siem Reap, Cambodia",                 fact: "The largest religious monument on Earth — its surrounding moat alone could swallow 100 Olympic swimming pools." },
  borobudur:       { name: "Borobudur",              location: "Central Java, Indonesia",             fact: "This 9th-century Buddhist stupa has 2,672 relief panels — laid end to end their stories would stretch 6 km." },
  tokyoSkytree:    { name: "Tokyo Skytree",          location: "Sumida, Tokyo, Japan",               fact: "At exactly 634 m it's the world's tallest tower — the height in metres spells out the old name of its region in Japanese." },
  pyramidGiza:     { name: "Great Pyramid of Giza",  location: "Giza, Egypt",                         fact: "Built from 2.3 million stone blocks, it was the world's tallest structure for an unbeaten 3,800 years." },
  tableMountain:   { name: "Table Mountain",         location: "Cape Town, South Africa",             fact: "Its flat summit holds more plant species per square metre than any rainforest on Earth — over 1,400 unique plants." },
  statueLiberty:   { name: "Statue of Liberty",      location: "New York Harbor, USA",                fact: "Lady Liberty's index finger is 2.4 m long — roughly the height of an adult standing upright." },
  mtRushmore:      { name: "Mount Rushmore",         location: "Black Hills, South Dakota, USA",      fact: "Each president's face is 18 m tall — if their full bodies were carved, the figures would stand as tall as a 46-storey skyscraper." },
  goldenGate:      { name: "Golden Gate Bridge",     location: "San Francisco, California, USA",      fact: "Its suspension cables contain 80,000 miles of steel wire — enough to wrap around the Earth more than three times." },
  grandCanyon:     { name: "Grand Canyon",           location: "Arizona, USA",                        fact: "Up to 29 km wide and 1.8 km deep, its exposed rock layers tell 2 billion years of Earth's geological history." },
  niagaraFalls:    { name: "Niagara Falls",          location: "Ontario, Canada / New York, USA",     fact: "Over 168,000 m³ of water thunders over the edge every minute — enough to fill 67 Olympic pools in 60 seconds." },
  iguazuFalls:     { name: "Iguazu Falls",           location: "Argentina / Brazil border",           fact: "Nearly 3 km wide, the falls are so stunning that Eleanor Roosevelt reportedly gasped 'Poor Niagara!' on first sight." },
  galapagos:       { name: "Galápagos Islands",      location: "Pacific Ocean, Ecuador",              fact: "Darwin's 1835 visit here inspired his theory of evolution — the animals still show absolutely no fear of humans." },
  plitviceLakes:   { name: "Plitvice Lakes",         location: "Lika-Senj County, Croatia",           fact: "16 terraced lakes linked by 92 waterfalls, with water so clear you can count every fish and pebble through the surface." },
  swissAlps:       { name: "Swiss Alps / Jungfrau",  location: "Bernese Oberland, Switzerland",       fact: "The Jungfraujoch station at 3,454 m is Europe's highest railway station — it took 16 years to drill the tunnel through solid rock." },
  mtEverest:       { name: "Mount Everest",          location: "Nepal / Tibet border, Himalayas",     fact: "The summit drifts about 40 mm north-east every year as the Indian tectonic plate relentlessly pushes into Asia." },
  haLongBay:       { name: "Ha Long Bay",            location: "Quảng Ninh Province, Vietnam",       fact: "Over 1,600 limestone karst islands rise from the emerald sea — many are entirely hollow with vast hidden caves inside." },
  victoriaFalls:   { name: "Victoria Falls",         location: "Zimbabwe / Zambia border",            fact: "At 1.7 km wide and 108 m tall, its thundering roar and mist cloud are visible and audible from over 40 km away." },
  greatBarrierReef:{ name: "Great Barrier Reef",     location: "Queensland, Australia",               fact: "The only living organism visible from space — spanning 2,300 km and sheltering over 9,000 known species." },
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

  louvre:              { name: "Louvre Museum",             location: "Paris, France",                  fact: "The world's most visited art museum holds 35,000 works on display including the Mona Lisa in a former 12th-century royal palace." },
  notredame:           { name: "Notre-Dame Cathedral",      location: "Paris, France",                  fact: "Construction took nearly 200 years (1163-1345). Its iconic gargoyles were added in the 19th century and actually serve as water spouts." },
  versailles:          { name: "Palace of Versailles",      location: "Versailles, France",             fact: "The Hall of Mirrors has 357 mirrors and 20,000 candles. The palace grounds cover 800 hectares with 50 fountains." },
  towerLondon:         { name: "Tower of London",           location: "London, UK",                     fact: "Home to the Crown Jewels, it has served as palace, prison, and zoo. Its resident ravens are said to protect the Crown." },
  cologneCathedral:    { name: "Cologne Cathedral",         location: "Cologne, Germany",               fact: "Took 632 years to complete (1248-1880) and was the world's tallest structure for 4 years. It miraculously survived WWII bombing raids around it." },
  praguecastle:        { name: "Prague Castle",             location: "Prague, Czech Republic",         fact: "The largest coherent castle complex in the world at 70,000 sq m, continuously inhabited since the 9th century." },
  budapestParliament:  { name: "Budapest Parliament",       location: "Budapest, Hungary",              fact: "Built 1885-1904 with 691 rooms and 19 km of stairs. Its central dome is exactly the same height as St. Stephen's Basilica - 96 m." },
  schoenbrunnPalace:   { name: "Schoenbrunn Palace",        location: "Vienna, Austria",                fact: "The Habsburg imperial summer residence has 1,441 rooms. Its zoo, founded in 1752, is the world's oldest continuously operating zoo." },
  amsterdamCanals:     { name: "Amsterdam Canal Ring",      location: "Amsterdam, Netherlands",         fact: "17th-century canal ring with 165 canals. Amsterdam has more bridges (1,500) than Venice and more bicycles (800,000) than people." },
  leaningTower:        { name: "Leaning Tower of Pisa",     location: "Pisa, Italy",                    fact: "Began leaning during construction in 1173 due to soft soil. Engineers corrected it from 5.5 degrees to 3.99 degrees tilt - it leans 3.9 metres off vertical." },
  florenceDuomo:       { name: "Florence Cathedral",        location: "Florence, Italy",                fact: "Brunelleschi's dome (completed 1436) was the world's largest for 500 years. He invented new machinery to build it and kept the blueprints secret." },
  veniceGrandCanal:    { name: "Venice Grand Canal",        location: "Venice, Italy",                  fact: "Built on 118 islands connected by 400+ bridges. The city is slowly sinking 1-2mm per year. No cars - gondolas are the only transport." },
  dubrovnik:           { name: "Dubrovnik Old Town",        location: "Dubrovnik, Croatia",             fact: "Its 2 km medieval walls were never breached by siege. George R.R. Martin used it as inspiration for King's Landing in Game of Thrones." },
  santorini:           { name: "Santorini",                 location: "Cyclades, Greece",               fact: "The iconic blue-domed churches sit on the rim of a massive volcanic caldera. Some believe the island is the lost city of Atlantis." },
  cliffsOfMoher:       { name: "Cliffs of Moher",           location: "County Clare, Ireland",          fact: "Rise 214 m above the Atlantic Ocean and stretch 14 km along Ireland's west coast. On a clear day you can see the Aran Islands from the top." },
  matterhorn:          { name: "Matterhorn",                location: "Zermatt, Switzerland",           fact: "One of the most photographed mountains in the world at 4,478 m. It took 7 attempts before Whymper's team first summited in 1865 - 4 died descending." },
  northernLightsIce:   { name: "Northern Lights",           location: "Reykjavik, Iceland",             fact: "Aurora borealis occurs when charged solar particles hit Earth's atmosphere at 72 million km/h. Iceland sits directly under the auroral oval." },
  blueLagoonIce:       { name: "Blue Lagoon",               location: "Grindavik, Iceland",             fact: "Its milky-blue geothermal waters reach 37-40 degrees Celsius year-round. The same water that creates the lagoon drives a nearby geothermal power plant." },
  lofotenNorway:       { name: "Lofoten Islands",           location: "Nordland, Norway",               fact: "A dramatic archipelago above the Arctic Circle with jagged peaks rising from the sea. Home to the world's largest cod fishery for over 1,000 years." },
  mtFuji:              { name: "Mount Fuji",                location: "Honshu, Japan",                  fact: "Japan's highest peak at 3,776 m has been climbed by over 300,000 people every summer season. It is an active stratovolcano that last erupted in 1707." },
  kinkakuji:           { name: "Kinkaku-ji Golden Pavilion", location: "Kyoto, Japan",                  fact: "The top two floors are covered in pure gold leaf. A Zen monk burned it down in 1950 out of obsession - the event inspired a famous Mishima novel." },
  sensoji:             { name: "Senso-ji Temple",           location: "Asakusa, Tokyo, Japan",          fact: "Tokyo's oldest temple, founded in 628 AD. The giant red lantern at Kaminarimon Gate weighs 670 kg. It receives 30 million visitors annually." },
  osakacastle:         { name: "Osaka Castle",              location: "Osaka, Japan",                   fact: "Built in 1583 by Toyotomi Hideyoshi and surrounded by a double moat. The current structure is a 1931 concrete reconstruction housing a museum." },
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
  tigersNestBhutan:    { name: "Tiger's Nest Monastery",    location: "Paro Valley, Bhutan",            fact: "Clings to a 3,000 m cliff face with no road access - only a 2-hour hike up. Legend says Guru Rinpoche flew here on a tigress to meditate in the cave." },
  sigiriyaSriLanka:    { name: "Sigiriya Rock Fortress",    location: "Central Province, Sri Lanka",    fact: "A 200 m-high rock fortress with a palace at the top, built around 477 AD. The 5th-century frescoes of the Cloud Maidens on the rock face are still vivid today." },
  varanasi:            { name: "Varanasi Ghats",            location: "Uttar Pradesh, India",           fact: "The world's oldest continuously inhabited city at 3,000+ years. Hindus believe dying here grants liberation. 80 ghats line the sacred Ganges river." },
  amberFort:           { name: "Amber Fort",                location: "Jaipur, India",                  fact: "A stunning hilltop fort built from yellow sandstone and white marble. Its Sheesh Mahal (Hall of Mirrors) is lined with thousands of tiny mirror tiles." },
  masaiMara:           { name: "Maasai Mara",               location: "Kenya",                          fact: "Africa's most famous game reserve hosts the Great Migration crossing of the Mara River. The Big Five all live here." },
  capeOfGoodHope:      { name: "Cape of Good Hope",         location: "Western Cape, South Africa",     fact: "Once thought to be Africa's southernmost tip (it's actually Cape Agulhas). Bartolomeu Dias first rounded it in 1488, opening the sea route to India." },
  marrakechMedina:     { name: "Marrakech Medina",          location: "Morocco",                        fact: "A labyrinthine 12th-century walled city with the Djemaa el-Fna square at its heart. Snake charmers and storytellers have gathered there for 1,000 years." },
  saharaDunes:         { name: "Sahara Desert",             location: "North Africa",                   fact: "The world's largest hot desert at 9.2 million sq km - roughly the size of the USA. Sand dunes can reach 180 m high." },
  abuSimbel:           { name: "Abu Simbel Temples",        location: "Aswan, Egypt",                   fact: "Two temples carved directly into a mountainside by Ramesses II around 1264 BC. UNESCO moved the entire complex 65 m up in 1968 to save it from Lake Nasser." },
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
  tulumRuins:          { name: "Tulum Ruins",               location: "Quintana Roo, Mexico",           fact: "The only major Mayan coastal city, perched on 12 m cliffs above turquoise Caribbean water. It was one of the last cities built and inhabited by the Maya." },
  cnTower:             { name: "CN Tower",                  location: "Toronto, Canada",                fact: "Stood as the world's tallest free-standing structure 1976-2007 at 553 m. Lightning strikes it about 75 times per year - it acts as a lightning rod for the city." },
  oldQuebecCity:       { name: "Old Quebec City",           location: "Quebec, Canada",                 fact: "The only walled city north of Mexico in North America. The Chateau Frontenac hotel is the world's most photographed hotel." },
  panamaCanal:         { name: "Panama Canal",              location: "Panama",                         fact: "Cut 15,000 km from the voyage between New York and San Francisco. Each ship transit uses 197 million litres of fresh water - all by gravity, no pumps needed." },
  angelFalls:          { name: "Angel Falls",               location: "Bolivar, Venezuela",             fact: "The world's highest uninterrupted waterfall at 979 m - 15 times the height of Niagara. Named after American bush pilot Jimmy Angel who flew over it in 1933." },
  salarDeUyuni:        { name: "Salar de Uyuni",            location: "Potosi, Bolivia",                fact: "The world's largest salt flat covers 10,582 sq km and contains 50-70% of the world's lithium reserves. After rain, it creates a perfect mirror reflection of the sky." },
  cartagena:           { name: "Cartagena Old City",        location: "Bolivar, Colombia",              fact: "A UNESCO-listed walled colonial city. Gabriel Garcia Marquez set many stories here. The 13 km of city walls built to repel pirates remain largely intact after 400 years." },
  torresDePaine:       { name: "Torres del Paine",          location: "Patagonia, Chile",               fact: "Three granite towers rising 2,800 m above the Patagonian steppe. The park is so remote it took 3 days by horseback just to reach the base of the towers until the 1970s." },
  sydneyOperaHouse:    { name: "Sydney Opera House",        location: "Sydney, Australia",              fact: "Designed by Danish architect Jorn Utzon, its shell-like roof vaults were revolutionary. Built 1959-73, it hosts 8 million visitors and 1,500+ performances annually." },
  sydneyHarbourBridge: { name: "Sydney Harbour Bridge",     location: "Sydney, Australia",              fact: "The world's largest steel arch bridge at 1,149 m long. 16 workers died during construction. You can climb the arch to the 134 m summit." },
  rotuaGeothermal:     { name: "Rotorua Geothermal Park",   location: "Bay of Plenty, New Zealand",     fact: "Sits on top of the Taupo Volcanic Zone, one of the most active geothermal regions on Earth. Boiling mud pools and geysers shoot up to 30 m into the sky." },
  snowLeopardHim:   { name: "Snow Leopard",              location: "Himalayan Range",             fact: "Snow leopards cannot roar — they communicate with chuffs and yowls. Their thick tails (90 cm) double as scarves in the cold." },
};

// ─── GeoJSON types ────────────────────────────────────────────────────────────
type GeoFeature = {
  geometry: { type: string; coordinates: number[][][][] | number[][][] } | null;
  properties: Record<string, string>;
};
type GeoCollection = { features: GeoFeature[] };

// ─── Canvas Earth texture ─────────────────────────────────────────────────────
function createEarthTexture(
  countriesGeo: GeoCollection | null,
  statesGeo: GeoCollection | null,
  terrainBitmap?: ImageBitmap | null,
): THREE.CanvasTexture {
  const W = 8192, H = 4096;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.lineJoin = "round";
  ctx.lineCap  = "round";

  // lon/lat → canvas pixel
  function px(lon: number, lat: number): [number, number] {
    return [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
  }

  if (terrainBitmap) {
    // ── NASA/USGS terrain: draw satellite imagery as the base layer ──────────
    ctx.drawImage(terrainBitmap, 0, 0, W, H);
    // Subtle polar darkening to match real Earth photography
    const polar = ctx.createLinearGradient(0, 0, 0, H);
    polar.addColorStop(0,    "rgba(0,10,40,0.28)");
    polar.addColorStop(0.13, "rgba(0,0,0,0)");
    polar.addColorStop(0.87, "rgba(0,0,0,0)");
    polar.addColorStop(1,    "rgba(0,10,40,0.28)");
    ctx.fillStyle = polar;
    ctx.fillRect(0, 0, W, H);
  } else {
    // ── Mario Galaxy cartoon ocean — vivid candy cyan-blue ───────────────────
    const sea = ctx.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0,    "#0048c8");   // polar deep blue
    sea.addColorStop(0.3,  "#0078f0");   // mid-latitude vivid
    sea.addColorStop(0.5,  "#10a8ff");   // equatorial bright cyan
    sea.addColorStop(0.7,  "#0078f0");
    sea.addColorStop(1,    "#0048c8");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Helper: fill one GeoJSON feature's geometry ───────────────────────────
  // Uses evenodd so polygon holes (e.g. lake-islands) render correctly.
  // Breaks the path at antimeridian crossings to avoid horizontal bands.
  function fillGeometry(geom: NonNullable<GeoFeature["geometry"]>) {
    const polygons: number[][][][] =
      geom.type === "Polygon"      ? [geom.coordinates as number[][][]] :
      geom.type === "MultiPolygon" ?  geom.coordinates as number[][][][] :
      [];

    for (const polygon of polygons) {
      ctx.beginPath();
      for (const ring of polygon) {
        let prevLon = (ring[0] as number[])[0];
        let started = false;
        for (const coord of ring as number[][]) {
          const [lon, lat] = coord;
          // At the antimeridian, close + fill the current segment, then restart
          if (started && Math.abs(lon - prevLon) > 180) {
            ctx.closePath();
            ctx.fill("evenodd");
            ctx.beginPath();
            started = false;
          }
          const [x, y] = px(lon, lat);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else          { ctx.lineTo(x, y); }
          prevLon = lon;
        }
        ctx.closePath();
      }
      ctx.fill("evenodd");
    }
  }

  // ── Helper: stroke borders for every feature in a GeoJSON collection ──────
  function drawBorders(
    data: GeoCollection | null,
    color: string,
    width: number,
    filter?: (f: GeoFeature) => boolean,
  ) {
    if (!data) return;
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;

    for (const feature of data.features) {
      if (filter && !filter(feature)) continue;
      const geom = feature.geometry;
      if (!geom) continue;

      const polygons: number[][][][] =
        geom.type === "Polygon"      ? [geom.coordinates as number[][][]] :
        geom.type === "MultiPolygon" ?  geom.coordinates as number[][][][] :
        [];

      for (const polygon of polygons) {
        for (const ring of polygon) {
          let prevLon = (ring[0] as number[])[0];
          ctx.beginPath();
          let started = false;
          for (const coord of ring as number[][]) {
            const [lon, lat] = coord;
            if (started && Math.abs(lon - prevLon) > 180) {
              ctx.stroke(); ctx.beginPath(); started = false;
            }
            const [x, y] = px(lon, lat);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else          { ctx.lineTo(x, y); }
            prevLon = lon;
          }
          ctx.stroke();
        }
      }
    }
  }

  // ── Land fills — only in fallback mode; satellite imagery has its own colours
  if (!terrainBitmap && countriesGeo) {
    // ── Mario Galaxy cartoon continent palette — vivid, supersaturated ────────
    const CONTINENT_COLOR: Record<string, string> = {
      "North America": "#58e020",  // vivid lime green
      "South America": "#18d848",  // vivid emerald
      "Europe":        "#80ec40",  // bright yellow-green
      "Africa":        "#d0c020",  // vivid golden savanna (default)
      "Asia":          "#50d828",  // vivid medium green
      "Oceania":       "#60e828",  // vivid lime
      "Antarctica":    "#f0f8ff",  // pure bright white ice
    };

    // Per-country cartoon overrides — bold, clearly distinct biome colours
    const COUNTRY_COLOR: Record<string, string> = {
      // ── Saharan North Africa — blazing golden sand ───────────────────────
      "MAR": "#ffc820", "DZA": "#ffb810", "TUN": "#ffbe18",
      "LBY": "#ffb010", "EGY": "#ffa808", "ESH": "#ffc020",
      "MRT": "#f8b010", "MLI": "#f4aa08", "NER": "#f0a808",
      "TCD": "#e8a010", "SDN": "#e09808",
      // ── Arabian peninsula — vivid warm amber ────────────────────────────
      "SAU": "#ffb820", "YEM": "#f0a010", "OMN": "#f8aa10",
      "ARE": "#ffc028", "KWT": "#ffc028", "QAT": "#ffb820",
      "BHR": "#ffb820", "JOR": "#f0a818", "IRQ": "#d89820",
      "IRN": "#b8a840", "AFG": "#c0a040", "PAK": "#c8a838",
      // ── Central & West African tropics — vivid jungle green ──────────────
      "COD": "#10d838", "COG": "#18d840", "GAB": "#18d840",
      "CMR": "#28dc48", "CAF": "#28dc48", "NGA": "#38e050",
      "GHA": "#40e058", "CIV": "#38e050", "SEN": "#48e058",
      "GIN": "#40e058", "SLE": "#40e058", "LBR": "#40e058",
      // ── Australia — blazing vivid orange-red outback ──────────────────────
      "AUS": "#ff5808",
      // ── Greenland & Iceland — vivid ice blue-white ───────────────────────
      "GRL": "#c8f0ff", "ISL": "#b8e8ff",
      // ── Russia — bright boreal green ────────────────────────────────────
      "RUS": "#40d858",
      // ── Canada — fresh forest green ──────────────────────────────────────
      "CAN": "#50e030",
      // ── USA — vivid mid green ─────────────────────────────────────────────
      "USA": "#68e838",
      // ── Brazil — vivid Amazon ─────────────────────────────────────────────
      "BRA": "#10e040",
      // ── China — bright green ──────────────────────────────────────────────
      "CHN": "#58d828",
      // ── India — warm green-gold ───────────────────────────────────────────
      "IND": "#90d828",
      // ── Scandinavia / Nordic — cool fresh green ───────────────────────────
      "NOR": "#70e840", "SWE": "#70e840", "FIN": "#68e038",
    };

    for (const feature of countriesGeo.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      const iso = (feature.properties.ISO_A3 ?? feature.properties.iso_a3 ?? "") as string;
      const continent =
        (feature.properties.CONTINENT ?? feature.properties.continent ?? "") as string;
      ctx.fillStyle = COUNTRY_COLOR[iso] ?? CONTINENT_COLOR[continent] ?? "#5a8c30";
      fillGeometry(geom);
    }
  } else if (!terrainBitmap) {
    // Fallback cartoon fills while GeoJSON loads — vivid Mario Galaxy palette
    function poly(pts: [number, number][], fill: string) {
      ctx.beginPath();
      ctx.moveTo(...px(pts[0][0], pts[0][1]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(...px(pts[i][0], pts[i][1]));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.fillStyle = "#f0f8ff";
    ctx.fillRect(0, px(0, -67)[1], W, H - px(0, -67)[1]); // Antarctica — bright white
    poly([[-168,71],[-140,72],[-110,70],[-85,70],[-75,63],[-62,63],[-60,47],[-66,44],[-70,41],[-74,40],[-75,35],[-80,25],[-85,10],[-78,8],[-75,8],[-84,10],[-88,16],[-90,21],[-97,22],[-105,22],[-110,24],[-117,32],[-122,37],[-124,49],[-135,58],[-152,59],[-165,54],[-168,63]], "#58e020"); // N America vivid lime
    poly([[-44,83],[-17,83],[-17,77],[-20,70],[-25,67],[-45,60],[-52,68],[-56,78],[-52,83]], "#c8f0ff"); // Greenland ice blue
    poly([[-80,9],[-75,11],[-60,12],[-50,5],[-35,5],[-34,-8],[-36,-15],[-39,-22],[-42,-23],[-45,-30],[-52,-34],[-65,-44],[-70,-55],[-74,-55],[-68,-52],[-63,-40],[-60,-30],[-58,-20],[-60,-5],[-70,-3],[-78,0]], "#18d848"); // S America vivid emerald
    poly([[-9,36],[5,36],[15,37],[28,41],[30,46],[27,57],[27,61],[22,65],[18,62],[5,58],[0,50],[-5,46]], "#80ec40"); // Europe bright
    poly([[5,58],[8,58],[15,66],[20,71],[28,71],[30,68],[26,63],[18,60],[10,57]], "#70e840"); // Scandinavia
    poly([[-17,15],[-17,22],[-14,29],[-2,36],[10,37],[25,37],[37,30],[40,22],[45,14],[51,12],[44,12],[41,3],[42,-2],[35,-5],[35,-11],[32,-25],[26,-34],[18,-35],[12,-28],[8,-5],[4,5],[-5,5],[-15,12]], "#d0c020"); // Africa golden
    poly([[44,-12],[50,-15],[51,-22],[46,-26],[44,-24],[44,-18]], "#40e058"); // Madagascar
    poly([[26,37],[36,37],[42,30],[37,22],[43,15],[50,12],[58,20],[60,22],[65,25],[68,24],[80,28],[88,22],[100,14],[104,10],[108,5],[120,22],[130,33],[140,40],[145,43],[148,48],[142,54],[140,58],[138,65],[130,70],[100,73],[80,74],[60,70],[55,65],[45,60],[38,65],[30,60],[27,57],[30,50],[26,46]], "#50d828"); // Asia
    poly([[68,23],[74,22],[80,28],[88,22],[88,14],[80,8],[77,8],[72,14]], "#90d828"); // India warm
    poly([[36,30],[37,22],[43,15],[50,12],[58,20],[58,27],[55,28],[50,30],[44,30],[38,30]], "#ffb820"); // Arabia vivid amber
    poly([[114,-22],[122,-22],[129,-14],[136,-12],[140,-16],[145,-18],[152,-26],[153,-28],[151,-35],[145,-38],[138,-35],[130,-32],[124,-34],[115,-35],[114,-32]], "#ff5808"); // Australia vivid orange
    poly([[174,-37],[178,-38],[178,-41],[175,-43],[173,-41],[173,-39]], "#60e828"); // NZ North
    poly([[166,-45],[172,-44],[172,-47],[168,-47],[166,-46]], "#60e828"); // NZ South
    poly([[-5,50],[2,51],[2,55],[-1,58],[-5,58],[-5,54],[-3,52]], "#80ec40"); // Great Britain
    poly([[-10,52],[-6,52],[-6,54],[-8,55],[-10,54]], "#80ec40"); // Ireland
    poly([[-24,63],[-13,63],[-13,66],[-18,68],[-24,65]], "#b8e8ff"); // Iceland
  }

  // ── Borders on top — thinner + slightly more transparent over satellite ────
  // Satellite imagery has its own landmass colouring so borders need less weight.
  const bdrAlpha  = terrainBitmap ? 0.52 : 0.65;
  const bdrWidth  = terrainBitmap ? 6.0  : 8.8;
  const stateWdth = terrainBitmap ? 3.8  : 5.6;
  drawBorders(countriesGeo, `rgba(255,255,255,${bdrAlpha})`, bdrWidth);

  const STATE_FILTER = new Set(["USA", "CAN", "AUS", "BRA", "MEX", "RUS", "CHN", "IND", "ARG"]);
  drawBorders(statesGeo, `rgba(255,255,255,${terrainBitmap ? 0.28 : 0.32})`, stateWdth,
    f => STATE_FILTER.has(f.properties.adm0_a3));

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ─── Landmark system ──────────────────────────────────────────────────────────
// Base candy-gloss material (Mario Galaxy feel)
function Mat({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.08} metalness={0.18} emissive={c} emissiveIntensity={0.12}/>;
}
// Weathered stone / masonry (Colosseum, Stonehenge, Petra rock face, Acropolis marble)
function MatStone({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.82} metalness={0.0} emissive={c} emissiveIntensity={0.04}/>;
}
// Polished marble / white stone (Taj Mahal, Christ the Redeemer)
function MatMarble({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.22} metalness={0.06} emissive={c} emissiveIntensity={0.08}/>;
}
// Iron / painted steel (Eiffel Tower, Golden Gate Bridge)
function MatMetal({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.38} metalness={0.72} emissive={c} emissiveIntensity={0.06}/>;
}
// Oxidised copper / patina (Statue of Liberty)
function MatPatina({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.6} metalness={0.42} emissive={c} emissiveIntensity={0.1}/>;
}
// Polished gold / gilded (Angkor Wat, Borobudur, temple finials)
function MatGold({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.14} metalness={0.88} emissive={c} emissiveIntensity={0.18}/>;
}
// Sandstone / desert rock (Petra background, Pyramids, Grand Canyon)
function MatSand({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.9} metalness={0.0} emissive={c} emissiveIntensity={0.05}/>;
}
// Glass / water / ice surfaces
function MatGlass({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.04} metalness={0.05} emissive={c} emissiveIntensity={0.22} transparent opacity={0.82}/>;
}

// Typed mesh helpers — accept optional mat override for per-surface materials
function Box({ p, s, c, M = Mat }: { p:[number,number,number]; s:[number,number,number]; c:string; M?:React.FC<{c:string}> }) {
  return <mesh position={p}><boxGeometry args={s}/><M c={c}/></mesh>;
}
function Cone({ p, r, h, seg=32, c, M = Mat }: { p:[number,number,number]; r:number; h:number; seg?:number; c:string; M?:React.FC<{c:string}> }) {
  return <mesh position={p}><coneGeometry args={[r,h,seg]}/><M c={c}/></mesh>;
}
function Cyl({ p, rt, rb, h, seg=32, c, M = Mat }: { p:[number,number,number]; rt:number; rb:number; h:number; seg?:number; c:string; M?:React.FC<{c:string}> }) {
  return <mesh position={p}><cylinderGeometry args={[rt,rb,h,seg]}/><M c={c}/></mesh>;
}
function Ball({ p, r, c, M = Mat }: { p:[number,number,number]; r:number; c:string; M?:React.FC<{c:string}> }) {
  return <mesh position={p}><sphereGeometry args={[r,48,48]}/><M c={c}/></mesh>;
}


// ─── GLB model registry ────────────────────────────────────────────────────────
// Add a .glb file to public/models/ and it will replace the primitive geometry.
// scale is a starting point — adjust per model since every Sketchfab export differs.
const MODELS: Record<string, { path: string; scale: number }> = {
  greatWall:              { path: "/models/great_wall.glb", scale: 1 },
  petra:                  { path: "/models/petra.glb", scale: 1 },
  christRedeem:           { path: "/models/christ_redeemer.glb", scale: 1 },
  machuPicchu:            { path: "/models/machu_picchu.glb", scale: 1 },
  chichenItza:            { path: "/models/chichen_itza.glb", scale: 1 },
  colosseum:              { path: "/models/Colosseum.glb", scale: 1 },
  tajMahal:               { path: "/models/taj_mahal.glb", scale: 1 },
  eiffelTower:            { path: "/models/eiffel_tower.glb", scale: 1 },
  acropolis:              { path: "/models/acropolis.glb", scale: 1 },
  stonehenge:             { path: "/models/stonehenge.glb", scale: 1 },
  sagradaFamilia:         { path: "/models/sagrada_familia.glb", scale: 1 },
  angkorWat:              { path: "/models/angkor_wat.glb", scale: 1 },
  borobudur:              { path: "/models/borobudur.glb", scale: 1 },
  tokyoSkytree:           { path: "/models/tokyo_skytree.glb", scale: 1 },
  tableMountain:          { path: "/models/table_mountain.glb", scale: 1 },
  statueLiberty:          { path: "/models/statue_liberty.glb", scale: 1 },
  mtRushmore:             { path: "/models/mt_rushmore.glb", scale: 1 },
  goldenGate:             { path: "/models/golden_gate.glb", scale: 1 },
  grandCanyon:            { path: "/models/grand_canyon.glb", scale: 1 },
  iguazuFalls:            { path: "/models/iguazu_falls.glb", scale: 1 },
  galapagos:              { path: "/models/galapagos.glb", scale: 1 },
  victoriaFalls:          { path: "/models/victoria_falls.glb", scale: 1 },
  versaillesF:            { path: "/models/versailles.glb", scale: 1 },
  notreDameF:             { path: "/models/notre_dame.glb", scale: 1 },
  bigBen:                 { path: "/models/big_ben.glb", scale: 1 },
  towerBridge:            { path: "/models/tower_bridge.glb", scale: 1 },
  neuschwanstein:         { path: "/models/neuschwanstein.glb", scale: 1 },
  mountFuji:              { path: "/models/mount_fuji.glb", scale: 1 },
  fushimiInari:           { path: "/models/fushimi_inari.glb", scale: 1 },
  osakaCastle:            { path: "/models/osaka_castle.glb", scale: 1 },
  forbiddenCity:          { path: "/models/forbidden_city.glb", scale: 1 },
  terracottaArmy:         { path: "/models/terracotta_army.glb", scale: 1 },
  potalaLhasa:            { path: "/models/potala_palace.glb", scale: 1 },
  santoriniGreece:        { path: "/models/santorini.glb", scale: 1 },
  meteora:                { path: "/models/meteora.glb", scale: 1 },
  maasaiMara:             { path: "/models/maasai_mara.glb", scale: 1 },
  kilimanjaro:            { path: "/models/kilimanjaro.glb", scale: 1 },
  moroccoMar:             { path: "/models/morocco_mar.glb", scale: 1 },
  edinCastle:             { path: "/models/edin_castle.glb", scale: 1 },
  burjKhalifa:            { path: "/models/burj_khalifa.glb", scale: 1 },
  cappadocia:             { path: "/models/cappadocia.glb", scale: 1 },
  cliffsMoher:            { path: "/models/cliffs_moher.glb", scale: 1 },
  hagiaSophia:            { path: "/models/hagia_sophia.glb", scale: 1 },
  matterhorn:             { path: "/models/matterhorn.glb", scale: 1 },
  petronas:               { path: "/models/petronas.glb", scale: 1 },
  tigersNest:             { path: "/models/tigers_nest.glb", scale: 1 },
  westernWall:            { path: "/models/western_wall.glb", scale: 1 },
};

// ─── GLB error boundary — falls back to primitive geometry if .glb missing ────
class ModelErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// Loads a GLB, normalises it to fit a 1-unit bounding box with base at y=0,
// then multiplies by `scale` so it matches the surrounding Lm s-wrapper size.
function GlbModel({ path, scale }: { path: string; scale: number }) {
  const { scene } = useGLTF(path);
  const obj = useMemo(() => {
    const c = scene.clone();
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const norm = scale / maxDim;          // normalise longest axis → scale units
      c.scale.setScalar(norm);
      c.position.y = -box.min.y * norm;    // lift base to y=0 (globe surface)
    }
    return c;
  }, [scene, scale]);
  return <primitive object={obj} frustumCulled={false} />;
}

// ─── Hover label ──────────────────────────────────────────────────────────────
type LmInfo = { name: string; location: string; fact: string };

function LandmarkLabel({ info }: { info: LmInfo }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const slug = encodeURIComponent(info.name.replace(/ /g, "_"));
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (!cancelled && d.thumbnail?.source) setImgUrl(d.thumbnail.source); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [info.name]);

  return (
    <div style={{
      position: "relative",
      background: "linear-gradient(150deg, #0e2a6e 0%, #061840 100%)",
      border: "2.5px solid #50c8ff",
      borderRadius: "18px",
      overflow: "hidden",
      width: "240px",
      boxShadow: "0 0 22px rgba(60,180,255,0.55), 0 8px 28px rgba(0,0,0,0.5)",
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
      pointerEvents: "none",
      userSelect: "none",
    }}>
      {imgUrl && (
        <img src={imgUrl} alt={info.name} style={{
          display: "block", width: "100%", height: "130px",
          objectFit: "cover", borderBottom: "1.5px solid #50c8ff",
        }} />
      )}

      <div style={{ padding: "10px 14px 13px", textAlign: "center" }}>
        <div style={{
          fontSize: "13px", fontWeight: 800, color: "#ffffff",
          letterSpacing: "0.02em", marginBottom: "3px",
          textShadow: "0 0 12px rgba(100,210,255,0.9)",
        }}>
          {info.name}
        </div>

        <div style={{ fontSize: "10px", fontWeight: 600, color: "#80d8ff", marginBottom: "7px" }}>
          {String.fromCodePoint(0x1F4CD)} {info.location}
        </div>

        <div style={{
          fontSize: "10px", color: "#c0ecff", lineHeight: 1.5,
          borderTop: "1px solid rgba(80,200,255,0.25)", paddingTop: "7px",
          textAlign: "left",
        }}>
          {info.fact}
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: "-12px", left: "50%", transform: "translateX(-50%)",
        width: 0, height: 0,
        borderLeft: "9px solid transparent", borderRight: "9px solid transparent",
        borderTop: "12px solid #50c8ff",
      }} />
      <div style={{
        position: "absolute", bottom: "-9px", left: "50%", transform: "translateX(-50%)",
        width: 0, height: 0,
        borderLeft: "7px solid transparent", borderRight: "7px solid transparent",
        borderTop: "10px solid #061840",
      }} />
    </div>
  );
}

// Places children on the globe surface at the given lat/lon, standing upright.
// ─── Globe-click navigation bridge
let _lmNav: ((loc: string) => void) | null = null;
function _setLmNav(fn: (loc: string) => void) { _lmNav = fn; }
let _globeClick: (() => void) | null = null;
function _setGlobeClick(fn: () => void) { _globeClick = fn; }

function Lm({ p, s = 0.4, info, mk, children }: { p: SurfPos; s?: number; info?: LmInfo; mk?: string; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const model   = mk ? MODELS[mk] : undefined;
  const density = LM_DENSITY.get(p) ?? 1;
  const effS    = s * density;

  return (
    <group position={p.pos} quaternion={p.q}>
      <group scale={effS}>
        {model ? (
          <ModelErrorBoundary fallback={<>{children}</>}>
            <Suspense fallback={<>{children}</>}>
              <GlbModel path={model.path} scale={1} />
            </Suspense>
          </ModelErrorBoundary>
        ) : children}

        {/* Invisible sphere that reliably captures pointer events.
            GLB meshes live inside <primitive> and are outside React's fiber
            tree, so onClick on a parent group never fires for them.
            This dedicated mesh IS a proper R3F component and always works. */}
        <mesh
          position={[0, 0.5, 0]}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true);  document.body.style.cursor = "pointer"; }}
          onPointerOut={(e)  => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
          onClick={(e)       => { e.stopPropagation(); if (info) _lmNav?.(info.name); }}
        >
          <sphereGeometry args={[0.7, 6, 4]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {hovered && info && (
        <Html
          center
          position={[0, effS * 1.8 + 0.3, 0]}
          distanceFactor={9}
          zIndexRange={[200, 100]}
          style={{ pointerEvents: "none" }}
        >
          <LandmarkLabel info={info} />
        </Html>
      )}
    </group>
  );
}

// ─── Ocean & land animal components ──────────────────────────────────────────
// Animals sit on the sphere surface (geo() R=10). Each has a gentle idle animation.

function Whale({ lat, lon, scale = 1, color = "#3a4a70" }: { lat:number; lon:number; scale?:number; color?:string }) {
  const ref = useRef<THREE.Group>(null);
  const t0  = useRef(Math.random() * 10);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * 0.35 + t0.current;
    ref.current.rotation.z = Math.sin(t * 1.8) * 0.08;          // tail sway
    ref.current.position.y = Math.sin(t * 0.7) * 0.06;          // gentle bob
  });
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group ref={ref} scale={scale} rotation={[0.25, 0, 0]}>
        {/* Body */}
        <mesh scale={[0.28, 0.1, 0.1]}><sphereGeometry args={[1,16,8]}/><meshStandardMaterial color={color} roughness={0.3} metalness={0.1}/></mesh>
        {/* Head bulge */}
        <mesh position={[0.26,0,0]} scale={[0.08,0.07,0.07]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color={color} roughness={0.3}/></mesh>
        {/* Light belly */}
        <mesh position={[0,-0.06,0]} scale={[0.22,0.04,0.06]}><sphereGeometry args={[1,12,6]}/><meshStandardMaterial color="#b8d4e8" roughness={0.4}/></mesh>
        {/* Dorsal fin */}
        <mesh position={[-0.06,0.1,0]} rotation={[0,0,0.3]}><coneGeometry args={[0.022,0.08,6]}/><meshStandardMaterial color={color}/></mesh>
        {/* Tail flukes */}
        <group position={[-0.26,0,0]} ref={ref}>
          <mesh position={[0,0, 0.045]} rotation={[0,0,0.4]} scale={[0.06,0.02,0.06]}><sphereGeometry args={[1,8,4]}/><meshStandardMaterial color={color}/></mesh>
          <mesh position={[0,0,-0.045]} rotation={[0,0,0.4]} scale={[0.06,0.02,0.06]}><sphereGeometry args={[1,8,4]}/><meshStandardMaterial color={color}/></mesh>
        </group>
        {/* Pectoral fin */}
        <mesh position={[0.08,0,0.1]} rotation={[0.5,0,0.3]} scale={[0.1,0.015,0.04]}><sphereGeometry args={[1,8,4]}/><meshStandardMaterial color={color}/></mesh>
      </group>
    </group>
  );
}

function Dolphin({ lat, lon, scale = 1 }: { lat:number; lon:number; scale?:number }) {
  const ref = useRef<THREE.Group>(null);
  const t0  = useRef(Math.random() * 10);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * 1.2 + t0.current;
    ref.current.rotation.x = Math.sin(t * 2) * 0.18;     // leap arc
    ref.current.position.y = Math.abs(Math.sin(t)) * 0.12; // jump
  });
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group ref={ref} scale={scale} rotation={[-0.3,0,0]}>
        {/* Sleek body */}
        <mesh scale={[0.14,0.05,0.05]}><sphereGeometry args={[1,14,8]}/><meshStandardMaterial color="#5878a8" roughness={0.25} metalness={0.12}/></mesh>
        {/* Beak */}
        <mesh position={[0.15,0,0]} scale={[0.04,0.025,0.025]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#6888b8"/></mesh>
        {/* White belly */}
        <mesh position={[0,-0.03,0]} scale={[0.11,0.025,0.035]}><sphereGeometry args={[1,10,6]}/><meshStandardMaterial color="#d8e8f8" roughness={0.4}/></mesh>
        {/* Dorsal fin */}
        <mesh position={[-0.02,0.05,0]}><coneGeometry args={[0.014,0.05,6]}/><meshStandardMaterial color="#4868a0"/></mesh>
        {/* Tail */}
        <mesh position={[-0.14,0,0]} rotation={[0,0,Math.PI/2]} scale={[0.025,0.04,0.01]}><sphereGeometry args={[1,8,4]}/><meshStandardMaterial color="#4868a0"/></mesh>
      </group>
    </group>
  );
}

function Orca({ lat, lon, scale = 1 }: { lat:number; lon:number; scale?:number }) {
  const ref = useRef<THREE.Group>(null);
  const t0  = useRef(Math.random() * 10);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * 0.4 + t0.current;
    ref.current.rotation.z = Math.sin(t * 1.5) * 0.1;
    ref.current.position.y = Math.sin(t * 0.9) * 0.07;
  });
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group ref={ref} scale={scale} rotation={[0.2,0,0]}>
        <mesh scale={[0.22,0.09,0.09]}><sphereGeometry args={[1,16,8]}/><meshStandardMaterial color="#101010" roughness={0.3}/></mesh>
        {/* White eye patch */}
        <mesh position={[0.12,0.04,0.08]} scale={[0.03,0.025,0.02]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        {/* White belly */}
        <mesh position={[0,-0.055,0]} scale={[0.18,0.04,0.06]}><sphereGeometry args={[1,12,6]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        {/* Tall dorsal fin */}
        <mesh position={[-0.02,0.13,0]} rotation={[0,0,0.15]}><coneGeometry args={[0.018,0.14,6]}/><meshStandardMaterial color="#101010"/></mesh>
        {/* Tail */}
        <mesh position={[-0.2,0, 0.05]} rotation={[0,0,0.5]} scale={[0.06,0.02,0.05]}><sphereGeometry args={[1,8,4]}/><meshStandardMaterial color="#101010"/></mesh>
        <mesh position={[-0.2,0,-0.05]} rotation={[0,0,0.5]} scale={[0.06,0.02,0.05]}><sphereGeometry args={[1,8,4]}/><meshStandardMaterial color="#101010"/></mesh>
      </group>
    </group>
  );
}

function Lion({ lat, lon, scale = 1 }: { lat:number; lon:number; scale?:number }) {
  const ref = useRef<THREE.Group>(null);
  const t0  = useRef(Math.random() * 10);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.children[0].rotation.y = Math.sin(clock.getElapsedTime() * 0.4 + t0.current) * 0.15;
  });
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group ref={ref} scale={scale}>
        {/* Body */}
        <mesh position={[0,0.1,0]} scale={[0.16,0.08,0.09]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#d4a030" roughness={0.7}/></mesh>
        {/* Head */}
        <mesh position={[0.16,0.14,0]} scale={[0.07,0.07,0.065]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#c89028"/></mesh>
        {/* Mane */}
        <mesh position={[0.15,0.14,0]} scale={[0.09,0.09,0.085]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#8a5010" roughness={0.9}/></mesh>
        {/* Legs */}
        {([-0.07,0.07] as number[]).map((x,i)=><mesh key={i} position={[x,-0.04,0.06]}><cylinderGeometry args={[0.018,0.022,0.1,8]}/><meshStandardMaterial color="#c8981c"/></mesh>)}
        {([-0.07,0.07] as number[]).map((x,i)=><mesh key={i+2} position={[x,-0.04,-0.06]}><cylinderGeometry args={[0.018,0.022,0.1,8]}/><meshStandardMaterial color="#c8981c"/></mesh>)}
        {/* Tail */}
        <mesh position={[-0.16,0.1,0]} rotation={[0,0,-0.7]} scale={[0.1,0.01,0.01]}><sphereGeometry args={[1,6,4]}/><meshStandardMaterial color="#a87018"/></mesh>
      </group>
    </group>
  );
}

function Elephant({ lat, lon, scale = 1 }: { lat:number; lon:number; scale?:number }) {
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group scale={scale}>
        {/* Body */}
        <mesh position={[0,0.14,0]} scale={[0.2,0.14,0.13]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#707070" roughness={0.85}/></mesh>
        {/* Head */}
        <mesh position={[0.18,0.2,0]} scale={[0.1,0.1,0.09]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#686868"/></mesh>
        {/* Trunk — descending cylinders */}
        <mesh position={[0.26,0.12,0]} rotation={[0,0,-0.5]}><cylinderGeometry args={[0.02,0.025,0.12,8]}/><meshStandardMaterial color="#686868"/></mesh>
        <mesh position={[0.3,0.04,0]} rotation={[0,0,-0.8]}><cylinderGeometry args={[0.016,0.02,0.1,8]}/><meshStandardMaterial color="#686868"/></mesh>
        {/* Ears */}
        <mesh position={[0.15,0.2, 0.1]} scale={[0.04,0.1,0.07]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#787878"/></mesh>
        <mesh position={[0.15,0.2,-0.1]} scale={[0.04,0.1,0.07]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#787878"/></mesh>
        {/* Tusks */}
        <mesh position={[0.28,0.15, 0.04]} rotation={[0.2,0.2,-0.3]}><coneGeometry args={[0.01,0.1,6]}/><meshStandardMaterial color="#f8f0d8"/></mesh>
        <mesh position={[0.28,0.15,-0.04]} rotation={[-0.2,0.2,-0.3]}><coneGeometry args={[0.01,0.1,6]}/><meshStandardMaterial color="#f8f0d8"/></mesh>
        {/* Legs */}
        {([-0.08,0.08] as number[]).flatMap((x,i)=>
          [0.06,-0.06].map((z,j)=><mesh key={`${i}${j}`} position={[x,-0.05,z]}><cylinderGeometry args={[0.028,0.032,0.16,8]}/><meshStandardMaterial color="#686868"/></mesh>)
        )}
      </group>
    </group>
  );
}

function PolarBear({ lat, lon, scale = 1 }: { lat:number; lon:number; scale?:number }) {
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group scale={scale}>
        <mesh position={[0,0.1,0]} scale={[0.16,0.1,0.1]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#f0f0e8" roughness={0.9}/></mesh>
        <mesh position={[0.16,0.14,0]} scale={[0.07,0.065,0.065]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#eeeedc"/></mesh>
        {/* Snout */}
        <mesh position={[0.22,0.12,0]} scale={[0.04,0.03,0.03]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#e8e8d0"/></mesh>
        {/* Legs */}
        {([-0.07,0.07] as number[]).flatMap((x,i)=>
          [0.06,-0.06].map((z,j)=><mesh key={`${i}${j}`} position={[x,-0.05,z]}><cylinderGeometry args={[0.02,0.025,0.12,8]}/><meshStandardMaterial color="#f0f0e8"/></mesh>)
        )}
      </group>
    </group>
  );
}

function Penguin({ lat, lon, scale = 1 }: { lat:number; lon:number; scale?:number }) {
  const ref = useRef<THREE.Group>(null);
  const t0  = useRef(Math.random() * 10);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.getElapsedTime() * 1.5 + t0.current) * 0.07; // waddle
  });
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group ref={ref} scale={scale}>
        {/* Body — black */}
        <mesh position={[0,0.1,0]} scale={[0.06,0.1,0.06]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#202020" roughness={0.6}/></mesh>
        {/* White belly */}
        <mesh position={[0.018,0.1,0]} scale={[0.04,0.08,0.04]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        {/* Head */}
        <mesh position={[0,0.22,0]} scale={[0.045,0.045,0.045]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#202020"/></mesh>
        {/* White face patch */}
        <mesh position={[0.02,0.225,0]} scale={[0.025,0.03,0.025]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#f8f8f0"/></mesh>
        {/* Orange beak */}
        <mesh position={[0.045,0.22,0]} rotation={[0,0,-Math.PI/2]}><coneGeometry args={[0.008,0.025,6]}/><meshStandardMaterial color="#f0a020"/></mesh>
        {/* Flippers */}
        <mesh position={[0, 0.1, 0.07]} rotation={[0,0.3,0.4]} scale={[0.015,0.07,0.03]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#202020"/></mesh>
        <mesh position={[0, 0.1,-0.07]} rotation={[0,-0.3,0.4]} scale={[0.015,0.07,0.03]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#202020"/></mesh>
        {/* Orange feet */}
        <mesh position={[ 0.01,0.02, 0.02]} rotation={[0,0,-0.2]}><coneGeometry args={[0.01,0.04,4]}/><meshStandardMaterial color="#f0a020"/></mesh>
        <mesh position={[ 0.01,0.02,-0.02]} rotation={[0,0,-0.2]}><coneGeometry args={[0.01,0.04,4]}/><meshStandardMaterial color="#f0a020"/></mesh>
      </group>
    </group>
  );
}

function Kangaroo({ lat, lon, scale = 1 }: { lat:number; lon:number; scale?:number }) {
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group scale={scale}>
        {/* Body */}
        <mesh position={[0,0.12,0]} scale={[0.1,0.12,0.08]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#c89050" roughness={0.75}/></mesh>
        {/* Head — small pointed */}
        <mesh position={[0.06,0.26,0]} scale={[0.04,0.055,0.04]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#c08840"/></mesh>
        {/* Long ears */}
        <mesh position={[0.06,0.34, 0.025]} rotation={[0.3,0,0.1]}><coneGeometry args={[0.008,0.065,6]}/><meshStandardMaterial color="#c08840"/></mesh>
        <mesh position={[0.06,0.34,-0.025]} rotation={[-0.3,0,0.1]}><coneGeometry args={[0.008,0.065,6]}/><meshStandardMaterial color="#c08840"/></mesh>
        {/* Thick tail */}
        <mesh position={[-0.12,0.02,0]} rotation={[0,0,0.6]} scale={[0.14,0.03,0.03]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#b87840"/></mesh>
        {/* Big back legs */}
        <mesh position={[ 0.02,-0.05, 0.035]} rotation={[0.2,0,-0.1]}><cylinderGeometry args={[0.018,0.025,0.14,8]}/><meshStandardMaterial color="#c08840"/></mesh>
        <mesh position={[ 0.02,-0.05,-0.035]} rotation={[-0.2,0,-0.1]}><cylinderGeometry args={[0.018,0.025,0.14,8]}/><meshStandardMaterial color="#c08840"/></mesh>
        {/* Small front arms */}
        <mesh position={[0.06,0.16, 0.05]} rotation={[0.5,0,0.3]}><cylinderGeometry args={[0.01,0.012,0.07,6]}/><meshStandardMaterial color="#c08840"/></mesh>
        <mesh position={[0.06,0.16,-0.05]} rotation={[-0.5,0,0.3]}><cylinderGeometry args={[0.01,0.012,0.07,6]}/><meshStandardMaterial color="#c08840"/></mesh>
      </group>
    </group>
  );
}

function Giraffe({ lat, lon, scale = 1 }: { lat:number; lon:number; scale?:number }) {
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group scale={scale}>
        {/* Body */}
        <mesh position={[0,0.12,0]} scale={[0.12,0.1,0.08]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#e8a030" roughness={0.7}/></mesh>
        {/* Very long neck */}
        <mesh position={[0.06,0.32,0]} rotation={[0,0,0.2]}><cylinderGeometry args={[0.022,0.028,0.32,8]}/><meshStandardMaterial color="#e8a030"/></mesh>
        {/* Head */}
        <mesh position={[0.14,0.5,0]} scale={[0.05,0.04,0.04]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#d89028"/></mesh>
        {/* Ossicones (horns) */}
        <mesh position={[0.14,0.55, 0.025]}><cylinderGeometry args={[0.005,0.007,0.04,6]}/><meshStandardMaterial color="#604010"/></mesh>
        <mesh position={[0.14,0.55,-0.025]}><cylinderGeometry args={[0.005,0.007,0.04,6]}/><meshStandardMaterial color="#604010"/></mesh>
        {/* Long legs */}
        {([-0.06,0.06] as number[]).flatMap((x,i)=>
          [0.04,-0.04].map((z,j)=><mesh key={`${i}${j}`} position={[x,-0.1,z]}><cylinderGeometry args={[0.014,0.018,0.26,8]}/><meshStandardMaterial color="#d09020"/></mesh>)
        )}
        {/* Spots pattern dots */}
        {[[0.04,0.18,0.04],[-0.02,0.14,-0.03],[0.08,0.1,0.05]].map(([x,y,z],i)=>(
          <mesh key={i} position={[Number(x),Number(y),Number(z)]} scale={[0.025,0.018,0.012]}><sphereGeometry args={[1,6,4]}/><meshStandardMaterial color="#7a4010"/></mesh>
        ))}
      </group>
    </group>
  );
}

function GiantPanda({ lat, lon, scale = 1 }: { lat:number; lon:number; scale?:number }) {
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group scale={scale}>
        {/* White body */}
        <mesh position={[0,0.1,0]} scale={[0.13,0.11,0.1]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#f0f0f0" roughness={0.8}/></mesh>
        {/* White head */}
        <mesh position={[0.13,0.19,0]} scale={[0.08,0.08,0.075]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        {/* Black eye patches */}
        <mesh position={[0.19,0.22, 0.04]} scale={[0.03,0.025,0.02]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#101010"/></mesh>
        <mesh position={[0.19,0.22,-0.04]} scale={[0.03,0.025,0.02]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#101010"/></mesh>
        {/* Black ears */}
        <mesh position={[0.12,0.28, 0.06]} scale={[0.025,0.025,0.02]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#101010"/></mesh>
        <mesh position={[0.12,0.28,-0.06]} scale={[0.025,0.025,0.02]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#101010"/></mesh>
        {/* Black legs */}
        {([-0.06,0.06] as number[]).flatMap((x,i)=>
          [0.05,-0.05].map((z,j)=><mesh key={`${i}${j}`} position={[x,-0.04,z]}><cylinderGeometry args={[0.022,0.026,0.1,8]}/><meshStandardMaterial color="#101010"/></mesh>)
        )}
        {/* Black shoulders/arms */}
        <mesh position={[0.08,0.1, 0.09]} rotation={[0.5,0,0.4]}><cylinderGeometry args={[0.02,0.024,0.1,8]}/><meshStandardMaterial color="#101010"/></mesh>
        <mesh position={[0.08,0.1,-0.09]} rotation={[-0.5,0,0.4]}><cylinderGeometry args={[0.02,0.024,0.1,8]}/><meshStandardMaterial color="#101010"/></mesh>
        {/* Bamboo stalk */}
        <mesh position={[0.22,0.14,0]} rotation={[0,0,0.4]}><cylinderGeometry args={[0.008,0.01,0.16,6]}/><meshStandardMaterial color="#60a840"/></mesh>
      </group>
    </group>
  );
}

function SnowLeopard({ lat, lon, scale = 1 }: { lat:number; lon:number; scale?:number }) {
  const sp = geo(lat, lon);
  return (
    <group position={sp.pos} quaternion={sp.q}>
      <group scale={scale}>
        <mesh position={[0,0.09,0]} scale={[0.15,0.08,0.08]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#d8d0c0" roughness={0.75}/></mesh>
        <mesh position={[0.15,0.12,0]} scale={[0.06,0.058,0.055]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#d0c8b8"/></mesh>
        {/* Long thick tail */}
        <mesh position={[-0.17,0.1,0]} rotation={[0,0,0.5]} scale={[0.18,0.025,0.025]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color="#c8c0b0"/></mesh>
        {/* Legs */}
        {([-0.06,0.06] as number[]).flatMap((x,i)=>
          [0.04,-0.04].map((z,j)=><mesh key={`${i}${j}`} position={[x,-0.04,z]}><cylinderGeometry args={[0.014,0.018,0.1,8]}/><meshStandardMaterial color="#c8c0b0"/></mesh>)
        )}
        {/* Spots */}
        {[[0.02,0.12,0.04],[-0.04,0.1,-0.03],[0.06,0.08,0.06]].map(([x,y,z],i)=>(
          <mesh key={i} position={[x,y,z]} scale={[0.02,0.015,0.01]}><sphereGeometry args={[1,6,4]}/><meshStandardMaterial color="#606050"/></mesh>
        ))}
      </group>
    </group>
  );
}

// ─── AllAnimals — places all ocean + land animals on the globe ────────────────
function AllAnimals() {
  return (
    <>
      {/* ── Blue Whales ───────────────────────────────────────────────────── */}
      <Whale lat={ 36} lon={-125} scale={1.1} color="#3a4a78"/>
      <Whale lat={  6} lon={ 80}  scale={1.0} color="#3a4870"/>
      <Whale lat={-60} lon={ -40} scale={1.2} color="#2a3868"/>

      {/* ── Humpback Whales ───────────────────────────────────────────────── */}
      <Whale lat={ 43} lon={-50}  scale={0.95} color="#3a3a50"/>
      <Whale lat={ 20} lon={-156} scale={1.0}  color="#3a3a50"/>
      <Whale lat={ 58} lon={-152} scale={1.05} color="#3a3a50"/>
      <Whale lat={-30} lon={ 15}  scale={0.9}  color="#3a3a50"/>

      {/* ── Orca / Killer Whales ──────────────────────────────────────────── */}
      <Orca lat={ 48} lon={-126} scale={0.9}/>
      <Orca lat={ 69} lon={ 20}  scale={0.85}/>
      <Orca lat={-46} lon={ 168} scale={0.8}/>

      {/* ── Dolphin Pods ─────────────────────────────────────────────────── */}
      <Dolphin lat={ 38} lon={ 15}  scale={0.7}/>
      <Dolphin lat={ 18} lon={-68}  scale={0.7}/>
      <Dolphin lat={ 26} lon={-91}  scale={0.7}/>
      <Dolphin lat={ 10} lon={-130} scale={0.7}/>
      <Dolphin lat={ -5} lon={ 72}  scale={0.7}/>
      <Dolphin lat={-22} lon={ 115} scale={0.7}/>

      {/* ── Sperm Whale ───────────────────────────────────────────────────── */}
      <Whale lat={ 38} lon={-28}  scale={0.9} color="#4a3a30"/>

      {/* ── Land Animals ─────────────────────────────────────────────────── */}
      <Lion      lat={ -1.4} lon={ 35.2}  scale={0.8}/>
      <Elephant  lat={-19}   lon={ 23.5}  scale={0.9}/>
      <PolarBear lat={ 78}   lon={-104}   scale={0.85}/>
      <Penguin   lat={-72}   lon={  -8}   scale={0.8}/>
      <Penguin   lat={-34}   lon={  26.5} scale={0.7}/>
      <Kangaroo  lat={-25}   lon={ 134}   scale={0.75}/>
      <Giraffe   lat={ -2.8} lon={ 34.9}  scale={0.85}/>
      <GiantPanda lat={30.6} lon={ 103.6} scale={0.7}/>
      <SnowLeopard lat={34}  lon={  77}   scale={0.75}/>

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
      <Lm p={L.bigBen} info={INFO.bigBen} mk="bigBen">
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
      <Lm p={L.edinburghCastle} info={INFO.edinburghCastle} mk="edinCastle">
        <mesh position={[0,0.06,0]}><boxGeometry args={[0.5,0.12,0.35]}/><meshStandardMaterial color="#888878" roughness={0.9}/></mesh>
        <mesh position={[0,0.18,0]}><boxGeometry args={[0.35,0.12,0.25]}/><meshStandardMaterial color="#808070"/></mesh>
        <mesh position={[0,0.3,0]}><boxGeometry args={[0.22,0.14,0.18]}/><meshStandardMaterial color="#909080"/></mesh>
        <mesh position={[0,0.42,0]}><coneGeometry args={[0.12,0.16,4]}/><meshStandardMaterial color="#707060"/></mesh>
      </Lm>
      <Lm p={L.neuschwanstein} info={INFO.neuschwanstein} mk="neuschwanstein">
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
      <Lm p={L.matterhorn} info={INFO.matterhorn} mk="matterhorn">
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
      <Lm p={L.petronasTowers} info={INFO.petronasTowers} mk="petronas">
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
      <Lm p={L.burjKhalifa} info={INFO.burjKhalifa} mk="burjKhalifa">
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
      <Lm p={L.westernWall} info={INFO.westernWall} mk="westernWall">
        <mesh position={[0,0.1,0]}><boxGeometry args={[0.5,0.2,0.1]}/><meshStandardMaterial color="#d4c8a0" roughness={0.9}/></mesh>
        <mesh position={[0,0.22,0]}><boxGeometry args={[0.5,0.04,0.1]}/><meshStandardMaterial color="#c8bc98"/></mesh>
        <mesh position={[0,0.28,0]}><boxGeometry args={[0.5,0.04,0.1]}/><meshStandardMaterial color="#d0c4a2"/></mesh>
      </Lm>
      <Lm p={L.hagiaSophia} info={INFO.hagiaSophia} mk="hagiaSophia">
        <mesh position={[0,0.08,0]}><boxGeometry args={[0.44,0.16,0.38]}/><meshStandardMaterial color="#d8c8a0" roughness={0.7}/></mesh>
        <mesh position={[0,0.24,0]}><sphereGeometry args={[0.14,10,8]}/><meshStandardMaterial color="#c8b890"/></mesh>
        <mesh position={[-0.2,0.22,0.16]}><cylinderGeometry args={[0.035,0.04,0.22,8]}/><meshStandardMaterial color="#c0aa80"/></mesh>
        <mesh position={[0.2,0.22,0.16]}><cylinderGeometry args={[0.035,0.04,0.22,8]}/><meshStandardMaterial color="#c0aa80"/></mesh>
        <mesh position={[-0.2,0.35,0.16]}><coneGeometry args={[0.045,0.1,6]}/><meshStandardMaterial color="#b89a70"/></mesh>
        <mesh position={[0.2,0.35,0.16]}><coneGeometry args={[0.045,0.1,6]}/><meshStandardMaterial color="#b89a70"/></mesh>
      </Lm>
      <Lm p={L.cappadocia} info={INFO.cappadocia} mk="cappadocia">
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
      <Lm p={L.tigersNestBhutan} info={INFO.tigersNestBhutan} mk="tigersNest">
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
    </>
  );
}

// All 30 landmarks — local Y is always "outward" from the sphere surface
function AllLandmarks() {
  return (
    <>
      {/* ── Great Wall of China ───────────────────────────────────────────────── */}
      <Lm p={L.greatWall} info={INFO.greatWall} mk="greatWall">
        {/* Wall body */}
        <Box p={[0,0.07,0]}       s={[1.4,0.14,0.24]} c="#cfc3a6" M={MatStone}/>
        {/* Walkway on top */}
        <Box p={[0,0.16,0]}       s={[1.4,0.04,0.24]} c="#bfb396" M={MatStone}/>
        {/* Battlement merlons */}
        {([-0.55,-0.33,-0.11,0.11,0.33,0.55] as number[]).map((x,i)=>(
          <Box key={i} p={[x,0.24,0]} s={[0.14,0.16,0.24]} c="#bfb396" M={MatStone}/>
        ))}
        {/* Central watchtower */}
        <Box p={[0,0.32,0]}       s={[0.32,0.32,0.3]}  c="#d4c8b0" M={MatStone}/>
        <Box p={[0,0.5,0]}        s={[0.34,0.06,0.32]} c="#c4b89e" M={MatStone}/>
        {/* Tower crenellations */}
        {([-0.12,0,0.12] as number[]).map((x,i)=>(
          <Box key={i} p={[x,0.58,0]} s={[0.07,0.14,0.32]} c="#c4b89e" M={MatStone}/>
        ))}
        {/* Arrow slits */}
        <Box p={[0,0.38,0.16]}    s={[0.06,0.12,0.02]} c="#a09080" M={MatStone}/>
      </Lm>

      {/* ── Petra Treasury ────────────────────────────────────────────────────── */}
      <Lm p={L.petra} info={INFO.petra} mk="petra">
        {/* Rose sandstone rock face */}
        <Box p={[0,0.3,0]}          s={[0.72,0.6,0.06]}  c="#f0a060" M={MatSand}/>
        {/* Lower colonnade — 4 columns */}
        {([-0.24,-0.08,0.08,0.24] as number[]).map((x,i)=>(
          <Cyl key={i} p={[x,0.28,0.06]} rt={0.03} rb={0.03} h={0.44} seg={12} c="#e08850" M={MatSand}/>
        ))}
        {/* Entablature */}
        <Box p={[0,0.52,0.04]}      s={[0.62,0.06,0.06]} c="#e07848" M={MatSand}/>
        {/* Lower triangular pediment */}
        <Cone p={[0,0.61,0.04]}     r={0.32} h={0.14} seg={4} c="#f09060" M={MatSand}/>
        {/* Upper broken pediment / tholos drum */}
        <Cyl p={[0,0.75,0.04]}      rt={0.07} rb={0.1} h={0.14} seg={12} c="#e88050" M={MatSand}/>
        {/* Tholos urn */}
        <Ball p={[0,0.84,0.04]}     r={0.075} c="#f09060" M={MatSand}/>
        {/* 2 upper columns */}
        <Cyl p={[-0.18,0.63,0.04]}  rt={0.024} rb={0.024} h={0.24} seg={12} c="#e07848" M={MatSand}/>
        <Cyl p={[0.18,0.63,0.04]}   rt={0.024} rb={0.024} h={0.24} seg={12} c="#e07848" M={MatSand}/>
        {/* Dark door niche */}
        <Box p={[0,0.16,0.07]}      s={[0.1,0.22,0.02]} c="#c05030" M={MatSand}/>
      </Lm>

      {/* ── Christ the Redeemer ───────────────────────────────────────────────── */}
      <Lm p={L.christRedeem} info={INFO.christRedeem} mk="christRedeem">
        {/* Stone pedestal */}
        <Box p={[0,0.07,0]}    s={[0.16,0.14,0.16]}  c="#b0a890" M={MatStone}/>
        {/* Robe/body — soapstone */}
        <Cyl p={[0,0.37,0]}    rt={0.06} rb={0.11}   h={0.5}  seg={12} c="#f0ecdc" M={MatMarble}/>
        {/* Outstretched arms */}
        <Box p={[0,0.54,0]}    s={[0.78,0.07,0.07]}  c="#f0ecdc" M={MatMarble}/>
        {/* Head */}
        <Ball p={[0,0.72,0]}   r={0.088} c="#ffe8c8" M={MatMarble}/>
        {/* Hands */}
        <Ball p={[-0.4,0.54,0]} r={0.04} c="#ffe8c8" M={MatMarble}/>
        <Ball p={[0.4,0.54,0]}  r={0.04} c="#ffe8c8" M={MatMarble}/>
        {/* Feet at robe base */}
        <Box p={[0,0.12,0.06]} s={[0.1,0.04,0.05]}  c="#e8e4d0" M={MatMarble}/>
      </Lm>

      {/* ── Machu Picchu ──────────────────────────────────────────────────────── */}
      <Lm p={L.machuPicchu} info={INFO.machuPicchu} mk="machuPicchu">
        {/* Mountain terraces — stepped green hillside */}
        <Box p={[0,0.04,0]}     s={[0.86,0.08,0.54]}  c="#4a7838"/>
        <Box p={[0,0.15,0]}     s={[0.68,0.14,0.44]}  c="#5a9048"/>
        <Box p={[0,0.3,0]}      s={[0.52,0.16,0.34]}  c="#4a8038"/>
        <Box p={[0,0.46,0]}     s={[0.38,0.14,0.26]}  c="#5a9048"/>
        {/* Inca stone buildings */}
        <Box p={[-0.08,0.58,0]} s={[0.14,0.16,0.12]}  c="#c8bc9a"/>
        <Box p={[0.1,0.58,0]}   s={[0.12,0.16,0.12]}  c="#c0b490"/>
        <Box p={[0,0.58,-0.08]} s={[0.1,0.12,0.1]}    c="#c8bc9a"/>
        {/* Thatched/stone roofs */}
        <Cone p={[-0.08,0.68,0]} r={0.1}  h={0.1} seg={4} c="#a09070"/>
        <Cone p={[0.1,0.68,0]}   r={0.09} h={0.1} seg={4} c="#a09070"/>
        {/* Intihuatana stone (ritual pillar) */}
        <Box p={[0.16,0.52,0.08]} s={[0.05,0.08,0.05]} c="#d0c8a0"/>
      </Lm>

      {/* ── Chichen Itza ──────────────────────────────────────────────────────── */}
      <Lm p={L.chichenItza} info={INFO.chichenItza} mk="chichenItza">
        {/* El Castillo — 4-sided step pyramid */}
        <Box p={[0,0.05,0]}    s={[0.86,0.1,0.86]}   c="#f0d868"/>
        <Box p={[0,0.19,0]}    s={[0.66,0.18,0.66]}  c="#eed060"/>
        <Box p={[0,0.36,0]}    s={[0.48,0.18,0.48]}  c="#f0d868"/>
        <Box p={[0,0.53,0]}    s={[0.32,0.18,0.32]}  c="#eed060"/>
        {/* Temple top */}
        <Box p={[0,0.68,0]}    s={[0.22,0.18,0.2]}   c="#f8e070"/>
        <Box p={[0,0.8,0]}     s={[0.16,0.08,0.16]}  c="#f0d058"/>
        <Cone p={[0,0.86,0]}   r={0.07} h={0.08} seg={4} c="#f0d058"/>
        {/* Central staircase risers on each face */}
        <Box p={[0,0.37,0.445]}  s={[0.1,0.74,0.04]} c="#e8c850"/>
        <Box p={[0,0.37,-0.445]} s={[0.1,0.74,0.04]} c="#e8c850"/>
        <Box p={[0.445,0.37,0]}  s={[0.04,0.74,0.1]} c="#e8c850"/>
        <Box p={[-0.445,0.37,0]} s={[0.04,0.74,0.1]} c="#e8c850"/>
      </Lm>

      {/* ── Roman Colosseum ───────────────────────────────────────────────────── */}
      <Lm p={L.colosseum} info={INFO.colosseum} mk="colosseum">
        {/* Foundation */}
        <mesh position={[0,0.04,0]}>
          <torusGeometry args={[0.38,0.12,24,80]}/>
          <MatStone c="#e8d898"/>
        </mesh>
        {/* First arcade tier */}
        <mesh position={[0,0.2,0]}>
          <torusGeometry args={[0.36,0.1,24,80]}/>
          <MatStone c="#f0e0a0"/>
        </mesh>
        {/* Second arcade tier */}
        <mesh position={[0,0.34,0]}>
          <torusGeometry args={[0.33,0.09,22,72]}/>
          <MatStone c="#f4e8a8"/>
        </mesh>
        {/* Attic story */}
        <mesh position={[0,0.46,0]}>
          <torusGeometry args={[0.3,0.06,18,64]}/>
          <MatStone c="#e8d890"/>
        </mesh>
        {/* Arena floor — packed sand */}
        <Cyl p={[0,0.02,0]} rt={0.26} rb={0.26} h={0.04} seg={64} c="#d8c880" M={MatSand}/>
      </Lm>

      {/* ── Taj Mahal ─────────────────────────────────────────────────────────── */}
      <Lm p={L.tajMahal} info={INFO.tajMahal} mk="tajMahal">
        {/* Great plinth — white Makrana marble */}
        <Box p={[0,0.04,0]}   s={[0.82,0.08,0.82]}  c="#f0eaf8" M={MatMarble}/>
        {/* Main hall */}
        <Box p={[0,0.2,0]}    s={[0.44,0.24,0.44]}  c="#faf6ff" M={MatMarble}/>
        {/* Iwan arches */}
        <Box p={[0,0.22,0.22]} s={[0.2,0.2,0.02]}   c="#f0ecff" M={MatMarble}/>
        <Box p={[0,0.22,-0.22]} s={[0.2,0.2,0.02]}  c="#f0ecff" M={MatMarble}/>
        {/* Dome drum */}
        <Cyl p={[0,0.36,0]}   rt={0.17} rb={0.18}   h={0.12} seg={24} c="#fff8ff" M={MatMarble}/>
        {/* Onion dome — layered Cyl stack */}
        <Cyl p={[0,0.44,0]}   rt={0.21} rb={0.17}   h={0.1}  seg={24} c="#fffcff" M={MatMarble}/>
        <Cyl p={[0,0.54,0]}   rt={0.19} rb={0.21}   h={0.1}  seg={24} c="#fffcff" M={MatMarble}/>
        <Cyl p={[0,0.63,0]}   rt={0.13} rb={0.19}   h={0.1}  seg={24} c="#fff8ff" M={MatMarble}/>
        <Cyl p={[0,0.71,0]}   rt={0.06} rb={0.13}   h={0.1}  seg={24} c="#fffcff" M={MatMarble}/>
        <Cone p={[0,0.79,0]}  r={0.06}  h={0.12}    seg={24} c="#f8f4ff" M={MatMarble}/>
        {/* Finial spire — gilded brass */}
        <Cyl p={[0,0.87,0]}   rt={0.01} rb={0.022}  h={0.1}  seg={12} c="#d4c060" M={MatGold}/>
        <Ball p={[0,0.93,0]}  r={0.016} c="#e8d070" M={MatGold}/>
        {/* 4 minarets */}
        {([[-0.32,-0.32],[-0.32,0.32],[0.32,-0.32],[0.32,0.32]] as [number,number][]).map(([mx,mz],i)=>(
          <group key={i}>
            <Cyl  p={[mx,0.2,mz]}  rt={0.034} rb={0.036} h={0.44} seg={16} c="#f8f4ff" M={MatMarble}/>
            <Cyl  p={[mx,0.45,mz]} rt={0.042} rb={0.034} h={0.06} seg={16} c="#f4f0ff" M={MatMarble}/>
            <Cyl  p={[mx,0.52,mz]} rt={0.034} rb={0.042} h={0.06} seg={16} c="#f4f0ff" M={MatMarble}/>
            <Cone p={[mx,0.57,mz]} r={0.036}  h={0.1}    seg={16} c="#f0ecff" M={MatMarble}/>
            <Ball p={[mx,0.63,mz]} r={0.016}  c="#d4c060" M={MatGold}/>
          </group>
        ))}
      </Lm>

      {/* ── Eiffel Tower ──────────────────────────────────────────────────────── */}
      <Lm p={L.eiffelTower} info={INFO.eiffelTower} mk="eiffelTower">
        {/* 4 arching legs — puddled iron lattice */}
        {([[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]).map(([sx,sz],i)=>(
          <group key={i}>
            <Box p={[sx*0.23,0.08,sz*0.23]} s={[0.09,0.16,0.09]} c="#c8981a" M={MatMetal}/>
            <Box p={[sx*0.17,0.22,sz*0.17]} s={[0.08,0.16,0.08]} c="#d4a820" M={MatMetal}/>
            <Box p={[sx*0.1, 0.36,sz*0.1]}  s={[0.07,0.16,0.07]} c="#d4a820" M={MatMetal}/>
          </group>
        ))}
        {/* Diagonal cross-braces */}
        <Box p={[0,0.12,0]}  s={[0.42,0.04,0.06]} c="#c89018" M={MatMetal}/>
        <Box p={[0,0.12,0]}  s={[0.06,0.04,0.42]} c="#c89018" M={MatMetal}/>
        {/* First platform */}
        <Box p={[0,0.44,0]}  s={[0.3,0.06,0.3]}   c="#c89018" M={MatMetal}/>
        {/* Second tapered section */}
        <Cyl p={[0,0.62,0]}  rt={0.07} rb={0.1}   h={0.36} seg={12} c="#d4a820" M={MatMetal}/>
        {/* Second platform */}
        <Box p={[0,0.82,0]}  s={[0.16,0.06,0.16]} c="#c89018" M={MatMetal}/>
        {/* Broadcast mast */}
        <Cyl p={[0,0.96,0]}  rt={0.008} rb={0.06} h={0.28} seg={12} c="#e0b828" M={MatMetal}/>
        <Ball p={[0,1.12,0]} r={0.018} c="#ffe840" M={MatGold}/>
      </Lm>

      {/* ── Acropolis / Parthenon ─────────────────────────────────────────────── */}
      <Lm p={L.acropolis} info={INFO.acropolis} mk="acropolis">
        {/* Rock of the Acropolis — limestone */}
        <Cone p={[0,0.13,0]}  r={0.58} h={0.26} seg={8}  c="#c8bc9a" M={MatStone}/>
        {/* Platform (stylobate) — Pentelic marble */}
        <Box p={[0,0.28,0]}   s={[0.74,0.06,0.38]}        c="#e8dcc0" M={MatMarble}/>
        {/* 10 fluted columns */}
        {([-0.3,-0.18,-0.06,0.06,0.18,0.3] as number[]).map((x,i)=>(
          <Cyl key={i} p={[x,0.52,0]} rt={0.042} rb={0.048} h={0.44} seg={16} c="#ede3c8" M={MatMarble}/>
        ))}
        {/* Side columns */}
        <Cyl p={[-0.3,0.52, 0.14]} rt={0.042} rb={0.048} h={0.44} seg={16} c="#ede3c8" M={MatMarble}/>
        <Cyl p={[-0.3,0.52,-0.14]} rt={0.042} rb={0.048} h={0.44} seg={16} c="#ede3c8" M={MatMarble}/>
        <Cyl p={[0.3,0.52, 0.14]}  rt={0.042} rb={0.048} h={0.44} seg={16} c="#ede3c8" M={MatMarble}/>
        <Cyl p={[0.3,0.52,-0.14]}  rt={0.042} rb={0.048} h={0.44} seg={16} c="#ede3c8" M={MatMarble}/>
        {/* Entablature */}
        <Box p={[0,0.76,0]}   s={[0.74,0.08,0.38]}        c="#e0d4b8" M={MatMarble}/>
        {/* Gabled pediment */}
        <Cone p={[0,0.88,0]}  r={0.38} h={0.2} seg={4}    c="#d8cdb0" M={MatMarble}/>
      </Lm>

      {/* ── Stonehenge ────────────────────────────────────────────────────────── */}
      <Lm p={L.stonehenge} s={0.1125} info={INFO.stonehenge} mk="stonehenge">
        {/* Outer ring: 12 Sarsen uprights — weathered sandstone */}
        {Array.from({length:12},(_,i)=>{
          const a=i*Math.PI*2/12;
          return <Box key={i} p={[Math.sin(a)*0.38,0.16,Math.cos(a)*0.38]} s={[0.08,0.32,0.09]} c="#b8b0a0" M={MatStone}/>;
        })}
        {/* Outer lintels: 6 horizontal blocks, rotated tangentially */}
        {Array.from({length:6},(_,i)=>{
          const a=(i*2+1)*Math.PI/12;
          return (
            <mesh key={i} position={[Math.sin(a)*0.38, 0.34, Math.cos(a)*0.38]} rotation={[0,-a,0] as any}>
              <boxGeometry args={[0.18,0.07,0.1]}/>
              <Mat c="#a8a098"/>
            </mesh>
          );
        })}
        {/* Inner horseshoe: 5 trilithon pairs with lintels */}
        {([0,72,144,216,288] as number[]).map((deg,i)=>{
          const a=deg*Math.PI/180;
          const px=Math.sin(a)*0.22, pz=Math.cos(a)*0.22;
          const ox=Math.cos(a)*0.06, oz=-Math.sin(a)*0.06;
          return (
            <group key={i}>
              <Box p={[px-ox, 0.2, pz-oz]} s={[0.07,0.4,0.08]} c="#a09890"/>
              <Box p={[px+ox, 0.2, pz+oz]} s={[0.07,0.4,0.08]} c="#a09890"/>
              <mesh position={[px,0.42,pz]} rotation={[0,-a,0] as any}>
                <boxGeometry args={[0.18,0.07,0.09]}/>
                <Mat c="#988880"/>
              </mesh>
            </group>
          );
        })}
        {/* Altar stone in centre */}
        <Box p={[0,0.03,0]} s={[0.12,0.06,0.07]} c="#a09888"/>
      </Lm>

      {/* ── Sagrada Família ───────────────────────────────────────────────────── */}
      <Lm p={L.sagradaFamilia} info={INFO.sagradaFamilia} mk="sagradaFamilia">
        {/* Nave body */}
        <Box p={[0,0.1,0]}          s={[0.64,0.2,0.38]}  c="#f0ca88"/>
        {/* Crossing / apse roof */}
        <Box p={[0,0.22,0]}         s={[0.44,0.08,0.3]}  c="#e8c080"/>
        {/* Tallest central tower — Jesus tower */}
        <Cyl p={[0,0.78,0]}         rt={0.038} rb={0.07} h={1.12} seg={12} c="#f2cc88"/>
        <Ball p={[0,1.36,0]}        r={0.055} c="#ffe840"/>
        {/* Nativity facade — 4 tall bell towers front */}
        <Cyl p={[-0.19,0.64,0.17]}  rt={0.026} rb={0.048} h={0.84} seg={10} c="#e8c078"/>
        <Ball p={[-0.19,1.08,0.17]} r={0.042} c="#ffda30"/>
        <Cyl p={[0.19,0.64,0.17]}   rt={0.026} rb={0.048} h={0.84} seg={10} c="#e8c078"/>
        <Ball p={[0.19,1.08,0.17]}  r={0.042} c="#ffda30"/>
        {/* Passion facade — 4 towers back */}
        <Cyl p={[-0.19,0.58,-0.17]} rt={0.024} rb={0.044} h={0.72} seg={10} c="#e8c078"/>
        <Ball p={[-0.19,0.95,-0.17]} r={0.038} c="#ffda30"/>
        <Cyl p={[0.19,0.58,-0.17]}  rt={0.024} rb={0.044} h={0.72} seg={10} c="#e8c078"/>
        <Ball p={[0.19,0.95,-0.17]} r={0.038} c="#ffda30"/>
        {/* Apse towers — 4 shorter */}
        <Cyl p={[-0.1,0.48,0]}      rt={0.02}  rb={0.038} h={0.52} seg={10} c="#dcc070"/>
        <Ball p={[-0.1,0.76,0]}     r={0.032} c="#ffd020"/>
        <Cyl p={[0.1,0.48,0]}       rt={0.02}  rb={0.038} h={0.52} seg={10} c="#dcc070"/>
        <Ball p={[0.1,0.76,0]}      r={0.032} c="#ffd020"/>
      </Lm>

      {/* ── Angkor Wat ────────────────────────────────────────────────────────── */}
      <Lm p={L.angkorWat} info={INFO.angkorWat} mk="angkorWat">
        {/* Moat — reflective water */}
        <Box p={[0,-0.01,0]}  s={[1.1,0.02,1.1]}   c="#4888b8" M={MatGlass}/>
        {/* Three galleried terraces */}
        <Box p={[0,0.06,0]}   s={[0.84,0.12,0.84]} c="#d4a458"/>
        <Box p={[0,0.21,0]}   s={[0.62,0.14,0.62]} c="#c89848"/>
        <Box p={[0,0.37,0]}   s={[0.42,0.14,0.42]} c="#d4a458"/>
        {/* 4 corner lotus-bud towers — gilded sandstone */}
        {([[-0.2,-0.2],[0.2,-0.2],[-0.2,0.2],[0.2,0.2]] as [number,number][]).map(([x,z],i)=>(
          <group key={i}>
            <Cyl  p={[x,0.55,z]}  rt={0.052} rb={0.068} h={0.36} seg={16} c="#c89848" M={MatSand}/>
            <Cyl  p={[x,0.74,z]}  rt={0.04}  rb={0.052} h={0.22} seg={16} c="#d4a458" M={MatSand}/>
            <Cone p={[x,0.87,z]}  r={0.04}   h={0.14}   seg={16} c="#d4a020" M={MatGold}/>
          </group>
        ))}
        {/* Central tower — tallest */}
        <Cyl  p={[0,0.55,0]}  rt={0.09} rb={0.12}  h={0.44} seg={20} c="#c89848" M={MatSand}/>
        <Cyl  p={[0,0.81,0]}  rt={0.065} rb={0.09} h={0.3}  seg={20} c="#d4a458" M={MatSand}/>
        <Cyl  p={[0,1.0,0]}   rt={0.04} rb={0.065} h={0.22} seg={16} c="#c89848" M={MatSand}/>
        <Cone p={[0,1.14,0]}  r={0.04}  h={0.16}   seg={16} c="#d4a020" M={MatGold}/>
      </Lm>

      {/* ── Borobudur ─────────────────────────────────────────────────────────── */}
      <Lm p={L.borobudur} info={INFO.borobudur} mk="borobudur">
        {/* 4 square terraces */}
        <Box p={[0,0.05,0]}  s={[0.8,0.1,0.8]}    c="#a8a090"/>
        <Box p={[0,0.18,0]}  s={[0.64,0.14,0.64]} c="#b0a898"/>
        <Box p={[0,0.32,0]}  s={[0.5,0.14,0.5]}   c="#a8a090"/>
        <Box p={[0,0.46,0]}  s={[0.38,0.14,0.38]} c="#b0a898"/>
        {/* 3 circular terraces */}
        <Cyl p={[0,0.6,0]}   rt={0.22} rb={0.22}  h={0.1}  seg={24} c="#a0988a"/>
        <Cyl p={[0,0.72,0]}  rt={0.16} rb={0.16}  h={0.1}  seg={24} c="#a8a090"/>
        <Cyl p={[0,0.84,0]}  rt={0.1}  rb={0.1}   h={0.1}  seg={24} c="#a0988a"/>
        {/* Bell stupas (perforated) on circular tiers */}
        {([
          {r:0.17, n:8, y:0.66},
          {r:0.12, n:6, y:0.78},
          {r:0.07, n:4, y:0.9},
        ] as {r:number;n:number;y:number}[]).flatMap(({r,n,y},ti)=>
          Array.from({length:n},(_,i)=>{
            const a=i*Math.PI*2/n;
            return <Ball key={`${ti}-${i}`} p={[Math.sin(a)*r, y, Math.cos(a)*r]} r={0.038} c="#bcb4a0"/>;
          })
        )}
        {/* Central main stupa */}
        <Ball p={[0,1.0,0]}  r={0.075} c="#c8c0b0"/>
        <Cone p={[0,1.1,0]}  r={0.018} h={0.08} seg={8} c="#d8d0c0"/>
      </Lm>

      {/* ── Tokyo Skytree ─────────────────────────────────────────────────────── */}
      <Lm p={L.tokyoSkytree} info={INFO.tokyoSkytree} mk="tokyoSkytree">
        {/* Tripod base — 3 triangular legs */}
        {([0,120,240] as number[]).map((deg,i)=>{
          const a=deg*Math.PI/180;
          return <Box key={i} p={[Math.sin(a)*0.13,0.12,Math.cos(a)*0.13]} s={[0.07,0.24,0.07]} c="#4888b8"/>;
        })}
        {/* Base ring connector */}
        <Cyl p={[0,0.24,0]}  rt={0.15} rb={0.2}  h={0.08} seg={24} c="#3878a8"/>
        {/* Tapering main shaft */}
        <Cyl p={[0,0.7,0]}   rt={0.04} rb={0.14} h={0.92} seg={24} c="#40a0e8"/>
        {/* Lower observation deck torus */}
        <mesh position={[0,0.6,0]}>
          <torusGeometry args={[0.11,0.04,18,60]}/>
          <Mat c="#2870c0"/>
        </mesh>
        {/* Upper observation deck torus */}
        <mesh position={[0,0.78,0]}>
          <torusGeometry args={[0.075,0.03,16,48]}/>
          <Mat c="#2060b0"/>
        </mesh>
        {/* Broadcast antenna mast */}
        <Cyl p={[0,1.2,0]}   rt={0.006} rb={0.04} h={0.44} seg={8} c="#90c8f8"/>
        <Ball p={[0,1.44,0]} r={0.018} c="#c0e8ff"/>
      </Lm>

      {/* ── Great Pyramid of Giza ─────────────────────────────────────────────── */}
      <Lm p={L.pyramidGiza} s={0.125} info={INFO.pyramidGiza}>
        {/* Desert plateau */}
        <Box p={[0,0.03,0]} s={[1.4,0.06,1.0]} c="#d8c060" M={MatSand}/>
        {/* Great Pyramid of Khufu — Tura limestone casing */}
        <mesh position={[0,0.41,0]}>
          <coneGeometry args={[0.54,0.78,4]}/>
          <MatSand c="#f0d848"/>
        </mesh>
        {/* Pyramid of Khafre */}
        <mesh position={[0.6,0.32,0.3]}>
          <coneGeometry args={[0.4,0.62,4]}/>
          <MatSand c="#e8cc40"/>
        </mesh>
        {/* Pyramid of Menkaure */}
        <mesh position={[-0.52,0.22,0.38]}>
          <coneGeometry args={[0.28,0.42,4]}/>
          <MatSand c="#e8c838"/>
        </mesh>
        {/* Great Sphinx silhouette */}
        <Box p={[0.18,0.1,-0.3]}  s={[0.22,0.1,0.14]} c="#d4b840" M={MatSand}/>
        <Ball p={[0.28,0.17,-0.3]} r={0.05} c="#d4b840" M={MatSand}/>
      </Lm>

      {/* ── Table Mountain ────────────────────────────────────────────────────── */}
      <Lm p={L.tableMountain} info={INFO.tableMountain} mk="tableMountain">
        {/* Main mountain body */}
        <Cone p={[0,0.2,0]}      r={0.6} h={0.4} seg={8}  c="#8a7060"/>
        {/* Flat table top */}
        <Box p={[0,0.42,0]}      s={[0.84,0.04,0.38]}      c="#9a8070"/>
        {/* Devil's Peak (right) */}
        <Cone p={[0.48,0.3,0]}   r={0.2} h={0.3} seg={8}   c="#7a6050"/>
        {/* Lion's Head (left, rounded) */}
        <Ball p={[-0.44,0.26,0]} r={0.18} c="#806858"/>
        <Cone p={[-0.44,0.2,0]}  r={0.2} h={0.2} seg={8}   c="#806858"/>
        {/* Orographic cloud (tablecloth) */}
        <Box p={[0,0.47,0]}      s={[0.72,0.04,0.32]}      c="#e8f0ff"/>
      </Lm>

      {/* ── Statue of Liberty ─────────────────────────────────────────────────── */}
      <Lm p={L.statueLiberty} info={INFO.statueLiberty} mk="statueLiberty">
        {/* Star-fort pedestal — granite */}
        <Box p={[0,0.08,0]}    s={[0.22,0.16,0.22]}   c="#a0b0a8" M={MatStone}/>
        {/* Robe — oxidised copper patina */}
        <Cyl p={[0,0.3,0]}     rt={0.07} rb={0.11}    h={0.32} seg={16} c="#58d0b0" M={MatPatina}/>
        {/* Upper torso */}
        <Cyl p={[0,0.5,0]}     rt={0.065} rb={0.07}   h={0.2}  seg={16} c="#50c8a8" M={MatPatina}/>
        {/* Head */}
        <Ball p={[0,0.69,0]}   r={0.088} c="#60d8b8" M={MatPatina}/>
        {/* Crown — 7 rays */}
        {Array.from({length:7},(_,i)=>{
          const a=i*Math.PI*2/7;
          return <Box key={i} p={[Math.sin(a)*0.08,0.77,Math.cos(a)*0.08]} s={[0.018,0.1,0.018]} c="#50d0a8" M={MatPatina}/>;
        })}
        {/* Right arm raised — holding torch */}
        <Box p={[0.13,0.6,0]}    s={[0.04,0.2,0.04]}  c="#58d0b0" M={MatPatina}/>
        <Cyl p={[0.13,0.76,0]}   rt={0.02} rb={0.02}  h={0.14} seg={10} c="#58d0b0" M={MatPatina}/>
        <Ball p={[0.13,0.85,0]}  r={0.04} c="#ffe840" M={MatGold}/>
        {/* Left arm with tablet */}
        <Box p={[-0.09,0.52,0.1]} s={[0.04,0.16,0.04]} c="#50c8a8" M={MatPatina}/>
        <Box p={[-0.09,0.44,0.12]} s={[0.06,0.1,0.02]} c="#78e0c0" M={MatPatina}/>
      </Lm>

      {/* ── Mount Rushmore ────────────────────────────────────────────────────── */}
      <Lm p={L.mtRushmore} info={INFO.mtRushmore} mk="mtRushmore">
        {/* Mountain mass */}
        <Box p={[0,0.22,0]}   s={[0.82,0.44,0.34]}  c="#b8b0a8"/>
        <Cone p={[-0.22,0.56,0]} r={0.22} h={0.32} seg={8} c="#c0b8b0"/>
        <Cone p={[0.24,0.5,0]}  r={0.18} h={0.26} seg={8} c="#b8b0a8"/>
        {/* 4 carved presidential heads */}
        {([-0.27,-0.09,0.09,0.27] as number[]).map((x,i)=>(
          <group key={i}>
            <Ball p={[x,0.44,0.17]}  r={0.072} c="#c8c0b8"/>
            {/* Face features */}
            <Box  p={[x,0.39,0.24]}  s={[0.09,0.04,0.02]} c="#b8b0a8"/>
          </group>
        ))}
        {/* Talus slope below */}
        <Box p={[0,0.06,0]}   s={[0.8,0.12,0.36]}  c="#a8a098"/>
      </Lm>

      {/* ── Golden Gate Bridge ────────────────────────────────────────────────── */}
      <Lm p={L.goldenGate} info={INFO.goldenGate} mk="goldenGate">
        {/* Road deck — International Orange painted steel */}
        <Box p={[0,0.06,0]}    s={[0.82,0.04,0.13]}  c="#ff5820" M={MatMetal}/>
        {/* Tower 1 — left H-frame */}
        <Box p={[-0.3,0.38,0.04]}  s={[0.06,0.62,0.06]} c="#ff5820" M={MatMetal}/>
        <Box p={[-0.3,0.38,-0.04]} s={[0.06,0.62,0.06]} c="#ff5820" M={MatMetal}/>
        <Box p={[-0.3,0.26,0]}     s={[0.06,0.04,0.14]} c="#f04818" M={MatMetal}/>
        <Box p={[-0.3,0.48,0]}     s={[0.06,0.04,0.14]} c="#f04818" M={MatMetal}/>
        {/* Tower 2 — right H-frame */}
        <Box p={[0.3,0.38,0.04]}   s={[0.06,0.62,0.06]} c="#ff5820" M={MatMetal}/>
        <Box p={[0.3,0.38,-0.04]}  s={[0.06,0.62,0.06]} c="#ff5820" M={MatMetal}/>
        <Box p={[0.3,0.26,0]}      s={[0.06,0.04,0.14]} c="#f04818" M={MatMetal}/>
        <Box p={[0.3,0.48,0]}      s={[0.06,0.04,0.14]} c="#f04818" M={MatMetal}/>
        {/* Main catenary cables — high-strength steel wire rope */}
        <mesh position={[-0.225,0.49,0.05]} rotation={[0,0,0.52] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[-0.075,0.32,0.05]} rotation={[0,0,0.74] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[0.075,0.32,0.05]} rotation={[0,0,-0.74] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[0.225,0.49,0.05]} rotation={[0,0,-0.52] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[-0.225,0.49,-0.05]} rotation={[0,0,0.52] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[-0.075,0.32,-0.05]} rotation={[0,0,0.74] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[0.075,0.32,-0.05]} rotation={[0,0,-0.74] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[0.225,0.49,-0.05]} rotation={[0,0,-0.52] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        {/* Vertical suspender hangers */}
        {([-0.18,-0.09,0,0.09,0.18] as number[]).map((x,i)=>(
          <Box key={i} p={[x,0.14,0.05]} s={[0.008,0.16,0.008]} c="#e04010"/>
        ))}
      </Lm>

      {/* ── Grand Canyon ──────────────────────────────────────────────────────── */}
      <Lm p={L.grandCanyon} info={INFO.grandCanyon} mk="grandCanyon">
        {/* Colourful strata layers */}
        <Box p={[0,0.24,0]}     s={[0.84,0.08,0.4]}  c="#e87038"/>
        <Box p={[0,0.17,0]}     s={[0.84,0.08,0.4]}  c="#f08850"/>
        <Box p={[0,0.11,0]}     s={[0.84,0.06,0.4]}  c="#d86030"/>
        <Box p={[0,0.06,0]}     s={[0.84,0.06,0.4]}  c="#b85828"/>
        {/* Canyon chasm */}
        <Box p={[0,0.14,0]}     s={[0.18,0.26,0.44]} c="#401808"/>
        {/* Colorado River (thin blue strip) */}
        <Box p={[0,0.02,0]}     s={[0.1,0.04,0.44]}  c="#3080c0"/>
        {/* Mesa plateaux */}
        <Box p={[-0.36,0.29,0]} s={[0.2,0.04,0.4]}   c="#f8a060"/>
        <Box p={[0.36,0.29,0]}  s={[0.2,0.04,0.4]}   c="#f8a060"/>
      </Lm>

      {/* ── Niagara Falls ─────────────────────────────────────────────────────── */}
      <Lm p={L.niagaraFalls} info={INFO.niagaraFalls}>
        {/* Horseshoe cliff top */}
        <Box p={[0,0.36,0]}       s={[0.74,0.06,0.14]} c="#6898a8"/>
        <Box p={[-0.29,0.36,0.1]} s={[0.14,0.06,0.12]} c="#6898a8"/>
        <Box p={[0.29,0.36,0.1]}  s={[0.14,0.06,0.12]} c="#6898a8"/>
        {/* Horseshoe Falls curtain */}
        <Box p={[0,0.19,0.04]}    s={[0.66,0.3,0.1]}   c="#70c8e8"/>
        <Box p={[-0.25,0.19,0.12]} s={[0.12,0.3,0.12]}  c="#68c0e0"/>
        <Box p={[0.25,0.19,0.12]}  s={[0.12,0.3,0.12]}  c="#68c0e0"/>
        {/* American Falls (side) */}
        <Box p={[0.38,0.23,0]}    s={[0.04,0.22,0.1]}  c="#78d0f0"/>
        {/* Mist pool */}
        <Ball p={[0,0.04,0.18]}   r={0.17} c="#c8e8f8"/>
        <Ball p={[-0.2,0.06,0.16]} r={0.1} c="#d0eeff"/>
        <Ball p={[0.2,0.06,0.16]}  r={0.1} c="#d0eeff"/>
      </Lm>

      {/* ── Iguazu Falls ──────────────────────────────────────────────────────── */}
      <Lm p={L.iguazuFalls} info={INFO.iguazuFalls} mk="iguazuFalls">
        {/* U-shaped cliff — Devil's Throat */}
        <Box p={[0,0.32,0]}        s={[0.86,0.06,0.14]} c="#50a060"/>
        <Box p={[-0.33,0.32,0.1]}  s={[0.14,0.06,0.12]} c="#50a060"/>
        <Box p={[0.33,0.32,0.1]}   s={[0.14,0.06,0.12]} c="#50a060"/>
        {/* Multi-drop water curtain */}
        <Box p={[0,0.15,0.04]}     s={[0.74,0.3,0.1]}   c="#60c8e0"/>
        <Box p={[-0.29,0.15,0.1]}  s={[0.12,0.3,0.1]}   c="#58c0d8"/>
        <Box p={[0.29,0.15,0.1]}   s={[0.12,0.3,0.1]}   c="#58c0d8"/>
        {/* Jungle islands in flow */}
        <Ball p={[-0.12,0.28,0.02]} r={0.05} c="#306030"/>
        <Ball p={[0.14,0.29,0.02]}  r={0.04} c="#408040"/>
        {/* Spray mist */}
        <Ball p={[0,0.04,0.18]}    r={0.2}  c="#c0e8f8"/>
      </Lm>

      {/* ── Galápagos Islands ─────────────────────────────────────────────────── */}
      <Lm p={L.galapagos} info={INFO.galapagos} mk="galapagos">
        {/* Ocean base */}
        <Box p={[0,0.01,0]}         s={[0.76,0.02,0.6]}  c="#1880b8"/>
        {/* Isabela — largest island, shield volcano */}
        <Ball p={[0,0.09,0]}        r={0.22} c="#6a5848"/>
        <Cone p={[0,0.28,0]}        r={0.16} h={0.24} seg={8} c="#5a4838"/>
        <Ball p={[0,0.39,0]}        r={0.06} c="#382818"/>
        {/* Santa Cruz — medium, dense vegetation */}
        <Ball p={[0.3,0.07,0.1]}    r={0.14} c="#7a7858"/>
        <Cone p={[0.3,0.2,0.1]}     r={0.1}  h={0.16} seg={8} c="#6a5848"/>
        {/* Fernandina — active volcano, small */}
        <Ball p={[-0.24,0.05,-0.12]} r={0.1}  c="#786060"/>
        <Cone p={[-0.24,0.14,-0.12]} r={0.07} h={0.12} seg={8} c="#684848"/>
        <Ball p={[-0.24,0.19,-0.12]} r={0.028} c="#301010"/>
      </Lm>

      {/* ── Plitvice Lakes ────────────────────────────────────────────────────── */}
      <Lm p={L.plitviceLakes} info={INFO.plitviceLakes}>
        {/* Forest floor */}
        <Box p={[0,0.02,0]}          s={[0.66,0.04,0.5]}  c="#408040"/>
        {/* Cascading travertine lake terraces */}
        <Box p={[0,0.06,0]}          s={[0.54,0.04,0.4]}  c="#30c8e8"/>
        <Box p={[0.04,0.13,0.04]}    s={[0.4,0.06,0.3]}   c="#28b8d8"/>
        <Box p={[0.08,0.21,0.08]}    s={[0.3,0.06,0.22]}  c="#38c8e8"/>
        <Box p={[0.12,0.29,0.12]}    s={[0.2,0.06,0.16]}  c="#28b8d8"/>
        <Box p={[0.16,0.37,0.16]}    s={[0.12,0.06,0.1]}  c="#30c0e0"/>
        {/* Waterfalls between levels */}
        <Box p={[-0.06,0.1,0.16]}    s={[0.06,0.1,0.06]}  c="#60d8f0"/>
        <Box p={[-0.02,0.18,0.12]}   s={[0.06,0.08,0.06]} c="#60d8f0"/>
        <Box p={[0.04,0.26,0.1]}     s={[0.05,0.07,0.05]} c="#60d8f0"/>
        {/* Forest trees */}
        <Cone p={[-0.24,0.14,0]}     r={0.06} h={0.18} seg={6} c="#308030"/>
        <Cone p={[0.22,0.08,-0.12]}  r={0.05} h={0.15} seg={6} c="#308030"/>
      </Lm>

      {/* ── Swiss Alps ────────────────────────────────────────────────────────── */}
      <Lm p={L.swissAlps} info={INFO.swissAlps}>
        {/* Valley floor with green meadows */}
        <Box p={[0,0.04,0]}     s={[0.76,0.08,0.44]}  c="#88b058"/>
        {/* Matterhorn (iconic pyramid peak) */}
        <Cone p={[-0.22,0.38,0]} r={0.2} h={0.68} seg={4} c="#8888a0"/>
        {/* Eiger */}
        <Cone p={[0.2,0.3,0]}    r={0.18} h={0.52} seg={6} c="#9090a8"/>
        {/* Jungfrau */}
        <Cone p={[0,0.35,0.12]}  r={0.16} h={0.46} seg={6} c="#9898b0"/>
        {/* Snow caps */}
        <Cone p={[-0.22,0.68,0]} r={0.09} h={0.16} seg={4} c="#eef6ff"/>
        <Cone p={[0.2,0.56,0]}   r={0.08} h={0.13} seg={6} c="#eef6ff"/>
        <Cone p={[0,0.6,0.12]}   r={0.07} h={0.12} seg={6} c="#eef6ff"/>
        {/* Glacier */}
        <Box p={[0.02,0.1,0.06]} s={[0.16,0.06,0.2]}  c="#d8eeff"/>
      </Lm>

      {/* ── Mount Everest ─────────────────────────────────────────────────────── */}
      <Lm p={L.mtEverest} s={0.125} info={INFO.mtEverest}>
        {/* Himalayan ridge base */}
        <Box p={[0,0.14,0]}         s={[0.84,0.28,0.4]}  c="#807090"/>
        {/* Everest main peak — classic pyramid */}
        <Cone p={[0,0.56,0]}        r={0.28} h={0.76} seg={6} c="#908898"/>
        {/* Lhotse */}
        <Cone p={[0.3,0.42,0.14]}   r={0.18} h={0.52} seg={6} c="#807080"/>
        {/* Nuptse */}
        <Cone p={[-0.28,0.36,0.12]} r={0.16} h={0.44} seg={6} c="#887888"/>
        {/* Changtse (north peak) */}
        <Cone p={[-0.1,0.34,-0.18]} r={0.14} h={0.38} seg={6} c="#806878"/>
        {/* Summit snow / death zone */}
        <Cone p={[0,0.88,0]}        r={0.11} h={0.2}  seg={6} c="#e8f0ff"/>
        <Cone p={[0.3,0.69,0.14]}   r={0.06} h={0.1}  seg={6} c="#e8f0ff"/>
        {/* Snow plume */}
        <Box p={[0.06,1.0,0]}       s={[0.12,0.04,0.06]} c="#ffffff"/>
      </Lm>

      {/* ── Ha Long Bay ───────────────────────────────────────────────────────── */}
      <Lm p={L.haLongBay} info={INFO.haLongBay}>
        {/* Emerald/jade water */}
        <Box p={[0,0.02,0]}          s={[0.8,0.04,0.58]}  c="#1090b8"/>
        {/* Karst limestone pillars — varied heights and widths */}
        <Cyl p={[-0.24,0.36,0.06]}   rt={0.055} rb={0.1}  h={0.72} seg={10} c="#687890"/>
        <Cyl p={[0.06,0.26,-0.04]}   rt={0.07}  rb={0.12} h={0.52} seg={10} c="#6a7888"/>
        <Cyl p={[0.24,0.42,0.04]}    rt={0.05}  rb={0.09} h={0.84} seg={10} c="#788090"/>
        <Cyl p={[-0.06,0.46,0.16]}   rt={0.044} rb={0.08} h={0.92} seg={10} c="#788090"/>
        <Cyl p={[0,0.2,-0.16]}       rt={0.06}  rb={0.1}  h={0.4}  seg={10} c="#686880"/>
        <Cyl p={[0.14,0.18,0.2]}     rt={0.04}  rb={0.07} h={0.36} seg={10} c="#708090"/>
        {/* Jungle vegetation on pillar tops */}
        <Ball p={[-0.24,0.74,0.06]}  r={0.054} c="#306030"/>
        <Ball p={[0.24,0.86,0.04]}   r={0.048} c="#306030"/>
        <Ball p={[-0.06,0.94,0.16]}  r={0.042} c="#406040"/>
        <Ball p={[0.06,0.52,-0.04]}  r={0.038} c="#386038"/>
      </Lm>

      {/* ── Victoria Falls ────────────────────────────────────────────────────── */}
      <Lm p={L.victoriaFalls} info={INFO.victoriaFalls} mk="victoriaFalls">
        {/* Clifftop plateau — widest waterfall on earth */}
        <Box p={[0,0.42,0]}       s={[0.92,0.07,0.14]}  c="#58a858"/>
        {/* Water curtain */}
        <Box p={[0,0.22,0.02]}    s={[0.88,0.38,0.1]}   c="#5098d8"/>
        {/* Gorge wall opposite */}
        <Box p={[0,0.22,0.16]}    s={[0.9,0.4,0.06]}    c="#806050"/>
        {/* Boiling pot at base */}
        <Ball p={[0,0.06,0.18]}   r={0.2}  c="#b0d8f0"/>
        <Ball p={[-0.22,0.1,0.16]} r={0.12} c="#c0e0f8"/>
        <Ball p={[0.22,0.1,0.16]}  r={0.12} c="#c0e0f8"/>
        {/* Spray rising up */}
        <Ball p={[0,0.52,0.1]}    r={0.1}  c="#d8ecff"/>
      </Lm>

      {/* ── Great Barrier Reef ────────────────────────────────────────────────── */}
      <Lm p={L.greatBarrierReef} info={INFO.greatBarrierReef}>
        {/* Coral sea */}
        <Box p={[0,0.02,0]}          s={[0.94,0.04,0.54]}  c="#0888c0"/>
        {/* Staghorn coral */}
        <Ball p={[-0.3,0.14,0.04]}   r={0.1}   c="#ff4820"/>
        <Ball p={[0.08,0.15,0.06]}   r={0.13}  c="#ff9030"/>
        {/* Brain coral */}
        <Ball p={[0.3,0.11,0.06]}    r={0.09}  c="#e8a028"/>
        {/* Table coral */}
        <Box p={[-0.08,0.1,0.1]}     s={[0.16,0.04,0.14]} c="#30d888"/>
        {/* Sea fan / soft coral */}
        <Ball p={[0.18,0.1,-0.1]}    r={0.1}   c="#ff6080"/>
        <Ball p={[-0.2,0.09,-0.08]}  r={0.07}  c="#40d8e0"/>
        {/* Clown fish habitat (orange) */}
        <Ball p={[0.36,0.09,-0.08]}  r={0.07}  c="#f8a020"/>
        {/* Blue tang habitat */}
        <Ball p={[-0.36,0.08,0.1]}   r={0.06}  c="#30c0d8"/>
        {/* Sea anemone */}
        <Ball p={[0,0.12,0.14]}      r={0.08}  c="#e070d0"/>
      </Lm>

      {/* ── Milford Sound ─────────────────────────────────────────────────────── */}
      <Lm p={L.milfordSound} info={INFO.milfordSound}>
        {/* Fiord water */}
        <Box p={[0,0.02,0]}        s={[0.66,0.04,0.34]}  c="#4070b8"/>
        {/* Mitre Peak — iconic triangular spire */}
        <Cone p={[-0.14,0.5,0]}    r={0.2}  h={1.0} seg={6} c="#6070a0"/>
        <Cone p={[-0.14,0.88,0]}   r={0.07} h={0.16} seg={6} c="#ddeeff"/>
        {/* Companion peaks */}
        <Cone p={[0.22,0.34,0]}    r={0.18} h={0.68} seg={6} c="#5868a0"/>
        <Cone p={[0.04,0.28,0.12]} r={0.15} h={0.58} seg={6} c="#6070a0"/>
        {/* Stirling Falls — thin white stripe */}
        <Box p={[-0.06,0.3,0.15]}  s={[0.022,0.48,0.022]} c="#aaccee"/>
        {/* Lady Bowen Falls */}
        <Box p={[0.1,0.24,0.14]}   s={[0.016,0.36,0.016]} c="#aaccee"/>
        {/* Mist at waterfall base */}
        <Ball p={[-0.06,0.06,0.18]} r={0.06} c="#c8e0f8"/>
        <Ball p={[0.1,0.06,0.16]}   r={0.05} c="#c8e0f8"/>
      </Lm>

      {/* ══ US State Landmarks ══════════════════════════════════════════ */}
      {/* alabamaRocket */}
      <Lm p={L.alabamaRocket} info={INFO.alabamaRocket}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#cc4422" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
      </Lm>
      {/* alaskaDenali */}
      <Lm p={L.alaskaDenali} info={INFO.alaskaDenali}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#8899bb" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#8899bb" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* arkansasCrystal */}
      <Lm p={L.arkansasCrystal} info={INFO.arkansasCrystal}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#6688aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#6688aa"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#6688aa" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* californiaYosemite */}
      <Lm p={L.californiaYosemite} info={INFO.californiaYosemite}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#5a8040" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#5a8040" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* coloradoRocky */}
      <Lm p={L.coloradoRocky} info={INFO.coloradoRocky}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#7080a8" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#7080a8" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* connecticutMark */}
      <Lm p={L.connecticutMark} info={INFO.connecticutMark}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#8855aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#8855aa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#8855aa"/></mesh>
      </Lm>
      {/* delawareCape */}
      <Lm p={L.delawareCape} info={INFO.delawareCape}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#3399cc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* floridaKSC */}
      <Lm p={L.floridaKSC} info={INFO.floridaKSC}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#aaaacc" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#aaaacc"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#aaaacc"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#aaaacc"/></mesh>
      </Lm>
      {/* georgiaStone */}
      <Lm p={L.georgiaStone} info={INFO.georgiaStone}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#888888" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#888888" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* hawaiiDiamond */}
      <Lm p={L.hawaiiDiamond} info={INFO.hawaiiDiamond}>
        <mesh position={[0,0.16,0]}><coneGeometry args={[0.35,0.38,8]}/><meshStandardMaterial color="#884422" roughness={0.8}/></mesh>
        <mesh position={[0,0.38,0]}><coneGeometry args={[0.22,0.26,8]}/><meshStandardMaterial color="#884422" roughness={0.7}/></mesh>
        <mesh position={[0,0.5,0]}><cylinderGeometry args={[0.09,0.14,0.06,8]}/><meshStandardMaterial color="#cc4400"/></mesh>
      </Lm>
      {/* idahoCraters */}
      <Lm p={L.idahoCraters} info={INFO.idahoCraters}>
        <mesh position={[0,0.16,0]}><coneGeometry args={[0.35,0.38,8]}/><meshStandardMaterial color="#aa5522" roughness={0.8}/></mesh>
        <mesh position={[0,0.38,0]}><coneGeometry args={[0.22,0.26,8]}/><meshStandardMaterial color="#aa5522" roughness={0.7}/></mesh>
        <mesh position={[0,0.5,0]}><cylinderGeometry args={[0.09,0.14,0.06,8]}/><meshStandardMaterial color="#cc4400"/></mesh>
      </Lm>
      {/* illinoisBean */}
      <Lm p={L.illinoisBean} info={INFO.illinoisBean}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#aabbcc"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#aabbcc"/></mesh>
      </Lm>
      {/* indianaSpeedway */}
      <Lm p={L.indianaSpeedway} info={INFO.indianaSpeedway}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc4422" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
      </Lm>
      {/* iowaFields */}
      <Lm p={L.iowaFields} info={INFO.iowaFields}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#669944" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#669944"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#669944"/></mesh>
      </Lm>
      {/* kansasPrairie */}
      <Lm p={L.kansasPrairie} info={INFO.kansasPrairie}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#88aa55" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#88aa55"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#88aa55"/></mesh>
      </Lm>
      {/* kentuckyMammoth */}
      <Lm p={L.kentuckyMammoth} info={INFO.kentuckyMammoth}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886644" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886644"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886644"/></mesh>
      </Lm>
      {/* louisianaFrench */}
      <Lm p={L.louisianaFrench} info={INFO.louisianaFrench}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc7733" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc7733"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc7733"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc7733"/></mesh>
      </Lm>
      {/* maineAcadia */}
      <Lm p={L.maineAcadia} info={INFO.maineAcadia}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#778899" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#778899" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* marylandFort */}
      <Lm p={L.marylandFort} info={INFO.marylandFort}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aa8844" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aa8844"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aa8844"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aa8844"/></mesh>
      </Lm>
      {/* massFreedom */}
      <Lm p={L.massFreedom} info={INFO.massFreedom}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc5533" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc5533"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc5533"/></mesh>
      </Lm>
      {/* michiganPictured */}
      <Lm p={L.michiganPictured} info={INFO.michiganPictured}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#4488cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#4488cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#4488cc"/></mesh>
      </Lm>
      {/* minnesotaMall */}
      <Lm p={L.minnesotaMall} info={INFO.minnesotaMall}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#4466aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#4466aa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#4466aa"/></mesh>
      </Lm>
      {/* mississippiNatch */}
      <Lm p={L.mississippiNatch} info={INFO.mississippiNatch}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#887766" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#887766"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#887766"/></mesh>
      </Lm>
      {/* missouriArch */}
      <Lm p={L.missouriArch} info={INFO.missouriArch}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aabb" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aabb"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aabb"/></mesh>
      </Lm>
      {/* montanaGlacier */}
      <Lm p={L.montanaGlacier} info={INFO.montanaGlacier}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aaccdd" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aaccdd" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* nebraskaChimney */}
      <Lm p={L.nebraskaChimney} info={INFO.nebraskaChimney}>
        <mesh position={[0,0.04,0]} scale={[0.14,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9966" roughness={0.6}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.44,8]}/><meshStandardMaterial color="#cc9966"/></mesh>
        <mesh position={[0,0.54,0]}><coneGeometry args={[0.04,0.14,8]}/><meshStandardMaterial color="#cc9966" metalness={0.3}/></mesh>
      </Lm>
      {/* nevadaVegas */}
      <Lm p={L.nevadaVegas} info={INFO.nevadaVegas}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#ffcc22" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#ffcc22"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#ffcc22"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#ffcc22" emissive="#ffcc22" emissiveIntensity={0.35}/></mesh>
      </Lm>
      {/* nhWashington */}
      <Lm p={L.nhWashington} info={INFO.nhWashington}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#99aabb" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#99aabb" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* njAtlantic */}
      <Lm p={L.njAtlantic} info={INFO.njAtlantic}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#4466bb" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#4466bb"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#4466bb"/></mesh>
      </Lm>
      {/* nmWhiteSands */}
      <Lm p={L.nmWhiteSands} info={INFO.nmWhiteSands}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#eeeedc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#eeeedc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#eeeedc"/></mesh>
      </Lm>
      {/* nyEmpire */}
      <Lm p={L.nyEmpire} info={INFO.nyEmpire}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#667799" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#667799"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#667799"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#667799"/></mesh>
      </Lm>
      {/* ncBlueRidge */}
      <Lm p={L.ncBlueRidge} info={INFO.ncBlueRidge}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#88aa99" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#88aa99" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* ndTheodore */}
      <Lm p={L.ndTheodore} info={INFO.ndTheodore}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#bb9966" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#bb9966" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* ohioRock */}
      <Lm p={L.ohioRock} info={INFO.ohioRock}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#4466aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#4466aa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#4466aa"/></mesh>
      </Lm>
      {/* oklahomaMemorial */}
      <Lm p={L.oklahomaMemorial} info={INFO.oklahomaMemorial}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#886655" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#886655"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#886655"/></mesh>
      </Lm>
      {/* oregonCrater */}
      <Lm p={L.oregonCrater} info={INFO.oregonCrater}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2266aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
      </Lm>
      {/* paLibertyBell */}
      <Lm p={L.paLibertyBell} info={INFO.paLibertyBell}>
        <mesh position={[0,0.04,0]} scale={[0.14,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886633" roughness={0.6}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.44,8]}/><meshStandardMaterial color="#886633"/></mesh>
        <mesh position={[0,0.54,0]}><coneGeometry args={[0.04,0.14,8]}/><meshStandardMaterial color="#886633" metalness={0.3}/></mesh>
      </Lm>
      {/* riCliffWalk */}
      <Lm p={L.riCliffWalk} info={INFO.riCliffWalk}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#778899" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#778899"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#778899"/></mesh>
      </Lm>
      {/* scFortSumter */}
      <Lm p={L.scFortSumter} info={INFO.scFortSumter}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886655" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886655"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#886655"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#886655"/></mesh>
      </Lm>
      {/* tnGraceland */}
      <Lm p={L.tnGraceland} info={INFO.tnGraceland}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#884433" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#884433"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#884433"/></mesh>
      </Lm>
      {/* txAlamo */}
      <Lm p={L.txAlamo} info={INFO.txAlamo}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ddccaa" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ddccaa"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#ddccaa"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#ddccaa"/></mesh>
      </Lm>
      {/* utahArches */}
      <Lm p={L.utahArches} info={INFO.utahArches}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8844" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8844"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8844"/></mesh>
      </Lm>
      {/* vtStowe */}
      <Lm p={L.vtStowe} info={INFO.vtStowe}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#668844" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#668844" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* vaMonticello */}
      <Lm p={L.vaMonticello} info={INFO.vaMonticello}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#eeddcc" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#eeddcc"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#eeddcc" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* waSpaceNeedle */}
      <Lm p={L.waSpaceNeedle} info={INFO.waSpaceNeedle}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#888888" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#888888"/></mesh>
      </Lm>
      {/* wvNewRiver */}
      <Lm p={L.wvNewRiver} info={INFO.wvNewRiver}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#666688" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#666688"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#666688"/></mesh>
      </Lm>
      {/* wiHouseRock */}
      <Lm p={L.wiHouseRock} info={INFO.wiHouseRock}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#664422" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#664422"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#664422"/></mesh>
      </Lm>
      {/* wyOldFaithful */}
      <Lm p={L.wyOldFaithful} info={INFO.wyOldFaithful}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.12,0.15,0.12,10]}/><meshStandardMaterial color="#888880" roughness={0.8}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.32,10]}/><meshStandardMaterial color="#b8e8f8" roughness={0.3} transparent opacity={0.85}/></mesh>
        <mesh position={[0,0.5,0]}><sphereGeometry args={[0.1,10,8]}/><meshStandardMaterial color="#b8e8f8" roughness={0.3} transparent opacity={0.7}/></mesh>
      </Lm>

      {/* ══ France ═══════════════════════════════════════════════════════ */}
      {/* montSaintMichelF */}
      <Lm p={L.montSaintMichelF} info={INFO.montSaintMichelF}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d0c090" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d0c090"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#d0c090"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#d0c090"/></mesh>
      </Lm>
      {/* versaillesF */}
      <Lm p={L.versaillesF} info={INFO.versaillesF} mk="versaillesF">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d888" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d888"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d888"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d888"/></mesh>
      </Lm>
      {/* notreDameF */}
      <Lm p={L.notreDameF} info={INFO.notreDameF} mk="notreDameF">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8c0a0" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8c0a0"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8c0a0"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8c0a0"/></mesh>
      </Lm>
      {/* niceRiviera */}
      <Lm p={L.niceRiviera} info={INFO.niceRiviera}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#30aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* pontDuGard */}
      <Lm p={L.pontDuGard} info={INFO.pontDuGard}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4b870" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4b870"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4b870"/></mesh>
      </Lm>
      {/* chamonixAlps */}
      <Lm p={L.chamonixAlps} info={INFO.chamonixAlps}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* carcassonneF */}
      <Lm p={L.carcassonneF} info={INFO.carcassonneF}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b880" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b880"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8b880"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8b880"/></mesh>
      </Lm>
      {/* chambordF */}
      <Lm p={L.chambordF} info={INFO.chambordF}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e0d490" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e0d490"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e0d490"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e0d490"/></mesh>
      </Lm>
      {/* bordeauxWine */}
      <Lm p={L.bordeauxWine} info={INFO.bordeauxWine}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#882233" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#882233"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#882233"/></mesh>
      </Lm>
      {/* colmarAlsace */}
      <Lm p={L.colmarAlsace} info={INFO.colmarAlsace}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#dd8844" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#dd8844"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#dd8844"/></mesh>
      </Lm>

      {/* ══ Spain ════════════════════════════════════════════════════════ */}
      {/* alhambra */}
      <Lm p={L.alhambra} info={INFO.alhambra}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c09040" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c09040"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c09040"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c09040"/></mesh>
      </Lm>
      {/* parkGuell */}
      <Lm p={L.parkGuell} info={INFO.parkGuell}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#cc5533" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#cc5533"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#cc5533"/></mesh>
      </Lm>
      {/* sevilleCathedral */}
      <Lm p={L.sevilleCathedral} info={INFO.sevilleCathedral}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a050" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a050"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a050"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a050"/></mesh>
      </Lm>
      {/* guggenheimBilbao */}
      <Lm p={L.guggenheimBilbao} info={INFO.guggenheimBilbao}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#8899cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#8899cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#8899cc"/></mesh>
      </Lm>
      {/* teideVolcano */}
      <Lm p={L.teideVolcano} info={INFO.teideVolcano}>
        <mesh position={[0,0.16,0]}><coneGeometry args={[0.35,0.38,8]}/><meshStandardMaterial color="#884422" roughness={0.8}/></mesh>
        <mesh position={[0,0.38,0]}><coneGeometry args={[0.22,0.26,8]}/><meshStandardMaterial color="#884422" roughness={0.7}/></mesh>
        <mesh position={[0,0.5,0]}><cylinderGeometry args={[0.09,0.14,0.06,8]}/><meshStandardMaterial color="#cc4400"/></mesh>
      </Lm>
      {/* santiagoDeComp */}
      <Lm p={L.santiagoDeComp} info={INFO.santiagoDeComp}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d0c0a0" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d0c0a0"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#d0c0a0"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#d0c0a0"/></mesh>
      </Lm>
      {/* toledoSpain */}
      <Lm p={L.toledoSpain} info={INFO.toledoSpain}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a870" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a870"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a870"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a870"/></mesh>
      </Lm>
      {/* ibizaSpain */}
      <Lm p={L.ibizaSpain} info={INFO.ibizaSpain}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#30bbcc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* costaBrava */}
      <Lm p={L.costaBrava} info={INFO.costaBrava}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#2299bb" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* pampalonaFiesta */}
      <Lm p={L.pampalonaFiesta} info={INFO.pampalonaFiesta}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc3322" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc3322"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc3322"/></mesh>
      </Lm>

      {/* ══ Italy ════════════════════════════════════════════════════════ */}
      {/* leaningPisa */}
      <Lm p={L.leaningPisa} info={INFO.leaningPisa}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#f0e8d0" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#f0e8d0"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#f0e8d0"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#f0e8d0"/></mesh>
      </Lm>
      {/* veniceCanals */}
      <Lm p={L.veniceCanals} info={INFO.veniceCanals}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#3388cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
      </Lm>
      {/* amalfiCoast */}
      <Lm p={L.amalfiCoast} info={INFO.amalfiCoast}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#ee8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#ee8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#ee8833"/></mesh>
      </Lm>
      {/* vaticanCity */}
      <Lm p={L.vaticanCity} info={INFO.vaticanCity}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0ecff" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0ecff"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#f0ecff" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* pompeii */}
      <Lm p={L.pompeii} info={INFO.pompeii}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b888" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b888"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8b888"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8b888"/></mesh>
      </Lm>
      {/* cinqueTerre */}
      <Lm p={L.cinqueTerre} info={INFO.cinqueTerre}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#ee8844" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#ee8844"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#ee8844"/></mesh>
      </Lm>
      {/* lakeComo */}
      <Lm p={L.lakeComo} info={INFO.lakeComo}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#3399bb" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#3399bb"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#3399bb"/></mesh>
      </Lm>
      {/* dolomites */}
      <Lm p={L.dolomites} info={INFO.dolomites}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* treviFountain */}
      <Lm p={L.treviFountain} info={INFO.treviFountain}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d0c890" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d0c890"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d0c890"/></mesh>
      </Lm>
      {/* siciliaTemple */}
      <Lm p={L.siciliaTemple} info={INFO.siciliaTemple}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d4b870" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d4b870"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d4b870"/></mesh>
      </Lm>

      {/* ══ United Kingdom ═══════════════════════════════════════════════ */}
      {/* bigBen */}
      <Lm p={L.bigBen} info={INFO.bigBen} mk="bigBen">
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#c8b870" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#c8b870"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#c8b870"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#c8b870"/></mesh>
      </Lm>
      {/* towerBridge */}
      <Lm p={L.towerBridge} info={INFO.towerBridge} mk="towerBridge">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#8899aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#8899aa"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#8899aa"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#8899aa"/></mesh>
      </Lm>
      {/* edinburghCastle */}
      <Lm p={L.edinburghCastle} info={INFO.edinburghCastle}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#888888" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#888888"/></mesh>
      </Lm>
      {/* buckinghamPalace */}
      <Lm p={L.buckinghamPalace} info={INFO.buckinghamPalace}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d888" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d888"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d888"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d888"/></mesh>
      </Lm>
      {/* bathRomans */}
      <Lm p={L.bathRomans} info={INFO.bathRomans}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d4c890" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d4c890"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d4c890"/></mesh>
      </Lm>
      {/* giantsCauseway */}
      <Lm p={L.giantsCauseway} info={INFO.giantsCauseway}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#446688" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#446688"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#446688"/></mesh>
      </Lm>
      {/* lakeDistrict */}
      <Lm p={L.lakeDistrict} info={INFO.lakeDistrict}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#5588aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#5588aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#5588aa"/></mesh>
      </Lm>
      {/* windsorCastle */}
      <Lm p={L.windsorCastle} info={INFO.windsorCastle}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0b080" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0b080"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0b080"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0b080"/></mesh>
      </Lm>
      {/* hadrianWall */}
      <Lm p={L.hadrianWall} info={INFO.hadrianWall}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#999988" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#999988"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#999988"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#999988"/></mesh>
      </Lm>
      {/* cotswolds */}
      <Lm p={L.cotswolds} info={INFO.cotswolds}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#aa9944" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#aa9944"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#aa9944"/></mesh>
      </Lm>

      {/* ══ Germany ══════════════════════════════════════════════════════ */}
      {/* brandenburgGate */}
      <Lm p={L.brandenburgGate} info={INFO.brandenburgGate}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4c080" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4c080"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4c080"/></mesh>
      </Lm>
      {/* neuschwanstein */}
      <Lm p={L.neuschwanstein} info={INFO.neuschwanstein} mk="neuschwanstein">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e0eeff" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e0eeff"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e0eeff"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e0eeff"/></mesh>
      </Lm>
      {/* cologneGermany */}
      <Lm p={L.cologneGermany} info={INFO.cologneGermany}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aaaacc" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aaaacc"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aaaacc"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aaaacc"/></mesh>
      </Lm>
      {/* rhineValley */}
      <Lm p={L.rhineValley} info={INFO.rhineValley}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#2266aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#2266aa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#2266aa"/></mesh>
      </Lm>
      {/* blackForest */}
      <Lm p={L.blackForest} info={INFO.blackForest}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#226633" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#226633" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#44aa44" roughness={0.5}/></mesh>
      </Lm>
      {/* heidelbergCastle */}
      <Lm p={L.heidelbergCastle} info={INFO.heidelbergCastle}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#bb9944" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#bb9944"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#bb9944"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#bb9944"/></mesh>
      </Lm>
      {/* bavAlps */}
      <Lm p={L.bavAlps} info={INFO.bavAlps}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* hamburgHarbor */}
      <Lm p={L.hamburgHarbor} info={INFO.hamburgHarbor}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#334466" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#334466"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#334466"/></mesh>
      </Lm>
      {/* rothenburg */}
      <Lm p={L.rothenburg} info={INFO.rothenburg}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9933" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9933"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc9933"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc9933"/></mesh>
      </Lm>
      {/* munichMarien */}
      <Lm p={L.munichMarien} info={INFO.munichMarien}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8822" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
      </Lm>

      {/* ══ Japan ════════════════════════════════════════════════════════ */}
      {/* mountFuji */}
      <Lm p={L.mountFuji} info={INFO.mountFuji} mk="mountFuji">
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#667799" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#667799" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#ffffff" roughness={0.5}/></mesh>
      </Lm>
      {/* fushimiInari */}
      <Lm p={L.fushimiInari} info={INFO.fushimiInari} mk="fushimiInari">
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc3322" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc3322"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc3322"/></mesh>
      </Lm>
      {/* hiroshimaPeace */}
      <Lm p={L.hiroshimaPeace} info={INFO.hiroshimaPeace}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#888888" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#888888"/></mesh>
      </Lm>
      {/* naraDeer */}
      <Lm p={L.naraDeer} info={INFO.naraDeer}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* osakaCastle */}
      <Lm p={L.osakaCastle} info={INFO.osakaCastle} mk="osakaCastle">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#4488cc" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#4488cc"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#4488cc"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#4488cc"/></mesh>
      </Lm>
      {/* arashiyamaBamboo */}
      <Lm p={L.arashiyamaBamboo} info={INFO.arashiyamaBamboo}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>
      {/* himejCastle */}
      <Lm p={L.himejCastle} info={INFO.himejCastle}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0f0" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
      </Lm>
      {/* hokkaidoLav */}
      <Lm p={L.hokkaidoLav} info={INFO.hokkaidoLav}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#9944cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#9944cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#9944cc"/></mesh>
      </Lm>
      {/* shibuyaCrossing */}
      <Lm p={L.shibuyaCrossing} info={INFO.shibuyaCrossing}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#334466" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#334466"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#334466"/></mesh>
      </Lm>
      {/* kyotoTemple */}
      <Lm p={L.kyotoTemple} info={INFO.kyotoTemple}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8822" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
      </Lm>

      {/* ══ Australia ════════════════════════════════════════════════════ */}
      {/* sydneyOpera */}
      <Lm p={L.sydneyOpera} info={INFO.sydneyOpera}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f8ff" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f8ff"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#f0f8ff" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* uluru */}
      <Lm p={L.uluru} info={INFO.uluru}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#cc5522" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#cc5522" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#dd6633" roughness={0.5}/></mesh>
      </Lm>
      {/* blueMountains */}
      <Lm p={L.blueMountains} info={INFO.blueMountains}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#7799bb" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#7799bb" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* greatOceanRoad */}
      <Lm p={L.greatOceanRoad} info={INFO.greatOceanRoad}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#2288cc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* kakaduNP */}
      <Lm p={L.kakaduNP} info={INFO.kakaduNP}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>
      {/* whitsundays */}
      <Lm p={L.whitsundays} info={INFO.whitsundays}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* bondiBeach */}
      <Lm p={L.bondiBeach} info={INFO.bondiBeach}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* daintreeRF */}
      <Lm p={L.daintreeRF} info={INFO.daintreeRF}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#228833" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#228833"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#228833"/></mesh>
      </Lm>
      {/* purnululu */}
      <Lm p={L.purnululu} info={INFO.purnululu}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#cc7744" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#cc7744" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#dd8855" roughness={0.5}/></mesh>
      </Lm>
      {/* tasmaniaFreycinet */}
      <Lm p={L.tasmaniaFreycinet} info={INFO.tasmaniaFreycinet}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#778899" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#778899" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>

      {/* ══ China ════════════════════════════════════════════════════════ */}
      {/* forbiddenCity */}
      <Lm p={L.forbiddenCity} info={INFO.forbiddenCity} mk="forbiddenCity">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc4422" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
      </Lm>
      {/* terracottaArmy */}
      <Lm p={L.terracottaArmy} info={INFO.terracottaArmy} mk="terracottaArmy">
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#c8a866" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#c8a866"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#c8a866"/></mesh>
      </Lm>
      {/* liRiverChina */}
      <Lm p={L.liRiverChina} info={INFO.liRiverChina}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#55aa88" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#55aa88" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* zhangjiajie */}
      <Lm p={L.zhangjiajie} info={INFO.zhangjiajie}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#667799" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#667799" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* yellowMountain */}
      <Lm p={L.yellowMountain} info={INFO.yellowMountain}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#9999bb" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#9999bb" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* potalaLhasa */}
      <Lm p={L.potalaLhasa} info={INFO.potalaLhasa} mk="potalaLhasa">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0e8" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0e8"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#f0f0e8"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#f0f0e8"/></mesh>
      </Lm>
      {/* westLakeHangzhou */}
      <Lm p={L.westLakeHangzhou} info={INFO.westLakeHangzhou}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#33aacc" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#33aacc"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#33aacc"/></mesh>
      </Lm>
      {/* guilinKarst */}
      <Lm p={L.guilinKarst} info={INFO.guilinKarst}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#667799" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#667799" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* summerPalaceB */}
      <Lm p={L.summerPalaceB} info={INFO.summerPalaceB}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8822" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
      </Lm>
      {/* lijiangOldTown */}
      <Lm p={L.lijiangOldTown} info={INFO.lijiangOldTown}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#aa6633" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#aa6633"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#aa6633"/></mesh>
      </Lm>

      {/* ══ India ════════════════════════════════════════════════════════ */}
      {/* jaipurAmber */}
      <Lm p={L.jaipurAmber} info={INFO.jaipurAmber}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* keralaBackwaters */}
      <Lm p={L.keralaBackwaters} info={INFO.keralaBackwaters}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* varanasiGhats */}
      <Lm p={L.varanasiGhats} info={INFO.varanasiGhats}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#ff8822" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#ff8822"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#ff8822"/></mesh>
      </Lm>
      {/* goaBeaches */}
      <Lm p={L.goaBeaches} info={INFO.goaBeaches}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22ccbb" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* goldenTempleAm */}
      <Lm p={L.goldenTempleAm} info={INFO.goldenTempleAm}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4c020" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4c020"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#d4c020" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* mumbaiGateway */}
      <Lm p={L.mumbaiGateway} info={INFO.mumbaiGateway}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b870" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b870"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b870"/></mesh>
      </Lm>
      {/* hawaMahal */}
      <Lm p={L.hawaMahal} info={INFO.hawaMahal}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ee8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ee8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#ee8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#ee8833"/></mesh>
      </Lm>
      {/* ajantaCaves */}
      <Lm p={L.ajantaCaves} info={INFO.ajantaCaves}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc9944" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>
      {/* ranthambore */}
      <Lm p={L.ranthambore} info={INFO.ranthambore}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* delhiQutub */}
      <Lm p={L.delhiQutub} info={INFO.delhiQutub}>
        <mesh position={[0,0.04,0]} scale={[0.14,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944" roughness={0.6}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.44,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.54,0]}><coneGeometry args={[0.04,0.14,8]}/><meshStandardMaterial color="#cc9944" metalness={0.3}/></mesh>
      </Lm>

      {/* ══ Thailand ═════════════════════════════════════════════════════ */}
      {/* grandPalaceBKK */}
      <Lm p={L.grandPalaceBKK} info={INFO.grandPalaceBKK}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8820" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8820"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#cc8820" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* phiPhiIslands */}
      <Lm p={L.phiPhiIslands} info={INFO.phiPhiIslands}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* chiangMaiTemple */}
      <Lm p={L.chiangMaiTemple} info={INFO.chiangMaiTemple}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8822" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8822"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#cc8822" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* ayutthaya */}
      <Lm p={L.ayutthaya} info={INFO.ayutthaya}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>
      {/* railayBeach */}
      <Lm p={L.railayBeach} info={INFO.railayBeach}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22bbcc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* whiteTempleCR */}
      <Lm p={L.whiteTempleCR} info={INFO.whiteTempleCR}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0f0" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#f0f0f0" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* erawanFalls */}
      <Lm p={L.erawanFalls} info={INFO.erawanFalls}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2299aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2299aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2299aa"/></mesh>
      </Lm>
      {/* sukhothai */}
      <Lm p={L.sukhothai} info={INFO.sukhothai}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8a866" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8a866"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8a866"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#c8a866"/></mesh>
      </Lm>

      {/* ══ Greece ═══════════════════════════════════════════════════════ */}
      {/* santoriniGreece */}
      <Lm p={L.santoriniGreece} info={INFO.santoriniGreece} mk="santoriniGreece">
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#3399ff" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#3399ff"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#3399ff" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* meteora */}
      <Lm p={L.meteora} info={INFO.meteora} mk="meteora">
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#887766" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#887766" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* delphi */}
      <Lm p={L.delphi} info={INFO.delphi}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#c8b870" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#c8b870"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#c8b870"/></mesh>
      </Lm>
      {/* olympia */}
      <Lm p={L.olympia} info={INFO.olympia}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#c8b060" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#c8b060"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#c8b060"/></mesh>
      </Lm>
      {/* rhodesOldCity */}
      <Lm p={L.rhodesOldCity} info={INFO.rhodesOldCity}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8a060" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8a060"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8a060"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8a060"/></mesh>
      </Lm>
      {/* corfuOldTown */}
      <Lm p={L.corfuOldTown} info={INFO.corfuOldTown}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aa8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aa8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aa8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aa8833"/></mesh>
      </Lm>
      {/* knossosCrete */}
      <Lm p={L.knossosCrete} info={INFO.knossosCrete}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc9944" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>
      {/* mykonos */}
      <Lm p={L.mykonos} info={INFO.mykonos}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#3388ff" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#3388ff"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#3388ff"/></mesh>
      </Lm>
      {/* navagioBeach */}
      <Lm p={L.navagioBeach} info={INFO.navagioBeach}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#2299cc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* nafplio */}
      <Lm p={L.nafplio} info={INFO.nafplio}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886644" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886644"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#886644"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#886644"/></mesh>
      </Lm>

      {/* ══ Turkey ═══════════════════════════════════════════════════════ */}
      {/* pamukkale */}
      <Lm p={L.pamukkale} info={INFO.pamukkale}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#f0f0f0" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
      </Lm>
      {/* ephesus */}
      <Lm p={L.ephesus} info={INFO.ephesus}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#c8a866" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#c8a866"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#c8a866"/></mesh>
      </Lm>
      {/* blueMosque */}
      <Lm p={L.blueMosque} info={INFO.blueMosque}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#5566aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#5566aa"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#5566aa" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* topkapiPalace */}
      <Lm p={L.topkapiPalace} info={INFO.topkapiPalace}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#cc8833" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* bodrumTurkey */}
      <Lm p={L.bodrumTurkey} info={INFO.bodrumTurkey}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#3388cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
      </Lm>
      {/* gobekliTepe */}
      <Lm p={L.gobekliTepe} info={INFO.gobekliTepe}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#997755" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#997755"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#997755"/></mesh>
      </Lm>
      {/* nemrutDag */}
      <Lm p={L.nemrutDag} info={INFO.nemrutDag}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#887766" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#887766" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* sumelaMonastery */}
      <Lm p={L.sumelaMonastery} info={INFO.sumelaMonastery}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#888888" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#888888"/></mesh>
      </Lm>

      {/* ══ Brazil ═══════════════════════════════════════════════════════ */}
      {/* amazonManaus */}
      <Lm p={L.amazonManaus} info={INFO.amazonManaus}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#228833" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#228833"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#228833"/></mesh>
      </Lm>
      {/* copacabana */}
      <Lm p={L.copacabana} info={INFO.copacabana}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* pantanal */}
      <Lm p={L.pantanal} info={INFO.pantanal}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#44aa66" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#44aa66"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#44aa66"/></mesh>
      </Lm>
      {/* fernandoNoronha */}
      <Lm p={L.fernandoNoronha} info={INFO.fernandoNoronha}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* salvadorHistoric */}
      <Lm p={L.salvadorHistoric} info={INFO.salvadorHistoric}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc6633" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
      </Lm>
      {/* lencoisM */}
      <Lm p={L.lencoisM} info={INFO.lencoisM}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#ddccaa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#ddccaa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#ddccaa"/></mesh>
      </Lm>
      {/* ouroPreto */}
      <Lm p={L.ouroPreto} info={INFO.ouroPreto}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#884422" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#884422"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#884422"/></mesh>
      </Lm>

      {/* ══ Mexico ═══════════════════════════════════════════════════════ */}
      {/* teotihuacan */}
      <Lm p={L.teotihuacan} info={INFO.teotihuacan}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4aa44" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4aa44"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4aa44"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#d4aa44"/></mesh>
      </Lm>
      {/* palenqueMx */}
      <Lm p={L.palenqueMx} info={INFO.palenqueMx}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aa44" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* tulumMx */}
      <Lm p={L.tulumMx} info={INFO.tulumMx}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ddcc88" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ddcc88"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ddcc88"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#ddcc88"/></mesh>
      </Lm>
      {/* copperCanyonMx */}
      <Lm p={L.copperCanyonMx} info={INFO.copperCanyonMx}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#cc8844" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#cc8844" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* oaxacaMontAlban */}
      <Lm p={L.oaxacaMontAlban} info={INFO.oaxacaMontAlban}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>
      {/* mexicoCathedral */}
      <Lm p={L.mexicoCathedral} info={INFO.mexicoCathedral}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a870" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a870"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a870"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a870"/></mesh>
      </Lm>
      {/* guanajuatoMx */}
      <Lm p={L.guanajuatoMx} info={INFO.guanajuatoMx}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* caboSanLucas */}
      <Lm p={L.caboSanLucas} info={INFO.caboSanLucas}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>

      {/* ══ Peru ═════════════════════════════════════════════════════════ */}
      {/* lakeTiticaca */}
      <Lm p={L.lakeTiticaca} info={INFO.lakeTiticaca}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2266aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
      </Lm>
      {/* nazcaLines */}
      <Lm p={L.nazcaLines} info={INFO.nazcaLines}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc9966" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc9966"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc9966"/></mesh>
      </Lm>
      {/* cusco */}
      <Lm p={L.cusco} info={INFO.cusco}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* colcaCanyon */}
      <Lm p={L.colcaCanyon} info={INFO.colcaCanyon}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#8899aa" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#8899aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* chanChan */}
      <Lm p={L.chanChan} info={INFO.chanChan}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc9966" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc9966"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc9966"/></mesh>
      </Lm>

      {/* ══ Egypt ════════════════════════════════════════════════════════ */}
      {/* valleyOfKings */}
      <Lm p={L.valleyOfKings} info={INFO.valleyOfKings}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#c8a844" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#c8a844"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#c8a844"/></mesh>
      </Lm>
      {/* karnakTemple */}
      <Lm p={L.karnakTemple} info={INFO.karnakTemple}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d4b860" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d4b860"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d4b860"/></mesh>
      </Lm>
      {/* luxorTemple */}
      <Lm p={L.luxorTemple} info={INFO.luxorTemple}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d4b860" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d4b860"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d4b860"/></mesh>
      </Lm>
      {/* alexandriaEgypt */}
      <Lm p={L.alexandriaEgypt} info={INFO.alexandriaEgypt}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#3388cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
      </Lm>
      {/* mountSinai */}
      <Lm p={L.mountSinai} info={INFO.mountSinai}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#887755" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#887755" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>

      {/* ══ Africa ═══════════════════════════════════════════════════════ */}
      {/* maasaiMara */}
      <Lm p={L.maasaiMara} info={INFO.maasaiMara} mk="maasaiMara">
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* serengeti */}
      <Lm p={L.serengeti} info={INFO.serengeti}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#aa9944" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#aa9944"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#aa9944"/></mesh>
      </Lm>
      {/* kilimanjaro */}
      <Lm p={L.kilimanjaro} info={INFO.kilimanjaro} mk="kilimanjaro">
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* krugerNP */}
      <Lm p={L.krugerNP} info={INFO.krugerNP}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* capePointSA */}
      <Lm p={L.capePointSA} info={INFO.capePointSA}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#778899" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#778899" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* moroccoMar */}
      <Lm p={L.moroccoMar} info={INFO.moroccoMar} mk="moroccoMar">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* moroccoSahara */}
      <Lm p={L.moroccoSahara} info={INFO.moroccoSahara}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#ddbb44" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#ddbb44" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#eecc55" roughness={0.5}/></mesh>
      </Lm>
      {/* zanzibar */}
      <Lm p={L.zanzibar} info={INFO.zanzibar}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* lalibelaEth */}
      <Lm p={L.lalibelaEth} info={INFO.lalibelaEth}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc6644" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc6644"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc6644"/></mesh>
      </Lm>
      {/* drakensberg */}
      <Lm p={L.drakensberg} info={INFO.drakensberg}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#889988" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#889988" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* nairobiNP */}
      <Lm p={L.nairobiNP} info={INFO.nairobiNP}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* ngorongoroCrater */}
      <Lm p={L.ngorongoroCrater} info={INFO.ngorongoroCrater}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa66" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa66"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa66"/></mesh>
      </Lm>

      {/* ══ Iceland ══════════════════════════════════════════════════════ */}
      {/* reykjavikH */}
      <Lm p={L.reykjavikH} info={INFO.reykjavikH}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#cc9944" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>
      {/* geysirIceland */}
      <Lm p={L.geysirIceland} info={INFO.geysirIceland}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.12,0.15,0.12,10]}/><meshStandardMaterial color="#888880" roughness={0.8}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.32,10]}/><meshStandardMaterial color="#b8e8f8" roughness={0.3} transparent opacity={0.85}/></mesh>
        <mesh position={[0,0.5,0]}><sphereGeometry args={[0.1,10,8]}/><meshStandardMaterial color="#b8e8f8" roughness={0.3} transparent opacity={0.7}/></mesh>
      </Lm>
      {/* skogafoss */}
      <Lm p={L.skogafoss} info={INFO.skogafoss}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2288cc" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2288cc"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2288cc"/></mesh>
      </Lm>

      {/* ══ Norway ═══════════════════════════════════════════════════════ */}
      {/* geirangerfjord */}
      <Lm p={L.geirangerfjord} info={INFO.geirangerfjord}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2277aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2277aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2277aa"/></mesh>
      </Lm>
      {/* tromsoLights */}
      <Lm p={L.tromsoLights} info={INFO.tromsoLights}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#44aacc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#44aacc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#44aacc" emissive="#44aacc" emissiveIntensity={0.3}/></mesh>
      </Lm>
      {/* bergenWharf */}
      <Lm p={L.bergenWharf} info={INFO.bergenWharf}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc6633" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
      </Lm>

      {/* ══ Canada ═══════════════════════════════════════════════════════ */}
      {/* banffNP */}
      <Lm p={L.banffNP} info={INFO.banffNP}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#7799aa" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#7799aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* quebecOldCity */}
      <Lm p={L.quebecOldCity} info={INFO.quebecOldCity}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* whistlerBC */}
      <Lm p={L.whistlerBC} info={INFO.whistlerBC}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* haida */}
      <Lm p={L.haida} info={INFO.haida}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#228844" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#228844"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#228844"/></mesh>
      </Lm>

      {/* ══ New Zealand ══════════════════════════════════════════════════ */}
      {/* hobbiton */}
      <Lm p={L.hobbiton} info={INFO.hobbiton}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>
      {/* rotoruaNZ */}
      <Lm p={L.rotoruaNZ} info={INFO.rotoruaNZ}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.12,0.15,0.12,10]}/><meshStandardMaterial color="#888880" roughness={0.8}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.32,10]}/><meshStandardMaterial color="#88aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
        <mesh position={[0,0.5,0]}><sphereGeometry args={[0.1,10,8]}/><meshStandardMaterial color="#88aacc" roughness={0.3} transparent opacity={0.7}/></mesh>
      </Lm>
      {/* fiordlandNZ */}
      <Lm p={L.fiordlandNZ} info={INFO.fiordlandNZ}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#5588aa" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#5588aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>

      {/* ══ Jordan ═══════════════════════════════════════════════════════ */}
      {/* wadiRum */}
      <Lm p={L.wadiRum} info={INFO.wadiRum}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#dd8833" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#dd8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#ee9944" roughness={0.5}/></mesh>
      </Lm>
      {/* deadSea */}
      <Lm p={L.deadSea} info={INFO.deadSea}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#3399aa" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>

      {/* ══ Russia ═══════════════════════════════════════════════════════ */}
      {/* stBasils */}
      <Lm p={L.stBasils} info={INFO.stBasils}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc3322" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc3322"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#cc3322" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* lakeBaikal */}
      <Lm p={L.lakeBaikal} info={INFO.lakeBaikal}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2266aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
      </Lm>
      {/* hermitageSPB */}
      <Lm p={L.hermitageSPB} info={INFO.hermitageSPB}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#44aacc" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#44aacc"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#44aacc"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#44aacc"/></mesh>
      </Lm>

      {/* ══ Vietnam ══════════════════════════════════════════════════════ */}
      {/* hoiAnVietnam */}
      <Lm p={L.hoiAnVietnam} info={INFO.hoiAnVietnam}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* hanoiHoanKiem */}
      <Lm p={L.hanoiHoanKiem} info={INFO.hanoiHoanKiem}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#33aa88" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#33aa88"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#33aa88"/></mesh>
      </Lm>

      {/* ══ Indonesia ════════════════════════════════════════════════════ */}
      {/* baliUluwatu */}
      <Lm p={L.baliUluwatu} info={INFO.baliUluwatu}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* komodoPark */}
      <Lm p={L.komodoPark} info={INFO.komodoPark}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>
      {/* prambananJava */}
      <Lm p={L.prambananJava} info={INFO.prambananJava}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b066" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b066"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b066"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#c8b066"/></mesh>
      </Lm>

      {/* ══ Portugal ═════════════════════════════════════════════════════ */}
      {/* lisbonBelem */}
      <Lm p={L.lisbonBelem} info={INFO.lisbonBelem}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#d4c880" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#d4c880"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#d4c880"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#d4c880"/></mesh>
      </Lm>
      {/* sintraPortugal */}
      <Lm p={L.sintraPortugal} info={INFO.sintraPortugal}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d080" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d080"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d080"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d080"/></mesh>
      </Lm>

      {/* ══ Netherlands ══════════════════════════════════════════════════ */}
      {/* keukenhofTulips */}
      <Lm p={L.keukenhofTulips} info={INFO.keukenhofTulips}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#ee44aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#ee44aa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#ee44aa"/></mesh>
      </Lm>
      {/* kinderdijkMills */}
      <Lm p={L.kinderdijkMills} info={INFO.kinderdijkMills}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>

      {/* ══ Czech Republic ═══════════════════════════════════════════════ */}
      {/* pragueCastle */}
      <Lm p={L.pragueCastle} info={INFO.pragueCastle}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aabb88" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aabb88"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aabb88"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aabb88"/></mesh>
      </Lm>

      {/* ══ Austria ══════════════════════════════════════════════════════ */}
      {/* hallstatt */}
      <Lm p={L.hallstatt} info={INFO.hallstatt}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#44aacc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#44aacc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#44aacc"/></mesh>
      </Lm>

      {/* ══ Switzerland ══════════════════════════════════════════════════ */}
      {/* interlaken */}
      <Lm p={L.interlaken} info={INFO.interlaken}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>

      {/* ══ Cambodia ═════════════════════════════════════════════════════ */}
      {/* taProhm */}
      <Lm p={L.taProhm} info={INFO.taProhm}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>

      {/* ══ Sri Lanka ════════════════════════════════════════════════════ */}
      {/* sigiriya */}
      <Lm p={L.sigiriya} info={INFO.sigiriya}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#cc6633" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#cc6633" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#dd7744" roughness={0.5}/></mesh>
      </Lm>
      {/* dalleTeaFields */}
      <Lm p={L.dalleTeaFields} info={INFO.dalleTeaFields}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>

      {/* ══ South Korea ══════════════════════════════════════════════════ */}
      {/* gyeongbokgung */}
      <Lm p={L.gyeongbokgung} info={INFO.gyeongbokgung}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc4422" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
      </Lm>
      {/* jejuIsland */}
      <Lm p={L.jejuIsland} info={INFO.jejuIsland}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>

      {/* ══ Argentina ════════════════════════════════════════════════════ */}
      {/* buenosAires */}
      <Lm p={L.buenosAires} info={INFO.buenosAires}>
        <mesh position={[0,0.04,0]} scale={[0.14,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#4466aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.44,8]}/><meshStandardMaterial color="#4466aa"/></mesh>
        <mesh position={[0,0.54,0]}><coneGeometry args={[0.04,0.14,8]}/><meshStandardMaterial color="#4466aa" metalness={0.3}/></mesh>
      </Lm>
      {/* patagoniaArg */}
      <Lm p={L.patagoniaArg} info={INFO.patagoniaArg}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#7799bb" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#7799bb" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>

      {/* ══ Chile ════════════════════════════════════════════════════════ */}
      {/* atacamaDesert */}
      <Lm p={L.atacamaDesert} info={INFO.atacamaDesert}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#ddbb55" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#ddbb55" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#eecc66" roughness={0.5}/></mesh>
      </Lm>
      {/* easterIsland */}
      <Lm p={L.easterIsland} info={INFO.easterIsland}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#887766" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#887766"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#887766"/></mesh>
      </Lm>

      {/* ══ Colombia ═════════════════════════════════════════════════════ */}
      {/* cartagenaCO */}
      <Lm p={L.cartagenaCO} info={INFO.cartagenaCO}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>

      {/* ══ Cuba ═════════════════════════════════════════════════════════ */}
      {/* havanaOldCity */}
      <Lm p={L.havanaOldCity} info={INFO.havanaOldCity}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc6633" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
      </Lm>

      {/* ══ Nepal ════════════════════════════════════════════════════════ */}
      {/* kathmanduPatan */}
      <Lm p={L.kathmanduPatan} info={INFO.kathmanduPatan}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>

      {/* ══ Myanmar ══════════════════════════════════════════════════════ */}
      {/* bagan */}
      <Lm p={L.bagan} info={INFO.bagan}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>

      {/* ══ Iran ═════════════════════════════════════════════════════════ */}
      {/* persepolisIran */}
      <Lm p={L.persepolisIran} info={INFO.persepolisIran}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d4aa60" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d4aa60"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d4aa60"/></mesh>
      </Lm>

    </>
  );
}

// --- Geographic label helpers --------------------------------------------------
function featureCentroid(f: GeoFeature): [number, number] | null {
  if (!f.geometry) return null;
  const polys: number[][][][] =
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates as number[][][]]
      : f.geometry.type === "MultiPolygon"
      ? f.geometry.coordinates as number[][][][]
      : [];
  if (!polys.length) return null;
  let best: number[][] = [];
  for (const poly of polys)
    if (poly[0] && poly[0].length > best.length) best = poly[0] as number[][];
  if (!best.length) return null;
  let lon = 0, lat = 0;
  for (const pt of best) { lon += pt[0]; lat += pt[1]; }
  return [lon / best.length, lat / best.length];
}

function geoPos(lat: number, lon: number, r: number): [number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  return [
     r * Math.cos(phi) * Math.cos(lam),
     r * Math.sin(phi),
    -r * Math.cos(phi) * Math.sin(lam),
  ];
}

const STATE_COUNTRIES = new Set([
  "United States of America", "Canada", "Australia", "Brazil", "Russia",
  "China", "India", "Mexico", "Argentina", "Germany", "France", "Italy",
  "Spain", "South Africa", "Nigeria", "Indonesia", "Saudi Arabia",
  "United Kingdom", "Pakistan", "Japan", "Thailand", "Turkey",
]);


// Quaternion that makes a Three.js Text mesh lie flat on the sphere surface,
// face pointing outward (front-face culling hides labels on the globe's back side).
function computeOrientation(pos: [number, number, number]): THREE.Quaternion {
  const N = new THREE.Vector3(...pos).normalize();          // outward normal
  const UP = new THREE.Vector3(0, 1, 0);
  const dot = UP.dot(N);
  const T = UP.clone().sub(N.clone().multiplyScalar(dot));  // north tangent
  if (T.lengthSq() < 1e-6) T.set(1, 0, 0);               // pole fallback
  T.normalize();
  const R = new THREE.Vector3().crossVectors(T, N).normalize(); // east tangent
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(R, T, N)                 // right=R, up=T, forward=N
  );
}

// Countries with high average elevation whose labels need extra clearance above
// the displacement-map terrain (displacementScale=0.65, max lift ≈ 0.53 units).
const HIGH_ELEVATION_COUNTRIES = new Set([
  "Afghanistan", "Nepal", "Bhutan", "Tibet", "Bolivia", "Lesotho",
  "Kyrgyzstan", "Tajikistan", "Rwanda", "Burundi", "Ethiopia",
  "Peru", "Ecuador", "Colombia", "Switzerland", "Austria", "Norway",
  "Mongolia", "Iran", "Turkey", "Pakistan", "Georgia", "Armenia",
  "Azerbaijan", "Morocco", "Algeria", "Andorra", "Liechtenstein",
  "China", "India", "Mexico", "Chile", "Argentina",
]);

// --- Country + State labels ----------------------------------------------------
function GeoLabels({ countries, states, zoomLevel }: {
  countries:  GeoCollection | null;
  states:     GeoCollection | null;
  zoomLevel:  number;
}) {
  const items = useMemo(() => {
    const result: Array<{
      key: string; name: string; pos: [number, number, number];
      kind: "country" | "state"; orientation: THREE.Quaternion;
    }> = [];

    if (countries) {
      for (const f of countries.features) {
        const name = (f.properties?.NAME || f.properties?.ADMIN || f.properties?.name) as string | undefined;
        if (!name) continue;
        const c = featureCentroid(f);
        if (!c) continue;
        const labelR = R * (HIGH_ELEVATION_COUNTRIES.has(name) ? 1.075 : 1.019);
        const cPos = geoPos(c[1], c[0], labelR);
        result.push({ key: `c-${name}`, name, pos: cPos, kind: "country", orientation: computeOrientation(cPos) });
      }
    }

    if (states) {
      for (const f of states.features) {
        const name  = (f.properties?.name  || f.properties?.NAME)  as string | undefined;
        const admin = (f.properties?.admin || f.properties?.adm0_name || "") as string;
        if (!name || !STATE_COUNTRIES.has(admin)) continue;
        const c = featureCentroid(f);
        if (!c) continue;
        const geom = f.geometry;
        if (!geom) continue;
        // Find the largest polygon ring (same logic as featureCentroid) so that
        // multi-polygon features like Northwest Territories aren't mis-measured
        // by a tiny island that happens to be first in the array.
        const allPolys: number[][][][] =
          geom.type === "Polygon"
            ? [geom.coordinates as number[][][]]
            : geom.type === "MultiPolygon"
            ? geom.coordinates as number[][][][]
            : [];
        let ring: number[][] = [];
        for (const poly of allPolys)
          if (poly[0] && poly[0].length > ring.length) ring = poly[0] as number[][];
        if (!ring.length) continue;
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const pt of ring) {
          if (pt[0] < minLon) minLon = pt[0]; if (pt[0] > maxLon) maxLon = pt[0];
          if (pt[1] < minLat) minLat = pt[1]; if (pt[1] > maxLat) maxLat = pt[1];
        }
        // No size minimum for North America — show every state/province/territory.
        const isNorthAmerica = admin === "United States of America" || admin === "Canada" || admin === "Mexico";
        if (!isNorthAmerica && Math.max(maxLon - minLon, maxLat - minLat) < 2.5) continue;
        const sPos = geoPos(c[1], c[0], R * 1.019);
        result.push({ key: `s-${admin}-${name}`, name, pos: sPos, kind: "state", orientation: computeOrientation(sPos) });
      }
    }
    return result;
  }, [countries, states]);

  const visible = items.filter(it => it.kind === "country" || zoomLevel >= 1);

  // Scale font size down for densely-packed labels: find each label's nearest
  // angular neighbour and shrink proportionally when below the threshold.
  const visibleWithSize = useMemo(() => {
    if (visible.length === 0) return [];
    const units = visible.map(it => new THREE.Vector3(...it.pos).normalize());
    return visible.map((it, i) => {
      let minDeg = 180;
      for (let j = 0; j < units.length; j++) {
        if (i === j) continue;
        const dot = Math.max(-1, Math.min(1, units[i].dot(units[j])));
        const deg = Math.acos(dot) * (180 / Math.PI);
        if (deg < minDeg) minDeg = deg;
      }
      const base = it.kind === "country" ? 0.20 : 0.115;
      const thr  = it.kind === "country" ? 18   : 12;
      const min  = it.kind === "country" ? 0.08  : 0.05;
      const fontSize = minDeg >= thr ? base : Math.max(min, base * (minDeg / thr));
      return { ...it, fontSize };
    });
  }, [visible]);

  return (
    <>
      {visibleWithSize.map(({ key, name, pos, kind, orientation, fontSize }) => (
        <Text
          key={key}
          position={pos}
          quaternion={orientation}
          fontSize={fontSize}
          color={kind === "country" ? "#ffffff" : "#b8ccff"}
          outlineWidth={kind === "country" ? 0.013 : 0.008}
          outlineColor="#000000"
          anchorX="center"
          anchorY="middle"
          letterSpacing={kind === "country" ? 0.10 : 0.04}
          sdfGlyphSize={64}
          material-side={THREE.FrontSide}
          material-depthTest
        >
          {name.toUpperCase()}
        </Text>
      ))}
    </>
  );
}

// --- Major world city labels (coords: WGS-84 decimal degrees) -----------------
const CITIES: { n: string; lat: number; lon: number }[] = [
  // ── United States ────────────────────────────────────────────────────────────
  { n: "New York",         lat:  40.71, lon:  -74.01 },
  { n: "Los Angeles",      lat:  34.05, lon: -118.24 },
  { n: "Chicago",          lat:  41.88, lon:  -87.63 },
  { n: "Houston",          lat:  29.76, lon:  -95.37 },
  { n: "Phoenix",          lat:  33.45, lon: -112.07 },
  { n: "Philadelphia",     lat:  39.95, lon:  -75.17 },
  { n: "San Antonio",      lat:  29.42, lon:  -98.49 },
  { n: "San Diego",        lat:  32.72, lon: -117.15 },
  { n: "Dallas",           lat:  32.78, lon:  -96.80 },
  { n: "Austin",           lat:  30.27, lon:  -97.74 },
  { n: "Jacksonville",     lat:  30.33, lon:  -81.66 },
  { n: "San Francisco",    lat:  37.77, lon: -122.42 },
  { n: "Seattle",          lat:  47.61, lon: -122.33 },
  { n: "Denver",           lat:  39.74, lon: -104.98 },
  { n: "Washington DC",    lat:  38.91, lon:  -77.04 },
  { n: "Nashville",        lat:  36.17, lon:  -86.78 },
  { n: "Oklahoma City",    lat:  35.47, lon:  -97.52 },
  { n: "Las Vegas",        lat:  36.17, lon: -115.14 },
  { n: "Portland",         lat:  45.52, lon: -122.68 },
  { n: "Memphis",          lat:  35.15, lon:  -90.05 },
  { n: "Louisville",       lat:  38.25, lon:  -85.76 },
  { n: "Baltimore",        lat:  39.29, lon:  -76.61 },
  { n: "Milwaukee",        lat:  43.04, lon:  -87.91 },
  { n: "Albuquerque",      lat:  35.08, lon: -106.65 },
  { n: "Tucson",           lat:  32.22, lon: -110.97 },
  { n: "Atlanta",          lat:  33.75, lon:  -84.39 },
  { n: "Kansas City",      lat:  39.10, lon:  -94.58 },
  { n: "Omaha",            lat:  41.26, lon:  -96.01 },
  { n: "Cleveland",        lat:  41.50, lon:  -81.69 },
  { n: "Raleigh",          lat:  35.78, lon:  -78.64 },
  { n: "Colorado Springs", lat:  38.83, lon: -104.82 },
  { n: "Miami",            lat:  25.77, lon:  -80.19 },
  { n: "Minneapolis",      lat:  44.98, lon:  -93.27 },
  { n: "New Orleans",      lat:  29.95, lon:  -90.07 },
  { n: "Detroit",          lat:  42.33, lon:  -83.05 },
  { n: "Charlotte",        lat:  35.23, lon:  -80.84 },
  { n: "St. Louis",        lat:  38.63, lon:  -90.20 },
  { n: "Pittsburgh",       lat:  40.44, lon:  -80.00 },
  { n: "Tampa",            lat:  27.95, lon:  -82.46 },
  { n: "Cincinnati",       lat:  39.10, lon:  -84.51 },
  { n: "Orlando",          lat:  28.54, lon:  -81.38 },
  { n: "Salt Lake City",   lat:  40.76, lon: -111.89 },
  { n: "Sacramento",       lat:  38.58, lon: -121.49 },
  { n: "Indianapolis",     lat:  39.77, lon:  -86.16 },
  { n: "Columbus",         lat:  39.96, lon:  -82.99 },
  { n: "Virginia Beach",   lat:  36.85, lon:  -76.29 },
  { n: "Fresno",           lat:  36.74, lon: -119.79 },
  { n: "Baton Rouge",      lat:  30.44, lon:  -91.13 },
  { n: "Tulsa",            lat:  36.15, lon:  -95.99 },
  { n: "Wichita",          lat:  37.69, lon:  -97.34 },
  { n: "Honolulu",         lat:  21.31, lon: -157.86 },
  { n: "Anchorage",        lat:  61.22, lon: -149.90 },
  { n: "El Paso",          lat:  31.76, lon: -106.49 },
  { n: "Fort Worth",       lat:  32.75, lon:  -97.33 },
  { n: "Corpus Christi",   lat:  27.80, lon:  -97.40 },
  { n: "Lexington",        lat:  38.04, lon:  -84.50 },
  { n: "Greensboro",       lat:  36.07, lon:  -79.79 },
  { n: "Plano",            lat:  33.02, lon:  -96.70 },
  { n: "Henderson",        lat:  36.04, lon: -114.98 },
  { n: "Newark",           lat:  40.74, lon:  -74.17 },
  { n: "St. Paul",         lat:  44.95, lon:  -93.09 },
  { n: "Chandler",         lat:  33.30, lon: -111.84 },
  { n: "Laredo",           lat:  27.50, lon:  -99.51 },
  { n: "Madison",          lat:  43.07, lon:  -89.40 },
  { n: "Durham",           lat:  35.99, lon:  -78.90 },
  { n: "Lubbock",          lat:  33.58, lon: -101.86 },
  { n: "Garland",          lat:  32.91, lon:  -96.64 },
  { n: "Glendale",         lat:  33.53, lon: -112.19 },
  { n: "Winston-Salem",    lat:  36.10, lon:  -80.24 },
  { n: "Scottsdale",       lat:  33.49, lon: -111.93 },
  { n: "Birmingham",       lat:  33.52, lon:  -86.80 },
  { n: "Montgomery",       lat:  32.36, lon:  -86.30 },
  { n: "Tuscaloosa",       lat:  33.21, lon:  -87.57 },
  { n: "Dothan",           lat:  31.22, lon:  -85.39 },
  { n: "Decatur",          lat:  34.61, lon:  -86.98 },
  { n: "Norfolk",          lat:  36.85, lon:  -76.29 },
  { n: "Spokane",          lat:  47.66, lon: -117.43 },
  { n: "Richmond",         lat:  37.54, lon:  -77.43 },
  { n: "Des Moines",       lat:  41.60, lon:  -93.61 },
  { n: "Boise",            lat:  43.62, lon: -116.20 },
  { n: "Fayetteville",     lat:  35.05, lon:  -78.88 },
  { n: "Tacoma",           lat:  47.25, lon: -122.44 },
  { n: "Oxnard",           lat:  34.20, lon: -119.18 },
  { n: "Knoxville",        lat:  35.96, lon:  -83.92 },
  { n: "Providence",       lat:  41.82, lon:  -71.42 },
  { n: "Akron",            lat:  41.08, lon:  -81.52 },
  { n: "Little Rock",      lat:  34.75, lon:  -92.29 },
  { n: "Huntsville",       lat:  34.73, lon:  -86.59 },
  { n: "Tempe",            lat:  33.42, lon: -111.94 },
  { n: "Augusta",          lat:  33.47, lon:  -82.00 },
  { n: "Grand Rapids",     lat:  42.96, lon:  -85.66 },
  { n: "Chattanooga",      lat:  35.05, lon:  -85.31 },
  { n: "Jackson",          lat:  32.30, lon:  -90.18 },
  { n: "Mobile",           lat:  30.69, lon:  -88.04 },
  { n: "Savannah",         lat:  32.08, lon:  -81.10 },
  { n: "Fort Lauderdale",  lat:  26.12, lon:  -80.14 },
  { n: "Cape Coral",       lat:  26.63, lon:  -81.95 },
  { n: "Sioux Falls",      lat:  43.55, lon:  -96.73 },
  { n: "Tallahassee",      lat:  30.44, lon:  -84.28 },
  { n: "Peoria",           lat:  40.69, lon:  -89.59 },
  { n: "Rockford",         lat:  42.27, lon:  -89.09 },
  { n: "Syracuse",         lat:  43.05, lon:  -76.15 },
  { n: "Shreveport",       lat:  32.53, lon:  -93.75 },
  { n: "Buffalo",          lat:  42.89, lon:  -78.87 },
  { n: "Reno",             lat:  39.53, lon: -119.81 },
  { n: "Hartford",         lat:  41.76, lon:  -72.68 },
  { n: "Missoula",         lat:  46.87, lon: -113.99 },
  { n: "Billings",         lat:  45.78, lon: -108.50 },
  { n: "Rapid City",       lat:  44.08, lon: -103.23 },
  { n: "Fargo",            lat:  46.88, lon:  -96.79 },
  { n: "Bismarck",         lat:  46.81, lon: -100.78 },
  { n: "Cheyenne",         lat:  41.14, lon: -104.82 },
  { n: "Arlington",        lat:  32.74, lon:  -97.11 },
  { n: "Amarillo",         lat:  35.22, lon: -101.83 },
  { n: "Brownsville",      lat:  25.90, lon:  -97.50 },
  { n: "McKinney",         lat:  33.20, lon:  -96.64 },
  { n: "Frisco",           lat:  33.15, lon:  -96.82 },
  { n: "Denton",           lat:  33.21, lon:  -97.13 },
  { n: "Waco",             lat:  31.55, lon:  -97.14 },
  { n: "Tyler",            lat:  32.35, lon:  -95.30 },
  { n: "Beaumont",         lat:  30.08, lon:  -94.13 },
  { n: "Killeen",          lat:  31.12, lon:  -97.73 },
  { n: "Midland",          lat:  31.99, lon: -102.08 },
  { n: "Abilene",          lat:  32.45, lon:  -99.73 },
  { n: "Wilmington",       lat:  34.23, lon:  -77.94 },
  { n: "Gainesville",      lat:  29.65, lon:  -82.32 },
  { n: "St. Petersburg",   lat:  27.77, lon:  -82.64 },
  { n: "Lakeland",         lat:  28.04, lon:  -81.95 },
  { n: "Pensacola",        lat:  30.42, lon:  -87.22 },
  { n: "Daytona Beach",    lat:  29.21, lon:  -81.02 },
  { n: "Fort Myers",       lat:  26.64, lon:  -81.87 },
  { n: "Hialeah",          lat:  25.86, lon:  -80.28 },
  { n: "Eugene",           lat:  44.05, lon: -123.09 },
  { n: "Salem",            lat:  44.94, lon: -123.04 },
  { n: "Bakersfield",      lat:  35.37, lon: -119.02 },
  { n: "Stockton",         lat:  37.97, lon: -121.29 },
  { n: "Long Beach",       lat:  33.77, lon: -118.19 },
  { n: "Riverside",        lat:  33.98, lon: -117.37 },
  { n: "San Bernardino",   lat:  34.11, lon: -117.29 },
  { n: "Irvine",           lat:  33.68, lon: -117.79 },
  { n: "Santa Ana",        lat:  33.75, lon: -117.87 },
  { n: "Anaheim",          lat:  33.84, lon: -117.91 },
  { n: "Aurora",           lat:  39.73, lon: -104.83 },
  { n: "Fort Collins",     lat:  40.59, lon: -105.08 },
  { n: "Boulder",          lat:  40.01, lon: -105.27 },
  { n: "Pueblo",           lat:  38.25, lon: -104.61 },
  { n: "Allentown",        lat:  40.60, lon:  -75.49 },
  { n: "Erie",             lat:  42.13, lon:  -80.08 },
  { n: "Lancaster",        lat:  40.04, lon:  -76.31 },
  { n: "Stamford",         lat:  41.05, lon:  -73.54 },
  { n: "New Haven",        lat:  41.31, lon:  -72.92 },
  { n: "Springfield",      lat:  42.10, lon:  -72.59 },
  { n: "Worcester",        lat:  42.26, lon:  -71.80 },
  { n: "Bridgeport",       lat:  41.18, lon:  -73.19 },
  { n: "Jersey City",      lat:  40.73, lon:  -74.07 },
  { n: "Yonkers",          lat:  40.93, lon:  -73.90 },
  { n: "Rochester",        lat:  43.16, lon:  -77.61 },
  { n: "Albany",           lat:  42.65, lon:  -73.76 },
  { n: "Trenton",          lat:  40.22, lon:  -74.76 },
  { n: "Wilmington DE",    lat:  39.74, lon:  -75.55 },
  { n: "Columbia SC",      lat:  34.00, lon:  -81.03 },
  { n: "Charleston SC",    lat:  32.78, lon:  -79.93 },
  { n: "Greenville SC",    lat:  34.85, lon:  -82.40 },
  { n: "Columbia MO",      lat:  38.95, lon:  -92.33 },
  { n: "Springfield MO",   lat:  37.21, lon:  -93.29 },
  { n: "Jefferson City",   lat:  38.57, lon:  -92.17 },
  { n: "Topeka",           lat:  39.05, lon:  -95.69 },
  { n: "Wichita Falls",    lat:  33.91, lon:  -98.49 },
  { n: "Lincoln",          lat:  40.81, lon:  -96.68 },
  { n: "Sioux City",       lat:  42.50, lon:  -96.40 },
  { n: "Davenport",        lat:  41.52, lon:  -90.58 },
  { n: "Cedar Rapids",     lat:  42.00, lon:  -91.64 },
  { n: "Green Bay",        lat:  44.52, lon:  -88.02 },
  { n: "Appleton",         lat:  44.26, lon:  -88.41 },
  { n: "Duluth",           lat:  46.79, lon:  -92.10 },
  { n: "Rochester MN",     lat:  44.02, lon:  -92.46 },
  { n: "Flint",            lat:  43.01, lon:  -83.69 },
  { n: "Lansing",          lat:  42.73, lon:  -84.56 },
  { n: "Ann Arbor",        lat:  42.28, lon:  -83.74 },
  { n: "Kalamazoo",        lat:  42.29, lon:  -85.59 },
  { n: "Fort Wayne",       lat:  41.08, lon:  -85.14 },
  { n: "Evansville",       lat:  37.97, lon:  -87.57 },
  { n: "South Bend",       lat:  41.68, lon:  -86.25 },
  { n: "Dayton",           lat:  39.76, lon:  -84.19 },
  { n: "Toledo",           lat:  41.66, lon:  -83.56 },
  { n: "Youngstown",       lat:  41.10, lon:  -80.65 },
  { n: "Lexington KY",     lat:  38.04, lon:  -84.50 },
  { n: "Bowling Green KY", lat:  36.99, lon:  -86.44 },
  { n: "Charleston WV",    lat:  38.35, lon:  -81.63 },
  { n: "Morgantown",       lat:  39.63, lon:  -79.96 },
  { n: "Concord NH",       lat:  43.21, lon:  -71.54 },
  { n: "Burlington VT",    lat:  44.48, lon:  -73.21 },
  { n: "Portland ME",      lat:  43.66, lon:  -70.26 },
  { n: "Fairbanks",        lat:  64.84, lon: -147.72 },
  { n: "Juneau",           lat:  58.30, lon: -134.42 },
  // ── Canada ───────────────────────────────────────────────────────────────────
  { n: "Toronto",          lat:  43.65, lon:  -79.38 },
  { n: "Montreal",         lat:  45.51, lon:  -73.55 },
  { n: "Vancouver",        lat:  49.25, lon: -123.12 },
  { n: "Calgary",          lat:  51.05, lon: -114.07 },
  { n: "Ottawa",           lat:  45.42, lon:  -75.70 },
  { n: "Edmonton",         lat:  53.55, lon: -113.47 },
  { n: "Winnipeg",         lat:  49.90, lon:  -97.14 },
  { n: "Quebec City",      lat:  46.81, lon:  -71.21 },
  { n: "Hamilton",         lat:  43.26, lon:  -79.87 },
  { n: "Halifax",          lat:  44.65, lon:  -63.58 },
  { n: "Saskatoon",        lat:  52.13, lon: -106.67 },
  { n: "Regina",           lat:  50.45, lon: -104.62 },
  { n: "Victoria",         lat:  48.43, lon: -123.37 },
  // ── Mexico & Central America ─────────────────────────────────────────────────
  { n: "Mexico City",      lat:  19.43, lon:  -99.13 },
  { n: "Guadalajara",      lat:  20.67, lon: -103.35 },
  { n: "Monterrey",        lat:  25.69, lon: -100.32 },
  { n: "Tijuana",          lat:  32.52, lon: -117.04 },
  { n: "Puebla",           lat:  19.04, lon:  -98.20 },
  { n: "Cancun",           lat:  21.16, lon:  -86.85 },
  { n: "Leon",             lat:  21.12, lon: -101.68 },
  { n: "Havana",           lat:  23.11, lon:  -82.37 },
  { n: "Santo Domingo",    lat:  18.48, lon:  -69.93 },
  { n: "San Juan",         lat:  18.47, lon:  -66.12 },
  { n: "Guatemala City",   lat:  14.64, lon:  -90.51 },
  { n: "San Jose",         lat:   9.93, lon:  -84.08 },
  { n: "Panama City",      lat:   8.99, lon:  -79.52 },
  { n: "Tegucigalpa",      lat:  14.07, lon:  -87.21 },
  { n: "Managua",          lat:  12.14, lon:  -86.28 },
  // ── South America ────────────────────────────────────────────────────────────
  { n: "Sao Paulo",        lat: -23.55, lon:  -46.63 },
  { n: "Rio de Janeiro",   lat: -22.91, lon:  -43.17 },
  { n: "Buenos Aires",     lat: -34.60, lon:  -58.38 },
  { n: "Bogota",           lat:   4.71, lon:  -74.07 },
  { n: "Lima",             lat: -12.05, lon:  -77.04 },
  { n: "Santiago",         lat: -33.45, lon:  -70.67 },
  { n: "Caracas",          lat:  10.48, lon:  -66.88 },
  { n: "Medellin",         lat:   6.25, lon:  -75.56 },
  { n: "Quito",            lat:  -0.22, lon:  -78.51 },
  { n: "Belo Horizonte",   lat: -19.92, lon:  -43.94 },
  { n: "Fortaleza",        lat:  -3.72, lon:  -38.54 },
  { n: "Recife",           lat:  -8.05, lon:  -34.90 },
  { n: "Manaus",           lat:  -3.10, lon:  -60.02 },
  { n: "Brasilia",         lat: -15.78, lon:  -47.93 },
  { n: "Salvador",         lat: -12.97, lon:  -38.51 },
  { n: "Montevideo",       lat: -34.90, lon:  -56.19 },
  { n: "Asuncion",         lat: -25.29, lon:  -57.65 },
  { n: "La Paz",           lat: -16.50, lon:  -68.15 },
  { n: "Guayaquil",        lat:  -2.19, lon:  -79.89 },
  { n: "Cali",             lat:   3.43, lon:  -76.52 },
  { n: "Curitiba",         lat: -25.43, lon:  -49.27 },
  { n: "Cartagena",        lat:  10.39, lon:  -75.48 },
  // ── Europe ───────────────────────────────────────────────────────────────────
  { n: "London",           lat:  51.51, lon:   -0.13 },
  { n: "Paris",            lat:  48.86, lon:    2.35 },
  { n: "Berlin",           lat:  52.52, lon:   13.40 },
  { n: "Madrid",           lat:  40.42, lon:   -3.70 },
  { n: "Rome",             lat:  41.90, lon:   12.50 },
  { n: "Barcelona",        lat:  41.39, lon:    2.16 },
  { n: "Amsterdam",        lat:  52.37, lon:    4.90 },
  { n: "Vienna",           lat:  48.21, lon:   16.37 },
  { n: "Stockholm",        lat:  59.33, lon:   18.07 },
  { n: "Warsaw",           lat:  52.23, lon:   21.01 },
  { n: "Brussels",         lat:  50.85, lon:    4.35 },
  { n: "Prague",           lat:  50.08, lon:   14.44 },
  { n: "Lisbon",           lat:  38.72, lon:   -9.14 },
  { n: "Budapest",         lat:  47.50, lon:   19.04 },
  { n: "Oslo",             lat:  59.91, lon:   10.75 },
  { n: "Copenhagen",       lat:  55.68, lon:   12.57 },
  { n: "Helsinki",         lat:  60.17, lon:   24.94 },
  { n: "Zurich",           lat:  47.38, lon:    8.54 },
  { n: "Milan",            lat:  45.47, lon:    9.19 },
  { n: "Munich",           lat:  48.14, lon:   11.58 },
  { n: "Athens",           lat:  37.97, lon:   23.73 },
  { n: "Bucharest",        lat:  44.43, lon:   26.10 },
  { n: "Hamburg",          lat:  53.55, lon:    9.99 },
  { n: "Kyiv",             lat:  50.45, lon:   30.52 },
  { n: "Minsk",            lat:  53.90, lon:   27.57 },
  { n: "Dublin",           lat:  53.33, lon:   -6.25 },
  { n: "Edinburgh",        lat:  55.95, lon:   -3.19 },
  { n: "Manchester",       lat:  53.48, lon:   -2.24 },
  { n: "Lyon",             lat:  45.75, lon:    4.85 },
  { n: "Marseille",        lat:  43.30, lon:    5.37 },
  { n: "Frankfurt",        lat:  50.11, lon:    8.68 },
  { n: "Cologne",          lat:  50.94, lon:    6.96 },
  { n: "Stuttgart",        lat:  48.78, lon:    9.18 },
  { n: "Dusseldorf",       lat:  51.23, lon:    6.79 },
  { n: "Naples",           lat:  40.85, lon:   14.27 },
  { n: "Turin",            lat:  45.07, lon:    7.69 },
  { n: "Florence",         lat:  43.77, lon:   11.25 },
  { n: "Venice",           lat:  45.44, lon:   12.33 },
  { n: "Seville",          lat:  37.39, lon:   -5.99 },
  { n: "Valencia",         lat:  39.47, lon:   -0.38 },
  { n: "Bilbao",           lat:  43.26, lon:   -2.93 },
  { n: "Porto",            lat:  41.16, lon:   -8.63 },
  { n: "Geneva",           lat:  46.20, lon:    6.14 },
  { n: "Krakow",           lat:  50.06, lon:   19.94 },
  { n: "Gdansk",           lat:  54.35, lon:   18.65 },
  { n: "Bratislava",       lat:  48.15, lon:   17.11 },
  { n: "Ljubljana",        lat:  46.05, lon:   14.51 },
  { n: "Zagreb",           lat:  45.81, lon:   15.98 },
  { n: "Sarajevo",         lat:  43.85, lon:   18.36 },
  { n: "Belgrade",         lat:  44.80, lon:   20.46 },
  { n: "Sofia",            lat:  42.70, lon:   23.32 },
  { n: "Riga",             lat:  56.95, lon:   24.11 },
  { n: "Tallinn",          lat:  59.44, lon:   24.75 },
  { n: "Vilnius",          lat:  54.69, lon:   25.28 },
  { n: "Reykjavik",        lat:  64.13, lon:  -21.82 },
  { n: "Nice",             lat:  43.71, lon:    7.26 },
  { n: "Palermo",          lat:  38.12, lon:   13.36 },
  { n: "Thessaloniki",     lat:  40.64, lon:   22.94 },
  // ── Russia & Central Asia ────────────────────────────────────────────────────
  { n: "Moscow",           lat:  55.75, lon:   37.62 },
  { n: "Saint Petersburg", lat:  59.94, lon:   30.32 },
  { n: "Novosibirsk",      lat:  54.99, lon:   82.90 },
  { n: "Yekaterinburg",    lat:  56.84, lon:   60.60 },
  { n: "Kazan",            lat:  55.80, lon:   49.13 },
  { n: "Vladivostok",      lat:  43.12, lon:  131.90 },
  { n: "Tashkent",         lat:  41.30, lon:   69.24 },
  { n: "Almaty",           lat:  43.24, lon:   76.95 },
  { n: "Baku",             lat:  40.41, lon:   49.87 },
  { n: "Tbilisi",          lat:  41.69, lon:   44.83 },
  { n: "Yerevan",          lat:  40.18, lon:   44.51 },
  { n: "Bishkek",          lat:  42.87, lon:   74.59 },
  { n: "Ashgabat",         lat:  37.95, lon:   58.38 },
  // ── Middle East ──────────────────────────────────────────────────────────────
  { n: "Istanbul",         lat:  41.01, lon:   28.96 },
  { n: "Tehran",           lat:  35.69, lon:   51.39 },
  { n: "Riyadh",           lat:  24.69, lon:   46.72 },
  { n: "Baghdad",          lat:  33.34, lon:   44.40 },
  { n: "Dubai",            lat:  25.20, lon:   55.27 },
  { n: "Abu Dhabi",        lat:  24.45, lon:   54.38 },
  { n: "Doha",             lat:  25.29, lon:   51.53 },
  { n: "Kuwait City",      lat:  29.37, lon:   47.98 },
  { n: "Muscat",           lat:  23.61, lon:   58.59 },
  { n: "Amman",            lat:  31.95, lon:   35.93 },
  { n: "Beirut",           lat:  33.89, lon:   35.50 },
  { n: "Tel Aviv",         lat:  32.09, lon:   34.79 },
  { n: "Jerusalem",        lat:  31.77, lon:   35.22 },
  { n: "Ankara",           lat:  39.92, lon:   32.85 },
  { n: "Izmir",            lat:  38.42, lon:   27.14 },
  { n: "Jeddah",           lat:  21.52, lon:   39.22 },
  { n: "Sanaa",            lat:  15.35, lon:   44.21 },
  // ── South Asia ───────────────────────────────────────────────────────────────
  { n: "Delhi",            lat:  28.61, lon:   77.23 },
  { n: "Mumbai",           lat:  19.08, lon:   72.88 },
  { n: "Karachi",          lat:  24.86, lon:   67.01 },
  { n: "Dhaka",            lat:  23.72, lon:   90.41 },
  { n: "Kolkata",          lat:  22.57, lon:   88.36 },
  { n: "Bangalore",        lat:  12.97, lon:   77.59 },
  { n: "Lahore",           lat:  31.55, lon:   74.35 },
  { n: "Chennai",          lat:  13.08, lon:   80.27 },
  { n: "Hyderabad",        lat:  17.38, lon:   78.49 },
  { n: "Ahmedabad",        lat:  23.03, lon:   72.59 },
  { n: "Pune",             lat:  18.52, lon:   73.86 },
  { n: "Colombo",          lat:   6.93, lon:   79.85 },
  { n: "Kathmandu",        lat:  27.72, lon:   85.32 },
  { n: "Islamabad",        lat:  33.72, lon:   73.06 },
  { n: "Kabul",            lat:  34.53, lon:   69.17 },
  { n: "Jaipur",           lat:  26.91, lon:   75.79 },
  { n: "Surat",            lat:  21.17, lon:   72.83 },
  { n: "Kochi",            lat:   9.94, lon:   76.26 },
  // ── East & Southeast Asia ────────────────────────────────────────────────────
  { n: "Tokyo",            lat:  35.68, lon:  139.69 },
  { n: "Shanghai",         lat:  31.23, lon:  121.47 },
  { n: "Beijing",          lat:  39.91, lon:  116.39 },
  { n: "Chongqing",        lat:  29.56, lon:  106.55 },
  { n: "Tianjin",          lat:  39.14, lon:  117.18 },
  { n: "Shenzhen",         lat:  22.54, lon:  114.06 },
  { n: "Wuhan",            lat:  30.59, lon:  114.31 },
  { n: "Guangzhou",        lat:  23.13, lon:  113.26 },
  { n: "Chengdu",          lat:  30.66, lon:  104.07 },
  { n: "Osaka",            lat:  34.69, lon:  135.50 },
  { n: "Seoul",            lat:  37.57, lon:  126.98 },
  { n: "Taipei",           lat:  25.05, lon:  121.53 },
  { n: "Bangkok",          lat:  13.75, lon:  100.52 },
  { n: "Ho Chi Minh City", lat:  10.82, lon:  106.63 },
  { n: "Hanoi",            lat:  21.03, lon:  105.85 },
  { n: "Jakarta",          lat:  -6.21, lon:  106.85 },
  { n: "Manila",           lat:  14.60, lon:  120.98 },
  { n: "Singapore",        lat:   1.35, lon:  103.82 },
  { n: "Kuala Lumpur",     lat:   3.14, lon:  101.69 },
  { n: "Yangon",           lat:  16.87, lon:   96.19 },
  { n: "Phnom Penh",       lat:  11.57, lon:  104.92 },
  { n: "Vientiane",        lat:  17.97, lon:  102.60 },
  { n: "Ulaanbaatar",      lat:  47.89, lon:  106.91 },
  { n: "Pyongyang",        lat:  39.02, lon:  125.75 },
  { n: "Nagoya",           lat:  35.18, lon:  136.90 },
  { n: "Sapporo",          lat:  43.06, lon:  141.35 },
  { n: "Fukuoka",          lat:  33.59, lon:  130.40 },
  { n: "Busan",            lat:  35.10, lon:  129.03 },
  { n: "Hong Kong",        lat:  22.32, lon:  114.17 },
  { n: "Macau",            lat:  22.19, lon:  113.55 },
  { n: "Xi'an",            lat:  34.27, lon:  108.95 },
  { n: "Nanjing",          lat:  32.06, lon:  118.80 },
  { n: "Hangzhou",         lat:  30.27, lon:  120.16 },
  { n: "Surabaya",         lat:  -7.25, lon:  112.75 },
  { n: "Bandung",          lat:  -6.92, lon:  107.61 },
  { n: "Medan",            lat:   3.58, lon:   98.66 },
  { n: "Cebu",             lat:  10.32, lon:  123.90 },
  { n: "Da Nang",          lat:  16.07, lon:  108.22 },
  { n: "Phuket",           lat:   7.89, lon:   98.40 },
  { n: "Chiang Mai",       lat:  18.79, lon:   98.99 },
  { n: "Bali",             lat:  -8.34, lon:  115.09 },
  // ── Africa ───────────────────────────────────────────────────────────────────
  { n: "Cairo",            lat:  30.06, lon:   31.25 },
  { n: "Lagos",            lat:   6.52, lon:    3.38 },
  { n: "Kinshasa",         lat:  -4.32, lon:   15.32 },
  { n: "Johannesburg",     lat: -26.20, lon:   28.04 },
  { n: "Cape Town",        lat: -33.93, lon:   18.42 },
  { n: "Nairobi",          lat:  -1.29, lon:   36.82 },
  { n: "Addis Ababa",      lat:   9.03, lon:   38.74 },
  { n: "Khartoum",         lat:  15.55, lon:   32.53 },
  { n: "Dar es Salaam",    lat:  -6.79, lon:   39.21 },
  { n: "Abidjan",          lat:   5.35, lon:   -4.00 },
  { n: "Accra",            lat:   5.56, lon:   -0.20 },
  { n: "Casablanca",       lat:  33.59, lon:   -7.62 },
  { n: "Luanda",           lat:  -8.84, lon:   13.23 },
  { n: "Kampala",          lat:   0.32, lon:   32.58 },
  { n: "Algiers",          lat:  36.74, lon:    3.06 },
  { n: "Tunis",            lat:  36.82, lon:   10.17 },
  { n: "Dakar",            lat:  14.72, lon:  -17.47 },
  { n: "Maputo",           lat: -25.97, lon:   32.59 },
  { n: "Kigali",           lat:  -1.94, lon:   30.06 },
  { n: "Lusaka",           lat: -15.42, lon:   28.29 },
  { n: "Harare",           lat: -17.83, lon:   31.05 },
  { n: "Antananarivo",     lat: -18.91, lon:   47.54 },
  { n: "Abuja",            lat:   9.07, lon:    7.40 },
  { n: "Douala",           lat:   4.05, lon:    9.70 },
  { n: "Conakry",          lat:   9.54, lon:  -13.68 },
  { n: "Bamako",           lat:  12.65, lon:   -8.00 },
  { n: "Ouagadougou",      lat:  12.36, lon:   -1.53 },
  { n: "Tripoli",          lat:  32.90, lon:   13.18 },
  { n: "Alexandria",       lat:  31.20, lon:   29.92 },
  { n: "Durban",           lat: -29.86, lon:   31.02 },
  { n: "Mombasa",          lat:  -4.05, lon:   39.67 },
  // ── Oceania ──────────────────────────────────────────────────────────────────
  { n: "Sydney",           lat: -33.87, lon:  151.21 },
  { n: "Melbourne",        lat: -37.81, lon:  144.96 },
  { n: "Brisbane",         lat: -27.47, lon:  153.03 },
  { n: "Perth",            lat: -31.95, lon:  115.86 },
  { n: "Adelaide",         lat: -34.93, lon:  138.60 },
  { n: "Auckland",         lat: -36.87, lon:  174.77 },
  { n: "Canberra",         lat: -35.28, lon:  149.13 },
  { n: "Gold Coast",       lat: -28.02, lon:  153.40 },
  { n: "Christchurch",     lat: -43.53, lon:  172.64 },
  { n: "Wellington",       lat: -41.29, lon:  174.78 },
  { n: "Suva",             lat: -18.14, lon:  178.44 },
  { n: "Port Moresby",     lat:  -9.44, lon:  147.18 },
  { n: "Noumea",           lat: -22.27, lon:  166.46 },
  { n: "Honiara",          lat:  -9.43, lon:  160.05 },
  { n: "Apia",             lat: -13.83, lon: -171.77 },
  { n: "Nuku'alofa",       lat: -21.14, lon: -175.22 },
  { n: "Papeete",          lat: -17.54, lon: -149.57 },
  // ── Caribbean & Atlantic ─────────────────────────────────────────────────────
  { n: "Kingston",         lat:  17.99, lon:  -76.79 },
  { n: "Port-au-Prince",   lat:  18.54, lon:  -72.34 },
  { n: "Nassau",           lat:  25.05, lon:  -77.35 },
  { n: "Bridgetown",       lat:  13.10, lon:  -59.62 },
  { n: "Port of Spain",    lat:  10.65, lon:  -61.52 },
  // ── Central Asia extras ──────────────────────────────────────────────────────
  { n: "Dushanbe",         lat:  38.56, lon:   68.77 },
  { n: "Nur-Sultan",       lat:  51.18, lon:   71.45 },
  { n: "Samarkand",        lat:  39.65, lon:   66.96 },
  // ── Additional Middle East ───────────────────────────────────────────────────
  { n: "Aden",             lat:  12.78, lon:   45.04 },
  { n: "Mosul",            lat:  36.34, lon:   43.13 },
  { n: "Aleppo",           lat:  36.20, lon:   37.16 },
  { n: "Damascus",         lat:  33.51, lon:   36.29 },
  // ── Additional Africa ────────────────────────────────────────────────────────
  { n: "Mogadishu",        lat:   2.05, lon:   45.34 },
  { n: "Kano",             lat:  12.00, lon:    8.52 },
  { n: "Ibadan",           lat:   7.39, lon:    3.90 },
  { n: "Kumasi",           lat:   6.69, lon:   -1.62 },
  { n: "Lome",             lat:   6.14, lon:    1.22 },
  { n: "Cotonou",          lat:   6.37, lon:    2.43 },
  { n: "Brazzaville",      lat:  -4.27, lon:   15.28 },
  { n: "Libreville",       lat:   0.39, lon:    9.45 },
  { n: "Malabo",           lat:   3.75, lon:    8.78 },
  { n: "N'Djamena",        lat:  12.10, lon:   15.04 },
  { n: "Niamey",           lat:  13.51, lon:    2.12 },
  { n: "Windhoek",         lat: -22.56, lon:   17.08 },
  { n: "Gaborone",         lat: -24.65, lon:   25.91 },
  { n: "Maseru",           lat: -29.32, lon:   27.48 },
  { n: "Mbabane",          lat: -26.32, lon:   31.13 },
  { n: "Lilongwe",         lat: -13.97, lon:   33.79 },
  { n: "Bujumbura",        lat:  -3.38, lon:   29.36 },
  { n: "Moroni",           lat: -11.70, lon:   43.26 },
  { n: "Djibouti",         lat:  11.59, lon:   43.15 },
  { n: "Asmara",           lat:  15.34, lon:   38.93 },
  // ── Additional Europe ────────────────────────────────────────────────────────
  { n: "Chisinau",         lat:  47.01, lon:   28.86 },
  { n: "Tirana",           lat:  41.33, lon:   19.82 },
  { n: "Pristina",         lat:  42.66, lon:   21.17 },
  { n: "Skopje",           lat:  42.00, lon:   21.43 },
  { n: "Podgorica",        lat:  42.44, lon:   19.26 },
  { n: "Andorra",          lat:  42.51, lon:    1.52 },
  { n: "Valletta",         lat:  35.90, lon:   14.51 },
  { n: "Nicosia",          lat:  35.17, lon:   33.36 },
  { n: "Luxembourg City",  lat:  49.61, lon:    6.13 },
  { n: "Vaduz",            lat:  47.14, lon:    9.52 },
  { n: "Bern",             lat:  46.95, lon:    7.44 },
  { n: "Basel",            lat:  47.56, lon:    7.59 },
  { n: "Antwerp",          lat:  51.22, lon:    4.40 },
  { n: "Ghent",            lat:  51.05, lon:    3.72 },
  { n: "Rotterdam",        lat:  51.93, lon:    4.48 },
  { n: "The Hague",        lat:  52.08, lon:    4.31 },
  { n: "Utrecht",          lat:  52.09, lon:    5.12 },
  { n: "Eindhoven",        lat:  51.44, lon:    5.48 },
  { n: "Leeds",            lat:  53.80, lon:   -1.55 },
  { n: "Glasgow",          lat:  55.86, lon:   -4.26 },
  { n: "Bristol",          lat:  51.45, lon:   -2.59 },
  { n: "Birmingham UK",    lat:  52.48, lon:   -1.90 },
  { n: "Liverpool",        lat:  53.41, lon:   -2.98 },
  { n: "Bordeaux",         lat:  44.84, lon:   -0.58 },
  { n: "Toulouse",         lat:  43.60, lon:    1.44 },
  { n: "Strasbourg",       lat:  48.57, lon:    7.75 },
  { n: "Nantes",           lat:  47.22, lon:   -1.55 },
  { n: "Montpellier",      lat:  43.61, lon:    3.88 },
  { n: "Rennes",           lat:  48.11, lon:   -1.68 },
  { n: "Dortmund",         lat:  51.51, lon:    7.47 },
  { n: "Essen",            lat:  51.46, lon:    7.01 },
  { n: "Leipzig",          lat:  51.34, lon:   12.38 },
  { n: "Dresden",          lat:  51.05, lon:   13.74 },
  { n: "Bremen",           lat:  53.08, lon:    8.80 },
  { n: "Hannover",         lat:  52.37, lon:    9.73 },
  { n: "Nuremberg",        lat:  49.45, lon:   11.08 },
  { n: "Gothenburg",       lat:  57.71, lon:   11.97 },
  { n: "Malmo",            lat:  55.60, lon:   13.00 },
  { n: "Tampere",          lat:  61.50, lon:   23.77 },
  { n: "Oulu",             lat:  65.01, lon:   25.47 },
  { n: "Turku",            lat:  60.45, lon:   22.27 },
  { n: "Wroclaw",          lat:  51.11, lon:   17.04 },
  { n: "Poznan",           lat:  52.41, lon:   16.93 },
  { n: "Lodz",             lat:  51.76, lon:   19.46 },
  { n: "Lublin",           lat:  51.25, lon:   22.57 },
  { n: "Debrecen",         lat:  47.53, lon:   21.63 },
  { n: "Graz",             lat:  47.07, lon:   15.44 },
  { n: "Linz",             lat:  48.31, lon:   14.29 },
  { n: "Salzburg",         lat:  47.80, lon:   13.05 },
  { n: "Innsbruck",        lat:  47.27, lon:   11.39 },
  { n: "Brno",             lat:  49.20, lon:   16.61 },
  { n: "Ostrava",          lat:  49.84, lon:   18.29 },
  { n: "Banja Luka",       lat:  44.77, lon:   17.19 },
  // ── Additional South/Southeast Asia ─────────────────────────────────────────
  { n: "Lucknow",          lat:  26.85, lon:   80.92 },
  { n: "Nagpur",           lat:  21.15, lon:   79.09 },
  { n: "Patna",            lat:  25.60, lon:   85.12 },
  { n: "Indore",           lat:  22.72, lon:   75.86 },
  { n: "Bhopal",           lat:  23.26, lon:   77.41 },
  { n: "Visakhapatnam",    lat:  17.69, lon:   83.22 },
  { n: "Vadodara",         lat:  22.31, lon:   73.18 },
  { n: "Coimbatore",       lat:  11.02, lon:   76.97 },
  { n: "Thiruvananthapuram", lat: 8.49, lon:   76.95 },
  { n: "Guwahati",         lat:  26.19, lon:   91.74 },
  { n: "Mandalay",         lat:  21.98, lon:   96.08 },
  { n: "Makassar",         lat:  -5.15, lon:  119.41 },
  { n: "Palembang",        lat:  -2.99, lon:  104.76 },
  { n: "Semarang",         lat:  -6.97, lon:  110.42 },
  { n: "Yogyakarta",       lat:  -7.80, lon:  110.36 },
  { n: "Davao",            lat:   7.07, lon:  125.61 },
  { n: "Quezon City",      lat:  14.68, lon:  121.06 },
  // ── Additional East Asia ─────────────────────────────────────────────────────
  { n: "Harbin",           lat:  45.75, lon:  126.64 },
  { n: "Shenyang",         lat:  41.80, lon:  123.43 },
  { n: "Dalian",           lat:  38.91, lon:  121.60 },
  { n: "Qingdao",          lat:  36.07, lon:  120.38 },
  { n: "Xiamen",           lat:  24.48, lon:  118.09 },
  { n: "Kunming",          lat:  25.04, lon:  102.71 },
  { n: "Urumqi",           lat:  43.82, lon:   87.60 },
  { n: "Lanzhou",          lat:  36.06, lon:  103.79 },
  { n: "Zhengzhou",        lat:  34.75, lon:  113.66 },
  { n: "Jinan",            lat:  36.67, lon:  116.99 },
  { n: "Taiyuan",          lat:  37.87, lon:  112.55 },
  { n: "Changsha",         lat:  28.23, lon:  112.94 },
  { n: "Nanchang",         lat:  28.68, lon:  115.86 },
  { n: "Hefei",            lat:  31.82, lon:  117.23 },
  { n: "Fuzhou",           lat:  26.07, lon:  119.30 },
  { n: "Incheon",          lat:  37.46, lon:  126.71 },
  { n: "Daegu",            lat:  35.87, lon:  128.60 },
  { n: "Gwangju",          lat:  35.15, lon:  126.91 },
  { n: "Sendai",           lat:  38.27, lon:  140.87 },
  { n: "Hiroshima",        lat:  34.39, lon:  132.45 },
  { n: "Kyoto",            lat:  35.01, lon:  135.77 },
  { n: "Kobe",             lat:  34.69, lon:  135.20 },
];

function CityLabels({ visible }: { visible: boolean }) {
  const items = useMemo(() => {
    const base = CITIES.map(({ n, lat, lon }) => {
      const pos = geoPos(lat, lon, R * 1.019);
      return { n, pos, orientation: computeOrientation(pos) };
    });
    const units = base.map(it => new THREE.Vector3(...it.pos).normalize());
    return base.map((it, i) => {
      let minDeg = 180;
      for (let j = 0; j < units.length; j++) {
        if (i === j) continue;
        const dot = Math.max(-1, Math.min(1, units[i].dot(units[j])));
        const deg = Math.acos(dot) * (180 / Math.PI);
        if (deg < minDeg) minDeg = deg;
      }
      const fontSize = minDeg >= 10 ? 0.055 : Math.max(0.026, 0.055 * (minDeg / 10));
      return { ...it, fontSize };
    });
  }, []);

  if (!visible) return null;

  return (
    <>
      {items.map(({ n, pos, orientation, fontSize }) => (
        <group key={n} position={pos} quaternion={orientation}>
          {/* Visual label */}
          <Text
            fontSize={fontSize}
            color="#c8d8ff"
            outlineWidth={0.006}
            outlineColor="#111111"
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.01}
            sdfGlyphSize={64}
            renderOrder={2}
            material-depthWrite={false}
            material-side={THREE.DoubleSide}
          >
            {`\u2022 ${n}`}
          </Text>
          {/* Sprite hitbox — always faces camera so raycast always works */}
          <sprite
            scale={[0.55, 0.13, 1]}
            renderOrder={2}
            onClick={(e: any) => { e.stopPropagation(); _lmNav?.(n); }}
            onPointerOver={(e: any) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
            onPointerOut={(e: any) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
          >
            <spriteMaterial transparent opacity={0} depthTest={false} />
          </sprite>
        </group>
      ))}
    </>
  );
}


// ─── Camera zoom handler (inside Canvas) ─────────────────────────────────────
function CameraZoomHandler() {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as any;
  const animRef = useRef<{
    startDist: number; targetDist: number; elapsed: number; onDone?: () => void;
  } | null>(null);

  useFrame((_, delta) => {
    const pending = consumeCameraZoom();
    if (pending) {
      animRef.current = {
        startDist: camera.position.length(),
        targetDist: pending.distance,
        elapsed: 0,
        onDone: pending.onDone,
      };
    }
    if (!animRef.current) return;
    animRef.current.elapsed += delta;
    const duration = 1.5;
    const t = Math.min(animRef.current.elapsed / duration, 1);
    const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
    const dist = animRef.current.startDist +
      (animRef.current.targetDist - animRef.current.startDist) * ease;
    // Sync OrbitControls' internal spherical radius so it doesn't override us
    if (controls?._spherical) controls._spherical.radius = dist;
    camera.position.setLength(dist);
    if (t >= 1) { animRef.current.onDone?.(); animRef.current = null; }
    controls?.update();
  }, 1); // priority 1 = runs after OrbitControls (priority 0)

  return null;
}

// ─── Keeps OrbitControls damping ticking every frame ─────────────────────────
function DampingUpdater() {
  const controls = useThree((s) => s.controls) as any;
  useFrame(() => { controls?.update(); });
  return null;
}

// ─── Nearby-city glow pins shown after a globe click ─────────────────────────

function CitySelectionPin({
  city, index,
}: { city: { n: string; lat: number; lon: number }; index: number }) {
  const { pos, q } = useMemo(() => geo(city.lat, city.lon), [city.lat, city.lon]);
  const groupRef   = useRef<THREE.Group>(null);
  const elapsed    = useRef(0);
  const hovRef     = useRef(false);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const delay = index * 0.12;
    const t     = Math.max(0, Math.min((elapsed.current - delay) / 0.45, 1));
    const ease  = 1 - Math.pow(1 - t, 3);
    if (groupRef.current) {
      groupRef.current.position.y = 0.06 + ease * 0.28;
      groupRef.current.scale.setScalar(ease);
    }
  });

  const handleOver  = (e: any) => { e.stopPropagation(); hovRef.current = true;  setHovered(true);  document.body.style.cursor = 'pointer'; };
  const handleOut   = (e: any) => { e.stopPropagation(); hovRef.current = false; setHovered(false); document.body.style.cursor = 'auto'; };
  const handleClick = (e: any) => { e.stopPropagation(); _lmNav?.(city.n); };

  return (
    <group position={pos} quaternion={q}>
      <group ref={groupRef} position={[0, 0.06, 0]}>
        {/* Invisible hover/click hitbox */}
        <mesh onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <pointLight color="#c084fc" intensity={hovered ? 4 : 1.5} distance={1.5} decay={2} />
      </group>
    </group>
  );
}

// Haversine angular distance in degrees
function angDist(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toR = Math.PI / 180;
  const dlat = (lat2 - lat1) * toR;
  const dlon = (lon2 - lon1) * toR;
  const a = Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dlon / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a)) * (180 / Math.PI);
}

const NEARBY_MILES = 120;
const NEARBY_DEG   = NEARBY_MILES / 69.0; // 1° ≈ 69 miles
const MIN_SEP_DEG  = 0.65;                // ~45 miles min gap between shown pins

function NearbyCities({ lat, lon }: { lat: number; lon: number }) {
  const nearby = useMemo(() => {
    const candidates = CITIES
      .map(c => ({ ...c, deg: angDist(lat, lon, c.lat, c.lon) }))
      .filter(c => c.deg <= NEARBY_DEG)
      .sort((a, b) => a.deg - b.deg);

    // Greedy spatial dedup: skip a city if another already-selected city is too close
    const selected: typeof candidates = [];
    for (const c of candidates) {
      const tooClose = selected.some(s => angDist(c.lat, c.lon, s.lat, s.lon) < MIN_SEP_DEG);
      if (!tooClose) {
        selected.push(c);
        if (selected.length >= 5) break;
      }
    }
    return selected;
  }, [lat, lon]);

  return (
    <>
      {nearby.map((city, i) => (
        <CitySelectionPin key={city.n} city={city} index={i} />
      ))}
    </>
  );
}

// ─── DroppedStar — animated Geknee pin that falls onto the globe ──────────────
function DroppedStar({ lat, lon }: { lat: number; lon: number }) {
  const { pos, q } = useMemo(() => geo(lat, lon), [lat, lon]);
  const groupRef   = useRef<THREE.Group>(null);
  const portalRef  = useRef<THREE.Group>(null);
  const spriteRef  = useRef<THREE.Sprite>(null);
  const elapsed    = useRef(0);
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    new THREE.TextureLoader().load('/Geknee.png', (t) => setTex(t));
  }, []);

  useFrame((_, delta) => {
    elapsed.current += delta * 1.6;
    const t = Math.min(elapsed.current, 1);
    let ease: number;
    if (t < 0.75) {
      ease = (t / 0.75) * (t / 0.75);
    } else {
      const bt = (t - 0.75) / 0.25;
      ease = 1 + Math.sin(bt * Math.PI) * 0.22 * (1 - bt);
    }
    if (groupRef.current) {
      groupRef.current.position.y = 1.2 - 1.1 * ease;
    }
    // Spin portal rings around the surface normal (local Y = radially outward)
    if (portalRef.current) {
      portalRef.current.rotation.y += delta * 1.8;
      const pulse = 1 + 0.1 * Math.sin(elapsed.current * 5);
      portalRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={pos} quaternion={q}>
      {/* Purple portal — two concentric rings flat on the globe surface */}
      <group ref={portalRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
          <torusGeometry args={[0.09, 0.012, 8, 48]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.9} depthTest={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, Math.PI / 3]} renderOrder={10}>
          <torusGeometry args={[0.065, 0.007, 8, 48]} />
          <meshBasicMaterial color="#c084fc" transparent opacity={0.6} depthTest={false} />
        </mesh>
      </group>
      <group ref={groupRef} position={[0, 1.2, 0]}>
        {tex && (
          <sprite ref={spriteRef} scale={[0.11, 0.11, 1]}>
            <spriteMaterial map={tex} transparent sizeAttenuation depthTest={false} />
          </sprite>
        )}
      </group>
    </group>
  );
}

function GlobeScene() {
  const globeRef  = useRef<THREE.Group>(null);
  const currentQ  = useRef(new THREE.Quaternion());
  const animRef   = useRef<{
    startQ: THREE.Quaternion; targetQ: THREE.Quaternion;
    startT: number; onDone: () => void;
  } | null>(null);
  const { gl, camera } = useThree();

  // Dropped star pin state
  const [starPos, setStarPos] = useState<{ lat: number; lon: number; key: number } | null>(null);

  // ── Axis-locked drag rotation ─────────────────────────────────────────────
  // Detects dominant drag direction (H or V) after a small threshold, then
  // locks that gesture to one axis only — no diagonal globe rotation.
  const dragRef = useRef<{
    active: boolean; lastX: number; lastY: number;
    startX: number; startY: number; axis: 'h' | 'v' | null; didDrag: boolean;
  } | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const THRESHOLD = 6;
    const SENS = 0.005;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, axis: null, didDrag: false };
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d?.active) return;
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      if (!d.axis) {
        const adx = Math.abs(e.clientX - d.startX);
        const ady = Math.abs(e.clientY - d.startY);
        if (adx > THRESHOLD || ady > THRESHOLD) { d.axis = adx >= ady ? 'h' : 'v'; d.didDrag = true; }
      }
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      if (!d.axis || animRef.current) return;
      if (d.axis === 'h') {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * SENS);
        currentQ.current.premultiply(q);
      } else {
        const camDir = camera.position.clone().normalize();
        const right = new THREE.Vector3(0, 1, 0).cross(camDir).normalize();
        const q = new THREE.Quaternion().setFromAxisAngle(right, dy * SENS);
        currentQ.current.premultiply(q);
      }
    };

    const onUp = () => { if (dragRef.current) dragRef.current.active = false; };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera]);

  // ── Separate state for each async input so any update rebuilds the texture ─
  const [countries,     setCountries]     = useState<GeoCollection | null>(null);
  const [states,        setStates]        = useState<GeoCollection | null>(null);
  const [terrainBitmap, setTerrainBitmap] = useState<ImageBitmap   | null>(null);
  const [bumpMap,       setBumpMap]       = useState<THREE.Texture  | null>(null);
  const [texture,       setTexture]       = useState<THREE.CanvasTexture | null>(null);
  // 0 = countries only | 1 = + states | 2 = + cities
  const [zoomLevel, setZoomLevel] = useState(0);
  const zoomLevelRef = useRef(0);

  // Rebuild canvas texture whenever GeoJSON borders or terrain image change
  useEffect(() => {
    const tex = createEarthTexture(countries, states, terrainBitmap);
    tex.minFilter  = THREE.LinearMipmapLinearFilter;
    tex.magFilter  = THREE.LinearFilter;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    setTexture(tex);
  }, [countries, states, terrainBitmap, gl]);

  // Load all async resources once on mount
  useEffect(() => {
    let cancelled = false;

    // ── GeoJSON border data ──────────────────────────────────────────────────
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          fetch("/ne_110m_admin_0_countries.json"),
          fetch("/ne_10m_admin_1_states_provinces.json"),
        ]);
        if (!cRes.ok || !sRes.ok || cancelled) return;
        const [c, s]: [GeoCollection, GeoCollection] = await Promise.all([
          cRes.json(), sRes.json(),
        ]);
        if (!cancelled) { setCountries(c); setStates(s); }
      } catch { /* keep border-free texture */ }
    })();

    // ── NASA Blue Marble Next Generation — monthly terrain textures ───────────
    // Files: /public/earth_terrain_01.jpg … earth_terrain_12.jpg
    // Download all 12 months from NASA Visible Earth → Blue Marble Next Generation
    // Rename each: world.topo.bathy.2004XX.3x5400x2700.jpg → earth_terrain_XX.jpg
    // Falls back through remaining months if current month's file is absent.
    (async () => {
      const month = new Date().getMonth() + 1; // 1–12
      const pad   = (n: number) => String(n).padStart(2, '0');
      // Build candidate list: current month first, then wrap around
      const candidates = Array.from({ length: 12 }, (_, i) => ((month - 1 + i) % 12) + 1);
      for (const m of candidates) {
        try {
          const res = await fetch(`/earth_terrain_${pad(m)}.jpg`);
          if (!res.ok) continue;
          const blob = await res.blob();
          const bmp  = await createImageBitmap(blob, { resizeWidth: 8192, resizeHeight: 4096, resizeQuality: "high" });
          if (!cancelled) setTerrainBitmap(bmp);
          break; // found one — stop
        } catch { continue; }
      }
    })();

    // ── SRTM/USGS elevation bump map (/public/earth_bump.jpg) ───────────────
    // Download a grayscale SRTM shaded-relief image:
    // NASA Visible Earth → search "Earth topology bump" → earth_bump.jpg
    // Or use Natural Earth's grayscale DEM: https://www.naturalearthdata.com/
    new THREE.TextureLoader().load(
      "/earth_bump.jpg",
      t  => {
        if (cancelled) return;
        // Only use bump map if it's high enough resolution to look good
        // (low-res maps create blocky stepped displacement on the 256-seg sphere)
        const img = t.image as HTMLImageElement;
        if (img && img.naturalWidth >= 1024) {
          t.minFilter  = THREE.LinearMipmapLinearFilter;
          t.anisotropy = gl.capabilities.getMaxAnisotropy();
          t.needsUpdate = true;
          setBumpMap(t);
        }
        // If too small, skip displacement — flat surface looks better than blocky steps
      },
      undefined,
      () => { /* file absent — run without bump map */ },
    );

    return () => { cancelled = true; };
  }, [gl]);

  // Real-world rotation speed: one revolution per sidereal day
  const EARTH_ROT = (2 * Math.PI) / 86164;
  // Reusable objects — allocated once outside useFrame to avoid per-frame GC
  const _yAxis  = useRef(new THREE.Vector3(0, 1, 0)).current;
  const _deltaQ = useRef(new THREE.Quaternion()).current;

  useFrame(({ clock, camera }, delta) => {
    if (!globeRef.current) return;

    const pending = consumeGlobeTarget();
    if (pending && !animRef.current) {
      // Build target quaternion: rotate globe so (lat,lon) faces the camera,
      // then correct roll so the north pole stays as "up" as possible.
      const phi = (pending.lat * Math.PI) / 180;
      const lam = (pending.lon * Math.PI) / 180;
      const nx =  Math.cos(phi) * Math.cos(lam);
      const ny =  Math.sin(phi);
      const nz = -Math.cos(phi) * Math.sin(lam);
      const camDir = camera.position.clone().normalize();
      // Step 1: shortest-arc rotation that puts the target point at camDir
      const Q1 = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(nx, ny, nz), camDir,
      );
      // Step 2: find where the north pole ends up after Q1
      const northWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(Q1);
      // Step 3: project both northWorld and worldY onto the plane perpendicular to camDir
      const worldY = new THREE.Vector3(0, 1, 0);
      const northProj = northWorld.clone().sub(camDir.clone().multiplyScalar(northWorld.dot(camDir)));
      const worldYProj = worldY.clone().sub(camDir.clone().multiplyScalar(worldY.dot(camDir)));
      // Step 4: rotate around camDir to align northProj with worldYProj (no more diagonal roll)
      let targetQ = Q1;
      if (northProj.lengthSq() > 1e-6 && worldYProj.lengthSq() > 1e-6) {
        northProj.normalize();
        worldYProj.normalize();
        const rollAngle = Math.atan2(
          camDir.dot(new THREE.Vector3().crossVectors(northProj, worldYProj)),
          northProj.dot(worldYProj),
        );
        const Qroll = new THREE.Quaternion().setFromAxisAngle(camDir, rollAngle);
        targetQ = new THREE.Quaternion().multiplyQuaternions(Qroll, Q1);
      }
      animRef.current = {
        startQ: currentQ.current.clone(),
        targetQ,
        startT: clock.getElapsedTime(),
        onDone: pending.onDone,
      };
    }

    if (consumeResetTilt() && !animRef.current) {
      // De-roll globe so north pole appears at top of screen, keeping the same longitude facing.
      const Q = currentQ.current.clone();
      const camDir = camera.position.clone().normalize();
      const northWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
      const worldY = new THREE.Vector3(0, 1, 0);
      const northProj = northWorld.clone().sub(camDir.clone().multiplyScalar(northWorld.dot(camDir)));
      const worldYProj = worldY.clone().sub(camDir.clone().multiplyScalar(worldY.dot(camDir)));
      let uprightQ = Q;
      if (northProj.lengthSq() > 1e-6 && worldYProj.lengthSq() > 1e-6) {
        northProj.normalize();
        worldYProj.normalize();
        const rollAngle = Math.atan2(
          camDir.dot(new THREE.Vector3().crossVectors(northProj, worldYProj)),
          northProj.dot(worldYProj),
        );
        const Qroll = new THREE.Quaternion().setFromAxisAngle(camDir, rollAngle);
        uprightQ = new THREE.Quaternion().multiplyQuaternions(Qroll, Q);
      }
      animRef.current = { startQ: Q, targetQ: uprightQ, startT: clock.getElapsedTime(), onDone: () => {} };
    }

    if (animRef.current) {
      const elapsed = clock.getElapsedTime() - animRef.current.startT;
      const duration = 2.2;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
      currentQ.current.slerpQuaternions(animRef.current.startQ, animRef.current.targetQ, ease);
      globeRef.current.quaternion.copy(currentQ.current);
      if (t >= 1) { animRef.current.onDone(); animRef.current = null; }
    } else {
      // Continuous auto-rotation around world Y axis
      _deltaQ.setFromAxisAngle(_yAxis, delta * EARTH_ROT);
      currentQ.current.premultiply(_deltaQ);
      globeRef.current.quaternion.copy(currentQ.current);
    }
    // Update zoom level only when crossing thresholds (avoids per-frame setState)
    const dist = camera.position.length();
    const newZoom = dist < 21 ? 2 : dist < 28 ? 1 : 0;
    if (newZoom !== zoomLevelRef.current) {
      zoomLevelRef.current = newZoom;
      setZoomLevel(newZoom);
    }
  });

  // Key encodes loaded assets so Three.js recreates the material on each upgrade
  const matKey = `${texture ? "t" : ""}${bumpMap ? "b" : ""}`;

  return (
    <>
      {/* Stars fill the full canvas / scene */}
      <Stars radius={140} depth={60} count={6000} factor={5} saturation={0} fade speed={0.4} />

      {/* Bright ambient keeps all landmark colours vivid (Mario Galaxy feel) */}
      <ambientLight intensity={1.4} />
      {/* Key light — warm directional, no harsh specular glare */}
      <directionalLight position={[8, 5, 14]} intensity={1.6} color="#fff4d0" />
      {/* Front fill so colours facing the camera pop with candy gloss */}
      <pointLight position={[0, 3, 28]} intensity={2.0} color="#ffffff" />
      {/* Warm rim light from above — Nintendo "planet glow" */}
      <pointLight position={[0, 20, 0]} intensity={1.0} color="#ffe8aa" />
      {/* Cool back-fill for atmospheric depth contrast */}
      <pointLight position={[-14, -8, -12]} intensity={0.4} color="#2040c0" />
      {/* Vivid colour bounce — saturated cyan from below like ocean reflection */}
      <pointLight position={[0, -18, 0]} intensity={0.5} color="#00ccff" />

      <group ref={globeRef}>
        {/*
          256×256 segments needed for displacementMap to push vertices into
          real 3-D mountains (Mario Galaxy planet silhouette).
          displacementScale 0.65 = exaggerated cartoon peaks.
          displacementBias -0.12 = ocean (black=0) sinks below surface,
          mountains (white=1) pop above — classic Nintendo planet look.
          Glossy candy roughness 0.18 + metalness 0.14.
        */}
        <Sphere args={[R, 256, 256]} onClick={(e) => {
          e.stopPropagation();
          if (dragRef.current?.didDrag) return; // was a drag, not a click
          if (!globeRef.current) { _globeClick?.(); return; }
          // Convert world-space hit → globe-local → lat/lon
          const local = globeRef.current.worldToLocal(e.point.clone());
          const lat = Math.asin(Math.max(-1, Math.min(1, local.y / R))) * (180 / Math.PI);
          const lon = Math.atan2(-local.z, local.x) * (180 / Math.PI);
          // Drop the star pin and light up nearby cities
          setStarPos({ lat, lon, key: Date.now() });
          // Fly + zoom in the background
          flyToGlobe(lat, lon, () => zoomCamera(14));
        }}>
          <meshStandardMaterial
            key={matKey}
            map={texture ?? undefined}
            color={texture ? "#ffffff" : "#10a8ff"}
            roughness={0.72}
            metalness={0.0}
            displacementMap={bumpMap ?? undefined}
            displacementScale={bumpMap ? 0.65 : 0}
            displacementBias={bumpMap ? -0.12 : 0}
          />
        </Sphere>

        {/* Inner atmosphere glow */}
        <Sphere args={[R * 1.03, 96, 96]}>
          <meshStandardMaterial
            color="#4488ff" transparent opacity={0.07}
            side={THREE.BackSide} depthWrite={false}
          />
        </Sphere>

        {/* Outer atmosphere halo */}
        <Sphere args={[R * 1.08, 96, 96]}>
          <meshStandardMaterial
            color="#6699ff" transparent opacity={0.03}
            side={THREE.BackSide} depthWrite={false}
          />
        </Sphere>

        {/* 3-D landmarks standing perpendicular to the globe surface */}
        <AllLandmarks />
        {/* Ocean & land animals */}
        <AllAnimals />

        {/* Dropped star pin + nearby city selection pins */}
        {starPos && <DroppedStar key={starPos.key} lat={starPos.lat} lon={starPos.lon} />}
        {starPos && zoomLevel >= 1 && <NearbyCities key={`nc-${starPos.key}`} lat={starPos.lat} lon={starPos.lon} />}

        {/* Geographic labels floating above surface */}
        <GeoLabels countries={countries} states={states} zoomLevel={zoomLevel} />
        <CityLabels visible={zoomLevel >= 2} />

      </group>
    </>
  );
}

// ─── Auth imports ──────────────────────────────────────────────────────────────
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
const AuthModal      = dynamic(() => import("@/app/components/AuthModal"),      { ssr: false });
const TripSocialPanel = dynamic(() => import("@/app/components/TripSocialPanel"), { ssr: false });
const SettingsPanel   = dynamic(() => import("@/app/components/SettingsPanel"),   { ssr: false });
const LanguageBanner  = dynamic(() => import("@/app/components/LanguageBanner"),  { ssr: false });
const UpgradeModal    = dynamic(() => import("@/app/components/UpgradeModal"),    { ssr: false });

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LocationPage() {
  const [location, setLocation] = useState("");
  const [authOpen,      setAuthOpen]      = useState(false);
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [upgradeOpen,   setUpgradeOpen]   = useState(false);
  const [notifUnread,   setNotifUnread]   = useState(0);
  const router = useRouter();
  const { data: session } = useSession();

  // Poll for unread notification count (background, when panel is closed)
  useEffect(() => {
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return;
    const poll = async () => {
      try {
        const d = await (await fetch('/api/notifications')).json();
        setNotifUnread(d.unreadCount ?? 0);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 30_000);
    return () => clearInterval(iv);
  }, [(session?.user as { id?: string })?.id]);
  // Register globe-click navigation so Lm can navigate without prop-drilling
  useState(() => {
    _setLmNav((loc: string) => {
      setLocation(loc);
      window.dispatchEvent(new CustomEvent('geknee:globeselect', { detail: { location: loc } }));
    });
    _setGlobeClick(() => {
      window.dispatchEvent(new CustomEvent('geknee:globeselect', { detail: { location: '' } }));
    });
  });

  const handleInitialize = () => {
    resetGlobeTilt();
  };

  return (
    // position:fixed on canvas bypasses the entire layout chain — no parent
    // needs explicit height. The main just provides the stacking context.
    <main style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#060816" }}>

      {/* Deep-space gradient background */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background:
          "radial-gradient(ellipse at 40% 45%, rgba(30,70,200,0.4) 0%, rgba(6,8,22,0.96) 58%, #030510 100%)",
      }} />

      {/* Full-page 3D canvas — fixed to viewport so it always fills edge-to-edge */}
      <Canvas
        style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 1 }}
        camera={{ position: [0, 0, 26], fov: 50 }}
        dpr={[1, Math.min(window.devicePixelRatio, 3)]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <OrbitControls makeDefault enableZoom enablePan={false} enableRotate={false} minDistance={11.5} maxDistance={45} zoomSpeed={1.2} enableDamping dampingFactor={0.12} />
        <DampingUpdater />
        <GlobeScene />
      </Canvas>

      {/* Initialize / home button — top-center */}
      <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}>
        <button
          onClick={handleInitialize}
          title="Reset globe orientation"
          style={{
            background: "rgba(6,8,22,0.80)", border: "1px solid rgba(129,140,248,0.35)",
            backdropFilter: "blur(14px)", borderRadius: 12, color: "#c7d2fe",
            fontSize: 12, fontWeight: 700, padding: "8px 16px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
            letterSpacing: "0.05em", textTransform: "uppercase",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          Initialize
        </button>
      </div>

      {/* Auth / user area — top-right corner, above canvas (zIndex 20) */}
      <div style={{ position: "fixed", top: 18, right: 20, zIndex: 20, display: "flex", alignItems: "center", gap: 8 }}>
        {session?.user ? (
          <>
            {/* Go Pro button */}
            <button
              onClick={() => setUpgradeOpen(true)}
              style={{
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                border: "none", borderRadius: 10,
                color: "#fff", fontSize: 12, fontWeight: 700,
                padding: "8px 14px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                boxShadow: "0 2px 12px rgba(99,102,241,0.4)",
              }}
            >
              {String.fromCodePoint(0x2728)} Go Pro
            </button>

            {/* Trips & Friends button */}
            <button
              onClick={() => { setPanelOpen(true); setNotifUnread(0); }}
              style={{
                background: "rgba(6,8,22,0.75)", border: "1px solid rgba(99,102,241,0.35)",
                backdropFilter: "blur(12px)", borderRadius: 10, color: "#c7d2fe",
                fontSize: 12, fontWeight: 600, padding: "8px 14px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
                position: "relative",
              }}
            >
              {/* Suitcase icon */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
              Trips &amp; Friends
              {notifUnread > 0 && (
                <span style={{
                  position: "absolute", top: -6, right: -6,
                  background: "#f59e0b", color: "#000",
                  borderRadius: 99, fontSize: 10, fontWeight: 800,
                  padding: "1px 5px", minWidth: 16, textAlign: "center",
                  boxShadow: "0 0 0 2px rgba(6,8,22,0.9)",
                }}>
                  {notifUnread}
                </span>
              )}
            </button>

            {/* Avatar — also opens panel */}
            <button
              onClick={() => setPanelOpen(true)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 8 }}
            >
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name ?? "avatar"}
                  style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid rgba(99,102,241,0.5)" }}
                />
              ) : (
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(99,102,241,0.25)", border: "2px solid rgba(99,102,241,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#a5b4fc" }}>
                  {(session.user.name ?? session.user.email ?? "?")[0].toUpperCase()}
                </div>
              )}
            </button>

          </>
        ) : (
          <button
            onClick={() => setAuthOpen(true)}
            style={{
              background: "rgba(6,8,22,0.75)", border: "1px solid rgba(129,140,248,0.35)",
              backdropFilter: "blur(12px)",
              borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600,
              padding: "9px 18px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 7,
              boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Sign in
          </button>
        )}
        {/* Hamburger / Settings — always far right */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          style={{
            background: "rgba(6,8,22,0.75)", border: "1px solid rgba(99,102,241,0.3)",
            backdropFilter: "blur(12px)", borderRadius: 10, color: "rgba(200,210,255,0.8)",
            width: 36, height: 36, cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 4, padding: 0,
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
          }}
        >
          <span style={{ display: "block", width: 14, height: 1.5, background: "currentColor", borderRadius: 1 }} />
          <span style={{ display: "block", width: 14, height: 1.5, background: "currentColor", borderRadius: 1 }} />
          <span style={{ display: "block", width: 14, height: 1.5, background: "currentColor", borderRadius: 1 }} />
        </button>
      </div>

      {/* Auth modal */}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      {/* Trips & Friends panel */}
      <TripSocialPanel open={panelOpen} onClose={() => setPanelOpen(false)} currentLocation={location} />

      {/* Upgrade modal */}
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

      {/* Settings panel */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Language detection banner */}
      <LanguageBanner onSwitch={(lang) => {
        try {
          const raw = localStorage.getItem("geknee_settings");
          const current = raw ? JSON.parse(raw) : {};
          localStorage.setItem("geknee_settings", JSON.stringify({ ...current, language: lang }));
        } catch { /* ignore */ }
        window.location.reload();
      }} />

    </main>
  );
}
