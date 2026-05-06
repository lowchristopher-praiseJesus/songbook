# Album Creator Inline UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `AlbumCreatorModal` with an inline two-column album creator in the main content area, add drag-handle track reordering, and add an "Open Album" button to `AlbumDetailView`.

**Architecture:** A new `isCreatingNewAlbum` flag in the Zustand store drives `MainContent` to render a new `NewAlbumCreator` component. The component presents album metadata, recording selection, and track reordering in one two-column view, then runs the upload inline (no modal). On success it sets `activeAlbumCode` and clears `isCreatingNewAlbum`, handing off to the existing `AlbumDetailView`. `AlbumDetailView` gains a full-width "Open Album" primary button. `AlbumCreatorModal` is deleted.

**Tech Stack:** React 18, Zustand, Vitest + @testing-library/react, OPFSClient, Tailwind CSS, `uuid`, HTML5 Drag API

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/store/libraryStore.js` |
| Modify | `src/components/Album/AlbumDetailView.jsx` |
| Modify | `src/components/Album/AlbumsPanel.jsx` |
| Modify | `src/components/Sidebar/Sidebar.jsx` |
| Modify | `src/App.jsx` |
| Modify | `src/components/SongList/MainContent.jsx` |
| Create | `src/components/Album/NewAlbumCreator.jsx` |
| Delete | `src/components/Album/AlbumCreatorModal.jsx` |
| Create | `src/test/albumCreatorStore.test.js` |
| Create | `src/test/AlbumDetailView.test.jsx` |
| Create | `src/test/AlbumsPanel.test.jsx` |
| Create | `src/test/NewAlbumCreator.test.jsx` |

---

## Task 1: Store — add `isCreatingNewAlbum` state

**Files:**
- Modify: `src/store/libraryStore.js` (lines ~25, ~340, ~353)
- Create: `src/test/albumCreatorStore.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/test/albumCreatorStore.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'

describe('isCreatingNewAlbum store actions', () => {
  beforeEach(() => localStorage.clear())

  it('starts false', async () => {
    const { useLibraryStore } = await import('../store/libraryStore')
    expect(useLibraryStore.getState().isCreatingNewAlbum).toBe(false)
  })

  it('setIsCreatingNewAlbum(true) clears activeSongId, activeAlbumCode, editingSongId, isCreatingNewSong', async () => {
    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.setState({ activeSongId: 'abc', activeAlbumCode: 'X', editingSongId: 'y', isCreatingNewSong: true })
    useLibraryStore.getState().setIsCreatingNewAlbum(true)
    const s = useLibraryStore.getState()
    expect(s.isCreatingNewAlbum).toBe(true)
    expect(s.activeSongId).toBeNull()
    expect(s.activeAlbumCode).toBeNull()
    expect(s.editingSongId).toBeNull()
    expect(s.isCreatingNewSong).toBe(false)
  })

  it('setIsCreatingNewAlbum(false) clears flag only', async () => {
    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.setState({ isCreatingNewAlbum: true })
    useLibraryStore.getState().setIsCreatingNewAlbum(false)
    expect(useLibraryStore.getState().isCreatingNewAlbum).toBe(false)
  })

  it('setViewMode clears isCreatingNewAlbum', async () => {
    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.setState({ isCreatingNewAlbum: true })
    useLibraryStore.getState().setViewMode('collections')
    expect(useLibraryStore.getState().isCreatingNewAlbum).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npx vitest run src/test/albumCreatorStore.test.js
```

Expected: all 4 tests FAIL (`isCreatingNewAlbum` does not exist, `setIsCreatingNewAlbum` is not a function).

- [ ] **Step 3: Add `isCreatingNewAlbum` to initial state**

In `src/store/libraryStore.js`, after line 25 (`activeAlbumCode: null,`), add:

```js
  isCreatingNewAlbum: false,
```

- [ ] **Step 4: Add `setIsCreatingNewAlbum` action**

In `src/store/libraryStore.js`, after the `syncAlbums` action (~line 354), add:

```js
  setIsCreatingNewAlbum(val) {
    set({
      isCreatingNewAlbum: val,
      ...(val ? { activeSongId: null, activeSong: null, activeAlbumCode: null, editingSongId: null, isCreatingNewSong: false } : {}),
    })
  },
```

- [ ] **Step 5: Update `setViewMode` to clear `isCreatingNewAlbum`**

In `src/store/libraryStore.js`, replace line 340:

```js
    set({ viewMode: mode, ...(mode !== 'albums' ? { activeAlbumCode: null } : {}), activeCollectionId: null })
```

with:

```js
    set({ viewMode: mode, isCreatingNewAlbum: false, ...(mode !== 'albums' ? { activeAlbumCode: null } : {}), activeCollectionId: null })
```

- [ ] **Step 6: Run tests — expect all pass**

```bash
npx vitest run src/test/albumCreatorStore.test.js
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store/libraryStore.js src/test/albumCreatorStore.test.js
git commit -m "feat(store): add isCreatingNewAlbum flag and setIsCreatingNewAlbum action"
```

---

## Task 2: `AlbumDetailView` — add "Open Album" button

**Files:**
- Modify: `src/components/Album/AlbumDetailView.jsx`
- Create: `src/test/AlbumDetailView.test.jsx`

- [ ] **Step 1: Write failing test**

Create `src/test/AlbumDetailView.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AlbumDetailView } from '../components/Album/AlbumDetailView'

vi.mock('../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    setActiveAlbumCode: vi.fn(),
    syncAlbums: vi.fn(),
  }),
}))

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('../lib/albumApi', () => ({ deleteAlbum: vi.fn(), removeAlbumLocally: vi.fn() }))

