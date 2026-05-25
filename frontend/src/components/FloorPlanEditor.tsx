import { useState, useRef, useEffect } from 'react'
import type { GenerationResponse, Room, Wall, Door, WindowElement } from '../types/api'
import { patchModel } from '../api/client'

// ── Constants (match backend svg_renderer.py) ─────────────────────────────
const SCALE = 20
const PAD   = 30
const DIM_L = 50
const DIM_T = 45
const SETBACK_FRONT = 4.0
const SETBACK_BACK  = 3.0
const SETBACK_SIDE  = 2.0
const SNAP   = 0.25
const MIN_SZ = 1.5

const px = (m: number) => m * SCALE + PAD

// ── Interfaces ────────────────────────────────────────────────────────────
interface Props {
  result:      GenerationResponse
  activeFloor: number
  onApply:     (updated: GenerationResponse) => void
  onCancel:    () => void
}

interface EditRoom {
  id: string; type: string; name: string; floor: number
  x: number; y: number; w: number; h: number
}

interface EditWall {
  id: string; floor: number
  startX: number; startY: number
  endX: number;   endY: number
  thickness: number; height: number; isExternal: boolean
}

interface RoomDrag {
  mode: 'move' | 'resize'; id: string
  sx0: number; sy0: number
  x0: number; y0: number; w0: number; h0: number
}

interface WallDrag {
  id: string; ep: 'start' | 'end'
  sx0: number; sy0: number; ox: number; oy: number
}

interface OpeningDrag {
  id: string; type: 'door' | 'window'; wallId: string
  sx0: number; sy0: number
  posX0: number; posY0: number
}

interface EditDoor {
  id: string; wallId: string; floor: number
  posX: number; posY: number
  width: number; height: number
}

interface EditWindow {
  id: string; wallId: string; floor: number
  posX: number; posY: number
  width: number; height: number; sillHeight: number
}

// ── Helpers ───────────────────────────────────────────────────────────────
const snap = (v: number) => Math.round(v / SNAP) * SNAP

