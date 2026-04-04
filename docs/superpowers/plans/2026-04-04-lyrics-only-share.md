# Lyrics-Only Share Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow senders to share songs in lyrics-only mode; recipients who import such a share have chords hidden for their session without permanently overwriting their preference.

**Architecture:** The `lyricsOnly` flag is embedded in the SBP ZIP JSON (alongside `collectionName`). On import, `App.jsx` sets a temporary in-memory `sessionLyricsOnly` state (not persisted to localStorage). The effective lyrics-only value is `lyricsOnly || sessionLyricsOnly`, and it resets on page reload. The Settings toggle is updated to always set `lyricsOnly` to the logical opposite of the effective value, avoiding a state conflict.

**Tech Stack:** React 18, Vite, Vitest + @testing-library/react, JSZip, Zustand, Tailwind CSS

---

## File Map

| File | Change |
|---|---|
| `src/lib/exportSbp.js` | Add `lyricsOnly` param to `buildSbpZip` and `exportSongsAsSbp` |
| `src/lib/parser/sbpParser.js` | Return `lyricsOnly` field from `parseSbpFile` |
| `src/components/Share/ShareModal.jsx` | Add "Share lyrics only" toggle |
| `src/components/Share/ImportConfirmModal.jsx` | Add `lyricsOnly` prop + explanatory note |
| `src/App.jsx` | Add `sessionLyricsOnly` state, compute `effectiveLyricsOnly`, wire import + toggle |
| `src/test/exportSbp.test.js` | Add tests for `lyricsOnly` in ZIP JSON |
| `src/lib/parser/__tests__/sbpParser.test.js` | Add tests for `lyricsOnly` parsing |
| `src/test/ShareModal.test.jsx` | Add tests for toggle + flag forwarding |
| `src/test/ImportConfirmModal.test.jsx` | Add tests for lyrics-only note |

---

## Task 1: Data layer — exportSbp

**Files:**
- Modify: `src/lib/exportSbp.js`
- Test: `src/test/exportSbp.test.js`

- [ ] **Step 1: Write failing tests**

Add two tests at the bottom of the `describe` block in `src/test/exportSbp.test.js`:

```js
it('includes lyricsOnly:true in ZIP JSON when flag is true', async () => {
  const buf = await buildSbpZip([mockSong], null, true).generateAsync({ type: 'uint8array' })
  const zip = await JSZip.loadAsync(buf)
  const text = await zip.file('dataFile.txt').async('string')
  const json = JSON.parse(text.slice(text.indexOf('\n') + 1))
  expect(json.lyricsOnly).toBe(true)
})

it('omits lyricsOnly from ZIP JSON when flag is false or omitted', async () => {
  const { json } = await parseZip([mockSong])  // uses existing helper, no lyricsOnly
  expect(json.lyricsOnly).toBeUndefined()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/exportSbp.test.js
```

Expected: both new tests FAIL (buildSbpZip called with 3 args but ignores the third)

- [ ] **Step 3: Update `buildSbpZip` and `exportSongsAsSbp` in `src/lib/exportSbp.js`**

```js
export function buildSbpZip(songs, collectionName = null, lyricsOnly = false) {
  const sbpSongs = songs.map(songToSbpJson)
  const data = {
    ...(collectionName ? { collectionName } : {}),
    ...(lyricsOnly ? { lyricsOnly: true } : {}),
    songs: sbpSongs,
    sets: [],
    folders: [],
  }
  const json = JSON.stringify(data)

  const zip = new JSZip()
  zip.file('dataFile.txt', '1.0\n' + json)
  zip.file('dataFile.hash', '00000000000000000000000000000000')
  return zip
}

export async function exportSongsAsSbp(songs, collectionName = null, lyricsOnly = false) {
  return buildSbpZip(songs, collectionName, lyricsOnly).generateAsync({ type: 'blob' })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/exportSbp.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportSbp.js src/test/exportSbp.test.js
git commit -m "feat: embed lyricsOnly flag in SBP ZIP export"
```

---

## Task 2: Data layer — sbpParser

**Files:**
- Modify: `src/lib/parser/sbpParser.js`
- Test: `src/lib/parser/__tests__/sbpParser.test.js`

- [ ] **Step 1: Write failing tests**

Add two tests to `src/lib/parser/__tests__/sbpParser.test.js`. The file already has a `makeMockSbp(songs, extra = {})` helper that accepts extra top-level JSON fields — use it.

