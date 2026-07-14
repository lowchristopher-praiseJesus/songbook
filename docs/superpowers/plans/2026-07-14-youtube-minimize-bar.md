# YouTube Minimize Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user minimize the full-screen YouTube player to a sticky bottom bar so lyrics stay visible while the video keeps playing uninterrupted.

**Architecture:** Extract the iframe + playback controls out of `YoutubeSearchModal`'s "playing" status into a new presentational component, `YoutubePlayerBar`, which renders either full-modal chrome or a minimized bottom bar around the *same* `<iframe>` element (same type at the same tree position in both variants) so React never unmounts/remounts it when toggling. `YoutubeSearchModal` keeps its existing idle/searching/results flow (still wrapped in the existing `Modal` component, unchanged) and only delegates to `YoutubePlayerBar` once a video is playing. `SongHeader` owns a new `ytMinimized` boolean alongside its existing `ytModalOpen` boolean, and resets both whenever the active song changes.

**Tech Stack:** React 18, Vite, Tailwind CSS, Vitest + @testing-library/react, `@heroicons/react/24/outline`.

## Global Constraints

- No semicolons, single quotes — match existing file style exactly (see `src/components/YoutubeSearch/YoutubeSearchModal.jsx`, `src/components/SongList/SongHeader.jsx`).
- The `<iframe>` element must never be unmounted/remounted when toggling between the full-modal and minimized visual states — verified by an explicit DOM-node-identity test.
- Every existing test in `src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx` and `src/components/SongList/__tests__/SongHeader.test.jsx` must continue passing unmodified (behavior for idle/searching/results and the no-Firecrawl-key link path is unchanged).
- Run `npm test -- <path>` (i.e. `npx vitest run <path>`) after each implementation step, and `npx vitest run` (full suite) before the final commit of each task.

---

### Task 1: `YoutubePlayerBar` presentational component

**Files:**
- Create: `src/components/YoutubeSearch/YoutubePlayerBar.jsx`
- Test: `src/components/YoutubeSearch/__tests__/YoutubePlayerBar.test.jsx`

