# Album Edit Design

**Date:** 2026-05-07  
**Status:** Approved

## Goal

Allow a user to edit an already-published album — change its title, artist, cover photo, track order, add new recordings, and remove existing tracks — then re-publish it under the same URL.

## Constraints

- The album URL (`albumCode`) must remain stable across edits so existing share links and QR codes keep working.
- Only the album owner (holder of `creatorToken`) can edit.
- Removed tracks are orphaned in R2 (not deleted). They are invisible to listeners and cost negligible storage. This is acceptable for v1.

## Re-publish Flow

1. Upload only newly added tracks (`isExisting: false`) using the existing `POST /album/:code/track/:trackId` endpoint.
2. If the cover photo changed, `POST /album/:code/cover` to replace it in R2.
3. `PATCH /album/:code` with the updated `title`, `artist`, and the full final `tracks` array.
4. Update localStorage and sync the Zustand store.
5. Navigate back to the album detail view (same `albumCode` — URL unchanged).

## Worker Changes (`songbook-worker/src/routes/album.ts`)

### `PATCH /album/:code`

- Requires `X-Creator-Token` header.
- Body: `application/json` — `{ title: string, artist: string, tracks: Track[] }`.
- Reads existing `meta.json`, verifies token, merges new fields, writes updated `meta.json` back.
- Preserves `albumCode`, `creatorToken`, `createdAt`, `hasCover`, `coverExt`.
- Returns `200 { ok: true }`.

### `POST /album/:code/cover`

- Requires `X-Creator-Token` header.
- Body: raw image bytes; `Content-Type` header gives the MIME type.
- Reads existing meta to verify token.
- Writes cover to R2 at `albums/{albumCode}/cover.{ext}`.
- PATCHes `meta.json` to set `hasCover: true` and the new `coverExt`.
- Returns `200 { ok: true }`.

### CORS

Add `PATCH` to `Access-Control-Allow-Methods` on the album router.

## `albumApi.js` — New Functions

```js
updateAlbumMeta({ albumCode, creatorToken, title, artist, tracks })
// PATCH /album/:code — updates title, artist, tracks in meta.json

updateAlbumCover(albumCode, coverFile, creatorToken)
// POST /album/:code/cover — replaces cover image

updateAlbumLocally({ albumCode, title, artist, tracks })
// Finds the album in localStorage by albumCode and merges the new fields
```

## `libraryStore.js` Changes

- Add state: `editingAlbum: null` (type: album object | null).
- Add action `setEditingAlbum(album)`: sets `isCreatingNewAlbum: true` and `editingAlbum: album`.
- Update `setIsCreatingNewAlbum`: when called with `false`, also clears `editingAlbum: null`.

## `MainContent.jsx` Changes

- Subscribe to `editingAlbum` from the store.
- Pass `album={editingAlbum}` to `<NewAlbumCreator />`. No other changes.

## `AlbumDetailView.jsx` Changes

- Subscribe to `setEditingAlbum` from the store.
- Add a secondary "Edit Album" button below the "Open Album ↗" button.
- On click: call `setEditingAlbum(album)`.
- Because `isCreatingNewAlbum` becomes true, `MainContent` renders `NewAlbumCreator` while `activeAlbumCode` remains set — cancelling edit returns the user straight back to the detail view.

## `NewAlbumCreator.jsx` Changes

### Props

```js
NewAlbumCreator({ album })   // album: null (create) | AlbumObject (edit)
```

### Initialisation (edit mode)

| Field | Source |
|---|---|
| `title` | `album.title` |
| `artist` | `album.artist` |
| `orderedTracks` | `album.tracks.map(t => ({ trackId: t.trackId, name: t.title, duration: t.duration, isExisting: true }))` |
| `coverPreview` | `albumCoverUrl(album.albumCode)` if `album.hasCover`, else null |
| `coverFile` | null (user must pick a new file to change it) |

### Recording Picker (unchanged)

Checking a recording appends it as a new track entry:
```js
{ songId, recordingId, name, duration, mimeType, isExisting: false }
```

Existing tracks do not appear pre-checked in the picker (no `recordingId` stored in local album data). The user may inadvertently add the same recording twice; this is an acceptable edge case for v1.

### Track Order Panel

`SortableTrackRow` renders identically for both existing and new tracks — drag to reorder, X to remove. No visual distinction is required; the `isExisting` flag is internal only.

### Publish Logic (edit mode)

```
for each track where !isExisting:
  uploadTrack(albumCode, newUUID, buffer, mimeType, creatorToken)

if coverFile !== null:
  updateAlbumCover(albumCode, coverFile, creatorToken)

updateAlbumMeta({ albumCode, creatorToken, title, artist, tracks: finalTracksArray })
updateAlbumLocally({ albumCode, title, artist, tracks: finalTracksArray })
syncAlbums()
setActiveAlbumCode(albumCode)   // same code — stays on detail view
setIsCreatingNewAlbum(false)
```

New tracks assigned a fresh `uuidv4()` `trackId` at publish time (same as create flow).

### UI Labels (edit mode)

| Element | Create | Edit |
|---|---|---|
| Page header | "New Album" | "Edit Album" |
| Publish button | "Publish Album" | "Re-publish" |
| Cancel | hides creator | returns to detail view |

## Files Changed

| File | Change |
|---|---|
| `songbook-worker/src/routes/album.ts` | Add `PATCH /:code`, `POST /:code/cover`; update CORS |
| `src/lib/albumApi.js` | Add `updateAlbumMeta`, `updateAlbumCover`, `updateAlbumLocally` |
| `src/store/libraryStore.js` | Add `editingAlbum` state + `setEditingAlbum` action |
| `src/components/SongList/MainContent.jsx` | Pass `album={editingAlbum}` to `NewAlbumCreator` |
| `src/components/Album/AlbumDetailView.jsx` | Add "Edit Album" button |
| `src/components/Album/NewAlbumCreator.jsx` | Accept `album` prop; edit mode logic |
