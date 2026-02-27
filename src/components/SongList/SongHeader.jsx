import { useState } from 'react'
import { TransposeControl } from './TransposeControl'

export function SongHeader({ meta, transpose, lyricsOnly, onPerformanceMode }) {
  const [infoOpen, setInfoOpen] = useState(false)

  const hasInfo = meta.tempo || meta.timeSignature || meta.capo > 0 || meta.ccli || meta.copyright

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-2">
      <h1 className="text-2xl font-bold leading-tight">{meta.title}</h1>
      {meta.artist && (
        <p className="text-gray-500 dark:text-gray-400 mt-0.5">{meta.artist}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-3">
        {!lyricsOnly && (
          <>
            <TransposeControl
              delta={transpose.delta}
              onTransposeTo={transpose.transposeTo}
              originalKeyIndex={meta.keyIndex}
              isMinor={meta.isMinor}
            />

            <div className="flex items-center gap-1" aria-label="Capo controls">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Capo</span>
              <button
                type="button"
                onClick={transpose.capoDown}
                disabled={transpose.capo === 0}
                className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm leading-none hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Decrease capo"
              >−</button>
              <span className="w-4 text-center text-sm font-mono">{transpose.capo}</span>
              <button
                type="button"
                onClick={transpose.capoUp}
                disabled={transpose.capo === 7}
                className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm leading-none hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Increase capo"
              >+</button>
            </div>
          </>
        )}

        {hasInfo && (
          <button
            type="button"
            onClick={() => setInfoOpen(o => !o)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
            aria-expanded={infoOpen}
          >
            Info {infoOpen ? '▲' : '▼'}
          </button>
        )}

        <button
          type="button"
          onClick={onPerformanceMode}
          className="ml-auto text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          ⛶ Performance
        </button>
      </div>

      {infoOpen && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
          {meta.key && (
            <div><span className="font-medium text-gray-700 dark:text-gray-300">Key:</span> {meta.key}</div>
          )}
          {meta.capo > 0 && (
            <div><span className="font-medium text-gray-700 dark:text-gray-300">Capo:</span> {meta.capo}</div>
          )}
          {meta.tempo && (
            <div><span className="font-medium text-gray-700 dark:text-gray-300">BPM:</span> {meta.tempo}</div>
          )}
          {meta.timeSignature && (
            <div><span className="font-medium text-gray-700 dark:text-gray-300">Time:</span> {meta.timeSignature}</div>
          )}
          {meta.ccli && (
            <div><span className="font-medium text-gray-700 dark:text-gray-300">CCLI:</span> {meta.ccli}</div>
          )}
          {meta.copyright && (
            <div className="col-span-2 text-xs">
              <span className="font-medium text-gray-700 dark:text-gray-300">©</span> {meta.copyright}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
