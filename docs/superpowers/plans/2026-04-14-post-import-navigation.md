# Post-Import Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After importing a song or collection (via file upload or share link), automatically switch the sidebar tab, expand the imported collection, and load the first song in the main content area.

**Architecture:** A new `expandedCollectionId` field in Zustand drives `CollectionGroup` expansion via a `useEffect`. `addSongs` is changed to return `{ newSongIds, collectionId }`. Both the Sidebar's file-import `onSuccess` handler and App.jsx's share-import handler use that return value to call `setViewMode`, `setExpandedCollectionId`, and `selectSong`.

**Tech Stack:** React 18, Zustand, Vitest + @testing-library/react

---

## File Map

| File | Change |
|------|--------|
| `src/store/libraryStore.js` | Add `expandedCollectionId` state + `setExpandedCollectionId` action; change `addSongs` to return `{ newSongIds, collectionId }` |
| `src/hooks/useFileImport.js` | Capture `addSongs` return value; pass it to `onSuccess` |
| `src/components/Sidebar/Sidebar.jsx` | Replace `onSuccess: onImportSuccess` passthrough with navigation handler |
| `src/components/Sidebar/CollectionGroup.jsx` | Read `expandedCollectionId` from store; `useEffect` to auto-expand |
| `src/App.jsx` | Use `addSongs` return value in `handleShareImport` to trigger navigation |
| `src/store/__tests__/libraryStore.viewMode.test.js` | Add tests for `expandedCollectionId` + `setExpandedCollectionId` |
| `src/store/__tests__/libraryStore.collections.test.js` | Add tests for `addSongs` return value |
| `src/hooks/__tests__/useFileImport.test.js` | New file — test that `onSuccess` receives the `addSongs` result |
| `src/components/Sidebar/__tests__/CollectionGroup.expand.test.jsx` | New file — test auto-expand behaviour |
| `src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx` | Update store mock to include new selectors; add `onSuccess` handler tests |

---

### Task 1: Store — `expandedCollectionId` state and `setExpandedCollectionId` action

**Files:**
- Modify: `src/store/libraryStore.js`
- Modify: `src/store/__tests__/libraryStore.viewMode.test.js`

- [ ] **Step 1: Write the failing tests**

Open `src/store/__tests__/libraryStore.viewMode.test.js`. Add `expandedCollectionId: null` to the `beforeEach` `setState` call so the field is reset between tests, then append a new `describe` block:

```js
// In beforeEach — add expandedCollectionId to the existing setState:
beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    index: [],
    collections: [],
    activeSongId: null,
    activeSong: null,
    editingSongId: null,
    viewMode: 'collections',
    expandedCollectionId: null,
  })
})
```

```js
describe('expandedCollectionId', () => {
  it('defaults to null', () => {
    expect(useLibraryStore.getState().expandedCollectionId).toBeNull()
  })

  it('setExpandedCollectionId sets the value', () => {
    useLibraryStore.getState().setExpandedCollectionId('col-1')
    expect(useLibraryStore.getState().expandedCollectionId).toBe('col-1')
  })

  it('setExpandedCollectionId can be set back to null', () => {
    useLibraryStore.getState().setExpandedCollectionId('col-1')
    useLibraryStore.getState().setExpandedCollectionId(null)
    expect(useLibraryStore.getState().expandedCollectionId).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/store/__tests__/libraryStore.viewMode.test.js
```

Expected: 3 new tests FAIL with `expandedCollectionId is not a function` or similar.

- [ ] **Step 3: Add `expandedCollectionId` to the store**

In `src/store/libraryStore.js`, add to the initial state object (near `viewMode`):

```js
viewMode: 'collections',   // 'collections' | 'allSongs'
expandedCollectionId: null, // string | null — drives CollectionGroup auto-expand
```

Then add the action (after `setViewMode`):

```js
/** Set which collection should auto-expand (e.g. after import). */
setExpandedCollectionId(id) {
  set({ expandedCollectionId: id })
},
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/store/__tests__/libraryStore.viewMode.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/libraryStore.js src/store/__tests__/libraryStore.viewMode.test.js
git commit -m "feat: add expandedCollectionId state and setExpandedCollectionId action to store"
```

---

