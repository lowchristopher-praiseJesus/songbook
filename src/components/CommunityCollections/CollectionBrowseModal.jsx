import { useState, useCallback, useEffect, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { parseContent } from '../../lib/parser/contentParser'
import {
  listCommunityCollections, fetchCommunityCollection, recordCommunityImport,
} from '../../lib/communityImport/communityClient'

function toSong(row, publisherName) {
  return {
    rawText: row.body,
    meta: {
      title: row.title,
      artist: row.artist,
      keyIndex: row.keyIndex ?? 0,
      capo: row.capo ?? 0,
      tempo: row.tempo ?? undefined,
      communitySource: {
        arrangementId: row.id,
        publisherName,
        importedAt: new Date().toISOString(),
      },
    },
    sections: parseContent(row.body),
  }
}

export function CollectionBrowseModal({ isOpen, onClose, onSongSelect, onImportSuccess, onAddToast }) {
  const [status, setStatus] = useState('loading')  // loading | results | preview | importing
  const [results, setResults] = useState([])
  const [collection, setCollection] = useState(null)
  const [error, setError] = useState(null)

  const addSongs = useLibraryStore(s => s.addSongs)
  const selectSong = useLibraryStore(s => s.selectSong)
  const index = useLibraryStore(s => s.index)

  const resetAndClose = useCallback(() => {
    setStatus('loading')
    setResults([])
    setCollection(null)
    setError(null)
    onClose()
  }, [onClose])

  const fetchIdRef = useRef(0)

  const loadCollections = useCallback(() => {
    const id = ++fetchIdRef.current
    setStatus('loading')
    setError(null)
    listCommunityCollections()
      .then(found => {
        if (fetchIdRef.current !== id) return
        setResults(found)
        setStatus('results')
      })
      .catch(() => {
        if (fetchIdRef.current !== id) return
        setResults([])
        setStatus('results')
        setError('Connection failed — check your internet and try again')
      })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    loadCollections()
  }, [isOpen, loadCollections])

  async function handleSelectCollection(result) {
    setStatus('loading')
    setError(null)
    try {
      const detail = await fetchCommunityCollection(result.id)
      setCollection(detail)
      setStatus('preview')
    } catch (err) {
      setStatus('results')
      setError(
        err?.code === 'not_found'
          ? 'This collection is no longer available'
          : 'Connection failed — check your internet and try again'
      )
    }
  }

  async function handleImportAll() {
    const existingTitles = new Set(index.map(e => e.title))
    const accepted = collection.songs.filter(s => !existingTitles.has(s.title))
    const skippedCount = collection.songs.length - accepted.length

    if (accepted.length === 0) return

    setStatus('importing')
    const songs = accepted.map(row => toSong(row, collection.publisherName))
    let newSongIds, collectionId
    try {
      ({ newSongIds, collectionId } = addSongs(songs, collection.collectionName, `community-collection:${collection.id}`))
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        setStatus('preview')
        setError('Storage full — delete some songs before importing')
        return
      }
      throw e
    }
    if (newSongIds.length > 0) selectSong(newSongIds[0], collectionId)

    for (const row of accepted) {
      recordCommunityImport(row.id)
    }

    const message = skippedCount > 0
      ? `Imported ${accepted.length} song${accepted.length === 1 ? '' : 's'} from "${collection.collectionName}" — ${skippedCount} already in your library`
      : `Imported ${accepted.length} song${accepted.length === 1 ? '' : 's'} from "${collection.collectionName}"`
    onAddToast(message, 'success')
    onSongSelect()
    onImportSuccess?.()
    resetAndClose()
  }

  const duplicateTitles = collection ? new Set(index.map(e => e.title)) : new Set()
  const duplicateCount = collection ? collection.songs.filter(s => duplicateTitles.has(s.title)).length : 0
  const allDuplicates = collection && duplicateCount === collection.songs.length

  return (
    <Modal isOpen={isOpen} title="Browse Collections" onClose={resetAndClose}>
      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {status === 'results' && (
        <div className="space-y-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {results.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {error ? 'Could not load collections' : 'No collections available yet'}
              </p>
              {error && (
                <Button variant="secondary" onClick={loadCollections}>Retry</Button>
              )}
            </div>
          ) : (
            <ul className="mt-2 space-y-1">
              {results.map(r => (
                <li key={r.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectCollection(r)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSelectCollection(r)
                      }
                    }}
                    className="px-3 py-2 rounded-lg cursor-pointer
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      text-sm text-gray-900 dark:text-gray-100
                      focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <div className="font-medium">{r.collectionName}</div>
                    <div className="text-xs text-gray-400 truncate mt-0.5">
                      {r.publisherName} · {r.songCount} song{r.songCount === 1 ? '' : 's'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {status === 'preview' && collection && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => { setStatus('results'); setCollection(null) }}
            className="text-sm text-indigo-500 hover:underline"
          >
            ← Back
          </button>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {collection.collectionName} — {collection.publisherName}
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {allDuplicates && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              All {collection.songs.length} songs are already in your library
            </p>
          )}
          <ul className="max-h-64 overflow-y-auto space-y-0.5">
            {collection.songs.map(song => (
              <li key={song.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="flex-1 min-w-0 truncate text-gray-900 dark:text-gray-100">{song.title}</span>
                {song.artist && (
                  <span className="text-xs text-gray-400 truncate max-w-28">{song.artist}</span>
                )}
                {duplicateTitles.has(song.title) && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0
                    bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                    already in your library
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            className="w-full"
            disabled={allDuplicates}
            onClick={handleImportAll}
          >
            Import All
          </Button>
        </div>
      )}

      {status === 'importing' && (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-sm">Importing…</span>
        </div>
      )}
    </Modal>
  )
}
