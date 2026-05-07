# Album Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to edit a published album (title, artist, cover, track order, add/remove songs) and re-publish under the same URL.

**Architecture:** A `PATCH /album/:code` worker endpoint updates metadata in place; a `POST /album/:code/cover` endpoint replaces cover art. `NewAlbumCreator` accepts an optional `album` prop that switches it to edit mode — pre-populating fields, skipping upload for existing tracks, and calling update instead of create on publish. `AlbumDetailView` gains an "Edit Album" button that calls a new `setEditingAlbum` store action, keeping `activeAlbumCode` intact so cancelling returns to the detail view.

**Tech Stack:** Hono (worker router), Cloudflare R2, Zustand, React 18, dnd-kit, Vitest + @testing-library/react, `@cloudflare/vitest-pool-workers`

---

## File Map

| File | Change |
|---|---|
| `songbook-worker/vitest.config.ts` | Add `r2Buckets: ['R2_BUCKET']` to miniflare config |
| `songbook-worker/src/routes/album.ts` | Add `PATCH /:code` and `POST /:code/cover`; add `PATCH` to CORS |
| `songbook-worker/src/routes/album.test.ts` | New — worker integration tests for both new endpoints |
| `src/lib/albumApi.js` | Add `updateAlbumMeta`, `updateAlbumCover`, `updateAlbumLocally` |
| `src/store/libraryStore.js` | Add `editingAlbum: null` state; add `setEditingAlbum` action; update `setIsCreatingNewAlbum` to clear `editingAlbum` |
| `src/store/__tests__/libraryStore.editingAlbum.test.js` | New — store unit tests |
| `src/components/Album/AlbumDetailView.jsx` | Add "Edit Album" button |
| `src/components/SongList/MainContent.jsx` | Subscribe to `editingAlbum`; pass `album={editingAlbum}` to `NewAlbumCreator` |
| `src/components/Album/NewAlbumCreator.jsx` | Accept `album` prop; edit-mode init; re-publish logic |
| `src/test/NewAlbumCreator.edit.test.jsx` | New — render tests for edit mode |

---

### Task 1: Add R2 to worker test environment and write failing PATCH test

**Files:**
- Modify: `songbook-worker/vitest.config.ts`
- Create: `songbook-worker/src/routes/album.test.ts`

- [ ] **Step 1: Add R2 bucket to miniflare config**

Open `songbook-worker/vitest.config.ts` and replace the existing content with:

```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: { APP_ORIGIN: 'http://localhost:5173' },
          kvNamespaces: ['SESSION_KV'],
          r2Buckets: ['R2_BUCKET'],
        },
      },
    },
  },
});
```

- [ ] **Step 2: Create `album.test.ts` with failing PATCH test**

Create `songbook-worker/src/routes/album.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const BASE = 'http://localhost';
const JSON_H = { 'Content-Type': 'application/json' };

async function createAlbum() {
  const form = new FormData();
  form.append('meta', JSON.stringify({
    title: 'Original Title',
    artist: 'Original Artist',
    tracks: [{ trackId: 'track-1', title: 'Song One', duration: 120000, mimeType: 'audio/webm' }],
  }));
  const res = await SELF.fetch(`${BASE}/album`, { method: 'POST', body: form });
  return res.json() as Promise<{ albumCode: string; creatorToken: string }>;
}

describe('PATCH /album/:code', () => {
  it('updates title and artist with valid creator token', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    const res = await SELF.fetch(`${BASE}/album/${albumCode}`, {
      method: 'PATCH',
      headers: { ...JSON_H, 'X-Creator-Token': creatorToken },
      body: JSON.stringify({ title: 'New Title', artist: 'New Artist', tracks: [] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns 403 with wrong creator token', async () => {
    const { albumCode } = await createAlbum();
    const res = await SELF.fetch(`${BASE}/album/${albumCode}`, {
      method: 'PATCH',
      headers: { ...JSON_H, 'X-Creator-Token': 'wrong-token' },
      body: JSON.stringify({ title: 'Hacked', artist: '', tracks: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent album', async () => {
    const res = await SELF.fetch(`${BASE}/album/does-not-exist`, {
      method: 'PATCH',
      headers: { ...JSON_H, 'X-Creator-Token': 'any' },
      body: JSON.stringify({ title: 'X', artist: '', tracks: [] }),
    });
    expect(res.status).toBe(404);
  });

  it('persists updated title in GET response', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    await SELF.fetch(`${BASE}/album/${albumCode}`, {
      method: 'PATCH',
      headers: { ...JSON_H, 'X-Creator-Token': creatorToken },
      body: JSON.stringify({ title: 'Persisted Title', artist: 'Band', tracks: [] }),
    });
    const get = await SELF.fetch(`${BASE}/album/${albumCode}`);
    const meta = await get.json() as { title: string; artist: string };
    expect(meta.title).toBe('Persisted Title');
    expect(meta.artist).toBe('Band');
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd songbook-worker && npx vitest run src/routes/album.test.ts
```

