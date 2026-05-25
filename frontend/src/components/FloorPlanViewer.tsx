import { useState, useEffect, useRef } from 'react'
import type { GenerationResponse } from '../types/api'
import { floorplanUrl } from '../api/client'
import FloorPlanEditor from './FloorPlanEditor'

interface Props {
  result:    GenerationResponse
  onUpdate?: (updated: GenerationResponse) => void
}

type LayerId =
  | 'layer-grid' | 'layer-dims'
  | 'layer-base' | 'layer-walls' | 'layer-structure'
  | 'layer-hvac' | 'layer-plumbing' | 'layer-electrical'

const LAYERS: { id: LayerId; label: string; color: string }[] = [
  { id: 'layer-grid',       label: 'Grid',       color: '#90a4ae' },
  { id: 'layer-dims',       label: 'Dimensions', color: '#546e7a' },
  { id: 'layer-base',       label: 'Rooms',      color: '#4caf50' },
  { id: 'layer-walls',      label: 'Walls',      color: '#455a64' },
  { id: 'layer-structure',  label: 'Structure',  color: '#78909c' },
  { id: 'layer-hvac',       label: 'HVAC',       color: '#00838f' },
  { id: 'layer-plumbing',   label: 'Plumbing',   color: '#1565c0' },
  { id: 'layer-electrical', label: 'Electrical', color: '#f9a825' },
]

function bearingLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}

type FloorState = 'loading' | 'ok' | 'error'

