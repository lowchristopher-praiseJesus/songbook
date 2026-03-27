import { useState, useCallback, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { getFirecrawlKey } from '../../lib/storage'
import { searchUG, scrapeURL } from '../../lib/ugImport/firecrawlClient'
import { parseUGPage } from '../../lib/ugImport/ugParser'

function errorMessage(err) {
  if (err?.message === 'UNAUTHORIZED') return 'Invalid API key — check Settings'
  return 'Connection failed — check your internet and try again'
}

export function UGSearchModal({ isOpen, onClose, onSongSelect, onImportSuccess, onAddToast }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('idle')  // idle | searching | results | importing
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [duplicateState, setDuplicateState] = useState(null)

  const addSongs = useLibraryStore(s => s.addSongs)
  const replaceSong = useLibraryStore(s => s.replaceSong)

  const importingRef = useRef(false)

  const resetAndClose = useCallback(() => {
    setQuery('')
    setStatus('idle')
    setResults([])
    setError(null)
    setDuplicateState(null)
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
      const items = await searchUG(query.trim(), apiKey)
      setResults(items)
      setStatus('results')
    } catch (err) {
      setStatus('idle')
      setError(errorMessage(err))
    }
  }

  function onDuplicateCheck(title) {
    return new Promise(resolve => setDuplicateState({ title, resolve }))
  }

  function resolveDuplicate(resolution) {
    const { resolve } = duplicateState
    setDuplicateState(null)
    resolve(resolution)
  }

  const handleSelect = useCallback(async (result) => {
    if (importingRef.current) return
    importingRef.current = true
    const apiKey = getFirecrawlKey()
    setStatus('importing')
    setError(null)
    try {
      const scraped = await scrapeURL(result.url, apiKey)
      const song = parseUGPage(scraped, result.url)

      if (!song.sections.length) {
        setStatus('results')
        setError("Couldn't extract chords from this page — try another result")
        return
      }

      // Duplicate check
      const index = useLibraryStore.getState().index
      const duplicate = index.find(e => e.title === song.meta.title)
      if (duplicate) {
        const resolution = await onDuplicateCheck(song.meta.title)
        if (resolution === 'replace') {
          replaceSong(duplicate.id, song)
          onSongSelect(duplicate.id)
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

      try {
        addSongs([song])
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          setStatus('results')
          setError('Storage full — delete some songs before importing')
          return
        }
        throw e
      }

      const newEntry = useLibraryStore.getState().index.find(e => !idsBefore.has(e.id))
      if (newEntry) onSongSelect(newEntry.id)
      onImportSuccess?.()
      onAddToast(`Imported: ${song.meta.title}`, 'success')
      resetAndClose()
    } catch (err) {
      setStatus('results')
      setError(errorMessage(err))
      importingRef.current = false
    }
  }, [addSongs, replaceSong, onSongSelect, onImportSuccess, onAddToast, resetAndClose])

  const apiKey = getFirecrawlKey()
  const noKey = !apiKey

  return (
    <Modal isOpen={isOpen} title="Search Ultimate Guitar" onClose={resetAndClose}>
      {noKey ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Add your Firecrawl API key in <strong>Settings</strong> (top right) to search Ultimate Guitar.
        </p>
      ) : (
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
                    // Strip " Chords ver. N" and " Chords by Artist" from display title
                    const displayTitle = (r.title ?? '')
                      .replace(/\s+[Cc]hords?\s+ver\.\s*\d+.*$/g, '')
                      .replace(/\s+[Cc]hords?\s+by\s+.*$/g, '')
                      .trim()
                    return (
                      <li key={r.url}>
                        <button
                          type="button"
                          onClick={() => handleSelect(r)}
                          className="w-full text-left px-3 py-2 rounded-lg
                            hover:bg-gray-100 dark:hover:bg-gray-700
                            text-sm text-gray-900 dark:text-gray-100"
                        >
                          <div className="font-medium">{displayTitle || r.title}</div>
                          {r.description && (
                            <div className="text-xs text-gray-400 truncate mt-0.5">{r.description}</div>
                          )}
                        </button>
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
      )}

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
    </Modal>
  )
}
