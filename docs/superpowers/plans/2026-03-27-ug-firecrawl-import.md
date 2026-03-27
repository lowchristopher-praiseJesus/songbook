# UG Firecrawl Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users search Ultimate Guitar from within the app, select a chord chart, and import it into the song library via the Firecrawl API.

**Architecture:** Pure frontend. User supplies their own Firecrawl API key (stored in localStorage). Two new lib modules (`firecrawlClient.js`, `ugParser.js`) and one new modal component (`UGSearchModal.jsx`). The parser converts UG's chord-above-lyrics markdown into the existing inline `[Chord]` notation and returns the canonical song shape already used by `libraryStore.addSongs()`. No new routes. No backend.

**Tech Stack:** React 18, Vitest, Tailwind CSS, Zustand. No new npm packages needed.

**Spec:** `docs/superpowers/specs/2026-03-27-ug-firecrawl-import-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/parser/contentParser.js` | Export `isChord()` (one line) |
| Modify | `src/lib/storage.js` | Add `getFirecrawlKey()` / `setFirecrawlKey()` |
| Create | `src/lib/ugImport/ugParser.js` | Markdown → canonical song shape |
| Create | `src/lib/ugImport/__tests__/ugParser.test.js` | Parser tests |
| Create | `src/lib/ugImport/firecrawlClient.js` | Fetch wrappers for `/search` and `/scrape` |
| Create | `src/lib/ugImport/__tests__/firecrawlClient.test.js` | URL-filter + error tests |
| Modify | `src/components/Settings/SettingsPanel.jsx` | Add Firecrawl API key field |
| Create | `src/components/UGImport/UGSearchModal.jsx` | Search modal (4 states) |
| Modify | `src/components/Sidebar/Sidebar.jsx` | Wire "Search UG" button + modal |

---

## Task 1: Export `isChord` and add Firecrawl key storage helpers

**Files:**
- Modify: `src/lib/parser/contentParser.js` (line 87)
- Modify: `src/lib/storage.js`

### Background

`isChord()` in `contentParser.js` is a private function — the UG parser needs to import it. We add `export` to it. We also add two thin localStorage helpers for the API key.

- [ ] **Step 1: Add `export` to `isChord` in `contentParser.js`**

Change line 87 from:
```js
function isChord(str) {
```
to:
```js
export function isChord(str) {
```

- [ ] **Step 2: Add key helpers to `storage.js`**

Add these two lines at the end of `src/lib/storage.js`:
```js
export const getFirecrawlKey = () => localStorage.getItem('songsheet_firecrawl_key') ?? ''
export const setFirecrawlKey = (key) => localStorage.setItem('songsheet_firecrawl_key', key)
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
npx vitest run
```
Expected: all existing tests pass (the `export` keyword on `isChord` is backwards-compatible).

- [ ] **Step 4: Commit**

```bash
git add src/lib/parser/contentParser.js src/lib/storage.js
git commit -m "feat: export isChord and add Firecrawl key storage helpers"
```

---

## Task 2: Implement `ugParser.js` with TDD

**Files:**
- Create: `src/lib/ugImport/__tests__/ugParser.test.js`
- Create: `src/lib/ugImport/ugParser.js`

### Background

`parseUGMarkdown(markdown, url)` takes the raw markdown string from a Firecrawl scrape and a URL string (used as a fallback for metadata), and returns the canonical song shape:

```js
{
  rawText: String,
  meta: { title, artist, key: 'C', keyIndex: 0, isMinor: false, usesFlats: false, capo },
  sections: Array   // from parseContent()
}
```

The algorithm processes lines in this order:
1. Extract title/artist from H1 (`# Song Chords by Artist`), or fall back to URL slug
2. Extract capo from any line matching `/capo[:\s]+(\d+)/i`
3. Skip lines until a section header or chord/lyric content starts (ignore markdown noise)
4. Convert section headers (`[Verse 1]`, `## Chorus`) to `{c: Verse 1}`, `{c: Chorus}`
5. Skip `[Tab]` sections until the next section header or end of content
6. Expand tabs (4-space stops) before measuring chord/lyric column positions
7. For chord-above-lyrics: pair each chord line with the following non-chord line, insert `[Chord]` tokens at matching character positions, pad lyric with spaces if shorter
8. Consecutive chord lines: first becomes a pure chord line `[G]    [D]`, then second is processed normally
9. Chord line with no following lyric: pure chord line
10. Call `parseContent(contentString)` to produce `sections`