const album = {
  albumCode: 'TEST01',
  creatorToken: 'tok',
  title: 'Sunday Worship',
  artist: 'SMTB',
  createdAt: new Date().toISOString(),
  tracks: [{ trackId: 't1', title: 'Amazing Grace', duration: 192000 }],
}

describe('AlbumDetailView', () => {
  it('renders Open Album link with correct href', () => {
    render(<AlbumDetailView album={album} />)
    const link = screen.getByRole('link', { name: /open album/i })
    expect(link).toBeDefined()
    expect(link.href).toContain('?album=TEST01')
    expect(link.target).toBe('_blank')
  })

  it('renders album title', () => {
    render(<AlbumDetailView album={album} />)
    expect(screen.getByText('Sunday Worship')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — expect "Open Album" test to fail**

```bash
npx vitest run src/test/AlbumDetailView.test.jsx
```

Expected: "renders Open Album link" FAIL, "renders album title" PASS.

- [ ] **Step 3: Add "Open Album" button to `AlbumDetailView`**

In `src/components/Album/AlbumDetailView.jsx`, replace the closing `</div>` of the header block (after the `formatDate` line, around line 74):

Before:
```jsx
      <p className="text-sm text-gray-400 dark:text-gray-500">{formatDate(album.createdAt)}</p>
    </div>
```

After:
```jsx
      <p className="text-sm text-gray-400 dark:text-gray-500">{formatDate(album.createdAt)}</p>
      <a
        href={albumUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
      >
        Open Album ↗
      </a>
    </div>
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/test/AlbumDetailView.test.jsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Album/AlbumDetailView.jsx src/test/AlbumDetailView.test.jsx
git commit -m "feat(albums): add Open Album button to AlbumDetailView"
```

---

## Task 3: `AlbumsPanel` — remove modal, add `onNewAlbum` prop

**Files:**
- Modify: `src/components/Album/AlbumsPanel.jsx`
- Create: `src/test/AlbumsPanel.test.jsx`

- [ ] **Step 1: Write failing test**

Create `src/test/AlbumsPanel.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlbumsPanel } from '../components/Album/AlbumsPanel'

const mockSetIsCreatingNewAlbum = vi.fn()

vi.mock('../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    albums: [],
    syncAlbums: vi.fn(),
    setIsCreatingNewAlbum: mockSetIsCreatingNewAlbum,
  }),
}))

describe('AlbumsPanel', () => {
  it('clicking New Album calls setIsCreatingNewAlbum(true) and onNewAlbum prop', () => {
    const onNewAlbum = vi.fn()
    render(<AlbumsPanel onSelect={vi.fn()} onNewAlbum={onNewAlbum} />)
    fireEvent.click(screen.getByText(/\+ New Album/i))
    expect(mockSetIsCreatingNewAlbum).toHaveBeenCalledWith(true)
    expect(onNewAlbum).toHaveBeenCalled()
  })

  it('does not render AlbumCreatorModal', () => {
    render(<AlbumsPanel onSelect={vi.fn()} onNewAlbum={vi.fn()} />)
    // Modal would have a role="dialog" — it should not be present
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npx vitest run src/test/AlbumsPanel.test.jsx
```

Expected: FAIL — `setIsCreatingNewAlbum` not called, modal rendered.

- [ ] **Step 3: Rewrite `AlbumsPanel`**

Replace the entire contents of `src/components/Album/AlbumsPanel.jsx` with:

```jsx
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
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/test/AlbumsPanel.test.jsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Album/AlbumsPanel.jsx src/test/AlbumsPanel.test.jsx
git commit -m "feat(albums): remove AlbumCreatorModal from AlbumsPanel, add onNewAlbum prop"
```

---

## Task 4: Wire `onNewAlbum` through `Sidebar` → `App.jsx`

**Files:**
- Modify: `src/components/Sidebar/Sidebar.jsx` (line 22, line ~290)
- Modify: `src/App.jsx`

No new test file — the wiring is thin and covered by existing smoke tests.

- [ ] **Step 1: Add `onNewAlbum` to `Sidebar` prop signature**

In `src/components/Sidebar/Sidebar.jsx`, replace line 22:

```js
export function Sidebar({ isOpen, onAddToast, onSongSelect, onClose, onImportSuccess, onStartSession, onJoinSession, conductorSync }) {
```

with:

```js
export function Sidebar({ isOpen, onAddToast, onSongSelect, onClose, onImportSuccess, onStartSession, onJoinSession, conductorSync, onNewAlbum }) {
```

- [ ] **Step 2: Pass `onNewAlbum` to `AlbumsPanel` in `Sidebar`**

In `src/components/Sidebar/Sidebar.jsx`, find the line (around line 290):

```jsx
        <AlbumsPanel onSelect={onSongSelect} />
```

Replace with:

```jsx
        <AlbumsPanel onSelect={onSongSelect} onNewAlbum={onNewAlbum} />
```

- [ ] **Step 3: Provide `onNewAlbum` from `App.jsx`**

In `src/App.jsx`, find where `useLibraryStore` selectors are read (it already imports from the store via hooks in child components, but `App.jsx` may need to call `setIsCreatingNewAlbum` — check if it imports `useLibraryStore`). 

Add at the top of the `App` component function, alongside existing state/store reads:

```js
const setIsCreatingNewAlbum = useLibraryStore(s => s.setIsCreatingNewAlbum)
```

Then find the `<Sidebar ... />` JSX (around line 280) and add the `onNewAlbum` prop:

```jsx
              <Sidebar
                isOpen={sidebarOpen}
                onAddToast={addToast}
                onClose={() => setSidebarOpen(false)}
                onSongSelect={() => { if (window.innerWidth < 768) setSidebarOpen(false) }}
                onImportSuccess={() => { if (window.innerWidth < 768) setSidebarOpen(true) }}
                onNewAlbum={() => {
                  setIsCreatingNewAlbum(true)
                  if (window.innerWidth < 768) setSidebarOpen(false)
                }}
                onStartSession={...}
```

(Keep all existing props — only add `onNewAlbum`.)

- [ ] **Step 4: Run existing tests to verify no regressions**

```bash
npx vitest run
```

Expected: all existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar/Sidebar.jsx src/App.jsx
git commit -m "feat(albums): wire onNewAlbum through Sidebar to App, hide sidebar on mobile"
```

---

## Task 5: Create `NewAlbumCreator` component

**Files:**
- Create: `src/components/Album/NewAlbumCreator.jsx`
- Create: `src/test/NewAlbumCreator.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `src/test/NewAlbumCreator.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewAlbumCreator } from '../components/Album/NewAlbumCreator'

const mockSetIsCreatingNewAlbum = vi.fn()
const mockSetActiveAlbumCode = vi.fn()
const mockSyncAlbums = vi.fn()

vi.mock('../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    setIsCreatingNewAlbum: mockSetIsCreatingNewAlbum,
    setActiveAlbumCode: mockSetActiveAlbumCode,
    syncAlbums: mockSyncAlbums,
    index: [],
    collections: [],
  }),
}))

vi.mock('../lib/opfsClient', () => ({
  OPFSClient: {
    create: () => ({
      send: vi.fn().mockResolvedValue([]),
      terminate: vi.fn(),
    }),
  },
}))

vi.mock('../lib/albumApi', () => ({
  createAlbum: vi.fn(),
  uploadTrack: vi.fn(),
  saveAlbumLocally: vi.fn(),
}))

describe('NewAlbumCreator', () => {
  beforeEach(() => {
    mockSetIsCreatingNewAlbum.mockClear()
    mockSetActiveAlbumCode.mockClear()
    mockSyncAlbums.mockClear()
  })

  it('renders title input, artist input, and Publish button', () => {
    render(<NewAlbumCreator />)
    expect(screen.getByPlaceholderText(/album title/i)).toBeDefined()
    expect(screen.getByPlaceholderText(/artist/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /publish album/i })).toBeDefined()
  })

  it('Cancel calls setIsCreatingNewAlbum(false)', () => {
    render(<NewAlbumCreator />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockSetIsCreatingNewAlbum).toHaveBeenCalledWith(false)
  })

  it('Publish button is disabled when no tracks selected', () => {
    render(<NewAlbumCreator />)
    const btn = screen.getByRole('button', { name: /publish album/i })
    expect(btn.disabled).toBe(true)
  })

  it('shows Collections and Songs tabs', () => {
    render(<NewAlbumCreator />)
    expect(screen.getByText('Collections')).toBeDefined()
    expect(screen.getByText('Songs')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — expect failures (file does not exist)**

```bash
npx vitest run src/test/NewAlbumCreator.test.jsx
```

Expected: all 4 FAIL — module not found.

- [ ] **Step 3: Create `NewAlbumCreator.jsx`**

Create `src/components/Album/NewAlbumCreator.jsx` with the full contents below:

```jsx
import { useState, useRef, useEffect } from 'react'
import { OPFSClient } from '../../lib/opfsClient'
import { createAlbum, uploadTrack, saveAlbumLocally } from '../../lib/albumApi'
import { useLibraryStore } from '../../store/libraryStore'
import { v4 as uuidv4 } from 'uuid'

// Duration stored as milliseconds in album recordings
function formatDuration(ms) {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function NewAlbumCreator() {
  const setIsCreatingNewAlbum = useLibraryStore(s => s.setIsCreatingNewAlbum)
  const setActiveAlbumCode = useLibraryStore(s => s.setActiveAlbumCode)
  const syncAlbums = useLibraryStore(s => s.syncAlbums)
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)

  // Metadata
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const fileInputRef = useRef(null)

  // Recording picker
  const [bysong, setBysong] = useState({})  // { [songId]: { song, recordings } }
  const [loadingRecs, setLoadingRecs] = useState(true)
  const [tab, setTab] = useState('collections')
  const clientRef = useRef(null)

  // Track order
  const [orderedTracks, setOrderedTracks] = useState([])
  const dragIdxRef = useRef(null)
  const [dragIdx, setDragIdx] = useState(null)

  // Upload
  const [uploadPhase, setUploadPhase] = useState(null)  // null | 'uploading' | 'error'
  const [uploadProgress, setUploadProgress] = useState({ step: '', current: 0, total: 0 })
  const [uploadError, setUploadError] = useState(null)

  // OPFS client lifecycle
  useEffect(() => {
    clientRef.current = OPFSClient.create()
    return () => clientRef.current?.terminate()
  }, [])

  // Load recordings on mount
  useEffect(() => {
    const client = clientRef.current
    async function load() {
      setLoadingRecs(true)
      const result = {}
      for (const songEntry of index) {
        try {
          const recs = await client.send('list-recordings', { songId: songEntry.id })
          if (recs.length > 0) result[songEntry.id] = { song: songEntry, recordings: recs }
        } catch { /* no recordings for this song */ }
      }
      setBysong(result)
      setLoadingRecs(false)
    }
    load()
  }, [index])  // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke cover preview URL on unmount / change
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }, [coverPreview])

  // ── Metadata handlers ──────────────────────────────────────
  function handleCoverChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverPreview(URL.createObjectURL(file))
  }

  // ── Recording picker handlers ──────────────────────────────
  function isSelected(recordingId) {
    return orderedTracks.some(t => t.recordingId === recordingId)
  }

  function toggleRecording(song, rec) {
    if (isSelected(rec.recordingId)) {
      setOrderedTracks(prev => prev.filter(t => t.recordingId !== rec.recordingId))
    } else {
      setOrderedTracks(prev => [...prev, {
        songId: song.id,
        songTitle: song.title,
        recordingId: rec.recordingId,
        name: rec.name,
        duration: rec.duration ?? 0,
        mimeType: rec.mimeType ?? 'audio/webm',
      }])
    }
  }

  // ── Track order handlers ───────────────────────────────────
  function removeTrack(recordingId) {
    setOrderedTracks(prev => prev.filter(t => t.recordingId !== recordingId))
  }

  function handleDragStart(i) {
    dragIdxRef.current = i
    setDragIdx(i)
  }

  function handleDragOver(e, i) {
    e.preventDefault()
    const from = dragIdxRef.current
    if (from === null || from === i) return
    setOrderedTracks(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(i, 0, item)
      return next
    })
    dragIdxRef.current = i
    setDragIdx(i)
  }

  function handleDragEnd() {
    dragIdxRef.current = null
    setDragIdx(null)
  }

  // ── Publish ────────────────────────────────────────────────
  async function handlePublish() {
    if (uploadPhase === 'uploading' || orderedTracks.length === 0) return
    setUploadPhase('uploading')
    setUploadError(null)

    const client = clientRef.current
    const effectiveTitle = title.trim() || 'Untitled Album'
    const trackMeta = orderedTracks.map(t => ({
      trackId: uuidv4(),
      title: t.name,
      duration: t.duration,
      mimeType: t.mimeType,
      songId: t.songId,
      recordingId: t.recordingId,
    }))
    setUploadProgress({ step: 'Creating album…', current: 0, total: trackMeta.length })

    try {
      const { albumCode, creatorToken } = await createAlbum({
        title: effectiveTitle,
        artist: artist.trim(),
        coverFile: coverFile ?? null,
        tracks: trackMeta.map(({ trackId, title: t, duration, mimeType }) => ({ trackId, title: t, duration, mimeType })),
      })

      for (let i = 0; i < trackMeta.length; i++) {
        const { trackId, title: tTitle, mimeType, songId, recordingId } = trackMeta[i]
        setUploadProgress({ step: `Uploading "${tTitle}"…`, current: i + 1, total: trackMeta.length })
        const buffer = await client.send('read-audio', { songId, recordingId })
        await uploadTrack(albumCode, trackId, buffer, mimeType, creatorToken)
      }

      saveAlbumLocally({
        albumCode, creatorToken, title: effectiveTitle, artist: artist.trim(),
        tracks: trackMeta.map(({ trackId, title: t, duration }) => ({ trackId, title: t, duration })),
      })
      syncAlbums()
      setActiveAlbumCode(albumCode)
      setIsCreatingNewAlbum(false)
    } catch (err) {
      console.error('[NewAlbumCreator] upload error', err)
      setUploadError(err.message)
      setUploadPhase('error')
    }
  }

  function handleCancel() { setIsCreatingNewAlbum(false) }

  // ── Derived ────────────────────────────────────────────────
  const collectionsWithRecordings = collections
    .filter(col => col.songIds?.some(id => id in bysong))
    .map(col => ({
      col,
      entries: (col.songIds ?? []).filter(id => id in bysong).map(id => bysong[id]),
    }))

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New Album</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 hidden sm:block">Select recordings, then publish.</p>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">

        {/* ── Left column ──────────────────────────────────── */}
        <div className="w-full md:w-64 lg:w-72 shrink-0 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto">
          {uploadPhase === 'uploading' ? (
            <div className="flex flex-col items-center justify-center gap-5 p-8 flex-1">
              <div className="text-4xl animate-pulse">🎵</div>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{uploadProgress.step}</p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: uploadProgress.total > 0 ? `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` : '0%' }}
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {uploadProgress.current} of {uploadProgress.total} tracks
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5 p-5 flex-1">
              {/* Metadata */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Album Details</p>
                <div className="flex gap-3 items-start">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-14 h-14 rounded-xl shrink-0 overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center group"
                    aria-label="Choose cover photo"
                  >
                    {coverPreview
                      ? <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                      : <span className="text-2xl">🎵</span>
                    }
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px]">
                      Edit
                    </div>
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
                  <div className="flex-1 flex flex-col gap-2">
                    <input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Album title…"
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={artist}
                      onChange={e => setArtist(e.target.value)}
                      placeholder="Artist / group…"
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Track order */}
              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Track Order
                  {orderedTracks.length > 0 && (
                    <span className="ml-1 font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">
                      · drag ⠿ to reorder
                    </span>
                  )}
                </p>
                {orderedTracks.length === 0 ? (
                  <div className="flex items-center justify-center border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-400 dark:text-gray-500 py-8 text-center px-3">
                    Select recordings on the right →
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 overflow-y-auto">
                    {orderedTracks.map((t, i) => (
                      <div
                        key={t.recordingId}
                        draggable
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={e => handleDragOver(e, i)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
                          dragIdx === i
                            ? 'opacity-50 border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                            : 'border-transparent bg-indigo-50 dark:bg-indigo-900/10 hover:bg-indigo-100 dark:hover:bg-indigo-900/25'
                        }`}
                      >
                        <span className="text-gray-300 dark:text-gray-600 cursor-grab text-base leading-none select-none">⠿</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 w-4 text-right tabular-nums shrink-0">{i + 1}</span>
                        <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{t.name}</span>
                        {t.duration > 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                            {formatDuration(t.duration)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeTrack(t.recordingId)}
                          className="text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-500 transition-colors shrink-0 leading-none"
                          aria-label={`Remove ${t.name}`}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Error state */}
              {uploadPhase === 'error' && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {uploadError ?? 'Upload failed.'} Check your connection and try again.
                </p>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-700 mt-auto">
                <button
                  type="button"
                  disabled={orderedTracks.length === 0}
                  onClick={handlePublish}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Publish Album
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-full py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: recording picker ────────────────── */}
        <div className="flex-1 flex flex-col gap-4 p-5 overflow-hidden min-h-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 shrink-0">
            Select Recordings
          </p>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
            {['collections', 'songs'].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                  tab === t
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t === 'collections' ? 'Collections' : 'Songs'}
              </button>
            ))}
          </div>

          {loadingRecs ? (
            <div className="flex items-center justify-center flex-1 text-sm text-gray-400 dark:text-gray-500">
              Loading recordings…
            </div>
          ) : Object.keys(bysong).length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center px-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">No recordings found.</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Record songs using the Rec button, then come back.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {tab === 'collections' && (
                collectionsWithRecordings.length === 0 ? (
                  <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-8">
                    No collections have recordings yet.
                  </p>
                ) : collectionsWithRecordings.map(({ col, entries }) => (
                  <div key={col.id ?? col.name}>
                    <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wide mb-2">
                      {col.name}
                    </p>
                    <div className="space-y-1">
                      {entries.map(({ song, recordings }) => (
                        <div key={song.id}>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 px-3">
                            {song.title}
                          </p>
                          {recordings.map(rec => (
                            <label
                              key={rec.recordingId}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                isSelected(rec.recordingId)
                                  ? 'bg-indigo-50 dark:bg-indigo-900/20'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected(rec.recordingId)}
                                onChange={() => toggleRecording(song, rec)}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{rec.name}</span>
                              {rec.duration > 0 && (
                                <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                                  {formatDuration(rec.duration)}
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}

              {tab === 'songs' && Object.values(bysong).map(({ song, recordings }) => (
                <div key={song.id}>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    {song.title}
                  </p>
                  <div className="space-y-1">
                    {recordings.map(rec => (
                      <label
                        key={rec.recordingId}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected(rec.recordingId)
                            ? 'bg-indigo-50 dark:bg-indigo-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected(rec.recordingId)}
                          onChange={() => toggleRecording(song, rec)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{rec.name}</span>
                        {rec.duration > 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                            {formatDuration(rec.duration)}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/test/NewAlbumCreator.test.jsx
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Album/NewAlbumCreator.jsx src/test/NewAlbumCreator.test.jsx
git commit -m "feat(albums): add NewAlbumCreator — inline two-column creator with drag-handle reorder"
```

---

## Task 6: Wire `NewAlbumCreator` into `MainContent`

**Files:**
- Modify: `src/components/SongList/MainContent.jsx`

- [ ] **Step 1: Add import at the top of `MainContent.jsx`**

In `src/components/SongList/MainContent.jsx`, after the existing `AlbumDetailView` import (around line 18), add:

```js
import { NewAlbumCreator } from '../Album/NewAlbumCreator'
```

- [ ] **Step 2: Read `isCreatingNewAlbum` from store**

In `src/components/SongList/MainContent.jsx`, after line 32 (`const activeAlbum = ...`), add:

```js
const isCreatingNewAlbum = useLibraryStore(s => s.isCreatingNewAlbum)
```

- [ ] **Step 3: Add render branch as the first check**

In `src/components/SongList/MainContent.jsx`, find the render block that starts (around line 148):

```jsx
      {activeAlbum
        ? <AlbumDetailView album={activeAlbum} />
        : isCreatingNewSong
```

Replace with:

```jsx
      {isCreatingNewAlbum
        ? <NewAlbumCreator />
        : activeAlbum
        ? <AlbumDetailView album={activeAlbum} />
        : isCreatingNewSong
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SongList/MainContent.jsx
git commit -m "feat(albums): render NewAlbumCreator in MainContent when isCreatingNewAlbum is true"
```

---

## Task 7: Delete `AlbumCreatorModal`

**Files:**
- Delete: `src/components/Album/AlbumCreatorModal.jsx`

- [ ] **Step 1: Confirm no remaining imports**

```bash
grep -r "AlbumCreatorModal" /Volumes/HomeX/Chris/Documents/songbook/src
```

Expected: no output (zero references).

- [ ] **Step 2: Delete the file**

```bash
rm src/components/Album/AlbumCreatorModal.jsx
```

- [ ] **Step 3: Run full test suite to confirm nothing broke**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(albums): delete AlbumCreatorModal — replaced by NewAlbumCreator"
```
