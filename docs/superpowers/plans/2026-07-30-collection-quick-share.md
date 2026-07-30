# Collection Quick-Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Share" icon to the collections page that reveals the collection's existing share URL and a QR code inline, without creating a new link, and restructure the page's secondary action buttons into a compact icon toolbar row so the button stack doesn't keep growing.

**Architecture:** All changes are contained in `src/components/Collection/CollectionDetailView.jsx`. The button list is restructured from stacked full-width buttons into: two primary full-width buttons (Add Songs, Search Songs), one icon toolbar row (Rename, Duplicate, Share, Check for Updates), and the existing full-width Delete Collection footer. A new inline panel (URL + Copy + QR + Save QR) toggles open beneath the icon row when Share is clicked. Expiration is checked proactively on mount (reusing the `checkShareVersion` call already used reactively) so the row doesn't briefly show dead-link actions.

**Tech Stack:** React (hooks: `useState`, `useEffect`, `useRef`), `qrcode` npm package (`QRCode.toCanvas`, already a project dependency), Vitest + `@testing-library/react` for tests, existing `checkShareVersion` from `src/lib/shareApi.js`.

## Global Constraints

- Visibility gate for Share and Check-for-Updates icons is exactly `collection?.shareCode && !linkExpired` — the same condition the existing "Check for Updates" button already uses. No new collection data field is introduced (confirmed with user during brainstorming).
- No changes to `ShareModal.jsx`, `CollectionGroup.jsx` (sidebar), or the sidebar's export-mode share flow.
- The Share panel creates no new share link and makes no network call to create/push — it only reads `collection.shareCode` already in the store and generates the QR client-side.
- Delete Collection stays a full-width button, visually separated by the existing border — never folded into the icon row.
- Icon toolbar buttons show a small visible text label under each icon (not hover-only tooltips), since this is a touch-first primary page.

---

## Task 1: Restructure Rename / Duplicate / Check-for-Updates into an icon toolbar row

**Files:**
- Modify: `src/components/Collection/CollectionDetailView.jsx:317-404`
- Test: Create `src/components/Collection/__tests__/CollectionDetailView.actionIcons.test.jsx`

**Interfaces:**
- Consumes: existing component state `renaming`, `duplicating`, `refreshing`, `linkExpired`, `collection` and existing handlers `setRenaming`, `setDuplicating`, `handleCheckUpdates` — none of these change shape.
- Produces: three icon buttons with `aria-label`s `"Rename collection"`, `"Duplicate collection"`, `"Check for updates"` that later tasks (Task 3) insert a fourth button next to. The wrapping row is a `<div className="flex items-stretch gap-2 pt-1">` — Task 3 inserts its new button inside this same div, between the Duplicate and Check-for-Updates buttons.

- [ ] **Step 1: Write the failing test**

Create `src/components/Collection/__tests__/CollectionDetailView.actionIcons.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionDetailView } from '../CollectionDetailView'

let collectionsSeed = []

const storeState = {
  selectedCollectionId: 'c1',
  get collections() { return collectionsSeed },
  index: [],
  setSelectedCollectionId: vi.fn(),
  renameCollection: vi.fn(),
  deleteCollection: vi.fn(),
  duplicateCollection: vi.fn(),
  setCollectionSongs: vi.fn(),
  removeSongFromCollection: vi.fn(),
  applyShareRefresh: vi.fn(),
  selectSong: vi.fn(),
}

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) => selector(storeState),
}))
vi.mock('../../UGImport/UGSearchModal', () => ({ UGSearchModal: () => null }))
vi.mock('../../../lib/conductorApi', () => ({ endBroadcast: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('../../../lib/shareApi', () => ({
  checkShareVersion: vi.fn().mockResolvedValue({ version: 1 }),
  fetchShare: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
}))
vi.mock('../../../lib/parser/sbpParser', () => ({
  parseSbpFile: vi.fn().mockResolvedValue({ songs: [] }),
}))
vi.mock('../../../lib/mergeSharedCollection', () => ({
  mergeSharedCollection: vi.fn().mockReturnValue({
    autoApplied: [], conflicts: [], newSongs: [], removed: [], serverSbpIdOrder: [],
  }),
}))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null) }))

import { checkShareVersion } from '../../../lib/shareApi'

const defaultProps = { onAddToast: vi.fn(), onOpenSidebar: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  checkShareVersion.mockResolvedValue({ version: 1 })
})

describe('CollectionDetailView action icon row', () => {
  it('renders Rename and Duplicate icons but not Check for updates when there is no shareCode', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Rename collection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duplicate collection' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument()
  })

  it('renders the Check for updates icon when the collection has a shareCode', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument()
  })

  it('clicking the Rename icon replaces the title with an editable input and hides the icon', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename collection' }))
    expect(screen.getByDisplayValue('Sunday Set')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename collection' })).not.toBeInTheDocument()
  })

  it('clicking the Duplicate icon shows the inline duplicate-name input and hides the icon', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate collection' }))
    expect(screen.getByPlaceholderText('New collection name…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duplicate collection' })).not.toBeInTheDocument()
  })

  it('clicking Check for updates triggers a version check for that shareCode', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
    await waitFor(() => expect(checkShareVersion).toHaveBeenCalledWith('abc'))
  })

  it('Delete Collection remains a full-width labeled button, not an icon', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Delete Collection' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Collection/__tests__/CollectionDetailView.actionIcons.test.jsx`
