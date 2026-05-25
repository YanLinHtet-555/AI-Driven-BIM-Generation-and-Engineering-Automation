import { useState, Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import type { GenerationResponse } from '../types/api'
import type { RoofConfig } from '../types/viewer'

interface Props { result: GenerationResponse; roofConfig: RoofConfig }

type LayerId = 'rooms' | 'walls' | 'openings' | 'structure' | 'slabs' | 'hvac' | 'plumbing' | 'electrical'

const LAYERS: { id: LayerId; label: string; color: string }[] = [
  { id: 'slabs',       label: 'Slabs',       color: '#90a4ae' },
  { id: 'rooms',       label: 'Rooms',       color: '#8fbc8f' },
  { id: 'walls',       label: 'Walls',       color: '#8a8078' },
  { id: 'openings',    label: 'Openings',    color: '#ff8f00' },
  { id: 'structure',   label: 'Structure',   color: '#78909c' },
  { id: 'hvac',        label: 'HVAC',        color: '#00838f' },
  { id: 'plumbing',    label: 'Plumbing',    color: '#1565c0' },
  { id: 'electrical',  label: 'Electrical',  color: '#f9a825' },
]

const ROOM_COLOR: Record<string, string> = {
  living:       '#f0e8d8',  dining:   '#ece4d0',  kitchen: '#f0e0b4',
  bedroom:      '#d4e2f4',  bathroom: '#c8daea',  toilet:  '#d4cce4',
  office:       '#d8e8d4',  lobby:    '#ece4cc',  corridor:'#e4e0dc',
  staircase:    '#d8d4e0',  storage:  '#dcd8d4',  meeting_room:'#e8d4d8',
  parking:      '#d4dcd4',
}

// ── Geometry helper ────────────────────────────────────────────────────────
// Returns position/rotation/args for a box aligned along a horizontal segment
function segGeom(
  sx: number, sy: number, ex: number, ey: number,
  cy: number, boxH: number, boxW: number
): { pos: [number,number,number]; ry: number; args: [number,number,number] } | null {
  const len = Math.hypot(ex - sx, ey - sy)
  if (len < 0.05) return null
  return {
    pos:  [(sx+ex)/2, cy, (sy+ey)/2],
    ry:   -Math.atan2(ey - sy, ex - sx),
    args: [len, boxH, boxW],
  }
}

const SETBACK_FRONT = 4.0
const SETBACK_BACK  = 3.0
const SETBACK_SIDE  = 2.0

function buildRoofGeometry(
  siteW: number, siteD: number, baseY: number, cfg: RoofConfig,
): THREE.BufferGeometry {
  const ox = SETBACK_SIDE, oz = SETBACK_FRONT
  const bw = siteW - SETBACK_SIDE * 2
  const bd = siteD - SETBACK_FRONT - SETBACK_BACK
  const o  = cfg.overhang
  const ex1 = ox - o, ez1 = oz - o, ex2 = ox + bw + o, ez2 = oz + bd + o
  const eW  = bw + 2 * o, eD = bd + 2 * o
  const tanP = Math.tan((cfg.pitch * Math.PI) / 180)

  const verts: number[] = []
  const push = (x: number, y: number, z: number) => verts.push(x, y, z)
  const tri  = (ax: number, ay: number, az: number,
                bx: number, by: number, bz: number,
                cx: number, cy: number, cz: number) => {
    push(ax, ay, az); push(bx, by, bz); push(cx, cy, cz)
  }
  const quad = (ax: number, ay: number, az: number,
                bx: number, by: number, bz: number,
                cx: number, cy: number, cz: number,
                dx: number, dy: number, dz: number) => {
    tri(ax, ay, az, bx, by, bz, cx, cy, cz)
    tri(ax, ay, az, cx, cy, cz, dx, dy, dz)
  }

  const B = baseY

  if (cfg.shape === 'flat') {
    const fh = 0.15
    quad(ex1, B, ez1,  ex2, B, ez1,  ex2, B+fh, ez1,  ex1, B+fh, ez1)
    quad(ex2, B, ez1,  ex2, B, ez2,  ex2, B+fh, ez2,  ex2, B+fh, ez1)
    quad(ex2, B, ez2,  ex1, B, ez2,  ex1, B+fh, ez2,  ex2, B+fh, ez2)
    quad(ex1, B, ez2,  ex1, B, ez1,  ex1, B+fh, ez1,  ex1, B+fh, ez2)
    quad(ex1, B+fh, ez1, ex2, B+fh, ez1, ex2, B+fh, ez2, ex1, B+fh, ez2)

  } else if (cfg.shape === 'gable') {
    if (cfg.gableAxis === 'EW') {
      const ridgeZ = ez1 + eD / 2
      const rH = B + (eD / 2) * tanP
      quad(ex1, B, ez1,  ex2, B, ez1,  ex2, rH, ridgeZ,  ex1, rH, ridgeZ)
      quad(ex1, rH, ridgeZ, ex2, rH, ridgeZ, ex2, B, ez2, ex1, B, ez2)
      tri(ex1, B, ez1, ex1, rH, ridgeZ, ex1, B, ez2)
      tri(ex2, B, ez1, ex2, B, ez2, ex2, rH, ridgeZ)
    } else {
      const ridgeX = ex1 + eW / 2
      const rH = B + (eW / 2) * tanP
      quad(ex1, B, ez1, ex1, B, ez2, ridgeX, rH, ez2, ridgeX, rH, ez1)
      quad(ridgeX, rH, ez1, ridgeX, rH, ez2, ex2, B, ez2, ex2, B, ez1)
      tri(ex1, B, ez1, ridgeX, rH, ez1, ex2, B, ez1)
      tri(ex1, B, ez2, ex2, B, ez2, ridgeX, rH, ez2)
    }

  } else if (cfg.shape === 'hip') {
    if (eW >= eD) {
      const hd = eD / 2, rH = B + hd * tanP
      const rx1 = ex1 + hd, rx2 = ex2 - hd, rz = ez1 + hd
      // front hip
      tri(ex1, B, ez1, rx1, rH, rz, ex2, B, ez1)
      // back hip
      tri(ex1, B, ez2, ex2, B, ez2, rx1, rH, rz)
      // left hip (west)
      quad(ex1, B, ez1, ex1, rH, rz, ex1, rH, rz, rx1, rH, rz)
      // Actually: left face is triangle
      tri(ex1, B, ez1, ex1, B, ez2, rx1, rH, rz)
      tri(ex2, B, ez1, rx2, rH, rz, ex2, B, ez2)
      // ridge quad (if rx2 > rx1)
      if (rx2 > rx1) {
        quad(rx1, rH, rz, rx2, rH, rz, rx2, rH, rz + eD - 2*hd, rx1, rH, rz + eD - 2*hd)
        // front face
        quad(ex1, B, ez1, ex2, B, ez1, rx2, rH, rz, rx1, rH, rz)
        // back face
        quad(ex1, B, ez2, rx1, rH, rz + eD - 2*hd, rx2, rH, rz + eD - 2*hd, ex2, B, ez2)
      }
    } else {
      const hw = eW / 2, rH = B + hw * tanP
      const rz1 = ez1 + hw, rz2 = ez2 - hw, rx = ex1 + hw
      tri(ex1, B, ez1, ex2, B, ez1, rx, rH, rz1)
      tri(ex1, B, ez2, rx, rH, rz2, ex2, B, ez2)
      tri(ex1, B, ez1, rx, rH, rz1, ex1, B, ez2)
      tri(ex2, B, ez1, ex2, B, ez2, rx, rH, rz1)
      if (rz2 > rz1) {
        quad(rx, rH, rz1, ex1, B, ez1+hw, ex1, B, ez2-hw, rx, rH, rz2)
        quad(rx, rH, rz1, rx, rH, rz2, ex2, B, ez2-hw, ex2, B, ez1+hw)
      }
    }

  } else if (cfg.shape === 'shed') {
    const edge = cfg.shedHighEdge
    let rH: number
    if (edge === 'N' || edge === 'S') rH = B + eD * tanP
    else rH = B + eW * tanP
    if (edge === 'N') {
      quad(ex1, B+rH-B, ez1, ex2, B+rH-B, ez1, ex2, B, ez2, ex1, B, ez2)
      tri(ex1, B+rH-B, ez1, ex1, B, ez2, ex1, B, ez1)
      tri(ex2, B+rH-B, ez1, ex2, B, ez1, ex2, B, ez2)
      quad(ex1, B, ez1, ex2, B, ez1, ex2, B+rH-B, ez1, ex1, B+rH-B, ez1)
      quad(ex1, B, ez2, ex1, B+rH-B, ez1, ex2, B+rH-B, ez1, ex2, B, ez2)
    } else if (edge === 'S') {
      quad(ex1, B, ez1, ex2, B, ez1, ex2, B+rH-B, ez2, ex1, B+rH-B, ez2)
      tri(ex1, B, ez1, ex1, B+rH-B, ez2, ex1, B, ez2)
      tri(ex2, B, ez1, ex2, B, ez2, ex2, B+rH-B, ez2)
      quad(ex1, B+rH-B, ez2, ex2, B+rH-B, ez2, ex2, B, ez2, ex1, B, ez2)
      quad(ex1, B, ez1, ex2, B, ez1, ex2, B+rH-B, ez2, ex1, B+rH-B, ez2)
    } else if (edge === 'E') {
      quad(ex1, B, ez1, ex2, B+rH-B, ez1, ex2, B+rH-B, ez2, ex1, B, ez2)
      tri(ex1, B, ez1, ex1, B, ez2, ex2, B+rH-B, ez1)
      tri(ex2, B+rH-B, ez1, ex1, B, ez2, ex2, B+rH-B, ez2)
      quad(ex2, B+rH-B, ez1, ex2, B, ez1, ex2, B, ez2, ex2, B+rH-B, ez2)
      quad(ex1, B, ez1, ex1, B+rH-B, ez1, ex1, B+rH-B, ez2, ex1, B, ez2)
    } else {
      quad(ex2, B, ez1, ex1, B+rH-B, ez1, ex1, B+rH-B, ez2, ex2, B, ez2)
      tri(ex1, B+rH-B, ez1, ex1, B, ez1, ex2, B, ez1)
      tri(ex1, B+rH-B, ez2, ex2, B, ez2, ex1, B, ez2)
      quad(ex1, B+rH-B, ez1, ex2, B, ez1, ex2, B, ez2, ex1, B+rH-B, ez2)
      quad(ex2, B, ez1, ex2, B+rH-B, ez1, ex2, B+rH-B, ez2, ex2, B, ez2)
    }

  } else {
    // pyramid
    const ax = (ex1 + ex2) / 2, az = (ez1 + ez2) / 2
    const rH = B + Math.min(eW, eD) / 2 * tanP
    tri(ex1, B, ez1, ex2, B, ez1, ax, rH, az)
    tri(ex2, B, ez1, ex2, B, ez2, ax, rH, az)
    tri(ex2, B, ez2, ex1, B, ez2, ax, rH, az)
    tri(ex1, B, ez2, ex1, B, ez1, ax, rH, az)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.computeVertexNormals()
  return geo
}

function Roof3D({ siteW, siteD, baseY, cfg }: {
  siteW: number; siteD: number; baseY: number; cfg: RoofConfig
}) {
  const geo = useMemo(
    () => buildRoofGeometry(siteW, siteD, baseY, cfg),
    [siteW, siteD, baseY, cfg.shape, cfg.pitch, cfg.overhang, cfg.gableAxis, cfg.shedHighEdge]
  )
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#b8a898" roughness={0.82} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  )
}

// ── Scene ─────────────────────────────────────────────────────────────────
function BuildingScene({
  result, layers, floorFilter, roofConfig, hiddenIds, onToggleHide,
}: {
  result: GenerationResponse; layers: Set<LayerId>; floorFilter: number
  roofConfig: RoofConfig; hiddenIds: Set<string>; onToggleHide: (id: string) => void
}) {
  const { building_model: m, requirements: req } = result
  const fh     = m.floor_height
  const floors = req.floors
  const totalH = floors * fh

  const ok = (f: number) => floorFilter < 0 || f === floorFilter

  return (
    <>
      <color attach="background" args={['#c8e4f2']} />

      {/* Lighting */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[20, 30, 20]} intensity={1.15} castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.001} />
      <directionalLight position={[-10, 18, -8]} intensity={0.3} color="#cce4ff" />
      <hemisphereLight args={['#d8ecfc', '#c0b8a8', 0.45]} />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[req.site_width / 2, -0.02, req.site_depth / 2]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#c4c0b8" roughness={0.95} />
      </mesh>
      {/* Subtle grid */}
      <gridHelper args={[200, 100, '#a8a49c', '#b4b0a8']} position={[req.site_width / 2, 0, req.site_depth / 2]} />

      {/* ── Slabs ──────────────────────────────────────────────────────── */}
      {layers.has('slabs') && m.slabs?.filter(s => floorFilter < 0 || s.is_roof || ok(s.floor)).map(s => {
        const xs = s.polygon.map(p => p.x), ys = s.polygon.map(p => p.y)
        const x = Math.min(...xs), z = Math.min(...ys)
        const w = Math.max(...xs) - x,    d = Math.max(...ys) - z
        const yPos = s.is_roof ? totalH : s.floor * fh
        return (
          <mesh key={s.id} position={[x + w/2, yPos + s.thickness/2, z + d/2]}>
            <boxGeometry args={[w, s.thickness, d]} />
            <meshStandardMaterial color={s.is_roof ? '#b8b4ae' : '#c8c4be'} roughness={0.92} metalness={0} />
          </mesh>
        )
      })}

      {/* ── Rooms (transparent volumes) ───────────────────────────────── */}
      {layers.has('rooms') && m.rooms.filter(r => ok(r.floor)).map(r => {
        const xs = r.polygon.map(p => p.x), ys = r.polygon.map(p => p.y)
        const x = Math.min(...xs), z = Math.min(...ys)
        const w = Math.max(...xs) - x,    d = Math.max(...ys) - z
        const hidden = hiddenIds.has(r.id)
        return (
          <mesh key={r.id} position={[x + w/2, r.floor * fh + fh/2, z + d/2]}
            onClick={e => { e.stopPropagation(); onToggleHide(r.id) }}>
            <boxGeometry args={[w, fh * 0.98, d]} />
            <meshStandardMaterial
              color={ROOM_COLOR[r.type] ?? '#e0e0e0'}
              transparent opacity={hidden ? 0.06 : 0.35}
              roughness={0.8}
              depthWrite={false}
            />
          </mesh>
        )
      })}

      {/* ── Walls ─────────────────────────────────────────────────────── */}
      {layers.has('walls') && m.walls.filter(w => ok(w.floor)).map(w => {
        const g = segGeom(
          w.start.x, w.start.y, w.end.x, w.end.y,
          w.floor * fh + w.height / 2, w.height, w.thickness
        )
        if (!g) return null
        const hidden = hiddenIds.has(w.id)
        return (
          <mesh key={w.id} position={g.pos} rotation={[0, g.ry, 0]}
            castShadow={w.is_external} receiveShadow
            onClick={e => { e.stopPropagation(); onToggleHide(w.id) }}>
            <boxGeometry args={g.args} />
            <meshStandardMaterial
              color={w.is_external ? '#c8c2b8' : '#d8d4cc'}
              roughness={0.88}
              metalness={0}
              transparent={hidden} opacity={hidden ? 0.06 : 1} />
          </mesh>
        )
      })}

      {/* ── Columns ───────────────────────────────────────────────────── */}
      {layers.has('structure') && m.columns?.map(col => (
        <mesh key={col.id} position={[col.position.x, totalH / 2, col.position.y]} castShadow>
          <boxGeometry args={[col.width, totalH, col.depth]} />
          <meshStandardMaterial color="#6a6660" roughness={0.35} metalness={0.6} />
        </mesh>
      ))}

      {/* ── Beams ─────────────────────────────────────────────────────── */}
      {layers.has('structure') && m.beams?.filter(b => ok(b.floor)).map(b => {
        const g = segGeom(
          b.start.x, b.start.y, b.end.x, b.end.y,
          (b.floor + 1) * fh - b.depth / 2, b.depth, b.width
        )
        if (!g) return null
        return (
          <mesh key={b.id} position={g.pos} rotation={[0, g.ry, 0]}>
            <boxGeometry args={g.args} />
            <meshStandardMaterial color="#7a7570" roughness={0.4} metalness={0.55} />
          </mesh>
        )
      })}

      {/* ── HVAC ducts ─────────────────────────────────────────────────── */}
      {layers.has('hvac') && m.duct_segments?.filter(d => ok(d.floor)).map(d => {
        const g = segGeom(
          d.start.x, d.start.y, d.end.x, d.end.y,
          (d.floor + 1) * fh - 0.3 - d.height / 2, d.height, d.width
        )
        if (!g) return null
        return (
          <mesh key={d.id} position={g.pos} rotation={[0, g.ry, 0]}>
            <boxGeometry args={g.args} />
            <meshStandardMaterial color="#00838f" transparent opacity={0.7} />
          </mesh>
        )
      })}

      {/* ── Plumbing pipes ─────────────────────────────────────────────── */}
      {layers.has('plumbing') && m.pipe_segments?.filter(p => ok(p.floor)).map(p => {
        const r = Math.max(p.diameter / 2, 0.04)
        const g = segGeom(
          p.start.x, p.start.y, p.end.x, p.end.y,
          p.floor * fh + 0.35, r * 2, r * 2
        )
        if (!g) return null
        return (
          <mesh key={p.id} position={g.pos} rotation={[0, g.ry, 0]}>
            <boxGeometry args={g.args} />
            <meshStandardMaterial color={p.system === 'cold_water' ? '#1565c0' : '#b71c1c'} transparent opacity={0.8} />
          </mesh>
        )
      })}

      {/* ── Electrical cables ──────────────────────────────────────────── */}
      {layers.has('electrical') && m.cable_segments?.filter(c => ok(c.floor)).map(c => {
        const g = segGeom(
          c.start.x, c.start.y, c.end.x, c.end.y,
          (c.floor + 1) * fh - 0.08, 0.05, 0.05
        )
        if (!g) return null
        return (
          <mesh key={c.id} position={g.pos} rotation={[0, g.ry, 0]}>
            <boxGeometry args={g.args} />
            <meshStandardMaterial color={c.circuit === 'power' ? '#f9a825' : '#ff7043'} />
          </mesh>
        )
      })}

      {/* ── Light fixtures ──────────────────────────────────────────────── */}
      {layers.has('electrical') && m.light_fixtures?.filter(l => ok(l.floor)).map(l => (
        <mesh key={l.id} position={[l.position.x, (l.floor + 1) * fh - 0.05, l.position.y]}>
          <boxGeometry args={[0.3, 0.05, 0.3]} />
          <meshStandardMaterial color="#fff9c4" emissive="#fff9c4" emissiveIntensity={0.6} />
        </mesh>
      ))}

      {/* ── Doors ─────────────────────────────────────────────────────── */}
      {layers.has('openings') && m.doors?.filter(d => ok(d.floor)).map(d => {
        const wall = m.walls.find(w => w.id === d.wall_id)
        const hidden = hiddenIds.has(d.id)
        const ry = wall
          ? -Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x)
          : 0
        return (
          <mesh key={d.id}
            position={[d.position.x, d.floor * fh + d.height / 2, d.position.y]}
            rotation={[0, ry, 0]}
            onClick={e => { e.stopPropagation(); onToggleHide(d.id) }}>
            <boxGeometry args={[d.width, d.height, wall?.thickness ?? 0.2]} />
            <meshStandardMaterial
              color="#8b6535"
              roughness={0.75}
              metalness={0}
              transparent={hidden}
              opacity={hidden ? 0.06 : 1} />
          </mesh>
        )
      })}

      {/* ── Windows ────────────────────────────────────────────────────── */}
      {layers.has('openings') && m.windows?.filter(w => ok(w.floor)).map(w => {
        const wall = m.walls.find(v => v.id === w.wall_id)
        const hidden = hiddenIds.has(w.id)
        const ry = wall
          ? -Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x)
          : 0
        return (
          <mesh key={w.id}
            position={[w.position.x, w.floor * fh + w.sill_height + w.height / 2, w.position.y]}
            rotation={[0, ry, 0]}
            onClick={e => { e.stopPropagation(); onToggleHide(w.id) }}>
            <boxGeometry args={[w.width, w.height, wall?.thickness ?? 0.2]} />
            <meshStandardMaterial
              color="#a8c8e0"
              roughness={0.05}
              metalness={0.15}
              transparent
              opacity={hidden ? 0.06 : 0.42}
              depthWrite={false} />
          </mesh>
        )
      })}

      {/* ── Roof ──────────────────────────────────────────────────────── */}
      {layers.has('slabs') && (floorFilter < 0) && (
        <Roof3D siteW={req.site_width} siteD={req.site_depth} baseY={totalH} cfg={roofConfig} />
      )}

      {/* Controls */}
      <OrbitControls
        makeDefault
        target={[req.site_width / 2, totalH / 3, req.site_depth / 2]}
        minDistance={3}
        maxDistance={120}
      />
      <GizmoHelper alignment="bottom-right" margin={[68, 68]}>
        <GizmoViewport axisHeadScale={0.8} labelColor="white" />
      </GizmoHelper>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function ThreeDViewer({ result, roofConfig }: Props) {
  const { requirements: req, building_model: m } = result
  const floors   = req.floors
  const totalH   = floors * m.floor_height

  const [layers, setLayers] = useState<Set<LayerId>>(
    new Set(LAYERS.map(l => l.id) as LayerId[])
  )
  const [floorFilter, setFloorFilter] = useState(-1)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [panelOpen, setPanelOpen] = useState(false)

  const toggleLayer = (id: LayerId) =>
    setLayers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleHide = (id: string) =>
    setHiddenIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Camera start position: 45° above, offset diagonally from building centre
  const camX = req.site_width / 2 + totalH + 6
  const camY = totalH * 1.6 + 4
  const camZ = req.site_depth / 2 + totalH + 6

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-slate-800">3D View</h2>
        {/* Floor filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setFloorFilter(-1)}
            className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${
              floorFilter < 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>All</button>
          {Array.from({ length: floors }, (_, i) => (
            <button key={i} onClick={() => setFloorFilter(i)}
              className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${
                floorFilter === i ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              L{i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Layer toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {LAYERS.map(({ id, label, color }) => (
          <button key={id} onClick={() => toggleLayer(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              layers.has(id) ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-400'
            }`}
            style={layers.has(id) ? { backgroundColor: color } : {}}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="rounded-xl overflow-hidden bg-[#c8e4f2]" style={{ height: 520 }}>
        <Canvas
          camera={{ fov: 50, position: [camX, camY, camZ], near: 0.1, far: 500 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
          shadows
        >
          <Suspense fallback={null}>
            <BuildingScene result={result} layers={layers} floorFilter={floorFilter}
              roofConfig={roofConfig} hiddenIds={hiddenIds} onToggleHide={toggleHide} />
          </Suspense>
        </Canvas>
      </div>

      <p className="mt-2 text-xs text-center text-slate-400">
        Left-drag to orbit · right-drag to pan · scroll to zoom · click element to hide/show
      </p>

      {/* Components panel */}
      <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setPanelOpen(p => !p)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors">
          <span>Components</span>
          <span className="text-slate-400">{panelOpen ? '▲' : '▼'}</span>
        </button>
        {panelOpen && (
          <div className="p-3 space-y-3 max-h-64 overflow-y-auto">
            {Array.from({ length: floors }, (_, f) => {
              const floorRooms = m.rooms.filter(r => r.floor === f)
              if (!floorRooms.length) return null
              return (
                <div key={f}>
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">Floor {f + 1}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {floorRooms.map(r => {
                      const hidden = hiddenIds.has(r.id)
                      return (
                        <button key={r.id} onClick={() => toggleHide(r.id)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-all ${
                            hidden
                              ? 'border-slate-200 text-slate-400 bg-white'
                              : 'border-blue-200 text-blue-700 bg-blue-50'
                          }`}>
                          <span>{hidden ? '○' : '●'}</span>
                          {r.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {hiddenIds.size > 0 && (
              <button onClick={() => setHiddenIds(new Set())}
                className="text-xs text-slate-500 underline hover:text-slate-700">
                Show all
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
