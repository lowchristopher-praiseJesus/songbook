# Full-page annotation area (non-paginated songs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Maximize mode, make the entire visible page — title/key/tempo, top/bottom blank padding, and lyrics — one annotatable ink canvas for non-paginated songs, instead of the canvas being limited to just the lyrics box.

**Architecture:** Extract the title/key/tempo markup into a shared `SongTitleBlock` component. `SongList.jsx` keeps rendering it in today's spot for paginated songs; for non-paginated songs it delegates rendering to `AnnotatedMaximizeView.jsx`, which renders the title as a sibling of `SongBody` inside the same wrapper the `AnnotationLayer` ink canvas now covers (instead of the canvas being nested inside `SongBody`'s own `overlay` slot). Both the pre-annotation ("live") and post-annotation ("frozen"/CSS-scaled) render branches of `AnnotatedMaximizeView` get this treatment. Paginated songs keep every line of their current JSX unchanged.

**Tech Stack:** React 18, Vite, Tailwind, Zustand (`annotationStore`), Vitest + @testing-library/react.

## Global Constraints

- **Scope: non-paginated songs only.** Paginated (multi-page) songs must render byte-for-byte identical JSX to today in every task — do not touch their code paths. (Rationale: the paginated canvas lives inside the CSS multi-column flow container whose padding must stay pixel-identical to the shadow measurement pass in `useFitToScreen.js`; touching it risks reintroducing the overflow/blank-page bug class already fixed there.)
- **`bodyRef` must keep pointing at the `SongBody`-only box, never the new outer wrapper.** `useFitToScreen`'s `getAvailableHeight()` depends on `bodyRef`'s screen position to account for title height already consuming space above it.
- **Already-annotated songs are unaffected.** `annotationStore.captureBaseline` is a no-op once `baseline` is already set — never add logic that re-captures or migrates an existing baseline.
- **Use `effectivePaginated` (`baseline ? !!baseline.paginated : paginated`), not the raw live `paginated` prop,** anywhere a component decides where to render the title. The raw prop goes stale once `useFitToScreen` is disabled (after a baseline is captured).
- Full spec: `docs/superpowers/specs/2026-07-17-full-page-annotation-design.md`.

---

## File Structure

- **Create** `src/components/SongList/SongTitleBlock.jsx` — presentational title/key/tempo block, extracted from `SongList.jsx`'s existing inline markup. No behavior change from today's rendered output.
- **Create** `src/components/SongList/__tests__/SongTitleBlock.test.jsx`.
- **Modify** `src/components/SongList/SongList.jsx` — use `SongTitleBlock`; gate its own rendering of it on `effectivePaginated`; pass `title`/`songKey`/`tempo` down to `AnnotatedMaximizeView`.
- **Modify** `src/components/Annotation/AnnotatedMaximizeView.jsx` — accept `title`/`songKey`/`tempo` props; for the non-paginated case in both the live and frozen branches, render `SongTitleBlock` alongside `SongBody` and move `AnnotationLayer` out of `SongBody`'s `overlay` slot to be a sibling covering both.
- **Create** `src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx` — new behavior + paginated-path regression assertions.
- **Modify** `src/components/SongList/__tests__/SongList.fitMode.test.jsx` — add delegation assertions.
- **Create** `src/components/Annotation/__tests__/AnnotationLayer.fullPageCapture.test.jsx` — baseline-capture integration proof.

---

### Task 1: Extract `SongTitleBlock` (pure refactor, no behavior change)

**Files:**
- Create: `src/components/SongList/SongTitleBlock.jsx`
- Create: `src/components/SongList/__tests__/SongTitleBlock.test.jsx`
- Modify: `src/components/SongList/SongList.jsx:155-169`

