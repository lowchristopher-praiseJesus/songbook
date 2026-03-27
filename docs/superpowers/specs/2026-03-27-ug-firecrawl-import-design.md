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
3. User types a song title or artist name and submits
4. App calls Firecrawl `/search` scoped to `ultimate-guitar.com` — returns up to 8 chord chart results
5. User selects a result
6. App calls Firecrawl `/scrape` on the selected URL, requesting markdown output
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

### Search Call

`POST https://api.firecrawl.dev/v1/search`

```json
{
  "query": "site:ultimate-guitar.com {userQuery} chords",
  "limit": 8
}
```

Header: `Authorization: Bearer {apiKey}`

Response items are filtered to URLs matching `ultimate-guitar.com/guitar-chords/` to exclude tabs, bass, and ukulele variants.

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

- **Title & artist**: extracted from the markdown H1 (`# Song Title Chords by Artist`)
- **Key**: defaults to `0` (C) — UG key metadata is unreliable; user can transpose after import using the existing TransposeControl

### Stage 2 — Chord Line Detection

A line is a "chord line" if every whitespace-delimited token matches:

```
/^[A-G][b#]?(maj|min|m|aug|dim|sus|add)?[0-9]*(\/[A-G][b#]?)?$/
```

### Stage 3 — Chord-Above-Lyrics to Inline Conversion

For each chord line followed by a non-chord lyric line:
- Record each chord token's column index in the chord line
- Walk the lyric string, inserting `[ChordName]` at the matching column position
- Pad the lyric with spaces if it is shorter than the chord line

A chord line with no following lyric line (pure instrumental passage) becomes a pure chord line: `[G]    [D]    [Em]`

### Stage 4 — Section Headers

Lines matching `[Verse 1]`, `## Chorus`, etc. are converted to `{c: Verse 1}`, `{c: Chorus}`.

### Output Shape

```js
{
  title: String,
  artist: String,
  key: 0,          // chromatic index, defaults to C
  content: String  // {c:} + [Chord] notation, identical to sbpParser output
}
```

Drops directly into `libraryStore.addSong()` — no changes to display, transpose, PDF export, or library store.

---

## Search UI (`UGSearchModal.jsx`)

Three internal states:

**Idle**
- Search input + Submit button
- Placeholder: "Song title or artist…"
- If no API key: inline message + link to Settings instead of search form

**Results**
- Up to 8 results, each showing title + artist
- Clicking a result transitions to Importing
- "Back" link returns to Idle

**Importing**
- Spinner with song title
- On success: close modal, select imported song, show toast "Imported: {title}"
- On error: inline error message, stay in modal

Reuses existing `Modal` and `Button` UI components. Triggered by a "Search Ultimate Guitar" button in the Sidebar below the existing Import button.

---

## Error Handling

Errors surface inline in the modal (not toasts) to preserve search context.

| Scenario | Message |
|---|---|
| No API key | "Add your Firecrawl API key in Settings to search Ultimate Guitar" |
| 401 Unauthorized | "Invalid API key — check Settings" |
| No results | "No chord charts found — try a different search" |
| Unparseable scrape | "Couldn't extract chords from this page — try another result" |
| Network / 5xx | "Connection failed — check your internet and try again" |

**Duplicate detection**: reuses the existing `onDuplicateCheck` flow from `useFileImport` — same skip/replace/keep-both modal. No retries on failure.

---

## What Does Not Change

- `sbpParser.js` — untouched
- `contentParser.js` — untouched
- `chordUtils.js` — untouched (transpose works on any `[Chord]` content)
- `libraryStore.js` — untouched (`addSong` already accepts any song object)
- All display components — untouched
- Routing — no new routes; feature lives entirely in a modal
