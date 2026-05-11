# Recording Indicator in Top Bar

**Date:** 2026-05-11  
**Status:** Approved

## Problem

When a user starts recording a song, the recording controls live inside `SongHeader` — deep in the component tree under `MainContent`. The top bar (in `App.jsx`) has no visibility into recording state. If the user scrolls away or focuses elsewhere, there is no reminder that a recording session is in progress.

Additionally, changing the active song while recording silently loses the recording: `SongHeader` unmounts (its container has `key={activeSongId}`), the `AudioRecorder` is abandoned without being stopped, the microphone stays open in the background, and data is lost with no warning.

## Goals

1. Show a live recording indicator (status + elapsed time) in the top bar next to the app name.
2. Fix the silent data loss: when `SongHeader` unmounts during an active recording, cleanly stop the recorder and release the microphone.

## Architecture

### 1. `src/store/recordingStore.js` — new Zustand store

A minimal global store that bridges recording state from `SongHeader` up to `App.jsx`:

```js
{ status: 'idle', elapsedMs: 0 }
setRecordingState(status, elapsedMs)
```

`status` mirrors the values from `useRecording`: `'idle' | 'requesting' | 'recording' | 'paused' | 'naming' | 'error'`.

### 2. `useRecording` hook — two changes

**Sync to store:** A `useEffect([status, elapsedMs])` calls `recordingStore.getState().setRecordingState(status, elapsedMs)` on every change. The 200ms timer interval means the store lags by at most one tick — imperceptible.

**Cleanup on unmount:** A new `useEffect` with an empty dependency array returns a cleanup function that:
- Calls `recorderRef.current?.stop()` fire-and-forget if status is `recording` or `paused` — this releases the microphone track (recorded data is discarded; the user did not initiate a save)
- Calls `clearInterval(timerRef.current)` to stop the elapsed timer
- Calls `recordingStore.getState().setRecordingState('idle', 0)` directly (bypassing React state, since the component is unmounting)

The cleanup must reference `status` via a ref (not closure) to avoid stale state. A `statusRef` is kept in sync with `status`.

### 3. Top bar indicator — `App.jsx`

Reads `status` and `elapsedMs` from `recordingStore`. Rendered inline to the right of `🎵 SongSheet`, before the right-side controls:

| State | Appearance |
|-------|-----------|
| `recording` | Pulsing red dot (`animate-pulse`) + red elapsed timer, e.g. `● 0:42` |
| `paused` | Yellow ⏸ icon + gray elapsed timer, e.g. `⏸ 0:42` |
| anything else | Nothing rendered |

Elapsed time is formatted as `m:ss` (or `h:mm:ss` for recordings over an hour). The `formatElapsed` function already exists in `RecordingTimer.jsx` as a local unexported helper — it will be exported from that file and imported in `App.jsx`.

## What Does Not Change

- `SongHeader` API — no prop changes
- `RecorderButton`, `RecordingTimer`, `NamingDialog`, `RecordingsPanel` — untouched
- `libraryStore` — untouched
- Recording save flow — unchanged; the cleanup only fires on unmount (song change), not on normal stop/save

## Files Changed

| File | Change |
|------|--------|
| `src/store/recordingStore.js` | New — minimal Zustand store |
| `src/hooks/useRecording.js` | Add store sync effect + unmount cleanup |
| `src/App.jsx` | Read from store, render indicator in header |

## Out of Scope

- Prompting the user before navigating away from an active recording (e.g. a "You have an unsaved recording" dialog) — considered but excluded to keep scope small
- Clicking the top bar indicator to navigate back to the recording controls
