# SongSheet App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a browser-based React SPA that imports `.sbp` (SongBook Pro) files, parses them, displays them as chord charts, and persists them in localStorage.

**Architecture:** Vite + React 18 SPA with Zustand for global state. The `.sbp` format is a ZIP archive (`PK` magic bytes) containing `dataFile.txt` (version line + JSON) and `dataFile.hash`. Song content uses `[Chord]` inline notation and `{c: Section}` section markers. All data persisted in localStorage; no backend required.

**Tech Stack:** React 18, Vite, Tailwind CSS (class dark mode), Zustand, React Router v6, JSZip, uuid, Vitest + @testing-library/react

---

## Key Discovery: Real `.sbp` Format

Before coding, understand the actual file format from the sample `El_Shaddai.sbp`:

```
.sbp = ZIP archive
  └── dataFile.txt
        Line 1: "1.0"  (version string)
        Line 2+: JSON → { songs: [...], sets: [...], folders: [...] }
  └── dataFile.hash
        MD5 hash string
```

**Song JSON fields:**
```json
{
  "Id": 43,
  "name": "El Shaddai",
  "author": "Amy Grant",
  "key": 3,
  "KeyShift": 2,
  "Capo": 0,
  "timeSig": "",
  "TempoInt": 0,
  "Copyright": "",
  "content": "{c: Chorus}\nEl Shad[Dm]dai, ...",
  "hash": "...",
  "subTitle": "",
  "_tags": "[]",
  "_folders": "[]"
}
```

**Content notation:**
- `{c: Section Name}` → section header
- `[Chord]` inline within lyric text → chord at that position
- Pure chord lines: `[Dm]     [G]    [C]` (no lyric text)

**Key field** is a chromatic index: 0=C, 1=C#/Db, 2=D, 3=Eb, 4=E, 5=F, 6=F#/Gb, 7=G, 8=Ab, 9=A, 10=Bb, 11=B

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json` (via npm create vite)
- Create: `tailwind.config.js`
- Create: `vite.config.js`
- Create: `src/main.jsx`
- Create: `src/App.jsx`

**Step 1: Initialize Vite project**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook
npm create vite@latest . -- --template react
```

Expected: Vite project files created.

**Step 2: Install dependencies**

```bash
npm install
npm install zustand react-router-dom uuid jszip
npm install -D tailwindcss postcss autoprefixer vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npx tailwindcss init -p
```

**Step 3: Configure Tailwind** — edit `tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
}
```

**Step 4: Add Tailwind directives** — replace `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 5: Configure Vitest** — add to `vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
```

**Step 6: Create test setup** — `src/test/setup.js`:

```js
import '@testing-library/jest-dom'
```

**Step 7: Add test script** — in `package.json` scripts:

```json
"test": "vitest",
"test:ui": "vitest --ui"
```

**Step 8: Create folder structure**

```bash
mkdir -p src/components/Sidebar
mkdir -p src/components/SongSheet
mkdir -p src/components/PerformanceMode
mkdir -p src/components/Settings
mkdir -p src/components/UI
mkdir -p src/hooks
mkdir -p src/lib/parser
mkdir -p src/store
mkdir -p src/test
```

**Step 9: Verify scaffold runs**

```bash
npm run dev
```

Expected: Vite dev server starts at http://localhost:5173.

**Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Vite + React + Tailwind + Zustand project"
```

---

## Task 2: SBP Parser — ZIP + JSON Extraction

**Files:**
- Create: `src/lib/parser/sbpParser.js`
- Create: `src/lib/parser/__tests__/sbpParser.test.js`

### 2a: Write the failing tests first

**`src/lib/parser/__tests__/sbpParser.test.js`:**

```js
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parseSbpFile } from '../sbpParser'

// Helper: create a mock .sbp zip buffer in memory
async function makeMockSbp(songs) {
  const zip = new JSZip()
  const json = JSON.stringify({ songs, sets: [], folders: [] })
  zip.file('dataFile.txt', `1.0\n${json}`)
  zip.file('dataFile.hash', 'abc123')
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('parseSbpFile', () => {
  it('extracts song name and author from zip', async () => {
    const buf = await makeMockSbp([{
      Id: 1, name: 'Test Song', author: 'Test Artist',
      key: 7, Capo: 0, TempoInt: 120, timeSig: '4/4',
      Copyright: '', content: '{c: Verse 1}\nHello [G]world', KeyShift: 0
    }])
    const songs = await parseSbpFile(buf)
    expect(songs).toHaveLength(1)
    expect(songs[0].meta.title).toBe('Test Song')
    expect(songs[0].meta.artist).toBe('Test Artist')
  })

  it('maps key index 7 to "G"', async () => {
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 7, Capo: 0,
      TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0
    }])
    const songs = await parseSbpFile(buf)
    expect(songs[0].meta.key).toBe('G')
  })

  it('parses capo and tempo', async () => {
    const buf = await makeMockSbp([{
      Id: 1, name: 'Song', author: '', key: 0, Capo: 3,
      TempoInt: 88, timeSig: '3/4', Copyright: 'c 2020', content: '', KeyShift: 0
    }])
    const songs = await parseSbpFile(buf)
    expect(songs[0].meta.capo).toBe(3)
    expect(songs[0].meta.tempo).toBe(88)
    expect(songs[0].meta.timeSignature).toBe('3/4')
    expect(songs[0].meta.copyright).toBe('c 2020')
  })

  it('returns empty array for zip with no songs', async () => {
    const buf = await makeMockSbp([])
    const songs = await parseSbpFile(buf)
    expect(songs).toHaveLength(0)
  })

  it('throws on non-zip input', async () => {
    const buf = new TextEncoder().encode('not a zip file').buffer
    await expect(parseSbpFile(buf)).rejects.toThrow()
  })
})
```

**Step 1: Run tests to verify they fail**

```bash
npm test src/lib/parser/__tests__/sbpParser.test.js
```

Expected: All 5 tests FAIL — "parseSbpFile not defined"

**Step 2: Implement `src/lib/parser/sbpParser.js`**

