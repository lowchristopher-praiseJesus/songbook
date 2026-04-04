import JSZip from 'jszip'
import { parseContent } from './contentParser'

// SongBook Pro stores `key` as the *sounding* key index (C=0 through B=11,
// or 12–23 for minor roots). The chords written in the content are in the
// guitarist's fingering key; a capo bridges the two. We detect the guitar
// key from the chord content and derive the capo automatically.

const KEY_NAMES       = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
// Keys that prefer flat notation (C=0): Db(1), Eb(3), F(5), Ab(8), Bb(10)
const FLAT_KEY_INDICES = new Set([1, 3, 5, 8, 10])

// Semitone intervals of a major scale (used for diatonic-fit scoring)
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]

// Chord root → chromatic index (C=0)
const NOTE_TO_IDX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

/**
 * Detect the guitarist's written key from chord content and derive the capo.
 *
 * Strategy: try capo values 0–5; for each, compute the implied guitar key
 * (soundingKey − capo) and score how many chord roots are diatonic to that
 * key's major scale. Pick the capo with the highest diatonic score (lower
 * capo wins ties).
 *
 * @param {string} content  – raw SBP song content
 * @param {number} soundingKeyIdx – 0–11 chromatic index of the sounding key
 * @param {number} explicitCapo  – s.Capo from the SBP JSON (may be 0)
 * @returns {{ keyIndex: number, capo: number, usesFlats: boolean }}
 */
function detectGuitarKey(content, soundingKeyIdx, explicitCapo) {
  // Count chord-root frequencies in the content
  const freq = new Array(12).fill(0)
  const re = /\[([A-G][b#]?)/g
  let m
  while ((m = re.exec(content)) !== null) {
    const idx = NOTE_TO_IDX[m[1]]
    if (idx !== undefined) freq[idx]++
  }

  // If no chords found, fall back to the sounding key with capo 0
  if (freq.every(f => f === 0)) {
    return { keyIndex: soundingKeyIdx, capo: 0, usesFlats: FLAT_KEY_INDICES.has(soundingKeyIdx) }
  }

  // If the SBP file has an explicit non-zero capo, trust it and just
  // compute the guitar key from sounding − explicit capo.
  if (explicitCapo > 0) {
    const k = (soundingKeyIdx - explicitCapo + 12) % 12
    return { keyIndex: k, capo: explicitCapo, usesFlats: FLAT_KEY_INDICES.has(k) }
  }

  // Try capo 0–5 and pick the best diatonic fit
  let bestKey = soundingKeyIdx
  let bestCapo = 0
  let bestScore = -1

  for (let capo = 0; capo <= 5; capo++) {
    const k = (soundingKeyIdx - capo + 12) % 12
    const diatonic = new Set(MAJOR_SCALE.map(d => (k + d) % 12))
    const score = freq.reduce((s, f, i) => s + (diatonic.has(i) ? f : 0), 0)
    // Tiebreaker: prefer the key whose root note appears prominently in the chords.
    // Multiplied by 0.5 so it only breaks ties without overriding a clear diatonic winner.
    const effectiveScore = score + freq[k] * 0.5
    if (effectiveScore > bestScore) {
      bestScore = effectiveScore
      bestKey = k
      bestCapo = capo
    }
  }

  return { keyIndex: bestKey, capo: bestCapo, usesFlats: FLAT_KEY_INDICES.has(bestKey) }
}

/**
 * Parse one or more songs from an ArrayBuffer containing a .sbp ZIP file.
 * Returns an array of partial Song objects (sections: [] — populated by contentParser).
 */
export async function parseSbpFile(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)

  const dataFile = zip.file('dataFile.txt')
  if (!dataFile) throw new Error('dataFile.txt not found in .sbp archive')

  const text = await dataFile.async('string')
  // First line is version string ("1.0"), rest is JSON
  const newlineIdx = text.indexOf('\n')
  const jsonText = newlineIdx >= 0 ? text.slice(newlineIdx + 1) : text

  const data = JSON.parse(jsonText)
  if (!data || !Array.isArray(data.songs)) return { songs: [], collectionName: null, lyricsOnly: false }

  const songs = data.songs
    .filter(s => !s.Deleted)
    .map(s => songFromJson(s))

  return {
    songs,
    collectionName: data.collectionName ?? null,
    lyricsOnly: data.lyricsOnly ?? false,
  }
}

function songFromJson(s) {
  const rawKey = typeof s.key === 'number' ? s.key : 0  // default C
  // SBP stores minor keys as 12 + minor-root-index; normalise to 0–11
  const soundingKeyIdx = rawKey % 12

  const content = s.content ?? ''
  const explicitCapo = s.Capo ?? 0

  const { keyIndex, capo, usesFlats } = detectGuitarKey(content, soundingKeyIdx, explicitCapo)

  return {
    // id and importedAt assigned by the library store when persisting
    rawText: content,
    meta: {
      title: s.name ?? 'Untitled',
      artist: s.author || undefined,
      key: KEY_NAMES[keyIndex],
      keyIndex,
      isMinor: false,
      usesFlats,
      capo,
      tempo: s.TempoInt > 0 ? s.TempoInt : undefined,
      timeSignature: s.timeSig || undefined,
      copyright: s.Copyright || undefined,
      ccli: s.ccli ?? undefined,
      subTitle: s.subTitle || undefined,
    },
    sections: parseContent(content),
  }
}
