import { useState } from 'react'
import type { GenerationResponse, QuantityItem } from '../types/api'
import { ifcDownloadUrl, qtoDownloadUrl } from '../api/client'

interface Props { result: GenerationResponse }

const FIELD_LABELS: Record<string, string> = {
  building_type: 'Type', floors: 'Floors',
  site_width: 'Width', site_depth: 'Depth', structure_type: 'Structure',
}

function fmt(key: string, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (key === 'site_width' || key === 'site_depth') return `${v}m`
  if (typeof v === 'string') return v.replace(/_/g, ' ')
  return String(v)
}

const CATEGORIES = ['Structure', 'Envelope', 'HVAC', 'Plumbing', 'Electrical']
const CAT_COLOR: Record<string, string> = {
  Structure:  'bg-slate-100 text-slate-700',
  Envelope:   'bg-amber-50 text-amber-700',
  HVAC:       'bg-cyan-50 text-cyan-700',
  Plumbing:   'bg-blue-50 text-blue-700',
  Electrical: 'bg-yellow-50 text-yellow-700',
}

function QtoTable({ items }: { items: QuantityItem[] }) {
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(['Structure', 'Envelope']))

  const toggle = (cat: string) => setOpenCats(prev => {
    const next = new Set(prev)
    next.has(cat) ? next.delete(cat) : next.add(cat)
    return next
  })

  return (
    <div className="divide-y divide-slate-100">
      {CATEGORIES.map(cat => {
        const catItems = items.filter(i => i.category === cat)
        if (!catItems.length) return null
        const open = openCats.has(cat)
        return (
          <div key={cat}>
            <button onClick={() => toggle(cat)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium ${CAT_COLOR[cat] || 'bg-slate-50 text-slate-600'}`}>
              <span>{cat}</span>
              <span className="text-xs opacity-60">{open ? '▲' : '▼'} {catItems.length} items</span>
            </button>
            {open && (
              <table className="w-full text-xs">
                <tbody>
                  {catItems.map((item, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="py-1.5 px-3 text-slate-600">{item.item}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-slate-800 font-medium">
                        {item.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-1.5 px-3 text-slate-400 w-12">{item.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ResultsPanel({ result }: Props) {
  const { requirements, building_model, model_id } = result
  const qto = building_model.quantity_takeoff

  const uniqueRooms = building_model.rooms
    .filter(r => r.floor === 0)
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.name] = (acc[r.name] ?? 0) + 1
      return acc
    }, {})

  return (
    <div className="space-y-4">
      {/* Requirements */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Building Requirements</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {Object.entries(FIELD_LABELS).map(([key, label]) => (
            <div key={key}>
              <dt className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</dt>
              <dd className="text-sm text-slate-700 font-medium capitalize mt-0.5">
                {fmt(key, requirements[key as keyof typeof requirements])}
              </dd>
            </div>
          ))}
        </dl>
        {requirements.style && (
          <p className="mt-3 text-xs text-slate-500"><span className="font-medium">Style:</span> {requirements.style}</p>
        )}
        {qto && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-slate-800">{qto.total_floor_area} m²</div>
              <div className="text-xs text-slate-500">Ground Floor Area</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-slate-800">{qto.total_gross_area} m²</div>
              <div className="text-xs text-slate-500">Avg Floor Area</div>
            </div>
          </div>
        )}
      </div>

      {/* Room Schedule */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Room Schedule (GF)</h2>
        <div className="space-y-1.5">
          {Object.entries(uniqueRooms).map(([name, count]) => (
            <div key={name} className="flex justify-between items-center text-sm">
              <span className="text-slate-600">{name}</span>
              <span className="text-slate-400 font-medium text-xs bg-slate-100 px-2 py-0.5 rounded">×{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quantity Takeoff */}
      {qto && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800">Quantity Takeoff</h2>
            <a href={qtoDownloadUrl(model_id)} download={`${model_id}_qto.csv`}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Export CSV
            </a>
          </div>
          <QtoTable items={qto.items} />
        </div>
      )}

      {/* Export */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Export</h2>
        <a href={ifcDownloadUrl(model_id)} download={`${model_id}.ifc`}
          className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700
                     text-white font-medium py-3 px-6 rounded-xl transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          Download IFC File
        </a>
        <p className="mt-2 text-xs text-center text-slate-400">
          IFC4 · Architecture + Structure + MEP · Revit / ArchiCAD / BlenderBIM
        </p>
      </div>
    </div>
  )
}