### Task 2: Store — `addSongs` return value

**Files:**
- Modify: `src/store/libraryStore.js`
- Modify: `src/store/__tests__/libraryStore.collections.test.js`

- [ ] **Step 1: Write the failing tests**

Open `src/store/__tests__/libraryStore.collections.test.js`. Add a new `describe` block at the bottom. The existing imports (`saveSong`, `saveIndex`) are already present:

```js
describe('addSongs return value', () => {
  it('returns newSongIds and null collectionId for a single song with no collection name', () => {
    const song = { meta: { title: 'Amazing Grace', artist: '' }, rawText: '', sections: [] }
    const result = useLibraryStore.getState().addSongs([song])
    expect(result.newSongIds).toHaveLength(1)
    expect(result.collectionId).toBeNull()
    // The returned id should match what ended up in the index
    const { index } = useLibraryStore.getState()
    expect(index[0].id).toBe(result.newSongIds[0])
  })

  it('returns newSongIds and the new collectionId when a collection is created', () => {
    const song = { meta: { title: 'Blessed Be', artist: '' }, rawText: '', sections: [] }
    const result = useLibraryStore.getState().addSongs([song], 'Sunday Set')
    expect(result.newSongIds).toHaveLength(1)
    expect(result.collectionId).toBeTruthy()
    const { collections } = useLibraryStore.getState()
    const col = collections.find(c => c.id === result.collectionId)
    expect(col).toBeDefined()
    expect(col.name).toBe('Sunday Set')
    expect(col.songIds).toEqual(result.newSongIds)
  })

  it('returns empty newSongIds when the song id already exists in the index', () => {
    // Seed index with a song that has the same id we will pass to addSongs
    const existingSong = {
      id: 'pre-existing',
      meta: { title: 'Old Song', artist: '' },
      rawText: '',
      sections: [],
      importedAt: '2026-01-01T00:00:00Z',
    }
    saveSong(existingSong)
    saveIndex([{ id: 'pre-existing', title: 'Old Song', artist: '', importedAt: '2026-01-01T00:00:00Z' }])
    useLibraryStore.setState({
      index: [{ id: 'pre-existing', title: 'Old Song', artist: '', importedAt: '2026-01-01T00:00:00Z' }],
    })

    // addSongs with the same id — treated as an update, not a new song
    const result = useLibraryStore.getState().addSongs([existingSong])
    expect(result.newSongIds).toHaveLength(0)
    expect(result.collectionId).toBeNull()
  })

  it('returns the existing collection id when a source-tagged collection already exists', () => {
    const col = {
      id: 'ug-col',
      name: 'Ultimate Guitar',
      createdAt: '2026-01-01T00:00:00Z',
      songIds: [],
      source: 'ug',
    }
    useLibraryStore.setState({ collections: [col] })

    const song = { meta: { title: 'Song X', artist: '' }, rawText: '', sections: [] }
    const result = useLibraryStore.getState().addSongs([song], 'Ultimate Guitar', 'ug')
    expect(result.collectionId).toBe('ug-col')
    expect(result.newSongIds).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/store/__tests__/libraryStore.collections.test.js
```

Expected: 4 new tests FAIL — `addSongs` currently returns `undefined`, so `result.newSongIds` throws.

- [ ] **Step 3: Update `addSongs` to return the result**

In `src/store/libraryStore.js`, modify `addSongs`. Add `let resultCollectionId = null` near the top of the function, set it in the collection-creation block, and add a `return` at the end:

