import JSZip from 'jszip'

const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

/**
 * Convert one internal song object to a ChordPro (.cho) text string.
 *
 * The internal content field is already valid ChordPro:
 *   {c: Section Name}  — section headers
 *   [Chord]lyrics      — inline chords
 *
 * We prepend the standard metadata header directives so SongBook Pro (and
 * any other ChordPro reader) picks up the title, artist, key, etc.
 */
export function songToChordPro(song) {
  const { meta, rawText } = song
  const lines = []

  lines.push(`{title: ${meta.title ?? 'Untitled'}}`)
  if (meta.artist) lines.push(`{artist: ${meta.artist}}`)

  // Use the stored key string if available, else derive from keyIndex
  const keyName = meta.key ?? KEY_NAMES[meta.keyIndex ?? 0]
  lines.push(`{key: ${keyName}}`)

  if (meta.capo)          lines.push(`{capo: ${meta.capo}}`)
  if (meta.tempo)         lines.push(`{tempo: ${meta.tempo}}`)
  if (meta.timeSignature) lines.push(`{time: ${meta.timeSignature}}`)
  if (meta.copyright)     lines.push(`{copyright: ${meta.copyright}}`)

  lines.push('')  // blank separator before body
  lines.push(rawText ?? '')

  return lines.join('\n')
}

/**
 * Sanitize a song title for use as a filename, replacing characters that are
 * illegal on Windows/macOS/Linux with a hyphen.
 */
function safeFilename(title) {
  return (title ?? 'Untitled').replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Untitled'
}

/**
 * Package an array of songs as a ZIP archive of individual .cho files.
 * Duplicate titles are disambiguated with a numeric suffix.
 * Returns a Blob.
 */
export async function exportSongsAsChordProZip(songs) {
  const zip = new JSZip()
  const usedNames = new Set()

  for (const song of songs) {
    const text = songToChordPro(song)
    const base = safeFilename(song.meta?.title)
    let filename = base + '.cho'
    let counter = 1
    while (usedNames.has(filename)) {
      filename = `${base} (${counter++}).cho`
    }
    usedNames.add(filename)
    zip.file(filename, text)
  }

  return zip.generateAsync({ type: 'blob' })
}
