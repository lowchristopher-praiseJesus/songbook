# SVG Chord Diagrams Design Spec

**Date:** 2026-05-07  
**Status:** Approved

---

## Problem

The current chord diagram strip in the ChordStrip component uses a CSS sprite technique: a
pre-rendered 1000×1545px PNG (`guitar-chord-chart.png`) is clipped via `background-position`
to show one 84×116px cell per chord. Slash chords each have their own individual PNG in
`public/slash-chords/`. This approach has three compounding problems:

1. **Limited chord coverage** — only 11 suffix types: `''` (major), `m`, `6`, `7`, `9`,
   `m6`, `m7`, `maj7`, `dim`, `+`, `sus`. Chords like `Cadd9`, `7sus4`, `sus2`, `m9`, `11`,
   `13`, `add9` are silently skipped — no diagram appears.
2. **Raster rendering** — blurry at high DPI; does not respond to dark mode at all.
3. **Image asset dependency** — 13 PNG files (1 sprite sheet + 12 slash images) that must
   stay in sync with lookup code; slash chord coverage is limited to exactly 12 combinations.

---

## Solution

Replace CSS-sprite clipping with inline SVG generated at runtime from a bundled fingering JSON.

```
Before:
  chord name → chordToSprite()   → {x,y}   → <ChordDiagram>     (CSS background-position)
  chord name → slashChordImage() → imgSrc  → <SlashChordDiagram> (<img>)

After:
  chord name → chordFingering()  → voicing → <ChordDiagramSVG>   (inline SVG)
```

The slash-chord special case disappears entirely — every chord goes through the same lookup
and the same SVG renderer. Unrecognised slash chords fall back to the root chord voicing,
identical to the current sprite fallback.

---

## Fingering Data

**Source:** `@tombatossals/chords-db` (MIT licence, ~2300 guitar voicings) — installed as a
devDependency only, never shipped to users.

**Extraction script:** `scripts/extractChordFingerings.mjs`

Run once at dev time. For each root (C, Db, D … B) and each suffix in the library, the script
picks `positions[0]` (the most standard, open-position voicing) and maps the library's suffix
names to the app's chord name conventions:

| Library suffix | App chord name suffix |
|---|---|
| `major` | `""` (empty = major) |
| `minor` | `m` |
| `7` | `7` |
| `major7` | `maj7` |
| `minor7` | `m7` |
| `6` | `6` |
| `minor6` | `m6` |
| `9` | `9` |
| `diminished` | `dim` |
| `augmented` | `+` |
| `suspended4` | `sus` |
| `suspended2` | `sus2` |
| `add9` | `add9` |
| `minor9` | `m9` |
| `major9` | `maj9` |
| `11` | `11` |
| `13` | `13` |
| `dominant7sus4` | `7sus4` |
| … | … |

Output: `src/lib/chords/chordFingerings.json` (committed, ~50KB).

**JSON shape:**

```json
{
  "C":     { "frets": [-1,3,2,0,1,0], "fingers": [0,3,2,0,1,0], "baseFret": 1, "barres": [] },
  "Cm":    { "frets": [-1,3,5,5,4,3], "fingers": [0,1,3,4,2,1], "baseFret": 3, "barres": [3] },
  "Cadd9": { "frets": [-1,3,2,0,3,0], "fingers": [0,2,1,0,3,0], "baseFret": 1, "barres": [] }
}
```

Field meanings (following @tombatossals convention):
- `frets[0..5]` — strings low E → high e; `-1`=muted, `0`=open, `n`=fret relative to `baseFret`
- `fingers[0..5]` — `0`=open/no finger, `1`=index, `2`=middle, `3`=ring, `4`=pinky
- `baseFret` — fret number of the topmost drawn fret row; `1` means the chord is at the nut
- `barres` — relative fret numbers where a full-width barre is used

---

## Lookup Function

**File:** `src/lib/chords/chordFingering.js` (replaces `chordSprite.js`)

```js
import fingerings from './chordFingerings.json'

const ROOT_ALIAS = { 'G#':'Ab', 'C#':'Db', 'Gb':'F#', 'D#':'Eb', 'A#':'Bb' }
const SUFFIX_ALIAS = { 'sus4':'sus', 'min':'m' }

export function chordFingering(chord) {
  // 1. Try full chord name first (handles slash chords with dedicated voicings)
  if (fingerings[chord]) return fingerings[chord]

  // 2. Strip slash bass note, apply aliases, try root+suffix
  const noSlash = chord.includes('/') ? chord.slice(0, chord.indexOf('/')) : chord
  const match = noSlash.match(/^([A-G][b#]?)(.*)$/)
  if (!match) return null
  let [, root, suffix] = match
  root = ROOT_ALIAS[root] ?? root
  suffix = SUFFIX_ALIAS[suffix] ?? suffix
  const key = suffix ? `${root}${suffix}` : root
  return fingerings[key] ?? null
}
```

---

## SVG Renderer