A "chord line" = has ≥ 2 whitespace-delimited tokens and every token passes `isChord()`.

- [ ] **Step 1: Create test file with failing tests**

Create `src/lib/ugImport/__tests__/ugParser.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseUGMarkdown } from '../ugParser'

describe('parseUGMarkdown — metadata', () => {
  it('extracts title and artist from H1', () => {
    const md = '# Hotel California Chords by Eagles\n\n[Verse 1]\nAm  E7\nOn a dark desert highway'
    const song = parseUGMarkdown(md, 'https://ultimate-guitar.com/guitar-chords/eagles/hotel-california')
    expect(song.meta.title).toBe('Hotel California')
    expect(song.meta.artist).toBe('Eagles')
  })

  it('falls back to URL slug when H1 does not match', () => {
    const md = '## Some page\n\n[Verse 1]\nG  D\nHello world'
    const song = parseUGMarkdown(md, 'https://ultimate-guitar.com/guitar-chords/bob-dylan/blowin-in-the-wind')
    expect(song.meta.title).toBe('Blowin In The Wind')
    expect(song.meta.artist).toBe('')
  })

  it('extracts capo from content', () => {
    const md = '# Song Chords by Artist\nCapo: 3\n\n[Verse 1]\nG  D\nHello world'
    const song = parseUGMarkdown(md)
    expect(song.meta.capo).toBe(3)
  })

  it('defaults capo to 0 when not present', () => {
    const md = '# Song Chords by Artist\n\n[Verse 1]\nG  D\nHello'
    const song = parseUGMarkdown(md)
    expect(song.meta.capo).toBe(0)
  })

  it('defaults key to C / keyIndex 0', () => {
    const md = '# Song Chords by Artist\n\n[Verse 1]\nG  D\nHello'
    const song = parseUGMarkdown(md)
    expect(song.meta.key).toBe('C')
    expect(song.meta.keyIndex).toBe(0)
    expect(song.meta.isMinor).toBe(false)
    expect(song.meta.usesFlats).toBe(false)
  })
})

describe('parseUGMarkdown — section headers', () => {
  it('converts [Verse 1] to {c: Verse 1}', () => {
    const md = '[Verse 1]\nG  D\nHello world'
    const song = parseUGMarkdown(md)
    expect(song.sections[0].label).toBe('Verse 1')
  })

  it('converts [Chorus] to {c: Chorus}', () => {
    const md = '[Chorus]\nG  D\nSing along'
    const song = parseUGMarkdown(md)
    expect(song.sections[0].label).toBe('Chorus')
  })

  it('converts ## Bridge to {c: Bridge}', () => {
    const md = '## Bridge\nAm  G\nSomething'
    const song = parseUGMarkdown(md)
    expect(song.sections[0].label).toBe('Bridge')
  })
})

describe('parseUGMarkdown — chord-above-lyrics conversion', () => {
  it('inserts chords inline at matching column positions', () => {
    // chord line:  "Am              E7"   (E7 at col 16)
    // lyric line:  "On a dark desert highway"
    // merged:      "[Am]On a dark de[E7]sert highway"
    // position is the lyric-char index at insertion time, not the column:
    //   Am inserted before any lyric chars → position 0
    //   E7 inserted after "On a dark de" (12 chars) → position 12
    const md = '[Verse 1]\nAm              E7\nOn a dark desert highway'
    const song = parseUGMarkdown(md)
    const line = song.sections[0].lines[0]
    expect(line.chords[0].chord).toBe('Am')
    expect(line.chords[0].position).toBe(0)
    expect(line.chords[1].chord).toBe('E7')
    expect(line.chords[1].position).toBe(12)
  })

  it('pads lyric with spaces when shorter than chord line', () => {
    // chord line:  "G       D"   (D at col 8)
    // lyric line:  "Hi"          (only 2 chars)
    const md = '[Verse 1]\nG       D\nHi'
    const song = parseUGMarkdown(md)
    const line = song.sections[0].lines[0]
    expect(line.chords[0].chord).toBe('G')
    expect(line.chords[1].chord).toBe('D')
  })

  it('emits a pure chord line when chord line has no following lyric', () => {
    const md = '[Intro]\nG  D  Em  C'
    const song = parseUGMarkdown(md)
    const line = song.sections[0].lines[0]
    expect(line.type).toBe('chord')
    expect(line.chords.map(c => c.chord)).toEqual(['G', 'D', 'Em', 'C'])
  })

  it('emits first of consecutive chord lines as pure chord, processes second normally', () => {
    const md = '[Intro]\nG  D\nAm  F\nSomething'
    const song = parseUGMarkdown(md)
    // First chord line → pure chord
    expect(song.sections[0].lines[0].type).toBe('chord')
    // Second chord line paired with lyric
    expect(song.sections[0].lines[1].type).toBe('lyric')
    expect(song.sections[0].lines[1].chords[0].chord).toBe('Am')
  })
})

describe('parseUGMarkdown — [Tab] skip', () => {
  it('skips content between [Tab] and next section header', () => {
    const md = '[Verse 1]\nG  D\nHello world\n[Tab]\ne|--0--2--3--|\n[Chorus]\nG  D\nSing along'
    const song = parseUGMarkdown(md)
    expect(song.sections).toHaveLength(2)
    expect(song.sections[0].label).toBe('Verse 1')
    expect(song.sections[1].label).toBe('Chorus')
  })

  it('skips [Tab] content until end of content if no section header follows', () => {
    const md = '[Verse 1]\nG  D\nHello\n[Tab]\ne|--0--2--|'
    const song = parseUGMarkdown(md)
    expect(song.sections).toHaveLength(1)
    expect(song.sections[0].label).toBe('Verse 1')
  })
})

describe('parseUGMarkdown — output shape', () => {
  it('returns rawText string', () => {
    const md = '[Verse 1]\nG  D\nHello world'
    const song = parseUGMarkdown(md)
    expect(typeof song.rawText).toBe('string')
  })

  it('returns sections array from parseContent', () => {
    const md = '[Verse 1]\nG  D\nHello world'
    const song = parseUGMarkdown(md)
    expect(Array.isArray(song.sections)).toBe(true)
    expect(song.sections.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
npx vitest run src/lib/ugImport/__tests__/ugParser.test.js
```
Expected: all tests fail with "Cannot find module '../ugParser'"

