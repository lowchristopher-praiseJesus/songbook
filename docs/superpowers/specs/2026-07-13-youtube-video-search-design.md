# In-App YouTube Search & Playback

**Date:** 2026-07-13
**Status:** Approved for implementation

## Context

The song header currently has a "YouTube" link (added in an earlier change) that opens `youtube.com/results?search_query=...` in a new browser tab, pre-filled with the song's title and artist. That gets the user to YouTube but drops them out of the app to find and play a reference recording.

This spec replaces that raw-link behavior (when possible) with an in-app search: a modal listing candidate videos — title, thumbnail — that the user picks from, and the chosen video plays inline via an embedded player, without ever leaving SongSheet. The choice is remembered per song, so reopening later jumps straight to playback.

## Approach: Firecrawl-Backed Search, Keyless Thumbnails/Embed, Song-Level Persistence

**Decisions (from brainstorming):**

- **Search rides on the existing Firecrawl integration** — the same BYO API key already used for Ultimate Guitar search (`src/lib/ugImport/firecrawlClient.js`). A site-restricted query (`site:youtube.com/watch {title} {artist}`) returns `{ url, title, description }` results, mirroring how `searchUG` restricts to `site:ultimate-guitar.com`. No new API key, no new Settings field, no new Worker route.
- **Thumbnails and playback need no API key at all.** Once a video ID is extracted from a result URL, `https://i.ytimg.com/vi/{id}/hqdefault.jpg` is a public, keyless thumbnail, and `https://www.youtube.com/embed/{id}` is a public, keyless embeddable player iframe.
- **Graceful fallback with no Firecrawl key:** the YouTube button keeps today's exact behavior (open `youtube.com/results?...` in a new tab) when no Firecrawl key is configured. The in-app modal is only reachable when a key is present. This mirrors how UG search itself degrades when there's no key.
- **The chosen video is remembered per song**, stored as `meta.youtubeVideoId` on the song object — plain JSON, so it survives localStorage automatically. Reopening the modal for a song that already has a pick jumps straight to the embedded player instead of a fresh search, with a "Search again" escape hatch.
- **Persistence travels through Share/export/conductor sync, but not the Community pool.** `meta.youtubeVideoId` gets one field added to `exportSbp.js`'s output and `sbpParser.js`'s parsing, so it round-trips through `.sbp` export and every path that treats the song as an opaque blob (Share R2 upload, conductor sync). The Community pool (`songbook-worker/src/routes/community.ts`) has a fixed D1 schema with no free-form metadata column — carrying the pick through Community publish/import is out of scope for this change and would be its own follow-up (migration + route changes).
- **No new error/retry machinery beyond what UG search already has.** Same error copy, same states.

---

## Client Changes

### 1. `src/lib/youtubeImport/youtubeClient.js` (new)

Mirrors the shape of `firecrawlClient.js`.

```js
export async function searchYoutube(query, apiKey) {
  // firecrawlSearch(`site:youtube.com/watch ${query}`, apiKey)
  // filter to URLs matching /[?&]v=([\w-]{11})/
  // extract videoId, strip trailing " - YouTube" from title (case-insensitive)
  // dedupe by videoId, keep first occurrence
  // return [{ videoId, title, url }]
}
```

- Reuses `firecrawlSearch` from `../ugImport/firecrawlClient` — no duplicated fetch/auth logic.
- Same error propagation as `searchUG` (`UNAUTHORIZED`, `NETWORK_ERROR` bubble up from `firecrawlPost`).

### 2. `src/components/YoutubeSearch/YoutubeSearchModal.jsx` (new)

State machine mirrors `UGSearchModal`: `idle | searching | results | playing`.

Props: `{ isOpen, onClose, title, artist, initialVideoId, onVideoPicked }`

- **On open:**
  - `initialVideoId` present → start in `playing`, embed that video immediately. A "Search again" link resets to `idle`.
  - `initialVideoId` absent → start in `idle`, search box pre-filled with `${title} ${artist}`.trim() (editable), a "Search" button.
