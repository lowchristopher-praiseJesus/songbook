import { describe, it, expect, beforeEach } from 'vitest'

describe('isCreatingNewAlbum store actions', () => {
  beforeEach(() => localStorage.clear())

  it('starts false', async () => {
    const { useLibraryStore } = await import('../store/libraryStore')
    expect(useLibraryStore.getState().isCreatingNewAlbum).toBe(false)
  })

  it('setIsCreatingNewAlbum(true) clears activeSongId, activeAlbumCode, editingSongId, isCreatingNewSong', async () => {
    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.setState({ activeSongId: 'abc', activeAlbumCode: 'X', editingSongId: 'y', isCreatingNewSong: true })
    useLibraryStore.getState().setIsCreatingNewAlbum(true)
    const s = useLibraryStore.getState()
    expect(s.isCreatingNewAlbum).toBe(true)
    expect(s.activeSongId).toBeNull()
    expect(s.activeAlbumCode).toBeNull()
    expect(s.editingSongId).toBeNull()
    expect(s.isCreatingNewSong).toBe(false)
  })

  it('setIsCreatingNewAlbum(false) clears flag only', async () => {
    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.setState({ isCreatingNewAlbum: true })
    useLibraryStore.getState().setIsCreatingNewAlbum(false)
    expect(useLibraryStore.getState().isCreatingNewAlbum).toBe(false)
  })

  it('setViewMode clears isCreatingNewAlbum', async () => {
    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.setState({ isCreatingNewAlbum: true })
    useLibraryStore.getState().setViewMode('collections')
    expect(useLibraryStore.getState().isCreatingNewAlbum).toBe(false)
  })
})