- [ ] **Step 3: Create `src/lib/ugImport/ugParser.js`**

```js
import { isChord, parseContent } from '../parser/contentParser'

// Matches [Verse 1], [Chorus], [Bridge], etc. AND ## Verse, ## Chorus etc.
// Also matches [Tab] for skipping
const SECTION_HEADER_RE = /^\[([^\]]+)\]$|^##\s+(.+)$/

function isSectionHeader(line) {
  return SECTION_HEADER_RE.test(line.trim())
}

function toSectionHeader(line) {
  const trimmed = line.trim()
  const m = trimmed.match(SECTION_HEADER_RE)
  if (!m) return null
  const name = (m[1] ?? m[2]).trim()
  return `{c: ${name}}`
}

function isTabHeader(line) {
  return /^\[Tab\]$/i.test(line.trim())
}

// Expand tab characters to 4-space tab stops
function expandTabs(str) {
  let result = ''
  for (const ch of str) {
    if (ch === '\t') {
      result += ' '.repeat(4 - (result.length % 4))
    } else {
      result += ch
    }
  }
  return result
}

// A chord line has ≥2 whitespace-delimited tokens, all passing isChord()
function isChordLine(line) {
  const expanded = expandTabs(line)
  const tokens = expanded.trim().split(/\s+/).filter(Boolean)
  return tokens.length >= 2 && tokens.every(t => isChord(t))
}

// Merge a chord-above-lyrics pair into an inline [Chord] line
function mergeChordAboveLyric(chordLine, lyricLine) {
  const expandedChord = expandTabs(chordLine)
  const expandedLyric = expandTabs(lyricLine)

  // Collect {chord, pos} from chord line
  const chords = []
  const re = /\S+/g
  let m
  while ((m = re.exec(expandedChord)) !== null) {
    chords.push({ name: m[0], pos: m.index })
  }

  if (chords.length === 0) return expandedLyric.trimEnd()

  // Pad lyric so all chord positions are reachable
  const maxPos = chords[chords.length - 1].pos
  let lyric = expandedLyric.length > maxPos
    ? expandedLyric
    : expandedLyric.padEnd(maxPos + 1)

  // Insert [Chord] tokens by walking from right to left to avoid index shifts
  for (let i = chords.length - 1; i >= 0; i--) {
    const { name, pos } = chords[i]
    lyric = lyric.slice(0, pos) + `[${name}]` + lyric.slice(pos)
  }

  return lyric.trimEnd()
}

// Convert a chord line with no following lyric to [G]    [D] format
function toPureChordLine(chordLine) {
  const tokens = expandTabs(chordLine).trim().split(/\s+/).filter(Boolean)
  return tokens.map(t => `[${t}]`).join('    ')
}

// Slug → Title Case, e.g. "blowin-in-the-wind" → "Blowin In The Wind"
function slugToTitle(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Parse a Firecrawl markdown string from a UG chord chart page.
 * Returns the canonical song shape for libraryStore.addSongs().
 *
 * @param {string} markdown - Raw markdown from Firecrawl /scrape
 * @param {string} [url='']  - UG URL (used for slug fallback)
 */
export function parseUGMarkdown(markdown = '', url = '') {
  // --- Stage 1: Metadata ---
  const h1Match = markdown.match(/^#\s+(.+?)\s+[Cc]hords\s+by\s+(.+)$/m)
  let title, artist
  if (h1Match) {
    title = h1Match[1].trim()
    artist = h1Match[2].trim()
  } else {
    const slug = url.split('/').filter(Boolean).pop() ?? ''
    title = slugToTitle(slug) || 'Unknown'
    artist = ''
  }

  const capoMatch = markdown.match(/capo[:\s]+(\d+)/i)
  const capo = capoMatch ? parseInt(capoMatch[1], 10) : 0

  // --- Stage 2: Process lines ---
  const rawLines = markdown.split('\n')
  const contentLines = []  // lines to feed to chord conversion
  let inTab = false

  for (const line of rawLines) {
    const trimmed = line.trim()

    // Detect [Tab] header → start skipping
    if (isTabHeader(trimmed)) {
      inTab = true
      continue
    }

    // Any section header ends Tab-skip mode
    if (isSectionHeader(trimmed)) {
      inTab = false
      // [Tab] itself is handled above; other section headers become {c:}
      const header = toSectionHeader(trimmed)
      if (header) contentLines.push(header)
      continue
    }

    if (inTab) continue

    // Skip H1 line (metadata already extracted)
    if (trimmed.startsWith('# ')) continue

    // Skip markdown headings (##, ###) that aren't section headers
    // (already handled by isSectionHeader for ## patterns matching songs)
    if (trimmed.match(/^#{1,6}\s/)) continue

    // Skip capo line (metadata already extracted)
    if (/^capo[:\s]+\d+/i.test(trimmed)) continue

    contentLines.push(line)
  }

  // --- Stage 3: Chord-above-lyrics conversion ---
  const processedLines = []
  let i = 0
  while (i < contentLines.length) {
    const line = contentLines[i]

    // Section headers pass through as-is
    if (line.startsWith('{c:')) {
      processedLines.push(line)
      i++
      continue
    }

    if (isChordLine(line)) {
      const next = contentLines[i + 1]
      const nextIsContent = next !== undefined && !next.startsWith('{c:')

      if (nextIsContent && !isChordLine(next)) {
        // Chord + lyric pair
        processedLines.push(mergeChordAboveLyric(line, next))
        i += 2
      } else {
        // Pure chord line (no lyric follows, or next is also a chord line)
        processedLines.push(toPureChordLine(line))
        i++
      }
    } else {
      processedLines.push(line)
      i++
    }
  }

  const contentString = processedLines.join('\n')
  const sections = parseContent(contentString)

  return {
    rawText: contentString,
    meta: {
      title,
      artist,
      key: 'C',
      keyIndex: 0,
      isMinor: false,
      usesFlats: false,
      capo,
    },
    sections,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/ugImport/__tests__/ugParser.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ugImport/ugParser.js src/lib/ugImport/__tests__/ugParser.test.js
git commit -m "feat: add ugParser - converts UG markdown to inline chord notation"
```

