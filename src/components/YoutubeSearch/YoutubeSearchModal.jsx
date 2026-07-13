import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { getFirecrawlKey } from '../../lib/storage'
import { searchYoutube } from '../../lib/youtubeImport/youtubeClient'

function errorMessage(err) {
  if (err?.message === 'UNAUTHORIZED') return 'Invalid API key — check Settings'
  return 'Connection failed — check your internet and try again'
}

function thumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

export function YoutubeSearchModal({ isOpen, onClose, title, artist, initialVideoId, onVideoPicked }) {
  const [status, setStatus] = useState('idle') // idle | searching | results | playing
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [videoId, setVideoId] = useState(null)
  const [error, setError] = useState(null)

  // Re-derive the modal's starting state each time it opens, from whichever
  // song is active at that moment — the modal instance is not remounted
  // between songs, only shown/hidden, so this can't be a useState initializer.
  useEffect(() => {
    if (!isOpen) return
    setQuery([title, artist].filter(Boolean).join(' '))
    setResults([])
    setError(null)
    if (initialVideoId) {
      setVideoId(initialVideoId)
      setStatus('playing')
    } else {
      setVideoId(null)
      setStatus('idle')
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    setStatus('searching')
    setError(null)
    try {
      const items = await searchYoutube(query.trim(), getFirecrawlKey())
      setResults(items)
      setStatus('results')
    } catch (err) {
      setStatus('idle')
      setError(errorMessage(err))
    }
  }

  function handlePick(result) {
    setVideoId(result.videoId)
    setStatus('playing')
    onVideoPicked(result.videoId)
  }

  function handleSearchAgain() {
    setStatus('idle')
    setResults([])
    setError(null)
  }

  return (
    <Modal isOpen={isOpen} title="Search YouTube" onClose={onClose}>
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
              No videos found — try a different search
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {results.map(r => (
                <li key={r.videoId}>
                  <button
                    type="button"
                    onClick={() => handlePick(r)}
                    className="w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg cursor-pointer
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      text-sm text-gray-900 dark:text-gray-100
                      focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <img
                      src={thumbnailUrl(r.videoId)}
                      alt=""
                      className="w-20 h-auto rounded shrink-0"
                    />
                    <span className="min-w-0 truncate font-medium">{r.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {status === 'playing' && videoId && (
        <div className="space-y-2">
          <iframe
            title="YouTube video player"
            src={`https://www.youtube.com/embed/${videoId}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="w-full aspect-video rounded-lg"
          />
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={handleSearchAgain} className="text-indigo-500 hover:underline">
              ← Search again
            </button>
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 dark:text-gray-400 hover:underline"
            >
              Open on YouTube ↗
            </a>
          </div>
        </div>
      )}
    </Modal>
  )
}
