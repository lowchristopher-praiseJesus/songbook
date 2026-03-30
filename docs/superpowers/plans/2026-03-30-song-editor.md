# Song Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen edit mode that lets users modify a song's metadata and chord/lyric content, accessible via an Edit button on the song view.

**Architecture:** When the user clicks Edit, `editingSongId` is set in the Zustand store; `MainContent` renders `SongEditor` in place of `SongList`. `SongEditor` owns local state for the form fields and textarea, calls `updateSong` on Save, and clears `editingSongId` on Save or Cancel.

**Tech Stack:** React 18, Zustand 5, Tailwind CSS, Vitest + @testing-library/react

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/store/libraryStore.js` | Add `editingSongId` state, `setEditingSongId`, `updateSong` |
| Create | `src/store/__tests__/libraryStore.updateSong.test.js` | Tests for `updateSong` and `editingSongId` |
| Create | `src/components/SongEditor/MetaFields.jsx` | Controlled form: title, artist, key, capo, tempo, time sig |
| Create | `src/components/SongEditor/SongEditor.jsx` | Full-screen editor page component |
| Create | `src/components/SongEditor/__tests__/SongEditor.test.jsx` | Tests for SongEditor |
| Modify | `src/components/SongList/SongHeader.jsx` | Add `onEdit` prop + Edit button |
| Modify | `src/components/SongList/SongList.jsx` | Accept and pass `onEdit` prop to SongHeader |
| Modify | `src/components/SongList/MainContent.jsx` | Read `editingSongId`, render SongEditor, pass `onEdit` |

---

## Task 1: Add `updateSong` and `editingSongId` to libraryStore

**Files:**
- Modify: `src/store/libraryStore.js`
- Create: `src/store/__tests__/libraryStore.updateSong.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/store/__tests__/libraryStore.updateSong.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from '../libraryStore'
import { loadSong, loadIndex, saveSong, saveIndex } from '../../lib/storage'
import { parseContent } from '../../lib/parser/contentParser'

const baseSong = {
  id: 'song-1',
  importedAt: '2026-01-01T00:00:00Z',
  rawText: '{c: Verse}\n[G]Hello world',
  meta: {
    title: 'Original Title',
    artist: 'Original Artist',
    key: 'G',
    keyIndex: 7,
    usesFlats: false,
    capo: 0,
  },
  sections: [],
}

const baseEntry = {
  id: 'song-1',
  title: 'Original Title',
  artist: 'Original Artist',
  importedAt: '2026-01-01T00:00:00Z',
  collectionId: null,
}

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    index: [],
    collections: [],
    activeSongId: null,
    activeSong: null,
    editingSongId: null,
  })
  saveSong(baseSong)
  saveIndex([baseEntry])
  useLibraryStore.setState({ index: [baseEntry] })
})

describe('updateSong', () => {
  it('updates rawText and re-parses sections in localStorage', () => {
    const newRawText = '{c: Chorus}\n[Am]New content'
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta },
      rawText: newRawText,
    })
    const saved = loadSong('song-1')
    expect(saved.rawText).toBe(newRawText)
    expect(saved.sections).toEqual(parseContent(newRawText))
  })

  it('updates meta title and artist in localStorage and index', () => {
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, title: 'New Title', artist: 'New Artist' },
      rawText: baseSong.rawText,
    })
    const saved = loadSong('song-1')
    expect(saved.meta.title).toBe('New Title')
    expect(saved.meta.artist).toBe('New Artist')
    const index = loadIndex()
    expect(index[0].title).toBe('New Title')
    expect(index[0].artist).toBe('New Artist')
  })

  it('updates index in store state', () => {
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, title: 'Store Title' },
      rawText: baseSong.rawText,
    })
    const { index } = useLibraryStore.getState()
    expect(index[0].title).toBe('Store Title')
  })

  it('derives keyIndex from meta.key string', () => {
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, key: 'Eb' },
      rawText: baseSong.rawText,
    })
    const saved = loadSong('song-1')
    expect(saved.meta.keyIndex).toBe(3)
    expect(saved.meta.usesFlats).toBe(true)
  })

  it('sets usesFlats false for sharp keys', () => {
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, key: 'G' },
      rawText: baseSong.rawText,
    })
    const saved = loadSong('song-1')
    expect(saved.meta.usesFlats).toBe(false)
  })

  it('refreshes activeSong when editing the active song', () => {
    useLibraryStore.setState({ activeSongId: 'song-1', activeSong: baseSong })
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, title: 'Updated Title' },
      rawText: baseSong.rawText,
    })
    const { activeSong } = useLibraryStore.getState()
    expect(activeSong.meta.title).toBe('Updated Title')
  })

  it('does not update activeSong when editing a different song', () => {
    const otherSong = { id: 'other-id', meta: { title: 'Other' } }
    useLibraryStore.setState({ activeSongId: 'other-id', activeSong: otherSong })
    useLibraryStore.getState().updateSong('song-1', {
      meta: { ...baseSong.meta, title: 'Changed' },
      rawText: baseSong.rawText,
    })
    const { activeSong } = useLibraryStore.getState()
    expect(activeSong.id).toBe('other-id')
  })
})

