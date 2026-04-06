# Fit-to-Screen (Maximize) Design

**Date:** 2026-04-06  
**Status:** Approved

## Overview

A "maximize" toggle button on the song lyrics pane that automatically fits the entire song onto the screen without scrolling. When active, the song body is laid out in multiple columns and the font size is auto-calculated — the largest font size at the fewest columns that allows all content to fit in the available pane height.

## Behaviour

- **Toggle button** placed above the `+` font-size button in the existing floating bottom-right controls panel
- **Icon:** `⤢` (expand arrow); turns indigo when active (matching the auto-scroll button style)
- **Session-only:** resets on page reload (no localStorage persistence)
- **Live:** recalculates automatically when the window/pane is resized or when a different song is selected
- **Header:** full song header (title, key, transpose controls, etc.) remains visible — fit mode only affects the song body below the header
- **Column flow:** sections can split naturally across column boundaries (no `break-inside: avoid`)
- **Font size buttons:** `+`/`−` remain visible but are disabled while fit mode is active (global font size is never modified)
- **Best effort:** if the song cannot fit even at 4 columns and 10px font, the algorithm applies the smallest possible result rather than showing an error

## Algorithm — `useFitToScreen` hook

**File:** `src/hooks/useFitToScreen.js`

**Inputs:** `{ enabled, containerRef, headerRef }`  
**Outputs:** `{ fitFontSize, fitColumns, shadowRef }`

The hook lives in **`SongList`** (not `MainContent`) because `SongList` is where the transposed sections are available via `useTranspose`. The hook does not receive sections as a parameter — it only measures a shadow div that `SongList` renders as JSX (React handles populating the correct transposed content).

### Shadow div

`SongList` renders a hidden sibling when `isFit` is true:
```jsx
{isFit && (
  <div ref={shadowRef} style={{ position:'absolute', top:-9999, left:0,
      visibility:'hidden', width:'100%', overflow:'hidden' }}>
    <SongBody fitMode sections={transpose.transposedSections} lyricsOnly={lyricsOnly} />
  </div>
)}
```

Font size inside the shadow is driven by a CSS custom property `--fit-fs` set on the shadow container. `SongBody` in `fitMode` uses `style={{ fontSize: 'var(--fit-fs)' }}` instead of the numeric `fontSize` prop, allowing imperative mutation without React re-renders.

### Measurement loop (runs in `useLayoutEffect`)

```
availableHeight = container.clientHeight − header.offsetHeight

for columns = 1 to 4:
  shadow.style.columnCount = columns
  binary search fontSize from 28 down to 10:
    shadow.style.setProperty('--fit-fs', `${mid}px`)
    shadow.style.height = `${availableHeight}px`
    void shadow.offsetHeight  // force layout
    if shadow.scrollHeight <= shadow.clientHeight:
      record { columns, fontSize: mid }
      lo = mid + 1
    else:
      hi = mid - 1
  if a fit was found at this column count: break

setState(best result)  // single update, no visible flicker
```

**Preference:** fewer columns over more columns; within a column count, largest font that fits.

### Resize detection

A `ResizeObserver` on `containerRef` triggers recalculation (debounced 100ms). This correctly handles sidebar open/close as well as window resize.

### Triggers for recalculation

- `enabled` toggles true
- `activeSongId` changes (song switch)
- Container size changes (via ResizeObserver)
- `lyricsOnly` changes

## Component Changes

### `SongBody` (`src/components/SongList/SongBody.jsx`)

New props:
- `fitMode?: boolean` — switches font-size to CSS variable mode
- `fitColumns?: number` — sets `columnCount` on the outer wrapper

When `fitMode` is true:
- Outer wrapper: `style={{ columnCount: fitColumns }}`
- Line divs: `style={{ fontSize: 'var(--fit-fs)' }}`
- Chord font size: `max(11px, calc(var(--fit-fs) - 3px))` (via inline style — CSS `max()` is supported in all modern browsers)

No structural changes. Natural column flow (sections can split across columns).

### `SongList` (`src/components/SongList/SongList.jsx`)

New props:
- `isFit?: boolean`
- `containerRef` (passed from `MainContent` — the existing scrollable pane ref)

New internal behaviour:
- Creates `headerRef = useRef()` and `shadowRef = useRef()`
- Calls `useFitToScreen({ enabled: isFit, containerRef, headerRef })` → `{ fitFontSize, fitColumns }`
- Passes `fitMode={isFit}` and `fitColumns={fitColumns}` to the real `SongBody`
- When `isFit`, sets `--fit-fs: ${fitFontSize}px` on the real `SongBody` wrapper so actual font size reflects the computed value
- Renders hidden shadow `SongBody` (with `shadowRef`) when `isFit` is true
- Passes `headerRef` to `SongHeader`

### `SongHeader` (`src/components/SongList/SongHeader.jsx`)

New prop: `headerRef` — attached to the root `<div>` so `useFitToScreen` can measure `offsetHeight`.

### `MainContent` (`src/components/SongList/MainContent.jsx`)

- New state: `const [isFit, setIsFit] = useState(false)`
- Passes `isFit` and `containerRef` to `SongList` (no new refs needed here)
- Maximize button added above `+` in the floating controls panel:
  - Icon: `⤢`
  - Active style: `bg-indigo-500/50 dark:bg-indigo-400/40`
  - Inactive style: `bg-gray-500/30 dark:bg-white/20`
- `+`/`−` font buttons: `disabled={fontSize >= 28 || isFit}` / `disabled={fontSize <= 12 || isFit}`

## What is NOT changing

- Global `fontSize` localStorage value — never modified by fit mode
- Auto-scroll behaviour
- Performance mode
- Song header controls (transpose, capo, etc.)
- Any other component not listed above
