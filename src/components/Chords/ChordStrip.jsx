import { useMemo } from 'react'
import { chordFingering, resolveChordKey } from '../../lib/chords/chordFingering'
import { ChordDiagramSVG } from './ChordDiagramSVG'

/**
 * Extract unique chords from transposed sections.
 * Deduplicates by resolved chord key — slash chords that fall back to their root
 * are treated as the same chord as the plain root (e.g., C/G and C both → C).
 */
function extractUniqueChords(sections) {
  const seen = new Set()
  const result = []

  for (const section of sections) {
    for (const line of section.lines) {
      for (const { chord } of (line.chords ?? [])) {
        const key = resolveChordKey(chord)
        if (!key || seen.has(key)) continue
        seen.add(key)
        result.push({ name: key, fingering: chordFingering(chord) })
      }
    }
  }

  return result
}

/**
 * Collapsible strip of chord diagrams above the song body.
 *
 * @param {{ sections: object[], open: boolean, onToggle: () => void }} props
 */
export function ChordStrip({ sections, open, onToggle }) {
  const chords = useMemo(() => extractUniqueChords(sections ?? []), [sections])

  if (chords.length === 0) return null

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
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

      {open && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {chords.map(item => (
            <div key={item.name} data-chord={item.name}>
              <span className="sr-only">{item.name}</span>
              <ChordDiagramSVG fingering={item.fingering} name={item.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
