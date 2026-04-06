# Fit-to-Screen (Maximize) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a maximize button to the song lyrics pane that auto-fits the entire song on screen without scrolling, using multi-column layout and calculated font sizes.

**Architecture:** A `useFitToScreen` hook lives in `SongList` (which has the transposed sections), renders a hidden shadow `SongBody` as a JSX sibling, and imperatively measures it to binary-search the best font-size + column-count combination. `SongBody` gains a `fitMode` prop that switches font-size to a CSS custom property (`--fit-fs`) so the hook can mutate it without React re-renders. The maximize button and `isFit` state live in `MainContent`.

**Tech Stack:** React 18, Vitest + @testing-library/react, CSS custom properties, ResizeObserver

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/hooks/useFitToScreen.js` | Measurement loop, ResizeObserver, returns `{ fitFontSize, fitColumns, shadowRef }` |
| Create | `src/hooks/__tests__/useFitToScreen.test.js` | Hook unit tests |
| Modify | `src/components/SongList/SongBody.jsx` | Accept `fitMode`/`fitColumns` props; use CSS variable for font size in fit mode |
| Modify | `src/components/SongList/SongHeader.jsx` | Accept and forward `headerRef` to root div |
| Modify | `src/components/SongList/SongList.jsx` | Call hook, render shadow SongBody, pass fit props to real SongBody |
| Modify | `src/components/SongList/MainContent.jsx` | Add `isFit` state, maximize button, disable font buttons in fit mode |

---

### Task 1: Update SongBody to support fit mode

**Files:**
- Modify: `src/components/SongList/SongBody.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/SongList/__tests__/SongBody.fitMode.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SongBody } from '../SongBody'

const sections = [
  {
    label: 'Verse',
    lines: [
      { type: 'lyric', content: 'Hello world', chords: [] },
    ],
  },
]

