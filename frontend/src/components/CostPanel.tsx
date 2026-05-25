import type { GenerationResponse } from '../types/api'
import type { CostItem } from '../types/api'

interface Props { result: GenerationResponse }

const CAT_COLOR: Record<string, string> = {
  Structure: '#3b82f6',
  Envelope:  '#8b5cf6',
  Interior:  '#f59e0b',
  MEP:       '#10b981',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function pct(amount: number, total: number) {
  return total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0'
}

export default function CostPanel({ result }: Props) {
  const est = result.building_model.cost_estimate

  if (!est) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Cost estimate not available</p>
      </div>
    )
  }

  const categories = Array.from(new Set(est.items.map(i => i.category)))

  const catTotals: Record<string, number> = {}
  for (const it of est.items) catTotals[it.category] = (catTotals[it.category] ?? 0) + it.amount

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Cost Estimate</h2>
          <p className="text-xs text-gray-400 mt-0.5">Indicative budget-level estimate ({est.currency})</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-gray-900">{est.currency} {fmt(est.grand_total)}</div>
          <div className="text-xs text-gray-400">Grand Total</div>
        </div>
      </div>

      {/* Category summary bars */}
      <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-gray-100">
        {categories.map(cat => {
          const total = catTotals[cat] ?? 0
          const color = CAT_COLOR[cat] ?? '#64748b'
          return (
            <div key={cat} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
                <span className="text-xs text-gray-600 font-medium">{cat}</span>
              </div>
              <div className="text-base font-semibold text-gray-800">${fmt(total)}</div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full" style={{ width: `${pct(total, est.grand_total)}%`, background: color }} />
              </div>
              <div className="text-xs text-gray-400">{pct(total, est.grand_total)}%</div>
            </div>
          )
        })}
      </div>

      {/* Detailed line items */}
      <div className="overflow-auto max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left px-5 py-2.5 text-gray-500 font-medium text-xs">Description</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Qty</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Unit</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Rate ({est.currency})</th>
              <th className="text-right px-5 py-2.5 text-gray-500 font-medium text-xs">Amount</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => {
              const catItems = est.items.filter(i => i.category === cat)
              const color = CAT_COLOR[cat] ?? '#64748b'
              return [
                <tr key={`hdr-${cat}`} className="bg-gray-50/60">
                  <td colSpan={4} className="px-5 py-2 text-xs font-semibold" style={{ color }}>
                    {cat}
                  </td>
                  <td className="px-5 py-2 text-xs font-semibold text-right" style={{ color }}>
                    {est.currency} {fmt(catTotals[cat] ?? 0)}
                  </td>
                </tr>,
                ...catItems.map((it: CostItem) => (
                  <tr key={`${cat}-${it.description}`} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-5 py-2 text-gray-700">{it.description}</td>
                    <td className="px-4 py-2 text-right text-gray-600 tabular-nums">{fmt(it.quantity)}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{it.unit}</td>
                    <td className="px-4 py-2 text-right text-gray-600 tabular-nums">{fmt(it.unit_rate)}</td>
                    <td className="px-5 py-2 text-right text-gray-800 font-medium tabular-nums">{fmt(it.amount)}</td>
                  </tr>
                )),
              ]
            })}
            <tr className="border-t-2 border-gray-200 bg-gray-50">
              <td colSpan={4} className="px-5 py-3 text-sm font-bold text-gray-800">Grand Total</td>
              <td className="px-5 py-3 text-right text-sm font-bold text-gray-900 tabular-nums">
                {est.currency} {fmt(est.grand_total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
