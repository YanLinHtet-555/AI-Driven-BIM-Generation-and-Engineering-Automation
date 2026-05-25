import { useMemo, useState } from 'react'
import type { GenerationResponse } from '../types/api'

interface Props { result: GenerationResponse }

const STATUS_COLOR: Record<string, string> = {
  ok:           '#22c55e',
  warning:      '#f59e0b',
  overstressed: '#ef4444',
}

const PAD = 30

function utilBar(u: number, status: string) {
  const pct = Math.min(u * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, background: STATUS_COLOR[status] }}
        />
      </div>
      <span className="text-xs w-10 text-right font-mono" style={{ color: STATUS_COLOR[status] }}>
        {(u * 100).toFixed(0)}%
      </span>
    </div>
  )
}

export default function SteelPlanViewer({ result }: Props) {
  const model = result.building_model
  const members = model.steel_members ?? []

  const floorList = useMemo(() => {
    const s = new Set(members.map(m => m.floor))
    return Array.from(s).sort((a, b) => a - b)
  }, [members])

  const [activeFloor, setActiveFloor] = useState(floorList[0] ?? 0)

  const siteW = model.requirements.site_width
  const siteD = model.requirements.site_depth
  const scale = Math.min((560 - PAD * 2) / siteW, (400 - PAD * 2) / siteD)
  const W = siteW * scale + PAD * 2
  const H = siteD * scale + PAD * 2

  const sx = (x: number) => PAD + x * scale
  const sy = (y: number) => H - PAD - y * scale

  const floorMembers = members.filter(m => m.floor === activeFloor)
  const beams   = floorMembers.filter(m => m.member_type === 'beam')
  const columns = members.filter(m => m.member_type === 'column')  // columns shown on all floors

  const summary = useMemo(() => {
    const counts = { ok: 0, warning: 0, overstressed: 0 }
    for (const m of members) counts[m.status as keyof typeof counts]++
    return counts
  }, [members])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Steel Structure Plan</h2>
          <p className="text-xs text-slate-400 mt-0.5">AISC/CISC W-shape member assignment</p>
        </div>
        <div className="flex items-center gap-3">
          {(['ok','warning','overstressed'] as const).map(s => (
            <span key={s} className="flex items-center gap-1 text-xs text-slate-600">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: STATUS_COLOR[s] }} />
              {s === 'ok' ? 'OK' : s === 'warning' ? 'Warn' : 'Over'}
              <span className="font-semibold">{summary[s]}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Floor tabs */}
      {floorList.length > 1 && (
        <div className="flex gap-1 px-5 py-2 bg-slate-50 border-b border-slate-100">
          {floorList.map(f => (
            <button
              key={f}
              onClick={() => setActiveFloor(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                activeFloor === f ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Floor {f + 1}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-0 overflow-auto">
        {/* SVG plan */}
        <div className="flex-1 p-4 min-w-0">
          <svg width={W} height={H} className="border border-slate-100 rounded-xl bg-slate-50 block mx-auto">
            {/* Site outline */}
            <rect x={PAD} y={PAD} width={siteW * scale} height={siteD * scale}
              fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 3" rx={2} />

            {/* Walls of active floor (background) */}
            {model.walls.filter(w => w.floor === activeFloor).map(w => (
              <line key={w.id}
                x1={sx(w.start.x)} y1={sy(w.start.y)}
                x2={sx(w.end.x)}   y2={sy(w.end.y)}
                stroke="#e2e8f0" strokeWidth={3} strokeLinecap="round" />
            ))}

            {/* Beams */}
            {beams.map(m => {
              const bm = model.beams.find(b => b.id === m.ref_id)
              if (!bm) return null
              const cx = sx((bm.start.x + bm.end.x) / 2)
              const cy = sy((bm.start.y + bm.end.y) / 2)
              const ang = Math.atan2(bm.end.y - bm.start.y, bm.end.x - bm.start.x) * 180 / Math.PI
              return (
                <g key={m.id}>
                  <line
                    x1={sx(bm.start.x)} y1={sy(bm.start.y)}
                    x2={sx(bm.end.x)}   y2={sy(bm.end.y)}
                    stroke={STATUS_COLOR[m.status]} strokeWidth={3.5} strokeLinecap="round"
                  />
                  <text
                    x={cx} y={cy - 5}
                    textAnchor="middle" fontSize={9} fontFamily="monospace"
                    fill={STATUS_COLOR[m.status]}
                    transform={`rotate(${-ang},${cx},${cy})`}
                  >
                    {m.section.designation}
                  </text>
                </g>
              )
            })}

            {/* Columns (all floors shown as squares) */}
            {columns.map(m => {
              const col = model.columns.find(c => c.id === m.ref_id)
              if (!col) return null
              const cs = Math.max(col.width * scale, 6)
              return (
                <g key={m.id}>
                  <rect
                    x={sx(col.position.x) - cs / 2}
                    y={sy(col.position.y) - cs / 2}
                    width={cs} height={cs}
                    fill={STATUS_COLOR[m.status]} stroke="white" strokeWidth={1}
                  />
                  <text
                    x={sx(col.position.x)} y={sy(col.position.y) + cs / 2 + 10}
                    textAnchor="middle" fontSize={8} fontFamily="monospace"
                    fill={STATUS_COLOR[m.status]}
                  >
                    {m.section.designation}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Member list */}
        <div className="w-72 border-l border-slate-100 overflow-y-auto max-h-[500px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Section</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Util</th>
              </tr>
            </thead>
            <tbody>
              {floorMembers.map(m => (
                <tr key={m.id} className="border-t border-slate-50 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-mono font-semibold text-slate-700">{m.section.designation}</div>
                    <div className="text-slate-400">{m.member_type} · {m.span_m}m</div>
                  </td>
                  <td className="px-3 py-2 w-28">{utilBar(m.utilization, m.status)}</td>
                </tr>
              ))}
              {floorMembers.length === 0 && (
                <tr><td colSpan={2} className="px-3 py-4 text-slate-400 text-center">No steel members on this floor</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
