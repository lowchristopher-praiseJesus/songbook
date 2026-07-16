# Configurable Maximize-Mode Minimum Font Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `MIN_FONT = 20` floor in maximize mode's auto-fit/pagination logic with a user-configurable setting (default 18, range 8–28), exposed via a new stepper row in the Settings panel's Display tab.

**Architecture:** `useDisplaySettings.js` gains a new top-level `maximizeMinFontSize` field (parallel to its existing per-element font/color settings, but a plain clamped number) with its own setter, persisted to a new localStorage key. `useFitToScreen.js` drops its hardcoded `MIN_FONT` constant in favor of a `minFontSize` parameter, threaded from `App.jsx` → `MainContent.jsx` → the hook. `DisplayTab.jsx` gains a new stepper row (matching its existing per-element size stepper styling) to edit the value.

**Tech Stack:** React 18, Vitest + @testing-library/react, localStorage.

## Global Constraints

- Valid range for the setting: `[8, 28]` (28 = `MAX_FONT`, which stays a hardcoded ceiling).
- Default value: `18`.
- Step size: `1px` per click.
- Global setting only (no per-song override).
- Lives in the Display tab of Settings (not General tab).
- Stepper UI only — no slider.
- `MAX_FONT`, pagination column math (`MAX_COLS`, `measurePagination`), and the paginated flow's rendering are all out of scope — untouched by this plan.

---

## File Structure

- **Modify** `src/hooks/useDisplaySettings.js` — new `maximizeMinFontSize` default/key/clamping, new `updateMinFontSize` setter.
- **Modify** `src/hooks/__tests__/useDisplaySettings.test.js` — **create** this file (none exists yet); tests for the new field/setter.
- **Modify** `src/hooks/useFitToScreen.js` — replace hardcoded `MIN_FONT` with a `minFontSize` parameter, clamped defensively.
- **Modify** `src/hooks/__tests__/useFitToScreen.test.js` — every `useFitToScreen({...})` call gains an explicit `minFontSize`; new tests for a non-default floor and for the dependency-array re-trigger.
- **Modify** `src/components/Settings/DisplayTab.jsx` — new standalone stepper row for the setting.
- **Create** `src/components/Settings/__tests__/DisplayTab.test.jsx` — no existing test file for this component; tests for the new row.
- **Modify** `src/components/Settings/SettingsPanel.jsx` — pass `updateMinFontSize` prop through to `DisplayTab`.
- **Modify** `src/components/SongList/MainContent.jsx` — accept `maximizeMinFontSize` prop, pass as `minFontSize` into `useFitToScreen`.
- **Modify** `src/components/SongList/__tests__/MainContent.fitMode.test.jsx` — thread the new prop through existing render calls.
- **Modify** `src/components/SongList/__tests__/MainContent.pagination.test.jsx` — update the `useFitToScreen` mock's call signature assumptions if any assert on exact arguments (audited in Task 6).
- **Modify** `src/components/SongList/__tests__/MainContent.pagination.integration.test.jsx` — this file does NOT mock `useFitToScreen`, so it must supply a real `maximizeMinFontSize` prop value to `MainContent`.
- **Modify** `src/App.jsx` — pass `maximizeMinFontSize={displaySettings.settings.maximizeMinFontSize}` to `<MainContent />`.

---

### Task 1: Add `maximizeMinFontSize` to `useDisplaySettings`

**Files:**
- Modify: `src/hooks/useDisplaySettings.js`
- Test: `src/hooks/__tests__/useDisplaySettings.test.js` (new file)

