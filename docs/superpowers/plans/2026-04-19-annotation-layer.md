# Annotation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `{note: text}` annotation token to the song editor that renders inline grey italic text at song, section, and line level — with a global visibility toggle persisted in localStorage.

**Architecture:** Annotations are written as `{note: text}` on their own line in the rawText editor; the parser attaches them to the element immediately above. A `meta.annotation` field in the song metadata holds the song-level note. A global `songsheet_annotations_visible` localStorage key controls visibility everywhere; Live Session always shows annotations regardless.

**Tech Stack:** React 18, Vitest + @testing-library/react, jsPDF (mocked in tests), JSZip, Zustand, useLocalStorage hook

---

## File Map

| File | Action |
|------|--------|
| `src/lib/parser/contentParser.js` | Modify — parse `{note:}` tokens, attach `annotation` to sections and lines |
| `src/lib/parser/__tests__/contentParser.test.js` | Modify — add `{note:}` parsing tests |
| `src/components/SongEditor/MetaFields.jsx` | Modify — add "Song Note" text input |
| `src/components/SongEditor/__tests__/MetaFields.test.jsx` | Create — test Song Note field |
| `src/components/SongEditor/SongEditor.jsx` | Modify — update hint text |
| `src/components/SongList/SongHeader.jsx` | Modify — add toggle button, render `meta.annotation` |
| `src/components/SongList/__tests__/SongHeader.test.jsx` | Create — test toggle and annotation display |
| `src/components/SongList/SongBody.jsx` | Modify — render `section.annotation` and `line.annotation` |
| `src/components/SongList/__tests__/SongBody.test.jsx` | Create — test annotation rendering |
| `src/components/SongList/SongList.jsx` | Modify — add `useLocalStorage` for toggle, wire props |
| `src/components/Session/SessionView.jsx` | Modify — add `annotationsVisible={true}` to `SongBody` |
| `src/lib/exportSbp.js` | Modify — strip `{note:}`, map `meta.annotation` → `NotesText` |
| `src/test/exportSbp.test.js` | Modify — add annotation-related tests |
| `src/lib/exportPdf.js` | Modify — render annotations, accept `annotationsVisible` flag |
| `src/lib/__tests__/exportPdf.test.js` | Create — test annotation rendering and suppression |

---

## Task 1: Parser — `{note:}` token support

