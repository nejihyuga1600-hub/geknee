"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import dynamic from "next/dynamic";
import { findAirport, airportLabel, extractIata } from "@/lib/airports";

const FlightPriceChart = dynamic(() => import("../style/FlightPriceChart"), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface RouteStop {
  city: string;
  startDate?: string;
  endDate?: string;
}

interface TransportLeg {
  from: string;
  to: string;
  type: "flight" | "train" | "bus" | "ferry" | "subway";
  duration: string;
  notes: string;
  departureDate: string;
}

interface FlightLeg {
  departure: string;
  arrival: string;
  duration: string;
  stops: string;
  airports: string;
}

interface FlightOption {
  airline: string;
  code: string;
  price: string;
  priceNote: string;
  outbound: FlightLeg;
  inbound: FlightLeg;
  cabin: string;
  highlight: string;
  airlineUrl: string;
}

interface Hotel {
  name: string;
  neighborhood: string;
  description: string;
  priceRange: string;
  pros: string[];
  cons: string[];
  fromItinerary: boolean;
}

interface Restaurant {
  name: string;
  cuisine: string;
  neighborhood: string;
  description: string;
  priceRange: string;
  reservationNote: string;
  fromItinerary: boolean;
}

interface Activity {
  name: string;
  description: string;
  duration: string;
  priceEstimate: string;
  tip: string;
  fromItinerary: boolean;
}

interface Recommendations {
  hotels: Hotel[];
  restaurants: Restaurant[];
  activities: Activity[];
}

export interface BookTabProps {
  location: string;
  purpose: string;
  style: string;
  budget: string;
  interests: string;
  startDate: string;
  endDate: string;
  nights: string;
  stops?: string;
  travelingFrom?: string;
  fullItinerary?: string;
}

// ─── 3D Vehicle Models ────────────────────────────────────────────────────────

function AirplaneModel() {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.09, 0.75, 12]} />
        <meshStandardMaterial color="#e0e7ff" metalness={0.5} roughness={0.2} />
      </mesh>
      <mesh position={[0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.05, 0.18, 12]} />
        <meshStandardMaterial color="#c7d2fe" metalness={0.5} roughness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.25, 0.012, 0.55]} />
        <meshStandardMaterial color="#a5b4fc" metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[-0.32, 0.12, 0]}>
        <boxGeometry args={[0.012, 0.22, 0.14]} />
        <meshStandardMaterial color="#a5b4fc" />
      </mesh>
      <mesh position={[-0.32, 0, 0]}>
        <boxGeometry args={[0.012, 0.012, 0.26]} />
        <meshStandardMaterial color="#a5b4fc" />
      </mesh>
      {[-0.05, 0.15, 0.32].map((z, i) => (
        <mesh key={i} position={[0.1, 0.06, z]}>
          <boxGeometry args={[0.012, 0.08, 0.08]} />
          <meshStandardMaterial color="#93c5fd" emissive="#3b82f6" emissiveIntensity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function TrainModel() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.75, 0.15, 0.12]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.1} roughness={0.6} />
      </mesh>
      <mesh position={[0.38, 0.02, 0]}>
        <boxGeometry args={[0.08, 0.11, 0.1]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      {[-0.25, 0, 0.25].map((x, i) => (
        <mesh key={i} position={[x, -0.09, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.015, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
      {[-0.2, 0.05, 0.28].map((x, i) => (
        <mesh key={i} position={[x, 0.03, 0.07]}>
          <boxGeometry args={[0.1, 0.06, 0.012]} />
          <meshStandardMaterial color="#bfdbfe" emissive="#93c5fd" emissiveIntensity={0.3} transparent opacity={0.85} />
        </mesh>
      ))}
      <mesh position={[0.38, 0.02, 0.055]}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshStandardMaterial color="#fef9c3" emissive="#fde68a" emissiveIntensity={1} />
      </mesh>
    </group>
  );
}

function BusModel() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.55, 0.16, 0.12]} />
        <meshStandardMaterial color="#34d399" metalness={0.05} roughness={0.7} />
      </mesh>
      <mesh position={[0.275, 0.015, 0]}>
        <boxGeometry args={[0.012, 0.12, 0.1]} />
        <meshStandardMaterial color="#bfdbfe" transparent opacity={0.7} />
      </mesh>
      {[-0.18, 0.04, 0.22].map((x, i) => (
        <mesh key={i} position={[x, 0.02, 0.065]}>
          <boxGeometry args={[0.1, 0.065, 0.012]} />
          <meshStandardMaterial color="#bfdbfe" emissive="#93c5fd" emissiveIntensity={0.25} transparent opacity={0.8} />
        </mesh>
      ))}
      {[-0.2, 0.2].map((x, i) => (
        <mesh key={i} position={[x, -0.09, 0.065]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.015, 8]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      <mesh position={[0.275, 0.025, 0.055]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#fef9c3" emissive="#fef08a" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

function FerryModel() {
  return (
    <group>
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[0.7, 0.1, 0.18]} />
        <meshStandardMaterial color="#1d4ed8" metalness={0.2} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[0.42, 0.1, 0.14]} />
        <meshStandardMaterial color="#f0f9ff" />
      </mesh>
      <mesh position={[0.1, 0.155, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.07, 8]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[-0.15, 0.075, 0.075]}>
        <boxGeometry args={[0.08, 0.055, 0.012]} />
        <meshStandardMaterial color="#bae6fd" emissive="#7dd3fc" emissiveIntensity={0.3} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function SubwayModel() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.65, 0.14, 0.12]} />
        <meshStandardMaterial color="#7c3aed" metalness={0.25} roughness={0.5} />
      </mesh>
      <mesh position={[0.325, 0.01, 0]}>
        <boxGeometry args={[0.012, 0.13, 0.11]} />
        <meshStandardMaterial color="#6d28d9" />
      </mesh>
      {[-0.22, 0.04, 0.26].map((x, i) => (
        <mesh key={i} position={[x, 0.02, 0.065]}>
          <boxGeometry args={[0.1, 0.06, 0.012]} />
          <meshStandardMaterial color="#ddd6fe" emissive="#a78bfa" emissiveIntensity={0.4} transparent opacity={0.9} />
        </mesh>
      ))}
      {[-0.2, 0.2].map((x, i) => (
        <mesh key={i} position={[x, -0.085, 0.065]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.033, 0.033, 0.015, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
      <mesh position={[0.33, 0.025, 0.055]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#fef9c3" emissive="#fef08a" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

function VehicleByType({ type }: { type: TransportLeg["type"] }) {
  if (type === "flight")  return <AirplaneModel />;
  if (type === "train")   return <TrainModel />;
  if (type === "bus")     return <BusModel />;
  if (type === "ferry")   return <FerryModel />;
  return <SubwayModel />;
}

// ─── Route 3D scene elements ──────────────────────────────────────────────────

const TRANSPORT_COLORS: Record<string, string> = {
  flight: "#818cf8", train: "#fbbf24", bus: "#34d399",
  ferry: "#38bdf8", subway: "#a78bfa",
};

const TRANSPORT_LIFT: Record<string, number> = {
  flight: 1.6, train: 0.35, bus: 0.25, ferry: 0.2, subway: 0.3,
};

function CityMarker({ position, name, nights }: { position: THREE.Vector3; name: string; nights?: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 2.2) * 0.2;
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshStandardMaterial color="#818cf8" emissive="#6366f1" emissiveIntensity={0.5} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.018, 8, 36]} />
        <meshStandardMaterial color="#a5b4fc" transparent opacity={0.45} />
      </mesh>
      <Html center position={[0, -0.38, 0]} zIndexRange={[0, 1]}>
        <div style={{
          color: "#e0e7ff", fontFamily: "sans-serif", fontSize: 11,
          fontWeight: 700, textAlign: "center", whiteSpace: "nowrap",
          textShadow: "0 1px 4px rgba(0,0,0,.9)",
          pointerEvents: "none",
        }}>
          {name}
          {nights && <><br /><span style={{ fontSize: 9, opacity: 0.65 }}>{nights} nights</span></>}
        </div>
      </Html>
    </group>
  );
}

function AnimatedVehicle({
  from, to, type, phaseOffset,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  type: TransportLeg["type"];
  phaseOffset: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const tRef = useRef(phaseOffset % 1);
  const lift = TRANSPORT_LIFT[type] ?? 0.3;
  const mid = from.clone().add(to).multiplyScalar(0.5);
  mid.y += lift;

  const curve = useMemo(
    () => new THREE.QuadraticBezierCurve3(from, mid, to),
    [from.x, from.y, from.z, to.x, to.y, to.z, mid.x, mid.y, mid.z]
  );

  const speed = type === "flight" ? 0.18 : type === "train" ? 0.22 : 0.25;

  useFrame((_, delta) => {
    tRef.current = (tRef.current + delta * speed) % 1;
    if (!groupRef.current) return;
    const t = tRef.current;
    const pos = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    groupRef.current.position.copy(pos);
    if (tangent.length() > 0.001) {
      groupRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent);
    }
  });

  return <group ref={groupRef}><VehicleByType type={type} /></group>;
}

function RouteTube({ from, to, type }: { from: THREE.Vector3; to: THREE.Vector3; type: TransportLeg["type"] }) {
  const lift = TRANSPORT_LIFT[type] ?? 0.3;
  const mid = from.clone().add(to).multiplyScalar(0.5);
  mid.y += lift;

  const curve = useMemo(
    () => new THREE.QuadraticBezierCurve3(from, mid, to),
    [from.x, from.y, from.z, to.x, to.y, to.z, mid.x, mid.y, mid.z]
  );

  const color = TRANSPORT_COLORS[type] ?? "#818cf8";

  return (
    <mesh>
      <tubeGeometry args={[curve, 48, 0.012, 6, false]} />
      <meshStandardMaterial color={color} transparent opacity={0.45} emissive={color} emissiveIntensity={0.2} />
    </mesh>
  );
}

function RouteScene({ stops, legs }: { stops: RouteStop[]; legs: TransportLeg[] }) {
  const N = stops.length;
  const spread = Math.min(3.5, 1.8 * (N - 1));

  const positions: THREE.Vector3[] = stops.map((_, i) => {
    const x = N === 1 ? 0 : -spread / 2 + (spread / (N - 1)) * i;
    const y = N <= 2 ? 0 : Math.sin((i / (N - 1)) * Math.PI) * 0.55;
    return new THREE.Vector3(x, y, 0);
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 3]} intensity={1.2} />
      <pointLight position={[0, 3, 2]} intensity={0.6} color="#818cf8" />

      {positions.map((pos, i) => (
        <CityMarker
          key={i}
          position={pos}
          name={stops[i].city}
          nights={
            stops[i].startDate && stops[i].endDate
              ? String(Math.round((new Date(stops[i].endDate!).getTime() - new Date(stops[i].startDate!).getTime()) / 86400000)) + " nights"
              : undefined
          }
        />
      ))}

      {legs.map((leg, i) => {
        if (i >= positions.length - 1) return null;
        const from = positions[i];
        const to = positions[i + 1];
        return (
          <group key={i}>
            <RouteTube from={from} to={to} type={leg.type} />
            <AnimatedVehicle from={from} to={to} type={leg.type} phaseOffset={i * 0.33} />
          </group>
        );
      })}
    </>
  );
}

function RouteVisualizer({ stops, legs }: { stops: RouteStop[]; legs: TransportLeg[] }) {
  const camZ = Math.max(4, stops.length * 1.5);

  return (
    <div style={{
      height: 280, borderRadius: 16, overflow: "hidden",
      background: "linear-gradient(135deg,#0a0f2e,#111827)",
      border: "1px solid rgba(129,140,248,.2)",
      boxShadow: "0 8px 32px rgba(99,102,241,.2)",
    }}>
      <Canvas
        camera={{ position: [0, 1, camZ], fov: 45 }}
        gl={{ antialias: true }}
        style={{ background: "transparent" }}
      >
        <RouteScene stops={stops} legs={legs} />
      </Canvas>
    </div>
  );
}

// ─── Transport leg info card ──────────────────────────────────────────────────

const TRANSPORT_ICONS: Record<string, string> = {
  flight: "\u2708\uFE0F", train: "\uD83D\DE84", bus: "\uD83D\DE8C", ferry: "\u26F4\uFE0F", subway: "\uD83D\DE87",
};

function LegCard({ leg }: { leg: TransportLeg }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "14px 18px",
      border: `2px solid ${TRANSPORT_COLORS[leg.type] ?? "#e2e8f0"}22`,
      boxShadow: "0 2px 8px #0001",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{TRANSPORT_ICONS[leg.type]}</span>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>
            {leg.from} {String.fromCodePoint(0x2192)} {leg.to}
          </span>
          <span style={{
            marginLeft: 10, fontSize: 11, fontWeight: 700,
            background: TRANSPORT_COLORS[leg.type] + "22",
            color: TRANSPORT_COLORS[leg.type] ?? "#6366f1",
            borderRadius: 8, padding: "2px 8px", textTransform: "capitalize",
          }}>
            {leg.type}
          </span>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>{leg.duration}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{leg.notes}</p>
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>{leg.departureDate}</p>
    </div>
  );
}

// ─── Image Slideshow ─────────────────────────────────────────────────────────

const CATEGORY_PLACEHOLDERS: Record<string, { emoji: string; color: string }> = {
  hotel:      { emoji: "\uD83C\uDFE8", color: "linear-gradient(135deg,#1e3a5f,#2563eb)" },
  restaurant: { emoji: "\uD83C\uDF7D\uFE0F", color: "linear-gradient(135deg,#7c2d12,#dc2626)" },
  activity:   { emoji: "\uD83C\uDFAF", color: "linear-gradient(135deg,#064e3b,#059669)" },
  flight:     { emoji: "\u2708\uFE0F", color: "linear-gradient(135deg,#1e1b4b,#6366f1)" },
};

function ImageSlideshow({
  query, category, place,
}: {
  query: string;
  category: keyof typeof CATEGORY_PLACEHOLDERS;
  place?: { name: string; location: string };
}) {
  const [images, setImages] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const ph = CATEGORY_PLACEHOLDERS[category];

  useEffect(() => {
    let cancelled = false;
    const url = place
      ? `/api/place-images?name=${encodeURIComponent(place.name)}&location=${encodeURIComponent(place.location)}`
      : `/api/images?q=${encodeURIComponent(query)}&n=5`;

    fetch(url)
      .then(r => r.json())
      .then((d: { images: string[] }) => { if (!cancelled) setImages(d.images ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [place?.name, place?.location, query]);

  useEffect(() => {
    if (images.length <= 1) return;
    timerRef.current = setInterval(() => setCurrent(c => (c + 1) % images.length), 4000);
    return () => clearInterval(timerRef.current);
  }, [images.length]);

  const go = (dir: 1 | -1) => {
    clearInterval(timerRef.current);
    setCurrent(c => (c + dir + images.length) % images.length);
  };

  const baseStyle: React.CSSProperties = {
    height: 120, borderRadius: "10px 10px 0 0", overflow: "hidden",
    position: "relative", flexShrink: 0,
  };

  if (loading) return (
    <div style={{ ...baseStyle, background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "bookTabShimmer 1.4s infinite" }} />
  );
  if (images.length === 0) return (
    <div style={{ ...baseStyle, background: ph.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 48 }}>{ph.emoji}</span>
    </div>
  );
  return (
    <div style={baseStyle}>
      <img key={images[current]} src={images[current]} alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", animation: "bookTabImgFadeIn .35s ease" }}
        onError={() => setImages(p => p.filter((_, i) => i !== current))}
      />
      {images.length > 1 && (
        <>
          {(["prev", "next"] as const).map(d => (
            <button key={d} onClick={() => go(d === "prev" ? -1 : 1)} style={{
              position: "absolute", top: "50%", [d === "prev" ? "left" : "right"]: 8,
              transform: "translateY(-50%)", background: "rgba(0,0,0,.55)", border: "none",
              color: "#fff", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 16,
            }}>
              {d === "prev" ? "\u2039" : "\u203A"}
            </button>
          ))}
          <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 5 }}>
            {images.map((_, i) => (
              <button key={i} onClick={() => { clearInterval(timerRef.current); setCurrent(i); }} style={{
                width: i === current ? 16 : 6, height: 6, borderRadius: 3,
                background: i === current ? "#fff" : "rgba(255,255,255,.55)",
                border: "none", padding: 0, cursor: "pointer", transition: "width .25s",
              }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function LinkBtn({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      display: "inline-block", padding: "7px 13px", borderRadius: 8,
      background: color, color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 600,
    }}>
      {label}
    </a>
  );
}

function ItineraryBadge() {
  return (
    <span style={{
      background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff",
      borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700,
      marginLeft: 8, verticalAlign: "middle",
    }}>
      From your plan
    </span>
  );
}

function SectionHeader({ icon, title, count, loading: l }: { icon: string; title: string; count?: number; loading?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
      <span style={{ fontSize: 26 }}>{icon}</span>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e293b" }}>{title}</h2>
      {l ? (
        <span style={{ fontSize: 12, color: "#6366f1", fontWeight: 600, background: "#ede9fe", borderRadius: 20, padding: "2px 10px" }}>Finding options&hellip;</span>
      ) : count !== undefined ? (
        <span style={{ fontSize: 12, color: "#78350f", fontWeight: 700, background: "#fef3c7", borderRadius: 20, padding: "2px 10px" }}>{count} options</span>
      ) : null}
    </div>
  );
}

function Skeleton({ h = 200 }: { h?: number }) {
  return <div style={{ height: h, borderRadius: 14, background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "bookTabShimmer 1.4s infinite" }} />;
}

// ─── Flight Section ───────────────────────────────────────────────────────────

function FlightLegRow({ leg, label }: { leg: FlightLeg; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", width: 52, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", width: 36 }}>{leg.departure}</span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
          <div style={{ flex: 1, height: 1, background: "#cbd5e1" }} />
          <span style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap" }}>{leg.duration}</span>
          <div style={{ flex: 1, height: 1, background: "#cbd5e1" }} />
        </div>
        <span style={{ fontSize: 10, color: leg.stops === "Nonstop" ? "#16a34a" : "#d97706", fontWeight: 600 }}>{leg.stops}</span>
      </div>
      <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", width: 36, textAlign: "right" }}>{leg.arrival}</span>
      <span style={{ fontSize: 10, color: "#94a3b8", width: 68, textAlign: "right", flexShrink: 0 }}>{leg.airports}</span>
    </div>
  );
}

// Convert YYYY-MM-DD → MM/DD/YYYY (Expedia / AA / Delta format)
function toExpediaDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
// Convert YYYY-MM-DD → YYMMDD (Skyscanner format)
function toSkyscannerDate(iso: string) {
  return iso.slice(2).replace(/-/g, "");
}
// Convert YYYY-MM-DD → DDMmmYY  e.g. "14Mar26"  (British Airways format)
function toBritishAirwaysDate(iso: string) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}${months[d.getMonth()]}${String(d.getFullYear()).slice(2)}`;
}

// ─── Airline-specific deep-link builders ─────────────────────────────────────
type AirlineLinkFn = (o: string, d: string, dep: string, ret: string) => string;

const AIRLINE_BOOKING: Record<string, AirlineLinkFn> = {
  AA: (o,d,dep,ret) =>
    `https://www.kayak.com/flights/${o}-${d}/${dep}/${ret}?cabin=e&adults=1`,
  UA: (o,d,dep,ret) =>
    `https://www.united.com/en/us/fsr/choose-flights?f=${o}&t=${d}&d=${dep}&r=${ret}&tt=2&sc=7&px=1&taxng=1&newHP=True`,
  DL: (o,d,dep,ret) =>
    `https://www.delta.com/us/en/flight-search/book-a-flight#departureDate=${dep}&returnDate=${ret}&origin=${o}&destination=${d}&paxCount=1&cabinClass=coach&tripType=roundtrip&fareClass=lowest`,
  WN: (o,d,dep,ret) =>
    `https://www.southwest.com/air/booking/select.html?originationAirportCode=${o}&destinationAirportCode=${d}&departureDate=${dep}&returnDate=${ret}&adultPassengersCount=1&tripType=roundtrip`,
  B6: (o,d,dep,ret) =>
    `https://www.jetblue.com/booking/flights?from=${o}&to=${d}&depart=${dep}&return=${ret}&isMultiCity=false&noOfRoute=1&adults=1`,
  AS: (o,d,dep,ret) =>
    `https://www.alaskaair.com/booking/choose-flights/1/${o}/${d}/${dep}/${ret}/Adult`,
  F9: (o,d,dep,ret) =>
    `https://www.flyfrontier.com/book-travel/our-flights/?origin=${o}&destination=${d}&departureDate=${dep}&returnDate=${ret}&adults=1`,
  NK: (o,d,dep,ret) =>
    `https://www.spirit.com/book/flights?originAirportCode=${o}&destinationAirportCode=${d}&departDate=${dep}&returnDate=${ret}&adults=1&tripType=RT`,
  AC: (o,d,dep,ret) =>
    `https://www.aircanada.com/en-ca/flights/book-flight?org0=${o}&dest0=${d}&departDate0=${dep}&returnDate=${ret}&ADT=1&INT=0&CHD=0&INF=0&INS=0&fare=lowest&lang=en-CA`,
  BA: (o,d,dep,ret) =>
    `https://www.britishairways.com/travel/booking/public/en_us?tripType=RT&from=${o}&to=${d}&depDate=${toBritishAirwaysDate(dep)}&retDate=${toBritishAirwaysDate(ret)}&noOfAdults=1&cabin=M`,
  LH: (o,d,dep,ret) =>
    `https://www.lufthansa.com/us/en/flight-search?origin=${o}&destination=${d}&departureDate=${dep}&returnDate=${ret}&adults=1&tripType=ROUND_TRIP`,
  AF: (o,d,dep,ret) =>
    `https://wwws.airfrance.us/search/offers?pax=ADT:1&cabinClass=ECONOMY&trip=${o}:${d}:${dep},${d}:${o}:${ret}`,
  KL: (o,d,dep,ret) =>
    `https://www.klm.com/en-US/flight-offers?origin=${o}&destination=${d}&outboundDate=${dep}&returnDate=${ret}&adults=1&cabinClass=ECONOMY`,
  IB: (o,d,dep,ret) =>
    `https://www.iberia.com/en/flights/?origin=${o}&destination=${d}&departureDate=${dep}&returnDate=${ret}&adults=1&tripType=RT`,
  VY: (o,d,dep,ret) =>
    `https://www.vueling.com/en/book-flights?origin=${o}&destination=${d}&departureDate=${dep}&returnDate=${ret}&adults=1`,
  FR: (o,d,dep,ret) =>
    `https://www.ryanair.com/en/cheap-flights/${o.toLowerCase()}-airport/${d.toLowerCase()}-airport/?adults=1&dateOut=${dep}&dateIn=${ret}&isConnectedFlight=false&discount=0&promoCode=&ChildrenAges=&infantsNr=0&routeCode=${o}${d}&tripType=RETURN`,
  U2: (o,d,dep,ret) =>
    `https://www.easyjet.com/en/book/flights?departAirport=${o}&arriveAirport=${d}&departDate=${dep}&returnDate=${ret}&adult=1&tripType=return`,
  TK: (o,d,dep,ret) =>
    `https://www.turkishairlines.com/en-us/flights/book-a-flight/index.html?from=${o}&to=${d}&date=${dep}&returnDate=${ret}&adults=1&type=2`,
  EK: (o,d,dep,ret) =>
    `https://www.emirates.com/us/english/book/flights/?originCode=${o}&destinationCode=${d}&departureDate=${dep}&returnDate=${ret}&adult=1&tripType=R`,
  EY: (o,d,dep,ret) =>
    `https://www.etihad.com/en-us/book/flights?from=${o}&to=${d}&departDate=${dep}&returnDate=${ret}&adults=1&tripType=return`,
  QR: (o,d,dep,ret) =>
    `https://www.qatarairways.com/en-us/flights/round-trip.html?origin=${o}&destination=${d}&departureDate=${dep}&returnDate=${ret}&adults=1`,
  SQ: (o,d,dep,ret) =>
    `https://www.singaporeair.com/en_UK/us/booking/book-a-flight/choose-your-flights/?tripType=R&origin=${o}&destination=${d}&departDate=${dep}&returnDate=${ret}&numOfAdults=1`,
  NH: (o,d,dep,ret) =>
    `https://www.ana.co.jp/en/us/book-plan/flight/search/?dep_arpt=${o}&arr_arpt=${d}&dep_date=${dep.replace(/-/g,'')}&ret_date=${ret.replace(/-/g,'')}&adult=1&trip_type=RT`,
  JL: (o,d,dep,ret) =>
    `https://www.jal.co.jp/en/booking/international/?from=${o}&to=${d}&dep=${dep}&ret=${ret}&adult=1&type=RT`,
  KE: (o,d,dep,ret) =>
    `https://www.koreanair.com/us/en/booking?tripType=RT&from=${o}&to=${d}&depDate=${dep}&retDate=${ret}&adult=1`,
  OZ: (o,d,dep,ret) =>
    `https://flyasiana.com/C/US/EN/booking/reservation?tripType=RT&orig=${o}&dest=${d}&depDate=${dep}&retDate=${ret}&paxCount=1`,
  CX: (o,d,dep,ret) =>
    `https://www.cathaypacific.com/flights/en_US/flight-search?origin=${o}&destination=${d}&departureDate=${dep}&returnDate=${ret}&adults=1&tripType=roundtrip`,
  MH: (o,d,dep,ret) =>
    `https://www.malaysiaairlines.com/book/flights?origin=${o}&destination=${d}&departureDate=${dep}&returnDate=${ret}&adults=1&tripType=return`,
  TG: (o,d,dep,ret) =>
    `https://www.thaiairways.com/en_US/book/book-flight.page?orig=${o}&dest=${d}&depDate=${dep}&retDate=${ret}&adult=1&tripType=RT`,
  QF: (o,d,dep,ret) =>
    `https://www.qantas.com/us/en/book-a-trip/flights/search.html?type=return&origin=${o}&destination=${d}&departureDate=${dep}&returnDate=${ret}&adults=1&cabinClass=Economy`,
  VA: (o,d,dep,ret) =>
    `https://www.virginaustralia.com/us/en/book/flights/search/?origin=${o}&destination=${d}&depDate=${dep}&retDate=${ret}&adults=1&type=return`,
  NZ: (o,d,dep,ret) =>
    `https://www.airnewzealand.com/book-a-flight?origin=${o}&destination=${d}&departureDate=${dep}&returnDate=${ret}&adults=1&tripType=return`,
  LA: (o,d,dep,ret) =>
    `https://www.latamairlines.com/us/en/book-flights?origin=${o}&destination=${d}&outbound=${dep}&inbound=${ret}&adt=1&tripType=RT`,
  G3: (o,d,dep,ret) =>
    `https://www.voegol.com.br/en/search?originCity=${o}&destinationCity=${d}&departureDate=${dep}&returnDate=${ret}&adt=1`,
  AV: (o,d,dep,ret) =>
    `https://www.avianca.com/us/en/buy/flights/search/?origin=${o}&destination=${d}&departureDate=${dep}&returnDate=${ret}&adults=1&tripType=roundtrip`,
};

function buildAirlineUrl(code: string, o: string, d: string, dep: string, ret: string, fallback: string): string {
  const fn = AIRLINE_BOOKING[code.toUpperCase()];
  return fn ? fn(o, d, dep, ret) : fallback;
}

function FlightCard({ flight, origin, destination, startDate, endDate }: {
  flight: FlightOption; origin: string; destination: string; startDate: string; endDate: string;
}) {
  const destIata       = findAirport(destination)?.iata ?? destination;
  const airlineUrl     = buildAirlineUrl(flight.code, origin, destIata, startDate, endDate, flight.airlineUrl);
  const kayakLink      = `https://www.kayak.com/flights/${encodeURIComponent(origin)}-${encodeURIComponent(destIata)}/${startDate}/${endDate}?adults=2`;
  const skyscannerLink = `https://www.skyscanner.com/transport/flights/${encodeURIComponent(origin)}/${encodeURIComponent(destIata)}/${toSkyscannerDate(startDate)}/${toSkyscannerDate(endDate)}/?adultsv2=1&rtn=1`;
  const expediaLink    = `https://www.expedia.com/Flights-Search?trip=roundtrip&leg1=departing:${encodeURIComponent(origin)},to:${encodeURIComponent(destIata)},departure:${toExpediaDate(startDate)}&leg2=departing:${encodeURIComponent(destIata)},to:${encodeURIComponent(origin)},departure:${toExpediaDate(endDate)}&passengers=adults:1,children:0`;

  return (
    <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 1px 6px #0001" }}>
      <ImageSlideshow query={`${flight.airline} airplane flight`} category="flight" />
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{flight.airline}</span>
            <span style={{ display: "block", fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{flight.cabin} &middot; {flight.highlight}</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#16a34a" }}>{flight.price}</span>
            <span style={{ display: "block", fontSize: 10, color: "#94a3b8" }}>{flight.priceNote}</span>
          </div>
        </div>
        <FlightLegRow leg={flight.outbound} label="Out" />
        <FlightLegRow leg={flight.inbound} label="Back" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <LinkBtn href={airlineUrl} label={`Book on ${flight.code}`} color="#1e293b" />
          <LinkBtn href={skyscannerLink} label="Skyscanner" color="#0770e3" />
          <LinkBtn href={kayakLink} label="Kayak" color="#f76400" />
          <LinkBtn href={expediaLink} label="Expedia" color="#003580" />
        </div>
      </div>
    </div>
  );
}

function FlightSection({ location, startDate, endDate, travelingFrom }: {
  location: string; startDate: string; endDate: string; travelingFrom: string;
}) {
  const destAirport = useMemo(
    () => findAirport(location) ?? findAirport(location.split(" ")[0]),
    [location]
  );
  const destIata    = destAirport?.iata ?? location;
  const destCity    = destAirport?.city ?? location;

  const [flights, setFlights]             = useState<FlightOption[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(!!travelingFrom);
  const [error, setError]                 = useState("");

  useEffect(() => {
    if (!travelingFrom || !location) return;
    setError(""); setFlights([]); setFlightsLoading(true);
    fetch("/api/flights", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: travelingFrom, destination: location, startDate, endDate }),
    })
      .then(r => r.json())
      .then((d: { flights?: FlightOption[]; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setFlights(d.flights ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setFlightsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelingFrom, location, startDate, endDate]);

  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHeader icon="\u2708\uFE0F" title={`Flights: ${travelingFrom || "\u2026"} \u2192 ${destCity}`}
        loading={flightsLoading} count={!flightsLoading ? flights.length : undefined} />

      <div style={{ background: "#0c1124", borderRadius: 16, padding: "18px 20px", marginBottom: 16, border: "1px solid rgba(255,255,255,0.07)" }}>
        <FlightPriceChart
          originIata={travelingFrom}
          destIata={destIata}
          startDate={startDate}
          endDate={endDate}
          onSelectStart={() => {}}
          onSelectEnd={() => {}}
        />
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Compare on:</span>
          <LinkBtn href={`https://www.google.com/travel/flights?q=${encodeURIComponent(`flights from ${travelingFrom} to ${location} ${startDate}`)}`} label="Google Flights" color="#1a73e8" />
          <LinkBtn href={`https://www.skyscanner.com/transport/flights/${encodeURIComponent(travelingFrom)}/${encodeURIComponent(destIata)}/${toSkyscannerDate(startDate)}/${toSkyscannerDate(endDate)}/?adultsv2=1&rtn=1`} label="Skyscanner" color="#0770e3" />
          <LinkBtn href={`https://www.kayak.com/flights/${encodeURIComponent(travelingFrom)}-${encodeURIComponent(destIata)}/${startDate}/${endDate}?adults=2`} label="Kayak" color="#f76400" />
          <LinkBtn href={`https://www.expedia.com/Flights-Search?trip=roundtrip&leg1=departing:${encodeURIComponent(travelingFrom)},to:${encodeURIComponent(destIata)},departure:${toExpediaDate(startDate)}&leg2=departing:${encodeURIComponent(destIata)},to:${encodeURIComponent(travelingFrom)},departure:${toExpediaDate(endDate)}&passengers=adults:1,children:0`} label="Expedia" color="#003580" />
        </div>
      </div>

      {error && <p style={{ color: "#dc2626", background: "#fef2f2", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 14 }}>{error}</p>}
      {flightsLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 16 }}>
          <Skeleton h={320} /><Skeleton h={320} />
        </div>
      )}
      {!flightsLoading && flights.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 16 }}>
          {flights.map((f, i) => <FlightCard key={i} flight={f} origin={travelingFrom} destination={location} startDate={startDate} endDate={endDate} />)}
        </div>
      )}
    </section>
  );
}

// ─── Hotel / Restaurant / Activity Cards ────────────────────────────────────

function HotelCard({ hotel, location, checkIn, checkOut }: { hotel: Hotel; location: string; checkIn: string; checkOut: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: hotel.fromItinerary ? "1.5px solid #8b5cf6" : "1px solid #e2e8f0", boxShadow: hotel.fromItinerary ? "0 2px 12px #8b5cf615" : "0 1px 4px #0001" }}>
      <ImageSlideshow query={`${hotel.name} hotel`} category="hotel" place={{ name: hotel.name, location }} />
      <div style={{ padding: "10px 13px" }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{hotel.name}</span>
          {hotel.fromItinerary && <ItineraryBadge />}
          <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>{hotel.neighborhood} &middot; {hotel.priceRange}</span>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#475569", lineHeight: 1.6 }}>{hotel.description}</p>
        <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 10, color: "#16a34a", textTransform: "uppercase" }}>Pros</p>
            <ul style={{ margin: 0, paddingLeft: 14 }}>{hotel.pros.map((p, i) => <li key={i} style={{ fontSize: 11, color: "#374151", marginBottom: 2 }}>{p}</li>)}</ul>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 10, color: "#dc2626", textTransform: "uppercase" }}>Cons</p>
            <ul style={{ margin: 0, paddingLeft: 14 }}>{hotel.cons.map((c, i) => <li key={i} style={{ fontSize: 11, color: "#374151", marginBottom: 2 }}>{c}</li>)}</ul>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <LinkBtn href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name + " " + location)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=2&no_rooms=1&group_children=0`} label="Booking.com" color="#003580" />
          <LinkBtn href={`https://www.hotels.com/Hotel-Search?destination=${encodeURIComponent(hotel.name + " " + location)}&startDate=${checkIn}&endDate=${checkOut}&adults=2&rooms=1`} label="Hotels.com" color="#c8102e" />
          <LinkBtn href={`https://www.google.com/travel/hotels?q=${encodeURIComponent(hotel.name + " " + location)}&checkin=${checkIn}&checkout=${checkOut}&guests=2`} label="Google Hotels" color="#1a73e8" />
          <LinkBtn href={`https://www.airbnb.com/s/${encodeURIComponent(location)}/homes?checkin=${checkIn}&checkout=${checkOut}&adults=2`} label="Airbnb" color="#ff385c" />
        </div>
      </div>
    </div>
  );
}

