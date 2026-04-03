import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from '../libraryStore'
import { loadCollections, saveCollections } from '../../lib/storage'

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
