import { useMemo, useState } from 'react'
import type { GenerationResponse } from '../types/api'

interface Props { result: GenerationResponse }

const STATUS_COLOR: Record<string, string> = {
  ok:           '#22c55e',
  warning:      '#f59e0b',
  overstressed: '#ef4444',
}

// SVG layout constants
const L_EXT    = 80    // left margin: row bubbles + Y-chain dim
const T_EXT    = 80    // top margin: col bubbles + X-chain dim
const R_EXT    = 30
const B_EXT    = 30
const BUBBLE_R = 10
const BUB_TOP  = 14    // y-center of column-label bubbles (top)
const DIM_Y    = 52    // y of horizontal chain-dimension line
const BUB_LEFT = 14    // x-center of row-label bubbles (left)
const DIM_X    = 52    // x of vertical chain-dimension line

function utilBar(u: number, status: string) {
  const pct = Math.min(u * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: STATUS_COLOR[status] }} />
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
  const sg = model.structural_grid

  const floorList = useMemo(() => {
    const s = new Set(members.map(m => m.floor))
    return Array.from(s).sort((a, b) => a - b)
  }, [members])

  const [activeFloor, setActiveFloor] = useState(floorList[0] ?? 0)

  // Build grid positions from spacings
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

  const siteW  = model.requirements.site_width
  const siteD  = model.requirements.site_depth
  const maxW   = 580
  const maxH   = 460
  const scale  = Math.min((maxW - L_EXT - R_EXT) / siteW, (maxH - T_EXT - B_EXT) / siteD)
  const W      = siteW * scale + L_EXT + R_EXT
  const H      = siteD * scale + T_EXT + B_EXT

  const sx = (x: number) => L_EXT + x * scale
  const sy = (y: number) => H - B_EXT - y * scale

  const floorMembers = members.filter(m => m.floor === activeFloor)
  const beams        = floorMembers.filter(m => m.member_type === 'beam')
  const columns      = members.filter(m => m.member_type === 'column')

  const summary = useMemo(() => {
    const c = { ok: 0, warning: 0, overstressed: 0 }
    for (const m of members) c[m.status as keyof typeof c]++
    return c
  }, [members])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Steel Structure Plan</h2>
          <p className="text-xs text-slate-400 mt-0.5">AISC/CISC W-shape member assignment</p>
        </div>
        <div className="flex items-center gap-3">
          {(['ok', 'warning', 'overstressed'] as const).map(s => (
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
            <button key={f} onClick={() => setActiveFloor(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                activeFloor === f
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              Floor {f + 1}
            </button>
          ))}
        </div>
      )}

      <div className="flex overflow-auto">
        {/* SVG plan */}
        <div className="flex-1 p-4 min-w-0 overflow-auto">
          <svg width={W} height={H} className="border border-slate-100 rounded-xl bg-slate-50 block">

            {/* ── Grid lines ─────────────────────────────────────────── */}
            {sg && gridXs.map((gx, i) => (
              <line key={`vgrid-${i}`}
                x1={sx(gx)} y1={BUB_TOP + BUBBLE_R + 3}
                x2={sx(gx)} y2={H - B_EXT + 12}
                stroke="#bfdbfe" strokeWidth={0.8} strokeDasharray="6 4" />
            ))}
            {sg && gridYs.map((gy, i) => (
              <line key={`hgrid-${i}`}
                x1={BUB_LEFT + BUBBLE_R + 3} y1={sy(gy)}
                x2={W - R_EXT + 12}          y2={sy(gy)}
                stroke="#bfdbfe" strokeWidth={0.8} strokeDasharray="6 4" />
            ))}

            {/* ── X chain dimensions (above building) ───────────────── */}
            {sg && gridXs.length >= 2 && (() => {
              const x0 = sx(gridXs[0])
              const x1 = sx(gridXs[gridXs.length - 1])
              return (
                <g>
                  {/* continuous dim line */}
                  <line x1={x0} y1={DIM_Y} x2={x1} y2={DIM_Y} stroke="#64748b" strokeWidth={0.75} />
                  {gridXs.map((gx, i) => (
                    <g key={`xtick-${i}`}>
                      {/* tick */}
                      <line x1={sx(gx)} y1={DIM_Y - 5} x2={sx(gx)} y2={DIM_Y + 5}
                        stroke="#64748b" strokeWidth={1} />
                      {/* extension to building */}
                      <line x1={sx(gx)} y1={DIM_Y + 6} x2={sx(gx)} y2={T_EXT}
                        stroke="#94a3b8" strokeWidth={0.4} strokeDasharray="2 2" />
                      {/* bay label */}
                      {i > 0 && (
                        <text
                          x={(sx(gx) + sx(gridXs[i - 1])) / 2} y={DIM_Y - 8}
                          textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#334155"
                        >
                          {sg.spacings_x[i - 1]}m
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              )
            })()}

            {/* ── Y chain dimensions (left of building) ─────────────── */}
            {sg && gridYs.length >= 2 && (() => {
              const yt = sy(gridYs[gridYs.length - 1])
              const yb = sy(gridYs[0])
              return (
                <g>
                  <line x1={DIM_X} y1={yt} x2={DIM_X} y2={yb} stroke="#64748b" strokeWidth={0.75} />
                  {gridYs.map((gy, i) => (
                    <g key={`ytick-${i}`}>
                      <line x1={DIM_X - 5} y1={sy(gy)} x2={DIM_X + 5} y2={sy(gy)}
                        stroke="#64748b" strokeWidth={1} />
                      <line x1={DIM_X + 6} y1={sy(gy)} x2={L_EXT} y2={sy(gy)}
                        stroke="#94a3b8" strokeWidth={0.4} strokeDasharray="2 2" />
                      {i > 0 && (
                        <text
                          x={DIM_X - 8}
                          y={(sy(gy) + sy(gridYs[i - 1])) / 2 + 4}
                          textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#334155"
                          transform={`rotate(-90,${DIM_X - 8},${(sy(gy) + sy(gridYs[i - 1])) / 2})`}
                        >
                          {sg.spacings_y[i - 1]}m
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              )
            })()}

            {/* ── No-grid fallback: overall site dimensions ──────────── */}
            {!sg && (() => {
              const x0 = sx(0); const x1 = sx(siteW)
              const y0 = sy(0); const y1 = sy(siteD)
              return (
                <g>
                  {/* top overall dim */}
                  <line x1={x0} y1={DIM_Y} x2={x1} y2={DIM_Y} stroke="#64748b" strokeWidth={0.75} />
                  <line x1={x0} y1={DIM_Y - 5} x2={x0} y2={DIM_Y + 5} stroke="#64748b" strokeWidth={1} />
                  <line x1={x1} y1={DIM_Y - 5} x2={x1} y2={DIM_Y + 5} stroke="#64748b" strokeWidth={1} />
                  <text x={(x0 + x1) / 2} y={DIM_Y - 8} textAnchor="middle" fontSize={9}
                    fontFamily="sans-serif" fill="#334155">{siteW}m</text>
                  {/* left overall dim */}
                  <line x1={DIM_X} y1={y1} x2={DIM_X} y2={y0} stroke="#64748b" strokeWidth={0.75} />
                  <line x1={DIM_X - 5} y1={y1} x2={DIM_X + 5} y2={y1} stroke="#64748b" strokeWidth={1} />
                  <line x1={DIM_X - 5} y1={y0} x2={DIM_X + 5} y2={y0} stroke="#64748b" strokeWidth={1} />
                  <text x={DIM_X - 8} y={(y0 + y1) / 2 + 4} textAnchor="middle" fontSize={9}
                    fontFamily="sans-serif" fill="#334155"
                    transform={`rotate(-90,${DIM_X - 8},${(y0 + y1) / 2})`}>{siteD}m</text>
                </g>
              )
            })()}

            {/* ── Grid bubbles ────────────────────────────────────────── */}
            {sg && gridXs.map((gx, i) => (
              <g key={`bub-col-${i}`}>
                <circle cx={sx(gx)} cy={BUB_TOP} r={BUBBLE_R}
                  fill="white" stroke="#3b82f6" strokeWidth={1.2} />
                <text x={sx(gx)} y={BUB_TOP + 3.5} textAnchor="middle"
                  fontSize={9} fontFamily="sans-serif" fill="#2563eb" fontWeight="700">
                  {sg.column_labels[i]}
                </text>
              </g>
            ))}
            {sg && gridYs.map((gy, i) => (
              <g key={`bub-row-${i}`}>
                <circle cx={BUB_LEFT} cy={sy(gy)} r={BUBBLE_R}
                  fill="white" stroke="#3b82f6" strokeWidth={1.2} />
                <text x={BUB_LEFT} y={sy(gy) + 3.5} textAnchor="middle"
                  fontSize={9} fontFamily="sans-serif" fill="#2563eb" fontWeight="700">
                  {sg.row_labels[i]}
                </text>
              </g>
            ))}

            {/* ── Site outline ────────────────────────────────────────── */}
            <rect x={sx(0)} y={sy(siteD)} width={siteW * scale} height={siteD * scale}
              fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="5 3" rx={2} />

            {/* ── Walls ───────────────────────────────────────────────── */}
            {model.walls.filter(w => w.floor === activeFloor).map(w => (
              <line key={w.id}
                x1={sx(w.start.x)} y1={sy(w.start.y)}
                x2={sx(w.end.x)}   y2={sy(w.end.y)}
                stroke="#e2e8f0" strokeWidth={3} strokeLinecap="round" />
            ))}

            {/* ── Beams ───────────────────────────────────────────────── */}
            {beams.map(m => {
              const bm = model.beams.find(b => b.id === m.ref_id)
              if (!bm) return null
              const cx  = sx((bm.start.x + bm.end.x) / 2)
              const cy  = sy((bm.start.y + bm.end.y) / 2)
              const ang = Math.atan2(bm.end.y - bm.start.y, bm.end.x - bm.start.x) * 180 / Math.PI
              return (
                <g key={m.id}>
                  <line
                    x1={sx(bm.start.x)} y1={sy(bm.start.y)}
                    x2={sx(bm.end.x)}   y2={sy(bm.end.y)}
                    stroke={STATUS_COLOR[m.status]} strokeWidth={3.5} strokeLinecap="round" />
                  <text x={cx} y={cy - 5} textAnchor="middle" fontSize={9}
                    fontFamily="monospace" fill={STATUS_COLOR[m.status]}
                    transform={`rotate(${-ang},${cx},${cy})`}>
                    {m.section.designation}
                  </text>
                </g>
              )
            })}

            {/* ── Columns ─────────────────────────────────────────────── */}
            {columns.map(m => {
              const col = model.columns.find(c => c.id === m.ref_id)
              if (!col) return null
              const cs = Math.max(col.width * scale, 7)
              return (
                <g key={m.id}>
                  <rect
                    x={sx(col.position.x) - cs / 2} y={sy(col.position.y) - cs / 2}
                    width={cs} height={cs}
                    fill={STATUS_COLOR[m.status]} stroke="white" strokeWidth={1} />
                  <text x={sx(col.position.x)} y={sy(col.position.y) + cs / 2 + 10}
                    textAnchor="middle" fontSize={8} fontFamily="monospace"
                    fill={STATUS_COLOR[m.status]}>
                    {m.section.designation}
                  </text>
                </g>
              )
            })}

          </svg>
        </div>

        {/* Member list */}
        <div className="w-68 min-w-[17rem] border-l border-slate-100 overflow-y-auto max-h-[520px]">
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
                <tr>
                  <td colSpan={2} className="px-3 py-4 text-slate-400 text-center">
                    No steel members on this floor
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
