# Movable Annotation Control Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag the Maximize-mode annotation control pill (`AnnotationToolbar.jsx`) to any position on screen, and remember that position across sessions.

**Architecture:** A new standalone hook, `useDraggablePill`, owns free 2D pointer-drag tracking, viewport clamping, and `localStorage` persistence — mirroring (but not sharing code with) the existing 1D drag already used by the normal-mode floating-controls pill in `MainContent.jsx`. `AnnotationToolbar.jsx` consumes the hook, adds a grip handle that alone initiates dragging, and switches its positioning from static Tailwind classes to hook-driven inline `left`/`top` styles.

**Tech Stack:** React 18 (hooks: `useState`, `useRef`, `useCallback`, `useEffect`), Vitest + `@testing-library/react` (`renderHook`, `act`), no new dependencies.

## Global Constraints

- New `localStorage` key: `songsheet_annotation_pill_pos`, storing JSON `{x, y}` (pixel `left`/`top` values).
- Viewport clamp margin: `8px` on all sides (matches the existing floating-controls pill's `8` constant in `MainContent.jsx:118`).
- No content-aware collision avoidance, no reset-to-default control, no resize-responsive repositioning — explicitly out of scope per the design spec (`docs/superpowers/specs/2026-07-15-movable-annotation-pill-design.md`).
- Do not modify `MainContent.jsx`'s existing inline drag code — it is out of scope for this plan.

---

### Task 1: `useDraggablePill` hook

**Files:**
- Create: `src/hooks/useDraggablePill.js`
- Test: `src/hooks/__tests__/useDraggablePill.test.js`

**Interfaces:**
- Consumes: nothing from other tasks (standalone).
- Produces: `useDraggablePill(storageKey: string) => { pillRef: RefObject, position: {x:number, y:number} | null, gripProps: { onPointerDown: (e) => void } }`. Task 2 imports `useDraggablePill` from `../../hooks/useDraggablePill`, attaches `pillRef` to the pill's root DOM node, reads `position` to compute inline style, and spreads `gripProps` onto the grip handle element.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useDraggablePill.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraggablePill } from '../useDraggablePill'

const KEY = 'test_draggable_pill_pos'

function mockPillEl({ left = 100, top = 100, width = 200, height = 300 } = {}) {
  return {
    getBoundingClientRect: () => ({ left, top }),
    offsetWidth: width,
    offsetHeight: height,
  }
}

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height })
}

beforeEach(() => {
  localStorage.clear()
  setViewport(1024, 768)
})

describe('useDraggablePill', () => {
  it('returns null position when nothing stored', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    expect(result.current.position).toBeNull()
  })

  it('reads a valid stored position on mount', () => {
    localStorage.setItem(KEY, JSON.stringify({ x: 50, y: 60 }))
    const { result } = renderHook(() => useDraggablePill(KEY))
    expect(result.current.position).toEqual({ x: 50, y: 60 })
  })

  it('ignores malformed stored JSON and falls back to null', () => {
    localStorage.setItem(KEY, 'not json')
    const { result } = renderHook(() => useDraggablePill(KEY))
    expect(result.current.position).toBeNull()
  })

  it('ignores a stored value missing x/y and falls back to null', () => {
    localStorage.setItem(KEY, JSON.stringify({ foo: 'bar' }))
    const { result } = renderHook(() => useDraggablePill(KEY))
    expect(result.current.position).toBeNull()
  })

  it('dragging updates position in both axes', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 230, clientY: 250 }))
    })

    expect(result.current.position).toEqual({ x: 130, y: 150 })
  })

  it('clamps position to the bottom-right viewport margin', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100, width: 200, height: 300 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 5000, clientY: 5000 }))
    })

    // maxX = 1024 - 200 - 8 = 816, maxY = 768 - 300 - 8 = 460
    expect(result.current.position).toEqual({ x: 816, y: 460 })
  })

  it('clamps position to the top-left viewport margin', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: -5000, clientY: -5000 }))
    })

    expect(result.current.position).toEqual({ x: 8, y: 8 })
  })

  it('persists position to localStorage only on pointerup, not on every move', () => {
    const { result } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100 })

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 230, clientY: 250 }))
    })
    expect(localStorage.getItem(KEY)).toBeNull()

    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup'))
    })

    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ x: 130, y: 150 })
  })

  it('removes window listeners on unmount', () => {
    const { result, unmount } = renderHook(() => useDraggablePill(KEY))
    result.current.pillRef.current = mockPillEl({ left: 100, top: 100 })
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    act(() => {
      result.current.gripProps.onPointerDown({ preventDefault: vi.fn(), clientX: 200, clientY: 200 })
    })
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))
    removeSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useDraggablePill.test.js`
Expected: FAIL — `Cannot find module '../useDraggablePill'` (or similar resolution error), since the hook doesn't exist yet.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useDraggablePill.js`:

