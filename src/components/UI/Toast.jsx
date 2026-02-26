export function ToastContainer({ toasts }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm
            ${t.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
