# Search UG — Song Preview Window

**Date:** 2026-07-07
**Status:** Approved (design)

## Goal

Add a preview step to the Search UG flow. Today, clicking a result imports it
immediately. We want users to see the song's lyrics and chords *before* committing,
then import via an explicit button only if the song is correct.

## Decisions (from brainstorming)

- **Coexist with direct import.** The existing row click stays a quick
  direct-import path. A separate **Preview** affordance is added to each result
  row. (Choice B.)
- **Single best-match version.** The preview shows one chord chart — the version
  the current `scrapeURL` + `parseUGPage` pipeline already produces for the
  clicked result. No version picker in v1. (Choice A.)
- **Modal overlay.** The preview opens as a modal dialog over the search results;
  closing returns to the results list (no refetch). (Choice A.)
- **Static display only.** Header (title/artist/key/capo) + chord chart +
  Import/Cancel. No transpose, font-size, lyrics-only, or performance-mode
  controls in v1. (Choice A.)

## Architecture

### New component: `src/components/UGImport/UGPreviewModal.jsx`

Self-contained preview dialog. Props:

```
{ result, apiKey, isOpen, onClose, onImported, onAddToast }
```

- Owns its own `status` state machine: `loading` → `ready` | `error`.
- Owns the parsed `song` once the fetch+parse resolves.
- Does **not** touch the library store directly. The Import button calls
  `onImported(song, result)`, delegating the actual import to `UGSearchModal`
  (which already has the duplicate-check + `addSongs` + `selectSong` wiring).
- Reuses the existing fetch+parse path:
  - UG source: `scrapeURL(result.url, apiKey)` → `parseUGPage(scraped, result.url)`
  - Daniel Choy source: reuse `result.rawHtml` if present, else scrape →
    `parseDanielChoyPage(rawHtml, result)`

### Modified files

- **`src/components/UGImport/UGSearchModal.jsx`**
  - Add a per-row **Preview** button (ghost `Button` + eye icon) with
    `e.stopPropagation` so it does not trigger the row's direct-import click.
    Keyboard-accessible (focusable; Enter opens preview).
  - Lift `previewResult` state. When set, render `<UGPreviewModal>` with the
    same `apiKey` / `onAddToast` props the modal already receives, and an
    `onImported` handler that calls the refactored `runImport`.
  - Extract the post-parse tail of `handleSelect` into `runImport(song, result)`
    (see below). `handleSelect` (direct-import click) becomes:
    scrape → parse → `runImport(song, result)`.
- **`src/components/UI/Modal.jsx`**
  - Add optional `size` prop. `'md'` (default) → `max-w-md` (current behavior,
    unchanged for all existing callers). `'xl'` → `max-w-3xl`. Backward
    compatible: no existing caller passes `size`.

### Unchanged (reused as-is)

- `src/lib/ugImport/firecrawlClient.js` (`scrapeURL`)
- `src/lib/ugImport/ugParser.js` (`parseUGPage`)
- `src/lib/danielchoyImport/*` (`searchDanielChoy`, `parseDanielChoyPage`)
- `src/lib/parser/contentParser.js` (`parseContent`, via the parsers)
- `src/components/SongList/SongBody.jsx` (chord/lyric rendering)
- `src/store/libraryStore.js`

## Data flow

1. User clicks **Preview** on a result row → `UGSearchModal` sets
   `previewResult = result` → `UGPreviewModal` opens.
2. `UGPreviewModal` runs the same fetch+parse path `handleSelect` uses today
   (UG or Daniel Choy, per `result.source`).
3. Success → `status: 'ready'`, store `song`. Render header + `<SongBody
   sections={song.sections} fontSize={16} />`.
4. Failure or `song.sections.length === 0` → `status: 'error'` with the
   existing "Couldn't extract chords from this page" message + Close button.
5. User clicks **Import** → `onImported(song, result)` → `UGSearchModal` runs
   `runImport` (no refetch — the song is already parsed).
