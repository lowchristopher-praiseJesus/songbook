import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import SparkMD5 from 'spark-md5'
import { buildSbpZip } from '../lib/exportSbp'

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
    expect(text.startsWith('1.0\n')).toBe(true)
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
    // keyIndex 1 (Db) + capo 2 = 3 (Eb)
    expect(json.songs[0].key).toBe(3)
  })

  it('sounding key wraps around correctly — B + 1 semitone = C', async () => {
    const song = { meta: { ...mockSong.meta, keyIndex: 11, capo: 1 }, rawText: '' }
    const { json } = await parseZip([song])
    expect(json.songs[0].key).toBe(0) // (11 + 1) % 12 = 0
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
    expect(json.songs[1].key).toBe(7)
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

    it('folds user transpose delta into KeyShift (leaves original content untouched)', async () => {
      // User transposed up 2: meta.keyIndex = 9 (baseline 7 + 2).
      const transposed = {
        ...sbpSong,
        meta: { ...sbpSong.meta, keyIndex: 9 },
      }
      const { json } = await parseZip([transposed])
      const s = json.songs[0]
      expect(s.key).toBe(1)                  // original key never moves
      expect(s.KeyShift).toBe(9 + 2)         // 11 = base KS + user delta
      expect(s.content).toBe('[Gm]hello [Ebmaj7]world')
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
      expect(json.songs[0].key).toBe(3)    // keyIndex 1 + capo 2 = 3 (Eb)
      expect(json.songs[0].KeyShift).toBe(0)
    })
  })
})