Expected: 4 failures — PATCH route does not exist yet.

---

### Task 2: Implement PATCH /album/:code in the worker

**Files:**
- Modify: `songbook-worker/src/routes/album.ts`

- [ ] **Step 1: Add PATCH to CORS allowed methods**

In `songbook-worker/src/routes/album.ts`, replace the `PUBLIC_CORS` constant:

```typescript
const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Creator-Token',
};
```

- [ ] **Step 2: Add PATCH route after the existing `POST /:code/track/:trackId` route**

Insert after line 107 (after the closing `});` of the track upload route):

```typescript
// PATCH /album/:code — update metadata (title, artist, tracks)
album.patch('/:code', async (c) => {
  const { code } = c.req.param();
  const creatorToken = c.req.header('X-Creator-Token');

  const meta = await getAlbumMetaRaw(c.env.R2_BUCKET, code);
  if (!meta) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: PUBLIC_CORS });
  if (meta.creatorToken !== creatorToken) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: PUBLIC_CORS });
  }

  let body: { title?: string; artist?: string; tracks?: AlbumMeta['tracks'] };
  try {
    body = await c.req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400, headers: PUBLIC_CORS });
  }

  const updated: AlbumMeta = {
    ...meta,
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.artist !== undefined ? { artist: body.artist } : {}),
    ...(body.tracks !== undefined ? { tracks: body.tracks } : {}),
  };
  await putAlbumMeta(c.env.R2_BUCKET, code, updated);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
  });
});
```

- [ ] **Step 3: Run PATCH tests to confirm they pass**

```bash
cd songbook-worker && npx vitest run src/routes/album.test.ts --reporter=verbose
```

Expected: 4 passing tests in the `PATCH /album/:code` describe block.

- [ ] **Step 4: Commit**

```bash
git add songbook-worker/vitest.config.ts songbook-worker/src/routes/album.ts songbook-worker/src/routes/album.test.ts
git commit -m "feat(worker): add PATCH /album/:code endpoint for metadata updates"
```

---

### Task 3: Add failing cover-update test, then implement POST /album/:code/cover

**Files:**
- Modify: `songbook-worker/src/routes/album.test.ts`
- Modify: `songbook-worker/src/routes/album.ts`

- [ ] **Step 1: Append cover tests to `album.test.ts`**

Add this block at the end of `songbook-worker/src/routes/album.test.ts`:

```typescript
describe('POST /album/:code/cover', () => {
  it('accepts a cover image and returns ok', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const res = await SELF.fetch(`${BASE}/album/${albumCode}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Creator-Token': creatorToken },
      body: imageBytes,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('sets hasCover:true on the album metadata', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff]); // JPEG magic bytes
    await SELF.fetch(`${BASE}/album/${albumCode}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'X-Creator-Token': creatorToken },
      body: imageBytes,
    });
    const meta = await (await SELF.fetch(`${BASE}/album/${albumCode}`)).json() as { hasCover: boolean; coverExt: string };
    expect(meta.hasCover).toBe(true);
    expect(meta.coverExt).toBe('jpg');
  });

  it('returns 403 with wrong token', async () => {
    const { albumCode } = await createAlbum();
    const res = await SELF.fetch(`${BASE}/album/${albumCode}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'X-Creator-Token': 'bad-token' },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 when body is empty', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    const res = await SELF.fetch(`${BASE}/album/${albumCode}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'X-Creator-Token': creatorToken },
      body: new Uint8Array([]),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to confirm the cover tests fail**

```bash
cd songbook-worker && npx vitest run src/routes/album.test.ts
```

Expected: 4 PATCH tests pass, 4 cover tests fail.

- [ ] **Step 3: Implement `POST /album/:code/cover` route**

