import JSZip from 'jszip'
import { parseContent } from './contentParser'
import { transposeChord } from './chordUtils'

const KEY_NAMES        = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const FLAT_KEY_INDICES = new Set([1, 3, 5, 8, 10])
const MAJOR_SCALE      = [0, 2, 4, 5, 7, 9, 11]

const NOTE_TO_IDX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

/**
 * Detect the best-fitting major key from chord content (capo=0 assumed).
 * Scores all 12 keys by diatonic chord coverage, with tiebreakers on:
 *   1. Root-note frequency (how often the key's tonic appears)
 *   2. First chord in the song (songs typically start on or near the tonic)
 * Called after any set-entry transposition, so content is in playing key.
 */
function detectKey(content) {
  const freq = new Array(12).fill(0)
  let firstRoot = -1
  const re = /\[([A-G][b#]?)/g
  let m
  while ((m = re.exec(content)) !== null) {
    const idx = NOTE_TO_IDX[m[1]]
    if (idx !== undefined) {
      freq[idx]++
      if (firstRoot === -1) firstRoot = idx
    }
  }

  if (freq.every(f => f === 0)) return { keyIndex: 0, usesFlats: false }

  let bestKey = 0, bestScore = -1
  for (let k = 0; k < 12; k++) {
    const diatonic = new Set(MAJOR_SCALE.map(d => (k + d) % 12))
    const score = freq.reduce((s, f, i) => s + (diatonic.has(i) ? f : 0), 0)
    // Tiebreaker: root frequency + small bonus when the first chord matches this key's tonic
    const effectiveScore = score + freq[k] * 0.5 + (firstRoot === k ? 0.25 : 0)
    if (effectiveScore > bestScore) {
      bestScore = effectiveScore
      bestKey = k
    }
  }

  return { keyIndex: bestKey, usesFlats: FLAT_KEY_INDICES.has(bestKey) }
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

  // Build songId → set entry map so per-song key/chord adjustments can be applied
  const setEntryBySongId = {}
  for (const set of data.sets ?? []) {
    for (const entry of set.contents ?? []) {
      setEntryBySongId[entry.SongId] = entry
    }
  }

  const songs = data.songs
    .filter(s => !s.Deleted)
    .map(s => songFromJson(s, setEntryBySongId[s.Id] ?? null))

  const collectionName = data.sets?.[0]?.details?.name ?? data.collectionName ?? null

  return {
    songs,
    collectionName,
    lyricsOnly: data.lyricsOnly ?? false,
  }
}

function songFromJson(s, setEntry = null) {
  const content = s.content ?? ''

  // SBP set entries carry two chord-display adjustments:
  //   Capo    — subtract this many semitones (guitarist plays at this capo fret)
  //   keyOfset — add this many semitones (song is pitched up N semitones in the set)
  // The net delta is applied to chord notation so the app shows the same chords as SBP.
  const setCapo  = setEntry?.Capo    ?? 0
  const keyOfset = setEntry?.keyOfset ?? 0
  const netDelta = keyOfset - setCapo

  // Transpose chord notation by the net delta (first pass: sharps for detection)
  const transposed = netDelta !== 0
    ? content.replace(/\[([^\]]+)\]/g, (_, chord) => '[' + transposeChord(chord, netDelta, false) + ']')
    : content

  // Detect the best-fitting major key from the (already transposed) chord content
  const { keyIndex, usesFlats } = detectKey(transposed)

  // Second pass with correct flat/sharp notation if the detected key uses flats
  const rawText = (netDelta !== 0 && usesFlats)
    ? content.replace(/\[([^\]]+)\]/g, (_, chord) => '[' + transposeChord(chord, netDelta, true) + ']')
    : transposed

  // SBP always stores capo=0 at song level; set-entry fields only reshape the display
  const capo = s.Capo ?? 0

  return {
    rawText,
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
    sections: parseContent(rawText),
  }
}
