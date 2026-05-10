"use client";
// Landmark system — materials, primitives, GLB loader, hover label, bridges,
// and the <Lm /> placement wrapper. Extracted from LocationClient.tsx so the
// globe scene file can stay focused on camera / globe / page glue.
//
// Pure-data siblings supply everything this module needs to stay self-contained:
//   geo.ts       — SurfPos type
//   info.ts      — LmInfo type
//   skins.ts     — monument skin registry (file prefixes, available skins, ring colors)
//   locations.ts — pre-computed landmark positions + density map

import { useFrame } from "@react-three/fiber";
import { useGLTF, Html, Sparkles, Text, Billboard } from "@react-three/drei";
import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  Component,
  Suspense,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { createPortal } from "react-dom";

import { type SurfPos } from "./geo";
import { type LmInfo } from "./info";
import { LM_DENSITY } from "./locations";
import {
  MONUMENT_FILE_PREFIX,
  AVAILABLE_SKINS,
  MONUMENT_LATLON,
  SKIN_RING_COLOR,
} from "./skins";

// ─── Landmark system ──────────────────────────────────────────────────────────
// Base candy-gloss material (Mario Galaxy feel)
export function Mat({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.08} metalness={0.18} emissive={c} emissiveIntensity={0.12}/>;
}
// Weathered stone / masonry (Colosseum, Stonehenge, Petra rock face, Acropolis marble)
export function MatStone({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.82} metalness={0.0} emissive={c} emissiveIntensity={0.04}/>;
}
// Polished marble / white stone (Taj Mahal, Christ the Redeemer)
export function MatMarble({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.22} metalness={0.06} emissive={c} emissiveIntensity={0.08}/>;
}
// Iron / painted steel (Eiffel Tower, Golden Gate Bridge)
export function MatMetal({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.38} metalness={0.72} emissive={c} emissiveIntensity={0.06}/>;
}
// Oxidised copper / patina (Statue of Liberty)
export function MatPatina({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.6} metalness={0.42} emissive={c} emissiveIntensity={0.1}/>;
}
// Polished gold / gilded (Angkor Wat, Borobudur, temple finials)
export function MatGold({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.14} metalness={0.88} emissive={c} emissiveIntensity={0.18}/>;
}
// Sandstone / desert rock (Petra background, Pyramids, Grand Canyon)
export function MatSand({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.9} metalness={0.0} emissive={c} emissiveIntensity={0.05}/>;
}
// Glass / water / ice surfaces
export function MatGlass({ c }: { c: string }) {
  return <meshStandardMaterial color={c} roughness={0.04} metalness={0.05} emissive={c} emissiveIntensity={0.22} transparent opacity={0.82}/>;
}

// Typed mesh helpers — accept optional mat override for per-surface materials
export function Box({ p, s, c, M = Mat }: { p:[number,number,number]; s:[number,number,number]; c:string; M?:React.FC<{c:string}> }) {
  return <mesh position={p}><boxGeometry args={s}/><M c={c}/></mesh>;
}
export function Cone({ p, r, h, seg=32, c, M = Mat }: { p:[number,number,number]; r:number; h:number; seg?:number; c:string; M?:React.FC<{c:string}> }) {
  return <mesh position={p}><coneGeometry args={[r,h,seg]}/><M c={c}/></mesh>;
}
export function Cyl({ p, rt, rb, h, seg=32, c, M = Mat }: { p:[number,number,number]; rt:number; rb:number; h:number; seg?:number; c:string; M?:React.FC<{c:string}> }) {
  return <mesh position={p}><cylinderGeometry args={[rt,rb,h,seg]}/><M c={c}/></mesh>;
}
export function Ball({ p, r, c, M = Mat }: { p:[number,number,number]; r:number; c:string; M?:React.FC<{c:string}> }) {
  return <mesh position={p}><sphereGeometry args={[r,48,48]}/><M c={c}/></mesh>;
}


// ─── GLB model registry ────────────────────────────────────────────────────────
export const BLOB_BASE = 'https://mrfgpxw07gmgmriv.public.blob.vercel-storage.com/models';

