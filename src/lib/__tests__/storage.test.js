import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveSong, loadSong, deleteSong, loadIndex, saveIndex,
  getTheme, setTheme, getLastSongId, setLastSongId, getStorageStats,
  getViewMode, saveViewMode,
} from '../storage'

beforeEach(() => {
  localStorage.clear()
})

describe('song CRUD', () => {
  const mockSong = {
    id: 'test-uuid-1',
    importedAt: '2026-01-01T00:00:00Z',
    rawText: '{c: Verse}\nHello [G]world',
    meta: { title: 'Test Song', artist: 'Test Artist' },
    sections: [],
  }

  it('saves and loads a song by id', () => {
    saveSong(mockSong)
    expect(loadSong('test-uuid-1')).toEqual(mockSong)
  })

  it('returns null for missing song', () => {
    expect(loadSong('nonexistent')).toBeNull()
  })

  it('deletes a song', () => {
    saveSong(mockSong)
    deleteSong('test-uuid-1')
    expect(loadSong('test-uuid-1')).toBeNull()
  })

  it('overwrite: saving same id replaces previous', () => {
    saveSong(mockSong)
    const updated = { ...mockSong, rawText: 'updated content' }
    saveSong(updated)
    expect(loadSong('test-uuid-1').rawText).toBe('updated content')
  })
})

describe('index', () => {
  it('saves and loads the index', () => {
    const index = [
      { id: 'a', title: 'Song A', artist: 'Artist A', importedAt: '2026-01-01T00:00:00Z' },
    ]
    saveIndex(index)
    expect(loadIndex()).toEqual(index)
  })

  it('returns empty array when no index exists', () => {
    expect(loadIndex()).toEqual([])
  })

  it('saves empty array index', () => {
    saveIndex([])
    expect(loadIndex()).toEqual([])
  })
})

describe('theme', () => {
  it('sets and gets theme', () => {
    setTheme('dark')
    expect(getTheme()).toBe('dark')
  })

  it('returns null when no theme set', () => {
    expect(getTheme()).toBeNull()
  })
})

describe('lastSongId', () => {
  it('sets and gets last song id', () => {
    setLastSongId('my-song-id')
    expect(getLastSongId()).toBe('my-song-id')
  })

  it('returns null when no last song id set', () => {
    expect(getLastSongId()).toBeNull()
  })
})

describe('getStorageStats', () => {
  it('returns usedBytes and limitBytes', () => {
    const stats = getStorageStats()
    expect(stats).toHaveProperty('usedBytes')
    expect(stats).toHaveProperty('limitBytes')
    expect(stats.limitBytes).toBe(5 * 1024 * 1024)
  })

  it('usedBytes increases after saving a song', () => {
    const before = getStorageStats().usedBytes
    saveSong({ id: 'big-song', importedAt: '', rawText: 'x'.repeat(1000), meta: { title: 'Big' }, sections: [] })
    const after = getStorageStats().usedBytes
    expect(after).toBeGreaterThan(before)
  })
})

describe('viewMode', () => {
  it('returns "collections" when nothing is stored', () => {
    expect(getViewMode()).toBe('collections')
  })

  it('returns "allSongs" after saving allSongs', () => {
    saveViewMode('allSongs')
    expect(getViewMode()).toBe('allSongs')
  })

  it('returns "collections" after saving collections', () => {
    saveViewMode('allSongs')
    saveViewMode('collections')
    expect(getViewMode()).toBe('collections')
  })

  it('ignores unknown values and returns "collections"', () => {
    localStorage.setItem('songsheet_view_mode', 'garbage')
    expect(getViewMode()).toBe('collections')
  })
})