```js
import JSZip from 'jszip'
import { parseContent } from './contentParser'

const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const FLAT_KEYS = new Set([3, 5, 8, 10]) // Eb, F, Ab, Bb — use flat notation

/**
 * Parse one or more songs from an ArrayBuffer containing a .sbp ZIP file.
 * Returns an array of Song objects (may contain multiple songs per file).
 */
export async function parseSbpFile(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)

  const dataFile = zip.file('dataFile.txt')
  if (!dataFile) throw new Error('dataFile.txt not found in .sbp archive')

  const text = await dataFile.async('string')
  const lines = text.split('\n')

  // First line is version string, rest is JSON
  const jsonText = lines.slice(1).join('\n').trim()
  const data = JSON.parse(jsonText)

  if (!Array.isArray(data.songs)) return []

  return data.songs
    .filter(s => !s.Deleted)
    .map(s => songFromJson(s))
}

function songFromJson(s) {
  const keyIndex = typeof s.key === 'number' ? s.key : 0
  const usesFlats = FLAT_KEYS.has(keyIndex)

  return {
    // id and importedAt are assigned by caller
    rawText: s.content ?? '',
    meta: {
      title: s.name ?? 'Untitled',
      artist: s.author ?? undefined,
      key: KEY_NAMES[keyIndex] ?? 'C',
      keyIndex,
      usesFlats,
      capo: s.Capo ?? 0,
      tempo: s.TempoInt > 0 ? s.TempoInt : undefined,
      timeSignature: s.timeSig || undefined,
      copyright: s.Copyright || undefined,
      ccli: s.ccli ?? undefined,
      subTitle: s.subTitle || undefined,
    },
    sections: parseContent(s.content ?? ''),
  }
}
```

**Step 3: Run tests to verify they pass**

```bash
npm test src/lib/parser/__tests__/sbpParser.test.js
```

Expected: All 5 PASS.

**Step 4: Commit**

```bash
git add src/lib/parser/sbpParser.js src/lib/parser/__tests__/sbpParser.test.js
git commit -m "feat: implement SBP ZIP parser with JSON extraction"
```

---

## Task 3: Content Parser — Sections & Inline Chords

**Files:**
- Create: `src/lib/parser/contentParser.js`
- Create: `src/lib/parser/__tests__/contentParser.test.js`

The `content` field uses:
- `{c: Section Name}` → start a new named section
- `[Chord]` inline in lyric text → chord embedded in the lyric
- Pure chord lines: `[Dm]     [G]    [C]` (line is only chords + spaces)

**Step 1: Write the failing tests**

**`src/lib/parser/__tests__/contentParser.test.js`:**

```js
import { describe, it, expect } from 'vitest'
import { parseContent } from '../contentParser'

describe('parseContent', () => {
  it('parses a simple section with chords inline', () => {
    const content = '{c: Verse 1}\nEl Shad[Dm]dai, El Shad[G]dai'
    const sections = parseContent(content)
    expect(sections).toHaveLength(1)
    expect(sections[0].label).toBe('Verse 1')
    expect(sections[0].lines).toHaveLength(1)
    expect(sections[0].lines[0].type).toBe('lyric')
    expect(sections[0].lines[0].content).toBe('El Shaddai, El Shaddai')
    expect(sections[0].lines[0].chords).toEqual([
      { chord: 'Dm', position: 7 },
      { chord: 'G', position: 18 },
    ])
  })

  it('parses a pure chord line', () => {
    const content = '{c: Intro}\n[Dm]     [G]    [C]'
    const sections = parseContent(content)
    expect(sections[0].lines[0].type).toBe('chord')
    expect(sections[0].lines[0].chords).toHaveLength(3)
    expect(sections[0].lines[0].chords[0].chord).toBe('Dm')
  })

  it('handles blank lines as blank type', () => {
    const content = '{c: Verse 1}\nHello [G]world\n\nNext line'
    const sections = parseContent(content)
    expect(sections[0].lines[1].type).toBe('blank')
  })

  it('parses multiple sections', () => {
    const content = '{c: Verse 1}\nLine one\n{c: Chorus}\nLine two'
    const sections = parseContent(content)
    expect(sections).toHaveLength(2)
    expect(sections[0].label).toBe('Verse 1')
    expect(sections[1].label).toBe('Chorus')
  })

  it('returns default section for content without section markers', () => {
    const sections = parseContent('Just some lyrics')
    expect(sections).toHaveLength(1)
    expect(sections[0].label).toBe('')
    expect(sections[0].lines[0].content).toBe('Just some lyrics')
  })

  it('handles empty content', () => {
    expect(parseContent('')).toEqual([])
    expect(parseContent(null)).toEqual([])
  })

  it('chord positions are correct after removing bracket notation', () => {
    // "[G]Hello [Am]world" → lyric "Hello world" with G at 0, Am at 6
    const content = '{c: Test}\n[G]Hello [Am]world'
    const sections = parseContent(content)
    const line = sections[0].lines[0]
    expect(line.content).toBe('Hello world')
    expect(line.chords[0]).toEqual({ chord: 'G', position: 0 })
    expect(line.chords[1]).toEqual({ chord: 'Am', position: 6 })
  })
})
```

**Step 2: Run to verify failures**

```bash
npm test src/lib/parser/__tests__/contentParser.test.js
```

Expected: All 7 FAIL.

**Step 3: Implement `src/lib/parser/contentParser.js`**

