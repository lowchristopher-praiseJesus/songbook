export function buildGroups(index, collections) {
  const byId = new Map(index.map(e => [e.id, e]))
  const groups = collections.map(c => ({
    id: c.id,
    name: c.name,
    entries: c.songIds.map(id => byId.get(id)).filter(Boolean),
  }))
  return groups
}

/**
 * Returns a flat ordered array of song entries for prev/next navigation.
 * In 'allSongs' mode: sorted A-Z by title.
 * In 'collections' mode with an activeCollectionId: scoped to that collection only.
 * In 'collections' mode without activeCollectionId: all collections flattened.
 */
export function buildNavOrder(index, collections, viewMode, activeCollectionId = null) {
  if (viewMode === 'allSongs') {
    return [...index].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    )
  }
  const groups = buildGroups(index, collections)
  if (viewMode === 'collections' && activeCollectionId) {
    const group = groups.find(g => g.id === activeCollectionId)
    return group?.entries ?? []
  }
  return groups.flatMap(g => g.entries)
}