Expected: FAIL — the current code renders plain-text buttons ("Rename", "Duplicate", "Check for Updates") with no `aria-label`, so `getByRole('button', { name: 'Rename collection' })` etc. cannot find them.

- [ ] **Step 3: Replace the button list with the icon toolbar row**

In `src/components/Collection/CollectionDetailView.jsx`, replace the block starting at `{!isUncategorized && (` (currently line 317) through the line `<div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">` (currently line 405) — i.e. everything from Add Songs through the "Share link expired" paragraph, **not including** the Delete Collection block that follows — with:

```jsx
      {!isUncategorized && (
        <div className="mb-8 space-y-2">
          <button
            type="button"
            onClick={() => setAddSongsOpen(true)}
            className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
              text-gray-700 dark:text-gray-300 text-sm font-medium
              hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Add Songs
          </button>

          <button
            type="button"
            onClick={() => setUgModalOpen(true)}
            className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
              text-gray-700 dark:text-gray-300 text-sm font-medium
              hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Search Songs
          </button>

          <div className="flex items-stretch gap-2 pt-1">
            {!renaming && (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                aria-label="Rename collection"
                title="Rename"
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg
                  border border-gray-300 dark:border-gray-600
                  text-gray-600 dark:text-gray-300
                  hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span aria-hidden="true" className="text-base leading-none">✏️</span>
                <span className="text-[10px] leading-none">Rename</span>
              </button>
            )}
            {!duplicating && (
              <button
                type="button"
                onClick={() => setDuplicating(true)}
                aria-label="Duplicate collection"
                title="Duplicate"
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg
                  border border-gray-300 dark:border-gray-600
                  text-gray-600 dark:text-gray-300
                  hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span aria-hidden="true" className="text-base leading-none">⧉</span>
                <span className="text-[10px] leading-none">Duplicate</span>
              </button>
            )}
            {collection?.shareCode && !linkExpired && (
              <button
                type="button"
                onClick={handleCheckUpdates}
                disabled={refreshing}
                aria-label="Check for updates"
                title="Check for updates"
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg
                  border border-indigo-300 dark:border-indigo-700
                  text-indigo-600 dark:text-indigo-400
                  hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors
                  disabled:opacity-50"
              >
                <span aria-hidden="true" className="text-base leading-none">{refreshing ? '…' : '↻'}</span>
                <span className="text-[10px] leading-none">Updates</span>
              </button>
            )}
          </div>
          {collection?.shareCode && linkExpired && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-1">
              Link expired
            </p>
          )}

          {duplicating && (
            <div>
              <input
                ref={duplicateInputRef}
                value={duplicateDraft}
                onChange={e => setDuplicateDraft(e.target.value)}
                onBlur={() => {
                  if (duplicateEscapeRef.current) { duplicateEscapeRef.current = false; return }
                  commitDuplicate()
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitDuplicate() }
                  if (e.key === 'Escape') { duplicateEscapeRef.current = true; setDuplicating(false); setDuplicateDraft('') }
                }}
                placeholder="New collection name…"
                className="w-full px-3 py-2 text-[16px] rounded-lg border border-indigo-400
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                  outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 px-1">
                Enter to confirm · Esc to cancel
              </p>
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
```

