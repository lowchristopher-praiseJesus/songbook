import { useLibraryStore } from '../../store/libraryStore'
import { AlbumCard } from './AlbumCard'

const MAX_FREE_ALBUMS = 1

export function AlbumsPanel({ onSelect, onNewAlbum }) {
  const albums = useLibraryStore(s => s.albums)
  const setIsCreatingNewAlbum = useLibraryStore(s => s.setIsCreatingNewAlbum)

  const atLimit = albums.length >= MAX_FREE_ALBUMS

  function handleNewAlbum() {
    setIsCreatingNewAlbum(true)
    onNewAlbum?.()
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="px-2 py-2 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          disabled={atLimit}
          onClick={handleNewAlbum}
          className="w-full flex items-center gap-1 px-2 py-1 text-xs
            text-indigo-500 dark:text-indigo-400
            border border-dashed border-gray-300 dark:border-gray-600 rounded
            hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20
            transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
            disabled:hover:border-gray-300 dark:disabled:hover:border-gray-600"
        >
          + New Album
        </button>
        {atLimit && (
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5 px-1">
            Free plan: 1 album maximum. Delete your existing album to create a new one.
          </p>
        )}
      </div>

      {albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center px-4">
          <p className="text-sm text-gray-400 dark:text-gray-500">No albums yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Create an album from your recorded songs.
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {albums.map(album => (
            <AlbumCard key={album.albumCode} album={album} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </div>
  )
}