```js
const SECTION_RE = /^\{c:\s*(.+?)\s*\}$/

/**
 * Parse SongBook Pro inline-chord content into structured sections.
 * Format: {c: Section Name} headers, [Chord] inline with lyrics.
 */
export function parseContent(content) {
  if (!content) return []

  const lines = content.split('\n')
  const sections = []
  let current = null

  for (const rawLine of lines) {
    const sectionMatch = rawLine.match(SECTION_RE)

    if (sectionMatch) {
      current = { label: sectionMatch[1], lines: [] }
      sections.push(current)
      continue
    }

    if (!current) {
      // Content before first section marker
      current = { label: '', lines: [] }
      sections.push(current)
    }

    if (rawLine.trim() === '') {
      current.lines.push({ type: 'blank', content: '' })
      continue
    }

    const parsedLine = parseLine(rawLine)
    current.lines.push(parsedLine)
  }

  return sections
}

/**
 * Parse a single line, extracting inline [Chord] tokens and computing positions.
 */
function parseLine(rawLine) {
  const chords = []
  let lyric = ''
  let i = 0

  while (i < rawLine.length) {
    if (rawLine[i] === '[') {
      const close = rawLine.indexOf(']', i)
      if (close === -1) {
        lyric += rawLine[i++]
        continue
      }
      const chord = rawLine.slice(i + 1, close)
      if (isChord(chord)) {
        chords.push({ chord, position: lyric.length })
        i = close + 1
      } else {
        lyric += rawLine[i++]
      }
    } else {
      lyric += rawLine[i++]
    }
  }

  // Determine line type: if all content was chords and only spaces remain, it's a chord line
  const isPureChordLine = lyric.trim() === '' && chords.length > 0

  return {
    type: isPureChordLine ? 'chord' : 'lyric',
    content: isPureChordLine ? rawLine : lyric,
    chords,
  }
}

const CHORD_RE = /^[A-G][b#]?(?:maj|min|m|M|aug|dim|sus|add)?[0-9]?(?:\/[A-G][b#]?)?$/

function isChord(str) {
  return CHORD_RE.test(str.trim())
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test src/lib/parser/__tests__/contentParser.test.js
```

Expected: All 7 PASS.

**Step 5: Commit**

```bash
git add src/lib/parser/contentParser.js src/lib/parser/__tests__/contentParser.test.js
git commit -m "feat: implement content parser for inline chord notation"
```

---

## Task 4: Chord Transposition Utilities

**Files:**
- Create: `src/lib/parser/chordUtils.js`
- Create: `src/lib/parser/__tests__/chordUtils.test.js`

**Step 1: Write the failing tests**

**`src/lib/parser/__tests__/chordUtils.test.js`:**

```js
import { describe, it, expect } from 'vitest'
import { transposeChord, transposeSections } from '../chordUtils'

describe('transposeChord', () => {
  it('transposes G up 2 semitones to A', () => {
    expect(transposeChord('G', 2, false)).toBe('A')
  })

  it('transposes G down 1 semitone to F#', () => {
    expect(transposeChord('G', -1, false)).toBe('F#')
  })

  it('uses flat notation when usesFlats is true', () => {
    expect(transposeChord('G', -1, true)).toBe('Gb')
  })

  it('wraps around 12 semitones', () => {
    expect(transposeChord('B', 1, false)).toBe('C')
    expect(transposeChord('C', -1, true)).toBe('B')
  })

  it('transposes chord with suffix: Am7 up 2 → Bm7', () => {
    expect(transposeChord('Am7', 2, false)).toBe('Bm7')
  })

  it('transposes slash chord: G/B up 2 → A/C#', () => {
    expect(transposeChord('G/B', 2, false)).toBe('A/C#')
  })

  it('handles flat root: Bb up 2 → C', () => {
    expect(transposeChord('Bb', 2, true)).toBe('C')
  })

  it('returns 0 delta unchanged', () => {
    expect(transposeChord('Em', 0, false)).toBe('Em')
  })
})

describe('transposeSections', () => {
  it('applies delta to all chord tokens in all sections', () => {
    const sections = [{
      label: 'Verse',
      lines: [
        { type: 'lyric', content: 'Hello world', chords: [{ chord: 'G', position: 0 }] },
        { type: 'blank', content: '', chords: [] },
      ]
    }]
    const result = transposeSections(sections, 2, false)
    expect(result[0].lines[0].chords[0].chord).toBe('A')
  })
})
```

**Step 2: Run to verify failures**

```bash
npm test src/lib/parser/__tests__/chordUtils.test.js
```

Expected: All 8+1 FAIL.

**Step 3: Implement `src/lib/parser/chordUtils.js`**

```js
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Normalize enharmonic equivalents to index
const NOTE_INDEX = {}
SHARPS.forEach((n, i) => { NOTE_INDEX[n] = i })
FLATS.forEach((n, i) => { NOTE_INDEX[n] = i })

/**
 * Transpose a chord string by `delta` semitones.
 * @param {string} chord - e.g. "Am7", "G/B", "F#"
 * @param {number} delta - semitones to shift (-11 to +11)
 * @param {boolean} usesFlats - use flat notation for accidentals
 */
export function transposeChord(chord, delta, usesFlats) {
  if (delta === 0) return chord

  const scale = usesFlats ? FLATS : SHARPS

  // Split slash chord: "G/B" → root="G", slash="B"
  const slashIdx = chord.indexOf('/')
  if (slashIdx !== -1) {
    const root = chord.slice(0, slashIdx)
    const bass = chord.slice(slashIdx + 1)
    return transposeNote(root, delta, scale) + '/' + transposeNote(bass, delta, scale)
  }

  // Extract root note (1-2 chars) and suffix
  const rootMatch = chord.match(/^([A-G][b#]?)(.*)$/)
  if (!rootMatch) return chord
  const [, root, suffix] = rootMatch
  return transposeNote(root, delta, scale) + suffix
}

function transposeNote(note, delta, scale) {
  const idx = NOTE_INDEX[note]
  if (idx === undefined) return note
  return scale[((idx + delta) % 12 + 12) % 12]
}

/**
 * Return new sections array with all chord tokens transposed.
 * Does not mutate the original.
 */
export function transposeSections(sections, delta, usesFlats) {
  if (delta === 0) return sections
  return sections.map(section => ({
    ...section,
    lines: section.lines.map(line => {
      if (!line.chords || line.chords.length === 0) return line
      return {
        ...line,
        chords: line.chords.map(ct => ({
          ...ct,
          chord: transposeChord(ct.chord, delta, usesFlats),
        })),
      }
    }),
  }))
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test src/lib/parser/__tests__/chordUtils.test.js
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/parser/chordUtils.js src/lib/parser/__tests__/chordUtils.test.js
git commit -m "feat: implement chord transposition utilities"
```

---

## Task 5: localStorage Storage Layer

