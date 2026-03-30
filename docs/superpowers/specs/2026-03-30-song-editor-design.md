# Song Editor — Design Spec

**Date:** 2026-03-30
**Status:** Approved

## Overview

A dedicated full-screen edit mode for modifying a song's metadata and chord/lyric content. Accessed via an "Edit" button on the song view; navigates to a new route `/song/:id/edit`. Changes are persisted only on explicit Save.

---

## Architecture & Routing

**New route:** `/song/:id/edit` renders `SongEditor` page component.
The existing `/song/:id` route and all its components are untouched.

### New files
- `src/components/SongEditor/SongEditor.jsx` — full-screen editor page
- `src/components/SongEditor/MetaFields.jsx` — controlled form for title, artist, key, capo, tempo, time signature

### Modified files
- `src/App.jsx` — add `/song/:id/edit` route
- `src/components/SongList/SongHeader.jsx` — add "Edit" button linking to `/song/:id/edit`
- `src/store/libraryStore.js` — add `updateSong(id, { meta, rawText })` action

### Data flow on Save
1. User edits metadata fields and/or rawText textarea
2. Click Save → `parseContent(rawText)` regenerates `sections`
3. `updateSong()` derives `keyIndex` + `usesFlats` from selected key name, writes updated song to localStorage, updates index entry, refreshes `activeSong` if this is the active song
4. Navigate back to `/song/:id`

---

## Editor UI

The page uses the same app background and theme. Layout top to bottom:

### Top bar (sticky)
- Left: song title (read-only display, updates live as title field changes)
- Right: "Cancel" button, "Save" button

### Metadata section
A single compact row of controlled inputs above the textarea:
- **Title** (text)
- **Artist** (text)
- **Key** (`<select>` with all 12 chromatic keys: C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B)
- **Capo** (number, 0–7)
- **Tempo** (number, optional)
- **Time Signature** (text, optional)

Changing the Key field updates `meta.key` and `meta.keyIndex`. It does **not** transpose chord symbols in the content — the user is responsible for keeping content consistent with the declared key.

### Content textarea
- Fills remaining viewport height, full width
- Monospace font
- Pre-populated with `song.rawText`
- Hint text above: `{c: Section} for headers · [Chord] before a syllable`
- Plain textarea — no syntax highlighting

---

## Data & Edge Cases

### `updateSong(id, { meta, rawText })` store action
- Re-derives `sections` via `parseContent(rawText)`
- Derives `keyIndex` from key name using the existing 12-note chromatic map
- Derives `usesFlats` (true for keys: Db, Eb, F, Ab, Bb)
- Writes updated song to localStorage via `saveSong`
- Updates the index entry (title and artist may have changed)
- Refreshes `activeSong` in store if `id === activeSongId`

### `rawText` as source of truth
The textarea is pre-filled from `song.rawText`. No serialization from `sections` is needed. `rawText` is always the canonical editable string.

### Songs without `rawText`
Songs imported via UG scraper may lack a `rawText` field. The textarea initializes empty; the user builds content from scratch.

### Unsaved-changes guard
- `isDirty` boolean, set true on any field or textarea change
- Cancel with `isDirty === true`: fire `window.confirm("Discard changes?")` before navigating away
- Cancel with no changes: navigate immediately
- No guard on Save

---

## Testing

### `SongEditor.test.jsx`
- Renders with song loaded from store; metadata fields and textarea pre-populated correctly
- Save calls `updateSong` with correct args (including re-parsed sections from modified rawText)
- Cancel without changes navigates back without `window.confirm`
- Cancel with changes triggers `window.confirm`

### `libraryStore` — `updateSong` action tests
- Updates `meta`, `rawText`, and `sections` in localStorage
- Updates index entry when title/artist change
- Refreshes `activeSong` when editing the active song

`MetaFields` has no logic and requires no dedicated tests.
