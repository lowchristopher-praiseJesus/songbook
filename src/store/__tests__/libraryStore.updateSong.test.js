import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from '../libraryStore'
import { loadSong, loadIndex, saveSong, saveIndex } from '../../lib/storage'
import { parseContent } from '../../lib/parser/contentParser'

const baseSong = {
  id: 'song-1',
  importedAt: '2026-01-01T00:00:00Z',
  rawText: '{c: Verse}\n[G]Hello world',
  meta: {
    title: 'Original Title',
    artist: 'Original Artist',
    key: 'G',
    keyIndex: 7,
    usesFlats: false,
    capo: 0,
  },
  sections: [],
}

const baseEntry = {
  id: 'song-1',
  title: 'Original Title',
  artist: 'Original Artist',
  importedAt: '2026-01-01T00:00:00Z',
  collectionId: null,
}

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    index: [],
    collections: [],
    activeSongId: null,
    activeSong: null,
    editingSongId: null,
  })
  saveSong(baseSong)
  saveIndex([baseEntry])
  useLibraryStore.setState({ index: [baseEntry] })
})

describe('updateSong', () => {
  it('updates rawText and re-parses sections in localStorage', () => {
    const newRawText = '{c: Chorus}\n[Am]New content'
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta },
      rawText: newRawText,
    })
    const saved = loadSong('song-1')
    expect(saved.rawText).toBe(newRawText)
    expect(saved.sections).toEqual(parseContent(newRawText))
  })

  it('updates meta title and artist in localStorage and index', () => {
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, title: 'New Title', artist: 'New Artist' },
      rawText: baseSong.rawText,
    })
    const saved = loadSong('song-1')
    expect(saved.meta.title).toBe('New Title')
    expect(saved.meta.artist).toBe('New Artist')
    const index = loadIndex()
    expect(index[0].title).toBe('New Title')
    expect(index[0].artist).toBe('New Artist')
  })

  it('updates index in store state', () => {
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, title: 'Store Title' },
      rawText: baseSong.rawText,
    })
    const { index } = useLibraryStore.getState()
    expect(index[0].title).toBe('Store Title')
  })

  it('derives keyIndex from meta.key string', () => {
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, key: 'Eb' },
      rawText: baseSong.rawText,
    })
    const saved = loadSong('song-1')
    expect(saved.meta.keyIndex).toBe(3)
    expect(saved.meta.usesFlats).toBe(true)
  })

  it('sets usesFlats false for sharp keys', () => {
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, key: 'G' },
      rawText: baseSong.rawText,
    })
    const saved = loadSong('song-1')
    expect(saved.meta.usesFlats).toBe(false)
  })

  it('refreshes activeSong when editing the active song', () => {
    useLibraryStore.setState({ activeSongId: 'song-1', activeSong: baseSong })
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, title: 'Updated Title' },
      rawText: baseSong.rawText,
    })
    const { activeSong } = useLibraryStore.getState()
    expect(activeSong.meta.title).toBe('Updated Title')
  })

  it('does not update activeSong when editing a different song', () => {
    const otherSong = { id: 'other-id', meta: { title: 'Other' } }
    useLibraryStore.setState({ activeSongId: 'other-id', activeSong: otherSong })
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, title: 'Changed' },
      rawText: baseSong.rawText,
    })
    const { activeSong } = useLibraryStore.getState()
    expect(activeSong.id).toBe('other-id')
  })
})

describe('editingSongId', () => {
  it('starts as null', () => {
    expect(useLibraryStore.getState().editingSongId).toBeNull()
  })

  it('setEditingSongId sets the id', () => {
    useLibraryStore.getState().setEditingSongId('abc')
    expect(useLibraryStore.getState().editingSongId).toBe('abc')
  })

  it('setEditingSongId(null) clears the id', () => {
    useLibraryStore.getState().setEditingSongId('abc')
    useLibraryStore.getState().setEditingSongId(null)
    expect(useLibraryStore.getState().editingSongId).toBeNull()
  })
})