```js
it('returns lyricsOnly:true when present in ZIP JSON', async () => {
  const buf = await makeMockSbp(
    [{ Id: 1, name: 'Song', author: '', key: 0, Capo: 0, TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0 }],
    { lyricsOnly: true }
  )
  const result = await parseSbpFile(buf)
  expect(result.lyricsOnly).toBe(true)
})

it('returns lyricsOnly:false when absent from ZIP JSON', async () => {
  const buf = await makeMockSbp(
    [{ Id: 1, name: 'Song', author: '', key: 0, Capo: 0, TempoInt: 0, timeSig: '', Copyright: '', content: '', KeyShift: 0 }]
  )
  const result = await parseSbpFile(buf)
  expect(result.lyricsOnly).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/parser/__tests__/sbpParser.test.js
```

Expected: both new tests FAIL (`result.lyricsOnly` is `undefined`)

- [ ] **Step 3: Update `parseSbpFile` return value in `src/lib/parser/sbpParser.js`**

Replace the current return statement (line 102):

```js
  return { songs, collectionName: data.collectionName ?? null }
```

With:

```js
  return {
    songs,
    collectionName: data.collectionName ?? null,
    lyricsOnly: data.lyricsOnly ?? false,
  }
```

Also update the early-return on line 96 (empty songs array) to include the new field:

```js
  if (!data || !Array.isArray(data.songs)) return { songs: [], collectionName: null, lyricsOnly: false }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/parser/__tests__/sbpParser.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/parser/sbpParser.js src/lib/parser/__tests__/sbpParser.test.js
git commit -m "feat: parse lyricsOnly flag from SBP ZIP"
```

---

## Task 3: Sender UI — ShareModal toggle

**Files:**
- Modify: `src/components/Share/ShareModal.jsx`
- Test: `src/test/ShareModal.test.jsx`

- [ ] **Step 1: Write failing tests**

Add two tests to the `describe('ShareModal')` block in `src/test/ShareModal.test.jsx`:

```js
it('renders "Share lyrics only" toggle unchecked by default', () => {
  render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
  const toggle = screen.getByRole('switch', { name: /share lyrics only/i });
  expect(toggle).toBeInTheDocument();
  expect(toggle).toHaveAttribute('aria-checked', 'false');
});

it('passes lyricsOnly=true to exportSongsAsSbp when toggle is on', async () => {
  uploadShare.mockResolvedValue({
    shareCode: 'x',
    shareUrl: 'http://app?share=x',
    expiresAt: new Date().toISOString(),
  });
  render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('switch', { name: /share lyrics only/i }));
  fireEvent.click(screen.getByText('Create link'));
  await screen.findByDisplayValue('http://app?share=x');
  expect(exportSongsAsSbp).toHaveBeenCalledWith(
    songs,
    null,  // nameValue is '' → ''.trim() || null = null
    true
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/ShareModal.test.jsx
```

Expected: both new tests FAIL (toggle not found)

- [ ] **Step 3: Update `ShareModal.jsx`**

Add state and reset, then add the toggle UI between the expiry selector and the action buttons.

At the top of `ShareModal`, add state alongside existing state declarations:

```js
const [shareLyricsOnly, setShareLyricsOnly] = useState(false);
```

In `handleClose`, add a reset:

```js
setShareLyricsOnly(false);
```

In `handleCreateLink`, update the `exportSongsAsSbp` call:

```js
const blob = await exportSongsAsSbp(songs, nameValue.trim() || null, shareLyricsOnly);
```

Add the toggle between the expiry `<div>` and the button row `<div>` in the `idle` step:

```jsx
<div>
  <button
    type="button"
    role="switch"
    aria-checked={shareLyricsOnly}
    aria-label="Share lyrics only"
    onClick={() => setShareLyricsOnly(v => !v)}
    className="flex items-center gap-3 w-full text-left"
  >
    <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
      transition-colors duration-200
      ${shareLyricsOnly ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
        ${shareLyricsOnly ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
    <span className="text-sm text-gray-700 dark:text-gray-300">Share lyrics only</span>
  </button>
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/ShareModal.test.jsx
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Share/ShareModal.jsx src/test/ShareModal.test.jsx
git commit -m "feat: add lyrics-only toggle to ShareModal"
```

---

## Task 4: Recipient UI — ImportConfirmModal note

**Files:**
- Modify: `src/components/Share/ImportConfirmModal.jsx`
- Test: `src/test/ImportConfirmModal.test.jsx`

- [ ] **Step 1: Write failing tests**

Add two tests to the `describe('ImportConfirmModal')` block in `src/test/ImportConfirmModal.test.jsx`:

```js
it('shows lyrics-only note when lyricsOnly prop is true', () => {
  render(
    <ImportConfirmModal
      isOpen
      songs={songs}
      lyricsOnly={true}
      onImport={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(
    screen.getByText(/chords will be hidden/i)
  ).toBeInTheDocument();
});

it('does not show lyrics-only note when lyricsOnly prop is false', () => {
  render(
    <ImportConfirmModal
      isOpen
      songs={songs}
      lyricsOnly={false}
      onImport={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(screen.queryByText(/chords will be hidden/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/ImportConfirmModal.test.jsx
```

