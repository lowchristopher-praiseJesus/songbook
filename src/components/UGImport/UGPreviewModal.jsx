import { useState, useEffect, useCallback } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { SongBody } from '../SongList/SongBody'
import { fetchAndParseSong } from '../../lib/ugImport/fetchSong'

function errorMessage(err) {
  if (err?.message === 'UNAUTHORIZED') return 'Invalid API key — check Settings'
  return 'Connection failed — check your internet and try again'
}

const EXTRACT_ERROR = "Couldn't extract chords from this page. Try another result or import directly."

export function UGPreviewModal({ result, apiKey, isOpen, onClose, onImported }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [song, setSong] = useState(null)
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    setSong(null)
    try {
      const parsed = await fetchAndParseSong(result, apiKey)
      if (!parsed.sections.length) {
        setStatus('error')
        setError(EXTRACT_ERROR)
        return
      }
      setSong(parsed)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(errorMessage(err))
    }
  }, [result, apiKey])

  useEffect(() => {
    if (isOpen && result) load()
  }, [isOpen, result, load])

  function handleImport() {
    if (importing || !song) return
    setImporting(true)
    Promise.resolve(onImported(song, result))
      .catch(err => { setError(errorMessage(err)); setStatus('error') })
      .finally(() => setImporting(false))
  }

  if (!isOpen) return null

  const title = status === 'ready' && song?.meta?.title ? song.meta.title : 'Preview'

  return (
    <Modal isOpen={isOpen} title={title} onClose={onClose} size="xl">
      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-sm">Loading preview…</span>
        </div>
      )}

      {status === 'error' && (
        <div className="py-6">
          <p className="text-sm text-red-500 mb-4">{error}</p>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      )}

      {status === 'ready' && song && (
        <>
          <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{song.meta.title}</h3>
            {song.meta.artist && (
              <div className="text-sm text-gray-500 dark:text-gray-400">{song.meta.artist}</div>
            )}
            <div className="mt-1 flex gap-3 text-xs text-gray-500 dark:text-gray-400">
              {song.meta.key && <span>Key: {song.meta.key}</span>}
              {song.meta.capo ? <span>Capo: {song.meta.capo}</span> : null}
            </div>
          </div>
          <div className="mb-4">
            <SongBody sections={song.sections} fontSize={16} />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" onClick={onClose} disabled={importing}>Cancel</Button>
            <Button variant="primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