```js
import { useRef, useState, useEffect, useCallback } from 'react'

const MARGIN = 8

function readStoredPosition(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed
    return null
  } catch {
    return null
  }
}

function clamp(next, pillEl) {
  const width = pillEl?.offsetWidth ?? 0
  const height = pillEl?.offsetHeight ?? 0
  const maxX = Math.max(MARGIN, window.innerWidth - width - MARGIN)
  const maxY = Math.max(MARGIN, window.innerHeight - height - MARGIN)
  return {
    x: Math.max(MARGIN, Math.min(maxX, next.x)),
    y: Math.max(MARGIN, Math.min(maxY, next.y)),
  }
}

export function useDraggablePill(storageKey) {
  const pillRef = useRef(null)
  const activeDragRef = useRef(null)
  const [position, setPosition] = useState(() => readStoredPosition(storageKey))

  useEffect(() => () => {
    if (activeDragRef.current) {
      window.removeEventListener('pointermove', activeDragRef.current.onMove)
      window.removeEventListener('pointerup', activeDragRef.current.onUp)
    }
  }, [])

  const startDrag = useCallback((e) => {
    e.preventDefault()
    const rect = pillRef.current.getBoundingClientRect()
    const startClientX = e.clientX
    const startClientY = e.clientY
    const startLeft = rect.left
    const startTop = rect.top

    function onMove(ev) {
      const deltaX = ev.clientX - startClientX
      const deltaY = ev.clientY - startClientY
      setPosition(clamp({ x: startLeft + deltaX, y: startTop + deltaY }, pillRef.current))
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      activeDragRef.current = null
      setPosition(prev => {
        if (prev) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(prev))
          } catch (err) {
            console.warn('useDraggablePill write failed:', err)
          }
        }
        return prev
      })
    }

    activeDragRef.current = { onMove, onUp }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [storageKey])

  return { pillRef, position, gripProps: { onPointerDown: startDrag } }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useDraggablePill.test.js`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDraggablePill.js src/hooks/__tests__/useDraggablePill.test.js
git commit -m "feat: add useDraggablePill hook for free 2D pill dragging"
```

---

### Task 2: Wire the grip handle and positioning into `AnnotationToolbar`

**Files:**
- Modify: `src/components/Annotation/AnnotationToolbar.jsx`
- Test: `src/components/Annotation/__tests__/AnnotationToolbar.test.jsx` (new file; no `__tests__` dir exists yet under `src/components/Annotation/` — create it)

**Interfaces:**
- Consumes: `useDraggablePill` from Task 1 — `useDraggablePill('songsheet_annotation_pill_pos')` returning `{ pillRef, position, gripProps }`.
- Produces: nothing consumed by later tasks (this is the final task).

- [ ] **Step 1: Write the failing tests**

Create `src/components/Annotation/__tests__/AnnotationToolbar.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AnnotationToolbar } from '../AnnotationToolbar'
import { useAnnotationStore } from '../../../store/annotationStore'

beforeEach(() => {
  localStorage.clear()
  useAnnotationStore.getState().loadForSong('song-1')
  useAnnotationStore.setState({ tool: 'pen' })
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
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/Annotation/__tests__/AnnotationToolbar.test.jsx`
Expected: FAIL — `getByLabelText('Drag to reposition toolbar')` finds no element (grip doesn't exist yet), and `data-pill-root` isn't present.

- [ ] **Step 3: Implement the grip handle and hook-driven positioning**

Modify `src/components/Annotation/AnnotationToolbar.jsx`:

Replace the import block at the top (`src/components/Annotation/AnnotationToolbar.jsx:1-3`):

```jsx
import { useState, useRef, useEffect } from 'react'
import { PencilIcon, EyeIcon, EyeSlashIcon, ArrowUturnLeftIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useAnnotationStore, MAX_LAYERS } from '../../store/annotationStore'
import { useDraggablePill } from '../../hooks/useDraggablePill'
```

Inside the component, right after the existing store hooks (`src/components/Annotation/AnnotationToolbar.jsx:7-17`), add:

```jsx
  const { pillRef, position, gripProps } = useDraggablePill('songsheet_annotation_pill_pos')
```

Replace the root `<div>` open tag and its `className` (`src/components/Annotation/AnnotationToolbar.jsx:34-39`):

```jsx
  return (
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

(The rest of the component — pen/eraser, color swatches, layers, undo/reset, and the two closing `</div>` tags — stays exactly as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/Annotation/__tests__/AnnotationToolbar.test.jsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no existing tests broken (in particular `MainContent.jsx`-related tests, since that file wasn't touched).

- [ ] **Step 6: Commit**

```bash
git add src/components/Annotation/AnnotationToolbar.jsx src/components/Annotation/__tests__/AnnotationToolbar.test.jsx
git commit -m "feat: make annotation control pill draggable to any screen position"
```

- [ ] **Step 7: Manually verify in the browser**

Run `npm run dev`, open a song, enter Maximize mode, turn on Annotate mode, and confirm:
- The grip (two small bars) appears above the pen/eraser controls.
- Dragging the grip moves the pill freely in both x and y.
- Dragging near any screen edge stops 8px short of that edge.
- Reloading the page keeps the pill at its last dragged position.
- Clicking pen/eraser/color/layer/undo/reset buttons still works and does not start a drag.

---

## Plan Self-Review

**Spec coverage:**
- Grip-only drag trigger → Task 2, Step 3 (grip is a separate element from the tool buttons; buttons keep their own `onClick` handlers).
- Free 2D movement → Task 1 hook tracks both `x` and `y`.
- Viewport clamping (8px margin, can't go fully off-screen) → Task 1, `clamp()`.
- `localStorage` persistence under `songsheet_annotation_pill_pos`, restored on mount, default position when unset → Task 1 (`readStoredPosition`, persisted only on pointerup) + Task 2 (default `left: '1rem', top: '50%'` style branch).
- No content-collision detection, no reset control, no resize-responsive repositioning → intentionally absent from both tasks, called out in Global Constraints.
- `MainContent.jsx`'s existing pill left untouched → confirmed, no task modifies that file.

**Placeholder scan:** No TBD/TODO markers; every step has complete, runnable code.

**Type consistency:** `useDraggablePill(storageKey)` return shape (`{ pillRef, position, gripProps }`) is identical between Task 1's implementation and Task 2's consumption. `position` is `{x, y} | null` consistently. `gripProps` is always `{ onPointerDown }`, spread directly via `{...gripProps}` in Task 2.
