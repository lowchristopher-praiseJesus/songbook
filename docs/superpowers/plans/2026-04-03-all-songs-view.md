# All Songs View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "All Songs" view to the sidebar — a flat A–Z list with letter dividers — switchable from the existing Collections view via a persisted segmented control.

**Architecture:** Add `viewMode` state to the Zustand store (persisted via localStorage). A segmented control in the sidebar switches between the two views. `MainContent.jsx` reads the same `viewMode` to determine prev/next navigation order. A new `AllSongsList` component renders the A–Z grouped list.

**Tech Stack:** React 18, Zustand, Tailwind CSS, Vitest + @testing-library/react

---

### Task 1: Storage helpers for viewMode

**Files:**
- Modify: `src/lib/storage.js`
- Modify: `src/lib/__tests__/storage.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `src/lib/__tests__/storage.test.js`:

```js
import {
  saveSong, loadSong, deleteSong, loadIndex, saveIndex,
  getTheme, setTheme, getLastSongId, setLastSongId, getStorageStats,
  getViewMode, saveViewMode,
} from '../storage'

// ... (existing tests unchanged) ...

describe('viewMode', () => {
  it('returns "collections" when nothing is stored', () => {
    expect(getViewMode()).toBe('collections')
  })

  it('returns "allSongs" after saving allSongs', () => {
    saveViewMode('allSongs')
    expect(getViewMode()).toBe('allSongs')
  })

  it('returns "collections" after saving collections', () => {
    saveViewMode('allSongs')
    saveViewMode('collections')
    expect(getViewMode()).toBe('collections')
  })

  it('ignores unknown values and returns "collections"', () => {
    localStorage.setItem('songsheet_view_mode', 'garbage')
    expect(getViewMode()).toBe('collections')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test -- storage
```
Expected: 4 failures in the `viewMode` describe block — `getViewMode is not a function`.

- [ ] **Step 3: Add helpers to storage.js**

Add at the top of `src/lib/storage.js` (after the existing constants):

```js
const VIEW_MODE_KEY = 'songsheet_view_mode'
```

Add at the bottom of `src/lib/storage.js`:

```js
export function getViewMode() {
  const val = localStorage.getItem(VIEW_MODE_KEY)
  return val === 'allSongs' ? 'allSongs' : 'collections'
}

export function saveViewMode(mode) {
  localStorage.setItem(VIEW_MODE_KEY, mode)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- storage
```
Expected: all `storage.test.js` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.js src/lib/__tests__/storage.test.js
git commit -m "feat: add getViewMode/saveViewMode storage helpers"
```

---

### Task 2: viewMode state in libraryStore

**Files:**
- Modify: `src/store/libraryStore.js`
- Create: `src/store/__tests__/libraryStore.viewMode.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/store/__tests__/libraryStore.viewMode.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from '../libraryStore'

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    index: [],
    collections: [],
    activeSongId: null,
    activeSong: null,
    editingSongId: null,
    viewMode: 'collections',
  })
})

describe('viewMode', () => {
  it('defaults to "collections"', () => {
    expect(useLibraryStore.getState().viewMode).toBe('collections')
  })

  it('setViewMode switches to allSongs', () => {
    useLibraryStore.getState().setViewMode('allSongs')
    expect(useLibraryStore.getState().viewMode).toBe('allSongs')
  })

  it('setViewMode persists to localStorage', () => {
    useLibraryStore.getState().setViewMode('allSongs')
    expect(localStorage.getItem('songsheet_view_mode')).toBe('allSongs')
  })

  it('init() restores viewMode from localStorage', () => {
    localStorage.setItem('songsheet_view_mode', 'allSongs')
    useLibraryStore.getState().init()
    expect(useLibraryStore.getState().viewMode).toBe('allSongs')
  })

  it('init() defaults to collections when localStorage is empty', () => {
    useLibraryStore.getState().init()
    expect(useLibraryStore.getState().viewMode).toBe('collections')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test -- libraryStore.viewMode
```
Expected: failures — `viewMode` is undefined and `setViewMode is not a function`.

- [ ] **Step 3: Update libraryStore.js**

In `src/store/libraryStore.js`, add `getViewMode` and `saveViewMode` to the import at the top:

```js
import {
  saveSong, loadSong, deleteSong as deleteFromStorage,
  loadIndex, saveIndex, getLastSongId, setLastSongId, clearLastSongId,
  loadCollections, saveCollections, getViewMode, saveViewMode,
} from '../lib/storage'
```

Add `viewMode` to the initial state (after `selectedSongIds`):

```js
viewMode: 'collections',   // 'collections' | 'allSongs'
```

In `init()`, update the final `set({...})` call to include `viewMode`:

```js
set({
  index: validIndex,
  collections,
  activeSongId: activeSong ? activeSong.id : null,
  activeSong,
  viewMode: getViewMode(),
})
```

Add `setViewMode` action after `toggleGroupSelection`:

```js
/** Switch between 'collections' and 'allSongs' view modes. Persists to localStorage. */
setViewMode(mode) {
  saveViewMode(mode)
  set({ viewMode: mode })
},
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- libraryStore.viewMode
```
Expected: all 5 tests pass.

- [ ] **Step 5: Run full test suite to check no regressions**

```
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/store/libraryStore.js src/store/__tests__/libraryStore.viewMode.test.js
git commit -m "feat: add viewMode state and setViewMode action to libraryStore"
```

---

### Task 3: buildNavOrder utility in collectionUtils

**Files:**
- Modify: `src/lib/collectionUtils.js`
- Create: `src/lib/__tests__/collectionUtils.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/collectionUtils.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildGroups, buildNavOrder } from '../collectionUtils'

const index = [
  { id: 'a', title: 'Amazing Grace', artist: 'Traditional', collectionId: 'c1' },
  { id: 'b', title: 'Blessed Be', artist: 'Matt Redman', collectionId: 'c1' },
  { id: 'c', title: 'El Shaddai', artist: 'Amy Grant', collectionId: 'c2' },
]
const collections = [
  { id: 'c1', name: 'Sunday Set', songIds: ['b', 'a'] },
  { id: 'c2', name: 'Worship', songIds: ['c'] },
]

describe('buildNavOrder', () => {
  it('returns collection order when viewMode is "collections"', () => {
    const order = buildNavOrder(index, collections, 'collections')
    expect(order.map(e => e.id)).toEqual(['b', 'a', 'c'])
  })

  it('returns A-Z order when viewMode is "allSongs"', () => {
    const order = buildNavOrder(index, collections, 'allSongs')
    expect(order.map(e => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('allSongs order is case-insensitive', () => {
    const idx = [
      { id: '1', title: 'zebra', artist: '', collectionId: null },
      { id: '2', title: 'Apple', artist: '', collectionId: null },
      { id: '3', title: 'mango', artist: '', collectionId: null },
    ]
    const order = buildNavOrder(idx, [], 'allSongs')
    expect(order.map(e => e.title)).toEqual(['Apple', 'mango', 'zebra'])
  })

  it('does not mutate the index array', () => {
    const idx = [
      { id: 'z', title: 'Zebra', artist: '', collectionId: null },
      { id: 'a', title: 'Apple', artist: '', collectionId: null },
    ]
    const original = [...idx]
    buildNavOrder(idx, [], 'allSongs')
    expect(idx).toEqual(original)
  })
})

describe('buildGroups', () => {
  it('returns groups with entries from collections', () => {
    const groups = buildGroups(index, collections)
    expect(groups).toHaveLength(2)
    expect(groups[0].name).toBe('Sunday Set')
    expect(groups[0].entries.map(e => e.id)).toEqual(['b', 'a'])
  })

  it('prepends uncategorized group for songs with no collectionId', () => {
    const idx = [...index, { id: 'u', title: 'Uncategorized Song', artist: '', collectionId: null }]
    const groups = buildGroups(idx, collections)
    expect(groups[0].id).toBe('__uncategorized__')
    expect(groups[0].entries[0].id).toBe('u')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test -- collectionUtils
```
Expected: failures on `buildNavOrder` tests — `buildNavOrder is not a function`.

- [ ] **Step 3: Add buildNavOrder to collectionUtils.js**

In `src/lib/collectionUtils.js`, add after `buildGroups`:

```js
/**
 * Returns a flat ordered array of song entries for prev/next navigation.
 * In 'allSongs' mode: sorted A-Z by title.
 * In 'collections' mode: follows collection order via buildGroups.
 */
export function buildNavOrder(index, collections, viewMode) {
  if (viewMode === 'allSongs') {
    return [...index].sort((a, b) => a.title.localeCompare(b.title))
  }
  return buildGroups(index, collections).flatMap(g => g.entries)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- collectionUtils
```
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/collectionUtils.js src/lib/__tests__/collectionUtils.test.js
git commit -m "feat: add buildNavOrder to collectionUtils for view-aware navigation"
```

---

### Task 4: AllSongsList component

**Files:**
- Create: `src/components/Sidebar/AllSongsList.jsx`
- Create: `src/components/Sidebar/__tests__/AllSongsList.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/Sidebar/__tests__/AllSongsList.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AllSongsList } from '../AllSongsList'

// Mock SongListItem to keep tests focused on AllSongsList logic
vi.mock('../SongListItem', () => ({
  SongListItem: ({ entry }) => <li data-testid="song-item">{entry.title}</li>,
}))

const entries = [
  { id: '1', title: 'Amazing Grace', artist: 'Traditional', collectionId: 'c1' },
  { id: '2', title: 'Blessed Be', artist: 'Matt Redman', collectionId: 'c1' },
  { id: '3', title: 'El Shaddai', artist: 'Amy Grant', collectionId: 'c2' },
  { id: '4', title: 'Emmanuel', artist: 'Michael W. Smith', collectionId: 'c2' },
]

describe('AllSongsList', () => {
  it('renders all songs', () => {
    render(<ul><AllSongsList entries={entries} /></ul>)
    expect(screen.getAllByTestId('song-item')).toHaveLength(4)
  })

  it('renders letter dividers for each group', () => {
    render(<ul><AllSongsList entries={entries} /></ul>)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()
  })

  it('does not render duplicate letter dividers', () => {
    render(<ul><AllSongsList entries={entries} /></ul>)
    // Both El Shaddai and Emmanuel start with E — only one E divider
    const eDividers = screen.getAllByText('E')
    expect(eDividers).toHaveLength(1)
  })

  it('renders empty fragment when entries is empty', () => {
    const { container } = render(<ul><AllSongsList entries={[]} /></ul>)
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })

  it('sorts entries A-Z regardless of input order', () => {
    const reversed = [...entries].reverse()
    render(<ul><AllSongsList entries={reversed} /></ul>)
    const items = screen.getAllByTestId('song-item')
    expect(items[0].textContent).toBe('Amazing Grace')
    expect(items[1].textContent).toBe('Blessed Be')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test -- AllSongsList
```
Expected: failures — `AllSongsList` module not found.

- [ ] **Step 3: Create AllSongsList.jsx**

Create `src/components/Sidebar/AllSongsList.jsx`:

```jsx
import { SongListItem } from './SongListItem'

/**
 * Renders all songs in A-Z order with letter-group dividers.
 * Used in the "All Songs" sidebar view.
 */
export function AllSongsList({ entries, onSelect }) {
  const sorted = [...entries].sort((a, b) => a.title.localeCompare(b.title))

  const groups = []
  let currentLetter = null
  for (const entry of sorted) {
    const letter = entry.title[0]?.toUpperCase() ?? '#'
    if (letter !== currentLetter) {
      currentLetter = letter
      groups.push({ letter, entries: [] })
    }
    groups[groups.length - 1].entries.push(entry)
  }

  return groups.map(group => (
    <li key={group.letter} className="list-none">
      <div className="px-3 pt-3 pb-0.5 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest select-none">
        {group.letter}
      </div>
      <ul className="space-y-0.5">
        {group.entries.map(entry => (
          <SongListItem key={entry.id} entry={entry} onSelect={onSelect} />
        ))}
      </ul>
    </li>
  ))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- AllSongsList
```
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar/AllSongsList.jsx src/components/Sidebar/__tests__/AllSongsList.test.jsx
git commit -m "feat: add AllSongsList component with A-Z letter dividers"
```

---

### Task 5: Segmented control in Sidebar

**Files:**
- Modify: `src/components/Sidebar/Sidebar.jsx`
- Create: `src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from '../Sidebar'

// Minimal mocks — only what Sidebar needs to render the control
const mockSetViewMode = vi.fn()
let mockViewMode = 'collections'

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

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: () => ({ importFiles: vi.fn() }),
}))

vi.mock('../../UGImport/UGSearchModal', () => ({
  UGSearchModal: () => null,
}))

vi.mock('../../Share/ShareModal', () => ({
  ShareModal: () => null,
}))

vi.mock('../ExportBackgroundModal', () => ({
  ExportBackgroundModal: () => null,
}))

vi.mock('../../../lib/storage', () => ({
  loadSong: vi.fn(() => null),
}))

const defaultProps = {
  isOpen: true,
  onAddToast: vi.fn(),
  onSongSelect: vi.fn(),
  onClose: vi.fn(),
  onImportSuccess: vi.fn(),
}

describe('Sidebar view toggle', () => {
  beforeEach(() => {
    mockViewMode = 'collections'
    mockSetViewMode.mockReset()
  })

  it('renders Collections and All Songs buttons', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Collections' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All Songs' })).toBeInTheDocument()
  })

  it('calls setViewMode("allSongs") when All Songs is clicked', () => {
    render(<Sidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'All Songs' }))
    expect(mockSetViewMode).toHaveBeenCalledWith('allSongs')
  })

  it('calls setViewMode("collections") when Collections is clicked', () => {
    mockViewMode = 'allSongs'
    render(<Sidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collections' }))
    expect(mockSetViewMode).toHaveBeenCalledWith('collections')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test -- Sidebar.viewMode
```
Expected: failures — `Collections` / `All Songs` buttons not found in DOM.

- [ ] **Step 3: Update Sidebar.jsx**

Add `AllSongsList` import and destructure `viewMode`/`setViewMode` from the store.

At the top of `src/components/Sidebar/Sidebar.jsx`, add the import:

```js
import { AllSongsList } from './AllSongsList'
```

Add two new lines after the `toggleExportMode` line in the store selections (around line 31):

```js
const viewMode = useLibraryStore(s => s.viewMode)
const setViewMode = useLibraryStore(s => s.setViewMode)
```

Replace the existing `{/* Search */}` block and `{/* Song list */}` block (lines 136–174) with:

```jsx
{/* Search */}
<div className="p-3 pb-0 border-b border-gray-200 dark:border-gray-700">
  <input
    type="text"
    placeholder="Search songs..."
    value={query}
    onChange={e => setQuery(e.target.value)}
    className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
      bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
      focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
  />
  {/* View mode toggle — hidden while search is active */}
  {!trimmedQuery && (
    <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5 mb-3">
      <button
        type="button"
        onClick={() => setViewMode('collections')}
        className={`flex-1 text-xs py-1 rounded-md transition-colors ${
          viewMode === 'collections'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        Collections
      </button>
      <button
        type="button"
        onClick={() => setViewMode('allSongs')}
        className={`flex-1 text-xs py-1 rounded-md transition-colors ${
          viewMode === 'allSongs'
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        All Songs
      </button>
    </div>
  )}
</div>

{/* Song list */}
<ul className="flex-1 overflow-y-auto p-2 space-y-0.5" role="list">
  {trimmedQuery ? (
    <>
      {filtered.map(entry => (
        <SongListItem key={entry.id} entry={entry} onSelect={onSongSelect} />
      ))}
      {filtered.length === 0 && (
        <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
          No matches
        </li>
      )}
    </>
  ) : viewMode === 'allSongs' ? (
    <>
      {index.length > 0
        ? <AllSongsList entries={index} onSelect={onSongSelect} />
        : (
          <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
            No songs yet
          </li>
        )
      }
    </>
  ) : (
    <>
      {groups.map(group => (
        <CollectionGroup key={group.id} group={group} onSelect={onSongSelect} />
      ))}
      {groups.length === 0 && (
        <li className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
          No songs yet
        </li>
      )}
    </>
  )}
</ul>
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- Sidebar.viewMode
```
Expected: all 3 tests pass.

- [ ] **Step 5: Run full suite**

```
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar/Sidebar.jsx src/components/Sidebar/__tests__/Sidebar.viewMode.test.jsx
git commit -m "feat: add segmented view-mode control to sidebar"
```

---

### Task 6: Navigation order follows viewMode in MainContent

**Files:**
- Modify: `src/components/SongList/MainContent.jsx`

- [ ] **Step 1: Update the import in MainContent.jsx**

In `src/components/SongList/MainContent.jsx`, update the `collectionUtils` import (line 12):

```js
import { buildNavOrder } from '../../lib/collectionUtils'
```

- [ ] **Step 2: Read viewMode from store**

Add `viewMode` to the store subscriptions (after `editingSongId` on line 24):

```js
const viewMode = useLibraryStore(s => s.viewMode)
```

- [ ] **Step 3: Replace navOrder calculation**

Replace line 35:

```js
// Before:
const navOrder = buildGroups(index, collections).flatMap(g => g.entries)

// After:
const navOrder = buildNavOrder(index, collections, viewMode)
```

- [ ] **Step 4: Verify manually**

Run the dev server:
```
npm run dev
```

1. Import songs from multiple collections.
2. Switch to **All Songs** view in the sidebar.
3. Click a song. Press ArrowRight — confirm the next song follows A–Z order.
4. Switch back to **Collections** view. Press ArrowRight — confirm the next song follows collection order.
5. Reload the page — confirm the selected view is restored.

- [ ] **Step 5: Run full test suite**

```
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/SongList/MainContent.jsx
git commit -m "feat: use view-aware nav order in MainContent (A-Z in allSongs mode)"
```

---

## End-to-End Verification Checklist

- [ ] All songs from multiple .sbp files appear in All Songs view sorted A–Z
- [ ] Letter dividers (A, B, C…) appear only for letters with songs
- [ ] Collections view is unchanged
- [ ] Segmented control persists across page reload (`songsheet_view_mode` in localStorage)
- [ ] Search filters correctly in both views (segmented control hidden during search)
- [ ] Prev/next navigation follows A–Z in All Songs mode, collection order in Collections mode
- [ ] Export mode shows individual song checkboxes in All Songs view (no letter-group checkboxes)
- [ ] `npm test` passes with zero failures
