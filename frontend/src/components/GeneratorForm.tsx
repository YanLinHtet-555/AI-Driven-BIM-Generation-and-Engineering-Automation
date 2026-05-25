import { useState, useRef, useCallback, FormEvent } from 'react'

const EXAMPLES = [
  "2-storey residential house, 3 bedrooms, 2 bathrooms, open-plan living and kitchen on a 15×20m site.",
  "3-floor office building with open workspace, 2 meeting rooms, lobby and bathrooms, 20×25m footprint.",
  "Single storey family home, master bedroom, 2 kids rooms, large living area, modern kitchen, 12×18m.",
]

const MAX_FILE_BYTES = 20 * 1024 * 1024

interface Props {
  onSubmit: (prompt: string, file?: File) => void
  loading:  boolean
  error?:   string | null
}

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isPdf = file.type === 'application/pdf'
  const url   = !isPdf ? URL.createObjectURL(file) : null

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 border border-blue-100">
      {isPdf ? (
        <div className="w-10 h-10 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url!} alt="sketch preview"
          className="w-10 h-10 object-cover rounded-lg shrink-0 border border-blue-200" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-700 truncate">{file.name}</p>
        <p className="text-xs text-blue-500 mt-0.5">
          {(file.size / 1024).toFixed(0)} KB · {isPdf ? 'PDF document' : 'Image'} · Ready to analyse
        </p>
      </div>
      <button type="button" onClick={onRemove}
        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export default function GeneratorForm({ onSubmit, loading, error }: Props) {
  const [prompt,   setPrompt]   = useState('')
  const [file,     setFile]     = useState<File | null>(null)
  const [fileErr,  setFileErr]  = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasFile   = file !== null
  const canSubmit = !loading && (prompt.trim().length > 0 || hasFile)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit(prompt.trim(), file ?? undefined)
  }

  const handleFileChange = useCallback((picked: File | null | undefined) => {
    setFileErr(null)
    if (!picked) return
    if (picked.size > MAX_FILE_BYTES) {
      setFileErr(`File is too large (max 20 MB). Yours is ${(picked.size / 1024 / 1024).toFixed(1)} MB.`)
      return
    }
    if (!picked.type.startsWith('image/') && picked.type !== 'application/pdf') {
      setFileErr('Only image files (JPG, PNG, WebP) or PDF are supported.')
      return
    }
    setFile(picked)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFileChange(e.dataTransfer.files?.[0])
  }, [handleFileChange])

  const clearFile = () => {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* ── Gradient header ──────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-5 py-5">
        {/* Decorative blobs */}
        <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute -bottom-4 -left-4 w-14 h-14 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute top-2 right-14 w-6 h-6 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-white tracking-tight">Generate Building</h2>
          </div>
          <p className="text-xs text-blue-100 leading-relaxed">
            Describe a building in natural language or upload a sketch — AI creates a complete BIM model with floor plan, structure, MEP &amp; cost estimate.
          </p>
        </div>
      </div>

      {/* ── Form body ────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="p-5 space-y-4">

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Description
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={hasFile
              ? 'Optional: add notes or corrections about the sketch…'
              : 'e.g. A 2-storey house with 3 bedrooms, 2 bathrooms, open-plan living and kitchen on a 15×20m site…'
            }
            rows={5}
            disabled={loading}
            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-3 text-sm
                       text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2
                       focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white
                       resize-none transition-all disabled:opacity-60"
          />
        </div>

        {/* File upload */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Sketch / Drawing
            <span className="ml-1.5 text-gray-400 font-normal normal-case">optional</span>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            className="hidden"
            onChange={e => handleFileChange(e.target.files?.[0])}
          />

          {file ? (
            <FilePreview file={file} onRemove={clearFile} />
          ) : (
            <div
              onClick={() => !loading && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); if (!loading) setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-5 text-center transition-all select-none ${
                loading
                  ? 'cursor-not-allowed opacity-50 border-gray-200'
                  : dragOver
                  ? 'border-blue-400 bg-blue-50 cursor-copy scale-[1.01]'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer'
              }`}
            >
              <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-2.5">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-gray-600">
                {dragOver
                  ? 'Drop to attach'
                  : <><span className="text-blue-600">Browse</span> or drag &amp; drop</>
                }
              </p>
              <p className="text-xs text-gray-400 mt-0.5">JPG · PNG · WebP · PDF — max 20 MB</p>
            </div>
          )}

          {fileErr && (
            <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1.5">
              <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {fileErr}
            </p>
          )}
        </div>

        {/* Generation error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-red-700">Generation failed</p>
              <p className="text-xs text-red-600 mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600
                     hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800
                     disabled:from-gray-200 disabled:to-gray-200 disabled:cursor-not-allowed
                     text-white disabled:text-gray-400 text-sm font-semibold
                     py-3 px-4 rounded-xl transition-all duration-150 shadow-sm
                     hover:shadow-md hover:shadow-blue-200/50 disabled:shadow-none
                     flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {hasFile ? 'Analysing sketch…' : 'Generating BIM model…'}
            </>
          ) : (
            <>
              {hasFile ? 'Analyse Sketch & Generate BIM' : 'Generate BIM Model'}
              {!loading && canSubmit && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              )}
            </>
          )}
        </button>

      </form>

      {/* ── Examples ─────────────────────────────────────────────────── */}
      <div className="px-5 pb-5">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="h-px flex-1 bg-gray-100" />
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Examples</p>
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        <div className="space-y-2">
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setPrompt(ex)} disabled={loading}
              className="w-full text-left text-xs text-gray-600 bg-gray-50 hover:bg-gray-100
                         border border-gray-100 hover:border-gray-200
                         disabled:opacity-50 px-3.5 py-2.5 rounded-xl transition-all
                         leading-relaxed hover:text-gray-800">
              <span className="text-gray-400 font-medium mr-1.5">{i + 1}.</span>
              {ex}
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
