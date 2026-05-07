# SVG Chord Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CSS sprite + PNG chord diagram system with inline SVG generated from a bundled fingering JSON, expanding chord coverage from 11 to 200+ types and enabling dark mode.

**Architecture:** A dev-time extraction script pulls standard voicings from `@tombatossals/chords-db` (devDep only, never shipped) and writes `chordFingerings.json`. At runtime, `chordFingering.js` resolves chord names (with enharmonic + suffix aliases and slash-chord fallback). `ChordDiagramSVG.jsx` renders each voicing as a 84×116 inline SVG. `ChordStrip.jsx` is simplified to use only the new lookup and renderer.

**Tech Stack:** React 18, Vite, Tailwind CSS (dark: variants via `.dark` class), Vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-05-07-svg-chord-diagrams-design.md`

---

## File Map

| Action | Path |
|---|---|
| **Create** | `scripts/extractChordFingerings.mjs` |
| **Create** | `src/lib/chords/chordFingerings.json` |
| **Create** | `src/lib/chords/chordFingering.js` |
| **Create** | `src/lib/chords/chordFingering.test.js` |
| **Create** | `src/components/Chords/ChordDiagramSVG.jsx` |
| **Create** | `src/components/Chords/ChordDiagramSVG.test.jsx` |
| **Modify** | `src/components/Chords/ChordStrip.jsx` |
| **Delete** | `src/lib/chords/chordSprite.js` |
| **Delete** | `src/lib/chords/slashChordImages.js` |
| **Delete** | `src/components/Chords/ChordDiagram.jsx` |
| **Delete** | `public/guitar-chord-chart.png` |
| **Delete** | `public/slash-chords/*.png` (12 files) |

---

### Task 1: Install devDependency and inspect chord data

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install @tombatossals/chords-db**

```bash
npm install --save-dev @tombatossals/chords-db
```

Expected: `@tombatossals/chords-db` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Inspect the data structure**

```bash
node -e "
const db = require('@tombatossals/chords-db');
const c = db.guitar.chords;
console.log('Root keys:', Object.keys(c));
console.log('Suffixes for C:', c.C.map(x => x.suffix));
console.log('First C major position:', JSON.stringify(c.C[0].positions[0], null, 2));
"
```

Confirm the shape: `{ key, suffix, positions: [{ frets, fingers, baseFret, barres, midi }] }`.
`frets` is a 6-element array (low E → high e): `-1`=muted, `0`=open, `n`=fret number relative to `baseFret`.
Note the exact suffix strings (typically: `'major'`, `'minor'`, `'7'`, `'maj7'`, `'m7'`, `'6'`, `'m6'`, `'9'`, `'add9'`, `'dim'`, `'aug'`, `'sus2'`, `'sus4'`, `'m9'`, `'maj9'`, `'11'`, `'13'`, `'7sus4'`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @tombatossals/chords-db as devDependency"
```

---

### Task 2: Write and run the extraction script, commit JSON

**Files:**
- Create: `scripts/extractChordFingerings.mjs`
- Create: `src/lib/chords/chordFingerings.json`

- [ ] **Step 1: Create the extraction script**

Create `scripts/extractChordFingerings.mjs`:

```js
import { createRequire } from 'module'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const db = require('@tombatossals/chords-db')

// Maps library suffix → app chord-name suffix.
// Adjust if Task 1 inspection reveals different suffix strings.
const SUFFIX_MAP = {
  'major':    '',
  'minor':    'm',
  '7':        '7',
  'maj7':     'maj7',
  'm7':       'm7',
  '6':        '6',
  'm6':       'm6',
  '9':        '9',
  'add9':     'add9',
  'dim':      'dim',
  'dim7':     'dim7',
  'aug':      '+',
  'sus2':     'sus2',
  'sus4':     'sus',
  'm9':       'm9',
  'maj9':     'maj9',
  '11':       '11',
  'm11':      'm11',
  'maj11':    'maj11',
  '13':       '13',
  'm13':      'm13',
  'maj13':    'maj13',
  '7sus4':    '7sus4',
  '5':        '5',
}

const result = {}
const chords = db.guitar.chords

for (const root of Object.keys(chords)) {
  for (const chordDef of chords[root]) {
    const appSuffix = SUFFIX_MAP[chordDef.suffix]
    if (appSuffix === undefined) continue          // Unknown suffix — skip
    if (!chordDef.positions?.length) continue

    const chordName = `${root}${appSuffix}`
    if (result[chordName]) continue               // Keep first (most standard) voicing

    const pos = chordDef.positions[0]
    result[chordName] = {
      frets:    pos.frets,
      fingers:  pos.fingers,
      baseFret: pos.baseFret,
      barres:   pos.barres ?? [],
    }
  }
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), '../src/lib/chords/chordFingerings.json')
writeFileSync(outPath, JSON.stringify(result, null, 2))
console.log(`Wrote ${Object.keys(result).length} chord voicings to ${outPath}`)
```

- [ ] **Step 2: Run the script**

```bash
node scripts/extractChordFingerings.mjs
```

Expected output: `Wrote NNN chord voicings to .../chordFingerings.json` (typically 200–350 chords).

- [ ] **Step 3: Spot-check the JSON**

```bash
node -e "
const f = require('./src/lib/chords/chordFingerings.json');
['C','Am','F','Fmaj7','Cadd9','Csus','Bm'].forEach(c =>
  console.log(c + ':', f[c] ? f[c].frets.join(',') + ' baseFret=' + f[c].baseFret : 'NOT FOUND')
);
"
```

Verify:
- `C` → frets include `-1` (muted low E) and `0`s (open strings); `baseFret=1`
- `F` → `barres` includes `1` (full barre); `baseFret=1`
- `Cadd9` → found (this was missing from the old sprite)
- `Bm` → `baseFret=2`; `barres` non-empty

- [ ] **Step 4: Commit**

```bash
git add scripts/extractChordFingerings.mjs src/lib/chords/chordFingerings.json
git commit -m "feat(chords): add fingering data extraction script and JSON"
```

---

### Task 3: Build chordFingering.js — TDD

**Files:**
- Create: `src/lib/chords/chordFingering.test.js`
- Create: `src/lib/chords/chordFingering.js`

- [ ] **Step 1: Write failing tests**

Create `src/lib/chords/chordFingering.test.js`:

```js
import { describe, test, expect } from 'vitest'
import { chordFingering, resolveChordKey } from './chordFingering'

describe('chordFingering', () => {
  test('returns voicing for a standard chord', () => {
    const result = chordFingering('C')
    expect(result).not.toBeNull()
    expect(Array.isArray(result.frets)).toBe(true)
    expect(result.frets).toHaveLength(6)
    expect(typeof result.baseFret).toBe('number')
    expect(Array.isArray(result.barres)).toBe(true)
  })

  test('returns null for an unrecognised chord', () => {
    expect(chordFingering('Zzzz')).toBeNull()
    expect(chordFingering('')).toBeNull()
    expect(chordFingering(null)).toBeNull()
  })

  test('applies enharmonic alias G# → Ab', () => {
    expect(chordFingering('G#')).toEqual(chordFingering('Ab'))
  })

  test('applies enharmonic alias C# → Db', () => {
    expect(chordFingering('C#')).toEqual(chordFingering('Db'))
  })

  test('applies suffix alias sus4 → sus', () => {
    expect(chordFingering('Csus4')).toEqual(chordFingering('Csus'))
  })

  test('strips slash bass and returns root voicing when no slash voicing exists', () => {
    // C/Zzz has no dedicated voicing → falls back to C
    expect(chordFingering('C/Zzz')).toEqual(chordFingering('C'))
  })
})

describe('resolveChordKey', () => {
  test('returns the chord name for a known chord', () => {
    expect(resolveChordKey('C')).toBe('C')
    expect(resolveChordKey('Am')).toBe('Am')
  })

  test('returns root key when slash chord falls back to root', () => {
    expect(resolveChordKey('C/Zzz')).toBe('C')
  })

  test('returns null for an unknown chord', () => {
    expect(resolveChordKey('Zzzz')).toBeNull()
    expect(resolveChordKey(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/chords/chordFingering.test.js
```

Expected: All tests fail — "Cannot find module './chordFingering'".

- [ ] **Step 3: Implement chordFingering.js**

Create `src/lib/chords/chordFingering.js`:

```js
import fingerings from './chordFingerings.json'

const ROOT_ALIAS = {
  'G#': 'Ab', 'C#': 'Db', 'Gb': 'F#', 'D#': 'Eb', 'A#': 'Bb',
}

const SUFFIX_ALIAS = {
  'sus4': 'sus',
  'min':  'm',
}

/**
 * Returns the canonical key actually used for lookup, or null if not found.
 * For slash chords without a dedicated voicing, returns the root key.
 *
 * @param {string|null|undefined} chord
 * @returns {string|null}
 */
