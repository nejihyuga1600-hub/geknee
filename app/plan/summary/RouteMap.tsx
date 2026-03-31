'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';

const GM_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

export interface RouteStop  { city: string; startDate?: string; endDate?: string; }
export interface TransportLeg {
  from: string; to: string;
  type: 'flight' | 'train' | 'bus' | 'ferry' | 'subway';
  duration: string; notes: string; departureDate: string;
}

interface ResolvedStop extends RouteStop {
  coords: [number, number]; // [lng, lat]
  iata?: string;
  displayName: string;
}

// ── Airport coordinates (IATA → [lng, lat]) ───────────────────────────────────
const AIRPORT_COORDS: Record<string, [number, number]> = {
  // ── US East Coast ────────────────────────────────────────────────────────────
  JFK: [-73.7789, 40.6413], LGA: [-73.8726, 40.7773], EWR: [-74.1745, 40.6895],
  BOS: [-71.0052, 42.3643], PHL: [-75.2408, 39.8744], DCA: [-77.0377, 38.8521],
  IAD: [-77.4558, 38.9531], BWI: [-76.6682, 39.1754], CLT: [-80.9431, 35.2140],
  RDU: [-78.7875, 35.8776], ATL: [-84.4277, 33.6407], JAX: [-81.6879, 30.4941],
  MCO: [-81.3090, 28.4294], TPA: [-82.5332, 27.9755], MIA: [-80.2906, 25.7959],
  FLL: [-80.1528, 26.0726], PBI: [-80.0956, 26.6832], ORF: [-76.0123, 36.8976],
  RIC: [-77.3197, 37.5052], BDL: [-72.6832, 41.9389], ALB: [-73.8018, 42.7483],
  BUF: [-78.7322, 42.9405], SYR: [-76.1063, 43.1112], ROC: [-77.6724, 43.1189],
  // ── US Midwest ───────────────────────────────────────────────────────────────
  ORD: [-87.9048, 41.9742], MDW: [-87.7524, 41.7868], MKE: [-87.8966, 42.9472],
  MSP: [-93.2218, 44.8820], DTW: [-83.3534, 42.2162], CLE: [-81.8497, 41.4117],
  PIT: [-80.2329, 40.4915], IND: [-86.2944, 39.7173], CVG: [-84.6678, 39.0488],
  STL: [-90.3700, 38.7487], MCI: [-94.7139, 39.2976], OMA: [-95.8941, 41.3032],
  DSM: [-93.6631, 41.5340], CMH: [-82.8918, 39.9980], MSN: [-89.3375, 43.1399],
  // ── US South ─────────────────────────────────────────────────────────────────
  DFW: [-97.0403, 32.8998], DAL: [-96.8517, 32.8471], IAH: [-95.3414, 29.9844],
  HOU: [-95.2789, 29.6454], AUS: [-97.6699, 30.1975], SAT: [-98.4698, 29.5337],
  MSY: [-90.2580, 29.9934], BNA: [-86.6782, 36.1245], MEM: [-89.9767, 35.0424],
  BHM: [-86.7535, 33.5629], OKC: [-97.6007, 35.3931], TUL: [-95.8880, 36.1984],
  LIT: [-92.2242, 34.7294], SHV: [-93.8256, 32.4466], BTR: [-91.1495, 30.5332],
  JAN: [-90.0759, 32.3112],
  // ── US West ──────────────────────────────────────────────────────────────────
  LAX: [-118.4085, 33.9425], SFO: [-122.3748, 37.6189], SJC: [-121.9290, 37.3626],
  OAK: [-122.2208, 37.7213], SAN: [-117.1897, 32.7336], PHX: [-112.0116, 33.4373],
  LAS: [-115.1523, 36.0840], SEA: [-122.3088, 47.4502], PDX: [-122.5975, 45.5887],
  DEN: [-104.6737, 39.8561], SLC: [-111.9779, 40.7884], ABQ: [-106.6095, 35.0402],
  TUS: [-110.9410, 32.1161], ELP: [-106.3779, 31.8072], RNO: [-119.7682, 39.4991],
  SMF: [-121.5908, 38.6954], BUR: [-118.3590, 34.2007], SNA: [-117.8680, 33.6757],
  ONT: [-117.6009, 34.0560], BOI: [-116.2230, 43.5644], GEG: [-117.5340, 47.6199],
  BZN: [-111.1531, 45.7775], MSO: [-114.0906, 46.9163], JAC: [-110.7378, 43.6073],
  HNL: [-157.9224, 21.3245], OGG: [-156.4296, 20.8986], KOA: [-156.0456, 19.7389],
  ANC: [-149.9961, 61.1744], FAI: [-147.8561, 64.8151], JNU: [-134.5763, 58.3550],
  // ── Canada ───────────────────────────────────────────────────────────────────
  YYZ: [-79.6306, 43.6772], YVR: [-123.1839, 49.1947], YUL: [-73.7461, 45.4706],
  YYC: [-114.0144, 51.1313], YEG: [-113.5795, 53.3097], YOW: [-75.6692, 45.3225],
  YHZ: [-63.5086, 44.8808], YWG: [-97.2399, 49.9100], YQR: [-104.6659, 50.4319],
  // ── Mexico & Caribbean ───────────────────────────────────────────────────────
  MEX: [-99.0721, 19.4363], CUN: [-86.8770, 21.0365], GDL: [-103.3106, 20.5218],
  MTY: [-100.1069, 25.7785], TIJ: [-116.9702, 32.5411], SJD: [-109.7210, 23.1518],
  PVR: [-105.2544, 20.6801], ZIH: [-101.4607, 17.6008], MZT: [-106.2661, 23.1614],
  HAV: [-82.4091, 22.9892], NAS: [-77.4665, 25.0389], SDQ: [-69.6689, 18.4297],
  SJU: [-66.0018, 18.4394], MBJ: [-77.9133, 18.5037], KIN: [-76.7877, 17.9357],
  PTP: [-61.7930, 16.2653],
  // ── Central & South America ──────────────────────────────────────────────────
  GRU: [-46.4731, -23.4356], GIG: [-43.2430, -22.8099], BSB: [-47.9186, -15.8713],
  SSA: [-38.3224, -12.9086], REC: [-34.9200, -8.1265], POA: [-51.1714, -29.9944],
  EZE: [-58.5358, -34.8222], AEP: [-58.4156, -34.5592], MVD: [-56.0308, -34.8384],
  SCL: [-70.7858, -33.3930], LIM: [-77.1143, -12.0219], CUZ: [-71.9388, -13.5357],
  BOG: [-74.1469, 4.7016], MDE: [-75.5912, 6.1645], UIO: [-78.4875, -0.1292],
  CCS: [-66.9909, 10.6012], PTY: [-79.3835, 9.0714], SJO: [-84.2088, 9.9939],
  GUA: [-90.5274, 14.5833],
  // ── UK & Ireland ─────────────────────────────────────────────────────────────
  LHR: [-0.4543, 51.4775], LGW: [-0.1821, 51.1481], STN: [0.2350, 51.8850],
  LTN: [-0.3683, 51.8747], MAN: [-2.2749, 53.3537], BHX: [-1.7480, 52.4539],
  EDI: [-3.3725, 55.9500], GLA: [-4.4331, 55.8719], BRS: [-2.7191, 51.3827],
  LPL: [-2.8497, 53.3336], NCL: [-1.6917, 55.0375], DUB: [-6.2700, 53.4213],
  SNN: [-8.9248, 52.7020], BFS: [-6.2158, 54.6575],
  // ── Western Europe ───────────────────────────────────────────────────────────
  CDG: [2.5500, 49.0097], ORY: [2.3594, 48.7253], LYS: [5.0810, 45.7216],
  NCE: [7.2154, 43.6584], MRS: [5.2214, 43.4353], NTE: [-1.6111, 47.1532],
  AMS: [4.7641, 52.3105], BRU: [4.4844, 50.9014], LUX: [6.2044, 49.6234],
  FRA: [8.5706, 50.0333], MUC: [11.7861, 48.3537], BER: [13.5007, 52.3667],
  HAM: [10.0063, 53.6304], DUS: [6.7668, 51.2895], CGN: [7.1430, 50.8659],
  STR: [9.2220, 48.6900], NUE: [11.0669, 49.4987],
  ZRH: [8.5492, 47.4647], GVA: [6.1089, 46.2381], BSL: [7.5299, 47.5896],
  VIE: [16.5697, 48.1103], SZG: [13.0043, 47.7933],
  FCO: [12.2389, 41.8003], MXP: [8.7282, 45.6306], VCE: [12.3515, 45.5053],
  BLQ: [11.2887, 44.5354], NAP: [14.2908, 40.8860], PMO: [13.1091, 38.1796],
  MAD: [-3.5673, 40.4936], BCN: [2.0785, 41.2971], PMI: [2.7388, 39.5517],
  AGP: [-4.4991, 36.6749], VLC: [-0.4815, 39.4893], SVQ: [-5.8931, 37.4180],
  LIS: [-9.1354, 38.7813], OPO: [-8.6814, 41.2481], FAO: [-8.0017, 37.0144],
  ATH: [23.9445, 37.9364],
  // ── Scandinavia & Northern Europe ────────────────────────────────────────────
  ARN: [17.9186, 59.6519], GOT: [12.2798, 57.6628], MMX: [13.3716, 55.5363],
  OSL: [11.1004, 60.1939], BGO: [5.2183, 60.2934], TRD: [10.9197, 63.4579],
  HEL: [24.9633, 60.3172], TMP: [23.6044, 61.4142],
  CPH: [12.6508, 55.6179], AAL: [9.8492, 57.0929],
  KEF: [-22.6056, 63.9850],
  // ── Eastern Europe ───────────────────────────────────────────────────────────
  WAW: [20.9672, 52.1657], KRK: [19.7848, 50.0778], GDN: [18.4662, 54.3776],
  WRO: [16.8858, 51.1027], PRG: [14.2600, 50.1008], BUD: [19.2556, 47.4298],
  OTP: [26.0852, 44.5711], SOF: [23.4114, 42.6952], SKP: [21.6214, 41.9616],
  RIX: [23.9711, 56.9236], TLL: [24.8328, 59.4133], VNO: [25.2858, 54.6341],
  KBP: [30.4467, 50.3450], DME: [37.9063, 55.4085], SVO: [37.4146, 55.9726],
  LED: [30.2625, 59.8003],
  // ── Middle East ──────────────────────────────────────────────────────────────
  DXB: [55.3644, 25.2532], AUH: [54.6511, 24.4330], SHJ: [55.5172, 25.3286],
  DOH: [51.6138, 25.2731], KWI: [47.9689, 29.2267], BAH: [50.6336, 26.2708],
  MCT: [58.2844, 23.5933], RUH: [46.6988, 24.9576], JED: [39.1565, 21.6796],
  MED: [39.7051, 24.5534], AMM: [35.9932, 31.7226], BEY: [35.4884, 33.8209],
  TLV: [34.8854, 32.0114], CAI: [31.4063, 30.1219], IST: [28.8145, 40.9769],
  SAW: [29.3092, 40.8986], AYT: [30.7995, 36.8987], ADB: [27.1570, 38.2924],
  ESB: [32.6861, 40.1281],
  // ── Africa ───────────────────────────────────────────────────────────────────
  ADD: [38.7986, 8.9779], NBO: [36.9275, -1.3192], DAR: [39.2026, -6.8781],
  JNB: [28.2460, -26.1392], CPT: [18.6017, -33.9715], DUR: [30.9508, -29.6144],
  LOS: [3.3224, 6.5774], ACC: [-0.1668, 5.5502], CMN: [-7.5900, 33.3675],
  TUN: [10.2272, 36.8510], ALG: [3.2153, 36.6910], DKR: [-17.4902, 14.7397],
  MBA: [39.5942, -4.0348], SEZ: [55.5218, -4.6743], MRU: [57.6836, -20.4302],
  TNR: [47.4788, -18.7978], ABV: [7.2631, 9.0068], KRT: [32.5532, 15.5895],
  // ── South Asia ───────────────────────────────────────────────────────────────
  DEL: [77.1031, 28.5562], BOM: [72.8679, 19.0896], MAA: [80.1693, 12.9900],
  BLR: [77.7063, 13.1979], CCU: [88.4467, 22.6549], HYD: [78.4298, 17.2403],
  COK: [76.4019, 9.9952], TRV: [76.9190, 8.4821], GOI: [73.8313, 15.3808],
  AMD: [72.6347, 23.0772], PNQ: [73.9197, 18.5822], JAI: [75.8122, 26.8242],
  CMB: [79.8841, 7.1808], DAC: [90.3978, 23.8433], KHI: [67.1609, 24.9065],
  LHE: [74.4036, 31.5216], ISB: [73.0991, 33.6167], KTM: [85.3592, 27.6966],
  // ── Southeast Asia ───────────────────────────────────────────────────────────
  BKK: [100.7501, 13.6900], DMK: [100.6070, 13.9126], HKT: [98.3162, 8.1132],
  CNX: [98.9628, 18.7668], USM: [100.0620, 9.5478],
  SIN: [103.9915, 1.3644], KUL: [101.7098, 2.7456], PEN: [100.2768, 5.2972],
  CGK: [106.6558, -6.1256], DPS: [115.1670, -8.7481], SUB: [112.7866, -7.3798],
  MNL: [121.0200, 14.5086], CEB: [123.9796, 10.3072],
  HAN: [105.8067, 21.2212], SGN: [106.6519, 10.8188], DAD: [108.1990, 15.9789],
  RGN: [96.1332, 16.9073], PQC: [103.9931, 10.1700],
  // ── East Asia ────────────────────────────────────────────────────────────────
  NRT: [140.3869, 35.7647], HND: [139.7798, 35.5494], KIX: [135.2320, 34.4347],
  ITM: [135.4386, 34.7855], CTS: [141.6922, 42.7752], FUK: [130.4511, 33.5853],
  OKA: [127.6468, 26.1958], NGO: [136.8075, 35.2550],
  ICN: [126.4507, 37.4691], GMP: [126.7950, 37.5583], CJU: [126.4930, 33.5113],
  PEK: [116.5856, 40.0799], PKX: [116.4105, 39.5098], PVG: [121.8050, 31.1443],
  SHA: [121.3369, 31.1981], CAN: [113.2989, 23.3924], SZX: [113.8110, 22.6393],
  HKG: [113.9145, 22.3080], MFM: [113.5920, 22.1496],
  TPE: [121.2325, 25.0777], KHH: [120.3498, 22.5771],
  ULN: [106.7669, 47.8431],
  // ── Oceania ──────────────────────────────────────────────────────────────────
  SYD: [151.1772, -33.9461], MEL: [144.8410, -37.6733], BNE: [153.1175, -27.3842],
  PER: [115.9670, -31.9403], ADL: [138.5294, -34.9450], CBR: [149.1950, -35.3069],
  DRW: [130.8766, -12.4147], CNS: [145.7555, -16.8858],
  AKL: [174.7920, -37.0082], CHC: [172.5350, -43.4894], WLG: [174.8050, -41.3272],
  PPT: [-149.6067, -17.5534], NAN: [177.4430, -17.7554],
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function extractIata(s: string): string | null {
  return s.match(/\(([A-Z]{3})\)/)?.[1] ?? null;
}
function stripIata(s: string): string {
  return s.replace(/\s*\([A-Z]{3}\)\s*$/, '').trim();
}

async function geocodeCity(city: string): Promise<[number, number] | null> {
  if (!GM_KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${GM_KEY}`;
    const res  = await fetch(url);
    const data = await res.json() as { status: string; results?: Array<{ geometry: { location: { lat: number; lng: number } } }> };
    if (data.status !== 'OK' || !data.results?.[0]) return null;
    const loc = data.results[0].geometry.location;
    return [loc.lng, loc.lat];
  } catch { return null; }
}

async function resolveCoords(s: string, iataHint?: string): Promise<{ coords: [number, number]; iata?: string } | null> {
  const iata = iataHint ?? extractIata(s);
  if (iata && AIRPORT_COORDS[iata]) return { coords: AIRPORT_COORDS[iata], iata };
  const city = stripIata(s);
  const coords = await geocodeCity(city);
  return coords ? { coords, iata: iata ?? undefined } : null;
}

// ── Great circle arc for flight midpoint ──────────────────────────────────────
function greatCircleArc(from: [number, number], to: [number, number], steps = 80): [number, number][] {
  const rad = (d: number) => d * Math.PI / 180;
  const deg = (r: number) => r * 180 / Math.PI;
  const lat1 = rad(from[1]), lng1 = rad(from[0]);
  const lat2 = rad(to[1]),   lng2 = rad(to[0]);
  const x1 = Math.cos(lat1)*Math.cos(lng1), y1 = Math.cos(lat1)*Math.sin(lng1), z1 = Math.sin(lat1);
  const x2 = Math.cos(lat2)*Math.cos(lng2), y2 = Math.cos(lat2)*Math.sin(lng2), z2 = Math.sin(lat2);
  const dot = Math.max(-1, Math.min(1, x1*x2 + y1*y2 + z1*z2));
  const omega = Math.acos(dot);
  if (omega < 0.001) return [from, to];
  const sinO = Math.sin(omega);
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = Math.sin((1-t)*omega) / sinO, b = Math.sin(t*omega) / sinO;
    const x = a*x1+b*x2, y = a*y1+b*y2, z = a*z1+b*z2;
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.sqrt(x*x+y*y)))]);
  }
  return out;
}

// ── Route styles ──────────────────────────────────────────────────────────────
const LEG_STYLE: Record<string, { color: string; dash: [number, number] | null; width: number; label: string }> = {
  flight: { color: '#e879f9', dash: [5, 4],  width: 2,   label: 'Flight'  },
  train:  { color: '#fbbf24', dash: null,     width: 3.5, label: 'Train'   },
  bus:    { color: '#34d399', dash: [4, 3],   width: 2.5, label: 'Bus'     },
  ferry:  { color: '#38bdf8', dash: [2, 3],   width: 2.5, label: 'Ferry'   },
  subway: { color: '#a78bfa', dash: null,     width: 3,   label: 'Subway'  },
};

const DARK_MAP_STYLES: object[] = [
  { elementType: 'geometry',           stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.icon',        stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'administrative.country',  elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'road',         elementType: 'geometry',         stylers: [{ color: '#2c3e50' }] },
  { featureType: 'road.highway', elementType: 'geometry',         stylers: [{ color: '#3d5166' }] },
  { featureType: 'water',        elementType: 'geometry',         stylers: [{ color: '#0a1929' }] },
  { featureType: 'water',        elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
];

// ── SVG cartoon transport figures ─────────────────────────────────────────────
function FigFlight({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 52 34" width="46" height="30" fill="none">
      <ellipse cx="26" cy="17" rx="20" ry="7.5" fill={c} fillOpacity="0.18" stroke={c} strokeWidth="2" />
      <path d="M6 17 L3 10 L11 14" fill={c} fillOpacity="0.5" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 14 L14 3 L32 13"  fill={c} fillOpacity="0.35" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 20 L14 31 L32 21" fill={c} fillOpacity="0.35" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="40" cy="15.5" r="3.5" fill={c} />
      <circle cx="38.8" cy="14.3" r="1" fill="#fff" /><circle cx="41.2" cy="14.3" r="1" fill="#fff" />
      <path d="M38.5 17 Q40 18.5 41.5 17" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function FigTrain({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 52 36" width="48" height="32" fill="none">
      <path d="M6 8 Q14 4 26 4 L44 4 Q50 4 50 10 L50 26 Q50 30 44 30 L6 30 Q2 30 2 26 L2 12 Q2 8 6 8Z" fill={c} fillOpacity="0.18" stroke={c} strokeWidth="2" />
      <rect x="18" y="8" width="9" height="7" rx="2" fill={c} fillOpacity="0.4" />
      <rect x="30" y="8" width="9" height="7" rx="2" fill={c} fillOpacity="0.4" />
      <circle cx="10" cy="17" r="5" fill={c} />
      <circle cx="8.8" cy="15.8" r="1.2" fill="#fff" /><circle cx="11.5" cy="15.8" r="1.2" fill="#fff" />
      <path d="M8.5 18.5 Q10 20 11.5 18.5" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="14" cy="32" r="3.5" stroke={c} strokeWidth="1.8" /><circle cx="14" cy="32" r="1" fill={c} />
      <circle cx="38" cy="32" r="3.5" stroke={c} strokeWidth="1.8" /><circle cx="38" cy="32" r="1" fill={c} />
      <line x1="0" y1="36" x2="52" y2="36" stroke={c} strokeWidth="1.5" strokeOpacity="0.35" />
    </svg>
  );
}

function FigBus({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 50 36" width="46" height="32" fill="none">
      <rect x="2" y="4" width="46" height="24" rx="5" fill={c} fillOpacity="0.18" stroke={c} strokeWidth="2" />
      <rect x="7" y="11" width="10" height="9" rx="2" fill={c} fillOpacity="0.35" />
      <rect x="20" y="11" width="10" height="9" rx="2" fill={c} fillOpacity="0.35" />
      <rect x="33" y="11" width="10" height="9" rx="2" fill={c} fillOpacity="0.35" />
      <circle cx="12" cy="15.5" r="4.2" fill={c} />
      <circle cx="10.8" cy="14.3" r="1.1" fill="#fff" /><circle cx="13.4" cy="14.3" r="1.1" fill="#fff" />
      <path d="M10.5 17 Q12 18.5 13.5 17" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="13" cy="30" r="5" stroke={c} strokeWidth="2" /><circle cx="13" cy="30" r="2" fill={c} />
      <circle cx="37" cy="30" r="5" stroke={c} strokeWidth="2" /><circle cx="37" cy="30" r="2" fill={c} />
    </svg>
  );
}

function FigFerry({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 54 38" width="50" height="34" fill="none">
      <path d="M4 20 L8 30 L46 30 L50 20 Z" fill={c} fillOpacity="0.25" stroke={c} strokeWidth="2" />
      <rect x="12" y="8" width="30" height="14" rx="4" fill={c} fillOpacity="0.18" stroke={c} strokeWidth="1.8" />
      <circle cx="20" cy="15" r="4" fill={c} />
      <circle cx="18.8" cy="13.8" r="1" fill="#fff" /><circle cx="21.3" cy="13.8" r="1" fill="#fff" />
      <path d="M18.5 16.5 Q20 18 21.5 16.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M0 32 Q13 30 27 32 Q41 34 54 32" stroke={c} strokeWidth="1.5" strokeOpacity="0.5" fill="none" />
    </svg>
  );
}

function FigSubway({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 46 40" width="42" height="36" fill="none">
      <rect x="2" y="6" width="42" height="24" rx="6" fill={c} fillOpacity="0.18" stroke={c} strokeWidth="2" />
      <rect x="6"  y="11" width="14" height="11" rx="3" fill={c} fillOpacity="0.35" />
      <rect x="26" y="11" width="14" height="11" rx="3" fill={c} fillOpacity="0.35" />
      <circle cx="13" cy="15.5" r="4.5" fill={c} />
      <circle cx="11.8" cy="14.5" r="1.2" fill="#fff" /><circle cx="14.5" cy="14.5" r="1.2" fill="#fff" />
      <path d="M11.5 17.5 Q13 19 14.5 17.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="33" cy="15.5" r="4.5" fill={c} />
      <circle cx="31.8" cy="14.5" r="1.2" fill="#fff" /><circle cx="34.5" cy="14.5" r="1.2" fill="#fff" />
      <path d="M31.5 17.5 Q33 19 34.5 17.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="7"  y="32" width="11" height="5" rx="2.5" fill={c} />
      <rect x="28" y="32" width="11" height="5" rx="2.5" fill={c} />
      <line x1="0" y1="38" x2="46" y2="38" stroke={c} strokeWidth="1.5" strokeOpacity="0.5" />
    </svg>
  );
}

const FIGURES: Record<string, (props: { c: string }) => React.JSX.Element> = {
  flight: FigFlight, train: FigTrain, bus: FigBus, ferry: FigFerry, subway: FigSubway,
};

// ── City marker label (React → HTML string) ───────────────────────────────────
function CityMarker({ name, dateLabel, color, iata, isOrigin }: {
  name: string; dateLabel?: string; color: string; iata?: string; isOrigin?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
      <div style={{
        width: isOrigin ? 12 : 16, height: isOrigin ? 12 : 16, borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, ${color}cc, ${color})`,
        border: '2.5px solid rgba(255,255,255,0.9)',
        boxShadow: `0 0 12px 3px ${color}66`,
      }} />
      <div style={{
        marginTop: 5, padding: '2px 7px',
        background: 'rgba(6,8,22,0.88)', borderRadius: 6,
        border: `1px solid ${color}44`,
        color: '#e2e8f0', fontSize: 11, fontWeight: 700,
        whiteSpace: 'nowrap', textAlign: 'center',
        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
      }}>
        <span>{name}</span>
        {iata && <span style={{ marginLeft: 5, background: `${color}33`, borderRadius: 3, padding: '0 4px', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color }}>{iata}</span>}
        {dateLabel && <div style={{ fontSize: 9, color, fontWeight: 600 }}>{dateLabel}</div>}
      </div>
    </div>
  );
}

