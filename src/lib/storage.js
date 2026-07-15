const PREFIX = 'songsheet_song_'
const INDEX_KEY = 'songsheet_index'
const THEME_KEY = 'songsheet_theme'
const LAST_SONG_KEY = 'songsheet_last_song_id'
const TRANSPOSE_PREFIX = 'songsheet_transpose_'
const ANNOTATION_PREFIX = 'songsheet_annotations_'
const COLLECTIONS_KEY = 'songsheet_collections'
const FIRECRAWL_KEY = 'songsheet_firecrawl_key'
const VIEW_MODE_KEY = 'songsheet_view_mode'

/**
 * Save a song to localStorage. Throws QuotaExceededError if storage is full.
 */
export function saveSong(song) {
  localStorage.setItem(PREFIX + song.id, JSON.stringify(song))
}

export function loadSong(id) {
  const raw = localStorage.getItem(PREFIX + id)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function deleteSong(id) {
  localStorage.removeItem(PREFIX + id)
}

export function loadIndex() {
  const raw = localStorage.getItem(INDEX_KEY)
  if (raw === null) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function saveIndex(index) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

export function getTheme() {
  return localStorage.getItem(THEME_KEY)
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
}

export function getLastSongId() {
  return localStorage.getItem(LAST_SONG_KEY)
}

export function setLastSongId(id) {
  localStorage.setItem(LAST_SONG_KEY, id)
}

export function clearLastSongId() {
  localStorage.removeItem(LAST_SONG_KEY)
}

export function getTransposeState(songId) {
  const raw = localStorage.getItem(TRANSPOSE_PREFIX + songId)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setTransposeState(songId, state) {
  localStorage.setItem(TRANSPOSE_PREFIX + songId, JSON.stringify(state))
}

/**
 * Annotation shape: { baseline: { fontSize, columns, width, height } | null,
 *   layers: [{ visible, strokes: [{ id, color, width, points: [{x, y, pressure}] }] }],
 *   activeLayer }
 */
export function getAnnotations(songId) {
  const raw = localStorage.getItem(ANNOTATION_PREFIX + songId)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setAnnotations(songId, data) {
  localStorage.setItem(ANNOTATION_PREFIX + songId, JSON.stringify(data))
}

export function deleteAnnotations(songId) {
  localStorage.removeItem(ANNOTATION_PREFIX + songId)
}

/**
 * Load all collections from localStorage.
 * Collection shape: { id, name, createdAt, songIds, source?,
 *   shareCode?,        ← opaque share token the collection was imported from
 *   conductorCode?, conductorRole?, conductorDirectorToken?, conductorToken?,
 *   conductorShareCode?, conductorBroadcastTime?, conductorCreatedAt?,
 *   conductorExpiresAt?, conductorEnded?,
 *   communityPublicationId?, communityPublishToken?  ← set when listed in the Community pool }
 */
export function loadCollections() {
  const raw = localStorage.getItem(COLLECTIONS_KEY)
  if (raw === null) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function saveCollections(cols) {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(cols))
}

export function getStorageStats() {
  let usedBytes = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('songsheet_')) {
      const value = localStorage.getItem(key) ?? ''
      usedBytes += (key.length + value.length) * 2
    }
  }
  return { usedBytes, limitBytes: 5 * 1024 * 1024 }
}

export const getFirecrawlKey = () => localStorage.getItem(FIRECRAWL_KEY) ?? ''
export const setFirecrawlKey = (key) => key
  ? localStorage.setItem(FIRECRAWL_KEY, key)
  : localStorage.removeItem(FIRECRAWL_KEY)

export function getViewMode() {
  const val = localStorage.getItem(VIEW_MODE_KEY)
  return val === 'allSongs' ? 'allSongs' : 'collections'
}

export function saveViewMode(mode) {
  localStorage.setItem(VIEW_MODE_KEY, mode)
}

const SESSION_HISTORY_KEY = 'songsheet_sessions'

export function loadSessionHistory() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_HISTORY_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveSessionHistory({ code, leaderToken, name }) {
  const history = loadSessionHistory().filter(s => s.code !== code)
  history.unshift({ code, leaderToken: leaderToken ?? null, name, joinedAt: new Date().toISOString() })
  localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(history.slice(0, 10)))
}

export function removeSessionFromHistory(code) {
  const history = loadSessionHistory().filter(s => s.code !== code)
  localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(history))
}
