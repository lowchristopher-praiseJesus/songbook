# Chord Diagram Strip — Design Doc
_Date: 2026-02-27_

## Overview

Show guitar chord fingering diagrams at the top of each song (collapsible strip), sourced from a single sprite PNG already in the repo. Diagrams update live when the song is transposed. Appears in both the regular song view and Performance Mode.

---

## Sprite Calibration

Source: `public/guitar-chord-chart.png` (1000 × 1545 px)

Each chord is cropped centered on its diagram box:

- **Crop size:** 84 × 116 px (fixed for all chords)
- **cropX per column:** `[60, 140, 220, 300, 380, 460, 539, 618, 698, 778, 858]`
- **cropY per row:** `83 + row × 116`

CSS sprite technique:
```css
background-image: url('/guitar-chord-chart.png');
background-size: 1000px 1545px;
background-position: -{cropX}px -{cropY}px;
width: 84px;
height: 116px;
```

---

## Chord Grid

**12 root rows (indices 0–11):**
Ab, A, Bb, B, C, Db, D, Eb, E, F, F#, G

**11 type columns (indices 0–10):**
`''` (major), `m`, `6`, `7`, `9`, `m6`, `m7`, `maj7`, `dim`, `+`, `sus`

**Enharmonic aliases** (mapped before lookup):
- G# → Ab, C# → Db, Gb → F#, D# → Eb, A# → Bb

**Suffix normalisation:**
- `sus4` → `sus`, `min` → `m`
- Slash chords: strip bass note (`G/B` → `G`)
- Unrecognised chords: silently skipped (no diagram shown)

---

## Architecture

### New files

| File | Purpose |
|---|---|
| `src/lib/chords/chordSprite.js` | `chordToSprite(name)` → `{x, y}` or `null` |
| `src/components/Chords/ChordDiagram.jsx` | 84×116 div with CSS background-position |
| `src/components/Chords/ChordStrip.jsx` | Collapsible, horizontally-scrollable strip |

### Modified files

| File | Change |
|---|---|
| `public/guitar-chord-chart.png` | Copy image to public/ for static serving |
| `src/components/SongSheet/SongSheet.jsx` | Add `<ChordStrip>` between header and body; receive `chordsOpen`/`setChordsOpen` props |
| `src/components/SongSheet/MainContent.jsx` | Own `chordsOpen` state; pass to SongSheet |
| `src/components/PerformanceMode/PerformanceModal.jsx` | Add `<ChordStrip>` below sticky header; own local `chordsOpen` state |

---

## Data Flow

```
transposedSections
      ↓
ChordStrip.extractUniqueChords()
  - walk sections → lines → chords[]
  - strip slash bass (G/B → G)
  - deduplicate (preserve first-occurrence order)
  - for each: chordToSprite() → {x, y} | null
  - skip nulls
      ↓
[ChordDiagram, ChordDiagram, ...]  (horizontal scrollable row)
```

---

## UI / UX

**ChordStrip:**
- Toggle button: `Chords ▾` / `Chords ▴` (inline with label)
- Default state: **open** (expanded)
- Smooth CSS height transition on open/close
- Horizontally scrollable (`overflow-x: auto`) when chords exceed viewport width
- Each chord diagram has its label visible (part of the sprite crop)

**ChordDiagram:**
- 84 × 116 px div, CSS sprite background
- No extra label (already embedded in the sprite)
- Slight gap between diagrams

**Collapse state ownership:**
- Regular view: `chordsOpen` state in `MainContent.jsx` — persists as the user navigates between songs
- Performance Mode: local state inside `PerformanceModal` — resets per song (acceptable)

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Chord not in sprite map | Silently skipped |
| Slash chord (G/B) | Show root (G) diagram |
| Song has no chords | Strip renders nothing (no toggle shown) |
| `lyricsOnly` mode | Strip still shown (chords are useful reference even in lyrics-only) |
| Song transposed | `transposedSections` already contains updated chord names — no extra work needed |
