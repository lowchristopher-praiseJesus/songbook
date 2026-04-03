import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from '../libraryStore'
import { loadCollections, saveCollections, loadIndex, saveIndex, saveSong } from '../../lib/storage'

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    index: [],
    collections: [],
    activeSongId: null,
    activeSong: null,
    editingSongId: null,
  })
})

describe('createCollection', () => {
  it('adds a collection with empty songIds', () => {
    useLibraryStore.getState().createCollection('Sunday Set')
    const { collections } = useLibraryStore.getState()
    expect(collections).toHaveLength(1)
    expect(collections[0].name).toBe('Sunday Set')
    expect(collections[0].songIds).toEqual([])
    expect(collections[0].id).toBeTruthy()
    expect(collections[0].createdAt).toBeTruthy()
  })

  it('persists to localStorage', () => {
    useLibraryStore.getState().createCollection('Sunday Set')
    const saved = loadCollections()
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Sunday Set')
  })

  it('is a no-op for empty or whitespace-only name', () => {
    useLibraryStore.getState().createCollection('')
    useLibraryStore.getState().createCollection('   ')
    expect(useLibraryStore.getState().collections).toHaveLength(0)
  })

  it('trims whitespace from name', () => {
    useLibraryStore.getState().createCollection('  Worship Night  ')
    expect(useLibraryStore.getState().collections[0].name).toBe('Worship Night')
  })
})

describe('setCollectionSongs', () => {
  beforeEach(() => {
    const seed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['a', 'b'] }]
    useLibraryStore.setState({ collections: seed })
    saveCollections(seed)
  })

  it('replaces songIds on the named collection', () => {
    useLibraryStore.getState().setCollectionSongs('c1', ['a', 'c', 'd'])
    const { collections } = useLibraryStore.getState()
    expect(collections[0].songIds).toEqual(['a', 'c', 'd'])
  })

  it('persists to localStorage', () => {
    useLibraryStore.getState().setCollectionSongs('c1', ['x'])
    const saved = loadCollections()
    expect(saved[0].songIds).toEqual(['x'])
  })

  it('can set to empty array', () => {
    useLibraryStore.getState().setCollectionSongs('c1', [])
    expect(useLibraryStore.getState().collections[0].songIds).toEqual([])
  })

  it('does not affect other collections', () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['a'] },
        { id: 'c2', name: 'Worship', createdAt: '2026-01-01T00:00:00Z', songIds: ['b'] },
      ],
    })
    useLibraryStore.getState().setCollectionSongs('c1', ['x'])
    const { collections } = useLibraryStore.getState()
    expect(collections.find(c => c.id === 'c2').songIds).toEqual(['b'])
  })
})

describe('deleteCollection', () => {
  it('removes the collection without touching index entries', () => {
    saveSong({ id: 's1', meta: { title: 'Song', artist: '' }, importedAt: '2026-01-01T00:00:00Z', rawText: '', sections: [] })
    saveIndex([{ id: 's1', title: 'Song', artist: '', importedAt: '2026-01-01T00:00:00Z' }])
    useLibraryStore.setState({
      index: [{ id: 's1', title: 'Song', artist: '', importedAt: '2026-01-01T00:00:00Z' }],
      collections: [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['s1'] }],
    })
    useLibraryStore.getState().deleteCollection('c1')
    const { collections, index } = useLibraryStore.getState()
    expect(collections).toHaveLength(0)
    // index entry must not have been modified (no collectionId to clear)
    expect(index[0]).toEqual({ id: 's1', title: 'Song', artist: '', importedAt: '2026-01-01T00:00:00Z' })
  })

  it('persists the removal to localStorage', () => {
    saveCollections([{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['s1'] }])
    useLibraryStore.setState({
      collections: [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['s1'] }],
    })
    useLibraryStore.getState().deleteCollection('c1')
    const saved = loadCollections()
    expect(saved).toHaveLength(0)
  })
})

describe('replaceSong preserves collection membership', () => {
  it('keeps song in all collections it belonged to after replace', () => {
    const song = { id: 's1', meta: { title: 'Song', artist: '' }, importedAt: '2026-01-01T00:00:00Z', rawText: '', sections: [] }
    saveSong(song)
    saveIndex([{ id: 's1', title: 'Song', artist: '', importedAt: '2026-01-01T00:00:00Z' }])
    useLibraryStore.setState({
      index: [{ id: 's1', title: 'Song', artist: '', importedAt: '2026-01-01T00:00:00Z' }],
      collections: [
        { id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['s1'] },
        { id: 'c2', name: 'Worship', createdAt: '2026-01-01T00:00:00Z', songIds: ['s1'] },
      ],
    })
    const newSong = { ...song, meta: { ...song.meta, title: 'Renamed Song' } }
    useLibraryStore.getState().replaceSong('s1', newSong)
    const { collections } = useLibraryStore.getState()
    expect(collections.find(c => c.id === 'c1').songIds).toContain('s1')
    expect(collections.find(c => c.id === 'c2').songIds).toContain('s1')
  })
})

describe('init() migration', () => {
  it('strips collectionId from index entries on load', () => {
    saveSong({ id: 's1', meta: { title: 'Song 1', artist: '' }, importedAt: '2026-01-01T00:00:00Z', rawText: '', sections: [] })
    saveIndex([{ id: 's1', title: 'Song 1', artist: '', importedAt: '2026-01-01T00:00:00Z', collectionId: 'c1' }])
    useLibraryStore.getState().init()
    const { index } = useLibraryStore.getState()
    expect(index[0]).not.toHaveProperty('collectionId')
  })

  it('preserves empty collections during repair', () => {
    localStorage.setItem('songsheet_collections', JSON.stringify([
      { id: 'c1', name: 'Empty Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] },
    ]))
    useLibraryStore.getState().init()
    const { collections } = useLibraryStore.getState()
    expect(collections).toHaveLength(1)
    expect(collections[0].name).toBe('Empty Set')
  })
})
