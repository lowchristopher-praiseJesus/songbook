import JSZip from 'jszip'
import { parseContent } from './contentParser'

// SongBook Pro stores `key` as the *sounding* key index (C=0 through B=11,
// or 12–23 for minor roots). The chords written in the content are in the
// guitarist's fingering key; a capo bridges the two. We detect the guitar
// key from the chord content and derive the capo automatically.

const KEY_NAMES       = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
// Keys that prefer flat notation (C=0): Db(1), Eb(3), F(5), Ab(8), Bb(10)
const FLAT_KEY_INDICES = new Set([1, 3, 5, 8, 10])

function detectGuitarKey(content, soundingKeyIdx, explicitCapo) {
  const k = (soundingKeyIdx - explicitCapo + 12) % 12
  return { keyIndex: k, capo: explicitCapo, usesFlats: FLAT_KEY_INDICES.has(k) }
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
