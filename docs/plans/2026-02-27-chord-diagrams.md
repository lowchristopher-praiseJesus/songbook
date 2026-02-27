# Chord Diagram Strip Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a collapsible horizontal strip of guitar chord fingering diagrams (from a PNG sprite sheet) at the top of each song, updating live when the song is transposed.

**Architecture:** A CSS sprite approach crops a single 1000×1545px PNG at precise (x, y) offsets to show each chord's 84×116px cell. `chordSprite.js` maps chord names to pixel positions; `ChordStrip` extracts unique chords from the already-transposed sections and renders them; collapse state lives in `MainContent` (regular view) and locally in `PerformanceModal`.

**Tech Stack:** React 18, Tailwind CSS, Vitest + @testing-library/react

---

### Task 1: Copy image to public/

**Files:**
- Copy: `guitar-chord-chart.png` → `public/guitar-chord-chart.png`

No tests needed for a static asset.

**Step 1: Copy the file**

```bash
cp guitar-chord-chart.png public/guitar-chord-chart.png
```

**Step 2: Verify it's accessible in the dev server**

Start `npm run dev`, open `http://localhost:5173/guitar-chord-chart.png` in the browser. You should see the chord chart image.

**Step 3: Commit**

```bash
git add public/guitar-chord-chart.png
git commit -m "feat: add guitar chord chart sprite to public assets"
```

---

### Task 2: Create `chordSprite.js` — sprite coordinate lookup

**Files:**
- Create: `src/lib/chords/chordSprite.js`
- Create: `src/lib/chords/chordSprite.test.js`

**Step 1: Write the failing tests**

Create `src/lib/chords/chordSprite.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { chordToSprite, SPRITE_W, SPRITE_H } from './chordSprite'

describe('chordToSprite', () => {
  it('returns correct position for C major', () => {
    // C is row 4, col 0  →  x=60, y=83+(4*116)=547
    expect(chordToSprite('C')).toEqual({ x: 60, y: 547 })
  })

  it('returns correct position for Am', () => {
    // A is row 1, col 1 (m)  →  x=140, y=83+(1*116)=199
    expect(chordToSprite('Am')).toEqual({ x: 140, y: 199 })
  })

  it('returns correct position for Cmaj7', () => {
    // C is row 4, col 7 (maj7)  →  x=618, y=547
    expect(chordToSprite('Cmaj7')).toEqual({ x: 618, y: 547 })
  })

  it('returns correct position for G', () => {
    // G is row 11, col 0  →  x=60, y=83+(11*116)=1359
    expect(chordToSprite('G')).toEqual({ x: 60, y: 1359 })
  })

  it('maps enharmonic G# to Ab row', () => {
    expect(chordToSprite('G#')).toEqual(chordToSprite('Ab'))
  })

  it('maps enharmonic C# to Db row', () => {
    expect(chordToSprite('C#m')).toEqual(chordToSprite('Dbm'))
  })

  it('strips slash bass before lookup (G/B → G)', () => {
    expect(chordToSprite('G/B')).toEqual(chordToSprite('G'))
  })

  it('normalises sus4 to sus', () => {
    expect(chordToSprite('Dsus4')).toEqual(chordToSprite('Dsus'))
  })

  it('returns null for unknown suffix', () => {
    expect(chordToSprite('Cadd9')).toBeNull()
  })

  it('returns null for unknown root', () => {
    expect(chordToSprite('H7')).toBeNull()
  })

  it('exports SPRITE_W=84 and SPRITE_H=116', () => {
    expect(SPRITE_W).toBe(84)
    expect(SPRITE_H).toBe(116)
  })
})
```

**Step 2: Run to verify failure**

```bash
npm run test -- chordSprite
```
Expected: FAIL — "Cannot find module './chordSprite'"

**Step 3: Implement `src/lib/chords/chordSprite.js`**