6. User clicks **Cancel** / ✕ → `onClose` → returns to the results list
   (search results preserved).

The existing **row click stays direct-import**, unchanged.

## Shared `runImport` refactor

Extract the post-parse tail of `handleSelect` (current lines ~103–148) into a
function both the direct-import click and the preview's Import button call:

```js
// inside UGSearchModal
const runImport = async (song, result) => {
  // 1. Duplicate check via onDuplicateCheck(song.meta.title)  (Promise)
  //    - replace path: replaceSong(duplicate.id, song); selectSong(duplicate.id)
  //    - keep-both / new path: addSongs([song], sourceLabel, result.source === 'ug' ? 'ug' : 'danielchoy')
  //                            → find new entry → selectSong(id)
  //    - skip: return without importing
  // 2. onSongSelect(); onImportSuccess?.(); onAddToast(`Imported: ${title}`, 'success')
  // 3. resetAndClose()  (also clears previewResult)
};
```

`handleSelect` becomes: scrape → parse → `runImport(song, result)`.
The preview's Import button calls `runImport` directly with the already-parsed
song. One import path, two entry points. The existing `importingRef` double-click
guard covers the direct path; the preview's Import button gets its own
disabled-while-importing state.

## UI layout

### Result row

Keep the existing full-width row button (direct import on click). Add a small
**Preview** button inside the row — ghost-variant `Button` with an eye icon,
right-aligned, `e.stopPropagation` so it doesn't trigger the row import.
Focusable; Enter opens preview.

### Preview modal (`<Modal size="xl">`)

- **Header band:** title (bold), artist, small meta row — `Key: G` · `Capo: 2`
  (only fields present in `song.meta`). Built from `song.meta` directly, not
  `SongHeader` (avoids pulling in transpose/edit/performance controls).
- **Body:** `<SongBody sections={song.sections} fontSize={16} />` in the
  scrollable region (`Modal` already provides `max-h-[90vh] overflow-y-auto`).
- **Footer:** right-aligned `Cancel` (secondary) + `Import` (primary). While
  `status === 'loading'`, show the existing inline spinner in place of the body
  and disable Import. On `error`, show the error message + `Close` button
  instead of body/footer.
- Title bar: song title (or "Preview" while loading) + existing ✕ close.

## Error handling

- **Fetch/parse failure** (network error, scrape error, parse throws):
  `status: 'error'`, message "Couldn't extract chords from this page. Try
  another result or import directly." + Close button.
- **Empty sections** (`song.sections.length === 0`): same error state — matches
  the existing `handleSelect` guard.
- **Import-time duplicate:** the existing `onDuplicateCheck` Promise flow
  (replace / keep-both / skip) runs unchanged inside `runImport`. Because
  `runImport` lives in `UGSearchModal`, the duplicate prompt reuses the existing
  `duplicateState` panel with no changes. **Skip** closes the preview without
  importing.
- **Double-click guard:** the preview's Import button is disabled while the
  async duplicate-check/import is in flight (local state), mirroring the
  existing `importingRef` pattern.

## Testing

Vitest + @testing-library/react (existing setup).

- **`UGPreviewModal.test.jsx` (new)**
  - Renders loading state, then `SongBody` content once parse resolves (mock
    `scrapeURL` + `parseUGPage`).
  - Shows error state when parse returns empty sections.
  - Import button calls `onImported` with the parsed song; Cancel calls
    `onClose`.
  - Import disabled while loading.
- **`UGSearchModal.test.jsx` (extend existing)**
  - Clicking **Preview** on a row opens the preview and does **not** call
    `addSongs`.
  - Clicking the row body (not Preview) still imports directly.
  - Preview button `stopPropagation` — clicking it does not trigger row import.
- **`Modal.test.jsx` (extend or add)**
  - `size="xl"` produces `max-w-3xl`; default still `max-w-md`.
- **`runImport`:** covered via the existing direct-import test plus the
  preview's import test (both exercise the same function). No separate unit
  test file.