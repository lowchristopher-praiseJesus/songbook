# Back-to-Collection Arrow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a `← <Collection Name>` link above the song title whenever the active song was opened from a collection, and clicking it returns the user to that collection's detail view.

**Architecture:** Thread two new props (`collectionName: string | null`, `onBackToCollection: () => void`) down the existing render chain `MainContent` → `SongView` → `SongList` → `SongHeader`. `MainContent` derives `collectionName` by looking up the store's existing `activeCollectionId` in `collections` (so a deleted collection naturally yields `null`), and `onBackToCollection` calls the store's existing `setSelectedCollectionId`, which `MainContent` already uses to switch its own render branch to `CollectionDetailView`. No new store state, no new view-switching logic — this only wires existing mechanisms together.

**Tech Stack:** React 18, Zustand (`useLibraryStore`), Vitest + @testing-library/react.

## Global Constraints

- No new Zustand store fields or actions — reuse `activeCollectionId` and `setSelectedCollectionId`, both already defined in `src/store/libraryStore.js`.
- The back link must not render in Maximize/Fit mode or Performance mode — satisfied automatically because `SongHeader` is only rendered by `SongList` when `isFit` is `false`, and `MainContent` only needs the new props threaded through its non-`isFit` `<SongView>` render call.
- Follow the spec at `docs/superpowers/specs/2026-07-30-back-to-collection-arrow-design.md`.

---

### Task 1: SongHeader renders the back-to-collection link

