# Presentation PDF Layout — Centred + Two-Column + Uniform Font

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `exportPresentationPdf` so content is horizontally centred, long songs use two columns instead of a tiny font, and all songs in one export use the same font size (within ±2 pt of each other).

**Architecture:** Complete rewrite of `src/lib/exportPresentationPdf.js`. The public API (`exportPresentationPdf(songs)`) is unchanged. Internal helpers are refactored to eliminate the duplicated measurement/render logic flagged in the earlier code review, and new helpers for header measurement/render, section measurement, section splitting, and section rendering are introduced. A single-pass `findBestFont(doc, song)` function determines the largest font at which a song fits in ≤ 2 columns; the minimum across all songs becomes the global font used for the entire export.

**Tech Stack:** jsPDF (already installed), Vitest

---

## Context

After the initial implementation:
- All text is left-aligned — the user wants horizontal centring.
- Long songs still reduce to a very small font (8 pt) — the user wants two columns instead.
- Font size varies wildly across pages — the user wants all songs within ±2 pt of each other.

The "±2 pt" rule is achieved by computing `globalFont = min(findBestFont(song))` across all songs and rendering every song at that one font (variation = 0, which is ≤ ±2).

---

## Page Layout (960 × 540 pt, 16:9)

```
Single-column mode:
┌────────────────────────────────────────────────────┐
│         SONG TITLE  (centred, bold)                │
│         Artist name (centred, grey)                │
│                    [20pt gap]                       │
│         VERSE 1    (centred, label)                │
│         Lyric line one   (centred)                 │
│         CHORUS     (centred, label)                │
│         Chorus line  (centred)                     │
└────────────────────────────────────────────────────┘
   cx = PAGE_W/2 = 480,  maxW = MAX_W = 840

Two-column mode (header still full-width centred):
┌────────────────────────────────────────────────────┐
│         SONG TITLE  (centred, full-width)          │
│         Artist name (centred, full-width)          │
│                    [20pt gap]                       │
│  VERSE 1       │        CHORUS                     │
│  Lyric one     │        Chorus line                │
│  VERSE 2       │        BRIDGE                     │
│  Lyric two     │        Bridge line                │
└────────────────────────────────────────────────────┘
   col1: cx=260, maxW=COL_W=400
   col2: cx=700, maxW=COL_W=400   gap=40pt
```

---

## Constants (all in `exportPresentationPdf.js`)

```js
const PAGE_W = 960
const PAGE_H = 540
const MARGIN_X = 60
const MARGIN_TOP = 50
const MARGIN_BOTTOM = 40
const MAX_W = PAGE_W - MARGIN_X * 2            // 840 pt
const USABLE_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM  // 450 pt
const MAX_FONT = 32
const MIN_FONT = 8
const COL_GAP = 40
const COL_W = (MAX_W - COL_GAP) / 2           // 400 pt per column
const COL1_CX = MARGIN_X + COL_W / 2          // 260 pt (left col centre)
const COL2_CX = MARGIN_X + COL_W + COL_GAP + COL_W / 2  // 700 pt (right col centre)
```

---

## File Map

| Action | Path |
|--------|------|
| Modify (rewrite) | `src/lib/exportPresentationPdf.js` |
| Modify (update tests) | `src/lib/__tests__/exportPresentationPdf.test.js` |

---

## Task 1: Rewrite `exportPresentationPdf.js` + update tests

**Files:**
- Modify: `src/lib/exportPresentationPdf.js`
- Modify: `src/lib/__tests__/exportPresentationPdf.test.js`

---

- [ ] **Step 1: Update tests first (TDD)**

