# Duplicate Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ⧉ button to each collection header that lets the user duplicate it into a new named collection inserted immediately after the source.

**Architecture:** One new store action (`duplicateCollection`) that splices the new collection after the source index. `CollectionGroup` gets an `onDuplicate` prop and renders the ⧉ button. `Sidebar` manages the inline name-prompt state and wires everything together — exactly mirroring the existing "New Collection" inline-input flow.

**Tech Stack:** React 18, Zustand, Vitest + @testing-library/react, Tailwind CSS

---

## Files

- **Modify:** `src/store/libraryStore.js` — add `duplicateCollection` action
- **Modify:** `src/components/Sidebar/CollectionGroup.jsx` — add `onDuplicate` prop + ⧉ button
- **Modify:** `src/components/Sidebar/Sidebar.jsx` — add inline duplicate flow
- **Modify:** `src/store/__tests__/libraryStore.collections.test.js` — store tests
- **Create:** `src/components/Sidebar/__tests__/CollectionGroup.duplicate.test.jsx` — button tests
- **Create:** `src/components/Sidebar/__tests__/Sidebar.duplicate.test.jsx` — inline flow tests

---

### Task 1: `duplicateCollection` store action

**Files:**
- Modify: `src/store/libraryStore.js`
- Modify: `src/store/__tests__/libraryStore.collections.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/store/__tests__/libraryStore.collections.test.js`:

```js
describe('duplicateCollection', () => {
  beforeEach(() => {
    const seed = [
      { id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: ['a', 'b'] },
      { id: 'c2', name: 'Worship', createdAt: '2026-01-01T00:00:00Z', songIds: ['c'] },
    ]
    useLibraryStore.setState({ collections: seed })
    saveCollections(seed)
  })

  it('creates a new collection with the same songIds', () => {
    useLibraryStore.getState().duplicateCollection('c1', 'Copy of Sunday Set')
    const { collections } = useLibraryStore.getState()
    const dupe = collections.find(c => c.name === 'Copy of Sunday Set')
    expect(dupe).toBeTruthy()
    expect(dupe.songIds).toEqual(['a', 'b'])
    expect(dupe.id).not.toBe('c1')
  })

  it('inserts the duplicate immediately after the source', () => {
    useLibraryStore.getState().duplicateCollection('c1', 'Copy of Sunday Set')
    const { collections } = useLibraryStore.getState()
    expect(collections[0].id).toBe('c1')
    expect(collections[1].name).toBe('Copy of Sunday Set')
    expect(collections[2].id).toBe('c2')
  })

  it('persists to localStorage', () => {
    useLibraryStore.getState().duplicateCollection('c1', 'Copy of Sunday Set')
    const saved = loadCollections()
    expect(saved.some(c => c.name === 'Copy of Sunday Set')).toBe(true)
  })

  it('is a no-op when sourceId does not exist', () => {
    useLibraryStore.getState().duplicateCollection('nonexistent', 'Copy')
    expect(useLibraryStore.getState().collections).toHaveLength(2)
  })

  it('is a no-op for blank name', () => {
    useLibraryStore.getState().duplicateCollection('c1', '')
    useLibraryStore.getState().duplicateCollection('c1', '   ')
    expect(useLibraryStore.getState().collections).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/store/__tests__/libraryStore.collections.test.js
```

Expected: 5 new failures with "is not a function" or similar for `duplicateCollection`.

- [ ] **Step 3: Implement `duplicateCollection` in the store**

In `src/store/libraryStore.js`, add after the `setCollectionSongs` action (around line 345):

