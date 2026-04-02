# Background Image for Presentation PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `Background.png` behind each page of the presentation PDF, allow the user to replace it via a modal that appears when they trigger the export.

**Architecture:** `Background.png` moves to `src/assets/` so Vite manages it. `exportPresentationPdf` accepts a pre-loaded `HTMLImageElement` as a second argument and draws it full-bleed on each page before rendering text. A new `ExportBackgroundModal` component handles image loading (default or user-chosen file), shows a preview, and calls the export function. `Sidebar` opens this modal instead of calling the export directly.

**Tech Stack:** React 18, Vite (asset imports), jsPDF, @testing-library/react, Vitest

---

## Files

| Action | Path |
|---|---|
| Move | `Background.png` → `src/assets/Background.png` |
| Modify | `src/lib/exportPresentationPdf.js` |
| Modify | `src/lib/__tests__/exportPresentationPdf.test.js` |
| Create | `src/components/Sidebar/ExportBackgroundModal.jsx` |
| Create | `src/components/Sidebar/__tests__/ExportBackgroundModal.test.jsx` |
| Modify | `src/components/Sidebar/Sidebar.jsx` |

---

## Task 1: Update `exportPresentationPdf` — accept bgImage, draw background, warm text colours

**Files:**
- Modify: `src/lib/__tests__/exportPresentationPdf.test.js`
- Modify: `src/lib/exportPresentationPdf.js`

- [ ] **Step 1: Add `addImage` to the mockDoc and define `mockBg`**

In `src/lib/__tests__/exportPresentationPdf.test.js`, update the `mockDoc` object to include `addImage`, and add `mockBg` below the mock setup:

```js
const mockDoc = {
  internal: { pageSize: { getWidth: () => 960, getHeight: () => 540 } },
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  text: vi.fn(),
  splitTextToSize: vi.fn((text) => (text ? [text] : [''])),
  addPage: vi.fn(),
  addImage: vi.fn(),
  save: vi.fn(),
}

vi.mock('jspdf', () => ({ default: vi.fn(() => mockDoc) }))

const mockBg = { src: '' }
```

The `beforeEach` already clears all `vi.fn()` instances via `Object.values(mockDoc)` — no changes needed there.

- [ ] **Step 2: Update all existing `exportPresentationPdf` calls to pass `mockBg`**

In the same test file, pass `mockBg` as the second argument to every call. Replace the entire `describe('exportPresentationPdf', ...)` block with:

```js
describe('exportPresentationPdf', () => {
  it('does nothing when songs array is empty', () => {
    exportPresentationPdf([], mockBg)
    expect(mockDoc.save).not.toHaveBeenCalled()
  })

  it('saves a PDF with a date-based filename', () => {
    exportPresentationPdf([makeSong('Amazing Grace', 'John Newton')], mockBg)
    expect(mockDoc.save).toHaveBeenCalledOnce()
    expect(mockDoc.save.mock.calls[0][0]).toMatch(/Presentation.*\.pdf$/)
  })

  it('does not call addPage for a single song', () => {
    exportPresentationPdf([makeSong('Song A', 'Artist')], mockBg)
    expect(mockDoc.addPage).not.toHaveBeenCalled()
  })

  it('calls addPage N-1 times for N songs', () => {
    exportPresentationPdf([
      makeSong('Song A', 'Artist'),
      makeSong('Song B', 'Artist'),
      makeSong('Song C', 'Artist'),
    ], mockBg)
    expect(mockDoc.addPage).toHaveBeenCalledTimes(2)
  })

  it('renders title text for each song', () => {
    exportPresentationPdf([makeSong('My Song', 'My Artist')], mockBg)
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
    expect(() => exportPresentationPdf([song], mockBg)).not.toThrow()
    expect(mockDoc.save).toHaveBeenCalledOnce()
  })

  it('handles songs with no artist gracefully', () => {
    expect(() => exportPresentationPdf([makeSong('No Artist', null)], mockBg)).not.toThrow()
    expect(mockDoc.save).toHaveBeenCalledOnce()
  })

  it('renders all text with centre alignment', () => {
    exportPresentationPdf([makeSong('My Song', 'My Artist')], mockBg)
    const opts = mockDoc.text.mock.calls.map(c => c[3])
    expect(opts.every(o => o?.align === 'center')).toBe(true)
  })

  it('uses two columns when content overflows single-column', () => {
    const song = makeLongSong(4)
    exportPresentationPdf([song], mockBg)
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    expect(xValues).toContain(260)
    expect(xValues).toContain(700)
  })

  it('does not use two-column layout for a short song', () => {
    const song = makeLongSong(2)
    exportPresentationPdf([song], mockBg)
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    expect(xValues).not.toContain(260)
    expect(xValues).not.toContain(700)
  })

  it('uses two columns for a single-section song with many lyric lines', () => {
    const song = makeSingleSectionSong(10)
    exportPresentationPdf([song], mockBg)
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    expect(xValues).toContain(260)
    expect(xValues).toContain(700)
  })

  it('does not split a single-section song with few lyric lines', () => {
    const song = makeSingleSectionSong(2)
    exportPresentationPdf([song], mockBg)
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    expect(xValues).not.toContain(260)
    expect(xValues).not.toContain(700)
  })

  it('draws the background image on every page', () => {
    exportPresentationPdf([
      makeSong('Song A', 'Artist'),
      makeSong('Song B', 'Artist'),
    ], mockBg)
    expect(mockDoc.addImage).toHaveBeenCalledTimes(2)
    expect(mockDoc.addImage).toHaveBeenCalledWith(mockBg, 'PNG', 0, 0, 960, 540)
  })
})
```