```js
addSongs(songs, collectionName = null, collectionSource = null) {
  const currentIndex = [...get().index]
  const currentCollections = [...get().collections]
  const newSongIds = []
  let resultCollectionId = null  // ← add this

  // Find an existing collection by source tag (e.g. 'ug') to avoid duplicates
  const sourceCollection = collectionSource
    ? currentCollections.find(c => c.source === collectionSource)
    : null

  for (const rawSong of songs) {
    const song = { ...rawSong }
    if (!song.id) song.id = uuidv4()
    if (!song.importedAt) song.importedAt = new Date().toISOString()

    saveSong(song)  // may throw QuotaExceededError — intentionally not caught here

    const existingIdx = currentIndex.findIndex(e => e.id === song.id)

    const entry = {
      id: song.id,
      title: song.meta.title,
      artist: song.meta.artist ?? '',
      importedAt: song.importedAt,
    }

    if (existingIdx >= 0) {
      currentIndex[existingIdx] = entry
    } else {
      currentIndex.push(entry)
      newSongIds.push(song.id)
    }
  }

  if ((collectionName || collectionSource) && newSongIds.length > 0) {
    if (sourceCollection) {
      // Add new songs to the existing source-tagged collection
      const updated = { ...sourceCollection, songIds: [...sourceCollection.songIds, ...newSongIds] }
      const cIdx = currentCollections.findIndex(c => c.id === sourceCollection.id)
      currentCollections[cIdx] = updated
      resultCollectionId = sourceCollection.id  // ← add this
    } else {
      // Create a new collection (optionally tagged with source)
      const newCollection = {
        id: uuidv4(),
        name: collectionName,
        createdAt: new Date().toISOString(),
        songIds: newSongIds,
        ...(collectionSource ? { source: collectionSource } : {}),
      }
      currentCollections.push(newCollection)
      resultCollectionId = newCollection.id  // ← add this
    }
    saveCollections(currentCollections)
  }

  currentIndex.sort((a, b) => a.title.localeCompare(b.title))
  saveIndex(currentIndex)
  set({ index: currentIndex, collections: currentCollections })

  return { newSongIds, collectionId: resultCollectionId }  // ← add this
},
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/store/__tests__/libraryStore.collections.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all tests PASS. (`replaceSong` calls `addSongs` internally and ignores the return value — no breakage.)

- [ ] **Step 6: Commit**

```bash
git add src/store/libraryStore.js src/store/__tests__/libraryStore.collections.test.js
git commit -m "feat: return { newSongIds, collectionId } from addSongs"
```

---

### Task 3: `useFileImport` — pass `addSongs` result to `onSuccess`

**Files:**
- Modify: `src/hooks/useFileImport.js`
- Create: `src/hooks/__tests__/useFileImport.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useFileImport.test.js`:

```js
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFileImport } from '../useFileImport'

const mockAddSongs = vi.fn()

vi.mock('../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      addSongs: mockAddSongs,
      replaceSong: vi.fn(),
      index: [],
    }),
}))

vi.mock('../../lib/parser/chordProParser', () => ({
  parseChordPro: () => ({
    meta: { title: 'Test Song', artist: '' },
    rawText: '',
    sections: [],
  }),
}))

vi.mock('../../lib/parser/sbpParser', () => ({
  parseSbpFile: vi.fn(),
}))