**Files:**
- Modify: `src/components/SongList/SongHeader.jsx:20-54`
- Test: `src/components/SongList/__tests__/SongHeader.test.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SongHeader` accepts two new optional props — `collectionName: string | null` (default `null`) and `onBackToCollection: () => void`. When `collectionName` is truthy, renders a `<button type="button">` with accessible name `← ${collectionName}` that calls `onBackToCollection` on click. Renders nothing extra when `collectionName` is falsy.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/SongList/__tests__/SongHeader.test.jsx` (after the existing `describe('SongHeader capo label legibility', ...)` block, before `const recorderProps = ...`):

```jsx
describe('SongHeader back-to-collection link', () => {
  it('renders a back link with the collection name when collectionName is provided', () => {
    render(<SongHeader {...baseProps} collectionName="Sunday Worship" onBackToCollection={vi.fn()} />)
    expect(screen.getByRole('button', { name: '← Sunday Worship' })).toBeInTheDocument()
  })

  it('does not render a back link when collectionName is absent', () => {
    render(<SongHeader {...baseProps} />)
    expect(screen.queryByText(/^←/)).not.toBeInTheDocument()
  })

  it('calls onBackToCollection when the back link is clicked', () => {
    const onBackToCollection = vi.fn()
    render(<SongHeader {...baseProps} collectionName="Sunday Worship" onBackToCollection={onBackToCollection} />)
    fireEvent.click(screen.getByRole('button', { name: '← Sunday Worship' }))
    expect(onBackToCollection).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/SongList/__tests__/SongHeader.test.jsx`
Expected: the three new tests FAIL (no element with accessible name `← Sunday Worship` exists yet).

- [ ] **Step 3: Implement the minimal change**

In `src/components/SongList/SongHeader.jsx`, change the props destructure (lines 20-33) from:

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
}) {
```

to:

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
  collectionName = null,
  onBackToCollection,
}) {
```

Then, in the render output (lines 49-54), insert the back link right after the annotation paragraph:

```jsx
      {meta.artist && (
        <p className="mt-0.5" style={{ fontFamily: 'var(--artist-font)', fontSize: 'var(--artist-size)', color: 'var(--artist-color-active)' }}>{meta.artist}</p>
      )}
      {annotationsVisible && meta.annotation && (
        <p className="text-sm italic text-gray-400 dark:text-gray-500 mt-0.5">{meta.annotation}</p>
      )}
      {collectionName && (
        <button
          type="button"
          onClick={onBackToCollection}
          className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors truncate max-w-full"
        >
          ← {collectionName}
        </button>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/SongList/__tests__/SongHeader.test.jsx`
Expected: all tests PASS, including the three new ones and all pre-existing ones (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/components/SongList/SongHeader.jsx src/components/SongList/__tests__/SongHeader.test.jsx
git commit -m "feat: render back-to-collection link in SongHeader"
```

---

### Task 2: SongList threads the props through to SongHeader

**Files:**
- Modify: `src/components/SongList/SongList.jsx:21-44,120-133`
- Test: `src/components/SongList/__tests__/SongList.backToCollection.test.jsx` (new file)

**Interfaces:**
- Consumes: `SongHeader`'s `collectionName` / `onBackToCollection` props from Task 1.
- Produces: `SongList` accepts and forwards `collectionName: string | null` (default `null`) and `onBackToCollection: () => void` straight through to `SongHeader`.

- [ ] **Step 1: Write the failing test**

Create `src/components/SongList/__tests__/SongList.backToCollection.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongList } from '../SongList'

vi.mock('../../../hooks/useTranspose', () => ({
  useTranspose: vi.fn(() => ({
    delta: 0,
    capo: 0,
    capoUp: vi.fn(),
    capoDown: vi.fn(),
    transposeTo: vi.fn(),
    transposedSections: [],
    usesFlats: false,
  })),
}))

vi.mock('../../../lib/exportPdf', () => ({ exportLyricsPdf: vi.fn() }))

vi.mock('../../../hooks/useRecording', () => ({
  useRecording: vi.fn(() => ({
    status: 'idle',
    elapsedMs: 0,
    pendingName: '',
    error: null,
    recordingCount: 0,
    hasRecordings: false,
    startRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording: vi.fn(),
    saveRecording: vi.fn(),
    cancelNaming: vi.fn(),
    dismissError: vi.fn(),
    refreshRecordingCount: vi.fn(),
    handleRecordingsChange: vi.fn(),
  })),
}))

vi.mock('../../../lib/recorderFeatureDetect', () => ({
  checkRecorderSupport: vi.fn(() => ({ supported: false })),
}))

vi.mock('../../Recorder/RecordingsPanel', () => ({
  RecordingsPanel: vi.fn(() => null),
}))

const song = {
  id: 'song-1',
  meta: { title: 'Test', keyIndex: 0 },
  sections: [],
}

function renderSongList(props = {}) {
  return render(
    <SongList
      song={song}
      onPerformanceMode={vi.fn()}
      lyricsOnly={false}
      fontSize={16}
      onFontSizeChange={vi.fn()}
      chordsOpen={true}
      onChordsToggle={vi.fn()}
      onEdit={vi.fn()}
      isFit={false}
      containerRef={{ current: null }}
      {...props}
    />
  )
}

describe('SongList back-to-collection threading', () => {
  it('passes collectionName and onBackToCollection through to SongHeader', () => {
    const onBackToCollection = vi.fn()
    renderSongList({ collectionName: 'Sunday Worship', onBackToCollection })
    const link = screen.getByRole('button', { name: '← Sunday Worship' })
    fireEvent.click(link)
    expect(onBackToCollection).toHaveBeenCalledOnce()
  })

  it('renders no back link when collectionName is not provided', () => {
    renderSongList()
    expect(screen.queryByText(/^←/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SongList/__tests__/SongList.backToCollection.test.jsx`
Expected: FAIL — `getByRole('button', { name: '← Sunday Worship' })` finds no match, since `SongList` doesn't yet forward `collectionName`.

- [ ] **Step 3: Implement the minimal change**

In `src/components/SongList/SongList.jsx`, change the props destructure (lines 21-44) from:

```jsx
export function SongList({
  song,
  onPerformanceMode,
  lyricsOnly = false,
  hideChordDiagram = false,
  fontSize = 16,
  onFontSizeChange,
  chordsOpen,
  onChordsToggle,
  onEdit,
  isFit = false,
  containerRef,
  sectionRefs,
  headerRef,
  bodyRef,
  fitFontSize,
  fitColumns,
  paginated,
  totalColumns,
  currentPage,
  pageColWidth,
  fitAvailableHeight,
  shadowRef,
}) {
```

to (add the two new props at the end of the list):

```jsx
export function SongList({
  song,
  onPerformanceMode,
  lyricsOnly = false,
  hideChordDiagram = false,
  fontSize = 16,
  onFontSizeChange,
  chordsOpen,
  onChordsToggle,
  onEdit,
  isFit = false,
  containerRef,
  sectionRefs,
  headerRef,
  bodyRef,
  fitFontSize,
  fitColumns,
  paginated,
  totalColumns,
  currentPage,
  pageColWidth,
  fitAvailableHeight,
  shadowRef,
  collectionName = null,
  onBackToCollection,
}) {
```

Then, in the `<SongHeader ... />` call (lines 121-133), add the two props:

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
                  collectionName={collectionName}
                  onBackToCollection={onBackToCollection}
                />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/SongList/__tests__/SongList.backToCollection.test.jsx`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SongList/SongList.jsx src/components/SongList/__tests__/SongList.backToCollection.test.jsx
git commit -m "feat: thread back-to-collection props through SongList"
```

---

### Task 3: SongView threads the props through to SongList

**Files:**
- Modify: `src/components/SongList/SongView.jsx:7-28,116-139`
- Test: `src/components/SongList/__tests__/SongView.test.jsx`

**Interfaces:**
- Consumes: `SongList`'s `collectionName` / `onBackToCollection` props from Task 2.
- Produces: `SongView` accepts and forwards `collectionName: string | null` (default `null`) and `onBackToCollection: () => void` straight through to `SongList`.

- [ ] **Step 1: Write the failing test**

In `src/components/SongList/__tests__/SongView.test.jsx`, add the import needed to inspect the mocked `SongList`'s calls — change:

```jsx
import { SongView } from '../SongView'

// Stub SongList to avoid its deep hook dependencies
vi.mock('../SongList', () => ({
  SongList: vi.fn(() => <div data-testid="song-list" />),
}))
```

to:

```jsx
import { SongView } from '../SongView'
import { SongList } from '../SongList'

// Stub SongList to avoid its deep hook dependencies
vi.mock('../SongList', () => ({
  SongList: vi.fn(() => <div data-testid="song-list" />),
}))
```

Then add a new test to the `describe('SongView', ...)` block:

```jsx
  it('passes collectionName and onBackToCollection through to SongList', () => {
    const onBackToCollection = vi.fn()
    render(<SongView {...baseProps} collectionName="Sunday Worship" onBackToCollection={onBackToCollection} />)
    const props = SongList.mock.calls.at(-1)[0]
    expect(props.collectionName).toBe('Sunday Worship')
    expect(props.onBackToCollection).toBe(onBackToCollection)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SongList/__tests__/SongView.test.jsx`
Expected: FAIL — `props.collectionName` is `undefined`, not `'Sunday Worship'`.

- [ ] **Step 3: Implement the minimal change**

In `src/components/SongList/SongView.jsx`, change the props destructure (lines 7-28) from:

```jsx
export function SongView({
  song,
  onPerformanceMode,
  lyricsOnly,
  hideChordDiagram = false,
  fontSize,
  onFontSizeChange,
  chordsOpen,
  onChordsToggle,
  onEdit,
  isFit,
  containerRef,
  bodyRef,
  fitFontSize,
  fitColumns,
  paginated,
  totalColumns,
  currentPage,
  pageColWidth,
  fitAvailableHeight,
  shadowRef,
}) {
```

to (add the two new props at the end of the list):

```jsx
export function SongView({
  song,
  onPerformanceMode,
  lyricsOnly,
  hideChordDiagram = false,
  fontSize,
  onFontSizeChange,
  chordsOpen,
  onChordsToggle,
  onEdit,
  isFit,
  containerRef,
  bodyRef,
  fitFontSize,
  fitColumns,
  paginated,
  totalColumns,
  currentPage,
  pageColWidth,
  fitAvailableHeight,
  shadowRef,
  collectionName = null,
  onBackToCollection,
}) {
```

Then, in the `<SongList ... />` call (lines 116-139), add the two props:

```jsx
          <SongList
            song={song}
            onPerformanceMode={onPerformanceMode}
            lyricsOnly={lyricsOnly}
            hideChordDiagram={hideChordDiagram}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
            chordsOpen={chordsOpen}
            onChordsToggle={onChordsToggle}
            onEdit={onEdit}
            isFit={isFit}
            containerRef={containerRef}
            sectionRefs={sectionRefs.current}
            headerRef={headerRef}
            bodyRef={bodyRef}
            fitFontSize={fitFontSize}
            fitColumns={fitColumns}
            paginated={paginated}
            totalColumns={totalColumns}
            currentPage={currentPage}
            pageColWidth={pageColWidth}
            fitAvailableHeight={fitAvailableHeight}
            shadowRef={shadowRef}
            collectionName={collectionName}
            onBackToCollection={onBackToCollection}
          />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/SongList/__tests__/SongView.test.jsx`
Expected: all tests PASS, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/components/SongList/SongView.jsx src/components/SongList/__tests__/SongView.test.jsx
git commit -m "feat: thread back-to-collection props through SongView"
```

---

### Task 4: MainContent derives the collection and wires the handler

**Files:**
- Modify: `src/components/SongList/MainContent.jsx:48-50,211-212,409-421`
- Test: `src/components/SongList/__tests__/MainContent.backToCollection.test.jsx` (new file)

**Interfaces:**
- Consumes: `SongView`'s `collectionName` / `onBackToCollection` props from Task 3; store fields `activeCollectionId`, `collections`, and action `setSelectedCollectionId` (all pre-existing in `src/store/libraryStore.js`).
- Produces: nothing consumed by a later task — this is the last link in the chain.

- [ ] **Step 1: Write the failing tests**

Create `src/components/SongList/__tests__/MainContent.backToCollection.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MainContent } from '../MainContent'
import { SongView } from '../SongView'
import { useLibraryStore } from '../../../store/libraryStore'

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(),
}))

const mockSetSelectedCollectionId = vi.fn()

function mockStore(overrides = {}) {
  const state = {
    activeSong: { id: 'song-2', meta: { title: 'Song Two', keyIndex: 0 }, sections: [] },
    activeSongId: 'song-2',
    index: [],
    collections: [{ id: 'col-1', name: 'Sunday Worship', songIds: ['song-2'] }],
    activeCollectionId: 'col-1',
    selectSong: vi.fn(),
    editingSongId: null,
    setEditingSongId: vi.fn(),
    viewMode: 'collections',
    setSelectedCollectionId: mockSetSelectedCollectionId,
    ...overrides,
  }
  useLibraryStore.mockImplementation(selector => selector(state))
}

vi.mock('../../../hooks/useDropZone', () => ({
  useDropZone: vi.fn(() => ({ isDragging: false, onDragOver: vi.fn(), onDragLeave: vi.fn(), onDrop: vi.fn() })),
}))

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: vi.fn(() => ({ importFiles: vi.fn() })),
}))

