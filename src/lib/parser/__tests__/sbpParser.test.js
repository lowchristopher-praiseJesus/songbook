import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parseSbpFile } from '../sbpParser'

// Helper: create a mock .sbp zip buffer in memory
async function makeMockSbp(songs, extra = {}) {
  const zip = new JSZip()
  const json = JSON.stringify({ songs, sets: [], folders: [], ...extra })
  zip.file('dataFile.txt', `1.0\n${json}`)
  zip.file('dataFile.hash', 'abc123')
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('parseSbpFile', () => {
  it('extracts song name and author from zip', async () => {
    const buf = await makeMockSbp([{
      Id: 1, name: 'Test Song', author: 'Test Artist',
      key: 7, Capo: 0, TempoInt: 120, timeSig: '4/4',
      Copyright: '', content: '{c: Verse 1}\nHello [G]world', KeyShift: 0
    }])
    const { songs } = await parseSbpFile(buf)
    expect(songs).toHaveLength(1)
    expect(songs[0].meta.title).toBe('Test Song')
    expect(songs[0].meta.artist).toBe('Test Artist')
  })

  it('maps key index 7 to "G" and sets usesFlats=false', async () => {
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 7, Capo: 0,
      TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0
    }])
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.key).toBe('G')
    expect(songs[0].meta.usesFlats).toBe(false)
  })

  it('maps key index 3 to "Eb" and sets usesFlats=true', async () => {
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 3, Capo: 0,
      TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0
    }])
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.key).toBe('Eb')
    expect(songs[0].meta.usesFlats).toBe(true)
  })

  it('parses capo, tempo, timeSig, copyright', async () => {
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 0, Capo: 3,
      TempoInt: 88, timeSig: '3/4', Copyright: 'c 2020', content: '', KeyShift: 0
    }])
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.capo).toBe(3)
    expect(songs[0].meta.tempo).toBe(88)
    expect(songs[0].meta.timeSignature).toBe('3/4')
    expect(songs[0].meta.copyright).toBe('c 2020')
  })

  it('returns empty songs array for zip with no songs', async () => {
    const buf = await makeMockSbp([])
    const { songs } = await parseSbpFile(buf)
    expect(songs).toHaveLength(0)
  })

  it('filters out Deleted songs', async () => {
    const buf = await makeMockSbp([
      { Id: 1, name: 'Active', author: '', key: 0, Capo: 0, TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0, Deleted: false },
      { Id: 2, name: 'Deleted', author: '', key: 0, Capo: 0, TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0, Deleted: true },
    ])
    const { songs } = await parseSbpFile(buf)
    expect(songs).toHaveLength(1)
    expect(songs[0].meta.title).toBe('Active')
  })

  it('sets TempoInt 0 as undefined tempo', async () => {
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 0, Capo: 0,
      TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0
    }])
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.tempo).toBeUndefined()
  })

  it('throws on non-zip input', async () => {
    const buf = new TextEncoder().encode('not a zip file').buffer
    await expect(parseSbpFile(buf)).rejects.toThrow()
  })

  it('stores rawText from content field', async () => {
    const content = '{c: Verse 1}\nHello [G]world'
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 0, Capo: 0,
      TempoInt: 0, timeSig: '', Copyright: '', content, KeyShift: 0
    }])
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].rawText).toBe(content)
  })

  it('returns collectionName from archive when present', async () => {
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 0, Capo: 0,
      TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0
    }], { collectionName: 'Easter Set' })
    const { songs, collectionName } = await parseSbpFile(buf)
    expect(songs).toHaveLength(1)
    expect(collectionName).toBe('Easter Set')
  })

  it('returns collectionName as null when absent from archive', async () => {
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 0, Capo: 0,
      TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0
    }])
    const { collectionName } = await parseSbpFile(buf)
    expect(collectionName).toBeNull()
  })

  it('returns lyricsOnly:true when present in ZIP JSON', async () => {
    const buf = await makeMockSbp(
      [{ Id: 1, name: 'Song', author: '', key: 0, Capo: 0, TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0 }],
      { lyricsOnly: true }
    )
    const result = await parseSbpFile(buf)
    expect(result.lyricsOnly).toBe(true)
  })

  it('returns lyricsOnly:false when absent from ZIP JSON', async () => {
    const buf = await makeMockSbp(
      [{ Id: 1, name: 'Song', author: '', key: 0, Capo: 0, TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0 }]
    )
    const result = await parseSbpFile(buf)
    expect(result.lyricsOnly).toBe(false)
  })
})