// GLB models served from Vercel Blob. Entries here render as the default (pre-skin)
// model for ANY viewer — even non-collected users. The base eiffel_tower.glb ships
// without materials/normals and renders invisibly, so it is intentionally NOT listed:
// non-collected users fall through to the primitive children (visible iron tower),
// collected users hit skinPath and load a skin GLB (stone/gold/etc, full PBR).
export const MODELS: Record<string, { path: string; scale: number }> = {};

// Eager-warm the lowest-tier skin GLB for every wired monument so when Lm
// resolves a previewSkin/effectiveSkin, useGLTF returns from cache instead of
// flashing the children primitive (the "default Liberty" the user sees while
// the 10MB Meshy GLB streams). Runs once at module load — drei's preload
// short-circuits if the GLB is already cached.
if (typeof window !== 'undefined') {
  for (const [mk, prefix] of Object.entries(MONUMENT_FILE_PREFIX)) {
    const skins = AVAILABLE_SKINS[mk];
    if (!skins || skins.size === 0) continue;
    const tier = skins.has('bronze') ? 'bronze'
      : skins.has('stone') ? 'stone'
      : [...skins][0];
    if (tier) useGLTF.preload(`${BLOB_BASE}/${prefix}_${tier}.glb`);
  }
}

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
export function GlbModel({ path, scale }: { path: string; scale: number }) {
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

// Wikipedia returns the article's "lead image" which for obscure cities is
// often a locator map / coat of arms / flag rather than a photo. Reject those
// by URL pattern so the caller can fall back instead of showing a map.
function looksLikeMapOrCrest(url: string): boolean {
  const lower = url.toLowerCase();
  // Wikipedia renders SVGs as PNGs with .svg.png suffix — those are almost
  // always locator maps / crests / flags for city pages.
  if (lower.endsWith(".svg.png")) return true;
  if (/(coat[_-]of[_-]arms|brasao|brasão|escudo|wappen|blason|flag[_-]of|bandeira|bandera)/i.test(lower)) return true;
  if (/(location[_-]of|localizacao|localización|locator|locality|map[_-]of|mapa[_-]de|locator-map)/i.test(lower)) return true;
  if (/(_in_[a-z][a-z]_|realregion|_district_map|district_map_of|state_loc|_admin_)/i.test(lower)) return true;
  if (/(_mun_|municipio[_-]|comuna[_-]|paroquia[_-])/i.test(lower)) return true;
  return false;
}

type WikiResult = { img: string | null; extract: string; description: string };

// Common ISO-2 → English country names for Wikipedia disambig queries.
// Only the noisy long-tail entries — Wikipedia handles most direct names fine.
const COUNTRY_NAME: Record<string, string> = {
  BR: "Brazil", AR: "Argentina", CL: "Chile", PE: "Peru", CO: "Colombia",
  VE: "Venezuela", BO: "Bolivia", EC: "Ecuador", PY: "Paraguay", UY: "Uruguay",
  MX: "Mexico", US: "United States", CA: "Canada",
  IN: "India", CN: "China", JP: "Japan", ID: "Indonesia", PH: "Philippines",
  RU: "Russia", DE: "Germany", FR: "France", IT: "Italy", ES: "Spain",
  GB: "United Kingdom", NG: "Nigeria", EG: "Egypt", ZA: "South Africa",
};

async function rawWikiSummary(title: string, thumbPx: number): Promise<WikiResult & { isDisambig: boolean }> {
  const t = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${t}&redirects&prop=pageimages|extracts|description&pithumbsize=${thumbPx}&exintro&explaintext&format=json&origin=*`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { img: null, extract: "", description: "", isDisambig: false };
    const d = await r.json();
    const page: any = Object.values(d.query.pages)[0];
    const raw: string | null = page?.thumbnail?.source ?? null;
    const img = raw && !looksLikeMapOrCrest(raw) ? raw : null;
    const extract: string = page?.extract ?? "";
    // Wikipedia disambiguation pages start with "<title> may refer to:".
    const isDisambig = /\bmay refer to:?\s*$/i.test(extract.split("\n")[0]?.trim() ?? "");
    return { img, extract, description: page?.description ?? "", isDisambig };
  } catch {
    return { img: null, extract: "", description: "", isDisambig: false };
  }
}

// Find the best Wikipedia article near (lat, lon) for a known place name.
// Wikipedia's geosearch returns ALL nearby articles (rivers, mountains,
// neighbourhoods, the city), not just the city itself — and the closest
// hit is often a sibling feature (the tributary "Santana" sits closer to
// the marker than the city of "Santana, Amapá"). Strategy:
//   1. Pull top 10 hits within radiusM.
//   2. Prefer titles that contain the queried name (case-insensitive) AND
//      a disambig qualifier — "Santana (Amapá)" / "Santana, Brazil" — over
//      a bare match (which is more likely to be the river / landmark).
//   3. Reject obvious non-settlement titles (River, Mountain, Lake, etc.)
//      unless they match nothing else.
//   4. Fall back to the absolute closest hit.
const NON_SETTLEMENT = /\b(river|stream|mountain|peak|lake|reservoir|forest|park|national\s+park|reserve|island|bay|cape|gulf|strait|hill|valley|airport|station|tributary)\b/i;

async function geosearchTitle(name: string, lat: number, lon: number, radiusM = 10000): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=${radiusM}&gslimit=10&format=json&origin=*`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const hits: { title: string; dist: number }[] = (d?.query?.geosearch ?? [])
      .map((h: any) => ({ title: h.title as string, dist: h.dist as number }));
    if (hits.length === 0) return null;

    const lower = name.toLowerCase();
    const settled = hits.filter(h => !NON_SETTLEMENT.test(h.title));

    // Tier 1: name match + disambig qualifier (parens or comma).
    const t1 = settled.find(h => {
      const t = h.title.toLowerCase();
      return t.includes(lower) && (t.includes("(") || t.includes(","));
    });
    if (t1) return t1.title;

    // Tier 2: bare name match, settlement-style.
    const t2 = settled.find(h => h.title.toLowerCase().includes(lower));
    if (t2) return t2.title;

    // Tier 3: any settlement-style hit (closest first).
    if (settled[0]) return settled[0].title;

    // Tier 4: anything (shouldn't normally happen).
    return hits[0].title;
  } catch {
    return null;
  }
}

