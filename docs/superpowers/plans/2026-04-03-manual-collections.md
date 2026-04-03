# Manual Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to manually create collections in the sidebar and assign any library songs to them via a modal picker; songs may belong to multiple collections simultaneously.

**Architecture:** Drop the `collectionId` field from index entries — `collections[j].songIds` is already the sole source of truth for display. Add `createCollection` and `setCollectionSongs` store actions. Add an inline "New Collection" input row at the top of the Collections list and an `AddSongsModal` accessible from each `CollectionGroup` header.

**Tech Stack:** React 18, Zustand, Tailwind CSS, Vitest + @testing-library/react

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/store/libraryStore.js` |
| New | `src/store/__tests__/libraryStore.collections.test.js` |
| New | `src/components/Sidebar/AddSongsModal.jsx` |
| New | `src/components/Sidebar/__tests__/AddSongsModal.test.jsx` |
| Modify | `src/components/Sidebar/CollectionGroup.jsx` |
| Modify | `src/components/Sidebar/Sidebar.jsx` |
| Modify | `src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx` |

---

### Task 1: Store — `createCollection` and `setCollectionSongs` actions

**Files:**
- Modify: `src/store/libraryStore.js`
- Create: `src/store/__tests__/libraryStore.collections.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/store/__tests__/libraryStore.collections.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from '../libraryStore'
import { loadCollections } from '../../lib/storage'

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    index: [],
    collections: [],
    activeSongId: null,
    activeSong: null,
    editingSongId: null,
  })
})

describe('createCollection', () => {
  it('adds a collection with empty songIds', () => {
    useLibraryStore.getState().createCollection('Sunday Set')
    const { collections } = useLibraryStore.getState()
    expect(collections).toHaveLength(1)
    expect(collections[0].name).toBe('Sunday Set')
    expect(collections[0].songIds).toEqual([])
    expect(collections[0].id).toBeTruthy()
    expect(collections[0].createdAt).toBeTruthy()
  })

  it('persists to localStorage', () => {
    useLibraryStore.getState().createCollection('Sunday Set')
    const saved = loadCollections()
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Sunday Set')
  })

  it('is a no-op for empty or whitespace-only name', () => {
    useLibraryStore.getState().createCollection('')
    useLibraryStore.getState().createCollection('   ')
    expect(useLibraryStore.getState().collections).toHaveLength(0)
  })

  it('trims whitespace from name', () => {
    useLibraryStore.getState().createCollection('  Worship Night  ')
    expect(useLibraryStore.getState().collections[0].name).toBe('Worship Night')
  })
})

describe('setCollectionSongs', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['a', 'b'] },
      ],
    })
    localStorage.setItem('songsheet_collections', JSON.stringify([
      { id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['a', 'b'] },
    ]))
  })

  it('replaces songIds on the named collection', () => {
    useLibraryStore.getState().setCollectionSongs('c1', ['a', 'c', 'd'])
    const { collections } = useLibraryStore.getState()
    expect(collections[0].songIds).toEqual(['a', 'c', 'd'])
  })

  it('persists to localStorage', () => {
    useLibraryStore.getState().setCollectionSongs('c1', ['x'])
    const saved = loadCollections()
    expect(saved[0].songIds).toEqual(['x'])
  })

  it('can set to empty array', () => {
    useLibraryStore.getState().setCollectionSongs('c1', [])
    expect(useLibraryStore.getState().collections[0].songIds).toEqual([])
  })

  it('does not affect other collections', () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['a'] },
        { id: 'c2', name: 'Worship', createdAt: '2026-01-01T00:00:00Z', songIds: ['b'] },
      ],
    })
    useLibraryStore.getState().setCollectionSongs('c1', ['x'])
    const { collections } = useLibraryStore.getState()
    expect(collections.find(c => c.id === 'c2').songIds).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/store/__tests__/libraryStore.collections.test.js
