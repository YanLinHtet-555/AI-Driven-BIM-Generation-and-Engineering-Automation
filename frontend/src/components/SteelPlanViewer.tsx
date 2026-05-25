import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GenerationResponse } from '../types/api'
import { optimizeModel, patchModel } from '../api/client'

interface Props {
  result: GenerationResponse
  onUpdate?: (r: GenerationResponse) => void
}

// W-shape section lists (mirrors backend steel_engine.py databases)
const BEAM_SECTIONS = [
  'W150x14','W200x22','W200x36','W250x25','W250x49',
  'W310x39','W310x60','W360x39','W360x64','W410x54',
  'W460x68','W530x82','W610x101',
]
const COL_SECTIONS = [
  'W150x22','W200x27','W200x52','W250x45','W250x73',
  'W310x52','W310x97','W360x57','W360x110',
]

const STATUS_COLOR: Record<string, string> = {
  ok:           '#22c55e',
  warning:      '#f59e0b',
  overstressed: '#ef4444',
}

// SVG layout constants
const L_EXT = 80; const T_EXT = 80; const R_EXT = 30; const B_EXT = 30
const BUBBLE_R = 10; const BUB_TOP = 14; const DIM_Y = 52
const BUB_LEFT = 14; const DIM_X = 52
const SVG_W = 540; const SVG_H = 440

function UtilBar({ u, status }: { u: number; status: string }) {
  const pct = Math.min(u * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: STATUS_COLOR[status] }} />
      </div>
      <span className="text-xs w-9 text-right font-mono" style={{ color: STATUS_COLOR[status] }}>
        {(u * 100).toFixed(0)}%
      </span>
    </div>
  )
}

function NumInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        type="number" step="0.1" value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
    </label>
  )
}

