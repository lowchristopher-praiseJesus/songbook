export function buildGroups(index, collections) {
  const byId = new Map(index.map(e => [e.id, e]))
  const groups = collections.map(c => ({
    id: c.id,
    name: c.name,
    entries: c.songIds.map(id => byId.get(id)).filter(Boolean),
  }))
  const assignedIds = new Set(collections.flatMap(c => c.songIds))
  const uncategorized = index.filter(e => !assignedIds.has(e.id))
  if (uncategorized.length > 0) {
    groups.unshift({ id: '__uncategorized__', name: 'Uncategorized', entries: uncategorized })
  }
  return groups
}

/**
 * Returns a flat ordered array of song entries for prev/next navigation.
 * In 'allSongs' mode: sorted A-Z by title.
 * In 'collections' mode: follows collection order via buildGroups.
 */
export function buildNavOrder(index, collections, viewMode) {
  if (viewMode === 'allSongs') {
    return [...index].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    )
  }
  return buildGroups(index, collections).flatMap(g => g.entries)
}