describe('editingSongId', () => {
  it('starts as null', () => {
    expect(useLibraryStore.getState().editingSongId).toBeNull()
  })

  it('setEditingSongId sets the id', () => {
    useLibraryStore.getState().setEditingSongId('abc')
    expect(useLibraryStore.getState().editingSongId).toBe('abc')
  })

  it('setEditingSongId(null) clears the id', () => {
    useLibraryStore.getState().setEditingSongId('abc')
    useLibraryStore.getState().setEditingSongId(null)
    expect(useLibraryStore.getState().editingSongId).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/store/__tests__/libraryStore.updateSong.test.js
```

Expected: FAIL — `updateSong is not a function`, `editingSongId` is undefined

- [ ] **Step 3: Add `parseContent` import and new state/actions to libraryStore**

At the top of `src/store/libraryStore.js`, add import after existing imports:

```js
import { parseContent } from '../lib/parser/contentParser'
```

Inside the `create((set, get) => ({` object, add `editingSongId: null,` after `activeSong: null,`:

```js
  activeSong: null,    // Full song object (loaded from localStorage)
  editingSongId: null, // id of the song currently being edited, or null
```

At the end of the store object (before the closing `})`), add:

```js
  /**
   * Set or clear the song currently being edited.
   */
  setEditingSongId(id) {
    set({ editingSongId: id })
  },

  /**
   * Update an existing song's metadata and content.
   * Re-parses sections from rawText and derives keyIndex/usesFlats from the key name.
   * Updates localStorage, the in-memory index, and refreshes activeSong if needed.
   */
  updateSong(id, { meta, rawText }) {
    const song = loadSong(id)
    if (!song) return

    const KEY_TO_INDEX = {
      C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
      E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
      Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
    }
    const FLAT_KEY_NAMES = new Set(['Db', 'Eb', 'F', 'Ab', 'Bb'])

    const keyIndex = KEY_TO_INDEX[meta.key] ?? song.meta.keyIndex
    const usesFlats = FLAT_KEY_NAMES.has(meta.key)
    const sections = parseContent(rawText)

    const updatedSong = {
      ...song,
      rawText,
      meta: { ...song.meta, ...meta, keyIndex, usesFlats },
      sections,
    }

    saveSong(updatedSong)

    const newIndex = get().index.map(e =>
      e.id === id
        ? { ...e, title: meta.title ?? e.title, artist: meta.artist ?? '' }
        : e
    )
    saveIndex(newIndex)

    set({
      index: newIndex,
      ...(get().activeSongId === id ? { activeSong: updatedSong } : {}),
    })
  },
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/store/__tests__/libraryStore.updateSong.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add src/store/libraryStore.js src/store/__tests__/libraryStore.updateSong.test.js
git commit -m "feat: add updateSong action and editingSongId state to libraryStore"
```

---

## Task 2: Create `MetaFields` component

**Files:**
- Create: `src/components/SongEditor/MetaFields.jsx`

No tests — pure controlled form with no logic.

- [ ] **Step 1: Create `src/components/SongEditor/MetaFields.jsx`**

```jsx
const KEY_OPTIONS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const inputClass =
  'px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 ' +
  'bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500'

export function MetaFields({ meta, onChange }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Title</span>
        <input
          type="text"
          value={meta.title ?? ''}
          onChange={e => onChange('title', e.target.value)}
          className={`w-48 ${inputClass}`}
          aria-label="Title"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Artist</span>
        <input
          type="text"
          value={meta.artist ?? ''}
          onChange={e => onChange('artist', e.target.value)}
          className={`w-40 ${inputClass}`}
          aria-label="Artist"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Key</span>
        <select
          value={meta.key ?? 'C'}
          onChange={e => onChange('key', e.target.value)}
          className={inputClass}
          aria-label="Key"
        >
          {KEY_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Capo</span>
        <input
          type="number"
          min={0}
          max={7}
          value={meta.capo ?? 0}
          onChange={e => onChange('capo', Number(e.target.value))}
          className={`w-16 ${inputClass}`}
          aria-label="Capo"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Tempo</span>
        <input
          type="number"
          min={1}
          value={meta.tempo ?? ''}
          onChange={e => onChange('tempo', e.target.value ? Number(e.target.value) : undefined)}
          className={`w-20 ${inputClass}`}
          aria-label="Tempo"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Time Sig</span>
        <input
          type="text"
          value={meta.timeSignature ?? ''}
          onChange={e => onChange('timeSignature', e.target.value || undefined)}
          className={`w-20 ${inputClass}`}
          aria-label="Time Signature"
          placeholder="4/4"
        />
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SongEditor/MetaFields.jsx
git commit -m "feat: add MetaFields controlled form component"
```

---

## Task 3: Create `SongEditor` component

**Files:**
- Create: `src/components/SongEditor/SongEditor.jsx`
- Create: `src/components/SongEditor/__tests__/SongEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/SongEditor/__tests__/SongEditor.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongEditor } from '../SongEditor'

const mockSong = {
  id: 'song-1',
  rawText: '{c: Verse}\n[G]Hello world',
  meta: {
    title: 'My Song',
    artist: 'Test Artist',
    key: 'G',
    keyIndex: 7,
    usesFlats: false,
    capo: 0,
    tempo: 120,
    timeSignature: '4/4',
  },
  sections: [],
}

const mockUpdateSong = vi.fn()
const mockSetEditingSongId = vi.fn()

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      activeSong: mockSong,
      updateSong: mockUpdateSong,
      setEditingSongId: mockSetEditingSongId,
    }),
}))

describe('SongEditor', () => {
  beforeEach(() => {
    mockUpdateSong.mockReset()
    mockSetEditingSongId.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pre-populates title field from song meta', () => {
    render(<SongEditor songId="song-1" />)
    expect(screen.getByDisplayValue('My Song')).toBeInTheDocument()
  })

  it('pre-populates textarea with rawText', () => {
    render(<SongEditor songId="song-1" />)
    expect(screen.getByDisplayValue(mockSong.rawText)).toBeInTheDocument()
  })

  it('Save calls updateSong with songId and current meta and rawText', () => {
    render(<SongEditor songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mockUpdateSong).toHaveBeenCalledWith('song-1', {
      meta: expect.objectContaining({ title: 'My Song', key: 'G' }),
      rawText: mockSong.rawText,
    })
  })

  it('Save calls setEditingSongId(null)', () => {
    render(<SongEditor songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mockSetEditingSongId).toHaveBeenCalledWith(null)
  })

  it('Cancel without changes calls setEditingSongId(null) without confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<SongEditor songId="song-1" />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(mockSetEditingSongId).toHaveBeenCalledWith(null)
  })

  it('Cancel with changes shows confirm dialog', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SongEditor songId="song-1" />)
    fireEvent.change(screen.getByDisplayValue(mockSong.rawText), {
      target: { value: 'changed content' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(window.confirm).toHaveBeenCalledWith('Discard changes?')
    expect(mockSetEditingSongId).not.toHaveBeenCalled()
  })

  it('Cancel with changes navigates away when confirm returns true', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SongEditor songId="song-1" />)
    fireEvent.change(screen.getByDisplayValue(mockSong.rawText), {
      target: { value: 'changed content' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockSetEditingSongId).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/components/SongEditor/__tests__/SongEditor.test.jsx
```

Expected: FAIL — module not found or component missing

- [ ] **Step 3: Create `src/components/SongEditor/SongEditor.jsx`**

```jsx
import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { MetaFields } from './MetaFields'

export function SongEditor({ songId }) {
  const song = useLibraryStore(s => s.activeSong)
  const updateSong = useLibraryStore(s => s.updateSong)
  const setEditingSongId = useLibraryStore(s => s.setEditingSongId)

  const [meta, setMeta] = useState(() => ({ ...song.meta }))
  const [rawText, setRawText] = useState(() => song.rawText ?? '')
  const [isDirty, setIsDirty] = useState(false)

  function handleMetaChange(field, value) {
    setMeta(m => ({ ...m, [field]: value }))
    setIsDirty(true)
  }

  function handleSave() {
    updateSong(songId, { meta, rawText })
    setEditingSongId(null)
  }

  function handleCancel() {
    if (isDirty && !window.confirm('Discard changes?')) return
    setEditingSongId(null)
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Sticky top bar */}
      <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 z-10">
        <h2 className="font-semibold truncate max-w-xs">{meta.title || 'Untitled'}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Save
          </button>
        </div>
      </div>

      {/* Metadata fields */}
      <MetaFields meta={meta} onChange={handleMetaChange} />

      {/* Content textarea */}
      <div className="flex flex-1 flex-col px-4 pt-3 pb-4 min-h-0">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 select-none">
          {'{c: Section}'} for headers · [Chord] before a syllable
        </p>
        <textarea
          className="flex-1 w-full font-mono text-sm resize-none bg-transparent focus:outline-none leading-relaxed"
          value={rawText}
          onChange={e => { setRawText(e.target.value); setIsDirty(true) }}
          aria-label="Song content"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/SongEditor/__tests__/SongEditor.test.jsx
```

Expected: all tests PASS

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/SongEditor/SongEditor.jsx src/components/SongEditor/__tests__/SongEditor.test.jsx
git commit -m "feat: add SongEditor full-screen edit component"
```

---

## Task 4: Wire up Edit button and editor rendering

**Files:**
- Modify: `src/components/SongList/SongHeader.jsx`
- Modify: `src/components/SongList/SongList.jsx`
- Modify: `src/components/SongList/MainContent.jsx`

No new tests — this is wiring only; the tested pieces are already covered.

- [ ] **Step 1: Add `onEdit` prop and Edit button to `SongHeader`**

In `src/components/SongList/SongHeader.jsx`:

Change the function signature from:
```jsx
export function SongHeader({ meta, transpose, lyricsOnly, onPerformanceMode, onExportPdf }) {
```
to:
```jsx
export function SongHeader({ meta, transpose, lyricsOnly, onPerformanceMode, onExportPdf, onEdit }) {
```

In the button group (`flex flex-wrap items-center gap-3 mt-3`), add an Edit button immediately before the Performance button:

```jsx
        <button
          type="button"
          onClick={onEdit}
          className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onPerformanceMode}
          className="ml-auto text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          ⛶ Performance
        </button>
```

- [ ] **Step 2: Pass `onEdit` through `SongList`**

In `src/components/SongList/SongList.jsx`:

Change the function signature from:
```jsx
export function SongList({ song, onPerformanceMode, lyricsOnly = false, fontSize = 16, onFontSizeChange, chordsOpen, onChordsToggle }) {
```
to:
```jsx
export function SongList({ song, onPerformanceMode, lyricsOnly = false, fontSize = 16, onFontSizeChange, chordsOpen, onChordsToggle, onEdit }) {
```

Add `onEdit={onEdit}` to the `<SongHeader>` element:
```jsx
      <SongHeader
        meta={song.meta}
        transpose={transpose}
        lyricsOnly={lyricsOnly}
        onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
        onExportPdf={() => exportLyricsPdf(song.meta, song.sections)}
        onEdit={onEdit}
      />
```

- [ ] **Step 3: Add editor rendering to `MainContent`**

In `src/components/SongList/MainContent.jsx`:

Add import at top with other imports:
```js
import { SongEditor } from '../SongEditor/SongEditor'
```

Add store selectors after existing selectors (after `const selectSong = ...`):
```js
  const editingSongId = useLibraryStore(s => s.editingSongId)
  const setEditingSongId = useLibraryStore(s => s.setEditingSongId)
```

Replace the conditional render block:
```jsx
      {!activeSong
        ? <EmptyState onFileChange={handleFileInput} />
        : <div
            key={activeSongId}
            ...
          >
            <SongList
              song={activeSong}
              onPerformanceMode={setPerformanceSections}
              lyricsOnly={lyricsOnly}
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
              chordsOpen={chordsOpen}
              onChordsToggle={() => setChordsOpen(o => !o)}
            />
          </div>
      }
```
with:
```jsx
      {editingSongId
        ? <SongEditor songId={editingSongId} />
        : !activeSong
          ? <EmptyState onFileChange={handleFileInput} />
          : <div
              key={activeSongId}
              className={`h-full overflow-x-hidden
                ${swipeDir === 'left'  ? 'animate-slideFromRight' : ''}
                ${swipeDir === 'right' ? 'animate-slideFromLeft'  : ''}
              `}
              onAnimationEnd={() => setSwipeDir(null)}
            >
              <SongList
                song={activeSong}
                onPerformanceMode={setPerformanceSections}
                lyricsOnly={lyricsOnly}
                fontSize={fontSize}
                onFontSizeChange={onFontSizeChange}
                chordsOpen={chordsOpen}
                onChordsToggle={() => setChordsOpen(o => !o)}
                onEdit={() => setEditingSongId(activeSongId)}
              />
            </div>
      }
```

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 5: Smoke-test in the browser**

```bash
npm run dev
```

Open the app, select a song, click **Edit**. Verify:
- Full-screen editor appears with metadata fields pre-filled
- Textarea shows raw content with `{c:}` and `[Chord]` notation
- Edit the title and click **Save** — song title updates in sidebar and view
- Edit content, click **Cancel** — confirm dialog appears, cancels correctly
- Click **Cancel** with no changes — navigates back immediately

- [ ] **Step 6: Commit**

```bash
git add src/components/SongList/SongHeader.jsx src/components/SongList/SongList.jsx src/components/SongList/MainContent.jsx
git commit -m "feat: wire up Edit button and SongEditor into main content area"
```
