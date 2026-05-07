import fingerings from './chordFingerings.json'

const ROOT_ALIAS = {
  'G#': 'Ab', 'C#': 'Db', 'F#': 'Gb', 'D#': 'Eb', 'A#': 'Bb',
}

const SUFFIX_ALIAS = {
  'sus4': 'sus',
  'min':  'm',
}

export function resolveChordKey(chord) {
  if (!chord) return null

  // 1. Try the full chord name as-is
  if (fingerings[chord]) return chord

  // 2. Apply root alias and try again (handles C#/E → Db/E, G#m → Abm, etc.)
  const match = chord.match(/^([A-G][b#]?)(.*)$/)
  if (!match) return null

  let [, root, rest] = match
  const aliasedRoot = ROOT_ALIAS[root] ?? root
  if (aliasedRoot !== root) {
    const aliasedKey = `${aliasedRoot}${rest}`
    if (fingerings[aliasedKey]) return aliasedKey
  }

  // 3. Strip slash bass, apply suffix alias, look up root chord
  const slashIdx = rest.indexOf('/')
  const suffix = slashIdx !== -1 ? rest.slice(0, slashIdx) : rest
  const normalSuffix = SUFFIX_ALIAS[suffix] ?? suffix
  const rootKey = normalSuffix ? `${aliasedRoot}${normalSuffix}` : aliasedRoot

  return fingerings[rootKey] ? rootKey : null
}

export function chordFingering(chord) {
  const key = resolveChordKey(chord)
  return key ? fingerings[key] : null
}