export function resolveChordKey(chord) {
  if (!chord) return null

  // 1. Try the full chord name as-is
  if (fingerings[chord]) return chord

  // 2. Strip slash bass, apply aliases, look up root+suffix
  const noSlash = chord.includes('/') ? chord.slice(0, chord.indexOf('/')) : chord
  const match = noSlash.match(/^([A-G][b#]?)(.*)$/)
  if (!match) return null

  let [, root, suffix] = match
  root = ROOT_ALIAS[root] ?? root
  suffix = SUFFIX_ALIAS[suffix] ?? suffix
  const key = suffix ? `${root}${suffix}` : root

  return fingerings[key] ? key : null
}

/**
 * Returns the voicing for a chord name, or null if not found.
 * Slash chords fall back to the root chord voicing when no dedicated voicing exists.
 *
 * @param {string|null|undefined} chord
 * @returns {{ frets: number[], fingers: number[], baseFret: number, barres: number[] }|null}
 */
export function chordFingering(chord) {
  const key = resolveChordKey(chord)
  return key ? fingerings[key] : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/chords/chordFingering.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chords/chordFingering.js src/lib/chords/chordFingering.test.js
git commit -m "feat(chords): add chordFingering lookup with enharmonic and suffix aliases"
```

---

### Task 4: Build ChordDiagramSVG.jsx — TDD

**Files:**
- Create: `src/components/Chords/ChordDiagramSVG.test.jsx`
- Create: `src/components/Chords/ChordDiagramSVG.jsx`

SVG coordinate constants (used throughout this task):
- String x positions (low E → high e): `[14, 25, 36, 47, 58, 69]`
- Fret row centres (rows 1–4): `[35, 53, 71, 89]`
- Fret line y positions: `[44, 62, 80, 98]`
- Nut: `rect x=14 y=22 width=55 height=4`
- Barre rect: `rx=5`, height=10, centred on fret row y

- [ ] **Step 1: Write failing tests**

Create `src/components/Chords/ChordDiagramSVG.test.jsx`:

```jsx
import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ChordDiagramSVG } from './ChordDiagramSVG'

// C major: x32010 — muted low E, open G and high e, 3 finger dots
const cMajor = {
  frets: [-1, 3, 2, 0, 1, 0],
  fingers: [0, 3, 2, 0, 1, 0],
  baseFret: 1,
  barres: [],
}

// Bm barre at fret 2
const bm = {
  frets: [-1, 1, 3, 3, 2, 1],
  fingers: [0, 1, 3, 4, 2, 1],
  baseFret: 2,
  barres: [1],
}

describe('ChordDiagramSVG', () => {
  test('renders an SVG with correct viewBox', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('viewBox')).toBe('0 0 84 116')
  })

  test('renders the chord name', () => {
    const { getByText } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    expect(getByText('C')).toBeTruthy()
  })

  test('renders 6 vertical string lines (y1=26 to y2=98)', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    const lines = [...container.querySelectorAll('line')]
    const stringLines = lines.filter(
      l => l.getAttribute('y1') === '26' && l.getAttribute('y2') === '98'
    )
    expect(stringLines).toHaveLength(6)
  })

  test('renders the nut rect when baseFret is 1', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    const rects = [...container.querySelectorAll('rect')]
    const nut = rects.find(
      r => r.getAttribute('y') === '22' && r.getAttribute('height') === '4'
    )
    expect(nut).toBeTruthy()
  })

  test('renders fret position label when baseFret > 1', () => {
    const { getByText } = render(<ChordDiagramSVG fingering={bm} name="Bm" />)
    expect(getByText('2fr')).toBeTruthy()
  })

  test('does not render nut rect when baseFret > 1', () => {
    const { container } = render(<ChordDiagramSVG fingering={bm} name="Bm" />)
    const rects = [...container.querySelectorAll('rect')]
    const nut = rects.find(
      r => r.getAttribute('y') === '22' && r.getAttribute('height') === '4'
    )
    expect(nut).toBeFalsy()
  })

  test('renders a rounded barre rect when barres is non-empty', () => {
    const { container } = render(<ChordDiagramSVG fingering={bm} name="Bm" />)
    const rects = [...container.querySelectorAll('rect')]
    const barre = rects.find(r => r.getAttribute('rx') === '5')
    expect(barre).toBeTruthy()
  })

  test('renders filled circles for non-barre fretted strings', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    // Filled circles have no fill="none" attribute (fill is set via Tailwind class)
    const filled = [...container.querySelectorAll('circle')]
      .filter(c => c.getAttribute('fill') !== 'none')
    // C major: B@fret1, D@fret2, A@fret3 — 3 filled dots
    expect(filled.length).toBeGreaterThanOrEqual(3)
  })

  test('renders open circles (fill="none") for open strings', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    // C major has G (index 3) and high e (index 5) as open strings
    const openCircles = [...container.querySelectorAll('circle')]
      .filter(c => c.getAttribute('fill') === 'none')
    expect(openCircles).toHaveLength(2)
  })

  test('renders muted marker lines for muted strings', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    // C major: low E is muted → 2 crossing lines per muted string
    // Muted lines go from y=14 to y=20 (not y=26 to y=98 like string lines)
    const mutedLines = [...container.querySelectorAll('line')]
      .filter(l => l.getAttribute('y1') === '14' && l.getAttribute('y2') === '20')
    expect(mutedLines).toHaveLength(2)  // 2 lines for 1 muted string (the ✕ cross)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/Chords/ChordDiagramSVG.test.jsx
```

Expected: All tests fail — "Cannot find module './ChordDiagramSVG'".

- [ ] **Step 3: Implement ChordDiagramSVG.jsx**

Create `src/components/Chords/ChordDiagramSVG.jsx`:

```jsx
// x positions for strings: index 0 = low E, index 5 = high e
const STRINGS_X = [14, 25, 36, 47, 58, 69]

// y centres of fret rows 1–4 (relative to baseFret)
const ROW_Y = [35, 53, 71, 89]

// y positions of fret lines below each row
const FRET_Y = [44, 62, 80, 98]

/**
 * Renders a guitar chord diagram as an inline 84×116 SVG.
 *
 * @param {{
 *   fingering: { frets: number[], fingers: number[], baseFret: number, barres: number[] },
 *   name: string
 * }} props
 */
export function ChordDiagramSVG({ fingering, name }) {
  const { frets, fingers, baseFret, barres } = fingering

  // Determine which string indices are part of a barre.
  // The barre finger is the lowest non-zero finger value at the barre fret.
  const barreStringSet = new Set()
  for (const barreFret of barres) {
    const barreFingers = frets
      .map((f, i) => (f === barreFret && fingers[i] > 0 ? fingers[i] : null))
      .filter(f => f !== null)
    if (barreFingers.length === 0) continue
    const barreFinger = Math.min(...barreFingers)
    frets.forEach((f, i) => {
      if (f === barreFret && fingers[i] === barreFinger) barreStringSet.add(i)
    })
  }

  return (
    <svg viewBox="0 0 84 116" width={84} height={116} aria-hidden="true">

      {/* Chord name at top */}
      <text
        x="42" y="10"
        textAnchor="middle"
        fontSize="9" fontWeight="600"
        fontFamily="system-ui, sans-serif"
        className="fill-gray-900 dark:fill-gray-50"
      >
        {name}
      </text>

      {/* Open ○ / muted ✕ markers above the nut */}
      {frets.map((fret, i) => {
        const cx = STRINGS_X[i]
        if (fret === -1) {
          return (
            <g key={i}>
              <line x1={cx - 4} y1="14" x2={cx + 4} y2="20"
                strokeWidth="1.5" strokeLinecap="round"
                className="stroke-gray-500 dark:stroke-gray-500" />
              <line x1={cx + 4} y1="14" x2={cx - 4} y2="20"
                strokeWidth="1.5" strokeLinecap="round"
                className="stroke-gray-500 dark:stroke-gray-500" />
            </g>
          )
        }
        if (fret === 0) {
          return (
            <circle key={i} cx={cx} cy="17" r="4"
              fill="none" strokeWidth="1.5"
              className="stroke-gray-600 dark:stroke-gray-400" />
          )
        }
        return null
      })}

      {/* Nut (baseFret=1) or thin top line + fret-position label (baseFret>1) */}
      {baseFret === 1
        ? <rect x="14" y="22" width="55" height="4"
            className="fill-gray-900 dark:fill-gray-100" />
        : <>
            <line x1="14" y1="26" x2="69" y2="26"
              strokeWidth="1"
              className="stroke-gray-500 dark:stroke-gray-500" />
            <text x="72" y="38" fontSize="7"
              fontFamily="system-ui, sans-serif"
              className="fill-gray-500 dark:fill-gray-400">
              {baseFret}fr
            </text>
          </>
      }

      {/* String lines (vertical) */}
      {STRINGS_X.map(x => (
        <line key={x} x1={x} y1="26" x2={x} y2="98"
          strokeWidth="1"
          className="stroke-gray-500 dark:stroke-gray-500" />
      ))}

      {/* Fret lines (horizontal) */}
      {FRET_Y.map(y => (
        <line key={y} x1="14" y1={y} x2="69" y2={y}
          strokeWidth="0.75"
          className="stroke-gray-300 dark:stroke-gray-700" />
      ))}

      {/* Barre bars */}
      {barres.map(barreFret => {
        const barreIndices = [...barreStringSet].filter(i => frets[i] === barreFret).sort((a,b) => a-b)
        if (barreIndices.length < 2) return null
        const x1 = STRINGS_X[barreIndices[0]]
        const x2 = STRINGS_X[barreIndices[barreIndices.length - 1]]
        const cy = ROW_Y[barreFret - 1]
        const barreFinger = fingers[barreIndices[0]]
        return (
          <g key={barreFret}>
            <rect x={x1} y={cy - 5} width={x2 - x1} height={10} rx="5"
              className="fill-gray-800 dark:fill-gray-200" />
            <text x={(x1 + x2) / 2} y={cy + 3.5}
              textAnchor="middle" fontSize="7"
              fontFamily="system-ui, sans-serif"
              className="fill-white dark:fill-gray-900">
              {barreFinger}
            </text>
          </g>
        )
      })}

      {/* Finger dots (fretted non-barre strings) */}
      {frets.map((fret, i) => {
        if (fret <= 0 || barreStringSet.has(i)) return null
        const cx = STRINGS_X[i]
        const cy = ROW_Y[fret - 1]
        const finger = fingers[i]
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="6"
              className="fill-gray-800 dark:fill-gray-200" />
            {finger > 0 && (
              <text x={cx} y={cy + 3.5}
                textAnchor="middle" fontSize="7"
                fontFamily="system-ui, sans-serif"
                className="fill-white dark:fill-gray-900">
                {finger}
              </text>
            )}
          </g>
        )
      })}

    </svg>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/Chords/ChordDiagramSVG.test.jsx
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Chords/ChordDiagramSVG.jsx src/components/Chords/ChordDiagramSVG.test.jsx
git commit -m "feat(chords): add ChordDiagramSVG SVG renderer component"
```

---

### Task 5: Update ChordStrip.jsx

**Files:**
- Modify: `src/components/Chords/ChordStrip.jsx`

- [ ] **Step 1: Run the full test suite before making changes (baseline)**

```bash
npx vitest run
```

Note any existing failures. All existing tests should pass before this task.

- [ ] **Step 2: Replace ChordStrip.jsx**

Overwrite `src/components/Chords/ChordStrip.jsx` with:

```jsx
import { useMemo } from 'react'
import { chordFingering, resolveChordKey } from '../../lib/chords/chordFingering'
import { ChordDiagramSVG } from './ChordDiagramSVG'

/**
 * Extract unique chords from transposed sections.
 * Deduplicates by resolved chord key — slash chords that fall back to their root
 * are treated as the same chord as the plain root (e.g., C/G and C both → C).
 */
function extractUniqueChords(sections) {
  const seen = new Set()
  const result = []

  for (const section of sections) {
    for (const line of section.lines) {
      for (const { chord } of (line.chords ?? [])) {
        const key = resolveChordKey(chord)
        if (!key || seen.has(key)) continue
        seen.add(key)
        result.push({ name: key, fingering: chordFingering(chord) })
      }
    }
  }

  return result
}

/**
 * Collapsible strip of chord diagrams above the song body.
 *
 * @param {{ sections: object[], open: boolean, onToggle: () => void }} props
 */
export function ChordStrip({ sections, open, onToggle }) {
  const chords = useMemo(() => extractUniqueChords(sections ?? []), [sections])

  if (chords.length === 0) return null

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
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

      {open && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {chords.map(item => (
            <div key={item.name} data-chord={item.name}>
              <span className="sr-only">{item.name}</span>
              <ChordDiagramSVG fingering={item.fingering} name={item.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests pass. If existing ChordStrip tests reference `kind`, `sprite`, `imgSrc`, or `slashChordImage`, update them to reflect the new shape (`{ name, fingering }`).

- [ ] **Step 4: Commit**

```bash
git add src/components/Chords/ChordStrip.jsx
git commit -m "feat(chords): update ChordStrip to use SVG diagrams"
```

---

### Task 6: Delete old files

**Files:**
- Delete: `src/lib/chords/chordSprite.js`
- Delete: `src/lib/chords/slashChordImages.js`
- Delete: `src/components/Chords/ChordDiagram.jsx`
- Delete: `public/guitar-chord-chart.png`
- Delete: `public/slash-chords/` (directory)

- [ ] **Step 1: Verify no remaining imports of old files**

```bash
grep -r "chordSprite\|slashChordImages\|SlashChordDiagram\|ChordDiagram\b\|guitar-chord-chart\|slash-chords" \
  src/ public/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"
```

Expected: Zero matches. If any are found, update them before proceeding.

- [ ] **Step 2: Delete old source files**

```bash
rm src/lib/chords/chordSprite.js
rm src/lib/chords/slashChordImages.js
rm src/components/Chords/ChordDiagram.jsx
```

- [ ] **Step 3: Delete old public image assets**

```bash
rm public/guitar-chord-chart.png
rm -rf public/slash-chords
```

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests pass with no broken imports.

- [ ] **Step 5: Commit deletions**

```bash
git add -A
git commit -m "chore(chords): remove sprite sheet, slash images, and old diagram components"
```

---

### Task 7: Integration and visual verification

**Files:** (none — verification only)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open the app in the browser (typically http://localhost:5173).

- [ ] **Step 2: Load El_Shaddai.sbp and open the chord strip**

Load the sample SBP file (Amy Grant, Eb, Intro/Chorus/Verse sections).
Click "Chords ▾" to expand the ChordStrip.
Confirm diagrams appear for all chords in the song.

- [ ] **Step 3: Visually verify each diagram type**

Check at least one of each:
- Open-position chord (e.g., C, G) — thick nut at top, ○ and ✕ markers, finger dots
- Barre chord (e.g., F, Bm) — rounded bar, "Xfr" label for higher-position barres
- Slash chord (e.g., G/B) — shows G voicing with B bass context (same as root if no dedicated voicing)

- [ ] **Step 4: Test dark mode**

Toggle dark mode in the app.
Verify: nut turns light-coloured, dots invert (light fill, dark text), names stay readable.

- [ ] **Step 5: Test transposition**

Transpose the song +2 semitones. Verify chord diagrams update to the new chord names.

- [ ] **Step 6: Confirm previously-unsupported chords now show diagrams**

Open or create a song that contains `Cadd9`, `Asus2`, or `Em7`.
Verify a diagram now appears (these were silent failures with the old sprite sheet).

- [ ] **Step 7: Bundle size check**

```bash
npm run build 2>&1 | grep -E "dist|kB|MB"
```

The `public/` PNG removals should reduce the bundle. Compare to `git stash` + `npm run build` if you want the exact delta.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(chords): replace sprite sheet with generated SVG chord diagrams

- 200+ chord types now supported (was 11: only major/m/7/maj7 etc.)
- Dark mode aware via Tailwind dark: variants
- No PNG image dependencies (removed guitar-chord-chart.png + 12 slash PNGs)
- Slash chords handled uniformly by fingering JSON with root fallback
EOF
)"
```
