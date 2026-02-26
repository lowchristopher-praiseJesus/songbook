const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Build a lookup from note name → chromatic index (handles both sharp and flat names)
const NOTE_TO_INDEX = {}
SHARPS.forEach((n, i) => { NOTE_TO_INDEX[n] = i })
FLATS.forEach((n, i)  => { NOTE_TO_INDEX[n] = i })

/**
 * Transpose a chord string by `delta` semitones.
 * @param {string} chord - e.g. "Am7", "G/B", "F#", "Bb", "Fmaj7"
 * @param {number} delta - semitones to shift (negative = down)
 * @param {boolean} usesFlats - use flat notation for accidentals in result
 * @returns {string} transposed chord string
 */
export function transposeChord(chord, delta, usesFlats) {
  if (delta === 0) return chord

  const scale = usesFlats ? FLATS : SHARPS

  // Handle slash chord: "G/B" → root="G", bass="B"
  const slashIdx = chord.indexOf('/')
  if (slashIdx !== -1) {
    const root = chord.slice(0, slashIdx)
    const bass = chord.slice(slashIdx + 1)
    return transposeNote(root, delta, scale) + '/' + transposeNote(bass, delta, scale)
  }

  // Extract root (1 or 2 chars: note + optional accidental) and suffix
  const rootMatch = chord.match(/^([A-G][b#]?)(.*)$/)
  if (!rootMatch) return chord
  const [, root, suffix] = rootMatch
  return transposeNote(root, delta, scale) + suffix
}

function transposeNote(note, delta, scale) {
  const idx = NOTE_TO_INDEX[note]
  if (idx === undefined) return note
  return scale[((idx + delta) % 12 + 12) % 12]
}

/**
 * Return a new sections array with all chord tokens transposed by `delta` semitones.
 * Does not mutate the original array or any of its contents.
 */
export function transposeSections(sections, delta, usesFlats) {
  if (delta === 0) return sections
  return sections.map(section => ({
    ...section,
    lines: section.lines.map(line => {
      if (!line.chords || line.chords.length === 0) return line
      return {
        ...line,
        chords: line.chords.map(ct => ({
          ...ct,
          chord: transposeChord(ct.chord, delta, usesFlats),
        })),
      }
    }),
  }))
}