describe('SongBody fitMode', () => {
  it('applies columnCount style when fitMode is true', () => {
    const { container } = render(
      <SongBody sections={sections} fitMode fitColumns={2} />
    )
    expect(container.firstChild.style.columnCount).toBe('2')
  })

  it('does not set columnCount when fitMode is false', () => {
    const { container } = render(<SongBody sections={sections} />)
    expect(container.firstChild.style.columnCount).toBe('')
  })

  it('uses CSS variable for lyric line font size in fitMode', () => {
    const { container } = render(
      <SongBody sections={sections} fitMode fitColumns={1} />
    )
    const lineDiv = container.querySelector('.leading-relaxed')
    expect(lineDiv.style.fontSize).toBe('var(--fit-fs, 16px)')
  })

  it('uses numeric fontSize on lyric line when fitMode is false', () => {
    const { container } = render(
      <SongBody sections={sections} fontSize={20} />
    )
    const lineDiv = container.querySelector('.leading-relaxed')
    expect(lineDiv.style.fontSize).toBe('20px')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/components/SongList/__tests__/SongBody.fitMode.test.jsx
```

Expected: 4 failures (fitMode prop not yet implemented).

- [ ] **Step 3: Update SongBody**

In `src/components/SongList/SongBody.jsx`, make the following changes:

**`ChordedLine`** — add `fitMode` prop, use CSS variable for chord font size:

```jsx
function ChordedLine({ line, fontSize, fitMode }) {
  const text = line.content
  const chords = line.chords ?? []
  const chordFontSize = fitMode
    ? 'max(11px, calc(var(--fit-fs, 16px) - 3px))'
    : Math.max(11, (fontSize ?? 16) - 3)
```

Inside the chord `<span>` (the one with `absolute top-0 left-0`), change the style:

```jsx
style={fitMode
  ? { fontSize: 'max(11px, calc(var(--fit-fs, 16px) - 3px))', lineHeight: 1.2 }
  : { fontSize: chordFontSize, lineHeight: 1.2 }
}
```

**`SongSection`** — add `fitMode` prop, pass it to `ChordedLine`, use CSS variable on lyric lines and standalone chord lines:

```jsx
function SongSection({ section, fontSize, performanceMode, lyricsOnly, fitMode }) {
```

For standalone chord lines (the `if (line.type === 'chord')` block that renders without a following lyric):

```jsx
style={fitMode
  ? { fontSize: 'max(12px, calc(var(--fit-fs, 16px) - 2px))' }
  : { fontSize: Math.max(12, (fontSize ?? 16) - 2) }
}
```

For lyric lines (`<div key={i} className="leading-relaxed" ...>`):

```jsx
style={fitMode ? { fontSize: 'var(--fit-fs, 16px)' } : { fontSize }}
```

Pass `fitMode` to `ChordedLine`:

```jsx
<ChordedLine line={effectiveLine} fontSize={fontSize} fitMode={fitMode} />
```

**`SongBody`** — add `fitMode` and `fitColumns` props, apply column layout, pass `fitMode` to `SongSection`:

```jsx
export function SongBody({ sections, fontSize = 16, performanceMode = false, lyricsOnly = false, fitMode = false, fitColumns }) {
  if (!sections?.length) return null
  return (
    <div
      className="py-4"
      style={fitMode && fitColumns ? { columnCount: fitColumns } : undefined}
    >
      {sections.map((section, i) => (
        <SongSection
          key={i}
          section={section}
          fontSize={fontSize}
          performanceMode={performanceMode}
          lyricsOnly={lyricsOnly}
          fitMode={fitMode}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/SongList/__tests__/SongBody.fitMode.test.jsx
```

Expected: 4 passing.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/SongList/SongBody.jsx src/components/SongList/__tests__/SongBody.fitMode.test.jsx
git commit -m "feat: add fitMode prop to SongBody for CSS-variable-driven font size"
```

---

### Task 2: Forward headerRef in SongHeader

**Files:**
- Modify: `src/components/SongList/SongHeader.jsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/Settings/__tests__/SettingsPanel.test.jsx` — actually, create a new file `src/components/SongList/__tests__/SongHeader.headerRef.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { SongHeader } from '../SongHeader'

const meta = { title: 'Test Song', keyIndex: 0 }
const transpose = {
  delta: 0,
  capo: 0,
  capoUp: vi.fn(),
  capoDown: vi.fn(),
  transposeTo: vi.fn(),
  transposedSections: [],
  usesFlats: false,
}

describe('SongHeader headerRef', () => {
  it('attaches headerRef to the root div', () => {
    const headerRef = createRef()
    render(
      <SongHeader
        meta={meta}
        transpose={transpose}
        lyricsOnly={false}
        onPerformanceMode={vi.fn()}
        onExportPdf={vi.fn()}
        onEdit={vi.fn()}
        headerRef={headerRef}
      />
    )
    expect(headerRef.current).not.toBeNull()
    expect(headerRef.current.tagName).toBe('DIV')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/components/SongList/__tests__/SongHeader.headerRef.test.jsx
```

Expected: 1 failure (`headerRef.current` is null).

- [ ] **Step 3: Update SongHeader**

In `src/components/SongList/SongHeader.jsx`, change the function signature and attach the ref to the root div:

```jsx
export function SongHeader({ meta, transpose, lyricsOnly, onPerformanceMode, onExportPdf, onEdit, headerRef }) {
  const [infoOpen, setInfoOpen] = useState(false)

  const hasInfo = meta.tempo || meta.timeSignature || meta.capo > 0 || meta.ccli || meta.copyright

  return (
    <div ref={headerRef} className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-2">
```

(Only the first line and the opening `<div>` change — everything else inside stays exactly the same.)

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/components/SongList/__tests__/SongHeader.headerRef.test.jsx
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/SongList/SongHeader.jsx src/components/SongList/__tests__/SongHeader.headerRef.test.jsx
git commit -m "feat: forward headerRef to SongHeader root div for height measurement"
```

---

### Task 3: Implement useFitToScreen hook

**Files:**
- Create: `src/hooks/useFitToScreen.js`
- Create: `src/hooks/__tests__/useFitToScreen.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useFitToScreen.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFitToScreen } from '../useFitToScreen'

function makeContainerRef(clientHeight = 400) {
  return { current: { clientHeight } }
}

function makeHeaderRef(offsetHeight = 80) {
  return { current: { offsetHeight } }
}

// Creates a mock shadow element whose scrollHeight reports fitting or not
function makeShadowEl({ fits = true } = {}) {
  const el = {
    style: {
      columnCount: 1,
      height: '',
      setProperty: vi.fn(),
    },
    offsetHeight: 0,
  }
  Object.defineProperty(el, 'scrollHeight', { get: () => (fits ? 0 : 9999), configurable: true })
  Object.defineProperty(el, 'clientHeight', { get: () => 320, configurable: true })
  return el
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', vi.fn(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
  })))
})

afterEach(() => vi.unstubAllGlobals())

describe('useFitToScreen', () => {
  it('returns null values when disabled', () => {
    const { result } = renderHook(() =>
      useFitToScreen({
        enabled: false,
        containerRef: makeContainerRef(),
        headerRef: makeHeaderRef(),
        lyricsOnly: false,
      })
    )
    expect(result.current.fitFontSize).toBeNull()
    expect(result.current.fitColumns).toBeNull()
  })

  it('exposes a shadowRef', () => {
    const { result } = renderHook(() =>
      useFitToScreen({
        enabled: false,
        containerRef: makeContainerRef(),
        headerRef: makeHeaderRef(),
        lyricsOnly: false,
      })
    )
    expect(result.current.shadowRef).toBeDefined()
  })

  it('returns fitFontSize and fitColumns when enabled and shadow fits at 1 column', () => {
    const containerRef = makeContainerRef()
    const headerRef = makeHeaderRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, headerRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    // Populate the shadow ref before enabling
    result.current.shadowRef.current = makeShadowEl({ fits: true })

    act(() => rerender({ enabled: true }))

    expect(result.current.fitFontSize).toBeGreaterThan(0)
    expect(result.current.fitColumns).toBe(1)
  })

  it('resets to null when disabled after being enabled', () => {
    const containerRef = makeContainerRef()
    const headerRef = makeHeaderRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, headerRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    result.current.shadowRef.current = makeShadowEl({ fits: true })
    act(() => rerender({ enabled: true }))
    act(() => rerender({ enabled: false }))

    expect(result.current.fitFontSize).toBeNull()
    expect(result.current.fitColumns).toBeNull()
  })

  it('falls back to 4 columns at min font (10) when nothing fits', () => {
    const containerRef = makeContainerRef()
    const headerRef = makeHeaderRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, headerRef, lyricsOnly: false }),
      { initialProps: { enabled: false } }
    )

    result.current.shadowRef.current = makeShadowEl({ fits: false })
    act(() => rerender({ enabled: true }))

    expect(result.current.fitFontSize).toBe(10)
    expect(result.current.fitColumns).toBe(4)
  })

  it('sets up a ResizeObserver on the container when enabled', () => {
    const containerRef = makeContainerRef()
    const headerRef = makeHeaderRef()
    const observeSpy = vi.fn()
    vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: observeSpy, disconnect: vi.fn() })))

    renderHook(() =>
      useFitToScreen({ enabled: true, containerRef, headerRef, lyricsOnly: false })
    )

    expect(observeSpy).toHaveBeenCalledWith(containerRef.current)
  })

  it('disconnects ResizeObserver on cleanup', () => {
    const containerRef = makeContainerRef()
    const headerRef = makeHeaderRef()
    const disconnectSpy = vi.fn()
    vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: disconnectSpy })))

    const { unmount } = renderHook(() =>
      useFitToScreen({ enabled: true, containerRef, headerRef, lyricsOnly: false })
    )

    unmount()
    expect(disconnectSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/hooks/__tests__/useFitToScreen.test.js
```

Expected: all 7 tests fail (module not found).

- [ ] **Step 3: Create the hook**

Create `src/hooks/useFitToScreen.js`:

```js
import { useState, useRef, useLayoutEffect, useEffect } from 'react'

const MIN_FONT = 10
const MAX_FONT = 28
const MAX_COLS = 4
const DEBOUNCE_MS = 100

export function useFitToScreen({ enabled, containerRef, headerRef, lyricsOnly }) {
  const [result, setResult] = useState({ fitFontSize: null, fitColumns: null })
  const shadowRef = useRef(null)
  const timerRef = useRef(null)

  function measure() {
    const container = containerRef?.current
    const header = headerRef?.current
    const shadow = shadowRef?.current
    if (!container || !header || !shadow) return

    const availableHeight = container.clientHeight - header.offsetHeight
    if (availableHeight <= 0) return

    let best = null

    for (let cols = 1; cols <= MAX_COLS; cols++) {
      shadow.style.columnCount = cols
      shadow.style.height = `${availableHeight}px`

      let lo = MIN_FONT
      let hi = MAX_FONT
      let colBest = null

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        shadow.style.setProperty('--fit-fs', `${mid}px`)
        // Force synchronous layout reflow so scrollHeight is accurate
        void shadow.offsetHeight
        if (shadow.scrollHeight <= shadow.clientHeight) {
          colBest = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }

      if (colBest !== null) {
        best = { fitFontSize: colBest, fitColumns: cols }
        break
      }
    }

    setResult(best ?? { fitFontSize: MIN_FONT, fitColumns: MAX_COLS })
  }

  // Re-measure when enabled state or lyricsOnly changes
  useLayoutEffect(() => {
    if (!enabled) {
      setResult({ fitFontSize: null, fitColumns: null })
      return
    }
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lyricsOnly])

  // ResizeObserver: re-measure on container size changes (debounced)
  useEffect(() => {
    if (!enabled || !containerRef?.current) return
    const el = containerRef.current
    const observer = new ResizeObserver(() => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(measure, DEBOUNCE_MS)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, containerRef?.current])

  return { fitFontSize: result.fitFontSize, fitColumns: result.fitColumns, shadowRef }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/hooks/__tests__/useFitToScreen.test.js
```

Expected: all 7 passing.

- [ ] **Step 5: Run full suite for regressions**

```bash
npx vitest run
```

Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useFitToScreen.js src/hooks/__tests__/useFitToScreen.test.js
git commit -m "feat: implement useFitToScreen hook with binary-search measurement"
```

---

### Task 4: Wire SongList to use the hook and render the shadow

**Files:**
- Modify: `src/components/SongList/SongList.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/SongList/__tests__/SongList.fitMode.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SongList } from '../SongList'

// Stub out hooks/modules that need real infrastructure
vi.mock('../../../hooks/useTranspose', () => ({
  useTranspose: vi.fn(() => ({
    delta: 0,
    capo: 0,
    capoUp: vi.fn(),
    capoDown: vi.fn(),
    transposeTo: vi.fn(),
    transposedSections: [
      { label: 'Verse', lines: [{ type: 'lyric', content: 'Hello', chords: [] }] },
    ],
    usesFlats: false,
  })),
}))

vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(() => ({
    fitFontSize: 18,
    fitColumns: 2,
    shadowRef: { current: null },
  })),
}))

vi.mock('../../../lib/exportPdf', () => ({ exportLyricsPdf: vi.fn() }))

const song = {
  id: 'song-1',
  meta: { title: 'Test', keyIndex: 0 },
  sections: [],
}

const containerRef = { current: document.createElement('div') }

describe('SongList fitMode', () => {
  it('renders a hidden shadow SongBody when isFit is true', () => {
    const { container } = render(
      <SongList
        song={song}
        onPerformanceMode={vi.fn()}
        lyricsOnly={false}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        chordsOpen={true}
        onChordsToggle={vi.fn()}
        onEdit={vi.fn()}
        isFit={true}
        containerRef={containerRef}
      />
    )
    // Shadow div has position absolute and top -9999px
    const shadow = container.querySelector('[style*="-9999"]')
    expect(shadow).not.toBeNull()
  })

  it('does not render shadow SongBody when isFit is false', () => {
    const { container } = render(
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
        containerRef={containerRef}
      />
    )
    const shadow = container.querySelector('[style*="-9999"]')
    expect(shadow).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/components/SongList/__tests__/SongList.fitMode.test.jsx
```

Expected: 2 failures (SongList doesn't accept `isFit` prop yet).

- [ ] **Step 3: Update SongList**

Replace the contents of `src/components/SongList/SongList.jsx` with:

```jsx
import { useRef } from 'react'
import { useTranspose } from '../../hooks/useTranspose'
import { useFitToScreen } from '../../hooks/useFitToScreen'
import { SongHeader } from './SongHeader'
import { SongBody } from './SongBody'
import { ChordStrip } from '../Chords/ChordStrip'
import { exportLyricsPdf } from '../../lib/exportPdf'

export function SongList({
  song,
  onPerformanceMode,
  lyricsOnly = false,
  fontSize = 16,
  onFontSizeChange,
  chordsOpen,
  onChordsToggle,
  onEdit,
  isFit = false,
  containerRef,
}) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats, song.id)
  const headerRef = useRef(null)
  const { fitFontSize, fitColumns, shadowRef } = useFitToScreen({
    enabled: isFit,
    containerRef,
    headerRef,
    lyricsOnly,
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 w-full relative">
      <SongHeader
        meta={song.meta}
        transpose={transpose}
        lyricsOnly={lyricsOnly}
        onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
        onExportPdf={() => exportLyricsPdf(song.meta, song.sections)}
        onEdit={onEdit}
        headerRef={headerRef}
      />
      {!lyricsOnly && (
        <ChordStrip
          sections={transpose.transposedSections}
          open={chordsOpen}
          onToggle={onChordsToggle}
        />
      )}
      <div style={isFit && fitFontSize ? { '--fit-fs': `${fitFontSize}px` } : undefined}>
        <SongBody
          sections={transpose.transposedSections}
          fontSize={fontSize}
          lyricsOnly={lyricsOnly}
          fitMode={isFit && fitFontSize !== null}
          fitColumns={fitColumns}
        />
      </div>
      {isFit && (
        <div
          ref={shadowRef}
          style={{
            position: 'absolute',
            top: '-9999px',
            left: 0,
            visibility: 'hidden',
            width: '100%',
            overflow: 'hidden',
          }}
        >
          <SongBody
            sections={transpose.transposedSections}
            fontSize={fontSize}
            lyricsOnly={lyricsOnly}
            fitMode
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/SongList/__tests__/SongList.fitMode.test.jsx
```

Expected: 2 passing.

- [ ] **Step 5: Run full suite for regressions**

```bash
npx vitest run
```

Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/SongList/SongList.jsx src/components/SongList/__tests__/SongList.fitMode.test.jsx
git commit -m "feat: wire SongList to use useFitToScreen and render shadow for measurement"
```

---

### Task 5: Add maximize button and isFit state to MainContent

**Files:**
- Modify: `src/components/SongList/MainContent.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/SongList/__tests__/MainContent.fitMode.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MainContent } from '../MainContent'

// Stub every store/hook dependency MainContent uses
vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(selector =>
    selector({
      activeSong: {
        id: 'song-1',
        meta: { title: 'Test', keyIndex: 0 },
        sections: [],
      },
      activeSongId: 'song-1',
      index: [],
      collections: [],
      selectSong: vi.fn(),
      editingSongId: null,
      setEditingSongId: vi.fn(),
      viewMode: 'all',
    })
  ),
}))

