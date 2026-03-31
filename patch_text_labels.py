with open(r'app\plan\location\page.tsx', 'r', encoding='utf-8') as f:
    src = f.read()

# 1. Add Text to drei imports
src = src.replace(
    'import { OrbitControls, Sphere, Stars, Html, useGLTF } from "@react-three/drei";',
    'import { OrbitControls, Sphere, Stars, Html, useGLTF, Text } from "@react-three/drei";'
)

# 2. Add computeOrientation helper before GeoLabels
orient_helper = '''
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

'''
src = src.replace(
    '// --- Country + State labels ---',
    orient_helper + '// --- Country + State labels ---'
)

# 3. Add orientation field to items result type
src = src.replace(
    '    const result: Array<{\n'
    '      key: string; name: string; pos: [number, number, number]; kind: "country" | "state";\n'
    '    }> = [];',
    '    const result: Array<{\n'
    '      key: string; name: string; pos: [number, number, number];\n'
    '      kind: "country" | "state"; orientation: THREE.Quaternion;\n'
    '    }> = [];'
)

# 4. Include orientation in country push
src = src.replace(
    '        result.push({ key: `c-${name}`, name, pos: geoPos(c[1], c[0], R * 1.019), kind: "country" });',
    '        const cPos = geoPos(c[1], c[0], R * 1.019);\n'
    '        result.push({ key: `c-${name}`, name, pos: cPos, kind: "country", orientation: computeOrientation(cPos) });'
)

# 5. Include orientation in state push
src = src.replace(
    '        result.push({ key: `s-${admin}-${name}`, name, pos: geoPos(c[1], c[0], R * 1.019), kind: "state" });',
    '        const sPos = geoPos(c[1], c[0], R * 1.019);\n'
    '        result.push({ key: `s-${admin}-${name}`, name, pos: sPos, kind: "state", orientation: computeOrientation(sPos) });'
)

# 6. Replace the entire GeoLabels return (Html -> Text)
old_geolabels_return = (
    '  return (\n'
    '    <>\n'
    '      {visible.map(({ key, name, pos, kind }) => (\n'
    '        <Html\n'
    '          key={key}\n'
    '          position={pos}\n'
    '          center\n'
    '          distanceFactor={kind === "country" ? 24 : 18}\n'
    '          style={{ pointerEvents: "none", userSelect: "none" }}\n'
    '          zIndexRange={[0, 0]}\n'
    '        >\n'
    '          <span style={{\n'
    '            display: "block",\n'
    '            fontSize: kind === "country" ? 8 : 6,\n'
    '            fontWeight: kind === "country" ? 700 : 500,\n'
    '            color: kind === "country" ? "rgba(255,255,255,0.92)" : "rgba(200,220,255,0.75)",\n'
    '            textShadow: "0 0 4px rgba(0,0,0,1), 0 1px 3px rgba(0,0,0,0.9)",\n'
    '            letterSpacing: kind === "country" ? "0.08em" : "0.04em",\n'
    '            textTransform: kind === "country" ? "uppercase" : "none",\n'
    '            fontFamily: "system-ui,-apple-system,sans-serif",\n'
    '            lineHeight: "1",\n'
    '            whiteSpace: "nowrap",\n'
    '          }}>\n'
    '            {name}\n'
    '          </span>\n'
    '        </Html>\n'
    '      ))}\n'
    '    </>\n'
    '  );\n'
    '}'
)
new_geolabels_return = (
    '  return (\n'
    '    <>\n'
    '      {visible.map(({ key, name, pos, kind, orientation }) => (\n'
    '        <Text\n'
    '          key={key}\n'
    '          position={pos}\n'
    '          quaternion={orientation}\n'
    '          fontSize={kind === "country" ? 0.18 : 0.12}\n'
    '          color={kind === "country" ? "#ffffff" : "#b8ccff"}\n'
    '          outlineWidth={kind === "country" ? 0.012 : 0.008}\n'
    '          outlineColor="#000000"\n'
    '          anchorX="center"\n'
    '          anchorY="middle"\n'
    '          letterSpacing={kind === "country" ? 0.06 : 0.02}\n'
    '          material-side={THREE.FrontSide}\n'
    '          material-depthTest\n'
    '        >\n'
    '          {kind === "country" ? name.toUpperCase() : name}\n'
    '        </Text>\n'
    '      ))}\n'
    '    </>\n'
    '  );\n'
    '}'
)
src = src.replace(old_geolabels_return, new_geolabels_return, 1)

# 7. Replace CityLabels to use Text + precomputed orientations
old_city_func = (
    'function CityLabels({ visible }: { visible: boolean }) {\n'
    '  if (!visible) return null;\n'
    '  return (\n'
    '    <>\n'
    '      {CITIES.map(({ n, lat, lon }) => (\n'
    '        <Html\n'
    '          key={n}\n'
    '          position={geoPos(lat, lon, R * 1.019)}\n'
    '          center\n'
    '          distanceFactor={12}\n'
    '          style={{ pointerEvents: "none", userSelect: "none" }}\n'
    '          zIndexRange={[0, 0]}\n'
    '        >\n'
    '          <span style={{\n'
    '            display: "block",\n'
    '            fontSize: 5,\n'
    '            fontWeight: 400,\n'
    '            color: "rgba(255,235,160,0.85)",\n'
    '            textShadow: "0 0 3px rgba(0,0,0,1), 0 1px 2px rgba(0,0,0,0.9)",\n'
    '            letterSpacing: "0.03em",\n'
    '            fontFamily: "system-ui,-apple-system,sans-serif",\n'
    '            lineHeight: "1",\n'
    '            whiteSpace: "nowrap",\n'
    '          }}>\n'
    '            {n}\n'
    '          </span>\n'
    '        </Html>\n'
    '      ))}\n'
    '    </>\n'
    '  );\n'
    '}'
)
new_city_func = (
    'function CityLabels({ visible }: { visible: boolean }) {\n'
    '  const items = useMemo(() => CITIES.map(({ n, lat, lon }) => {\n'
    '    const pos = geoPos(lat, lon, R * 1.019);\n'
    '    return { n, pos, orientation: computeOrientation(pos) };\n'
    '  }), []);\n'
    '  if (!visible) return null;\n'
    '  return (\n'
    '    <>\n'
    '      {items.map(({ n, pos, orientation }) => (\n'
    '        <Text\n'
    '          key={n}\n'
    '          position={pos}\n'
    '          quaternion={orientation}\n'
    '          fontSize={0.10}\n'
    '          color="#ffe090"\n'
    '          outlineWidth={0.007}\n'
    '          outlineColor="#000000"\n'
    '          anchorX="center"\n'
    '          anchorY="middle"\n'
    '          letterSpacing={0.02}\n'
    '          material-side={THREE.FrontSide}\n'
    '          material-depthTest\n'
    '        >\n'
    '          {n}\n'
    '        </Text>\n'
    '      ))}\n'
    '    </>\n'
    '  );\n'
    '}'
)
src = src.replace(old_city_func, new_city_func, 1)

with open(r'app\plan\location\page.tsx', 'w', encoding='utf-8') as f:
    f.write(src)
print("Done. Lines:", src.count('\n'))
