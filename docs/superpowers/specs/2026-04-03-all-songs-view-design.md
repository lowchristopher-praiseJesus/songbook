# All Songs View Design

## Context

Currently all imported songs (from .sbp, .sbpbackup, or UG search) live inside named collections. There is no way to see the full library in one place without navigating each collection individually. This feature adds a flat "All Songs" view alongside the existing "Collections" view so users can browse everything alphabetically at a glance.

---

## Feature Summary

Add a **segmented control** (pill toggle) to the sidebar that switches between two views:

- **Collections** — the current grouped view (unchanged)
- **All Songs** — a flat A–Z list of every song in the library regardless of collection

The selected view is **persisted to localStorage** (`songsheet_view_mode`) and restored on app load.

---

## UI: Segmented Control

- Placed in the sidebar between the search box and the song list
- Two options: `Collections` | `All Songs`
- Active option has a filled pill background; inactive is muted text
- Matches existing dark theme (`#313244` background, `#89b4fa` active, `#6c7086` inactive)

---

## All Songs View

- Displays **every song** in `index` (from the Zustand store) sorted A–Z by `title`
- Grouped by **letter dividers** (A, B, C…) — only letters that have songs appear
- Each song shows: **title** + **artist** (same `SongListItem` component as Collections view)
- Active song is highlighted the same way as in Collections view
- Search works identically — filters the A–Z list to matching songs, hides letter dividers

### Export Mode

- Checkboxes appear on individual `SongListItem`s as normal
- Letter-group headers do **not** get tri-state checkboxes (letters are not meaningful groups unlike named collections)

---

## Navigation (Prev / Next)

The prev/next song order in `MainContent.jsx` (swipe, arrow keys) follows the **active view**:

- **Collections view** → order from `buildGroups()` (existing behaviour)
- **All Songs view** → A–Z order across all songs (same sorted array used to render the list)

---

## State & Persistence

### Zustand store additions (`libraryStore.js`)

```js
viewMode: 'collections' | 'allSongs'   // new field, default 'collections'
setViewMode(mode)                        // new action
```

`init()` reads `songsheet_view_mode` from localStorage on startup.  
`setViewMode()` writes to localStorage on every change.

### localStorage key

`songsheet_view_mode` — value `'collections'` or `'allSongs'`

---

## Files Changed

| File | Change |
|------|--------|
| `src/store/libraryStore.js` | Add `viewMode` state + `setViewMode()` action; read/write `songsheet_view_mode` in `init()` and `setViewMode()` |
| `src/lib/storage.js` | Add `getViewMode()` / `saveViewMode()` helpers (consistent with existing pattern) |
| `src/components/Sidebar/Sidebar.jsx` | Add segmented control UI; conditionally render Collections groups or All Songs list |
| `src/components/Sidebar/AllSongsList.jsx` | New component — renders A–Z letter dividers + `SongListItem` entries |
| `src/components/SongList/MainContent.jsx` | Read `viewMode` from store; use A–Z order for nav when in `allSongs` mode |

---

## Verification

1. Import songs from multiple .sbp files with different collection names
2. Switch to All Songs view — confirm all songs appear sorted A–Z with letter dividers
3. Confirm switching back to Collections view restores the grouped layout
4. Reload the page — confirm the last-used view is restored
5. Click a song in All Songs view — confirm it opens in the main pane
6. With a song active, press arrow keys/swipe — confirm nav follows A–Z order in All Songs mode and collection order in Collections mode
7. Type in the search box in All Songs view — confirm it filters the A–Z list
8. Enter export mode in All Songs view — confirm individual song checkboxes appear, no letter-group checkboxes
