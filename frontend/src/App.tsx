import { useState } from 'react'
import GeneratorForm from './components/GeneratorForm'
import FloorPlanViewer from './components/FloorPlanViewer'
import ThreeDViewer from './components/ThreeDViewer'
import RoofPlanViewer from './components/RoofPlanViewer'
import ResultsPanel from './components/ResultsPanel'
import SteelPlanViewer from './components/SteelPlanViewer'
import CostPanel from './components/CostPanel'
import StructuralPanel from './components/StructuralPanel'
import ErrorAlert from './components/ErrorAlert'
import { generateBuilding } from './api/client'
import type { GenerationResponse } from './types/api'
import type { RoofConfig } from './types/viewer'
import { DEFAULT_ROOF_CONFIG } from './types/viewer'

type ViewId = 'floorplan' | '3d' | 'roof' | 'quantities' | 'steel' | 'cost' | 'strength'

const VIEWS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'floorplan', label: 'Floor Plan',
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>,
  },
  {
    id: '3d', label: '3D View',
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>,
  },
  {
    id: 'roof', label: 'Roof',
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" /></svg>,
  },
  {
    id: 'quantities', label: 'Quantities',
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  },
  {
    id: 'steel', label: 'Steel',
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h7" /></svg>,
  },
  {
    id: 'cost', label: 'Cost',
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    id: 'strength', label: 'Strength',
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  },
]

const FEATURE_CHIPS = [
  'Floor Plan', '3D View', 'Roof Plan', 'IFC Export', 'Cost Estimate', 'Structural Check', 'Steel Design', 'MEP Systems',
]

export default function App() {
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<GenerationResponse | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [roofConfig, setRoofConfig] = useState<RoofConfig>(DEFAULT_ROOF_CONFIG)
  const [activeView, setActiveView] = useState<ViewId>('floorplan')

  const handleGenerate = async (prompt: string, file?: File) => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await generateBuilding(prompt, file)
      setResult(data)
      setActiveView('floorplan')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-grid-pattern">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-20 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-3">

          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="leading-none">
              <p className="text-sm font-bold text-gray-900 tracking-tight">BIM Generator</p>
              <p className="text-[10px] text-gray-400 font-normal mt-0.5">AI-Driven Design</p>
            </div>
          </div>

          {/* Nav tabs */}
          {result && (
            <>
              <div className="h-5 w-px bg-gray-200 mx-1 shrink-0" />
              <nav className="flex items-center gap-0.5 overflow-x-auto">
                {VIEWS.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setActiveView(v.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                      activeView === v.id
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {v.icon}
                    <span className="hidden md:inline">{v.label}</span>
                  </button>
                ))}
              </nav>
            </>
          )}

          {/* Status pill */}
          <div className="ml-auto shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border transition-all duration-300 ${
              loading
                ? 'text-amber-600 bg-amber-50 border-amber-200'
                : 'text-emerald-600 bg-emerald-50 border-emerald-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              {loading ? 'Processing…' : 'AI Ready'}
            </span>
          </div>

        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-6">

        {error && (
          <div className="mb-5">
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

          {/* Left: form */}
          <div className="lg:col-span-1">
            <GeneratorForm onSubmit={handleGenerate} loading={loading} error={error} />
          </div>

          {/* Right: viewer */}
          <div className="lg:col-span-2">
            {result ? (
              <>
                {activeView === 'floorplan'  && <FloorPlanViewer  result={result} onUpdate={setResult} />}
                {activeView === '3d'         && <ThreeDViewer     result={result} roofConfig={roofConfig} />}
                {activeView === 'roof'       && <RoofPlanViewer   result={result} config={roofConfig} onConfigChange={setRoofConfig} />}
                {activeView === 'quantities' && <ResultsPanel     result={result} />}
                {activeView === 'steel'      && <SteelPlanViewer  result={result} onUpdate={setResult} />}
                {activeView === 'cost'       && <CostPanel        result={result} />}
                {activeView === 'strength'   && <StructuralPanel  result={result} onUpdate={setResult} />}
              </>
            ) : (
              /* Empty / loading state */
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="h-[520px] flex flex-col items-center justify-center px-10 text-center">
                  {loading ? (
                    <div className="space-y-5">
                      {/* Animated spinner */}
                      <div className="relative w-14 h-14 mx-auto">
                        <div className="absolute inset-0 rounded-full border-[3px] border-blue-100" />
                        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-600 animate-spin" />
                        <div className="absolute inset-[5px] rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                          </svg>
                        </div>
                      </div>

                      <div>
                        <p className="text-base font-semibold text-gray-800">AI is designing your building</p>
                        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                          Extracting requirements, planning spaces, generating structure &amp; MEP…
                        </p>
                      </div>

                      {/* Bouncing dots */}
                      <div className="flex items-center justify-center gap-1.5">
                        {[0, 150, 300].map(delay => (
                          <span key={delay}
                            className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 max-w-xs mx-auto">
                      {/* Icon */}
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                        <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-gray-800">Ready to generate</h3>
                        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                          Describe your building or upload a sketch — AI generates a complete BIM model in seconds.
                        </p>
                      </div>

                      {/* Feature chips */}
                      <div className="flex flex-wrap gap-2 justify-center">
                        {FEATURE_CHIPS.map(f => (
                          <span key={f}
                            className="inline-flex items-center text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full font-medium">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

    </div>
  )
}