```js
/**
 * Duplicate a collection by inserting a new collection with the same songIds
 * immediately after the source collection in the list.
 */
duplicateCollection(sourceId, name) {
  const trimmed = name.trim()
  if (!trimmed) return
  const collections = get().collections
  const sourceIndex = collections.findIndex(c => c.id === sourceId)
  if (sourceIndex === -1) return
  const source = collections[sourceIndex]
  const newCollection = {
    id: uuidv4(),
    name: trimmed,
    createdAt: new Date().toISOString(),
    songIds: [...source.songIds],
  }
  const next = [
    ...collections.slice(0, sourceIndex + 1),
    newCollection,
    ...collections.slice(sourceIndex + 1),
  ]
  saveCollections(next)
  set({ collections: next })
},
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/store/__tests__/libraryStore.collections.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/libraryStore.js src/store/__tests__/libraryStore.collections.test.js
git commit -m "feat(store): add duplicateCollection action — inserts after source"
```

---

### Task 2: ⧉ button in `CollectionGroup`

**Files:**
- Modify: `src/components/Sidebar/CollectionGroup.jsx`
- Create: `src/components/Sidebar/__tests__/CollectionGroup.duplicate.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/Sidebar/__tests__/CollectionGroup.duplicate.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionGroup } from '../CollectionGroup'

let mockIsExportMode = false

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      deleteCollection: vi.fn(),
      renameCollection: vi.fn(),
      setCollectionSongs: vi.fn(),
      isExportMode: mockIsExportMode,
      selectedSongIds: new Set(),
      toggleGroupSelection: vi.fn(),
      expandedCollectionId: null,
    }),
}))

vi.mock('../SongListItem', () => ({
  SongListItem: ({ entry }) => <li data-testid="song-item">{entry.title}</li>,
}))

const group = {
  id: 'col-1',
  name: 'Sunday Set',
  entries: [{ id: 's1', title: 'Amazing Grace', artist: '' }],
}

const specialGroup = {
  id: '__uncategorized__',
  name: 'Uncategorized',
  entries: [],
}

describe('CollectionGroup duplicate button', () => {
  beforeEach(() => {
    mockIsExportMode = false
  })

  it('calls onDuplicate with the group id when ⧉ is clicked', () => {
    const onDuplicate = vi.fn()
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} onDuplicate={onDuplicate} /></ul>)
    fireEvent.click(screen.getByRole('button', { name: /Duplicate collection Sunday Set/i }))
    expect(onDuplicate).toHaveBeenCalledWith('col-1')
  })

  it('does not render ⧉ for the __uncategorized__ group', () => {
    render(<ul><CollectionGroup group={specialGroup} onSelect={vi.fn()} onDuplicate={vi.fn()} /></ul>)
    expect(screen.queryByRole('button', { name: /Duplicate collection/i })).not.toBeInTheDocument()
  })

  it('does not render ⧉ in export mode', () => {
    mockIsExportMode = true
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} onDuplicate={vi.fn()} /></ul>)
    expect(screen.queryByRole('button', { name: /Duplicate collection/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/Sidebar/__tests__/CollectionGroup.duplicate.test.jsx
```

Expected: failures — ⧉ button not found.

- [ ] **Step 3: Add `onDuplicate` prop and ⧉ button to `CollectionGroup`**

In `src/components/Sidebar/CollectionGroup.jsx`:

Change line 50 (the component signature) from:

```jsx
export function CollectionGroup({ group, onSelect, onAddSongs = () => {}, onGroupCheckboxChange = () => {} }) {
```

to:

```jsx
export function CollectionGroup({ group, onSelect, onAddSongs = () => {}, onDuplicate = () => {}, onGroupCheckboxChange = () => {} }) {
```

Then in the action buttons area (around line 175–188), add the ⧉ button between the `+` button and the ✏️ button. The `+` button is already wrapped in `{!isSpecial && (...)}`. Add the new button immediately after it:

```jsx
{!isSpecial && (
  <button
    type="button"
    title={`Duplicate ${group.name}`}
    onClick={e => { e.stopPropagation(); onDuplicate(group.id) }}
    aria-label={`Duplicate collection ${group.name}`}
    className="ml-1 p-1 rounded shrink-0 text-xs
      [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
      focus:opacity-100 transition-opacity
      hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
  >
    ⧉
  </button>
)}
```

