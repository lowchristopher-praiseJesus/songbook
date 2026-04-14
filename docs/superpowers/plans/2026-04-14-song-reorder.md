# Song Reorder Within Collections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow songs within a named collection to be manually reordered via drag-and-drop, with order persisted to localStorage.

**Architecture:** A thin `SortableSongListItem` wrapper (co-located in `CollectionGroup.jsx`) calls `useSortable` and passes drag handle props down to `SongListItem`. Each open collection's song list is wrapped in `DndContext` + `SortableContext`. On drop, `arrayMove` produces the new `songIds` order, saved via the existing `setCollectionSongs` store action. The uncategorized virtual group is excluded from all DnD wiring.

**Tech Stack:** @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, Vitest + @testing-library/react

---

### Task 1: Install @dnd-kit packages

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install packages**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: three packages added to `node_modules` and listed under `dependencies` in `package.json`.

- [ ] **Step 2: Verify no peer dependency errors**

```bash
npm ls @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: all three packages listed without `UNMET PEER DEPENDENCY` warnings.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @dnd-kit/core, sortable, utilities"
```

---

### Task 2: Add drag handle prop support to SongListItem

**Files:**
- Modify: `src/components/Sidebar/SongListItem.jsx`
- Create: `src/components/Sidebar/__tests__/SongListItem.dragHandle.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/Sidebar/__tests__/SongListItem.dragHandle.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SongListItem } from '../SongListItem'

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      selectSong: vi.fn(),
      deleteSong: vi.fn(),
      removeSongFromCollection: vi.fn(),
      activeSongId: null,
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleSongSelection: vi.fn(),
      viewMode: 'collections',
    }),
}))

const entry = { id: 's1', title: 'Amazing Grace', artist: 'Amy Grant' }

describe('SongListItem drag handle', () => {
  it('does not render a drag handle by default', () => {
    render(<ul><SongListItem entry={entry} onSelect={vi.fn()} /></ul>)
    expect(screen.queryByLabelText('Drag to reorder')).not.toBeInTheDocument()
  })

  it('renders a drag handle when dragHandleListeners is provided', () => {
    render(
      <ul>
        <SongListItem
          entry={entry}
          onSelect={vi.fn()}
          dragHandleListeners={{ onPointerDown: vi.fn() }}
        />
      </ul>
    )
    expect(screen.getByLabelText('Drag to reorder')).toBeInTheDocument()
  })

  it('applies opacity-40 to the row when isDragging is true', () => {
    const { container } = render(
      <ul>
        <SongListItem
          entry={entry}
          onSelect={vi.fn()}
          dragHandleListeners={{ onPointerDown: vi.fn() }}
          isDragging={true}
        />
      </ul>
    )
    expect(container.querySelector('li')).toHaveClass('opacity-40')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/components/Sidebar/__tests__/SongListItem.dragHandle.test.jsx
```

Expected: 3 failures — `dragHandleListeners` prop not yet accepted.

- [ ] **Step 3: Update SongListItem to accept and render drag handle props**

Replace the full contents of `src/components/Sidebar/SongListItem.jsx`:

```jsx
import { useLibraryStore } from '../../store/libraryStore'

export function SongListItem({
  entry,
  onSelect,
  collectionId = null,
  sortableRef = null,
  sortableStyle = {},
  dragHandleListeners = null,
  dragHandleAttributes = {},
  isDragging = false,
}) {
  const selectSong = useLibraryStore(s => s.selectSong)
  const deleteSong = useLibraryStore(s => s.deleteSong)
  const removeSongFromCollection = useLibraryStore(s => s.removeSongFromCollection)
  const activeSongId = useLibraryStore(s => s.activeSongId)
  const isExportMode = useLibraryStore(s => s.isExportMode)
  const selectedSongIds = useLibraryStore(s => s.selectedSongIds)
  const toggleSongSelection = useLibraryStore(s => s.toggleSongSelection)
  const viewMode = useLibraryStore(s => s.viewMode)

  const isActive = !isExportMode && activeSongId === entry.id
  const isSelected = isExportMode && selectedSongIds.has(entry.id)

  function handleDelete(e) {
    e.stopPropagation()
    if (viewMode === 'collections' && collectionId !== null) {
      if (window.confirm(`Remove "${entry.title}" from this collection?`)) {
        removeSongFromCollection(entry.id, collectionId)
      }
    } else {
      if (window.confirm(`Delete "${entry.title}"?`)) {
        deleteSong(entry.id)
      }
    }
  }

  function handleRowClick() {
    if (isExportMode) {
      toggleSongSelection(entry.id)
    } else {
      selectSong(entry.id)
      onSelect?.()
    }
  }

  return (
    <li
      ref={sortableRef}
      style={sortableStyle}
      className={`flex items-center group${isDragging ? ' opacity-40' : ''}`}
    >
      {dragHandleListeners && (
        <span
          {...dragHandleListeners}
          {...dragHandleAttributes}
          aria-label="Drag to reorder"
          className="ml-1 mr-0.5 text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing shrink-0 select-none touch-none"
        >
          ⠿
        </span>
      )}
      {isExportMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleSongSelection(entry.id)}
          onClick={e => e.stopPropagation()}
          className="ml-2 mr-1 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />
      )}
      <button
        type="button"
        onClick={handleRowClick}
        className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg cursor-pointer
          ${isSelected
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-gray-900 dark:text-gray-100'
            : isActive
              ? 'bg-indigo-600 text-white'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
          }`}
      >
        <div className="text-sm font-medium truncate">{entry.title}</div>
        {entry.artist && (
          <div className={`text-xs truncate ${isActive ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>
            {entry.artist}
          </div>
        )}
      </button>
      {!isExportMode && (
        <button
          type="button"
          onClick={handleDelete}
          aria-label={`Delete ${entry.title}`}
          className={`ml-1 mr-1 p-1 rounded focus:opacity-100 transition-opacity shrink-0
            [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
            ${isActive ? 'hover:bg-indigo-700 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500'}`}
        >
          🗑
        </button>
      )}
    </li>
  )
}
```

- [ ] **Step 4: Run new tests to confirm they pass**

```bash
npx vitest run src/components/Sidebar/__tests__/SongListItem.dragHandle.test.jsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar/SongListItem.jsx \
        src/components/Sidebar/__tests__/SongListItem.dragHandle.test.jsx
git commit -m "feat: add drag handle prop support to SongListItem"
```

---

### Task 3: Wire drag-and-drop into CollectionGroup

**Files:**
- Modify: `src/components/Sidebar/CollectionGroup.jsx`
- Create: `src/components/Sidebar/__tests__/CollectionGroup.drag.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/Sidebar/__tests__/CollectionGroup.drag.test.jsx`:

```jsx
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionGroup } from '../CollectionGroup'

let capturedOnDragEnd = null
const mockSetCollectionSongs = vi.fn()

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }) => {
    capturedOnDragEnd = onDragEnd
    return <>{children}</>
  },
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    listeners: { onPointerDown: vi.fn() },
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  arrayMove: (arr, oldIndex, newIndex) => {
    const result = [...arr]
    const [item] = result.splice(oldIndex, 1)
    result.splice(newIndex, 0, item)
    return result
  },
  verticalListSortingStrategy: 'vertical',
  sortableKeyboardCoordinates: vi.fn(),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      deleteCollection: vi.fn(),
      renameCollection: vi.fn(),
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleGroupSelection: vi.fn(),
      expandedCollectionId: null,
      setCollectionSongs: mockSetCollectionSongs,
    }),
}))

vi.mock('../SongListItem', () => ({
  SongListItem: ({ entry, dragHandleListeners }) => (
    <li data-testid="song-item">
      {dragHandleListeners && <span data-testid="drag-handle">⠿</span>}
      {entry.title}
    </li>
  ),
}))

const group = {
  id: 'col-1',
  name: 'Sunday Set',
  entries: [
    { id: 's1', title: 'Amazing Grace', artist: '' },
    { id: 's2', title: 'Blessed Be', artist: '' },
  ],
}

describe('CollectionGroup drag-and-drop', () => {
  beforeEach(() => {
    capturedOnDragEnd = null
    mockSetCollectionSongs.mockClear()
  })

  it('renders drag handles on each song in a real collection', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    fireEvent.click(screen.getByText('Sunday Set'))
    expect(screen.getAllByTestId('drag-handle')).toHaveLength(2)
  })

  it('calls setCollectionSongs with reordered ids when drag ends', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    fireEvent.click(screen.getByText('Sunday Set'))
    act(() => {
      capturedOnDragEnd({ active: { id: 's2' }, over: { id: 's1' } })
    })
    expect(mockSetCollectionSongs).toHaveBeenCalledWith('col-1', ['s2', 's1'])
  })

  it('does not call setCollectionSongs when dropped on the same item', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    fireEvent.click(screen.getByText('Sunday Set'))
    act(() => {
      capturedOnDragEnd({ active: { id: 's1' }, over: { id: 's1' } })
    })
    expect(mockSetCollectionSongs).not.toHaveBeenCalled()
  })

  it('does not call setCollectionSongs when dropped outside the list', () => {
    render(<ul><CollectionGroup group={group} onSelect={vi.fn()} /></ul>)
    fireEvent.click(screen.getByText('Sunday Set'))
    act(() => {
      capturedOnDragEnd({ active: { id: 's1' }, over: null })
    })
    expect(mockSetCollectionSongs).not.toHaveBeenCalled()
  })
})

describe('CollectionGroup drag disabled for uncategorized', () => {
  it('does not render drag handles for the __uncategorized__ group', () => {
    const uncatGroup = {
      id: '__uncategorized__',
      name: 'Uncategorized',
      entries: [{ id: 's1', title: 'Amazing Grace', artist: '' }],
    }
    render(<ul><CollectionGroup group={uncatGroup} onSelect={vi.fn()} /></ul>)
    fireEvent.click(screen.getByText('Uncategorized'))
    expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/components/Sidebar/__tests__/CollectionGroup.drag.test.jsx
```

Expected: 5 failures — @dnd-kit imports not yet in `CollectionGroup.jsx`.

- [ ] **Step 3: Update CollectionGroup with DnD wiring**

Replace the full contents of `src/components/Sidebar/CollectionGroup.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLibraryStore } from '../../store/libraryStore'
import { SongListItem } from './SongListItem'

function SortableSongListItem({ entry, onSelect, collectionId }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <SongListItem
      entry={entry}
      onSelect={onSelect}
      collectionId={collectionId}
      sortableRef={setNodeRef}
      sortableStyle={style}
      dragHandleListeners={listeners}
      dragHandleAttributes={attributes}
      isDragging={isDragging}
    />
  )
}

export function CollectionGroup({ group, onSelect, onAddSongs = () => {}, onGroupCheckboxChange = () => {} }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(group.name)
  const inputRef = useRef(null)
  const checkboxRef = useRef(null)
  const deleteCollection = useLibraryStore(s => s.deleteCollection)
  const renameCollection = useLibraryStore(s => s.renameCollection)
  const setCollectionSongs = useLibraryStore(s => s.setCollectionSongs)
  const isExportMode = useLibraryStore(s => s.isExportMode)
  const selectedSongIds = useLibraryStore(s => s.selectedSongIds)
  const toggleGroupSelection = useLibraryStore(s => s.toggleGroupSelection)
  const expandedCollectionId = useLibraryStore(s => s.expandedCollectionId)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (editing) {
      setDraft(group.name)
      inputRef.current?.select()
    }
  }, [editing, group.name])

  const groupIds = group.entries.map(e => e.id)
  const selectedCount = groupIds.filter(id => selectedSongIds.has(id)).length
  const allSelected = groupIds.length > 0 && selectedCount === groupIds.length
  const someSelected = selectedCount > 0 && !allSelected

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  useEffect(() => {
    if (expandedCollectionId === group.id) setOpen(true)
  }, [expandedCollectionId, group.id])

  function handleDelete(e) {
    e.stopPropagation()
    if (window.confirm(`Remove collection "${group.name}"? The ${group.entries.length} song${group.entries.length !== 1 ? 's' : ''} will remain in your library.`)) {
      deleteCollection(group.id)
    }
  }

  function handleEditClick(e) {
    e.stopPropagation()
    setEditing(true)
  }

  function commitRename() {
    if (draft.trim() && draft.trim() !== group.name) {
      renameCollection(group.id, draft.trim())
    }
    setEditing(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { setEditing(false) }
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const songIds = group.entries.map(e => e.id)
    const oldIndex = songIds.indexOf(active.id)
    const newIndex = songIds.indexOf(over.id)
    setCollectionSongs(group.id, arrayMove(songIds, oldIndex, newIndex))
  }

  const isSpecial = group.id === '__uncategorized__'

  return (
    <li>
      <div className="flex items-center group">
        {isExportMode && (
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              onGroupCheckboxChange(allSelected ? null : group.name)
              toggleGroupSelection(groupIds)
            }}
            onClick={e => e.stopPropagation()}
            className="ml-2 mr-1 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          />
        )}
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 px-2 py-1 text-xs font-semibold uppercase tracking-wide
              text-gray-700 dark:text-gray-200
              bg-white dark:bg-gray-800 border border-indigo-400 rounded outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex-1 min-w-0 flex items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide
              text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
              hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <span className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>›</span>
            <span className="flex-1 text-left truncate">{group.name}</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs font-normal">
              {group.entries.length}
            </span>
          </button>
        )}
        {!editing && !isExportMode && (
          <>
            {!isSpecial && (
              <button
                type="button"
                title={`Add songs to ${group.name}`}
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
      </div>
      {open && (
        isSpecial ? (
          <ul className="ml-2 space-y-0.5">
            {group.entries.map(entry => (
              <SongListItem key={entry.id} entry={entry} onSelect={onSelect} collectionId={group.id} />
            ))}
          </ul>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
              <ul className="ml-2 space-y-0.5">
                {group.entries.map(entry => (
                  <SortableSongListItem key={entry.id} entry={entry} onSelect={onSelect} collectionId={group.id} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )
      )}
    </li>
  )
}
```

- [ ] **Step 4: Run new tests to confirm they pass**

```bash
npx vitest run src/components/Sidebar/__tests__/CollectionGroup.drag.test.jsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar/CollectionGroup.jsx \
        src/components/Sidebar/__tests__/CollectionGroup.drag.test.jsx
git commit -m "feat: drag-and-drop reorder for songs within collections"
```
