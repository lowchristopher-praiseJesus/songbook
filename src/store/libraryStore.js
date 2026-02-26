import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import {
  saveSong, loadSong, deleteSong as deleteFromStorage,
  loadIndex, saveIndex, getLastSongId, setLastSongId
} from '../lib/storage'

export const useLibraryStore = create((set, get) => ({
  // State
  index: [],           // [{id, title, artist, importedAt}]
  activeSongId: null,
  activeSong: null,    // Full song object (loaded from localStorage)

  /**
   * Initialize from localStorage on app start.
   * Repairs the index by removing entries whose song data is missing.
   */
  init() {
    const index = loadIndex()
    const lastId = getLastSongId()

    // Repair: remove index entries with missing data
    const validIndex = index.filter(entry => loadSong(entry.id) !== null)
    if (validIndex.length !== index.length) saveIndex(validIndex)

    const activeSong = lastId ? loadSong(lastId) : null

    set({
      index: validIndex,
      activeSongId: activeSong ? activeSong.id : null,
      activeSong,
    })
  },

  /**
   * Add one or more songs to the library.
   * Songs without an id get a new UUID assigned.
   * Maintains alphabetical sort order on the index.
   */
  addSongs(songs) {
    const currentIndex = [...get().index]

    for (const song of songs) {
      if (!song.id) song.id = uuidv4()
      if (!song.importedAt) song.importedAt = new Date().toISOString()

      saveSong(song)  // may throw QuotaExceededError — intentionally not caught here

      const entry = {
        id: song.id,
        title: song.meta.title,
        artist: song.meta.artist ?? '',
        importedAt: song.importedAt,
      }

      const existingIdx = currentIndex.findIndex(e => e.id === song.id)
      if (existingIdx >= 0) {
        currentIndex[existingIdx] = entry
      } else {
        currentIndex.push(entry)
      }
    }

    currentIndex.sort((a, b) => a.title.localeCompare(b.title))
    saveIndex(currentIndex)
    set({ index: currentIndex })
  },

  /**
   * Set the active (displayed) song.
   */
  selectSong(id) {
    const song = loadSong(id)
    if (!song) return
    setLastSongId(id)
    set({ activeSongId: id, activeSong: song })
  },

  /**
   * Delete a song from the library and localStorage.
   * If the deleted song was active, clears the active song.
   */
  deleteSong(id) {
    deleteFromStorage(id)
    const newIndex = get().index.filter(e => e.id !== id)
    saveIndex(newIndex)

    const wasActive = get().activeSongId === id
    set({
      index: newIndex,
      ...(wasActive ? { activeSongId: null, activeSong: null } : {}),
    })
  },

  /**
   * Replace an existing song (used for "overwrite" duplicate resolution).
   */
  replaceSong(id, newSong) {
    deleteFromStorage(id)
    // Remove from index first, then re-add via addSongs
    const filteredIndex = get().index.filter(e => e.id !== id)
    saveIndex(filteredIndex)
    set({ index: filteredIndex })
    get().addSongs([{ ...newSong, id }])
  },
}))
