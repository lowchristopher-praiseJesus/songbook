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

  // KeyShift / Capo handling
  // SBP writes KeyShift destructively into the content (chords already reflect it),
  // so the parser uses KeyShift only to anchor the diatonic key search (adjustedSounding),
  // NOT to re-transpose the chord text.

  it('KeyShift=2: content already reflects shift; keyIndex matches adjusted sounding key', async () => {
    // key=2 (D) + KeyShift=2 → sounding E (index 4). SBP has already written E chords
    // into content. Parser finds E from chord content using adjustedSounding=E.
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 2, Capo: 0, KeyShift: 2,
      TempoInt: 0, timeSig: '', Copyright: '', content: '[E]hello [A]world',
    }])
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.keyIndex).toBe(4)   // E
    expect(songs[0].meta.key).toBe('E')
    expect(songs[0].meta.capo).toBe(0)
    // rawText unchanged (KeyShift not re-applied by parser)
    expect(songs[0].rawText).toBe('[E]hello [A]world')
  })

  it('Capo=2: rawText unchanged, keyIndex is guitar key (sounding − capo)', async () => {
    // D (key=2) + Capo=2 → guitar key C (index 0); rawText stays in D (capo applied by hook)
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 2, Capo: 2, KeyShift: 0,
      TempoInt: 0, timeSig: '', Copyright: '', content: '[D]hello [G]world',
    }])
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.keyIndex).toBe(0)   // C (guitar key)
    expect(songs[0].meta.key).toBe('C')
    expect(songs[0].meta.capo).toBe(2)
    // rawText keeps original D chords; capo shift applied at display time
    expect(songs[0].rawText).toBe('[D]hello [G]world')
  })

  it('KeyShift=2 + Capo=1: content already reflects KeyShift; keyIndex = adjusted sounding − capo', async () => {
    // key=2 (D) + KeyShift=2 → adjusted sounding E (4). Content already has E chords.
    // Guitar key = E − capo 1 = Eb (3).
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 2, Capo: 1, KeyShift: 2,
      TempoInt: 0, timeSig: '', Copyright: '', content: '[E]hello',
    }])
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.keyIndex).toBe(3)   // Eb
    expect(songs[0].meta.key).toBe('Eb')
    expect(songs[0].meta.capo).toBe(1)
    expect(songs[0].rawText).toBe('[E]hello')
  })

  it('Capo on song with no chords falls back to guitar key (sounding − capo)', async () => {
    // key=0 (C), Capo=3 → guitar key A (index 9); no chords so diatonic scoring is skipped
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 0, Capo: 3, KeyShift: 0,
      TempoInt: 0, timeSig: '', Copyright: '', content: '',
    }])
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.keyIndex).toBe(9)   // A
    expect(songs[0].meta.key).toBe('A')
    expect(songs[0].meta.capo).toBe(3)
  })

  it('keyOfset: content unchanged; KeyShift anchors sounding so scorer finds correct guitar key', async () => {
    // Mirrors "We Fall Down" in CNY 2026: key=F(5), KeyShift=5 → sounding Bb(10).
    // keyOfset=5 is pitch-shift metadata that does NOT change displayed chord shapes.
    // Content has G-key chords ([D]/[G]); adjustedSounding=Bb so scorer finds G at capo=3.
    const songId = 2
    const buf = await makeMockSbp(
      [{ Id: songId, name: 'Song', author: '', key: 5, Capo: 0, KeyShift: 5,
         TempoInt: 0, timeSig: '', Copyright: '', content: '[D]hello [G]world' }],
      { sets: [{ details: { Id: 5, name: 'Test Set' }, contents: [{ Id: 1, Order: 0, Capo: 0, keyOfset: 5, SetId: 5, SongId: songId }] }] }
    )
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.keyIndex).toBe(7)   // G
    expect(songs[0].meta.key).toBe('G')
    expect(songs[0].meta.capo).toBe(0)
    expect(songs[0].rawText).toBe('[D]hello [G]world')  // unchanged — keyOfset not baked in
  })

  it('KeyShift + set Capo: real-world case where content is already in sounding key', async () => {
    // Mirrors "That's The Power" in CNY 2026: key=1 (Db), KeyShift=9 → sounding Bb (10).
    // Content already has Bb-key chords (Gm, Ebmaj7). Set entry Capo=3 shifts display
    // down to G shapes (Em, Cmaj7). Expected: keyIndex=7 (G), capo=0 (set capo baked in).
    const songId = 1
    const buf = await makeMockSbp(
      [{ Id: songId, name: 'Song', author: '', key: 1, Capo: 0, KeyShift: 9,
         TempoInt: 0, timeSig: '', Copyright: '', content: '[Gm]hello [Ebmaj7]world' }],
      { sets: [{ details: { Id: 5, name: 'Test Set' }, contents: [{ Id: 1, Order: 0, Capo: 3, keyOfset: 0, SetId: 5, SongId: songId }] }] }
    )
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.keyIndex).toBe(7)   // G (guitar key = Bb − setCapo 3)
    expect(songs[0].meta.key).toBe('G')
    expect(songs[0].meta.capo).toBe(0)
    // Content shifted down 3 (set capo): Gm→Em, Ebmaj7→Cmaj7
    expect(songs[0].rawText).toBe('[Em]hello [Cmaj7]world')
  })
})
