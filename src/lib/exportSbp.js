import JSZip from 'jszip'
import SparkMD5 from 'spark-md5'

/**
 * Generate the DeepSearch string SongBook Pro embeds in each song for full-text search.
 * Format (from reverse-engineering real exports):
 *   name\n [subTitle\n] author\n name\n initials(name)\n [initials(subTitle)\n]
 */
function buildDeepSearch(name, author, subTitle) {
  const initials = (str) => str.trim().split(/\s+/).map(w => w[0]).join('').toLowerCase()
  const lower = (s) => (s ?? '').toLowerCase()
  const sub = subTitle ?? ''
  let out = lower(name) + '\n'
  if (sub) out += lower(sub) + '\n'
  out += lower(author) + '\n'
  out += lower(name) + '\n'
  out += initials(name) + '\n'
  if (sub) out += initials(sub) + '\n'
  return out
}

/**
 * Convert one internal song object back to the SBP JSON shape, including all
 * metadata fields SongBook Pro expects to find on import.
 *
 * The stored keyIndex is the guitar (fingering) key; the sounding key
 * that SBP expects is (keyIndex + capo) % 12.
 */
function songToSbpJson(song) {
  const { meta, rawText } = song
  const soundingKey = ((meta.keyIndex ?? 0) + (meta.capo ?? 0)) % 12
  const name = meta.title ?? 'Untitled'
  const author = meta.artist ?? ''
  const subTitle = meta.subTitle ?? ''
  const content = rawText ?? ''

  // Generate a stable pseudo-Id from a hash of the song content so that
  // the same song exported twice gets the same Id. SBP Pro uses DB auto-
  // increment, but on import it only needs a unique integer.
  const idHash = SparkMD5.hash(name + content)
  const id = parseInt(idHash.slice(0, 8), 16) % 1000000 || 1

  // Per-song content hash: MD5 of content with line endings normalised to CRLF.
  const normalizedContent = content.replace(/\r\n|\r|\n/g, '\r\n')
  const contentHash = SparkMD5.hash(normalizedContent)

  return {
    Id: id,
    author,
    Capo: 0,
    content,
    hash: contentHash,
    key: soundingKey,
    KeyShift: 0,
    name,
    subTitle,
    type: 1,
    ModifiedDateTime: new Date().toISOString(),
    Deleted: false,
    SyncId: '',
    timeSig: meta.timeSignature ?? '',
    ZoomFactor: 1.0,
    Duration: 0,
    Duration2: 0,
    _displayParams: '{}',
    TempoInt: meta.tempo ?? 0,
    _tags: '[]',
    Url: '',
    DeepSearch: buildDeepSearch(name, author, subTitle),
    Copyright: meta.copyright ?? '',
    NotesText: '',
    Zoom: 1.0,
    SectionOrder: '',
    SongNumber: 0,
    HasChildren: 0,
    ParentId: 0,
    vName: null,
    locked: 0,
    LinkedAudio: null,
    Chords: null,
    midiOnLoad: null,
    importSource: 'editor',
    _folders: '[]',
    drawingPathsBackup: null,
  }
}

/**
 * Build a JSZip instance containing the SBP archive for the given songs.
 * Exported for testing (generate as 'uint8array' to avoid jsdom Blob limits).
 */
export function buildSbpZip(songs, collectionName = null, lyricsOnly = false) {
  const sbpSongs = songs.map(songToSbpJson)

  let sets = []
  if (collectionName && songs.length > 0) {
    const setId = (parseInt(SparkMD5.hash(collectionName).slice(0, 8), 16) % 900000) + 1
    const now = new Date().toISOString()
    sets = [{
      details: {
        Id: setId,
        name: collectionName,
        date: now,
        ModifiedDateTime: now,
        Deleted: 0,
        SyncId: crypto.randomUUID(),
        pinned: 0,
      },
      contents: sbpSongs.map((sbpSong, i) => ({
        Id: setId * 100 + i + 1,
        Order: i,
        Capo: songs[i].meta?.capo ?? 0,
        SetId: setId,
        SongId: sbpSong.Id,
        keyOfset: 0,
        ModifiedDateTime: now,
        Deleted: 0,
        SyncId: crypto.randomUUID(),
        NotesText: null,
        SectionOrder: '',
        ItemType: 1,
        Content: '',
        drawingPathsBackup: null,
      })),
    }]
  }

  const data = {
    songs: sbpSongs,
    sets,
    folders: [],
  }
  const json = JSON.stringify(data)
  const dataFileText = '1.0\r\n' + json
  // SongBook Pro's dataFile.hash is the MD5 of the raw UTF-8 bytes of dataFile.txt.
  const dataFileHash = SparkMD5.hash(dataFileText)

  const zip = new JSZip()
  zip.file('dataFile.txt', dataFileText)
  zip.file('dataFile.hash', dataFileHash)
  return zip
}

/**
 * Return a safe filename base (strips characters illegal on Windows/macOS/Linux).
 */
export function safeFilename(title) {
  return (title ?? 'Untitled').replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Untitled'
}

/**
 * Serialize an array of song objects into a .sbp Blob (ZIP archive).
 * The archive contains:
 *   dataFile.txt  — "1.0\n" + JSON of {songs, sets, folders}
 *   dataFile.hash — MD5 of dataFile.txt bytes
 */
export async function exportSongsAsSbp(songs, collectionName = null, lyricsOnly = false) {
  return buildSbpZip(songs, collectionName, lyricsOnly).generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
