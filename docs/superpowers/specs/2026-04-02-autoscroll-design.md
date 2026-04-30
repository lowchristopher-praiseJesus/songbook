# Auto-Scroll Feature Design

**Date:** 2026-04-02  
**Status:** Approved

## Context

When performing live, musicians need their hands free. A timed auto-scroll lets the song chart advance at a pace matched to the song's expected performance duration, eliminating manual scrolling. The target duration is user-configurable with a sensible default (1:30).

---

## Architecture

### New Files

- `src/hooks/useAutoScroll.js` — rAF loop, scroll state, start/stop API
- `src/hooks/useScrollSettings.js` — localStorage read/write for target duration

### Modified Files

- `src/components/SongList/MainContent.jsx` — add containerRef, wire hooks, render new controls in the existing floating button stack

### No Zustand changes needed
Scroll is a UI concern local to the song view, not library/song data.

---

## Hooks

### `useAutoScroll(containerRef, targetDuration)`

```
Input:  containerRef (React ref to scrollable <main>), targetDuration (seconds)
Output: { isScrolling, start, stop }
```

- `start()`: computes `px/frame = (scrollHeight − clientHeight) / (targetDuration × 60)`, begins rAF loop
- `stop()`: cancels the rAF, sets `isScrolling = false`
- Loop body: increments `scrollTop` by `px/frame` each frame; calls `stop()` when bottom is reached (`scrollTop + clientHeight >= scrollHeight`)
- Speed is stored in a ref (`pxPerFrameRef`) so it can be updated live
- At `start()`, `pxPerFrameRef` is computed from current `scrollHeight` and `targetDuration`
- When `targetDuration` changes while scrolling, `pxPerFrameRef` is recalculated immediately — adjustments take effect on the next frame

### `useScrollSettings()`

```
Output: { targetDuration, setTargetDuration }
```

- Reads/writes `localStorage` key `songsheet_scroll_duration`
- Default: `90` (seconds)
- Bounds: min `30`, max `600`

---

## UI Controls

Added to the existing `fixed bottom-4 right-4 flex flex-col gap-1` stack in `MainContent.jsx`, below the font-size buttons, inside the existing `{activeSong && ...}` guard:

```
[ + ]   font increase   (existing)
[ − ]   font decrease   (existing)
         — gap —
[ + ]   duration +5s    (only visible while isScrolling)
[1:30]  duration label  (only visible while isScrolling)
[ − ]   duration −5s    (only visible while isScrolling)
         — gap —
[ ▶/⏹ ] scroll toggle  (always visible when activeSong exists)
```

**Button style:** matches existing font buttons — `w-8 h-8 rounded-full bg-gray-500/30 dark:bg-white/20 opacity-70 active:opacity-100`  
**Active state:** ⏹ button gets brighter background to signal scrolling is live  
**Duration label:** non-interactive, same muted text style, displays as `M:SS`  
**Limits:** ± buttons disable at min (30s) and max (600s)

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Song changes while scrolling | `stop()` called, scroll resets to top |
| Font size changes mid-scroll | No interruption; slight speed drift acceptable |
| Song shorter than viewport | `start()` is a no-op (scrollable height ≤ 0) |
| Tab hidden | rAF pauses natively, resumes on tab return |
| Bottom reached | `stop()` called; button reverts to ▶, duration controls hide |

---

## Data & Persistence

- `songsheet_scroll_duration` → integer seconds, persisted in `localStorage`
- No changes to song schema, Zustand store, or `.sbp` file format
- `meta.tempo` (BPM) is not used — target duration is the sole speed input

---

## Verification

1. Open a song. Confirm ▶ button appears in the bottom-right button stack.
2. Press ▶. Confirm song begins scrolling and button shows ⏹.
3. Confirm duration controls (`+`, `1:30`, `−`) appear while scrolling.
4. Press `+`/`−` while scrolling. Confirm displayed duration changes in ±5s increments and scroll speed adjusts immediately.
5. Press ⏹. Confirm scroll stops, controls hide, button reverts to ▶.
6. Let scroll reach bottom. Confirm it stops automatically.
7. Reload page. Confirm custom duration persists.
8. Switch songs while scrolling. Confirm scroll stops and view resets to top.
9. Open a song with content shorter than the viewport. Confirm ▶ press does nothing.