// Tries the bare name → "name, Country" → geosearch by lat/lon, returning the
// first non-disambig hit. Pure, no module-level cache (callers cache).
export async function wikiSummary(
  title: string,
  thumbPx = 800,
  geo?: { lat?: number; lon?: number; country?: string },
): Promise<WikiResult> {
  // 1. Bare name.
  const first = await rawWikiSummary(title, thumbPx);
  if (first.extract && !first.isDisambig) {
    return { img: first.img, extract: first.extract, description: first.description };
  }
  // 2. "name, Country" if we have a country code we recognize.
  const countryName = geo?.country ? COUNTRY_NAME[geo.country] : undefined;
  if (countryName) {
    const second = await rawWikiSummary(`${title}, ${countryName}`, thumbPx);
    if (second.extract && !second.isDisambig) {
      return { img: second.img, extract: second.extract, description: second.description };
    }
  }
  // 3. Geosearch by coordinates → closest article with a real summary.
  if (typeof geo?.lat === "number" && typeof geo?.lon === "number") {
    const nearTitle = await geosearchTitle(title, geo.lat, geo.lon, 10000);
    if (nearTitle && nearTitle.toLowerCase() !== title.toLowerCase()) {
      const third = await rawWikiSummary(nearTitle, thumbPx);
      if (third.extract && !third.isDisambig) {
        return { img: third.img, extract: third.extract, description: third.description };
      }
    }
  }
  // Nothing useful — return the disambig/empty result so callers can fall
  // back to local copy.
  return { img: first.img, extract: first.isDisambig ? "" : first.extract, description: first.description };
}

export function LandmarkLabel({ info, planUrl, floating }: { info: LmInfo; planUrl?: string; floating?: boolean }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    wikiSummary(info.name).then(({ img }) => { if (!cancelled && img) setImgUrl(img); }).catch(() => {});
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
      pointerEvents: planUrl ? "auto" : "none",
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

        {planUrl && (
          <a
            href={planUrl}
            style={{
              display: "block", marginTop: "10px",
              padding: "8px 0", borderRadius: "10px", border: "none",
              background: "linear-gradient(135deg,#06b6d4,#6366f1)",
              color: "#fff", fontSize: "11px", fontWeight: 700,
              textAlign: "center", textDecoration: "none",
              cursor: "pointer",
            }}
          >
            Ready to plan your trip? {String.fromCodePoint(0x27A4)}
          </a>
        )}
      </div>

      {!floating && (<>
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
      </>)}
    </div>
  );
}

