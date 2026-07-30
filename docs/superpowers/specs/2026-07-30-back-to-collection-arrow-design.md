# Back-to-Collection Arrow — Design

## Problem

When a user opens a song from inside a collection (via the sidebar's collection group, or via `CollectionDetailView`'s song list), there's no way to jump back to that collection's detail page short of going through the sidebar again. The store already remembers which collection a song was opened from (`activeCollectionId`), but nothing in the song view surfaces it as a navigation affordance.

## Goal

When the active song belongs to a collection the user navigated from, show a `← <Collection Name>` link above the song title that returns to that collection's detail view (the same view `CollectionDetailView` renders, listing all songs in the collection).

## Non-goals

- No change to Maximize/Fit mode — `SongHeader` (and thus this link) is already not rendered there.
- No change to Performance mode — it's a full-screen overlay, unaffected.
- No new persistence — this reads the existing `activeCollectionId` store field; it does not add new state.

## Design

### State source

`activeCollectionId` (already in `libraryStore`) tracks "the collection the user last navigated from," set whenever `selectSong(id, collectionId)` is called with an explicit `collectionId`:
- `CollectionDetailView.handleSongClick` and `SongListItem` (inside a `CollectionGroup`) pass the collection's id.
- Selecting from "All Songs" or other collection-less contexts passes `null`, clearing it.

This is the same field `MainContent` already uses to compute `inCollection` (for swipe-navigation scoping and hints), so it reliably reflects "is this song currently being viewed in the context of a collection."

### Derived value

In `MainContent`:

```js
const backCollection = activeCollectionId
  ? collections.find(c => c.id === activeCollectionId) ?? null
  : null
```

Looking the collection up by id (rather than trusting `activeCollectionId` alone) guards against the collection having been deleted since the song was opened — in that case `backCollection` is `null` and the link doesn't render.

### Prop threading

Two new props flow down: `MainContent` → `SongView` → `SongList` → `SongHeader`:
- `collectionName: string | null` — `backCollection?.name ?? null`
- `onBackToCollection: () => void` — `() => setSelectedCollectionId(activeCollectionId)`

`setSelectedCollectionId` already causes `MainContent` to render `CollectionDetailView` for that id instead of the song (see the existing `selectedCollectionId ? <CollectionDetailView /> : ...` branch), so no new view-switching logic is needed — this reuses the exact mechanism `CollectionDetailView`'s own "← Back" button relies on in reverse.

### UI placement

In `SongHeader`, a small text link is added between the artist line and the Row 1 controls:

```
{collectionName && (
  <button type="button" onClick={onBackToCollection} className="...">
    ← {collectionName}
  </button>
)}
```

Styled consistently with the existing "← Back" button in `CollectionDetailView` (text-sm, muted gray, hover darkens), truncated with `truncate`/`max-w-[...]` if the collection name is long.

### Testing

Add coverage (likely in `MainContent`'s or `SongHeader`'s existing test file):
1. Song opened with a valid `activeCollectionId` → link renders with the collection's name; clicking it calls `setSelectedCollectionId` with that id.
2. `activeCollectionId` is `null` (song opened from All Songs) → link does not render.
3. `activeCollectionId` points at a collection no longer in `collections` (deleted) → link does not render.

## Open questions

None — placement and label style were confirmed with the user (link above the title, showing the collection name).
