import { useLibraryStore } from '../../store/libraryStore'

export function SongListItem({ entry, onSelect }) {
  const selectSong = useLibraryStore(s => s.selectSong)
  const deleteSong = useLibraryStore(s => s.deleteSong)
  const activeSongId = useLibraryStore(s => s.activeSongId)
  const isActive = activeSongId === entry.id

  function handleDelete(e) {
    e.stopPropagation()
    if (window.confirm(`Delete "${entry.title}"?`)) {
      deleteSong(entry.id)
    }
  }

  return (
    <li className="flex items-center group">
      {/* Selection button spans the text area */}
      <button
        type="button"
        onClick={() => { selectSong(entry.id); onSelect?.() }}
        className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg cursor-pointer
          ${isActive
            ? 'bg-indigo-600 text-white'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
          }`}
      >
        <div className="text-sm font-medium truncate">{entry.title}</div>
        {entry.artist && (
          <div className={`text-xs truncate ${isActive ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>
            {entry.artist}
          </div>
        )}
      </button>
      {/* Delete button outside the selection button */}
      <button
        type="button"
        onClick={handleDelete}
        aria-label={`Delete ${entry.title}`}
        className={`ml-1 mr-1 p-1 rounded focus:opacity-100 transition-opacity shrink-0
          [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
          ${isActive ? 'hover:bg-indigo-700 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500'}`}
      >
        🗑
      </button>
    </li>
  )
}
