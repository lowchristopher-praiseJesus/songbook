import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../ugImport/fetchSong', () => ({ fetchAndParseSong: vi.fn() }))
vi.mock('../communityImport/communityClient', () => ({ recordCommunityImport: vi.fn() }))

import { createCollectionFromPicks } from '../createCollectionFromPicks'
import { fetchAndParseSong } from '../ugImport/fetchSong'
import { recordCommunityImport } from '../communityImport/communityClient'
import { useLibraryStore } from '../../store/libraryStore'
import { songsOnlyInCollection } from '../collectionSongs'

const pick = (id, title) => ({ id, title, artist: 'A', section: 'opening', reason: 'r' })
const PICKS = [pick('c1', 'Shout To The Lord'), pick('c2', 'Holy Forever'), pick('c3', 'Glory To The Lamb')]

function songFor(title) {
  return { rawText: `[G]${title}`, meta: { title, artist: 'A', keyIndex: 0, capo: 0 }, sections: [] }
}

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({ index: [], collections: [] })
  vi.clearAllMocks()
  fetchAndParseSong.mockImplementation(async ({ id }) => songFor(PICKS.find(p => p.id === id).title))
})

const titlesOf = (collectionId) => {
  const { collections, index } = useLibraryStore.getState()
  const c = collections.find(x => x.id === collectionId)
  return c.songIds.map(id => index.find(e => e.id === id).title)
}

describe('createCollectionFromPicks', () => {
  it('imports all new songs and creates the collection in pick order', async () => {
    const { collectionId, failedTitles } = await createCollectionFromPicks('Sunday', PICKS)
    expect(failedTitles).toEqual([])
    const c = useLibraryStore.getState().collections.find(x => x.id === collectionId)
    expect(c.name).toBe('Sunday')
    expect(titlesOf(collectionId)).toEqual(['Shout To The Lord', 'Holy Forever', 'Glory To The Lamb'])
    expect(fetchAndParseSong).toHaveBeenCalledWith({ source: 'community', id: 'c1' })
    expect(recordCommunityImport.mock.calls.map(c => c[0]).sort()).toEqual(['c1', 'c2', 'c3'])
  })

  it('files imported songs only in the new collection, so deleting it can also delete them', async () => {
    const { collectionId } = await createCollectionFromPicks('Sunday', PICKS)
    const { collections } = useLibraryStore.getState()
    expect(collections.map(c => c.name)).toEqual(['Sunday'])
    expect(songsOnlyInCollection(collections, collectionId)).toHaveLength(3)
  })

  it('reuses a song already in the library without importing or counting it', async () => {
    useLibraryStore.getState().addSongs([{ id: 'mine', ...songFor('Holy Forever') }])
    const { collectionId } = await createCollectionFromPicks('Sunday', PICKS)
    const c = useLibraryStore.getState().collections.find(x => x.id === collectionId)
    expect(c.songIds[1]).toBe('mine')
    expect(fetchAndParseSong).not.toHaveBeenCalledWith({ source: 'community', id: 'c2' })
    expect(recordCommunityImport).not.toHaveBeenCalledWith('c2')
    expect(useLibraryStore.getState().index.filter(e => e.title === 'Holy Forever')).toHaveLength(1)
  })

  it('creates the collection with the songs that downloaded and names the failures', async () => {
    fetchAndParseSong.mockImplementation(async ({ id }) => {
      if (id === 'c1') throw new Error('network_error')
      return songFor(PICKS.find(p => p.id === id).title)
    })
    const { collectionId, failedTitles } = await createCollectionFromPicks('Sunday', PICKS)
    expect(failedTitles).toEqual(['Shout To The Lord'])
    expect(titlesOf(collectionId)).toEqual(['Holy Forever', 'Glory To The Lamb'])
  })

  it('creates nothing when every download fails', async () => {
    fetchAndParseSong.mockRejectedValue(new Error('network_error'))
    const before = useLibraryStore.getState()
    const out = await createCollectionFromPicks('Sunday', PICKS)
    expect(out).toEqual({ collectionId: null, failedTitles: ['Shout To The Lord', 'Holy Forever', 'Glory To The Lamb'] })
    expect(useLibraryStore.getState().collections).toEqual(before.collections)
    expect(useLibraryStore.getState().index).toEqual(before.index)
  })
})
