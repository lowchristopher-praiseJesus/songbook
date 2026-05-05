const WORKER_URL = import.meta.env.VITE_WORKER_URL

/**
 * Create an album on the worker. Returns { albumCode, creatorToken }.
 * @param {{ title: string, artist: string, tracks: Array<{trackId,title,duration,mimeType}>, coverFile?: File|null }} opts
 */
export async function createAlbum({ title, artist, tracks, coverFile }) {
  const form = new FormData()
  form.append('meta', JSON.stringify({ title, artist, tracks }))
  if (coverFile) form.append('cover', coverFile)

  const res = await fetch(`${WORKER_URL}/album`, { method: 'POST', body: form })
  if (!res.ok) throw Object.assign(new Error('create_failed'), { code: 'create_failed' })
  return res.json()
}

/**
 * Upload one audio track to an existing album.
 * @param {string} albumCode
 * @param {string} trackId
 * @param {ArrayBuffer} buffer
 * @param {string} mimeType
 * @param {string} creatorToken
 */
export async function uploadTrack(albumCode, trackId, buffer, mimeType, creatorToken) {
  const res = await fetch(`${WORKER_URL}/album/${albumCode}/track/${trackId}`, {
    method: 'POST',
    headers: { 'Content-Type': mimeType, 'X-Creator-Token': creatorToken },
    body: buffer,
  })
  if (!res.ok) throw Object.assign(new Error('upload_failed'), { code: 'upload_failed' })
}

/**
 * Fetch public album metadata (creatorToken is stripped by the worker).
 * @param {string} albumCode
 */
export async function fetchAlbumMeta(albumCode) {
  const res = await fetch(`${WORKER_URL}/album/${albumCode}`)
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' })
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' })
  return res.json()
}

/**
 * Return the streamable URL for an album track (used directly as <audio src>).
 * @param {string} albumCode
 * @param {string} trackId
 */
export function albumTrackUrl(albumCode, trackId) {
  return `${WORKER_URL}/album/${albumCode}/track/${trackId}`
}

/**
 * Return the URL for the album cover image.
 * @param {string} albumCode
 */
export function albumCoverUrl(albumCode) {
  return `${WORKER_URL}/album/${albumCode}/cover`
}

/**
 * Delete an album (all R2 objects). Requires the creator token.
 * @param {string} albumCode
 * @param {string} creatorToken
 */
export async function deleteAlbum(albumCode, creatorToken) {
  const res = await fetch(`${WORKER_URL}/album/${albumCode}`, {
    method: 'DELETE',
    headers: { 'X-Creator-Token': creatorToken },
  })
  if (!res.ok) throw Object.assign(new Error('delete_failed'), { code: 'delete_failed' })
}

// ── localStorage helpers for "my albums" ────────────────────────────────────

const ALBUMS_KEY = 'songsheet_albums'

export function saveAlbumLocally({ albumCode, creatorToken, title, artist }) {
  const existing = loadMyAlbums()
  const updated = [{ albumCode, creatorToken, title, artist, createdAt: new Date().toISOString() }, ...existing]
  localStorage.setItem(ALBUMS_KEY, JSON.stringify(updated))
}

export function loadMyAlbums() {
  try { return JSON.parse(localStorage.getItem(ALBUMS_KEY) ?? '[]') } catch { return [] }
}

export function removeAlbumLocally(albumCode) {
  const updated = loadMyAlbums().filter(a => a.albumCode !== albumCode)
  localStorage.setItem(ALBUMS_KEY, JSON.stringify(updated))
}