```js
// Sprite sheet dimensions and crop constants
export const SPRITE_W   = 84
export const SPRITE_H   = 116
const ROW_TOP_0  = 83
const ROW_HEIGHT = 116

// cropX per column index (0–10), centered on each chord diagram box
const CROP_XS = [60, 140, 220, 300, 380, 460, 539, 618, 698, 778, 858]

// 12 root rows in chart order
const ROOT_ROWS = ['Ab','A','Bb','B','C','Db','D','Eb','E','F','F#','G']
const ROOT_TO_ROW = Object.fromEntries(ROOT_ROWS.map((r, i) => [r, i]))

// Enharmonic aliases → canonical chart name
const ROOT_ALIAS = {
  'G#': 'Ab',
  'C#': 'Db',
  'Gb': 'F#',
  'D#': 'Eb',
  'A#': 'Bb',
}

// 11 chord type columns in chart order
const SUFFIX_COLS = ['','m','6','7','9','m6','m7','maj7','dim','+','sus']
const SUFFIX_TO_COL = Object.fromEntries(SUFFIX_COLS.map((s, i) => [s, i]))

// Suffix normalisation before lookup
const SUFFIX_ALIAS = {
  'sus4': 'sus',
  'min':  'm',
}

/**
 * Map a chord name to its CSS sprite {x, y} position.
 * Returns null if the chord is not represented in the chart.
 *
 * @param {string} chord - e.g. "Am7", "G/B", "Dsus4", "Cmaj7"
 * @returns {{ x: number, y: number } | null}
 */
export function chordToSprite(chord) {
  if (!chord) return null

  // Strip slash bass note: "G/B" → "G"
  const noSlash = chord.includes('/') ? chord.slice(0, chord.indexOf('/')) : chord

  // Extract root (1 or 2 chars: note + optional accidental) and suffix
  const match = noSlash.match(/^([A-G][b#]?)(.*)$/)
  if (!match) return null
  let [, root, suffix] = match

  // Apply enharmonic alias
  root = ROOT_ALIAS[root] ?? root

  // Apply suffix alias
  suffix = SUFFIX_ALIAS[suffix] ?? suffix

  const row = ROOT_TO_ROW[root]
  const col = SUFFIX_TO_COL[suffix]

  if (row === undefined || col === undefined) return null

  return {
    x: CROP_XS[col],
    y: ROW_TOP_0 + row * ROW_HEIGHT,
  }
}
```

**Step 4: Run tests to verify pass**

```bash
npm run test -- chordSprite
```
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/lib/chords/chordSprite.js src/lib/chords/chordSprite.test.js
git commit -m "feat: add chordSprite lookup for guitar chord PNG sprite sheet"
```

---

### Task 3: Create `ChordDiagram.jsx` — single chord sprite cell

**Files:**
- Create: `src/components/Chords/ChordDiagram.jsx`

This is a pure presentational component; no separate test file needed (covered by ChordStrip tests).

**Step 1: Implement `src/components/Chords/ChordDiagram.jsx`**

```jsx
import { SPRITE_W, SPRITE_H } from '../../lib/chords/chordSprite'

/**
 * Renders a single chord diagram by cropping the guitar-chord-chart.png sprite.
 * @param {{ x: number, y: number }} sprite - pixel crop origin
 */
export function ChordDiagram({ sprite }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width:               SPRITE_W,
        height:              SPRITE_H,
        backgroundImage:     'url(/guitar-chord-chart.png)',
        backgroundSize:      '1000px 1545px',
        backgroundPosition:  `-${sprite.x}px -${sprite.y}px`,
        backgroundRepeat:    'no-repeat',
        flexShrink:          0,
      }}
    />
  )
}
```

**Step 2: Commit**

```bash
git add src/components/Chords/ChordDiagram.jsx
git commit -m "feat: add ChordDiagram component using CSS sprite"
```

---

### Task 4: Create `ChordStrip.jsx` — collapsible chord strip

**Files:**
- Create: `src/components/Chords/ChordStrip.jsx`
- Create: `src/components/Chords/ChordStrip.test.jsx`

**Step 1: Write the failing tests**

Create `src/components/Chords/ChordStrip.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChordStrip } from './ChordStrip'

// Minimal sections fixture with known chords
const sections = [
  {
    label: 'Verse',
    lines: [
      { type: 'lyric',  content: 'Hello',  chords: [{ chord: 'G',    position: 0 }] },
      { type: 'lyric',  content: 'World',  chords: [{ chord: 'Am',   position: 0 }] },
      { type: 'lyric',  content: 'Again',  chords: [{ chord: 'G',    position: 0 }] }, // duplicate G
      { type: 'lyric',  content: 'Slash',  chords: [{ chord: 'G/B',  position: 0 }] }, // slash → G, already present
      { type: 'chord',  content: '',       chords: [{ chord: 'Cmaj7',position: 0 }] },
    ],
  },
]

