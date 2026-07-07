/**
 * Resolve the title for a "Save As" copy of a song.
 *
 * - If the user renamed the song (editedTitle differs from originalTitle after
 *   trimming), use their title as-is. No collision check — this matches
 *   NewSongEditor, which also permits duplicate titles.
 * - If the title is unchanged, append the smallest numeric suffix N (>= 1) such
 *   that `${originalTitle} ${N}` is not already in existingTitles. This
 *   guarantees the new name differs from the original (which is in
 *   existingTitles) and avoids colliding with any other library song.
 *
 * @param {string} originalTitle  title of the song being copied
 * @param {string} editedTitle    title currently shown in the editor
 * @param {string[]} existingTitles titles already in the library (incl. original)
 * @returns {string} the title to use for the new copy
 */
export function resolveSaveAsTitle(originalTitle, editedTitle, existingTitles) {
  const orig = (originalTitle ?? '').trim()
  const edited = (editedTitle ?? '').trim()
  if (edited !== orig) return edited

  const taken = new Set((existingTitles ?? []).map(t => (t ?? '').trim()))
  let n = 1
  while (taken.has(`${orig} ${n}`)) n++
  return `${orig} ${n}`
}