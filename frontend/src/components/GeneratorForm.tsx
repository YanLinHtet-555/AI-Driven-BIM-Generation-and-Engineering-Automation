import { useState, useRef, useCallback, FormEvent } from 'react'

const EXAMPLES = [
  "2-storey house, 3 bedrooms, 2 bathrooms, open-plan living and kitchen on a 15×20m site.",
  "3-floor office with open workspace, 2 meeting rooms, lobby and bathrooms, 20×25m footprint.",
  "Single storey family home, master bedroom, 2 kids rooms, large living area, modern kitchen, 12×18m.",
]

const MAX_FILE_BYTES = 20 * 1024 * 1024

interface Props {
  onSubmit: (prompt: string, file?: File) => void
  loading: boolean
  error?: string | null
}

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isPdf = file.type === 'application/pdf'
  const url   = !isPdf ? URL.createObjectURL(file) : null

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
      {isPdf ? (
        <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/>
          </svg>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url!} alt="sketch preview"
          className="w-9 h-9 object-cover rounded-lg shrink-0 border border-gray-200" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{file.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {(file.size / 1024).toFixed(0)} KB · {isPdf ? 'PDF document' : 'Image'}
        </p>
      </div>
      <button type="button" onClick={onRemove}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0">
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

  const hasFile  = file !== null
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
      setFileErr(`File too large (max 20 MB). Yours is ${(picked.size / 1024 / 1024).toFixed(1)} MB.`)
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

      {/* Card header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Generate Building</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Describe a building or upload a sketch to create a full BIM model
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">

        {/* Description textarea */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Description
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={hasFile
              ? 'Optional: add notes or corrections about the sketch…'
              : 'e.g. A 2-storey house with 3 bedrooms, 2 bathrooms, open-plan living and kitchen…'
            }
            rows={5}
            disabled={loading}
            className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800
                       placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20
                       focus:border-blue-500 resize-none transition-colors disabled:bg-gray-50
                       disabled:text-gray-500"
          />
        </div>

        {/* File upload */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Sketch / Drawing
            <span className="ml-1 text-gray-400 font-normal">— optional</span>
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
              className={`rounded-lg border-2 border-dashed p-5 text-center transition-all select-none ${
                loading
                  ? 'cursor-not-allowed opacity-50 border-gray-200'
                  : dragOver
                  ? 'border-blue-400 bg-blue-50 cursor-copy'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 cursor-pointer'
              }`}
            >
              <svg className="w-6 h-6 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-xs text-gray-500">
                {dragOver
                  ? 'Drop to attach'
                  : <>Drop a file here or <span className="text-blue-600 font-medium">browse</span></>
                }
              </p>
              <p className="text-xs text-gray-400 mt-0.5">JPG · PNG · WebP · PDF — max 20 MB</p>
            </div>
          )}

          {fileErr && (
            <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {fileErr}
            </p>
          )}
        </div>

        {/* Generation error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-3 flex items-start gap-2.5">
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
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                     disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
                     text-white text-sm font-medium py-2.5 px-4 rounded-lg
                     transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {hasFile ? 'Analysing sketch…' : 'Generating BIM model…'}
            </>
          ) : hasFile ? 'Analyse Sketch & Generate BIM' : 'Generate BIM Model'}
        </button>

      </form>

      {/* Examples */}
      <div className="px-5 pb-5 pt-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Examples</p>
        <div className="space-y-1.5">
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setPrompt(ex)} disabled={loading}
              className="w-full text-left text-xs text-gray-600 bg-gray-50 hover:bg-gray-100
                         border border-gray-100 hover:border-gray-200
                         disabled:opacity-50 px-3 py-2 rounded-lg transition-colors leading-relaxed">
              {ex}
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
