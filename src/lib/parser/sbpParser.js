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
    const k = explicitCapo > 0 ? (soundingKeyIdx - explicitCapo + 12) % 12 : soundingKeyIdx
    return { keyIndex: k, usesFlats: FLAT_KEY_INDICES.has(k) }
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

  // Song-level fields:
  //   KeyShift – SBP's live-transpose value. In practice SBP writes this to the content
  //              destructively (the chord tags already reflect the transposed key), so we
  //              do NOT apply it to the chord text. We DO include it in adjustedSounding
  //              so the diatonic scorer searches from the correct sounding key.
  //   Capo     – guitarist places capo here; shifts display DOWN; handled at render
  //              time by useTranspose (not baked into rawText)
  const songKeyShift = s.KeyShift ?? 0
  const songCapo     = s.Capo    ?? 0

  // Set-entry fields that further reshape key and chord display per-set:
  //   Capo     – set-level capo; shifts display shapes DOWN (baked into rawText)
  //   keyOfset – set-level pitch shift. When songKeyShift > 0, the content already
  //              reflects that KS shift destructively and keyOfset is redundant metadata
  //              (SBP sets it to match the KS). When songKeyShift === 0, keyOfset is a
  //              genuine chord transposition that must be baked into rawText.
  const setCapo         = setEntry?.Capo    ?? 0
  const keyOfset        = setEntry?.keyOfset ?? 0
  const effectiveKeyOfset = songKeyShift > 0 ? 0 : keyOfset

  // Net chord delta baked into rawText:
  //   +effectiveKeyOfset – real set-level pitch shift (0 when KS already covers it)
  //   −setCapo           – set-level capo (shifts display shapes down)
  //   songCapo is NOT included; useTranspose applies it at display time
  const netDelta = effectiveKeyOfset - setCapo

  // Apply net chord transposition so the app shows the same chords as SBP.
  // Two-pass: detect key first (sharps), then re-render with correct accidentals.
  const transposed1 = netDelta !== 0
    ? content.replace(/\[([^\]]+)\]/g, (_, c) => '[' + transposeChord(c, netDelta, false) + ']')
    : content

  let keyIndex, usesFlats

  if (setCapo > 0 && songKeyShift === 0 && keyOfset === 0 && songCapo === 0) {
    // Simple set-capo-only case with no other pitch shifts: guitar key = sounding − setCapo
    keyIndex = (soundingKeyIdx - setCapo + 12) % 12
    usesFlats = FLAT_KEY_INDICES.has(keyIndex)
  } else {
    // General case: detect the guitarist's playing key from the (set-adjusted) chord content.
    // adjustedSounding = sounding after KS (or effectiveKeyOfset when KS=0) so the diatonic
    // scorer targets the correct pitch from which it subtracts the capo to find guitar key.
    // songCapo is passed as explicitCapo so detectGuitarKey returns sounding − songCapo
    // directly without scoring.
    const adjustedSounding = (soundingKeyIdx + songKeyShift + effectiveKeyOfset) % 12
    ;({ keyIndex, usesFlats } = detectGuitarKey(transposed1, adjustedSounding, songCapo))
  }

  const rawText = (netDelta !== 0 && usesFlats)
    ? content.replace(/\[([^\]]+)\]/g, (_, c) => '[' + transposeChord(c, netDelta, true) + ']')
    : transposed1

  // song-level Capo stored in meta; useTranspose initialises its capo widget from this
  const capo = songCapo

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