Leave everything from this last `<div className="border-t ...">` line onward (the Delete Collection confirm/cancel block, and the closing tags) exactly as it is today — only the content above it changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/Collection/__tests__/CollectionDetailView.actionIcons.test.jsx`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Run the pre-existing CollectionDetailView test file to check for regressions**

Run: `npx vitest run src/components/Collection/__tests__/CollectionDetailView.searchUG.test.jsx`
Expected: PASS — this file doesn't reference Rename/Duplicate/Check-for-Updates text, so it should be unaffected. If it fails, re-check the replaced block didn't accidentally change the Search Songs markup.

Note: on this branch, `CollectionDetailView.jsx` does not yet have the conductor-broadcast delete logic that exists as unrelated in-progress work on `main` — so there is no `CollectionDetailView.deleteConductor.test.jsx` here. Don't create one; it's out of scope for this plan.

- [ ] **Step 6: Commit**

```bash
git add src/components/Collection/CollectionDetailView.jsx src/components/Collection/__tests__/CollectionDetailView.actionIcons.test.jsx
git commit -m "refactor: collapse collection page's Rename/Duplicate/Check-for-Updates into an icon toolbar row"
```

---

## Task 2: Proactive link-expiration check on mount

**Files:**
- Modify: `src/components/Collection/CollectionDetailView.jsx` (add a `useEffect` near the component's other effects, and one new state variable)
- Test: Create `src/components/Collection/__tests__/CollectionDetailView.expirationCheck.test.jsx`

**Interfaces:**
- Consumes: `checkShareVersion(shareCode)` from `src/lib/shareApi.js`, which resolves `{ version, locked, hasPin, expiresAt }` or rejects with `Object.assign(new Error(...), { code: 'expired' | 'not_found' | 'network_error' })`.
- Produces: a new `expiresAt` state variable (string ISO date or `null`) that Task 4 reads for the "Save QR" caption. Sets the existing `linkExpired` state to `true` when the mount-time check reports the link is expired — this is the same state Task 1's icon row already branches on, so no JSX changes are needed here.

- [ ] **Step 1: Write the failing test**

Create `src/components/Collection/__tests__/CollectionDetailView.expirationCheck.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionDetailView } from '../CollectionDetailView'

let collectionsSeed = []

const storeState = {
  selectedCollectionId: 'c1',
  get collections() { return collectionsSeed },
  index: [],
  setSelectedCollectionId: vi.fn(),
  renameCollection: vi.fn(),
  deleteCollection: vi.fn(),
  duplicateCollection: vi.fn(),
  setCollectionSongs: vi.fn(),
  removeSongFromCollection: vi.fn(),
  applyShareRefresh: vi.fn(),
  selectSong: vi.fn(),
}

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) => selector(storeState),
}))
vi.mock('../../UGImport/UGSearchModal', () => ({ UGSearchModal: () => null }))
vi.mock('../../../lib/conductorApi', () => ({ endBroadcast: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('../../../lib/shareApi', () => ({
  checkShareVersion: vi.fn(),
  fetchShare: vi.fn(),
}))
vi.mock('../../../lib/parser/sbpParser', () => ({ parseSbpFile: vi.fn() }))
vi.mock('../../../lib/mergeSharedCollection', () => ({ mergeSharedCollection: vi.fn() }))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null) }))

import { checkShareVersion } from '../../../lib/shareApi'

