import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import {
  saveSong, loadSong, deleteSong as deleteFromStorage,
  loadIndex, saveIndex, getLastSongId, setLastSongId, clearLastSongId,
  loadCollections, saveCollections, getViewMode, saveViewMode,
} from '../lib/storage'
import { parseContent } from '../lib/parser/contentParser'

export const useLibraryStore = create((set, get) => ({
  // State
  index: [],           // [{id, title, artist, importedAt}]
  collections: [],     // [{id, name, createdAt, songIds}]
  activeSongId: null,
  activeSong: null,    // Full song object (loaded from localStorage)
  editingSongId: null, // id of the song currently being edited, or null
  isExportMode: false,
  selectedSongIds: new Set(), // Set<id> of songs checked for export
  viewMode: 'collections',   // 'collections' | 'allSongs'

  /**
   * Initialize from localStorage on app start.
   * Repairs the index by removing entries whose song data is missing and stripping legacy collectionId field.
   * Repairs collections by removing stale songIds, but preserves empty collections.
   */
  init() {
    const rawIndex = loadIndex()
    const lastId = getLastSongId()

    // Repair: remove index entries with missing data, strip legacy collectionId field
    const validIdsSet = new Set()
    const validIndex = rawIndex
      .filter(entry => loadSong(entry.id) !== null)
      .map(({ collectionId: _dropped, ...rest }) => rest)
    validIndex.forEach(e => validIdsSet.add(e.id))

    if (validIndex.length !== rawIndex.length || rawIndex.some(e => 'collectionId' in e)) {
      saveIndex(validIndex)
    }

    // Repair collections: remove stale songIds, but keep empty collections
    let collections = loadCollections()
    let collectionsChanged = false
    collections = collections.map(c => {
      const filtered = c.songIds.filter(id => validIdsSet.has(id))
      if (filtered.length !== c.songIds.length) collectionsChanged = true
      return { ...c, songIds: filtered }
    })
    if (collectionsChanged) saveCollections(collections)

    const activeSong = lastId ? loadSong(lastId) : null

    set({
      index: validIndex,
      collections,
      activeSongId: activeSong ? activeSong.id : null,
      activeSong,
      viewMode: getViewMode(),
    })
  },

  /**
   * Add one or more songs to the library.
   * Songs without an id get a new UUID assigned.
   * Maintains alphabetical sort order on the index.
   * If collectionName is provided, creates a new collection for these songs.
   * If collectionSource is also provided, looks for an existing collection with
   * that source tag first and adds to it rather than creating a duplicate.
   */
  addSongs(songs, collectionName = null, collectionSource = null) {
    const currentIndex = [...get().index]
    const currentCollections = [...get().collections]
    const newSongIds = []

    // Find an existing collection by source tag (e.g. 'ug') to avoid duplicates
    const sourceCollection = collectionSource
      ? currentCollections.find(c => c.source === collectionSource)
      : null

    for (const rawSong of songs) {
      const song = { ...rawSong }
      if (!song.id) song.id = uuidv4()
      if (!song.importedAt) song.importedAt = new Date().toISOString()

      saveSong(song)  // may throw QuotaExceededError — intentionally not caught here

      const existingIdx = currentIndex.findIndex(e => e.id === song.id)

      const entry = {
        id: song.id,
        title: song.meta.title,
        artist: song.meta.artist ?? '',
        importedAt: song.importedAt,
      }

      if (existingIdx >= 0) {
        currentIndex[existingIdx] = entry
      } else {
        currentIndex.push(entry)
        newSongIds.push(song.id)
      }
    }

    if ((collectionName || collectionSource) && newSongIds.length > 0) {
      if (sourceCollection) {
        // Add new songs to the existing source-tagged collection
        const updated = { ...sourceCollection, songIds: [...sourceCollection.songIds, ...newSongIds] }
        const cIdx = currentCollections.findIndex(c => c.id === sourceCollection.id)
        currentCollections[cIdx] = updated
      } else {
        // Create a new collection (optionally tagged with source)
        const newCollection = {
          id: uuidv4(),
          name: collectionName,
          createdAt: new Date().toISOString(),
          songIds: newSongIds,
          ...(collectionSource ? { source: collectionSource } : {}),
        }
        currentCollections.push(newCollection)
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
    set({ activeSongId: id, activeSong: song, editingSongId: null })
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
      saveCollections(collections)
      set({ collections })
      return
    }

    const collections = get().collections.map(c =>
      c.id === collectionId ? { ...c, name: trimmed } : c
    )
    saveCollections(collections)
    set({ collections })
  },

  /**
   * Remove a collection without deleting its songs.
   * Songs remain in the library; membership is purely tracked via collections[j].songIds.
   */
  deleteCollection(collectionId) {
    if (!get().collections.some(c => c.id === collectionId)) return
    const newCollections = get().collections.filter(c => c.id !== collectionId)
    saveCollections(newCollections)
    set({ collections: newCollections })
  },

  /**
   * Remove a song from a specific collection without deleting it from the library.
   * Drops the collection if it becomes empty.
   */
  removeSongFromCollection(songId, collectionId) {
    const collections = get().collections
      .map(c => c.id === collectionId
        ? { ...c, songIds: c.songIds.filter(id => id !== songId) }
        : c
      )
      .filter(c => c.songIds.length > 0)
    saveCollections(collections)
    set({ collections })
  },

  /**
   * Set or clear the song currently being edited.
   */
  setEditingSongId(id) {
    set({ editingSongId: id })
  },

  /**
   * Update an existing song's metadata and content.
   * Re-parses sections from rawText and derives keyIndex/usesFlats from the key name.
   * Updates localStorage, the in-memory index, and refreshes activeSong if needed.
   */
  updateSong(id, { meta, rawText }) {
    const song = loadSong(id)
    if (!song) return

    const KEY_TO_INDEX = {
      C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
      E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
      Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
    }
    const FLAT_KEY_NAMES = new Set(['Db', 'Eb', 'F', 'Ab', 'Bb'])

    const keyIndex = KEY_TO_INDEX[meta.key] ?? song.meta.keyIndex
    const usesFlats = FLAT_KEY_NAMES.has(meta.key)
    const sections = parseContent(rawText)

    const updatedSong = {
      ...song,
      rawText,
      meta: { ...song.meta, ...meta, keyIndex, usesFlats },
      sections,
    }

    saveSong(updatedSong)

    const newIndex = get().index.map(e =>
      e.id === id
        ? { ...e, title: meta.title ?? e.title, artist: meta.artist ?? e.artist }
        : e
    )
    saveIndex(newIndex)

    set({
      index: newIndex,
      ...(get().activeSongId === id ? { activeSong: updatedSong } : {}),
    })
  },

  /** Enter or exit export mode. Clears selection when exiting. */
  toggleExportMode() {
    set(s => ({ isExportMode: !s.isExportMode, selectedSongIds: new Set() }))
  },

  /** Toggle a single song in/out of the export selection. */
  toggleSongSelection(id) {
    set(s => {
      const next = new Set(s.selectedSongIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedSongIds: next }
    })
  },

  /**
   * Toggle all/none for a group of song IDs.
   * If every id is already selected, deselects them all; otherwise selects all.
   */
  toggleGroupSelection(songIds) {
    set(s => {
      const allSelected = songIds.length > 0 && songIds.every(id => s.selectedSongIds.has(id))
      const next = new Set(s.selectedSongIds)
      if (allSelected) {
        songIds.forEach(id => next.delete(id))
      } else {
        songIds.forEach(id => next.add(id))
      }
      return { selectedSongIds: next }
    })
  },

  /** Switch between 'collections' and 'allSongs' view modes. Persists to localStorage. */
  setViewMode(mode) {
    saveViewMode(mode)
    set({ viewMode: mode })
  },

  /** Create a new empty collection with the given name. No-op if name is blank. */
  createCollection(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const newCollection = {
      id: uuidv4(),
      name: trimmed,
      createdAt: new Date().toISOString(),
      songIds: [],
    }
    const collections = [...get().collections, newCollection]
    saveCollections(collections)
    set({ collections })
  },

  /**
   * Replace the songIds array on a collection.
   * Used by AddSongsModal to apply the user's checked selection.
   */
  setCollectionSongs(collectionId, songIds) {
    if (!get().collections.some(c => c.id === collectionId)) return
    const collections = get().collections.map(c =>
      c.id === collectionId ? { ...c, songIds } : c
    )
    saveCollections(collections)
    set({ collections })
  },

  /**
   * Replace an existing song (used for "overwrite" duplicate resolution).
   * The same song ID is reused so all collections retain their membership automatically.
   */
  replaceSong(id, newSong) {
    deleteFromStorage(id)
    const filteredIndex = get().index.filter(e => e.id !== id)
    set({ index: filteredIndex })
    get().addSongs([{ ...newSong, id }])
    if (get().activeSongId === id) {
      get().selectSong(id)
    }
  },
}))
