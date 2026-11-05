import { useLibraryStore } from '../store/libraryStore'
import { fetchAndParseSong } from './ugImport/fetchSong'
import { recordCommunityImport } from './communityImport/communityClient'
import { findLibraryMatch } from './addSongsToSet'

/**
 * Create a collection named `name` holding the theme picks, in pick order.
 *
 * A pick whose title is already in the library reuses that copy (the user's key and edits,
 * no duplicate, no import counter) — the same rule as AddSongsModal. Every other pick is
 * downloaded from the Community before anything is written, so a total failure leaves the
 * library untouched. Partial failures still create the collection and are reported by title.
 */
export async function createCollectionFromPicks(name, picks) {
  const store = useLibraryStore.getState()
  const index = store.index

  const resolved = await Promise.allSettled(picks.map(async p => {
    const match = findLibraryMatch(index, p.title)
    if (match) return { pick: p, libraryId: match.id }
    return { pick: p, song: await fetchAndParseSong({ source: 'community', id: p.id }) }
  }))

  const ok = []
  const failedTitles = []
  resolved.forEach((r, i) => {
    if (r.status === 'fulfilled') ok.push(r.value)
    else failedTitles.push(picks[i].title)
  })
  if (ok.length === 0) return { collectionId: null, failedTitles }

  const toImport = ok.filter(r => r.song)
  if (toImport.length > 0) {
    const { newSongIds } = store.addSongs(toImport.map(r => r.song), 'Community', 'community')
    toImport.forEach((r, i) => { r.libraryId = newSongIds[i] })
    toImport.forEach(r => recordCommunityImport(r.pick.id))
  }

  const collectionId = useLibraryStore.getState().createCollection(name)
  useLibraryStore.getState().setCollectionSongs(collectionId, ok.map(r => r.libraryId))
  return { collectionId, failedTitles }
}
