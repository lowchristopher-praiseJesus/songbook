import JSZip from 'jszip'

/**
 * Convert one internal song object back to the SBP JSON shape.
 * The stored keyIndex is the guitar (fingering) key; the sounding key
 * that SBP expects is (keyIndex + capo) % 12.
 */
function songToSbpJson(song) {
  const { meta, rawText } = song
  const soundingKey = ((meta.keyIndex ?? 0) + (meta.capo ?? 0)) % 12
  return {
    name: meta.title ?? 'Untitled',
    author: meta.artist ?? '',
    key: soundingKey,
    Capo: meta.capo ?? 0,
    TempoInt: meta.tempo ?? 0,
    timeSig: meta.timeSignature ?? '',
    Copyright: meta.copyright ?? '',
    content: rawText ?? '',
    Deleted: false,
  }
}

/**
 * Build a JSZip instance containing the SBP archive for the given songs.
 * Exported for testing (generate as 'uint8array' to avoid jsdom Blob limits).
 */
export function buildSbpZip(songs) {
  const sbpSongs = songs.map(songToSbpJson)
  const json = JSON.stringify({ songs: sbpSongs, sets: [], folders: [] })

  const zip = new JSZip()
  zip.file('dataFile.txt', '1.0\n' + json)
  zip.file('dataFile.hash', '00000000000000000000000000000000')
  return zip
}

/**
 * Serialize an array of song objects into a .sbp Blob (ZIP archive).
 * The archive contains:
 *   dataFile.txt  — "1.0\n" + JSON of {songs, sets, folders}
 *   dataFile.hash — placeholder MD5 (not validated by SongBook Pro on import)
 */
export async function exportSongsAsSbp(songs) {
  return buildSbpZip(songs).generateAsync({ type: 'blob' })
}