Place it after the closing `)}` of the `+` button block and before the ✏️ `<button>` element.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/Sidebar/__tests__/CollectionGroup.duplicate.test.jsx
```

Expected: all 3 tests pass.

- [ ] **Step 5: Run existing CollectionGroup tests to check for regressions**

```bash
npx vitest run src/components/Sidebar/__tests__/CollectionGroup.expand.test.jsx src/components/Sidebar/__tests__/CollectionGroup.drag.test.jsx
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar/CollectionGroup.jsx src/components/Sidebar/__tests__/CollectionGroup.duplicate.test.jsx
git commit -m "feat(sidebar): add duplicate button to CollectionGroup"
```

---

### Task 3: Inline duplicate flow in `Sidebar`

**Files:**
- Modify: `src/components/Sidebar/Sidebar.jsx`
- Create: `src/components/Sidebar/__tests__/Sidebar.duplicate.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/Sidebar/__tests__/Sidebar.duplicate.test.jsx`:

```jsx
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from '../Sidebar'

const mockDuplicateCollection = vi.fn()
const mockCreateCollection = vi.fn()

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      index: [],
      collections: [],
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleExportMode: vi.fn(),
      viewMode: 'collections',
      setViewMode: vi.fn(),
      createCollection: mockCreateCollection,
      duplicateCollection: mockDuplicateCollection,
      selectSong: vi.fn(),
      setExpandedCollectionId: vi.fn(),
      expandedCollectionId: null,
    }),
}))

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: () => ({ importFiles: vi.fn() }),
}))

vi.mock('../../UGImport/UGSearchModal', () => ({ UGSearchModal: () => null }))
vi.mock('../../Share/ShareModal', () => ({ ShareModal: () => null }))
vi.mock('../ExportBackgroundModal', () => ({ ExportBackgroundModal: () => null }))
vi.mock('../../Session/LiveSessionModal', () => ({ LiveSessionModal: () => null }))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null), getTransposeState: vi.fn(() => null) }))
vi.mock('../AllSongsList', () => ({ AllSongsList: () => <ul data-testid="all-songs-list" /> }))
vi.mock('../AddSongsModal', () => ({ AddSongsModal: () => null }))

let capturedOnDuplicate

vi.mock('../CollectionGroup', () => ({
  CollectionGroup: ({ group, onDuplicate }) => {
    capturedOnDuplicate = onDuplicate
    return <li data-testid={`group-${group.id}`}>{group.name}</li>
  },
}))

vi.mock('../../../lib/collectionUtils', () => ({
  buildGroups: vi.fn(() => [
    { id: 'col-1', name: 'Sunday Set', entries: [{ id: 's1', title: 'Grace', artist: '' }] },
  ]),
}))

const defaultProps = {
  isOpen: true,
  onAddToast: vi.fn(),
  onSongSelect: vi.fn(),
  onClose: vi.fn(),
  onImportSuccess: vi.fn(),
}