function fromApiRoom(r: Room): EditRoom {
  const xs = r.polygon.map(p => p.x), ys = r.polygon.map(p => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { id: r.id, type: r.type, name: r.name, floor: r.floor,
    x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

function fromApiWall(w: Wall): EditWall {
  return { id: w.id, floor: w.floor,
    startX: w.start.x, startY: w.start.y,
    endX: w.end.x,     endY: w.end.y,
    thickness: w.thickness, height: w.height, isExternal: w.is_external }
}

function fromApiDoor(d: Door): EditDoor {
  return { id: d.id, wallId: d.wall_id, floor: d.floor,
    posX: d.position.x, posY: d.position.y, width: d.width, height: d.height }
}

function fromApiWindow(w: WindowElement): EditWindow {
  return { id: w.id, wallId: w.wall_id, floor: w.floor,
    posX: w.position.x, posY: w.position.y,
    width: w.width, height: w.height, sillHeight: w.sill_height }
}

function findClosestWall(mx: number, my: number, walls: EditWall[]) {
  let best: { wall: EditWall; cx: number; cy: number; dist: number } | null = null
  for (const w of walls) {
    const dx = w.endX - w.startX, dy = w.endY - w.startY
    const lenSq = dx * dx + dy * dy
    if (lenSq < 0.01) continue
    const t = Math.max(0.1, Math.min(0.9, ((mx - w.startX) * dx + (my - w.startY) * dy) / lenSq))
    const cx = w.startX + t * dx, cy = w.startY + t * dy
    const dist = Math.hypot(mx - cx, my - cy)
    if (!best || dist < best.dist) best = { wall: w, cx, cy, dist }
  }
  return best && best.dist < 1.5 ? best : null
}

function projectOntoWall(mx: number, my: number, wall: EditWall) {
  const dx = wall.endX - wall.startX, dy = wall.endY - wall.startY
  const lenSq = dx * dx + dy * dy
  if (lenSq < 0.01) return { x: wall.startX, y: wall.startY }
  const t = Math.max(0.05, Math.min(0.95, ((mx - wall.startX) * dx + (my - wall.startY) * dy) / lenSq))
  return { x: wall.startX + t * dx, y: wall.startY + t * dy }
}

const ROOM_FILL: Record<string, string> = {
  living: '#a5d6a7',    dining: '#c8e6c9',    kitchen: '#fff176',
  bedroom: '#90caf9',   bathroom: '#80cbc4',  toilet: '#80cbc4',
  office: '#ce93d8',    lobby: '#ffcc80',     corridor: '#eeeeee',
  staircase: '#b0bec5', storage: '#bcaaa4',   meeting_room: '#9fa8da',
  parking: '#cfd8dc',
}

const ROOM_TYPES = [
  'living','dining','kitchen','bedroom','bathroom','toilet',
  'office','lobby','corridor','staircase','storage','meeting_room','parking',
]

// ── Component ─────────────────────────────────────────────────────────────
export default function FloorPlanEditor({ result, activeFloor, onApply, onCancel }: Props) {
  const { site_width: siteW, site_depth: siteH } = result.requirements
  const sg  = result.building_model.structural_grid
  const bx  = SETBACK_SIDE
  const by  = SETBACK_FRONT
  const bw  = siteW - SETBACK_SIDE * 2
  const bd  = siteH - SETBACK_FRONT - SETBACK_BACK

  // ── State ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'rooms' | 'walls' | 'openings' | 'structure'>('rooms')

  const [rooms, setRooms] = useState<EditRoom[]>(() =>
    result.building_model.rooms.filter(r => r.floor === activeFloor).map(fromApiRoom)
  )
  const [selRoomId,  setSelRoomId]  = useState<string | null>(null)
  const [roomDrag,   setRoomDrag]   = useState<RoomDrag | null>(null)

  const [walls, setWalls] = useState<EditWall[]>(() =>
    result.building_model.walls.filter(w => w.floor === activeFloor).map(fromApiWall)
  )
  const [selWallId,  setSelWallId]  = useState<string | null>(null)
  const [wallDrag,   setWallDrag]   = useState<WallDrag | null>(null)
  const [isDrawing,  setIsDrawing]  = useState(false)
  const [openingDrag, setOpeningDrag] = useState<OpeningDrag | null>(null)
  const [drawStart,  setDrawStart]  = useState<{ x: number; y: number } | null>(null)
  const [cursorM,    setCursorM]    = useState<{ x: number; y: number } | null>(null)

  const [editDoors,    setEditDoors]    = useState<EditDoor[]>(() =>
    (result.building_model.doors ?? []).filter(d => d.floor === activeFloor).map(fromApiDoor)
  )
  const [editWindows,  setEditWindows]  = useState<EditWindow[]>(() =>
    (result.building_model.windows ?? []).filter(w => w.floor === activeFloor).map(fromApiWindow)
  )
  const [openingMode,  setOpeningMode]  = useState<'door' | 'window' | null>(null)
  const [selOpeningId, setSelOpeningId] = useState<string | null>(null)
  const [selOpeningType, setSelOpeningType] = useState<'door' | 'window' | null>(null)

  const [spacingsX,  setSpacingsX]  = useState<number[]>(sg?.spacings_x ?? [])
  const [spacingsY,  setSpacingsY]  = useState<number[]>(sg?.spacings_y ?? [])
  const [floorH,     setFloorH]     = useState(result.building_model.floor_height)
  const [applying,   setApplying]   = useState(false)
  const [applyErr,   setApplyErr]   = useState<string | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)

  const selRoom = rooms.find(r => r.id === selRoomId) ?? null
  const selWall = walls.find(w => w.id === selWallId) ?? null

  const totalW = siteW * SCALE + PAD * 2 + DIM_L
  const totalH = siteH * SCALE + PAD * 2 + DIM_T + 20

  // Escape key cancels wall draw mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsDrawing(false); setDrawStart(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── SVG coordinate conversion ─────────────────────────────────────────
  const svgPt = (e: React.PointerEvent | React.MouseEvent) => {
    const pt = svgRef.current!.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    return pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse())
  }

  const toMeter = (svgX: number, svgY: number) => ({
    mx: snap((svgX - DIM_L - PAD) / SCALE),
    my: snap((svgY - DIM_T - PAD) / SCALE),
  })

  // ── Pointer handlers ──────────────────────────────────────────────────
  const startRoomDrag = (e: React.PointerEvent, id: string, mode: 'move' | 'resize') => {
    e.stopPropagation()
    if (isDrawing) return
    const r = rooms.find(r => r.id === id)!
    const sp = svgPt(e)
    setSelRoomId(id); setSelWallId(null)
    setRoomDrag({ mode, id, sx0: sp.x, sy0: sp.y, x0: r.x, y0: r.y, w0: r.w, h0: r.h })
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const startWallDrag = (e: React.PointerEvent, id: string, ep: 'start' | 'end') => {
    e.stopPropagation()
    if (isDrawing) return
    const w = walls.find(w => w.id === id)!
    const sp = svgPt(e)
    setSelWallId(id); setSelRoomId(null)
    setWallDrag({ id, ep, sx0: sp.x, sy0: sp.y,
      ox: ep === 'start' ? w.startX : w.endX,
      oy: ep === 'start' ? w.startY : w.endY })
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const startOpeningDrag = (e: React.PointerEvent, id: string, type: 'door' | 'window') => {
    e.stopPropagation()
    if (openingMode) return
    const opening = type === 'door'
      ? editDoors.find(d => d.id === id)!
      : editWindows.find(w => w.id === id)!
    const sp = svgPt(e)
    setSelOpeningId(id); setSelOpeningType(type); setSelRoomId(null); setSelWallId(null)
    setOpeningDrag({ id, type, wallId: opening.wallId, sx0: sp.x, sy0: sp.y,
      posX0: opening.posX, posY0: opening.posY })
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const sp = svgPt(e)
    const { mx, my } = toMeter(sp.x, sp.y)
    if (isDrawing) setCursorM({ x: mx, y: my })

    if (roomDrag) {
      const dm = { x: (sp.x - roomDrag.sx0) / SCALE, y: (sp.y - roomDrag.sy0) / SCALE }
      setRooms(prev => prev.map(r => {
        if (r.id !== roomDrag.id) return r
        if (roomDrag.mode === 'move')
          return { ...r, x: snap(roomDrag.x0 + dm.x), y: snap(roomDrag.y0 + dm.y) }
        return { ...r, w: Math.max(MIN_SZ, snap(roomDrag.w0 + dm.x)), h: Math.max(MIN_SZ, snap(roomDrag.h0 + dm.y)) }
      }))
    }

    if (wallDrag) {
      const dm = { x: (sp.x - wallDrag.sx0) / SCALE, y: (sp.y - wallDrag.sy0) / SCALE }
      setWalls(prev => prev.map(w => {
        if (w.id !== wallDrag.id) return w
        if (wallDrag.ep === 'start')
          return { ...w, startX: snap(wallDrag.ox + dm.x), startY: snap(wallDrag.oy + dm.y) }
        return { ...w, endX: snap(wallDrag.ox + dm.x), endY: snap(wallDrag.oy + dm.y) }
      }))
    }

    if (openingDrag) {
      const dm = { x: (sp.x - openingDrag.sx0) / SCALE, y: (sp.y - openingDrag.sy0) / SCALE }
      const proposed = { x: openingDrag.posX0 + dm.x, y: openingDrag.posY0 + dm.y }
      const wall = walls.find(w => w.id === openingDrag.wallId)
      if (wall) {
        const proj = projectOntoWall(proposed.x, proposed.y, wall)
        if (openingDrag.type === 'door') {
          setEditDoors(prev => prev.map(d => d.id === openingDrag.id ? { ...d, posX: proj.x, posY: proj.y } : d))
        } else {
          setEditWindows(prev => prev.map(w => w.id === openingDrag.id ? { ...w, posX: proj.x, posY: proj.y } : w))
        }
      }
    }
  }

  const stopDrag = () => { setRoomDrag(null); setWallDrag(null); setOpeningDrag(null) }

  // SVG click → wall draw mode or opening placement
  const onSvgClick = (e: React.MouseEvent) => {
    const sp = svgPt(e)
    const { mx, my } = toMeter(sp.x, sp.y)

    if (isDrawing) {
      if (!drawStart) {
        setDrawStart({ x: mx, y: my })
      } else {
        const len = Math.hypot(mx - drawStart.x, my - drawStart.y)
        if (len >= 0.5) {
          const id = `new-wall-${Date.now()}`
          const newWall: EditWall = {
            id, floor: activeFloor,
            startX: drawStart.x, startY: drawStart.y,
            endX: mx, endY: my,
            thickness: 0.2, height: floorH, isExternal: false,
          }
          setWalls(prev => [...prev, newWall])
          setSelWallId(id)
        }
        setDrawStart(null)
        setIsDrawing(false)
      }
      return
    }

    if (openingMode) {
      const closest = findClosestWall(mx, my, walls)
      if (!closest) return
      if (openingMode === 'door') {
        const id = `new-door-${Date.now()}`
        setEditDoors(prev => [...prev, {
          id, wallId: closest.wall.id, floor: activeFloor,
          posX: closest.cx, posY: closest.cy, width: 0.9, height: 2.1,
        }])
        setSelOpeningId(id); setSelOpeningType('door')
      } else {
        const id = `new-window-${Date.now()}`
        setEditWindows(prev => [...prev, {
          id, wallId: closest.wall.id, floor: activeFloor,
          posX: closest.cx, posY: closest.cy, width: 1.2, height: 1.2, sillHeight: 0.9,
        }])
        setSelOpeningId(id); setSelOpeningType('window')
      }
      setOpeningMode(null)
    }
  }

  // ── Room operations ───────────────────────────────────────────────────
  const addRoom = () => {
    const id = `new-room-${Date.now()}`
    setRooms(prev => [...prev, { id, type: 'office', name: 'New Room', floor: activeFloor,
      x: snap(bx + bw/2 - 2), y: snap(by + bd/2 - 1.5), w: 4, h: 3 }])
    setSelRoomId(id); setSelWallId(null)
  }

  const patchRoom = (p: Partial<EditRoom>) =>
    setRooms(prev => prev.map(r => r.id === selRoomId ? { ...r, ...p } : r))

  const deleteRoom = () => {
    setRooms(prev => prev.filter(r => r.id !== selRoomId))
    setSelRoomId(null)
  }

  // ── Wall operations ───────────────────────────────────────────────────
  const patchWall = (p: Partial<EditWall>) =>
    setWalls(prev => prev.map(w => w.id === selWallId ? { ...w, ...p } : w))

  const deleteWall = () => {
    setWalls(prev => prev.filter(w => w.id !== selWallId))
    setSelWallId(null)
  }

  // ── Structural grid ───────────────────────────────────────────────────
  const colXs = (() => {
    const xs = [SETBACK_SIDE]; spacingsX.forEach(s => xs.push(xs[xs.length-1] + s)); return xs
  })()
  const rowYs = (() => {
    const ys = [SETBACK_FRONT]; spacingsY.forEach(s => ys.push(ys[ys.length-1] + s)); return ys
  })()

  // ── Apply ─────────────────────────────────────────────────────────────
  const apply = async () => {
    setApplying(true); setApplyErr(null)
    try {
      const updated = await patchModel(result.model_id, {
        floor: activeFloor,
        rooms: rooms.map(({ id, name, type, x, y, w, h }) => ({ id, name, type, x, y, w, h })),
        walls: walls.map(({ id, startX, startY, endX, endY, thickness, height, isExternal }) => ({
          id, start_x: startX, start_y: startY, end_x: endX, end_y: endY,
          thickness, height, is_external: isExternal,
        })),
        doors: editDoors.map(({ id, wallId, posX, posY, width, height }) => ({
          id, wall_id: wallId, position_x: posX, position_y: posY, width, height, floor: activeFloor,
        })),
        windows: editWindows.map(({ id, wallId, posX, posY, width, height, sillHeight }) => ({
          id, wall_id: wallId, position_x: posX, position_y: posY,
          width, height, sill_height: sillHeight, floor: activeFloor,
        })),
        structural_spacings_x: spacingsX.length ? spacingsX : undefined,
        structural_spacings_y: spacingsY.length ? spacingsY : undefined,
        floor_height: floorH !== result.building_model.floor_height ? floorH : undefined,
      })
      onApply(updated)
    } catch (e) {
      setApplyErr(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setApplying(false)
    }
  }

  // ── Grid dots ─────────────────────────────────────────────────────────
  const gridDots = []
  for (let gx = 0; gx <= siteW; gx++) {
    for (let gy = 0; gy <= siteH; gy++) {
      gridDots.push(<circle key={`${gx}-${gy}`} cx={px(gx)} cy={px(gy)} r="0.8" fill="#b0bec5" opacity="0.4"/>)
    }
  }

  const selDoor   = editDoors.find(d => d.id === selOpeningId && selOpeningType === 'door') ?? null
  const selWindow = editWindows.find(w => w.id === selOpeningId && selOpeningType === 'window') ?? null

  const patchDoor   = (p: Partial<EditDoor>) =>
    setEditDoors(prev => prev.map(d => d.id === selOpeningId ? { ...d, ...p } : d))
  const patchWindow = (p: Partial<EditWindow>) =>
    setEditWindows(prev => prev.map(w => w.id === selOpeningId ? { ...w, ...p } : w))
  const deleteDoor   = () => { setEditDoors(prev => prev.filter(d => d.id !== selOpeningId)); setSelOpeningId(null) }
  const deleteWindow = () => { setEditWindows(prev => prev.filter(w => w.id !== selOpeningId)); setSelOpeningId(null) }

  const svgCursor = (isDrawing || openingMode) ? 'crosshair' : (roomDrag || wallDrag || openingDrag) ? 'grabbing' : 'default'

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Edit Layout — Floor {activeFloor + 1}</h2>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={apply} disabled={applying}
            className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {applying ? 'Applying…' : 'Apply Changes'}
          </button>
        </div>
      </div>

      {applyErr && (
        <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{applyErr}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 pb-1">
        {(['rooms', 'walls', 'openings', 'structure'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setOpeningMode(null) }}
            className={`px-3 py-1 text-sm font-medium rounded-t-lg capitalize transition-colors ${
              tab === t ? 'bg-blue-50 text-blue-700 border border-blue-200 border-b-white -mb-px' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* ── SVG Canvas ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto rounded-xl border border-slate-100 bg-slate-50">
          <svg ref={svgRef} width={totalW} height={totalH} style={{ cursor: svgCursor }}
            onPointerMove={onPointerMove} onPointerUp={stopDrag} onClick={onSvgClick}>

            <rect width={totalW} height={totalH} fill="#eceff1"/>
            <g transform={`translate(${DIM_L},${DIM_T})`}>
              {/* Snap grid */}
              {gridDots}

              {/* Site boundary */}
              <rect x={px(0)} y={px(0)} width={siteW*SCALE} height={siteH*SCALE}
                fill="#f9fbe7" stroke="#aed581" strokeWidth="2" strokeDasharray="8,4"/>

              {/* Building footprint guide */}
              <rect x={px(bx)} y={px(by)} width={bw*SCALE} height={bd*SCALE}
                fill="none" stroke="#90a4ae" strokeWidth="1" strokeDasharray="4,2" opacity="0.5"/>

              {/* Structural grid (structure tab only) */}
              {tab === 'structure' && colXs.map((x, i) => (
                <line key={`cx${i}`} x1={px(x)} y1={px(0)} x2={px(x)} y2={px(siteH)}
                  stroke="#e53935" strokeWidth="1" strokeDasharray="4,3" opacity="0.65"/>
              ))}
              {tab === 'structure' && rowYs.map((y, i) => (
                <line key={`ry${i}`} x1={px(0)} y1={px(y)} x2={px(siteW)} y2={px(y)}
                  stroke="#e53935" strokeWidth="1" strokeDasharray="4,3" opacity="0.65"/>
              ))}
              {tab === 'structure' && colXs.map(x => rowYs.map(y => (
                <circle key={`col${x}-${y}`} cx={px(x)} cy={px(y)} r="4"
                  fill="#e53935" stroke="white" strokeWidth="1.5" opacity="0.85"/>
              )))}

              {/* ── Walls (always rendered; interactive only in walls tab) ── */}
              {walls.map(w => {
                const isSel = w.id === selWallId && tab === 'walls'
                const color = isSel ? '#1565c0' : w.isExternal ? '#37474f' : '#78909c'
                const sw    = Math.max(tab === 'walls' ? 3 : 2, w.thickness * SCALE)
                return (
                  <g key={w.id}>
                    {/* Transparent fat hit area */}
                    <line x1={px(w.startX)} y1={px(w.startY)} x2={px(w.endX)} y2={px(w.endY)}
                      stroke="transparent" strokeWidth="14"
                      style={{ cursor: tab === 'walls' && !isDrawing ? 'pointer' : 'default' }}
                      onClick={e => {
                        if (tab !== 'walls' || isDrawing) return
                        e.stopPropagation(); setSelWallId(w.id); setSelRoomId(null)
                      }}
                    />
                    {/* Visual line */}
                    <line x1={px(w.startX)} y1={px(w.startY)} x2={px(w.endX)} y2={px(w.endY)}
                      stroke={color} strokeWidth={sw} strokeLinecap="square"
                      style={{ pointerEvents: 'none' }}/>
                    {/* Endpoint handles (selected wall in walls tab) */}
                    {isSel && (
                      <>
                        <circle cx={px(w.startX)} cy={px(w.startY)} r="6"
                          fill="white" stroke="#1565c0" strokeWidth="2"
                          style={{ cursor: 'grab' }}
                          onPointerDown={e => startWallDrag(e, w.id, 'start')}/>
                        <circle cx={px(w.endX)} cy={px(w.endY)} r="6"
                          fill="white" stroke="#1565c0" strokeWidth="2"
                          style={{ cursor: 'grab' }}
                          onPointerDown={e => startWallDrag(e, w.id, 'end')}/>
                      </>
                    )}
                  </g>
                )
              })}

              {/* ── Rooms ──────────────────────────────────────────────── */}
              {rooms.map(r => {
                const isSel = r.id === selRoomId && tab === 'rooms'
                const fill  = ROOM_FILL[r.type] ?? '#e0e0e0'
                const cx    = px(r.x + r.w/2), cy = px(r.y + r.h/2)
                const interactive = tab === 'rooms' && !isDrawing
                return (
                  <g key={r.id}>
                    <rect x={px(r.x)} y={px(r.y)} width={r.w*SCALE} height={r.h*SCALE}
                      fill={fill} fillOpacity={interactive ? 0.88 : 0.45}
                      stroke={isSel ? '#1565c0' : '#546e7a'}
                      strokeWidth={isSel ? 2.5 : 1}
                      style={{ cursor: interactive ? 'move' : 'default' }}
                      onPointerDown={e => interactive && startRoomDrag(e, r.id, 'move')}
                      onClick={e => { if (!isDrawing && tab === 'rooms') { e.stopPropagation(); setSelRoomId(r.id); setSelWallId(null) }}}
                    />
                    <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="sans-serif"
                      fontSize="9" fontWeight="600" fill="#37474f"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {r.name}
                    </text>
                    <text x={cx} y={cy + 8} textAnchor="middle" fontFamily="sans-serif"
                      fontSize="7.5" fill="#78909c"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {(r.w * r.h).toFixed(1)} m²
                    </text>
                    {/* Resize handle */}
                    {isSel && (
                      <rect x={px(r.x + r.w) - 7} y={px(r.y + r.h) - 7} width={12} height={12} rx="2"
                        fill="#1565c0" stroke="white" strokeWidth="1.5"
                        style={{ cursor: 'se-resize' }}
                        onPointerDown={e => startRoomDrag(e, r.id, 'resize')}/>
                    )}
                  </g>
                )
              })}

              {/* ── Doors ────────────────────────────────────────────── */}
              {editDoors.map(d => {
                const isSel = d.id === selOpeningId && selOpeningType === 'door' && tab === 'openings'
                const interactive = tab === 'openings' && !openingMode
                const r = d.width * SCALE / 2
                return (
                  <g key={d.id}>
                    {/* Hit / drag area */}
                    <circle cx={px(d.posX)} cy={px(d.posY)} r={r + 4}
                      fill="transparent"
                      style={{ cursor: interactive ? (isSel ? 'grab' : 'pointer') : 'default' }}
                      onPointerDown={e => interactive && startOpeningDrag(e, d.id, 'door')}
                      onClick={e => { if (interactive) { e.stopPropagation(); setSelOpeningId(d.id); setSelOpeningType('door') }}}
                    />
                    {/* Architectural door symbol: arc + leaf */}
                    <path
                      d={`M ${px(d.posX)} ${px(d.posY)} L ${px(d.posX) + r} ${px(d.posY)} A ${r} ${r} 0 0 0 ${px(d.posX)} ${px(d.posY) - r}`}
                      fill={isSel ? '#ff8f00' : 'none'} fillOpacity={0.18}
                      stroke="#ff7043" strokeWidth={isSel ? 2 : 1.5} strokeDasharray={isSel ? 'none' : '3,2'}
                      style={{ pointerEvents: 'none' }}/>
                    <line x1={px(d.posX)} y1={px(d.posY)} x2={px(d.posX) + r} y2={px(d.posY)}
                      stroke="#ff7043" strokeWidth="1.5" style={{ pointerEvents: 'none' }}/>
                    {/* Move handle on selection */}
                    {isSel && (
                      <circle cx={px(d.posX)} cy={px(d.posY)} r="4"
                        fill="#ff8f00" stroke="white" strokeWidth="1.5"
                        style={{ cursor: 'grab', pointerEvents: 'all' }}
                        onPointerDown={e => startOpeningDrag(e, d.id, 'door')}/>
                    )}
                  </g>
                )
              })}

              {/* ── Windows ──────────────────────────────────────────── */}
              {editWindows.map(w => {
                const isSel = w.id === selOpeningId && selOpeningType === 'window' && tab === 'openings'
                const interactive = tab === 'openings' && !openingMode
                const hw = w.width * SCALE / 2
                return (
                  <g key={w.id}>
                    {/* Hit / drag area */}
                    <rect x={px(w.posX) - hw - 4} y={px(w.posY) - 9} width={w.width * SCALE + 8} height={18}
                      fill="transparent"
                      style={{ cursor: interactive ? (isSel ? 'grab' : 'pointer') : 'default' }}
                      onPointerDown={e => interactive && startOpeningDrag(e, w.id, 'window')}
                      onClick={e => { if (interactive) { e.stopPropagation(); setSelOpeningId(w.id); setSelOpeningType('window') }}}
                    />
                    {/* Window symbol: glass pane + glazing bars */}
                    <rect x={px(w.posX) - hw} y={px(w.posY) - 5} width={w.width * SCALE} height={10}
                      fill="#b3e5fc" fillOpacity={isSel ? 0.85 : 0.6}
                      stroke="#0288d1" strokeWidth={isSel ? 2 : 1}
                      style={{ pointerEvents: 'none' }}/>
                    <line x1={px(w.posX)} y1={px(w.posY) - 5} x2={px(w.posX)} y2={px(w.posY) + 5}
                      stroke="#0288d1" strokeWidth="0.8" opacity="0.6"
                      style={{ pointerEvents: 'none' }}/>
                    {/* Move handle on selection */}
                    {isSel && (
                      <circle cx={px(w.posX)} cy={px(w.posY)} r="4"
                        fill="#0288d1" stroke="white" strokeWidth="1.5"
                        style={{ cursor: 'grab', pointerEvents: 'all' }}
                        onPointerDown={e => startOpeningDrag(e, w.id, 'window')}/>
                    )}
                  </g>
                )
              })}

              {/* Draw mode preview */}
              {drawStart && cursorM && (
                <line x1={px(drawStart.x)} y1={px(drawStart.y)}
                  x2={px(cursorM.x)} y2={px(cursorM.y)}
                  stroke="#1565c0" strokeWidth="2" strokeDasharray="5,3"
                  style={{ pointerEvents: 'none' }}/>
              )}
              {drawStart && (
                <circle cx={px(drawStart.x)} cy={px(drawStart.y)} r="5"
                  fill="#1565c0" stroke="white" strokeWidth="1.5"
                  style={{ pointerEvents: 'none' }}/>
              )}
            </g>
          </svg>
        </div>

        {/* ── Properties Panel ──────────────────────────────────────── */}
        <div className="w-56 shrink-0 space-y-4 text-sm">

          {/* ── ROOMS tab ──────────────────────────────────────────── */}
          {tab === 'rooms' && (
            <>
              <button onClick={addRoom}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors">
                + Add Room
              </button>

              {selRoom ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Room Properties</p>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Name</label>
                    <input value={selRoom.name} onChange={e => patchRoom({ name: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Type</label>
                    <select value={selRoom.type} onChange={e => patchRoom({ type: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                      {ROOM_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['w','h','x','y'] as const).map(f => (
                      <div key={f} className="space-y-1">
                        <label className="text-xs text-slate-500">
                          {f === 'w' ? 'Width (m)' : f === 'h' ? 'Depth (m)' : f === 'x' ? 'X pos' : 'Y pos'}
                        </label>
                        <input type="number" step={0.25} min={f === 'w' || f === 'h' ? MIN_SZ : 0}
                          value={selRoom[f]} onChange={e => patchRoom({ [f]: +e.target.value })}
                          className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-slate-400 font-mono bg-slate-50 rounded-lg px-2 py-1.5">
                    Area: {(selRoom.w * selRoom.h).toFixed(2)} m²
                  </div>
                  <button onClick={deleteRoom}
                    className="w-full py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                    Delete Room
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
                  Click a room to edit
                </div>
              )}

              {/* Room list */}
              <div className="space-y-0.5 max-h-44 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">All Rooms</p>
                {rooms.map(r => (
                  <button key={r.id} onClick={() => { setSelRoomId(r.id); setSelWallId(null) }}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      r.id === selRoomId ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-600'
                    }`}>
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: ROOM_FILL[r.type] ?? '#e0e0e0' }}/>
                    <span className="truncate">{r.name}</span>
                    <span className="ml-auto shrink-0 text-slate-400">{(r.w*r.h).toFixed(0)}m²</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── WALLS tab ──────────────────────────────────────────── */}
          {tab === 'walls' && (
            <>
              {/* Draw / cancel */}
              <div className="flex gap-2">
                <button onClick={() => { setIsDrawing(!isDrawing); setDrawStart(null) }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isDrawing
                      ? 'bg-blue-600 text-white'
                      : 'border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50'
                  }`}>
                  {isDrawing ? (drawStart ? '→ Click 2nd point' : '→ Click 1st point') : '+ Draw Wall'}
                </button>
                {isDrawing && (
                  <button onClick={() => { setIsDrawing(false); setDrawStart(null) }}
                    className="px-2 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs">
                    Esc
                  </button>
                )}
              </div>

              {selWall ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Wall Properties</p>

                  {/* External toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selWall.isExternal}
                      onChange={e => patchWall({ isExternal: e.target.checked })}
                      className="w-4 h-4 accent-blue-600"/>
                    <span className="text-xs text-slate-600 font-medium">External Wall</span>
                  </label>

                  {/* Thickness */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Thickness</span>
                      <span className="font-mono text-blue-600">{selWall.thickness.toFixed(2)} m</span>
                    </div>
                    <input type="range" min={0.1} max={0.5} step={0.05} value={selWall.thickness}
                      onChange={e => patchWall({ thickness: +e.target.value })}
                      className="w-full accent-blue-600 h-1.5"/>
                    <div className="flex justify-between text-xs text-slate-300"><span>0.1m</span><span>0.5m</span></div>
                  </div>

                  {/* Height */}
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Height (m)</label>
                    <input type="number" min={1.5} max={6} step={0.1} value={selWall.height}
                      onChange={e => patchWall({ height: +e.target.value })}
                      className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>

                  {/* Length info */}
                  <div className="text-xs text-slate-400 font-mono bg-slate-50 rounded-lg px-2 py-1.5">
                    Length: {Math.hypot(selWall.endX - selWall.startX, selWall.endY - selWall.startY).toFixed(2)} m
                  </div>

                  <button onClick={deleteWall}
                    className="w-full py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                    Delete Wall
                  </button>
                </div>
              ) : (
                !isDrawing && (
                  <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
                    Click a wall to edit its thickness and endpoints
                  </div>
                )
              )}

              {/* Wall list */}
              <div className="space-y-0.5 max-h-44 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  All Walls ({walls.length})
                </p>
                {walls.map(w => {
                  const len = Math.hypot(w.endX - w.startX, w.endY - w.startY)
                  return (
                    <button key={w.id} onClick={() => { setSelWallId(w.id); setSelRoomId(null) }}
                      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        w.id === selWallId ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-600'
                      }`}>
                      <span className={`w-3 h-3 rounded-sm shrink-0 ${w.isExternal ? 'bg-slate-700' : 'bg-slate-400'}`}/>
                      <span className="truncate">{w.isExternal ? 'External' : 'Internal'}</span>
                      <span className="ml-auto shrink-0 text-slate-400">{len.toFixed(1)}m</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ── OPENINGS tab ───────────────────────────────────────── */}
          {tab === 'openings' && (
            <>
              {/* Add buttons */}
              <div className="flex gap-2">
                <button onClick={() => { setOpeningMode(openingMode === 'door' ? null : 'door'); setSelOpeningId(null) }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    openingMode === 'door'
                      ? 'bg-orange-500 text-white'
                      : 'border-2 border-dashed border-orange-300 text-orange-600 hover:bg-orange-50'
                  }`}>
                  {openingMode === 'door' ? '→ Click a wall' : '+ Door'}
                </button>
                <button onClick={() => { setOpeningMode(openingMode === 'window' ? null : 'window'); setSelOpeningId(null) }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    openingMode === 'window'
                      ? 'bg-blue-500 text-white'
                      : 'border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50'
                  }`}>
                  {openingMode === 'window' ? '→ Click a wall' : '+ Window'}
                </button>
              </div>

              {/* Properties panel */}
              {selDoor && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Door Properties</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Width (m)</label>
                      <input type="number" min={0.6} max={2.4} step={0.1} value={selDoor.width}
                        onChange={e => patchDoor({ width: +e.target.value })}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Height (m)</label>
                      <input type="number" min={1.8} max={3.0} step={0.05} value={selDoor.height}
                        onChange={e => patchDoor({ height: +e.target.value })}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">X pos (m)</label>
                      <input type="number" step={0.05} value={+selDoor.posX.toFixed(2)}
                        onChange={e => {
                          const wall = walls.find(w => w.id === selDoor.wallId)
                          if (!wall) return
                          const proj = projectOntoWall(+e.target.value, selDoor.posY, wall)
                          patchDoor({ posX: proj.x, posY: proj.y })
                        }}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Y pos (m)</label>
                      <input type="number" step={0.05} value={+selDoor.posY.toFixed(2)}
                        onChange={e => {
                          const wall = walls.find(w => w.id === selDoor.wallId)
                          if (!wall) return
                          const proj = projectOntoWall(selDoor.posX, +e.target.value, wall)
                          patchDoor({ posX: proj.x, posY: proj.y })
                        }}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">Drag the orange dot to reposition along wall</p>
                  <button onClick={deleteDoor}
                    className="w-full py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                    Delete Door
                  </button>
                </div>
              )}

              {selWindow && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Window Properties</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Width (m)</label>
                      <input type="number" min={0.4} max={3.0} step={0.1} value={selWindow.width}
                        onChange={e => patchWindow({ width: +e.target.value })}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Height (m)</label>
                      <input type="number" min={0.4} max={2.4} step={0.1} value={selWindow.height}
                        onChange={e => patchWindow({ height: +e.target.value })}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">X pos (m)</label>
                      <input type="number" step={0.05} value={+selWindow.posX.toFixed(2)}
                        onChange={e => {
                          const wall = walls.find(w => w.id === selWindow.wallId)
                          if (!wall) return
                          const proj = projectOntoWall(+e.target.value, selWindow.posY, wall)
                          patchWindow({ posX: proj.x, posY: proj.y })
                        }}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Y pos (m)</label>
                      <input type="number" step={0.05} value={+selWindow.posY.toFixed(2)}
                        onChange={e => {
                          const wall = walls.find(w => w.id === selWindow.wallId)
                          if (!wall) return
                          const proj = projectOntoWall(selWindow.posX, +e.target.value, wall)
                          patchWindow({ posX: proj.x, posY: proj.y })
                        }}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Sill Height</span>
                      <span className="font-mono text-blue-600">{selWindow.sillHeight.toFixed(2)} m</span>
                    </div>
                    <input type="range" min={0} max={1.5} step={0.05} value={selWindow.sillHeight}
                      onChange={e => patchWindow({ sillHeight: +e.target.value })}
                      className="w-full accent-blue-600 h-1.5"/>
                    <div className="flex justify-between text-xs text-slate-300"><span>0m</span><span>1.5m</span></div>
                  </div>
                  <p className="text-xs text-slate-400">Drag the blue dot to reposition along wall</p>
                  <button onClick={deleteWindow}
                    className="w-full py-1.5 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                    Delete Window
                  </button>
                </div>
              )}

              {!selDoor && !selWindow && !openingMode && (
                <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
                  Click + Door or + Window, then click near a wall to place
                </div>
              )}

              {/* Lists */}
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Doors ({editDoors.length}) · Windows ({editWindows.length})
                </p>
                {editDoors.map(d => (
                  <button key={d.id} onClick={() => { setSelOpeningId(d.id); setSelOpeningType('door') }}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      d.id === selOpeningId && selOpeningType === 'door' ? 'bg-orange-50 text-orange-700 font-medium' : 'hover:bg-slate-50 text-slate-600'
                    }`}>
                    <span className="w-3 h-3 rounded-full border-2 border-orange-400 shrink-0"/>
                    Door {d.width.toFixed(1)}×{d.height.toFixed(1)} m
                  </button>
                ))}
                {editWindows.map(w => (
                  <button key={w.id} onClick={() => { setSelOpeningId(w.id); setSelOpeningType('window') }}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      w.id === selOpeningId && selOpeningType === 'window' ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-600'
                    }`}>
                    <span className="w-3 h-2 bg-blue-200 border border-blue-400 shrink-0"/>
                    Window {w.width.toFixed(1)}×{w.height.toFixed(1)} m · sill {w.sillHeight.toFixed(1)}m
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── STRUCTURE tab ──────────────────────────────────────── */}
          {tab === 'structure' && (
            <>
              <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2 leading-relaxed">
                Red lines show structural grid axes. Edit bay spacings, then Apply to regenerate columns, beams and MEP.
              </p>
              {/* X spacings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">X Bays</span>
                  <button onClick={() => setSpacingsX(s => [...s, 6])} className="text-xs text-blue-600 hover:underline">+ Add</button>
                </div>
                {spacingsX.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 w-4">{i+1}</span>
                    <input type="number" min={2} max={12} step={0.5} value={s}
                      onChange={e => setSpacingsX(prev => prev.map((v,j) => j===i ? +e.target.value : v))}
                      className="flex-1 px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    <span className="text-xs text-slate-400">m</span>
                    <button onClick={() => setSpacingsX(prev => prev.filter((_,j) => j!==i))}
                      className="text-red-400 hover:text-red-600 font-bold">×</button>
                  </div>
                ))}
              </div>
              {/* Y spacings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Y Bays</span>
                  <button onClick={() => setSpacingsY(s => [...s, 6])} className="text-xs text-blue-600 hover:underline">+ Add</button>
                </div>
                {spacingsY.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 w-4">{i+1}</span>
                    <input type="number" min={2} max={12} step={0.5} value={s}
                      onChange={e => setSpacingsY(prev => prev.map((v,j) => j===i ? +e.target.value : v))}
                      className="flex-1 px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    <span className="text-xs text-slate-400">m</span>
                    <button onClick={() => setSpacingsY(prev => prev.filter((_,j) => j!==i))}
                      className="text-red-400 hover:text-red-600 font-bold">×</button>
                  </div>
                ))}
              </div>
              {/* Floor height */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">Floor Height</span>
                  <span className="font-mono text-blue-600 font-semibold">{floorH.toFixed(1)} m</span>
                </div>
                <input type="range" min={2.5} max={5.0} step={0.1} value={floorH}
                  onChange={e => setFloorH(+e.target.value)} className="w-full accent-blue-600 h-1.5"/>
                <div className="flex justify-between text-xs text-slate-300"><span>2.5m</span><span>5.0m</span></div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <span className="w-4 h-1 bg-slate-700 rounded"/>External wall
        </span>
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <span className="w-4 h-0.5 bg-slate-400 rounded"/>Internal wall
        </span>
        {ROOM_TYPES.slice(0, 7).map(t => (
          <span key={t} className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ROOM_FILL[t] ?? '#e0e0e0' }}/>
            {t.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    </div>
  )
}
