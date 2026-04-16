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
})
