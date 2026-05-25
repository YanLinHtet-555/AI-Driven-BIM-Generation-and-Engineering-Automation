import { useEffect, useMemo, useRef, useState } from 'react'
import type { GenerationResponse } from '../types/api'
import { patchModel } from '../api/client'

interface Props {
  result: GenerationResponse
  onUpdate?: (r: GenerationResponse) => void
}

const STATUS_COLOR: Record<string, string> = {
  ok:           '#22c55e',
  warning:      '#f59e0b',
  overstressed: '#ef4444',
}

// SVG layout margins (around the building, for labels + dimension lines)
const L_EXT    = 80
const T_EXT    = 80
const R_EXT    = 30
const B_EXT    = 30
const BUBBLE_R = 10
const BUB_TOP  = 14    // y-center of top column-label bubbles
const DIM_Y    = 52    // y of horizontal chain-dimension line
const BUB_LEFT = 14    // x-center of left row-label bubbles
const DIM_X    = 52    // x of vertical chain-dimension line

// Fixed SVG viewport (the element never resizes; user pan/zooms inside it)
const SVG_W = 560
const SVG_H = 440

function UtilBar({ u, status }: { u: number; status: string }) {
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

  // ── structural grid positions ────────────────────────────────────
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

  // ── natural content size (at zoom=1 everything fits in SVG_W × SVG_H) ──
  const siteW = model.requirements.site_width
  const siteD = model.requirements.site_depth
  const scale = Math.min((SVG_W - L_EXT - R_EXT) / siteW, (SVG_H - T_EXT - B_EXT) / siteD)
  const W     = siteW * scale + L_EXT + R_EXT
  const H     = siteD * scale + T_EXT + B_EXT

  const sx = (x: number) => L_EXT + x * scale
  const sy = (y: number) => H - B_EXT - y * scale

  // ── zoom / pan ──────────────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan,  setPan]  = useState({ x: (SVG_W - W) / 2, y: (SVG_H - H) / 2 })
  const [cursor, setCursor] = useState<'grab' | 'grabbing'>('grab')

  // Inline refs — always reflect current render values without needing useEffect
  const zRef = useRef(zoom);  zRef.current = zoom
  const pRef = useRef(pan);   pRef.current = pan
  const drag = useRef({ on: false, mx: 0, my: 0, px: 0, py: 0 })

  // Reset to fit when a new model is loaded
  useEffect(() => {
    setZoom(1)
    setPan({ x: (SVG_W - W) / 2, y: (SVG_H - H) / 2 })
  }, [model.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Non-passive wheel listener so preventDefault() works
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const f  = e.deltaY < 0 ? 1.2 : 1 / 1.2
      const z  = zRef.current
      const p  = pRef.current
      const nz = Math.max(0.2, Math.min(8, z * f))
      setZoom(nz)
      setPan({ x: mx - (mx - p.x) * (nz / z), y: my - (my - p.y) * (nz / z) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    drag.current = { on: true, mx: e.clientX, my: e.clientY, px: pRef.current.x, py: pRef.current.y }
    setCursor('grabbing')
  }
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag.current.on) return
    const d = drag.current
    setPan({ x: d.px + e.clientX - d.mx, y: d.py + e.clientY - d.my })
  }
  const handleMouseUp = () => { drag.current.on = false; setCursor('grab') }

  const zoomToCenter = (f: number) => {
    const cx = SVG_W / 2, cy = SVG_H / 2
    const z = zRef.current, p = pRef.current
    const nz = Math.max(0.2, Math.min(8, z * f))
    setZoom(nz)
    setPan({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) })
  }
  const handleFit = () => {
    setZoom(1)
    setPan({ x: (SVG_W - W) / 2, y: (SVG_H - H) / 2 })
  }

  // ── auto adjust ─────────────────────────────────────────────────
  const [adjusting, setAdjusting] = useState(false)
  const hasOverstressed = members.some(m => m.status === 'overstressed')
  const hasWarning      = members.some(m => m.status === 'warning')
  const needsAdjust     = hasOverstressed || hasWarning

  const handleAutoAdjust = async () => {
    if (!sg || !onUpdate) return
    const factor = hasOverstressed ? 0.70 : 0.85
    const newSx = sg.spacings_x.map(s => Math.max(2.0, +(s * factor).toFixed(2)))
    const newSy = sg.spacings_y.map(s => Math.max(2.0, +(s * factor).toFixed(2)))
    setAdjusting(true)
    try {
      const updated = await patchModel(model.id, {
        floor: 0,
        structural_spacings_x: newSx,
        structural_spacings_y: newSy,
      })
      onUpdate(updated)
    } finally {
      setAdjusting(false)
    }
  }

  // ── derived display data ─────────────────────────────────────────
  const summary = useMemo(() => {
    const c = { ok: 0, warning: 0, overstressed: 0 }
    for (const m of members) c[m.status as keyof typeof c]++
    return c
  }, [members])

  const floorMembers = members.filter(m => m.floor === activeFloor)
  const beams        = floorMembers.filter(m => m.member_type === 'beam')
  const columns      = members.filter(m => m.member_type === 'column')

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────── */}
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

      {/* ── Toolbar: floors · zoom controls · auto-adjust ─────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-50 border-b border-slate-100">
        {/* Floor tabs */}
        <div className="flex gap-1 flex-wrap">
          {floorList.length > 1
            ? floorList.map(f => (
                <button key={f} onClick={() => setActiveFloor(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeFloor === f
                      ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  Floor {f + 1}
                </button>
              ))
            : <span className="text-xs text-slate-400">Floor 1</span>
          }
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Zoom strip */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden text-xs">
            <button onClick={() => zoomToCenter(1 / 1.3)}
              className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 font-bold leading-none">−</button>
            <span className="px-2 py-1.5 text-slate-500 font-mono min-w-[3.5rem] text-center border-x border-slate-200">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => zoomToCenter(1.3)}
              className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 font-bold leading-none">+</button>
            <button onClick={handleFit} title="Fit to view"
              className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 border-l border-slate-200">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>

          {/* Auto-adjust */}
          {needsAdjust && onUpdate && sg && (
            <button onClick={handleAutoAdjust} disabled={adjusting}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60 ${
                hasOverstressed
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}>
              {adjusting
                ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
              }
              {adjusting ? 'Adjusting…' : hasOverstressed ? 'Fix Overstressed' : 'Optimize'}
            </button>
          )}
        </div>
      </div>

      {/* ── Main: SVG plan + member list ─────────────────────────── */}
      <div className="flex">

        {/* SVG plan */}
        <div className="flex-1 overflow-hidden bg-slate-50/30">
          <svg
            ref={svgRef}
            width={SVG_W} height={SVG_H}
            style={{ cursor, display: 'block', userSelect: 'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

              {/* ── Grid lines ──────────────────────────────────────── */}
              {sg && gridXs.map((gx, i) => (
                <line key={`vg-${i}`}
                  x1={sx(gx)} y1={BUB_TOP + BUBBLE_R + 3}
                  x2={sx(gx)} y2={H - B_EXT + 14}
                  stroke="#bfdbfe" strokeWidth={0.8} strokeDasharray="6 4" />
              ))}
              {sg && gridYs.map((gy, i) => (
                <line key={`hg-${i}`}
                  x1={BUB_LEFT + BUBBLE_R + 3} y1={sy(gy)}
                  x2={W - R_EXT + 14}          y2={sy(gy)}
                  stroke="#bfdbfe" strokeWidth={0.8} strokeDasharray="6 4" />
              ))}

              {/* ── X chain dimensions (above building) ─────────────── */}
              {sg && gridXs.length >= 2 && (() => {
                const x0 = sx(gridXs[0])
                const x1 = sx(gridXs[gridXs.length - 1])
                return (
                  <g>
                    <line x1={x0} y1={DIM_Y} x2={x1} y2={DIM_Y}
                      stroke="#64748b" strokeWidth={0.75} />
                    {gridXs.map((gx, i) => (
                      <g key={`xt-${i}`}>
                        <line x1={sx(gx)} y1={DIM_Y - 5} x2={sx(gx)} y2={DIM_Y + 5}
                          stroke="#64748b" strokeWidth={1} />
                        <line x1={sx(gx)} y1={DIM_Y + 6} x2={sx(gx)} y2={T_EXT}
                          stroke="#94a3b8" strokeWidth={0.4} strokeDasharray="2 2" />
                        {i > 0 && (
                          <text
                            x={(sx(gx) + sx(gridXs[i - 1])) / 2} y={DIM_Y - 8}
                            textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#334155">
                            {sg.spacings_x[i - 1]}m
                          </text>
                        )}
                      </g>
                    ))}
                    {/* Total X span */}
                    <text x={(x0 + x1) / 2} y={DIM_Y + 16}
                      textAnchor="middle" fontSize={8} fontFamily="sans-serif" fill="#64748b">
                      ={siteW}m
                    </text>
                  </g>
                )
              })()}

              {/* ── Y chain dimensions (left of building) ────────────── */}
              {sg && gridYs.length >= 2 && (() => {
                const yt = sy(gridYs[gridYs.length - 1])
                const yb = sy(gridYs[0])
                return (
                  <g>
                    <line x1={DIM_X} y1={yt} x2={DIM_X} y2={yb}
                      stroke="#64748b" strokeWidth={0.75} />
                    {gridYs.map((gy, i) => (
                      <g key={`yt-${i}`}>
                        <line x1={DIM_X - 5} y1={sy(gy)} x2={DIM_X + 5} y2={sy(gy)}
                          stroke="#64748b" strokeWidth={1} />
                        <line x1={DIM_X + 6} y1={sy(gy)} x2={L_EXT} y2={sy(gy)}
                          stroke="#94a3b8" strokeWidth={0.4} strokeDasharray="2 2" />
                        {i > 0 && (() => {
                          const midY = (sy(gy) + sy(gridYs[i - 1])) / 2
                          return (
                            <text x={DIM_X - 8} y={midY + 4}
                              textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#334155"
                              transform={`rotate(-90,${DIM_X - 8},${midY})`}>
                              {sg.spacings_y[i - 1]}m
                            </text>
                          )
                        })()}
                      </g>
                    ))}
                    {/* Total Y span */}
                    <text
                      x={DIM_X + 16}
                      y={(yt + yb) / 2 + 4}
                      textAnchor="middle" fontSize={8} fontFamily="sans-serif" fill="#64748b"
                      transform={`rotate(-90,${DIM_X + 16},${(yt + yb) / 2})`}>
                      ={siteD}m
                    </text>
                  </g>
                )
              })()}

              {/* ── Fallback: overall site dims when no grid ─────────── */}
              {!sg && (() => {
                const x0 = sx(0), x1 = sx(siteW)
                const y0 = sy(0), y1 = sy(siteD)
                return (
                  <g>
                    <line x1={x0} y1={DIM_Y} x2={x1} y2={DIM_Y} stroke="#64748b" strokeWidth={0.75} />
                    <line x1={x0} y1={DIM_Y - 5} x2={x0} y2={DIM_Y + 5} stroke="#64748b" strokeWidth={1} />
                    <line x1={x1} y1={DIM_Y - 5} x2={x1} y2={DIM_Y + 5} stroke="#64748b" strokeWidth={1} />
                    <text x={(x0 + x1) / 2} y={DIM_Y - 8} textAnchor="middle"
                      fontSize={9} fontFamily="sans-serif" fill="#334155">{siteW}m</text>
                    <line x1={DIM_X} y1={y1} x2={DIM_X} y2={y0} stroke="#64748b" strokeWidth={0.75} />
                    <line x1={DIM_X - 5} y1={y1} x2={DIM_X + 5} y2={y1} stroke="#64748b" strokeWidth={1} />
                    <line x1={DIM_X - 5} y1={y0} x2={DIM_X + 5} y2={y0} stroke="#64748b" strokeWidth={1} />
                    <text x={DIM_X - 8} y={(y0 + y1) / 2 + 4} textAnchor="middle"
                      fontSize={9} fontFamily="sans-serif" fill="#334155"
                      transform={`rotate(-90,${DIM_X - 8},${(y0 + y1) / 2})`}>{siteD}m</text>
                  </g>
                )
              })()}

              {/* ── Grid bubbles ──────────────────────────────────────── */}
              {sg && gridXs.map((gx, i) => (
                <g key={`bc-${i}`}>
                  <circle cx={sx(gx)} cy={BUB_TOP} r={BUBBLE_R}
                    fill="white" stroke="#3b82f6" strokeWidth={1.2} />
                  <text x={sx(gx)} y={BUB_TOP + 3.5} textAnchor="middle"
                    fontSize={9} fontFamily="sans-serif" fill="#2563eb" fontWeight="700">
                    {sg.column_labels[i]}
                  </text>
                </g>
              ))}
              {sg && gridYs.map((gy, i) => (
                <g key={`br-${i}`}>
                  <circle cx={BUB_LEFT} cy={sy(gy)} r={BUBBLE_R}
                    fill="white" stroke="#3b82f6" strokeWidth={1.2} />
                  <text x={BUB_LEFT} y={sy(gy) + 3.5} textAnchor="middle"
                    fontSize={9} fontFamily="sans-serif" fill="#2563eb" fontWeight="700">
                    {sg.row_labels[i]}
                  </text>
                </g>
              ))}

              {/* ── Site outline ──────────────────────────────────────── */}
              <rect x={sx(0)} y={sy(siteD)} width={siteW * scale} height={siteD * scale}
                fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="5 3" rx={2} />

              {/* ── Walls ─────────────────────────────────────────────── */}
              {model.walls.filter(w => w.floor === activeFloor).map(w => (
                <line key={w.id}
                  x1={sx(w.start.x)} y1={sy(w.start.y)}
                  x2={sx(w.end.x)}   y2={sy(w.end.y)}
                  stroke="#e2e8f0" strokeWidth={3} strokeLinecap="round" />
              ))}

              {/* ── Beams ─────────────────────────────────────────────── */}
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
                    <text x={cx} y={cy - 5} textAnchor="middle"
                      fontSize={9} fontFamily="monospace" fill={STATUS_COLOR[m.status]}
                      transform={`rotate(${-ang},${cx},${cy})`}>
                      {m.section.designation}
                    </text>
                  </g>
                )
              })}

              {/* ── Columns ───────────────────────────────────────────── */}
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

            </g>{/* end zoom/pan group */}
          </svg>
        </div>

        {/* ── Member list ─────────────────────────────────────────── */}
        <div className="w-64 min-w-[16rem] border-l border-slate-100 overflow-y-auto" style={{ maxHeight: SVG_H }}>
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
                  className={`border-t border-slate-50 hover:bg-slate-50 ${
                    m.status === 'overstressed' ? 'bg-red-50/40' : m.status === 'warning' ? 'bg-amber-50/40' : ''
                  }`}>
                  <td className="px-3 py-2">
                    <div className="font-mono font-semibold text-slate-700">{m.section.designation}</div>
                    <div className="text-slate-400">{m.member_type} · {m.span_m}m</div>
                  </td>
                  <td className="px-3 py-2 w-28"><UtilBar u={m.utilization} status={m.status} /></td>
                </tr>
              ))}
              {floorMembers.length === 0 && (
                <tr><td colSpan={2} className="px-3 py-4 text-slate-400 text-center">No members on this floor</td></tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* ── Hint bar ─────────────────────────────────────────────── */}
      <div className="px-5 py-2 border-t border-slate-100 flex items-center justify-between">
        <p className="text-xs text-slate-400">Scroll to zoom · drag to pan</p>
        {needsAdjust && (
          <p className="text-xs" style={{ color: hasOverstressed ? '#ef4444' : '#f59e0b' }}>
            {hasOverstressed
              ? `${summary.overstressed} overstressed member(s) — use "Fix Overstressed" to reduce bay spacings`
              : `${summary.warning} member(s) near capacity — use "Optimize" for extra margin`}
          </p>
        )}
      </div>

    </div>
  )
}
