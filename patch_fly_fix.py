with open(r'app\plan\location\page.tsx', 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. Replace simple-rotation GlobeScene useFrame + refs with quaternion version ─

old_refs = (
    '  const globeRef = useRef<THREE.Group>(null);\n'
    '  const rotYRef  = useRef(0);\n'
    '  const animRef  = useRef<{\n'
    '    startY: number; targetY: number; elapsed: number; onDone: () => void;\n'
    '  } | null>(null);'
)
new_refs = (
    '  const globeRef  = useRef<THREE.Group>(null);\n'
    '  const currentQ  = useRef(new THREE.Quaternion());\n'
    '  const animRef   = useRef<{\n'
    '    startQ: THREE.Quaternion; targetQ: THREE.Quaternion;\n'
    '    startT: number; onDone: () => void;\n'
    '  } | null>(null);'
)
src = src.replace(old_refs, new_refs, 1)

# ── 2. Replace the simple useFrame body with quaternion version ─────────────────
old_useframe = (
    '  // Real-world rotation: Earth completes one revolution in 86164 s (sidereal day)\n'
    '  const EARTH_ROT = (2 * Math.PI) / 86164;\n'
    '\n'
    '  useFrame(({ camera }, delta) => {\n'
    '    if (!globeRef.current) return;\n'
    '\n'
    '    const pending = consumeGlobeTarget();\n'
    '    if (pending && !animRef.current) {\n'
    '      animRef.current = {\n'
    '        startY: rotYRef.current,\n'
    '        targetY: -pending.lon * (Math.PI / 180),\n'
    '        elapsed: 0,\n'
    '        onDone: pending.onDone,\n'
    '      };\n'
    '    }\n'
    '\n'
    '    if (animRef.current) {\n'
    '      animRef.current.elapsed += delta;\n'
    '      const duration = 2.2;\n'
    '      const t = Math.min(animRef.current.elapsed / duration, 1);\n'
    '      const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;\n'
    '      rotYRef.current = animRef.current.startY + (animRef.current.targetY - animRef.current.startY) * ease;\n'
    '      globeRef.current.rotation.y = rotYRef.current;\n'
    '      if (t >= 1) { animRef.current.onDone(); animRef.current = null; }\n'
    '    } else {\n'
    '      rotYRef.current += delta * EARTH_ROT;\n'
    '      globeRef.current.rotation.y = rotYRef.current;\n'
    '    }'
)
new_useframe = (
    '  // Real-world rotation speed: one revolution per sidereal day\n'
    '  const EARTH_ROT = (2 * Math.PI) / 86164;\n'
    '  // Reusable objects — allocated once outside useFrame to avoid per-frame GC\n'
    '  const _yAxis  = useRef(new THREE.Vector3(0, 1, 0)).current;\n'
    '  const _deltaQ = useRef(new THREE.Quaternion()).current;\n'
    '\n'
    '  useFrame(({ clock, camera }, delta) => {\n'
    '    if (!globeRef.current) return;\n'
    '\n'
    '    const pending = consumeGlobeTarget();\n'
    '    if (pending && !animRef.current) {\n'
    '      // Build target quaternion: rotate globe so (lat,lon) faces the camera (+Z)\n'
    '      const phi = (pending.lat * Math.PI) / 180;\n'
    '      const lam = (pending.lon * Math.PI) / 180;\n'
    '      const nx =  Math.cos(phi) * Math.cos(lam);\n'
    '      const ny =  Math.sin(phi);\n'
    '      const nz = -Math.cos(phi) * Math.sin(lam);\n'
    '      const targetQ = new THREE.Quaternion().setFromUnitVectors(\n'
    '        new THREE.Vector3(nx, ny, nz),\n'
    '        new THREE.Vector3(0, 0, 1),\n'
    '      );\n'
    '      animRef.current = {\n'
    '        startQ: currentQ.current.clone(),\n'
    '        targetQ,\n'
    '        startT: clock.getElapsedTime(),\n'
    '        onDone: pending.onDone,\n'
    '      };\n'
    '    }\n'
    '\n'
    '    if (animRef.current) {\n'
    '      const elapsed = clock.getElapsedTime() - animRef.current.startT;\n'
    '      const duration = 2.2;\n'
    '      const t = Math.min(elapsed / duration, 1);\n'
    '      const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;\n'
    '      currentQ.current.slerpQuaternions(animRef.current.startQ, animRef.current.targetQ, ease);\n'
    '      globeRef.current.quaternion.copy(currentQ.current);\n'
    '      if (t >= 1) { animRef.current.onDone(); animRef.current = null; }\n'
    '    } else {\n'
    '      // Continuous auto-rotation around world Y axis\n'
    '      _deltaQ.setFromAxisAngle(_yAxis, delta * EARTH_ROT);\n'
    '      currentQ.current.premultiply(_deltaQ);\n'
    '      globeRef.current.quaternion.copy(currentQ.current);\n'
    '    }'
)
src = src.replace(old_useframe, new_useframe, 1)

# ── 3. Add CameraZoomHandler component (before GlobeScene) ──────────────────────
zoom_handler = '''
// ─── Camera zoom handler (inside Canvas) ─────────────────────────────────────
function CameraZoomHandler() {
  const { camera } = useThree();
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
    camera.position.setLength(dist);
    if (t >= 1) { animRef.current.onDone?.(); animRef.current = null; }
  });

  return null;
}

'''
src = src.replace('function GlobeScene()', zoom_handler + 'function GlobeScene()', 1)

# ── 4. Add CameraZoomHandler inside the Canvas ───────────────────────────────
src = src.replace(
    '  <GlobeScene />\n</Canvas>',
    '  <GlobeScene />\n  <CameraZoomHandler />\n</Canvas>',
    1
)

with open(r'app\plan\location\page.tsx', 'w', encoding='utf-8') as f:
    f.write(src)
print("Done. Lines:", src.count('\n'))