**Files:**
- Create: `src/lib/storage.js`
- Create: `src/lib/__tests__/storage.test.js`

**Step 1: Write the failing tests**

**`src/lib/__tests__/storage.test.js`:**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { saveSong, loadSong, deleteSong, loadIndex, saveIndex } from '../storage'

beforeEach(() => {
  localStorage.clear()
})

describe('storage', () => {
  const mockSong = {
    id: 'test-uuid-1',
    importedAt: '2026-01-01T00:00:00Z',
    rawText: 'content',
    meta: { title: 'Test Song', artist: 'Test Artist' },
    sections: [],
  }

  it('saves and loads a song', () => {
    saveSong(mockSong)
    const loaded = loadSong('test-uuid-1')
    expect(loaded).toEqual(mockSong)
  })

  it('returns null for missing song', () => {
    expect(loadSong('nonexistent')).toBeNull()
  })

  it('deletes a song', () => {
    saveSong(mockSong)
    deleteSong('test-uuid-1')
    expect(loadSong('test-uuid-1')).toBeNull()
  })

  it('saves and loads index', () => {
    const index = [{ id: 'a', title: 'Song A', artist: 'Artist', importedAt: '' }]
    saveIndex(index)
    expect(loadIndex()).toEqual(index)
  })

  it('returns empty array for missing index', () => {
    expect(loadIndex()).toEqual([])
  })
})
```

**Step 2: Run to verify failures**

```bash
npm test src/lib/__tests__/storage.test.js
```

Expected: All 5 FAIL.

**Step 3: Implement `src/lib/storage.js`**

```js
const PREFIX = 'songsheet_song_'
const INDEX_KEY = 'songsheet_index'
const THEME_KEY = 'songsheet_theme'
const LAST_SONG_KEY = 'songsheet_last_song_id'

export function saveSong(song) {
  try {
    localStorage.setItem(PREFIX + song.id, JSON.stringify(song))
    return true
  } catch (e) {
    if (e.name === 'QuotaExceededError') throw e
    console.error('saveSong failed:', e)
    return false
  }
}

export function loadSong(id) {
  const raw = localStorage.getItem(PREFIX + id)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function deleteSong(id) {
  localStorage.removeItem(PREFIX + id)
}

export function loadIndex() {
  const raw = localStorage.getItem(INDEX_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function saveIndex(index) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

export function getTheme() {
  return localStorage.getItem(THEME_KEY)
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
}

export function getLastSongId() {
  return localStorage.getItem(LAST_SONG_KEY)
}

export function setLastSongId(id) {
  localStorage.setItem(LAST_SONG_KEY, id)
}

export function getStorageStats() {
  let used = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('songsheet_')) {
      used += (localStorage.getItem(key) || '').length * 2 // UTF-16 = 2 bytes/char
    }
  }
  return { usedBytes: used, limitBytes: 5 * 1024 * 1024 }
}
```

**Step 4: Run tests**

```bash
npm test src/lib/__tests__/storage.test.js
```

Expected: All 5 PASS.

**Step 5: Commit**

```bash
git add src/lib/storage.js src/lib/__tests__/storage.test.js
git commit -m "feat: implement localStorage storage layer"
```

---

## Task 6: Zustand Library Store

**Files:**
- Create: `src/store/libraryStore.js`

No unit tests for the store itself (it integrates with localStorage and React); tested via component tests later.

**Step 1: Implement `src/store/libraryStore.js`**

```js
import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import {
  saveSong, loadSong, deleteSong as deleteFromStorage,
  loadIndex, saveIndex, getLastSongId, setLastSongId
} from '../lib/storage'

export const useLibraryStore = create((set, get) => ({
  // State
  index: [],           // [{id, title, artist, importedAt}]
  activeSongId: null,
  activeSong: null,    // Full song object

  // Initialize from localStorage on app start
  init() {
    const index = loadIndex()
    const lastId = getLastSongId()
    const activeSong = lastId ? loadSong(lastId) : null

    // Repair: remove index entries with missing data
    const validIndex = index.filter(entry => {
      const exists = loadSong(entry.id) !== null
      return exists
    })
    if (validIndex.length !== index.length) saveIndex(validIndex)

    set({
      index: validIndex,
      activeSongId: activeSong ? activeSong.id : null,
      activeSong,
    })
  },

  // Add one or more songs
  addSongs(songs) {
    const currentIndex = get().index
    const newIndex = [...currentIndex]

    for (const song of songs) {
      song.id = song.id || uuidv4()
      song.importedAt = song.importedAt || new Date().toISOString()
      saveSong(song)
      const existing = newIndex.findIndex(e => e.id === song.id)
      const entry = { id: song.id, title: song.meta.title, artist: song.meta.artist ?? '', importedAt: song.importedAt }
      if (existing >= 0) newIndex[existing] = entry
      else newIndex.push(entry)
    }

    newIndex.sort((a, b) => a.title.localeCompare(b.title))
    saveIndex(newIndex)
    set({ index: newIndex })
  },

  selectSong(id) {
    const song = loadSong(id)
    if (!song) return
    setLastSongId(id)
    set({ activeSongId: id, activeSong: song })
  },

  deleteSong(id) {
    deleteFromStorage(id)
    const newIndex = get().index.filter(e => e.id !== id)
    saveIndex(newIndex)

    const wasActive = get().activeSongId === id
    set({
      index: newIndex,
      activeSongId: wasActive ? null : get().activeSongId,
      activeSong: wasActive ? null : get().activeSong,
    })
  },

  // Replace a song (used for duplicate handling — "overwrite")
  replaceSong(id, newSong) {
    deleteFromStorage(id)
    const newIndex = get().index.filter(e => e.id !== id)
    set({ index: newIndex })
    get().addSongs([{ ...newSong, id }])
  },
}))
```

**Step 2: Commit**

```bash
git add src/store/libraryStore.js
git commit -m "feat: implement Zustand library store with localStorage sync"
```

---

## Task 7: Custom Hooks

**Files:**
- Create: `src/hooks/useLocalStorage.js`
- Create: `src/hooks/useTranspose.js`
- Create: `src/hooks/useDropZone.js`
- Create: `src/hooks/useFileImport.js`

### 7a: useLocalStorage

```js
// src/hooks/useLocalStorage.js
import { useState, useCallback } from 'react'

export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? JSON.parse(raw) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const set = useCallback((newValue) => {
    setValue(newValue)
    try {
      localStorage.setItem(key, JSON.stringify(newValue))
    } catch (e) {
      console.warn('useLocalStorage write failed:', e)
    }
  }, [key])

  return [value, set]
}
```

### 7b: useTranspose

```js
// src/hooks/useTranspose.js
import { useState, useMemo } from 'react'
import { transposeSections } from '../lib/parser/chordUtils'

