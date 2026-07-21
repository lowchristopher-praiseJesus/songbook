import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import SparkMD5 from 'spark-md5'
import { buildSbpZip } from '../lib/exportSbp'
import { parseSbpFile } from '../lib/parser/sbpParser'

const mockSong = {
  meta: {
    title: 'El Shaddai',
    artist: 'Amy Grant',
    keyIndex: 1,   // Db guitar key
    capo: 2,       // sounding key = (1 + 2) % 12 = 3 = Eb
    tempo: 120,
    timeSignature: '4/4',
    copyright: '© Test',
  },
  rawText: '{c: Verse}\n[Dm]Test lyrics [G]here',
}

// Generate as uint8array to avoid jsdom Blob.arrayBuffer() limitations
async function parseZip(songs) {
  const buf = await buildSbpZip(songs).generateAsync({ type: 'uint8array' })
  const zip = await JSZip.loadAsync(buf)
  const text = await zip.file('dataFile.txt').async('string')
  const json = JSON.parse(text.slice(text.indexOf('\n') + 1))
  return { zip, text, json }
}

describe('buildSbpZip / exportSongsAsSbp', () => {
  it('produces a ZIP with dataFile.txt and dataFile.hash', async () => {
    const { zip } = await parseZip([mockSong])
    expect(zip.file('dataFile.txt')).not.toBeNull()
    expect(zip.file('dataFile.hash')).not.toBeNull()
  })

  it('uses DEFLATE compression matching SongBook Pro output', async () => {
    const buf = await buildSbpZip([mockSong]).generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    // ZIP local file header: bytes 8-9 are the compression method (little-endian).
    // 0 = STORE, 8 = DEFLATE. First entry always starts at offset 0.
    const compressionMethod = buf[8] | (buf[9] << 8)
    expect(compressionMethod).toBe(8) // 8 = DEFLATE
  })

  it('dataFile.hash is the MD5 of dataFile.txt (not a placeholder)', async () => {
    const buf = await buildSbpZip([mockSong]).generateAsync({ type: 'uint8array' })
    const zip = await JSZip.loadAsync(buf)
    const text = await zip.file('dataFile.txt').async('string')
    const hash = await zip.file('dataFile.hash').async('string')
    expect(hash).toBe(SparkMD5.hash(text))
    expect(hash).not.toBe('00000000000000000000000000000000')
  })

  it('dataFile.txt starts with version line "1.0"', async () => {
    const { text } = await parseZip([mockSong])
    expect(text.startsWith('1.0\r\n')).toBe(true)
  })

  it('serializes core song fields correctly', async () => {
    const { json } = await parseZip([mockSong])
    const s = json.songs[0]
    expect(s.name).toBe('El Shaddai')
    expect(s.author).toBe('Amy Grant')
    expect(s.Capo).toBe(2)
    expect(s.TempoInt).toBe(120)
    expect(s.timeSig).toBe('4/4')
    expect(s.content).toBe(mockSong.rawText)
    expect(s.Deleted).toBe(false)
  })

  it('includes all SongBook Pro metadata fields required for import', async () => {
    const { json } = await parseZip([mockSong])
    const s = json.songs[0]
    // Required metadata fields SBP Pro expects
    expect(typeof s.Id).toBe('number')
    expect(typeof s.hash).toBe('string')
    expect(s.hash).toHaveLength(32)
    expect(s.type).toBe(1)
    expect(s.KeyShift).toBe(0)
    expect(typeof s.ModifiedDateTime).toBe('string')
    expect(s.subTitle).toBe('')
    expect(s.SyncId).toBe('')
    expect(s.ZoomFactor).toBe(1.0)
    expect(s.Duration).toBe(0)
    expect(s._displayParams).toBe('{}')
    expect(s._tags).toBe('[]')
    expect(s._folders).toBe('[]')
    expect(s.importSource).toBe('editor')
    expect(s.DeepSearch).toContain('el shaddai')
    expect(s.DeepSearch).toContain('amy grant')
  })

  it('calculates sounding key as (keyIndex + capo) % 12', async () => {
    const { json } = await parseZip([mockSong])
    // keyIndex 1 (Db) + capo 2 = 3 (Eb); +3 for A-based index = 6
    expect(json.songs[0].key).toBe(6)
  })

  it('sounding key wraps around correctly — B + 1 semitone = C', async () => {
    const song = { meta: { ...mockSong.meta, keyIndex: 11, capo: 1 }, rawText: '' }
    const { json } = await parseZip([song])
    expect(json.songs[0].key).toBe(3) // (11 + 1 + 3) % 12 = 3
  })

  it('handles empty songs array with valid structure', async () => {
    const { json } = await parseZip([])
    expect(json.songs).toEqual([])
    expect(json.sets).toEqual([])
    expect(json.folders).toEqual([])
  })

  it('exports multiple songs', async () => {
    const song2 = { meta: { ...mockSong.meta, title: 'Song Two', keyIndex: 7, capo: 0 }, rawText: 'lyrics' }
    const { json } = await parseZip([mockSong, song2])
    expect(json.songs).toHaveLength(2)
    expect(json.songs[1].name).toBe('Song Two')
    expect(json.songs[1].key).toBe(10)
  })

  it('includes lyricsOnly:true in ZIP JSON when flag is true', async () => {
    const buf = await buildSbpZip([mockSong], null, true).generateAsync({ type: 'uint8array' })
    const zip = await JSZip.loadAsync(buf)
    const text = await zip.file('dataFile.txt').async('string')
    const json = JSON.parse(text.slice(text.indexOf('\n') + 1))
    expect(json.lyricsOnly).toBe(true)
  })

  it('omits lyricsOnly from ZIP JSON when flag is false or omitted', async () => {
    const { json } = await parseZip([mockSong])  // uses existing helper, no lyricsOnly
    expect(json.lyricsOnly).toBeUndefined()
  })

  it('preserves {note:} lines when stripAppSyntax=false (Share via link)', async () => {
    const songWithNotes = {
      meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0 },
      rawText: '{c: Verse}\n{note: sing twice}\nHello world\n{note: softly}',
    }
    const { json } = await parseZip([songWithNotes])
    expect(json.songs[0].content).toContain('{note: sing twice}')
    expect(json.songs[0].content).toContain('{note: softly}')
    expect(json.songs[0].content).toContain('Hello world')
    expect(json.songs[0].content).toContain('{c: Verse}')
  })

  it('strips {note:} lines when stripAppSyntax=true (SBP download)', async () => {
    const songWithNotes = {
      meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0 },
      rawText: '{c: Verse}\n{note: sing twice}\nHello world\n{note: softly}',
    }
    const buf = await buildSbpZip([songWithNotes], null, false, null, true).generateAsync({ type: 'uint8array' })
    const zip = await JSZip.loadAsync(buf)
    const text = await zip.file('dataFile.txt').async('string')
    const json = JSON.parse(text.slice(text.indexOf('\n') + 1))
    expect(json.songs[0].content).not.toContain('{note:')
    expect(json.songs[0].content).toContain('{c: Verse}')
    expect(json.songs[0].content).toContain('Hello world')
  })

  it('strips {strum:} tokens when stripAppSyntax=true (SBP download)', async () => {
    const songWithStrum = {
      meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0 },
      rawText: '[G]{strum: ///} some lyrics\n[Dm]{strum: v^v} more lyrics',
    }
    const buf = await buildSbpZip([songWithStrum], null, false, null, true).generateAsync({ type: 'uint8array' })
    const zip = await (await import('jszip')).default.loadAsync(buf)
    const text = await zip.file('dataFile.txt').async('string')
    const json = JSON.parse(text.slice(text.indexOf('\n') + 1))
    expect(json.songs[0].content).not.toContain('{strum:')
    expect(json.songs[0].content).toContain('[G]')
    expect(json.songs[0].content).toContain('[Dm]')
    expect(json.songs[0].content).toContain('some lyrics')
  })

  it('preserves {strum:} tokens when stripAppSyntax=false (Share via link)', async () => {
    const songWithStrum = {
      meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0 },
      rawText: '[G]{strum: ///} some lyrics',
    }
    const { json } = await parseZip([songWithStrum])
    expect(json.songs[0].content).toContain('{strum: ///}')
    expect(json.songs[0].content).toContain('[G]')
  })

  it('maps meta.annotation to NotesText', async () => {
    const songWithAnnotation = {
      meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0, annotation: 'sing joyfully' },
      rawText: '{c: Verse}\nHello world',
    }
    const { json } = await parseZip([songWithAnnotation])
    expect(json.songs[0].NotesText).toBe('sing joyfully')
  })

  it('writes empty string to NotesText when meta.annotation is absent', async () => {
    const { json } = await parseZip([mockSong])
    expect(json.songs[0].NotesText).toBe('')
  })

  it('maps meta.youtubeVideoId to YoutubeVideoId', async () => {
    const songWithVideo = {
      meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0, youtubeVideoId: 'abc12345678' },
      rawText: '{c: Verse}\nHello world',
    }
    const { json } = await parseZip([songWithVideo])
    expect(json.songs[0].YoutubeVideoId).toBe('abc12345678')
  })

  it('writes null to YoutubeVideoId when meta.youtubeVideoId is absent', async () => {
    const { json } = await parseZip([mockSong])
    expect(json.songs[0].YoutubeVideoId).toBeNull()
  })

  describe('SBP round-trip (preserves original fields)', () => {
    // Songs imported from .sbp carry sbpXxx meta fields; export must write
    // the original key/KeyShift/Capo/content back verbatim so SBP interprets
    // the re-imported file the same way as the original.
    const sbpSong = {
      meta: {
        title: 'That\u2019s The Power',
        artist: 'Hillsong',
        keyIndex: 7, capo: 0,
        sbpKey: 1, sbpKeyShift: 9, sbpSongCapo: 0,
        sbpSetCapo: 3, sbpKeyOfset: 0,
        sbpOriginalContent: '[Gm]hello [Ebmaj7]world',
        sbpBaselineKeyIndex: 7,
      },
      rawText: '[Em]hello [Cmaj7]world',   // baked (Gm−3, Ebmaj7−3) for UI
    }

    it('writes sbpKey/sbpKeyShift/sbpSongCapo when user has not transposed', async () => {
      const { json } = await parseZip([sbpSong])
      const s = json.songs[0]
      expect(s.key).toBe(1)          // original Db, NOT (keyIndex + capo)
      expect(s.KeyShift).toBe(9)     // preserved live transpose
      expect(s.Capo).toBe(0)         // song-level capo preserved
      expect(s.content).toBe('[Gm]hello [Ebmaj7]world')  // original content
    })

    it('writes set-entry sbpSetCapo and sbpKeyOfset into the set contents', async () => {
      const buf = await buildSbpZip([sbpSong], 'CNY 2026').generateAsync({ type: 'uint8array' })
      const zip = await JSZip.loadAsync(buf)
      const text = await zip.file('dataFile.txt').async('string')
      const json = JSON.parse(text.slice(text.indexOf('\n') + 1))
      const entry = json.sets[0].contents[0]
      expect(entry.Capo).toBe(3)     // set capo preserved
      expect(entry.keyOfset).toBe(0)
    })

    it('bakes transpose into content when key has changed (share and recipient see correct chords)', async () => {
      // User transposed up 2: meta.keyIndex = 9 (baseline 7 + 2).
      // Share must export the transposed chords so the recipient sees Am, not Gm.
      const transposed = {
        ...sbpSong,
        meta: { ...sbpSong.meta, keyIndex: 9 },
      }
      const { json } = await parseZip([transposed])
      const s = json.songs[0]
      expect(s.key).toBe(0)                            // A sounding key (SBP A-based: (9+0+3)%12=0)
      expect(s.KeyShift).toBe(0)                       // no live-transpose needed; content is baked
      expect(s.content).toBe('[Am]hello [Fmaj7]world') // Gm+2=Am, Ebmaj7+2=Fmaj7
    })

    it('preserves keyOfset for songs that originally had set-level pitch shift', async () => {
      // Mirrors "We Fall Down": key=5(F), KS=5, setCapo=0, keyOfset=5, content=[D].
      const wfd = {
        meta: {
          title: 'We Fall Down', artist: '',
          keyIndex: 7, capo: 0,
          sbpKey: 5, sbpKeyShift: 5, sbpSongCapo: 0,
          sbpSetCapo: 0, sbpKeyOfset: 5,
          sbpOriginalContent: '[D]hello [A]world',
          sbpBaselineKeyIndex: 7,
        },
        rawText: '[G]hello [D]world',   // baked (D+5) for UI
      }
      const buf = await buildSbpZip([wfd], 'Set').generateAsync({ type: 'uint8array' })
      const zip = await JSZip.loadAsync(buf)
      const text = await zip.file('dataFile.txt').async('string')
      const json = JSON.parse(text.slice(text.indexOf('\n') + 1))
      const s = json.songs[0]
      const entry = json.sets[0].contents[0]
      expect(s.key).toBe(5)
      expect(s.KeyShift).toBe(5)
      expect(s.content).toBe('[D]hello [A]world')
      expect(entry.keyOfset).toBe(5)
    })

    it('falls back to (keyIndex + capo) formula for songs without sbpXxx fields', async () => {
      // Manually-created song (no import provenance) — existing behaviour.
      const { json } = await parseZip([mockSong])
      expect(json.songs[0].key).toBe(6)    // keyIndex 1 + capo 2 + 3 (A-based) = 6
      expect(json.songs[0].KeyShift).toBe(0)
    })

    it('does not double-transpose when user edited content and key changed', async () => {
      // User edited the song in the editor: changed key to D (2) and rewrote
      // the chords so rawText is already in D. sbpOriginalContent is null.
      // loadSongsWithTranspose then applies a widget delta of +2 (to F#=8).
      // The exported content must be F#-key chords, not D-key chords
      // transposed a further +2 (which would land in Ab — wrong).
      const editedWithDelta = {
        meta: {
          title: 'Edited Song', artist: '',
          keyIndex: 8,              // D(2) + widget delta(2) applied by loadSongsWithTranspose
          capo: 0,
          sbpKey: 1,                // original SBP fields preserved
          sbpKeyShift: 9,
          sbpSongCapo: 0,
          sbpOriginalContent: null, // user edited content → cleared
          sbpBaselineKeyIndex: 7,   // original G
        },
        rawText: '[F#m]bye [Dmaj7]world',  // already at keyIndex 8 (F#)
      }
      const { json } = await parseZip([editedWithDelta])
      const s = json.songs[0]
      // Content must export unchanged — rawText is already at the current guitar key.
      expect(s.content).toBe('[F#m]bye [Dmaj7]world')
      expect(s.KeyShift).toBe(0)
      expect(s.key).toBe((8 + 0 + 3) % 12) // F# sounding key A-based
    })
  })

  describe('SBP download (stripAppSyntax=true) key export', () => {
    // When downloading as .sbp, SBP reads the `key` field directly as the
    // displayed key — it does NOT add KeyShift to it. So we must write
    // sounding key (guitarKey + capo) into `key` and set KeyShift=0,
    // transposing content to match the user's current guitar key.
    const sbpSong = {
      meta: {
        title: 'Test', artist: '',
        keyIndex: 7, capo: 0,          // G, no capo
        sbpKey: 1, sbpKeyShift: 9, sbpSongCapo: 0,
        sbpSetCapo: 0, sbpKeyOfset: 0,
        sbpOriginalContent: '[Gm]hello [Ebmaj7]world',
        sbpBaselineKeyIndex: 7,
      },
      rawText: '[Em]hello [Cmaj7]world',
    }

    async function downloadZip(songs) {
      const buf = await buildSbpZip(songs, null, false, null, true).generateAsync({ type: 'uint8array' })
      const zip = await JSZip.loadAsync(buf)
      const text = await zip.file('dataFile.txt').async('string')
      const json = JSON.parse(text.slice(text.indexOf('\n') + 1))
      return { json }
    }

    it('preserves original SBP key fields when the imported song is unchanged', async () => {
      const { json } = await downloadZip([sbpSong])
      const s = json.songs[0]
      expect(s.key).toBe(1)
      expect(s.KeyShift).toBe(9)
      expect(s.Capo).toBe(0)
      expect(s.content).toBe('[Gm]hello [Ebmaj7]world')
    })

    it('transposes content when user moved guitar key up', async () => {
      // User transposed G → A (keyIndex=9, capo=0): delta=+2
      const transposed = { ...sbpSong, meta: { ...sbpSong.meta, keyIndex: 9 } }
      const { json } = await downloadZip([transposed])
      const s = json.songs[0]
      expect(s.key).toBe(0)        // A = new sounding key; +3 A-based = 12 % 12 = 0
      expect(s.KeyShift).toBe(0)
      expect(s.content).toBe('[Am]hello [Fmaj7]world')   // Gm+2=Am, Ebmaj7+2=Fmaj7
    })

    it('reflects user-set capo in exported Capo field', async () => {
      // User: keyIndex=2 (D), capo=1 → sounding key = Eb(3)
      const withCapo = { ...sbpSong, meta: { ...sbpSong.meta, keyIndex: 2, capo: 1 } }
      const { json } = await downloadZip([withCapo])
      const s = json.songs[0]
      expect(s.key).toBe(6)        // Eb = D + capo 1; +3 A-based = 6
      expect(s.Capo).toBe(1)
      expect(s.KeyShift).toBe(0)
    })
  })
})

