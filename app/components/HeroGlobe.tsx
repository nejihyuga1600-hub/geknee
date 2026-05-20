"use client";
// Decorative cartoon globe for the marketing landing hero. Deliberately
// lighter than PublicGlobe — no monuments, no city map, no interaction —
// so the home page first-paint stays snappy. The planner is where the
// heavy globe lives; this is a teaser.

import { Canvas } from "@react-three/fiber";
import { Stars, Sphere, OrbitControls } from "@react-three/drei";

export default function HeroGlobe() {
  return (
    <Canvas
      style={{
        width: "100%",
        height: "100%",
        // Marketing surface — never intercept clicks or scroll. The CTA
        // sits to the left of the globe and any tap should land there.
        pointerEvents: "none",
      }}
      camera={{ position: [0, 0, 22], fov: 45 }}
      // Cap dpr for marketing surface — full 2x is wasteful here.
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "default" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 6, 10]} intensity={0.95} />
      <directionalLight position={[-6, -4, -8]} intensity={0.25} color="#ffd9a8" />

      <Stars radius={120} depth={50} count={2200} factor={3.5} saturation={0} fade speed={0.25} />

      {/* Cartoon planet — same blue family as the planner's atmosphere
          but slightly warmer to read as "marketing" not "product chrome". */}
      <Sphere args={[8, 96, 96]}>
        <meshStandardMaterial color="#3a7bd5" roughness={0.65} metalness={0.08} emissive="#0c1d44" emissiveIntensity={0.18} />
      </Sphere>

      {/* OrbitControls only for the auto-rotate; all input disabled because
          pointer-events:none on the canvas would block them anyway. */}
      <OrbitControls
        makeDefault
        enableZoom={false}
        enablePan={false}
        enableRotate={false}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </Canvas>
  );
}