In `songbook-worker/src/routes/album.ts`, insert this route after the PATCH route:

```typescript
// POST /album/:code/cover — replace cover image
album.post('/:code/cover', async (c) => {
  const { code } = c.req.param();
  const creatorToken = c.req.header('X-Creator-Token');

  const meta = await getAlbumMetaRaw(c.env.R2_BUCKET, code);
  if (!meta) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: PUBLIC_CORS });
  if (meta.creatorToken !== creatorToken) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: PUBLIC_CORS });
  }

  const mime = c.req.header('Content-Type') ?? 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0) {
    return new Response(JSON.stringify({ error: 'no_body' }), { status: 400, headers: PUBLIC_CORS });
  }

  await putAlbumCover(c.env.R2_BUCKET, code, ext, buf, mime);
  await putAlbumMeta(c.env.R2_BUCKET, code, { ...meta, hasCover: true, coverExt: ext });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
  });
});
```

- [ ] **Step 4: Run all album tests to confirm all pass**

```bash
cd songbook-worker && npx vitest run src/routes/album.test.ts --reporter=verbose
```

Expected: 8 passing tests.

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/routes/album.ts songbook-worker/src/routes/album.test.ts
git commit -m "feat(worker): add POST /album/:code/cover endpoint for cover replacement"
```

---

### Task 4: Add updateAlbumMeta, updateAlbumCover, updateAlbumLocally to albumApi.js

**Files:**
- Modify: `src/lib/albumApi.js`

- [ ] **Step 1: Append the three new functions to `src/lib/albumApi.js`**

Add at the end of the file (after `removeAlbumLocally`):

```js
/**
 * Update album metadata (title, artist, tracks) on the worker.
 * @param {{ albumCode: string, creatorToken: string, title: string, artist: string, tracks: Array }} opts
 */