- [ ] **Step 3: Run the tests — expect failures**

```bash
npx vitest run src/lib/__tests__/exportPresentationPdf.test.js
```

Expected: the "draws the background image" test fails (`addImage` not called), and all others fail because `exportPresentationPdf` doesn't accept two arguments yet (the extra arg is silently ignored by JS, so actually the existing tests won't fail for that reason — only the new addImage test will fail).

- [ ] **Step 4: Update `exportPresentationPdf.js` — signature, background, text colours**

Replace the entire public API section and render helpers in `src/lib/exportPresentationPdf.js`. Make these exact changes:

**4a. Update `renderHeader` — warm text colours**

Replace the `renderHeader` function (lines 137–162):

```js
function renderHeader(doc, song, fontSize) {
  const titleSize = fontSize * 1.8
  const artistSize = fontSize * 0.9
  const titleLineH = titleSize * 1.3
  const artistLineH = artistSize * 1.3
  let y = MARGIN_TOP

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(titleSize)
  doc.setTextColor(35, 18, 6)
  const titleLines = doc.splitTextToSize(song.meta.title ?? 'Untitled', MAX_W)
  doc.text(titleLines, PAGE_W / 2, y, { align: 'center' })
  y += titleLines.length * titleLineH

  if (song.meta.artist) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(artistSize)
    doc.setTextColor(90, 62, 42)
    doc.text(song.meta.artist, PAGE_W / 2, y, { align: 'center' })
    doc.setTextColor(35, 18, 6)
    y += artistLineH + 4
  }

  y += 20
  return y
}
```

**4b. Update `renderSections` — warm section label colour**

Replace the label block inside `renderSections` (the `if (section.label)` block, lines 178–186):

```js
    if (section.label) {
      y += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(labelSize)
      doc.setTextColor(115, 22, 22)
      doc.text(section.label.toUpperCase(), cx, y, { align: 'center' })
      doc.setTextColor(35, 18, 6)
      y += labelLineH + 4
    }
```

**4c. Update `exportPresentationPdf` — add `bgImage` param, draw background per page**

Replace the function signature and the songs render loop (lines 222–253):

```js
export function exportPresentationPdf(songs, bgImage) {
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

    doc.addImage(bgImage, 'PNG', 0, 0, PAGE_W, PAGE_H)

    const sections = song.sections ?? []
    const startY = renderHeader(doc, song, globalFont)

    if (measureSections(doc, sections, globalFont) > TWO_COL_THRESHOLD) {
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

- [ ] **Step 5: Run tests — expect all pass**

```bash
npx vitest run src/lib/__tests__/exportPresentationPdf.test.js
```

Expected: all 13 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exportPresentationPdf.js src/lib/__tests__/exportPresentationPdf.test.js
git commit -m "feat: exportPresentationPdf accepts bgImage, draws it full-bleed on each page"
```

---

## Task 2: Create `ExportBackgroundModal`

**Files:**
- Move: `Background.png` → `src/assets/Background.png`
- Create: `src/components/Sidebar/__tests__/ExportBackgroundModal.test.jsx`
- Create: `src/components/Sidebar/ExportBackgroundModal.jsx`

- [ ] **Step 1: Move the asset**

```bash
mv Background.png src/assets/Background.png
```

Vite will now pick it up as a managed asset and include it in builds with a content hash.

- [ ] **Step 2: Write the failing tests**

