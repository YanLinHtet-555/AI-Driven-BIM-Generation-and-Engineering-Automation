import { useMemo, useState } from 'react'
import type { GenerationResponse, SteelMember } from '../types/api'
import { patchModel } from '../api/client'

interface Props {
  result: GenerationResponse
  onUpdate?: (r: GenerationResponse) => void
}

type SortKey = 'utilization' | 'section' | 'span' | 'demand'
type SortDir = 'asc' | 'desc'

const STATUS_COLOR: Record<string, string> = {
  ok:           '#22c55e',
  warning:      '#f59e0b',
  overstressed: '#ef4444',
}

const STATUS_BG: Record<string, string> = {
  ok:           'bg-green-50 text-green-700 border-green-200',
  warning:      'bg-amber-50 text-amber-700 border-amber-200',
  overstressed: 'bg-red-50 text-red-700 border-red-200',
}

function UtilBar({ u, status }: { u: number; status: string }) {
  const pct = Math.min(u * 100, 100)
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, background: STATUS_COLOR[status] }} />
      </div>
      <span className="text-xs w-9 text-right font-mono tabular-nums"
        style={{ color: STATUS_COLOR[status] }}>
        {(u * 100).toFixed(0)}%
      </span>
    </div>
  )
}

function SortTh({ label, col, sort, onSort }: {
  label: string; col: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort: (k: SortKey) => void
}) {
  const active = sort.key === col
  return (
    <th className="text-right px-4 py-2.5 text-slate-500 font-medium text-xs cursor-pointer select-none hover:text-slate-700"
      onClick={() => onSort(col)}>
      {label}{active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

export default function StructuralPanel({ result, onUpdate }: Props) {
  const model   = result.building_model
  const members = model.steel_members ?? []
  const sg      = model.structural_grid

  const [filter,    setFilter]    = useState<'all' | 'beam' | 'column'>('all')
  const [sort,      setSort]      = useState<{ key: SortKey; dir: SortDir }>({ key: 'utilization', dir: 'desc' })
  const [adjusting, setAdjusting] = useState(false)

  const summary = useMemo(() => {
    const c = { ok: 0, warning: 0, overstressed: 0 }
    for (const m of members) c[m.status as keyof typeof c]++
    const maxUtil = members.length ? Math.max(...members.map(m => m.utilization)) : 0
    return { ...c, maxUtil, total: members.length }
  }, [members])

  const hasOverstressed = summary.overstressed > 0
  const hasWarning      = summary.warning > 0
  const needsAdjust     = hasOverstressed || hasWarning

  const displayed = useMemo(() => {
    let list = filter === 'all' ? members : members.filter(m => m.member_type === filter)
    return [...list].sort((a, b) => {
      if (sort.key === 'section') {
        const cmp = a.section.designation.localeCompare(b.section.designation)
        return sort.dir === 'asc' ? cmp : -cmp
      }
      const va = sort.key === 'utilization' ? a.utilization
               : sort.key === 'span'        ? a.span_m
               :                              a.demand
      const vb = sort.key === 'utilization' ? b.utilization
               : sort.key === 'span'        ? b.span_m
               :                              b.demand
      return sort.dir === 'asc' ? va - vb : vb - va
    })
  }, [members, filter, sort])

  function toggleSort(k: SortKey) {
    setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' })
  }

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

  if (members.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center h-64">
        <p className="text-slate-400 text-sm">No structural members — generate a building first</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Structural Strength Check</h2>
          <p className="text-xs text-slate-400 mt-0.5">LRFD utilization ratios — demand / φ·capacity</p>
        </div>
        {needsAdjust && onUpdate && sg && (
          <button onClick={handleAutoAdjust} disabled={adjusting}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-60 ${
              hasOverstressed
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}>
            {adjusting
              ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
            }
            {adjusting ? 'Adjusting…' : hasOverstressed ? 'Fix Overstressed' : 'Optimize'}
          </button>
        )}
      </div>

      {/* ── Summary cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-slate-100 border-b border-slate-100">
        {[
          { label: 'Total',         value: summary.total,         cls: 'text-slate-800' },
          { label: 'OK  (≤80%)',    value: summary.ok,            cls: 'text-green-600' },
          { label: 'Warning (80–100%)',    value: summary.warning,       cls: 'text-amber-600' },
          { label: 'Overstressed (>100%)', value: summary.overstressed,  cls: 'text-red-600'   },
          {
            label: 'Max Util',
            value: `${(summary.maxUtil * 100).toFixed(0)}%`,
            cls: summary.maxUtil > 1 ? 'text-red-600' : summary.maxUtil > 0.8 ? 'text-amber-600' : 'text-green-600',
          },
        ].map(c => (
          <div key={c.label} className="bg-white px-4 py-3">
            <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
            <div className="text-xs text-slate-400 mt-0.5 leading-tight">{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── Adjust banner (when issues exist) ──────────────────────── */}
      {needsAdjust && (
        <div className={`px-5 py-2.5 text-xs flex items-center gap-2 border-b ${
          hasOverstressed ? 'bg-red-50 border-red-100 text-red-700' : 'bg-amber-50 border-amber-100 text-amber-700'
        }`}>
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {hasOverstressed
            ? `${summary.overstressed} member(s) overstressed. "Fix Overstressed" reduces bay spacings by 30% to lower demand.`
            : `${summary.warning} member(s) near capacity (80–100%). "Optimize" reduces bay spacings by 15% for extra margin.`}
        </div>
      )}

      {/* ── Filter toolbar ─────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        {(['all', 'beam', 'column'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
              filter === f ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}>
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">{displayed.length} members</span>
      </div>

      {/* ── Member table ───────────────────────────────────────────── */}
      <div className="overflow-auto max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0 shadow-sm">
            <tr>
              <th className="text-left px-5 py-2.5 text-slate-500 font-medium text-xs">Type</th>
              <SortTh label="Section"      col="section"     sort={sort} onSort={toggleSort} />
              <SortTh label="Span / Ht (m)" col="span"       sort={sort} onSort={toggleSort} />
              <SortTh label="Demand"        col="demand"      sort={sort} onSort={toggleSort} />
              <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Capacity</th>
              <SortTh label="Utilization"   col="utilization" sort={sort} onSort={toggleSort} />
              <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((m: SteelMember) => (
              <tr key={m.id}
                className={`border-t border-slate-50 hover:bg-slate-50/80 transition-colors ${
                  m.status === 'overstressed' ? 'bg-red-50/30' : m.status === 'warning' ? 'bg-amber-50/30' : ''
                }`}>
                <td className="px-5 py-2.5 text-slate-500 capitalize text-xs">{m.member_type}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-700">
                  {m.section.designation}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{m.span_m}</td>
                <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                  {m.demand.toFixed(1)}{' '}
                  <span className="text-slate-400">{m.member_type === 'beam' ? 'kN·m' : 'kN'}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-600 tabular-nums">
                  {m.capacity.toFixed(1)}{' '}
                  <span className="text-slate-400">{m.member_type === 'beam' ? 'kN·m' : 'kN'}</span>
                </td>
                <td className="px-4 py-2.5"><UtilBar u={m.utilization} status={m.status} /></td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BG[m.status]}`}>
                    {m.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
