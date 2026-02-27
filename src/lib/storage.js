const PREFIX = 'songsheet_song_'
const INDEX_KEY = 'songsheet_index'
const THEME_KEY = 'songsheet_theme'
const LAST_SONG_KEY = 'songsheet_last_song_id'
const TRANSPOSE_PREFIX = 'songsheet_transpose_'

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
 * Returns estimated storage usage for all songsheet_ keys.
 * Uses 2 bytes/char approximation (UTF-16 encoding).
 */
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