export default function SteelPlanViewer({ result, onUpdate }: Props) {
  const model   = result.building_model
  const members = model.steel_members ?? []
  const sg      = model.structural_grid

  // ── floor list ──────────────────────────────────────────────────
  const floorList = useMemo(() => {
    const s = new Set(members.map(m => m.floor))
    return Array.from(s).sort((a, b) => a - b)
  }, [members])
  const [activeFloor, setActiveFloor] = useState(floorList[0] ?? 0)

  // ── grid positions ───────────────────────────────────────────────
  const gridXs = useMemo(() => {
    if (!sg) return []
    const xs = [sg.origin_x]
    for (const sp of sg.spacings_x) xs.push(+(xs[xs.length - 1] + sp).toFixed(3))
    return xs
  }, [sg])
  const gridYs = useMemo(() => {
    if (!sg) return []
    const ys = [sg.origin_y]
    for (const sp of sg.spacings_y) ys.push(+(ys[ys.length - 1] + sp).toFixed(3))
    return ys
  }, [sg])

  // ── natural SVG content geometry ─────────────────────────────────
  const siteW = model.requirements.site_width
  const siteD = model.requirements.site_depth
  const scale = Math.min((SVG_W - L_EXT - R_EXT) / siteW, (SVG_H - T_EXT - B_EXT) / siteD)
  const W = siteW * scale + L_EXT + R_EXT
  const H = siteD * scale + T_EXT + B_EXT
  const sx = (x: number) => L_EXT + x * scale
  const sy = (y: number) => H - B_EXT - y * scale

  // ── zoom / pan ──────────────────────────────────────────────────
  const svgRef  = useRef<SVGSVGElement>(null)
  const [zoom,   setZoom]   = useState(1)
  const [pan,    setPan]    = useState({ x: (SVG_W - W) / 2, y: (SVG_H - H) / 2 })
  const [cursor, setCursor] = useState('default')
  const zRef = useRef(zoom); zRef.current = zoom
  const pRef = useRef(pan);  pRef.current = pan
  const drag = useRef({ on: false, mx: 0, my: 0, px: 0, py: 0 })
  const didPan = useRef(false)

  useEffect(() => {
    setZoom(1)
    setPan({ x: (SVG_W - W) / 2, y: (SVG_H - H) / 2 })
    setSelectedRefId(null)
    setAddMode(false)
    setAddStart(null)
    setGhostEnd(null)
  }, [model.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const f  = e.deltaY < 0 ? 1.2 : 1 / 1.2
      const z  = zRef.current; const p = pRef.current
      const nz = Math.max(0.2, Math.min(8, z * f))
      setZoom(nz)
      setPan({ x: mx - (mx - p.x) * (nz / z), y: my - (my - p.y) * (nz / z) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomToCenter = (f: number) => {
    const cx = SVG_W / 2; const cy = SVG_H / 2
    const z = zRef.current; const p = pRef.current
    const nz = Math.max(0.2, Math.min(8, z * f))
    setZoom(nz)
    setPan({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) })
  }
  const handleFit = () => { setZoom(1); setPan({ x: (SVG_W - W) / 2, y: (SVG_H - H) / 2 }) }

  // ── interaction state ───────────────────────────────────────────
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null)
  const [addMode,  setAddMode]  = useState(false)
  const [addStart, setAddStart] = useState<{ x: number; y: number } | null>(null)
  const [ghostEnd, setGhostEnd] = useState<{ x: number; y: number } | null>(null)
  const [endpointDrag, setEndpointDrag] = useState<{
    beamId: string; endpoint: 'start' | 'end'; currentX: number; currentY: number
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [snapPreview, setSnapPreview] = useState<{ x: number; y: number } | null>(null)
  const [addColMode, setAddColMode] = useState(false)
  const [colDrag, setColDrag] = useState<{ colId: string; currentX: number; currentY: number } | null>(null)
  const [colPosInput, setColPosInput] = useState({ x: '', y: '' })

  // Convert screen mouse pos → building coordinates
  const toBuilding = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const cx = (e.clientX - rect.left - pRef.current.x) / zRef.current
    const cy = (e.clientY - rect.top  - pRef.current.y) / zRef.current
    return {
      x: +Math.max(0, Math.min(siteW, (cx - L_EXT) / scale)).toFixed(3),
      y: +Math.max(0, Math.min(siteD, (H - B_EXT - cy) / scale)).toFixed(3),
    }
  }, [siteW, siteD, scale, H])

  // Snap a building coordinate to the nearest column position
  const snapToColumn = useCallback((x: number, y: number) => {
    const cols = model.columns
    if (!cols.length) return { x, y }
    let best = cols[0]
    let bestDist = Infinity
    for (const c of cols) {
      const d = Math.hypot(c.position.x - x, c.position.y - y)
      if (d < bestDist) { bestDist = d; best = c }
    }
    return { x: best.position.x, y: best.position.y }
  }, [model.columns])

  // ── SVG event handlers ─────────────────────────────────────────
  const handleSVGMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (addMode || addColMode) return
    didPan.current = false
    drag.current = { on: true, mx: e.clientX, my: e.clientY, px: pRef.current.x, py: pRef.current.y }
    setCursor('grabbing')
  }

  const handleSVGMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (endpointDrag) {
      const raw = toBuilding(e)
      const { x, y } = snapToColumn(raw.x, raw.y)
      setEndpointDrag(prev => prev ? { ...prev, currentX: x, currentY: y } : null)
      setSnapPreview({ x, y })
      return
    }
    if (colDrag) {
      const { x, y } = toBuilding(e)
      setColDrag(prev => prev ? { ...prev, currentX: x, currentY: y } : null)
      return
    }
    if (drag.current.on) {
      const dx = e.clientX - drag.current.mx
      const dy = e.clientY - drag.current.my
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didPan.current = true
      if (didPan.current) setPan({ x: drag.current.px + dx, y: drag.current.py + dy })
    }
    if (addMode) {
      const raw = toBuilding(e)
      const snapped = snapToColumn(raw.x, raw.y)
      setSnapPreview(snapped)
      if (addStart) setGhostEnd(snapped)
    } else if (addColMode) {
      setSnapPreview(toBuilding(e))
    } else {
      setSnapPreview(null)
    }
  }

  const handleSVGMouseUp = (_e: React.MouseEvent<SVGSVGElement>) => {
    drag.current.on = false
    if (endpointDrag) {
      const saved = { ...endpointDrag }
      setEndpointDrag(null)
      setCursor(addMode ? 'crosshair' : 'default')
      commitBeamEndpoint(saved.beamId, saved.endpoint, saved.currentX, saved.currentY)
      return
    }
    if (colDrag) {
      const saved = { ...colDrag }
      setColDrag(null)
      setCursor('default')
      commitMoveColumn(saved.colId, saved.currentX, saved.currentY)
      return
    }
    setCursor(addMode || addColMode ? 'crosshair' : 'default')
  }

  const handleSVGClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (didPan.current) return
    const raw = toBuilding(e)
    if (addColMode) {
      commitAddColumn(raw.x, raw.y)
      setSnapPreview(null)
      return
    }
    const { x, y } = snapToColumn(raw.x, raw.y)
    if (addMode) {
      if (!addStart) {
        setAddStart({ x, y })
      } else {
        commitAddBeam(addStart, { x, y })
        setAddStart(null); setGhostEnd(null); setSnapPreview(null)
      }
      return
    }
    setSelectedRefId(null)
  }

  // ── PATCH helpers ──────────────────────────────────────────────
  const beamsForFloor = () =>
    model.beams.filter(b => b.floor === activeFloor).map(b => ({
      id: b.id, start_x: b.start.x, start_y: b.start.y,
      end_x: b.end.x, end_y: b.end.y,
      floor: b.floor, width: b.width, depth: b.depth, grid_ref: b.grid_ref ?? '',
    }))

  const commitBeamEndpoint = async (
    beamId: string, endpoint: 'start' | 'end', x: number, y: number
  ) => {
    if (!onUpdate) return
    const beams = beamsForFloor().map(b =>
      b.id !== beamId ? b : {
        ...b,
        start_x: endpoint === 'start' ? x : b.start_x,
        start_y: endpoint === 'start' ? y : b.start_y,
        end_x:   endpoint === 'end'   ? x : b.end_x,
        end_y:   endpoint === 'end'   ? y : b.end_y,
      }
    )
    setSaving(true)
    try { onUpdate(await patchModel(model.id, { floor: activeFloor, beams, steel_overrides: model.steel_overrides })) }
    finally { setSaving(false) }
  }

  const commitSectionOverride = async (refId: string, designation: string) => {
    if (!onUpdate) return
    const overrides = [
      ...model.steel_overrides.filter(o => o.ref_id !== refId),
      { ref_id: refId, designation },
    ]
    setSaving(true)
    try { onUpdate(await patchModel(model.id, { floor: activeFloor, steel_overrides: overrides })) }
    finally { setSaving(false) }
  }

  const commitRemoveOverride = async (refId: string) => {
    if (!onUpdate) return
    const overrides = model.steel_overrides.filter(o => o.ref_id !== refId)
    setSaving(true)
    try { onUpdate(await patchModel(model.id, { floor: activeFloor, steel_overrides: overrides })) }
    finally { setSaving(false) }
  }

  const commitBeamPositionEdit = async (beamId: string, sx2: number, sy2: number, ex2: number, ey2: number) => {
    if (!onUpdate) return
    const beams = beamsForFloor().map(b =>
      b.id !== beamId ? b : { ...b, start_x: sx2, start_y: sy2, end_x: ex2, end_y: ey2 }
    )
    setSaving(true)
    try { onUpdate(await patchModel(model.id, { floor: activeFloor, beams, steel_overrides: model.steel_overrides })) }
    finally { setSaving(false) }
  }

  const commitDeleteBeam = async (beamId: string) => {
    if (!onUpdate) return
    const beams = beamsForFloor().filter(b => b.id !== beamId)
    const overrides = model.steel_overrides.filter(o => o.ref_id !== beamId)
    setSaving(true)
    try {
      onUpdate(await patchModel(model.id, { floor: activeFloor, beams, steel_overrides: overrides }))
      setSelectedRefId(null)
    } finally { setSaving(false) }
  }

  const commitAddBeam = async (start: { x: number; y: number }, end: { x: number; y: number }) => {
    if (!onUpdate) return
    const beams = [
      ...beamsForFloor(),
      { id: `new-${Date.now()}`, start_x: start.x, start_y: start.y,
        end_x: end.x, end_y: end.y, floor: activeFloor, width: 0.3, depth: 0.5, grid_ref: '' },
    ]
    setSaving(true)
    try {
      const updated = await patchModel(model.id, { floor: activeFloor, beams, steel_overrides: model.steel_overrides })
      onUpdate(updated)
      setAddMode(false)
    } finally { setSaving(false) }
  }

  // ── Column PATCH helpers ───────────────────────────────────────
  const columnsPayload = () =>
    model.columns.map(c => ({ id: c.id, position: c.position, width: c.width, depth: c.depth }))

  const commitMoveColumn = async (colId: string, x: number, y: number) => {
    if (!onUpdate) return
    const columns = columnsPayload().map(c => c.id !== colId ? c : { ...c, position: { x, y } })
    setSaving(true)
    try { onUpdate(await patchModel(model.id, { floor: activeFloor, columns, steel_overrides: model.steel_overrides })) }
    finally { setSaving(false) }
  }

  const commitDeleteColumn = async (colId: string) => {
    if (!onUpdate) return
    const columns = columnsPayload().filter(c => c.id !== colId)
    const overrides = model.steel_overrides.filter(o => o.ref_id !== colId)
    setSaving(true)
    try {
      onUpdate(await patchModel(model.id, { floor: activeFloor, columns, steel_overrides: overrides }))
      setSelectedRefId(null)
    } finally { setSaving(false) }
  }

  const commitAddColumn = async (x: number, y: number) => {
    if (!onUpdate) return
    const columns = [...columnsPayload(), { id: `new-${Date.now()}`, position: { x, y }, width: 0.5, depth: 0.5 }]
    setSaving(true)
    try {
      onUpdate(await patchModel(model.id, { floor: activeFloor, columns, steel_overrides: model.steel_overrides }))
      setAddColMode(false)
    } finally { setSaving(false) }
  }

  const applyColPosInput = () => {
    if (!selectedRefId || !selectedColumn) return
    const x = parseFloat(colPosInput.x); const y = parseFloat(colPosInput.y)
    if (isNaN(x) || isNaN(y)) return
    commitMoveColumn(selectedRefId, x, y)
  }

  // ── Properties panel (beam) ─────────────────────────────────────
  const selectedBeam   = model.beams.find(b => b.id === selectedRefId)
  const selectedMember = members.find(m => m.ref_id === selectedRefId)
  const selectedColMem = !selectedBeam && selectedMember ? selectedMember : null

  // Local input state for position editing
  const [posInput, setPosInput] = useState({ sx: '', sy: '', ex: '', ey: '' })
  useEffect(() => {
    if (!selectedBeam) return
    setPosInput({
      sx: String(selectedBeam.start.x),
      sy: String(selectedBeam.start.y),
      ex: String(selectedBeam.end.x),
      ey: String(selectedBeam.end.y),
    })
  }, [selectedRefId, selectedBeam?.start.x, selectedBeam?.start.y, selectedBeam?.end.x, selectedBeam?.end.y]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedColumn = !selectedBeam ? model.columns.find(c => c.id === selectedRefId) : undefined
  useEffect(() => {
    if (!selectedColumn) return
    setColPosInput({ x: String(selectedColumn.position.x), y: String(selectedColumn.position.y) })
  }, [selectedRefId, selectedColumn?.position.x, selectedColumn?.position.y]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyPosInputs = () => {
    if (!selectedBeam) return
    const sx2 = parseFloat(posInput.sx); const sy2 = parseFloat(posInput.sy)
    const ex2 = parseFloat(posInput.ex); const ey2 = parseFloat(posInput.ey)
    if ([sx2, sy2, ex2, ey2].some(isNaN)) return
    const s = snapToColumn(sx2, sy2)
    const end = snapToColumn(ex2, ey2)
    commitBeamPositionEdit(selectedBeam.id, s.x, s.y, end.x, end.y)
  }

  // ── Summary ─────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const c = { ok: 0, warning: 0, overstressed: 0 }
    for (const m of members) c[m.status as keyof typeof c]++
    return c
  }, [members])

  const hasOverstressed = summary.overstressed > 0
  const hasWarning      = summary.warning > 0
  const needsAdjust     = hasOverstressed || hasWarning
  const [adjusting, setAdjusting] = useState(false)

  const handleAutoAdjust = async () => {
    if (!onUpdate) return
    setAdjusting(true)
    try { onUpdate(await optimizeModel(model.id)) }
    finally { setAdjusting(false) }
  }

  // ── Display data ────────────────────────────────────────────────
  const floorBeams = model.beams.filter(b => b.floor === activeFloor)
  const beamMems   = members.filter(m => m.member_type === 'beam')
  const colMems    = members.filter(m => m.member_type === 'column')
  const floorMembers = members.filter(m => m.floor === activeFloor)

  // ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Steel Structure Plan</h2>
          <p className="text-xs text-slate-400 mt-0.5">W-shape members · click to select · drag endpoint to reshape</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <svg className="w-3.5 h-3.5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>}
          {(['ok','warning','overstressed'] as const).map(s => (
            <span key={s} className="flex items-center gap-1 text-xs text-slate-600">
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {s === 'ok' ? 'OK' : s === 'warning' ? 'Warn' : 'Over'}
              <span className="font-semibold">{summary[s]}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {/* Floor tabs */}
          {floorList.map(f => (
            <button key={f} onClick={() => setActiveFloor(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                activeFloor === f ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}>
              Floor {f + 1}
            </button>
          ))}
          {/* Mode buttons */}
          <div className="flex gap-1 ml-2">
            <button onClick={() => { setAddMode(false); setAddColMode(false); setAddStart(null); setGhostEnd(null); setSnapPreview(null); setCursor('default') }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                !addMode && !addColMode ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 bg-white border border-slate-200'
              }`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
              </svg>
              Select
            </button>
            <button onClick={() => { setAddMode(true); setAddColMode(false); setSelectedRefId(null); setCursor('crosshair') }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                addMode ? 'bg-green-600 text-white' : 'text-slate-500 hover:text-slate-700 bg-white border border-slate-200'
              }`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {addStart ? 'Click end…' : 'Add Beam'}
            </button>
            <button onClick={() => { setAddColMode(true); setAddMode(false); setAddStart(null); setGhostEnd(null); setSelectedRefId(null); setCursor('crosshair') }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                addColMode ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-slate-700 bg-white border border-slate-200'
              }`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h14M5 21h14M5 3v18M19 3v18M12 3v18" />
              </svg>
              Add Col
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom strip */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden text-xs">
            <button onClick={() => zoomToCenter(1/1.3)} className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 font-bold">−</button>
            <span className="px-2 py-1.5 text-slate-500 font-mono min-w-[3rem] text-center border-x border-slate-200">{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomToCenter(1.3)}  className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 font-bold">+</button>
            <button onClick={handleFit} title="Fit" className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 border-l border-slate-200">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
          {/* Auto-adjust */}
          {needsAdjust && onUpdate && (
            <button onClick={handleAutoAdjust} disabled={adjusting}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60 ${
                hasOverstressed ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}>
              {adjusting
                ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
              }
              {adjusting ? 'Adjusting…' : hasOverstressed ? 'Fix Overstressed' : 'Optimize'}
            </button>
          )}
        </div>
      </div>

      {/* ── Main: SVG + side panel ─────────────────────────────── */}
      <div className="flex">

        {/* SVG */}
        <div className="flex-1 overflow-hidden bg-slate-50/30">
          <svg ref={svgRef} width={SVG_W} height={SVG_H}
            style={{ cursor, display: 'block', userSelect: 'none' }}
            onMouseDown={handleSVGMouseDown}
            onMouseMove={handleSVGMouseMove}
            onMouseUp={handleSVGMouseUp}
            onMouseLeave={e => { handleSVGMouseUp(e); setSnapPreview(null) }}
            onClick={handleSVGClick}
          >
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

              {/* Grid lines */}
              {sg && gridXs.map((gx, i) => (
                <line key={`vg-${i}`} x1={sx(gx)} y1={BUB_TOP + BUBBLE_R + 3} x2={sx(gx)} y2={H - B_EXT + 14}
                  stroke="#bfdbfe" strokeWidth={0.8} strokeDasharray="6 4" />
              ))}
              {sg && gridYs.map((gy, i) => (
                <line key={`hg-${i}`} x1={BUB_LEFT + BUBBLE_R + 3} y1={sy(gy)} x2={W - R_EXT + 14} y2={sy(gy)}
                  stroke="#bfdbfe" strokeWidth={0.8} strokeDasharray="6 4" />
              ))}

              {/* X chain dims */}
              {sg && gridXs.length >= 2 && (() => {
                const x0 = sx(gridXs[0]); const x1 = sx(gridXs[gridXs.length - 1])
                return (
                  <g>
                    <line x1={x0} y1={DIM_Y} x2={x1} y2={DIM_Y} stroke="#64748b" strokeWidth={0.75} />
                    {gridXs.map((gx, i) => (
                      <g key={`xt-${i}`}>
                        <line x1={sx(gx)} y1={DIM_Y-5} x2={sx(gx)} y2={DIM_Y+5} stroke="#64748b" strokeWidth={1} />
                        <line x1={sx(gx)} y1={DIM_Y+6} x2={sx(gx)} y2={T_EXT} stroke="#94a3b8" strokeWidth={0.4} strokeDasharray="2 2" />
                        {i > 0 && <text x={(sx(gx)+sx(gridXs[i-1]))/2} y={DIM_Y-8} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#334155">{sg.spacings_x[i-1]}m</text>}
                      </g>
                    ))}
                    <text x={(x0+x1)/2} y={DIM_Y+16} textAnchor="middle" fontSize={8} fontFamily="sans-serif" fill="#64748b">={siteW}m</text>
                  </g>
                )
              })()}

              {/* Y chain dims */}
              {sg && gridYs.length >= 2 && (() => {
                const yt = sy(gridYs[gridYs.length-1]); const yb = sy(gridYs[0])
                return (
                  <g>
                    <line x1={DIM_X} y1={yt} x2={DIM_X} y2={yb} stroke="#64748b" strokeWidth={0.75} />
                    {gridYs.map((gy, i) => (
                      <g key={`yt-${i}`}>
                        <line x1={DIM_X-5} y1={sy(gy)} x2={DIM_X+5} y2={sy(gy)} stroke="#64748b" strokeWidth={1} />
                        <line x1={DIM_X+6} y1={sy(gy)} x2={L_EXT} y2={sy(gy)} stroke="#94a3b8" strokeWidth={0.4} strokeDasharray="2 2" />
                        {i > 0 && (() => { const my = (sy(gy)+sy(gridYs[i-1]))/2; return (
                          <text key="lbl" x={DIM_X-8} y={my+4} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#334155" transform={`rotate(-90,${DIM_X-8},${my})`}>{sg.spacings_y[i-1]}m</text>
                        )})()}
                      </g>
                    ))}
                    <text x={DIM_X+16} y={(yt+yb)/2+4} textAnchor="middle" fontSize={8} fontFamily="sans-serif" fill="#64748b" transform={`rotate(-90,${DIM_X+16},${(yt+yb)/2})`}>={siteD}m</text>
                  </g>
                )
              })()}

              {/* Fallback dims */}
              {!sg && (() => {
                const x0=sx(0),x1=sx(siteW),y0=sy(0),y1=sy(siteD)
                return (<g>
                  <line x1={x0} y1={DIM_Y} x2={x1} y2={DIM_Y} stroke="#64748b" strokeWidth={0.75}/>
                  <line x1={x0} y1={DIM_Y-5} x2={x0} y2={DIM_Y+5} stroke="#64748b" strokeWidth={1}/>
                  <line x1={x1} y1={DIM_Y-5} x2={x1} y2={DIM_Y+5} stroke="#64748b" strokeWidth={1}/>
                  <text x={(x0+x1)/2} y={DIM_Y-8} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#334155">{siteW}m</text>
                  <line x1={DIM_X} y1={y1} x2={DIM_X} y2={y0} stroke="#64748b" strokeWidth={0.75}/>
                  <line x1={DIM_X-5} y1={y1} x2={DIM_X+5} y2={y1} stroke="#64748b" strokeWidth={1}/>
                  <line x1={DIM_X-5} y1={y0} x2={DIM_X+5} y2={y0} stroke="#64748b" strokeWidth={1}/>
                  <text x={DIM_X-8} y={(y0+y1)/2+4} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#334155" transform={`rotate(-90,${DIM_X-8},${(y0+y1)/2})`}>{siteD}m</text>
                </g>)
              })()}

              {/* Grid bubbles */}
              {sg && gridXs.map((gx,i) => (
                <g key={`bc-${i}`}>
                  <circle cx={sx(gx)} cy={BUB_TOP} r={BUBBLE_R} fill="white" stroke="#3b82f6" strokeWidth={1.2}/>
                  <text x={sx(gx)} y={BUB_TOP+3.5} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#2563eb" fontWeight="700">{sg.column_labels[i]}</text>
                </g>
              ))}
              {sg && gridYs.map((gy,i) => (
                <g key={`br-${i}`}>
                  <circle cx={BUB_LEFT} cy={sy(gy)} r={BUBBLE_R} fill="white" stroke="#3b82f6" strokeWidth={1.2}/>
                  <text x={BUB_LEFT} y={sy(gy)+3.5} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#2563eb" fontWeight="700">{sg.row_labels[i]}</text>
                </g>
              ))}

              {/* Site outline */}
              <rect x={sx(0)} y={sy(siteD)} width={siteW*scale} height={siteD*scale}
                fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="5 3" rx={2}/>

              {/* Column snap targets — highlight all columns in add/drag mode */}
              {(addMode || endpointDrag) && model.columns.map(c => (
                <circle key={`cs-${c.id}`}
                  cx={sx(c.position.x)} cy={sy(c.position.y)}
                  r={Math.max(c.width * scale, 7) * 0.9}
                  fill="none" stroke="#10b981" strokeWidth={1/zoom} opacity={0.5}
                  style={{ pointerEvents: 'none' }} />
              ))}

              {/* Snap preview ring — nearest column under cursor */}
              {(addMode || endpointDrag) && snapPreview && (
                <circle
                  cx={sx(snapPreview.x)} cy={sy(snapPreview.y)} r={10/zoom}
                  fill="#10b981" fillOpacity={0.2} stroke="#10b981" strokeWidth={2/zoom}
                  style={{ pointerEvents: 'none' }} />
              )}

              {/* Walls */}
              {model.walls.filter(w=>w.floor===activeFloor).map(w=>(
                <line key={w.id} x1={sx(w.start.x)} y1={sy(w.start.y)} x2={sx(w.end.x)} y2={sy(w.end.y)}
                  stroke="#e2e8f0" strokeWidth={3} strokeLinecap="round"/>
              ))}

              {/* Beams */}
              {floorBeams.map(beam => {
                const mem     = beamMems.find(m=>m.ref_id===beam.id)
                const color   = mem ? STATUS_COLOR[mem.status] : '#94a3b8'
                const isSel   = selectedRefId === beam.id
                // Apply live drag position
                const startX  = endpointDrag?.beamId===beam.id && endpointDrag.endpoint==='start' ? endpointDrag.currentX : beam.start.x
                const startY  = endpointDrag?.beamId===beam.id && endpointDrag.endpoint==='start' ? endpointDrag.currentY : beam.start.y
                const endX    = endpointDrag?.beamId===beam.id && endpointDrag.endpoint==='end'   ? endpointDrag.currentX : beam.end.x
                const endY    = endpointDrag?.beamId===beam.id && endpointDrag.endpoint==='end'   ? endpointDrag.currentY : beam.end.y
                const mx      = sx((startX+endX)/2); const my = sy((startY+endY)/2)
                const ang     = Math.atan2(endY-startY, endX-startX)*180/Math.PI
                const HR      = 6/zoom  // handle radius — constant screen size

                return (
                  <g key={beam.id}>
                    {/* Wide invisible hit area */}
                    <line x1={sx(startX)} y1={sy(startY)} x2={sx(endX)} y2={sy(endY)}
                      stroke="transparent" strokeWidth={14/zoom}
                      style={{cursor:'pointer'}}
                      onClick={e=>{e.stopPropagation(); if(!addMode) setSelectedRefId(beam.id)}}/>
                    {/* Visible beam */}
                    <line x1={sx(startX)} y1={sy(startY)} x2={sx(endX)} y2={sy(endY)}
                      stroke={isSel ? '#3b82f6' : color}
                      strokeWidth={(isSel ? 5 : 3.5)/zoom}
                      strokeLinecap="round"
                      style={{cursor:'pointer', pointerEvents:'none'}}/>
                    {/* Section label */}
                    {mem && (
                      <text x={mx} y={my-(6/zoom)} textAnchor="middle"
                        fontSize={9/zoom} fontFamily="monospace"
                        fill={isSel ? '#3b82f6' : color}
                        transform={`rotate(${-ang},${mx},${my})`}
                        style={{pointerEvents:'none'}}>
                        {mem.section.designation}
                      </text>
                    )}
                    {/* Drag handles (only when selected) */}
                    {isSel && (<>
                      <circle cx={sx(startX)} cy={sy(startY)} r={HR}
                        fill="white" stroke="#3b82f6" strokeWidth={1.5/zoom}
                        style={{cursor:'move'}}
                        onMouseDown={e=>{
                          e.stopPropagation()
                          setEndpointDrag({beamId:beam.id,endpoint:'start',currentX:beam.start.x,currentY:beam.start.y})
                          setCursor('move')
                        }}/>
                      <circle cx={sx(endX)} cy={sy(endY)} r={HR}
                        fill="white" stroke="#3b82f6" strokeWidth={1.5/zoom}
                        style={{cursor:'move'}}
                        onMouseDown={e=>{
                          e.stopPropagation()
                          setEndpointDrag({beamId:beam.id,endpoint:'end',currentX:beam.end.x,currentY:beam.end.y})
                          setCursor('move')
                        }}/>
                    </>)}
                  </g>
                )
              })}

              {/* Columns */}
              {colMems.map(m => {
                const col  = model.columns.find(c=>c.id===m.ref_id)
                if (!col) return null
                // Live drag position
                const px2 = colDrag?.colId === col.id ? colDrag.currentX : col.position.x
                const py2 = colDrag?.colId === col.id ? colDrag.currentY : col.position.y
                const cs   = Math.max(col.width*scale, 7)
                const isSel = selectedRefId === col.id
                return (
                  <g key={m.id}
                    style={{cursor: isSel ? 'move' : 'pointer'}}
                    onClick={e=>{e.stopPropagation(); if(!addMode && !addColMode) setSelectedRefId(col.id)}}
                    onMouseDown={e=>{
                      if (!isSel || addMode || addColMode) return
                      e.stopPropagation()
                      setColDrag({ colId: col.id, currentX: col.position.x, currentY: col.position.y })
                      setCursor('move')
                    }}>
                    <rect x={sx(px2)-cs/2} y={sy(py2)-cs/2}
                      width={cs} height={cs}
                      fill={isSel ? '#3b82f6' : STATUS_COLOR[m.status]}
                      stroke={isSel ? '#1d4ed8' : 'white'}
                      strokeWidth={isSel ? 2/zoom : 1}/>
                    <text x={sx(px2)} y={sy(py2)+cs/2+10/zoom}
                      textAnchor="middle" fontSize={8/zoom} fontFamily="monospace"
                      fill={isSel ? '#1d4ed8' : STATUS_COLOR[m.status]}
                      style={{pointerEvents:'none'}}>
                      {m.section.designation}
                    </text>
                  </g>
                )
              })}

              {/* Add-beam ghost line */}
              {addMode && addStart && ghostEnd && (
                <g style={{pointerEvents:'none'}}>
                  <line x1={sx(addStart.x)} y1={sy(addStart.y)} x2={sx(ghostEnd.x)} y2={sy(ghostEnd.y)}
                    stroke="#10b981" strokeWidth={2/zoom} strokeDasharray={`${6/zoom} ${4/zoom}`}/>
                  <circle cx={sx(addStart.x)} cy={sy(addStart.y)} r={5/zoom} fill="#10b981"/>
                  <circle cx={sx(ghostEnd.x)} cy={sy(ghostEnd.y)} r={4/zoom} fill="white" stroke="#10b981" strokeWidth={1.5/zoom}/>
                </g>
              )}
              {/* Add-beam start marker (no end yet) */}
              {addMode && addStart && !ghostEnd && (
                <circle cx={sx(addStart.x)} cy={sy(addStart.y)} r={5/zoom} fill="#10b981" style={{pointerEvents:'none'}}/>
              )}

              {/* Add-column ghost square */}
              {addColMode && snapPreview && (
                <g style={{pointerEvents:'none'}}>
                  <rect x={sx(snapPreview.x)-7/zoom} y={sy(snapPreview.y)-7/zoom}
                    width={14/zoom} height={14/zoom}
                    fill="#a855f7" fillOpacity={0.3} stroke="#a855f7" strokeWidth={1.5/zoom}
                    strokeDasharray={`${4/zoom} ${3/zoom}`}/>
                  <line x1={sx(snapPreview.x)-10/zoom} y1={sy(snapPreview.y)} x2={sx(snapPreview.x)+10/zoom} y2={sy(snapPreview.y)}
                    stroke="#a855f7" strokeWidth={1/zoom}/>
                  <line x1={sx(snapPreview.x)} y1={sy(snapPreview.y)-10/zoom} x2={sx(snapPreview.x)} y2={sy(snapPreview.y)+10/zoom}
                    stroke="#a855f7" strokeWidth={1/zoom}/>
                </g>
              )}

            </g>
          </svg>
        </div>

        {/* ── Side panel ─────────────────────────────────────────── */}
        <div className="w-64 min-w-[16rem] border-l border-slate-100 flex flex-col" style={{ maxHeight: SVG_H }}>

          {/* Properties panel — selected beam */}
          {selectedRefId && selectedBeam && selectedMember && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Beam Properties</span>
                <button onClick={() => setSelectedRefId(null)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {/* Section picker */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Section</label>
                <select
                  value={selectedMember.section.designation}
                  onChange={e => commitSectionOverride(selectedBeam.id, e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white font-mono"
                >
                  {BEAM_SECTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {model.steel_overrides.some(o => o.ref_id === selectedBeam.id) && (
                  <button onClick={() => commitRemoveOverride(selectedBeam.id)}
                    className="mt-1 text-xs text-amber-600 hover:text-amber-800 underline">
                    Reset to auto
                  </button>
                )}
              </div>

              {/* Position inputs */}
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Start point (m)</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <NumInput label="X" value={posInput.sx} onChange={v => setPosInput(p => ({ ...p, sx: v }))} />
                  <NumInput label="Y" value={posInput.sy} onChange={v => setPosInput(p => ({ ...p, sy: v }))} />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1.5">End point (m)</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <NumInput label="X" value={posInput.ex} onChange={v => setPosInput(p => ({ ...p, ex: v }))} />
                  <NumInput label="Y" value={posInput.ey} onChange={v => setPosInput(p => ({ ...p, ey: v }))} />
                </div>
              </div>
              <button onClick={applyPosInputs} disabled={saving}
                className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-60">
                Apply Position
              </button>

              {/* Utilization */}
              <div className="border-t border-slate-100 pt-2 space-y-1">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Span</span><span className="font-mono">{selectedMember.span_m} m</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Demand</span><span className="font-mono">{selectedMember.demand.toFixed(1)} kN·m</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Capacity</span><span className="font-mono">{selectedMember.capacity.toFixed(1)} kN·m</span>
                </div>
                <UtilBar u={selectedMember.utilization} status={selectedMember.status} />
              </div>

              {/* Delete */}
              <button onClick={() => commitDeleteBeam(selectedBeam.id)} disabled={saving}
                className="w-full py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg border border-red-200 disabled:opacity-60">
                Delete Beam
              </button>
            </div>
          )}

          {/* Properties panel — selected column */}
          {selectedRefId && selectedColMem && selectedColumn && (() => {
            return (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Column Properties</span>
                  <button onClick={() => setSelectedRefId(null)} className="text-slate-400 hover:text-slate-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>

                {/* Section picker */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Section</label>
                  <select
                    value={selectedColMem.section.designation}
                    onChange={e => commitSectionOverride(selectedColumn.id, e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white font-mono"
                  >
                    {COL_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {model.steel_overrides.some(o => o.ref_id === selectedColumn.id) && (
                    <button onClick={() => commitRemoveOverride(selectedColumn.id)}
                      className="mt-1 text-xs text-amber-600 hover:text-amber-800 underline">Reset to auto</button>
                  )}
                </div>

                {/* Position inputs */}
                <div>
                  <p className="text-xs text-slate-400 mb-1.5">Position (m) · drag to move</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumInput label="X" value={colPosInput.x} onChange={v => setColPosInput(p => ({ ...p, x: v }))} />
                    <NumInput label="Y" value={colPosInput.y} onChange={v => setColPosInput(p => ({ ...p, y: v }))} />
                  </div>
                </div>
                <button onClick={applyColPosInput} disabled={saving}
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-60">
                  Apply Position
                </button>

                {/* Utilization */}
                <div className="border-t border-slate-100 pt-2 space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Demand</span><span className="font-mono">{selectedColMem.demand.toFixed(0)} kN</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Capacity</span><span className="font-mono">{selectedColMem.capacity.toFixed(0)} kN</span>
                  </div>
                  <UtilBar u={selectedColMem.utilization} status={selectedColMem.status} />
                </div>

                {/* Delete */}
                <button onClick={() => commitDeleteColumn(selectedColumn.id)} disabled={saving}
                  className="w-full py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg border border-red-200 disabled:opacity-60">
                  Delete Column
                </button>
              </div>
            )
          })()}

          {/* Member list (default: nothing selected) */}
          {!selectedRefId && (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Section</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Util</th>
                  </tr>
                </thead>
                <tbody>
                  {floorMembers.map(m => (
                    <tr key={m.id}
                      onClick={() => { if(!addMode) setSelectedRefId(m.ref_id) }}
                      className={`border-t border-slate-50 cursor-pointer hover:bg-slate-50 ${
                        m.status==='overstressed' ? 'bg-red-50/40' : m.status==='warning' ? 'bg-amber-50/40' : ''
                      }`}>
                      <td className="px-3 py-2">
                        <div className="font-mono font-semibold text-slate-700">{m.section.designation}</div>
                        <div className="text-slate-400">{m.member_type} · {m.span_m}m</div>
                      </td>
                      <td className="px-3 py-2 w-28"><UtilBar u={m.utilization} status={m.status}/></td>
                    </tr>
                  ))}
                  {floorMembers.length === 0 && (
                    <tr><td colSpan={2} className="px-3 py-4 text-slate-400 text-center">No members on this floor</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Hint bar ────────────────────────────────────────────── */}
      <div className="px-5 py-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <span>{addColMode ? 'Add column mode: click anywhere to place a new column' : addMode ? 'Add beam mode: click columns to set start / end points' : 'Scroll to zoom · drag to pan · click member to select · drag selected column to move'}</span>
        {needsAdjust && (
          <span style={{ color: hasOverstressed ? '#ef4444' : '#f59e0b' }}>
            {hasOverstressed ? `${summary.overstressed} overstressed` : `${summary.warning} at capacity`}
          </span>
        )}
      </div>

    </div>
  )
}