**Interfaces:**
- Produces: `settings.maximizeMinFontSize: number` (in the object returned by `useDisplaySettings()`), `updateMinFontSize(value: number): void` (setter, also returned by the hook). Both consumed by Task 5 (`DisplayTab.jsx`) and Task 8 (`App.jsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useDisplaySettings.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDisplaySettings } from '../useDisplaySettings'

beforeEach(() => localStorage.clear())

describe('useDisplaySettings — maximizeMinFontSize', () => {
  it('defaults to 18 when nothing is stored', () => {
    const { result } = renderHook(() => useDisplaySettings())
    expect(result.current.settings.maximizeMinFontSize).toBe(18)
  })

  it('updateMinFontSize persists the new value and updates state', () => {
    const { result } = renderHook(() => useDisplaySettings())
    act(() => result.current.updateMinFontSize(22))
    expect(result.current.settings.maximizeMinFontSize).toBe(22)
    expect(JSON.parse(localStorage.getItem('songsheet_display_maximize_min_font_size'))).toBe(22)
  })

  it('updateMinFontSize clamps values above 28 down to 28', () => {
    const { result } = renderHook(() => useDisplaySettings())
    act(() => result.current.updateMinFontSize(999))
    expect(result.current.settings.maximizeMinFontSize).toBe(28)
    expect(JSON.parse(localStorage.getItem('songsheet_display_maximize_min_font_size'))).toBe(28)
  })

  it('updateMinFontSize clamps values below 8 up to 8', () => {
    const { result } = renderHook(() => useDisplaySettings())
    act(() => result.current.updateMinFontSize(-5))
    expect(result.current.settings.maximizeMinFontSize).toBe(8)
    expect(JSON.parse(localStorage.getItem('songsheet_display_maximize_min_font_size'))).toBe(8)
  })

  it('loads a valid stored value on mount', () => {
    localStorage.setItem('songsheet_display_maximize_min_font_size', JSON.stringify(24))
    const { result } = renderHook(() => useDisplaySettings())
    expect(result.current.settings.maximizeMinFontSize).toBe(24)
  })

  it('clamps an out-of-range stored value on load', () => {
    localStorage.setItem('songsheet_display_maximize_min_font_size', JSON.stringify(999))
    const { result } = renderHook(() => useDisplaySettings())
    expect(result.current.settings.maximizeMinFontSize).toBe(28)
  })

  it('resetAll restores maximizeMinFontSize to 18', () => {
    const { result } = renderHook(() => useDisplaySettings())
    act(() => result.current.updateMinFontSize(24))
    act(() => result.current.resetAll())
    expect(result.current.settings.maximizeMinFontSize).toBe(18)
    expect(JSON.parse(localStorage.getItem('songsheet_display_maximize_min_font_size'))).toBe(18)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useDisplaySettings.test.js`
Expected: FAIL — `result.current.settings.maximizeMinFontSize` is `undefined`, `updateMinFontSize` is not a function.

- [ ] **Step 3: Add the clamp helper, default, key, and read-side clamping**

In `src/hooks/useDisplaySettings.js`, add a clamp helper near the top of the file (after `FONT_OPTIONS`, before `DEFAULTS`):

```js
const MIN_FONT_SIZE_FLOOR = 8
const MIN_FONT_SIZE_CEILING = 28

function clampMinFontSize(value) {
  return Math.min(MIN_FONT_SIZE_CEILING, Math.max(MIN_FONT_SIZE_FLOOR, value))
}
```

Change the `DEFAULTS` object to add the new top-level field:

```js
const DEFAULTS = {
  title:       { font: 'System Default', size: 24, color: '#111827' },
  artist:      { font: 'System Default', size: 16, color: '#6b7280' },
  lyrics:      { font: 'System Default', color: '#374151' },
  chords:      { font: 'Menlo', sizeOffset: -3, color: '#6366f1' },
  sections:    { font: 'System Default', size: 12, color: '#6366f1' },
  annotations: { font: 'System Default', size: 12, color: '#9ca3af' },
  maximizeMinFontSize: 18,
}
```

Change the `KEYS` object the same way:

```js
const KEYS = {
  title:       'songsheet_display_title',
  artist:      'songsheet_display_artist',
  lyrics:      'songsheet_display_lyrics',
  chords:      'songsheet_display_chords',
  sections:    'songsheet_display_sections',
  annotations: 'songsheet_display_annotations',
  maximizeMinFontSize: 'songsheet_display_maximize_min_font_size',
}
```

Update `loadSettings()` — the existing per-element branch does `{ ...DEFAULTS[key], ...JSON.parse(raw) }`, which only works for object-shaped settings. `maximizeMinFontSize` is a plain number, so it needs its own branch and read-side clamping:

```js
function loadSettings() {
  const result = {}
  for (const [key, storageKey] of Object.entries(KEYS)) {
    try {
      const raw = localStorage.getItem(storageKey)
      if (key === 'maximizeMinFontSize') {
        result[key] = raw ? clampMinFontSize(JSON.parse(raw)) : DEFAULTS[key]
      } else {
        result[key] = raw ? { ...DEFAULTS[key], ...JSON.parse(raw) } : { ...DEFAULTS[key] }
      }
    } catch {
      result[key] = key === 'maximizeMinFontSize' ? DEFAULTS[key] : { ...DEFAULTS[key] }
    }
  }
  return result
}
```

- [ ] **Step 4: Add the `updateMinFontSize` setter**

In `src/hooks/useDisplaySettings.js`, inside `useDisplaySettings()`, add a new `useCallback` alongside `updateElement`:

```js
  const updateMinFontSize = useCallback((value) => {
    setSettings(prev => {
      const clamped = clampMinFontSize(value)
      const updated = { ...prev, maximizeMinFontSize: clamped }
      localStorage.setItem(KEYS.maximizeMinFontSize, JSON.stringify(clamped))
      return updated
    })
  }, [])
```

Note: this setter does NOT call `applyToDOM(updated)` — `maximizeMinFontSize` isn't a CSS custom property, it's a numeric input to `useFitToScreen`'s layout algorithm (per the design's non-goals). `applyToDOM` itself is left completely unchanged.

Update the hook's return statement to include the new setter:

```js
  return { settings, updateElement, updateMinFontSize, resetAll }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useDisplaySettings.test.js`
Expected: PASS (7 tests).

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run --dir src`
Expected: PASS (all files — this task only adds new fields/branches, doesn't change existing per-element behavior).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useDisplaySettings.js src/hooks/__tests__/useDisplaySettings.test.js
git commit -m "feat: add maximizeMinFontSize setting to useDisplaySettings"
```

---

### Task 2: Replace `useFitToScreen`'s hardcoded `MIN_FONT` with a `minFontSize` parameter

**Files:**
- Modify: `src/hooks/useFitToScreen.js`
- Test: `src/hooks/__tests__/useFitToScreen.test.js`

