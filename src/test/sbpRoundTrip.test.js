import { describe, it, expect } from 'vitest'
import fs from 'fs'
import JSZip from 'jszip'
import { parseSbpFile } from '../lib/parser/sbpParser'
import { buildSbpZip } from '../lib/exportSbp'

// Real-file round-trip: import CNY 2026 → export → inspect the exported JSON.
// The SBP-level fields (key, KeyShift, Capo, content, set Capo, keyOfset)
// should match the original byte-for-byte for every song, proving that SBP
// will interpret the re-imported file the same way as the original.
describe('SBP round-trip with real CNY 2026 fixture', () => {
  it('preserves key/KeyShift/Capo/content + set Capo/keyOfset verbatim', async () => {
    const origBytes = fs.readFileSync('/Volumes/HomeX/Chris/Documents/songbook/CNY 2026 (2-28-2026).sbp')
    const origBuf = new Uint8Array(origBytes).buffer
    const { songs, collectionName } = await parseSbpFile(origBuf)

    const exported = await buildSbpZip(songs, collectionName).generateAsync({ type: 'uint8array' })
    const expZip = await JSZip.loadAsync(exported)
    const expText = await expZip.file('dataFile.txt').async('string')
    const expJson = JSON.parse(expText.slice(expText.indexOf('\n') + 1))

    const origZip = await JSZip.loadAsync(origBuf)
    const origText = await origZip.file('dataFile.txt').async('string')
    const origJson = JSON.parse(origText.slice(origText.indexOf('\n') + 1))

    for (const origSong of origJson.songs) {
      const expSong = expJson.songs.find(s => s.name === origSong.name)
      expect(expSong, origSong.name).toBeDefined()
      expect(expSong.key,      `${origSong.name} key`).toBe(origSong.key)
      expect(expSong.KeyShift, `${origSong.name} KeyShift`).toBe(origSong.KeyShift)
      expect(expSong.Capo,     `${origSong.name} Capo`).toBe(origSong.Capo)
      expect(expSong.content,  `${origSong.name} content`).toBe(origSong.content)
    }

    // Set entries must also round-trip Capo + keyOfset for each song.
    const origEntries = origJson.sets[0].contents
    for (const origEntry of origEntries) {
      const origSong = origJson.songs.find(s => s.Id === origEntry.SongId)
      const expSong  = expJson.songs.find(s => s.name === origSong.name)
      const expEntry = expJson.sets[0].contents.find(e => e.SongId === expSong.Id)
      expect(expEntry, origSong.name).toBeDefined()
      expect(expEntry.Capo,     `${origSong.name} set Capo`).toBe(origEntry.Capo)
      expect(expEntry.keyOfset, `${origSong.name} set keyOfset`).toBe(origEntry.keyOfset)
    }
  })
})
