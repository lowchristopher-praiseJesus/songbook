import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { SongListItem } from './SongListItem'

export function CollectionGroup({ group, onSelect }) {
  const [open, setOpen] = useState(true)
  const deleteCollection = useLibraryStore(s => s.deleteCollection)

  function handleDelete(e) {
    e.stopPropagation()
    if (window.confirm(`Delete all ${group.entries.length} song${group.entries.length !== 1 ? 's' : ''} in "${group.name}"?`)) {
      deleteCollection(group.id)
    }
  }

  return (
    <li>
      <div className="flex items-center group">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 min-w-0 flex items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide
            text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
            hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <span className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>›</span>
          <span className="flex-1 text-left truncate">{group.name}</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs font-normal">
            {group.entries.length}
          </span>
        </button>
        {group.id !== '__uncategorized__' && (
          <button
            type="button"
            onClick={handleDelete}
            aria-label={`Delete collection ${group.name}`}
            className="ml-1 mr-1 p-1 rounded shrink-0
              [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
              focus:opacity-100 transition-opacity
              hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
          >
            🗑
          </button>
        )}
      </div>
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
