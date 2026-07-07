import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from '../libraryStore'
import { loadSong, loadIndex, saveSong, saveIndex } from '../../lib/storage'
import { parseContent } from '../../lib/parser/contentParser'

const baseSong = {
  id: 'song-1',
  importedAt: '2026-01-01T00:00:00Z',
  rawText: '{c: Verse}\n[G]Hello world',
  meta: {
    title: 'Amazing Grace',
    artist: 'Original Artist',
    key: 'G',
    keyIndex: 7,
    usesFlats: false,
    capo: 0,
    tempo: 120,
    sbpId: 42,
    sharedBaseline: { title: 'Amazing Grace', rawText: 'baseline' },
  },
  sections: [],
}

const baseEntry = {
  id: 'song-1',
  title: 'Amazing Grace',
  artist: 'Original Artist',
  importedAt: '2026-01-01T00:00:00Z',
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

describe('saveAsNewSong', () => {
  it('creates a new song with a suffixed title when the title is unchanged', () => {
    const newId = useLibraryStore.getState().saveAsNewSong('song-1', {
      meta: { ...baseSong.meta },
      rawText: baseSong.rawText,
    })
    expect(newId).toBeTruthy()
    const copy = loadSong(newId)
    expect(copy.meta.title).toBe('Amazing Grace 1')
  })

  it('leaves the original song untouched', () => {
    useLibraryStore.getState().saveAsNewSong('song-1', {
      meta: { ...baseSong.meta, artist: 'Changed Artist' },
      rawText: '{c: Chorus}\n[Am]brand new content',
    })
    const original = loadSong('song-1')
    expect(original.meta.artist).toBe('Original Artist')
    expect(original.rawText).toBe(baseSong.rawText)
  })

  it('increments the suffix to avoid collisions with existing titles', () => {
    // Pre-seed "Amazing Grace 1" as if it already exists.
    const taken = {
      id: 'song-2',
      importedAt: '2026-01-02T00:00:00Z',
      rawText: '...',
      meta: { title: 'Amazing Grace 1', key: 'G' },
      sections: [],
    }
    saveSong(taken)
    const takenEntry = {
      id: 'song-2',
      title: 'Amazing Grace 1',
      artist: '',
      importedAt: taken.importedAt,
    }
    saveIndex([baseEntry, takenEntry])
    useLibraryStore.setState({ index: [baseEntry, takenEntry] })

    const newId = useLibraryStore.getState().saveAsNewSong('song-1', {
      meta: { ...baseSong.meta },
      rawText: baseSong.rawText,
    })
    expect(loadSong(newId).meta.title).toBe('Amazing Grace 2')
  })

  it('uses the user-supplied title when the song was renamed', () => {
    const newId = useLibraryStore.getState().saveAsNewSong('song-1', {
      meta: { ...baseSong.meta, title: 'Grace Reborn' },
      rawText: baseSong.rawText,
    })
    expect(loadSong(newId).meta.title).toBe('Grace Reborn')
  })

  it('strips sharing-specific fields from the copy', () => {
    const newId = useLibraryStore.getState().saveAsNewSong('song-1', {
      meta: { ...baseSong.meta },
      rawText: baseSong.rawText,
    })
    const copy = loadSong(newId)
    expect(copy.meta.sbpId).toBeUndefined()
    expect(copy.meta.sharedBaseline).toBeUndefined()
  })

  it('recomputes keyIndex/usesFlats from the edited key', () => {
    const newId = useLibraryStore.getState().saveAsNewSong('song-1', {
      meta: { ...baseSong.meta, key: 'Eb' },
      rawText: baseSong.rawText,
    })
    const copy = loadSong(newId)
    expect(copy.meta.keyIndex).toBe(3)
    expect(copy.meta.usesFlats).toBe(true)
  })

  it('parses sections from the edited rawText', () => {
    const newRaw = '{c: Chorus}\n[Am]New content'
    const newId = useLibraryStore.getState().saveAsNewSong('song-1', {
      meta: { ...baseSong.meta },
      rawText: newRaw,
    })
    expect(loadSong(newId).sections).toEqual(parseContent(newRaw))
  })

  it('adds the new song to the index and keeps the original', () => {
    const newId = useLibraryStore.getState().saveAsNewSong('song-1', {
      meta: { ...baseSong.meta },
      rawText: baseSong.rawText,
    })
    const index = loadIndex()
    expect(index.map(e => e.id)).toContain('song-1')
    expect(index.map(e => e.id)).toContain(newId)
  })

  it('returns null when the original song does not exist', () => {
    const result = useLibraryStore.getState().saveAsNewSong('does-not-exist', {
      meta: { ...baseSong.meta },
      rawText: baseSong.rawText,
    })
    expect(result).toBeNull()
  })
})