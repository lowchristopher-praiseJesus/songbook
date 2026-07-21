import JSZip from 'jszip'
import SparkMD5 from 'spark-md5'
import { transposeChord } from './parser/chordUtils'

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

export function stripNoteTokens(content) {
  // Remove each {note:} line including its trailing newline so no blank line
  // is left in its place, preserving the original spacing between other lines.
  return content.replace(/\{note:[^}]*\}[^\n]*\n?/g, '')
}

function stripStrumTokens(content) {
  // {strum: ///} is inline after a chord token — remove just the annotation,
  // leaving the chord intact. SBP does not recognise this syntax.
  return content.replace(/\{strum:[^}]*\}/g, '')
}

function stripAppSyntaxTokens(content) {
  return stripStrumTokens(stripNoteTokens(content))
}

/**
 * Convert one internal song object back to the SBP JSON shape, including all
 * metadata fields SongBook Pro expects to find on import.
 *
 * Two paths:
 *   1. Song has sbpXxx meta fields (imported from .sbp) — write the original
 *      SBP key/KeyShift/Capo/content verbatim, adjusting KeyShift by the
 *      user's transpose delta so modifications round-trip as a live transpose.
 *   2. No sbpXxx fields (song created in-app) — use (keyIndex + capo) as the
 *      sounding key and write rawText as content.
 */
function songToSbpJson(song, stripAppSyntax = false) {
  const { meta, rawText } = song
  const name = meta.title ?? 'Untitled'
  const author = meta.artist ?? ''
  const subTitle = meta.subTitle ?? ''

  const hasSbpRoundTrip = typeof meta.sbpKey === 'number'
  const baselineKeyIndex = meta.sbpBaselineKeyIndex ?? meta.keyIndex ?? 0
  const currentKeyIndex = meta.keyIndex ?? baselineKeyIndex
  const currentCapo = meta.capo ?? meta.sbpSongCapo ?? 0
  const originalCapo = meta.sbpSongCapo ?? currentCapo
  const keyDelta = ((currentKeyIndex - baselineKeyIndex) % 12 + 12) % 12
  const hasUserKeyChange = keyDelta !== 0 || currentCapo !== originalCapo
  const canPreserveSbpFields = hasSbpRoundTrip && meta.sbpOriginalContent != null

  let keyField, keyShiftField, songCapoField, content
  if (canPreserveSbpFields && !hasUserKeyChange) {
    // Preserve original SBP content/metadata byte-for-byte when nothing changed.
    keyField       = meta.sbpKey
    keyShiftField  = meta.sbpKeyShift ?? 0
    songCapoField  = currentCapo
    content        = stripAppSyntax ? stripAppSyntaxTokens(meta.sbpOriginalContent) : meta.sbpOriginalContent
  } else {
    // SBP download path (stripAppSyntax=true) OR in-app-created songs:
    // Export the sounding key directly so SBP displays the correct key label.
    // Transpose content from the original guitar key to the user's current key.
    const newGuitarKey = currentKeyIndex
    const newCapo      = currentCapo
    keyField      = ((newGuitarKey + newCapo + 3) % 12 + 12) % 12  // SBP uses A-based index (0=A); +3 converts from C-based
    keyShiftField = 0
    songCapoField = newCapo
    // Use sbpOriginalContent as base only when it exists — rawText has already been
    // transposed to the current guitar key by loadSongsWithTranspose, so when
    // sbpOriginalContent is null (user edited the content) the delta must be 0.
    const hasSbpContent    = hasSbpRoundTrip && meta.sbpOriginalContent != null
    const originalGuitarKey = hasSbpContent ? baselineKeyIndex : newGuitarKey
    const contentDelta      = ((newGuitarKey - originalGuitarKey) % 12 + 12) % 12
    const baseContent       = hasSbpContent ? meta.sbpOriginalContent : (rawText ?? '')
    const transposedContent = contentDelta === 0 ? baseContent
      : baseContent.replace(/\[([^\]]+)\]/g, (_, c) =>
          '[' + transposeChord(c, contentDelta, meta.usesFlats ?? false) + ']')
    content = stripAppSyntax ? stripAppSyntaxTokens(transposedContent) : transposedContent
  }

  // Preserve the original sbpId so that conductor sync can match songs by Id
  // across the conductor's library and the follower's imported copy.
  // Fall back to a content-hash-derived Id for in-app-created songs.
  const idHash = SparkMD5.hash(name + content)
  const hashId = parseInt(idHash.slice(0, 8), 16) % 1000000 || 1
  const id = typeof meta.sbpId === 'number' ? meta.sbpId : hashId

  // Per-song content hash: MD5 of content with line endings normalised to CRLF.
  const normalizedContent = content.replace(/\r\n|\r|\n/g, '\r\n')
  const contentHash = SparkMD5.hash(normalizedContent)

  return {
    Id: id,
    author,
    Capo: songCapoField,
    content,
    hash: contentHash,
    key: keyField,
    KeyShift: keyShiftField,
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
    NotesText: meta.annotation ?? '',
    YoutubeVideoId: meta.youtubeVideoId ?? null,
    // App-specific extension to the SBP schema — emitted only when set so
    // files without a start time stay byte-identical to what SongBook Pro writes.
    ...(meta.youtubeStartSeconds != null ? { YoutubeStartSeconds: meta.youtubeStartSeconds } : {}),
    appKeyIndex: meta.keyIndex ?? 0,
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
export function buildSbpZip(songs, collectionName = null, lyricsOnly = false, conductorCode = null, stripAppSyntax = false) {
  const sbpSongs = songs.map(s => songToSbpJson(s, stripAppSyntax))

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
        Capo: songs[i].meta?.sbpSetCapo ?? 0,
        SetId: setId,
        SongId: sbpSong.Id,
        keyOfset: songs[i].meta?.sbpKeyOfset ?? 0,
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
    ...(lyricsOnly && { lyricsOnly: true }),
    ...(conductorCode ? { conductorCode } : {}),
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
export async function exportSongsAsSbp(songs, collectionName = null, lyricsOnly = false, conductorCode = null, stripAppSyntax = false) {
  return buildSbpZip(songs, collectionName, lyricsOnly, conductorCode, stripAppSyntax).generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/**
 * Return the stable integer Id that would be assigned to this song in an export.
 * Used to backfill meta.sbpId on songs created in-app so conductor sync works.
 */
export function computeExportId(song) {
  if (typeof song.meta?.sbpId === 'number') return song.meta.sbpId
  const { meta, rawText } = song
  const name = meta?.title ?? 'Untitled'
  const hasSbpRoundTrip = typeof meta?.sbpKey === 'number'
  const content = stripNoteTokens(
    hasSbpRoundTrip ? (meta.sbpOriginalContent ?? rawText ?? '') : (rawText ?? '')
  )
  const idHash = SparkMD5.hash(name + content)
  return parseInt(idHash.slice(0, 8), 16) % 1000000 || 1
}