```

Expected: all tests fail with "not a function" or similar.

- [ ] **Step 3: Implement `createCollection` and `setCollectionSongs` in the store**

In `src/store/libraryStore.js`, add these two actions inside the `create((set, get) => ({...}))` object, after `setViewMode`:

```js
  /** Create a new empty collection with the given name. No-op if name is blank. */
  createCollection(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const newCollection = {
      id: uuidv4(),
      name: trimmed,
      createdAt: new Date().toISOString(),
      songIds: [],
    }
    const collections = [...get().collections, newCollection]
    saveCollections(collections)
    set({ collections })
  },

  /**
   * Replace the songIds array on a collection.
   * Used by AddSongsModal to apply the user's checked selection.
   */
  setCollectionSongs(collectionId, songIds) {
    const collections = get().collections.map(c =>
      c.id === collectionId ? { ...c, songIds } : c
    )
    saveCollections(collections)
    set({ collections })
  },
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/store/__tests__/libraryStore.collections.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/libraryStore.js src/store/__tests__/libraryStore.collections.test.js
git commit -m "feat: add createCollection and setCollectionSongs store actions"
```

---

### Task 2: Store — `init()` migration

Strip `collectionId` from index entries on load and stop dropping empty collections during repair.

**Files:**
- Modify: `src/store/libraryStore.js`
- Modify: `src/store/__tests__/libraryStore.collections.test.js`

- [ ] **Step 1: Add failing tests**

Append to `src/store/__tests__/libraryStore.collections.test.js`:

```js
import { saveIndex, saveSong } from '../../lib/storage'

describe('init() migration', () => {
  it('strips collectionId from index entries on load', () => {
    saveSong({ id: 's1', meta: { title: 'Song 1', artist: '' }, importedAt: '2026-01-01T00:00:00Z', rawText: '', sections: [] })
    saveIndex([{ id: 's1', title: 'Song 1', artist: '', importedAt: '2026-01-01T00:00:00Z', collectionId: 'c1' }])
    useLibraryStore.getState().init()
    const { index } = useLibraryStore.getState()
    expect(index[0]).not.toHaveProperty('collectionId')
  })

  it('preserves empty collections during repair', () => {
    localStorage.setItem('songsheet_collections', JSON.stringify([
      { id: 'c1', name: 'Empty Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] },
    ]))
    useLibraryStore.getState().init()
    const { collections } = useLibraryStore.getState()
    expect(collections).toHaveLength(1)
    expect(collections[0].name).toBe('Empty Set')
  })
})
```

Also update the import line at the top of the file to include `saveIndex` and `saveSong`:

```js
import { loadCollections, saveIndex, saveSong } from '../../lib/storage'
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/store/__tests__/libraryStore.collections.test.js
```

Expected: the two new tests fail.

- [ ] **Step 3: Update `init()` in the store**

In `src/store/libraryStore.js`, replace the `init()` method body with:

```js
  init() {
    const rawIndex = loadIndex()
    const lastId = getLastSongId()

    // Repair: remove index entries with missing data, strip legacy collectionId field
    const validIds_set = new Set()
    const validIndex = rawIndex
      .filter(entry => loadSong(entry.id) !== null)
      .map(({ collectionId: _dropped, ...rest }) => rest)
    validIndex.forEach(e => validIds_set.add(e.id))

    if (validIndex.length !== rawIndex.length || rawIndex.some(e => 'collectionId' in e)) {
      saveIndex(validIndex)
    }

    // Repair collections: remove stale songIds, but keep empty collections
    let collections = loadCollections()
    let collectionsChanged = false
    collections = collections.map(c => {
      const filtered = c.songIds.filter(id => validIds_set.has(id))
      if (filtered.length !== c.songIds.length) collectionsChanged = true
      return { ...c, songIds: filtered }
    })
    if (collectionsChanged) saveCollections(collections)

    const activeSong = lastId ? loadSong(lastId) : null

    set({
      index: validIndex,
      collections,
      activeSongId: activeSong ? activeSong.id : null,
      activeSong,
      viewMode: getViewMode(),
    })
  },
```

- [ ] **Step 4: Run all store tests to confirm they pass**

```bash
npx vitest run src/store/__tests__/
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/libraryStore.js src/store/__tests__/libraryStore.collections.test.js
git commit -m "feat: strip collectionId from index on init, preserve empty collections"
```

---

### Task 3: Store — clean up `deleteCollection`, `removeSongFromCollection`, `addSongs`, `replaceSong`

Remove all code that reads or writes `collectionId` on index entries.

**Files:**
- Modify: `src/store/libraryStore.js`
- Modify: `src/store/__tests__/libraryStore.collections.test.js`

- [ ] **Step 1: Add failing tests**

Append to `src/store/__tests__/libraryStore.collections.test.js`:

```js
import { loadIndex } from '../../lib/storage'

describe('deleteCollection', () => {
  it('removes the collection without touching index entries', () => {
    saveSong({ id: 's1', meta: { title: 'Song', artist: '' }, importedAt: '2026-01-01T00:00:00Z', rawText: '', sections: [] })
    saveIndex([{ id: 's1', title: 'Song', artist: '', importedAt: '2026-01-01T00:00:00Z' }])
    useLibraryStore.setState({
      index: [{ id: 's1', title: 'Song', artist: '', importedAt: '2026-01-01T00:00:00Z' }],
      collections: [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['s1'] }],
    })
    useLibraryStore.getState().deleteCollection('c1')
    const { collections, index } = useLibraryStore.getState()
    expect(collections).toHaveLength(0)
    // index entry must not have been modified (no collectionId to clear)
    expect(index[0]).toEqual({ id: 's1', title: 'Song', artist: '', importedAt: '2026-01-01T00:00:00Z' })
  })
})