- **`idle` → `searching` → `results`:** calls `searchYoutube(query, getFirecrawlKey())` (key read the same way `UGSearchModal` reads it — directly via `getFirecrawlKey()`, no prop). Results render as a list: thumbnail (`i.ytimg.com/vi/{id}/hqdefault.jpg`) + title, same row/hover styling as `UGSearchModal`'s result rows minus the badge/preview-button (single source, no badges needed).
- **Selecting a result:** moves to `playing` with that `videoId`, and calls `onVideoPicked(videoId)` immediately (persist-on-pick, not persist-on-close).
- **`playing`:** renders
  ```jsx
  <iframe
    title="YouTube video player"
    src={`https://www.youtube.com/embed/${videoId}`}
    allow="autoplay; encrypted-media; picture-in-picture"
    allowFullScreen
    className="w-full aspect-video rounded-lg"
  />
  ```
  plus a "← Search again" link (back to `idle`, clears prior results) and a small "Open on YouTube ↗" link (`https://www.youtube.com/watch?v={videoId}`, `target="_blank"`) underneath, as a fallback for videos with embedding disabled by the uploader.
- **Errors:** identical copy to `UGSearchModal`'s `errorMessage()` — "Invalid API key — check Settings" on 401, "Connection failed — check your internet and try again" on network failure. Empty result set → "No videos found — try a different search."
- Uses the shared `Modal` component, `title="Search YouTube"`.

### 3. `src/store/libraryStore.js`

New lightweight action, following the existing partial-update pattern (see `replaceSong`/similar around line 515):

```js
setSongYoutubeVideo(id, videoId) {
  const song = loadSong(id)
  if (!song) return
  const updated = { ...song, meta: { ...song.meta, youtubeVideoId: videoId } }
  saveSong(updated)
  if (get().activeSongId === id) set({ activeSong: updated })
}
```

Deliberately does not touch `sections`/`rawText`/the index — this is a metadata-only patch, unlike the heavier `updateSong` used by the song editor.

### 4. `src/components/SongList/SongHeader.jsx`

The YouTube control branches on Firecrawl key presence (read the same way `UGSearchModal` does):

```jsx
{getFirecrawlKey() ? (
  <button type="button" onClick={() => setYtModalOpen(true)} className="/* same classes as today */">
    <PlayCircleIcon className="w-3.5 h-3.5" /> YouTube
  </button>
) : (
  <a href={youtubeSearchUrl(meta.title, meta.artist)} target="_blank" rel="noopener noreferrer" className="/* unchanged */">
    <PlayCircleIcon className="w-3.5 h-3.5" /> YouTube
  </a>
)}
```

New prop: `onYoutubeVideoPicked(videoId)` — called from the modal's `onVideoPicked`, forwarded up so the store write happens in the container (`SongList.jsx`), keeping `SongHeader` presentational and consistent with how `onEdit`/`onExportPdf`/`onAnnotationsToggle` are already wired.

`YoutubeSearchModal` is rendered by `SongHeader` (same way `RecordingsPanel` is owned elsewhere but the trigger lives in the header) with `initialVideoId={meta.youtubeVideoId}`.

### 5. `src/components/SongList/SongList.jsx`

Adds `useLibraryStore` import (not currently used in this file) to select `setSongYoutubeVideo`, and passes:

```jsx
onYoutubeVideoPicked={videoId => setSongYoutubeVideo(song.id, videoId)}
```

to `SongHeader`.

### 6. `src/lib/exportSbp.js`

In `songToSbpJson()`'s returned object, add:

```js
YoutubeVideoId: meta.youtubeVideoId ?? null,
```

(PascalCase, matching the stylistic convention of other genuine-schema fields in this object like `Capo`/`KeyShift`/`Copyright`/`NotesText`. Real SongBook Pro will simply ignore this unrecognized key on import — standard forward-compatible JSON behavior, same assumption already implicit in how this export embeds `appKeyIndex`.)

