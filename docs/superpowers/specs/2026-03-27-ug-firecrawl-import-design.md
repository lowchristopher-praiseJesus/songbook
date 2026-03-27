# Design: Ultimate Guitar Import via Firecrawl

**Date:** 2026-03-27
**Status:** Approved

---

## Overview

Add the ability to search Ultimate Guitar (UG) from within the app and import chord charts directly into the song library. The feature uses the Firecrawl API (Search + Markdown Scrape) to fetch and parse UG chord charts, converting them into the existing inline `[Chord]` notation used throughout the app.

The app remains fully frontend — no backend is added. The user supplies their own Firecrawl API key, stored in localStorage.

---

## User Workflow

1. User clicks **"Search Ultimate Guitar"** in the Sidebar
2. If no API key is set, a prompt directs them to Settings
3. User types a song title or artist name and submits (empty queries are blocked at the UI — Submit is disabled until at least one non-whitespace character is entered)
4. App transitions to **Searching** state (spinner, input disabled) and calls Firecrawl `/search` scoped to `ultimate-guitar.com` — returns up to 8 chord chart results
5. App transitions to **Results** state; user selects a result
6. App transitions to **Importing** state and calls Firecrawl `/scrape` on the selected URL, requesting markdown output
7. `ugParser.js` converts the markdown to a song object in the existing library schema
8. Song is added to the library; modal closes; song is selected; toast confirms import

---

## New Files

```
src/lib/ugImport/
  firecrawlClient.js     — fetch wrappers for /search and /scrape
  ugParser.js            — markdown → song object

src/components/UGImport/
  UGSearchModal.jsx      — modal: search input, results list, import action
```

## Modified Files

```
src/lib/storage.js                          — add getFirecrawlKey() / setFirecrawlKey()
src/lib/parser/contentParser.js             — export isChord() (one-line change)
src/components/Settings/SettingsPanel.jsx   — add Firecrawl API key field
src/components/Sidebar/Sidebar.jsx          — add "Search Ultimate Guitar" button
```

---

## Firecrawl Integration

### API Key Storage

Stored in localStorage under `songsheet_firecrawl_key`. Two helpers added to `storage.js`:

```js
export const getFirecrawlKey = () => localStorage.getItem('songsheet_firecrawl_key') ?? ''
export const setFirecrawlKey = (key) => localStorage.setItem('songsheet_firecrawl_key', key)
```

The Settings panel adds a password-type input for this key (no SDK — plain `fetch` only).

**Security note:** The API key is stored in localStorage and transmitted via `Authorization: Bearer` in a client-side fetch. This is a deliberate trade-off for a no-backend app — the key is visible in browser DevTools and accessible to page scripts. Users are informed to treat the key as they would any browser-stored credential.

**CORS:** `api.firecrawl.dev` permits cross-origin requests from browser clients. No proxy is required.

### Search Call

`POST https://api.firecrawl.dev/v1/search`

```json
{
  "query": "site:ultimate-guitar.com {userQuery} chords",
  "limit": 8
}
```

Header: `Authorization: Bearer {apiKey}`

Response items are filtered to URLs matching `ultimate-guitar.com/guitar-chords/` **or** `ultimate-guitar.com/chords/` to exclude tabs, bass, and ukulele variants while accepting both UG URL path formats for chord charts.

### Scrape Call

`POST https://api.firecrawl.dev/v1/scrape`

```json
{
  "url": "{selectedUrl}",
  "formats": ["markdown"]
}
```

Header: `Authorization: Bearer {apiKey}`

Returns `{ markdown: "..." }` — passed directly to `ugParser.js`.

---

## Markdown Parsing (`ugParser.js`)

### Stage 1 — Metadata Extraction

- **Title & artist**: extracted from the markdown H1 using the pattern `# {Title} Chords by {Artist}` — regex: `/^#\s+(.+?)\s+[Cc]hords\s+by\s+(.+)$/m`. If the pattern does not match, title falls back to the URL slug (last path segment, hyphens replaced with spaces, title-cased) and artist defaults to `''`.
- **Capo**: if the markdown contains a line matching `/capo[:\s]+(\d+)/i`, parse the digit into `meta.capo`; otherwise `meta.capo = 0`.
- **Key**: defaults to `meta.keyIndex = 0` (`meta.key = 'C'`) — UG key metadata is unreliable; user can transpose after import using the existing TransposeControl.

### Stage 2 — Chord Line Detection

Delegates to the **existing `isChord()` function in `contentParser.js`** (which will be exported as part of this feature — see Modified Files). A line is classified as a chord line if it contains at least two whitespace-delimited tokens and every token satisfies `isChord(token)`. Requiring at least two tokens prevents false positives on single English words that coincidentally match a chord name (e.g. a lyric line beginning with "Am" or "Em").

Lines containing parenthetical annotations like `G  (x4)` will be rejected as chord lines because `(x4)` fails `isChord()` — this is intentional; such lines are treated as lyric text.

`[Tab]` sections on UG (tablature, not chords) are detected by a `[Tab]` header. Skipping continues until the next recognised section header (a line matching the section header pattern defined in Stage 3) or end of content, whichever comes first. Content between the `[Tab]` header and the end-of-skip point is discarded entirely.

### Stage 3 — Processing Order

Section headers **must be converted to `{c:}` notation before content is passed to `parseContent()`**, to prevent bracket notation like `[Verse 1]` from being mis-parsed as chord tokens.

Processing order within `ugParser.js`:
1. Strip capo line
2. Convert section headers to `{c:}` notation
3. Run chord-above-lyrics → inline `[Chord]` conversion
4. Assemble the content string
5. Call `parseContent(contentString)` from `contentParser.js` to produce `sections`