describe('replaceSong preserves collection membership', () => {
  it('keeps song in all collections it belonged to after replace', () => {
    const song = { id: 's1', meta: { title: 'Song', artist: '' }, importedAt: '2026-01-01T00:00:00Z', rawText: '', sections: [] }
    saveSong(song)
    saveIndex([{ id: 's1', title: 'Song', artist: '', importedAt: '2026-01-01T00:00:00Z' }])
    useLibraryStore.setState({
      index: [{ id: 's1', title: 'Song', artist: '', importedAt: '2026-01-01T00:00:00Z' }],
      collections: [
        { id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['s1'] },
        { id: 'c2', name: 'Worship', createdAt: '2026-01-01T00:00:00Z', songIds: ['s1'] },
      ],
    })
    const newSong = { ...song, meta: { ...song.meta, title: 'Renamed Song' } }
    useLibraryStore.getState().replaceSong('s1', newSong)
    const { collections } = useLibraryStore.getState()
    expect(collections.find(c => c.id === 'c1').songIds).toContain('s1')
    expect(collections.find(c => c.id === 'c2').songIds).toContain('s1')
  })
})
```

Update the import line to add `loadIndex`:

```js
import { loadCollections, loadIndex, saveIndex, saveSong } from '../../lib/storage'
```

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
npx vitest run src/store/__tests__/libraryStore.collections.test.js
```

Expected: the two new `describe` blocks fail.

- [ ] **Step 3: Update `deleteCollection`**

Replace the current `deleteCollection` method in `src/store/libraryStore.js` with:

```js
  /**
   * Remove a collection without deleting its songs.
   * Songs remain in the library; membership is purely tracked via collections[j].songIds.
   */
  deleteCollection(collectionId) {
    const newCollections = get().collections.filter(c => c.id !== collectionId)
    saveCollections(newCollections)
    set({ collections: newCollections })
  },
```

- [ ] **Step 4: Update `removeSongFromCollection`**

Replace the current `removeSongFromCollection` method with:

```js
  /**
   * Remove a song from a specific collection without deleting it from the library.
   * Drops the collection if it becomes empty.
   */
  removeSongFromCollection(songId, collectionId) {
    const collections = get().collections
      .map(c => c.id === collectionId
        ? { ...c, songIds: c.songIds.filter(id => id !== songId) }
        : c
      )
      .filter(c => c.songIds.length > 0)
    saveCollections(collections)
    set({ collections })
  },
```

- [ ] **Step 5: Update `addSongs` to stop writing `collectionId` to index entries**

In the `addSongs` method, find and replace the `entry` object construction. The current code computes `existingCollectionId` and `collectionId` before building the entry. Replace from the `existingCollectionId` line through the `entry` object so it no longer includes `collectionId`:

Find this block:
```js
      const existingCollectionId = existingIdx >= 0 ? currentIndex[existingIdx].collectionId : (_preservedCollectionId ?? null)
      // When adding to a source-tagged collection we know the target ID immediately;
      // when creating a new named collection the ID is patched below.
      const collectionId = (collectionName || collectionSource)
        ? (sourceCollection ? sourceCollection.id : null)
        : existingCollectionId

      const entry = {
        id: song.id,
        title: song.meta.title,
        artist: song.meta.artist ?? '',
        importedAt: song.importedAt,
        collectionId,
      }
```

Replace with:
```js
      const entry = {
        id: song.id,
        title: song.meta.title,
        artist: song.meta.artist ?? '',
        importedAt: song.importedAt,
      }
```

Also remove the destructuring of `_preservedCollectionId` from the song loop — find:
```js
      const { _preservedCollectionId, ...songData } = rawSong
      const song = { ...songData }
```
Replace with:
```js
      const song = { ...rawSong }
```

- [ ] **Step 6: Update `replaceSong` to remove `_preservedCollectionId`**

Replace the current `replaceSong` method with:

