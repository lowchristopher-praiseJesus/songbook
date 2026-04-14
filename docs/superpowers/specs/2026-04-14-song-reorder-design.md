# Song Reorder Within Collections — Design Spec

**Date:** 2026-04-14  
**Status:** Approved

## Overview

Allow songs within a named collection to be manually reordered via drag-and-drop. The new order persists to localStorage.

## Scope

- Reordering is within a single collection only — no cross-collection dragging.
- Reordering is disabled for the virtual `__uncategorized__` group (no `songIds` array to persist).
- The "All Songs" view is unaffected (it remains alphabetical).

## Library

**`@dnd-kit/core` + `@dnd-kit/sortable`** — modern, actively maintained, ~10 KB gzipped, good accessibility and touch support. `react-beautiful-dnd` (deprecated) and native HTML5 DnD (poor touch, more manual work) were considered and rejected.

## Data & Store

No schema changes. `collection.songIds` is already an ordered array. The existing `setCollectionSongs(collectionId, songIds)` action accepts a full replacement array — it is called on drop with the reordered array produced by `arrayMove` from `@dnd-kit/sortable`.

## Components

### `CollectionGroup.jsx`

- When `!isSpecial`, wrap the song `<ul>` in `DndContext` + `SortableContext`, passing the group's `songIds` as items.
- Handle `onDragEnd`: if `over` is non-null and `active.id !== over.id`, compute the new order with `arrayMove` and call `setCollectionSongs`.
- When `isSpecial` (`__uncategorized__`), render the list unchanged — no DnD context, no handles.

### `SongListItem.jsx`

- Call `useSortable({ id: entry.id })` to get `attributes`, `listeners`, `setNodeRef`, `transform`, `transition`, `isDragging`.
- Apply `setNodeRef`, `transform`, `transition` to the row container.
- Render a `⠿` grip icon on the left with `...listeners` and `...attributes`. The rest of the row remains a click target for song selection (not a drag surface).
- During drag: row gets indigo background + box shadow (`isDragging` flag). Drop slot gets a dashed indigo border placeholder.

### `collectionUtils.js`

No changes — `buildGroups` already maps `songIds` in order.

## Visual Design

- Grip icon (`⠿`) on the left of each song row, always visible.
- Color: muted gray (`text-gray-300 dark:text-gray-600`), `cursor-grab`.
- While dragging: icon color shifts to indigo, cursor becomes `cursor-grabbing`.
- Dragged item: indigo highlight + subtle box shadow.
- Drop placeholder slot: dashed indigo border.
- Matches the existing indigo accent used throughout the app.

## Error Handling & Edge Cases

- **Cancelled drag** (`over: null` on `onDragEnd`): skip `setCollectionSongs`, order unchanged.
- **Single-item collection**: handle renders but drag has no valid drop target; order unchanged.
- **Uncategorized group**: `DndContext` is not rendered; handles do not appear.

## Testing

- **`libraryStore` unit test**: call `setCollectionSongs` with a reordered array; assert new order in state and in localStorage.
- **`CollectionGroup` unit test**: simulate `onDragEnd` with valid `active`/`over`; assert `setCollectionSongs` called with correct reordered `songIds`.
- `SongListItem` changes are purely presentational — no new tests required.