export async function updateAlbumMeta({ albumCode, creatorToken, title, artist, tracks }) {
  const res = await fetch(`${WORKER_URL}/album/${albumCode}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Creator-Token': creatorToken },
    body: JSON.stringify({ title, artist, tracks }),
  })
  if (!res.ok) throw Object.assign(new Error('update_failed'), { code: 'update_failed' })
}

/**
 * Replace the cover image for an existing album.
 * @param {string} albumCode
 * @param {File} coverFile
 * @param {string} creatorToken
 */
export async function updateAlbumCover(albumCode, coverFile, creatorToken) {
  const buf = await coverFile.arrayBuffer()
  const res = await fetch(`${WORKER_URL}/album/${albumCode}/cover`, {
    method: 'POST',
    headers: { 'Content-Type': coverFile.type || 'image/jpeg', 'X-Creator-Token': creatorToken },
    body: buf,
  })
  if (!res.ok) throw Object.assign(new Error('cover_update_failed'), { code: 'cover_update_failed' })
}

/**
 * Update the locally stored album entry by albumCode.
 * @param {{ albumCode: string, title: string, artist: string, tracks: Array }} opts
 */
export function updateAlbumLocally({ albumCode, title, artist, tracks }) {
  const existing = loadMyAlbums()
  const updated = existing.map(a =>
    a.albumCode === albumCode ? { ...a, title, artist, tracks } : a
  )
  localStorage.setItem(ALBUMS_KEY, JSON.stringify(updated))
}
```

- [ ] **Step 2: Verify the frontend builds without errors**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npx vite build --mode development 2>&1 | tail -10
```

Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/albumApi.js
git commit -m "feat(albumApi): add updateAlbumMeta, updateAlbumCover, updateAlbumLocally"
```

---

### Task 5: Add editingAlbum state and setEditingAlbum action to the store

**Files:**
- Modify: `src/store/libraryStore.js`
- Create: `src/store/__tests__/libraryStore.editingAlbum.test.js`

- [ ] **Step 1: Write failing store tests**

Create `src/store/__tests__/libraryStore.editingAlbum.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from '../libraryStore'

const album = {
  albumCode: 'ABC123',
  creatorToken: 'tok',
  title: 'Test Album',
  artist: 'Band',
  createdAt: new Date().toISOString(),
  tracks: [],
}

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    editingAlbum: null,
    isCreatingNewAlbum: false,
    activeAlbumCode: null,
    activeSongId: null,
    activeSong: null,
    editingSongId: null,
    isCreatingNewSong: false,
  })
})

describe('setEditingAlbum', () => {
  it('sets editingAlbum and enables isCreatingNewAlbum', () => {
    useLibraryStore.getState().setEditingAlbum(album)
    const state = useLibraryStore.getState()
    expect(state.editingAlbum).toEqual(album)
    expect(state.isCreatingNewAlbum).toBe(true)
  })

  it('does NOT clear activeAlbumCode (so cancel returns to detail view)', () => {
    useLibraryStore.setState({ activeAlbumCode: 'ABC123' })
    useLibraryStore.getState().setEditingAlbum(album)
    expect(useLibraryStore.getState().activeAlbumCode).toBe('ABC123')
  })
})

describe('setIsCreatingNewAlbum', () => {
  it('clears editingAlbum when called with false', () => {
    useLibraryStore.setState({ editingAlbum: album, isCreatingNewAlbum: true })
    useLibraryStore.getState().setIsCreatingNewAlbum(false)
    expect(useLibraryStore.getState().editingAlbum).toBeNull()
    expect(useLibraryStore.getState().isCreatingNewAlbum).toBe(false)
  })

  it('clears editingAlbum when called with true (new album, not edit)', () => {
    useLibraryStore.setState({ editingAlbum: album })
    useLibraryStore.getState().setIsCreatingNewAlbum(true)
    expect(useLibraryStore.getState().editingAlbum).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npx vitest run src/store/__tests__/libraryStore.editingAlbum.test.js
```

Expected: failures — `editingAlbum` and `setEditingAlbum` do not exist yet.

- [ ] **Step 3: Add editingAlbum state to the store initial state**

In `src/store/libraryStore.js`, find the block where `isCreatingNewAlbum: false` is declared (around line 26) and add the new field directly after it:

```js
  isCreatingNewAlbum: false,
  editingAlbum: null,             // album object being edited, or null
```

- [ ] **Step 4: Add setEditingAlbum action**

In `src/store/libraryStore.js`, find `setIsCreatingNewAlbum` and add `setEditingAlbum` directly before it:

```js
  setEditingAlbum(album) {
    // Sets edit mode without clearing activeAlbumCode — cancel returns to detail view
    set({ editingAlbum: album, isCreatingNewAlbum: true })
  },

  setIsCreatingNewAlbum(val) {
    set({
      isCreatingNewAlbum: val,
      editingAlbum: null,
      ...(val ? { activeSongId: null, activeSong: null, activeAlbumCode: null, editingSongId: null, isCreatingNewSong: false } : {}),
    })
  },
```

- [ ] **Step 5: Run store tests to confirm they pass**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npx vitest run src/store/__tests__/libraryStore.editingAlbum.test.js --reporter=verbose
```

Expected: 4 passing tests.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npx vitest run
```

Expected: all previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/store/libraryStore.js src/store/__tests__/libraryStore.editingAlbum.test.js
git commit -m "feat(store): add editingAlbum state and setEditingAlbum action"
```

---

### Task 6: Wire up Edit Album button in AlbumDetailView and pass editingAlbum through MainContent

**Files:**
- Modify: `src/components/Album/AlbumDetailView.jsx`
- Modify: `src/components/SongList/MainContent.jsx`

- [ ] **Step 1: Add Edit Album button to AlbumDetailView**

In `src/components/Album/AlbumDetailView.jsx`, add `setEditingAlbum` to the store subscription at the top of the component:

```jsx
export function AlbumDetailView({ album }) {
  const setActiveAlbumCode = useLibraryStore(s => s.setActiveAlbumCode)
  const syncAlbums = useLibraryStore(s => s.syncAlbums)
  const setEditingAlbum = useLibraryStore(s => s.setEditingAlbum)
```

Then, directly after the "Open Album ↗" `<a>` tag (around line 81), add the Edit Album button:

```jsx
        <a
          href={albumUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
        >
          Open Album ↗
        </a>
        <button
          type="button"
          onClick={() => setEditingAlbum(album)}
          className="mt-2 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg border border-indigo-500
            text-indigo-600 dark:text-indigo-400 text-sm font-semibold
            hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        >
          Edit Album
        </button>
```

- [ ] **Step 2: Subscribe to editingAlbum in MainContent and pass as prop**

In `src/components/SongList/MainContent.jsx`, add `editingAlbum` to the store subscriptions after `isCreatingNewAlbum`:

```jsx
  const isCreatingNewAlbum = useLibraryStore(s => s.isCreatingNewAlbum)
  const editingAlbum = useLibraryStore(s => s.editingAlbum)
```

Then update the `NewAlbumCreator` usage (around line 151):

```jsx
      {isCreatingNewAlbum
        ? <NewAlbumCreator album={editingAlbum} />
```

- [ ] **Step 3: Update the AlbumDetailView test to include setEditingAlbum in mock**

In `src/test/AlbumDetailView.test.jsx`, update the `useLibraryStore` mock to include `setEditingAlbum`:

```jsx
vi.mock('../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    setActiveAlbumCode: vi.fn(),
    syncAlbums: vi.fn(),
    setEditingAlbum: vi.fn(),
  }),
}))
```

Then add a test for the new button:

```jsx
  it('renders Edit Album button', () => {
    render(<AlbumDetailView album={album} />)
    expect(screen.getByRole('button', { name: /edit album/i })).toBeDefined()
  })
```

- [ ] **Step 4: Run tests**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npx vitest run src/test/AlbumDetailView.test.jsx --reporter=verbose
```

Expected: all tests pass including the new Edit Album button test.

- [ ] **Step 5: Commit**

```bash
git add src/components/Album/AlbumDetailView.jsx src/components/SongList/MainContent.jsx src/test/AlbumDetailView.test.jsx
git commit -m "feat(albums): add Edit Album button and wire editingAlbum through MainContent"
```

---

### Task 7: Update NewAlbumCreator — accept album prop and initialize edit mode state

**Files:**
- Modify: `src/components/Album/NewAlbumCreator.jsx`
- Create: `src/test/NewAlbumCreator.edit.test.jsx`

- [ ] **Step 1: Write failing edit-mode render tests**

Create `src/test/NewAlbumCreator.edit.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NewAlbumCreator } from '../components/Album/NewAlbumCreator'

vi.mock('../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    setIsCreatingNewAlbum: vi.fn(),
    setActiveAlbumCode: vi.fn(),
    syncAlbums: vi.fn(),
    index: [],
    collections: [],
  }),
}))

vi.mock('../lib/opfsClient', () => ({
  OPFSClient: { create: () => ({ terminate: vi.fn(), send: vi.fn() }) },
}))

vi.mock('../lib/albumApi', () => ({
  createAlbum: vi.fn(),
  uploadTrack: vi.fn(),
  saveAlbumLocally: vi.fn(),
  updateAlbumMeta: vi.fn(),
  updateAlbumCover: vi.fn(),
  updateAlbumLocally: vi.fn(),
  albumCoverUrl: (code) => `https://cdn.test/${code}/cover`,
}))

