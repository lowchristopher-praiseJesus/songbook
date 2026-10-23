import { updateShare } from './shareApi'
import { exportSongsAsSbp } from './exportSbp'
import { loadSong, getTransposeState } from './storage'
import { transposeChord } from './parser/chordUtils'

/**
 * Re-upload a shared collection's current contents to its existing link.
 *
 * Songs are always derived from the collection's current songIds so additions,
 * removals and reorders since the link was created are reflected, with each
 * song's saved transpose/capo baked in.
 *
 * Push Update rewrites the entire ZIP, so every ZIP-only field has to be
 * re-stamped here or the link loses it: the lyrics-only flag, and the
 * conductor code that makes the link offer the broadcast to new joiners.
 *
 * Callers are responsible for recording the push in the store (see
 * libraryStore.recordSharePush). Throws whatever updateShare throws — notably
 * an error with code 'locked' when the link is locked, and code 'stale' when
 * someone else has pushed since this collection's lastVersion (the caller
 * must Check for updates and merge before pushing again).
 *
 * @param {object} collection - collection with a shareCode
 * @param {{ name?: string, lyricsOnly?: boolean }} [options] - defaults to the
 *   collection's name and stored shareLyricsOnly flag
 * @returns {Promise<{ version: number, updatedAt?: string, locked?: boolean }>}
 */
export async function pushCollectionUpdate(collection, { name = collection.name, lyricsOnly = collection.shareLyricsOnly ?? false } = {}) {
  const songs = collection.songIds.map(id => {
    const song = loadSong(id)
    if (!song) return null
    const ts = getTransposeState(id)
    const delta = ts?.delta ?? 0
    const capo = ts?.capo ?? song.meta.capo ?? 0
    const usesFlats = song.meta.usesFlats ?? false
    const newKeyIndex = (((song.meta.keyIndex ?? 0) + delta) % 12 + 12) % 12
    const rawText = delta === 0
      ? (song.rawText ?? '')
      : (song.rawText ?? '').replace(/\[([^\]]+)\]/g, (_, chord) =>
          '[' + transposeChord(chord, delta, usesFlats) + ']'
        )
    return { ...song, rawText, meta: { ...song.meta, keyIndex: newKeyIndex, capo } }
  }).filter(Boolean)

  const conductorCode = collection.conductorEnded ? null : (collection.conductorCode ?? null)
  const blob = await exportSongsAsSbp(songs, name?.trim() || null, lyricsOnly, conductorCode)
  return updateShare(collection.shareCode, blob, collection.lastVersion ?? null)
}