**Interfaces:**
- Consumes: nothing new from Task 1 (this task is independent of the settings hook — it just changes `useFitToScreen`'s own parameter list).
- Produces: `useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly, songId, minFontSize })` — `minFontSize` is now a required-in-practice parameter (no internal default; every caller must supply it). Consumed by Task 6 (`MainContent.jsx`).

- [ ] **Step 1: Update every existing test call site to pass `minFontSize` explicitly**

In `src/hooks/__tests__/useFitToScreen.test.js`, every one of the 12 `useFitToScreen({...})` call sites currently omits `minFontSize` and relies on the hook's internal `MIN_FONT = 20` default. Since this task removes that internal constant, every call site must now pass `minFontSize: 20` explicitly (20 is chosen to keep all existing assertions — which hardcode expectations like `toBe(20)` — passing unchanged). Update each of the following call sites by adding `minFontSize: 20` to the options object passed to `useFitToScreen`:

Line ~96 (`'returns null values when disabled'`):
```js
      useFitToScreen({
        enabled: false,
        containerRef: makeContainerRef(),
        bodyRef: makeBodyRef(),
        lyricsOnly: false,
        minFontSize: 20,
      })
```

Line ~109 (`'exposes a shadowRef'`):
```js
      useFitToScreen({
        enabled: false,
        containerRef: makeContainerRef(),
        bodyRef: makeBodyRef(),
        lyricsOnly: false,
        minFontSize: 20,
      })
```

Line ~125 (`'returns fitFontSize and fitColumns when enabled and shadow fits at 1 column'`):
```js
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize: 20 }),
```

Line ~144 (`'resets to null when disabled after being enabled'`):
```js
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize: 20 }),
```

Line ~162 (`'enters paginated mode with totalPages when nothing fits within 3 columns at 20px'`):
```js
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize: 20 }),
```

Line ~182 (`'reports paginated:false and totalPages:1 for a normal single-page fit'`):
```js
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize: 20 }),
```

Line ~199 (`'increaseFontSize keeps working (still allowed) while paginated'`):
```js
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize: 20 }),
```

Line ~222 (`'sets up a ResizeObserver on the container when enabled'`):
```js
      useFitToScreen({ enabled: true, containerRef, bodyRef, lyricsOnly: false, minFontSize: 20 })
```

Line ~235 (`'disconnects ResizeObserver on cleanup'`):
```js
      useFitToScreen({ enabled: true, containerRef, bodyRef, lyricsOnly: false, minFontSize: 20 })
```

Line ~288 (`'self-corrects a transitional first-pass measurement via double rAF'`):
```js
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize: 20 }),
```

Line ~317 (`'measuredSongId echoes the songId...'`):
```js
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, songId, minFontSize: 20 }),
```

Line ~349 (inside `describe('manual font-size override')`'s `setup()` helper):
```js
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize: 20 }),
```

Line ~463 (inside `'resize while in manual mode...'`):
```js
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize: 20 }),
```

- [ ] **Step 2: Run the tests to verify they still pass with `minFontSize: 20` added (before touching the implementation)**

Run: `npx vitest run src/hooks/__tests__/useFitToScreen.test.js`
Expected: PASS (all 20 tests) — the implementation still has its internal `MIN_FONT` default at this point, so adding the new prop is a no-op until Step 4 removes that default. This step exists to prove the added prop doesn't itself change behavior, isolating that change from the next one.

- [ ] **Step 3: Write two new failing tests for the configurable-floor behavior**

Add to `src/hooks/__tests__/useFitToScreen.test.js`, inside the top-level `describe('useFitToScreen', ...)` block (after the `'measuredSongId echoes...'` test, before the `describe('manual font-size override', ...)` block):

```js
  it('uses a non-default minFontSize as the pagination-fallback floor', () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize: 14 }),
      { initialProps: { enabled: false } }
    )

    result.current.shadowRef.current = makePaginatingShadowEl({ totalColumns: 7 })
    act(() => rerender({ enabled: true }))

    // With nothing fitting at any column count, the pagination fallback pins
    // fitFontSize at minFontSize (14), not the old hardcoded 20.
    expect(result.current.fitFontSize).toBe(14)
    expect(result.current.paginated).toBe(true)
  })

  it('re-runs auto-fit when minFontSize changes while already enabled', async () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled, minFontSize }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize }),
      { initialProps: { enabled: false, minFontSize: 20 } }
    )

    result.current.shadowRef.current = makePaginatingShadowEl({ totalColumns: 7 })
    act(() => rerender({ enabled: true, minFontSize: 20 }))
    await flushRaf()
    expect(result.current.fitFontSize).toBe(20)

    // Changing minFontSize while already enabled must re-trigger the
    // measurement effect (it's in the effect's dependency array), landing
    // the pagination-fallback font on the new floor.
    act(() => rerender({ enabled: true, minFontSize: 15 }))
    await flushRaf()
    expect(result.current.fitFontSize).toBe(15)
  })
```

- [ ] **Step 4: Run the tests to verify the new ones fail**

Run: `npx vitest run src/hooks/__tests__/useFitToScreen.test.js`
Expected: the two new tests FAIL (the hook still uses hardcoded `MIN_FONT = 20`, ignoring the `minFontSize` prop entirely — `fitFontSize` will be `20` in both new tests regardless of the prop passed).

- [ ] **Step 5: Remove the hardcoded `MIN_FONT` constant and thread `minFontSize` through**

In `src/hooks/useFitToScreen.js`, remove the module-level constant:

```js
const MIN_FONT = 20
```

Change the function signature to accept `minFontSize`:

```js
export function useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly, songId, minFontSize }) {
```

In `computeFlags`, replace the `MIN_FONT` reference:

```js
  function computeFlags(fontSize) {
    const canDecrease = fontSize > minFontSize
    const canIncrease = fontSize < MAX_FONT
    return { canIncrease, canDecrease }
  }
```

In `measureAuto` (assigned to `measureRef.current`), replace both `MIN_FONT` references — the binary-search lower bound and the pagination-fallback font:

```js
      let lo = minFontSize
      let hi = MAX_FONT
```

and

```js
    let result
    if (best) {
      result = { ...best, paginated: false, totalColumns: null, totalPages: 1, pageColWidth: null, fitAvailableHeight: null }
    } else {
      const pagination = measurePagination(minFontSize, availableWidth, availableHeight)
      result = {
        fitFontSize: minFontSize,
        fitColumns: MAX_COLS,
        paginated: true,
        totalColumns: pagination.totalColumns,
        totalPages: pagination.totalPages,
        pageColWidth: pagination.colWidth,
        fitAvailableHeight: availableHeight,
      }
    }
```

In `decreaseFontSize`, replace the `MIN_FONT` clamp:

```js
      const nextFont = Math.max(prev.fitFontSize - STEP, minFontSize)
```

Add `minFontSize` to the re-measure `useLayoutEffect`'s dependency array (it currently reads `[enabled, lyricsOnly, songId]`):

```js
  }, [enabled, lyricsOnly, songId, minFontSize])
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useFitToScreen.test.js`
Expected: PASS (all 22 tests, including the two new ones from Step 3).

- [ ] **Step 7: Run the full test suite to check for regressions**

Run: `npx vitest run --dir src`
Expected: PASS on every file EXCEPT `MainContent.fitMode.test.jsx`, `MainContent.pagination.test.jsx`, and `MainContent.pagination.integration.test.jsx` — these are expected to fail or warn at this point because `MainContent.jsx` doesn't yet pass `minFontSize` into `useFitToScreen` (Task 6 fixes this) and `MainContent.pagination.integration.test.jsx` doesn't mock the hook at all, so it will call the real hook with `minFontSize: undefined`, which breaks the binary search (`lo = undefined`). This is expected at this point in the plan — do not attempt to fix `MainContent.jsx` from within this task; that's Task 6's job. Confirm via the test output that these are the ONLY newly-failing files (compare against a baseline run before Step 5 if the failure list is ambiguous).

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useFitToScreen.js src/hooks/__tests__/useFitToScreen.test.js
git commit -m "feat: replace useFitToScreen's hardcoded MIN_FONT with a minFontSize parameter"
```

---

### Task 3: Defensive clamp on `minFontSize` inside `useFitToScreen`

**Files:**
- Modify: `src/hooks/useFitToScreen.js`
- Test: `src/hooks/__tests__/useFitToScreen.test.js`

**Interfaces:**
- Consumes: the `minFontSize` parameter added in Task 2.
- Produces: nothing new consumed by later tasks — this task only hardens Task 2's parameter against invalid input, per the design's "belt-and-suspenders" clamping requirement (settings-side clamp in Task 1, hook-side clamp here).

- [ ] **Step 1: Write the failing test**

Add to `src/hooks/__tests__/useFitToScreen.test.js`, right after the two tests added in Task 2 Step 3:

```js
  it('clamps an out-of-range minFontSize into [8, MAX_FONT] before using it', () => {
    const containerRef = makeContainerRef()
    const bodyRef = makeBodyRef()

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly: false, minFontSize: 999 }),
      { initialProps: { enabled: false } }
    )

    result.current.shadowRef.current = makePaginatingShadowEl({ totalColumns: 7 })
    act(() => rerender({ enabled: true }))

    // 999 must be clamped down to MAX_FONT (28), not passed through raw —
    // an unclamped 999 would make the binary search's `lo` (999) exceed
    // `hi` (MAX_FONT, 28), which would never find a fit and could produce
    // NaN/undefined results instead of a sane pagination-fallback value.
    expect(result.current.fitFontSize).toBe(28)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useFitToScreen.test.js -t "clamps an out-of-range minFontSize"`
Expected: FAIL — with `minFontSize: 999` unclamped, the binary search's `lo = 999` immediately exceeds `hi = MAX_FONT (28)`, so the `while (lo <= hi)` loop never executes and `colBest` stays `null` for every column count, falling through to the pagination branch with `fitFontSize: 999` (not `28`).

- [ ] **Step 3: Clamp `minFontSize` at the top of the hook body**

In `src/hooks/useFitToScreen.js`, immediately after the function signature (before `const [state, setState] = useState(...)`), add:

```js
export function useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly, songId, minFontSize }) {
  const clampedMinFontSize = Math.min(MAX_FONT, Math.max(8, minFontSize))
```

Then replace every remaining use of the raw `minFontSize` parameter (introduced in Task 2 Step 5) with `clampedMinFontSize`: in `computeFlags`'s `canDecrease` check, the binary-search `lo` bound, the pagination-fallback font (both places it appears in `measureAuto`), and `decreaseFontSize`'s clamp. `computeFlags` takes `fontSize` as a parameter (not `minFontSize` directly) so it needs no signature change — only its body's `fontSize > minFontSize` becomes `fontSize > clampedMinFontSize`. Also update the `useLayoutEffect`'s dependency array from `minFontSize` to `clampedMinFontSize` (so a prop that's numerically different but clamps to the same value doesn't spuriously re-trigger measurement):

```js
  }, [enabled, lyricsOnly, songId, clampedMinFontSize])
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useFitToScreen.test.js`
Expected: PASS (all 23 tests).

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run --dir src`
Expected: same three pre-existing MainContent-related failures as Task 2 Step 7 (still unaddressed — Task 6 fixes them), no new failures elsewhere.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useFitToScreen.js src/hooks/__tests__/useFitToScreen.test.js
git commit -m "fix: defensively clamp minFontSize inside useFitToScreen"
```

---

### Task 4: Add the minimum-font-size stepper row to `DisplayTab`

**Files:**
- Modify: `src/components/Settings/DisplayTab.jsx`
- Test: `src/components/Settings/__tests__/DisplayTab.test.jsx` (new file)

**Interfaces:**
- Consumes: `settings.maximizeMinFontSize` and `updateMinFontSize` from Task 1 (passed as new props to `DisplayTab`, matching how `settings`/`updateElement`/`resetAll` are already passed in).
- Produces: `DisplayTab`'s prop list gains `updateMinFontSize` (a new required prop). `settings` (already a required prop) now must include `maximizeMinFontSize`. Consumed by Task 5 (`SettingsPanel.jsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/Settings/__tests__/DisplayTab.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DisplayTab } from '../DisplayTab'