const defaultProps = { onAddToast: vi.fn(), onOpenSidebar: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CollectionDetailView proactive expiration check', () => {
  it('does not call checkShareVersion when the collection has no shareCode', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(checkShareVersion).not.toHaveBeenCalled()
  })

  it('hides Check for updates and shows "Link expired" on mount when the link is already expired', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc', lastVersion: 1 }]
    checkShareVersion.mockRejectedValue(Object.assign(new Error('expired'), { code: 'expired' }))
    render(<CollectionDetailView {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('Link expired')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument()
  })

  it('keeps Check for updates visible when the mount-time check reports the link is still valid', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc', lastVersion: 1 }]
    checkShareVersion.mockResolvedValue({ version: 1, locked: false, hasPin: false, expiresAt: '2026-08-30T00:00:00Z' })
    render(<CollectionDetailView {...defaultProps} />)
    await waitFor(() => expect(checkShareVersion).toHaveBeenCalledWith('abc'))
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument()
    expect(screen.queryByText('Link expired')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Collection/__tests__/CollectionDetailView.expirationCheck.test.jsx`
Expected: FAIL on the second test — nothing currently calls `checkShareVersion` on mount, so `linkExpired` never becomes `true` and "Link expired" never appears without a click.

- [ ] **Step 3: Add the `expiresAt` state and the mount-time check**

In `src/components/Collection/CollectionDetailView.jsx`, find this existing state declaration (currently line 107):

```jsx
  const [linkExpired, setLinkExpired] = useState(false)
```

Change it to also declare `expiresAt`:

```jsx
  const [linkExpired, setLinkExpired] = useState(false)
  const [expiresAt, setExpiresAt] = useState(null)
```

Then find the existing `duplicating` effect (currently lines 143-148):

```jsx
  useEffect(() => {
    if (duplicating) {
      setDuplicateDraft('Copy of ' + (collection?.name ?? ''))
      duplicateInputRef.current?.select()
    }
  }, [duplicating]) // eslint-disable-line react-hooks/exhaustive-deps
```

Add a new effect immediately after it:

```jsx
  useEffect(() => {
    if (!collection?.shareCode) return
    let cancelled = false
    checkShareVersion(collection.shareCode)
      .then(({ expiresAt: serverExpiresAt }) => {
        if (cancelled) return
        if (serverExpiresAt) setExpiresAt(serverExpiresAt)
      })
      .catch(err => {
        if (cancelled) return
        if (err.code === 'expired') setLinkExpired(true)
      })
    return () => { cancelled = true }
  }, [collection?.shareCode])
```

`checkShareVersion` is already imported at the top of this file (`import { checkShareVersion, fetchShare } from '../../lib/shareApi'`), so no new import is needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/Collection/__tests__/CollectionDetailView.expirationCheck.test.jsx`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Run the full CollectionDetailView test suite to check for regressions**

Run: `npx vitest run src/components/Collection/__tests__/`
Expected: PASS — Task 1's tests mock `checkShareVersion` to resolve `{ version: 1 }` by default (no `expiresAt`), which is harmless against this new effect; the `searchUG` test file uses a collection without `shareCode`, so the new effect is a no-op for it.

- [ ] **Step 6: Commit**

```bash
git add src/components/Collection/CollectionDetailView.jsx src/components/Collection/__tests__/CollectionDetailView.expirationCheck.test.jsx
git commit -m "feat: proactively check share-link expiration on collection page load"
```

---

## Task 3: Share icon + inline URL/QR reveal panel

**Files:**
- Modify: `src/components/Collection/CollectionDetailView.jsx`
- Test: Create `src/components/Collection/__tests__/CollectionDetailView.quickShare.test.jsx`

**Interfaces:**
- Consumes: `QRCode.toCanvas(canvasElement, text, options)` from the `qrcode` package (same call signature already used in `src/components/Share/ShareModal.jsx:87`); `collection.shareCode`; `window.location.origin`; `navigator.clipboard.writeText`.
- Produces: a `shareRevealOpen` boolean state and a `shareUrl` derived string that Task 4 reuses for the "Save QR" caption. The panel's canvas ref is named `qrCanvasRef` — Task 4's `handleSaveQr` reads from this same ref.

- [ ] **Step 1: Write the failing test**

Create `src/components/Collection/__tests__/CollectionDetailView.quickShare.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionDetailView } from '../CollectionDetailView'

let collectionsSeed = []

const storeState = {
  selectedCollectionId: 'c1',
  get collections() { return collectionsSeed },
  index: [],
  setSelectedCollectionId: vi.fn(),
  renameCollection: vi.fn(),
  deleteCollection: vi.fn(),
  duplicateCollection: vi.fn(),
  setCollectionSongs: vi.fn(),
  removeSongFromCollection: vi.fn(),
  applyShareRefresh: vi.fn(),
  selectSong: vi.fn(),
}

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) => selector(storeState),
}))
vi.mock('../../UGImport/UGSearchModal', () => ({ UGSearchModal: () => null }))
vi.mock('../../../lib/conductorApi', () => ({ endBroadcast: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('../../../lib/shareApi', () => ({
  checkShareVersion: vi.fn().mockResolvedValue({ version: 1, locked: false, hasPin: false, expiresAt: '2026-08-30T00:00:00Z' }),
  fetchShare: vi.fn(),
}))
vi.mock('../../../lib/parser/sbpParser', () => ({ parseSbpFile: vi.fn() }))
vi.mock('../../../lib/mergeSharedCollection', () => ({ mergeSharedCollection: vi.fn() }))
vi.mock('../../../lib/storage', () => ({ loadSong: vi.fn(() => null) }))
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn() } }))

import QRCode from 'qrcode'

const defaultProps = { onAddToast: vi.fn(), onOpenSidebar: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    value: { origin: 'https://songsheet.example' },
    writable: true,
  })
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  })
})

describe('CollectionDetailView quick-share panel', () => {
  it('does not render the Share icon when the collection has no shareCode', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [] }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Share collection' })).not.toBeInTheDocument()
  })

  it('renders the Share icon when the collection has an unexpired shareCode', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc123', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Share collection' })).toBeInTheDocument()
  })

  it('clicking Share opens a panel with the share URL and renders a QR code for it', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc123', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share collection' }))
    expect(screen.getByDisplayValue('https://songsheet.example/?share=abc123')).toBeInTheDocument()
    await waitFor(() => expect(QRCode.toCanvas).toHaveBeenCalledWith(
      expect.anything(),
      'https://songsheet.example/?share=abc123',
      { width: 220, margin: 2 },
    ))
  })

  it('clicking Share again closes the panel', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc123', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    const shareButton = screen.getByRole('button', { name: 'Share collection' })
    fireEvent.click(shareButton)
    expect(screen.getByDisplayValue('https://songsheet.example/?share=abc123')).toBeInTheDocument()
    fireEvent.click(shareButton)
    expect(screen.queryByDisplayValue('https://songsheet.example/?share=abc123')).not.toBeInTheDocument()
  })

  it('Copy button copies the share URL and shows a transient confirmation', async () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc123', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share collection' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://songsheet.example/?share=abc123')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Collection/__tests__/CollectionDetailView.quickShare.test.jsx`
Expected: FAIL — there is no Share icon, no reveal panel, and no `qrcode` import in the component yet.

- [ ] **Step 3: Add the `qrcode` import, new state, and the Share icon button**

In `src/components/Collection/CollectionDetailView.jsx`, add the QR import near the top alongside the other library imports (after `import { useLibraryStore } from '../../store/libraryStore'`):

```jsx
import QRCode from 'qrcode'
```

Find the `expiresAt` state declaration added in Task 2:

```jsx
  const [expiresAt, setExpiresAt] = useState(null)
```

Add the two new state variables immediately after it:

```jsx
  const [expiresAt, setExpiresAt] = useState(null)
  const [shareRevealOpen, setShareRevealOpen] = useState(false)
  const [copied, setCopied] = useState(false)
```

Find the existing ref declarations:

```jsx
  const renameInputRef = useRef(null)
  const duplicateInputRef = useRef(null)
  const renameEscapeRef = useRef(false)
  const duplicateEscapeRef = useRef(false)
```

Add the new ref immediately after `duplicateEscapeRef`:

```jsx
  const renameInputRef = useRef(null)
  const duplicateInputRef = useRef(null)
  const renameEscapeRef = useRef(false)
  const duplicateEscapeRef = useRef(false)
  const qrCanvasRef = useRef(null)
```

Find the existing `collectionName` derivation, which sits directly above the component's `return (`:

```jsx
  const collectionName = isUncategorized ? 'Uncategorized' : (collection?.name ?? '')

  return (
```

Add `shareUrl` right above it:

```jsx
  const shareUrl = collection?.shareCode
    ? `${window.location.origin}/?share=${collection.shareCode}`
    : ''
  const collectionName = isUncategorized ? 'Uncategorized' : (collection?.name ?? '')

  return (
```

Find the end of `handleConflictApply`:

```jsx
  function handleConflictApply(resolvedPatches) {
    if (!pendingRefresh || !collection) return
    applyShareRefresh(collection.id, {
      patches: [...pendingRefresh.autoApplied, ...resolvedPatches],
      newSongs: pendingRefresh.newSongs,
      removed: pendingRefresh.removed,
      serverSbpIdOrder: pendingRefresh.serverSbpIdOrder,
      newVersion: pendingRefresh.newVersion,
    })
    setPendingRefresh(null)
    onAddToast('Updated — conflicts resolved.', 'success')
  }
```

Add a QR-drawing effect and a copy handler immediately after it:

```jsx
  useEffect(() => {
    if (shareRevealOpen && shareUrl && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, shareUrl, { width: 220, margin: 2 })
    }
  }, [shareRevealOpen, shareUrl])

  async function handleCopyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — user can manually copy the URL
    }
  }
```

Now insert the Share button into the icon row Task 1 created. Find:

```jsx
            {collection?.shareCode && !linkExpired && (
              <button
                type="button"
                onClick={handleCheckUpdates}
                disabled={refreshing}
                aria-label="Check for updates"
```

Insert immediately before it, still inside the `<div className="flex items-stretch gap-2 pt-1">`:

```jsx
            {collection?.shareCode && !linkExpired && (
              <button
                type="button"
                onClick={() => setShareRevealOpen(v => !v)}
                aria-label="Share collection"
                aria-expanded={shareRevealOpen}
                title="Share"
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg
                  border border-gray-300 dark:border-gray-600
                  text-gray-600 dark:text-gray-300
                  hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span aria-hidden="true" className="text-base leading-none">🔗</span>
                <span className="text-[10px] leading-none">Share</span>
              </button>
            )}
```

- [ ] **Step 4: Add the reveal panel**

Find the "Link expired" paragraph Task 1 placed after the icon row:

```jsx
          {collection?.shareCode && linkExpired && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-1">
              Link expired
            </p>
          )}
```

Insert the panel immediately after it (still before the `{duplicating && (...)}` block):

```jsx
          {shareRevealOpen && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Share link</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700
                    text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleCopyShareUrl}
                  className="shrink-0 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                    text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="flex justify-center">
                <canvas ref={qrCanvasRef} className="rounded-lg border border-gray-200 dark:border-gray-700" />
              </div>
            </div>
          )}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/Collection/__tests__/CollectionDetailView.quickShare.test.jsx`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Run the full CollectionDetailView test suite to check for regressions**

Run: `npx vitest run src/components/Collection/__tests__/`
Expected: PASS across all four files (`actionIcons`, `expirationCheck`, `quickShare`, `searchUG`)

- [ ] **Step 7: Commit**

```bash
git add src/components/Collection/CollectionDetailView.jsx src/components/Collection/__tests__/CollectionDetailView.quickShare.test.jsx
git commit -m "feat: add Share icon with inline URL + QR reveal panel to collections page"
```

---

## Task 4: "Save QR" download button

**Files:**
- Modify: `src/components/Collection/CollectionDetailView.jsx`
- Test: Modify `src/components/Collection/__tests__/CollectionDetailView.quickShare.test.jsx`

**Interfaces:**
- Consumes: `qrCanvasRef` and `expiresAt` (from Task 2) and `collectionName` (already computed in the component).
- Produces: a `handleSaveQr` function and a "Save QR" button inside the reveal panel. No other task depends on this one.

**Note on test depth:** jsdom (this project's test environment) has no `canvas` package installed, so `HTMLCanvasElement.prototype.getContext('2d')` returns `null` in tests. `ShareModal.jsx`'s existing, shipped `handleDownloadQr` (which this task's `handleSaveQr` mirrors) has the same limitation and is not click-tested anywhere in the current suite for the same reason. This task follows that precedent: test that the button renders, but don't click it in the test.

- [ ] **Step 1: Write the failing test**

Add this test to `src/components/Collection/__tests__/CollectionDetailView.quickShare.test.jsx`, inside the existing `describe` block:

```jsx
  it('shows a Save QR button once the share panel is open', () => {
    collectionsSeed = [{ id: 'c1', name: 'Sunday Set', createdAt: '2026-01-01T00:00:00Z', songIds: [], shareCode: 'abc123', lastVersion: 1 }]
    render(<CollectionDetailView {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Save QR' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Share collection' }))
    expect(screen.getByRole('button', { name: 'Save QR' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Collection/__tests__/CollectionDetailView.quickShare.test.jsx`
Expected: FAIL — no "Save QR" button exists yet.

- [ ] **Step 3: Add `handleSaveQr` and the button**

In `src/components/Collection/CollectionDetailView.jsx`, add this function right after `handleCopyShareUrl`:

```jsx
  function handleSaveQr() {
    const qr = qrCanvasRef.current
    if (!qr) return

    const name = collectionName
    const expiry = expiresAt ? `Expires ${new Date(expiresAt).toLocaleDateString()}` : ''
    const padding = 16
    const lineHeight = 20
    const textLines = [name, expiry].filter(Boolean)

    const offscreen = document.createElement('canvas')
    offscreen.width = qr.width + padding * 2
    offscreen.height = qr.height + padding * 2 + textLines.length * lineHeight + padding

    const ctx = offscreen.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, offscreen.width, offscreen.height)
    ctx.drawImage(qr, padding, padding)

    let y = qr.height + padding * 2 + lineHeight / 2
    textLines.forEach((line, i) => {
      ctx.font = i === 0 && name ? 'bold 14px sans-serif' : '12px sans-serif'
      ctx.fillStyle = i === 0 && name ? '#1f2937' : '#6b7280'
      ctx.textAlign = 'center'
      ctx.fillText(line, offscreen.width / 2, y)
      y += lineHeight
    })

    const a = document.createElement('a')
    a.href = offscreen.toDataURL('image/png')
    a.download = 'share-qr.png'
    a.click()
  }
```

Note: `collectionName` is already computed earlier in the component (`const collectionName = isUncategorized ? 'Uncategorized' : (collection?.name ?? '')`) — no new derivation needed.

Add the button to the reveal panel, right after the `<canvas>` element's wrapping `<div>`:

```jsx
              <div className="flex justify-center">
                <canvas ref={qrCanvasRef} className="rounded-lg border border-gray-200 dark:border-gray-700" />
              </div>
              <button
                type="button"
                onClick={handleSaveQr}
                className="w-full py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                  text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Save QR
              </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/Collection/__tests__/CollectionDetailView.quickShare.test.jsx`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Run the full project test suite**

Run: `npx vitest run`
Expected: PASS across the whole suite — this confirms nothing outside `CollectionDetailView`'s own tests broke.

- [ ] **Step 6: Commit**

```bash
git add src/components/Collection/CollectionDetailView.jsx src/components/Collection/__tests__/CollectionDetailView.quickShare.test.jsx
git commit -m "feat: add Save QR download button to the collection share panel"
```

---

## Manual verification (after all tasks)

Automated tests can't exercise real canvas rendering or clipboard permissions. Before considering this done, run the dev server (`npm run dev`) and manually check, for a collection with a real `shareCode`:

1. The icon row shows Rename, Duplicate, Share, and Check-for-updates — all four fit on one row without wrapping awkwardly on a phone-width viewport.
2. Clicking Share reveals a real, scannable QR code and the correct URL; Copy actually puts the URL on the clipboard; Save QR downloads a PNG with the collection name and expiry caption.
3. For a collection with no `shareCode`, only Rename and Duplicate appear in the row.
4. For a collection whose link has actually expired server-side, load the page fresh (not via a client-side nav that skips remount) and confirm Share/Check-for-updates are absent and "Link expired" shows without needing to click anything first.
