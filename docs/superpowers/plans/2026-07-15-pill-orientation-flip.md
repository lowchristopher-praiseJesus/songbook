# Annotation Pill Orientation Flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the annotation control pill (`AnnotationToolbar.jsx`) switch between a vertical stack and a horizontal strip based on which screen edge it's nearest to, live while dragging.

**Architecture:** `useDraggablePill.js` gains an `orientation` value (`'vertical' | 'horizontal'`), derived from the pill's position + rendered size vs. the four window edges, with a small hysteresis margin to avoid corner flicker. `AnnotationToolbar.jsx` consumes `orientation` and swaps Tailwind classes on every internal group (container, grip, pen/eraser, color grid, layer rows, undo/reset) to fully transpose the layout.

**Tech Stack:** React 18 hooks (`useState`, `useRef`, `useLayoutEffect`, `useCallback`), Vitest + `@testing-library/react`, Tailwind CSS.

## Global Constraints

- No new persisted state — orientation is always derived from position, never stored separately (per spec).
- Orientation flips live during drag, not only on drop (per spec).
- Hysteresis margin is exactly 24px (per spec).
- Full transpose of every internal group when horizontal — not just the outer container (per spec).
- Spec doc: `docs/superpowers/specs/2026-07-15-pill-orientation-flip-design.md`.

---

## Note on the spec's ResizeObserver mention

The spec's Architecture section names a `ResizeObserver` for re-clamping position after an orientation-driven size change. This plan implements that same guarantee with a `useLayoutEffect` keyed on `orientation` instead: `useLayoutEffect` runs synchronously after React commits the new orientation's CSS classes and before paint, so reading `pillRef.current.offsetWidth/offsetHeight` at that point already reflects the new size — no observer needed, and it avoids depending on a jsdom-unsupported API that would otherwise need a test-only polyfill. Behavior is identical to the spec's intent (nudge the pill back on-screen after its own orientation flip changes its size); only the mechanism is simpler.

jsdom has no real layout engine, so `offsetWidth`/`offsetHeight` are always `0` in component tests regardless of orientation — the "re-clamp using the new size" behavior can't be meaningfully exercised by an automated test in this codebase (the hook-level tests can fake pill dimensions via a mock ref object, but the mount/reclamp effects specifically depend on the *real* ref-attachment timing that only exists in a real DOM render, where dimensions never actually change in jsdom). Task 2's manual browser-verification step is where this is actually checked.

---

### Task 1: Live orientation computation in `useDraggablePill` (drag path)

**Files:**
- Modify: `src/hooks/useDraggablePill.js`
- Test: `src/hooks/__tests__/useDraggablePill.test.js`

**Interfaces:**
- Produces: `useDraggablePill(storageKey)` return value gains `orientation: 'vertical' | 'horizontal'` alongside the existing `pillRef`, `position`, `gripProps`.
- Produces (internal, used by Task 2 too): `computeOrientation(position, pillEl, prevOrientation)` — a module-private function in `useDraggablePill.js` that returns `'vertical' | 'horizontal'`.

- [ ] **Step 1: Write the failing tests**

Add to `src/hooks/__tests__/useDraggablePill.test.js`, inside the existing `describe('useDraggablePill', ...)` block (after the last existing `it(...)`, before the closing `})`):

```js
  it('defaults to vertical orientation before any drag', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    expect(result.current.orientation).toBe('vertical')
  })

  it('flips to horizontal orientation when dragged near the top edge', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100, width: 200, height: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 110 }))
    })

    expect(result.current.position).toEqual({ x: 400, y: 10 })
    expect(result.current.orientation).toBe('horizontal')
  })

  it('stays vertical when dragged near the left edge', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100, width: 200, height: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 110, clientY: 500 }))
    })

    expect(result.current.position).toEqual({ x: 10, y: 400 })
    expect(result.current.orientation).toBe('vertical')
  })

  it('applies hysteresis so a marginal geometry change does not flip orientation, but a clear one does', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100, width: 200, height: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })

    // Move 1: solidly near the top edge -> flips to horizontal.
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 110 }))
    })
    expect(result.current.orientation).toBe('horizontal')

    // Move 2: raw geometry now marginally favors vertical (by 10px, under the
    // 24px margin) -> stays horizontal.
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 360 }))
    })
    expect(result.current.position).toEqual({ x: 200, y: 260 })
    expect(result.current.orientation).toBe('horizontal')

    // Move 3: clearly vertical-favoring (by 84px, over the margin) -> flips.
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 434 }))
    })
    expect(result.current.position).toEqual({ x: 200, y: 334 })
    expect(result.current.orientation).toBe('vertical')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/hooks/__tests__/useDraggablePill.test.js`
Expected: FAIL — `result.current.orientation` is `undefined`, not `'vertical'`/`'horizontal'`.

