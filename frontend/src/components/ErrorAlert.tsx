interface Props {
  message: string
  onDismiss: () => void
}

export default function ErrorAlert({ message, onDismiss }: Props) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 shadow-sm px-4 py-3.5 flex items-start gap-3">
      <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-800">Something went wrong</p>
        <p className="text-xs text-red-600 mt-0.5 leading-relaxed">{message}</p>
      </div>
      <button onClick={onDismiss}
        className="w-7 h-7 rounded-lg text-red-300 hover:text-red-500 hover:bg-red-100 transition-colors shrink-0 flex items-center justify-center">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