describe('ChordStrip', () => {
  it('renders a toggle button', () => {
    render(<ChordStrip sections={sections} open onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /chords/i })).toBeInTheDocument()
  })

  it('shows chord diagrams when open=true', () => {
    render(<ChordStrip sections={sections} open onToggle={() => {}} />)
    // G, Am, Cmaj7 — three unique chords (G/B deduped as G)
    const diagrams = document.querySelectorAll('[data-chord]')
    expect(diagrams).toHaveLength(3)
  })

  it('hides chord diagrams when open=false', () => {
    render(<ChordStrip sections={sections} open={false} onToggle={() => {}} />)
    const diagrams = document.querySelectorAll('[data-chord]')
    expect(diagrams).toHaveLength(0)
  })

  it('calls onToggle when button clicked', () => {
    const onToggle = vi.fn()
    render(<ChordStrip sections={sections} open onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /chords/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('skips chords not in the sprite map', () => {
    const withUnknown = [{ label: '', lines: [
      { type: 'lyric', content: 'x', chords: [{ chord: 'Cadd9', position: 0 }] },
      { type: 'lyric', content: 'y', chords: [{ chord: 'G',     position: 0 }] },
    ]}]
    render(<ChordStrip sections={withUnknown} open onToggle={() => {}} />)
    const diagrams = document.querySelectorAll('[data-chord]')
    expect(diagrams).toHaveLength(1) // only G
  })

  it('returns null when no mappable chords exist', () => {
    const empty = [{ label: '', lines: [
      { type: 'lyric', content: 'x', chords: [{ chord: 'Cadd9', position: 0 }] },
    ]}]
    const { container } = render(<ChordStrip sections={empty} open onToggle={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when sections is empty', () => {
    const { container } = render(<ChordStrip sections={[]} open onToggle={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
```

**Step 2: Run to verify failure**

```bash
npm run test -- ChordStrip
```
Expected: FAIL — "Cannot find module './ChordStrip'"

**Step 3: Implement `src/components/Chords/ChordStrip.jsx`**

```jsx
import { useMemo } from 'react'
import { chordToSprite } from '../../lib/chords/chordSprite'
import { ChordDiagram } from './ChordDiagram'

/**
 * Extract unique chord names (in order of first appearance) from transposed sections.
 * Strips slash bass, deduplicates, and filters to only chords present in the sprite.
 */
function extractUniqueChords(sections) {
  const seen = new Set()
  const result = []

  for (const section of sections) {
    for (const line of section.lines) {
      for (const { chord } of (line.chords ?? [])) {
        // Strip slash bass: "G/B" → "G"
        const name = chord.includes('/') ? chord.slice(0, chord.indexOf('/')) : chord
        if (seen.has(name)) continue
        seen.add(name)
        if (chordToSprite(name) !== null) result.push(name)
      }
    }
  }

  return result
}

/**
 * Collapsible, horizontally-scrollable strip of chord diagrams.
 *
 * @param {{ sections: object[], open: boolean, onToggle: () => void }} props
 */
export function ChordStrip({ sections, open, onToggle }) {
  const chords = useMemo(() => extractUniqueChords(sections ?? []), [sections])

  if (chords.length === 0) return null

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium
          text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
          w-full text-left"
        aria-expanded={open}
      >
        Chords {open ? '▴' : '▾'}
      </button>

      {/* Diagram row */}
      {open && (
        <div className="overflow-x-auto">
          <div className="flex gap-1 px-4 pb-3">
            {chords.map(name => (
              <div key={name} data-chord={name}>
                <ChordDiagram sprite={chordToSprite(name)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 4: Run tests to verify pass**

```bash
npm run test -- ChordStrip
```
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/components/Chords/ChordStrip.jsx src/components/Chords/ChordStrip.test.jsx
git commit -m "feat: add ChordStrip collapsible chord diagram panel"
```

---

### Task 5: Wire ChordStrip into the regular song view

**Files:**
- Modify: `src/components/SongSheet/MainContent.jsx`
- Modify: `src/components/SongSheet/SongSheet.jsx`

No new tests — the integration is a small wiring change and the components are already individually tested.

**Step 1: Add `chordsOpen` state to `MainContent.jsx`**

Open `src/components/SongSheet/MainContent.jsx`. Add `chordsOpen` state near the top of the component (after the existing state declarations) and pass it through to `SongSheet`:

```jsx
// Add with the other useState declarations (around line 18)
const [chordsOpen, setChordsOpen] = useState(true)
```

Then update the `<SongSheet>` render call (around line 107) to pass the new props:

```jsx
<SongSheet
  song={activeSong}
  onPerformanceMode={setPerformanceSections}
  lyricsOnly={lyricsOnly}
  fontSize={fontSize}
  onFontSizeChange={onFontSizeChange}
  chordsOpen={chordsOpen}
  onChordsToggle={() => setChordsOpen(o => !o)}
/>
```

**Step 2: Add `ChordStrip` to `SongSheet.jsx`**

Open `src/components/SongSheet/SongSheet.jsx`. Add the import at the top:

```jsx
import { ChordStrip } from '../Chords/ChordStrip'
```

Update the function signature to accept the new props:

```jsx
export function SongSheet({ song, onPerformanceMode, lyricsOnly = false, fontSize = 16, onFontSizeChange, chordsOpen, onChordsToggle }) {
```

Insert `<ChordStrip>` between `<SongHeader>` and `<SongBody>`:

```jsx
return (
  <div className="max-w-2xl mx-auto px-4 py-6 w-full">
    <SongHeader
      meta={song.meta}
      transpose={transpose}
      lyricsOnly={lyricsOnly}
      fontSizeControl={fontSizeControl}
      onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
    />
    <ChordStrip
      sections={transpose.transposedSections}
      open={chordsOpen}
      onToggle={onChordsToggle}
    />
    <SongBody sections={transpose.transposedSections} fontSize={fontSize} lyricsOnly={lyricsOnly} />
  </div>
)
```

**Step 3: Run all tests**

```bash
npm run test
```
Expected: all tests PASS (no regressions)

**Step 4: Manual smoke test**

Run `npm run build && npm run preview`. Open a song — the chord strip should appear below the header with diagrams visible. Toggle it closed with the "Chords ▴" button. Transpose the song and verify diagrams update.

**Step 5: Commit**

```bash
git add src/components/SongSheet/MainContent.jsx src/components/SongSheet/SongSheet.jsx
git commit -m "feat: add chord diagram strip to main song view"
```

---

### Task 6: Wire ChordStrip into Performance Mode

**Files:**
- Modify: `src/components/PerformanceMode/PerformanceModal.jsx`

**Step 1: Add import and local state**

Open `src/components/PerformanceMode/PerformanceModal.jsx`. Add the import at the top:

```jsx
import { ChordStrip } from '../Chords/ChordStrip'
```

Add local state inside the component (alongside the existing `swipeDir` state):

```jsx
const [chordsOpen, setChordsOpen] = useState(true)
```

**Step 2: Insert `<ChordStrip>` below the sticky header**

The sticky header `<div>` closes just before the song content `<div key={song.id}>`. Insert `<ChordStrip>` between them:

```jsx
      {/* Chord diagram strip */}
      <ChordStrip
        sections={sections}
        open={chordsOpen}
        onToggle={() => setChordsOpen(o => !o)}
      />

      {/* Song content — keyed so animation restarts on each song change */}
      <div
        key={song.id}
        ...
```

**Step 3: Run all tests**

```bash
npm run test
```
Expected: all tests PASS

**Step 4: Manual smoke test in Performance Mode**

Open a song, click "⛶ Performance". Chord strip should appear below the performance header. Toggle it. Swipe to next song — strip should reset to open (local state resets on modal remount). Verify arrow-key song navigation still works.

**Step 5: Commit**

```bash
git add src/components/PerformanceMode/PerformanceModal.jsx
git commit -m "feat: add chord diagram strip to Performance Mode"
```

---

## Done

All 6 tasks complete. The chord diagram strip now:
- Appears below the song header in both regular and performance views
- Shows unique chords in first-appearance order, updated live on transpose
- Collapses/expands with a toggle button
- Gracefully skips chords not in the sprite map
- Handles slash chords by showing the root chord diagram
