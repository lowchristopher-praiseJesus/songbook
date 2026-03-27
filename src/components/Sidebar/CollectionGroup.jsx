import { useState } from 'react'
import { SongListItem } from './SongListItem'

export function CollectionGroup({ group, onSelect }) {
  const [open, setOpen] = useState(true)

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide
          text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
          hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
      >
        <span className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>›</span>
        <span className="flex-1 text-left truncate">{group.name}</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs font-normal">
          {group.entries.length}
        </span>
      </button>
      {open && (
        <ul className="ml-2 space-y-0.5">
          {group.entries.map(entry => (
            <SongListItem key={entry.id} entry={entry} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}
