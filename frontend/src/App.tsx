import { useState } from 'react'
import GeneratorForm from './components/GeneratorForm'
import FloorPlanViewer from './components/FloorPlanViewer'
import ResultsPanel from './components/ResultsPanel'
import ErrorAlert from './components/ErrorAlert'
import { generateBuilding } from './api/client'
import type { GenerationResponse } from './types/api'

export default function App() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async (prompt: string) => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await generateBuilding(prompt)
      setResult(data)
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
            <GeneratorForm onSubmit={handleGenerate} loading={loading} />
          </div>

          {/* Right columns: results */}
          <div className="lg:col-span-2 space-y-6">
            {result ? (
              <>
                <FloorPlanViewer result={result} />
                <ResultsPanel result={result} />
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
