import { useLibraryStore } from '../../store/libraryStore'

export function AlbumCard({ album, onSelect }) {
  const activeAlbumCode = useLibraryStore(s => s.activeAlbumCode)
  const setActiveAlbumCode = useLibraryStore(s => s.setActiveAlbumCode)
  const isActive = activeAlbumCode === album.albumCode

  return (
    <li>
      <button
        type="button"
        onClick={() => { setActiveAlbumCode(album.albumCode); onSelect?.() }}
        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
          isActive
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-100'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-200'
        }`}
      >
        <p className="text-sm font-medium truncate">{album.title}</p>
        {album.artist && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{album.artist}</p>
        )}
      </button>
    </li>
  )
}