export function useTranspose(sections, usesFlats) {
  const [delta, setDelta] = useState(0)

  const transposedSections = useMemo(
    () => transposeSections(sections ?? [], delta, usesFlats ?? false),
    [sections, delta, usesFlats]
  )

  return {
    delta,
    transposedSections,
    transposeUp: () => setDelta(d => d + 1),
    transposeDown: () => setDelta(d => d - 1),
    reset: () => setDelta(0),
  }
}
```

### 7c: useDropZone

```js
// src/hooks/useDropZone.js
import { useState, useCallback } from 'react'

export function useDropZone(onFiles) {
  const [isDragging, setIsDragging] = useState(false)

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.sbp'))
    if (files.length > 0) onFiles(files)
  }, [onFiles])

  return { isDragging, onDragOver, onDragLeave, onDrop }
}
```

### 7d: useFileImport

```js
// src/hooks/useFileImport.js
import { useCallback } from 'react'
import { parseSbpFile } from '../lib/parser/sbpParser'
import { useLibraryStore } from '../store/libraryStore'

export function useFileImport({ onError, onDuplicateCheck }) {
  const addSongs = useLibraryStore(s => s.addSongs)
  const index = useLibraryStore(s => s.index)

  const importFiles = useCallback(async (files) => {
    for (const file of files) {
      if (!file.name.endsWith('.sbp')) {
        onError(`"${file.name}" is not a .sbp file`)
        continue
      }
      try {
        const buf = await file.arrayBuffer()
        const songs = await parseSbpFile(buf)

        for (const song of songs) {
          const duplicate = index.find(e => e.title === song.meta.title)
          if (duplicate) {
            // Let caller handle duplicate resolution
            const shouldReplace = await onDuplicateCheck(song.meta.title)
            if (shouldReplace === 'replace') {
              song.id = duplicate.id
            } else if (shouldReplace === 'skip') {
              continue
            }
            // 'keep-both' falls through with new id
          }
          addSongs([song])
        }
      } catch (e) {
        console.error('Import error:', e)
        onError(`Could not read "${file.name}". It may be corrupted or use an unsupported format.`)
      }
    }
  }, [addSongs, index, onError, onDuplicateCheck])

  return { importFiles }
}
```

**Step 1: Commit all hooks**

```bash
git add src/hooks/
git commit -m "feat: implement useLocalStorage, useTranspose, useDropZone, useFileImport hooks"
```

---

## Task 8: UI Primitives

**Files:**
- Create: `src/components/UI/Toast.jsx` + `src/components/UI/useToast.js`
- Create: `src/components/UI/Modal.jsx`
- Create: `src/components/UI/Button.jsx`

### 8a: Toast

```jsx
// src/components/UI/useToast.js
import { useState, useCallback } from 'react'

export function useToast() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'error') => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  return { toasts, addToast }
}
```

```jsx
// src/components/UI/Toast.jsx
export function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm
            ${t.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
```

### 8b: Modal

```jsx
// src/components/UI/Modal.jsx
export function Modal({ isOpen, title, children, onClose }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-semibold mb-4 dark:text-white">{title}</h2>
        {children}
      </div>
    </div>
  )
}
```

### 8c: Button

```jsx
// src/components/UI/Button.jsx
export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2'
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 focus:ring-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 focus:ring-gray-400',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
```

**Step 1: Commit UI primitives**

```bash
git add src/components/UI/
git commit -m "feat: add Toast, Modal, and Button UI primitives"
```

---

## Task 9: App Shell, Theme & Router

**Files:**
- Create: `src/contexts/ThemeContext.jsx`
- Modify: `src/App.jsx`
- Modify: `src/main.jsx`

### 9a: ThemeContext

```jsx
// src/contexts/ThemeContext.jsx
import { createContext, useContext, useEffect } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  const [theme, setTheme] = useLocalStorage('songsheet_theme', systemPreference)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
```

### 9b: App.jsx (shell)

```jsx
// src/App.jsx
import { useEffect, useState } from 'react'
import { ThemeProvider } from './contexts/ThemeContext'
import { useLibraryStore } from './store/libraryStore'
import { Sidebar } from './components/Sidebar/Sidebar'
import { MainContent } from './components/SongSheet/MainContent'
import { ToastContainer } from './components/UI/Toast'
import { useToast } from './components/UI/useToast'

export default function App() {
  const init = useLibraryStore(s => s.init)
  const { toasts, addToast } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => { init() }, [init])

  return (
    <ThemeProvider>
      <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* Top Nav */}
        <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            <span className="font-bold text-lg">🎵 SongSheet</span>
          </div>
        </header>
        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar isOpen={sidebarOpen} onAddToast={addToast} />
          <MainContent onAddToast={addToast} />
        </div>
      </div>
      <ToastContainer toasts={toasts} />
    </ThemeProvider>
  )
}
```

### 9c: main.jsx

```jsx
// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

**Step 1: Commit app shell**

```bash
git add src/contexts/ src/App.jsx src/main.jsx
git commit -m "feat: add app shell with theme provider and layout"
```

---

## Task 10: Sidebar Component

**Files:**
- Create: `src/components/Sidebar/Sidebar.jsx`
- Create: `src/components/Sidebar/SongListItem.jsx`

