import { useState, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { findLibraryMatch } from '../../lib/addSongsToSet'

const SECTIONS = [
  { key: 'opening', label: 'Opening' },
  { key: 'middle', label: 'Middle' },
  { key: 'close', label: 'Close' },
]

/** The AI's suggestions for a theme: tick/untick, then add, regenerate or cancel. */
export function ThemePickReview({ theme, picks, remaining, loading, onAdd, onRegenerate, onCancel }) {
  const index = useLibraryStore(s => s.index)
  const [ticked, setTicked] = useState(() => new Set(picks.map(p => p.id)))

  useEffect(() => { setTicked(new Set(picks.map(p => p.id))) }, [picks])

  function toggle(id) {
    setTicked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selected = picks.filter(p => ticked.has(p.id))
  const n = selected.length

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
        {picks.length} songs for “{theme}”
      </h2>

      {SECTIONS.map(({ key, label }) => {
        const rows = picks.filter(p => p.section === key)
        if (rows.length === 0) return null
        return (
          <div key={key} role="group" aria-label={label} className="mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              {label}
            </div>
            <ul className="space-y-1">
              {rows.map(p => (
                <li key={p.id}>
                  <label className="flex items-start gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={ticked.has(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={p.title}
                    />
                    <span className="min-w-0">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{p.title}</span>
                      {p.artist && <span className="text-gray-500 dark:text-gray-400 text-sm"> · {p.artist}</span>}
                      {findLibraryMatch(index, p.title) && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                          in your library
                        </span>
                      )}
                      <span className="block text-sm text-gray-500 dark:text-gray-400">{p.reason}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={() => onAdd(selected)}
          disabled={n === 0 || loading}
          className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold
            transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {`Add ${n} song${n === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={remaining <= 0 || loading}
          className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300
            text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {`↻ Regenerate (${remaining} left)`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="py-2.5 px-4 rounded-lg text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-200"
        >
          Back
        </button>
      </div>
    </div>
  )
}
