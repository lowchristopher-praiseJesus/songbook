# Manual Collections — Design Spec

**Date:** 2026-04-03

## Overview

Allow users to manually create collections in the sidebar and assign any songs from their library to them. A song may belong to multiple collections simultaneously.

---

## Data Model

### Index entries

`collectionId` is removed from index entries. Index entries become:

```js
{ id, title, artist, importedAt }
```

Migration runs in `libraryStore.init()`: strip `collectionId` from any existing entries on load and re-save the index.

### Collections

Unchanged: `{ id, name, createdAt, songIds: string[] }`.

`collections[j].songIds` is the **sole source of truth** for collection membership. `collectionUtils.buildGroups` already derives groups from this array exclusively — no display logic reads `collectionId` from index entries.

### Empty collections

`init()` repair currently drops empty collections. After this change, empty `songIds` arrays are preserved — an empty collection is valid (user just created it and hasn't added songs yet). The repair only removes collections whose referenced songs are all missing from storage.

---

## Store Changes (`src/store/libraryStore.js`)

### New actions

**`createCollection(name)`**
- Creates `{ id: uuidv4(), name: name.trim(), createdAt: new Date().toISOString(), songIds: [] }`
- Appends to `collections`, saves to localStorage
- No-op if `name.trim()` is empty

**`setCollectionSongs(collectionId, songIds)`**
- Replaces `songIds` on the named collection with the provided array
- Saves collections to localStorage
- Used by AddSongsModal on Save

### Modified actions

**`addSongs`** — no longer writes `collectionId` to index entries. The collection-assignment path still appends to `collections[j].songIds` as before; it just stops patching the index.

**`deleteCollection`** — remove the `index.map(…collectionId: null)` pass. Just filter the collection out and save.

**`removeSongFromCollection`** — same: remove the index patch. Just update `collections[j].songIds` and save.

**`replaceSong`** — `replaceSong` always reuses the same song ID, so collections' `songIds` arrays automatically retain membership. Remove the `_preservedCollectionId` field from the `addSongs` call — it's no longer needed.

**`init()`** — strip `collectionId` from index entries on load; preserve empty collections during repair.

---

## UI Components

### `src/components/Sidebar/Sidebar.jsx`

Add a `creatingCollection` boolean state (default `false`).

At the top of the collections list (above the `groups.map` render), always render either:
- **idle state**: a dashed "+ New Collection" button row (indigo text, dashed border)
- **creating state**: an inline `<input>` pre-focused, placeholder "Collection name…", with hint text "Enter to create · Esc to cancel"

On Enter: call `createCollection(draft)`, set `creatingCollection(false)`, clear draft.  
On Escape or blur with empty value: cancel, set `creatingCollection(false)`.  
On blur with a non-empty value: treat as confirm (same as Enter).

Only shown when `viewMode === 'collections'` and no search query is active.

### `src/components/Sidebar/CollectionGroup.jsx`

Add an `onAddSongs` prop (callback receiving `collectionId`).

Add a "+ Songs" button to the collection header action area, styled identically to the existing ✏️ and 🗑 buttons (hover-reveal on pointer devices, always visible on touch). Clicking it calls `onAddSongs(group.id)`.

The button is hidden in export mode (alongside the existing rename/delete buttons).

### `src/components/Sidebar/AddSongsModal.jsx` *(new)*

Props: `{ isOpen, collectionId, collectionName, onClose }`

Reads `index` and `collections` from the store.

**Content:**
- Title: "Add songs to "{collectionName}""
- Filter input (local state, clears on open)
- Scrollable checklist of all library songs sorted A-Z by title
  - Each row: checkbox + song title + artist (dimmed)
  - Songs already in other collections show a small collection-name badge (informational only — they can still be checked/unchecked freely)
  - Pre-checked: songs whose IDs appear in `collections.find(c => c.id === collectionId).songIds`
- Save button: calls `setCollectionSongs(collectionId, checkedIds)`, then `onClose()`
- Cancel button: `onClose()` with no changes

Local state: `checkedIds` (Set), initialised from the collection's current `songIds` on open.

### `src/components/Sidebar/Sidebar.jsx` (AddSongsModal wiring)

Add `addSongsTarget` state (`null | { id, name }`).  
Pass `onAddSongs={id => setAddSongsTarget({ id, name: group.name })}` to each `CollectionGroup`.  
Render `<AddSongsModal>` outside the `<aside>` (alongside the existing modals).

---

## Testing

### `src/components/Sidebar/__tests__/AddSongsModal.test.jsx`
- Renders all library songs
- Pre-checks songs already in the collection
- Toggling a checkbox updates local state
- Save calls `setCollectionSongs` with correct IDs
- Cancel does not call `setCollectionSongs`
- Filter input hides non-matching songs

### Store tests
- `createCollection`: adds collection with empty `songIds`, persists to localStorage
- `setCollectionSongs`: replaces songIds correctly, saves
- `deleteCollection`: no longer touches index entries
- `removeSongFromCollection`: no longer touches index entries
- `init()` migration: strips `collectionId` from index entries on load

---

## Out of Scope

- Reordering collections or songs within a collection
- Drag-and-drop song assignment
- Bulk-assigning songs to multiple collections at once