describe('conductorCode round-trip', () => {
  it('embeds conductorCode in the zip when provided', async () => {
    const zip = buildSbpZip([], 'Test', false, 'COND01')
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    const { conductorCode } = await parseSbpFile(buf)
    expect(conductorCode).toBe('COND01')
  })

  it('returns null conductorCode when not embedded', async () => {
    const zip = buildSbpZip([], 'Test', false, null)
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    const { conductorCode } = await parseSbpFile(buf)
    expect(conductorCode).toBeNull()
  })
})

describe('youtubeVideoId round-trip', () => {
  it('preserves youtubeVideoId through export → parse', async () => {
    const songWithVideo = {
      meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0, youtubeVideoId: 'abc12345678' },
      rawText: '{c: Verse}\nHello world',
    }
    const buf = await buildSbpZip([songWithVideo]).generateAsync({ type: 'arraybuffer' })
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.youtubeVideoId).toBe('abc12345678')
  })

  it('leaves youtubeVideoId undefined when never set', async () => {
    const buf = await buildSbpZip([mockSong]).generateAsync({ type: 'arraybuffer' })
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.youtubeVideoId).toBeUndefined()
  })

  it('preserves youtubeStartSeconds through export → parse', async () => {
    const songWithStart = {
      meta: {
        title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0,
        youtubeVideoId: 'x_ekj3IOvT8', youtubeStartSeconds: 940,
      },
      rawText: '{c: Verse}\nHello world',
    }
    const buf = await buildSbpZip([songWithStart]).generateAsync({ type: 'arraybuffer' })
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.youtubeStartSeconds).toBe(940)
  })

  it('leaves youtubeStartSeconds undefined when never set', async () => {
    const buf = await buildSbpZip([mockSong]).generateAsync({ type: 'arraybuffer' })
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.youtubeStartSeconds).toBeUndefined()
  })

  it('omits the YoutubeStartSeconds key entirely when unset, keeping SBP files unpolluted', async () => {
    const { json } = await parseZip([mockSong])
    expect(json.songs[0]).not.toHaveProperty('YoutubeStartSeconds')
  })
})
