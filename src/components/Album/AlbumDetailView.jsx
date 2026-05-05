import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { deleteAlbum, removeAlbumLocally } from '../../lib/albumApi'

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatDuration(ms) {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function AlbumDetailView({ album }) {
  const setActiveAlbumCode = useLibraryStore(s => s.setActiveAlbumCode)
  const syncAlbums = useLibraryStore(s => s.syncAlbums)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [copied, setCopied] = useState(false)

  const albumUrl = `${window.location.origin}${window.location.pathname}?album=${album.albumCode}`
  const tracks = album.tracks ?? []

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAlbum(album.albumCode, album.creatorToken)
      removeAlbumLocally(album.albumCode)
      syncAlbums()
      setActiveAlbumCode(null)
    } catch {
      setDeleteError('Failed to delete. Check your connection and try again.')
      setDeleting(false)
      setConfirming(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(albumUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          {album.title}
        </h1>
        {album.artist && (
          <p className="text-base text-gray-600 dark:text-gray-400 mb-2">{album.artist}</p>
        )}
        <p className="text-sm text-gray-400 dark:text-gray-500">{formatDate(album.createdAt)}</p>
      </div>

      {/* Track list */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
          {tracks.length} {tracks.length === 1 ? 'Song' : 'Songs'}
        </h2>
        {tracks.length > 0 ? (
          <ol className="space-y-2">
            {tracks.map((t, i) => (
              <li
                key={t.trackId ?? i}
                className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800"
              >
                <span className="text-sm text-gray-400 dark:text-gray-500 tabular-nums w-5 shrink-0 text-right">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">
                  {t.title}
                </span>
                {t.duration > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                    {formatDuration(t.duration)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">No track info available.</p>
        )}
      </div>

      {/* Album link */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
          Share Link
        </h2>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={albumUrl}
            className="flex-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600
              px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300
              focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 px-3 py-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-700
              text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600
              border border-gray-300 dark:border-gray-600 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <a
            href={albumUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-3 py-2 text-xs rounded-lg border border-indigo-500
              text-indigo-600 dark:text-indigo-400
              hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
          >
            Open ↗
          </a>
        </div>
      </div>

      {/* Delete */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-sm px-4 py-2 rounded-lg border border-red-300 dark:border-red-800
              text-red-600 dark:text-red-400
              hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete Album
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              This will permanently delete the album and all its audio files from Cloudflare. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white
                  hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Yes, delete album'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                  text-gray-600 dark:text-gray-400
                  hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
            {deleteError && (
              <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
