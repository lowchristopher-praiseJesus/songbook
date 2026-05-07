import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from '../libraryStore'

const album = {
  albumCode: 'ABC123',
  creatorToken: 'tok',
  title: 'Test Album',
  artist: 'Band',
  createdAt: new Date().toISOString(),
  tracks: [],
}

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    editingAlbum: null,
    isCreatingNewAlbum: false,
    activeAlbumCode: null,
    activeSongId: null,
    activeSong: null,
    editingSongId: null,
    isCreatingNewSong: false,
  })
})

describe('setEditingAlbum', () => {
  it('sets editingAlbum and enables isCreatingNewAlbum', () => {
    useLibraryStore.getState().setEditingAlbum(album)
    const state = useLibraryStore.getState()
    expect(state.editingAlbum).toEqual(album)
    expect(state.isCreatingNewAlbum).toBe(true)
  })

  it('does NOT clear activeAlbumCode (so cancel returns to detail view)', () => {
    useLibraryStore.setState({ activeAlbumCode: 'ABC123' })
    useLibraryStore.getState().setEditingAlbum(album)
    expect(useLibraryStore.getState().activeAlbumCode).toBe('ABC123')
  })
})

describe('setIsCreatingNewAlbum', () => {
  it('clears editingAlbum when called with false', () => {
    useLibraryStore.setState({ editingAlbum: album, isCreatingNewAlbum: true })
    useLibraryStore.getState().setIsCreatingNewAlbum(false)
    expect(useLibraryStore.getState().editingAlbum).toBeNull()
    expect(useLibraryStore.getState().isCreatingNewAlbum).toBe(false)
  })

  it('clears editingAlbum when called with true (new album, not edit)', () => {
    useLibraryStore.setState({ editingAlbum: album })
    useLibraryStore.getState().setIsCreatingNewAlbum(true)
    expect(useLibraryStore.getState().editingAlbum).toBeNull()
  })
})