// Places children on the globe surface at the given lat/lon, standing upright.
// ─── Globe-click navigation bridge
let _lmNav: ((loc: string) => void) | null = null;
export function _setLmNav(fn: (loc: string) => void) { _lmNav = fn; }
let _lmNavDirect: ((loc: string) => void) | null = null;
export function _setLmNavDirect(fn: (loc: string) => void) { _lmNavDirect = fn; }
let _globeClick: (() => void) | null = null;
export function _setGlobeClick(fn: () => void) { _globeClick = fn; }

// ─── Globe data-ready bridge (GlobeScene → LocationPage)
let _onGlobeReady: (() => void) | null = null;

// ─── Collected monuments bridge (LocationPage → Lm)
let _collectedMonuments = new Set<string>();
let _activeSkins = new Map<string, string>();
let _monumentVersion = 0;
const _monumentListeners = new Set<() => void>();
export function _setCollectedMonuments(ids: Set<string>) {
  _collectedMonuments = ids;
  _monumentVersion++;
  _monumentListeners.forEach(fn => fn());
}
export function _setActiveSkins(skins: Map<string, string>) {
  _activeSkins = skins;
  _monumentVersion++;
  _monumentListeners.forEach(fn => fn());
  // Eager-warm the actual active-skin GLB for each collected monument so when
  // Lm re-renders with activeSkin set, useGLTF returns from cache instead of
  // suspending and flashing the children primitive.
  if (typeof window !== 'undefined') {
    skins.forEach((skin, mk) => {
      if (!skin || skin === 'default') return;
      const prefix = MONUMENT_FILE_PREFIX[mk] ?? mk;
      const tiers = AVAILABLE_SKINS[mk];
      if (!tiers || !tiers.has(skin)) return;
      useGLTF.preload(`${BLOB_BASE}/${prefix}_${skin}.glb`);
    });
  }
}
export function useMonumentBridge(mk?: string) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick(t => t + 1);
    _monumentListeners.add(cb);
    return () => { _monumentListeners.delete(cb); };
  }, []);
  return {
    isCollected: mk ? _collectedMonuments.has(mk) : false,
    activeSkin: mk ? _activeSkins.get(mk) : undefined,
  };
}

// Subscribers re-render whenever the collected set changes; returns the live Set.
export function useCollectedMonumentSet(): Set<string> {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick(t => t + 1);
    _monumentListeners.add(cb);
    return () => { _monumentListeners.delete(cb); };
  }, []);
  return _collectedMonuments;
}

// ─── Pending unlock bridge (Lm + MonumentShop → page chrome share-toast) ─────
// Fires when a monument transitions from uncollected → collected so the page
// can surface a share prompt. Keeps the toast UI out of the 3D scene.
//
// Two firing paths:
//   1. Lm's collection-transition useEffect (existing) — fires for any unlock
//      that flips the bridge, with no photo context.
//   2. MonumentShop, immediately after the API completes a photo-verified
//      mission — fires with the persisted Blob photoUrl so the share card
//      can show the user's actual proof shot. This wins the race and Lm's
//      effect skips when a richer pending unlock for the same mk exists.
type PendingUnlock = { mk: string; skin: string; photoUrl?: string; ts: number };
let _pendingUnlock: PendingUnlock | null = null;
const _pendingUnlockListeners = new Set<() => void>();
export function _setPendingUnlock(u: { mk: string; skin: string; photoUrl?: string } | null) {
  _pendingUnlock = u ? { ...u, ts: Date.now() } : null;
  _pendingUnlockListeners.forEach(fn => fn());
}
// Lm uses this to avoid clobbering a richer (photoUrl-bearing) pending unlock
// the MonumentShop already set for the same monument.
export function _hasPendingUnlockFor(mk: string): boolean {
  return _pendingUnlock?.mk === mk;
}
export function usePendingUnlock(): PendingUnlock | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick(t => t + 1);
    _pendingUnlockListeners.add(cb);
    return () => { _pendingUnlockListeners.delete(cb); };
  }, []);
  return _pendingUnlock;
}

