import JSZip from 'jszip'
import { parseContent } from './contentParser'

// SongBook Pro stores key as a chromatic index using C=0.
// Major keys:  0–11  (C=0, Db=1, D=2, Eb=3, E=4, F=5, F#=6, G=7, Ab=8, A=9, Bb=10, B=11)
// Minor keys: 12–23  (12 + C=0 index of the minor root)
const KEY_NAMES       = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_KEY_NAMES = ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']
// Keys that prefer flat notation (C=0): Db(1), Eb(3), F(5), Ab(8), Bb(10)
const FLAT_KEY_INDICES = new Set([1, 3, 5, 8, 10])

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
  if (!data || !Array.isArray(data.songs)) return []

  return data.songs
    .filter(s => !s.Deleted)
    .map(s => songFromJson(s))
}

function songFromJson(s) {
  const rawKey = typeof s.key === 'number' ? s.key : 0  // default C
  const isMinor = rawKey >= 12

  let keyIndex, usesFlats
  if (isMinor) {
    // Minor keys stored as 12 + C=0 index of the minor root
    keyIndex = (rawKey - 12) % 12
    const relMajorC0 = (keyIndex + 3) % 12
    usesFlats = FLAT_KEY_INDICES.has(relMajorC0)
  } else {
    keyIndex = rawKey % 12  // SBP uses C=0 directly
    usesFlats = FLAT_KEY_INDICES.has(keyIndex)
  }

  return {
    // id and importedAt assigned by the library store when persisting
    rawText: s.content ?? '',
    meta: {
      title: s.name ?? 'Untitled',
      artist: s.author || undefined,
      key: isMinor ? MINOR_KEY_NAMES[keyIndex] : KEY_NAMES[keyIndex],
      keyIndex,
      isMinor,
      usesFlats,
      capo: s.Capo ?? 0,
      tempo: s.TempoInt > 0 ? s.TempoInt : undefined,
      timeSignature: s.timeSig || undefined,
      copyright: s.Copyright || undefined,
      ccli: s.ccli ?? undefined,
      subTitle: s.subTitle || undefined,
    },
    sections: parseContent(s.content ?? ''),
  }
}
