# In-App YouTube Search & Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the song header's "open YouTube in a new tab" link with an in-app search modal (when a Firecrawl key is configured) that lists candidate videos and plays the chosen one inline, remembering the pick per song.

**Architecture:** A new `youtubeClient.js` reuses the existing Firecrawl integration (`firecrawlSearch`, already used for Ultimate Guitar search) with a `site:youtube.com/watch` query, extracting video IDs from result URLs. A new `YoutubeSearchModal` component (state machine: idle → searching → results → playing) renders results using keyless YouTube thumbnail/embed URLs. The picked video ID is stored on `song.meta.youtubeVideoId` via a new lightweight store action, and round-trips through `.sbp` export/import (and therefore Share and conductor sync) via one field added to each side of the existing export/parse code.

**Tech Stack:** React 18, Zustand, Vitest + @testing-library/react, existing `firecrawlClient.js` (Firecrawl `/search` API), existing `Modal`/`Button` UI components.

## Global Constraints

- No new API key, no new Settings field, no new Worker route — everything rides on the existing Firecrawl key (`getFirecrawlKey()` from `src/lib/storage.js`).
- When no Firecrawl key is configured, the YouTube control must keep its exact current behavior: an `<a target="_blank">` to `youtube.com/results?search_query=...` (built by the existing `src/lib/youtubeSearch.js`). This is unchanged by this plan.
- Thumbnails use `https://i.ytimg.com/vi/{videoId}/hqdefault.jpg` (public, keyless). Playback uses `https://www.youtube.com/embed/{videoId}` (public, keyless iframe).
- The picked video is stored as `meta.youtubeVideoId` (a plain string video ID, or `undefined`/absent if never picked).
- `meta.youtubeVideoId` must round-trip through `.sbp` export/import (field name `YoutubeVideoId` in the exported JSON) — this also covers Share and conductor sync, which reuse the same export/parse code.
- The Community pool (`songbook-worker/src/routes/community.ts`) is explicitly **out of scope** — no changes to `songbook-worker` in this plan.
- Error copy for the modal's search matches `UGSearchModal`'s existing `errorMessage()` strings verbatim: `'Invalid API key — check Settings'` (401) and `'Connection failed — check your internet and try again'` (network error).
- All new/modified files must keep existing tests in `src/components/SongList/__tests__/SongHeader.test.jsx`, `src/test/exportSbp.test.js`, and `src/components/UGImport/__tests__/UGSearchModal.test.jsx` passing unchanged.

---

## Task 1: `youtubeClient.js` — Firecrawl-backed YouTube search

**Files:**
- Create: `src/lib/youtubeImport/youtubeClient.js`
- Test: `src/lib/youtubeImport/__tests__/youtubeClient.test.js`

**Interfaces:**
- Consumes: `firecrawlSearch(query, apiKey, limit = 8)` from `src/lib/ugImport/firecrawlClient.js` (existing, returns `[{ url, title, description }]`, throws `Error('UNAUTHORIZED')` / `Error('NETWORK_ERROR')`).
- Produces: `searchYoutube(query, apiKey): Promise<[{ videoId: string, title: string, url: string }]>` — used by Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/lib/youtubeImport/__tests__/youtubeClient.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../ugImport/firecrawlClient', () => ({
  firecrawlSearch: vi.fn(),
}))

import { firecrawlSearch } from '../../ugImport/firecrawlClient'
import { searchYoutube } from '../youtubeClient'