export function Lm({ p, s = 0.4, info, mk, children }: { p: SurfPos; s?: number; info?: LmInfo; mk?: string; children: ReactNode }) {
  const { isCollected, activeSkin } = useMonumentBridge(mk);
  const [hovered, setHovered]         = useState(false);
  const [mobileActive, setMobileActive] = useState(false);
  // Lightweight preview tier (bronze when available — typically ~17MB vs
  // 47MB for stone — falling back through stone, then any). Used as the
  // GLB-resolution fallback for both:
  //   - Anonymous visitors (no isCollected, no activeSkin)
  //   - Collected users with no live activeSkin: e.g. dev-account unlocks
  //     create a row with skin='default' which the API strips from
  //     activeSkins. Previously this hardcoded to 'stone' which (a) doesn't
  //     exist for half the wired monuments (christRedeem, greatWall,
  //     sagradaFamilia, sydneyOpera) so the GLB never loaded at all, and
  //     (b) is the heaviest tier for monuments that do have it (47MB Eiffel
  //     stone vs 17MB Eiffel bronze) so the Suspense flashed the primitive
  //     for several seconds even on a fast connection.
  const previewSkin = mk && AVAILABLE_SKINS[mk]
    ? (AVAILABLE_SKINS[mk].has('bronze') ? 'bronze'
        : AVAILABLE_SKINS[mk].has('stone') ? 'stone'
        : [...AVAILABLE_SKINS[mk]][0])
    : undefined;
  const requestedSkin = (isCollected && activeSkin && activeSkin !== 'default')
    ? activeSkin
    : previewSkin;
  // Defensive: if the requestedSkin (often the user's persisted activeSkin) is
  // NOT in AVAILABLE_SKINS for this monument, fall back to previewSkin. This
  // covers data drift like a user with a damascus row for a monument that has
  // no damascus GLB — without this, hasSkinGlb=false → primitive forever and
  // the ring uses the default-yellow fallback. Now: graceful degrade to bronze.
  const effectiveSkin = (mk && requestedSkin && AVAILABLE_SKINS[mk]?.has(requestedSkin))
    ? requestedSkin
    : previewSkin;
  const hasSkinGlb = !!(mk && effectiveSkin && AVAILABLE_SKINS[mk]?.has(effectiveSkin));
  const skinPath = hasSkinGlb ?
    `${BLOB_BASE}/${MONUMENT_FILE_PREFIX[mk!] ?? mk}_${effectiveSkin}.glb` : undefined;
  const model   = mk ? MODELS[mk] : undefined;
  const density = LM_DENSITY.get(p) ?? 1;
  // Global landmark size multiplier — every monument rendered at 1.875x its
  // declared `s` (was 1.5; bumped 25% per user request) so the Meshy GLBs
  // read clearly inside the city ring instead of looking like a dot.
  // Keeps per-monument proportions intact (Eiffel s=0.9 stays taller than
  // Liberty s=0.4) — just scales all up together.
  const LANDMARK_BOOST = 1.875;
  const effS    = s * density * LANDMARK_BOOST;

  // ─── Animation state refs ───────────────────────────────────────────────────
  const prevCollectedRef = useRef(isCollected);
  const prevSkinRef = useRef(activeSkin);

  // Unlock celebration animation state
  const unlockAnimRef = useRef({
    active: false,
    time: 0,               // elapsed seconds since unlock
    ringScale: 0,
    ringOpacity: 0.7,
    modelScale: 1,
    sparkleActive: false,
  });

  // Skin switch animation state
  const skinAnimRef = useRef({
    active: false,
    time: 0,
    phase: 'idle' as 'idle' | 'fadeOut' | 'flash' | 'fadeIn',
    opacity: 1,
    rotation: 0,
    flashIntensity: 0,
  });

  // Ring animation ref (continuous for collected monuments)
  const ringRef = useRef<THREE.Mesh>(null);
  const zoomWrapperRef = useRef<THREE.Group>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const modelGroupRef = useRef<THREE.Group>(null);
  const sparkleGroupRef = useRef<THREE.Group>(null);
  const flashLightRef = useRef<THREE.PointLight>(null);

  // Detect unlock transition (isCollected: false → true)
  useEffect(() => {
    if (isCollected && !prevCollectedRef.current) {
      unlockAnimRef.current = {
        active: true,
        time: 0,
        ringScale: 0,
        ringOpacity: 1.0,
        modelScale: 1.0,
        sparkleActive: true,
      };
      // Surface the unlock to the page chrome so it can show a share prompt.
      // Skip when MonumentShop already pushed a richer unlock for this mk
      // (with photoUrl) — its API-completion path wins the race and we
      // don't want to clobber the proof photo with a no-photo replay.
      if (mk && !_hasPendingUnlockFor(mk)) {
        _setPendingUnlock({ mk, skin: effectiveSkin ?? 'stone' });
      }
    }
    prevCollectedRef.current = isCollected;
  }, [isCollected, mk, effectiveSkin]);

  // Detect skin switch (activeSkin changes)
  useEffect(() => {
    if (prevSkinRef.current !== undefined && activeSkin !== prevSkinRef.current) {
      skinAnimRef.current = {
        active: true,
        time: 0,
        phase: 'fadeOut',
        opacity: 1,
        rotation: 0,
        flashIntensity: 0,
      };
    }
    prevSkinRef.current = activeSkin;
  }, [activeSkin]);

  // Ring color based on current skin rarity
  const ringColor = effectiveSkin ? (SKIN_RING_COLOR[effectiveSkin] ?? '#ffd700') : '#ffd700';

  // ─── Per-frame animation loop ───────────────────────────────────────────────
  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05); // clamp to avoid jumps

    // Zoom-aware scale: monuments grow when the camera pulls back so they
    // remain easy to spot at world view, then shrink back to natural size
    // as the user zooms in to inspect them. camDist 11.5 (closest) → 1×;
    // camDist 30+ (far) → ~2×. Power 0.6 keeps the curve gentle.
    if (zoomWrapperRef.current) {
      const camDist = camera.position.length();
      const zoomMul = Math.max(1, Math.pow(camDist / 11.5, 0.6));
      zoomWrapperRef.current.scale.setScalar(zoomMul);
    }

    // === Unlock celebration animation ===
    const ua = unlockAnimRef.current;
    if (ua.active) {
      ua.time += dt;

      // Ring scale: 0 → 1.2 → 1.0 (spring bounce over 0.6s)
      if (ua.time < 0.3) {
        ua.ringScale = (ua.time / 0.3) * 1.2;
      } else if (ua.time < 0.6) {
        const t = (ua.time - 0.3) / 0.3;
        ua.ringScale = 1.2 - 0.2 * t; // 1.2 → 1.0
      } else {
        ua.ringScale = 1.0;
      }

      // Ring pulse glow for 3 seconds (opacity 0.5 → 1.0 pulsing)
      if (ua.time < 3.0) {
        ua.ringOpacity = 0.75 + 0.25 * Math.sin(ua.time * 6);
      } else {
        ua.ringOpacity = 0.7;
      }

      // Model scale pop: 1.0 → 1.15 → 1.0 over 0.5s
      if (ua.time < 0.25) {
        ua.modelScale = 1.0 + 0.15 * (ua.time / 0.25);
      } else if (ua.time < 0.5) {
        const t = (ua.time - 0.25) / 0.25;
        ua.modelScale = 1.15 - 0.15 * t;
      } else {
        ua.modelScale = 1.0;
      }

      // Sparkles active for 2 seconds
      if (ua.time > 2.0) {
        ua.sparkleActive = false;
      }

      // End unlock animation after 3 seconds
      if (ua.time >= 3.0) {
        ua.active = false;
        ua.ringScale = 1.0;
        ua.modelScale = 1.0;
      }

      // Apply model scale
      if (modelGroupRef.current) {
        const ms = ua.modelScale;
        modelGroupRef.current.scale.set(ms, ms, ms);
      }
    }

    // Apply ring animation (scale + opacity)
    if (ringRef.current) {
      const rs = ua.active ? ua.ringScale : 1.0;
      ringRef.current.scale.set(rs, rs, rs);
      // Slow continuous rotation for collected rings
      ringRef.current.rotation.z += dt * 0.3;
    }
    if (ringMatRef.current) {
      ringMatRef.current.opacity = ua.active ? ua.ringOpacity : 0.7;
    }

    // Sparkle group visibility
    if (sparkleGroupRef.current) {
      sparkleGroupRef.current.visible = ua.sparkleActive;
    }

    // === Skin switch animation ===
    const sa = skinAnimRef.current;
    if (sa.active) {
      sa.time += dt;

      switch (sa.phase) {
        case 'fadeOut':
          // Fade out over 0.3s
          sa.opacity = Math.max(0, 1 - sa.time / 0.3);
          if (sa.time >= 0.3) {
            sa.phase = 'flash';
            sa.time = 0;
            sa.opacity = 0;
            sa.flashIntensity = 2.0;
          }
          break;
        case 'flash':
          // Brief flash for 0.15s
          sa.flashIntensity = 2.0 * Math.max(0, 1 - sa.time / 0.15);
          if (sa.time >= 0.15) {
            sa.phase = 'fadeIn';
            sa.time = 0;
            sa.flashIntensity = 0;
          }
          break;
        case 'fadeIn':
          // Fade in over 0.5s
          sa.opacity = Math.min(1, sa.time / 0.5);
          // 360° rotation over 0.8s
          sa.rotation = Math.min(1, sa.time / 0.8) * Math.PI * 2;
          if (sa.time >= 0.8) {
            sa.active = false;
            sa.phase = 'idle';
            sa.opacity = 1;
            sa.rotation = 0;
            sa.flashIntensity = 0;
          }
          break;
      }

      // Apply skin switch visual effects
      if (modelGroupRef.current) {
        // Apply opacity to all mesh materials in the model
        modelGroupRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat && mat.isMeshStandardMaterial) {
              mat.transparent = true;
              mat.opacity = sa.opacity;
              mat.needsUpdate = true;
            }
          }
        });
        // Apply rotation spin
        if (sa.phase === 'fadeIn' || sa.phase === 'flash') {
          modelGroupRef.current.rotation.y = sa.rotation;
        } else {
          modelGroupRef.current.rotation.y = 0;
        }
      }

      // Flash light
      if (flashLightRef.current) {
        flashLightRef.current.intensity = sa.flashIntensity;
      }
    }
  });

  // Dismiss when another mobile city card is activated
  const posKey = `${p.pos[0]},${p.pos[1]},${p.pos[2]}`;
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>).detail.key;
      if (key !== posKey) setMobileActive(false);
    };
    window.addEventListener('geknee:mobilecity', handler);
    return () => window.removeEventListener('geknee:mobilecity', handler);
  }, [posKey]);

  const handleClick = (e: React.PointerEvent<THREE.Mesh>) => {
    e.stopPropagation();
    if (!info) return;
    const key = posKey;
    if (!mobileActive) {
      window.dispatchEvent(new CustomEvent('geknee:mobilecity', { detail: { key } }));
    }
    setMobileActive(prev => !prev);
  };

  const showLabel = mobileActive;

  // Render rules:
  //   - Collected user with active skin → full landmark with their skin GLB
  //   - Anonymous (or uncollected) user with previewSkin available → render
  //     the preview-tier GLB so the globe shows real monuments to everyone
  //   - mk-less decorative Lm or no preview available → hide
  // Placed AFTER all hooks to satisfy Rules of Hooks across state transitions.
  const shouldRender = !!mk && (isCollected || !!previewSkin);
  if (!shouldRender) return null;

  return (
    <group position={p.pos} quaternion={p.q}>
      <group ref={zoomWrapperRef}>
      <group scale={effS}>
        <group ref={modelGroupRef}>
          {(skinPath || model) ? (
            <ModelErrorBoundary fallback={model ? (
              <ModelErrorBoundary fallback={<>{children}</>}>
                <Suspense fallback={<>{children}</>}>
                  <GlbModel path={model.path} scale={1} />
                </Suspense>
              </ModelErrorBoundary>
            ) : <>{children}</>}>
              <Suspense fallback={<>{children}</>}>
                <GlbModel path={skinPath ?? model!.path} scale={1} />
              </Suspense>
            </ModelErrorBoundary>
          ) : children}
        </group>

        {/* Flash point light for skin switch transition */}
        <pointLight ref={flashLightRef} position={[0, 0.5, 0]} color="#fffbe6" intensity={0} distance={3} />

        {/* Per-monument spotlights — these now do the heavy lifting since the
            scene-level lighting was pulled down. 4.0 + 2.0 hits the Meshy PBR
            materials cleanly without bleeding past distance=3 into neighbours.
            (Earlier 6+3 over-baked combined with bright scene; 2+1 was invisible
            after the scene cut. 4+2 is the sweet spot.) */}
        <pointLight position={[1.2, 1.5, 1.2]}  color="#fff4d0" intensity={4.0} distance={3} decay={2} />
        <pointLight position={[-1.2, 1.5, -1.2]} color="#dcefff" intensity={2.0} distance={3} decay={2} />

        {/* Unlock sparkle burst */}
        <group ref={sparkleGroupRef} visible={false}>
          <Sparkles
            count={40}
            scale={[2, 2, 2]}
            size={6}
            speed={2}
            opacity={0.8}
            color="#ffd700"
          />
        </group>

        {/* Ring is now always visible — uncollected monuments get a faint
            white outline so they read as "spots to find" instead of being
            invisible until unlocked. Collected monuments keep their rarity
            colour at full opacity. */}
        <mesh ref={ringRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.8, 32]} />
          <meshBasicMaterial
            ref={ringMatRef}
            color={isCollected ? ringColor : "#ffffff"}
            transparent
            opacity={isCollected ? 0.7 : 0.28}
          />
        </mesh>

        <mesh
          position={[0, 0.5, 0]}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true);  document.body.style.cursor = "pointer"; }}
          onPointerOut={(e)  => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
          onClick={handleClick as any}
        >
          <sphereGeometry args={[0.7, 6, 4]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* Always-visible floating monument name. Billboard keeps it readable
          at any camera angle. Sits just above the GLB at world scale so its
          height stays proportional to the monument size. Soft dark halo for
          contrast over bright satellite terrain — same style as city labels. */}
      {info && (
        <Billboard position={[0, effS * 1.15 + 0.08, 0]} follow lockX={false} lockY={false} lockZ={false}>
          <Text
            fontSize={0.10}
            color={isCollected ? ringColor : "#ffffff"}
            outlineWidth={0.012}
            outlineColor="#000000"
            outlineOpacity={0.55}
            outlineBlur={0.045}
            anchorX="center"
            anchorY="bottom"
            sdfGlyphSize={128}
            renderOrder={4}
            material-depthWrite={false}
            material-depthTest={false}
            material-toneMapped={false}
          >
            {info.name}
          </Text>
        </Billboard>
      )}
      </group>

      {showLabel && info && (
        <Html as="div" zIndexRange={[0, 0]} style={{ pointerEvents: "none", width: 0, height: 0 }}>
          {typeof document !== "undefined" && createPortal(
            <div style={{
              position: "fixed",
              top: 84,
              left: 24,
              zIndex: 200,
              pointerEvents: mobileActive ? "auto" : "none",
            }}>
              <LandmarkLabel
                info={info}
                planUrl={mobileActive ? `/plan?location=${encodeURIComponent(info.name)}` : undefined}
                floating
              />
            </div>,
            document.body,
          )}
        </Html>
      )}
    </group>
  );
}


// ─── Bridge trigger wrappers ─────────────────────────────────────────────────
// Module-private `let` bindings can't be read directly by importers, so expose
// narrow trigger functions. Setters above are already exported.
export function _triggerLmNav(loc: string) { _lmNav?.(loc); }
export function _triggerLmNavDirect(loc: string) { _lmNavDirect?.(loc); }
export function _triggerGlobeClick() { _globeClick?.(); }
export function _setOnGlobeReady(fn: (() => void) | null) { _onGlobeReady = fn; }
export function _triggerGlobeReady() { _onGlobeReady?.(); }
