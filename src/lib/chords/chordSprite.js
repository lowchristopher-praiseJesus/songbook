// Sprite sheet dimensions and crop constants
export const SPRITE_W   = 84
export const SPRITE_H   = 116
const ROW_TOP_0  = 83
const ROW_HEIGHT = 116

// cropX per column index (0–10), centered on each chord diagram box
const CROP_XS = [60, 140, 220, 300, 380, 460, 539, 618, 698, 778, 858]

// 12 root rows in chart order
const ROOT_ROWS = ['Ab','A','Bb','B','C','Db','D','Eb','E','F','F#','G']
const ROOT_TO_ROW = Object.fromEntries(ROOT_ROWS.map((r, i) => [r, i]))

// Enharmonic aliases → canonical chart name
const ROOT_ALIAS = {
  'G#': 'Ab',
  'C#': 'Db',
  'Gb': 'F#',
  'D#': 'Eb',
  'A#': 'Bb',
}

// 11 chord type columns in chart order
const SUFFIX_COLS = ['','m','6','7','9','m6','m7','maj7','dim','+','sus']
const SUFFIX_TO_COL = Object.fromEntries(SUFFIX_COLS.map((s, i) => [s, i]))

// Suffix normalisation before lookup
const SUFFIX_ALIAS = {
  'sus4': 'sus',
  'min':  'm',
}

/**
 * Map a chord name to its CSS sprite {x, y} position.
 * Returns null if the chord is not represented in the chart.
 *
 * @param {string} chord - e.g. "Am7", "G/B", "Dsus4", "Cmaj7"
 * @returns {{ x: number, y: number } | null}
 */
export function chordToSprite(chord) {
  if (!chord) return null

  // Strip slash bass note: "G/B" → "G"
  const noSlash = chord.includes('/') ? chord.slice(0, chord.indexOf('/')) : chord

  // Extract root (1 or 2 chars: note + optional accidental) and suffix
  const match = noSlash.match(/^([A-G][b#]?)(.*)$/)
  if (!match) return null
  let [, root, suffix] = match

  // Apply enharmonic alias
  root = ROOT_ALIAS[root] ?? root

  // Apply suffix alias
  suffix = SUFFIX_ALIAS[suffix] ?? suffix

  const row = ROOT_TO_ROW[root]
  const col = SUFFIX_TO_COL[suffix]

  if (row === undefined || col === undefined) return null

  return {
    x: CROP_XS[col],
    y: ROW_TOP_0 + row * ROW_HEIGHT,
  }
}