Create `src/components/Sidebar/__tests__/ExportBackgroundModal.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExportBackgroundModal } from '../ExportBackgroundModal'
import { exportPresentationPdf } from '../../../lib/exportPresentationPdf'

vi.mock('../../../assets/Background.png', () => ({ default: 'mock-bg.png' }))
vi.mock('../../../lib/exportPresentationPdf', () => ({ exportPresentationPdf: vi.fn() }))

// Make Image fire onload synchronously so bgImage state is populated before assertions
class SyncImage {
  set src(v) { this._src = v; this.onload?.() }
  get src() { return this._src }
}

beforeEach(() => {
  vi.clearAllMocks()
  global.Image = SyncImage
})

const songs = [{ meta: { title: 'Test Song', artist: null }, sections: [] }]
const defaultProps = {
  isOpen: true,
  songs,
  onClose: vi.fn(),
  onAddToast: vi.fn(),
}

describe('ExportBackgroundModal', () => {
  it('renders Export and Cancel buttons when open', () => {
    render(<ExportBackgroundModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('shows a background image preview', () => {
    render(<ExportBackgroundModal {...defaultProps} />)
    expect(screen.getByRole('img', { name: /background preview/i })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<ExportBackgroundModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls exportPresentationPdf with songs and bgImage when Export is clicked', () => {
    const onClose = vi.fn()
    render(<ExportBackgroundModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    expect(exportPresentationPdf).toHaveBeenCalledOnce()
    expect(exportPresentationPdf).toHaveBeenCalledWith(songs, expect.any(SyncImage))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders nothing when isOpen is false', () => {
    render(<ExportBackgroundModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the tests — expect failures**

```bash
npx vitest run src/components/Sidebar/__tests__/ExportBackgroundModal.test.jsx
```

Expected: all tests fail because `ExportBackgroundModal` does not exist yet.

- [ ] **Step 4: Implement `ExportBackgroundModal.jsx`**

Create `src/components/Sidebar/ExportBackgroundModal.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { exportPresentationPdf } from '../../lib/exportPresentationPdf'
import defaultBgUrl from '../../assets/Background.png'

export function ExportBackgroundModal({ isOpen, songs, onClose, onAddToast }) {
  const [previewUrl, setPreviewUrl] = useState(defaultBgUrl)
  const [bgImage, setBgImage] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    const img = new Image()
    img.onload = () => setBgImage(img)
    img.src = defaultBgUrl
  }, [isOpen])

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target.result
      setPreviewUrl(url)
      const img = new Image()
      img.onload = () => setBgImage(img)
      img.src = url
    }
    reader.readAsDataURL(file)
  }

  function handleExport() {
    try {
      exportPresentationPdf(songs, bgImage)
    } catch (err) {
      onAddToast('PDF export failed: ' + err.message, 'error')
    }
    onClose()
  }

  return (
    <Modal isOpen={isOpen} title="Presentation PDF" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Background image</p>
          <img
            src={previewUrl}
            alt="Background preview"
            className="w-full rounded"
            style={{ aspectRatio: '16/9', objectFit: 'cover' }}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
            Replace background
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 dark:text-gray-400"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!bgImage} onClick={handleExport}>
            Export
          </Button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 5: Run the tests — expect all pass**

```bash
npx vitest run src/components/Sidebar/__tests__/ExportBackgroundModal.test.jsx
```

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/assets/Background.png src/components/Sidebar/ExportBackgroundModal.jsx src/components/Sidebar/__tests__/ExportBackgroundModal.test.jsx
git commit -m "feat: add ExportBackgroundModal with default and user-replaceable background"
```

---

## Task 3: Wire `Sidebar.jsx` to open `ExportBackgroundModal`

**Files:**
- Modify: `src/components/Sidebar/Sidebar.jsx`

No new tests — there are no existing Sidebar unit tests, and the wiring is covered by the modal tests above.

- [ ] **Step 1: Add import and new state to `Sidebar.jsx`**

Add the import at the top of the file (after the existing imports):

```js
import { ExportBackgroundModal } from './ExportBackgroundModal'
```

Add two new state variables inside the `Sidebar` function body, after the existing `useState` declarations:

```js
const [backgroundModalOpen, setBackgroundModalOpen] = useState(false)
const [pendingSongs, setPendingSongs] = useState([])
```

- [ ] **Step 2: Replace `handleChoosePresentationPdf` and add a close handler**

Replace the existing `handleChoosePresentationPdf` function:

```js
function handleChoosePresentationPdf() {
  setChoiceModalOpen(false)
  const songs = [...selectedSongIds].map(id => loadSong(id)).filter(Boolean)
  setPendingSongs(songs)
  setBackgroundModalOpen(true)
}
```

Add a new handler directly below it:

```js
function handleBackgroundModalClose() {
  setBackgroundModalOpen(false)
  toggleExportMode()
}
```

- [ ] **Step 3: Render `ExportBackgroundModal` in the JSX**

Add the modal at the end of the returned fragment, after the closing `</ShareModal>` tag and before `</UGSearchModal>`:

```jsx
      <ExportBackgroundModal
        isOpen={backgroundModalOpen}
        songs={pendingSongs}
        onClose={handleBackgroundModalClose}
        onAddToast={onAddToast}
      />
```

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass. The `Background.png` asset move does not affect tests since the asset is mocked in the modal tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar/Sidebar.jsx
git commit -m "feat: open ExportBackgroundModal when user chooses Presentation PDF export"
```