describe('Sidebar duplicate collection flow', () => {
  beforeEach(() => {
    capturedOnDuplicate = null
    mockDuplicateCollection.mockReset()
    mockCreateCollection.mockReset()
  })

  it('shows inline input pre-filled with "Copy of {name}" when onDuplicate fires', () => {
    render(<Sidebar {...defaultProps} />)
    act(() => capturedOnDuplicate('col-1'))
    const input = screen.getByPlaceholderText('Collection name…')
    expect(input.value).toBe('Copy of Sunday Set')
  })

  it('calls duplicateCollection with sourceId and trimmed name on Enter', () => {
    render(<Sidebar {...defaultProps} />)
    act(() => capturedOnDuplicate('col-1'))
    const input = screen.getByPlaceholderText('Collection name…')
    fireEvent.change(input, { target: { value: 'My Duplicate' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockDuplicateCollection).toHaveBeenCalledWith('col-1', 'My Duplicate')
  })

  it('hides the input after Enter', () => {
    render(<Sidebar {...defaultProps} />)
    act(() => capturedOnDuplicate('col-1'))
    const input = screen.getByPlaceholderText('Collection name…')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByPlaceholderText('Collection name…')).not.toBeInTheDocument()
  })

  it('hides the input on Escape without calling duplicateCollection', () => {
    render(<Sidebar {...defaultProps} />)
    act(() => capturedOnDuplicate('col-1'))
    const input = screen.getByPlaceholderText('Collection name…')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mockDuplicateCollection).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Collection name…')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/Sidebar/__tests__/Sidebar.duplicate.test.jsx
```

Expected: failures — input not found in DOM.

- [ ] **Step 3: Add state, store binding, and `confirmDuplicate` to `Sidebar.jsx`**

In `src/components/Sidebar/Sidebar.jsx`:

**a)** Change the React import to add `Fragment`:

```js
import { useState, useRef, useEffect, Fragment } from 'react'
```

**b)** Add `duplicateCollection` to the store bindings (after the `createCollection` line, around line 38):

```js
const duplicateCollection = useLibraryStore(s => s.duplicateCollection)
```

**c)** Add two new state values (after the `collectionDraft` state, around line 42):

```js
const [duplicatingCollectionId, setDuplicatingCollectionId] = useState(null)
const [duplicateDraft, setDuplicateDraft] = useState('')
```

**d)** Add an escape ref for duplicate (after the existing `creatingEscapeRef`, around line 45):

```js
const duplicatingEscapeRef = useRef(false)
```

**e)** Add a `confirmDuplicate` function (after the existing `confirmCreate` function, around line 69):

```js
function confirmDuplicate() {
  if (duplicateDraft.trim()) {
    duplicateCollection(duplicatingCollectionId, duplicateDraft.trim())
  }
  setDuplicatingCollectionId(null)
  setDuplicateDraft('')
}
```

- [ ] **Step 4: Update the `groups.map` render in `Sidebar.jsx`**

Find the current `groups.map` block (around line 318):

```jsx
{groups.map(group => (
  <CollectionGroup
    key={group.id}
    group={group}
    onSelect={onSongSelect}
    onAddSongs={id => setAddSongsTarget({ id, name: group.name })}
    onGroupCheckboxChange={setExportSourceName}
  />
))}
```

Replace it with:

```jsx
{groups.map(group => (
  <Fragment key={group.id}>
    <CollectionGroup
      group={group}
      onSelect={onSongSelect}
      onAddSongs={id => setAddSongsTarget({ id, name: group.name })}
      onDuplicate={id => {
        setDuplicatingCollectionId(id)
        setDuplicateDraft('Copy of ' + group.name)
      }}
      onGroupCheckboxChange={setExportSourceName}
    />
    {duplicatingCollectionId === group.id && (
      <li>
        <div className="px-1 py-1">
          <input
            autoFocus
            type="text"
            value={duplicateDraft}
            onChange={e => setDuplicateDraft(e.target.value)}
            placeholder="Collection name…"
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); confirmDuplicate() }
              if (e.key === 'Escape') {
                duplicatingEscapeRef.current = true
                setDuplicatingCollectionId(null)
                setDuplicateDraft('')
              }
            }}
            onBlur={() => {
              if (duplicatingEscapeRef.current) { duplicatingEscapeRef.current = false; return }
              confirmDuplicate()
            }}
            className="w-full px-2 py-1 text-[16px] rounded border border-indigo-400
              bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
              outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 px-1">
            Enter to confirm · Esc to cancel
          </p>
        </div>
      </li>
    )}
  </Fragment>
))}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/Sidebar/__tests__/Sidebar.duplicate.test.jsx
```

Expected: all 4 tests pass.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/Sidebar/Sidebar.jsx src/components/Sidebar/__tests__/Sidebar.duplicate.test.jsx
git commit -m "feat(sidebar): inline duplicate collection flow"
```
