# Annotation Layer — Design Spec

**Date:** 2026-04-19
**Status:** Approved

## Context

Worship leaders need to attach contextual notes to songs — e.g. "xx and yy to sing this" next to a chorus header, "sing this twice" next to a verse, or "sing in a happy mood" near the title. These annotations travel with the song when shared and must be toggleable so they can be hidden during performance if desired.

---

## Token Syntax

Annotations are written in the song editor as `{note: text}` on its own line, immediately below the element they annotate. This is consistent with the existing `{c: Section}` token style.

**Rule:** A `{note:}` line always annotates the element immediately above it.

```
{c: Verse 1}
{note: only xx to sing this verse}  ← section-level annotation

[Am]Amazing [F]grace how [C]sweet the [G]sound
[Am]That saved a [F]wretch like [C]me
{note: sing softly here}            ← line-level annotation (annotates line above)
```

Song-level annotation is entered separately in the "Song Note" MetaField — it does not use the `{note:}` token in `rawText`.

**Consecutive `{note:}` lines:** Only the first `{note:}` after an element is used. Subsequent consecutive `{note:}` lines are ignored by the parser.

The `{note:}` token is consumed by the parser and never rendered as a content line.

---

## Data Model

### Parsed Structures

`contentParser.js` attaches an optional `annotation` string to sections and lines:

```javascript
// Section
{
  label: 'Chorus',
  annotation: 'xx and yy to sing this',  // null if no {note:} follows {c:}
  lines: [...]
}

// Line
{
  type: 'lyric',
  content: 'That saved a wretch like me',
  chords: [...],
  annotation: 'sing softly here'  // null if no {note:} follows this line
}
```

`{note:}` immediately after `{c: Section}` → `section.annotation`.
`{note:}` after any content line → `line.annotation`.

### Song-Level Annotation

Stored as `meta.annotation` (optional string). Edited via a new "Song Note" plain-text input in `MetaFields.jsx`. Not stored as a `{note:}` token in `rawText`.

---

## Rendering

### Annotation Visibility Toggle

- A speech-bubble icon button in `SongHeader.jsx`, beside the existing controls
- Toggles global `songsheet_annotations_visible` boolean in localStorage via `useLocalStorage`
- Default: `true` (annotations visible)
- Persists across songs and sessions
- **Live Session override:** annotations always render in the session viewer regardless of toggle — the session display path hardcodes `annotationsVisible={true}`

### Display Style

All annotations render as small italicised grey text inline after their element:

| Level | Location | Style |
|-------|----------|-------|
| Song | Below title/artist in `SongHeader.jsx` | `text-sm italic text-gray-400` |
| Section | Same line as header, after a dash | e.g. **Chorus** *— xx and yy to sing this* |
| Line | End of lyric/chord line, after a dash | e.g. *Amazing grace...* *— sing softly here* |

When `annotationsVisible` is `false`, all three levels are hidden.

---

## Editor Changes

**`SongEditor.jsx`** — hint text updated:
> `{c: Section}` for headers · `[Chord]` before a syllable · `{note: text}` for annotations

**`MetaFields.jsx`** — new "Song Note" plain-text input field added below existing metadata fields. Reads/writes `meta.annotation`.

---

## Export Behaviour

### SBP Export (`exportSbp.js`)

- **Line/section annotations:** `{note:}` lines stripped from `content` before writing to the ZIP so SongBook Pro sees clean content:
  ```js
  content = content.replace(/^\{note:[^}]*\}\s*$/gm, '').replace(/\n{2,}/g, '\n\n').trim()
  ```
- **Song-level annotation:** `meta.annotation` maps to the existing `NotesText` field in the SBP JSON (currently always `''`). Annotations are visible as notes in SongBook Pro.

### PDF Export (`exportPdf.js`)

- `section.annotation` renders as small italic grey text after the section header line
- `line.annotation` renders as small italic grey text after the lyric line
- Caller passes `annotationsVisible` flag; when `false`, annotations are suppressed from the PDF
- `meta.annotation` renders below the song title/artist block

### Share via Link & Live Session

- **Share via link:** No changes. `rawText` (including `{note:}` tokens) is encoded as-is; recipient imports with annotations intact
- **Live Session:** Annotations always visible regardless of recipient's toggle

---

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/parser/contentParser.js` | Parse `{note:}` tokens; attach `annotation` to sections and lines |
| `src/components/SongEditor/MetaFields.jsx` | Add "Song Note" text input for `meta.annotation` |
| `src/components/SongEditor/SongEditor.jsx` | Update hint text to include `{note: text}` |
| `src/components/SongList/SongHeader.jsx` | Add annotation visibility toggle icon; render `meta.annotation`; accept `annotationsVisible` prop |
| `src/components/SongList/SongBody.jsx` | Render `section.annotation` and `line.annotation` when visible |
| `src/lib/exportSbp.js` | Strip `{note:}` from content; map `meta.annotation` to `NotesText` |
| `src/lib/exportPdf.js` | Render annotations; accept `annotationsVisible` flag |
| `src/lib/storage.js` | No change needed — `meta.annotation` serialises as part of the song object automatically |

---

## Testing

| Scope | What to test |
|-------|-------------|
| `contentParser` unit | `{note:}` after `{c:}` → `section.annotation`; `{note:}` after lyric line → `line.annotation`; consecutive notes; note at start/end of section; no note → `null` |
| `exportSbp` unit | `{note:}` lines stripped from content; `meta.annotation` written to `NotesText` |
| `exportPdf` unit | Annotations render when `annotationsVisible=true`; suppressed when `false` |
| `SongHeader` component | Toggle click flips `songsheet_annotations_visible` in localStorage |
| `SongBody` component | Annotation text visible when flag true; hidden when false |
| `MetaFields` component | "Song Note" input reads/writes `meta.annotation` |
