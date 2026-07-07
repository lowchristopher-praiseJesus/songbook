# Search UG Song Preview Window — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preview modal to the Search UG flow so users see lyrics and chords before importing, while keeping the existing click-to-import quick path.

**Architecture:** A new self-contained `UGPreviewModal` component reuses the existing fetch+parse pipeline (factored into a `fetchAndParseSong` helper) and the existing `SongBody` renderer. The post-parse import logic is extracted into a `runImport` function shared by both the direct-import click and the preview's Import button. `Modal` gains a `size` prop for the wider preview.

**Tech Stack:** React 18, Vite, Tailwind CSS (class dark mode), Zustand, Vitest + @testing-library/react. No backend; Firecrawl API key read from localStorage via `getFirecrawlKey()`.

## Global Constraints

- Test runner: `npx vitest run <path>` (project's `npm test` = `vitest run`).
- Dark mode uses Tailwind `dark:` variant; surfaces `gray-700/800/900`, borders `gray-200/600`, accent `indigo-500`, errors `red-500`.
- Reuse existing `Button` (`src/components/UI/Button.jsx`) variants: `primary`, `secondary`, `ghost`. It forwards arbitrary props (`className`, `aria-label`, `title`, `disabled`).
- Reuse existing `Modal` (`src/components/UI/Modal.jsx`) wrapper for overlay/Escape/click-outside.
- localStorage schema and `libraryStore` API are unchanged.
- One commit per task. End commit messages with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## File Structure

- **Create** `src/lib/ugImport/fetchSong.js` — pure helper `fetchAndParseSong(result, apiKey)` that fetches + parses one search result into a Song object. Source-agnostic (UG + Daniel Choy).
- **Create** `src/components/UGImport/UGPreviewModal.jsx` — preview dialog: fetch+parse on open, render header + `SongBody`, Import/Cancel buttons.
- **Create** `src/lib/ugImport/fetchSong.test.js` — unit tests for the helper.
- **Create** `src/components/UGImport/__tests__/UGPreviewModal.test.jsx` — component tests.
- **Create** `src/components/UGImport/__tests__/UGSearchModal.test.jsx` — characterization + wiring tests.
- **Create** `src/components/UI/__tests__/Modal.test.jsx` — `size` prop test.
- **Modify** `src/components/UI/Modal.jsx` — add `size` prop.
- **Modify** `src/components/UGImport/UGSearchModal.jsx` — adopt `fetchAndParseSong`, extract `runImport`, add per-row Preview button, render `UGPreviewModal`.

No other files change.

---

### Task 1: Add `size` prop to `Modal`

**Files:**
- Modify: `src/components/UI/Modal.jsx`
- Test: `src/components/UI/__tests__/Modal.test.jsx`

**Interfaces:**
- Produces: `Modal({ isOpen, title, children, onClose, size = 'md' })`. `size="xl"` → panel gets `max-w-3xl`; default (`"md"` or omitted) → `max-w-md` (unchanged).

- [ ] **Step 1: Write the failing test**

Create `src/components/UI/__tests__/Modal.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('uses max-w-md by default', () => {
    render(<Modal isOpen title="T" onClose={() => {}}><p>x</p></Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-w-md')
    expect(dialog.className).not.toContain('max-w-3xl')
  })

  it('uses max-w-3xl when size="xl"', () => {
    render(<Modal isOpen title="T" onClose={() => {}} size="xl"><p>x</p></Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-w-3xl')
    expect(dialog.className).not.toContain('max-w-md')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/UI/__tests__/Modal.test.jsx`
Expected: FAIL — default test passes (current code already has `max-w-md`), but the `size="xl"` test fails because `max-w-3xl` is never applied. (If the default test also fails, fix the selector first.)

- [ ] **Step 3: Write minimal implementation**

Edit `src/components/UI/Modal.jsx`. Change the signature and panel className:

```jsx
import { useEffect } from 'react'

export function Modal({ isOpen, title, children, onClose, size = 'md' }) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen || !onClose) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const maxWidthClass = size === 'xl' ? 'max-w-3xl' : 'max-w-md'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 sm:p-6 ${maxWidthClass} w-full mx-4 max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <h2 id="modal-title" className="text-lg font-semibold mb-4 dark:text-white">{title}</h2>
        )}
        {children}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Close modal"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/UI/__tests__/Modal.test.jsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/UI/Modal.jsx src/components/UI/__tests__/Modal.test.jsx
git commit -m "feat: add size prop to Modal (max-w-3xl for xl)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `fetchAndParseSong` helper

Extracts the source-branching fetch+parse logic currently inline in `UGSearchModal.handleSelect` (lines 91–101) into a pure, unit-testable function. Not yet wired in — Task 3 adopts it.

**Files:**
- Create: `src/lib/ugImport/fetchSong.js`
- Test: `src/lib/ugImport/fetchSong.test.js`

**Interfaces:**
- Consumes: `scrapeURL(url, apiKey)` from `./firecrawlClient` (returns `{ rawHtml, markdown }`); `parseUGPage(scraped, url)` from `./ugParser` (returns Song); `parseDanielChoyPage(rawHtml, result)` from `../danielchoyImport/danielchoyParser` (returns Song).
- Produces: `async function fetchAndParseSong(result, apiKey) -> Song`. `result` has `{ url, source, rawHtml? }`. A Song is `{ rawText, meta: { title, artist, key, keyIndex, isMinor, usesFlats, capo }, sections: [...] }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ugImport/fetchSong.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./firecrawlClient', () => ({ scrapeURL: vi.fn() }))
vi.mock('./ugParser', () => ({ parseUGPage: vi.fn() }))
vi.mock('../danielchoyImport/danielchoyParser', () => ({ parseDanielChoyPage: vi.fn() }))

import { scrapeURL } from './firecrawlClient'
import { parseUGPage } from './ugParser'
import { parseDanielChoyPage } from '../danielchoyImport/danielchoyParser'
import { fetchAndParseSong } from './fetchSong'

const ugResult = { url: 'https://tabs.ultimate-guitar.com/tab/foo-chords-1', source: 'ug' }
const dcResultWithHtml = { url: 'https://danielchoy.example/foo', source: 'danielchoy', rawHtml: '<feed/>' }
const dcResultNoHtml = { url: 'https://danielchoy.example/bar', source: 'danielchoy' }

const ugSong = { meta: { title: 'Foo' }, sections: [{ label: 'Verse', lines: [] }] }
const dcSong = { meta: { title: 'Bar' }, sections: [{ label: 'Chorus', lines: [] }] }

describe('fetchAndParseSong', () => {
  beforeEach(() => {
    scrapeURL.mockReset()
    parseUGPage.mockReset()
    parseDanielChoyPage.mockReset()
  })

  it('scrapes and parses a UG result', async () => {
    const scraped = { rawHtml: '<html></html>', markdown: '' }
    scrapeURL.mockResolvedValue(scraped)
    parseUGPage.mockReturnValue(ugSong)

    const song = await fetchAndParseSong(ugResult, 'KEY')

    expect(scrapeURL).toHaveBeenCalledWith(ugResult.url, 'KEY')
    expect(parseUGPage).toHaveBeenCalledWith(scraped, ugResult.url)
    expect(song).toBe(ugSong)
  })

  it('parses a Daniel Choy result from cached rawHtml without scraping', async () => {
    parseDanielChoyPage.mockReturnValue(dcSong)

    const song = await fetchAndParseSong(dcResultWithHtml, 'KEY')

    expect(scrapeURL).not.toHaveBeenCalled()
    expect(parseDanielChoyPage).toHaveBeenCalledWith('<feed/>', dcResultWithHtml)
    expect(song).toBe(dcSong)
  })

  it('scrapes a Daniel Choy result when rawHtml is missing', async () => {
    scrapeURL.mockResolvedValue({ rawHtml: '<html></html>', markdown: '' })
    parseDanielChoyPage.mockReturnValue(dcSong)

    const song = await fetchAndParseSong(dcResultNoHtml, 'KEY')

    expect(scrapeURL).toHaveBeenCalledWith(dcResultNoHtml.url, 'KEY')
    expect(parseDanielChoyPage).toHaveBeenCalledWith('<html></html>', dcResultNoHtml)
    expect(song).toBe(dcSong)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ugImport/fetchSong.test.js`
Expected: FAIL — `fetchAndParseSong` is not defined (module `./fetchSong` does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/ugImport/fetchSong.js`:

```js
import { scrapeURL } from './firecrawlClient'
import { parseUGPage } from './ugParser'
import { parseDanielChoyPage } from '../danielchoyImport/danielchoyParser'

// Fetch + parse a single search result into a Song object.
// `result` shape: { url, source: 'ug' | 'danielchoy', rawHtml? }
// Daniel Choy JSONP results carry rawHtml from the Blogger feed — no scrape needed.
// Firecrawl (UG) results have no rawHtml and require a scrape (needs an API key).
export async function fetchAndParseSong(result, apiKey) {
  if (result.source === 'danielchoy') {
    const rawHtml = result.rawHtml || (await scrapeURL(result.url, apiKey)).rawHtml
    return parseDanielChoyPage(rawHtml, result)
  }
  const scraped = await scrapeURL(result.url, apiKey)
  return parseUGPage(scraped, result.url)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ugImport/fetchSong.test.js`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ugImport/fetchSong.js src/lib/ugImport/fetchSong.test.js
git commit -m "feat: add fetchAndParseSong helper for UG/Daniel Choy results

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Refactor `UGSearchModal` — adopt helper, extract `runImport`

Lock the current direct-import behavior with a characterization test, then refactor `handleSelect` to use `fetchAndParseSong` and a new `runImport(song, result)` function. Behavior must stay identical.

**Files:**
- Modify: `src/components/UGImport/UGSearchModal.jsx`
- Test: `src/components/UGImport/__tests__/UGSearchModal.test.jsx`

**Interfaces:**
- Consumes: `fetchAndParseSong(result, apiKey) -> Song` from Task 2.
- Produces: `runImport(song, result)` — an async function inside `UGSearchModal` that runs the duplicate-check → `addSongs`/`replaceSong` → `selectSong` → toast → close sequence. Called by both `handleSelect` (direct import) and, in Task 5, the preview's Import button. `sourceLabel` is derived internally from `result.source`.

- [ ] **Step 1: Write the characterization test**

Create `src/components/UGImport/__tests__/UGSearchModal.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddSongs = vi.fn()
const mockReplaceSong = vi.fn()
const mockSelectSong = vi.fn()
const storeState = { index: [], addSongs: mockAddSongs, replaceSong: mockReplaceSong, selectSong: mockSelectSong }

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: Object.assign((s) => s(storeState), { getState: () => storeState }),
}))
vi.mock('../../../lib/storage', () => ({ getFirecrawlKey: () => 'KEY' }))

const fakeSong = {
  meta: { title: 'Foo', artist: 'Bar', key: 'G', capo: 0 },
  sections: [{ label: 'Verse', lines: [{ type: 'lyric', content: 'la' }] }],
  rawText: '',
}

vi.mock('../../../lib/ugImport/firecrawlClient', () => ({
  searchUG: vi.fn(() => Promise.resolve([
    { url: 'https://tabs.ultimate-guitar.com/tab/foo-chords-123', title: 'Foo Chords by Bar', description: 'd' },
  ])),
  scrapeURL: vi.fn(() => Promise.resolve({ rawHtml: '<html></html>', markdown: '' })),
}))
vi.mock('../../../lib/ugImport/ugParser', () => ({ parseUGPage: vi.fn(() => fakeSong) }))
vi.mock('../../../lib/danielchoyImport/danielchoyClient', () => ({ searchDanielChoy: vi.fn(() => Promise.resolve([])) }))
vi.mock('../../../lib/danielchoyImport/danielchoyParser', () => ({ parseDanielChoyPage: vi.fn() }))

import { UGSearchModal } from '../UGSearchModal'

function renderIt() {
  return render(
    <UGSearchModal
      isOpen
      onClose={vi.fn()}
      onSongSelect={vi.fn()}
      onImportSuccess={vi.fn()}
      onAddToast={vi.fn()}
    />,
  )
}

async function searchAndGetRow() {
  renderIt()
  fireEvent.change(screen.getByPlaceholderText(/Song title or artist/i), { target: { value: 'foo' } })
  fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
  return screen.findByText(/Foo/i)
}

describe('UGSearchModal direct import (characterization)', () => {
  beforeEach(() => {
    mockAddSongs.mockReset()
    mockSelectSong.mockReset()
  })

  it('renders results after a search', async () => {
    await searchAndGetRow()
    expect(screen.getByText(/Foo/i)).toBeInTheDocument()
  })

  it('clicking a result imports it directly', async () => {
    const row = await searchAndGetRow()
  // reset call counts captured during render of this test's own render
  mockAddSongs.mockClear()
  mockSelectSong.mockClear()
  fireEvent.click(row)
    await waitFor(() => expect(mockAddSongs).toHaveBeenCalledWith([fakeSong], 'Ultimate Guitar', 'ug'))
    await waitFor(() => expect(mockSelectSong).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it passes against current code**

Run: `npx vitest run src/components/UGImport/__tests__/UGSearchModal.test.jsx`
Expected: PASS — this characterizes the existing behavior before refactoring. (If it fails, fix the test/mocks before refactoring; the refactor must not change behavior.)

- [ ] **Step 3: Refactor `UGSearchModal.jsx`**

In `src/components/UGImport/UGSearchModal.jsx`:

Replace the import block at the top (lines 1–9) with:

```jsx
import { useState, useCallback, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { getFirecrawlKey } from '../../lib/storage'
import { searchUG } from '../../lib/ugImport/firecrawlClient'
import { fetchAndParseSong } from '../../lib/ugImport/fetchSong'
import { searchDanielChoy } from '../../lib/danielchoyImport/danielchoyClient'
```

(Note: `scrapeURL`, `parseUGPage`, `parseDanielChoyPage` imports are removed — now used inside `fetchAndParseSong`.)

Replace the entire `handleSelect` (lines 82–154) with the extracted `runImport` plus a slim `handleSelect`:

```jsx
  const runImport = useCallback(async (song, result) => {
    if (!song.sections.length) {
      setStatus('results')
      setError("Couldn't extract chords from this page — try another result")
      return
    }

    const sourceLabel = result.source === 'danielchoy' ? 'Daniel Choy' : 'Ultimate Guitar'

    // Duplicate check
    const index = useLibraryStore.getState().index
    const duplicate = index.find(e => e.title === song.meta.title)
    if (duplicate) {
      const resolution = await onDuplicateCheck(song.meta.title)
      if (resolution === 'replace') {
        replaceSong(duplicate.id, song)
        selectSong(duplicate.id)
        onSongSelect()
        onImportSuccess?.()
        onAddToast(`Imported: ${song.meta.title}`, 'success')
        resetAndClose()
        return
      } else if (resolution === 'skip') {
        setStatus('results')
        return
      }
      // 'keep-both' falls through to addSongs — new UUID is assigned
    }

    const idsBefore = new Set(useLibraryStore.getState().index.map(e => e.id))
    const sourceKey = result.source === 'danielchoy' ? 'danielchoy' : 'ug'
    try {
      addSongs([song], sourceLabel, sourceKey)
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        setStatus('results')
        setError('Storage full — delete some songs before importing')
        return
      }
      throw e
    }

    const newEntry = useLibraryStore.getState().index.find(e => !idsBefore.has(e.id))
    if (newEntry) selectSong(newEntry.id)
    onSongSelect()
    onImportSuccess?.()
    onAddToast(`Imported: ${song.meta.title}`, 'success')
    resetAndClose()
  }, [addSongs, replaceSong, selectSong, onDuplicateCheck, onSongSelect, onImportSuccess, onAddToast, resetAndClose])

  const handleSelect = useCallback(async (result) => {
    if (importingRef.current) return
    importingRef.current = true
    const apiKey = getFirecrawlKey()
    setStatus('importing')
    setError(null)
    try {
      const song = await fetchAndParseSong(result, apiKey)
      await runImport(song, result)
    } catch (err) {
      setStatus('results')
      setError(errorMessage(err))
      importingRef.current = false
    }
  }, [runImport])
```

- [ ] **Step 4: Run test to verify it still passes**

Run: `npx vitest run src/components/UGImport/__tests__/UGSearchModal.test.jsx`
Expected: PASS — behavior unchanged after refactor. Also run the full suite to catch regressions:

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/UGImport/UGSearchModal.jsx src/components/UGImport/__tests__/UGSearchModal.test.jsx
git commit -m "refactor: extract runImport and fetchAndParseSong in UGSearchModal

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `UGPreviewModal` component

The preview dialog. Opens, fetches+parses via `fetchAndParseSong`, renders a header + `SongBody`, and offers Import/Cancel. Imports by calling `onImported(song, result)` (the parent runs `runImport`). Static display only.

**Files:**
- Create: `src/components/UGImport/UGPreviewModal.jsx`
- Test: `src/components/UGImport/__tests__/UGPreviewModal.test.jsx`

**Interfaces:**
- Consumes: `fetchAndParseSong(result, apiKey) -> Song` (Task 2); `SongBody({ sections, fontSize })` from `../SongList/SongBody`; `Modal({ isOpen, title, onClose, size })` (Task 1); `Button` from `../UI/Button`.
- Produces: `UGPreviewModal({ result, apiKey, isOpen, onClose, onImported })`. `onImported(song, result)` may return a Promise; while it is in flight the Import button is disabled and reads "Importing…".

- [ ] **Step 1: Write the failing test**

Create `src/components/UGImport/__tests__/UGPreviewModal.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeSong = {
  meta: { title: 'Foo', artist: 'Bar', key: 'G', capo: 2 },
  sections: [{ label: 'Verse', lines: [{ type: 'lyric', content: 'la' }] }],
  rawText: '',
}
const emptySong = { meta: { title: 'X' }, sections: [], rawText: '' }

vi.mock('../../../lib/ugImport/fetchSong', () => ({ fetchAndParseSong: vi.fn() }))
vi.mock('../../SongList/SongBody', () => ({
  SongBody: ({ sections }) => <div data-testid="songbody">{sections.length} sections</div>,
}))

import { fetchAndParseSong } from '../../../lib/ugImport/fetchSong'
import { UGPreviewModal } from '../UGPreviewModal'

const result = { url: 'https://tabs.ultimate-guitar.com/tab/foo-chords-1', source: 'ug' }
const defaultProps = { result, apiKey: 'KEY', isOpen: true, onClose: vi.fn(), onImported: vi.fn() }

describe('UGPreviewModal', () => {
  beforeEach(() => {
    fetchAndParseSong.mockReset()
    defaultProps.onClose.mockReset()
    defaultProps.onImported.mockReset()
  })

  it('loads then renders the song body and enables Import', async () => {
    fetchAndParseSong.mockResolvedValue(fakeSong)
    render(<UGPreviewModal {...defaultProps} />)
    expect(screen.getByText(/Loading preview/i)).toBeInTheDocument()
    await screen.findByTestId('songbody')
    expect(screen.getByRole('heading', { name: 'Foo' })).toBeInTheDocument()
    expect(screen.getByText(/Bar/i)).toBeInTheDocument()
    expect(screen.getByText(/Key: G/i)).toBeInTheDocument()
    expect(screen.getByText(/Capo: 2/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Import$/i })).toBeEnabled()
  })

  it('shows an error and Close (no Import) when sections are empty', async () => {
    fetchAndParseSong.mockResolvedValue(emptySong)
    render(<UGPreviewModal {...defaultProps} />)
    await screen.findByText(/Couldn't extract chords/i)
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Import$/i })).not.toBeInTheDocument()
  })

  it('shows an error when fetch fails', async () => {
    fetchAndParseSong.mockRejectedValue(new Error('boom'))
    render(<UGPreviewModal {...defaultProps} />)
    await screen.findByText(/Connection failed/i)
    expect(screen.queryByRole('button', { name: /^Import$/i })).not.toBeInTheDocument()
  })

  it('Cancel calls onClose', async () => {
    fetchAndParseSong.mockResolvedValue(fakeSong)
    render(<UGPreviewModal {...defaultProps} />)
    await screen.findByTestId('songbody')
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('Import calls onImported with the parsed song and result', async () => {
    fetchAndParseSong.mockResolvedValue(fakeSong)
    render(<UGPreviewModal {...defaultProps} />)
    await screen.findByTestId('songbody')
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }))
    await waitFor(() => expect(defaultProps.onImported).toHaveBeenCalledWith(fakeSong, result))
  })

  it('Import is not available while loading', () => {
    fetchAndParseSong.mockReturnValue(new Promise(() => {})) // never resolves
    render(<UGPreviewModal {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /^Import$/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/UGImport/__tests__/UGPreviewModal.test.jsx`
Expected: FAIL — `UGPreviewModal` is not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/UGImport/UGPreviewModal.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { SongBody } from '../SongList/SongBody'
import { fetchAndParseSong } from '../../lib/ugImport/fetchSong'

function errorMessage(err) {
  if (err?.message === 'UNAUTHORIZED') return 'Invalid API key — check Settings'
  return 'Connection failed — check your internet and try again'
}

const EXTRACT_ERROR = "Couldn't extract chords from this page. Try another result or import directly."

export function UGPreviewModal({ result, apiKey, isOpen, onClose, onImported }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [song, setSong] = useState(null)
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    setSong(null)
    try {
      const parsed = await fetchAndParseSong(result, apiKey)
      if (!parsed.sections.length) {
        setStatus('error')
        setError(EXTRACT_ERROR)
        return
      }
      setSong(parsed)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(errorMessage(err))
    }
  }, [result, apiKey])

  useEffect(() => {
    if (isOpen && result) load()
  }, [isOpen, result, load])

  function handleImport() {
    if (importing || !song) return
    setImporting(true)
    Promise.resolve(onImported(song, result)).finally(() => setImporting(false))
  }

  if (!isOpen) return null

  const title = status === 'ready' && song?.meta?.title ? song.meta.title : 'Preview'

  return (
    <Modal isOpen={isOpen} title={title} onClose={onClose} size="xl">
      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-sm">Loading preview…</span>
        </div>
      )}

      {status === 'error' && (
        <div className="py-6">
          <p className="text-sm text-red-500 mb-4">{error}</p>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      )}

      {status === 'ready' && song && (
        <>
          <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{song.meta.title}</h3>
            {song.meta.artist && (
              <div className="text-sm text-gray-500 dark:text-gray-400">{song.meta.artist}</div>
            )}
            <div className="mt-1 flex gap-3 text-xs text-gray-500 dark:text-gray-400">
              {song.meta.key && <span>Key: {song.meta.key}</span>}
              {song.meta.capo ? <span>Capo: {song.meta.capo}</span> : null}
            </div>
          </div>
          <div className="mb-4">
            <SongBody sections={song.sections} fontSize={16} />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" onClick={onClose} disabled={importing}>Cancel</Button>
            <Button variant="primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
```

Note: `Modal` renders the `title` as an `<h2 id="modal-title">`; the in-body heading is an `<h3>` so the test's `getByRole('heading', { name: 'Foo' })` finds the body heading. If `getByRole('heading', {name:'Foo'})` matches both the `Modal` title `<h2>Foo</h2>` and the body `<h3>Foo</h3>`, change the test to `getAllByRole('heading', { name: 'Foo' })` and assert length ≥ 1 — but since the `Modal` title is the same string, prefer `screen.getAllByRole('heading', { name: 'Foo' }).length).toBeGreaterThanOrEqual(1)`. Apply that adjustment in Step 4 if needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/UGImport/__tests__/UGPreviewModal.test.jsx`
Expected: PASS (all six tests). If the heading test fails due to two headings, adjust it as noted above and rerun.

- [ ] **Step 5: Commit**

```bash
git add src/components/UGImport/UGPreviewModal.jsx src/components/UGImport/__tests__/UGPreviewModal.test.jsx
git commit -m "feat: add UGPreviewModal — preview chords/lyrics before importing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Wire Preview button + preview modal into `UGSearchModal`

Add a per-row Preview button (the row click stays direct-import). Lift `previewResult` state; render `UGPreviewModal`; its `onImported` runs the shared `runImport`. Also clear `previewResult` in `resetAndClose`.

**Files:**
- Modify: `src/components/UGImport/UGSearchModal.jsx`
- Test: `src/components/UGImport/__tests__/UGSearchModal.test.jsx` (extend)

**Interfaces:**
- Consumes: `UGPreviewModal({ result, apiKey, isOpen, onClose, onImported })` (Task 4); `runImport(song, result)` (Task 3).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/UGImport/__tests__/UGSearchModal.test.jsx` (inside the existing file, after the current `describe` block). Add a `SongBody` mock at the top of the file with the other `vi.mock` calls:

```jsx
vi.mock('../../SongList/SongBody', () => ({
  SongBody: ({ sections }) => <div data-testid="songbody">{sections.length} sections</div>,
}))
```

And add a mock for `fetchSong` next to the other module mocks (so the preview's fetch is controllable and the direct path still resolves to `fakeSong`):

```jsx
vi.mock('../../../lib/ugImport/fetchSong', () => ({ fetchAndParseSong: vi.fn() }))
```

Then `import { fetchAndParseSong } from '../../../lib/ugImport/fetchSong'` at the top, and set a default in a `beforeEach`:

```jsx
beforeEach(() => {
  fetchAndParseSong.mockReset()
  fetchAndParseSong.mockResolvedValue(fakeSong)
  mockAddSongs.mockReset()
  mockSelectSong.mockReset()
})
```

(Update the existing `beforeEach` accordingly; remove the inline `mockClear` calls added in Task 3 if they now duplicate.)

Add this new `describe` block at the end of the file:

```jsx
describe('UGSearchModal preview wiring', () => {
  beforeEach(() => {
    fetchAndParseSong.mockReset()
    fetchAndParseSong.mockResolvedValue(fakeSong)
    mockAddSongs.mockReset()
    mockSelectSong.mockReset()
  })

  async function searchToResults() {
    renderIt()
    fireEvent.change(screen.getByPlaceholderText(/Song title or artist/i), { target: { value: 'foo' } })
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    await screen.findByText(/Foo/i)
  }

  it('clicking Preview opens the preview without importing', async () => {
    await searchToResults()
    fireEvent.click(screen.getByRole('button', { name: /Preview Foo/i }))
    await screen.findByTestId('songbody')
    expect(mockAddSongs).not.toHaveBeenCalled()
  })

  it('clicking the row body still imports directly', async () => {
    await searchToResults()
    fireEvent.click(screen.getByRole('button', { name: /^Foo/i }))
    await waitFor(() => expect(mockAddSongs).toHaveBeenCalledWith([fakeSong], 'Ultimate Guitar', 'ug'))
  })

  it('Preview button does not trigger row import (stopPropagation)', async () => {
    await searchToResults()
    fireEvent.click(screen.getByRole('button', { name: /Preview Foo/i }))
    await screen.findByTestId('songbody')
    // import path would have called addSongs; preview must not
    expect(mockAddSongs).not.toHaveBeenCalled()
  })

  it('Import from preview runs runImport', async () => {
    await searchToResults()
    fireEvent.click(screen.getByRole('button', { name: /Preview Foo/i }))
    await screen.findByTestId('songbody')
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }))
    await waitFor(() => expect(mockAddSongs).toHaveBeenCalledWith([fakeSong], 'Ultimate Guitar', 'ug'))
  })
})
```

Note on the helper `renderIt`: it is defined inside the first `describe` in Task 3. Move `renderIt` and `searchAndGetRow`/`fakeSong` to module scope (above all `describe` blocks) so both `describe` blocks can use them. `fakeSong` is already module-scoped; ensure `renderIt` is too.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/components/UGImport/__tests__/UGSearchModal.test.jsx`
Expected: FAIL — no "Preview Foo" button exists yet (the preview wiring tests fail). The existing characterization tests should still pass.

- [ ] **Step 3: Wire the preview into `UGSearchModal.jsx`**

In `src/components/UGImport/UGSearchModal.jsx`:

Add the import (next to the other component imports near the top):

```jsx
import { UGPreviewModal } from './UGPreviewModal'
```

Add lifted preview state next to the other `useState` calls (after line 21, `duplicateState`):

```jsx
  const [previewResult, setPreviewResult] = useState(null)
```

In `resetAndClose` (the `useCallback` around line 29), add clearing the preview state:

```jsx
  const resetAndClose = useCallback(() => {
    setQuery('')
    setStatus('idle')
    setResults([])
    setError(null)
    setDuplicateState(null)
    setPreviewResult(null)
    importingRef.current = false
    onClose()
  }, [onClose])
```

Replace the results-list `<li>` (the block currently at lines 218–244) so the row is a `div[role="button"]` with a sibling Preview `<Button>`. The new `<li>` body:

```jsx
                  return (
                    <li key={r.url} className="flex items-stretch gap-1">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelect(r)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleSelect(r)
                          }
                        }}
                        className="flex-1 min-w-0 text-left px-3 py-2 rounded-lg cursor-pointer
                          hover:bg-gray-100 dark:hover:bg-gray-700
                          text-sm text-gray-900 dark:text-gray-100
                          focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium flex-1 min-w-0 truncate">{displayTitle || r.title}</span>
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isDC
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'
                          }`}>
                            {isDC ? 'DC' : 'UG'}
                          </span>
                        </div>
                        {r.description && (
                          <div className="text-xs text-gray-400 truncate mt-0.5">{r.description}</div>
                        )}
                        {isDC && r.artist && (
                          <div className="text-xs text-gray-400 truncate mt-0.5">{r.artist}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        className="shrink-0 self-center px-2"
                        onClick={e => { e.stopPropagation(); setPreviewResult(r) }}
                        aria-label={`Preview ${displayTitle || r.title}`}
                        title="Preview"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </Button>
                    </li>
                  )
```

Finally, render the preview modal. Just before the closing `</Modal>` (the tag currently at line 276), inside the `<Modal>...</Modal>` element but after the `duplicateState` block, add:

```jsx
      <UGPreviewModal
        result={previewResult}
        apiKey={apiKey}
        isOpen={!!previewResult}
        onClose={() => setPreviewResult(null)}
        onImported={(song, result) => runImport(song, result)}
      />
```

(`apiKey` is already computed at line 156 via `getFirecrawlKey()`; `runImport` is defined in Task 3.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/UGImport/__tests__/UGSearchModal.test.jsx`
Expected: PASS — all characterization + preview wiring tests.

Run the full suite:

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Manual verification**

Run the dev server and exercise the flow:

```bash
npm run dev
```

Open the app, click **Search UG** in the sidebar, enter a song name, click **Search**. Verify:
- Each result row shows an eye **Preview** button on the right.
- Clicking the row body imports directly (existing behavior).
- Clicking **Preview** opens a wide modal showing the song title/artist/key/capo header and the chord chart (lyrics + inline chords), with **Cancel** and **Import** buttons.
- Clicking **Import** imports the song into the library and closes both modals.
- Clicking **Cancel** (or ✕, or Escape) closes the preview and returns to the results list.
- If a page can't be parsed, the preview shows the error message and a **Close** button (no Import).

- [ ] **Step 6: Commit**

```bash
git add src/components/UGImport/UGSearchModal.jsx src/components/UGImport/__tests__/UGSearchModal.test.jsx
git commit -m "feat: add per-row Preview button wired to UGPreviewModal

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Coexist with direct import + Preview affordance → Task 5 (Preview button, row click unchanged).
- Single best-match version, static display, modal overlay → Task 4 (`UGPreviewModal`, `size="xl"`, header + `SongBody` + Import/Cancel).
- Shared import refactor → Task 3 (`runImport`).
- Modal sizing → Task 1.
- Reuse fetch+parse pipeline → Task 2 (`fetchAndParseSong`) + Task 4 uses it.
- Error handling (empty sections, fetch failure, duplicate skip, double-click guard) → Task 4 (error states, disabled Import) + Task 3 (`runImport` keeps duplicate/quota logic).
- Tests (Modal size, UGPreviewModal, UGSearchModal wiring, runImport via shared tests) → all tasks.

**Placeholder scan:** none — every code step contains complete code.

**Type/signature consistency:**
- `fetchAndParseSong(result, apiKey) -> Song` — consistent across Tasks 2, 3, 4, 5.
- `runImport(song, result)` — consistent across Tasks 3 and 5. (`sourceLabel` is derived inside `runImport` from `result.source`, a refinement over the spec's pseudocode that had it passed in; the spec's `sourceKey` derivation is unchanged.)
- `UGPreviewModal({ result, apiKey, isOpen, onClose, onImported })` — consistent across Tasks 4 and 5. (`onAddToast` from the spec is dropped here as unused — the import toast is fired by `runImport` inside `UGSearchModal`.)
- `Modal({ ... , size = 'md' })` — consistent across Tasks 1, 4, 5.

Two deliberate, noted refinements to the approved spec (no behavior change): `sourceLabel` derived inside `runImport`; `onAddToast` not threaded into `UGPreviewModal`. Both reduce coupling.