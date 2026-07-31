import { SHARPS, FLATS, FLAT_KEY_INDICES, MAJOR_SCALE, NOTE_TO_INDEX } from './chordUtils'
import { isChord } from './contentParser'

// Expected triad quality for each diatonic scale degree of a major key: I ii iii IV V vi vii°
const DEGREE_QUALITIES = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished']

// If the stated key's diatonic-fit score is at least this high, it's never reported as a mismatch.
// Tuned to 0.9 (rather than a looser 0.7) because adjacent keys (a fifth apart, e.g. C and G)
// share 6 of 7 diatonic chords, so a song fully in the "wrong" adjacent key can still clear 0.7
// on the stated key and never get flagged (e.g. a I-IV-V-vi progression in G declared as C scores
// 0.75 on C — a clear mis-key that 0.7 would silently accept). 0.9 catches that case while still
// leaving room for a single genuine borrowed/outlier chord in an otherwise-diatonic song.
const MISMATCH_SCORE_THRESHOLD = 0.9
// Otherwise, the best-scoring key must beat the stated key by at least this margin to be reported.
const MISMATCH_MARGIN = 0.15

const CHORD_TOKEN_RE = /\[([^\]]+)\]/g

function classifyQuality(suffix) {
  if (suffix.startsWith('dim')) return 'diminished'
  if (suffix.startsWith('aug')) return 'other'
  if (suffix.startsWith('maj') || suffix.startsWith('M')) return 'major'
  if (suffix.startsWith('min') || suffix.startsWith('m')) return 'minor'
  // No third present (sus2/sus4/bare sus, no3/no-variants, bare power chords like "5")
  // means the chord can't conflict with either a major or minor diatonic degree.
  if (suffix.startsWith('sus')) return 'neutral'
  if (suffix.startsWith('no')) return 'neutral'
  if (/^5/.test(suffix)) return 'neutral'
  return 'major'
}

function parseChordToken(chord) {
  const slashIdx = chord.indexOf('/')
  const main = slashIdx === -1 ? chord : chord.slice(0, slashIdx)
  const match = main.match(/^([A-G][b#]?)(.*)$/)
  if (!match) return null
  const [, root, suffix] = match
  const rootIndex = NOTE_TO_INDEX[root]
  if (rootIndex === undefined) return null
  return { rootIndex, quality: classifyQuality(suffix) }
}

function diatonicSetForKey(keyIndex) {
  const set = new Map()
  MAJOR_SCALE.forEach((offset, i) => {
    set.set((keyIndex + offset) % 12, DEGREE_QUALITIES[i])
  })
  return set
}

function fitsKey(parsed, keyIndex) {
  const expectedQuality = diatonicSetForKey(keyIndex).get(parsed.rootIndex)
  if (expectedQuality === undefined) return false
  // A neutral (no-third) chord has nothing to conflict with, so it fits any
  // diatonic degree as long as its root is diatonic — regardless of that
  // degree's expected triad quality.
  if (parsed.quality === 'neutral') return true
  return expectedQuality === parsed.quality
}

function keyIndexToName(keyIndex) {
  return FLAT_KEY_INDICES.has(keyIndex) ? FLATS[keyIndex] : SHARPS[keyIndex]
}

function collectChordInstances(rawText) {
  const instances = []
  const lines = rawText.split('\n')

  lines.forEach((lineText, lineIndex) => {
    CHORD_TOKEN_RE.lastIndex = 0
    let m
    while ((m = CHORD_TOKEN_RE.exec(lineText)) !== null) {
      const token = m[1].trim()
      if (!isChord(token)) continue
      const parsed = parseChordToken(token)
      if (!parsed) continue
      instances.push({ token, parsed, lineIndex, lineText })
    }
  })

  return instances
}

/**
 * Verify a song's stated key against the chords actually used in its raw text.
 * @param {string} rawText - song content, with chords as inline [Chord] markers
 * @param {string} statedKey - the song's declared key, e.g. "C", "F#", "Bb"
 */
export function checkKey(rawText, statedKey) {
  const instances = collectChordInstances(rawText)
  const statedIndex = NOTE_TO_INDEX[statedKey] ?? 0

  if (instances.length === 0) {
    return {
      statedKey,
      detectedKey: statedKey,
      keyMatches: true,
      outlierChords: [],
      totalChords: 0,
    }
  }

  const scores = []
  for (let k = 0; k < 12; k++) {
    const fitCount = instances.filter(inst => fitsKey(inst.parsed, k)).length
    scores[k] = fitCount / instances.length
  }

  let bestKeyIndex = statedIndex
  let bestScore = scores[statedIndex]
  for (let k = 0; k < 12; k++) {
    if (scores[k] > bestScore) {
      bestScore = scores[k]
      bestKeyIndex = k
    }
  }

  const statedScore = scores[statedIndex]
  const keyMatches =
    statedScore >= MISMATCH_SCORE_THRESHOLD ||
    (bestScore - statedScore) < MISMATCH_MARGIN ||
    bestKeyIndex === statedIndex

  const detectedKey = keyMatches ? statedKey : keyIndexToName(bestKeyIndex)

  const grouped = new Map()
  for (const inst of instances) {
    if (fitsKey(inst.parsed, statedIndex)) continue
    if (!grouped.has(inst.token)) {
      grouped.set(inst.token, {
        chord: inst.token,
        count: 0,
        exampleLine: inst.lineIndex,
        exampleText: inst.lineText,
      })
    }
    grouped.get(inst.token).count++
  }

  return {
    statedKey,
    detectedKey,
    keyMatches,
    outlierChords: [...grouped.values()],
    totalChords: instances.length,
  }
}