### 7. `src/lib/parser/sbpParser.js`

When parsing an incoming `.sbp` song entry, map `s.YoutubeVideoId` back to `meta.youtubeVideoId` (present only on songs previously exported by this app; absent/`undefined` on real-world `.sbp` files, which is the correct default — "no pick yet").

---

## Data Flow Summary

```
CLICK "YOUTUBE" — NO FIRECRAWL KEY:
  unchanged: opens youtube.com/results?search_query=... in a new tab

CLICK "YOUTUBE" — FIRECRAWL KEY PRESENT, NO PRIOR PICK:
  modal opens in "idle" → query pre-filled with title + artist → Search
  → Firecrawl site:youtube.com/watch search → results list (thumbnail + title)
  → click a result → embeds that video, persists meta.youtubeVideoId immediately

CLICK "YOUTUBE" — FIRECRAWL KEY PRESENT, PRIOR PICK EXISTS:
  modal opens directly in "playing" with the saved video
  → "Search again" available to replace the pick

PERSISTENCE:
  meta.youtubeVideoId round-trips through:
    - localStorage (plain JSON.stringify(song), already generic)
    - .sbp export (exportSbp.js writes YoutubeVideoId; sbpParser.js reads it back)
    - Share upload/download (opaque blob built via exportSongsAsSbp)
    - conductor sync (same opaque-blob path)
  meta.youtubeVideoId does NOT travel through:
    - Community pool publish/import (fixed D1 schema, no metadata column — future work)
```

---

## Files to Create / Modify

| File | Change |
|---|---|
| `src/lib/youtubeImport/youtubeClient.js` | New: `searchYoutube(query, apiKey)` |
| `src/components/YoutubeSearch/YoutubeSearchModal.jsx` | New: search/results/playback modal |
| `src/store/libraryStore.js` | New action: `setSongYoutubeVideo(id, videoId)` |
| `src/components/SongList/SongHeader.jsx` | YouTube control branches on Firecrawl key; renders `YoutubeSearchModal`; new `onYoutubeVideoPicked` prop |
| `src/components/SongList/SongList.jsx` | Wires `setSongYoutubeVideo` from the store into `onYoutubeVideoPicked` |
| `src/lib/exportSbp.js` | `songToSbpJson()` writes `YoutubeVideoId` |
| `src/lib/parser/sbpParser.js` | Reads `YoutubeVideoId` back into `meta.youtubeVideoId` |

No changes needed to `songbook-worker` — everything here uses the existing Firecrawl passthrough and opaque-blob Share/sync paths.

---

## Verification

1. **No Firecrawl key:** clicking "YouTube" still opens a new tab to `youtube.com/results?search_query=...`, unchanged from today.
2. **Firecrawl key present, fresh song:** clicking "YouTube" opens the modal in `idle` with the search box pre-filled; searching returns a result list with thumbnails; clicking a result switches to an embedded, playing video inline.
3. **Picking a video persists it:** after picking, close and reopen the song (or reselect it from the sidebar) — the header's YouTube button, when clicked, jumps straight to `playing` with the same video, no search step.
4. **Search again:** from `playing`, "Search again" returns to `idle` with the query pre-filled again; picking a different result overwrites the stored `youtubeVideoId`.
5. **No results:** searching a nonsense query shows "No videos found — try a different search."
6. **401 / network error:** surfaced with the same copy as `UGSearchModal`.
7. **Export round-trip:** export a song with a picked video via `.sbp`, re-import it (in this app) — `meta.youtubeVideoId` is preserved and the modal opens straight to `playing` again.
8. **Share round-trip:** share a collection containing a song with a picked video, import it on another device/session — the pick survives.
9. **Community pool unaffected:** publishing a song with a picked video to the Community pool, then having someone else import it, does not carry the video pick (expected — out of scope).
10. **Existing UG search / SongHeader tests still pass** — no regression to the unrelated Firecrawl-based UG search flow or the header's other controls (transpose, capo, Edit, Performance, Recordings).
