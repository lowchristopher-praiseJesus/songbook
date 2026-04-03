import { SongListItem } from './SongListItem'

/**
 * Renders all songs in A-Z order with letter-group dividers.
 * Used in the "All Songs" sidebar view.
 */
export function AllSongsList({ entries, onSelect }) {
  const sorted = [...entries].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  )

  const groups = []
  let currentLetter = null
  for (const entry of sorted) {
    const letter = entry.title[0]?.toUpperCase() ?? '#'
    if (letter !== currentLetter) {
      currentLetter = letter
      groups.push({ letter, entries: [] })
    }
    groups[groups.length - 1].entries.push(entry)
  }

  return groups.map(group => (
    <li key={group.letter} className="list-none">
      <div className="px-3 pt-3 pb-0.5 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest select-none">
        {group.letter}
      </div>
      <ul className="space-y-0.5">
        {group.entries.map(entry => (
          <SongListItem key={entry.id} entry={entry} onSelect={onSelect} />
        ))}
      </ul>
    </li>
  ))
}
