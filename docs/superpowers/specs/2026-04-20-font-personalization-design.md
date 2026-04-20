# Font Personalization — Design Spec

**Date:** 2026-04-20  
**Status:** Implemented

## Problem

All typography in song charts (lyrics, chords, section headers, annotations) is hardcoded. Users have no control over font family, size, or color, making the app less adaptable to personal reading preferences or stage use.

## Solution

Per-element typography settings stored in localStorage and applied as CSS custom properties on `<html>`. A new Display tab in Settings provides accordion-style controls for all four element types.

---

## Elements & Defaults

| Element     | Font           | Size/Offset | Color     |
|-------------|----------------|-------------|-----------|
| Lyrics      | System Default | 16px        | `#374151` |
| Chords      | Menlo          | −3px offset | `#6366f1` |
| Sections    | System Default | 12px        | `#6366f1` |
| Annotations | System Default | 12px        | `#9ca3af` |

Chord size is a relative offset from lyrics size (e.g. −3 means lyrics − 3px), so resizing lyrics with the existing +/− buttons keeps chord size proportional.

---

## Architecture

### CSS Custom Properties (set on `<html>`)

```
--lyrics-font / --lyrics-size / --lyrics-color / --lyrics-color-dark
--chord-font / --chord-size-offset / --chord-color / --chord-color-dark
--section-font / --section-size / --section-color / --section-color-dark
--annotation-font / --annotation-size / --annotation-color / --annotation-color-dark
```

Two additional CSS rules in `index.css` make dark mode automatic:

```css
:root  { --lyrics-color-active: var(--lyrics-color);      /* + chord, section, annotation */ }
.dark  { --lyrics-color-active: var(--lyrics-color-dark); /* + chord, section, annotation */ }
```

Components reference `var(--x-color-active)` — no JS theme-switching logic needed.

### Dark mode color computation

One color is stored per element. The dark variant is computed in JS (HSL lightness +30%, clamped to 92%) and written to `--x-color-dark` alongside `--x-color`. Both CSS vars are updated on every change.

### `--lyrics-size` sync

`SongList.jsx` sets `--lyrics-size` from the `fontSize` prop whenever it changes. This ensures the chord size offset formula (`calc(var(--lyrics-size) + var(--chord-size-offset))`) always tracks the floating +/− buttons.

---

## localStorage Keys

```
songsheet_display_lyrics      → { font, color }
songsheet_display_chords      → { font, sizeOffset, color }
songsheet_display_sections    → { font, size, color }
songsheet_display_annotations → { font, size, color }
```

Lyrics size is not stored here — it lives in the existing `songsheet_font_size` key, controlled by the floating +/− buttons in `MainContent.jsx`.

---

## Font Options (system fonts only)

System Default, Georgia, Times New Roman, Helvetica Neue, Arial, Courier New, Menlo, Monaco

---

## UI — Display Tab

Settings panel gains a General / Display tab switcher. The Display tab contains four expandable accordion rows.

**Collapsed:** one-line summary — `⬤ System · 16px ▾`

**Expanded:**
- Font `<select>` (8 system font options)
- Size stepper: `−` `16px` `+` (lyrics/sections/annotations = absolute px; chords = offset −8 to 0)
- Color row: 6 curated swatches (`#374151`, `#6366f1`, `#10b981`, `#f59e0b`, `#ef4444`, `#9ca3af`) + rainbow custom swatch that opens native `<input type="color">`

Reset to defaults link at bottom.

---

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useDisplaySettings.js` | New — hook, lightenColor, applyToDOM |
| `src/components/Settings/DisplayTab.jsx` | New — accordion UI |
| `src/index.css` | Added dark-mode CSS variable switching rules |
| `src/App.jsx` | Calls useDisplaySettings, passes props to SettingsPanel |
| `src/components/Settings/SettingsPanel.jsx` | Tab switcher, renders DisplayTab |
| `src/components/SongList/SongBody.jsx` | CSS vars replace hardcoded colors/fonts |
| `src/components/SongList/SongList.jsx` | Sets `--lyrics-size` from fontSize prop |
