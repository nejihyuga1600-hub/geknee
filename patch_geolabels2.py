with open(r'app\plan\location\page.tsx', 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. Add useThree import (needed inside GeoLabels/CityLabels for camera dist) ─
# Actually we'll track zoom in GlobeScene's useFrame and pass as prop.
# Add useThree to R3F imports so GeoLabels/CityLabels children can use it.
src = src.replace(
    'import { Canvas, useFrame } from "@react-three/fiber";',
    'import { Canvas, useFrame, useThree } from "@react-three/fiber";'
)

# ── 2. Add zoomLevel state + tracking to GlobeScene ────────────────────────────
old_states = (
    '  // ── Separate state for each async input so any update rebuilds the texture ─\n'
    '  const [countries,     setCountries]     = useState<GeoCollection | null>(null);\n'
    '  const [states,        setStates]        = useState<GeoCollection | null>(null);\n'
    '  const [terrainBitmap, setTerrainBitmap] = useState<ImageBitmap   | null>(null);\n'
    '  const [bumpMap,       setBumpMap]       = useState<THREE.Texture  | null>(null);\n'
    '  const [texture,       setTexture]       = useState<THREE.CanvasTexture | null>(null);'
)
new_states = (
    '  // ── Separate state for each async input so any update rebuilds the texture ─\n'
    '  const [countries,     setCountries]     = useState<GeoCollection | null>(null);\n'
    '  const [states,        setStates]        = useState<GeoCollection | null>(null);\n'
    '  const [terrainBitmap, setTerrainBitmap] = useState<ImageBitmap   | null>(null);\n'
    '  const [bumpMap,       setBumpMap]       = useState<THREE.Texture  | null>(null);\n'
    '  const [texture,       setTexture]       = useState<THREE.CanvasTexture | null>(null);\n'
    '  // 0 = countries only | 1 = + states | 2 = + cities\n'
    '  const [zoomLevel, setZoomLevel] = useState(0);\n'
    '  const zoomLevelRef = useRef(0);'
)
src = src.replace(old_states, new_states, 1)

# ── 3. Add zoom tracking inside the existing useFrame ──────────────────────────
old_useframe_end = (
    '    } else {\n'
    '      rotYRef.current += delta * EARTH_ROT;\n'
    '      globeRef.current.rotation.y = rotYRef.current;\n'
    '    }\n'
    '  });'
)
new_useframe_end = (
    '    } else {\n'
    '      rotYRef.current += delta * EARTH_ROT;\n'
    '      globeRef.current.rotation.y = rotYRef.current;\n'
    '    }\n'
    '    // Update zoom level only when crossing thresholds (avoids per-frame setState)\n'
    '    const dist = camera.position.length();\n'
    '    const newZoom = dist < 14 ? 2 : dist < 21 ? 1 : 0;\n'
    '    if (newZoom !== zoomLevelRef.current) {\n'
    '      zoomLevelRef.current = newZoom;\n'
    '      setZoomLevel(newZoom);\n'
    '    }\n'
    '  });'
)
src = src.replace(old_useframe_end, new_useframe_end, 1)

# Fix useFrame signature to expose camera
src = src.replace(
    '  useFrame((_, delta) => {\n    if (!globeRef.current) return;',
    '  useFrame(({ camera }, delta) => {\n    if (!globeRef.current) return;',
    1
)

# ── 4. Pass zoomLevel to label components ──────────────────────────────────────
src = src.replace(
    '        <GeoLabels countries={countries} states={states} />\n'
    '        <CityLabels />',
    '        <GeoLabels countries={countries} states={states} zoomLevel={zoomLevel} />\n'
    '        <CityLabels visible={zoomLevel >= 2} />'
)

# ── 5. Update GeoLabels signature + filter by zoomLevel ────────────────────────
old_geolabels_sig = (
    'function GeoLabels({ countries, states }: {\n'
    '  countries: GeoCollection | null;\n'
    '  states:    GeoCollection | null;\n'
    '})'
)
new_geolabels_sig = (
    'function GeoLabels({ countries, states, zoomLevel }: {\n'
    '  countries:  GeoCollection | null;\n'
    '  states:     GeoCollection | null;\n'
    '  zoomLevel:  number;\n'
    '})'
)
src = src.replace(old_geolabels_sig, new_geolabels_sig, 1)

# Filter state labels by zoomLevel inside the items useMemo
old_state_push = (
    '        result.push({ key: `s-${admin}-${name}`, name, pos: geoPos(c[1], c[0], R * 1.019), kind: "state" });\n'
    '      }\n'
    '    }\n'
    '    return result;\n'
    '  }, [countries, states]);'
)
new_state_push = (
    '        result.push({ key: `s-${admin}-${name}`, name, pos: geoPos(c[1], c[0], R * 1.019), kind: "state" });\n'
    '      }\n'
    '    }\n'
    '    return result;\n'
    '  }, [countries, states]);\n\n'
    '  const visible = items.filter(it => it.kind === "country" || zoomLevel >= 1);'
)
src = src.replace(old_state_push, new_state_push, 1)

# Make GeoLabels render `visible` instead of `items`
src = src.replace(
    '      {items.map(({ key, name, pos, kind }) => (',
    '      {visible.map(({ key, name, pos, kind }) => (',
    1
)

# ── 6. Update CityLabels to accept visible prop ─────────────────────────────────
src = src.replace(
    'function CityLabels() {\n  return (',
    'function CityLabels({ visible }: { visible: boolean }) {\n  if (!visible) return null;\n  return ('
)

# ── 7. Reduce font sizes ────────────────────────────────────────────────────────
# Country: 11 -> 8
src = src.replace(
    'fontSize: kind === "country" ? 11 : 8,',
    'fontSize: kind === "country" ? 8 : 6,'
)
# City: 7 -> 5
src = src.replace(
    '            fontSize: 7,\n            fontWeight: 400,\n            color: "rgba(255,235,160,0.85)"',
    '            fontSize: 5,\n            fontWeight: 400,\n            color: "rgba(255,235,160,0.85)"'
)

with open(r'app\plan\location\page.tsx', 'w', encoding='utf-8') as f:
    f.write(src)
print("Done")