```jsx
// src/components/Sidebar/SongListItem.jsx
import { useLibraryStore } from '../../store/libraryStore'

export function SongListItem({ entry }) {
  const selectSong = useLibraryStore(s => s.selectSong)
  const deleteSong = useLibraryStore(s => s.deleteSong)
  const activeSongId = useLibraryStore(s => s.activeSongId)
  const isActive = activeSongId === entry.id

  function handleDelete(e) {
    e.stopPropagation()
    if (window.confirm(`Delete "${entry.title}"?`)) {
      deleteSong(entry.id)
    }
  }

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => selectSong(entry.id)}
      onKeyDown={e => e.key === 'Enter' && selectSong(entry.id)}
      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer group
        ${isActive
          ? 'bg-indigo-600 text-white'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{entry.title}</div>
        {entry.artist && (
          <div className={`text-xs truncate ${isActive ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>
            {entry.artist}
          </div>
        )}
      </div>
      <button
        onClick={handleDelete}
        aria-label={`Delete ${entry.title}`}
        className={`ml-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity
          ${isActive ? 'hover:bg-indigo-700' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
      >
        🗑
      </button>
    </li>
  )
}
```

```jsx
// src/components/Sidebar/Sidebar.jsx
import { useState, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useFileImport } from '../../hooks/useFileImport'
import { SongListItem } from './SongListItem'
import { Button } from '../UI/Button'

export function Sidebar({ isOpen, onAddToast }) {
  const [query, setQuery] = useState('')
  const [duplicateState, setDuplicateState] = useState(null)
  const fileInputRef = useRef()
  const index = useLibraryStore(s => s.index)

  // Resolve duplicate via a promise-based modal
  async function onDuplicateCheck(title) {
    return new Promise(resolve => setDuplicateState({ title, resolve }))
  }

  const { importFiles } = useFileImport({
    onError: msg => onAddToast(msg, 'error'),
    onDuplicateCheck,
  })

  const filtered = query
    ? index.filter(e =>
        e.title.toLowerCase().includes(query.toLowerCase()) ||
        (e.artist ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : index

  function handleFileInput(e) {
    importFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  return (
    <aside
      className={`${isOpen ? 'w-64' : 'hidden'} md:flex flex-col
        border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0`}
    >
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          placeholder="Search songs..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {filtered.map(entry => (
          <SongListItem key={entry.id} entry={entry} />
        ))}
        {filtered.length === 0 && (
          <li className="text-center text-sm text-gray-400 py-8">
            {query ? 'No matches' : 'No songs yet'}
          </li>
        )}
      </ul>
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant="primary"
          className="w-full"
          onClick={() => fileInputRef.current.click()}
        >
          + Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sbp"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Duplicate resolution modal */}
      {duplicateState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-semibold mb-2 dark:text-white">Duplicate Song</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              A song titled "{duplicateState.title}" already exists. What would you like to do?
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => { setDuplicateState(null); duplicateState.resolve('replace') }}>Replace</Button>
              <Button variant="secondary" onClick={() => { setDuplicateState(null); duplicateState.resolve('keep-both') }}>Keep Both</Button>
              <Button variant="ghost" onClick={() => { setDuplicateState(null); duplicateState.resolve('skip') }}>Skip</Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
```

**Step 1: Commit sidebar**

```bash
git add src/components/Sidebar/
git commit -m "feat: implement sidebar with search, song list, and import button"
```

---

## Task 11: Song Sheet Components

**Files:**
- Create: `src/components/SongSheet/MainContent.jsx`
- Create: `src/components/SongSheet/EmptyState.jsx`
- Create: `src/components/SongSheet/SongSheet.jsx`
- Create: `src/components/SongSheet/SongHeader.jsx`
- Create: `src/components/SongSheet/SongBody.jsx`
- Create: `src/components/SongSheet/TransposeControl.jsx`

### 11a: EmptyState

```jsx
// src/components/SongSheet/EmptyState.jsx
export function EmptyState({ onImport }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="text-6xl mb-4">🎵</div>
      <h2 className="text-2xl font-semibold mb-2 text-gray-700 dark:text-gray-300">No songs yet</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6">Drag a .sbp file here to get started</p>
      <button
        onClick={onImport}
        className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium"
      >
        Import File
      </button>
    </div>
  )
}
```

### 11b: TransposeControl

```jsx
// src/components/SongSheet/TransposeControl.jsx
export function TransposeControl({ delta, onUp, onDown, onReset, originalKey }) {
  const displayKey = originalKey ?? '?'
  return (
    <div className="flex items-center gap-2">
      <button onClick={onDown} className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-bold text-sm">−</button>
      <span className="text-sm font-mono min-w-[3rem] text-center">
        {displayKey}{delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : ''}
      </span>
      <button onClick={onUp} className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-bold text-sm">+</button>
      {delta !== 0 && (
        <button onClick={onReset} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline ml-1">Reset</button>
      )}
    </div>
  )
}
```

### 11c: SongBody — renders sections with inline chords

```jsx
// src/components/SongSheet/SongBody.jsx

function ChordedLine({ line, fontSize }) {
  // Build spans: alternate lyric text and chord superscripts at their positions
  const text = line.content
  const chords = line.chords ?? []

  if (chords.length === 0) {
    return <span>{text}</span>
  }

  const parts = []
  let lastPos = 0

  for (const { chord, position } of chords) {
    if (position > lastPos) {
      parts.push(<span key={`t-${lastPos}`}>{text.slice(lastPos, position)}</span>)
    }
    parts.push(
      <span key={`c-${position}`} className="relative inline-block">
        <span
          className="absolute -top-5 font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs whitespace-nowrap"
          style={{ fontSize: Math.max(11, fontSize - 4) }}
        >
          {chord}
        </span>
        {text[position] ?? '\u00A0'}
      </span>
    )
    lastPos = position + 1
  }
  if (lastPos < text.length) {
    parts.push(<span key={`t-end`}>{text.slice(lastPos)}</span>)
  }

  return <span>{parts}</span>
}

function SongSection({ section, fontSize, performanceMode }) {
  return (
    <div className="mb-6">
      <h3 className={`text-xs font-semibold uppercase tracking-widest mb-3
        text-indigo-500 dark:text-indigo-400 ${performanceMode ? 'text-sm' : ''}`}>
        {section.label}
      </h3>
      <div className="space-y-1">
        {section.lines.map((line, i) => {
          if (line.type === 'blank') return <div key={i} className="h-3" />
          if (line.type === 'chord') {
            // Pure chord line — display chords spaced out
            return (
              <div key={i} className="font-mono font-bold text-indigo-600 dark:text-indigo-400"
                style={{ fontSize }}>
                {line.chords?.map((ct, j) => (
                  <span key={j} style={{ marginLeft: ct.position * 0.6 + 'ch' }}>{ct.chord} </span>
                ))}
              </div>
            )
          }
          return (
            <div key={i} className="leading-relaxed pt-5" style={{ fontSize }}>
              <ChordedLine line={line} fontSize={fontSize} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SongBody({ sections, fontSize = 16, performanceMode = false }) {
  return (
    <div className="py-4">
      {sections.map((section, i) => (
        <SongSection key={i} section={section} fontSize={fontSize} performanceMode={performanceMode} />
      ))}
    </div>
  )
}
```

### 11d: SongHeader

```jsx
// src/components/SongSheet/SongHeader.jsx
import { useState } from 'react'
import { TransposeControl } from './TransposeControl'

export function SongHeader({ meta, transpose, onPerformanceMode }) {
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-4">
      <h1 className="text-2xl font-bold">{meta.title}</h1>
      {meta.artist && <p className="text-gray-500 dark:text-gray-400">{meta.artist}</p>}

      <div className="flex flex-wrap items-center gap-3 mt-3">
        <TransposeControl {...transpose} originalKey={meta.key} />

        <button
          onClick={() => setInfoOpen(o => !o)}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
        >
          Info {infoOpen ? '▲' : '▼'}
        </button>

        <button
          onClick={onPerformanceMode}
          className="ml-auto text-sm px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          ⛶ Performance
        </button>
      </div>

      {infoOpen && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
          {meta.key && <div><span className="font-medium">Key:</span> {meta.key}</div>}
          {meta.capo > 0 && <div><span className="font-medium">Capo:</span> {meta.capo}</div>}
          {meta.tempo && <div><span className="font-medium">BPM:</span> {meta.tempo}</div>}
          {meta.timeSignature && <div><span className="font-medium">Time:</span> {meta.timeSignature}</div>}
          {meta.ccli && <div><span className="font-medium">CCLI:</span> {meta.ccli}</div>}
          {meta.copyright && <div className="col-span-2"><span className="font-medium">©</span> {meta.copyright}</div>}
        </div>
      )}
    </div>
  )
}
```

### 11e: SongSheet

```jsx
// src/components/SongSheet/SongSheet.jsx
import { useTranspose } from '../../hooks/useTranspose'
import { SongHeader } from './SongHeader'
import { SongBody } from './SongBody'

export function SongSheet({ song, onPerformanceMode, fontSize = 16 }) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <SongHeader
        meta={song.meta}
        transpose={transpose}
        onPerformanceMode={onPerformanceMode}
      />
      <SongBody sections={transpose.transposedSections} fontSize={fontSize} />
    </div>
  )
}
```

### 11f: MainContent (with drop zone)

```jsx
// src/components/SongSheet/MainContent.jsx
import { useRef, useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useDropZone } from '../../hooks/useDropZone'
import { useFileImport } from '../../hooks/useFileImport'
import { EmptyState } from './EmptyState'
import { SongSheet } from './SongSheet'
import { PerformanceModal } from '../PerformanceMode/PerformanceModal'

export function MainContent({ onAddToast }) {
  const activeSong = useLibraryStore(s => s.activeSong)
  const fileInputRef = useRef()
  const [performanceMode, setPerformanceMode] = useState(false)
  const index = useLibraryStore(s => s.index)

  const [duplicateState, setDuplicateState] = useState(null)
  async function onDuplicateCheck(title) {
    return new Promise(resolve => setDuplicateState({ title, resolve }))
  }

  const { importFiles } = useFileImport({
    onError: msg => onAddToast(msg, 'error'),
    onDuplicateCheck,
  })

  const { isDragging, onDragOver, onDragLeave, onDrop } = useDropZone(importFiles)

  return (
    <main
      className={`flex-1 overflow-y-auto relative
        ${isDragging ? 'ring-4 ring-indigo-400 ring-inset bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-2xl font-semibold text-indigo-600">Drop .sbp files here</div>
        </div>
      )}

      {!activeSong
        ? <EmptyState onImport={() => fileInputRef.current.click()} />
        : <SongSheet song={activeSong} onPerformanceMode={() => setPerformanceMode(true)} />
      }

      <input ref={fileInputRef} type="file" accept=".sbp" multiple className="hidden"
        onChange={e => { importFiles(Array.from(e.target.files)); e.target.value = '' }} />

      {performanceMode && activeSong && (
        <PerformanceModal song={activeSong} onClose={() => setPerformanceMode(false)} />
      )}
    </main>
  )
}
```

**Step 1: Commit song sheet components**

```bash
git add src/components/SongSheet/
git commit -m "feat: implement song sheet display components"
```

---

## Task 12: Performance Mode

**Files:**
- Create: `src/components/PerformanceMode/PerformanceModal.jsx`

```jsx
// src/components/PerformanceMode/PerformanceModal.jsx
import { useEffect, useRef } from 'react'
import { useTranspose } from '../../hooks/useTranspose'
import { SongBody } from '../SongSheet/SongBody'