**Interfaces:**
- Produces: `YoutubePlayerBar({ videoId, label, minimized, hasResults, onMinimize, onExpand, onSearchAgain, onBackToResults, onClose })` — a React component with no internal state. `videoId: string` (required), `label: string` (may be empty), `minimized: boolean`, `hasResults: boolean`, all `on*` are `() => void` callbacks (may be `undefined`).
- Consumes: nothing from other tasks (`@heroicons/react/24/outline`'s `MinusSmallIcon` only).

- [ ] **Step 1: Write the failing tests**

Create `src/components/YoutubeSearch/__tests__/YoutubePlayerBar.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { YoutubePlayerBar } from '../YoutubePlayerBar'

function renderIt(props = {}) {
  return render(
    <YoutubePlayerBar
      videoId="abc12345678"
      label="El Shaddai — Amy Grant"
      minimized={false}
      hasResults={false}
      onMinimize={vi.fn()}
      onExpand={vi.fn()}
      onSearchAgain={vi.fn()}
      onBackToResults={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  )
}

describe('YoutubePlayerBar', () => {
  it('renders the iframe pointed at the given video in the full-modal variant', () => {
    renderIt()
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src', 'https://www.youtube.com/embed/abc12345678',
    )
  })

  it('shows dialog controls in the full-modal variant', () => {
    renderIt()
    expect(screen.getByRole('button', { name: /^Search again/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open on YouTube/i })).toHaveAttribute(
      'href', 'https://www.youtube.com/watch?v=abc12345678',
    )
    expect(screen.getByRole('button', { name: /minimize/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /close modal/i })).toBeInTheDocument()
  })

  it('hides "Back to results" in the full-modal variant when hasResults is false', () => {
    renderIt({ hasResults: false })
    expect(screen.queryByRole('button', { name: /Back to results/i })).not.toBeInTheDocument()
  })

  it('shows "Back to results" in the full-modal variant when hasResults is true', () => {
    renderIt({ hasResults: true })
    expect(screen.getByRole('button', { name: /Back to results/i })).toBeInTheDocument()
  })

  it('calls onMinimize when the minimize button is clicked', () => {
    const onMinimize = vi.fn()
    renderIt({ onMinimize })
    fireEvent.click(screen.getByRole('button', { name: /minimize/i }))
    expect(onMinimize).toHaveBeenCalledOnce()
  })

  it('calls onClose when the modal close button is clicked', () => {
    const onClose = vi.fn()
    renderIt({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /close modal/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onSearchAgain and onBackToResults from the full-modal variant', () => {
    const onSearchAgain = vi.fn()
    const onBackToResults = vi.fn()
    renderIt({ hasResults: true, onSearchAgain, onBackToResults })
    fireEvent.click(screen.getByRole('button', { name: /Back to results/i }))
    expect(onBackToResults).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /^Search again/i }))
    expect(onSearchAgain).toHaveBeenCalledOnce()
  })

  it('renders the label and Expand/Close controls in the minimized variant, without dialog controls', () => {
    renderIt({ minimized: true })
    expect(screen.getByText('▶ El Shaddai — Amy Grant')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Expand$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Close$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Search again/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open on YouTube/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /minimize/i })).not.toBeInTheDocument()
  })

  it('falls back to "YouTube" when label is empty', () => {
    renderIt({ minimized: true, label: '' })
    expect(screen.getByText('▶ YouTube')).toBeInTheDocument()
  })

  it('calls onExpand when Expand is clicked in the minimized variant', () => {
    const onExpand = vi.fn()
    renderIt({ minimized: true, onExpand })
    fireEvent.click(screen.getByRole('button', { name: /^Expand$/i }))
    expect(onExpand).toHaveBeenCalledOnce()
  })

  it('calls onClose when Close is clicked in the minimized variant', () => {
    const onClose = vi.fn()
    renderIt({ minimized: true, onClose })
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps the exact same iframe DOM node mounted when toggling minimized', () => {
    const { rerender } = renderIt({ minimized: false })
    const iframeBefore = screen.getByTitle('YouTube video player')

    rerender(
      <YoutubePlayerBar
        videoId="abc12345678"
        label="El Shaddai — Amy Grant"
        minimized
        hasResults={false}
        onMinimize={vi.fn()}
        onExpand={vi.fn()}
        onSearchAgain={vi.fn()}
        onBackToResults={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const iframeAfterMinimize = screen.getByTitle('YouTube video player')
    expect(iframeAfterMinimize).toBe(iframeBefore)

    rerender(
      <YoutubePlayerBar
        videoId="abc12345678"
        label="El Shaddai — Amy Grant"
        minimized={false}
        hasResults={false}
        onMinimize={vi.fn()}
        onExpand={vi.fn()}
        onSearchAgain={vi.fn()}
        onBackToResults={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const iframeAfterExpand = screen.getByTitle('YouTube video player')
    expect(iframeAfterExpand).toBe(iframeBefore)
  })

  it('closes on Escape in the full-modal variant', () => {
    const onClose = vi.fn()
    renderIt({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close on Escape in the minimized variant', () => {
    const onClose = vi.fn()
    renderIt({ minimized: true, onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/YoutubeSearch/__tests__/YoutubePlayerBar.test.jsx`
Expected: FAIL — `Cannot find module '../YoutubePlayerBar'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/components/YoutubeSearch/YoutubePlayerBar.jsx`:

```jsx
import { useEffect } from 'react'
import { MinusSmallIcon } from '@heroicons/react/24/outline'

export function YoutubePlayerBar({
  videoId,
  label,
  minimized,
  hasResults,
  onMinimize,
  onExpand,
  onSearchAgain,
  onBackToResults,
  onClose,
}) {
  useEffect(() => {
    if (minimized || !onClose) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [minimized, onClose])

  return (
    <div
      className={
        minimized
          ? 'fixed bottom-0 inset-x-0 z-40 flex items-center justify-between gap-3 px-4 pt-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg pb-[max(0.5rem,env(safe-area-inset-bottom))]'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-black/50'
      }
      onClick={minimized ? undefined : onClose}
    >
      <div
        role={minimized ? undefined : 'dialog'}
        aria-modal={minimized ? undefined : true}
        aria-labelledby={minimized ? undefined : 'youtube-player-title'}
        className={
          minimized
            ? 'flex items-center justify-between gap-3 w-full'
            : 'relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto p-4 sm:p-6'
        }
        onClick={minimized ? undefined : e => e.stopPropagation()}
      >
        {minimized ? (
          <span className="text-sm truncate text-gray-700 dark:text-gray-200">
            ▶ {label || 'YouTube'}
          </span>
        ) : (
          <h2 id="youtube-player-title" className="text-lg font-semibold mb-4 dark:text-white">Search YouTube</h2>
        )}

        <iframe
          title="YouTube video player"
          src={`https://www.youtube.com/embed/${videoId}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen={!minimized}
          className={
            minimized
              ? 'w-px h-px overflow-hidden opacity-0 absolute pointer-events-none'
              : 'w-full aspect-video rounded-lg'
          }
        />

        {minimized ? (
          <div className="flex items-center gap-3 shrink-0 text-sm">
            <button type="button" onClick={onExpand} className="text-indigo-500 hover:underline">
              Expand
            </button>
            <button type="button" onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:underline">
              Close
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-sm mt-2">
            <div className="flex items-center gap-3">
              {hasResults && (
                <button type="button" onClick={onBackToResults} className="text-indigo-500 hover:underline">
                  ← Back to results
                </button>
              )}
              <button type="button" onClick={onSearchAgain} className="text-indigo-500 hover:underline">
                ← Search again
              </button>
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 dark:text-gray-400 hover:underline"
            >
              Open on YouTube ↗
            </a>
          </div>
        )}

        {!minimized && (
          <>
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimize"
              className="absolute top-3 right-11 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <MinusSmallIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/YoutubeSearch/__tests__/YoutubePlayerBar.test.jsx`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/YoutubeSearch/YoutubePlayerBar.jsx src/components/YoutubeSearch/__tests__/YoutubePlayerBar.test.jsx
git commit -m "feat: add YoutubePlayerBar component for minimizable video playback"
```

---

### Task 2: Wire `YoutubeSearchModal` to delegate "playing" to `YoutubePlayerBar`

**Files:**
- Modify: `src/components/YoutubeSearch/YoutubeSearchModal.jsx`
- Test: `src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx`

**Interfaces:**
- Consumes: `YoutubePlayerBar` from Task 1 — `YoutubePlayerBar({ videoId, label, minimized, hasResults, onMinimize, onExpand, onSearchAgain, onBackToResults, onClose })`.
- Produces: `YoutubeSearchModal` gains three new optional props: `minimized = false`, `onMinimize`, `onExpand` (alongside existing `isOpen`, `onClose`, `title`, `artist`, `initialVideoId`, `onVideoPicked`). Consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx` (inside the existing `describe('YoutubeSearchModal', ...)` block, after the last existing `it(...)`, before the closing `})`):

```jsx
  describe('minimize / expand', () => {
    it('shows a minimize button while playing', () => {
      renderIt({ initialVideoId: 'abc12345678' })
      expect(screen.getByRole('button', { name: /minimize/i })).toBeInTheDocument()
    })

    it('does not show a minimize button while idle', () => {
      renderIt()
      expect(screen.queryByRole('button', { name: /minimize/i })).not.toBeInTheDocument()
    })

    it('calls onMinimize when the minimize button is clicked', () => {
      const onMinimize = vi.fn()
      renderIt({ initialVideoId: 'abc12345678', onMinimize })
      fireEvent.click(screen.getByRole('button', { name: /minimize/i }))
      expect(onMinimize).toHaveBeenCalledOnce()
    })

    it('renders the minimized bar with the title/artist label when minimized is true', () => {
      renderIt({ initialVideoId: 'abc12345678', minimized: true, title: 'El Shaddai', artist: 'Amy Grant' })
      expect(screen.getByText('▶ El Shaddai — Amy Grant')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Search again/i })).not.toBeInTheDocument()
    })

    it('calls onExpand when Expand is clicked in the minimized bar', () => {
      const onExpand = vi.fn()
      renderIt({ initialVideoId: 'abc12345678', minimized: true, onExpand })
      fireEvent.click(screen.getByRole('button', { name: /^Expand$/i }))
      expect(onExpand).toHaveBeenCalledOnce()
    })

    it('calls onClose when Close is clicked in the minimized bar', () => {
      const onClose = vi.fn()
      renderIt({ initialVideoId: 'abc12345678', minimized: true, onClose })
      fireEvent.click(screen.getByRole('button', { name: /^Close$/i }))
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('keeps the same iframe DOM node mounted when the minimized prop toggles', () => {
      const { rerender } = renderIt({ initialVideoId: 'abc12345678', minimized: false })
      const iframeBefore = screen.getByTitle('YouTube video player')

      rerender(
        <YoutubeSearchModal
          isOpen
          onClose={vi.fn()}
          title="El Shaddai"
          artist="Amy Grant"
          initialVideoId="abc12345678"
          onVideoPicked={vi.fn()}
          minimized
        />,
      )
      expect(screen.getByTitle('YouTube video player')).toBe(iframeBefore)
    })

    it('un-minimizes when a newly picked video starts playing', async () => {
      searchYoutube.mockResolvedValue([
        { videoId: 'newvideo1234', title: 'New Pick', url: 'https://www.youtube.com/watch?v=newvideo1234' },
      ])
      const onExpand = vi.fn()
      renderIt({ minimized: true, onExpand })
      // Starts idle (no initialVideoId), so the minimized bar shouldn't render yet.
      expect(screen.queryByText(/▶/)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
      const row = await screen.findByText('New Pick')
      fireEvent.click(row)

      expect(onExpand).toHaveBeenCalledOnce()
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx`
Expected: FAIL on the new `describe('minimize / expand', ...)` tests — no minimize button exists yet (existing tests above still pass).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/components/YoutubeSearch/YoutubeSearchModal.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { getFirecrawlKey } from '../../lib/storage'
import { searchYoutube } from '../../lib/youtubeImport/youtubeClient'
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

  if (!isOpen) return null

  if (status === 'playing' && videoId) {
    return (
      <YoutubePlayerBar
        videoId={videoId}
        label={[title, artist].filter(Boolean).join(' — ')}
        minimized={minimized}
        hasResults={results.length > 0}
        onMinimize={onMinimize}
        onExpand={onExpand}
        onSearchAgain={handleSearchAgain}
        onBackToResults={handleBackToResults}
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
    </Modal>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx`
Expected: PASS — all pre-existing tests plus the new `minimize / expand` tests (all green, none modified).

- [ ] **Step 5: Commit**

```bash
git add src/components/YoutubeSearch/YoutubeSearchModal.jsx src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx
git commit -m "feat: delegate YouTube playback to minimizable YoutubePlayerBar"
```

---

### Task 3: Wire `SongHeader` minimize state, songId reset, and re-expand on click

**Files:**
- Modify: `src/components/SongList/SongHeader.jsx`
- Test: `src/components/SongList/__tests__/SongHeader.test.jsx`

**Interfaces:**
- Consumes: `YoutubeSearchModal` from Task 2 — new props `minimized`, `onMinimize`, `onExpand`.
- Produces: no new external props on `SongHeader` itself; `songId` (already an existing prop) now also drives a reset effect.

- [ ] **Step 1: Update the test mock and write the failing tests**

In `src/components/SongList/__tests__/SongHeader.test.jsx`, replace the existing mock (near the top of the file):

```jsx
vi.mock('../../YoutubeSearch/YoutubeSearchModal', () => ({
  YoutubeSearchModal: ({ isOpen, initialVideoId, minimized, onMinimize }) =>
    isOpen ? (
      <div data-testid="yt-modal">
        {initialVideoId ?? 'no-pick'}{minimized ? '-min' : ''}
        <button onClick={onMinimize}>mock-minimize</button>
      </div>
    ) : null,
}))
```

Then add this new `describe` block at the end of the file, after the existing `describe('SongHeader YouTube control — Firecrawl key present', ...)` block:

```jsx
describe('SongHeader YouTube control — minimize/expand', () => {
  beforeEach(() => {
    getFirecrawlKey.mockReturnValue('KEY')
  })

  it('resets the YouTube modal when the song changes', () => {
    const { rerender } = render(<SongHeader {...baseProps} songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: /youtube/i }))
    expect(screen.getByTestId('yt-modal')).toBeInTheDocument()

    rerender(<SongHeader {...baseProps} songId="song-2" />)
    expect(screen.queryByTestId('yt-modal')).not.toBeInTheDocument()
  })

  it('re-expands the modal when YouTube is clicked again after minimizing', () => {
    render(<SongHeader {...baseProps} songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: /youtube/i }))
    fireEvent.click(screen.getByText('mock-minimize'))
    expect(screen.getByTestId('yt-modal')).toHaveTextContent('-min')

    fireEvent.click(screen.getByRole('button', { name: /youtube/i }))
    expect(screen.getByTestId('yt-modal')).not.toHaveTextContent('-min')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/SongList/__tests__/SongHeader.test.jsx`
Expected: FAIL on the two new tests in `SongHeader YouTube control — minimize/expand` (song-switch reset doesn't exist yet; re-click doesn't un-minimize yet). All other tests in the file still pass since the mock change is additive and defaults (`minimized` undefined → falsy) don't alter existing assertions.

- [ ] **Step 3: Write the implementation**

In `src/components/SongList/SongHeader.jsx`, change the import on line 1:

```jsx
import { useState, useEffect } from 'react'
```

Replace the state declarations (lines 35-36):

```jsx
  const [infoOpen, setInfoOpen] = useState(false)
  const [ytModalOpen, setYtModalOpen] = useState(false)
  const [ytMinimized, setYtMinimized] = useState(false)

  useEffect(() => {
    setYtModalOpen(false)
    setYtMinimized(false)
  }, [songId])
```

Replace the YouTube button's `onClick` (currently `onClick={() => setYtModalOpen(true)}`):

```jsx
            onClick={() => { setYtModalOpen(true); setYtMinimized(false) }}
```

Replace the `<YoutubeSearchModal ... />` element at the bottom of the file:

```jsx
      <YoutubeSearchModal
        isOpen={ytModalOpen}
        minimized={ytMinimized}
        onMinimize={() => setYtMinimized(true)}
        onExpand={() => setYtMinimized(false)}
        onClose={() => { setYtModalOpen(false); setYtMinimized(false) }}
        title={meta.title}
        artist={meta.artist}
        initialVideoId={meta.youtubeVideoId}
        onVideoPicked={videoId => onYoutubeVideoPicked?.(videoId)}
      />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/SongList/__tests__/SongHeader.test.jsx`
Expected: PASS — all tests in the file, including the two new ones.

Then run the full suite to confirm no regressions elsewhere:

Run: `npx vitest run`
Expected: PASS — full test suite green.

- [ ] **Step 5: Commit**

```bash
git add src/components/SongList/SongHeader.jsx src/components/SongList/__tests__/SongHeader.test.jsx
git commit -m "feat: minimize YouTube player to a sticky bottom bar per song"
```

---

## Manual verification (after Task 3)

- [ ] **Step 1: Run the app**

Run: `npm run dev`

- [ ] **Step 2: Exercise the golden path in a browser**

Open a song with a Firecrawl key configured (Settings), click **YouTube**, pick a video, confirm it plays full-screen. Click the minimize (−) button — confirm the video keeps playing (audio uninterrupted) and a bottom bar appears with the song title. Scroll the lyrics — confirm they're fully visible above the bar. Click **Expand** — confirm the full player reappears with the same playback position (no restart). Click **Close** — confirm the bar disappears and audio stops. Repeat, then navigate to a different song — confirm the bar/video is gone.
