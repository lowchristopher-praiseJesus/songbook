import { useMemo } from 'react'
import { chordToSprite } from '../../lib/chords/chordSprite'
import { ChordDiagram } from './ChordDiagram'

/**
 * Extract unique chord names (in order of first appearance) from transposed sections.
 * Strips slash bass, deduplicates, and filters to only chords present in the sprite.
 */
function extractUniqueChords(sections) {
  const seen = new Set()
  const result = []

  for (const section of sections) {
    for (const line of section.lines) {
      for (const { chord } of (line.chords ?? [])) {
        // Strip slash bass: "G/B" → "G"
        const name = chord.includes('/') ? chord.slice(0, chord.indexOf('/')) : chord
        if (seen.has(name)) continue
        seen.add(name)
        if (chordToSprite(name) !== null) result.push(name)
      }
    }
  }

  return result
}

/**
 * Collapsible, horizontally-scrollable strip of chord diagrams.
 *
 * @param {{ sections: object[], open: boolean, onToggle: () => void }} props
 */
export function ChordStrip({ sections, open, onToggle }) {
  const chords = useMemo(() => extractUniqueChords(sections ?? []), [sections])

  if (chords.length === 0) return null

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium
          text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
          w-full text-left"
        aria-expanded={open}
      >
        Chords {open ? '▴' : '▾'}
      </button>

      {/* Diagram row */}
      {open && (
        <div className="overflow-x-auto">
          <div className="flex gap-1 px-4 pb-3">
            {chords.map(name => (
              <div key={name} data-chord={name}>
                <span className="sr-only">{name}</span>
                <ChordDiagram sprite={chordToSprite(name)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
