import { useMemo } from 'react'
import { chordToSprite } from '../../lib/chords/chordSprite'
import { slashChordImage } from '../../lib/chords/slashChordImages'
import { ChordDiagram, SlashChordDiagram } from './ChordDiagram'

/**
 * Extract unique chords from transposed sections.
 * Slash chords with a known fingering image are returned as { name, kind:'slash', imgSrc }.
 * All others are looked up in the sprite sheet as { name, kind:'sprite', sprite }.
 * Deduplicates by full chord name; unrecognised slash chords fall back to their root.
 */
function extractUniqueChords(sections) {
  const seenFull  = new Set()
  const seenRoots = new Set()
  const result    = []

  for (const section of sections) {
    for (const line of section.lines) {
      for (const { chord } of (line.chords ?? [])) {
        if (seenFull.has(chord)) continue
        seenFull.add(chord)

        if (chord.includes('/')) {
          const imgSrc = slashChordImage(chord)
          if (imgSrc) {
            result.push({ name: chord, kind: 'slash', imgSrc })
            continue
          }
        }

        // Regular chord or slash chord without a dedicated image → show root via sprite
        const root = chord.includes('/') ? chord.slice(0, chord.indexOf('/')) : chord
        if (seenRoots.has(root)) continue
        seenRoots.add(root)
        const sprite = chordToSprite(root)
        if (sprite) result.push({ name: root, kind: 'sprite', sprite })
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
              {item.kind === 'slash'
                ? <SlashChordDiagram imgSrc={item.imgSrc} name={item.name} />
                : <ChordDiagram sprite={item.sprite} />
              }
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