```js
  /**
   * Replace an existing song (used for "overwrite" duplicate resolution).
   * The same song ID is reused so all collections retain their membership automatically.
   */
  replaceSong(id, newSong) {
    deleteFromStorage(id)
    const filteredIndex = get().index.filter(e => e.id !== id)
    set({ index: filteredIndex })
    get().addSongs([{ ...newSong, id }])
    if (get().activeSongId === id) {
      get().selectSong(id)
    }
  },
```

- [ ] **Step 7: Run all store tests**

```bash
npx vitest run src/store/__tests__/
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/store/libraryStore.js src/store/__tests__/libraryStore.collections.test.js
git commit -m "refactor: remove collectionId from index entries, clean up store actions"
```

---

### Task 4: `AddSongsModal` component

**Files:**
- Create: `src/components/Sidebar/AddSongsModal.jsx`
- Create: `src/components/Sidebar/__tests__/AddSongsModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/Sidebar/__tests__/AddSongsModal.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AddSongsModal } from '../AddSongsModal'

const mockSetCollectionSongs = vi.fn()

const mockIndex = [
  { id: 's1', title: 'Amazing Grace', artist: 'Traditional' },
  { id: 's2', title: 'El Shaddai', artist: 'Amy Grant' },
  { id: 's3', title: 'Oceans', artist: 'Hillsong' },
]

const mockCollections = [
  { id: 'c1', name: 'Sunday Set', songIds: ['s1'] },
  { id: 'c2', name: 'Worship Night', songIds: ['s3'] },
]

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      index: mockIndex,
      collections: mockCollections,
      setCollectionSongs: mockSetCollectionSongs,
    }),
}))

const defaultProps = {
  isOpen: true,
  collectionId: 'c1',
  collectionName: 'Sunday Set',
  onClose: vi.fn(),
}

describe('AddSongsModal', () => {
  beforeEach(() => {
    mockSetCollectionSongs.mockReset()
    defaultProps.onClose.mockReset()
  })

  it('renders all library songs', () => {
    render(<AddSongsModal {...defaultProps} />)
    expect(screen.getByLabelText(/Amazing Grace/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/El Shaddai/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Oceans/i)).toBeInTheDocument()
  })

  it('pre-checks songs already in the collection', () => {
    render(<AddSongsModal {...defaultProps} />)
    expect(screen.getByLabelText(/Amazing Grace/i)).toBeChecked()
    expect(screen.getByLabelText(/El Shaddai/i)).not.toBeChecked()
  })

  it('toggling a checkbox updates the selection', () => {
    render(<AddSongsModal {...defaultProps} />)
    const elShaddai = screen.getByLabelText(/El Shaddai/i)
    fireEvent.click(elShaddai)
    expect(elShaddai).toBeChecked()
    fireEvent.click(elShaddai)
    expect(elShaddai).not.toBeChecked()
  })

  it('Save calls setCollectionSongs with checked ids and closes', () => {
    render(<AddSongsModal {...defaultProps} />)
    // s1 is pre-checked; check s2 as well
    fireEvent.click(screen.getByLabelText(/El Shaddai/i))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mockSetCollectionSongs).toHaveBeenCalledWith('c1', expect.arrayContaining(['s1', 's2']))
    expect(mockSetCollectionSongs.mock.calls[0][1]).toHaveLength(2)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('Cancel does not call setCollectionSongs', () => {
    render(<AddSongsModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockSetCollectionSongs).not.toHaveBeenCalled()
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('filter input hides non-matching songs', () => {
    render(<AddSongsModal {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'grace' } })
    expect(screen.getByLabelText(/Amazing Grace/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/El Shaddai/i)).not.toBeInTheDocument()
  })

  it('shows collection badge for songs in other collections', () => {
    render(<AddSongsModal {...defaultProps} />)
    // Oceans is in Worship Night (c2), not in Sunday Set (c1)
    expect(screen.getByText('Worship Night')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/components/Sidebar/__tests__/AddSongsModal.test.jsx
```

Expected: all fail — component does not exist yet.

- [ ] **Step 3: Create `AddSongsModal.jsx`**