vi.mock('../../../lib/collectionUtils', () => ({
  buildNavOrder: vi.fn(() => []),
}))

vi.mock('../../../hooks/useScrollSettings', () => ({
  useScrollSettings: vi.fn(() => ({ targetDuration: 90, setTargetDuration: vi.fn() })),
}))

vi.mock('../../../hooks/useAutoScroll', () => ({
  useAutoScroll: vi.fn(() => ({ isScrolling: false, start: vi.fn(), stop: vi.fn() })),
}))

vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(() => ({
    fitFontSize: 18,
    fitColumns: 2,
    shadowRef: { current: null },
    canIncrease: true,
    canDecrease: true,
    increaseFontSize: vi.fn(),
    decreaseFontSize: vi.fn(),
  })),
}))

vi.mock('../SongView', () => ({
  SongView: vi.fn(() => <div data-testid="song-view" />),
}))

vi.mock('../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => null),
}))

beforeEach(() => {
  mockSetSelectedCollectionId.mockClear()
  SongView.mockClear()
  mockStore()
})

function renderMainContent() {
  render(
    <MainContent
      onAddToast={vi.fn()}
      fontSize={16}
      onFontSizeChange={vi.fn()}
      lyricsOnly={false}
      onImportSuccess={vi.fn()}
    />
  )
}

