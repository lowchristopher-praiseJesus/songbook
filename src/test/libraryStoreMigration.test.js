import { describe, it, expect, beforeEach } from 'vitest'

// Reset module between tests so Zustand store re-initialises
describe('libraryStore conductor migration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('assigns conductorRole "conductor" to legacy records with directorToken', async () => {
    // Plant a legacy collection in localStorage
    const legacy = [
      {
        id: 'col-1',
        name: 'Easter Set',
        createdAt: '2026-01-01T00:00:00.000Z',
        songIds: [],
        conductorCode: 'ABC123',
        conductorDirectorToken: 'tok-123',
      },
    ]
    localStorage.setItem('songsheet_collections', JSON.stringify(legacy))

    // Dynamic import to get a fresh store instance
    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.getState().init()
    const collections = useLibraryStore.getState().collections

    expect(collections[0].conductorRole).toBe('conductor')
  })

  it('assigns conductorRole "follower" to legacy records with code but no token', async () => {
    const legacy = [
      {
        id: 'col-2',
        name: 'Sunday Set',
        createdAt: '2026-01-01T00:00:00.000Z',
        songIds: [],
        conductorCode: 'XYZ789',
      },
    ]
    localStorage.setItem('songsheet_collections', JSON.stringify(legacy))

    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.getState().init()
    const collections = useLibraryStore.getState().collections

    expect(collections[0].conductorRole).toBe('follower')
  })

  it('does not overwrite existing conductorRole', async () => {
    const existing = [
      {
        id: 'col-3',
        name: 'CNY Set',
        createdAt: '2026-01-01T00:00:00.000Z',
        songIds: [],
        conductorCode: 'AAA111',
        conductorDirectorToken: 'tok',
        conductorRole: 'coordinator',
      },
    ]
    localStorage.setItem('songsheet_collections', JSON.stringify(existing))

    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.getState().init()
    const collections = useLibraryStore.getState().collections

    expect(collections[0].conductorRole).toBe('coordinator')
  })
})