vi.mock('../../../hooks/useDropZone', () => ({
  useDropZone: vi.fn(() => ({ isDragging: false, onDragOver: vi.fn(), onDragLeave: vi.fn(), onDrop: vi.fn() })),
}))

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: vi.fn(() => ({ importFiles: vi.fn() })),
}))

vi.mock('../../../hooks/useSwipeNavigation', () => ({
  useSwipeNavigation: vi.fn(() => ({ onTouchStart: vi.fn(), onTouchEnd: vi.fn() })),
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

// Stub SongList to avoid deep rendering
vi.mock('../SongList', () => ({
  SongList: vi.fn(({ isFit }) => <div data-testid="song-list" data-is-fit={String(isFit)} />),
}))

vi.mock('../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => null),
}))

describe('MainContent maximize button', () => {
  it('renders the maximize button when a song is active', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Fit song to screen')).toBeInTheDocument()
  })

  it('maximize button is inactive initially', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    const btn = screen.getByLabelText('Fit song to screen')
    expect(btn.className).not.toMatch(/indigo/)
  })

  it('toggles isFit on click and passes it to SongList', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    const btn = screen.getByLabelText('Fit song to screen')
    fireEvent.click(btn)
    expect(screen.getByTestId('song-list').dataset.isFit).toBe('true')
  })

  it('disables the + font button while fit mode is active', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Fit song to screen'))
    expect(screen.getByLabelText('Increase font size')).toBeDisabled()
  })

  it('disables the − font button while fit mode is active', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Fit song to screen'))
    expect(screen.getByLabelText('Decrease font size')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/components/SongList/__tests__/MainContent.fitMode.test.jsx
```

Expected: 5 failures (maximize button doesn't exist yet).

- [ ] **Step 3: Update MainContent**

In `src/components/SongList/MainContent.jsx`:

**Add `isFit` state** after the other state declarations (around line 31):

```jsx
const [isFit, setIsFit] = useState(false)
```

**Pass `isFit` and `containerRef` to SongList** (the existing `<SongList>` JSX, around line 142):

```jsx
<SongList
  song={activeSong}
  onPerformanceMode={setPerformanceSections}
  lyricsOnly={lyricsOnly}
  fontSize={fontSize}
  onFontSizeChange={onFontSizeChange}
  chordsOpen={chordsOpen}
  onChordsToggle={() => setChordsOpen(o => !o)}
  onEdit={() => setEditingSongId(activeSongId)}
  isFit={isFit}
  containerRef={containerRef}
/>
```

**Add maximize button and update font buttons** in the floating controls panel. Replace the entire floating controls `<div>` (the one with `className="fixed bottom-4 right-4 flex flex-col gap-1 z-20 pointer-events-auto"`):

```jsx
{activeSong && (
  <div className="fixed bottom-4 right-4 flex flex-col gap-1 z-20 pointer-events-auto"
    style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
    <button
      type="button"
      onClick={() => setIsFit(f => !f)}
      className={`w-8 h-8 flex items-center justify-center rounded-full
        text-gray-700 dark:text-gray-300 text-sm leading-none select-none
        active:opacity-100 transition-opacity duration-150
        ${isFit
          ? 'bg-indigo-500/50 dark:bg-indigo-400/40 opacity-90'
          : 'bg-gray-500/30 dark:bg-white/20 opacity-70'
        }`}
      aria-label="Fit song to screen"
    >⤢</button>
    <button
      type="button"
      onClick={() => onFontSizeChange(Math.min(fontSize + 2, 28))}
      disabled={fontSize >= 28 || isFit}
      className="w-8 h-8 flex items-center justify-center rounded-full
        bg-gray-500/30 dark:bg-white/20 text-gray-700 dark:text-gray-300
        text-lg font-light leading-none select-none
        opacity-70 active:opacity-100 transition-opacity duration-150
        disabled:opacity-20 disabled:cursor-not-allowed"
      aria-label="Increase font size"
    >+</button>
    <button
      type="button"
      onClick={() => onFontSizeChange(Math.max(fontSize - 2, 12))}
      disabled={fontSize <= 12 || isFit}
      className="w-8 h-8 flex items-center justify-center rounded-full
        bg-gray-500/30 dark:bg-white/20 text-gray-700 dark:text-gray-300
        text-lg font-light leading-none select-none
        opacity-70 active:opacity-100 transition-opacity duration-150
        disabled:opacity-20 disabled:cursor-not-allowed"
      aria-label="Decrease font size"
    >−</button>

    {isScrolling && (
      <>
        <div className="h-1" />
        <button
          type="button"
          onClick={() => setTargetDuration(targetDuration + 5)}
          disabled={targetDuration >= 600}
          className="w-8 h-8 flex items-center justify-center rounded-full
            bg-gray-500/30 dark:bg-white/20 text-gray-700 dark:text-gray-300
            text-lg font-light leading-none select-none
            opacity-70 active:opacity-100 transition-opacity duration-150
            disabled:opacity-20 disabled:cursor-not-allowed"
          aria-label="Increase scroll duration"
        >+</button>
        <span className="w-8 h-6 flex items-center justify-center
          text-xs text-gray-500 dark:text-gray-400 font-mono select-none tabular-nums">
          {formatDuration(targetDuration)}
        </span>
        <button
          type="button"
          onClick={() => setTargetDuration(targetDuration - 5)}
          disabled={targetDuration <= 30}
          className="w-8 h-8 flex items-center justify-center rounded-full
            bg-gray-500/30 dark:bg-white/20 text-gray-700 dark:text-gray-300
            text-lg font-light leading-none select-none
            opacity-70 active:opacity-100 transition-opacity duration-150
            disabled:opacity-20 disabled:cursor-not-allowed"
          aria-label="Decrease scroll duration"
        >−</button>
        <div className="h-1" />
      </>
    )}

    <button
      type="button"
      onClick={isScrolling ? stop : start}
      className={`w-8 h-8 flex items-center justify-center rounded-full
        text-gray-700 dark:text-gray-300 text-sm leading-none select-none
        active:opacity-100 transition-opacity duration-150
        ${isScrolling
          ? 'bg-indigo-500/50 dark:bg-indigo-400/40 opacity-90'
          : 'bg-gray-500/30 dark:bg-white/20 opacity-70'
        }`}
      aria-label={isScrolling ? 'Stop auto-scroll' : 'Start auto-scroll'}
    >{isScrolling ? '⏹' : '▶'}</button>
  </div>
)}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/SongList/__tests__/MainContent.fitMode.test.jsx
```

Expected: 5 passing.

- [ ] **Step 5: Run full suite for regressions**

```bash
npx vitest run
```

Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/SongList/MainContent.jsx src/components/SongList/__tests__/MainContent.fitMode.test.jsx
git commit -m "feat: add maximize button and isFit state to MainContent"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Toggle button above + button | Task 5 |
| Icon ⤢, turns indigo when active | Task 5 |
| Session-only (no localStorage) | Task 5 — `useState` not `useLocalStorage` |
| Live recalculation on resize | Task 3 — ResizeObserver |
| Live recalculation on song change | Handled by keyed container div in MainContent (song change remounts SongList, triggering hook) |
| Live recalculation on lyricsOnly change | Task 3 — `lyricsOnly` in `useLayoutEffect` deps |
| Full header stays visible | Task 4 — hook only affects SongBody |
| Natural column flow (no break-inside) | Task 1 — no `break-inside: avoid` added |
| Font buttons disabled in fit mode | Task 5 |
| Global fontSize never modified | Task 5 — `isFit` is separate state |
| Best-effort at 4 cols / 10px font | Task 3 — fallback in hook |
| CSS variable --fit-fs for font size | Tasks 1, 3, 4 |
| Shadow div for measurement | Tasks 3, 4 |
| Binary search 1–28 font range | Task 3 |
| Max 4 columns | Task 3 |
| headerRef for measuring header | Tasks 2, 4 |