describe('searchYoutube', () => {
  beforeEach(() => {
    firecrawlSearch.mockReset()
  })

  it('sends a site-restricted query to firecrawlSearch', async () => {
    firecrawlSearch.mockResolvedValue([])
    await searchYoutube('El Shaddai Amy Grant', 'key-123')
    expect(firecrawlSearch).toHaveBeenCalledWith('site:youtube.com/watch El Shaddai Amy Grant', 'key-123')
  })

  it('extracts videoId and strips the trailing " - YouTube" suffix from the title', async () => {
    firecrawlSearch.mockResolvedValue([
      { url: 'https://www.youtube.com/watch?v=abc12345678', title: 'El Shaddai (Live) - YouTube', description: 'd' },
    ])
    const results = await searchYoutube('q', 'key')
    expect(results).toEqual([
      { videoId: 'abc12345678', title: 'El Shaddai (Live)', url: 'https://www.youtube.com/watch?v=abc12345678' },
    ])
  })

  it('filters out results that are not /watch?v= URLs', async () => {
    firecrawlSearch.mockResolvedValue([
      { url: 'https://www.youtube.com/channel/UC123', title: 'Some Channel', description: '' },
      { url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz', title: 'Valid Video - YouTube', description: '' },
    ])
    const results = await searchYoutube('q', 'key')
    expect(results).toHaveLength(1)
    expect(results[0].videoId).toBe('zzzzzzzzzzz')
  })

  it('dedupes results with the same videoId, keeping the first occurrence', async () => {
    firecrawlSearch.mockResolvedValue([
      { url: 'https://www.youtube.com/watch?v=dupdupdupdu', title: 'First - YouTube', description: '' },
      { url: 'https://www.youtube.com/watch?v=dupdupdupdu&t=30s', title: 'Second - YouTube', description: '' },
    ])
    const results = await searchYoutube('q', 'key')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('First')
  })

  it('propagates errors thrown by firecrawlSearch', async () => {
    firecrawlSearch.mockRejectedValue(new Error('UNAUTHORIZED'))
    await expect(searchYoutube('q', 'bad-key')).rejects.toThrow('UNAUTHORIZED')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/youtubeImport/__tests__/youtubeClient.test.js`
Expected: FAIL — `Cannot find module '../youtubeClient'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/youtubeImport/youtubeClient.js`:

```js
import { firecrawlSearch } from '../ugImport/firecrawlClient'

const YT_WATCH_URL_RE = /[?&]v=([\w-]{11})/

function cleanTitle(title) {
  return (title ?? '').replace(/\s*-\s*YouTube\s*$/i, '').trim()
}

/**
 * Search YouTube for videos matching a query, via Firecrawl's generic web
 * search restricted to youtube.com/watch pages (the same site-restriction
 * trick searchUG uses for site:ultimate-guitar.com).
 * Returns deduped [{ videoId, title, url }], first occurrence wins on dupes.
 */
export async function searchYoutube(query, apiKey) {
  const items = await firecrawlSearch(`site:youtube.com/watch ${query}`, apiKey)
  const seen = new Set()
  const results = []
  for (const item of items) {
    const match = YT_WATCH_URL_RE.exec(item.url ?? '')
    if (!match) continue
    const videoId = match[1]
    if (seen.has(videoId)) continue
    seen.add(videoId)
    results.push({ videoId, title: cleanTitle(item.title), url: item.url })
  }
  return results
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/youtubeImport/__tests__/youtubeClient.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtubeImport/youtubeClient.js src/lib/youtubeImport/__tests__/youtubeClient.test.js
git commit -m "feat: add Firecrawl-backed YouTube search client"
```

---

## Task 2: `setSongYoutubeVideo` store action

**Files:**
- Modify: `src/store/libraryStore.js` (insert new action after `backfillSongSbpId`, currently ending at line 543)
- Test: `src/test/libraryStoreYoutubeVideo.test.js` (new)

**Interfaces:**
- Consumes: `loadSong(id)` / `saveSong(song)` from `src/lib/storage.js` (existing, already imported in `libraryStore.js`).
- Produces: `setSongYoutubeVideo(id: string, videoId: string): void` — a Zustand store action, called by Task 5's `SongList.jsx` wiring.

- [ ] **Step 1: Write the failing test**

Create `src/test/libraryStoreYoutubeVideo.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLibraryStore } from '../store/libraryStore';

vi.mock('../lib/storage', () => ({
  saveSong: vi.fn(),
  loadSong: vi.fn(id => (id === 'L1' ? {
    id: 'L1',
    rawText: 'text',
    meta: { title: 'T', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: 120 },
    sections: [],
  } : null)),
  deleteSong: vi.fn(),
  loadIndex: vi.fn(() => []),
  saveIndex: vi.fn(),
  getLastSongId: vi.fn(() => null),
  setLastSongId: vi.fn(),
  clearLastSongId: vi.fn(),
  loadCollections: vi.fn(() => []),
  saveCollections: vi.fn(),
  getViewMode: vi.fn(() => 'collections'),
  saveViewMode: vi.fn(),
  getTransposeState: vi.fn(() => null),
  setTransposeState: vi.fn(),
}));
vi.mock('../lib/albumApi', () => ({ loadMyAlbums: vi.fn(() => []) }));

import { saveSong } from '../lib/storage';

beforeEach(() => {
  vi.clearAllMocks();
  useLibraryStore.setState({ activeSongId: null, activeSong: null });
});

describe('setSongYoutubeVideo', () => {
  it('saves the videoId onto the song meta', () => {
    const { setSongYoutubeVideo } = useLibraryStore.getState();
    setSongYoutubeVideo('L1', 'abc12345678');
    expect(saveSong).toHaveBeenCalledWith(
      expect.objectContaining({ meta: expect.objectContaining({ youtubeVideoId: 'abc12345678' }) }),
    );
  });

  it('refreshes activeSong when the song is currently active', () => {
    useLibraryStore.setState({ activeSongId: 'L1', activeSong: { id: 'L1', meta: {} } });
    const { setSongYoutubeVideo } = useLibraryStore.getState();
    setSongYoutubeVideo('L1', 'xyz98765432');
    expect(useLibraryStore.getState().activeSong.meta.youtubeVideoId).toBe('xyz98765432');
  });

  it('does not touch activeSong when a different song is active', () => {
    useLibraryStore.setState({ activeSongId: 'OTHER', activeSong: { id: 'OTHER', meta: {} } });
    const { setSongYoutubeVideo } = useLibraryStore.getState();
    setSongYoutubeVideo('L1', 'abc12345678');
    expect(useLibraryStore.getState().activeSong.id).toBe('OTHER');
  });

  it('does nothing when the song does not exist', () => {
    const { setSongYoutubeVideo } = useLibraryStore.getState();
    setSongYoutubeVideo('MISSING', 'abc12345678');
    expect(saveSong).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/libraryStoreYoutubeVideo.test.js`
Expected: FAIL — `setSongYoutubeVideo is not a function` (action doesn't exist yet).

- [ ] **Step 3: Write the implementation**

In `src/store/libraryStore.js`, insert immediately after the `backfillSongSbpId` action (after the closing `},` that currently sits at line 543, i.e. right before the `/**\n   * Stamp sharedBaseline...` comment block):

```js
  /**
   * Persist the user's chosen YouTube video for a song, so reopening the
   * in-app YouTube search jumps straight to playback instead of a fresh search.
   */
  setSongYoutubeVideo(id, videoId) {
    const song = loadSong(id)
    if (!song) return
    const updated = { ...song, meta: { ...song.meta, youtubeVideoId: videoId } }
    saveSong(updated)
    if (get().activeSongId === id) {
      set({ activeSong: updated })
    }
  },

```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/libraryStoreYoutubeVideo.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full store test suite to check for regressions**

Run: `npx vitest run src/test/libraryStore* src/test/sessionApi.test.js`
Expected: PASS (all existing store tests unaffected)

- [ ] **Step 6: Commit**

```bash
git add src/store/libraryStore.js src/test/libraryStoreYoutubeVideo.test.js
git commit -m "feat: add setSongYoutubeVideo store action"
```

---

## Task 3: `.sbp` export/import round-trip for `youtubeVideoId`

**Files:**
- Modify: `src/lib/exportSbp.js:128-130` (in `songToSbpJson()`'s returned object)
- Modify: `src/lib/parser/sbpParser.js:169-171` (in `songFromJson()`'s returned `meta` object)
- Test: `src/test/exportSbp.test.js` (extend)

**Interfaces:**
- Consumes: `meta.youtubeVideoId` (set by Task 2's `setSongYoutubeVideo`).
- Produces: `YoutubeVideoId` field in exported `.sbp` JSON; `meta.youtubeVideoId` restored on parse — consumed by Task 5 (`SongHeader`'s `initialVideoId` prop reads `meta.youtubeVideoId`).

- [ ] **Step 1: Write the failing tests**

In `src/test/exportSbp.test.js`, insert these two tests immediately after the existing `it('writes empty string to NotesText when meta.annotation is absent', ...)` test (currently ending at line 195, right before `describe('SBP round-trip (preserves original fields)', ...)`):

```js
  it('maps meta.youtubeVideoId to YoutubeVideoId', async () => {
    const songWithVideo = {
      meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0, youtubeVideoId: 'abc12345678' },
      rawText: '{c: Verse}\nHello world',
    }
    const { json } = await parseZip([songWithVideo])
    expect(json.songs[0].YoutubeVideoId).toBe('abc12345678')
  })

  it('writes null to YoutubeVideoId when meta.youtubeVideoId is absent', async () => {
    const { json } = await parseZip([mockSong])
    expect(json.songs[0].YoutubeVideoId).toBeNull()
  })
```

Also append this new `describe` block at the very end of the file (after the final `describe('conductorCode round-trip', ...)` block):

```js

describe('youtubeVideoId round-trip', () => {
  it('preserves youtubeVideoId through export → parse', async () => {
    const songWithVideo = {
      meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0, youtubeVideoId: 'abc12345678' },
      rawText: '{c: Verse}\nHello world',
    }
    const buf = await buildSbpZip([songWithVideo]).generateAsync({ type: 'arraybuffer' })
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.youtubeVideoId).toBe('abc12345678')
  })

  it('leaves youtubeVideoId undefined when never set', async () => {
    const buf = await buildSbpZip([mockSong]).generateAsync({ type: 'arraybuffer' })
    const { songs } = await parseSbpFile(buf)
    expect(songs[0].meta.youtubeVideoId).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/exportSbp.test.js`
Expected: FAIL on the 4 new tests — `YoutubeVideoId` is `undefined` instead of the expected value/`null`, and parsed `meta.youtubeVideoId` is `undefined` instead of `'abc12345678'` in the round-trip test.

- [ ] **Step 3: Write the implementation — export side**

In `src/lib/exportSbp.js`, in the object returned by `songToSbpJson()` (currently lines 105-144), change:

```js
    Copyright: meta.copyright ?? '',
    NotesText: meta.annotation ?? '',
    appKeyIndex: meta.keyIndex ?? 0,
```

to:

```js
    Copyright: meta.copyright ?? '',
    NotesText: meta.annotation ?? '',
    YoutubeVideoId: meta.youtubeVideoId ?? null,
    appKeyIndex: meta.keyIndex ?? 0,
```

- [ ] **Step 4: Write the implementation — parse side**

In `src/lib/parser/sbpParser.js`, in the `meta` object returned by `songFromJson()` (currently lines 159-185), change:

```js
      copyright: s.Copyright || undefined,
      annotation: s.NotesText || undefined,
      ccli: s.ccli ?? undefined,
```

to:

```js
      copyright: s.Copyright || undefined,
      annotation: s.NotesText || undefined,
      youtubeVideoId: s.YoutubeVideoId || undefined,
      ccli: s.ccli ?? undefined,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/test/exportSbp.test.js`
Expected: PASS (all tests in the file, including the 4 new ones)

- [ ] **Step 6: Run the full SBP round-trip fixture test to check for regressions**

Run: `npx vitest run src/test/sbpRoundTrip.test.js`
Expected: PASS (unaffected — that test only asserts specific pre-existing SBP fields, not an exhaustive field list)

- [ ] **Step 7: Commit**

```bash
git add src/lib/exportSbp.js src/lib/parser/sbpParser.js src/test/exportSbp.test.js
git commit -m "feat: round-trip youtubeVideoId through .sbp export/import"
```

---

## Task 4: `YoutubeSearchModal` component

**Files:**
- Create: `src/components/YoutubeSearch/YoutubeSearchModal.jsx`
- Test: `src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx`

**Interfaces:**
- Consumes: `getFirecrawlKey()` from `src/lib/storage.js` (existing); `searchYoutube(query, apiKey)` from Task 1 (`src/lib/youtubeImport/youtubeClient.js`); `Modal` from `src/components/UI/Modal.jsx`; `Button` from `src/components/UI/Button.jsx`.
- Produces: `YoutubeSearchModal({ isOpen, onClose, title, artist, initialVideoId, onVideoPicked })` — a React component, rendered by Task 5's `SongHeader.jsx`. `onVideoPicked(videoId: string)` is called the instant a result is picked (persist-on-pick).

- [ ] **Step 1: Write the failing test**

Create `src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/storage', () => ({ getFirecrawlKey: () => 'KEY' }))
vi.mock('../../../lib/youtubeImport/youtubeClient', () => ({
  searchYoutube: vi.fn(),
}))

import { searchYoutube } from '../../../lib/youtubeImport/youtubeClient'
import { YoutubeSearchModal } from '../YoutubeSearchModal'

function renderIt(props = {}) {
  return render(
    <YoutubeSearchModal
      isOpen
      onClose={vi.fn()}
      title="El Shaddai"
      artist="Amy Grant"
      initialVideoId={undefined}
      onVideoPicked={vi.fn()}
      {...props}
    />,
  )
}

describe('YoutubeSearchModal', () => {
  beforeEach(() => {
    searchYoutube.mockReset()
  })

  it('pre-fills the search box with title and artist when there is no prior pick', () => {
    renderIt()
    expect(screen.getByPlaceholderText(/Song title or artist/i)).toHaveValue('El Shaddai Amy Grant')
  })

  it('opens directly to playback when initialVideoId is already set', () => {
    renderIt({ initialVideoId: 'abc12345678' })
    const iframe = screen.getByTitle('YouTube video player')
    expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/abc12345678')
    expect(screen.queryByPlaceholderText(/Song title or artist/i)).not.toBeInTheDocument()
  })

  it('shows results after searching', async () => {
    searchYoutube.mockResolvedValue([
      { videoId: 'abc12345678', title: 'El Shaddai (Live)', url: 'https://www.youtube.com/watch?v=abc12345678' },
    ])
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    await screen.findByText('El Shaddai (Live)')
    expect(searchYoutube).toHaveBeenCalledWith('El Shaddai Amy Grant', 'KEY')
  })

  it('clicking a result embeds it and calls onVideoPicked', async () => {
    searchYoutube.mockResolvedValue([
      { videoId: 'abc12345678', title: 'El Shaddai (Live)', url: 'https://www.youtube.com/watch?v=abc12345678' },
    ])
    const onVideoPicked = vi.fn()
    renderIt({ onVideoPicked })
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    const row = await screen.findByText('El Shaddai (Live)')
    fireEvent.click(row)
    expect(onVideoPicked).toHaveBeenCalledWith('abc12345678')
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src', 'https://www.youtube.com/embed/abc12345678',
    )
  })

  it('shows "No videos found" for an empty result set', async () => {
    searchYoutube.mockResolvedValue([])
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    await screen.findByText(/No videos found/i)
  })

  it('shows an error message on search failure', async () => {
    searchYoutube.mockRejectedValue(new Error('UNAUTHORIZED'))
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    await screen.findByText(/Invalid API key/i)
  })

  it('"Search again" from playback returns to the search box', () => {
    renderIt({ initialVideoId: 'abc12345678' })
    fireEvent.click(screen.getByRole('button', { name: /Search again/i }))
    expect(screen.getByPlaceholderText(/Song title or artist/i)).toBeInTheDocument()
  })

  it('includes an "Open on YouTube" fallback link while playing', () => {
    renderIt({ initialVideoId: 'abc12345678' })
    expect(screen.getByRole('link', { name: /Open on YouTube/i })).toHaveAttribute(
      'href', 'https://www.youtube.com/watch?v=abc12345678',
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx`
Expected: FAIL — `Cannot find module '../YoutubeSearchModal'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/components/YoutubeSearch/YoutubeSearchModal.jsx`:

```jsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/YoutubeSearch/YoutubeSearchModal.jsx src/components/YoutubeSearch/__tests__/YoutubeSearchModal.test.jsx
git commit -m "feat: add YoutubeSearchModal (search, results, inline playback)"
```

---

## Task 5: Wire the modal into `SongHeader` and `SongList`

**Files:**
- Modify: `src/components/SongList/SongHeader.jsx` (full current content shown below for context)
- Modify: `src/components/SongList/SongList.jsx`
- Test: `src/components/SongList/__tests__/SongHeader.test.jsx` (extend)

**Interfaces:**
- Consumes: `getFirecrawlKey()` from `src/lib/storage.js`; `YoutubeSearchModal` from Task 4; `youtubeSearchUrl(title, artist)` from `src/lib/youtubeSearch.js` (existing, unchanged); `setSongYoutubeVideo(id, videoId)` from Task 2, selected via `useLibraryStore` in `SongList.jsx`.
- Produces: `SongHeader` gains a new prop `onYoutubeVideoPicked(videoId: string)`.

### Current `SongHeader.jsx` (for reference — lines 1-16 and 105-115 are what change)

```jsx
import { useState } from 'react'
import {
  PencilIcon,
  ArrowsPointingOutIcon,
  ChatBubbleLeftEllipsisIcon,
  MusicalNoteIcon,
  PlayCircleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { TransposeControl } from './TransposeControl'
import { RecorderButton } from '../Recorder/RecorderButton'
import { checkRecorderSupport } from '../../lib/recorderFeatureDetect'
import { youtubeSearchUrl } from '../../lib/youtubeSearch'

const { supported: RECORDER_SUPPORTED } = checkRecorderSupport()

export function SongHeader({
  meta,
  transpose,
  lyricsOnly,
  onPerformanceMode,
  onExportPdf,
  onEdit,
  headerRef,
  annotationsVisible = true,
  onAnnotationsToggle,
  songId,
  recording,
  onPanelOpen,
}) {
```

...and the relevant JSX block (currently lines 105-115):

```jsx
      {/* Row 2: Secondary/utility controls */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <a
          href={youtubeSearchUrl(meta.title, meta.artist)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer"
        >
          <PlayCircleIcon className="w-3.5 h-3.5" />
          YouTube
        </a>
        {hasInfo && (
```

- [ ] **Step 1: Write the failing tests**

In `src/components/SongList/__tests__/SongHeader.test.jsx`, add these two mocks right after the existing `vi.mock('../../../lib/recorderFeatureDetect', ...)` block (near the top of the file):

```js
vi.mock('../../../lib/storage', () => ({ getFirecrawlKey: vi.fn(() => null) }))
vi.mock('../../YoutubeSearch/YoutubeSearchModal', () => ({
  YoutubeSearchModal: ({ isOpen, initialVideoId }) =>
    isOpen ? <div data-testid="yt-modal">{initialVideoId ?? 'no-pick'}</div> : null,
}))
```

Add the import right after the existing `import { SongHeader } from '../SongHeader'` line:

```js
import { getFirecrawlKey } from '../../../lib/storage'
```

Add a file-level `beforeEach` (so every test starts from "no key" unless a specific describe overrides it) — insert this as its own top-level statement, immediately after the `recorderProps` constant declaration (`const recorderProps = { ...baseProps, songId: 'song-abc', recording: baseRecording, onPanelOpen: vi.fn() }`) and before the `describe('SongHeader recorder integration', ...)` block that follows it:

```js
beforeEach(() => {
  getFirecrawlKey.mockReturnValue(null)
})
```

Then append these two new `describe` blocks at the end of the file:

```jsx
describe('SongHeader YouTube control — no Firecrawl key', () => {
  it('renders a plain link to YouTube search', () => {
    render(<SongHeader {...baseProps} />)
    const link = screen.getByRole('link', { name: /youtube/i })
    expect(link).toHaveAttribute(
      'href',
      'https://www.youtube.com/results?search_query=Amazing%20Grace%20John%20Newton',
    )
  })

  it('does not render a YouTube modal-trigger button', () => {
    render(<SongHeader {...baseProps} />)
    expect(screen.queryByRole('button', { name: /youtube/i })).not.toBeInTheDocument()
  })
})

describe('SongHeader YouTube control — Firecrawl key present', () => {
  beforeEach(() => {
    getFirecrawlKey.mockReturnValue('KEY')
  })

  it('renders a button instead of a link', () => {
    render(<SongHeader {...baseProps} />)
    expect(screen.getByRole('button', { name: /youtube/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /youtube/i })).not.toBeInTheDocument()
  })

  it('clicking YouTube opens the search modal with no initial pick', () => {
    render(<SongHeader {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /youtube/i }))
    expect(screen.getByTestId('yt-modal')).toHaveTextContent('no-pick')
  })

  it('opens the modal with the saved videoId when meta.youtubeVideoId is set', () => {
    render(<SongHeader {...baseProps} meta={{ ...baseProps.meta, youtubeVideoId: 'abc12345678' }} />)
    fireEvent.click(screen.getByRole('button', { name: /youtube/i }))
    expect(screen.getByTestId('yt-modal')).toHaveTextContent('abc12345678')
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/components/SongList/__tests__/SongHeader.test.jsx`
Expected: The 2 pre-existing "YouTube link" tests still PASS (no key mocked → falls back to old link behavior, unaffected). The new "Firecrawl key present" tests FAIL — there is no button yet, only the unconditional `<a>` link.

- [ ] **Step 3: Write the implementation — `SongHeader.jsx`**

Change the import block (lines 1-14) to add `useState` usage (already imported) plus two new imports:

```jsx
import { useState } from 'react'
import {
  PencilIcon,
  ArrowsPointingOutIcon,
  ChatBubbleLeftEllipsisIcon,
  MusicalNoteIcon,
  PlayCircleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { TransposeControl } from './TransposeControl'
import { RecorderButton } from '../Recorder/RecorderButton'
import { checkRecorderSupport } from '../../lib/recorderFeatureDetect'
import { youtubeSearchUrl } from '../../lib/youtubeSearch'
import { getFirecrawlKey } from '../../lib/storage'
import { YoutubeSearchModal } from '../YoutubeSearch/YoutubeSearchModal'
```

Add `onYoutubeVideoPicked` to the destructured props (after `onPanelOpen,`):

```jsx
export function SongHeader({
  meta,
  transpose,
  lyricsOnly,
  onPerformanceMode,
  onExportPdf,
  onEdit,
  headerRef,
  annotationsVisible = true,
  onAnnotationsToggle,
  songId,
  recording,
  onPanelOpen,
  onYoutubeVideoPicked,
}) {
```

Add local state right after the existing `const [infoOpen, setInfoOpen] = useState(false)` line:

```jsx
  const [infoOpen, setInfoOpen] = useState(false)
  const [ytModalOpen, setYtModalOpen] = useState(false)
```

Replace the YouTube `<a>` block (currently lines 107-115) with a conditional button/link:

```jsx
        {getFirecrawlKey() ? (
          <button
            type="button"
            onClick={() => setYtModalOpen(true)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer"
          >
            <PlayCircleIcon className="w-3.5 h-3.5" />
            YouTube
          </button>
        ) : (
          <a
            href={youtubeSearchUrl(meta.title, meta.artist)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer"
          >
            <PlayCircleIcon className="w-3.5 h-3.5" />
            YouTube
          </a>
        )}
```

Finally, add the modal render right after the closing `{infoOpen && ( ... )}` block, just before the final closing `</div>` of the component (currently line 192-193):

```jsx
      )}

      <YoutubeSearchModal
        isOpen={ytModalOpen}
        onClose={() => setYtModalOpen(false)}
        title={meta.title}
        artist={meta.artist}
        initialVideoId={meta.youtubeVideoId}
        onVideoPicked={videoId => onYoutubeVideoPicked?.(videoId)}
      />
    </div>
  )
}
```

- [ ] **Step 4: Write the implementation — `SongList.jsx`**

In `src/components/SongList/SongList.jsx`, add the store import (this file does not currently import the store):

```jsx
import { useLibraryStore } from '../../store/libraryStore'
```

Inside the `SongList` component function, add this selector alongside the other hooks near the top (right after `const transpose = useTranspose(...)`):

```jsx
  const setSongYoutubeVideo = useLibraryStore(s => s.setSongYoutubeVideo)
```

Pass the new prop to `<SongHeader ... />` (alongside the other `on*` props):

```jsx
                <SongHeader
                  meta={song.meta}
                  transpose={transpose}
                  lyricsOnly={lyricsOnly}
                  onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
                  onExportPdf={() => exportLyricsPdf(song.meta, song.sections, annotationsVisible)}
                  onEdit={onEdit}
                  annotationsVisible={annotationsVisible}
                  onAnnotationsToggle={() => setAnnotationsVisible(!annotationsVisible)}
                  songId={song.id}
                  recording={recording}
                  onPanelOpen={() => setPanelOpen(true)}
                  onYoutubeVideoPicked={videoId => setSongYoutubeVideo(song.id, videoId)}
                />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/SongList/__tests__/SongHeader.test.jsx`
Expected: PASS (all 17 tests — 13 pre-existing + 4 new)

- [ ] **Step 6: Run the full SongList test suite to check for regressions**

Run: `npx vitest run src/components/SongList`
Expected: PASS (no regressions in `SongList.fitMode.test.jsx`, `MainContent.fitMode.test.jsx`, `SongBody.test.jsx`, `SongView.test.jsx`, `SectionsSidebar.test.jsx`, `SongHeader.headerRef.test.jsx`)

- [ ] **Step 7: Commit**

```bash
git add src/components/SongList/SongHeader.jsx src/components/SongList/SongList.jsx src/components/SongList/__tests__/SongHeader.test.jsx
git commit -m "feat: wire in-app YouTube search modal into the song header"
```

---

## Task 6: Full regression pass

**Files:** None (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: All tests pass (the one pre-existing unrelated flaky test, `UGSearchModal.test.jsx`'s "Searching…" wait-for-text case, is order-dependent and passes in isolation — confirm by re-running it alone if the full-suite run shows it failing)

- [ ] **Step 2: Manually verify in the running app**

Run: `npm run dev` (or use an already-running dev server on another port)

1. Open a song with no Firecrawl key configured (Settings → clear the Firecrawl API key field if one is set) → click "YouTube" → confirm it opens a new tab to `youtube.com/results?search_query=...`, unchanged from before this plan.
2. Add a Firecrawl key in Settings → open a song → click "YouTube" → confirm the modal opens with the search box pre-filled with title + artist.
3. Click "Search" → confirm a result list appears with thumbnails.
4. Click a result → confirm it switches to an embedded, playing video inline in the modal.
5. Close the modal, reopen the song's "YouTube" button → confirm it jumps straight to the same video (no search step).
6. Click "Search again" → pick a different video → confirm the new pick replaces the old one.
7. Export that song via `.sbp` (Sidebar → Export) and re-import it → confirm the YouTube pick survived (clicking "YouTube" on the re-imported song jumps straight to the same video).

- [ ] **Step 3: Confirm no changes were made to `songbook-worker`**

Run: `git status songbook-worker/`
Expected: no changes — this feature required no backend work.