Expected: first new test FAILS (note not found)

- [ ] **Step 3: Update `ImportConfirmModal.jsx`**

Add `lyricsOnly` to the props and render the note below the song list (before the collection name line):

```jsx
export function ImportConfirmModal({ isOpen, songs, collectionName, lyricsOnly = false, onImport, onCancel }) {
  const displayName = collectionName || 'Shared Songs'
  return (
    <Modal isOpen={isOpen} title="Shared Songbook" onClose={onCancel}>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        {songs.length} song{songs.length !== 1 ? 's' : ''} shared with you:
      </p>
      <ul className="mb-4 max-h-48 overflow-y-auto space-y-1">
        {songs.map((song, i) => (
          <li key={i} className="text-sm text-gray-800 dark:text-gray-200">
            • {song.meta?.title ?? 'Untitled'}
          </li>
        ))}
      </ul>
      {lyricsOnly && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Chords will be hidden — this collection was shared in lyrics-only mode.
        </p>
      )}
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Will be added to collection: <span className="font-medium text-gray-700 dark:text-gray-300">{displayName}</span>
      </p>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onImport}>Import All</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/ImportConfirmModal.test.jsx
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Share/ImportConfirmModal.jsx src/test/ImportConfirmModal.test.jsx
git commit -m "feat: show lyrics-only note in ImportConfirmModal"
```

---

## Task 5: App.jsx — session state wiring

**Files:**
- Modify: `src/App.jsx`
- Test: none (App.jsx wiring is covered by existing integration smoke test; no isolated unit test needed for the wiring logic itself)

- [ ] **Step 1: Add `sessionLyricsOnly` state and compute `effectiveLyricsOnly`**

In `src/App.jsx`, after the existing `lyricsOnly` line:

```js
const [lyricsOnly, setLyricsOnly] = useLocalStorage('songsheet_lyrics_only', false)
```

Add:

```js
const [sessionLyricsOnly, setSessionLyricsOnly] = useState(false)
const effectiveLyricsOnly = lyricsOnly || sessionLyricsOnly
```

(`useState` is already imported at the top of `App.jsx`.)

- [ ] **Step 2: Update `handleShareImport` to set session flag**

Replace the existing `handleShareImport` function:

```js
function handleShareImport() {
  if (shareSongs) {
    const name = shareSongs.collectionName || 'Shared Songs'
    addSongs(shareSongs.songs, name)
    const count = shareSongs.songs.length
    addToast(`${count} song${count !== 1 ? 's' : ''} imported.`, 'success')
    if (shareSongs.lyricsOnly) setSessionLyricsOnly(true)
    setSidebarOpen(true)
  }
  setShareSongs(null)
  clearShareParam()
}
```

- [ ] **Step 3: Fix the `onToggleLyricsOnly` handler**

Replace the inline `() => setLyricsOnly(v => !v)` passed to `SettingsPanel` with a named handler. Add this function to `App.jsx`:

```js
function handleToggleLyricsOnly() {
  setSessionLyricsOnly(false)
  setLyricsOnly(!effectiveLyricsOnly)
}
```

- [ ] **Step 4: Update all prop usages to use `effectiveLyricsOnly`**

In the JSX, replace every occurrence of `lyricsOnly` (the raw state) passed as a prop with `effectiveLyricsOnly`:

```jsx
{/* MainContent — was: lyricsOnly={lyricsOnly} */}
<MainContent
  onAddToast={addToast}
  lyricsOnly={effectiveLyricsOnly}
  fontSize={fontSize}
  onFontSizeChange={setFontSize}
  onImportSuccess={() => { if (window.innerWidth < 768) setSidebarOpen(true) }}
/>

{/* SettingsPanel — was: lyricsOnly={lyricsOnly} onToggleLyricsOnly={() => setLyricsOnly(v => !v)} */}
{settingsOpen && (
  <SettingsPanel
    onClose={() => setSettingsOpen(false)}
    lyricsOnly={effectiveLyricsOnly}
    onToggleLyricsOnly={handleToggleLyricsOnly}
  />
)}

{/* ImportConfirmModal — add lyricsOnly prop */}
<ImportConfirmModal
  isOpen={shareSongs !== null}
  songs={shareSongs?.songs ?? []}
  collectionName={shareSongs?.collectionName ?? null}
  lyricsOnly={shareSongs?.lyricsOnly ?? false}
  onImport={handleShareImport}
  onCancel={handleShareCancel}
/>
```

- [ ] **Step 5: Run full test suite to verify nothing broke**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire lyrics-only session state on share import"
```