Replace the entire contents of `src/lib/__tests__/exportPresentationPdf.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportPresentationPdf } from '../exportPresentationPdf'

const mockDoc = {
  internal: { pageSize: { getWidth: () => 960, getHeight: () => 540 } },
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  text: vi.fn(),
  splitTextToSize: vi.fn((text) => (text ? [text] : [''])),
  addPage: vi.fn(),
  save: vi.fn(),
}

vi.mock('jspdf', () => ({ default: vi.fn(() => mockDoc) }))

beforeEach(() => {
  Object.values(mockDoc).forEach(fn => typeof fn === 'function' && fn.mockClear?.())
})

// -- helpers ----------------------------------------------------------------

const makeSong = (title, artist, sections) => ({
  meta: { title, artist },
  sections: sections ?? [{ label: 'Verse 1', lines: [{ type: 'lyric', content: 'Hello world' }] }],
})

/**
 * Build a song with `n` sections each containing one lyric line.
 * At MAX_FONT=32 with a no-artist header:
 *   headerH  ≈ 74.88 (title) + 20 (gap) = 94.88
 *   contentH ≈ 450 - 94.88 = 355.12
 *   sectionH ≈ 6 + (32*0.65*1.4) + 4 + (32*1.4) + (32*1.4*0.4) = ~101.84
 *   3 sections ≈ 305.52 → fits single-col
 *   4 sections ≈ 407.36 → overflows single-col, needs 2-col
 */
function makeLongSong(n) {
  return {
    meta: { title: 'Long Song', artist: null },
    sections: Array.from({ length: n }, (_, i) => ({
      label: `Section ${i + 1}`,
      lines: [{ type: 'lyric', content: `Lyric line ${i + 1}` }],
    })),
  }
}

// -- tests ------------------------------------------------------------------

describe('exportPresentationPdf', () => {
  it('does nothing when songs array is empty', () => {
    exportPresentationPdf([])
    expect(mockDoc.save).not.toHaveBeenCalled()
  })

  it('saves a PDF with a date-based filename', () => {
    exportPresentationPdf([makeSong('Amazing Grace', 'John Newton')])
    expect(mockDoc.save).toHaveBeenCalledOnce()
    expect(mockDoc.save.mock.calls[0][0]).toMatch(/Presentation.*\.pdf$/)
  })

  it('does not call addPage for a single song', () => {
    exportPresentationPdf([makeSong('Song A', 'Artist')])
    expect(mockDoc.addPage).not.toHaveBeenCalled()
  })

  it('calls addPage N-1 times for N songs', () => {
    exportPresentationPdf([
      makeSong('Song A', 'Artist'),
      makeSong('Song B', 'Artist'),
      makeSong('Song C', 'Artist'),
    ])
    expect(mockDoc.addPage).toHaveBeenCalledTimes(2)
  })

  it('renders title text for each song', () => {
    exportPresentationPdf([makeSong('My Song', 'My Artist')])
    const textArgs = mockDoc.text.mock.calls.map(c => c[0])
    expect(textArgs.some(t => (Array.isArray(t) ? t.includes('My Song') : t === 'My Song'))).toBe(true)
  })

  it('skips chord-only lines', () => {
    const song = makeSong('Test', null, [{
      label: 'V1',
      lines: [
        { type: 'lyric', content: 'Hello' },
        { type: 'chord', content: '', chords: [{ chord: 'G', position: 0 }] },
      ],
    }])
    expect(() => exportPresentationPdf([song])).not.toThrow()
    expect(mockDoc.save).toHaveBeenCalledOnce()
  })

  it('handles songs with no artist gracefully', () => {
    expect(() => exportPresentationPdf([makeSong('No Artist', null)])).not.toThrow()
    expect(mockDoc.save).toHaveBeenCalledOnce()
  })

  it('renders all text with centre alignment', () => {
    exportPresentationPdf([makeSong('My Song', 'My Artist')])
    const opts = mockDoc.text.mock.calls.map(c => c[3])
    expect(opts.every(o => o?.align === 'center')).toBe(true)
  })

  it('uses two columns for a song whose content overflows single-column', () => {
    // 4 sections overflow single-col at MAX_FONT (see makeLongSong comment)
    const song = makeLongSong(4)
    exportPresentationPdf([song])
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    // Column centres 260 and 700 must both appear (section content calls)
    expect(xValues).toContain(260)
    expect(xValues).toContain(700)
  })

  it('does not use two-column layout for a short song', () => {
    // 2 sections comfortably fit single-col (see makeLongSong comment)
    const song = makeLongSong(2)
    exportPresentationPdf([song])
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    expect(xValues).not.toContain(260)
    expect(xValues).not.toContain(700)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook
npx vitest run src/lib/__tests__/exportPresentationPdf.test.js
```

Expected: several failures — specifically the two new tests (centre alignment, two-column) will fail because the current code is left-aligned and single-column only.

- [ ] **Step 3: Rewrite `exportPresentationPdf.js`**

Replace the entire contents of `src/lib/exportPresentationPdf.js`:

