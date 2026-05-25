import { useState, useRef, FormEvent } from 'react'

const EXAMPLES = [
  "Design a 2-storey residential house with 3 bedrooms, 2 bathrooms, open-plan living and kitchen on a 15x20m site.",
  "Create a 3-floor office building with open workspace, 2 meeting rooms, lobby and bathrooms, 20x25m footprint.",
  "Single storey family home with master bedroom, 2 kids rooms, large living area and modern kitchen, 12x18m site.",
]

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB

interface Props {
  onSubmit: (prompt: string, file?: File) => void
  loading: boolean
}

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isPdf = file.type === 'application/pdf'
  const url   = !isPdf ? URL.createObjectURL(file) : null

  return (
    <div className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50">
      {isPdf ? (
        <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 17.5v-5h1.2c.7 0 1.2.1 1.5.4.3.3.5.7.5 1.2 0 .5-.2.9-.5 1.2-.3.3-.8.4-1.5.4H9.7v1.8H8.5zm1.2-2.7h.3c.3 0 .5-.1.6-.2.1-.1.2-.3.2-.5s-.1-.4-.2-.5c-.1-.1-.3-.2-.6-.2h-.3v1.4zm3 2.7v-5H14c.7 0 1.3.2 1.7.6.4.4.6 1 .6 1.9 0 .9-.2 1.5-.6 1.9-.4.4-1 .6-1.7.6h-1.5zm1.2-.9h.2c.4 0 .7-.1.9-.4.2-.2.3-.6.3-1.2 0-.6-.1-1-.3-1.2-.2-.2-.5-.4-.9-.4h-.2v3.2zm3.1.9v-5h3.3v.9h-2.1v1.1h1.9v.9h-1.9v2.1H17z"/>
          </svg>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url!} alt="sketch preview"
          className="w-10 h-10 object-cover rounded-lg shrink-0 border border-slate-200" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700 truncate">{file.name}</p>
        <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB · {isPdf ? 'PDF' : 'Image'}</p>
      </div>
      <button type="button" onClick={onRemove}
        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export default function GeneratorForm({ onSubmit, loading }: Props) {
  const [prompt, setPrompt]   = useState('')
  const [file,   setFile]     = useState<File | null>(null)
  const [fileErr, setFileErr] = useState<string | null>(null)
  const fileInputRef          = useRef<HTMLInputElement>(null)

  const hasFile = file !== null
  const canSubmit = !loading && (prompt.trim().length > 0 || hasFile)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit(prompt.trim(), file ?? undefined)
  }

  const handleFileChange = (picked: File | null | undefined) => {
    setFileErr(null)
    if (!picked) return
    if (picked.size > MAX_FILE_BYTES) {
      setFileErr(`File too large (max 20 MB). Yours is ${(picked.size / 1024 / 1024).toFixed(1)} MB.`)
      return
    }
    const ok = picked.type.startsWith('image/') || picked.type === 'application/pdf'
    if (!ok) {
      setFileErr('Only image files (JPG, PNG, WebP, GIF) or PDF are supported.')
      return
    }
    setFile(picked)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Describe your building</h2>
      <p className="text-sm text-slate-500 mb-4">
        Type a description, attach a sketch or PDF drawing, or both — the AI will generate a full BIM model.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">

        {/* Textarea */}
        <div className="relative">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={hasFile
              ? 'Optional: add notes or corrections about the sketch…'
              : 'e.g. A 2-storey house with 3 bedrooms, 2 bathrooms, living room and kitchen…'
            }
            rows={5}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800
                       placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500
                       focus:border-transparent resize-none"
            disabled={loading}
          />
        </div>

        {/* File attachment row */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            className="hidden"
            onChange={e => handleFileChange(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => { fileInputRef.current?.click() }}
            title="Attach sketch or PDF"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors disabled:opacity-50 ${
              hasFile
                ? 'border-blue-300 bg-blue-50 text-blue-600'
                : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            {hasFile ? 'Change file' : 'Attach sketch / PDF'}
          </button>
          {!hasFile && (
            <span className="text-xs text-slate-400">JPG · PNG · WebP · PDF — max 20 MB</span>
          )}
        </div>

        {/* File preview */}
        {file && (
          <FilePreview file={file} onRemove={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} />
        )}

        {/* File error */}
        {fileErr && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{fileErr}</p>
        )}

        {/* Info banner when file attached */}
        {hasFile && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Claude will analyse your sketch and extract rooms, dimensions and building type automatically.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed
                     text-white font-medium py-3 px-6 rounded-xl transition-colors duration-150"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              {hasFile ? 'Analysing sketch…' : 'Generating BIM model…'}
            </span>
          ) : hasFile ? 'Analyse Sketch & Generate BIM' : 'Generate BIM Model'}
        </button>
      </form>

      {/* Examples */}
      <div className="mt-5">
        <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Examples</p>
        <div className="space-y-2">
          {EXAMPLES.map((ex, i) => (
            <button key={i} onClick={() => setPrompt(ex)} disabled={loading}
              className="w-full text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100
                         disabled:opacity-50 px-3 py-2 rounded-lg border border-slate-200
                         transition-colors duration-100 truncate">
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
