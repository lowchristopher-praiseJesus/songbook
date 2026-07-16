# Hide Browser Chrome in Maximize Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user enters maximize mode (`isFit` in `src/components/SongList/MainContent.jsx`), hide as much browser chrome as each platform allows — native OS-level fullscreen where the browser supports it, and a CSS-only best-effort (dynamic viewport height, safe-area padding, address-bar collapse nudge) where it doesn't (primarily iPhone Safari).

**Architecture:** A new `useNativeFullscreen` hook wraps the browser's Fullscreen API behind feature detection (never device sniffing), exposing `isSupported`, `requestFullscreen()`, and `exitFullscreen()`, and keeping `MainContent`'s `isFit` state in sync with fullscreen exits that happen outside the app's own UI (Escape key, browser controls). `MainContent` calls it from the existing maximize button and `exitMaximize()`. Where the API is unsupported, the maximize overlay switches to `100dvh` sizing and `env(safe-area-inset-*)` padding, and a small effect nudges Safari to collapse its address bar via the standard scroll-technique.

**Tech Stack:** React 18 hooks, native browser Fullscreen API (`Element.requestFullscreen`/`document.exitFullscreen`/`fullscreenchange`), Tailwind CSS `dvh` utilities (Tailwind 3.4+, already present via `tailwindcss": "^3.4.19"`), Vitest + `@testing-library/react`.

## Global Constraints

- Must work in a regular browser tab — no PWA/manifest/install-step changes (per spec, explicitly out of scope).
- Platform behavior must be decided by runtime feature detection (`document.fullscreenEnabled` / presence of `requestFullscreen`), never by user-agent/device sniffing (per spec).
- A failed or unsupported `requestFullscreen()` call must never block or error the maximize action — the existing CSS overlay always stands on its own (per spec).
- iPhone Safari has no Fullscreen API for page content in a regular tab; this is a WebKit limitation the plan works around with CSS, not something to "fix" (per spec).
- Spec doc: `docs/superpowers/specs/2026-07-16-hide-browser-chrome-in-maximize-mode-design.md`.

## Note on fullscreen target: `document.documentElement`, not the overlay `<div>`

The spec's Section 1 describes calling `requestFullscreen()` "on the maximize overlay element." This plan instead always targets `document.documentElement` (the whole page). Reason: the maximize overlay `<div>` is conditionally rendered (`{isFit && activeSong && (...)}`), so its DOM node does not exist yet at the moment the maximize button's `onClick` fires — `requestFullscreen()` must be called synchronously within a user-gesture handler, so there is no ref available to call it on at that point. Fullscreening `document.documentElement` sidesteps this timing problem entirely, requires no ref, and is visually identical to the user: the overlay already covers the full viewport (`fixed inset-0`) on top of it. No user-facing behavior changes as a result.

## Note on jsdom limits for `env()` and safe-area testing

Verified empirically: jsdom (via the `cssstyle` package it uses) silently drops any inline style value it can't parse as a valid CSS value for that property — `env(safe-area-inset-top, 0px)` set as `paddingTop` becomes `''` and never appears in the rendered `style` attribute at all, even when set through React's `style` prop. This is not a bug in our code; it's a jsdom parser limitation. Task 3 below therefore does not attempt to unit-test the safe-area padding values — only the `h-dvh` class (which jsdom *does* parse and preserve) is asserted automatically. Safe-area padding is verified manually on an iPhone in Task 4's manual verification step. `calc(100dvh + 1px)` (used in Task 4 for `minHeight`), by contrast, *is* preserved correctly by jsdom and is unit-tested normally.

---

### Task 1: `useNativeFullscreen` hook

**Files:**
- Create: `src/hooks/useNativeFullscreen.js`
- Test: `src/hooks/__tests__/useNativeFullscreen.test.js`

