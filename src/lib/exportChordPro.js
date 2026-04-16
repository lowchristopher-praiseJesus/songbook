const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

/**
 * Convert one internal song object to a ChordPro (.cho) plain-text string.
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
  if (meta.artist)          lines.push(`{artist: ${meta.artist}}`)

  const keyName = meta.key ?? KEY_NAMES[meta.keyIndex ?? 0]
  lines.push(`{key: ${keyName}}`)

  if (meta.capo)            lines.push(`{capo: ${meta.capo}}`)
  if (meta.tempo)           lines.push(`{tempo: ${meta.tempo}}`)
  if (meta.timeSignature)   lines.push(`{time: ${meta.timeSignature}}`)
  if (meta.copyright)       lines.push(`{copyright: ${meta.copyright}}`)

  lines.push('')  // blank separator before body
  lines.push(rawText ?? '')

  return lines.join('\n')
}

/**
 * Return a safe filename base for a song title (strips characters illegal on
 * Windows/macOS/Linux).
 */
export function safeFilename(title) {
  return (title ?? 'Untitled').replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Untitled'
}
