import { useState, useEffect, useRef } from 'react'
import type { GenerationResponse } from '../types/api'
import { floorplanUrl } from '../api/client'

interface Props {
  result: GenerationResponse
}

type LayerId = 'layer-base' | 'layer-walls' | 'layer-structure' | 'layer-hvac' | 'layer-plumbing' | 'layer-electrical'

const LAYERS: { id: LayerId; label: string; color: string }[] = [
  { id: 'layer-base',        label: 'Rooms',       color: '#4caf50' },
  { id: 'layer-walls',       label: 'Walls',        color: '#455a64' },
  { id: 'layer-structure',   label: 'Structure',    color: '#78909c' },
  { id: 'layer-hvac',        label: 'HVAC',         color: '#00838f' },
  { id: 'layer-plumbing',    label: 'Plumbing',     color: '#1565c0' },
  { id: 'layer-electrical',  label: 'Electrical',   color: '#f9a825' },
]

export default function FloorPlanViewer({ result }: Props) {
  const [activeFloor, setActiveFloor] = useState(0)
  const [visibleLayers, setVisibleLayers] = useState<Set<LayerId>>(
    new Set(LAYERS.map(l => l.id))
  )
  // Cache SVG text for each floor so layer toggles work on all floors inline
  const [floorSvgs, setFloorSvgs] = useState<Record<number, string>>({
    0: result.floor_plan_svg,
  })
  const svgRef = useRef<HTMLDivElement>(null)
  const floors = result.requirements.floors

  // Fetch SVG text for upper floors on demand
  useEffect(() => {
    if (activeFloor === 0 || floorSvgs[activeFloor]) return
    fetch(floorplanUrl(result.model_id, activeFloor))
      .then(r => r.text())
      .then(svg => setFloorSvgs(prev => ({ ...prev, [activeFloor]: svg })))
  }, [activeFloor, result.model_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLayer = (id: LayerId) => {
    setVisibleLayers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Apply layer visibility to the inline SVG after every relevant change
  useEffect(() => {
    if (!svgRef.current) return
    LAYERS.forEach(({ id }) => {
      const el = svgRef.current!.querySelector(`#${id}`) as SVGGElement | null
      if (el) el.style.display = visibleLayers.has(id) ? '' : 'none'
    })
  }, [visibleLayers, activeFloor, floorSvgs])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-slate-800">Floor Plan</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {floors > 1 && Array.from({ length: floors }, (_, i) => (
            <button key={i} onClick={() => setActiveFloor(i)}
              className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${
                activeFloor === i ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
              visibleLayers.has(id)
                ? 'border-transparent text-white'
                : 'border-slate-200 bg-white text-slate-400'
            }`}
            style={visibleLayers.has(id) ? { backgroundColor: color } : {}}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}/>
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
        {floorSvgs[activeFloor] ? (
          <div ref={svgRef}
            dangerouslySetInnerHTML={{ __html: floorSvgs[activeFloor] }}
            className="min-w-max"
          />
        ) : (
          <div className="flex items-center justify-center p-8 text-slate-400 text-sm">
            Loading floor {activeFloor + 1}…
          </div>
        )}
      </div>
    </div>
  )
}
