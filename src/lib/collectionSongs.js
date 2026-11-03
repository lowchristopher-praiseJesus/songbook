/**
 * Song ids in the given collection that appear in no other collection —
 * i.e. the songs that deleteCollection(id, { deleteSongs: true }) would remove.
 */
export function songsOnlyInCollection(collections, collectionId) {
  const target = collections.find(c => c.id === collectionId)
  if (!target) return []
  const elsewhere = new Set(collections.filter(c => c.id !== collectionId).flatMap(c => c.songIds))
  return target.songIds.filter(id => !elsewhere.has(id))
}