---

## Task 3: Implement `firecrawlClient.js`

**Files:**
- Create: `src/lib/ugImport/firecrawlClient.js`
- Create: `src/lib/ugImport/__tests__/firecrawlClient.test.js`

### Background

Two functions:
- `searchUG(query, apiKey)` — calls Firecrawl `/search`, filters results to UG chord URLs, returns array of `{url, title, description}`
- `scrapeURL(url, apiKey)` — calls Firecrawl `/scrape` with `formats: ['markdown']`, returns the markdown string

Error contract:
- `401` response → throws `Error('UNAUTHORIZED')`
- Any other non-ok response or network error → throws `Error('NETWORK_ERROR')`

The URL filter accepts `ultimate-guitar.com/guitar-chords/` or `ultimate-guitar.com/chords/`.

- [ ] **Step 1: Write failing tests**

Create `src/lib/ugImport/__tests__/firecrawlClient.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchUG, scrapeURL } from '../firecrawlClient'

// Mock global fetch
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { vi.unstubAllGlobals() })

function mockFetch(status, body) {
  global.fetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('searchUG', () => {
  it('returns filtered chord-chart results', async () => {
    mockFetch(200, {
      data: [
        { url: 'https://ultimate-guitar.com/guitar-chords/eagles/hotel-california', title: 'Hotel California Chords by Eagles', description: 'Chords' },
        { url: 'https://ultimate-guitar.com/tabs/eagles/hotel-california-tab', title: 'Tab', description: 'tab' },
        { url: 'https://ultimate-guitar.com/chords/bob-dylan/blowing-in-the-wind', title: 'Blowin Chords', description: '' },
      ]
    })
    const results = await searchUG('hotel california', 'test-key')
    expect(results).toHaveLength(2)
    expect(results[0].url).toContain('guitar-chords')
    expect(results[1].url).toContain('/chords/')
  })

  it('sends correct query and auth header', async () => {
    mockFetch(200, { data: [] })
    await searchUG('amazing grace', 'my-api-key')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/search')
    expect(opts.headers['Authorization']).toBe('Bearer my-api-key')
    const body = JSON.parse(opts.body)
    expect(body.query).toContain('amazing grace')
    expect(body.query).toContain('site:ultimate-guitar.com')
  })

  it('throws UNAUTHORIZED on 401', async () => {
    mockFetch(401, {})
    await expect(searchUG('song', 'bad-key')).rejects.toThrow('UNAUTHORIZED')
  })

  it('throws NETWORK_ERROR on 500', async () => {
    mockFetch(500, {})
    await expect(searchUG('song', 'key')).rejects.toThrow('NETWORK_ERROR')
  })
})

describe('scrapeURL', () => {
  it('returns markdown from nested data.markdown shape', async () => {
    mockFetch(200, { data: { markdown: '# Song Chords by Artist\n\n[Verse]\nG  D\nHello' } })
    const md = await scrapeURL('https://ultimate-guitar.com/guitar-chords/foo', 'key')
    expect(md).toContain('# Song Chords by Artist')
  })

  it('returns markdown from top-level markdown shape', async () => {
    mockFetch(200, { markdown: '# Song Chords by Artist\n\n[Verse]\nG  D\nHello' })
    const md = await scrapeURL('https://ultimate-guitar.com/guitar-chords/foo', 'key')
    expect(md).toContain('# Song Chords by Artist')
  })

  it('sends correct URL and auth header', async () => {
    mockFetch(200, { data: { markdown: '' } })
    await scrapeURL('https://ultimate-guitar.com/guitar-chords/foo', 'my-key')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/scrape')
    expect(opts.headers['Authorization']).toBe('Bearer my-key')
    const body = JSON.parse(opts.body)
    expect(body.url).toBe('https://ultimate-guitar.com/guitar-chords/foo')
    expect(body.formats).toContain('markdown')
  })

  it('throws UNAUTHORIZED on 401', async () => {
    mockFetch(401, {})
    await expect(scrapeURL('https://ug.com/foo', 'bad')).rejects.toThrow('UNAUTHORIZED')
  })

  it('throws NETWORK_ERROR on 500', async () => {
    mockFetch(500, {})
    await expect(scrapeURL('https://ug.com/foo', 'key')).rejects.toThrow('NETWORK_ERROR')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/ugImport/__tests__/firecrawlClient.test.js
```
Expected: all fail with "Cannot find module"

