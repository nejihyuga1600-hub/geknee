#!/usr/bin/env python3
"""Adds animated ocean/land animal components, AllAnimals(), and 200+ new Lm landmark blocks."""

with open('app/plan/location/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# ─── Animal components + AllAnimals + new Lm entries  ─────────────────────────
# Inject animal components just before "// All 30 landmarks" comment
ANIMALS_ANCHOR = '// All 30 landmarks — local Y is always "outward" from the sphere surface'

ANIMALS_CODE = '''\
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
    </>
  );
}

// All 30 landmarks — local Y is always "outward" from the sphere surface'''

if ANIMALS_ANCHOR in content:
    content = content.replace(ANIMALS_ANCHOR, ANIMALS_CODE, 1)
    print('Animal components + AllAnimals injected OK')
else:
    print('ANIMALS_ANCHOR not found!')

with open('app/plan/location/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Animals step done')