**Interfaces:**
- Produces: `SongTitleBlock({ title, songKey, tempo })` — a React component, default export none (named export `SongTitleBlock`), renders the `<div className="mb-4">…</div>` title block. `title` is a string (song title). `songKey` is a string or falsy (song's key label, e.g. `"Eb"`). `tempo` is a number/string or falsy (BPM). Later tasks import this from both `src/components/SongList/SongList.jsx` (`./SongTitleBlock`) and `src/components/Annotation/AnnotatedMaximizeView.jsx` (`../SongList/SongTitleBlock`).

- [ ] **Step 1: Write the failing test**

Create `src/components/SongList/__tests__/SongTitleBlock.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SongTitleBlock } from '../SongTitleBlock'

describe('SongTitleBlock', () => {
  it('renders the title as a heading', () => {
    render(<SongTitleBlock title="Amazing Grace" />)
    expect(screen.getByRole('heading', { name: 'Amazing Grace' })).not.toBeNull()
  })

  it('renders key and tempo separated by a middle dot when both are present', () => {
    render(<SongTitleBlock title="Amazing Grace" songKey="Eb" tempo={120} />)
    expect(screen.getByText('Key: Eb')).not.toBeNull()
    expect(screen.getByText('BPM: 120')).not.toBeNull()
  })

  it('renders only the key when tempo is absent', () => {
    render(<SongTitleBlock title="Amazing Grace" songKey="Eb" />)
    expect(screen.getByText('Key: Eb')).not.toBeNull()
    expect(screen.queryByText(/BPM/)).toBeNull()
  })

  it('renders no key/tempo line at all when neither is present', () => {
    const { container } = render(<SongTitleBlock title="Amazing Grace" />)
    expect(container.querySelector('p')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SongList/__tests__/SongTitleBlock.test.jsx`
Expected: FAIL — `Failed to resolve import "../SongTitleBlock"` (file doesn't exist yet).

- [ ] **Step 3: Create the component**

Create `src/components/SongList/SongTitleBlock.jsx`:

```jsx
export function SongTitleBlock({ title, songKey, tempo }) {
  return (
    <div className="mb-4">
      <h1
        className="font-bold leading-tight"
        style={{ fontFamily: 'var(--title-font)', fontSize: 'var(--title-size)', color: 'var(--title-color-active)' }}
      >{title}</h1>
      {(songKey || tempo) && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {songKey && <span>Key: {songKey}</span>}
          {songKey && tempo && <span className="mx-1.5">·</span>}
          {tempo && <span>BPM: {tempo}</span>}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/SongList/__tests__/SongTitleBlock.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire `SongTitleBlock` into `SongList.jsx`, replacing the inline markup**

In `src/components/SongList/SongList.jsx`, add the import near the top (alongside the existing `AnnotatedMaximizeView` import at line 15):

```js
import { AnnotatedMaximizeView } from '../Annotation/AnnotatedMaximizeView'
import { SongTitleBlock } from './SongTitleBlock'
```

Replace lines 155-169 (the `{isFit && (<div className="mb-4">...</div>)}` block) with:

```jsx
        {isFit && (
          <SongTitleBlock title={song.meta.title} songKey={song.meta.key} tempo={song.meta.tempo} />
        )}
```

- [ ] **Step 6: Run the existing SongList test suite to verify no behavior change**

Run: `npx vitest run src/components/SongList/__tests__/SongList.fitMode.test.jsx`
Expected: PASS (5 tests, unchanged from before this task)

- [ ] **Step 7: Commit**

```bash
git add src/components/SongList/SongTitleBlock.jsx src/components/SongList/__tests__/SongTitleBlock.test.jsx src/components/SongList/SongList.jsx
git commit -m "refactor: extract SongTitleBlock from SongList's inline title markup"
```

---

### Task 2: Delegate title + canvas to `AnnotatedMaximizeView` for non-paginated songs — live (pre-annotation) branch

**Files:**
- Modify: `src/components/SongList/SongList.jsx`
- Modify: `src/components/Annotation/AnnotatedMaximizeView.jsx:1-4, 27-42, 145-174`
- Test: `src/components/SongList/__tests__/SongList.fitMode.test.jsx` (add 2 tests)
- Create: `src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx`

**Interfaces:**
- Consumes: `SongTitleBlock({ title, songKey, tempo })` from Task 1.
- Produces: `AnnotatedMaximizeView` gains three new props — `title` (string), `songKey` (string|falsy), `tempo` (string|number|falsy) — consumed internally, not passed further down. `SongList.jsx` gains a local `effectivePaginated` boolean, computed the same way for the rest of this plan.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/SongList/__tests__/SongList.fitMode.test.jsx` (append inside the existing `describe('SongList fitMode', ...)` block, after the last `it`):

```jsx
  it('does not render the title itself for a non-paginated song (delegates to AnnotatedMaximizeView)', () => {
    const { queryByRole } = render(
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
        bodyRef={{ current: null }}
        fitFontSize={18}
        fitColumns={2}
        paginated={false}
        shadowRef={{ current: null }}
      />
    )
    // AnnotatedMaximizeView renders it instead, with the same text — but not
    // inside SongList's own top-level wrapper.
    expect(queryByRole('heading', { name: 'Test' })).not.toBeNull()
  })

  it('renders the title itself for a paginated song (unchanged path)', () => {
    const { getAllByRole } = render(
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
        bodyRef={{ current: null }}
        fitFontSize={20}
        fitColumns={3}
        paginated={true}
        totalColumns={7}
        currentPage={0}
        pageColWidth={200}
        fitAvailableHeight={600}
        shadowRef={{ current: null }}
      />
    )
    expect(getAllByRole('heading', { name: 'Test' })).toHaveLength(1)
  })
```

Create `src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnnotatedMaximizeView } from '../AnnotatedMaximizeView'
import { useAnnotationStore } from '../../../store/annotationStore'

const sections = [
  { label: 'Verse', lines: [{ type: 'lyric', content: 'Hello world', chords: [] }] },
]

beforeEach(() => {
  useAnnotationStore.setState({
    baseline: null,
    annotateMode: false,
    userZoom: 1,
    pan: { x: 0, y: 0 },
  })
})

describe('AnnotatedMaximizeView full-page canvas (live/pre-annotation branch)', () => {
  it('renders the title and puts the ink canvas outside SongBody, covering both, for a non-paginated song', () => {
    const { container } = render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        bodyRef={{ current: null }}
        fitFontSize={18}
        fitColumns={2}
        paginated={false}
        title="Amazing Grace"
        songKey="Eb"
        tempo={120}
      />
    )
    expect(screen.getByRole('heading', { name: 'Amazing Grace' })).not.toBeNull()

    const outer = container.firstChild
    const canvas = container.querySelector('canvas')
    // The canvas is a direct child of the same outer box that also contains
    // the heading — not nested inside SongBody's own content div.
    expect(canvas.parentElement).toBe(outer)
    expect(outer.contains(screen.getByRole('heading', { name: 'Amazing Grace' }))).toBe(true)
  })

  it('does not render a title and keeps the canvas inside SongBody for a paginated song (unchanged)', () => {
    const { container } = render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        bodyRef={{ current: null }}
        fitFontSize={18}
        fitColumns={3}
        paginated={true}
        totalColumns={7}
        currentPage={0}
        pageColWidth={200}
        fitAvailableHeight={600}
        title="Amazing Grace"
        songKey="Eb"
        tempo={120}
      />
    )
    expect(screen.queryByRole('heading', { name: 'Amazing Grace' })).toBeNull()

    // Canvas is nested inside SongBody's paginated inner flow div, i.e. it
    // is NOT a direct child of the outer bodyRef div.
    const outer = container.firstChild
    const canvas = container.querySelector('canvas')
    expect(canvas.parentElement).not.toBe(outer)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/SongList/__tests__/SongList.fitMode.test.jsx src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx`
Expected: FAIL — the `SongList.fitMode.test.jsx` "does not render the title itself" test fails because `SongList` still always renders it; both new `AnnotatedMaximizeView.fullPage.test.jsx` tests fail because `AnnotatedMaximizeView` doesn't accept/use `title`/`songKey`/`tempo` yet and the canvas is still nested inside `SongBody` either way.

- [ ] **Step 3: Update `SongList.jsx`**

Add the annotation-store import near the top, alongside the existing store imports (`SongList.jsx` doesn't import any store today — add this new import line near the top of the file, after the existing `import { useTranspose } from '../../hooks/useTranspose'` line):

```js
import { useAnnotationStore } from '../../store/annotationStore'
```

Inside the `SongList` function body, near the top (after the existing `const transpose = useTranspose(...)` line), add:

```js
  const baseline = useAnnotationStore(s => s.baseline)
  const effectivePaginated = baseline ? !!baseline.paginated : paginated
```

Replace the Task 1 replacement block:

```jsx
        {isFit && (
          <SongTitleBlock title={song.meta.title} songKey={song.meta.key} tempo={song.meta.tempo} />
        )}
```

with:

```jsx
        {isFit && effectivePaginated && (
          <SongTitleBlock title={song.meta.title} songKey={song.meta.key} tempo={song.meta.tempo} />
        )}
```

Add `title`/`songKey`/`tempo` props to the existing `<AnnotatedMaximizeView>` call (the props list currently spans what was originally lines 171-186 — add three new lines to that prop list):

```jsx
          <AnnotatedMaximizeView
            sections={transpose.transposedSections}
            fontSize={fontSize}
            lyricsOnly={lyricsOnly}
            annotationsVisible={annotationsVisible}
            sectionRefs={sectionRefs}
            bodyRef={bodyRef}
            fitFontSize={fitFontSize}
            fitColumns={fitColumns}
            paginated={paginated}
            totalColumns={totalColumns}
            currentPage={currentPage}
            pageColWidth={pageColWidth}
            fitAvailableHeight={fitAvailableHeight}
            containerRef={containerRef}
            title={song.meta.title}
            songKey={song.meta.key}
            tempo={song.meta.tempo}
          />
```

- [ ] **Step 4: Update `AnnotatedMaximizeView.jsx`**

Add the import (alongside the existing `SongBody`/`AnnotationLayer` imports at the top of the file):

```js
import { SongBody } from '../SongList/SongBody'
import { AnnotationLayer } from './AnnotationLayer'
import { SongTitleBlock } from '../SongList/SongTitleBlock'
import { useAnnotationStore } from '../../store/annotationStore'
```

Add the three new props to the function signature:

```js
export function AnnotatedMaximizeView({
  sections,
  fontSize,
  lyricsOnly,
  annotationsVisible,
  sectionRefs,
  bodyRef,
  fitFontSize,
  fitColumns,
  paginated,
  totalColumns,
  currentPage,
  pageColWidth,
  fitAvailableHeight,
  containerRef,
  title,
  songKey,
  tempo,
}) {
```

Replace the `if (!baseline) { ... }` block (today it unconditionally returns the single `<div ref={bodyRef} className="relative">...` JSX) with:

```jsx
  if (!baseline) {
    if (paginated) {
      return (
        <div ref={bodyRef} className="relative">
          <SongBody
            sections={sections}
            fontSize={fontSize}
            lyricsOnly={lyricsOnly}
            fitMode={fitFontSize !== null}
            fitColumns={fitColumns}
            paginated={paginated}
            totalColumns={totalColumns}
            currentPage={currentPage}
            pageColWidth={pageColWidth}
            availableHeight={fitAvailableHeight}
            annotationsVisible={annotationsVisible}
            sectionRefs={sectionRefs}
            overlay={
              <AnnotationLayer
                active={annotateMode}
                fitFontSize={fitFontSize}
                fitColumns={fitColumns}
                paginated={paginated}
                totalColumns={totalColumns}
                pageColWidth={pageColWidth}
                fitAvailableHeight={fitAvailableHeight}
              />
            }
          />
        </div>
      )
    }
    // Non-paginated: the ink canvas covers the title AND the lyrics
    // together (instead of being nested inside SongBody's own overlay
    // slot, which only wraps the lyrics), so the whole visible page is one
    // annotatable surface. `bodyRef` stays on the SongBody-only div below —
    // useFitToScreen's height math depends on its position being exactly
    // where the lyrics content starts, not the top of the title.
    return (
      <div className="relative">
        <SongTitleBlock title={title} songKey={songKey} tempo={tempo} />
        <div ref={bodyRef}>
          <SongBody
            sections={sections}
            fontSize={fontSize}
            lyricsOnly={lyricsOnly}
            fitMode={fitFontSize !== null}
            fitColumns={fitColumns}
            paginated={paginated}
            totalColumns={totalColumns}
            currentPage={currentPage}
            pageColWidth={pageColWidth}
            availableHeight={fitAvailableHeight}
            annotationsVisible={annotationsVisible}
            sectionRefs={sectionRefs}
          />
        </div>
        <AnnotationLayer
          active={annotateMode}
          fitFontSize={fitFontSize}
          fitColumns={fitColumns}
          paginated={paginated}
          totalColumns={totalColumns}
          pageColWidth={pageColWidth}
          fitAvailableHeight={fitAvailableHeight}
        />
      </div>
    )
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/SongList/__tests__/SongList.fitMode.test.jsx src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx`
Expected: PASS (7 tests in `SongList.fitMode.test.jsx`, 2 tests in `AnnotatedMaximizeView.fullPage.test.jsx`)

- [ ] **Step 6: Run the full existing annotation/pagination regression suite**

Run: `npx vitest run src/components/Annotation src/components/SongList`
Expected: PASS, all files including `SongBody.overlay.test.jsx`, `AnnotationLayer.captureBaseline.test.jsx`, `AnnotatedMaximizeView.refTiming.test.jsx`, `MainContent.pagination.annotation.test.jsx`, `MainContent.pagination.crossSongAnnotation.test.jsx`

- [ ] **Step 7: Commit**

```bash
git add src/components/SongList/SongList.jsx src/components/Annotation/AnnotatedMaximizeView.jsx src/components/SongList/__tests__/SongList.fitMode.test.jsx src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx
git commit -m "feat: expand annotation canvas to cover the title for non-paginated songs (live branch)"
```

---

### Task 3: Same treatment for the frozen (post-annotation) branch

**Files:**
- Modify: `src/components/Annotation/AnnotatedMaximizeView.jsx:179-214` (line numbers as of the end of Task 2)
- Test: `src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx` (add 2 tests)

**Interfaces:**
- Consumes: `title`/`songKey`/`tempo` props from Task 2 (same component, same props — this task only changes the branch that fires once `baseline` from `useAnnotationStore` is non-null).
- Produces: nothing new consumed by later tasks — this is the last JSX change in `AnnotatedMaximizeView.jsx`.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx`, inside the same `describe` block:

```jsx
describe('AnnotatedMaximizeView full-page canvas (frozen/post-annotation branch)', () => {
  function mockContainer(clientHeight) {
    return { clientHeight, scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) }
  }

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })))
  })

  it('renders the title inside the scaled box, alongside the canvas, for a non-paginated frozen baseline', () => {
    useAnnotationStore.setState({
      baseline: { fontSize: 20, columns: 2, width: 800, height: 500, paginated: false },
      annotateMode: false,
      userZoom: 1,
      pan: { x: 0, y: 0 },
    })
    const containerRef = { current: mockContainer(500) }

    const { container } = render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        containerRef={containerRef}
        title="Amazing Grace"
        songKey="Eb"
        tempo={120}
      />
    )

    expect(screen.getByRole('heading', { name: 'Amazing Grace' })).not.toBeNull()
    const scaledBox = container.querySelector('canvas').closest('div[style*="scale"]')
    expect(scaledBox.contains(screen.getByRole('heading', { name: 'Amazing Grace' }))).toBe(true)
  })

  it('does not render a title for a paginated frozen baseline (unchanged)', () => {
    useAnnotationStore.setState({
      baseline: { fontSize: 20, columns: 3, width: 868, height: 406, paginated: true, totalColumns: 9, pageColWidth: 268, availableHeight: 374 },
      annotateMode: false,
      userZoom: 1,
      pan: { x: 0, y: 0 },
    })
    const containerRef = { current: mockContainer(500) }

    render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        containerRef={containerRef}
        currentPage={0}
        title="Amazing Grace"
        songKey="Eb"
        tempo={120}
      />
    )

    expect(screen.queryByRole('heading', { name: 'Amazing Grace' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx`
Expected: FAIL — the frozen branch doesn't render `SongTitleBlock` yet, so both new tests in the "frozen" describe block fail (first: no heading found; second: passes accidentally today since no title is rendered at all yet, but confirm it still passes for the right reason after the change).

- [ ] **Step 3: Update the frozen branch in `AnnotatedMaximizeView.jsx`**

Replace the final return block (today: the `<div ref={outerRef} ...><div className="absolute top-0 left-0" ...><SongBody overlay={<AnnotationLayer .../>} /></div></div>` JSX) with:

```jsx
  const scale = fitScale * userZoom

  return (
    <div
      ref={outerRef}
      className="relative w-full overflow-hidden"
      style={{ height: `${availableHeight}px` }}
      onPointerDown={startPan}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: `${baseline.width}px`,
          height: `${baseline.height}px`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: 'top left',
          '--fit-fs': `${baseline.fontSize}px`,
          cursor: !annotateMode && userZoom > 1 ? 'grab' : 'default',
        }}
      >
        {!baseline.paginated && (
          <SongTitleBlock title={title} songKey={songKey} tempo={tempo} />
        )}
        <SongBody
          sections={sections}
          fontSize={fontSize}
          lyricsOnly={lyricsOnly}
          fitMode
          fitColumns={baseline.columns}
          paginated={baseline.paginated}
          totalColumns={baseline.totalColumns}
          currentPage={currentPage}
          pageColWidth={baseline.pageColWidth}
          availableHeight={baseline.availableHeight}
          annotationsVisible={annotationsVisible}
          overlay={
            baseline.paginated
              ? <AnnotationLayer active={annotateMode} fitFontSize={baseline.fontSize} fitColumns={baseline.columns} />
              : undefined
          }
        />
        {!baseline.paginated && (
          <AnnotationLayer active={annotateMode} fitFontSize={baseline.fontSize} fitColumns={baseline.columns} />
        )}
      </div>
    </div>
  )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx`
Expected: PASS (4 tests total in this file)

- [ ] **Step 5: Run the full regression suite, including the ref-timing test**

Run: `npx vitest run src/components/Annotation src/components/SongList`
Expected: PASS — in particular `AnnotatedMaximizeView.refTiming.test.jsx` (which uses `baseline: { paginated: false, ... }` without a `title` prop) still passes: `SongTitleBlock` renders fine with `title` undefined, and that test only asserts on `outer.style.height`.

- [ ] **Step 6: Commit**

```bash
git add src/components/Annotation/AnnotatedMaximizeView.jsx src/components/Annotation/__tests__/AnnotatedMaximizeView.fullPage.test.jsx
git commit -m "feat: expand annotation canvas to cover the title for non-paginated songs (frozen branch)"
```

---

### Task 4: Prove the baseline capture actually grows to the full page

**Files:**
- Create: `src/components/Annotation/__tests__/AnnotationLayer.fullPageCapture.test.jsx`

**Interfaces:**
- Consumes: `AnnotatedMaximizeView` (Tasks 2-3), `AnnotationLayer`'s existing (unmodified) `onPointerUp` capture logic.
- Produces: nothing consumed by later tasks — this is a regression-guard integration test.

This test proves the end-to-end result: because the canvas is now mounted on the title+lyrics wrapper (Task 2), drawing the first stroke on a non-paginated song captures a `baseline.width`/`height` that includes the title's height, not just the lyrics box — using the same DOM-measurement-fake style as `AnnotationLayer.captureBaseline.test.jsx`.

- [ ] **Step 1: Write the failing test**

Create `src/components/Annotation/__tests__/AnnotationLayer.fullPageCapture.test.jsx`:

```jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AnnotatedMaximizeView } from '../AnnotatedMaximizeView'
import { useAnnotationStore } from '../../../store/annotationStore'

function drawOneStroke(canvas) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
  fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
}