- [ ] **Step 3: Implement `computeOrientation` and wire it into `onMove`**

In `src/hooks/useDraggablePill.js`, add the constant and helper function after the existing `clamp` function (after line 26, before `export function useDraggablePill`):

```js
const ORIENTATION_FLIP_MARGIN = 24

function computeOrientation(position, pillEl, prevOrientation) {
  if (!position || !pillEl) return 'vertical'
  const width = pillEl.offsetWidth ?? 0
  const height = pillEl.offsetHeight ?? 0
  const centerX = position.x + width / 2
  const centerY = position.y + height / 2
  const distHorizontal = Math.min(centerY, window.innerHeight - centerY)
  const distVertical = Math.min(centerX, window.innerWidth - centerX)
  const candidate = distHorizontal < distVertical ? 'horizontal' : 'vertical'
  if (candidate === prevOrientation) return prevOrientation
  const candidateDist = candidate === 'horizontal' ? distHorizontal : distVertical
  const prevDist = prevOrientation === 'horizontal' ? distHorizontal : distVertical
  return prevDist - candidateDist > ORIENTATION_FLIP_MARGIN ? candidate : prevOrientation
}
```

Then update the hook body. Change:

```js
export function useDraggablePill(storageKey) {
  const pillRef = useRef(null)
  const activeDragRef = useRef(null)
  const [position, setPosition] = useState(() => readStoredPosition(storageKey))
```

to:

```js
export function useDraggablePill(storageKey) {
  const pillRef = useRef(null)
  const activeDragRef = useRef(null)
  const orientationRef = useRef('vertical')
  const [position, setPosition] = useState(() => readStoredPosition(storageKey))
  const [orientation, setOrientation] = useState('vertical')
```

Change the `onMove` function inside `startDrag`:

```js
    function onMove(ev) {
      const deltaX = ev.clientX - startClientX
      const deltaY = ev.clientY - startClientY
      setPosition(clamp({ x: startLeft + deltaX, y: startTop + deltaY }, pillRef.current))
    }
```

to:

```js
    function onMove(ev) {
      const deltaX = ev.clientX - startClientX
      const deltaY = ev.clientY - startClientY
      const next = clamp({ x: startLeft + deltaX, y: startTop + deltaY }, pillRef.current)
      setPosition(next)
      const nextOrientation = computeOrientation(next, pillRef.current, orientationRef.current)
      if (nextOrientation !== orientationRef.current) {
        orientationRef.current = nextOrientation
        setOrientation(nextOrientation)
      }
    }
```

Finally, update the return statement:

```js
  return { pillRef, position, gripProps: { onPointerDown: startDrag } }
```

to:

```js
  return { pillRef, position, orientation, gripProps: { onPointerDown: startDrag } }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/hooks/__tests__/useDraggablePill.test.js`
Expected: PASS (all tests, including the 4 new ones and all pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDraggablePill.js src/hooks/__tests__/useDraggablePill.test.js
git commit -m "feat: compute annotation pill orientation live during drag"
```

---

### Task 2: Mount-time orientation, re-clamp on flip, and full component transpose

This task adds the hook's remaining two effects and wires `AnnotationToolbar.jsx` up to `orientation` in the same task, because the mount-time effect can only be observed once there's a real, rendered DOM node to attach to — which only exists once the component consumes the hook. (Hook-only tests, per this file's existing convention, assign `pillRef.current` manually *after* `renderHook()` returns, i.e. after mount effects have already run — so a mount effect has nothing to prove at the hook level. See the `ResizeObserver` note above for why the reclamp effect has the same constraint.)

**Files:**
- Modify: `src/hooks/useDraggablePill.js`
- Modify: `src/components/Annotation/AnnotationToolbar.jsx`
- Test: `src/components/Annotation/__tests__/AnnotationToolbar.test.jsx`

**Interfaces:**
- Consumes: `computeOrientation`, `clamp`, `orientationRef`, `pillRef`, `position`, `orientation`, `setOrientation`, `setPosition` from Task 1.
- Consumes: `useDraggablePill('songsheet_annotation_pill_pos')` return value, now including `orientation` (Task 1).
- Produces: no new exports — `AnnotationToolbar` becomes orientation-aware internally only.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/components/Annotation/__tests__/AnnotationToolbar.test.jsx` with:

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { AnnotationToolbar } from '../AnnotationToolbar'
import { useAnnotationStore } from '../../../store/annotationStore'

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height })
}

beforeEach(() => {
  localStorage.clear()
  useAnnotationStore.getState().loadForSong('song-1')
  useAnnotationStore.setState({ tool: 'pen' })
  setViewport(1024, 768)
})