export function PerformanceModal({ song, onClose }) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats)
  const containerRef = useRef()

  // Keyboard navigation: ArrowDown/Up scroll by section
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      const el = containerRef.current
      if (!el) return
      const sections = el.querySelectorAll('[data-section]')
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        // Find first section below viewport center
        for (const s of sections) {
          if (s.getBoundingClientRect().top > window.innerHeight / 2) {
            s.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
        }
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const arr = Array.from(sections).reverse()
        for (const s of arr) {
          if (s.getBoundingClientRect().top < window.innerHeight / 3) {
            s.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 overflow-y-auto" ref={containerRef}>
      {/* Top controls */}
      <div className="sticky top-0 flex items-center justify-between px-6 py-3
        bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div>
          <span className="text-2xl font-bold">{song.meta.title}</span>
          {song.meta.artist && <span className="ml-3 text-gray-500">{song.meta.artist}</span>}
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          ✕ Exit
        </button>
      </div>

      {/* Song content at large font */}
      <div className="max-w-3xl mx-auto px-8 py-8">
        <SongBody
          sections={transpose.transposedSections}
          fontSize={22}
          performanceMode={true}
        />
      </div>
    </div>
  )
}
```

**Note:** Add `data-section` attribute to each `SongSection` root div in `SongBody.jsx`:

```jsx
// In SongSection component, add to the outer div:
<div className="mb-6" data-section>
```

**Step 1: Commit performance mode**

```bash
git add src/components/PerformanceMode/
git commit -m "feat: implement performance mode with keyboard navigation"
```

---

## Task 13: Settings Panel

**Files:**
- Create: `src/components/Settings/SettingsPanel.jsx`
- Modify: `src/App.jsx` (add settings button and state)

```jsx
// src/components/Settings/SettingsPanel.jsx
import { useTheme } from '../../contexts/ThemeContext'
import { useLibraryStore } from '../../store/libraryStore'
import { getStorageStats } from '../../lib/storage'
import { Button } from '../UI/Button'

export function SettingsPanel({ onClose }) {
  const { theme, setTheme } = useTheme()
  const index = useLibraryStore(s => s.index)
  const deleteSong = useLibraryStore(s => s.deleteSong)
  const stats = getStorageStats()
  const usedKB = (stats.usedBytes / 1024).toFixed(1)
  const limitKB = (stats.limitBytes / 1024).toFixed(0)

  function clearAll() {
    if (!window.confirm('Delete ALL songs? This cannot be undone.')) return
    [...index].forEach(e => deleteSong(e.id))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold dark:text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Theme */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2 dark:text-gray-300">Theme</label>
          <div className="flex gap-2">
            {['light', 'dark', 'system'].map(t => (
              <Button
                key={t}
                variant={theme === t ? 'primary' : 'secondary'}
                onClick={() => setTheme(t === 'system'
                  ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                  : t
                )}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Storage stats */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2 dark:text-gray-300">Library</label>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {index.length} song{index.length !== 1 ? 's' : ''} · {usedKB} KB / {limitKB} KB used
          </p>
          <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full"
              style={{ width: `${Math.min(100, (stats.usedBytes / stats.limitBytes) * 100)}%` }}
            />
          </div>
        </div>

        {/* Danger zone */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <Button variant="danger" onClick={clearAll}>Clear All Data</Button>
        </div>
      </div>
    </div>
  )
}
```

**Modify `src/App.jsx`** — add settings button to header and conditional `<SettingsPanel>`:

```jsx
// Add to imports:
import { useState } from 'react'
import { SettingsPanel } from './components/Settings/SettingsPanel'

// In the header JSX, add after song title:
<button onClick={() => setSettingsOpen(true)} aria-label="Settings"
  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">⚙️</button>

// After ToastContainer:
{settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
```

**Step 1: Commit settings**

```bash
git add src/components/Settings/ src/App.jsx
git commit -m "feat: implement settings panel with theme toggle and storage stats"
```

---

## Task 14: Error Boundary & Final Polish

**Files:**
- Create: `src/components/UI/ErrorBoundary.jsx`
- Modify: `src/main.jsx`
- Modify: `src/hooks/useFileImport.js` (add QuotaExceededError handling)

### 14a: ErrorBoundary

```jsx
// src/components/UI/ErrorBoundary.jsx
import { Component } from 'react'

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-gray-500 text-sm mb-4">{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg">
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

### 14b: QuotaExceededError handling in useFileImport.js

```js
// In the importFiles function, wrap addSongs call:
try {
  addSongs([song])
} catch (e) {
  if (e.name === 'QuotaExceededError') {
    onError('Storage is full. Please delete some songs before importing more.')
    return
  }
  throw e
}
```

**Step 1: Commit polish**

```bash
git add src/components/UI/ErrorBoundary.jsx src/hooks/useFileImport.js src/main.jsx
git commit -m "feat: add error boundary and quota exceeded error handling"
```

---

## Task 15: Run Full Test Suite & Manual QA

**Step 1: Run all tests**

```bash
npm test
```

Expected: All unit tests pass (parser, chordUtils, storage).

**Step 2: Start dev server and manual smoke test**

```bash
npm run dev
```

Manual checklist:
- [ ] Drag `El_Shaddai.sbp` onto the drop zone → song appears in sidebar and main area
- [ ] Chords display inline above lyrics (Verse 1, Chorus, etc.)
- [ ] Transpose + / − buttons change chord names
- [ ] Reset restores original chords
- [ ] Click Performance Mode → full-screen view, large text
- [ ] ArrowDown/ArrowUp scroll between sections in performance mode
- [ ] Esc exits performance mode
- [ ] Search filters the song list
- [ ] Delete song removes it from list and clears main area
- [ ] Refresh page → song still in library (localStorage persistence)
- [ ] Settings gear icon opens settings panel
- [ ] Dark mode toggle switches theme
- [ ] Mobile 375px viewport: sidebar hidden by hamburger, import still works

**Step 3: Build check**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: SongSheet v1.0 — complete implementation"
```

---

## Reference: El Shaddai.sbp Parsed Output

For debugging the parser, the sample file should produce:

```js
{
  meta: {
    title: "El Shaddai",
    artist: "Amy Grant",
    key: "Eb",      // key index 3
    keyIndex: 3,
    usesFlats: true,
    capo: 0,
    tempo: undefined,  // TempoInt is 0
    timeSignature: undefined,
  },
  sections: [
    { label: "Intro", lines: [
      { type: "chord", chords: [{chord:"Dm",position:0}, {chord:"G",position:9}, ...] }
    ]},
    { label: "Chorus", lines: [
      { type: "lyric", content: "El Shaddai, El Shaddai, El-Elyon na Adonai", chords: [
        {chord: "Dm", position: 3},
        {chord: "G", position: 14},
        ...
      ]}
    ]},
    ...
  ]
}
```
