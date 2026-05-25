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
    id: 'floorplan',
    label: 'Floor Plan',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
      </svg>
    ),
  },
  {
    id: '3d',
    label: '3D View',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    id: 'roof',
    label: 'Roof Plan',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
      </svg>
    ),
  },
  {
    id: 'quantities',
    label: 'Quantities',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    id: 'steel',
    label: 'Steel Plan',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  {
    id: 'cost',
    label: 'Cost',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'strength',
    label: 'Strength',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
]

export default function App() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
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
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">AI-Driven BIM Generator</h1>
            <p className="text-xs text-slate-500">Natural language → IFC building model</p>
          </div>

          {/* View menu bar — shown in header when a result exists */}
          {result && (
            <nav className="ml-auto flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              {VIEWS.map(v => (
                <button
                  key={v.id}
                  onClick={() => setActiveView(v.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    activeView === v.id
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                  }`}
                >
                  {v.icon}
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6">
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: form */}
          <div className="lg:col-span-1">
            <GeneratorForm onSubmit={handleGenerate} loading={loading} error={error} />
          </div>

          {/* Right columns: view panel */}
          <div className="lg:col-span-2">
            {result ? (
              <>
                {activeView === 'floorplan' && (
                  <FloorPlanViewer result={result} onUpdate={setResult} />
                )}
                {activeView === '3d' && (
                  <ThreeDViewer result={result} roofConfig={roofConfig} />
                )}
                {activeView === 'roof' && (
                  <RoofPlanViewer result={result} config={roofConfig} onConfigChange={setRoofConfig} />
                )}
                {activeView === 'quantities' && (
                  <ResultsPanel result={result} />
                )}
                {activeView === 'steel' && (
                  <SteelPlanViewer result={result} onUpdate={setResult} />
                )}
                {activeView === 'cost' && (
                  <CostPanel result={result} />
                )}
                {activeView === 'strength' && (
                  <StructuralPanel result={result} onUpdate={setResult} />
                )}
              </>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-80
                              flex items-center justify-center text-slate-400">
                {loading ? (
                  <div className="text-center space-y-3">
                    <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full
                                    animate-spin mx-auto"/>
                    <p className="text-sm">AI is designing your building…</p>
                  </div>
                ) : (
                  <div className="text-center space-y-2">
                    <svg className="w-12 h-12 mx-auto text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm">Describe a building to generate your floor plan and IFC file</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