Create `src/components/Sidebar/AddSongsModal.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'

export function AddSongsModal({ isOpen, collectionId, collectionName, onClose }) {
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const setCollectionSongs = useLibraryStore(s => s.setCollectionSongs)
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (isOpen && collectionId) {
      const col = collections.find(c => c.id === collectionId)
      setCheckedIds(new Set(col?.songIds ?? []))
      setFilter('')
    }
  }, [isOpen, collectionId, collections])

  const sorted = [...index].sort((a, b) => a.title.localeCompare(b.title))
  const trimmed = filter.trim().toLowerCase()
  const visible = trimmed
    ? sorted.filter(e =>
        e.title.toLowerCase().includes(trimmed) ||
        (e.artist ?? '').toLowerCase().includes(trimmed)
      )
    : sorted

  // Map songId -> first other-collection name (for badge display)
  const otherCollectionLabel = {}
  for (const col of collections) {
    if (col.id === collectionId) continue
    for (const sid of col.songIds) {
      if (!otherCollectionLabel[sid]) otherCollectionLabel[sid] = col.name
    }
  }

  function toggle(id) {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSave() {
    setCollectionSongs(collectionId, [...checkedIds])
    onClose()
  }

  return (
    <Modal isOpen={isOpen} title={`Add songs to "${collectionName}"`} onClose={onClose}>
      <input
        type="text"
        placeholder="Filter songs..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
          bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
      />
      <ul className="max-h-64 overflow-y-auto space-y-0.5 mb-4">
        {visible.map(entry => (
          <li key={entry.id}>
            <label
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
                hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <input
                type="checkbox"
                aria-label={entry.title}
                checked={checkedIds.has(entry.id)}
                onChange={() => toggle(entry.id)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">
                {entry.title}
              </span>
              {entry.artist && (
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  {entry.artist}
                </span>
              )}
              {otherCollectionLabel[entry.id] && (
                <span className="text-xs text-indigo-400 dark:text-indigo-500 shrink-0 max-w-24 truncate">
                  {otherCollectionLabel[entry.id]}
                </span>
              )}
            </label>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
            No songs found
          </li>
        )}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>Save</Button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/Sidebar/__tests__/AddSongsModal.test.jsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar/AddSongsModal.jsx src/components/Sidebar/__tests__/AddSongsModal.test.jsx
git commit -m "feat: add AddSongsModal component"
```

---

### Task 5: `CollectionGroup` — `onAddSongs` prop and "+ Songs" button

**Files:**
- Modify: `src/components/Sidebar/CollectionGroup.jsx`

- [ ] **Step 1: Add `onAddSongs` prop and button**

In `src/components/Sidebar/CollectionGroup.jsx`, update the component signature and the action buttons section.

Change the function signature from:
```js
export function CollectionGroup({ group, onSelect }) {
```
To:
```js
export function CollectionGroup({ group, onSelect, onAddSongs }) {
```

Then, inside `{!editing && !isExportMode && (`, add the "+ Songs" button **before** the ✏️ button:

Replace:
```jsx
        {!editing && !isExportMode && (
          <>
            <button
              type="button"
              onClick={handleEditClick}
              aria-label={`Rename collection ${group.name}`}
              className="ml-1 p-1 rounded shrink-0
                [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                focus:opacity-100 transition-opacity
                hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
            >
              ✏️
            </button>
            {!isSpecial && (
              <button
                type="button"
                onClick={handleDelete}
                aria-label={`Delete collection ${group.name}`}
                className="ml-1 mr-1 p-1 rounded shrink-0
                  [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                  focus:opacity-100 transition-opacity
                  hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              >
                🗑
              </button>
            )}
          </>
        )}
```

With:
```jsx
        {!editing && !isExportMode && (
          <>
            {!isSpecial && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onAddSongs(group.id) }}
                aria-label={`Add songs to ${group.name}`}
                className="ml-1 p-1 rounded shrink-0 text-xs font-bold
                  [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                  focus:opacity-100 transition-opacity
                  hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              >
                +
              </button>
            )}
            <button
              type="button"
              onClick={handleEditClick}
              aria-label={`Rename collection ${group.name}`}
              className="ml-1 p-1 rounded shrink-0
                [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                focus:opacity-100 transition-opacity
                hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
            >
              ✏️
            </button>
            {!isSpecial && (
              <button
                type="button"
                onClick={handleDelete}
                aria-label={`Delete collection ${group.name}`}
                className="ml-1 mr-1 p-1 rounded shrink-0
                  [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                  focus:opacity-100 transition-opacity
                  hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              >
                🗑
              </button>
            )}
          </>
        )}
```

- [ ] **Step 2: Run the full test suite to check nothing broke**

```bash
npx vitest run
```