function RestaurantCard({ restaurant, location, startDate }: { restaurant: Restaurant; location: string; startDate: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: restaurant.fromItinerary ? "1.5px solid #8b5cf6" : "1px solid #e2e8f0", boxShadow: restaurant.fromItinerary ? "0 2px 12px #8b5cf615" : "0 1px 4px #0001" }}>
      <ImageSlideshow query={`${restaurant.name} food`} category="restaurant" place={{ name: restaurant.name, location }} />
      <div style={{ padding: "10px 13px" }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{restaurant.name}</span>
          {restaurant.fromItinerary && <ItineraryBadge />}
          <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>{restaurant.cuisine} &middot; {restaurant.neighborhood} &middot; {restaurant.priceRange}</span>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{restaurant.description}</p>
        {restaurant.reservationNote && (
          <p style={{ margin: "0 0 10px", fontSize: 11, color: "#92400e", background: "#fef3c7", borderRadius: 6, padding: "4px 8px" }}>
            {String.fromCodePoint(0x1F4DD)} {restaurant.reservationNote}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <LinkBtn href={`https://www.opentable.com/s/?term=${encodeURIComponent(restaurant.name + " " + location)}&dateTime=${startDate}T19:00&covers=2`} label="OpenTable" color="#da3743" />
          <LinkBtn href={`https://www.yelp.com/search?find_desc=${encodeURIComponent(restaurant.name)}&find_loc=${encodeURIComponent(location)}`} label="Yelp" color="#d32323" />
          <LinkBtn href={`https://www.tripadvisor.com/Search?q=${encodeURIComponent(restaurant.name + " " + location)}`} label="TripAdvisor" color="#00af87" />
        </div>
      </div>
    </div>
  );
}

function ActivityCard({ activity, location, startDate, endDate }: { activity: Activity; location: string; startDate: string; endDate: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: activity.fromItinerary ? "1.5px solid #8b5cf6" : "1px solid #e2e8f0", boxShadow: activity.fromItinerary ? "0 2px 12px #8b5cf615" : "0 1px 4px #0001" }}>
      <ImageSlideshow query={`${activity.name} ${location}`} category="activity" place={{ name: activity.name, location }} />
      <div style={{ padding: "10px 13px" }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{activity.name}</span>
          {activity.fromItinerary && <ItineraryBadge />}
          <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>{activity.duration} &middot; {activity.priceEstimate}</span>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#475569", lineHeight: 1.55 }}>{activity.description}</p>
        {activity.tip && (
          <p style={{ margin: "0 0 10px", fontSize: 11, color: "#1e3a5f", background: "#eff6ff", borderRadius: 6, padding: "4px 8px" }}>
            {String.fromCodePoint(0x1F4A1)} {activity.tip}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <LinkBtn href={`https://www.viator.com/search/${encodeURIComponent(activity.name + " " + location)}`} label="Viator" color="#23a5cd" />
          <LinkBtn href={`https://www.getyourguide.com/s/?q=${encodeURIComponent(activity.name + " " + location)}&date_from=${startDate}&date_to=${endDate}`} label="GetYourGuide" color="#ff8000" />
          <LinkBtn href={`https://www.klook.com/en-US/search/?query=${encodeURIComponent(activity.name + " " + location)}&fromDate=${startDate}&toDate=${endDate}`} label="Klook" color="#e5191b" />
        </div>
      </div>
    </div>
  );
}

// ─── City transit pass purchase links ────────────────────────────────────────
const CITY_TRANSIT_LINKS: Record<string, { label: string; url: string; color: string }[]> = {
  london: [
    { label: "Visitor Oyster Card (TfL)",  url: "https://visitorshop.tfl.gov.uk/",                                                                            color: "#0019a8" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=London+Oyster+card+tourist",                                        color: "#e5191b" },
  ],
  paris: [
    { label: "Paris Visite Pass (RATP)",    url: "https://www.ratp.fr/en/titres-et-tarifs/paris-visite-travel-pass",                                           color: "#002395" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Paris+metro+day+pass",                                             color: "#e5191b" },
  ],
  berlin: [
    { label: "BVG Tickets",                 url: "https://www.bvg.de/en/tickets-and-fares",                                                                    color: "#f0a500" },
    { label: "Berlin Welcome Card",         url: "https://www.berlin-welcomecard.de/en",                                                                       color: "#3e3e3e" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Berlin+transit+pass",                                              color: "#e5191b" },
  ],
  amsterdam: [
    { label: "GVB Tickets",                 url: "https://www.gvb.nl/en/tickets",                                                                              color: "#00a0e3" },
    { label: "I Amsterdam City Card",       url: "https://www.iamsterdam.com/en/i-amsterdam-city-card",                                                        color: "#e63528" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Amsterdam+transit+pass",                                           color: "#e5191b" },
  ],
  rome: [
    { label: "ATAC Tickets",                url: "https://www.atac.roma.it/page.aspx?n=103",                                                                   color: "#c8a000" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Rome+metro+transit+pass",                                          color: "#e5191b" },
  ],
  barcelona: [
    { label: "Hola BCN! Pass (TMB)",        url: "https://www.tmb.cat/en/barcelona-fares-metro-and-bus/single-and-integrated-tickets/hola-bcn",                color: "#d40f14" },
    { label: "T-Casual Card (TMB)",         url: "https://www.tmb.cat/en/barcelona-fares-metro-and-bus/travel-cards",                                          color: "#d40f14" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Barcelona+transit+pass",                                           color: "#e5191b" },
  ],
  madrid: [
    { label: "Tourist Travel Pass (CRTM)",  url: "https://www.crtm.es/billetes-y-tarifas/billetes-y-abonos/abonos/abono-turistica.aspx",                       color: "#e6000b" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Madrid+metro+tourist+pass",                                        color: "#e5191b" },
  ],
  vienna: [
    { label: "Wiener Linien Tickets",       url: "https://www.wienerlinien.at/en/tickets-fares",                                                               color: "#e30613" },
    { label: "Vienna City Card",            url: "https://www.wien.info/en/travel-info/vienna-city-card",                                                      color: "#c8102e" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Vienna+transit+pass",                                              color: "#e5191b" },
  ],
  prague: [
    { label: "DPP Tourist Tickets",         url: "https://www.dpp.cz/en/fares-and-tickets",                                                                    color: "#e20613" },
    { label: "Prague City Pass",            url: "https://www.praguecitypass.com/",                                                                            color: "#1d3a6e" },
  ],
  stockholm: [
    { label: "SL Access Card",              url: "https://sl.se/en/in-english/fares-and-tickets/",                                                             color: "#1a68b3" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Stockholm+transit+pass",                                           color: "#e5191b" },
  ],
  copenhagen: [
    { label: "Rejsekort",                   url: "https://www.rejsekort.dk/",                                                                                  color: "#003da5" },
    { label: "Copenhagen Card",             url: "https://copenhagencard.com/",                                                                                color: "#0082ca" },
  ],
  dublin: [
    { label: "Leap Card (order online)",    url: "https://www.leapcard.ie/BuyaLeapCard/",                                                                      color: "#007b3e" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Dublin+transit+Leap+card",                                         color: "#e5191b" },
  ],
  lisbon: [
    { label: "Lisbon Card",                 url: "https://www.lisboacard.org/",                                                                                color: "#003e7e" },
    { label: "Viva Viagem Card (Metro)",    url: "https://www.metrolisboa.pt/en/travel/ticket-prices-and-types/",                                              color: "#f7931e" },
  ],
  athens: [
    { label: "OASA Tickets",                url: "https://www.athenstransport.com/english/tickets/",                                                           color: "#0059a3" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Athens+metro+pass",                                                color: "#e5191b" },
  ],
  istanbul: [
    { label: "Istanbulkart Info",           url: "https://www.istanbulkart.istanbul/",                                                                         color: "#e30613" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Istanbul+transit+card",                                            color: "#e5191b" },
  ],
  "new york": [
    { label: "NYC MetroCard (MTA)",         url: "https://new.mta.info/fares",                                                                                 color: "#0039a6" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=New+York+Metro+card",                                              color: "#e5191b" },
  ],
  chicago: [
    { label: "Ventra Card",                 url: "https://www.ventrachicago.com/products/ventra-card/",                                                        color: "#004b87" },
  ],
  "washington": [
    { label: "SmarTrip Card (WMATA)",       url: "https://www.wmata.com/fares/smartrip/",                                                                      color: "#009a44" },
  ],
  "san francisco": [
    { label: "Clipper Card",                url: "https://www.clippercard.com/",                                                                               color: "#0089c8" },
    { label: "BART Tickets",                url: "https://www.bart.gov/tickets",                                                                               color: "#009ac7" },
  ],
  "los angeles": [
    { label: "TAP Card (Metro)",            url: "https://www.taptogo.net/",                                                                                   color: "#e4002b" },
  ],
  toronto: [
    { label: "PRESTO Card (TTC)",           url: "https://www.prestocard.ca/en/about/getting-a-presto-card",                                                   color: "#007a5e" },
  ],
  montreal: [
    { label: "STM Opus Card",               url: "https://www.stm.info/en/info/fares/opus-cards-and-other-fare-media/opus-card",                               color: "#00853f" },
  ],
  "mexico city": [
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Mexico+City+metro+card",                                           color: "#e5191b" },
  ],
  tokyo: [
    { label: "Tokyo Metro Pass",            url: "https://www.tokyometro.jp/en/ticket/travel/",                                                                color: "#e5001e" },
    { label: "Suica Card on Klook",         url: "https://www.klook.com/en-US/search/?query=Tokyo+Suica+IC+card",                                              color: "#e5191b" },
  ],
  osaka: [
    { label: "Osaka Amazing Pass",          url: "https://osaka-amazing-pass.com/en/",                                                                         color: "#e60012" },
    { label: "ICOCA on Klook",              url: "https://www.klook.com/en-US/search/?query=Osaka+ICOCA+IC+card",                                              color: "#e5191b" },
  ],
  kyoto: [
    { label: "Kyoto City Bus/Subway Pass",  url: "https://www.city.kyoto.lg.jp/kotsu/page/0000028378.html",                                                    color: "#7a2030" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Kyoto+transit+day+pass",                                           color: "#e5191b" },
  ],
  seoul: [
    { label: "T-Money Card on Klook",       url: "https://www.klook.com/en-US/search/?query=Seoul+T-Money+card",                                               color: "#0068b7" },
    { label: "Discover Seoul Pass",         url: "https://www.discoverseoulpass.com/",                                                                         color: "#e5001e" },
  ],
  "hong kong": [
    { label: "Octopus Card (MTR)",          url: "https://www.mtr.com.hk/en/tourist/index.html",                                                               color: "#009a44" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Hong+Kong+Octopus+tourist+card",                                   color: "#e5191b" },
  ],
  singapore: [
    { label: "Singapore Tourist Pass",      url: "https://www.thesingaporetouristpass.com.sg/",                                                                color: "#e42313" },
    { label: "EZ-Link Card on Klook",       url: "https://www.klook.com/en-US/search/?query=Singapore+EZ-Link+transit+card",                                   color: "#e5191b" },
  ],
  bangkok: [
    { label: "BTS Rabbit Card on Klook",    url: "https://www.klook.com/en-US/search/?query=Bangkok+BTS+Rabbit+card",                                          color: "#e5191b" },
    { label: "MRT Day Pass on Klook",       url: "https://www.klook.com/en-US/search/?query=Bangkok+MRT+day+pass",                                             color: "#0068b7" },
  ],
  taipei: [
    { label: "EasyCard on Klook",           url: "https://www.klook.com/en-US/search/?query=Taipei+EasyCard+transit",                                          color: "#e5191b" },
    { label: "MRT Day Pass",                url: "https://www.metro.taipei/cp.aspx?n=3847ECA544FEB2B1",                                                        color: "#e60012" },
  ],
  "kuala lumpur": [
    { label: "Touch n Go Card on Klook",    url: "https://www.klook.com/en-US/search/?query=Kuala+Lumpur+Touch+n+Go+card",                                     color: "#e5191b" },
  ],
  dubai: [
    { label: "Nol Card (RTA)",              url: "https://www.rta.ae/wps/portal/rta/ae/public-transport/nol-cards/nol-blue-card",                              color: "#00a550" },
    { label: "Klook",                       url: "https://www.klook.com/en-US/search/?query=Dubai+Nol+transit+card",                                           color: "#e5191b" },
  ],
  sydney: [
    { label: "Opal Card (order online)",    url: "https://www.opal.com.au/",                                                                                   color: "#007dc5" },
  ],
  melbourne: [
    { label: "myki Card",                   url: "https://www.ptv.vic.gov.au/tickets/myki/",                                                                   color: "#e6000b" },
  ],
};

function getCityTransitLinks(city: string) {
  const key = city.toLowerCase();
  for (const [k, links] of Object.entries(CITY_TRANSIT_LINKS)) {
    if (key.includes(k) || k.includes(key)) return links;
  }
  return null;
}

// ─── Transit / car-rental profile ────────────────────────────────────────────

// Cities with meaningful public transit worth booking passes for
const TRANSIT_CITY_KEYS = new Set([
  // Europe
  "london","paris","berlin","amsterdam","rome","barcelona","madrid","vienna",
  "prague","stockholm","copenhagen","dublin","lisbon","athens","istanbul",
  "brussels","zurich","geneva","milan","munich","hamburg","frankfurt",
  "warsaw","budapest","krakow","lyon","marseille","edinburgh","glasgow",
  "porto","seville","valencia","florence","venice","naples","nice",
  "rotterdam","oslo","helsinki","tallinn","riga","vilnius","zagreb","sofia",
  "bucharest","budapest","thessaloniki","bern","basel",
  // Asia
  "tokyo","osaka","kyoto","seoul","beijing","shanghai","guangzhou","shenzhen",
  "hong kong","singapore","bangkok","taipei","kuala lumpur","jakarta",
  "mumbai","delhi","kolkata","bangalore","chennai","hyderabad","pune",
  "dubai","abu dhabi","doha","riyadh","tel aviv","jerusalem","cairo",
  "ho chi minh","hanoi","yangon","phnom penh",
  // Americas with transit
  "new york","chicago","san francisco","washington","boston","philadelphia",
  "seattle","portland","toronto","montreal","vancouver","mexico city",
  "buenos aires","santiago","lima","bogota","rio de janeiro","sao paulo",
  "medellin","quito","havana",
  // Oceania
  "sydney","melbourne","brisbane","auckland","wellington",
  // Africa
  "cairo","cape town","johannesburg","nairobi","casablanca","tunis",
]);

// Rail pass regions — city key fragments mapped to purchasable passes
const RAIL_PASS_REGIONS: { keys: string[]; passes: { label: string; url: string; color: string }[] }[] = [
  {
    keys: ["japan","tokyo","osaka","kyoto","hiroshima","nagoya","fukuoka","sapporo","nara","hakone"],
    passes: [
      { label: "JR Pass", url: "https://www.jrpass.com/", color: "#1a6b3a" },
      { label: "JR Pass on Klook", url: "https://www.klook.com/en-US/search/?query=Japan+JR+Pass+rail", color: "#e5191b" },
    ],
  },
  {
    keys: ["paris","berlin","amsterdam","rome","barcelona","madrid","vienna","prague","milan",
           "europe","eurail","venice","florence","zurich","brussels","lisbon","athens","budapest"],
    passes: [
      { label: "Eurail Pass", url: "https://www.eurail.com/en/eurail-passes", color: "#003d99" },
      { label: "Omio Rail", url: "https://www.omio.com/trains", color: "#1c1f35" },
      { label: "Rail.ninja", url: "https://rail.ninja/", color: "#e63946" },
    ],
  },
  {
    keys: ["london","edinburgh","glasgow","manchester","birmingham","uk","england","scotland","ireland","wales","bristol"],
    passes: [
      { label: "BritRail Pass", url: "https://www.britrail.com/", color: "#c8102e" },
      { label: "Trainline", url: "https://www.thetrainline.com/", color: "#00804a" },
    ],
  },
  {
    keys: ["india","delhi","mumbai","bangalore","chennai","kolkata","hyderabad","jaipur","agra"],
    passes: [
      { label: "IRCTC Rail Booking", url: "https://www.irctc.co.in/", color: "#002855" },
      { label: "India Rail on Klook", url: "https://www.klook.com/en-US/search/?query=India+train+rail", color: "#e5191b" },
    ],
  },
  {
    keys: ["sydney","melbourne","brisbane","perth","adelaide","australia"],
    passes: [
      { label: "NSW TrainLink", url: "https://transportnsw.info/", color: "#009e60" },
      { label: "Great Southern Rail", url: "https://www.greatsouthernrail.com.au/", color: "#c8102e" },
    ],
  },
  {
    keys: ["canada","toronto","montreal","vancouver","quebec"],
    passes: [
      { label: "VIA Rail Canada", url: "https://www.viarail.ca/en", color: "#003087" },
    ],
  },
  {
    keys: ["vietnam","ho chi minh","hanoi","hue","da nang","hoi an"],
    passes: [
      { label: "Vietnam Railway (Baolau)", url: "https://www.baolau.vn/en", color: "#d42b2b" },
      { label: "12Go Asia", url: "https://12go.asia/en/travel/vietnam", color: "#f5a623" },
    ],
  },
];

function getTransitProfile(
  location: string,
  legs: TransportLeg[],
  travelStyle: string,
) {
  const loc = location.toLowerCase();

  // Check known transit cities
  let hasLocalTransit = false;
  for (const key of TRANSIT_CITY_KEYS) {
    if (loc.includes(key) || (key.length > 4 && key.includes(loc.split(",")[0].trim().toLowerCase()))) {
      hasLocalTransit = true;
      break;
    }
  }

  // Multi-stop: trust leg data
  if (legs.length > 0) {
    const hasTransitLegs = legs.some(l => l.type === "bus" || l.type === "subway" || l.type === "train");
    hasLocalTransit = hasLocalTransit || hasTransitLegs;
  }

  // Rail passes
  let railPasses: { label: string; url: string; color: string }[] = [];
  for (const region of RAIL_PASS_REGIONS) {
    if (region.keys.some(k => loc.includes(k))) {
      railPasses = region.passes;
      break;
    }
  }

  // Car rental: needed when city lacks strong transit, or style implies driving
  const isRoadTrip = /road.?trip|driv|car.?rent|self.?drive|highway|scenic.?route/i.test(travelStyle);
  const needsCarRental = !hasLocalTransit || isRoadTrip;

  return { hasLocalTransit, needsCarRental, railPasses };
}

function SubwayPassBox({ city, budget }: { city: string; budget: string }) {
  const [text, setText]       = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{
          role: "user",
          content: `What subway/metro/bus passes are available for tourists in ${city}? List pass names, prices, coverage, and whether they're worth it for a ${budget || "mid-range"} budget traveler. Be concise (under 120 words).`,
        }],
        itinerary: "",
        tripInfo: { location: city, budget, nights: "" },
      }),
    }).then(async res => {
      if (!res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done || cancelled) break;
        acc += dec.decode(value, { stream: true });
        if (!cancelled) setText(acc);
      }
    }).catch(() => setText("Could not load transit info."))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [city, budget]);

  return (
    <div style={{
      background: "linear-gradient(135deg,#eff6ff,#f5f3ff)",
      borderRadius: 12, padding: "14px 16px",
      border: "1.5px solid #c7d2fe",
    }}>
      <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13, color: "#3730a3" }}>
        {String.fromCodePoint(0x1F3AB)} Transit passes &amp; cards &mdash; {city}
      </p>
      {loading && !text ? (
        <Skeleton h={72} />
      ) : (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#475569", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
          {text}
          {loading && <span style={{ animation: "bookTabBlink 0.9s step-end infinite", marginLeft: 2 }}>|</span>}
        </p>
      )}
      {(() => {
        const specific = getCityTransitLinks(city);
        return (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {specific ? (
              specific.map((l, i) => <LinkBtn key={i} href={l.url} label={l.label} color={l.color} />)
            ) : (
              <>
                <LinkBtn href={`https://www.klook.com/en-US/search/?query=${encodeURIComponent(city + " transit pass card")}`} label="Buy on Klook" color="#e5191b" />
                <LinkBtn href={`https://www.viator.com/search/${encodeURIComponent(city + " transit card pass")}`} label="Buy on Viator" color="#23a5cd" />
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Car Rental ───────────────────────────────────────────────────────────────

function CarRentalSection({ location, startDate, endDate }: {
  location: string; startDate: string; endDate: string;
}) {
  const [text, setText]       = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: `Give exactly 2 sentences of practical driving/car-rental advice for tourists in ${location}: mention whether an international driving permit is needed, a standout road or driving route worth knowing, and one local driving quirk. Be very concise.` }],
        itinerary: "",
        tripInfo: { location, budget: "", nights: "" },
      }),
    }).then(async res => {
      if (!res.body) return;
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      while (true) { const { done, value } = await reader.read(); if (done || cancelled) break; acc += dec.decode(value, { stream: true }); if (!cancelled) setText(acc); }
    }).catch(() => setText("")).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [location]);

  const cityEnc = encodeURIComponent(location);
  const dep = startDate; const ret = endDate;
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHeader icon={String.fromCodePoint(0x1F697)} title="Car Rental" />
      <div style={{ background: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: "1.5px solid #bbf7d0" }}>
        {loading && !text ? <Skeleton h={48} /> : (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#166534", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            {text}{loading && <span style={{ animation: "bookTabBlink 0.9s step-end infinite", marginLeft: 2 }}>|</span>}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <LinkBtn href={`https://www.rentalcars.com/en/searchresults/?pickup=${cityEnc}&pickupDate=${dep}&dropoff=${cityEnc}&dropoffDate=${ret}&driversAge=30`} label="RentalCars.com" color="#003580" />
          <LinkBtn href={`https://www.hertz.com/rentacar/reservation/`} label="Hertz" color="#f5a623" />
          <LinkBtn href={`https://www.enterprise.com/en/car-rental.html`} label="Enterprise" color="#007b5e" />
          <LinkBtn href={`https://www.avis.com/en/home`} label="Avis" color="#cc0000" />
          <LinkBtn href={`https://www.autoeurope.com/car-rental/${encodeURIComponent(location.toLowerCase().replace(/\s+/g,"-"))}/`} label="AutoEurope" color="#0033a0" />
          <LinkBtn href={`https://www.kayak.com/cars/${cityEnc}/${dep}/${ret}`} label="Kayak Cars" color="#f76400" />
        </div>
      </div>
    </section>
  );
}

// ─── Airport Transfer ─────────────────────────────────────────────────────────

function AirportTransferSection({ location }: { location: string }) {
  const airport = findAirport(location);
  const airportName = airport ? `${airport.name} (${airport.iata})` : `${location} airport`;
  const cityEnc = encodeURIComponent(location);
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHeader icon={String.fromCodePoint(0x1F690)} title="Airport Transfer" />
      <div style={{ background: "linear-gradient(135deg,#f8fafc,#e0f2fe)", borderRadius: 12, padding: "14px 16px", border: "1.5px solid #bae6fd" }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#0c4a6e", lineHeight: 1.6 }}>
          Pre-book a transfer from {airportName} to skip taxi queues on arrival.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <LinkBtn href={`https://www.klook.com/en-US/search/?query=${cityEnc}+airport+transfer`} label="Klook Transfer" color="#e5191b" />
          <LinkBtn href={`https://www.viator.com/search/${encodeURIComponent(location + " airport transfer")}`} label="Viator Transfer" color="#23a5cd" />
          <LinkBtn href={`https://www.gettransfer.com/en/?from=${cityEnc}+airport&to=${cityEnc}+city+center`} label="GetTransfer" color="#f97316" />
          <LinkBtn href={`https://www.booking.com/taxi/city/${encodeURIComponent(location.toLowerCase().replace(/\s+/g,"-"))}.html`} label="Booking.com Taxi" color="#003580" />
        </div>
      </div>
    </section>
  );
}

// ─── Travel Insurance ─────────────────────────────────────────────────────────

function TravelInsuranceSection({ location, startDate, endDate }: {
  location: string; startDate: string; endDate: string;
}) {
  const destEnc = encodeURIComponent(location);
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHeader icon={String.fromCodePoint(0x1F6E1, 0xFE0F)} title="Travel Insurance" />
      <div style={{ background: "linear-gradient(135deg,#faf5ff,#f5f3ff)", borderRadius: 12, padding: "14px 16px", border: "1.5px solid #ddd6fe" }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#5b21b6", lineHeight: 1.6 }}>
          Covers medical emergencies, trip cancellations, lost luggage, and flight delays. Strongly recommended for international travel.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <LinkBtn href={`https://www.worldnomads.com/travel-insurance/?from=${startDate}&to=${endDate}&destination=${destEnc}`} label="World Nomads" color="#1a6b3a" />
          <LinkBtn href="https://safetywing.com/nomad-insurance/" label="SafetyWing" color="#e85d04" />
          <LinkBtn href="https://www.allianztravelinsurance.com/" label="Allianz" color="#003781" />
          <LinkBtn href={`https://www.insuremytrip.com/?destination=${destEnc}&departDate=${startDate}&returnDate=${endDate}`} label="InsureMyTrip" color="#0070c0" />
          <LinkBtn href={`https://www.squaremouth.com/?destination=${destEnc}&departDate=${startDate}&returnDate=${endDate}`} label="Squaremouth" color="#059669" />
        </div>
      </div>
    </section>
  );
}

// ─── SIM Card / eSIM ─────────────────────────────────────────────────────────

function SimCardSection({ location }: { location: string }) {
  const cityEnc = encodeURIComponent(location);
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHeader icon={String.fromCodePoint(0x1F4F1)} title="SIM Card &amp; eSIM" />
      <div style={{ background: "linear-gradient(135deg,#fff7ed,#fef3c7)", borderRadius: 12, padding: "14px 16px", border: "1.5px solid #fed7aa" }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#7c2d12", lineHeight: 1.6 }}>
          Stay connected without roaming fees. eSIMs install instantly on your phone — no physical swap needed. Buy before you land.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <LinkBtn href="https://www.airalo.com/" label="Airalo eSIM" color="#6d28d9" />
          <LinkBtn href="https://www.getnomad.app/" label="Nomad eSIM" color="#0ea5e9" />
          <LinkBtn href={`https://www.klook.com/en-US/search/?query=${cityEnc}+SIM+card+tourist`} label="Klook SIM" color="#e5191b" />
          <LinkBtn href="https://www.simify.com/" label="Simify" color="#059669" />
          <LinkBtn href="https://esimdb.com/" label="eSIM DB (compare)" color="#374151" />
        </div>
      </div>
    </section>
  );
}

// ─── Local Transit Section ────────────────────────────────────────────────────

function LocalTransitSection({ legs, cities, budget, startDate, railPasses }: {
  legs: TransportLeg[];
  cities: string[];
  budget: string;
  startDate: string;
  railPasses: { label: string; url: string; color: string }[];
}) {
  const busSubwayLegs = legs.filter(l => l.type === "bus" || l.type === "subway");
  function parseLegDate(raw: string) {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return { iso: `${yyyy}-${mm}-${dd}`, flix: `${dd}.${mm}.${yyyy}` };
  }
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionHeader icon={String.fromCodePoint(0x1F68C)} title="Bus &amp; Subway" />

      {busSubwayLegs.length > 0 ? (
        <div style={{ marginBottom: 22 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13, color: "#1e293b" }}>
            Bus &amp; subway connections on your route
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
            {busSubwayLegs.map((leg, i) => {
              const isBus = leg.type === "bus";
              const fromEnc = encodeURIComponent(leg.from);
              const toEnc   = encodeURIComponent(leg.to);
              const legDate = leg.departureDate ? parseLegDate(leg.departureDate) : null;
              const isoDate  = legDate?.iso  ?? startDate;
              return (
                <div key={i} style={{
                  background: "#fff", borderRadius: 14, padding: "14px 16px",
                  border: `1.5px solid ${TRANSPORT_COLORS[leg.type] ?? "#e2e8f0"}44`,
                  boxShadow: "0 2px 8px #0001",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>{isBus ? String.fromCodePoint(0x1F68C) : String.fromCodePoint(0x1F687)}</span>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>
                        {leg.from} {String.fromCodePoint(0x2192)} {leg.to}
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: "#64748b" }}>
                        {leg.duration}{leg.departureDate ? ` \u00B7 ${leg.departureDate}` : ""}
                      </span>
                    </div>
                  </div>
                  {leg.notes && <p style={{ margin: "0 0 10px", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{leg.notes}</p>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {isBus && (
                      <>
                        <LinkBtn href={`https://www.flixbus.com/bus/${encodeURIComponent((leg.from).toLowerCase().replace(/\s+/g, "-"))}-${encodeURIComponent((leg.to).toLowerCase().replace(/\s+/g, "-"))}`} label="FlixBus" color="#73d700" />
                        <LinkBtn href={`https://www.omio.com/results?origin=${fromEnc}&destination=${toEnc}${isoDate ? `&outboundDate=${isoDate}` : ""}&adults=1`} label="Omio" color="#1c1f35" />
                        <LinkBtn href={`https://www.busbud.com/en/results?from=${encodeURIComponent((leg.from).toLowerCase().replace(/\s+/g, "-"))}&to=${encodeURIComponent((leg.to).toLowerCase().replace(/\s+/g, "-"))}${isoDate ? `&outbound_date=${isoDate}` : ""}&adult=1`} label="Busbud" color="#e74c3c" />
                      </>
                    )}
                    <LinkBtn href={`https://www.rome2rio.com/s/${fromEnc}/${toEnc}`} label="Rome2rio" color="#f64c16" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{
          background: "#eff6ff", borderRadius: 12, padding: "14px 16px", marginBottom: 20,
          border: "1px solid #bfdbfe",
        }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#1e40af" }}>
            No inter-city bus or subway legs on this route &mdash; see local transit options below.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(() => {
              const city = cities[0] ?? "";
              const citySlug = encodeURIComponent(city.toLowerCase().replace(/\s+/g, "-"));
              const cityEnc  = encodeURIComponent(city);
              return (
                <>
                  <LinkBtn href={`https://www.flixbus.com/bus-stops/${citySlug}`} label="FlixBus" color="#73d700" />
                  <LinkBtn href={`https://www.omio.com/results?destination=${cityEnc}${startDate ? `&outboundDate=${startDate}` : ""}&adults=1`} label="Omio" color="#1c1f35" />
                  <LinkBtn href={`https://www.rome2rio.com/s/${cityEnc}`} label="Rome2rio" color="#f64c16" />
                  <LinkBtn href={`https://www.busbud.com/en/results?to=${citySlug}${startDate ? `&outbound_date=${startDate}` : ""}&adult=1`} label="Busbud" color="#e74c3c" />
                </>
              );
            })()}
          </div>
        </div>
      )}

      <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13, color: "#1e293b" }}>
        {String.fromCodePoint(0x1F687)} City transit passes
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 14 }}>
        {cities.map((city, i) => (
          <SubwayPassBox key={i} city={city} budget={budget} />
        ))}
      </div>

      {railPasses.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13, color: "#1e293b" }}>
            {String.fromCodePoint(0x1F686)} Rail passes for this destination
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {railPasses.map((p, i) => <LinkBtn key={i} href={p.url} label={p.label} color={p.color} />)}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Main BookTab component ───────────────────────────────────────────────────

export default function BookTab({
  location,
  purpose,
  style: travelStyle,
  budget,
  interests,
  startDate,
  endDate,
  nights,
  stops: stopsRaw = "",
  travelingFrom: travelingFromProp = "",
  fullItinerary: fullItineraryProp,
}: BookTabProps) {
  const today = new Date().toISOString().split("T")[0];

  const [fromAirport,  setFromAirport]  = useState(() => airportLabel(travelingFromProp));
  const [geoStatus,    setGeoStatus]    = useState<"idle" | "loading" | "done" | "denied">("idle");
  const [toAirport,    setToAirport]    = useState(() => {
    const f = findAirport(location);
    return f ? `${f.name} (${f.iata})` : location;
  });
  const [tripStartDate, setTripStartDate] = useState(startDate);
  const [tripEndDate,   setTripEndDate]   = useState(endDate);

  // Auto-detect origin airport from geolocation if not already set
  useEffect(() => {
    if (fromAirport || !navigator.geolocation) return;
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { longitude, latitude } = pos.coords;
          const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${key}`
          );
          const data = await res.json() as { status: string; results?: Array<{ address_components: Array<{ long_name: string; types: string[] }>; formatted_address: string }> };
          const comps = data.results?.[0]?.address_components;
          const city = comps?.find(c => c.types.includes('locality'))?.long_name
            ?? data.results?.[0]?.formatted_address?.split(',')[0]?.trim();
          if (city) {
            const airport = findAirport(city);
            setFromAirport(airport ? `${airport.name} (${airport.iata})` : city);
            setGeoStatus("done");
          } else setGeoStatus("idle");
        } catch { setGeoStatus("idle"); }
      },
      () => setGeoStatus("denied"),
      { timeout: 8000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const originIata = useMemo(() => extractIata(fromAirport), [fromAirport]);
  // destIata available if needed: extractIata(toAirport)

  const tripNights = useMemo(() => {
    if (!tripStartDate || !tripEndDate) return null;
    const diff = (new Date(tripEndDate).getTime() - new Date(tripStartDate).getTime()) / 86400000;
    return diff > 0 ? Math.round(diff) : null;
  }, [tripStartDate, tripEndDate]);

  const datesChanged = tripStartDate !== startDate || tripEndDate !== endDate;
  const [showDateWarning, setShowDateWarning] = useState(false);
  const [pendingStart, setPendingStart] = useState("");
  const [pendingEnd,   setPendingEnd]   = useState("");

  function handleDateChange(field: "start" | "end", val: string) {
    const newStart = field === "start" ? val : tripStartDate;
    const newEnd   = field === "end"   ? val : tripEndDate;
    if (field === "start") setTripStartDate(val);
    else setTripEndDate(val);
    if (newStart !== startDate || newEnd !== endDate) {
      setPendingStart(newStart);
      setPendingEnd(newEnd);
      setShowDateWarning(true);
    }
  }

  const extraStops: RouteStop[] = useMemo(() => {
    try { return stopsRaw ? JSON.parse(stopsRaw) : []; } catch { return []; }
  }, [stopsRaw]);

  const allStops: RouteStop[] = useMemo(() => [
    { city: location, startDate, endDate },
    ...extraStops,
  ], [location, startDate, endDate, extraStops]);

  const isMultiStop = extraStops.length > 0;

  // Compute transit profile once legs are loaded (legs starts empty for single-stop)
  const [legs, setLegs]           = useState<TransportLeg[]>([]);
  const [legsLoading, setLegsLoading] = useState(isMultiStop);

  const transitProfile = useMemo(
    () => getTransitProfile(location, legs, travelStyle),
    [location, legs, travelStyle],
  );

  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [recsLoading, setRecsLoading]         = useState(true);
  const [recsError, setRecsError]             = useState("");

  useEffect(() => {
    // Use provided fullItinerary prop, or fall back to sessionStorage
    const itinerary = fullItineraryProp
      ?? (typeof window !== "undefined" ? sessionStorage.getItem("geknee_itinerary") ?? "" : "");
    fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, purpose, style: travelStyle, budget, interests, startDate, endDate, nights, itinerary }),
    })
      .then(r => r.json())
      .then((d: Recommendations & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setRecommendations(d);
      })
      .catch(e => setRecsError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setRecsLoading(false));
  }, [location, purpose, travelStyle, budget, interests, startDate, endDate, nights, fullItineraryProp]);

  useEffect(() => {
    if (!isMultiStop) return;
    fetch("/api/transport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stops: allStops }),
    })
      .then(r => r.json())
      .then((d: { legs?: TransportLeg[] }) => setLegs(d.legs ?? []))
      .catch(() => {})
      .finally(() => setLegsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiStop, JSON.stringify(allStops)]);

  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @keyframes bookTabShimmer   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes bookTabImgFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes bookTabBlink     { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes bookTabSpin      { to { transform: translateY(-50%) rotate(360deg); } }
        .bt-input {
          background: #fff;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          color: #1e293b;
          font-size: 14px;
          padding: 11px 14px;
          width: 100%;
          outline: none;
          box-sizing: border-box;
          font-family: inherit;
          transition: border-color 0.15s;
        }
        .bt-input:focus { border-color: #818cf8; }
        .bt-input::placeholder { color: #94a3b8; }
        .bt-label {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 8px;
          display: block;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
      `}</style>

      {/* ── Trip Setup panel ── */}
      <div style={{ background: "linear-gradient(135deg,#f8fafc 0%,#ede9fe 100%)", borderRadius: 16, marginBottom: 28, border: "1px solid #e2e8f0" }}>
        <div style={{ padding: "16px 18px 14px" }}>
          <p style={{ margin: "0 0 2px", fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>Trip Setup</p>
          <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Plan your trip</h2>

          {/* Traveling from */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="bt-label" style={{ margin: 0 }}>Traveling from</span>
              {(travelingFromProp || geoStatus === "done") && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.3)", borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 600, color: "#6366f1" }}>
                  {String.fromCodePoint(0x1F4CD)} {findAirport(travelingFromProp || fromAirport)?.city ?? travelingFromProp}
                </span>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input className="bt-input" value={fromAirport}
                onChange={e => setFromAirport(e.target.value)}
                placeholder={geoStatus === "loading" ? "Detecting your location\u2026" : "Departure airport\u2026"}
                style={{ paddingRight: (fromAirport || geoStatus === "loading") ? 40 : undefined }} />
              {geoStatus === "loading" && (
                <span style={{ position: "absolute", right: 12, top: "50%", width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(99,102,241,0.25)", borderTopColor: "#6366f1", animation: "bookTabSpin 0.8s linear infinite", display: "inline-block" }} />
              )}
              {fromAirport && geoStatus !== "loading" && (
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}>{String.fromCodePoint(0x2708, 0xFE0F)}</span>
              )}
            </div>
            {fromAirport && <p style={{ fontSize: 11, color: "#94a3b8", margin: "5px 0 0" }}>Nearest commercial airport &mdash; edit if needed</p>}
            {geoStatus === "denied" && !fromAirport && <p style={{ fontSize: 11, color: "#ef4444", margin: "5px 0 0" }}>Location access denied &mdash; type your departure airport above</p>}
          </div>

          {/* Traveling to */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="bt-label" style={{ margin: 0 }}>Traveling to</span>
              {location && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.3)", borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 600, color: "#6366f1" }}>
                  {String.fromCodePoint(0x1F4CD)} {location}
                </span>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input className="bt-input" value={toAirport} onChange={e => setToAirport(e.target.value)} placeholder="Arrival airport\u2026" style={{ paddingRight: toAirport ? 40 : undefined }} />
              {toAirport && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}>{String.fromCodePoint(0x2708, 0xFE0F)}</span>}
            </div>
            {toAirport && (() => {
              const resolved = findAirport(location);
              const isLandmark = resolved && resolved.city.toLowerCase() !== location.toLowerCase()
                && !location.toLowerCase().includes(resolved.city.toLowerCase());
              return (
                <p style={{ fontSize: 11, color: "#94a3b8", margin: "5px 0 0" }}>
                  {isLandmark
                    ? `Nearest commercial airport to ${location} (${resolved.city}) — edit if needed`
                    : 'Nearest commercial airport — edit if needed'}
                </p>
              );
            })()}
          </div>

          {/* Travel dates */}
          <div>
            <p className="bt-label">Travel dates</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 5 }}>Departure</label>
                <input type="date" className="bt-input" min={today} value={tripStartDate}
                  onChange={e => handleDateChange("start", e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 5 }}>Return</label>
                <input type="date" className="bt-input" min={tripStartDate || today} value={tripEndDate}
                  onChange={e => handleDateChange("end", e.target.value)} />
              </div>
            </div>
            {tripNights !== null && (
              <p style={{ color: "#6366f1", fontSize: 12, textAlign: "center", margin: "10px 0 0", fontWeight: 600 }}>
                {tripNights} night{tripNights !== 1 ? "s" : ""}{location ? ` in ${location}` : ""}
                {datesChanged && <span style={{ color: "#f59e0b", marginLeft: 8 }}>(changed from original)</span>}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Date-change warning modal ── */}
      {showDateWarning && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#0f172a", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 20, padding: "32px 28px", maxWidth: 440, width: "90%", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>{String.fromCodePoint(0x26A0, 0xFE0F)}</div>
            <h3 style={{ color: "#fbbf24", fontSize: 18, fontWeight: 800, textAlign: "center", margin: "0 0 10px" }}>Dates Changed</h3>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, textAlign: "center", lineHeight: 1.6, margin: "0 0 8px" }}>
              You changed your trip dates to <strong style={{ color: "#fff" }}>{pendingStart} &rarr; {pendingEnd}</strong>.
            </p>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center", lineHeight: 1.6, margin: "0 0 24px" }}>
              To re-generate your itinerary with the new dates, go back to the Itinerary tab to adjust your trip dates.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowDateWarning(false)}
                style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", fontSize: 14, cursor: "pointer", fontWeight: 600 }}
              >
                Keep itinerary
              </button>
              <button
                onClick={() => setShowDateWarning(false)}
                style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#f59e0b,#f97316)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1720, margin: "0 auto" }}>
        {recsError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 16, marginBottom: 24, color: "#991b1b", fontSize: 13 }}>
            {String.fromCodePoint(0x26A0)} {recsError}
          </div>
        )}

        {/* 3D Route Visualizer (multi-stop only) */}
        {isMultiStop && (
          <section style={{ marginBottom: 40 }}>
            <SectionHeader icon={String.fromCodePoint(0x1F5FA, 0xFE0F)} title="Your Route" loading={legsLoading} />
            {legsLoading ? (
              <Skeleton h={280} />
            ) : (
              <>
                <RouteVisualizer stops={allStops} legs={legs} />
                {legs.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12, marginTop: 14 }}>
                    {legs.map((l, i) => <LegCard key={i} leg={l} />)}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Flights (one per stop when multi-stop) */}
        {allStops.map((stop, i) => (
          <FlightSection key={i} location={stop.city} startDate={stop.startDate ?? tripStartDate} endDate={stop.endDate ?? tripEndDate} travelingFrom={originIata} />
        ))}

        {/* Bus & Subway / transit passes — only for transit-friendly destinations */}
        {transitProfile.hasLocalTransit && (
          <LocalTransitSection
            legs={legs}
            cities={allStops.map(s => s.city)}
            budget={budget}
            startDate={startDate}
            railPasses={transitProfile.railPasses}
          />
        )}

        {/* Car Rental — for car-dependent destinations or road-trip styles */}
        {transitProfile.needsCarRental && (
          <CarRentalSection
            location={location}
            startDate={tripStartDate}
            endDate={tripEndDate}
          />
        )}

        {/* Hotels */}
        <section style={{ marginBottom: 28 }}>
          <SectionHeader icon={String.fromCodePoint(0x1F3E8)} title="Hotels" loading={recsLoading} count={!recsLoading ? recommendations?.hotels.length : undefined} />
          {recsLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              <Skeleton h={420} /><Skeleton h={420} /><Skeleton h={420} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              {(recommendations?.hotels ?? []).map((h, i) => (
                <HotelCard key={i} hotel={h} location={location} checkIn={startDate} checkOut={endDate} />
              ))}
            </div>
          )}
        </section>

        {/* Restaurants */}
        <section style={{ marginBottom: 28 }}>
          <SectionHeader icon={String.fromCodePoint(0x1F37D, 0xFE0F)} title="Restaurants" loading={recsLoading} count={!recsLoading ? recommendations?.restaurants.length : undefined} />
          {recsLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              <Skeleton h={340} /><Skeleton h={340} /><Skeleton h={340} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              {(recommendations?.restaurants ?? []).map((r, i) => (
                <RestaurantCard key={i} restaurant={r} location={location} startDate={startDate} />
              ))}
            </div>
          )}
        </section>

        {/* Activities */}
        <section style={{ marginBottom: 28 }}>
          <SectionHeader icon={String.fromCodePoint(0x1F3AF)} title="Activities &amp; Experiences" loading={recsLoading} count={!recsLoading ? recommendations?.activities.length : undefined} />
          {recsLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              <Skeleton h={340} /><Skeleton h={340} /><Skeleton h={340} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              {(recommendations?.activities ?? []).map((a, i) => (
                <ActivityCard key={i} activity={a} location={location} startDate={startDate} endDate={endDate} />
              ))}
            </div>
          )}
        </section>

        {/* Airport Transfer */}
        <AirportTransferSection location={location} />

        {/* Travel Insurance */}
        <TravelInsuranceSection location={location} startDate={tripStartDate} endDate={tripEndDate} />

        {/* SIM Card / eSIM */}
        <SimCardSection location={location} />
      </div>
    </div>
  );
}