function LegFigure({ type, duration }: { type: string; duration: string }) {
  const style  = LEG_STYLE[type] ?? LEG_STYLE.flight;
  const Figure = FIGURES[type]   ?? FigFlight;
  return (
    <div style={{
      background: 'rgba(6,8,22,0.92)', border: `2px solid ${style.color}`,
      borderRadius: 10, padding: '5px 7px 3px',
      boxShadow: `0 4px 16px ${style.color}44`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <Figure c={style.color} />
      {duration && <div style={{ color: style.color, fontSize: 9, fontWeight: 700, marginTop: 2, letterSpacing: '0.04em' }}>{duration}</div>}
    </div>
  );
}

// ── HTML Overlay for custom React-rendered markers ────────────────────────────
function createHtmlOverlay(
  position: { lat: number; lng: number },
  html: string,
  anchorY: 'bottom' | 'center' = 'bottom',
): google.maps.OverlayView {
  class HtmlOverlay extends google.maps.OverlayView {
    private div: HTMLDivElement | null = null;
    onAdd() {
      this.div = document.createElement('div');
      this.div.style.cssText = 'position:absolute;pointer-events:none;';
      this.div.innerHTML = html;
      this.getPanes()!.overlayLayer.appendChild(this.div);
    }
    draw() {
      const point = this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(position.lat, position.lng));
      if (!point || !this.div) return;
      const transform = anchorY === 'bottom' ? 'translate(-50%, -100%)' : 'translate(-50%, -50%)';
      this.div.style.left      = `${point.x}px`;
      this.div.style.top       = `${point.y}px`;
      this.div.style.transform = transform;
    }
    onRemove() { this.div?.parentNode?.removeChild(this.div); this.div = null; }
  }
  return new HtmlOverlay();
}

// ── Main component ─────────────────────────────────────────────────────────────
interface RouteMapProps {
  stops: RouteStop[];
  legs: TransportLeg[];
  legsLoading: boolean;
  startDate: string;
  originAirport?: string;
  destAirport?: string;
}

export default function RouteMap({ stops, legs, legsLoading, startDate, originAirport, destAirport }: RouteMapProps) {
  const divRef      = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.OverlayView[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  const [mapReady, setMapReady]   = useState(false);
  const [resolved, setResolved]   = useState<ResolvedStop[]>([]);
  const [routeLegs, setRouteLegs] = useState<TransportLeg[]>([]);

  // ── Init map once ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      await loadGoogleMaps();
      if (cancelled || !divRef.current) return;
      if (mapRef.current) { if (!cancelled) setMapReady(true); return; }
      const map = new google.maps.Map(divRef.current!, {
        zoom: 2,
        center: { lat: 30, lng: 20 },
        styles: DARK_MAP_STYLES as google.maps.MapTypeStyle[],
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
      });
      mapRef.current = map;
      if (!cancelled) setMapReady(true);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // ── Resolve stop coords ───────────────────────────────────────────────────────
  useEffect(() => {
    if (stops.length === 0 && !originAirport) return;
    let cancelled = false;

    async function resolve() {
      const tasks: Promise<ResolvedStop | null>[] = [];
      if (originAirport) {
        const iata = extractIata(originAirport) ?? undefined;
        const name = stripIata(originAirport);
        tasks.push(resolveCoords(originAirport, iata).then(r =>
          r ? { city: name, coords: r.coords, iata: r.iata, displayName: name } as ResolvedStop : null
        ));
      }
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const iataHint = i === 0 ? (extractIata(destAirport ?? '') ?? undefined) : undefined;
        tasks.push(resolveCoords(stop.city, iataHint).then(r =>
          r ? { ...stop, coords: r.coords, iata: r.iata, displayName: stop.city } as ResolvedStop : null
        ));
      }
      const results = await Promise.all(tasks);
      if (cancelled) return;
      const valid = results.filter(Boolean) as ResolvedStop[];
      setResolved(valid);

      if (!!originAirport && valid.length >= 2) {
        const synth: TransportLeg = { from: valid[0].displayName, to: valid[1].displayName, type: 'flight', duration: '', notes: '', departureDate: startDate };
        setRouteLegs([synth, ...legs]);
      } else {
        setRouteLegs(legs);
      }
    }
    resolve();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, originAirport, destAirport, legs, startDate]);

  // ── Render overlays when map + data are ready ─────────────────────────────────
  const fitAndRender = useCallback(() => {
    if (!mapRef.current || resolved.length === 0) return;

    // Clear previous
    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    const map = mapRef.current;

    function dayNum(dateStr: string): number | null {
      if (!dateStr || !startDate) return null;
      return Math.round((new Date(dateStr).getTime() - new Date(startDate + 'T00:00:00').getTime()) / 86400000) + 1;
    }

    // Route lines
    if (resolved.length >= 2) {
      routeLegs.forEach((leg, i) => {
        if (i >= resolved.length - 1) return;
        const from = resolved[i].coords;
        const to   = resolved[i + 1].coords;
        const style = LEG_STYLE[leg.type] ?? LEG_STYLE.flight;

        if (leg.type === 'flight') {
          const arc = greatCircleArc(from, to);
          const poly = new google.maps.Polyline({
            path: arc.map(([lng, lat]) => ({ lat, lng })),
            geodesic: false,
            strokeColor: style.color,
            strokeOpacity: 0,
            strokeWeight: style.width,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: style.width * 1.5 }, offset: '0', repeat: '12px' }],
          });
          poly.setMap(map);
          polylinesRef.current.push(poly);
        } else {
          const poly = new google.maps.Polyline({
            path: [{ lat: from[1], lng: from[0] }, { lat: to[1], lng: to[0] }],
            geodesic: true,
            strokeColor: style.color,
            strokeOpacity: style.dash ? 0 : 0.8,
            strokeWeight: style.width,
            icons: style.dash ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: style.width * 1.2 }, offset: '0', repeat: '10px' }] : undefined,
          });
          poly.setMap(map);
          polylinesRef.current.push(poly);
        }

        // Transport figure at midpoint
        const arc = leg.type === 'flight' ? greatCircleArc(from, to, 20) : [from, to];
        const mid = arc[Math.floor(arc.length / 2)];
        const figHtml = renderToStaticMarkup(<LegFigure type={leg.type} duration={leg.duration} />);
        const figOverlay = createHtmlOverlay({ lat: mid[1], lng: mid[0] }, figHtml, 'bottom');
        figOverlay.setMap(map);
        overlaysRef.current.push(figOverlay);
      });
    }

    // City markers
    resolved.forEach((stop, i) => {
      const isOrigin = i === 0 && !!originAirport;
      const color = isOrigin ? '#94a3b8'
        : i === resolved.length - 1 ? '#4ade80'
        : i === (originAirport ? 1 : 0) ? '#38bdf8'
        : '#a5b4fc';
      const day = stop.startDate ? dayNum(stop.startDate) : null;
      const dateLabel = stop.startDate
        ? new Date(stop.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : undefined;
      const markerHtml = renderToStaticMarkup(
        <CityMarker
          name={stop.displayName}
          iata={stop.iata}
          isOrigin={isOrigin}
          color={color}
          dateLabel={day !== null ? `Day ${day}${dateLabel ? ` \u00B7 ${dateLabel}` : ''}` : dateLabel}
        />
      );
      const overlay = createHtmlOverlay({ lat: stop.coords[1], lng: stop.coords[0] }, markerHtml, 'bottom');
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    // Fit map
    if (resolved.length === 1) {
      map.setCenter({ lat: resolved[0].coords[1], lng: resolved[0].coords[0] });
      map.setZoom(8);
    } else {
      const bounds = new google.maps.LatLngBounds();
      resolved.forEach(r => bounds.extend({ lat: r.coords[1], lng: r.coords[0] }));
      map.fitBounds(bounds, 90);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, routeLegs, startDate, originAirport]);

  useEffect(() => {
    if (mapReady && resolved.length > 0) fitAndRender();
  }, [mapReady, resolved, routeLegs, fitAndRender]);

  return (
    <>
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(129,140,248,0.22)',
        borderRadius: 20, marginBottom: 24, overflow: 'hidden',
      }}>
        <p style={{ padding: '14px 20px 0', margin: 0, fontSize: 11, fontWeight: 700, color: '#a5b4fc', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Your Route
        </p>

        {legsLoading ? (
          <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            <div style={{ width: 18, height: 18, border: '2px solid rgba(129,140,248,0.4)', borderTopColor: '#a5b4fc', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Planning your route&hellip;
          </div>
        ) : (
          <div style={{ borderRadius: 12, overflow: 'hidden', margin: '12px 16px 0' }}>
            <div ref={divRef} style={{ width: '100%', height: 340 }} />
          </div>
        )}

        {/* Leg chips */}
        {!legsLoading && routeLegs.length > 0 && (
          <div style={{ padding: '12px 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {routeLegs.map((leg, i) => {
              const style = LEG_STYLE[leg.type] ?? LEG_STYLE.flight;
              const fromStop = resolved[i];
              const toStop   = resolved[i + 1];
              const fromLabel = fromStop?.iata ?? fromStop?.displayName ?? leg.from;
              const toLabel   = toStop?.iata   ?? toStop?.displayName   ?? leg.to;
              const day = leg.departureDate ? (() => {
                if (!startDate) return null;
                return Math.round((new Date(leg.departureDate).getTime() - new Date(startDate + 'T00:00:00').getTime()) / 86400000) + 1;
              })() : null;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${style.color}18`, border: `1px solid ${style.color}44`, borderRadius: 999, padding: '5px 13px', color: '#e0e7ff', fontSize: 12, fontWeight: 600 }}>
                  <span style={{ fontSize: 11, color: style.color, fontWeight: 700 }}>{style.label}</span>
                  <span>{fromLabel} {String.fromCodePoint(0x2192)} {toLabel}</span>
                  {day !== null && <span style={{ background: `${style.color}33`, borderRadius: 999, padding: '1px 7px', fontSize: 10, color: style.color }}>Day {day}</span>}
                  {leg.duration && <span style={{ opacity: 0.55, fontSize: 10 }}>{leg.duration}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes routeFigFloat {
          0%, 100% { transform: translate(-50%, -100%) translateY(0px); }
          50%       { transform: translate(-50%, -100%) translateY(-6px); }
        }
      `}</style>
    </>
  );
}
