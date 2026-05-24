interface Props {
  message: string
  onDismiss: () => void
}

export default function ErrorAlert({ message, onDismiss }: Props) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
      <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex-1 text-sm text-red-700">{message}</div>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-600 flex-shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
