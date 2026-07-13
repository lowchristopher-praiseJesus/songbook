import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import {
  saveSong, loadSong, deleteSong as deleteFromStorage,
  loadIndex, saveIndex, getLastSongId, setLastSongId, clearLastSongId,
  loadCollections, saveCollections, getViewMode, saveViewMode,
  getTransposeState, setTransposeState,
} from '../lib/storage'
import { parseContent } from '../lib/parser/contentParser'
import { resolveSaveAsTitle } from '../lib/saveAsTitle'
import { loadMyAlbums } from '../lib/albumApi'

const KEY_TO_INDEX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}
const FLAT_KEY_NAMES = new Set(['Db', 'Eb', 'F', 'Ab', 'Bb'])

export const useLibraryStore = create((set, get) => ({
  // State
  index: [],           // [{id, title, artist, importedAt}]
  collections: [],     // [{id, name, createdAt, songIds}]
  activeSongId: null,
  activeSong: null,    // Full song object (loaded from localStorage)
  editingSongId: null, // id of the song currently being edited, or null
  isCreatingNewSong: false,
  isExportMode: false,
  selectedSongIds: new Set(), // Set<id> of songs checked for export
  viewMode: 'collections',   // 'collections' | 'allSongs' | 'albums'
  expandedCollectionId: null, // string | null — drives CollectionGroup auto-expand
  activeCollectionId: null,   // string | null — collection the user last navigated from
  albums: [],                 // [{albumCode, creatorToken, title, artist, createdAt, tracks}]
  activeAlbumCode: null,      // string | null
  isCreatingNewAlbum: false,
  editingAlbum: null,             // album object being edited, or null
  selectedCollectionId: null,   // string | null — collection whose detail view is open in main content
  highlightedCollectionId: null, // string | null — collection card highlighted in sidebar (persists after Back)
  isCreatingNewCollection: false,

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

    // Conductor role migration: assign conductorRole to legacy records that predate the field
    let conductorMigrated = false
    collections = collections.map(c => {
      if (c.conductorCode && !c.conductorRole) {
        conductorMigrated = true
        return {
          ...c,
          conductorRole: c.conductorDirectorToken ? 'conductor' : 'follower',
        }
      }
      return c
    })
    if (conductorMigrated) saveCollections(collections)

    const activeSong = lastId ? loadSong(lastId) : null

    set({
      index: validIndex,
      collections,
      activeSongId: activeSong ? activeSong.id : null,
      activeSong,
      viewMode: getViewMode(),
      albums: loadMyAlbums(),
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
  addSongs(songs, collectionName = null, collectionSource = null, shareCode = null, initialVersion = null) {
    const currentIndex = [...get().index]
    const currentCollections = [...get().collections]
    const newSongIds = []
    let resultCollectionId = null

    // Find an existing collection by source tag (e.g. 'ug') to avoid duplicates
    const sourceCollection = collectionSource
      ? currentCollections.find(c => c.source === collectionSource)
      : null

    for (const rawSong of songs) {
      const song = { ...rawSong }
      if (!song.id) song.id = uuidv4()
      if (!song.importedAt) song.importedAt = new Date().toISOString()

      // Set sharedBaseline when importing from a share link
      if (shareCode && song.meta.sbpId != null) {
        song.meta = {
          ...song.meta,
          sharedBaseline: {
            title:    song.meta.title ?? '',
            artist:   song.meta.artist ?? '',
            rawText:  song.rawText,
            keyIndex: song.meta.keyIndex ?? 0,
            key:      song.meta.key ?? '',
            capo:     song.meta.capo ?? 0,
            tempo:    song.meta.tempo,  // preserve undefined — must match buildBaseline exactly
          },
        }
      }

      saveSong(song)  // may throw QuotaExceededError — intentionally not caught here

      const existingIdx = currentIndex.findIndex(e => e.id === song.id)

      const entry = {
        id: song.id,
        title: song.meta.title,
        artist: song.meta.artist ?? '',
        importedAt: song.importedAt,
        ...(song.meta.sbpId != null ? { sbpId: song.meta.sbpId } : {}),
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
        resultCollectionId = sourceCollection.id
      } else {
        // Create a new collection (optionally tagged with source)
        const newCollection = {
          id: uuidv4(),
          name: collectionName,
          createdAt: new Date().toISOString(),
          songIds: newSongIds,
          ...(collectionSource ? { source: collectionSource } : {}),
          ...(shareCode ? { shareCode } : {}),
          ...(shareCode && initialVersion != null ? { lastVersion: initialVersion } : {}),
        }
        currentCollections.push(newCollection)
        resultCollectionId = newCollection.id
      }
      saveCollections(currentCollections)
    }

    currentIndex.sort((a, b) => a.title.localeCompare(b.title))
    saveIndex(currentIndex)
    set({ index: currentIndex, collections: currentCollections })

    return { newSongIds, collectionId: resultCollectionId }
  },

  /**
   * Set the active (displayed) song.
   * Pass collectionId to scope swipe navigation to that collection.
   * Pass null to clear collection scope (e.g. selecting from All Songs).
   * Omit (undefined) to preserve current collection scope (e.g. swipe navigation).
   */
  selectSong(id, collectionId = undefined) {
    const song = loadSong(id)
    if (!song) return
    setLastSongId(id)
    const collectionUpdate = collectionId !== undefined ? { activeCollectionId: collectionId } : {}
    set({ activeSongId: id, activeSong: song, editingSongId: null, isCreatingNewSong: false, activeAlbumCode: null, ...collectionUpdate })
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
      .filter(c => c.songIds.length > 0 || c.conductorCode)
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
    const collections = get().collections.map(c =>
      c.id === collectionId
        ? { ...c, songIds: c.songIds.filter(id => id !== songId) }
        : c
    )
    saveCollections(collections)
    set({ collections })
  },

  /**
   * Add a song to a collection's songIds if not already present.
   */
  addSongToCollection(songId, collectionId) {
    const collections = get().collections.map(c =>
      c.id === collectionId && !c.songIds.includes(songId)
        ? { ...c, songIds: [...c.songIds, songId] }
        : c
    )
    saveCollections(collections)
    set({ collections })
  },

  /**
   * Set or clear the song currently being edited.
   */
  setEditingSongId(id) {
    set({ editingSongId: id })
  },

  setIsCreatingNewSong(val) {
    set({ isCreatingNewSong: val })
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

    const rawTextChanged = rawText !== song.rawText

    const updatedSong = {
      ...song,
      rawText,
      meta: {
        ...song.meta,
        ...meta,
        keyIndex,
        usesFlats,
        // If the user edited the content, discard the cached original SBP content so
        // exportSbp falls back to rawText rather than silently shipping the old version.
        ...(rawTextChanged ? { sbpOriginalContent: null } : {}),
      },
      sections,
    }

    saveSong(updatedSong)

    // If the editor saved a new capo, keep the transpose state in sync so that
    // loadSongsWithTranspose (used by Share/export) sees the updated value.
    // Only update when capo actually changed — don't clobber a widget-set value
    // if the user just edited lyrics without touching the capo field.
    const newCapo = meta.capo ?? 0
    if (newCapo !== (song.meta.capo ?? 0)) {
      const ts = getTransposeState(id)
      setTransposeState(id, { delta: ts?.delta ?? 0, capo: newCapo })
    }

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

  /**
   * Save the editor's current content as a NEW song, leaving the original
   * untouched. If the user did not rename the song, a numeric suffix is appended
   * (e.g. "Amazing Grace" -> "Amazing Grace 1") so the copy's title differs from
   * the original and from any existing library song.
   *
   * Returns the new song's id (or null if the original could not be found).
   */
  saveAsNewSong(id, { meta, rawText }) {
    const original = loadSong(id)
    if (!original) return null

    const existingTitles = get().index.map(e => e.title)
    const newTitle = resolveSaveAsTitle(original.meta.title, meta.title, existingTitles)

    const keyIndex = KEY_TO_INDEX[meta.key] ?? original.meta.keyIndex ?? 0
    const usesFlats = FLAT_KEY_NAMES.has(meta.key)
    const sections = parseContent(rawText)

    // Strip sharing-specific fields so the copy is a standalone song, not tied
    // to the original's share baseline or SBP id.
    const { sbpId, sharedBaseline, ...cleanMeta } = meta

    const newSong = {
      rawText,
      meta: {
        ...cleanMeta,
        title: newTitle,
        keyIndex,
        usesFlats,
      },
      sections,
    }

    const { newSongIds } = get().addSongs([newSong])
    return newSongIds[0] ?? null
  },

  /** Enter or exit export mode. Clears selection when exiting. */
  toggleExportMode() {
    set(s => ({ isExportMode: !s.isExportMode, selectedSongIds: new Set(), selectedCollectionId: null, highlightedCollectionId: null }))
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
    set({ viewMode: mode, isCreatingNewAlbum: false, isCreatingNewCollection: false, ...(mode !== 'albums' ? { activeAlbumCode: null } : {}), activeCollectionId: null, selectedCollectionId: null, highlightedCollectionId: null })
  },

  /** Set which collection should auto-expand (e.g. after import). */
  setExpandedCollectionId(id) {
    set({ expandedCollectionId: id })
  },

  setActiveAlbumCode(code) {
    set({ activeAlbumCode: code })
  },

  setSelectedCollectionId(id) {
    set({ selectedCollectionId: id, ...(id !== null ? { highlightedCollectionId: id } : {}) })
  },

  setIsCreatingNewCollection(val) {
    set({
      isCreatingNewCollection: val,
      ...(val ? { selectedCollectionId: null, activeSongId: null, activeSong: null, editingSongId: null, isCreatingNewSong: false, isCreatingNewAlbum: false, activeAlbumCode: null } : {}),
    })
  },

  syncAlbums() {
    set({ albums: loadMyAlbums() })
  },

  setEditingAlbum(album) {
    // Sets edit mode without clearing activeAlbumCode — cancel returns to detail view
    set({ editingAlbum: album, isCreatingNewAlbum: true })
  },

  setIsCreatingNewAlbum(val) {
    set({
      isCreatingNewAlbum: val,
      editingAlbum: null,
      ...(val ? { activeSongId: null, activeSong: null, activeAlbumCode: null, editingSongId: null, isCreatingNewSong: false } : {}),
    })
  },

  /** Create a new empty collection with the given name. Returns the new id, or null if name is blank. */
  createCollection(name) {
    const trimmed = name.trim()
    if (!trimmed) return null
    const newCollection = {
      id: uuidv4(),
      name: trimmed,
      createdAt: new Date().toISOString(),
      songIds: [],
    }
    const collections = [...get().collections, newCollection]
    saveCollections(collections)
    set({ collections })
    return newCollection.id
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

  /**
   * Assign a stable sbpId to a song that was created in-app (no sbpId yet).
   * Called after share export so conductor sync can track the active song.
   * No-op if the song already has sbpId.
   */
  backfillSongSbpId(songId, sbpId) {
    const song = loadSong(songId)
    if (!song || song.meta.sbpId != null) return
    const updated = { ...song, meta: { ...song.meta, sbpId } }
    saveSong(updated)
    const newIndex = get().index.map(e =>
      e.id === songId ? { ...e, sbpId } : e
    )
    saveIndex(newIndex)
    set({
      index: newIndex,
      ...(get().activeSongId === songId ? { activeSong: updated } : {}),
    })
  },

  /**
   * Persist the user's chosen YouTube video for a song, so reopening the
   * in-app YouTube search jumps straight to playback instead of a fresh search.
   */
  setSongYoutubeVideo(id, videoId) {
    const song = loadSong(id)
    if (!song) return
    const updated = { ...song, meta: { ...song.meta, youtubeVideoId: videoId } }
    saveSong(updated)
    if (get().activeSongId === id) {
      set({ activeSong: updated })
    }
  },

  /**
   * Stamp sharedBaseline on a song from its current localStorage state.
   * Called after creating or pushing a share so the sharer can receive
   * updates pushed by recipients via the 3-way merge.
   */
  stampSharedBaseline(songId) {
    const song = loadSong(songId)
    if (!song || !song.meta.sbpId) return
    saveSong({
      ...song,
      meta: {
        ...song.meta,
        sharedBaseline: {
          title:    song.meta.title    ?? '',
          artist:   song.meta.artist   ?? '',
          rawText:  song.rawText,
          keyIndex: song.meta.keyIndex ?? 0,
          key:      song.meta.key      ?? '',
          capo:     song.meta.capo     ?? 0,
          tempo:    song.meta.tempo,
        },
      },
    })
  },

  /**
   * Merge arbitrary fields into an existing collection.
   * Used to attach conductor-mode fields (e.g. conductorCode, conductorDirectorToken)
   * after importing a conductor-enabled share.
   */
  updateCollection(collectionId, updates) {
    const collections = get().collections.map(c =>
      c.id === collectionId ? { ...c, ...updates } : c
    )
    saveCollections(collections)
    set({ collections })
  },

  applyShareRefresh(collectionId, { patches, newSongs, removed, serverSbpIdOrder, newVersion }) {
    const state = get()
    const collection = state.collections.find(c => c.id === collectionId)
    if (!collection) return

    // Apply patches to existing songs
    let newIndex = [...state.index]
    for (const patch of patches) {
      const song = loadSong(patch.localId)
      if (!song) continue
      const updatedSong = {
        ...song,
        ...(patch.rawText !== undefined
          ? { rawText: patch.rawText, sections: parseContent(patch.rawText) }
          : {}),
        meta: {
          ...song.meta,
          ...patch.metaUpdates,
          sharedBaseline: patch.newBaseline,
          // If the patch updated rawText, discard the cached original SBP content so
          // exportSbp uses the new rawText rather than silently shipping the old version.
          ...(patch.rawText !== undefined ? { sbpOriginalContent: null } : {}),
        },
      }
      saveSong(updatedSong)
      if (state.activeSongId === patch.localId) {
        set({ activeSong: updatedSong })
      }
      // Keep index in sync when title or artist changes
      if (patch.metaUpdates.title !== undefined || patch.metaUpdates.artist !== undefined) {
        const idx = newIndex.findIndex(e => e.id === patch.localId)
        if (idx >= 0) {
          newIndex[idx] = {
            ...newIndex[idx],
            ...(patch.metaUpdates.title  !== undefined ? { title:  patch.metaUpdates.title  } : {}),
            ...(patch.metaUpdates.artist !== undefined ? { artist: patch.metaUpdates.artist } : {}),
          }
        }
      }
    }

    // Add new songs from server
    const addedIds = []
    for (const newSong of newSongs) {
      // If a song with this sbpId already exists in the library (e.g. the creator
      // previously removed it from the collection), re-add that existing song rather
      // than creating a duplicate with a new UUID.
      const sbpId = newSong.meta?.sbpId
      const existingEntry = sbpId != null ? newIndex.find(e => e.sbpId === sbpId) : null

      if (existingEntry) {
        // Re-use the existing library song — just add it back to the collection.
        // Only push to addedIds if it's not already in the collection's songIds.
        if (!collection.songIds.includes(existingEntry.id)) {
          addedIds.push(existingEntry.id)
        }
        // Stamp the updated sharedBaseline so future refreshes work correctly.
        const existing = loadSong(existingEntry.id)
        if (existing) {
          saveSong({ ...existing, meta: { ...existing.meta, sharedBaseline: newSong.meta.sharedBaseline } })
        }
      } else {
        const id = newSong.id ?? uuidv4()
        const song = { ...newSong, id, importedAt: new Date().toISOString() }
        saveSong(song)
        newIndex.push({ id, title: song.meta.title, artist: song.meta.artist ?? '', importedAt: song.importedAt })
        addedIds.push(id)
      }
    }
    newIndex.sort((a, b) => a.title.localeCompare(b.title))
    saveIndex(newIndex)

    // Build new songIds: server order first, then unordered new songs, then manually-added songs
    const allSongIds = [...collection.songIds, ...addedIds].filter(id => !removed.includes(id))

    // Cache song objects to avoid repeated localStorage reads
    const songCache = new Map()
    for (const id of allSongIds) {
      songCache.set(id, loadSong(id))
    }

    const sbpIdToLocalId = new Map()
    for (const id of allSongIds) {
      const s = songCache.get(id)
      if (s?.meta?.sbpId) sbpIdToLocalId.set(s.meta.sbpId, id)
    }

    const orderedIds = serverSbpIdOrder
      .map(sbpId => sbpIdToLocalId.get(sbpId))
      .filter(Boolean)

    const orderedSet = new Set(orderedIds)

    const manualIds = allSongIds.filter(id => {
      const s = songCache.get(id)
      return !s?.meta?.sharedBaseline && !orderedSet.has(id)
    })

    // Newly-added songs from server that aren't in orderedIds
    // (can happen if serverSbpIdOrder is empty or doesn't include all new songs)
    const unorderedNewIds = addedIds.filter(id => !orderedSet.has(id))

    const newSongIds = [...new Set([...orderedIds, ...unorderedNewIds, ...manualIds])]

    const newCollections = state.collections.map(c =>
      c.id === collectionId
        ? { ...c, songIds: newSongIds, lastVersion: newVersion }
        : c
    )
    saveCollections(newCollections)
    set({ index: newIndex, collections: newCollections })
  },

  /**
   * Strip all conductor broadcast fields from a collection, leaving its songs intact.
   * Used by "Forget broadcast" in BroadcastsPanel.
   */
  clearBroadcastFields(collectionId) {
    const collections = get().collections.map(c => {
      if (c.id !== collectionId) return c
      const {
        conductorCode: _cc,
        conductorDirectorToken: _cdt,
        conductorToken: _ct,
        conductorBroadcastTime: _cbt,
        conductorRole: _cr,
        conductorShareCode: _csc,
        conductorCreatedAt: _cca,
        conductorExpiresAt: _cea,
        conductorEnded: _ce,
        ...rest
      } = c
      return rest
    })
    saveCollections(collections)
    set({ collections })
  },

  /**
   * Duplicate a collection by inserting a new collection with the same songIds
   * immediately after the source collection in the list.
   */
  duplicateCollection(sourceId, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const collections = get().collections
    const sourceIndex = collections.findIndex(c => c.id === sourceId)
    if (sourceIndex === -1) return
    const source = collections[sourceIndex]
    const newCollection = {
      id: uuidv4(),
      name: trimmed,
      createdAt: new Date().toISOString(),
      songIds: [...source.songIds],
    }
    const next = [
      ...collections.slice(0, sourceIndex + 1),
      newCollection,
      ...collections.slice(sourceIndex + 1),
    ]
    saveCollections(next)
    set({ collections: next })
    return newCollection.id
  },
}))