- [ ] **Step 3: Create `src/lib/ugImport/firecrawlClient.js`**

```js
const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1'

// Accepts both /guitar-chords/ and /chords/ UG URL patterns
const UG_CHORD_URL_RE = /ultimate-guitar\.com\/(guitar-chords|chords)\//

async function firecrawlPost(endpoint, body, apiKey) {
  let res
  try {
    res = await fetch(`${FIRECRAWL_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('NETWORK_ERROR')
  }
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error('NETWORK_ERROR')
  return res.json()
}

/**
 * Search Ultimate Guitar for chord charts matching the query.
 * Returns up to 8 filtered results: [{ url, title, description }]
 */
export async function searchUG(query, apiKey) {
  const data = await firecrawlPost('/search', {
    query: `site:ultimate-guitar.com ${query} chords`,
    limit: 8,
  }, apiKey)
  return (data.data ?? []).filter(item => UG_CHORD_URL_RE.test(item.url))
}

/**
 * Scrape a UG chord chart URL and return the markdown content string.
 */
export async function scrapeURL(url, apiKey) {
  const data = await firecrawlPost('/scrape', {
    url,
    formats: ['markdown'],
  }, apiKey)
  return data.data?.markdown ?? data.markdown ?? ''
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/ugImport/__tests__/firecrawlClient.test.js
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ugImport/firecrawlClient.js src/lib/ugImport/__tests__/firecrawlClient.test.js
git commit -m "feat: add firecrawlClient - search and scrape wrappers"
```

---

## Task 4: Add Firecrawl API key field to SettingsPanel

**Files:**
- Modify: `src/components/Settings/SettingsPanel.jsx`

### Background

Add a "Firecrawl API Key" section to the Settings panel, between the Display toggle and the Storage stats section. Uses `getFirecrawlKey()`/`setFirecrawlKey()` from `storage.js`. Password input type with a show/hide toggle. No new props on `SettingsPanel`.

- [ ] **Step 1: Update `SettingsPanel.jsx`**

Add the import at the top:
```js
import { useState } from 'react'
import { getFirecrawlKey, setFirecrawlKey } from '../../lib/storage'
```

Note: `useEffect` is already imported — only add `useState` if not already present. Check the existing imports first; currently `useEffect` is imported but not `useState`. Add `useState` to the React import line.

Change line 1:
```js
// from:
import { useEffect } from 'react'
// to:
import { useEffect, useState } from 'react'
```

Add the import for storage helpers after the existing storage import (line 5):
```js
import { getStorageStats, getFirecrawlKey, setFirecrawlKey } from '../../lib/storage'
```

Inside the `SettingsPanel` function body, after the existing state/setup, add:
```js
const [firecrawlKey, setFirecrawlKeyState] = useState(getFirecrawlKey)
const [showKey, setShowKey] = useState(false)

function handleKeyChange(e) {
  setFirecrawlKeyState(e.target.value)
  setFirecrawlKey(e.target.value)
}
```

Add the new section JSX between the `{/* Display */}` block (ending at line ~70) and `{/* Storage stats */}` (line ~72):

```jsx
{/* Firecrawl API Key */}
<div className="mb-6">
  <label className="block text-sm font-medium mb-2 dark:text-gray-300">
    Firecrawl API Key
    <span className="ml-1 text-xs font-normal text-gray-400">(for UG search)</span>
  </label>
  <div className="flex gap-2">
    <input
      type={showKey ? 'text' : 'password'}
      value={firecrawlKey}
      onChange={handleKeyChange}
      placeholder="fc-…"
      className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
        bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
        focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
    <button
      type="button"
      onClick={() => setShowKey(v => !v)}
      className="px-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      aria-label={showKey ? 'Hide key' : 'Show key'}
    >
      {showKey ? 'Hide' : 'Show'}
    </button>
  </div>
  <p className="mt-1 text-xs text-gray-400">
    Stored locally. Get a key at firecrawl.dev.
  </p>
</div>
```

- [ ] **Step 2: Run the app and verify the field appears in Settings**

```bash
npm run dev
```

Open the app, click the ⚙️ gear icon, verify the Firecrawl API Key field is visible, type a value, close and reopen Settings to confirm it persisted.

- [ ] **Step 3: Commit**

```bash
git add src/components/Settings/SettingsPanel.jsx
git commit -m "feat: add Firecrawl API key field to Settings panel"
```

---

## Task 5: Implement `UGSearchModal.jsx`

**Files:**
- Create: `src/components/UGImport/UGSearchModal.jsx`

### Background

A modal with four internal states: `idle`, `searching`, `results`, `importing`. Manages its own duplicate-check dialog state. Reuses existing `Modal` and `Button` components. Props: `{ isOpen, onClose, onSongSelect, onImportSuccess, onAddToast }`.

When no API key is set, shows a text-only message directing the user to Settings. The "Settings" reference is plain text — Settings is accessible via the ⚙️ gear in the app header.

- [ ] **Step 1: Create `src/components/UGImport/UGSearchModal.jsx`**

```jsx
import { useState, useCallback } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { getFirecrawlKey } from '../../lib/storage'
import { searchUG, scrapeURL } from '../../lib/ugImport/firecrawlClient'
import { parseUGMarkdown } from '../../lib/ugImport/ugParser'

function errorMessage(err) {
  if (err?.message === 'UNAUTHORIZED') return 'Invalid API key — check Settings'
  return 'Connection failed — check your internet and try again'
}

export function UGSearchModal({ isOpen, onClose, onSongSelect, onImportSuccess, onAddToast }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('idle')  // idle | searching | results | importing
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [duplicateState, setDuplicateState] = useState(null)

  const addSongs = useLibraryStore(s => s.addSongs)
  const replaceSong = useLibraryStore(s => s.replaceSong)

  // resetAndClose is defined as a plain function (not useCallback) — it is only
  // called from event handlers and async flows, never from render, so no dep-array concern.
  function resetAndClose() {
    setQuery('')
    setStatus('idle')
    setResults([])
    setError(null)
    setDuplicateState(null)
    onClose()
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    const apiKey = getFirecrawlKey()
    setStatus('searching')
    setError(null)
    try {
      const items = await searchUG(query.trim(), apiKey)
      setResults(items)
      setStatus('results')
    } catch (err) {
      setStatus('idle')
      setError(errorMessage(err))
    }
  }

  function onDuplicateCheck(title) {
    return new Promise(resolve => setDuplicateState({ title, resolve }))
  }

  function resolveDuplicate(resolution) {
    const { resolve } = duplicateState
    setDuplicateState(null)
    resolve(resolution)
  }

  const handleSelect = useCallback(async (result) => {
    const apiKey = getFirecrawlKey()
    setStatus('importing')
    setError(null)
    try {
      const markdown = await scrapeURL(result.url, apiKey)
      const song = parseUGMarkdown(markdown, result.url)

      if (!song.sections.length) {
        setStatus('results')
        setError("Couldn't extract chords from this page — try another result")
        return
      }

      // Duplicate check
      const index = useLibraryStore.getState().index
      const duplicate = index.find(e => e.title === song.meta.title)
      if (duplicate) {
        const resolution = await onDuplicateCheck(song.meta.title)
        if (resolution === 'replace') {
          replaceSong(duplicate.id, song)
          onSongSelect(duplicate.id)
          onImportSuccess?.()
          onAddToast(`Imported: ${song.meta.title}`, 'success')
          resetAndClose()
          return
        } else if (resolution === 'skip') {
          setStatus('results')
          return
        }
        // 'keep-both' falls through to addSongs — new UUID is assigned
      }

      try {
        addSongs([song])
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          setStatus('results')
          setError('Storage full — delete some songs before importing')
          return
        }
        throw e
      }

      const newEntry = useLibraryStore.getState().index.find(e => e.title === song.meta.title)
      if (newEntry) onSongSelect(newEntry.id)
      onImportSuccess?.()
      onAddToast(`Imported: ${song.meta.title}`, 'success')
      resetAndClose()
    } catch (err) {
      setStatus('results')
      setError(errorMessage(err))
    }
  }, [addSongs, replaceSong, onSongSelect, onImportSuccess, onAddToast, onClose])

  const apiKey = getFirecrawlKey()
  const noKey = !apiKey

  return (
    <Modal isOpen={isOpen} title="Search Ultimate Guitar" onClose={resetAndClose}>
      {noKey ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Add your Firecrawl API key in <strong>Settings</strong> (⚙️ top right) to search Ultimate Guitar.
        </p>
      ) : (
        <>
          {status === 'idle' && (
            <form onSubmit={handleSearch} className="space-y-3">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Song title or artist…"
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" variant="primary" className="w-full" disabled={!query.trim()}>
                Search
              </Button>
            </form>
          )}

          {status === 'searching' && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="text-sm">Searching…</span>
            </div>
          )}

          {status === 'results' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => { setStatus('idle'); setError(null) }}
                className="text-sm text-indigo-500 hover:underline"
              >
                ← Back
              </button>
              {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
              {results.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                  No chord charts found — try a different search
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {results.map(r => {
                    // Strip " Chords ver. N" and " Chords by Artist" from display title
                    const displayTitle = (r.title ?? '')
                      .replace(/\s+[Cc]hords?\s+ver\.\s*\d+.*$/g, '')
                      .replace(/\s+[Cc]hords?\s+by\s+.*$/g, '')
                      .trim()
                    return (
                      <li key={r.url}>
                        <button
                          type="button"
                          onClick={() => handleSelect(r)}
                          className="w-full text-left px-3 py-2 rounded-lg
                            hover:bg-gray-100 dark:hover:bg-gray-700
                            text-sm text-gray-900 dark:text-gray-100"
                        >
                          <div className="font-medium">{displayTitle || r.title}</div>
                          {r.description && (
                            <div className="text-xs text-gray-400 truncate mt-0.5">{r.description}</div>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {status === 'importing' && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="text-sm">Importing…</span>
            </div>
          )}
        </>
      )}

      {/* Duplicate resolution */}
      {duplicateState && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            "{duplicateState.title}" already exists. What would you like to do?
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="danger" onClick={() => resolveDuplicate('replace')}>Replace</Button>
            <Button variant="secondary" onClick={() => resolveDuplicate('keep-both')}>Keep Both</Button>
            <Button variant="ghost" onClick={() => resolveDuplicate('skip')}>Skip</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
```

- [ ] **Step 2: Smoke-test in browser**

```bash
npm run dev
```

The modal won't be triggered yet (Sidebar not wired), but verify the app still loads without console errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/UGImport/UGSearchModal.jsx
git commit -m "feat: add UGSearchModal with 4-state search/import flow"
```

---

## Task 6: Wire `UGSearchModal` into `Sidebar.jsx`

**Files:**
- Modify: `src/components/Sidebar/Sidebar.jsx`

### Background

Add a "Search Ultimate Guitar" button below the existing Import button. The button opens the `UGSearchModal`. The Sidebar already receives `onAddToast`, `onSongSelect`, and `onImportSuccess` from App — pass them directly to the modal.

- [ ] **Step 1: Update `Sidebar.jsx`**

Add the import at the top of the existing imports:
```js
import { useState } from 'react'
import { UGSearchModal } from '../UGImport/UGSearchModal'
```

Note: `useState` is already imported in Sidebar.jsx — do not add a duplicate. Just add the `UGSearchModal` import.

Inside `Sidebar`, add a state variable for the modal after the existing `useState` calls:
```js
const [ugModalOpen, setUgModalOpen] = useState(false)
```

In the JSX, below the existing Import `<div className="p-3 border-t ...">` block (which contains the Import button and file input), add the UG search button and modal. The full import section should become:

```jsx
{/* Import / Search buttons */}
<div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
  <Button
    variant="primary"
    className="w-full"
    onClick={() => fileInputRef.current?.click()}
  >
    + Import
  </Button>
  <Button
    variant="secondary"
    className="w-full"
    onClick={() => setUgModalOpen(true)}
  >
    Search Ultimate Guitar
  </Button>
  <input
    ref={fileInputRef}
    type="file"
    accept=""
    multiple
    className="hidden"
    onChange={handleFileInput}
  />
</div>
```

Add the modal below the existing `<Modal>` (duplicate resolution modal), just before the closing `</aside>`:

```jsx
<UGSearchModal
  isOpen={ugModalOpen}
  onClose={() => setUgModalOpen(false)}
  onSongSelect={onSongSelect}
  onImportSuccess={onImportSuccess}
  onAddToast={onAddToast}
/>
```

- [ ] **Step 2: Test the full flow in browser**

```bash
npm run dev
```

1. Open the app — confirm "Search Ultimate Guitar" button appears in the sidebar
2. Click it without an API key set — confirm the "Add your Firecrawl API key in Settings" message shows
3. Open Settings (⚙️), enter a Firecrawl API key, close Settings
4. Open the UG search modal again — confirm the search form appears
5. Search for a song — confirm results appear
6. Select a result — confirm it imports and appears in the library, toast shows

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar/Sidebar.jsx
git commit -m "feat: wire UGSearchModal into Sidebar with Search UG button"
```

---

## Task 7: Push to remote

- [ ] **Push all commits**

```bash
git push
```