export default function FloorPlanViewer({ result, onUpdate }: Props) {
  const [editing,       setEditing]       = useState(false)
  const [activeFloor,   setActiveFloor]   = useState(0)
  const [visibleLayers, setVisibleLayers] = useState<Set<LayerId>>(new Set(LAYERS.map(l => l.id)))
  const [floorSvgs,     setFloorSvgs]     = useState<Record<number, string>>({ 0: result.floor_plan_svg })
  const [floorStatus,   setFloorStatus]   = useState<Record<number, FloorState>>({ 0: 'ok' })
  const [northAngle,    setNorthAngle]    = useState(0)
  const [dragging,      setDragging]      = useState(false)

  const svgRef     = useRef<HTMLDivElement>(null)
  const compassRef = useRef<SVGSVGElement>(null)
  const prevIdRef  = useRef(result.model_id)
  const floors     = result.requirements.floors

  useEffect(() => {
    if (prevIdRef.current === result.model_id) return
    prevIdRef.current = result.model_id
    setFloorSvgs({ 0: result.floor_plan_svg })
    setFloorStatus({ 0: 'ok' })
    setActiveFloor(0)
    setEditing(false)
  }, [result.model_id, result.floor_plan_svg])

  useEffect(() => {
    if (activeFloor === 0) return
    if (floorSvgs[activeFloor] || floorStatus[activeFloor] === 'error') return
    setFloorStatus(prev => ({ ...prev, [activeFloor]: 'loading' }))
    fetch(floorplanUrl(result.model_id, activeFloor))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })
      .then(svg => {
        setFloorSvgs(prev => ({ ...prev, [activeFloor]: svg }))
        setFloorStatus(prev => ({ ...prev, [activeFloor]: 'ok' }))
      })
      .catch(() => setFloorStatus(prev => ({ ...prev, [activeFloor]: 'error' })))
  }, [activeFloor, result.model_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const retryFloor = (floor: number) =>
    setFloorStatus(prev => { const n = { ...prev }; delete n[floor]; return n })

  const toggleLayer = (id: LayerId) =>
    setVisibleLayers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => {
    if (!svgRef.current) return
    LAYERS.forEach(({ id }) => {
      const el = svgRef.current!.querySelector(`#${id}`) as SVGGElement | null
      if (el) el.style.display = visibleLayers.has(id) ? '' : 'none'
    })
  }, [visibleLayers, activeFloor, floorSvgs])

  const startCompassDrag = (e: React.MouseEvent) => { e.preventDefault(); setDragging(true) }
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      if (!compassRef.current) return
      const r = compassRef.current.getBoundingClientRect()
      const angle = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * (180 / Math.PI)
      setNorthAngle(((angle % 360) + 360) % 360)
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  const rotate = (delta: number) => setNorthAngle(a => ((a + delta) % 360 + 360) % 360)

  const handleApply = (updated: GenerationResponse) => {
    setFloorSvgs(prev => ({ ...prev, [activeFloor]: updated.floor_plan_svg }))
    setFloorStatus(prev => ({ ...prev, [activeFloor]: 'ok' }))
    setEditing(false)
    onUpdate?.(updated)
  }

  if (editing) {
    return (
      <FloorPlanEditor
        result={result}
        activeFloor={activeFloor}
        onApply={handleApply}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const status = floorStatus[activeFloor]

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Floor Plan</h2>
          {floors > 1 && (
            <p className="text-xs text-gray-400 mt-0.5">{floors} floors</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {floors > 1 && Array.from({ length: floors }, (_, i) => (
            <button key={i} onClick={() => setActiveFloor(i)}
              className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all ${
                activeFloor === i
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              L{i + 1}
            </button>
          ))}
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold
                       border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors bg-white">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Layout
          </button>
        </div>
      </div>

      {/* Layer toggles */}
      <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-gray-100 bg-gray-50/60">
        {LAYERS.map(({ id, label, color }) => (
          <button key={id} onClick={() => toggleLayer(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              visibleLayers.has(id)
                ? 'border-transparent text-white shadow-sm'
                : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
            }`}
            style={visibleLayers.has(id) ? { backgroundColor: color } : {}}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </button>
        ))}
      </div>

      {/* Canvas + compass */}
      <div className="relative bg-gray-50">
        <div className="overflow-auto p-3">
          {status === 'error' ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-600">Failed to load Floor {activeFloor + 1}</p>
              <button onClick={() => retryFloor(activeFloor)}
                className="px-4 py-1.5 text-xs font-semibold bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                Try again
              </button>
            </div>
          ) : status === 'loading' || !floorSvgs[activeFloor] ? (
            <div className="flex items-center justify-center py-16 gap-2.5 text-gray-400 text-sm">
              <svg className="w-4 h-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Loading floor {activeFloor + 1}…
            </div>
          ) : (
            <div ref={svgRef}
              dangerouslySetInnerHTML={{ __html: floorSvgs[activeFloor] }}
              className="min-w-max"
            />
          )}
        </div>

        {/* Compass rose */}
        <div className="absolute top-3 right-3 flex flex-col items-center gap-1 select-none z-10">
          <svg ref={compassRef} width="64" height="64" viewBox="-32 -32 64 64"
            className={`drop-shadow-md ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={startCompassDrag}>
            <circle r="30" fill="white" fillOpacity="0.95" stroke="#e2e8f0" strokeWidth="1.5" />
            <line x1="0" y1="-27" x2="0" y2="27" stroke="#f1f5f9" strokeWidth="0.8" />
            <line x1="-27" y1="0" x2="27" y2="0" stroke="#f1f5f9" strokeWidth="0.8" />
            <g transform={`rotate(${northAngle})`}>
              <polygon points="0,-22 -5,2 0,-1 5,2" fill="#ef4444" />
              <polygon points="0,22 -5,-2 0,1 5,-2" fill="#cbd5e1" />
              <text x="0" y="-26" textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fontWeight="700" fill="#ef4444" style={{ userSelect: 'none' }}>N</text>
            </g>
            <circle r="3.5" fill="white" stroke="#cbd5e1" strokeWidth="1" />
          </svg>
          <div className="flex items-center gap-1">
            <button onClick={() => rotate(-45)}
              className="w-6 h-6 rounded-md text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 leading-none"
              title="Rotate −45°">‹</button>
            <span className="text-xs text-gray-500 w-14 text-center font-mono tabular-nums">
              {bearingLabel(northAngle)} {Math.round(northAngle)}°
            </span>
            <button onClick={() => rotate(45)}
              className="w-6 h-6 rounded-md text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 leading-none"
              title="Rotate +45°">›</button>
          </div>
        </div>
      </div>

    </div>
  )
}
