---
name: Post-Import Navigation
description: After importing a song or collection, automatically switch sidebar tab, expand the collection, and load the first song
type: project
---

## Overview

When a user imports songs (via file upload or share link), the app should navigate to show the imported content immediately rather than leaving the sidebar unchanged.

## Behavior

### Single song import (no collection created)
1. Switch sidebar to **All Songs** tab (`viewMode = 'allSongs'`)
2. Call `selectSong(songId)` — highlights in sidebar and loads in main content

### Collection import (multi-song file or .sbp with collection name)
1. Switch sidebar to **Collections** tab (`viewMode = 'collections'`)
2. Expand the newly created collection
3. Call `selectSong(firstSongId)` — highlights first song and loads in main content

### Share link import (`?share=` URL → ImportConfirmModal)
Same as collection import — share imports always create a collection.

### Nothing added (all duplicates skipped or replaced)
Do nothing. Stay on current view.

## Store changes (`libraryStore.js`)

**`addSongs` return value**
- Currently returns `void`. Change to return `{ newSongIds: string[], collectionId: string | null }`.
- `newSongIds`: IDs of songs actually added (excludes replaced and skipped duplicates).
- `collectionId`: ID of the collection created, or `null` if no collection.

**New state field**
```js
expandedCollectionId: null,  // string | null
```

**New action**
```js
setExpandedCollectionId(id) {
  set({ expandedCollectionId: id })
}
```

`expandedCollectionId` lives in the store alongside the existing `viewMode` field, which is also UI navigation state.

## `useFileImport.js` changes

- Capture the return value of `addSongs`: `const { newSongIds, collectionId } = addSongs(accepted, effectiveCollectionName)`
- Call `onSuccess({ newSongIds, collectionId })` instead of `onSuccess()`.
- If `newSongIds.length === 0`, still call `onSuccess` — the handler no-ops when there is nothing to navigate to.

## `Sidebar.jsx` changes

Replace the `onSuccess: onImportSuccess` passthrough with a handler:

```js
onSuccess: ({ newSongIds, collectionId } = {}) => {
  if (newSongIds?.length > 0) {
    if (collectionId) {
      setViewMode('collections')
      setExpandedCollectionId(collectionId)
    } else {
      setViewMode('allSongs')
    }
    selectSong(newSongIds[0])
  }
  onImportSuccess?.()  // mobile: open sidebar
}
```

New store selectors needed in Sidebar: `selectSong`, `setExpandedCollectionId`.

## `CollectionGroup.jsx` changes

- Read `expandedCollectionId` from store.
- Add a `useEffect` that calls `setOpen(true)` when `expandedCollectionId === group.id`.
- Local `open` state governs everything after that — the user can collapse manually without the effect re-firing (the effect only triggers when the store value changes).

```js
const expandedCollectionId = useLibraryStore(s => s.expandedCollectionId)
useEffect(() => {
  if (expandedCollectionId === group.id) setOpen(true)
}, [expandedCollectionId, group.id])
```

## `App.jsx` share import changes

`handleShareImport` currently ignores the return of `addSongs`. Update to:

```js
const { newSongIds, collectionId } = addSongs(songs, name)
if (newSongIds.length > 0) {
  setViewMode('collections')
  setExpandedCollectionId(collectionId)
  selectSong(newSongIds[0])
}
```

Additional store selectors needed in App: `setViewMode`, `setExpandedCollectionId`, `selectSong`.

## Out of scope

- UG Search import (separate modal with its own import path — not changed)
- `replaceSong` duplicate resolution — replaced songs are not counted as "newly added" and do not trigger navigation