Recognised section header patterns: `[Verse]`, `[Verse 1]`, `[Chorus]`, `[Pre-Chorus]`, `[Bridge]`, `[Intro]`, `[Outro]`, `[Instrumental]`, `[Solo]`, `## Verse`, `## Chorus`, etc. The conversion strips the enclosing `[]` or `##` and trims whitespace.

### Stage 4 — Chord-Above-Lyrics to Inline Conversion

For each chord line followed by a non-chord lyric line:
- Record each chord token's **character index** (UTF-16 code unit offset, consistent with JavaScript's `string.length` and array indexing) in the chord line
- Walk the lyric string, inserting `[ChordName]` at the matching character index position
- Pad the lyric with ASCII spaces if it is shorter than the chord line
- Expand tab characters to spaces (4-space tab stops) before measuring column positions in both chord and lyric lines

A chord line with no following lyric line (pure instrumental passage) becomes a pure chord line: `[G]    [D]    [Em]`

When a chord line is followed immediately by another chord line (two consecutive chord-only lines, common in instrumental passages), the first is emitted as a pure chord line without merging, then the second is processed independently by the same rules.

**Known limitation:** visual alignment of chords over non-ASCII lyrics may be imprecise due to variable-width glyphs. The inline `[Chord]` notation is unambiguous regardless of visual alignment.

### Output Shape

`ugParser.js` returns the **canonical song shape** expected by `libraryStore.addSongs()`:

```js
{
  rawText: String,          // reconstructed content string
  meta: {
    title: String,
    artist: String,
    key: 'C',               // string key name, default 'C'
    keyIndex: 0,            // chromatic index 0–11, default 0
    isMinor: false,
    usesFlats: false,
    capo: Number,           // from page content, default 0
  },
  sections: Array,          // result of parseContent(contentString)
}
```

This shape is identical to what `sbpParser.js` returns and drops directly into `libraryStore.addSongs()` with no changes to the store, display, transpose, or PDF export.

**Tests:** `ugParser.js` test file lives at `src/lib/ugImport/__tests__/ugParser.test.js`. Representative cases to cover: H1 match, H1 no-match (URL slug fallback), capo extraction, chord-above-lyrics alignment, pure chord line, consecutive chord lines, `[Tab]` section skip, section header conversion.

---

## Search UI (`UGSearchModal.jsx`)

Four internal states:

**Idle**
- Search input + Submit button (Submit disabled until input has at least one non-whitespace character)
- Placeholder: "Song title or artist…"
- If no API key: inline message + link to Settings instead of search form

**Searching**
- Spinner with "Searching…" label
- Search input disabled; no cancel

**Results**
- Up to 8 results, each showing title + artist (version strings like "ver. 2" stripped from display title, but the original UG title is used as `meta.title` on import so users can identify the source)
- Clicking a result transitions to Importing
- "Back" link returns to Idle

**Importing**
- Spinner with song title
- On success: close modal, select imported song, show toast "Imported: {title}"
- On error: inline error message, stay in modal

Reuses existing `Modal` and `Button` UI components. Triggered by a "Search Ultimate Guitar" button in the Sidebar below the existing Import button.

**`UGSearchModal` prop interface:**

| Prop | Type | Description |
|---|---|---|
| `isOpen` | boolean | Controls modal visibility |
| `onClose` | function | Called when modal is dismissed |
| `onSongSelect` | function | Called with the imported song's id after successful import |
| `onImportSuccess` | function | Called after successful import (closes mobile sidebar) |
| `onAddToast` | function | `(message, type)` — delegates to parent toast system |

`SettingsPanel`'s existing prop signature is unchanged — the Firecrawl key field reads/writes via `getFirecrawlKey()`/`setFirecrawlKey()` from `storage.js` directly, requiring no new props.

### Duplicate Detection

`UGSearchModal.jsx` manages its own duplicate dialog state (a `useState` holding `{ title, resolve }` or `null`), mirroring the pattern already used in `Sidebar.jsx` and `MainContent.jsx`. When `libraryStore.addSongs()` detects a duplicate, the modal renders the same duplicate-choice dialog (Replace / Keep Both / Skip). The `onDuplicateCheck` callback is not shared from `useFileImport` — the modal owns its duplicate state independently.

Duplicate lookup: before calling `addSongs()`, check `libraryStore.getState().index.find(e => e.title === parsedSong.meta.title)` — case-sensitive exact match, consistent with `useFileImport`. If a match is found, call `onDuplicateCheck(parsedSong.meta.title)` and await the resolution before proceeding.

On import success, call the Sidebar's `onImportSuccess` prop (passed into the modal) so the mobile sidebar closes after a successful UG import, consistent with `.sbp` import behaviour.

---

## Error Handling

Errors surface inline in the modal (not toasts) to preserve search context.

| Scenario | Message |
|---|---|
| No API key | "Add your Firecrawl API key in Settings to search Ultimate Guitar" |
| Empty search | Submit button disabled — no API call made |
| 401 Unauthorized | "Invalid API key — check Settings" |
| No results | "No chord charts found — try a different search" |
| Unparseable scrape | "Couldn't extract chords from this page — try another result" |
| Network / 5xx | "Connection failed — check your internet and try again" |
| CORS error | Surfaces as network error — same message as above |
| Storage quota exceeded | "Storage full — delete some songs before importing" |

No retries on failure.

---

## What Does Not Change

- `sbpParser.js` — untouched
- `contentParser.js` — `isChord()` is exported (one-line addition); no other changes
- `chordUtils.js` — untouched (transpose works on any `[Chord]` content)
- `libraryStore.js` — untouched (`addSong` already accepts the canonical song shape)
- All display components — untouched
- Routing — no new routes; feature lives entirely in a modal
