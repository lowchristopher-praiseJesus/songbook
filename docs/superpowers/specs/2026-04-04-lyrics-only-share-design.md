# Lyrics-Only Share Mode — Design Spec

**Date:** 2026-04-04

## Overview

When sharing songs via link, the sender can opt to share in "lyrics only" mode. Recipients who import such a share will have lyrics-only mode temporarily enabled for their session (not persisted to localStorage), and are informed of this in the import confirmation dialog.

## Data Layer

### `src/lib/exportSbp.js` — `buildSbpZip`

Add an optional `lyricsOnly` parameter (boolean, default `false`). When `true`, include `lyricsOnly: true` in the ZIP JSON data object alongside `collectionName`.

```js
const data = {
  ...(collectionName ? { collectionName } : {}),
  ...(lyricsOnly ? { lyricsOnly: true } : {}),
  songs: sbpSongs,
  sets: [],
  folders: [],
}
```

`exportSongsAsSbp` forwards the parameter to `buildSbpZip`.

### `src/lib/parser/sbpParser.js` — `parseSbpFile`

Read `lyricsOnly` from the parsed JSON. Include it in the returned object. Defaults to `false` if absent, preserving backward compatibility with all existing SBP files.

```js
return {
  songs: [...],
  collectionName: data.collectionName ?? null,
  lyricsOnly: data.lyricsOnly ?? false,
}
```

## Sender UI — ShareModal

**File:** `src/components/Share/ShareModal.jsx`

In the `idle` step, add a "Share lyrics only" toggle (checkbox or toggle switch, consistent with the Settings panel style) below the expiry selector. Default: unchecked.

- Local state: `const [shareLyricsOnly, setShareLyricsOnly] = useState(false)`
- On modal close/reset: reset to `false`
- In `handleCreateLink`: pass `shareLyricsOnly` to `exportSongsAsSbp(songs, nameValue.trim() || null, shareLyricsOnly)`

## Recipient Side

### `src/App.jsx`

- Add `const [sessionLyricsOnly, setSessionLyricsOnly] = useState(false)` — in-memory only, resets on page reload
- Compute `const effectiveLyricsOnly = lyricsOnly || sessionLyricsOnly`
- Pass `effectiveLyricsOnly` everywhere `lyricsOnly` is currently passed (MainContent, SettingsPanel)
- In `handleShareImport`: if `shareSongs.lyricsOnly` is true, call `setSessionLyricsOnly(true)`
- Replace `onToggleLyricsOnly` with a handler that sets `lyricsOnly` to `!effectiveLyricsOnly` (not a blind toggle of the localStorage value) and always calls `setSessionLyricsOnly(false)`. This prevents a bug where session=true + localStorage=false would cause clicking "off" to leave effective still true (because blind-toggling localStorage false→true).
- Pass `shareSongs?.lyricsOnly ?? false` to `ImportConfirmModal` as a `lyricsOnly` prop

### `src/components/Share/ImportConfirmModal.jsx`

- Accept `lyricsOnly` prop (boolean)
- When `true`, render a note below the song list:
  > "Chords will be hidden — this collection was shared in lyrics-only mode."
- Style: small, muted text (e.g. `text-sm text-gray-500 dark:text-gray-400`) consistent with other notes in the modal

## Session State Lifecycle

| Event | `lyricsOnly` (localStorage) | `sessionLyricsOnly` (memory) | Effective |
|---|---|---|---|
| App loads, user had saved `false` | `false` | `false` | `false` |
| Import lyrics-only share | `false` | `true` | `true` |
| User toggles off via Settings | `false` | `false` | `false` |
| Page reload after import | `false` | `false` (reset) | `false` |
| Import, then user toggles on via Settings | `true` | `false` | `true` |

## Testing

- `exportSbp.js`: `buildSbpZip` with `lyricsOnly=true` includes the field in ZIP JSON; with `false`/omitted it is absent
- `sbpParser.js`: parsed result includes `lyricsOnly: true` when present; defaults to `false` when absent
- `ShareModal`: "Share lyrics only" toggle renders; passes flag to `exportSongsAsSbp` when checked
- `ImportConfirmModal`: renders lyrics-only note when `lyricsOnly=true`; note absent when `false`
- `App.jsx`: `handleShareImport` sets `sessionLyricsOnly` when flag is present; effective value is `lyricsOnly || sessionLyricsOnly`; toggling Settings clears session flag