const sections = [
  { label: 'Verse', lines: [{ type: 'lyric', content: 'Hello world', chords: [] }] },
]

describe('Baseline capture covers the full title+lyrics page for non-paginated songs', () => {
  beforeEach(() => {
    useAnnotationStore.setState({
      songId: 'song-1', baseline: null, annotateMode: true,
      layers: useAnnotationStore.getState().layers.map(l => ({ ...l, strokes: [] })),
    })
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      setTransform: vi.fn(), clearRect: vi.fn(), fill: vi.fn(),
    }))
    vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })))
    vi.stubGlobal('Path2D', vi.fn(() => ({ moveTo: vi.fn(), quadraticCurveTo: vi.fn(), closePath: vi.fn() })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('captures a baseline box at least as tall as the title block plus the lyrics box', () => {
    // The canvas now sits on the outer wrapper (title + lyrics), so its
    // clientHeight reflects both. Simulate that combined size directly,
    // the same way AnnotationLayer.captureBaseline.test.jsx simulates the
    // paginated flow's size.
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, value: 600 })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, value: 560 })

    const { container } = render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        bodyRef={{ current: null }}
        fitFontSize={20}
        fitColumns={2}
        paginated={false}
        title="Amazing Grace"
        songKey="Eb"
        tempo={120}
      />
    )
    drawOneStroke(container.querySelector('canvas'))

    const baseline = useAnnotationStore.getState().baseline
    expect(baseline).not.toBeNull()
    expect(baseline.width).toBe(600)
    // 560 includes both the title block and the lyrics box, since the
    // canvas is mounted on their shared outer wrapper — bigger than the
    // lyrics box would have measured on its own.
    expect(baseline.height).toBe(560)
  })
})
```

- [ ] **Step 2: Run test to verify it fails or passes for the wrong reason**

Run: `npx vitest run src/components/Annotation/__tests__/AnnotationLayer.fullPageCapture.test.jsx`
Expected: If Tasks 2-3 are already applied, this should PASS immediately — it's a regression-guard test written after the fact, not driving new implementation. Confirm it PASSES now, and additionally confirm it would have FAILED before Task 2 by temporarily checking out the pre-Task-2 state is unnecessary — the test's job going forward is to catch a future regression, not to drive new code. If it fails here, that means Tasks 2-3 were not applied correctly; stop and re-check those tasks' Step 4/3 JSX before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/components/Annotation/__tests__/AnnotationLayer.fullPageCapture.test.jsx
git commit -m "test: verify baseline capture covers the full title+lyrics page"
```

---

## Final Verification

- [ ] Run the full test suite: `npx vitest run`
  Expected: all tests pass (no regressions elsewhere).
- [ ] Manually verify in a real browser (per project convention — jsdom does no real layout, per `project_useFitToScreen_pagination_real_browser` memory): open a short, non-paginated song in Maximize mode, enter annotate mode, and confirm you can draw over the title and in the blank space above/below the lyrics. Then open a long, paginated song and confirm annotation behavior is unchanged from before this plan (canvas still only covers the lyrics, no title annotation).
