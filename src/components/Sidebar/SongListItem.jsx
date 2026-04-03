import { useLibraryStore } from '../../store/libraryStore'

export function SongListItem({ entry, onSelect }) {
  const selectSong = useLibraryStore(s => s.selectSong)
  const deleteSong = useLibraryStore(s => s.deleteSong)
  const removeSongFromCollection = useLibraryStore(s => s.removeSongFromCollection)
  const activeSongId = useLibraryStore(s => s.activeSongId)
  const isExportMode = useLibraryStore(s => s.isExportMode)
  const selectedSongIds = useLibraryStore(s => s.selectedSongIds)
  const toggleSongSelection = useLibraryStore(s => s.toggleSongSelection)
  const viewMode = useLibraryStore(s => s.viewMode)

  const isActive = !isExportMode && activeSongId === entry.id
  const isSelected = isExportMode && selectedSongIds.has(entry.id)

  function handleDelete(e) {
    e.stopPropagation()
    if (viewMode === 'collections' && entry.collectionId !== null) {
      if (window.confirm(`Remove "${entry.title}" from this collection?`)) {
        removeSongFromCollection(entry.id, entry.collectionId)
      }
    } else {
      if (window.confirm(`Delete "${entry.title}"?`)) {
        deleteSong(entry.id)
      }
    }
  }

  function handleRowClick() {
    if (isExportMode) {
      toggleSongSelection(entry.id)
    } else {
      selectSong(entry.id)
      onSelect?.()
    }
  }

  return (
    <li className="flex items-center group">
      {isExportMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleSongSelection(entry.id)}
          onClick={e => e.stopPropagation()}
          className="ml-2 mr-1 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />
      )}
      {/* Selection / navigation button */}
      <button
        type="button"
        onClick={handleRowClick}
        className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg cursor-pointer
          ${isSelected
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-gray-900 dark:text-gray-100'
            : isActive
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
      {/* Delete button hidden in export mode */}
      {!isExportMode && (
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
      )}
    </li>
  )
}