**File:** `src/components/Chords/ChordDiagramSVG.jsx` (replaces `ChordDiagram.jsx` + `SlashChordDiagram`)

**Props:** `{ fingering, name }` where `fingering` is a voicing object from `chordFingering()`.

**Dimensions:** 84×116px (matches existing sprite dimensions; ChordStrip layout unchanged).

### Layout

```
y= 0–10   Chord name text, centred, 9px bold
y=11–21   Open ○ / Muted ✕ markers above each string
y=22–26   Nut (thick rect, only when baseFret === 1)
           OR thin top line + "Xfr" label to the right (when baseFret > 1)
y=26–98   Fretboard:
             6 vertical string lines (x = 14, 25, 36, 47, 58, 69)
             4 horizontal fret lines (y = 44, 62, 80, 98)
             Fret row centres: y = 35, 53, 71, 89
y=98–116  Bottom padding
```

### Elements

| Element | Condition | Rendering |
|---|---|---|
| Chord name | always | `<text>` centred at top |
| Nut | `baseFret === 1` | `<rect>` 4px tall across all strings |
| Top line | `baseFret > 1` | 1px `<line>` across all strings |
| Fret label | `baseFret > 1` | `<text>` "Xfr" at right edge, y=38 |
| String lines | always | 6 vertical 1px `<line>` elements |
| Fret lines | always | 4 horizontal 0.75px `<line>` elements |
| Barre bar | `barres.length > 0` | Rounded `<rect>` spanning barred strings |
| Barre finger # | `barres.length > 0` | `<text>` centred in barre bar |
| Finger dot | non-open, non-muted, non-barre | `<circle>` at fret row centre |
| Finger # in dot | finger > 0 | `<text>` centred in dot |
| Open marker | `frets[i] === 0` | Unfilled `<circle>` above nut |
| Muted marker | `frets[i] === -1` | Two crossing `<line>` elements forming ✕ |

### Dark Mode

All colours use Tailwind `fill-*` and `stroke-*` classes with `dark:` variants. No
JavaScript colour logic inside the component. The `.dark` class on the surrounding container
drives all colour changes.

| Element | Light | Dark |
|---|---|---|
| Chord name | `fill-gray-900` | `dark:fill-gray-50` |
| Nut | `fill-gray-900` | `dark:fill-gray-100` |
| String / fret lines | `stroke-gray-500` | `dark:stroke-gray-500` |
| Fret lines | `stroke-gray-300` | `dark:stroke-gray-700` |
| Dot fill | `fill-gray-800` | `dark:fill-gray-200` |
| Dot text | `fill-white` | `dark:fill-gray-900` |
| Open marker stroke | `stroke-gray-600` | `dark:stroke-gray-400` |
| Muted marker | `stroke-gray-500` | `dark:stroke-gray-500` |

---

## ChordStrip Changes

**File:** `src/components/Chords/ChordStrip.jsx`

`extractUniqueChords` simplifies: call `chordFingering(chord)` — if it returns a voicing,
include the chord; otherwise skip. The `kind:'slash'` / `kind:'sprite'` branches and all
related imports are removed.

```jsx
// Render — before
{item.kind === 'slash'
  ? <SlashChordDiagram imgSrc={item.imgSrc} name={item.name} />
  : <ChordDiagram sprite={item.sprite} />
}

// Render — after
<ChordDiagramSVG fingering={item.fingering} name={item.name} />
```

---

## Files Changed

### Added
| File | Purpose |
|---|---|
| `scripts/extractChordFingerings.mjs` | Dev-time data extraction (not shipped) |
| `src/lib/chords/chordFingerings.json` | Committed fingering data (~50KB) |
| `src/lib/chords/chordFingering.js` | Chord-name-to-voicing lookup |
| `src/components/Chords/ChordDiagramSVG.jsx` | SVG renderer |

### Modified
| File | Change |
|---|---|
| `src/components/Chords/ChordStrip.jsx` | Use new lookup + renderer; drop slash branch |
| `package.json` | `@tombatossals/chords-db` as devDependency |

### Deleted
| File | Replaced by |
|---|---|
| `src/lib/chords/chordSprite.js` | `chordFingering.js` |
| `src/lib/chords/slashChordImages.js` | Fingering JSON |
| `src/components/Chords/ChordDiagram.jsx` | `ChordDiagramSVG.jsx` |
| `public/guitar-chord-chart.png` | Fingering JSON |
| `public/slash-chords/*.png` (12 files) | Fingering JSON |

---

## Verification Checklist

- [ ] C, F (barre), Am7, G/B, Cadd9, Bm render correctly in browser
- [ ] Dark mode toggle changes all SVG colours correctly
- [ ] ChordStrip shows correct unique chords for El_Shaddai.sbp
- [ ] Transposing a song updates chord diagrams correctly
- [ ] Previously-unsupported chords (add9, 7sus4, m9) now display a diagram
- [ ] `vite build` output is smaller (PNG assets gone)
- [ ] No console errors; no broken imports
