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
 * Detect the guitarist's playing key from chord content by scoring diatonic fit
 * across capo values 0–5 relative to the given sounding key.
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
    return { keyIndex: soundingKeyIdx, usesFlats: FLAT_KEY_INDICES.has(soundingKeyIdx) }
  }

  if (explicitCapo > 0) {
    const k = (soundingKeyIdx - explicitCapo + 12) % 12
    return { keyIndex: k, usesFlats: FLAT_KEY_INDICES.has(k) }
  }

  let bestKey = soundingKeyIdx, bestScore = -1

  for (let capo = 0; capo <= 5; capo++) {
    const k = (soundingKeyIdx - capo + 12) % 12
    const diatonic = new Set(MAJOR_SCALE.map(d => (k + d) % 12))
    const score = freq.reduce((s, f, i) => s + (diatonic.has(i) ? f : 0), 0)
    const effectiveScore = score + freq[k] * 0.5
    if (effectiveScore > bestScore) {
      bestScore = effectiveScore
      bestKey = k
    }
  }

  return { keyIndex: bestKey, usesFlats: FLAT_KEY_INDICES.has(bestKey) }
}

/**
 * Parse one or more songs from an ArrayBuffer containing a .sbp ZIP file.
 */
export async function parseSbpFile(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)

  const dataFile = zip.file('dataFile.txt')
  if (!dataFile) throw new Error('dataFile.txt not found in .sbp archive')

  const text = await dataFile.async('string')
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

  return { songs, collectionName, lyricsOnly: data.lyricsOnly ?? false }
}

function songFromJson(s, setEntry = null) {
  // SBP stores minor keys as 12 + minor-root-index; normalise to 0–11
  const soundingKeyIdx = ((typeof s.key === 'number' ? s.key : 0) % 12 + 12) % 12
  const content = s.content ?? ''

  // Set-entry fields that reshape key and chord display:
  //   Capo    – guitarist places capo here; chords shift DOWN by this amount
  //   keyOfset – song is pitched up N semitones in the set; chords shift UP
  const setCapo  = setEntry?.Capo    ?? 0
  const keyOfset = setEntry?.keyOfset ?? 0
  const netDelta = keyOfset - setCapo

  // Apply net chord transposition so the app shows the same chords as SBP.
  // Two-pass: detect key first (sharps), then re-render with correct accidentals.
  const transposed1 = netDelta !== 0
    ? content.replace(/\[([^\]]+)\]/g, (_, c) => '[' + transposeChord(c, netDelta, false) + ']')
    : content

  let keyIndex, usesFlats

  if (setCapo > 0 && keyOfset === 0) {
    // SBP displays the sounding key after removing the set capo (e.g. Db − 3 = Bb)
    keyIndex = (soundingKeyIdx - setCapo + 12) % 12
    usesFlats = FLAT_KEY_INDICES.has(keyIndex)
  } else {
    // Detect the guitarist's playing key from the (already-transposed) chord content.
    // Use the adjusted sounding key so the diatonic scorer can distinguish G major
    // from C major (E♮ is in G major but not B♭ major, eliminating the ambiguity).
    const adjustedSounding = (soundingKeyIdx + keyOfset) % 12
    ;({ keyIndex, usesFlats } = detectGuitarKey(transposed1, adjustedSounding, 0))
  }

  const rawText = (netDelta !== 0 && usesFlats)
    ? content.replace(/\[([^\]]+)\]/g, (_, c) => '[' + transposeChord(c, netDelta, true) + ']')
    : transposed1

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