const existingAlbum = {
  albumCode: 'EDIT01',
  creatorToken: 'tok',
  title: 'My Album',
  artist: 'My Band',
  hasCover: false,
  createdAt: new Date().toISOString(),
  tracks: [
    { trackId: 't1', title: 'First Song', duration: 180000 },
    { trackId: 't2', title: 'Second Song', duration: 240000 },
  ],
}

describe('NewAlbumCreator — edit mode', () => {
  it('shows "Edit Album" heading when album prop is provided', () => {
    render(<NewAlbumCreator album={existingAlbum} />)
    expect(screen.getByText('Edit Album')).toBeDefined()
  })

  it('shows "Re-publish" button when album prop is provided', () => {
    render(<NewAlbumCreator album={existingAlbum} />)
    expect(screen.getByRole('button', { name: /re-publish/i })).toBeDefined()
  })

  it('pre-populates title input with album title', () => {
    render(<NewAlbumCreator album={existingAlbum} />)
    const titleInput = screen.getByPlaceholderText('Album title…')
    expect(titleInput.value).toBe('My Album')
  })

  it('pre-populates artist input with album artist', () => {
    render(<NewAlbumCreator album={existingAlbum} />)
    const artistInput = screen.getByPlaceholderText('Artist / group…')
    expect(artistInput.value).toBe('My Band')
  })

  it('pre-populates track list with existing album tracks', () => {
    render(<NewAlbumCreator album={existingAlbum} />)
    expect(screen.getByText('First Song')).toBeDefined()
    expect(screen.getByText('Second Song')).toBeDefined()
  })

  it('shows "New Album" heading when no album prop is provided', () => {
    render(<NewAlbumCreator />)
    expect(screen.getByText('New Album')).toBeDefined()
  })

  it('shows "Publish Album" button when no album prop', () => {
    render(<NewAlbumCreator />)
    expect(screen.getByRole('button', { name: /publish album/i })).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npx vitest run src/test/NewAlbumCreator.edit.test.jsx
```

Expected: failures — `album` prop not accepted, labels are not conditional.

- [ ] **Step 3: Update NewAlbumCreator imports**

In `src/components/Album/NewAlbumCreator.jsx`, replace the `albumApi` import line:

```js
import { createAlbum, uploadTrack, saveAlbumLocally, updateAlbumMeta, updateAlbumCover, updateAlbumLocally, albumCoverUrl } from '../../lib/albumApi'
```

- [ ] **Step 4: Add album prop and derive isEditing**

Change the function signature and add the `isEditing` constant at the top of `NewAlbumCreator`:

```jsx
export function NewAlbumCreator({ album = null }) {
  const isEditing = album !== null
```

- [ ] **Step 5: Initialize state from album prop**

Replace the four state initializations for `title`, `artist`, `coverFile`, `coverPreview`, and `orderedTracks` with prop-aware versions:

```js
  const [title, setTitle] = useState(album?.title ?? '')
  const [artist, setArtist] = useState(album?.artist ?? '')
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(
    album?.hasCover ? albumCoverUrl(album.albumCode) : null
  )

  const [orderedTracks, setOrderedTracks] = useState(
    album?.tracks?.map(t => ({
      trackId: t.trackId,
      name: t.title,
      duration: t.duration,
      isExisting: true,
    })) ?? []
  )
```

- [ ] **Step 6: Update UI labels to be conditional on isEditing**

Replace the header `<h1>` text:

```jsx
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {isEditing ? 'Edit Album' : 'New Album'}
        </h1>
```

Replace the Publish button label:

```jsx
                  {isEditing ? 'Re-publish' : 'Publish Album'}
```

- [ ] **Step 7: Run edit mode render tests to confirm they pass**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npx vitest run src/test/NewAlbumCreator.edit.test.jsx --reporter=verbose
```

Expected: all 7 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/Album/NewAlbumCreator.jsx src/test/NewAlbumCreator.edit.test.jsx
git commit -m "feat(albums): NewAlbumCreator accepts album prop for edit mode initialisation"
```

---

### Task 8: Implement re-publish logic in NewAlbumCreator

**Files:**
- Modify: `src/components/Album/NewAlbumCreator.jsx`

- [ ] **Step 1: Split handlePublish into create and edit branches**

In `src/components/Album/NewAlbumCreator.jsx`, replace the entire `handlePublish` function with:

```js
  async function handlePublish() {
    if (uploadPhase === 'uploading' || orderedTracks.length === 0) return
    setUploadPhase('uploading')
    setUploadError(null)

    const client = clientRef.current
    const effectiveTitle = title.trim() || 'Untitled Album'

    if (isEditing) {
      // ── Edit: upload only new tracks, then PATCH meta ────────
      const newTracks = orderedTracks.filter(t => !t.isExisting)
      const newTrackMeta = newTracks.map(t => ({
        trackId: uuidv4(),
        title: t.name,
        duration: t.duration,
        mimeType: t.mimeType,
        songId: t.songId,
        recordingId: t.recordingId,
      }))

      const totalSteps = newTrackMeta.length + (coverFile ? 1 : 0)
      setUploadProgress({ step: 'Preparing…', current: 0, total: totalSteps })

      try {
        for (let i = 0; i < newTrackMeta.length; i++) {
          const { trackId, title: tTitle, mimeType, songId, recordingId } = newTrackMeta[i]
          setUploadProgress({ step: `Uploading "${tTitle}"…`, current: i + 1, total: totalSteps })
          const buffer = await client.send('read-audio', { songId, recordingId })
          await uploadTrack(album.albumCode, trackId, buffer, mimeType, album.creatorToken)
        }

        if (coverFile) {
          setUploadProgress({ step: 'Updating cover…', current: newTrackMeta.length + 1, total: totalSteps })
          await updateAlbumCover(album.albumCode, coverFile, album.creatorToken)
        }

        // Build final tracks array preserving original trackIds for existing tracks
        let newIdx = 0
        const finalTracks = orderedTracks.map(t => {
          if (t.isExisting) {
            return { trackId: t.trackId, title: t.name, duration: t.duration }
          }
          const m = newTrackMeta[newIdx++]
          return { trackId: m.trackId, title: m.title, duration: m.duration }
        })

        await updateAlbumMeta({
          albumCode: album.albumCode,
          creatorToken: album.creatorToken,
          title: effectiveTitle,
          artist: artist.trim(),
          tracks: finalTracks,
        })

        updateAlbumLocally({
          albumCode: album.albumCode,
          title: effectiveTitle,
          artist: artist.trim(),
          tracks: finalTracks,
        })

        syncAlbums()
        setActiveAlbumCode(album.albumCode)
        setIsCreatingNewAlbum(false)
      } catch (err) {
        console.error('[NewAlbumCreator] update error', err)
        setUploadError(err.message)
        setUploadPhase('error')
      }

    } else {
      // ── Create: original publish flow ────────────────────────
      const trackMeta = orderedTracks.map(t => ({
        trackId: uuidv4(),
        title: t.name,
        duration: t.duration,
        mimeType: t.mimeType,
        songId: t.songId,
        recordingId: t.recordingId,
      }))
      setUploadProgress({ step: 'Creating album…', current: 0, total: trackMeta.length })

      try {
        const { albumCode, creatorToken } = await createAlbum({
          title: effectiveTitle,
          artist: artist.trim(),
          coverFile: coverFile ?? null,
          tracks: trackMeta.map(({ trackId, title: t, duration, mimeType }) => ({ trackId, title: t, duration, mimeType })),
        })

        for (let i = 0; i < trackMeta.length; i++) {
          const { trackId, title: tTitle, mimeType, songId, recordingId } = trackMeta[i]
          setUploadProgress({ step: `Uploading "${tTitle}"…`, current: i + 1, total: trackMeta.length })
          const buffer = await client.send('read-audio', { songId, recordingId })
          await uploadTrack(albumCode, trackId, buffer, mimeType, creatorToken)
        }

        saveAlbumLocally({
          albumCode, creatorToken, title: effectiveTitle, artist: artist.trim(),
          tracks: trackMeta.map(({ trackId, title: t, duration }) => ({ trackId, title: t, duration })),
        })
        syncAlbums()
        setActiveAlbumCode(albumCode)
        setIsCreatingNewAlbum(false)
      } catch (err) {
        console.error('[NewAlbumCreator] upload error', err)
        setUploadError(err.message)
        setUploadPhase('error')
      }
    }
  }
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npx vitest run
```

Expected: all tests pass. (The re-publish logic itself is not unit-tested here as it depends on the OPFS client and worker — it is verified in the manual test step.)

- [ ] **Step 3: Manual smoke test — create flow unchanged**

Start the dev server:
```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npm run dev
```

1. Open the app in a browser.
2. Go to Albums tab → click "+ New Album".
3. Confirm the header reads "New Album" and the button reads "Publish Album".
4. Confirm the form is empty (no pre-populated title/artist).

- [ ] **Step 4: Manual smoke test — edit flow**

1. Open an existing published album in the detail view.
2. Click "Edit Album".
3. Confirm the header reads "Edit Album" and the button reads "Re-publish".
4. Confirm title, artist, and track list are pre-populated.
5. Change the title to something new.
6. Click "Re-publish".
7. Confirm the app returns to the album detail view.
8. Confirm the detail view shows the updated title.
9. Click "Open Album ↗" and confirm the public page reflects the new title.

- [ ] **Step 5: Manual smoke test — cancel returns to detail**

1. Open an existing published album → click "Edit Album".
2. Click "Cancel".
3. Confirm the album detail view is shown (not the albums list).

- [ ] **Step 6: Commit**

```bash
git add src/components/Album/NewAlbumCreator.jsx
git commit -m "feat(albums): implement re-publish logic in edit mode"
```

---

### Task 9: Push and deploy worker

- [ ] **Step 1: Push frontend changes**

```bash
git push
```

- [ ] **Step 2: Deploy updated worker**

```bash
cd songbook-worker && npx wrangler deploy
```

Expected: deployment succeeds, worker version updated.

- [ ] **Step 3: End-to-end smoke test against production**

Repeat the manual smoke tests from Task 8 Steps 3–5 against the production URL to confirm the PATCH and cover endpoints are live.