**Files:**
- Modify: `src/lib/parser/contentParser.js`
- Modify: `src/lib/parser/__tests__/contentParser.test.js`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/parser/__tests__/contentParser.test.js`:

```js
describe('{note:} annotation tokens', () => {
  it('attaches note after {c:} to section.annotation', () => {
    const sections = parseContent('{c: Chorus}\n{note: sing twice}\nHello world')
    expect(sections[0].annotation).toBe('sing twice')
    expect(sections[0].lines[0].content).toBe('Hello world')
  })

  it('attaches note after a lyric line to line.annotation', () => {
    const sections = parseContent('{c: Verse}\nAmazing grace\n{note: sing softly}')
    expect(sections[0].lines[0].annotation).toBe('sing softly')
  })

  it('does not attach note after a blank line', () => {
    const sections = parseContent('{c: Verse}\nHello\n\n{note: orphan}')
    expect(sections[0].lines[0].annotation).toBeNull()
    expect(sections[0].lines[1].type).toBe('blank')
    expect(sections[0].lines[1].annotation).toBeNull()
  })

  it('ignores consecutive {note:} lines — only first consumed', () => {
    const sections = parseContent('{c: Chorus}\n{note: first}\n{note: second}\nLyrics')
    expect(sections[0].annotation).toBe('first')
    expect(sections[0].lines[0].content).toBe('Lyrics')
    expect(sections[0].lines[0].annotation).toBeNull()
  })

  it('returns annotation: null when no note follows', () => {
    const sections = parseContent('{c: Verse}\nHello world')
    expect(sections[0].annotation).toBeNull()
    expect(sections[0].lines[0].annotation).toBeNull()
  })

  it('note text is trimmed', () => {
    const sections = parseContent('{c: Verse}\n{note:   padded text   }')
    expect(sections[0].annotation).toBe('padded text')
  })

  it('all existing lines still have annotation: null', () => {
    const sections = parseContent('{c: Verse}\nHello [G]world\n\nNext line')
    expect(sections[0].lines[0].annotation).toBeNull()
    expect(sections[0].lines[1].annotation).toBeNull() // blank
    expect(sections[0].lines[2].annotation).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- contentParser
```
Expected: multiple FAIL — `annotation` not defined on sections/lines.

- [ ] **Step 3: Implement `{note:}` parsing in contentParser.js**

Replace the entire `src/lib/parser/contentParser.js` with:

```js
const SECTION_RE = /^\{c:\s*(.+?)\s*\}$/
const NOTE_RE = /^\{note:\s*(.*?)\s*\}$/

export function parseContent(content) {
  if (!content) return []

  const rawLines = content.split('\n')
  const sections = []
  let current = null
  let i = 0

  function peekNote() {
    if (i + 1 < rawLines.length) {
      const m = rawLines[i + 1].match(NOTE_RE)
      if (m) { i++; return m[1] }
    }
    return null
  }

  while (i < rawLines.length) {
    const rawLine = rawLines[i]

    // Consume standalone {note:} lines not attached to any element
    if (NOTE_RE.test(rawLine)) {
      i++
      continue
    }

    const sectionMatch = rawLine.match(SECTION_RE)
    if (sectionMatch) {
      const annotation = peekNote()
      current = { label: sectionMatch[1], annotation, lines: [] }
      sections.push(current)
      i++
      continue
    }

    if (!current) {
      current = { label: '', annotation: null, lines: [] }
      sections.push(current)
    }

    if (rawLine.trim() === '') {
      current.lines.push({ type: 'blank', content: '', chords: [], annotation: null })
      i++
      continue
    }

    const line = { ...parseLine(rawLine), annotation: peekNote() }
    current.lines.push(line)
    i++
  }

  return sections
}

function parseLine(rawLine) {
  const chords = []
  let lyric = ''
  let i = 0

  while (i < rawLine.length) {
    if (rawLine[i] === '[') {
      const close = rawLine.indexOf(']', i + 1)
      if (close === -1) {
        lyric += rawLine[i++]
        continue
      }
      const candidate = rawLine.slice(i + 1, close)
      if (isChord(candidate)) {
        chords.push({ chord: candidate, position: lyric.length })
        i = close + 1
      } else {
        lyric += rawLine[i++]
      }
    } else {
      lyric += rawLine[i++]
    }
  }

  const isPureChordLine = lyric.trim() === '' && chords.length > 0

  return {
    type: isPureChordLine ? 'chord' : 'lyric',
    content: isPureChordLine ? '' : lyric,
    chords,
  }
}

const CHORD_RE = /^[A-G][b#]?(?:maj|min|m|M|aug|dim|sus[24]?|add)?[0-9]{0,2}(?:\/[A-G][b#]?)?$/

export function isChord(str) {
  return CHORD_RE.test(str.trim())
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- contentParser
```
Expected: all PASS (new tests + all pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/parser/contentParser.js src/lib/parser/__tests__/contentParser.test.js
git commit -m "feat(parser): add {note:} annotation token support"
```

---

## Task 2: MetaFields — Song Note field

**Files:**
- Modify: `src/components/SongEditor/MetaFields.jsx`
- Create: `src/components/SongEditor/__tests__/MetaFields.test.jsx`

- [ ] **Step 1: Write failing test**

Create `src/components/SongEditor/__tests__/MetaFields.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MetaFields } from '../MetaFields'

const baseMeta = {
  title: 'Amazing Grace',
  artist: 'John Newton',
  key: 'G',
  capo: 0,
  tempo: '',
  timeSignature: '',
  annotation: '',
}

describe('MetaFields', () => {
  it('renders a Song Note input', () => {
    render(<MetaFields meta={baseMeta} onChange={() => {}} />)
    expect(screen.getByLabelText('Song Note')).toBeInTheDocument()
  })

  it('calls onChange with "annotation" key when Song Note is edited', () => {
    const onChange = vi.fn()
    render(<MetaFields meta={baseMeta} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Song Note'), { target: { value: 'sing joyfully' } })
    expect(onChange).toHaveBeenCalledWith('annotation', 'sing joyfully')
  })

  it('displays existing annotation value', () => {
    render(<MetaFields meta={{ ...baseMeta, annotation: 'existing note' }} onChange={() => {}} />)
    expect(screen.getByLabelText('Song Note')).toHaveValue('existing note')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- MetaFields
```
Expected: FAIL — "Song Note" input not found.

- [ ] **Step 3: Add Song Note field to MetaFields.jsx**

Append a new `<label>` block inside the wrapping `<div>` in `MetaFields.jsx`, after the Time Sig label:

```jsx
export function MetaFields({ meta, onChange }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Title</span>
        <input
          type="text"
          value={meta.title ?? ''}
          onChange={e => onChange('title', e.target.value)}
          className={`w-48 ${inputClass}`}
          aria-label="Title"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Artist</span>
        <input
          type="text"
          value={meta.artist ?? ''}
          onChange={e => onChange('artist', e.target.value)}
          className={`w-40 ${inputClass}`}
          aria-label="Artist"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Key</span>
        <select
          value={meta.key ?? 'C'}
          onChange={e => onChange('key', e.target.value)}
          className={inputClass}
          aria-label="Key"
        >
          {KEY_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Capo</span>
        <input
          type="number"
          min={0}
          max={7}
          value={meta.capo ?? 0}
          onChange={e => onChange('capo', Number(e.target.value))}
          className={`w-16 ${inputClass}`}
          aria-label="Capo"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Tempo</span>
        <input
          type="number"
          min={1}
          value={meta.tempo ?? ''}
          onChange={e => onChange('tempo', e.target.value ? Number(e.target.value) : undefined)}
          className={`w-20 ${inputClass}`}
          aria-label="Tempo"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Time Sig</span>
        <input
          type="text"
          value={meta.timeSignature ?? ''}
          onChange={e => onChange('timeSignature', e.target.value || undefined)}
          className={`w-20 ${inputClass}`}
          aria-label="Time Signature"
          placeholder="4/4"
        />
      </label>

      <label className="flex flex-col gap-0.5 w-full">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Song Note</span>
        <input
          type="text"
          value={meta.annotation ?? ''}
          onChange={e => onChange('annotation', e.target.value || undefined)}
          className={`w-full ${inputClass}`}
          aria-label="Song Note"
          placeholder="e.g. sing in a happy mood"
        />
      </label>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- MetaFields
```
Expected: all PASS.

- [ ] **Step 5: Update hint text in SongEditor.jsx**

In `src/components/SongEditor/SongEditor.jsx`, replace the hint paragraph:

```jsx
<p className="text-xs text-gray-400 dark:text-gray-500 mb-1 select-none">
  {'{c: Section}'} for headers · [Chord] before a syllable · {'{note: text}'} for annotations
</p>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/SongEditor/MetaFields.jsx src/components/SongEditor/__tests__/MetaFields.test.jsx src/components/SongEditor/SongEditor.jsx
git commit -m "feat(editor): add Song Note field to MetaFields and {note:} hint to editor"
```

---

## Task 3: SongHeader — visibility toggle and song-level annotation

**Files:**
- Modify: `src/components/SongList/SongHeader.jsx`
- Create: `src/components/SongList/__tests__/SongHeader.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/SongList/__tests__/SongHeader.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongHeader } from '../SongHeader'

const baseProps = {
  meta: { title: 'Amazing Grace', artist: 'John Newton', keyIndex: 7, isMinor: false, capo: 0 },
  transpose: {
    delta: 0,
    capo: 0,
    transposeTo: vi.fn(),
    capoDown: vi.fn(),
    capoUp: vi.fn(),
  },
  lyricsOnly: false,
  onPerformanceMode: vi.fn(),
  onExportPdf: vi.fn(),
  onEdit: vi.fn(),
  onAnnotationsToggle: vi.fn(),
  annotationsVisible: true,
}

describe('SongHeader annotation', () => {
  it('renders song-level annotation when annotationsVisible is true', () => {
    render(<SongHeader {...baseProps} meta={{ ...baseProps.meta, annotation: 'sing joyfully' }} />)
    expect(screen.getByText('sing joyfully')).toBeInTheDocument()
  })

  it('hides song-level annotation when annotationsVisible is false', () => {
    render(<SongHeader {...baseProps} meta={{ ...baseProps.meta, annotation: 'sing joyfully' }} annotationsVisible={false} />)
    expect(screen.queryByText('sing joyfully')).not.toBeInTheDocument()
  })

  it('does not render annotation element when meta.annotation is absent', () => {
    render(<SongHeader {...baseProps} />)
    expect(screen.queryByRole('paragraph', { name: /annotation/i })).not.toBeInTheDocument()
  })

  it('renders the annotations toggle button', () => {
    render(<SongHeader {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Hide annotations' })).toBeInTheDocument()
  })

  it('toggle button shows correct aria-label when annotations hidden', () => {
    render(<SongHeader {...baseProps} annotationsVisible={false} />)
    expect(screen.getByRole('button', { name: 'Show annotations' })).toBeInTheDocument()
  })

  it('clicking toggle button calls onAnnotationsToggle', () => {
    const onAnnotationsToggle = vi.fn()
    render(<SongHeader {...baseProps} onAnnotationsToggle={onAnnotationsToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide annotations' }))
    expect(onAnnotationsToggle).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- SongHeader
```
Expected: FAIL — props not accepted, toggle button not found.

- [ ] **Step 3: Update SongHeader.jsx**

Replace `src/components/SongList/SongHeader.jsx` with:

```jsx
import { useState } from 'react'
import { TransposeControl } from './TransposeControl'

export function SongHeader({ meta, transpose, lyricsOnly, onPerformanceMode, onExportPdf, onEdit, headerRef, annotationsVisible = true, onAnnotationsToggle }) {
  const [infoOpen, setInfoOpen] = useState(false)

  const hasInfo = meta.tempo || meta.timeSignature || meta.capo > 0 || meta.ccli || meta.copyright

  return (
    <div ref={headerRef} className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-2">
      <h1 className="text-2xl font-bold leading-tight">{meta.title}</h1>
      {meta.artist && (
        <p className="text-gray-500 dark:text-gray-400 mt-0.5">{meta.artist}</p>
      )}
      {annotationsVisible && meta.annotation && (
        <p className="text-sm italic text-gray-400 dark:text-gray-500 mt-0.5">{meta.annotation}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-3">
        {!lyricsOnly && (
          <>
            <TransposeControl
              delta={transpose.delta}
              onTransposeTo={transpose.transposeTo}
              originalKeyIndex={meta.keyIndex}
              isMinor={meta.isMinor}
            />

            <div className="flex items-center gap-1" aria-label="Capo controls">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Capo</span>
              <button
                type="button"
                onClick={transpose.capoDown}
                disabled={transpose.capo === 0}
                className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm leading-none hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Decrease capo"
              >−</button>
              <span className="w-4 text-center text-sm font-mono">{transpose.capo}</span>
              <button
                type="button"
                onClick={transpose.capoUp}
                disabled={transpose.capo === 7}
                className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm leading-none hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Increase capo"
              >+</button>
            </div>
          </>
        )}

        {hasInfo && (
          <button
            type="button"
            onClick={() => setInfoOpen(o => !o)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
            aria-expanded={infoOpen}
          >
            Info {infoOpen ? '▲' : '▼'}
          </button>
        )}

        {lyricsOnly && (
          <button
            type="button"
            onClick={onExportPdf}
            className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            ↓ PDF
          </button>
        )}

        <button
          type="button"
          onClick={onEdit}
          className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          Edit
        </button>

        {onAnnotationsToggle && (
          <button
            type="button"
            onClick={onAnnotationsToggle}
            className={`text-sm px-2 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-gray-400 ${
              annotationsVisible
                ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
            }`}
            aria-label={annotationsVisible ? 'Hide annotations' : 'Show annotations'}
            title={annotationsVisible ? 'Hide annotations' : 'Show annotations'}
          >
            💬
          </button>
        )}

        <button
          type="button"
          onClick={onPerformanceMode}
          className="ml-auto text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          ⛶ Performance
        </button>
      </div>

      {infoOpen && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
          {meta.key && (
            <div><span className="font-medium text-gray-700 dark:text-gray-300">Key:</span> {meta.key}</div>
          )}
          {meta.capo > 0 && (
            <div><span className="font-medium text-gray-700 dark:text-gray-300">Capo:</span> {meta.capo}</div>
          )}
          {meta.tempo && (
            <div><span className="font-medium text-gray-700 dark:text-gray-300">BPM:</span> {meta.tempo}</div>
          )}
          {meta.timeSignature && (
            <div><span className="font-medium text-gray-700 dark:text-gray-300">Time:</span> {meta.timeSignature}</div>
          )}
          {meta.ccli && (
            <div><span className="font-medium text-gray-700 dark:text-gray-300">CCLI:</span> {meta.ccli}</div>
          )}
          {meta.copyright && (
            <div className="col-span-2 text-xs">
              <span className="font-medium text-gray-700 dark:text-gray-300">©</span> {meta.copyright}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- SongHeader
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SongList/SongHeader.jsx src/components/SongList/__tests__/SongHeader.test.jsx
git commit -m "feat(SongHeader): add annotation visibility toggle and song-level annotation display"
```

---

## Task 4: SongBody — section and line annotation rendering

**Files:**
- Modify: `src/components/SongList/SongBody.jsx`
- Create: `src/components/SongList/__tests__/SongBody.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/SongList/__tests__/SongBody.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SongBody } from '../SongBody'

const sections = [
  {
    label: 'Chorus',
    annotation: 'xx and yy to sing this',
    lines: [
      { type: 'lyric', content: 'Amazing grace', chords: [], annotation: 'sing softly' },
      { type: 'lyric', content: 'How sweet the sound', chords: [], annotation: null },
      { type: 'blank', content: '', chords: [], annotation: null },
    ],
  },
]

describe('SongBody annotation rendering', () => {
  it('renders section annotation when annotationsVisible is true', () => {
    render(<SongBody sections={sections} annotationsVisible={true} />)
    expect(screen.getByText('— xx and yy to sing this')).toBeInTheDocument()
  })

  it('renders line annotation when annotationsVisible is true', () => {
    render(<SongBody sections={sections} annotationsVisible={true} />)
    expect(screen.getByText('— sing softly')).toBeInTheDocument()
  })

  it('hides section annotation when annotationsVisible is false', () => {
    render(<SongBody sections={sections} annotationsVisible={false} />)
    expect(screen.queryByText('— xx and yy to sing this')).not.toBeInTheDocument()
  })

  it('hides line annotation when annotationsVisible is false', () => {
    render(<SongBody sections={sections} annotationsVisible={false} />)
    expect(screen.queryByText('— sing softly')).not.toBeInTheDocument()
  })

  it('defaults annotationsVisible to true when prop omitted', () => {
    render(<SongBody sections={sections} />)
    expect(screen.getByText('— xx and yy to sing this')).toBeInTheDocument()
  })

  it('does not render annotation dash when line.annotation is null', () => {
    render(<SongBody sections={sections} annotationsVisible={true} />)
    expect(screen.queryByText('— null')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- SongBody
```
Expected: FAIL — annotation text not found.

- [ ] **Step 3: Update SongBody.jsx**

Replace `src/components/SongList/SongBody.jsx` with:

```jsx
function ChordedLine({ line, fontSize, fitMode }) {
  const text = line.content
  const chords = line.chords ?? []
  const chordFontSize = Math.max(11, (fontSize ?? 16) - 3)

  if (chords.length === 0) {
    return <span>{text}</span>
  }

  const chordAt = new Map(chords.map(({ chord, position }) => [position, chord]))

  const groups = []
  let i = 0
  while (i < text.length) {
    if (text[i] === ' ') {
      if (chordAt.has(i)) {
        groups.push({ type: 'word', parts: [{ type: 'chord', chord: chordAt.get(i), char: ' ', key: i }], key: i })
      } else {
        groups.push({ type: 'space', key: i })
      }
      i++
    } else {
      const groupStart = i
      const parts = []
      let bufStart = i
      let buf = ''
      while (i < text.length && text[i] !== ' ') {
        if (chordAt.has(i)) {
          if (buf) { parts.push({ type: 'text', text: buf, key: bufStart }); buf = '' }
          parts.push({ type: 'chord', chord: chordAt.get(i), char: text[i], key: i })
          bufStart = i + 1
        } else {
          buf += text[i]
        }
        i++
      }
      if (buf) parts.push({ type: 'text', text: buf, key: bufStart })
      groups.push({ type: 'word', parts, key: groupStart })
    }
  }

  for (const { chord, position } of chords) {
    if (position >= text.length) {
      groups.push({ type: 'word', parts: [{ type: 'chord', chord, char: ' ', key: position }], key: position })
    }
  }

  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {groups.map((group) => {
        if (group.type === 'space') {
          return <span key={`sp${group.key}`}> </span>
        }
        return (
          <span key={`w${group.key}`} style={{ whiteSpace: 'nowrap' }}>
            {group.parts.map((part, pi) =>
              part.type === 'text'
                ? <span key={`t${part.key}`}>{part.text}</span>
                : (
                  <span
                    key={`c${part.key}`}
                    className="relative inline-block"
                    style={{
                      paddingTop: '1.3em',
                      ...((part.char === ' ' || pi === group.parts.length - 1)
                        ? { minWidth: `${part.chord.length * 0.7 + 0.3}em` }
                        : {}),
                    }}
                  >
                    <span
                      className="absolute top-0 left-0 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap select-none"
                      style={fitMode
                        ? { fontSize: 'max(11px, calc(var(--fit-fs, 16px) - 3px))', lineHeight: 1.2 }
                        : { fontSize: chordFontSize, lineHeight: 1.2 }
                      }
                      aria-hidden="true"
                    >
                      {part.chord}
                    </span>
                    {part.char === ' ' ? '\u00A0' : part.char}
                  </span>
                )
            )}
          </span>
        )
      })}
    </span>
  )
}

function SongSection({ section, fontSize, performanceMode, lyricsOnly, fitMode, annotationsVisible }) {
  const lines = section.lines

  const absorbedChordLines = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type === 'chord') {
      let j = i + 1
      while (j < lines.length && lines[j].type === 'blank') j++
      if (j < lines.length && lines[j].type === 'lyric') {
        absorbedChordLines.add(i)
      }
    }
  }

  return (
    <div className="mb-8" data-section>
      {section.label && (
        <h3 className={`font-semibold uppercase tracking-widest mb-3 text-indigo-500 dark:text-indigo-400
          ${performanceMode ? 'text-sm' : 'text-xs'}`}>
          {section.label}
          {annotationsVisible && section.annotation && (
            <span className="ml-2 font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500 italic text-xs">
              — {section.annotation}
            </span>
          )}
        </h3>
      )}
      <div className="space-y-0">
        {lines.map((line, i) => {
          if (line.type === 'blank') {
            return <div key={i} className="h-4" />
          }
          if (line.type === 'chord') {
            if (lyricsOnly) return null
            if (absorbedChordLines.has(i)) return null
            const chords = line.chords ?? []
            let lineStr = ''
            for (const { chord, position } of chords) {
              while (lineStr.length < position) lineStr += ' '
              lineStr += chord
              lineStr += ' '
            }
            return (
              <div
                key={i}
                className="font-mono font-bold text-indigo-600 dark:text-indigo-400 leading-none mb-1 whitespace-pre"
                style={fitMode
                  ? { fontSize: 'max(12px, calc(var(--fit-fs, 16px) - 2px))' }
                  : { fontSize: Math.max(12, (fontSize ?? 16) - 2) }
                }
                aria-hidden="true"
              >
                {lineStr}
              </div>
            )
          }
          let effectiveChords = line.chords ?? []
          let j = i - 1
          while (j >= 0 && lines[j].type === 'blank') j--
          if (j >= 0 && lines[j].type === 'chord' && absorbedChordLines.has(j)) {
            const merged = [...(lines[j].chords ?? []), ...effectiveChords]
            merged.sort((a, b) => a.position - b.position)
            effectiveChords = merged
          }
          const chordsForLine = lyricsOnly ? [] : effectiveChords
          const effectiveLine = { ...line, chords: chordsForLine }
          return (
            <div
              key={i}
              className="leading-relaxed"
              style={fitMode ? { fontSize: 'var(--fit-fs, 16px)' } : { fontSize }}
            >
              <ChordedLine line={effectiveLine} fontSize={fontSize} fitMode={fitMode} />
              {annotationsVisible && line.annotation && (
                <span className="ml-2 text-xs italic text-gray-400 dark:text-gray-500">
                  — {line.annotation}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SongBody({ sections, fontSize = 16, performanceMode = false, lyricsOnly = false, fitMode = false, fitColumns, annotationsVisible = true }) {
  if (!sections?.length) return null
  return (
    <div
      className="py-4"
      style={fitMode && fitColumns ? { columnCount: fitColumns } : undefined}
    >
      {sections.map((section, i) => (
        <SongSection
          key={i}
          section={section}
          fontSize={fontSize}
          performanceMode={performanceMode}
          lyricsOnly={lyricsOnly}
          fitMode={fitMode}
          annotationsVisible={annotationsVisible}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- SongBody
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SongList/SongBody.jsx src/components/SongList/__tests__/SongBody.test.jsx
git commit -m "feat(SongBody): render section and line annotations with visibility flag"
```

---

## Task 5: SongList — wire up `annotationsVisible`

**Files:**
- Modify: `src/components/SongList/SongList.jsx`

- [ ] **Step 1: Update SongList.jsx to add the toggle state and wire all props**

Replace the contents of `src/components/SongList/SongList.jsx` with:

```jsx
import { useRef } from 'react'
import { useTranspose } from '../../hooks/useTranspose'
import { useFitToScreen } from '../../hooks/useFitToScreen'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { SongHeader } from './SongHeader'
import { SongBody } from './SongBody'
import { ChordStrip } from '../Chords/ChordStrip'
import { exportLyricsPdf } from '../../lib/exportPdf'

export function SongList({
  song,
  onPerformanceMode,
  lyricsOnly = false,
  fontSize = 16,
  onFontSizeChange,
  chordsOpen,
  onChordsToggle,
  onEdit,
  isFit = false,
  containerRef,
}) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats, song.id)
  const bodyRef = useRef(null)
  const { fitFontSize, fitColumns, shadowRef } = useFitToScreen({
    enabled: isFit,
    containerRef,
    bodyRef,
    lyricsOnly,
  })
  const [annotationsVisible, setAnnotationsVisible] = useLocalStorage('songsheet_annotations_visible', true)

  return (
    <div
      className="max-w-2xl mx-auto px-4 py-6 w-full relative"
      style={isFit && fitFontSize ? { '--fit-fs': `${fitFontSize}px` } : undefined}
    >
      <SongHeader
        meta={song.meta}
        transpose={transpose}
        lyricsOnly={lyricsOnly}
        onPerformanceMode={() => onPerformanceMode(transpose.transposedSections)}
        onExportPdf={() => exportLyricsPdf(song.meta, song.sections, annotationsVisible)}
        onEdit={onEdit}
        annotationsVisible={annotationsVisible}
        onAnnotationsToggle={() => setAnnotationsVisible(!annotationsVisible)}
      />
      {!lyricsOnly && (
        <ChordStrip
          sections={transpose.transposedSections}
          open={chordsOpen}
          onToggle={onChordsToggle}
        />
      )}
      <div ref={bodyRef}>
        <SongBody
          sections={transpose.transposedSections}
          fontSize={fontSize}
          lyricsOnly={lyricsOnly}
          fitMode={isFit && fitFontSize !== null}
          fitColumns={fitColumns}
          annotationsVisible={annotationsVisible}
        />
      </div>
      {isFit && (
        <div
          ref={shadowRef}
          style={{
            position: 'absolute',
            top: '-9999px',
            left: '1rem',
            visibility: 'hidden',
            width: 'calc(100% - 2rem)',
            overflow: 'hidden',
          }}
        >
          <SongBody
            sections={transpose.transposedSections}
            fontSize={fontSize}
            lyricsOnly={lyricsOnly}
            fitMode
            annotationsVisible={annotationsVisible}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run full test suite to confirm no regressions**

```bash
npm test
```
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/SongList/SongList.jsx
git commit -m "feat(SongList): wire annotationsVisible toggle through SongHeader and SongBody"
```

---

## Task 6: Live Session — always show annotations

**Files:**
- Modify: `src/components/Session/SessionView.jsx`

- [ ] **Step 1: Add `annotationsVisible={true}` to SongBody in SessionView**

In `src/components/Session/SessionView.jsx`, find the `SongBody` render (line 126):

```jsx
<SongBody sections={transpose.transposedSections} fontSize={15} />
```

Replace with:

```jsx
<SongBody sections={transpose.transposedSections} fontSize={15} annotationsVisible={true} />
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/Session/SessionView.jsx
git commit -m "feat(session): always show annotations in live session view"
```

---

## Task 7: SBP Export — strip `{note:}`, map `meta.annotation` to `NotesText`

**Files:**
- Modify: `src/lib/exportSbp.js`
- Modify: `src/test/exportSbp.test.js`

- [ ] **Step 1: Write failing tests**

Add to the `describe('buildSbpZip / exportSongsAsSbp', ...)` block in `src/test/exportSbp.test.js`:

```js
it('strips {note:} lines from exported content', async () => {
  const songWithNotes = {
    meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0 },
    rawText: '{c: Verse}\n{note: sing twice}\nHello world\n{note: softly}',
  }
  const { json } = await parseZip([songWithNotes])
  expect(json.songs[0].content).not.toContain('{note:')
  expect(json.songs[0].content).toContain('Hello world')
  expect(json.songs[0].content).toContain('{c: Verse}')
})

it('maps meta.annotation to NotesText', async () => {
  const songWithAnnotation = {
    meta: { title: 'Test', artist: 'Artist', keyIndex: 0, capo: 0, annotation: 'sing joyfully' },
    rawText: '{c: Verse}\nHello world',
  }
  const { json } = await parseZip([songWithAnnotation])
  expect(json.songs[0].NotesText).toBe('sing joyfully')
})

it('writes empty string to NotesText when meta.annotation is absent', async () => {
  const { json } = await parseZip([mockSong])
  expect(json.songs[0].NotesText).toBe('')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- exportSbp
```
Expected: FAIL — `{note:}` not stripped, `NotesText` not populated.

- [ ] **Step 3: Update exportSbp.js**

Add `stripNoteTokens` helper and update `songToSbpJson` in `src/lib/exportSbp.js`:

After the `buildDeepSearch` function, add:

```js
function stripNoteTokens(content) {
  return content
    .replace(/^\{note:[^}]*\}\s*$/gm, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim()
}
```

In `songToSbpJson`, update the `content` assignment and `NotesText` field:

For the `hasSbpRoundTrip` branch, change:
```js
content = meta.sbpOriginalContent ?? rawText ?? ''
```
to:
```js
content = stripNoteTokens(meta.sbpOriginalContent ?? rawText ?? '')
```

For the non-round-trip branch, change:
```js
content = rawText ?? ''
```
to:
```js
content = stripNoteTokens(rawText ?? '')
```

And in the returned object, change:
```js
NotesText: '',
```
to:
```js
NotesText: meta.annotation ?? '',
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- exportSbp
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportSbp.js src/test/exportSbp.test.js
git commit -m "feat(exportSbp): strip {note:} tokens and map meta.annotation to NotesText"
```

---

## Task 8: PDF Export — render annotations

**Files:**
- Modify: `src/lib/exportPdf.js`
- Create: `src/lib/__tests__/exportPdf.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/exportPdf.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportLyricsPdf } from '../exportPdf'

const mockDoc = {
  internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
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

const meta = { title: 'Amazing Grace', artist: 'John Newton', annotation: 'sing joyfully' }

const sections = [
  {
    label: 'Verse 1',
    annotation: 'only leader sings',
    lines: [
      { type: 'lyric', content: 'Amazing grace', chords: [], annotation: 'softly' },
      { type: 'lyric', content: 'How sweet the sound', chords: [], annotation: null },
    ],
  },
]

describe('exportLyricsPdf annotations', () => {
  it('renders song annotation when annotationsVisible is true', () => {
    exportLyricsPdf(meta, sections, true)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).toContain('sing joyfully')
  })

  it('suppresses song annotation when annotationsVisible is false', () => {
    exportLyricsPdf(meta, sections, false)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).not.toContain('sing joyfully')
  })

  it('renders section annotation when annotationsVisible is true', () => {
    exportLyricsPdf(meta, sections, true)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).toContain('— only leader sings')
  })

  it('suppresses section annotation when annotationsVisible is false', () => {
    exportLyricsPdf(meta, sections, false)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).not.toContain('— only leader sings')
  })

  it('renders line annotation when annotationsVisible is true', () => {
    exportLyricsPdf(meta, sections, true)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).toContain('— softly')
  })

  it('suppresses line annotation when annotationsVisible is false', () => {
    exportLyricsPdf(meta, sections, false)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).not.toContain('— softly')
  })

  it('defaults to showing annotations when annotationsVisible omitted', () => {
    exportLyricsPdf(meta, sections)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).toContain('sing joyfully')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- exportPdf
```
Expected: FAIL — annotation text not rendered.

- [ ] **Step 3: Update exportPdf.js**

Replace `src/lib/exportPdf.js` with:

```js
import jsPDF from 'jspdf'

export function exportLyricsPdf(meta, sections, annotationsVisible = true) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 50
  const maxW = pageW - margin * 2

  let y = 60

  // ── Title ──────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  const titleLines = doc.splitTextToSize(meta.title ?? 'Untitled', maxW)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 26

  // ── Artist ─────────────────────────────────────────────
  if (meta.artist) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(13)
    doc.setTextColor(100, 100, 100)
    doc.text(meta.artist, margin, y)
    doc.setTextColor(0, 0, 0)
    y += 18
  }

  // ── Song-level annotation ──────────────────────────────
  if (annotationsVisible && meta.annotation) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(11)
    doc.setTextColor(140, 140, 140)
    const annotLines = doc.splitTextToSize(meta.annotation, maxW)
    doc.text(annotLines, margin, y)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
    y += annotLines.length * 14
  }

  // ── Divider gap ────────────────────────────────────────
  y += 14

  // ── Sections ───────────────────────────────────────────
  for (const section of sections ?? []) {
    if (section.label) {
      if (y > 90) y += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 180)
      doc.text(section.label.toUpperCase(), margin, y)
      doc.setTextColor(0, 0, 0)
      y += 14

      // Section-level annotation
      if (annotationsVisible && section.annotation) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.setTextColor(140, 140, 140)
        doc.text('— ' + section.annotation, margin + 4, y)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        y += 12
      }
    }

    for (const line of section.lines ?? []) {
      if (line.type === 'chord') continue

      if (line.type === 'blank') {
        y += 8
        continue
      }

      // Lyric line
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      const wrapped = doc.splitTextToSize(line.content ?? '', maxW)
      wrapped.forEach(textLine => {
        if (y > pageH - margin) {
          doc.addPage()
          y = margin + 10
        }
        doc.text(textLine, margin, y)
        y += 16
      })

      // Line-level annotation
      if (annotationsVisible && line.annotation) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.setTextColor(140, 140, 140)
        doc.text('— ' + line.annotation, margin + 4, y)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        y += 12
      }
    }

    y += 6
  }

  const safeName = (meta.title ?? 'song').replace(/[^a-z0-9]/gi, '_')
  doc.save(`${safeName}.pdf`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- exportPdf
```
Expected: all PASS.

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
npm test
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exportPdf.js src/lib/__tests__/exportPdf.test.js
git commit -m "feat(exportPdf): render annotations in PDF with annotationsVisible flag"
```

---

## Verification

After all tasks are complete:

1. **Start dev server:** `npm run dev`
2. **Open a song** — you should see the 💬 button in the song header controls
3. **Edit a song** — type `{note: sing twice}` on its own line below `{c: Chorus}`, save
4. **Verify** section annotation appears as grey italic text after "CHORUS"
5. **Add** `{note: sing softly}` after a lyric line — verify it appears inline
6. **Edit MetaFields** — add a Song Note — verify it appears below the artist name
7. **Toggle 💬 button** — all annotations should hide/show; refresh and confirm state persists
8. **Export SBP** — open in SongBook Pro, verify no `{note:}` in content, song note visible in Notes
9. **Export PDF** (lyrics only mode) — verify annotations appear; toggle off and re-export to confirm suppression
