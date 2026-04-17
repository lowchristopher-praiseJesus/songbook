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
 * Tries capo 0–5 and scores diatonic chord fit against the sounding key.
 * Trusts an explicit non-zero Capo from the SBP file directly.
 */
function detectGuitarKey(content, soundingKeyIdx, explicitCapo) {
  const freq = new Array(12).fill(0)
  const re = /\[([A-G][b#]?)/g
  let m
  while ((m = re.exec(content)) !== null) {
    const idx = NOTE_TO_IDX[m[1]]
    if (idx !== undefined) freq[idx]++
  }

  if (freq.every(f => f === 0)) {
    return { keyIndex: soundingKeyIdx, capo: 0, usesFlats: FLAT_KEY_INDICES.has(soundingKeyIdx) }
  }

  if (explicitCapo > 0) {
    const k = (soundingKeyIdx - explicitCapo + 12) % 12
    return { keyIndex: k, capo: explicitCapo, usesFlats: FLAT_KEY_INDICES.has(k) }
  }

  let bestKey = soundingKeyIdx
  let bestCapo = 0
  let bestScore = -1

  for (let capo = 0; capo <= 5; capo++) {
    const k = (soundingKeyIdx - capo + 12) % 12
    const diatonic = new Set(MAJOR_SCALE.map(d => (k + d) % 12))
    const score = freq.reduce((s, f, i) => s + (diatonic.has(i) ? f : 0), 0)
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

  const collectionName = data.sets?.[0]?.details?.name ?? data.collectionName ?? null

  return {
    songs,
    collectionName,
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
