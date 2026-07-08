import { useState, useCallback, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { getFirecrawlKey } from '../../lib/storage'
import { searchUG } from '../../lib/ugImport/firecrawlClient'
import { fetchAndParseSong } from '../../lib/ugImport/fetchSong'
import { searchDanielChoy } from '../../lib/danielchoyImport/danielchoyClient'
import { UGPreviewModal } from './UGPreviewModal'

function errorMessage(err) {
  if (err?.message === 'UNAUTHORIZED') return 'Invalid API key — check Settings'
  return 'Connection failed — check your internet and try again'
}

export function UGSearchModal({ isOpen, onClose, onSongSelect, onImportSuccess, onAddToast, collectionId }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('idle')  // idle | searching | results | importing
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [duplicateState, setDuplicateState] = useState(null)
  const [previewResult, setPreviewResult] = useState(null)

  const addSongs = useLibraryStore(s => s.addSongs)
  const replaceSong = useLibraryStore(s => s.replaceSong)
  const selectSong = useLibraryStore(s => s.selectSong)
  const addSongToCollection = useLibraryStore(s => s.addSongToCollection)

  const importingRef = useRef(false)

  const resetAndClose = useCallback(() => {
    setQuery('')
    setStatus('idle')
    setResults([])
    setError(null)
    setDuplicateState(null)
    setPreviewResult(null)
    importingRef.current = false
    onClose()
  }, [onClose])

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    const apiKey = getFirecrawlKey()
    setStatus('searching')
    setError(null)
    try {
      const [ugOutcome, dcOutcome] = await Promise.allSettled([
        apiKey ? searchUG(query.trim(), apiKey) : Promise.resolve([]),
        searchDanielChoy(query.trim(), apiKey),
      ])
      const ugItems = ugOutcome.status === 'fulfilled' ? ugOutcome.value : []
      const dcItems = dcOutcome.status === 'fulfilled' ? dcOutcome.value : []
      const combined = [
        ...ugItems.map(r => ({ ...r, source: 'ug' })),
        ...dcItems.map(r => ({ ...r, source: 'danielchoy' })),
      ]
      setResults(combined)
      setStatus('results')
      // Surface an error only when all searched sources failed
      const ugFailed = ugOutcome.status === 'rejected'
      const dcFailed = dcOutcome.status === 'rejected'
      const ugSkipped = !apiKey  // UG not searched (no key)
      if ((ugFailed || ugSkipped) && dcFailed) {
        setStatus('idle')
        setError(ugFailed ? errorMessage(ugOutcome.reason) : errorMessage(dcOutcome.reason))
      }
    } catch (err) {
      setStatus('idle')
      setError(errorMessage(err))
    }
  }

  function onDuplicateCheck(title) {
    setPreviewResult(null)
    return new Promise(resolve => setDuplicateState({ title, resolve }))
  }

  function resolveDuplicate(resolution) {
    const { resolve } = duplicateState
    setDuplicateState(null)
    resolve(resolution)
  }

  const runImport = useCallback(async (song, result) => {
    if (!song.sections.length) {
      setStatus('results')
      setError("Couldn't extract chords from this page — try another result")
      return
    }

    const sourceLabel = result.source === 'danielchoy' ? 'Daniel Choy' : 'Ultimate Guitar'

    // Duplicate check
    const index = useLibraryStore.getState().index
    const duplicate = index.find(e => e.title === song.meta.title)
    if (duplicate) {
      const resolution = await onDuplicateCheck(song.meta.title)
      if (resolution === 'replace') {
        replaceSong(duplicate.id, song)
        if (collectionId) addSongToCollection(duplicate.id, collectionId)
        selectSong(duplicate.id)
        onSongSelect()
        onImportSuccess?.()
        onAddToast(`Imported: ${song.meta.title}`, 'success')
        resetAndClose()
        return
      } else if (resolution === 'skip') {
        setStatus('results')
        return
      }
      // 'keep-both' falls through to addSongs — new UUID is assigned
    }

    const idsBefore = new Set(useLibraryStore.getState().index.map(e => e.id))
    const sourceKey = result.source === 'danielchoy' ? 'danielchoy' : 'ug'
    try {
      addSongs([song], sourceLabel, sourceKey)
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        setStatus('results')
        setError('Storage full — delete some songs before importing')
        return
      }
      throw e
    }

    const newEntry = useLibraryStore.getState().index.find(e => !idsBefore.has(e.id))
    if (newEntry && collectionId) addSongToCollection(newEntry.id, collectionId)
    if (newEntry) selectSong(newEntry.id)
    onSongSelect()
    onImportSuccess?.()
    onAddToast(`Imported: ${song.meta.title}`, 'success')
    resetAndClose()
  }, [addSongs, replaceSong, selectSong, addSongToCollection, collectionId, onDuplicateCheck, onSongSelect, onImportSuccess, onAddToast, resetAndClose])

  const handleSelect = useCallback(async (result) => {
    if (importingRef.current) return
    importingRef.current = true
    const apiKey = getFirecrawlKey()
    setStatus('importing')
    setError(null)
    try {
      const song = await fetchAndParseSong(result, apiKey)
      await runImport(song, result)
    } catch (err) {
      setStatus('results')
      setError(errorMessage(err))
      importingRef.current = false
    }
  }, [runImport])

  const apiKey = getFirecrawlKey()

  return (
    <Modal isOpen={isOpen} title="Search Songs" onClose={resetAndClose}>
      <>
        {status === 'idle' && (
          <form onSubmit={handleSearch} className="space-y-3">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Song title or artist…"
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {!apiKey && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Add a Firecrawl API key in <strong>Settings</strong> to also search Ultimate Guitar.
              </p>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={!query.trim()}>
              Search
            </Button>
          </form>
        )}

        {status === 'searching' && (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm">Searching…</span>
          </div>
        )}

        {status === 'results' && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => { setStatus('idle'); setError(null) }}
              className="text-sm text-indigo-500 hover:underline"
            >
              ← Back
            </button>
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
            {results.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                No chord charts found — try a different search
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {results.map(r => {
                  // Strip " Chords ver. N" and " Chords by Artist" from UG display titles
                  const displayTitle = (r.title ?? '')
                    .replace(/\s+[Cc]hords?\s+ver\.\s*\d+.*$/g, '')
                    .replace(/\s+[Cc]hords?\s+by\s+.*$/g, '')
                    .trim()
                  const isDC = r.source === 'danielchoy'
                  return (
                    <li key={r.url} className="flex items-stretch gap-1">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelect(r)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleSelect(r)
                          }
                        }}
                        className="flex-1 min-w-0 text-left px-3 py-2 rounded-lg cursor-pointer
                          hover:bg-gray-100 dark:hover:bg-gray-700
                          text-sm text-gray-900 dark:text-gray-100
                          focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium flex-1 min-w-0 truncate">{displayTitle || r.title}</span>
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isDC
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'
                          }`}>
                            {isDC ? 'DC' : 'UG'}
                          </span>
                        </div>
                        {r.description && (
                          <div className="text-xs text-gray-400 truncate mt-0.5">{r.description}</div>
                        )}
                        {isDC && r.artist && (
                          <div className="text-xs text-gray-400 truncate mt-0.5">{r.artist}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        className="shrink-0 self-center px-2"
                        onClick={e => { e.stopPropagation(); setPreviewResult(r) }}
                        aria-label={`Preview ${displayTitle || r.title}`}
                        title="Preview"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
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
      </>

      {/* Duplicate resolution */}
      {duplicateState && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            "{duplicateState.title}" already exists. What would you like to do?
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="danger" onClick={() => resolveDuplicate('replace')}>Replace</Button>
            <Button variant="secondary" onClick={() => resolveDuplicate('keep-both')}>Keep Both</Button>
            <Button variant="ghost" onClick={() => resolveDuplicate('skip')}>Skip</Button>
          </div>
        </div>
      )}

      <UGPreviewModal
        result={previewResult}
        apiKey={apiKey}
        isOpen={!!previewResult}
        onClose={() => setPreviewResult(null)}
        onImported={(song, result) => runImport(song, result)}
      />
    </Modal>
  )
}