**Interfaces:**
- Produces: `useNativeFullscreen({ active: boolean, onExit: () => void }) => { isSupported: boolean, requestFullscreen: () => void, exitFullscreen: () => void }`, exported from `src/hooks/useNativeFullscreen.js`. `isSupported` is computed once per mount via feature detection. `requestFullscreen()` is a no-op when unsupported, and swallows a rejected promise otherwise. `exitFullscreen()` only calls `document.exitFullscreen()` when `document.fullscreenElement` is currently set. While `active` is `true`, a `fullscreenchange` listener calls `onExit()` whenever the browser exits fullscreen with no app-initiated action (e.g. Escape key, browser's own exit control).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useNativeFullscreen.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNativeFullscreen } from '../useNativeFullscreen'

describe('useNativeFullscreen', () => {
  let requestFullscreenMock
  let exitFullscreenMock

  beforeEach(() => {
    requestFullscreenMock = vi.fn(() => Promise.resolve())
    exitFullscreenMock = vi.fn(() => Promise.resolve())
    document.documentElement.requestFullscreen = requestFullscreenMock
    document.exitFullscreen = exitFullscreenMock
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true })
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
  })

  afterEach(() => {
    delete document.documentElement.requestFullscreen
    delete document.exitFullscreen
    vi.restoreAllMocks()
  })

  it('reports supported when requestFullscreen exists and fullscreenEnabled is true', () => {
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    expect(result.current.isSupported).toBe(true)
  })

  it('reports unsupported when requestFullscreen is missing from the document element', () => {
    delete document.documentElement.requestFullscreen
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    expect(result.current.isSupported).toBe(false)
  })

  it('calls document.documentElement.requestFullscreen when requestFullscreen() is invoked', () => {
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    act(() => { result.current.requestFullscreen() })
    expect(requestFullscreenMock).toHaveBeenCalledTimes(1)
  })

  it('does not call requestFullscreen when unsupported, and does not throw', () => {
    delete document.documentElement.requestFullscreen
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    expect(() => act(() => { result.current.requestFullscreen() })).not.toThrow()
    expect(requestFullscreenMock).not.toHaveBeenCalled()
  })

  it('calls document.exitFullscreen when a fullscreenElement is currently set', () => {
    Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true })
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    act(() => { result.current.exitFullscreen() })
    expect(exitFullscreenMock).toHaveBeenCalledTimes(1)
  })

  it('does not call document.exitFullscreen when nothing is fullscreen', () => {
    const { result } = renderHook(() => useNativeFullscreen({ active: false, onExit: vi.fn() }))
    act(() => { result.current.exitFullscreen() })
    expect(exitFullscreenMock).not.toHaveBeenCalled()
  })

  it('calls onExit when fullscreenchange fires with no fullscreenElement while active', () => {
    const onExit = vi.fn()
    renderHook(() => useNativeFullscreen({ active: true, onExit }))
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('does not call onExit from fullscreenchange when inactive', () => {
    const onExit = vi.fn()
    renderHook(() => useNativeFullscreen({ active: false, onExit }))
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    expect(onExit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/hooks/__tests__/useNativeFullscreen.test.js`
Expected: FAIL — `Cannot find module '../useNativeFullscreen'` (file doesn't exist yet).

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useNativeFullscreen.js`:

```js
import { useCallback, useEffect, useState } from 'react'

function supportsFullscreen() {
  return typeof document !== 'undefined'
    && typeof document.documentElement.requestFullscreen === 'function'
    && document.fullscreenEnabled !== false
}

export function useNativeFullscreen({ active, onExit }) {
  const [isSupported] = useState(supportsFullscreen)

  const requestFullscreen = useCallback(() => {
    if (!isSupported) return
    document.documentElement.requestFullscreen().catch(() => {})
  }, [isSupported])

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!active) return
    function handleFullscreenChange() {
      if (!document.fullscreenElement) onExit?.()
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [active, onExit])

  return { isSupported, requestFullscreen, exitFullscreen }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/hooks/__tests__/useNativeFullscreen.test.js`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNativeFullscreen.js src/hooks/__tests__/useNativeFullscreen.test.js
git commit -m "feat: add useNativeFullscreen hook for maximize mode"
```

---

### Task 2: Wire native fullscreen into the maximize button and exit path

**Files:**
- Modify: `src/components/SongList/MainContent.jsx`
- Test: `src/components/SongList/__tests__/MainContent.fitMode.test.jsx`

**Interfaces:**
- Consumes: `useNativeFullscreen({ active, onExit }) => { isSupported, requestFullscreen, exitFullscreen }` from Task 1.
- Produces (consumed by Task 4): the same `fullscreenSupported` local variable (renamed from the hook's `isSupported`) stays in scope in `MainContent` for Task 4's fallback effect.

- [ ] **Step 1: Write the failing tests**

In `src/components/SongList/__tests__/MainContent.fitMode.test.jsx`, add the `act` import — change:

```js
import { render, screen, fireEvent } from '@testing-library/react'
```

to:

```js
import { render, screen, fireEvent, act } from '@testing-library/react'
```

Add a mock for the new hook, placed after the existing `vi.mock('../../../hooks/useFitToScreen', ...)` block (after line 64, before the `// Stub SongView` comment):

```js
const mockRequestFullscreen = vi.fn()
const mockExitFullscreen = vi.fn()
let nativeFullscreenMock = { isSupported: true, requestFullscreen: mockRequestFullscreen, exitFullscreen: mockExitFullscreen }
let lastNativeFullscreenOnExit = null

vi.mock('../../../hooks/useNativeFullscreen', () => ({
  useNativeFullscreen: vi.fn(({ onExit }) => {
    lastNativeFullscreenOnExit = onExit
    return nativeFullscreenMock
  }),
}))
```

Reset it in the existing `beforeEach` — change:

```js
  beforeEach(() => {
    fitToScreenMock = {
      fitFontSize: 18,
      fitColumns: 2,
      shadowRef: { current: null },
      canIncrease: true,
      canDecrease: true,
      increaseFontSize: mockIncreaseFontSize,
      decreaseFontSize: mockDecreaseFontSize,
    }
    mockIncreaseFontSize.mockClear()
    mockDecreaseFontSize.mockClear()
  })
```

to:

```js
  beforeEach(() => {
    fitToScreenMock = {
      fitFontSize: 18,
      fitColumns: 2,
      shadowRef: { current: null },
      canIncrease: true,
      canDecrease: true,
      increaseFontSize: mockIncreaseFontSize,
      decreaseFontSize: mockDecreaseFontSize,
    }
    mockIncreaseFontSize.mockClear()
    mockDecreaseFontSize.mockClear()
    nativeFullscreenMock = { isSupported: true, requestFullscreen: mockRequestFullscreen, exitFullscreen: mockExitFullscreen }
    mockRequestFullscreen.mockClear()
    mockExitFullscreen.mockClear()
    lastNativeFullscreenOnExit = null
  })
```

Add these three tests at the end of the `describe('MainContent maximize button', ...)` block, just before its closing `})`:

```js
  it('requests native fullscreen when entering maximize mode', () => {
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
    expect(mockRequestFullscreen).toHaveBeenCalledTimes(1)
  })

  it('exits native fullscreen when the exit button is clicked', () => {
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
    fireEvent.click(screen.getByLabelText('Exit maximize'))
    expect(mockExitFullscreen).toHaveBeenCalledTimes(1)
  })

  it('exits maximize mode when native fullscreen is exited externally (e.g. Escape or browser control)', () => {
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
    expect(screen.getByLabelText('Exit maximize')).toBeInTheDocument()

    act(() => { lastNativeFullscreenOnExit() })

    expect(screen.queryByLabelText('Exit maximize')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Fit song to screen')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify the three new tests fail**

Run: `npm test -- src/components/SongList/__tests__/MainContent.fitMode.test.jsx`
Expected: FAIL — `Cannot find module '../../../hooks/useNativeFullscreen'` (hook isn't imported/used by `MainContent.jsx` yet, so the mock target doesn't resolve against real usage / the assertions on `mockRequestFullscreen`/`mockExitFullscreen` fail since nothing calls them).

- [ ] **Step 3: Wire the hook into `MainContent.jsx`**

Add the import — change:

```js
import { useFitToScreen } from '../../hooks/useFitToScreen'
```

to:

```js
import { useFitToScreen } from '../../hooks/useFitToScreen'
import { useNativeFullscreen } from '../../hooks/useNativeFullscreen'
```

Call the hook right after the existing `useFitToScreen` block — change:

```js
  } = useFitToScreen({ enabled: isFit && !annotationBaseline, containerRef, bodyRef, lyricsOnly, songId: activeSongId })

  // Keep the annotation layer's stroke/baseline data in sync with whichever
  // song is active, regardless of whether Maximize mode is currently open.
  useEffect(() => {
    if (activeSongId) loadAnnotationsForSong(activeSongId)
  }, [activeSongId, loadAnnotationsForSong])
```

to:

```js
  } = useFitToScreen({ enabled: isFit && !annotationBaseline, containerRef, bodyRef, lyricsOnly, songId: activeSongId })
  const { isSupported: fullscreenSupported, requestFullscreen, exitFullscreen } = useNativeFullscreen({
    active: isFit,
    onExit: exitMaximize,
  })

  // Keep the annotation layer's stroke/baseline data in sync with whichever
  // song is active, regardless of whether Maximize mode is currently open.
  useEffect(() => {
    if (activeSongId) loadAnnotationsForSong(activeSongId)
  }, [activeSongId, loadAnnotationsForSong])
```

(`exitMaximize` is a hoisted `function` declaration defined later in this same component — safe to reference here.)

Update `exitMaximize` and add the new click handler — change:

```js
  function exitMaximize() {
    setIsFit(false)
    setAnnotateMode(false)
  }
```

to:

```js
  function handleMaximizeClick() {
    const next = !isFit
    setIsFit(next)
    if (next) requestFullscreen()
  }

  function exitMaximize() {
    setIsFit(false)
    setAnnotateMode(false)
    exitFullscreen()
  }
```

Wire the button to the new handler — change:

```js
                <button
                  type="button"
                  onClick={() => setIsFit(f => !f)}
                  className={`w-11 h-11 flex items-center justify-center rounded-xl select-none transition-colors
```

to:

```js
                <button
                  type="button"
                  onClick={handleMaximizeClick}
                  className={`w-11 h-11 flex items-center justify-center rounded-xl select-none transition-colors
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/SongList/__tests__/MainContent.fitMode.test.jsx`
Expected: PASS (all tests, including the 3 new ones and all pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/components/SongList/MainContent.jsx src/components/SongList/__tests__/MainContent.fitMode.test.jsx
git commit -m "feat: request native fullscreen when entering maximize mode"
```

---

### Task 3: Dynamic viewport height and safe-area padding for the maximize overlay

**Files:**
- Modify: `index.html`
- Modify: `src/components/SongList/MainContent.jsx`
- Test: `src/components/SongList/__tests__/MainContent.fitMode.test.jsx`

**Interfaces:**
- No new exports. Adds `data-testid="maximize-overlay"` to the existing overlay `<div>` purely for test targeting.

- [ ] **Step 1: Write the failing test**

Add this test to the end of the `describe('MainContent maximize button', ...)` block in `src/components/SongList/__tests__/MainContent.fitMode.test.jsx`:

```js
  it('sizes the maximize overlay using the dynamic viewport height unit', () => {
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
    const overlay = screen.getByTestId('maximize-overlay')
    expect(overlay.className).toMatch(/\bh-dvh\b/)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/SongList/__tests__/MainContent.fitMode.test.jsx`
Expected: FAIL — `Unable to find an element by: [data-testid="maximize-overlay"]`.

- [ ] **Step 3: Update the overlay markup and viewport meta tag**

In `index.html`, change:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

to:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

In `src/components/SongList/MainContent.jsx`, change:

```jsx
      {/* Full-viewport maximize overlay */}
      {isFit && activeSong && (
        <div
          className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col overflow-hidden"
          onTouchStart={annotateMode ? undefined : onTouchStart}
          onTouchEnd={annotateMode ? undefined : onTouchEnd}
        >
```

to:

```jsx
      {/* Full-viewport maximize overlay */}
      {isFit && activeSong && (
        <div
          data-testid="maximize-overlay"
          className="fixed inset-0 h-dvh z-50 bg-white dark:bg-gray-900 flex flex-col overflow-hidden"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
          }}
          onTouchStart={annotateMode ? undefined : onTouchStart}
          onTouchEnd={annotateMode ? undefined : onTouchEnd}
        >
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/SongList/__tests__/MainContent.fitMode.test.jsx`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add index.html src/components/SongList/MainContent.jsx src/components/SongList/__tests__/MainContent.fitMode.test.jsx
git commit -m "feat: use dynamic viewport height and safe-area padding for maximize overlay"
```

---

### Task 4: Address-bar collapse nudge for browsers without the Fullscreen API

**Files:**
- Modify: `src/components/SongList/MainContent.jsx`
- Test: `src/components/SongList/__tests__/MainContent.fitMode.test.jsx`

**Interfaces:**
- Consumes: `fullscreenSupported`, `isFit` (both already in scope in `MainContent` from Task 2 and existing state).

- [ ] **Step 1: Write the failing tests**

Add these three tests to the end of the `describe('MainContent maximize button', ...)` block:

```js
  it('nudges Safari to collapse its address bar when native fullscreen is unsupported', () => {
    nativeFullscreenMock = { ...nativeFullscreenMock, isSupported: false }
    const scrollToMock = vi.fn()
    window.scrollTo = scrollToMock
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
    expect(scrollToMock).toHaveBeenCalledWith(0, 1)
    expect(document.documentElement.style.minHeight).toBe('calc(100dvh + 1px)')
  })

  it('does not run the address-bar nudge when native fullscreen is supported', () => {
    const scrollToMock = vi.fn()
    window.scrollTo = scrollToMock
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
    expect(scrollToMock).not.toHaveBeenCalled()
  })

  it('restores the original min-height when exiting maximize mode on an unsupported browser', () => {
    nativeFullscreenMock = { ...nativeFullscreenMock, isSupported: false }
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
    fireEvent.click(screen.getByLabelText('Exit maximize'))
    expect(document.documentElement.style.minHeight).toBe('')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/SongList/__tests__/MainContent.fitMode.test.jsx`
Expected: FAIL — `scrollToMock` is never called, and `document.documentElement.style.minHeight` never changes.

- [ ] **Step 3: Add the address-bar collapse effect**

In `src/components/SongList/MainContent.jsx`, change:

```js
  const { isSupported: fullscreenSupported, requestFullscreen, exitFullscreen } = useNativeFullscreen({
    active: isFit,
    onExit: exitMaximize,
  })

  // Keep the annotation layer's stroke/baseline data in sync with whichever
  // song is active, regardless of whether Maximize mode is currently open.
  useEffect(() => {
    if (activeSongId) loadAnnotationsForSong(activeSongId)
  }, [activeSongId, loadAnnotationsForSong])
```

to:

```js
  const { isSupported: fullscreenSupported, requestFullscreen, exitFullscreen } = useNativeFullscreen({
    active: isFit,
    onExit: exitMaximize,
  })

  // iPhone Safari has no Fullscreen API for page content in a regular tab, but it
  // collapses its address bar to a thin sliver once the page is scrolled — nudging
  // that here is the closest approximation to hiding chrome available on that browser.
  useEffect(() => {
    if (!isFit || fullscreenSupported) return
    const docEl = document.documentElement
    const previousMinHeight = docEl.style.minHeight
    docEl.style.minHeight = 'calc(100dvh + 1px)'
    window.scrollTo(0, 1)
    return () => {
      docEl.style.minHeight = previousMinHeight
    }
  }, [isFit, fullscreenSupported])

  // Keep the annotation layer's stroke/baseline data in sync with whichever
  // song is active, regardless of whether Maximize mode is currently open.
  useEffect(() => {
    if (activeSongId) loadAnnotationsForSong(activeSongId)
  }, [activeSongId, loadAnnotationsForSong])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/SongList/__tests__/MainContent.fitMode.test.jsx`
Expected: PASS (all tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in other suites.

- [ ] **Step 6: Manually verify in the browser**

Per the project's UI-change verification requirement: start the dev server (`npm run dev`) and check maximize mode on each available platform:
- **Desktop** (Chrome/Firefox/Safari, whichever are installed): click maximize — the browser's tab bar, address bar, and bookmarks bar should disappear (OS-level fullscreen). Pressing Escape (or the browser's own "exit fullscreen" affordance) should exit both native fullscreen and the app's maximize overlay together, leaving the app in a clean, non-maximized state. Clicking the app's own exit-maximize button should do the same.
- **Android Chrome** (if a device is available): click maximize — the address bar and system nav bar should hide.
- **iPad Safari** (if a device is available): click maximize — check whether native fullscreen engages (depends on the installed Safari version's support) or the CSS fallback applies; either way the song content should fill the screen without visual glitches.
- **iPhone Safari**: click maximize — the address bar cannot fully disappear (expected, per the spec's constraints), but confirm: the layout doesn't show a gap or cut off content as the address bar shows/hides while scrolling; the top control cluster and song content are not obscured by the notch or the home-indicator area; exiting maximize returns the page to its normal scroll position without a visible jump.

- [ ] **Step 7: Commit**

```bash
git add src/components/SongList/MainContent.jsx src/components/SongList/__tests__/MainContent.fitMode.test.jsx
git commit -m "feat: collapse Safari's address bar when native fullscreen is unsupported"
```
