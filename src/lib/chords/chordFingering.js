import fingerings from './chordFingerings.json'

const ROOT_ALIAS = {
  'G#': 'Ab', 'C#': 'Db', 'Gb': 'F#', 'D#': 'Eb', 'A#': 'Bb',
}

const SUFFIX_ALIAS = {
  'sus4': 'sus',
  'min':  'm',
}

export function resolveChordKey(chord) {
  if (!chord) return null

  // 1. Try the full chord name as-is
  if (fingerings[chord]) return chord

  // 2. Strip slash bass, apply aliases, look up root+suffix
  const noSlash = chord.includes('/') ? chord.slice(0, chord.indexOf('/')) : chord
  const match = noSlash.match(/^([A-G][b#]?)(.*)$/)
  if (!match) return null

  let [, root, suffix] = match
  root = ROOT_ALIAS[root] ?? root
  suffix = SUFFIX_ALIAS[suffix] ?? suffix
  const key = suffix ? `${root}${suffix}` : root

  return fingerings[key] ? key : null
}

export function chordFingering(chord) {
  const key = resolveChordKey(chord)
  return key ? fingerings[key] : null
}
