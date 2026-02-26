import { useLibraryStore } from '../../store/libraryStore'

export function SongListItem({ entry }) {
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
    <li
      role="button"
      tabIndex={0}
      onClick={() => selectSong(entry.id)}
      onKeyDown={e => e.key === 'Enter' && selectSong(entry.id)}
      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer group select-none
        ${isActive
          ? 'bg-indigo-600 text-white'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
        }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{entry.title}</div>
        {entry.artist && (
          <div className={`text-xs truncate ${isActive ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>
            {entry.artist}
          </div>
        )}
      </div>
      <button
        onClick={handleDelete}
        aria-label={`Delete ${entry.title}`}
        className={`ml-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0
          ${isActive ? 'hover:bg-indigo-700 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500'}`}
      >
        🗑
      </button>
    </li>
  )
}
