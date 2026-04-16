const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

/**
 * Convert one internal song object to a ChordPro song block (plain text).
 * Does NOT include a leading {new_song} — callers manage that separator.
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

  lines.push('')
  lines.push(rawText ?? '')

  return lines.join('\n')
}

/**
 * Serialize an array of songs to a single ChordPro text string.
 * Multiple songs are separated by {new_song} as per the ChordPro spec,
 * which resets metadata and starts a new page in formatters.
 */
export function songsToChordPro(songs) {
  return songs.map(songToChordPro).join('\n\n{new_song}\n\n')
}

/**
 * Return a safe filename base (strips characters illegal on Windows/macOS/Linux).
 */
export function safeFilename(title) {
  return (title ?? 'Untitled').replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Untitled'
}
