import re

with open(r'app\plan\location\page.tsx', 'r', encoding='utf-8') as f:
    src = f.read()

# 1. Add useMemo to React imports
src = src.replace(
    'import { useEffect, useRef, useState, Component, Suspense, type ReactNode } from "react";',
    'import { useEffect, useRef, useState, useMemo, Component, Suspense, type ReactNode } from "react";'
)

INSERT = r'''
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

// --- Country + State labels ----------------------------------------------------
function GeoLabels({ countries, states }: {
  countries: GeoCollection | null;
  states:    GeoCollection | null;
}) {
  const items = useMemo(() => {
    const result: Array<{
      key: string; name: string; pos: [number, number, number]; kind: "country" | "state";
    }> = [];

    if (countries) {
      for (const f of countries.features) {
        const name = (f.properties?.NAME || f.properties?.ADMIN || f.properties?.name) as string | undefined;
        if (!name) continue;
        const c = featureCentroid(f);
        if (!c) continue;
        result.push({ key: `c-${name}`, name, pos: geoPos(c[1], c[0], R * 1.019), kind: "country" });
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
        const outerPoly = (
          geom.type === "Polygon"
            ? [geom.coordinates as number[][][]]
            : geom.coordinates as number[][][][]
        )[0];
        const ring = outerPoly?.[0] as number[][] | undefined;
        if (!ring) continue;
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const pt of ring) {
          if (pt[0] < minLon) minLon = pt[0]; if (pt[0] > maxLon) maxLon = pt[0];
          if (pt[1] < minLat) minLat = pt[1]; if (pt[1] > maxLat) maxLat = pt[1];
        }
        if (Math.max(maxLon - minLon, maxLat - minLat) < 2.5) continue;
        result.push({ key: `s-${admin}-${name}`, name, pos: geoPos(c[1], c[0], R * 1.019), kind: "state" });
      }
    }
    return result;
  }, [countries, states]);

  return (
    <>
      {items.map(({ key, name, pos, kind }) => (
        <Html
          key={key}
          position={pos}
          center
          distanceFactor={kind === "country" ? 24 : 18}
          style={{ pointerEvents: "none", userSelect: "none" }}
          zIndexRange={[0, 0]}
        >
          <span style={{
            display: "block",
            fontSize: kind === "country" ? 11 : 8,
            fontWeight: kind === "country" ? 700 : 500,
            color: kind === "country" ? "rgba(255,255,255,0.92)" : "rgba(200,220,255,0.75)",
            textShadow: "0 0 4px rgba(0,0,0,1), 0 1px 3px rgba(0,0,0,0.9)",
            letterSpacing: kind === "country" ? "0.08em" : "0.04em",
            textTransform: kind === "country" ? "uppercase" : "none",
            fontFamily: "system-ui,-apple-system,sans-serif",
            lineHeight: "1",
            whiteSpace: "nowrap",
          }}>
            {name}
          </span>
        </Html>
      ))}
    </>
  );
}

// --- Major world city labels ---------------------------------------------------
const CITIES: { n: string; lat: number; lon: number }[] = [
  { n: "Tokyo",          lat:  35.68, lon:  139.69 },
  { n: "Delhi",          lat:  28.61, lon:   77.23 },
  { n: "Shanghai",       lat:  31.23, lon:  121.47 },
  { n: "Sao Paulo",      lat: -23.55, lon:  -46.63 },
  { n: "Mexico City",    lat:  19.43, lon:  -99.13 },
  { n: "Cairo",          lat:  30.06, lon:   31.25 },
  { n: "Beijing",        lat:  39.91, lon:  116.39 },
  { n: "Mumbai",         lat:  19.08, lon:   72.88 },
  { n: "Osaka",          lat:  34.69, lon:  135.50 },
  { n: "New York",       lat:  40.71, lon:  -74.01 },
  { n: "Buenos Aires",   lat: -34.60, lon:  -58.38 },
  { n: "Istanbul",       lat:  41.01, lon:   28.96 },
  { n: "Lagos",          lat:   6.52, lon:    3.38 },
  { n: "Rio de Janeiro", lat: -22.91, lon:  -43.17 },
  { n: "Paris",          lat:  48.86, lon:    2.35 },
  { n: "Jakarta",        lat:  -6.21, lon:  106.85 },
  { n: "London",         lat:  51.51, lon:   -0.13 },
  { n: "Bangkok",        lat:  13.75, lon:  100.52 },
  { n: "Moscow",         lat:  55.75, lon:   37.62 },
  { n: "Los Angeles",    lat:  34.05, lon: -118.24 },
  { n: "Chicago",        lat:  41.88, lon:  -87.63 },
  { n: "Bogota",         lat:   4.71, lon:  -74.07 },
  { n: "Sydney",         lat: -33.87, lon:  151.21 },
  { n: "Dubai",          lat:  25.20, lon:   55.27 },
  { n: "Singapore",      lat:   1.35, lon:  103.82 },
  { n: "Seoul",          lat:  37.57, lon:  126.98 },
  { n: "Toronto",        lat:  43.65, lon:  -79.38 },
  { n: "Berlin",         lat:  52.52, lon:   13.40 },
  { n: "Madrid",         lat:  40.42, lon:   -3.70 },
  { n: "Rome",           lat:  41.90, lon:   12.50 },
  { n: "Cape Town",      lat: -33.93, lon:   18.42 },
  { n: "Nairobi",        lat:  -1.29, lon:   36.82 },
  { n: "Riyadh",         lat:  24.69, lon:   46.72 },
  { n: "Tehran",         lat:  35.69, lon:   51.39 },
  { n: "Karachi",        lat:  24.86, lon:   67.01 },
  { n: "Lahore",         lat:  31.55, lon:   74.35 },
  { n: "Lima",           lat: -12.05, lon:  -77.04 },
  { n: "Santiago",       lat: -33.45, lon:  -70.67 },
  { n: "Kuala Lumpur",   lat:   3.14, lon:  101.69 },
  { n: "Melbourne",      lat: -37.81, lon:  144.96 },
  { n: "Addis Ababa",    lat:   9.03, lon:   38.74 },
  { n: "Johannesburg",   lat: -26.20, lon:   28.04 },
  { n: "Kinshasa",       lat:  -4.32, lon:   15.32 },
  { n: "Manila",         lat:  14.60, lon:  120.98 },
  { n: "Kolkata",        lat:  22.57, lon:   88.36 },
  { n: "Bangalore",      lat:  12.97, lon:   77.59 },
  { n: "Baghdad",        lat:  33.34, lon:   44.40 },
  { n: "Dhaka",          lat:  23.72, lon:   90.41 },
  { n: "Chongqing",      lat:  29.56, lon:  106.55 },
  { n: "Tianjin",        lat:  39.14, lon:  117.18 },
];

function CityLabels() {
  return (
    <>
      {CITIES.map(({ n, lat, lon }) => (
        <Html
          key={n}
          position={geoPos(lat, lon, R * 1.019)}
          center
          distanceFactor={12}
          style={{ pointerEvents: "none", userSelect: "none" }}
          zIndexRange={[0, 0]}
        >
          <span style={{
            display: "block",
            fontSize: 7,
            fontWeight: 400,
            color: "rgba(255,235,160,0.85)",
            textShadow: "0 0 3px rgba(0,0,0,1), 0 1px 2px rgba(0,0,0,0.9)",
            letterSpacing: "0.03em",
            fontFamily: "system-ui,-apple-system,sans-serif",
            lineHeight: "1",
            whiteSpace: "nowrap",
          }}>
            {n}
          </span>
        </Html>
      ))}
    </>
  );
}

'''

# Insert before GlobeScene
src = src.replace('\nfunction GlobeScene() {', INSERT + 'function GlobeScene() {', 1)

# Add labels inside the globe group after AllAnimals
old_animals_end = '        {/* Ocean & land animals */}\n        <AllAnimals />\n\n      </group>'
new_animals_end = (
    '        {/* Ocean & land animals */}\n        <AllAnimals />\n\n'
    '        {/* Geographic labels floating above surface */}\n'
    '        <GeoLabels countries={countries} states={states} />\n'
    '        <CityLabels />\n\n'
    '      </group>'
)
src = src.replace(old_animals_end, new_animals_end, 1)

with open(r'app\plan\location\page.tsx', 'w', encoding='utf-8') as f:
    f.write(src)
print("Done. Lines:", src.count('\n'))