describe('MainContent back-to-collection wiring', () => {
  it('passes the active collection name to SongView', () => {
    renderMainContent()
    const props = SongView.mock.calls.at(-1)[0]
    expect(props.collectionName).toBe('Sunday Worship')
  })

  it('passes an onBackToCollection handler that opens the collection detail view', () => {
    renderMainContent()
    const props = SongView.mock.calls.at(-1)[0]
    props.onBackToCollection()
    expect(mockSetSelectedCollectionId).toHaveBeenCalledWith('col-1')
  })

  it('passes null collectionName when there is no active collection', () => {
    mockStore({ activeCollectionId: null })
    renderMainContent()
    const props = SongView.mock.calls.at(-1)[0]
    expect(props.collectionName).toBeNull()
  })

  it('passes null collectionName when the active collection has been deleted', () => {
    mockStore({ activeCollectionId: 'col-deleted', collections: [] })
    renderMainContent()
    const props = SongView.mock.calls.at(-1)[0]
    expect(props.collectionName).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/SongList/__tests__/MainContent.backToCollection.test.jsx`
Expected: FAIL — `props.collectionName` is `undefined` in every case, since `MainContent` doesn't compute or pass it yet.

- [ ] **Step 3: Implement the minimal change**

In `src/components/SongList/MainContent.jsx`, add a new store read right after the existing `selectedCollectionId` line (line 50):

```jsx
  const selectedCollectionId = useLibraryStore(s => s.selectedCollectionId)
  const setSelectedCollectionId = useLibraryStore(s => s.setSelectedCollectionId)
```

Add a derived value right after the existing `inCollection` computation (lines 211-212):

```jsx
  const inCollection = !!activeSong && !!activeCollectionId
    && !performanceSections && !editingSongId && !isCreatingNewSong && !selectedCollectionId
  const backCollection = activeCollectionId
    ? collections.find(c => c.id === activeCollectionId) ?? null
    : null
```

Then, in the non-`isFit` `<SongView ... />` call (lines 409-421), add the two new props:

```jsx
              <SongView
                song={activeSong}
                onPerformanceMode={setPerformanceSections}
                lyricsOnly={lyricsOnly}
                hideChordDiagram={hideChordDiagram}
                fontSize={fontSize}
                onFontSizeChange={onFontSizeChange}
                chordsOpen={chordsOpen}
                onChordsToggle={() => setChordsOpen(o => !o)}
                onEdit={() => setEditingSongId(activeSongId)}
                isFit={false}
                containerRef={containerRef}
                collectionName={backCollection?.name ?? null}
                onBackToCollection={() => setSelectedCollectionId(activeCollectionId)}
              />
```

(The Maximize-mode `<SongView isFit={true} .../>` call further down is intentionally left unchanged — `SongHeader`, and thus the back link, is never rendered there.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/SongList/__tests__/MainContent.backToCollection.test.jsx`
Expected: all four tests PASS.

Then run the full suite to confirm no regressions:

Run: `npx vitest run src/components/SongList`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SongList/MainContent.jsx src/components/SongList/__tests__/MainContent.backToCollection.test.jsx
git commit -m "feat: show back-to-collection link when a song was opened from a collection"
```

---

### Task 5: Manual verification in the browser

**Files:** none (manual QA step, no code changes).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify the golden path**

In the browser: open a collection from the sidebar, click a song inside it. Confirm a `← <Collection Name>` link appears above the song title. Click it and confirm it returns to that collection's detail page (the same page reached via the sidebar).

- [ ] **Step 3: Verify the absent cases**

Select a song from "All Songs" (not via a collection) — confirm no back link appears. Use the swipe/arrow-key navigation to move to the next song within a collection — confirm the back link updates to still show the correct (same) collection name.

- [ ] **Step 4: Verify dark mode and mobile width**

Toggle dark mode and confirm the link is legible. Narrow the browser to a mobile width and confirm the link doesn't overlap or overflow, truncating gracefully for a long collection name.

No commit for this task — it's verification only, not a code change.