describe('useFileImport onSuccess payload', () => {
  let onError, onSuccess, onDuplicateCheck

  beforeEach(() => {
    onError = vi.fn()
    onSuccess = vi.fn()
    onDuplicateCheck = vi.fn()
    mockAddSongs.mockReturnValue({ newSongIds: ['new-id'], collectionId: null })
  })

  it('passes the addSongs result to onSuccess after importing a .cho file', async () => {
    const { result } = renderHook(() =>
      useFileImport({ onError, onDuplicateCheck, onSuccess })
    )
    const file = new File(['title: Test Song'], 'test.cho', { type: 'text/plain' })
    await result.current.importFiles([file])

    expect(mockAddSongs).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith({ newSongIds: ['new-id'], collectionId: null })
  })

  it('calls onSuccess with empty newSongIds when file type is unsupported', async () => {
    const { result } = renderHook(() =>
      useFileImport({ onError, onDuplicateCheck, onSuccess })
    )
    const file = new File(['data'], 'document.txt', { type: 'text/plain' })
    await result.current.importFiles([file])

    expect(mockAddSongs).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith({ newSongIds: [], collectionId: null })
    expect(onError).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/hooks/__tests__/useFileImport.test.js
```

Expected: both tests FAIL — `onSuccess` is currently called with no arguments.

- [ ] **Step 3: Update `useFileImport.js`**

Open `src/hooks/useFileImport.js`. Make three changes:

1. Add `let lastResult = { newSongIds: [], collectionId: null }` before the `for` loop.
2. Capture the return value of `addSongs` and update `lastResult`.
3. Pass `lastResult` to `onSuccess`.

```js
const importFiles = useCallback(async (files) => {
  let lastResult = { newSongIds: [], collectionId: null }  // ← add

  for (const file of files) {
    const isSbp = /\.(sbp|sbpbackup)$/i.test(file.name)
    const isChordPro = /\.(cho|chordpro|chopro|pro)$/i.test(file.name)

    if (!isSbp && !isChordPro) {
      onError(`"${file.name}" is not a supported file (.sbp, .sbpbackup, .cho, .chordpro, .chopro, .pro)`)
      continue
    }
    try {
      let parsed
      if (isSbp) {
        const buf = await file.arrayBuffer()
        parsed = await parseSbpFile(buf)
      } else {
        const text = await file.text()
        const song = parseChordPro(text, file.name)
        parsed = { songs: [song], collectionName: null, lyricsOnly: false }
      }
      const fileBasedName = file.name.replace(/\.(sbp|sbpbackup|cho|chordpro|chopro|pro)$/i, '')
      const accepted = []

      for (const song of parsed.songs) {
        const duplicate = indexRef.current.find(e => e.title === song.meta.title)

        if (duplicate) {
          const resolution = await onDuplicateCheck(song.meta.title)
          if (resolution === 'replace') {
            replaceSong(duplicate.id, song)
            continue
          } else if (resolution === 'skip') {
            continue
          }
          // 'keep-both' falls through — addSongs will assign a new UUID
        }

        accepted.push(song)
      }

      if (accepted.length > 0) {
        try {
          const effectiveCollectionName = parsed.collectionName ?? (accepted.length > 1 ? fileBasedName : null)
          const result = addSongs(accepted, effectiveCollectionName)  // ← capture return
          lastResult = result                                          // ← update lastResult
        } catch (e) {
          if (e.name === 'QuotaExceededError') {
            onError('Storage is full. Please delete some songs before importing more.')
            return
          }
          throw e
        }
      }
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        onError('Storage is full. Please delete some songs before importing more.')
        return
      }
      console.error('Import error:', e)
      onError(`Could not read "${file.name}". It may be corrupted or use an unsupported format.`)
    }
  }
  onSuccess?.(lastResult)  // ← pass lastResult instead of calling with no args
}, [addSongs, replaceSong, onError, onDuplicateCheck, onSuccess])
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/hooks/__tests__/useFileImport.test.js
```

Expected: both tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useFileImport.js src/hooks/__tests__/useFileImport.test.js
git commit -m "feat: pass addSongs result to onSuccess in useFileImport"
```

---

### Task 4: `CollectionGroup` — auto-expand when `expandedCollectionId` matches

**Files:**
- Modify: `src/components/Sidebar/CollectionGroup.jsx`
- Create: `src/components/Sidebar/__tests__/CollectionGroup.expand.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/Sidebar/__tests__/CollectionGroup.expand.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionGroup } from '../CollectionGroup'

let mockExpandedCollectionId = null

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      deleteCollection: vi.fn(),
      renameCollection: vi.fn(),
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleGroupSelection: vi.fn(),
      expandedCollectionId: mockExpandedCollectionId,
    }),
}))

vi.mock('../SongListItem', () => ({
  SongListItem: ({ entry }) => <li data-testid="song-item">{entry.title}</li>,
}))

const group = {
  id: 'col-1',
  name: 'Sunday Set',
  entries: [
    { id: 's1', title: 'Amazing Grace', artist: '' },
    { id: 's2', title: 'Blessed Be', artist: '' },
  ],
}

describe('CollectionGroup auto-expand', () => {
  beforeEach(() => {
    mockExpandedCollectionId = null
  })

  it('starts collapsed by default', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    expect(screen.queryByTestId('song-item')).not.toBeInTheDocument()
  })

  it('expands when expandedCollectionId matches group.id', () => {
    mockExpandedCollectionId = 'col-1'
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    expect(screen.getAllByTestId('song-item')).toHaveLength(2)
  })

  it('does not expand when expandedCollectionId is a different id', () => {
    mockExpandedCollectionId = 'col-99'
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    expect(screen.queryByTestId('song-item')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/components/Sidebar/__tests__/CollectionGroup.expand.test.jsx
```

Expected: the "expands when expandedCollectionId matches" test FAILS — `CollectionGroup` doesn't yet read `expandedCollectionId`.

- [ ] **Step 3: Update `CollectionGroup.jsx`**

Open `src/components/Sidebar/CollectionGroup.jsx`.

Add `expandedCollectionId` to the store reads (alongside the existing selectors near the top of the component):

```js
const expandedCollectionId = useLibraryStore(s => s.expandedCollectionId)
```

Add a `useEffect` that opens the group when `expandedCollectionId` matches. Place it after the existing `useEffect` blocks:

```js
useEffect(() => {
  if (expandedCollectionId === group.id) setOpen(true)
}, [expandedCollectionId, group.id])
```

`useEffect` is already imported at the top of this file (`import { useState, useRef, useEffect } from 'react'`), so no import change is needed.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/Sidebar/__tests__/CollectionGroup.expand.test.jsx
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar/CollectionGroup.jsx src/components/Sidebar/__tests__/CollectionGroup.expand.test.jsx
git commit -m "feat: auto-expand CollectionGroup when expandedCollectionId matches"
```

---

### Task 5: `Sidebar` — navigation handler in `onSuccess`

**Files:**
- Modify: `src/components/Sidebar/Sidebar.jsx`
- Modify: `src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx`

- [ ] **Step 1: Update the store mock and add failing tests**

Open `src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx`.

At the top of the file, add two new mock functions alongside the existing `mockSetViewMode`:

```js
const mockSetViewMode = vi.fn()
const mockSelectSong = vi.fn()        // ← add
const mockSetExpandedCollectionId = vi.fn()  // ← add
let mockViewMode = 'collections'
```

Update the `useLibraryStore` mock factory to include the new selectors:

```js
vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      index: [],
      collections: [],
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleExportMode: vi.fn(),
      viewMode: mockViewMode,
      setViewMode: mockSetViewMode,
      createCollection: vi.fn(),
      selectSong: mockSelectSong,                          // ← add
      setExpandedCollectionId: mockSetExpandedCollectionId, // ← add
      expandedCollectionId: null,                          // ← add
    }),
}))
```

Change the `useFileImport` mock so it captures the `onSuccess` callback. Replace the existing mock with:

```js
let capturedOnSuccess
vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: (opts) => {
    capturedOnSuccess = opts.onSuccess
    return { importFiles: vi.fn() }
  },
}))
```

Update `beforeEach` to reset the new mocks (and `onImportSuccess` so the call-count assertion is clean):

```js
beforeEach(() => {
  mockViewMode = 'collections'
  mockSetViewMode.mockReset()
  mockSelectSong.mockReset()                      // ← add
  mockSetExpandedCollectionId.mockReset()         // ← add
  defaultProps.onImportSuccess.mockReset()        // ← add: prevents cross-test call count bleed
})
```

Append a new `describe` block after the existing ones:

```js
describe('Sidebar onSuccess navigation', () => {
  it('switches to All Songs and selects the song when a single song is imported', () => {
    render(<Sidebar {...defaultProps} />)
    capturedOnSuccess({ newSongIds: ['song-1'], collectionId: null })
    expect(mockSetViewMode).toHaveBeenCalledWith('allSongs')
    expect(mockSelectSong).toHaveBeenCalledWith('song-1')
    expect(mockSetExpandedCollectionId).not.toHaveBeenCalled()
  })

  it('switches to Collections, sets expanded id, and selects first song when a collection is imported', () => {
    render(<Sidebar {...defaultProps} />)
    capturedOnSuccess({ newSongIds: ['song-1', 'song-2'], collectionId: 'col-1' })
    expect(mockSetViewMode).toHaveBeenCalledWith('collections')
    expect(mockSetExpandedCollectionId).toHaveBeenCalledWith('col-1')
    expect(mockSelectSong).toHaveBeenCalledWith('song-1')
  })

  it('does not navigate when no songs were added', () => {
    render(<Sidebar {...defaultProps} />)
    capturedOnSuccess({ newSongIds: [], collectionId: null })
    expect(mockSetViewMode).not.toHaveBeenCalled()
    expect(mockSelectSong).not.toHaveBeenCalled()
  })

  it('calls onImportSuccess after navigating', () => {
    render(<Sidebar {...defaultProps} />)
    capturedOnSuccess({ newSongIds: ['song-1'], collectionId: null })
    expect(defaultProps.onImportSuccess).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
npx vitest run src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx
```

Expected: the 4 new `Sidebar onSuccess navigation` tests FAIL.

- [ ] **Step 3: Update `Sidebar.jsx`**

Open `src/components/Sidebar/Sidebar.jsx`.

Add two new store selectors (alongside the existing ones near the top of the component):

```js
const selectSong = useLibraryStore(s => s.selectSong)
const setExpandedCollectionId = useLibraryStore(s => s.setExpandedCollectionId)
```

Replace the `useFileImport` call. Change from:

```js
const { importFiles } = useFileImport({
  onError: msg => onAddToast(msg, 'error'),
  onDuplicateCheck,
  onSuccess: onImportSuccess,
})
```

To:

```js
const { importFiles } = useFileImport({
  onError: msg => onAddToast(msg, 'error'),
  onDuplicateCheck,
  onSuccess: ({ newSongIds, collectionId } = {}) => {
    if (newSongIds?.length > 0) {
      if (collectionId) {
        setViewMode('collections')
        setExpandedCollectionId(collectionId)
      } else {
        setViewMode('allSongs')
      }
      selectSong(newSongIds[0])
    }
    onImportSuccess?.()
  },
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar/Sidebar.jsx src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx
git commit -m "feat: navigate to imported song/collection in Sidebar onSuccess handler"
```

---

### Task 6: `App.jsx` — share import navigation

**Files:**
- Modify: `src/App.jsx`

No new unit test — App.jsx has no test file and is difficult to unit-test (URL params, fetch, multiple effects). This task is verified manually via the dev server.

- [ ] **Step 1: Add store selectors to App.jsx**

Open `src/App.jsx`. The existing store reads are:

```js
const init = useLibraryStore(s => s.init)
const addSongs = useLibraryStore(state => state.addSongs)
```

Add three more selectors on the lines immediately after `addSongs`:

```js
const setViewMode = useLibraryStore(state => state.setViewMode)
const setExpandedCollectionId = useLibraryStore(state => state.setExpandedCollectionId)
const selectSong = useLibraryStore(state => state.selectSong)
```

- [ ] **Step 2: Update `handleShareImport`**

Replace the existing `handleShareImport` function with:

```js
function handleShareImport() {
  if (shareSongs) {
    const name = shareSongs.collectionName || 'Shared Songs'
    const { newSongIds, collectionId } = addSongs(shareSongs.songs, name)
    const count = shareSongs.songs.length
    addToast(`${count} song${count !== 1 ? 's' : ''} imported.`, 'success')
    if (shareSongs.lyricsOnly) setSessionLyricsOnly(true)
    setSidebarOpen(true)
    if (newSongIds.length > 0) {
      setViewMode('collections')
      setExpandedCollectionId(collectionId)
      selectSong(newSongIds[0])
    }
  }
  setShareSongs(null)
  clearShareParam()
}
```

- [ ] **Step 3: Run the full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Start the dev server and verify manually**

```bash
npm run dev
```

**Test case A — single song file:**
1. Import a `.cho` or single-song `.sbp` file using the Import button.
2. Verify: sidebar switches to **All Songs** tab, the imported song is highlighted (indigo background), and it loads in the main content area.

**Test case B — multi-song `.sbp` file:**
1. Import an `.sbp` file that contains multiple songs (e.g. the `El_Shaddai.sbp` sample only has one song — use an `.sbp` with a collection).
2. Verify: sidebar switches to **Collections** tab, the newly imported collection is expanded, the first song is highlighted and loaded.

**Test case C — share link import:**
1. In your browser console run: `window.location.search = '?share=<valid-code>'` (or use a real share link generated from the app's Export → Share via link feature).
2. Confirm the **Shared Songbook** modal appears, click **Import All**.
3. Verify: sidebar switches to **Collections** tab, the shared collection is expanded, the first song is highlighted and loaded.

**Test case D — all duplicates skipped:**
1. Import the same song file twice.
2. On the second import, choose **Skip** for the duplicate.
3. Verify: sidebar view and selected song are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: navigate to imported collection after share link import"
```
