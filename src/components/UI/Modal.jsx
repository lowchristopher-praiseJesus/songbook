import { useEffect } from 'react'

export function Modal({ isOpen, title, children, onClose, size = 'md', footer }) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen || !onClose) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const maxWidthClass = size === 'xl' ? 'max-w-3xl' : 'max-w-md'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-xl ${maxWidthClass} w-full mx-4 max-h-[90vh] flex flex-col ${footer ? '' : 'overflow-y-auto p-4 sm:p-6'}`}
        onClick={e => e.stopPropagation()}
      >
        {footer ? (
          <>
            <div className="overflow-y-auto p-4 sm:p-6 flex-1 min-h-0">
              {title && (
                <h2 id="modal-title" className="text-lg font-semibold mb-4 dark:text-white">{title}</h2>
              )}
              {children}
            </div>
            <div className="shrink-0 p-4 sm:p-6 pt-3 border-t border-gray-200 dark:border-gray-700">
              {footer}
            </div>
          </>
        ) : (
          <>
            {title && (
              <h2 id="modal-title" className="text-lg font-semibold mb-4 dark:text-white">{title}</h2>
            )}
            {children}
          </>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Close modal"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
