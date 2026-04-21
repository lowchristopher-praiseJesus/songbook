const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const FLAT_KEY_NAMES  = new Set(['Db', 'Eb', 'F', 'Ab', 'Bb'])
const FLAT_KEY_INDICES = new Set([1, 3, 5, 8, 10])
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]

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

  // Handle slash chord: "G/B" → root="G", bass="B"; "Dm7/F" → root="D", suffix="m7", bass="F"
  const slashIdx = chord.indexOf('/')
  if (slashIdx !== -1) {
    const leftPart = chord.slice(0, slashIdx)
    const bass = chord.slice(slashIdx + 1)
    const leftMatch = leftPart.match(/^([A-G][b#]?)(.*)$/)
    if (!leftMatch) return chord
    const [, leftRoot, leftSuffix] = leftMatch
    return transposeNote(leftRoot, delta, scale) + leftSuffix + '/' + transposeNote(bass, delta, scale)
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
 * Detect the most likely major key from inline [Chord] markers in rawText.
 * Scores all 12 keys by diatonic fit; tonic presence gets a 50% bonus.
 */
export function detectKeyFromContent(rawText) {
  const freq = new Array(12).fill(0)
  const re = /\[([A-G][b#]?)/g
  let m
  while ((m = re.exec(rawText)) !== null) {
    const idx = NOTE_TO_INDEX[m[1]]
    if (idx !== undefined) freq[idx]++
  }

  if (freq.every(f => f === 0)) return { key: 'C', keyIndex: 0, isMinor: false, usesFlats: false }

  let bestKey = 0, bestScore = -1
  for (let k = 0; k < 12; k++) {
    const diatonic = new Set(MAJOR_SCALE.map(d => (k + d) % 12))
    const score = freq.reduce((s, f, i) => s + (diatonic.has(i) ? f : 0), 0) + freq[k] * 0.5
    if (score > bestScore) { bestScore = score; bestKey = k }
  }

  const usesFlats = FLAT_KEY_INDICES.has(bestKey)
  const key = usesFlats ? FLATS[bestKey] : SHARPS[bestKey]
  return { key, keyIndex: bestKey, isMinor: false, usesFlats }
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
