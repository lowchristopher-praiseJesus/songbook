import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { getFirecrawlKey } from '../../lib/storage'
import { searchYoutube, parseYouTubeVideoId, parseYouTubeStartSeconds } from '../../lib/youtubeImport/youtubeClient'
import { youtubeSearchUrl } from '../../lib/youtubeSearch'
import { YoutubePlayerBar } from './YoutubePlayerBar'

function errorMessage(err) {
  if (err?.message === 'UNAUTHORIZED') return 'Invalid API key — check Settings'
  return 'Connection failed — check your internet and try again'
}

function thumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

export function YoutubeSearchModal({
  isOpen,
  onClose,
  title,
  artist,
  initialVideoId,
  onVideoPicked,
  minimized = false,
  onMinimize,
  onExpand,
}) {
  const [status, setStatus] = useState('idle') // idle | searching | results | playing
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [videoId, setVideoId] = useState(null)
  const [startSeconds, setStartSeconds] = useState(null)
  const [error, setError] = useState(null)

  // Re-derive the modal's starting state each time it opens, from whichever
  // song is active at that moment — the modal instance is not remounted
  // between songs, only shown/hidden, so this can't be a useState initializer.
  useEffect(() => {
    if (!isOpen) return
    setQuery([title, artist].filter(Boolean).join(' '))
    setResults([])
    setError(null)
    setStartSeconds(null)
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
    const value = query.trim()
    if (!value) return

    // If the user pasted a YouTube link, go straight to that video instead
    // of searching — search results sometimes don't surface the exact video.
    const linkedId = parseYouTubeVideoId(value)
    if (linkedId) {
      setResults([])
      setError(null)
      setVideoId(linkedId)
      setStartSeconds(parseYouTubeStartSeconds(value))
      setStatus('playing')
      onExpand?.()
      onVideoPicked(linkedId)
      return
    }

    // Without a Firecrawl key, in-app search isn't available — fall back to
    // opening a YouTube search in a new tab, same as the toolbar button does.
    if (!getFirecrawlKey()) {
      window.open(youtubeSearchUrl(value), '_blank', 'noopener,noreferrer')
      return
    }

    setStatus('searching')
    setError(null)
    try {
      const items = await searchYoutube(value, getFirecrawlKey())
      setResults(items)
      setStatus('results')
    } catch (err) {
      setStatus('idle')
      setError(errorMessage(err))
    }
  }

  function handlePick(result) {
    setVideoId(result.videoId)
    setStartSeconds(null)
    setStatus('playing')
    onExpand?.()
    onVideoPicked(result.videoId)
  }

  function handleSearchAgain() {
    setStatus('idle')
    setResults([])
    setError(null)
  }

  function handleBackToResults() {
    setStatus('results')
  }

  function handleRemove() {
    onVideoPicked(null)
    setVideoId(null)
    setStatus('idle')
    onClose?.()
  }

  if (!isOpen) return null

  if (status === 'playing' && videoId) {
    return (
      <YoutubePlayerBar
        videoId={videoId}
        startSeconds={startSeconds}
        label={[title, artist].filter(Boolean).join(' — ')}
        minimized={minimized}
        hasResults={results.length > 0}
        onMinimize={onMinimize}
        onExpand={onExpand}
        onSearchAgain={handleSearchAgain}
        onBackToResults={handleBackToResults}
        onRemove={handleRemove}
        onClose={onClose}
      />
    )
  }

  return (
    <Modal isOpen title="Search YouTube" onClose={onClose}>
      {status === 'idle' && (
        <form onSubmit={handleSearch} className="space-y-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search, or paste a YouTube link…"
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
    </Modal>
  )
}