describe('AnnotationToolbar', () => {
  it('renders a drag grip handle', () => {
    render(<AnnotationToolbar />)
    expect(screen.getByLabelText('Drag to reposition toolbar')).toBeInTheDocument()
  })

  it('clicking the eraser tool still works normally (not treated as a drag)', () => {
    render(<AnnotationToolbar />)
    fireEvent.click(screen.getByLabelText('Eraser tool'))
    expect(screen.getByLabelText('Eraser tool')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Pen tool')).toHaveAttribute('aria-pressed', 'false')
  })

  it('uses the default left/center position when no position is stored', () => {
    render(<AnnotationToolbar />)
    const pill = screen.getByLabelText('Drag to reposition toolbar').closest('[data-pill-root]')
    expect(pill).toHaveStyle({ left: '1rem', top: '50%' })
  })

  it('applies a stored position as inline left/top styles', () => {
    localStorage.setItem('songsheet_annotation_pill_pos', JSON.stringify({ x: 300, y: 120 }))
    render(<AnnotationToolbar />)
    const pill = screen.getByLabelText('Drag to reposition toolbar').closest('[data-pill-root]')
    expect(pill).toHaveStyle({ left: '300px', top: '120px' })
  })

  it('renders a vertical layout by default (no stored position)', () => {
    render(<AnnotationToolbar />)
    const pill = screen.getByLabelText('Drag to reposition toolbar').closest('[data-pill-root]')
    expect(pill).toHaveClass('flex-col')
    expect(pill).not.toHaveClass('flex-row')
    expect(screen.getByTestId('color-swatches')).toHaveClass('grid-cols-2')
  })

  it('renders a horizontal layout when the stored position is near the top edge', () => {
    localStorage.setItem('songsheet_annotation_pill_pos', JSON.stringify({ x: 500, y: 5 }))
    render(<AnnotationToolbar />)
    const pill = screen.getByLabelText('Drag to reposition toolbar').closest('[data-pill-root]')
    expect(pill).toHaveClass('flex-row')
    expect(pill).not.toHaveClass('flex-col')
    expect(screen.getByTestId('color-swatches')).toHaveClass('grid-cols-3')
  })
})
```

The last test (`'renders a horizontal layout when the stored position is near the top edge'`) is the one that actually requires this task's mount-time effect: without it, `orientation` never leaves its `'vertical'` default on a static render (no drag happens in this test), so the assertion on `flex-row` would fail even after Task 1 alone.

- [ ] **Step 2: Run tests to verify the two new tests fail**

Run: `npm test -- src/components/Annotation/__tests__/AnnotationToolbar.test.jsx`
Expected: FAIL on `'renders a vertical layout by default...'` (no `data-testid="color-swatches"` yet) and `'renders a horizontal layout...'` (same, plus `orientation` never reaches `'horizontal'` without the mount effect).

- [ ] **Step 3: Add the two `useLayoutEffect`s to the hook**

In `src/hooks/useDraggablePill.js`, update the import line:

```js
import { useRef, useState, useEffect, useCallback } from 'react'
```

to:

```js
import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
```

Then, immediately after the existing cleanup effect:

```js
  useEffect(() => () => {
    if (activeDragRef.current) {
      window.removeEventListener('pointermove', activeDragRef.current.onMove)
      window.removeEventListener('pointerup', activeDragRef.current.onUp)
    }
  }, [])
```

add:

```js
  useLayoutEffect(() => {
    if (!pillRef.current) return
    const next = computeOrientation(position, pillRef.current, orientationRef.current)
    if (next !== orientationRef.current) {
      orientationRef.current = next
      setOrientation(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    setPosition(prev => {
      if (!prev) return prev
      const next = clamp(prev, pillRef.current)
      return (next.x === prev.x && next.y === prev.y) ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation])
```

- [ ] **Step 4: Wire `orientation` into `AnnotationToolbar.jsx`**

Change the hook destructure:

```jsx
  const { pillRef, position, gripProps } = useDraggablePill('songsheet_annotation_pill_pos')
```

to:

```jsx
  const { pillRef, position, orientation, gripProps } = useDraggablePill('songsheet_annotation_pill_pos')
  const isHorizontal = orientation === 'horizontal'
```

Change the outer container:

```jsx
    <div
      ref={pillRef}
      data-pill-root
      className="fixed z-20 flex flex-col items-center gap-2
        bg-white/25 dark:bg-gray-900/25 backdrop-blur-xl rounded-2xl shadow-lg
        border border-gray-200/40 dark:border-gray-700/30 py-2 px-1.5"
      style={
        position
          ? { left: `${position.x}px`, top: `${position.y}px` }
          : { left: '1rem', top: '50%', transform: 'translateY(-50%)' }
      }
    >
```

to:

```jsx
    <div
      ref={pillRef}
      data-pill-root
      className={`fixed z-20 flex items-center gap-2
        bg-white/25 dark:bg-gray-900/25 backdrop-blur-xl rounded-2xl shadow-lg
        border border-gray-200/40 dark:border-gray-700/30
        ${isHorizontal ? 'flex-row px-2 py-1.5' : 'flex-col py-2 px-1.5'}`}
      style={
        position
          ? { left: `${position.x}px`, top: `${position.y}px` }
          : { left: '1rem', top: '50%', transform: 'translateY(-50%)' }
      }
    >
```

Change the grip handle:

```jsx
      {/* Drag handle */}
      <div
        {...gripProps}
        className="w-full flex justify-center pt-0.5 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
        aria-label="Drag to reposition toolbar"
      >
        <div className="flex flex-col gap-[3px]">
          <div className="w-4 h-[2px] rounded-full bg-gray-400/60 dark:bg-gray-500/50" />
          <div className="w-4 h-[2px] rounded-full bg-gray-400/60 dark:bg-gray-500/50" />
        </div>
      </div>
```

to:

```jsx
      {/* Drag handle */}
      <div
        {...gripProps}
        className={`flex cursor-grab active:cursor-grabbing touch-none select-none
          ${isHorizontal ? 'h-full flex-col justify-center pl-0.5 pr-1' : 'w-full justify-center pt-0.5 pb-1'}`}
        aria-label="Drag to reposition toolbar"
      >
        <div className={`flex gap-[3px] ${isHorizontal ? 'flex-row' : 'flex-col'}`}>
          <div className={isHorizontal ? 'h-4 w-[2px] rounded-full bg-gray-400/60 dark:bg-gray-500/50' : 'w-4 h-[2px] rounded-full bg-gray-400/60 dark:bg-gray-500/50'} />
          <div className={isHorizontal ? 'h-4 w-[2px] rounded-full bg-gray-400/60 dark:bg-gray-500/50' : 'w-4 h-[2px] rounded-full bg-gray-400/60 dark:bg-gray-500/50'} />
        </div>
      </div>
```

Change the pen/eraser group (identify by the preceding `{/* Pen / eraser */}` comment — an identical className string also appears on the undo/reset group later in the file, so match on this comment + className pair, not the className alone):

```jsx
      {/* Pen / eraser */}
      <div className="flex flex-col gap-0.5 bg-gray-100/70 dark:bg-gray-800/70 rounded-xl p-0.5">
```

to:

```jsx
      {/* Pen / eraser */}
      <div className={`flex gap-0.5 bg-gray-100/70 dark:bg-gray-800/70 rounded-xl p-0.5 ${isHorizontal ? 'flex-row' : 'flex-col'}`}>
```

Change the color swatches container:

```jsx
      {/* Color swatches */}
      <div className="grid grid-cols-2 gap-1 py-1">
```

to:

```jsx
      {/* Color swatches */}
      <div data-testid="color-swatches" className={`grid gap-1 py-1 ${isHorizontal ? 'grid-cols-3' : 'grid-cols-2'}`}>
```

Change the layers container:

```jsx
      {/* Layers */}
      <div className="flex flex-col gap-1 py-1">
```

to:

```jsx
      {/* Layers */}
      <div className={`flex gap-1 py-1 ${isHorizontal ? 'flex-row' : 'flex-col'}`}>
```

Change the undo/reset group (identify by the preceding `{/* Undo / reset */}` comment):

```jsx
      {/* Undo / reset */}
      <div className="flex flex-col gap-0.5 bg-gray-100/70 dark:bg-gray-800/70 rounded-xl p-0.5">
```

to:

```jsx
      {/* Undo / reset */}
      <div className={`flex gap-0.5 bg-gray-100/70 dark:bg-gray-800/70 rounded-xl p-0.5 ${isHorizontal ? 'flex-row' : 'flex-col'}`}>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/components/Annotation/__tests__/AnnotationToolbar.test.jsx`
Expected: PASS (all 6 tests).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in other suites (including `src/hooks/__tests__/useDraggablePill.test.js` from Task 1).

- [ ] **Step 7: Manually verify in the browser**

Per the project's UI-change verification requirement: start the dev server, open a song, enter annotate mode, and drag the pill to each of the four screen edges. Confirm:
- It renders horizontal near the top/bottom and vertical near the left/right.
- The flip happens live, mid-drag, not just on drop.
- Dragging through a corner doesn't flicker rapidly between orientations.
- Every control (pen/eraser, colors, layer buttons, undo/reset) is still clickable and correctly wired in both orientations.
- Dragging the pill to an edge that flips its orientation (e.g. from a tall vertical shape on the left edge, across to the top edge) doesn't leave any part of the pill hanging off-screen once it becomes the wider/shorter horizontal shape.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useDraggablePill.js src/components/Annotation/AnnotationToolbar.jsx src/components/Annotation/__tests__/AnnotationToolbar.test.jsx
git commit -m "feat: transpose annotation pill layout to horizontal near top/bottom edges"
```
