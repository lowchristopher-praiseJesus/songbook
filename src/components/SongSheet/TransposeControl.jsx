export function TransposeControl({ delta, onUp, onDown, onReset, originalKey }) {
  const displayKey = originalKey ?? '?'
  const deltaLabel = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : ''

  return (
    <div className="flex items-center gap-1" aria-label="Transpose controls">
      <button
        type="button"
        onClick={onDown}
        aria-label="Transpose down one semitone"
        className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-bold text-sm flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        −
      </button>
      <span className="text-sm font-mono min-w-[4rem] text-center select-none" aria-live="polite">
        {displayKey}{deltaLabel}
      </span>
      <button
        type="button"
        onClick={onUp}
        aria-label="Transpose up one semitone"
        className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-bold text-sm flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        +
      </button>
      {delta !== 0 && (
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset transposition"
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline ml-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
        >
          Reset
        </button>
      )}
    </div>
  )
}