```js
import jsPDF from 'jspdf'

const PAGE_W = 960
const PAGE_H = 540
const MARGIN_X = 60
const MARGIN_TOP = 50
const MARGIN_BOTTOM = 40
const MAX_W = PAGE_W - MARGIN_X * 2            // 840 pt
const USABLE_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM  // 450 pt
const MAX_FONT = 32
const MIN_FONT = 8
const COL_GAP = 40
const COL_W = (MAX_W - COL_GAP) / 2           // 400 pt per column
const COL1_CX = MARGIN_X + COL_W / 2          // 260 pt (left column centre)
const COL2_CX = MARGIN_X + COL_W + COL_GAP + COL_W / 2  // 700 pt (right column centre)

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

/** Height used by the title + artist header (including the 20 pt gap below). */
function measureHeader(doc, song, fontSize) {
  const titleSize = fontSize * 1.8
  const artistSize = fontSize * 0.9
  const titleLineH = titleSize * 1.3
  const artistLineH = artistSize * 1.3
  let h = 0
  doc.setFontSize(titleSize)
  h += doc.splitTextToSize(song.meta.title ?? 'Untitled', MAX_W).length * titleLineH
  if (song.meta.artist) h += artistLineH + 4
  h += 20
  return h
}

/**
 * Height of a list of sections (chord lines skipped).
 * maxW controls line-wrap width — use MAX_W for single-col, COL_W for two-col.
 */
function measureSections(doc, sections, fontSize, maxW = MAX_W) {
  const labelSize = fontSize * 0.65
  const lineH = fontSize * 1.4
  const labelLineH = labelSize * 1.4
  let h = 0
  for (const section of sections) {
    if (!(section.lines ?? []).some(l => l.type === 'lyric')) continue
    if (section.label) h += 6 + labelLineH + 4
    for (const line of section.lines ?? []) {
      if (line.type === 'chord') continue
      if (line.type === 'blank') { h += lineH * 0.5; continue }
      doc.setFontSize(fontSize)
      h += doc.splitTextToSize(line.content ?? '', maxW).length * lineH
    }
    h += lineH * 0.4
  }
  return h
}

/**
 * Split sections into left and right halves for two-column layout.
 * Finds the section boundary closest to the midpoint of total column content height.
 */
function splitSections(doc, sections, fontSize) {
  const filtered = sections.filter(s => (s.lines ?? []).some(l => l.type === 'lyric'))
  if (filtered.length <= 1) return { left: filtered, right: [] }

  const totalH = measureSections(doc, filtered, fontSize, COL_W)
  const half = totalH / 2
  let accumulated = 0

  for (let i = 0; i < filtered.length - 1; i++) {
    accumulated += measureSections(doc, [filtered[i]], fontSize, COL_W)
    if (accumulated >= half) {
      return { left: filtered.slice(0, i + 1), right: filtered.slice(i + 1) }
    }
  }
  // fallback: put all but last section in left column
  return { left: filtered.slice(0, -1), right: filtered.slice(-1) }
}

/**
 * Find the largest font at which the song fits in single-column or two-column layout.
 * Returns { font: number, cols: 1 | 2 }.
 */
function findBestFont(doc, song) {
  for (let fs = MAX_FONT; fs >= MIN_FONT; fs--) {
    const contentH = USABLE_H - measureHeader(doc, song, fs)
    const sections = song.sections ?? []
    if (measureSections(doc, sections, fs) <= contentH) return { font: fs, cols: 1 }
    const { left, right } = splitSections(doc, sections, fs)
    if (
      measureSections(doc, left, fs, COL_W) <= contentH &&
      measureSections(doc, right, fs, COL_W) <= contentH
    ) return { font: fs, cols: 2 }
  }
  return { font: MIN_FONT, cols: 2 }
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Render the title + artist header, centred across the full page width.
 * Returns the y position after the header (where content starts).
 */
function renderHeader(doc, song, fontSize) {
  const titleSize = fontSize * 1.8
  const artistSize = fontSize * 0.9
  const titleLineH = titleSize * 1.3
  const artistLineH = artistSize * 1.3
  let y = MARGIN_TOP

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(titleSize)
  doc.setTextColor(0, 0, 0)
  const titleLines = doc.splitTextToSize(song.meta.title ?? 'Untitled', MAX_W)
  doc.text(titleLines, PAGE_W / 2, y, { align: 'center' })
  y += titleLines.length * titleLineH

  if (song.meta.artist) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(artistSize)
    doc.setTextColor(100, 100, 100)
    doc.text(song.meta.artist, PAGE_W / 2, y, { align: 'center' })
    doc.setTextColor(0, 0, 0)
    y += artistLineH + 4
  }

  y += 20
  return y
}

/**
 * Render a list of sections in one column.
 * cx   — horizontal centre of the column
 * maxW — wrap width for splitTextToSize
 */
function renderSections(doc, sections, fontSize, cx, maxW, startY) {
  const labelSize = fontSize * 0.65
  const lineH = fontSize * 1.4
  const labelLineH = labelSize * 1.4
  let y = startY

  for (const section of sections) {
    if (!(section.lines ?? []).some(l => l.type === 'lyric')) continue

    if (section.label) {
      y += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(labelSize)
      doc.setTextColor(80, 80, 180)
      doc.text(section.label.toUpperCase(), cx, y, { align: 'center' })
      doc.setTextColor(0, 0, 0)
      y += labelLineH + 4
    }

    for (const line of section.lines ?? []) {
      if (line.type === 'chord') continue
      if (line.type === 'blank') { y += lineH * 0.5; continue }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(fontSize)
      const wrapped = doc.splitTextToSize(line.content ?? '', maxW)
      doc.text(wrapped, cx, y, { align: 'center' })
      y += wrapped.length * lineH
    }

    y += lineH * 0.4
  }

  return y
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export an array of songs as a 16:9 landscape presentation PDF.
 *
 * Layout per page:
 *   - Title + artist centred at full-page width
 *   - Sections in single column (centred) when they fit
 *   - Sections in two columns (each centred in its column) when single-column overflows
 *
 * Font consistency:
 *   globalFont = min over all songs of findBestFont(song).
 *   Every song renders at globalFont → font variation across pages = 0.
 *
 * @param {Array<{ meta: { title: string, artist: string|null }, sections: Section[] }>} songs
 */
export function exportPresentationPdf(songs) {
  if (!songs.length) return

  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'landscape' })

  // Pass 1: find the largest font at which every song fits (1 or 2 cols)
  const globalFont = songs.reduce((min, song) => {
    const { font } = findBestFont(doc, song)
    return Math.min(min, font)
  }, MAX_FONT)

  // Pass 2: render each song at globalFont
  songs.forEach((song, i) => {
    if (i > 0) doc.addPage()

    const contentH = USABLE_H - measureHeader(doc, song, globalFont)
    const sections = song.sections ?? []
    const startY = renderHeader(doc, song, globalFont)

    if (measureSections(doc, sections, globalFont) > contentH) {
      // Two-column layout
      const { left, right } = splitSections(doc, sections, globalFont)
      renderSections(doc, left, globalFont, COL1_CX, COL_W, startY)
      renderSections(doc, right, globalFont, COL2_CX, COL_W, startY)
    } else {
      // Single-column layout
      renderSections(doc, sections, globalFont, PAGE_W / 2, MAX_W, startY)
    }
  })

  const date = new Date().toISOString().slice(0, 10)
  doc.save(`Presentation ${date}.pdf`)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/exportPresentationPdf.test.js
```

Expected: 9 tests pass (7 original + 2 new).

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: same pass/fail count as before this task (1 pre-existing failure in sbpParser, 1 pre-existing failure in worker suite — both unrelated).

- [ ] **Step 6: Commit**

```bash
git add src/lib/exportPresentationPdf.js src/lib/__tests__/exportPresentationPdf.test.js
git commit -m "feat: centred layout, two-column overflow, uniform font for presentation PDF"
```

---

## Verification

Manual steps (after `npm run dev`):

1. Select 3+ songs of varying lengths → Export → Presentation PDF
2. Open the PDF and verify:
   - Every page: title and artist are horizontally centred
   - Short songs: single column of centred lyrics
   - Long songs: two columns, each centred in its half
   - All pages use the same font size (or within 1–2 pt — whatever `globalFont` resolves to)
3. Select only one very long song → Export → Presentation PDF. Confirm it renders in two columns.
4. Select only one very short song (2–3 lines). Confirm it renders single-column, centred.
