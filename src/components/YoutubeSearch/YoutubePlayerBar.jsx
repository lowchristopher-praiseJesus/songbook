import { useEffect } from 'react'
import { MinusSmallIcon } from '@heroicons/react/24/outline'

export function YoutubePlayerBar({
  videoId,
  label,
  minimized,
  hasResults,
  onMinimize,
  onExpand,
  onSearchAgain,
  onBackToResults,
  onClose,
}) {
  useEffect(() => {
    if (minimized || !onClose) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [minimized, onClose])

  return (
    <div
      className={
        minimized
          // z-[55]: above the Maximize (z-50) and Performance (z-50) full-viewport
          // overlays this bar must stay visible/playing behind — see MainContent,
          // which renders this player once at a level those overlays don't unmount.
          ? 'fixed bottom-0 inset-x-0 z-[55] flex items-center justify-between gap-3 px-4 pt-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg pb-[max(0.5rem,env(safe-area-inset-bottom))]'
          : 'fixed inset-0 z-[60] flex items-center justify-center bg-black/50'
      }
      onClick={minimized ? undefined : onClose}
    >
      <div
        role={minimized ? undefined : 'dialog'}
        aria-modal={minimized ? undefined : true}
        aria-labelledby={minimized ? undefined : 'youtube-player-title'}
        className={
          minimized
            ? 'flex items-center justify-between gap-3 w-full'
            : 'relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto p-4 sm:p-6'
        }
        onClick={minimized ? undefined : e => e.stopPropagation()}
      >
        {minimized ? (
          <span className="text-sm truncate text-gray-700 dark:text-gray-200">
            <span aria-hidden="true">▶ </span>{label || 'YouTube'}
          </span>
        ) : (
          <h2 id="youtube-player-title" className="text-lg font-semibold mb-4 dark:text-white">Search YouTube</h2>
        )}

        <iframe
          title="YouTube video player"
          aria-hidden={minimized}
          src={`https://www.youtube.com/embed/${videoId}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen={!minimized}
          className={
            minimized
              ? 'w-px h-px overflow-hidden opacity-0 absolute pointer-events-none'
              : 'w-full aspect-video rounded-lg'
          }
        />

        {minimized ? (
          <div className="flex items-center gap-3 shrink-0 text-sm">
            <button type="button" onClick={onExpand} className="text-indigo-500 hover:underline">
              Expand
            </button>
            <button type="button" onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:underline">
              Close
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-sm mt-2">
            <div className="flex items-center gap-3">
              {hasResults && (
                <button type="button" onClick={onBackToResults} className="text-indigo-500 hover:underline">
                  ← Back to results
                </button>
              )}
              <button type="button" onClick={onSearchAgain} aria-label="Search again" className="text-indigo-500 hover:underline">
                ← Search again
              </button>
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 dark:text-gray-400 hover:underline"
            >
              Open on YouTube ↗
            </a>
          </div>
        )}

        {!minimized && (
          <>
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimize"
              className="absolute top-3 right-11 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <MinusSmallIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}
