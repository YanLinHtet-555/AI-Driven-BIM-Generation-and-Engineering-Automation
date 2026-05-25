import { useMemo, useState } from 'react'
import type { GenerationResponse, SteelMember } from '../types/api'

interface Props { result: GenerationResponse }

type SortKey = 'utilization' | 'section' | 'span' | 'demand'
type SortDir = 'asc' | 'desc'

const STATUS_COLOR: Record<string, string> = {
  ok:           '#22c55e',
  warning:      '#f59e0b',
  overstressed: '#ef4444',
}

const STATUS_BG: Record<string, string> = {
  ok:           'bg-green-50 text-green-700',
  warning:      'bg-amber-50 text-amber-700',
  overstressed: 'bg-red-50 text-red-700',
}

function UtilBar({ u, status }: { u: number; status: string }) {
  const pct = Math.min(u * 100, 100)
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: STATUS_COLOR[status] }} />
      </div>
      <span className="text-xs w-9 text-right font-mono tabular-nums" style={{ color: STATUS_COLOR[status] }}>
        {(u * 100).toFixed(0)}%
      </span>
    </div>
  )
}

function SortHeader({ label, col, sort, onSort }: {
  label: string; col: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort: (k: SortKey) => void
}) {
  const active = sort.key === col
  return (
    <th
      className="text-right px-4 py-2.5 text-slate-500 font-medium text-xs cursor-pointer select-none hover:text-slate-700"
      onClick={() => onSort(col)}
    >
      {label} {active ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )
}

export default function StructuralPanel({ result }: Props) {
  const members = result.building_model.steel_members ?? []
  const [filter, setFilter] = useState<'all' | 'beam' | 'column'>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'utilization', dir: 'desc' })

  const summary = useMemo(() => {
    const counts = { ok: 0, warning: 0, overstressed: 0 }
    for (const m of members) counts[m.status as keyof typeof counts]++
    const avgUtil = members.length ? members.reduce((a, m) => a + m.utilization, 0) / members.length : 0
    const maxUtil = members.length ? Math.max(...members.map(m => m.utilization)) : 0
    return { ...counts, avgUtil, maxUtil, total: members.length }
  }, [members])

  const displayed = useMemo(() => {
    let list = filter === 'all' ? members : members.filter(m => m.member_type === filter)
    list = [...list].sort((a, b) => {
      let va = 0, vb = 0
      if (sort.key === 'utilization') { va = a.utilization; vb = b.utilization }
      else if (sort.key === 'span') { va = a.span_m; vb = b.span_m }
      else if (sort.key === 'demand') { va = a.demand; vb = b.demand }
      else if (sort.key === 'section') return sort.dir === 'asc'
        ? a.section.designation.localeCompare(b.section.designation)
        : b.section.designation.localeCompare(a.section.designation)
      return sort.dir === 'asc' ? va - vb : vb - va
    })
    return list
  }, [members, filter, sort])

  function toggleSort(k: SortKey) {
    setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' })
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
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">Structural Strength Check</h2>
        <p className="text-xs text-slate-400 mt-0.5">LRFD utilization ratios — demand / φ·capacity</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-slate-100 border-b border-slate-100">
        {[
          { label: 'Total Members', value: summary.total, cls: 'text-slate-800' },
          { label: 'OK  (≤80%)', value: summary.ok, cls: 'text-green-600' },
          { label: 'Warning (80–100%)', value: summary.warning, cls: 'text-amber-600' },
          { label: 'Overstressed (>100%)', value: summary.overstressed, cls: 'text-red-600' },
          { label: 'Max Util', value: `${(summary.maxUtil * 100).toFixed(0)}%`, cls: summary.maxUtil > 1 ? 'text-red-600' : summary.maxUtil > 0.8 ? 'text-amber-600' : 'text-green-600' },
        ].map(c => (
          <div key={c.label} className="bg-white px-4 py-3">
            <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filter + table */}
      <div className="px-5 py-3 border-b border-slate-100 flex gap-1">
        {(['all', 'beam', 'column'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
              filter === f ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}>
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 self-center">{displayed.length} members</span>
      </div>

      <div className="overflow-auto max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="text-left px-5 py-2.5 text-slate-500 font-medium text-xs">Type</th>
              <SortHeader label="Section" col="section" sort={sort} onSort={toggleSort} />
              <SortHeader label="Span / Ht (m)" col="span" sort={sort} onSort={toggleSort} />
              <SortHeader label="Demand" col="demand" sort={sort} onSort={toggleSort} />
              <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Capacity</th>
              <SortHeader label="Utilization" col="utilization" sort={sort} onSort={toggleSort} />
              <th className="text-left px-4 py-2.5 text-slate-500 font-medium text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((m: SteelMember) => (
              <tr key={m.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                <td className="px-5 py-2.5 text-slate-500 capitalize text-xs">{m.member_type}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-700">{m.section.designation}</td>
                <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{m.span_m}</td>
                <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                  {m.demand.toFixed(1)} {m.member_type === 'beam' ? 'kN·m' : 'kN'}
                </td>
                <td className="px-4 py-2.5 text-slate-600 tabular-nums">
                  {m.capacity.toFixed(1)} {m.member_type === 'beam' ? 'kN·m' : 'kN'}
                </td>
                <td className="px-4 py-2.5"><UtilBar u={m.utilization} status={m.status} /></td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BG[m.status]}`}>
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
