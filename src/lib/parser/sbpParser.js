import JSZip from 'jszip'
import { parseContent } from './contentParser'

// SongBook Pro stores key as a chromatic index starting at A=0
const KEY_NAMES = ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab']
// Keys that prefer flat notation: Bb(1), Eb(6), F(8), Ab(11)
const FLAT_KEY_INDICES = new Set([1, 6, 8, 11])

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
  const keyIndex = typeof s.key === 'number' ? ((s.key % 12) + 12) % 12 : 0
  const usesFlats = FLAT_KEY_INDICES.has(keyIndex)

  return {
    // id and importedAt assigned by the library store when persisting
    rawText: s.content ?? '',
    meta: {
      title: s.name ?? 'Untitled',
      artist: s.author || undefined,
      key: KEY_NAMES[keyIndex],
      keyIndex,
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