function makeSettings() {
  return {
    title:       { font: 'System Default', size: 24, color: '#111827' },
    artist:      { font: 'System Default', size: 16, color: '#6b7280' },
    lyrics:      { font: 'System Default', color: '#374151' },
    chords:      { font: 'Menlo', sizeOffset: -3, color: '#6366f1' },
    sections:    { font: 'System Default', size: 12, color: '#6366f1' },
    annotations: { font: 'System Default', size: 12, color: '#9ca3af' },
    maximizeMinFontSize: 18,
  }
}

describe('DisplayTab — minimum font size row', () => {
  let updateElement, updateMinFontSize, resetAll

  beforeEach(() => {
    updateElement = vi.fn()
    updateMinFontSize = vi.fn()
    resetAll = vi.fn()
  })

  function renderTab(settings = makeSettings()) {
    return render(
      <DisplayTab
        settings={settings}
        updateElement={updateElement}
        updateMinFontSize={updateMinFontSize}
        resetAll={resetAll}
        fontSize={16}
        onFontSizeChange={vi.fn()}
      />
    )
  }

  it('shows the current minimum font size value', () => {
    renderTab()
    expect(screen.getByText('18px')).toBeInTheDocument()
  })

  it('shows the row label', () => {
    renderTab()
    expect(screen.getByText(/Minimum font size/i)).toBeInTheDocument()
  })

  it('clicking + calls updateMinFontSize with value + 1', () => {
    renderTab()
    fireEvent.click(screen.getByLabelText('Increase minimum font size'))
    expect(updateMinFontSize).toHaveBeenCalledWith(19)
  })

  it('clicking - calls updateMinFontSize with value - 1', () => {
    renderTab()
    fireEvent.click(screen.getByLabelText('Decrease minimum font size'))
    expect(updateMinFontSize).toHaveBeenCalledWith(17)
  })

  it('clicking + at the ceiling (28) clamps to 28', () => {
    renderTab({ ...makeSettings(), maximizeMinFontSize: 28 })
    fireEvent.click(screen.getByLabelText('Increase minimum font size'))
    expect(updateMinFontSize).toHaveBeenCalledWith(28)
  })

  it('clicking - at the floor (8) clamps to 8', () => {
    renderTab({ ...makeSettings(), maximizeMinFontSize: 8 })
    fireEvent.click(screen.getByLabelText('Decrease minimum font size'))
    expect(updateMinFontSize).toHaveBeenCalledWith(8)
  })

  it('the row has no font picker or color picker', () => {
    renderTab()
    // The per-element rows have collapsible sections containing a <select>
    // (font picker) once opened; this row must never render one, since it's
    // always "open" (no expand/collapse) and has no font/color concept.
    expect(screen.queryByLabelText('Custom color')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/Settings/__tests__/DisplayTab.test.jsx`
Expected: FAIL — `screen.getByText('18px')` and `screen.getByText(/Minimum font size/i)` find no matches; `getByLabelText('Increase minimum font size')` / `'Decrease minimum font size'` find no matches.

- [ ] **Step 3: Add the new row component and wire it into `DisplayTab`**

In `src/components/Settings/DisplayTab.jsx`, add a new component after `ElementRow` (before the `export function DisplayTab` line):

```jsx
function MinFontSizeRow({ value, updateMinFontSize }) {
  function handleDown() {
    updateMinFontSize(Math.max(8, value - 1))
  }

  function handleUp() {
    updateMinFontSize(Math.min(28, value + 1))
  }

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-2">
      <div className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Minimum font size (maximize mode)</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDown}
            aria-label="Decrease minimum font size"
            className="w-6 h-6 flex items-center justify-center border border-gray-200 dark:border-gray-600 rounded
              bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 text-sm"
          >−</button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 w-10 text-center">{value}px</span>
          <button
            type="button"
            onClick={handleUp}
            aria-label="Increase minimum font size"
            className="w-6 h-6 flex items-center justify-center border border-gray-200 dark:border-gray-600 rounded
              bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 text-sm"
          >+</button>
        </div>
      </div>
    </div>
  )
}
```

Update the `DisplayTab` function signature to accept the new prop, and render the new row after the `ELEMENTS.map(...)` block:

```jsx
export function DisplayTab({ settings, updateElement, updateMinFontSize, resetAll, fontSize, onFontSizeChange }) {
  const [openKey, setOpenKey] = useState(null)

  return (
    <div>
      {ELEMENTS.map(({ key, label, isOffset, hasAbsoluteSize }) => (
        <ElementRow
          key={key}
          elementKey={key}
          label={label}
          isOffset={isOffset}
          hasAbsoluteSize={hasAbsoluteSize}
          elSettings={settings[key]}
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          updateElement={updateElement}
          open={openKey === key}
          onToggle={() => setOpenKey(prev => prev === key ? null : key)}
        />
      ))}
      <MinFontSizeRow value={settings.maximizeMinFontSize} updateMinFontSize={updateMinFontSize} />
      <div className="flex justify-end mt-1">
        <button
          type="button"
          onClick={resetAll}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/Settings/__tests__/DisplayTab.test.jsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run --dir src`
Expected: same three pre-existing MainContent-related failures as Task 3 Step 5 (still unaddressed — Task 6 fixes them), no new failures. `SettingsPanel.test.jsx` should still pass since it doesn't currently pass `updateMinFontSize` to `DisplayTab` — check its output specifically; if `SettingsPanel.test.jsx` renders the `display` tab and fails because `DisplayTab` now expects `updateMinFontSize`, note this and proceed — Task 5 fixes the prop threading at the `SettingsPanel` level.

- [ ] **Step 6: Commit**

```bash
git add src/components/Settings/DisplayTab.jsx src/components/Settings/__tests__/DisplayTab.test.jsx
git commit -m "feat: add minimum font size stepper row to DisplayTab"
```

---

### Task 5: Thread `updateMinFontSize` through `SettingsPanel`

**Files:**
- Modify: `src/components/Settings/SettingsPanel.jsx`
- Test: `src/components/Settings/__tests__/SettingsPanel.test.jsx`

**Interfaces:**
- Consumes: `DisplayTab`'s new `updateMinFontSize` prop (Task 4).
- Produces: nothing new consumed by later tasks — `SettingsPanel` already receives the whole `displaySettings` object as a prop from `App.jsx` (unchanged by this task), so no new prop is needed on `SettingsPanel` itself, only a new prop passed down to its child `DisplayTab`.

- [ ] **Step 1: Check whether the existing `SettingsPanel.test.jsx` exercises the Display tab**

Read `src/components/Settings/__tests__/SettingsPanel.test.jsx` in full and search for any test that clicks the "Display" tab button or asserts on `DisplayTab`'s rendered content. If none exists, no new test is needed for this task (the wiring is exercised end-to-end by Task 4's `DisplayTab.test.jsx`, which tests the component in isolation, and by Task 7's `App.jsx`-level manual verification). If a Display-tab test DOES exist and it fails after Step 2 below because `updateMinFontSize` is undefined inside `DisplayTab` when clicked, that failure is expected until Step 2 is applied — re-run after Step 2 to confirm it's resolved.

- [ ] **Step 2: Pass `updateMinFontSize` from `SettingsPanel` to `DisplayTab`**

In `src/components/Settings/SettingsPanel.jsx`, find the `<DisplayTab ... />` call (inside the `{tab === 'display' && displaySettings && (...)}` block) and add the new prop:

```jsx
        {tab === 'display' && displaySettings && (
          <DisplayTab
            settings={displaySettings.settings}
            updateElement={displaySettings.updateElement}
            updateMinFontSize={displaySettings.updateMinFontSize}
            resetAll={displaySettings.resetAll}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
          />
        )}
```

- [ ] **Step 3: Run the full test suite to check for regressions**

Run: `npx vitest run --dir src`
Expected: same three pre-existing MainContent-related failures as Task 4 Step 5 (Task 6 fixes them next), `SettingsPanel.test.jsx` and `DisplayTab.test.jsx` both PASS, no new failures.

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings/SettingsPanel.jsx
git commit -m "feat: thread updateMinFontSize from SettingsPanel to DisplayTab"
```

---

### Task 6: Thread `maximizeMinFontSize` through `MainContent` into `useFitToScreen`

**Files:**
- Modify: `src/components/SongList/MainContent.jsx`
- Modify: `src/components/SongList/__tests__/MainContent.pagination.integration.test.jsx`
- Check only, no expected changes: `src/components/SongList/__tests__/MainContent.fitMode.test.jsx`, `src/components/SongList/__tests__/MainContent.pagination.test.jsx`, `src/components/SongList/__tests__/MainContent.swipeAnnotate.test.jsx` — all three mock `useFitToScreen` entirely (`vi.mock('../../../hooks/useFitToScreen', ...)`), so they're unaffected by this task's change; Step 2 below confirms this rather than assuming it.

**Interfaces:**
- Consumes: `useFitToScreen`'s new `minFontSize` parameter (Task 2/3).
- Produces: `MainContent`'s prop list gains `maximizeMinFontSize` (a plain number). Consumed by Task 7 (`App.jsx`).

- [ ] **Step 1: Add `maximizeMinFontSize` to `MainContent`'s prop list and pass it into `useFitToScreen`**

In `src/components/SongList/MainContent.jsx`, update the function signature:

```jsx
export function MainContent({ onAddToast, lyricsOnly = false, hideChordDiagram = false, fontSize = 16, onFontSizeChange, onImportSuccess, onOpenSidebar, metronomeEnabled, onMetronomeToggle, metronomeBpm = 120, onMetronomeBpmChange, maximizeMinFontSize = 18 }) {
```

(Default `18` here matches `useDisplaySettings`'s default from Task 1, so any test or call site that doesn't pass this prop still gets sane behavior rather than `undefined` reaching the hook.)

Update the `useFitToScreen({...})` call:

```jsx
  } = useFitToScreen({ enabled: isFit && !annotationBaseline, containerRef, bodyRef, lyricsOnly, songId: activeSongId, minFontSize: maximizeMinFontSize })
```

- [ ] **Step 2: Run the full test suite to check what's fixed and what's not**

Run: `npx vitest run --dir src`
Expected: `MainContent.pagination.integration.test.jsx` now PASSES (it doesn't mock `useFitToScreen`, so it was broken by `minFontSize: undefined` reaching the real hook after Task 2 — the new `maximizeMinFontSize = 18` default on `MainContent` fixes this without the test file needing any change, since it doesn't pass this prop and 18 is a sane default). `MainContent.fitMode.test.jsx` and `MainContent.pagination.test.jsx` mock `useFitToScreen` entirely (confirmed via grep in the plan's research), so they should be unaffected by this change and should already pass — if either fails, read the failure output before proceeding to Step 3, since an unexpected failure here means an assumption in this plan was wrong and needs to be resolved, not silently worked around.

- [ ] **Step 3: Add a regression test proving the prop reaches the hook**

This test file mocks `SongView` entirely (see the existing `vi.mock('../SongView', ...)` block) — `SongList.jsx`, which is what actually sets the `--fit-fs` CSS custom property from `fitFontSize`, never renders in this test tree. So the most direct way to confirm a custom `maximizeMinFontSize` prop reaches the real `useFitToScreen` hook and comes back out as `fitFontSize` is to capture the props the mocked `SongView` receives, since `MainContent` passes `fitFontSize` directly to it (confirmed at `MainContent.jsx`'s `<SongView ... fitFontSize={fitFontSize} ... />` call).

First, update the existing `vi.mock('../SongView', ...)` block (near the top of the file) to also capture the most recent props it was called with, in a module-level variable the test can read:

```jsx
let lastSongViewProps = null
vi.mock('../SongView', () => ({
  SongView: vi.fn((props) => {
    lastSongViewProps = props
    const { song, containerRef, bodyRef, shadowRef } = props
    useLayoutEffect(() => {
      if (containerRef) containerRef.current = sharedContainerObj
      if (bodyRef) bodyRef.current = sharedBodyObj
      if (shadowRef && song?.id) shadowRef.current = shadowForSong[song.id]()
    }, [song?.id, containerRef, bodyRef, shadowRef])
    return <div data-testid="song-view" />
  }),
}))
```

(This replaces the existing mock's inline destructuring of `{ song, containerRef, bodyRef, shadowRef }` from the function signature — the new version destructures from `props` after capturing it, keeping the exact same `useLayoutEffect` body unchanged.)

Then add the new test to the `describe('MainContent + real useFitToScreen integration', ...)` block, after the existing test:

```jsx
  it('threads a custom maximizeMinFontSize prop down into the real useFitToScreen as its floor', async () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
        maximizeMinFontSize={14}
      />
    )
    fireEvent.click(screen.getByLabelText('Fit song to screen'))
    await flushRaf()

    // song-2 (the default active song in this file's mocks) is set up to
    // never fit within 3 columns, so the pagination fallback pins
    // fitFontSize at the floor — confirming the custom 14 (not the default
    // 18) reached useFitToScreen through MainContent's prop and came back
    // out as fitFontSize, which MainContent then passes straight to SongView.
    expect(lastSongViewProps.fitFontSize).toBe(14)
    expect(lastSongViewProps.paginated).toBe(true)
  })
```

Note: read the existing test file's `renderMaximized()` helper and top-of-file mocks (`shadowForSong`, `songs`, `currentSongId`) before writing this test — the new test must use the same `flushRaf` helper and rendering pattern already established in that file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/SongList/__tests__/MainContent.pagination.integration.test.jsx`
Expected: PASS (both tests in the file).

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run --dir src`
Expected: PASS on every file — this is the first fully-green run since Task 2 removed the hardcoded `MIN_FONT` default.

- [ ] **Step 6: Commit**

```bash
git add src/components/SongList/MainContent.jsx src/components/SongList/__tests__/MainContent.pagination.integration.test.jsx
git commit -m "feat: thread maximizeMinFontSize from MainContent into useFitToScreen"
```

---

### Task 7: Wire `maximizeMinFontSize` from `App.jsx` into `MainContent`

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `displaySettings.settings.maximizeMinFontSize` (Task 1), `MainContent`'s new `maximizeMinFontSize` prop (Task 6).
- Produces: nothing consumed by later tasks — this is the final wiring step that closes the end-to-end data flow described in the design spec.

- [ ] **Step 1: Pass the setting into `MainContent`**

In `src/App.jsx`, find the `<MainContent ... />` call (a single line containing many props) and add `maximizeMinFontSize={displaySettings.settings.maximizeMinFontSize}` to it. The existing line is:

```jsx
              <MainContent onAddToast={addToast} lyricsOnly={effectiveLyricsOnly} hideChordDiagram={hideChordDiagram} fontSize={fontSize} onFontSizeChange={setFontSize} onImportSuccess={() => { if (window.innerWidth < 768) setSidebarOpen(true) }} onOpenSidebar={() => setSidebarOpen(true)} metronomeEnabled={metronomeEnabled} onMetronomeToggle={() => setMetronomeEnabled(e => !e)} metronomeBpm={metronomeBpm} onMetronomeBpmChange={setMetronomeBpm} />
```

Change it to:

```jsx
              <MainContent onAddToast={addToast} lyricsOnly={effectiveLyricsOnly} hideChordDiagram={hideChordDiagram} fontSize={fontSize} onFontSizeChange={setFontSize} onImportSuccess={() => { if (window.innerWidth < 768) setSidebarOpen(true) }} onOpenSidebar={() => setSidebarOpen(true)} metronomeEnabled={metronomeEnabled} onMetronomeToggle={() => setMetronomeEnabled(e => !e)} metronomeBpm={metronomeBpm} onMetronomeBpmChange={setMetronomeBpm} maximizeMinFontSize={displaySettings.settings.maximizeMinFontSize} />
```

- [ ] **Step 2: Run the full test suite to check for regressions**

Run: `npx vitest run --dir src`
Expected: PASS on every file. (There is no dedicated `App.test.jsx` exercising this specific prop-pass per the codebase's existing test file list — if one exists and asserts on `MainContent`'s exact prop list, check its output; otherwise this step confirms no other file broke.)

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire maximizeMinFontSize setting from App into MainContent"
```

---

### Task 8: Manual end-to-end verification in a real browser

**Files:** none (verification-only task, no code changes)

**Interfaces:**
- Consumes: the complete feature from Tasks 1–7.
- Produces: nothing — this is the plan's final task.

Per the project's established gotcha (`useFitToScreen`'s pagination measurement has repeatedly diverged from unit-test predictions under real CSS layout — see prior incidents with `max-content` and multicol padding), this task does not touch pagination *measurement* logic, but it DOES change what value flows into that measurement, so a real-browser smoke check is warranted before considering the feature done.

- [ ] **Step 1: Build and serve the app**

```bash
npm run build
cd dist && python3 -m http.server 8099
```

- [ ] **Step 2: Manually verify in a browser (or via Playwright) at `http://localhost:8099/`**

1. Open Settings → Display tab. Confirm a new row "Minimum font size (maximize mode)" appears below "Annotations", showing "18px".
2. Click `+` five times. Confirm the value updates to "23px" after each click and the row updates immediately (no page reload needed).
3. Click `-` until you reach "8px", then click `-` once more — confirm it stays at "8px" (does not go negative or below 8).
4. Close Settings, open a song long enough to trigger maximize-mode pagination (or import a long test song, per the existing project pattern for this), and enter maximize mode.
5. Confirm the auto-fit font floor now respects your configured minimum (8px in this case) rather than the old hardcoded 20px — the song should shrink further / paginate later than it did before this feature.
6. Reopen Settings → Display tab, click `+` to increase the minimum back to a larger value (e.g. 24px) WHILE the song is still open in maximize mode behind the Settings panel (or close Settings and reopen maximize mode) — confirm the maximize view's font floor updates accordingly on the next auto-fit pass.
7. Reload the page entirely. Confirm the minimum font size setting persisted (still shows your last-set value, not back to 18px default).

- [ ] **Step 3: Report results**

If all checks pass, the feature is complete. If any check fails, use `superpowers:systematic-debugging` to investigate before considering this plan done — do not patch around a real-browser discrepancy without root-causing it first, per this project's established pattern for this exact hook.

---

## Self-Review Notes

- **Spec coverage:** storage/state (Task 1) covers the spec's "Storage & state" section including default `18`, key name, clamping on write AND read, `resetAll` inclusion, and the explicit non-goal of not touching `applyToDOM`. Threading to the hook (Tasks 2–3) covers the spec's "Threading to `useFitToScreen.js`" section including the `MAX_FONT` ceiling being untouched, the dependency-array re-trigger requirement, and the defensive clamp. UI (Task 4) covers the spec's "UI" section including label text, stepper step size, range, and placement after the six existing rows. Prop threading (Tasks 5–7) covers the spec's "Call site" and "Data flow" sections exactly as specified, including the corrected finding (from the brainstorm/spec-writing session) that `MainContent` didn't previously receive `displaySettings` and needs a new single-number prop, not the whole settings object. Testing (embedded per-task) covers the spec's "Testing" section's four bullet points one-to-one. The spec's "No real-browser verification is needed" claim is followed in spirit (no task requires it to pass unit tests), but Task 8 adds a manual check anyway given this codebase's specific prior history of `useFitToScreen` measurement bugs that unit tests missed — this is a deliberate, justified addition beyond the spec's minimum, not a contradiction of it.
- **Placeholder scan:** every step has real, complete code — no "TBD", no "add appropriate handling," no "similar to Task N" without inline code.
- **Type consistency:** `minFontSize` (hook parameter, Task 2/3) → `maximizeMinFontSize` (component prop, Task 6/7) → `settings.maximizeMinFontSize` (settings field, Task 1) → `updateMinFontSize` (setter, Task 1/4/5) are used consistently by name across every task that touches them; verified against the actual current file contents (not assumed) for `useDisplaySettings.js`, `useFitToScreen.js`, `DisplayTab.jsx`, `SettingsPanel.jsx`, `MainContent.jsx`, and `App.jsx` before writing each task's code blocks.
