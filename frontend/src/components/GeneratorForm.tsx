import { useState, FormEvent } from 'react'

const EXAMPLES = [
  "Design a 2-storey residential house with 3 bedrooms, 2 bathrooms, open-plan living and kitchen on a 15x20m site.",
  "Create a 3-floor office building with open workspace, 2 meeting rooms, lobby and bathrooms, 20x25m footprint.",
  "Single storey family home with master bedroom, 2 kids rooms, large living area and modern kitchen, 12x18m site.",
]

interface Props {
  onSubmit: (prompt: string) => void
  loading: boolean
}

export default function GeneratorForm({ onSubmit, loading }: Props) {
  const [prompt, setPrompt] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (prompt.trim() && !loading) onSubmit(prompt.trim())
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Describe your building</h2>
      <p className="text-sm text-slate-500 mb-4">
        Describe any building in plain English — the AI will generate a floor plan and IFC model.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. A 2-storey house with 3 bedrooms, 2 bathrooms, living room and kitchen..."
          rows={5}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800
                     placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500
                     focus:border-transparent resize-none"
          disabled={loading}
        />

        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed
                     text-white font-medium py-3 px-6 rounded-xl transition-colors duration-150"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              Generating BIM model…
            </span>
          ) : 'Generate BIM Model'}
        </button>
      </form>

      <div className="mt-5">
        <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Examples</p>
        <div className="space-y-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setPrompt(ex)}
              disabled={loading}
              className="w-full text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100
                         disabled:opacity-50 px-3 py-2 rounded-lg border border-slate-200
                         transition-colors duration-100 truncate"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
