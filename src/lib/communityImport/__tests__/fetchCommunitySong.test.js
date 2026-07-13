import { describe, it, expect, vi } from 'vitest'

vi.mock('../communityClient', () => ({
  fetchCommunityArrangement: vi.fn(() => Promise.resolve({
    id: 'a1',
    title: 'Oceans',
    artist: 'Hillsong',
    keyIndex: 2,
    capo: 2,
    tempo: 70,
    body: '{c: Verse}\nYou call me [D]out upon the waters',
    collectionName: 'Judah',
    publisherName: 'Chris',
  })),
}))

import { fetchAndParseSong } from '../../ugImport/fetchSong'
import { fetchCommunityArrangement } from '../communityClient'

describe('fetchAndParseSong — community source', () => {
  it('fetches by arrangement id and parses the body into sections', async () => {
    const song = await fetchAndParseSong({ source: 'community', id: 'a1', url: 'community:a1' }, null)

    expect(fetchCommunityArrangement).toHaveBeenCalledWith('a1')
    expect(song.meta.title).toBe('Oceans')
    expect(song.meta.artist).toBe('Hillsong')
    expect(song.meta.keyIndex).toBe(2)
    expect(song.meta.capo).toBe(2)
    expect(song.sections.length).toBeGreaterThan(0)
  })

  it('needs no API key — community is the zero-config source', async () => {
    const song = await fetchAndParseSong({ source: 'community', id: 'a1' }, undefined)
    expect(song.meta.title).toBe('Oceans')
  })

  it('stamps provenance and NO sync keys, so the merge engine treats it as manually added', async () => {
    const song = await fetchAndParseSong({ source: 'community', id: 'a1' }, null)

    expect(song.meta.communitySource).toMatchObject({
      arrangementId: 'a1',
      publisherName: 'Chris',
    })
    expect(song.meta.communitySource.importedAt).toBeTruthy()
    expect(song.meta.sbpId).toBeUndefined()
    expect(song.meta.sharedBaseline).toBeUndefined()
  })
})
