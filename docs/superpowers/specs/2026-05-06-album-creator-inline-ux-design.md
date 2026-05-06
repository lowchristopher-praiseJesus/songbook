# Album Creator — Inline UX Design

**Date:** 2026-05-06
**Status:** Approved

## Overview

Replace the multi-step `AlbumCreatorModal` with a full-page inline creator that lives in the main content area. The creator uses a two-column layout (left: album details + track order; right: recording picker) and hands off directly to `AlbumDetailView` on publish success. `AlbumDetailView` gains a prominent "Open Album" button.

---

## User Flow

1. User navigates to the Albums tab and clicks **"New Album"** in `AlbumsPanel`.
2. **Mobile only**: sidebar hides (`setSidebarOpen(false)` callback from `App.jsx`).
3. Store sets `isCreatingNewAlbum: true`, clears `activeSongId`, `activeAlbumCode`, `editingSongId`, `isCreatingNewSong`.
4. `MainContent` renders `<NewAlbumCreator />` (highest priority check, above `activeAlbum`, `isCreatingNewSong`, etc.).
5. User fills in album details and selects recordings on the same screen.
6. User optionally reorders tracks via drag handles, then clicks **Publish Album**.
7. The left column transforms into an inline upload progress view (no modal).
8. On success: store sets `activeAlbumCode = newAlbumCode`, `isCreatingNewAlbum: false` → `AlbumDetailView` renders.
9. `AlbumDetailView` shows a full-width **"Open Album ↗"** primary button below the title. This button is present for all albums (new and existing), not just post-publish.
10. Clicking **Cancel** at any point sets `isCreatingNewAlbum: false` and restores the previous main content view.

---

## Layout

### Desktop (md+)

```
┌─────────────────┬──────────────────────────────────────────────┐
│   Sidebar       │  New Album                                   │
│   (stays open)  ├───────────────────────┬──────────────────────┤
│                 │  LEFT COLUMN (260px)  │  RIGHT COLUMN (flex) │
│   Albums        │                       │                      │
│   + New Album   │  [cover] Title        │  Select Recordings   │
│   Sunday Praise │          Artist       │  [Collections][Songs]│
│                 │                       │                      │
│                 │  Track Order          │  ▸ Sunday Service    │
│                 │  drag to reorder      │  ☑ Amazing Grace     │
│                 │  ⠿ 1. Amazing Grace ✕ │  ☑ El Shaddai        │
│                 │  ⠿ 2. El Shaddai    ✕ │  ☐ How Great...      │
│                 │  ⠿ 3. Faithfulness  ✕ │                      │
│                 │  [+ add from right]   │  ▸ Youth Camp        │
│                 │                       │  ☐ Oceans            │
│                 │  [Publish Album]      │                      │
│                 │  [Cancel]             │                      │
└─────────────────┴───────────────────────┴──────────────────────┘
```

### Mobile

Sidebar hides. Single scrollable column: metadata → recordings picker → track order → Publish.

---

## Components

### New: `NewAlbumCreator`

Replaces `AlbumCreatorModal` for the creation flow. Self-contained component rendered by `MainContent`.

**Internal state:**
- `title`, `artist`, `coverFile`, `coverPreview` — album metadata
- `bysong` — same structure as current `StepSelectRecordings` (loaded from OPFS)
- `orderedTracks` — array of selected `{ songId, songTitle, recordingId, name, duration, mimeType }`, ordered by user
- `loading` — OPFS load state
- `tab` — `'collections'` | `'songs'`
- `uploadPhase` — `null` | `'uploading'` | `'error'`
- `uploadProgress` — `{ step, current, total }`

**Behaviour:**
- On mount: load recordings via `OPFSClient` (same logic as `StepSelectRecordings`)
- Checking a recording appends it to `orderedTracks`; unchecking or pressing ✕ removes it
- Track order list uses HTML5 Drag API for reorder (drag handle on left, ✕ button on right)
- Clicking Publish sets `uploadPhase: 'uploading'`, left column shows progress bar; Publish button is replaced by the progress view (no double-submission possible)
- On upload success: calls `saveAlbumLocally`, dispatches `store.setActiveAlbumCode(newCode)` and `store.setIsCreatingNewAlbum(false)`, calls `store.syncAlbums()`
- On upload error: shows error message in left column with a retry or cancel option

**Drag-and-drop (HTML5 Drag API, no library):**
- `draggable` on each track row
- `onDragStart`: store dragged index in ref
- `onDragOver`: compute drop target index, update `orderedTracks` optimistically
- `onDragEnd`: finalise (no-op if already applied)
- Touch devices: fall back gracefully — drag won't work on touch, but tracks can still be removed via ✕ and re-added in the desired order

### Modified: `AlbumDetailView`

Add a full-width "Open Album ↗" `<a>` element (styled as a primary button, `target="_blank"`) immediately below the title/artist/date block. Present for all albums (new and existing).

### Modified: `AlbumsPanel`

- Remove `AlbumCreatorModal` usage
- "New Album" button calls a new `onNewAlbum` prop (provided by `Sidebar`) instead of opening the modal
- `Sidebar` receives `onNewAlbum` from `App.jsx`, which calls `store.setIsCreatingNewAlbum(true)` and (on mobile) `setSidebarOpen(false)`

### Modified: `MainContent`

Add `isCreatingNewAlbum` check as the **first** branch in the render tree (above `activeAlbum`):

```jsx
{isCreatingNewAlbum
  ? <NewAlbumCreator />
  : activeAlbum
  ? <AlbumDetailView album={activeAlbum} />
  : isCreatingNewSong
  ? ...
```

### Modified: `libraryStore`

Add:
```js
isCreatingNewAlbum: false,
setIsCreatingNewAlbum: (val) => set({
  isCreatingNewAlbum: val,
  ...(val ? { activeSongId: null, activeSong: null, activeAlbumCode: null, editingSongId: null, isCreatingNewSong: false } : {})
}),
```

Also update `setViewMode` to clear `isCreatingNewAlbum` when switching tabs:
```js
setViewMode: (mode) => set({
  viewMode: mode,
  isCreatingNewAlbum: false,          // ← add this
  ...(mode !== 'albums' ? { activeAlbumCode: null } : {}),
  activeCollectionId: null,
}),
```

---

## Retired

`AlbumCreatorModal` (`src/components/Album/AlbumCreatorModal.jsx`) — all logic migrated into `NewAlbumCreator`. File can be deleted.

---

## Error Handling

- OPFS load failure: show empty state with "Could not load recordings" message.
- Upload error: left column shows error text + "Try again" button (retries from the beginning of upload) and "Cancel" button.
- No recordings found: show empty state (same as current `StepSelectRecordings` empty state).

---

## Out of Scope

- Editing an already-published album (title, tracks, cover) — not in this change.
- Drag-to-reorder on touch devices — falls back to ✕ + re-check pattern.
