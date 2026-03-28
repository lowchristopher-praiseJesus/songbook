import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import {
  saveSong, loadSong, deleteSong as deleteFromStorage,
  loadIndex, saveIndex, getLastSongId, setLastSongId, clearLastSongId,
  loadCollections, saveCollections,
} from '../lib/storage'

export const useLibraryStore = create((set, get) => ({
  // State
  index: [],           // [{id, title, artist, importedAt, collectionId}]
  collections: [],     // [{id, name, createdAt, songIds}]
  activeSongId: null,
  activeSong: null,    // Full song object (loaded from localStorage)

  /**
   * Initialize from localStorage on app start.
   * Repairs the index by removing entries whose song data is missing.
   * Repairs collections by removing stale songIds and dropping empty collections.
   */
  init() {
    const index = loadIndex()
    const lastId = getLastSongId()

    // Repair: remove index entries with missing data
    const validIndex = index.filter(entry => loadSong(entry.id) !== null)
    if (validIndex.length !== index.length) saveIndex(validIndex)

    // Repair collections
    const validIds = new Set(validIndex.map(e => e.id))
    let collections = loadCollections()
    let collectionsChanged = false
    collections = collections
      .map(c => {
        const filtered = c.songIds.filter(id => validIds.has(id))
        if (filtered.length !== c.songIds.length) collectionsChanged = true
        return { ...c, songIds: filtered }
      })
      .filter(c => {
        if (c.songIds.length === 0) { collectionsChanged = true; return false }
        return true
      })
    if (collectionsChanged) saveCollections(collections)

    const activeSong = lastId ? loadSong(lastId) : null

    set({
      index: validIndex,
      collections,
      activeSongId: activeSong ? activeSong.id : null,
      activeSong,
    })
  },

  /**
   * Add one or more songs to the library.
   * Songs without an id get a new UUID assigned.
   * Maintains alphabetical sort order on the index.
   * If collectionName is provided, creates a new collection for these songs.
   */
  addSongs(songs, collectionName = null) {
    const currentIndex = [...get().index]
    const currentCollections = [...get().collections]
    const newSongIds = []

    for (const rawSong of songs) {
      const { _preservedCollectionId, ...songData } = rawSong
      const song = { ...songData }
      if (!song.id) song.id = uuidv4()
      if (!song.importedAt) song.importedAt = new Date().toISOString()

      saveSong(song)  // may throw QuotaExceededError — intentionally not caught here

      const existingIdx = currentIndex.findIndex(e => e.id === song.id)
      const existingCollectionId = existingIdx >= 0 ? currentIndex[existingIdx].collectionId : (_preservedCollectionId ?? null)
      const collectionId = collectionName ? null : existingCollectionId
      // collectionId for named-collection songs is set after collection creation below

      const entry = {
        id: song.id,
        title: song.meta.title,
        artist: song.meta.artist ?? '',
        importedAt: song.importedAt,
        collectionId,
      }

      if (existingIdx >= 0) {
        currentIndex[existingIdx] = entry
      } else {
        currentIndex.push(entry)
        newSongIds.push(song.id)
      }
    }

    if (collectionName && newSongIds.length > 0) {
      const newCollection = {
        id: uuidv4(),
        name: collectionName,
        createdAt: new Date().toISOString(),
        songIds: newSongIds,
      }
      currentCollections.push(newCollection)
      // Assign collectionId to the new entries
      for (const id of newSongIds) {
        const idx = currentIndex.findIndex(e => e.id === id)
        if (idx >= 0) currentIndex[idx] = { ...currentIndex[idx], collectionId: newCollection.id }
      }
      saveCollections(currentCollections)
    }

    currentIndex.sort((a, b) => a.title.localeCompare(b.title))
    saveIndex(currentIndex)
    set({ index: currentIndex, collections: currentCollections })
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
   * Removes the song from any collection; drops empty collections.
   */
  deleteSong(id) {
    deleteFromStorage(id)
    const newIndex = get().index.filter(e => e.id !== id)
    saveIndex(newIndex)

    let collections = get().collections
      .map(c => ({ ...c, songIds: c.songIds.filter(sid => sid !== id) }))
      .filter(c => c.songIds.length > 0)
    saveCollections(collections)

    const wasActive = get().activeSongId === id
    if (wasActive) clearLastSongId()
    set({
      index: newIndex,
      collections,
      ...(wasActive ? { activeSongId: null, activeSong: null } : {}),
    })
  },

  /**
   * Rename a collection.
   * When collectionId is '__uncategorized__', promotes the virtual uncategorized
   * group into a real persisted collection with the given name.
   */
  renameCollection(collectionId, newName) {
    const trimmed = newName.trim()
    if (!trimmed) return

    if (collectionId === '__uncategorized__') {
      const assignedIds = new Set(get().collections.flatMap(c => c.songIds))
      const uncategorizedIds = get().index.filter(e => !assignedIds.has(e.id)).map(e => e.id)
      if (uncategorizedIds.length === 0) return
      const newCollection = {
        id: uuidv4(),
        name: trimmed,
        createdAt: new Date().toISOString(),
        songIds: uncategorizedIds,
      }
      const collections = [...get().collections, newCollection]
      const index = get().index.map(e =>
        uncategorizedIds.includes(e.id) ? { ...e, collectionId: newCollection.id } : e
      )
      saveCollections(collections)
      saveIndex(index)
      set({ collections, index })
      return
    }

    const collections = get().collections.map(c =>
      c.id === collectionId ? { ...c, name: trimmed } : c
    )
    saveCollections(collections)
    set({ collections })
  },

  /**
   * Delete all songs in a collection and remove the collection itself.
   */
  deleteCollection(collectionId) {
    const collection = get().collections.find(c => c.id === collectionId)
    if (!collection) return

    const idsToDelete = new Set(collection.songIds)

    idsToDelete.forEach(id => deleteFromStorage(id))

    const newIndex = get().index.filter(e => !idsToDelete.has(e.id))
    saveIndex(newIndex)

    const newCollections = get().collections.filter(c => c.id !== collectionId)
    saveCollections(newCollections)

    const wasActive = idsToDelete.has(get().activeSongId)
    if (wasActive) clearLastSongId()

    set({
      index: newIndex,
      collections: newCollections,
      ...(wasActive ? { activeSongId: null, activeSong: null } : {}),
    })
  },

  /**
   * Replace an existing song (used for "overwrite" duplicate resolution).
   */
  replaceSong(id, newSong) {
    deleteFromStorage(id)
    // Preserve collectionId before removing from index
    const existingEntry = get().index.find(e => e.id === id)
    const collectionId = existingEntry?.collectionId ?? null
    // Remove from index first (addSongs will re-add and save final index)
    const filteredIndex = get().index.filter(e => e.id !== id)
    set({ index: filteredIndex })
    get().addSongs([{ ...newSong, id, _preservedCollectionId: collectionId }])
    // If this was the active song, refresh the in-memory view
    if (get().activeSongId === id) {
      get().selectSong(id)
    }
  },
}))