Expected: all existing tests pass. (CollectionGroup has no dedicated test file; it is rendered indirectly via Sidebar tests which mock the component.)

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar/CollectionGroup.jsx
git commit -m "feat: add onAddSongs button to CollectionGroup"
```

---

### Task 6: Sidebar — "+ New Collection" row and `AddSongsModal` wiring

**Files:**
- Modify: `src/components/Sidebar/Sidebar.jsx`
- Modify: `src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx`

- [ ] **Step 1: Update the Sidebar viewMode test mock**

In `src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx`, add `createCollection: vi.fn()` to the mock store selector object so Sidebar can call it without errors.

Find:
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
    }),
}))
```

Replace with:
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
    }),
}))
```

- [ ] **Step 2: Run Sidebar tests to confirm they still pass before making changes**

```bash
npx vitest run src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx
```

Expected: all pass.

- [ ] **Step 3: Update `Sidebar.jsx`**

In `src/components/Sidebar/Sidebar.jsx`:

**a) Add new state and store selector at the top of the component:**

After the `setViewMode` line:
```js
  const setViewMode = useLibraryStore(s => s.setViewMode)
```

Add:
```js
  const createCollection = useLibraryStore(s => s.createCollection)
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [collectionDraft, setCollectionDraft] = useState('')
  const [addSongsTarget, setAddSongsTarget] = useState(null) // { id, name } | null
```

**b) Add `confirmCreate` helper** (after the `resolveDuplicate` function):

```js
  function confirmCreate() {
    if (collectionDraft.trim()) {
      createCollection(collectionDraft.trim())
    }
    setCreatingCollection(false)
    setCollectionDraft('')
  }
```

**c) Add `AddSongsModal` import** at the top of the file alongside the other Sidebar imports:

```js
import { AddSongsModal } from './AddSongsModal'
```

**d) Replace the collections branch of the song list** (the `<> {groups.map(...)} </>` block) with:

```jsx
        ) : (
          <>
            {/* New Collection trigger */}
            <li>
              {creatingCollection ? (
                <div className="px-1 py-1">
                  <input
                    autoFocus
                    type="text"
                    value={collectionDraft}
                    onChange={e => setCollectionDraft(e.target.value)}
                    placeholder="Collection name…"
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); confirmCreate() }
                      if (e.key === 'Escape') { setCreatingCollection(false); setCollectionDraft('') }
                    }}
                    onBlur={confirmCreate}
                    className="w-full px-2 py-1 text-xs rounded border border-indigo-400
                      bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                      outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 px-1">
                    Enter to create · Esc to cancel
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingCollection(true)}
                  className="w-full flex items-center gap-1 px-2 py-1 text-xs
                    text-indigo-500 dark:text-indigo-400
                    border border-dashed border-gray-300 dark:border-gray-600 rounded
                    hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20
                    transition-colors"
                >
                  + New Collection
                </button>
              )}
            </li>
            {groups.map(group => (
              <CollectionGroup
                key={group.id}
                group={group}
                onSelect={onSongSelect}
                onAddSongs={id => setAddSongsTarget({ id, name: group.name })}
              />
            ))}
            {groups.length === 0 && !creatingCollection && (
              <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                No songs yet
              </li>
            )}
          </>
```

**e) Render `AddSongsModal`** alongside the other modals at the bottom (just before the closing `</>`), after the `<UGSearchModal>` block:

```jsx
      <AddSongsModal
        isOpen={!!addSongsTarget}
        collectionId={addSongsTarget?.id ?? null}
        collectionName={addSongsTarget?.name ?? ''}
        onClose={() => setAddSongsTarget(null)}
      />
```

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar/Sidebar.jsx src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx
git commit -m "feat: add New Collection row and AddSongsModal to Sidebar"
```

---

### Task 7: Smoke test in the browser

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify the feature end-to-end**

1. Open the app. Switch to Collections view in the sidebar.
2. Click "+ New Collection", type a name (e.g. "CNY 2026"), press Enter → collection appears with count 0.
3. Hover the new collection header → "+" button appears. Click it.
4. AddSongsModal opens. Check several songs. Click Save.
5. Collection count updates. Expand the collection → songs appear.
6. Open AddSongsModal again → previously checked songs are pre-checked.
7. Uncheck a song, Save → it disappears from the collection.
8. Import a new song from an `.sbp` file → it appears in the modal with no collection badge.
9. Add the same song to two collections → it appears under both in the sidebar.
10. Reload the page → all collections and memberships are preserved.

- [ ] **Step 3: Commit if any minor fixes were needed**

```bash
git add -p   # stage only intentional fixes
git commit -m "fix: <describe what was fixed>"
```
