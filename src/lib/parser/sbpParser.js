import JSZip from 'jszip'

const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
// Keys that prefer flat notation (Eb, F, Ab, Bb)
const FLAT_KEY_INDICES = new Set([3, 5, 8, 10])

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
    sections: [], // populated by contentParser in Task 3
  }
}
