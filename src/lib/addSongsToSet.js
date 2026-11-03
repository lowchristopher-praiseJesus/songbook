// Helpers for the collection "Add songs" dialog.

/**
 * Insert one song into a collection's ordered songIds.
 *
 * `anchor` is where the next song goes: 'end', 'start', or the id of the song
 * to insert after. The returned anchor is what the following add should use,
 * so several adds in a row keep the order they were added in.
 */
export function insertIntoSet(songIds, songId, anchor) {
  if (songIds.includes(songId)) return { songIds, anchor }
  if (anchor === 'start') {
    return { songIds: [songId, ...songIds], anchor: songId }
  }
  const idx = anchor === 'end' ? -1 : songIds.indexOf(anchor)
  if (idx === -1) {
    return { songIds: [...songIds, songId], anchor: 'end' }
  }
  const next = [...songIds]
  next.splice(idx + 1, 0, songId)
  return { songIds: next, anchor: songId }
}

/** Strip Ultimate Guitar's " Chords ver. N" / " Chords by Artist" title suffixes. */
export function displayTitle(title) {
  return (title ?? '')
    .replace(/\s+[Cc]hords?\s+ver\.\s*\d+.*$/g, '')
    .replace(/\s+[Cc]hords?\s+by\s+.*$/g, '')
    .trim()
}

function normalize(title) {
  return displayTitle(title).toLowerCase().replace(/\s+/g, ' ')
}

/** The library entry whose title matches an online result's title, or null. */
export function findLibraryMatch(index, title) {
  const wanted = normalize(title)
  if (!wanted) return null
  return index.find(e => normalize(e.title) === wanted) ?? null
}
