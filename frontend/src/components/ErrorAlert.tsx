interface Props {
  message: string
  onDismiss: () => void
}

export default function ErrorAlert({ message, onDismiss }: Props) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
      <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="flex-1 text-sm text-red-700 leading-relaxed">{message}</p>
      <button onClick={onDismiss}
        className="text-red-300 hover:text-red-500 transition-colors shrink-0 p-0.5 -mr-0.5">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
