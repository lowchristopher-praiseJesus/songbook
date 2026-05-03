# Conductor Broadcast UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Conductor Broadcast UX so coordinators never lose links, directors/conductors work without a second import, followers land on content in one tap, and sessions have a clear End lifecycle.

**Architecture:** Mostly client-side changes layered on top of the existing poll-based transport (Cloudflare Worker + KV). The worker gains two new endpoints (`/end`, `/preview`). The frontend gains a `BroadcastsPanel`, `ConductorJoinModal`, and `BroadcastWaitingBanner`, plus a refactored `ConductorBar` that drops stale local state in favour of server-derived truth. Terminology is unified around "Conductor" throughout.

**Tech Stack:** React 18, Zustand, Tailwind CSS, Vitest + @testing-library/react, Cloudflare Workers + KV (Hono), TypeScript (worker only).

---

## File map

**Create:**
- `src/hooks/useBroadcastRegistry.js` — derives conductor collections from store; exports `forgetBroadcast` helper
- `src/hooks/useBroadcastStatuses.js` — one-shot status poll per unique `conductorCode`; provides `refresh()`
- `src/components/Conductor/BroadcastsPanel.jsx` — Sidebar panel listing all conductor collections with role-aware actions
- `src/components/Conductor/ConductorJoinModal.jsx` — role-aware share import (replaces ImportConfirmModal for conductor shares)
- `src/components/Conductor/BroadcastWaitingBanner.jsx` — full-width pre-broadcast / ended banner for followers
- `src/test/useBroadcastRegistry.test.js`
- `src/test/ConductorJoinModal.test.jsx`
- `src/test/BroadcastWaitingBanner.test.jsx`

**Modify:**
- `songbook-worker/src/lib/conductor.ts` — add `terminated?: boolean` to `ConductorData`; add `isConductorTerminated()` helper; expose `expiresAt` from status endpoint
- `songbook-worker/src/routes/conductor.ts` — add `/end` and `/preview` routes; update status response to include `expiresAt`
- `songbook-worker/src/routes/conductor.test.ts` — new tests for `/end` and `/preview`
- `src/lib/conductorApi.js` — add `endBroadcast()`, `previewSong()`; accept both `X-Director-Token` and `X-Conductor-Token` headers
- `src/store/libraryStore.js` — migration shim in `init()`; add `clearBroadcastFields()` action
- `src/hooks/useConductorSync.js` — remove `isBroadcasting` local state; derive from `live && isDirector`
- `src/components/Conductor/ConductorBar.jsx` — consume derived `isBroadcasting`
- `src/components/Share/ShareModal.jsx` — add `collectionId` prop; add "I'll be conducting myself" checkbox; self-direct path wires token into existing collection
- `src/components/Sidebar/CollectionGroup.jsx` — pass `{name, id}` (not just name) in `onGroupCheckboxChange`
- `src/components/Sidebar/Sidebar.jsx` — track `exportSourceCollectionId`; pass it to ShareModal; add BroadcastsPanel
- `src/App.jsx` — route conductor shares to ConductorJoinModal; fix multi-collection conductorCode selection; render BroadcastWaitingBanner
- `src/test/ShareModal.test.jsx` — update mock for new `collectionId` prop; add self-direct test

---

## Task 1 — Worker: `terminated` field + `/end` + `/preview` endpoints

**Files:**
- Modify: `songbook-worker/src/lib/conductor.ts`
- Modify: `songbook-worker/src/routes/conductor.ts`
- Modify: `songbook-worker/src/routes/conductor.test.ts`

- [ ] **Step 1.1: Write failing tests for `/end` and `/preview`**

Append to `songbook-worker/src/routes/conductor.test.ts`:

```ts
describe('POST /conductor/:code/end', () => {
  it('marks session terminated; subsequent status returns 410', async () => {
    await createConductor({ conductorCode: 'END001', directorToken: 'dir-end' });
    // start broadcast first
    await SELF.fetch('http://localhost/conductor/END001/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-end' },
    });
    const res = await SELF.fetch('http://localhost/conductor/END001/end', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-end' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    const status = await SELF.fetch('http://localhost/conductor/END001/status', { headers: h });
    expect(status.status).toBe(410);
  });

  it('returns 403 with wrong token', async () => {
    await createConductor({ conductorCode: 'END002', directorToken: 'real-tok' });
    const res = await SELF.fetch('http://localhost/conductor/END002/end', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'wrong-tok' },
    });
    expect(res.status).toBe(403);
  });

  it('is idempotent: calling /end twice returns 200 both times', async () => {
    await createConductor({ conductorCode: 'END003', directorToken: 'dir3' });
    await SELF.fetch('http://localhost/conductor/END003/end', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir3' },
    });
    const res2 = await SELF.fetch('http://localhost/conductor/END003/end', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir3' },
    });
    expect(res2.status).toBe(200);
  });
});

describe('POST /conductor/:code/preview', () => {
  it('sets currentSbpId without making session live', async () => {
    await createConductor({ conductorCode: 'PRV001', directorToken: 'dir-prv' });
    const res = await SELF.fetch('http://localhost/conductor/PRV001/preview', {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': 'dir-prv' },
      body: JSON.stringify({ sbpId: 42 }),
    });
    expect(res.status).toBe(200);

    const status = await (await SELF.fetch('http://localhost/conductor/PRV001/status', { headers: h })).json() as { live: boolean; currentSbpId: number };
    expect(status.live).toBe(false);
    expect(status.currentSbpId).toBe(42);
  });

  it('returns 403 with wrong token', async () => {
    await createConductor({ conductorCode: 'PRV002', directorToken: 'real' });
    const res = await SELF.fetch('http://localhost/conductor/PRV002/preview', {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': 'wrong' },
      body: JSON.stringify({ sbpId: 1 }),
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /conductor/:code/status includes expiresAt', () => {
  it('status response includes expiresAt string', async () => {
    await createConductor({ conductorCode: 'EXPAT1' });
    const res = await SELF.fetch('http://localhost/conductor/EXPAT1/status', { headers: h });
    const body = await res.json() as { expiresAt: string };
    expect(typeof body.expiresAt).toBe('string');
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
```

- [ ] **Step 1.2: Run worker tests to confirm they fail**

```bash
cd songbook-worker && npm test
```

Expected: new tests fail with 404 (routes don't exist) and missing `expiresAt`.

- [ ] **Step 1.3: Update `ConductorData` type and add helper**

In `songbook-worker/src/lib/conductor.ts`, add `terminated` field and helper:

```ts
export interface ConductorData {
  conductorCode: string;
  directorToken: string;
  maxFollowers: number;
  live: boolean;
  currentSbpId: number | null;
  version: number;
  followers: Record<string, ConductorFollower>;
  expiresAt: string;
  terminated?: boolean;   // NEW — set by /end; causes 410 on all subsequent reads
}
```

Also add at the bottom of `conductor.ts`:

```ts
export function isConductorTerminated(data: ConductorData): boolean {
  return !!data.terminated;
}
```

- [ ] **Step 1.4: Add `/end`, `/preview` routes and update `/status` in routes file**

In `songbook-worker/src/routes/conductor.ts`:

Replace the status route:
```ts
// GET /conductor/:code/status
conductor.get('/:code/status', async (c) => {
  const code = c.req.param('code');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data) || data.terminated) return c.json({ error: 'expired' }, 410);

  return c.json({
    live: data.live,
    currentSbpId: data.currentSbpId,
    version: data.version,
    followerCount: countActiveFollowers(data),
    expiresAt: data.expiresAt,
  });
});
```

Update the import line at the top of `routes/conductor.ts` to include `isConductorTerminated`:
```ts
import {
  getConductor, putConductor,
  countActiveFollowers, isConductorExpired, isConductorTerminated,
} from '../lib/conductor';
```

Also update every existing route that checks `isConductorExpired` to also check `terminated`:
```ts
// Replace every:  if (isConductorExpired(data))
// With:           if (isConductorExpired(data) || isConductorTerminated(data))
```
Apply this to: `/start`, `/current`, `/stop`, `/join`, `/heartbeat` routes (not `/end` itself — see below).

Add the two new routes after the `/stop` route:

```ts
// POST /conductor/:code/end
conductor.post('/:code/end', async (c) => {
  const code = c.req.param('code');
  const token = c.req.header('X-Director-Token');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ ok: true }); // idempotent: already gone
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);
  await putConductor(c.env.SESSION_KV, { ...data, terminated: true, live: false, currentSbpId: null });
  return c.json({ ok: true });
});

// POST /conductor/:code/preview
conductor.post('/:code/preview', async (c) => {
  const code = c.req.param('code');
  const token = c.req.header('X-Director-Token');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data) || isConductorTerminated(data)) return c.json({ error: 'expired' }, 410);
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);

  let body: { sbpId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }
  if (typeof body.sbpId !== 'number') return c.json({ error: 'missing_sbp_id' }, 400);

  await putConductor(c.env.SESSION_KV, { ...data, currentSbpId: body.sbpId, version: data.version + 1 });
  return c.json({ ok: true, currentSbpId: body.sbpId });
});
```

- [ ] **Step 1.5: Run worker tests to confirm they pass**

```bash
cd songbook-worker && npm test
```

Expected: all tests pass including the new `/end`, `/preview`, and `expiresAt` tests.

- [ ] **Step 1.6: Commit**

```bash
git add songbook-worker/src/lib/conductor.ts songbook-worker/src/routes/conductor.ts songbook-worker/src/routes/conductor.test.ts
git commit -m "feat(worker): add /end + /preview conductor endpoints; expose expiresAt in status"
```

---

## Task 2 — conductorApi.js: `endBroadcast` + `previewSong`

**Files:**
- Modify: `src/lib/conductorApi.js`

- [ ] **Step 2.1: Add functions to `conductorApi.js`**

Append to `src/lib/conductorApi.js`:

```js
export async function endBroadcast(code, conductorToken) {
  const res = await fetch(`${workerUrl()}/conductor/${code}/end`, {
    method: 'POST',
    headers: { 'X-Director-Token': conductorToken },
  })
  if (res.status === 403) throw Object.assign(new Error('forbidden'), { code: 'forbidden' })
  if (!res.ok) throw Object.assign(new Error('end_failed'), { code: 'end_failed' })
  return res.json()
}

export async function previewSong(code, sbpId, conductorToken) {
  const res = await fetch(`${workerUrl()}/conductor/${code}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Director-Token': conductorToken },
    body: JSON.stringify({ sbpId }),
  })
  if (res.status === 403) throw Object.assign(new Error('forbidden'), { code: 'forbidden' })
  if (!res.ok) throw Object.assign(new Error('preview_failed'), { code: 'preview_failed' })
  return res.json()
}
```

- [ ] **Step 2.2: Run frontend tests to confirm nothing broke**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 2.3: Commit**

```bash
git add src/lib/conductorApi.js
git commit -m "feat(conductorApi): add endBroadcast and previewSong"
```

---

## Task 3 — libraryStore: schema migration + `clearBroadcastFields` action

**Files:**
- Modify: `src/store/libraryStore.js`

The five new optional collection fields are:
- `conductorRole`: `"coordinator" | "conductor" | "follower"` — disambiguates UI affordances
- `conductorShareCode`: string — the `share=` code (not full URL); allows re-deriving links
- `conductorCreatedAt`: ISO string
- `conductorExpiresAt`: ISO string — filled lazily from status response
- `conductorEnded`: boolean — set when the session is ended or terminated 410 is received

The migration rule (applied once in `init()` for legacy records):
- Has `conductorDirectorToken` → `conductorRole = "conductor"`
- Has `conductorCode` only → `conductorRole = "follower"`

- [ ] **Step 3.1: Write failing test for migration shim**

Create `src/test/libraryStoreMigration.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'

// Reset module between tests so Zustand store re-initialises
describe('libraryStore conductor migration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('assigns conductorRole "conductor" to legacy records with directorToken', async () => {
    // Plant a legacy collection in localStorage
    const legacy = [
      {
        id: 'col-1',
        name: 'Easter Set',
        createdAt: '2026-01-01T00:00:00.000Z',
        songIds: [],
        conductorCode: 'ABC123',
        conductorDirectorToken: 'tok-123',
      },
    ]
    localStorage.setItem('songsheet_collections', JSON.stringify(legacy))

    // Dynamic import to get a fresh store instance
    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.getState().init()
    const collections = useLibraryStore.getState().collections

    expect(collections[0].conductorRole).toBe('conductor')
  })

  it('assigns conductorRole "follower" to legacy records with code but no token', async () => {
    const legacy = [
      {
        id: 'col-2',
        name: 'Sunday Set',
        createdAt: '2026-01-01T00:00:00.000Z',
        songIds: [],
        conductorCode: 'XYZ789',
      },
    ]
    localStorage.setItem('songsheet_collections', JSON.stringify(legacy))

    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.getState().init()
    const collections = useLibraryStore.getState().collections

    expect(collections[0].conductorRole).toBe('follower')
  })

  it('does not overwrite existing conductorRole', async () => {
    const existing = [
      {
        id: 'col-3',
        name: 'CNY Set',
        createdAt: '2026-01-01T00:00:00.000Z',
        songIds: [],
        conductorCode: 'AAA111',
        conductorDirectorToken: 'tok',
        conductorRole: 'coordinator',
      },
    ]
    localStorage.setItem('songsheet_collections', JSON.stringify(existing))

    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.getState().init()
    const collections = useLibraryStore.getState().collections

    expect(collections[0].conductorRole).toBe('coordinator')
  })
})
```

- [ ] **Step 3.2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose src/test/libraryStoreMigration.test.js
```

Expected: first two tests fail (no migration shim exists yet).

- [ ] **Step 3.3: Add migration shim to `init()` in libraryStore**

In `src/store/libraryStore.js`, inside the `init()` action, after the `collections` repair block and before `set({...})`, add:

```js
// Conductor role migration: assign conductorRole to legacy records that predate the field
let conductorMigrated = false
collections = collections.map(c => {
  if (c.conductorCode && !c.conductorRole) {
    conductorMigrated = true
    return {
      ...c,
      conductorRole: c.conductorDirectorToken ? 'conductor' : 'follower',
    }
  }
  return c
})
if (conductorMigrated) saveCollections(collections)
```

- [ ] **Step 3.4: Add `clearBroadcastFields` action to libraryStore**

In `src/store/libraryStore.js`, after the `updateCollection` action, add:

```js
/**
 * Strip all conductor broadcast fields from a collection, leaving its songs intact.
 * Used by "Forget broadcast" in BroadcastsPanel.
 */
clearBroadcastFields(collectionId) {
  const collections = get().collections.map(c => {
    if (c.id !== collectionId) return c
    const {
      conductorCode: _cc,
      conductorDirectorToken: _cdt,
      conductorBroadcastTime: _cbt,
      conductorRole: _cr,
      conductorShareCode: _csc,
      conductorCreatedAt: _cca,
      conductorExpiresAt: _cea,
      conductorEnded: _ce,
      ...rest
    } = c
    return rest
  })
  saveCollections(collections)
  set({ collections })
},
```

- [ ] **Step 3.5: Run tests to confirm they pass**

```bash
npm test -- --reporter=verbose src/test/libraryStoreMigration.test.js
```

Expected: all 3 migration tests pass.

- [ ] **Step 3.6: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3.7: Commit**

```bash
git add src/store/libraryStore.js src/test/libraryStoreMigration.test.js
git commit -m "feat(store): conductor role migration shim + clearBroadcastFields action"
```

---

## Task 4 — `useBroadcastRegistry` + `useBroadcastStatuses` hooks

**Files:**
- Create: `src/hooks/useBroadcastRegistry.js`
- Create: `src/hooks/useBroadcastStatuses.js`
- Create: `src/test/useBroadcastRegistry.test.js`

- [ ] **Step 4.1: Write failing tests for useBroadcastRegistry**

Create `src/test/useBroadcastRegistry.test.js`:

```js
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useBroadcastRegistry } from '../hooks/useBroadcastRegistry'
import { useLibraryStore } from '../store/libraryStore'

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    collections: [],
    index: [],
  })
})

describe('useBroadcastRegistry', () => {
  it('returns empty array when no collections have conductorCode', () => {
    useLibraryStore.setState({
      collections: [{ id: 'c1', name: 'Normal', songIds: [], createdAt: '' }],
    })
    const { result } = renderHook(() => useBroadcastRegistry())
    expect(result.current.broadcasts).toHaveLength(0)
  })

  it('includes collections with conductorCode and no conductorEnded', () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Easter', songIds: [], createdAt: '', conductorCode: 'ABC', conductorRole: 'conductor' },
        { id: 'c2', name: 'Normal', songIds: [], createdAt: '' },
      ],
    })
    const { result } = renderHook(() => useBroadcastRegistry())
    expect(result.current.broadcasts).toHaveLength(1)
    expect(result.current.broadcasts[0].id).toBe('c1')
  })

  it('excludes ended broadcasts from broadcasts list, includes in endedBroadcasts', () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Easter', songIds: [], createdAt: '', conductorCode: 'ABC', conductorRole: 'conductor', conductorEnded: true },
        { id: 'c2', name: 'CNY', songIds: [], createdAt: '', conductorCode: 'XYZ', conductorRole: 'follower' },
      ],
    })
    const { result } = renderHook(() => useBroadcastRegistry())
    expect(result.current.broadcasts).toHaveLength(1)
    expect(result.current.broadcasts[0].id).toBe('c2')
    expect(result.current.endedBroadcasts).toHaveLength(1)
    expect(result.current.endedBroadcasts[0].id).toBe('c1')
  })

  it('forgetBroadcast strips conductor fields from the collection', () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Easter', songIds: ['s1'], createdAt: '', conductorCode: 'ABC', conductorRole: 'conductor' },
      ],
    })
    const { result } = renderHook(() => useBroadcastRegistry())
    act(() => result.current.forgetBroadcast('c1'))
    const col = useLibraryStore.getState().collections.find(c => c.id === 'c1')
    expect(col).toBeDefined()
    expect(col.conductorCode).toBeUndefined()
    expect(col.conductorRole).toBeUndefined()
    expect(col.songIds).toEqual(['s1']) // songs preserved
  })
})
```

- [ ] **Step 4.2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose src/test/useBroadcastRegistry.test.js
```

Expected: fails with "Cannot find module".

- [ ] **Step 4.3: Create `useBroadcastRegistry.js`**

Create `src/hooks/useBroadcastRegistry.js`:

```js
import { useLibraryStore } from '../store/libraryStore'

/**
 * Returns conductor-enabled collections split by ended status,
 * plus helpers for mutating broadcast state.
 */
export function useBroadcastRegistry() {
  const collections = useLibraryStore(s => s.collections)
  const clearBroadcastFields = useLibraryStore(s => s.clearBroadcastFields)
  const updateCollection = useLibraryStore(s => s.updateCollection)

  const broadcasts = collections.filter(c => c.conductorCode && !c.conductorEnded)
  const endedBroadcasts = collections.filter(c => c.conductorCode && c.conductorEnded)

  function forgetBroadcast(collectionId) {
    clearBroadcastFields(collectionId)
  }

  function markEnded(collectionId) {
    updateCollection(collectionId, { conductorEnded: true })
  }

  return { broadcasts, endedBroadcasts, forgetBroadcast, markEnded }
}
```

- [ ] **Step 4.4: Run test to confirm it passes**

```bash
npm test -- --reporter=verbose src/test/useBroadcastRegistry.test.js
```

Expected: all 4 tests pass.

- [ ] **Step 4.5: Create `useBroadcastStatuses.js`**

Create `src/hooks/useBroadcastStatuses.js`:

```js
import { useState, useCallback } from 'react'
import { fetchConductorStatus } from '../lib/conductorApi'

const MAX_POLLS = 5

/**
 * Fetches live status for up to MAX_POLLS unique conductor codes.
 * Returns a map of { [conductorCode]: { live, currentSbpId, followerCount, expiresAt, error } }
 * and a `refresh()` function to re-fetch all.
 *
 * Does NOT poll continuously — call refresh() when the panel is opened or the user requests it.
 */
export function useBroadcastStatuses(conductorCodes) {
  const [statuses, setStatuses] = useState({})
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (conductorCodes.length === 0) return
    setLoading(true)
    const codes = [...new Set(conductorCodes)].slice(0, MAX_POLLS)
    const results = await Promise.allSettled(
      codes.map(code => fetchConductorStatus(code).then(s => ({ code, ...s })))
    )
    const next = {}
    for (const r of results) {
      if (r.status === 'fulfilled') {
        next[r.value.code] = r.value
      } else {
        // extract code from rejected promise via error — find which code it belongs to
        const idx = results.indexOf(r)
        next[codes[idx]] = { error: r.reason?.code ?? 'network_error' }
      }
    }
    setStatuses(next)
    setLoading(false)
  }, [conductorCodes.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  return { statuses, loading, refresh }
}
```

- [ ] **Step 4.6: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4.7: Commit**

```bash
git add src/hooks/useBroadcastRegistry.js src/hooks/useBroadcastStatuses.js src/test/useBroadcastRegistry.test.js
git commit -m "feat(hooks): useBroadcastRegistry and useBroadcastStatuses"
```

---

## Task 5 — `BroadcastsPanel` component + Sidebar integration

**Files:**
- Create: `src/components/Conductor/BroadcastsPanel.jsx`
- Modify: `src/components/Sidebar/Sidebar.jsx`

The panel shows:
- A collapsible section titled "Broadcasts"
- One row per conductor collection, with role icon and status
- Coordinator row: Copy member link, Copy conductor link, End session
- Conductor row: Copy member link, Start/Stop broadcast (delegates to `conductorSync`), End session
- Follower row: Open & follow (delegates to `conductorSync`), Forget broadcast
- Ended rows: name, "Ended" badge, Forget broadcast

The panel does NOT need to be tested exhaustively here — it re-uses existing store + hook primitives already tested. Keep the component thin.

- [ ] **Step 5.1: Create `BroadcastsPanel.jsx`**

Create `src/components/Conductor/BroadcastsPanel.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { useBroadcastRegistry } from '../../hooks/useBroadcastRegistry'
import { useBroadcastStatuses } from '../../hooks/useBroadcastStatuses'
import { endBroadcast } from '../../lib/conductorApi'
import { useLibraryStore } from '../../store/libraryStore'
import { Button } from '../UI/Button'

function deriveUrl(shareCode, token, broadcastTime) {
  const base = `${window.location.origin}${window.location.pathname}?share=${shareCode}`
  const withToken = token ? `${base}&conductor_token=${token}` : base
  return broadcastTime
    ? `${withToken}&bt=${encodeURIComponent(new Date(broadcastTime).toISOString())}`
    : withToken
}

function StatusPill({ status, conductorCode }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>
  if (status.error === 'expired' || status.error === 'not_found') {
    return <span className="text-xs text-gray-400">Expired</span>
  }
  if (status.error) return <span className="text-xs text-red-400">Unavailable</span>
  if (status.live) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Live · {status.followerCount} following
      </span>
    )
  }
  return <span className="text-xs text-gray-400">Idle</span>
}

export function BroadcastsPanel({ conductorSync, onAddToast }) {
  const { broadcasts, endedBroadcasts, forgetBroadcast, markEnded } = useBroadcastRegistry()
  const [open, setOpen] = useState(true)
  const [confirmEnd, setConfirmEnd] = useState(null) // collectionId | null
  const [confirmForget, setConfirmForget] = useState(null) // collectionId | null
  const updateCollection = useLibraryStore(s => s.updateCollection)

  const allCodes = broadcasts.map(b => b.conductorCode).filter(Boolean)
  const { statuses, loading, refresh } = useBroadcastStatuses(allCodes)

  useEffect(() => { if (open) refresh() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (broadcasts.length === 0 && endedBroadcasts.length === 0) return null

  async function handleEndSession(collection) {
    if (confirmEnd !== collection.id) { setConfirmEnd(collection.id); return }
    setConfirmEnd(null)
    try {
      const token = collection.conductorDirectorToken
      if (token) await endBroadcast(collection.conductorCode, token)
    } catch { /* ignore — mark ended locally regardless */ }
    markEnded(collection.id)
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  function rowFor(col) {
    const status = statuses[col.conductorCode]
    const memberUrl = col.conductorShareCode
      ? deriveUrl(col.conductorShareCode, null, col.conductorBroadcastTime)
      : null
    const conductorUrl = col.conductorShareCode && col.conductorDirectorToken
      ? deriveUrl(col.conductorShareCode, col.conductorDirectorToken, null)
      : null

    const isActive = conductorSync?.conductorCode === col.conductorCode
    const isLive = isActive ? conductorSync.live : status?.live

    return (
      <div key={col.id} className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{col.conductorRole === 'follower' ? '👥' : '🎙'}</span>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{col.name}</span>
            </div>
            <div className="mt-0.5">
              <StatusPill status={status} conductorCode={col.conductorCode} />
            </div>
          </div>
          {loading && <span className="text-xs text-gray-400 shrink-0">...</span>}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {memberUrl && (
            <button
              onClick={() => copyToClipboard(memberUrl)}
              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Copy member link
            </button>
          )}
          {conductorUrl && (
            <button
              onClick={() => copyToClipboard(conductorUrl)}
              className="text-xs px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800/40"
            >
              Copy conductor link
            </button>
          )}
          {isActive && col.conductorRole === 'conductor' && !isLive && (
            <button
              onClick={conductorSync.startBroadcast}
              className="text-xs px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/40"
            >
              ▶ Start
            </button>
          )}
          {isActive && col.conductorRole === 'conductor' && isLive && (
            <button
              onClick={conductorSync.stopBroadcast}
              className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/40"
            >
              Stop
            </button>
          )}
          {col.conductorRole !== 'coordinator' && (
            confirmForget === col.id ? (
              <span className="flex items-center gap-1 text-xs">
                <span className="text-gray-500">Songs kept.</span>
                <button onClick={() => { forgetBroadcast(col.id); setConfirmForget(null) }} className="text-red-600 dark:text-red-400 underline">Confirm</button>
                <button onClick={() => setConfirmForget(null)} className="text-gray-500 underline">Cancel</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmForget(col.id)}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Forget
              </button>
            )
          )}
          {col.conductorRole !== 'follower' && (
            confirmEnd === col.id ? (
              <span className="flex items-center gap-1 text-xs">
                <span className="text-gray-500 dark:text-gray-400">End for everyone?</span>
                <button onClick={() => handleEndSession(col)} className="text-red-600 dark:text-red-400 underline">End session</button>
                <button onClick={() => setConfirmEnd(null)} className="text-gray-500 underline">Cancel</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmEnd(col.id)}
                className="text-xs px-2 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                End session
              </button>
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-2 pb-1 px-2">
      <button
        className="flex items-center justify-between w-full text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
        onClick={() => setOpen(o => !o)}
      >
        <span>Broadcasts</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div>
          {broadcasts.map(rowFor)}
          {endedBroadcasts.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-400 mb-1">Ended</p>
              {endedBroadcasts.map(col => (
                <div key={col.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-400 truncate">{col.name}</span>
                  <button
                    onClick={() => forgetBroadcast(col.id)}
                    className="text-xs text-gray-400 underline ml-2 shrink-0"
                  >
                    Forget
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={refresh}
            className="mt-2 text-xs text-gray-400 underline"
          >
            Refresh status
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5.2: Wire BroadcastsPanel into Sidebar**

In `src/components/Sidebar/Sidebar.jsx`:

Add import near the top with the other conductor imports:
```js
import { BroadcastsPanel } from '../Conductor/BroadcastsPanel'
```

Add props to the `Sidebar` component signature:
```js
export function Sidebar({ isOpen, onAddToast, onSongSelect, onClose, onImportSuccess, onStartSession, onJoinSession, conductorSync }) {
```

In the sidebar JSX, find the area just above the `<ShareModal>` rendering (near line 553) and add BroadcastsPanel before the modals. A good insertion point is just before the closing `</>` of the sidebar body (wherever the collections list ends). Look for where the `collections` list ends and add:

```jsx
<BroadcastsPanel conductorSync={conductorSync} onAddToast={onAddToast} />
```

- [ ] **Step 5.3: Pass `conductorSync` to Sidebar from App.jsx**

In `src/App.jsx`, update the Sidebar render:
```jsx
<Sidebar
  isOpen={sidebarOpen}
  onAddToast={addToast}
  onClose={() => setSidebarOpen(false)}
  onSongSelect={() => { if (window.innerWidth < 768) setSidebarOpen(false) }}
  onImportSuccess={() => { if (window.innerWidth < 768) setSidebarOpen(true) }}
  onStartSession={handleStartSession}
  onJoinSession={handleJoinSession}
  conductorSync={conductorSync}
/>
```

- [ ] **Step 5.4: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/components/Conductor/BroadcastsPanel.jsx src/components/Sidebar/Sidebar.jsx src/App.jsx
git commit -m "feat(ui): BroadcastsPanel in Sidebar with role-aware actions"
```

---

## Task 6 — ConductorBar refactor (fix refresh bug)

**Files:**
- Modify: `src/hooks/useConductorSync.js`
- Modify: `src/components/Conductor/ConductorBar.jsx`

The bug: `isBroadcasting` is local React state, lost on refresh even though the server still reports `live:true`. Fix: derive `isBroadcasting` from `live && isDirector`. This means ConductorBar correctly shows "Stop" after refresh when a session is live.

- [ ] **Step 6.1: Remove `isBroadcasting` state from `useConductorSync.js`**

In `src/hooks/useConductorSync.js`:

1. Remove the line: `const [isBroadcasting, setIsBroadcasting] = useState(false)`
2. In `handleStartBroadcast`: remove `setIsBroadcasting(true)`
3. In `handleStopBroadcast`: remove `setIsBroadcasting(false)`
4. Update the return object — replace `isBroadcasting` with the derived value:

```js
return {
  live,
  phase,
  broadcastTime,
  currentSbpId,
  followerCount,
  isFollowing,
  isBroadcasting: isDirector && live,   // derived; correct after refresh
  isDirector,
  startBroadcast: handleStartBroadcast,
  stopBroadcast: handleStopBroadcast,
  followDirector: handleFollowDirector,
  stopFollowing: handleStopFollowing,
}
```

Also expose `conductorCode` for the BroadcastsPanel matching logic:
```js
return {
  live,
  phase,
  broadcastTime,
  currentSbpId,
  followerCount,
  isFollowing,
  isBroadcasting: isDirector && live,
  isDirector,
  conductorCode,          // NEW — allows BroadcastsPanel to identify the active collection
  startBroadcast: handleStartBroadcast,
  stopBroadcast: handleStopBroadcast,
  followDirector: handleFollowDirector,
  stopFollowing: handleStopFollowing,
}
```

- [ ] **Step 6.2: ConductorBar — no functional change needed**

`ConductorBar.jsx` already uses `isBroadcasting` from `sync`. Since the hook now derives it from `live && isDirector`, the component works correctly after refresh with no changes.

However, also pass `conductorCode` through the `sync` prop so BroadcastsPanel can use `conductorSync.conductorCode` to identify the active entry. No ConductorBar change needed — it just re-uses the existing `isBroadcasting` from `sync`.

- [ ] **Step 6.3: Update `conductorCollection` selection in App.jsx**

In `src/App.jsx`, replace line 141:
```js
const conductorCollection = collections.find(c => c.conductorCode) ?? null
```

With priority ordering (prefers active conductor/follower over ended, coordinator-only):
```js
const conductorCollection =
  collections.find(c => c.conductorCode && (c.conductorRole === 'conductor' || c.conductorRole === 'follower') && !c.conductorEnded) ??
  collections.find(c => c.conductorCode && !c.conductorEnded) ??
  null
```

- [ ] **Step 6.4: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add src/hooks/useConductorSync.js src/App.jsx
git commit -m "fix(conductor): derive isBroadcasting from server live state; fix refresh bug"
```

---

## Task 7 — ShareModal: "I'll be conducting myself" self-direct path

**Files:**
- Modify: `src/components/Share/ShareModal.jsx`
- Modify: `src/components/Sidebar/CollectionGroup.jsx`
- Modify: `src/components/Sidebar/Sidebar.jsx`
- Modify: `src/test/ShareModal.test.jsx`

When "I'll be conducting myself" is checked:
1. After Create, the `conductorToken` is wired directly into the existing local collection (not a new import).
2. The done step shows only the member URL.
3. The conductor URL is available under a disclosure.
4. The local collection gets `conductorRole: "conductor"`, `conductorShareCode`, `conductorCreatedAt`, `conductorExpiresAt`.

This requires passing `collectionId` from Sidebar into ShareModal.

- [ ] **Step 7.1: Update `CollectionGroup` to emit `{name, id}` from checkbox**

In `src/components/Sidebar/CollectionGroup.jsx`, change line 140:
```jsx
// Old:
onGroupCheckboxChange(allSelected ? null : group.name)
// New:
onGroupCheckboxChange(allSelected ? null : { name: group.name, id: group.id })
```

- [ ] **Step 7.2: Update Sidebar to track `exportSourceCollectionId`**

In `src/components/Sidebar/Sidebar.jsx`:

Add state (near line 49):
```js
const [exportSourceCollectionId, setExportSourceCollectionId] = useState(null)
```

Update the `setExportSourceName` usage (line 57 and 369) to handle both the old string and new object form:

Where `exportSourceName` state is set via `onGroupCheckboxChange`:
```jsx
// In the JSX near line 369, update the prop:
onGroupCheckboxChange={(val) => {
  if (val === null) {
    setExportSourceName(null)
    setExportSourceCollectionId(null)
  } else {
    setExportSourceName(val.name)
    setExportSourceCollectionId(val.id)
  }
}}
```

Also reset `exportSourceCollectionId` to null when export mode is cleared (alongside `setExportSourceName(null)` in the existing effect):
```js
useEffect(() => {
  if (!isExportMode) {
    setExportSourceName(null)
    setExportSourceCollectionId(null)
  }
}, [isExportMode])
```

Pass to ShareModal:
```jsx
<ShareModal
  isOpen={shareModalOpen}
  songs={selectedSongs}
  collectionName={exportSourceName}
  collectionId={exportSourceCollectionId}
  onClose={() => { setShareModalOpen(false); toggleExportMode() }}
/>
```

- [ ] **Step 7.3: Update ShareModal with self-direct checkbox and collectionId prop**

In `src/components/Share/ShareModal.jsx`:

1. Add imports at top:
```js
import { useLibraryStore } from '../../store/libraryStore'
```

2. Add `collectionId` to the props signature:
```js
export function ShareModal({ isOpen, songs, collectionName, collectionId, onClose }) {
```

3. Add state for self-direct toggle (near other state declarations):
```js
const [selfDirect, setSelfDirect] = useState(true)
```

4. Add `updateCollection` from store (inside the component body, after state declarations):
```js
const updateCollection = useLibraryStore(s => s.updateCollection)
```

5. Reset `selfDirect` in `handleClose`:
```js
setSelfDirect(true)
```

6. In `handleCreateLink`, after the conductor session is created, add the self-direct wiring. Replace the existing conductor-enabled block (after `await createConductorSession(...)`) with:

```js
if (conductorEnabled) {
  try {
    await createConductorSession({ conductorCode, directorToken, maxFollowers })
  } catch (err) {
    console.error('[ShareModal] conductor session creation failed:', err)
    setErrorMessage('Conductor session could not be created. The share link was not saved.')
    setStep('error')
    return
  }
  const memberUrl = broadcastTime
    ? `${result.shareUrl}&bt=${encodeURIComponent(new Date(broadcastTime).toISOString())}`
    : result.shareUrl
  const directorUrl = `${result.shareUrl}&conductor_token=${directorToken}`

  // Self-direct: wire the conductor token into the existing local collection
  if (selfDirect && collectionId) {
    updateCollection(collectionId, {
      conductorCode,
      conductorDirectorToken: directorToken,
      conductorRole: 'conductor',
      conductorShareCode: result.shareCode,
      conductorCreatedAt: new Date().toISOString(),
      conductorExpiresAt: result.expiresAt,
    })
  }

  setConductorData({ conductorCode, directorToken, directorUrl, memberUrl, selfDirect })
  setShareUrl(memberUrl)
} else {
```

Note: `result` from `uploadShare` must include `shareCode`. Check `shareApi.js` — the worker returns `{ shareCode, shareUrl, expiresAt }`. Confirm this is present in the result.

7. In the conductor section of the idle step, add the self-direct checkbox below the toggle:

```jsx
{conductorEnabled && (
  <div className="mt-3 space-y-3">
    {/* Self-direct checkbox */}
    <button
      type="button"
      role="switch"
      aria-checked={selfDirect}
      aria-label="I'll be conducting this myself"
      onClick={() => setSelfDirect(v => !v)}
      className="flex items-center gap-3 w-full text-left"
    >
      <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
        transition-colors duration-200
        ${selfDirect ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
          ${selfDirect ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
      <span className="text-sm text-gray-700 dark:text-gray-300">I'll be conducting this myself</span>
    </button>
    {/* Max followers — unchanged */}
    <div className="flex items-center gap-3">
      {/* ... existing maxFollowers input ... */}
    </div>
    {/* Scheduled time — unchanged */}
    <div>
      {/* ... existing broadcastTime input ... */}
    </div>
  </div>
)}
```

8. In the done step, when `conductorData?.selfDirect` is true, show only the member URL and hide the director section:

```jsx
{/* Director link — only when conductor enabled AND not self-directing */}
{conductorData && !conductorData.selfDirect && (
  <div className="border-t border-orange-200 dark:border-orange-800 pt-3">
    {/* ... existing director link section ... */}
  </div>
)}
{/* Self-directing: reassure user they're set up */}
{conductorData?.selfDirect && (
  <p className="text-sm text-indigo-600 dark:text-indigo-400">
    ✓ You're set up as the Conductor. Open the Broadcasts panel to start when ready.
  </p>
)}
```

- [ ] **Step 7.4: Update ShareModal test for new collectionId prop**

In `src/test/ShareModal.test.jsx`, add `collectionId={null}` to all existing `<ShareModal>` renders that don't need the self-direct path:

```jsx
render(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />)
```

Also update the `exportSongsAsSbp` mock call expectation that checks `conductorCode` parameter (the last test) to still pass `null` for the non-conductor case.

- [ ] **Step 7.5: Add self-direct test to ShareModal.test.jsx**

Append to `src/test/ShareModal.test.jsx`:

```js
describe('ShareModal — self-direct conductor path', () => {
  it('calls updateCollection when selfDirect is on and collectionId is provided', async () => {
    const { uploadShare } = await import('../lib/shareApi')
    const { createConductorSession } = await import('../lib/conductorApi')
    vi.mock('../lib/conductorApi', () => ({
      createConductorSession: vi.fn().mockResolvedValue({}),
    }))
    uploadShare.mockResolvedValue({
      shareCode: 'sc1',
      shareUrl: 'http://app?share=sc1',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    })

    const { useLibraryStore } = await import('../store/libraryStore')
    useLibraryStore.setState({
      collections: [{ id: 'col-99', name: 'Easter', songIds: [], createdAt: '' }],
    })

    render(<ShareModal isOpen songs={songs} collectionId="col-99" onClose={() => {}} />)

    // Enable conductor with self-direct (on by default)
    fireEvent.click(screen.getByRole('switch', { name: /enable conductor broadcast/i }))
    fireEvent.click(screen.getByText('Create link'))

    await screen.findByText(/you're set up as the conductor/i)

    const col = useLibraryStore.getState().collections.find(c => c.id === 'col-99')
    expect(col.conductorCode).toBeTruthy()
    expect(col.conductorRole).toBe('conductor')
    expect(col.conductorDirectorToken).toBeTruthy()
  })
})
```

- [ ] **Step 7.6: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7.7: Commit**

```bash
git add src/components/Share/ShareModal.jsx src/components/Sidebar/CollectionGroup.jsx src/components/Sidebar/Sidebar.jsx src/test/ShareModal.test.jsx
git commit -m "feat(share): add self-direct conductor checkbox; wire collectionId to ShareModal"
```

---

## Task 8 — `ConductorJoinModal`: role-aware share import

**Files:**
- Create: `src/components/Conductor/ConductorJoinModal.jsx`
- Create: `src/test/ConductorJoinModal.test.jsx`

The modal replaces `ImportConfirmModal` when `shareSongs.conductorCode` is present.

Two paths:
1. **Conductor path** (`conductorToken` is set in the URL): Import button shows "Import & become Conductor", sets `conductorRole: "conductor"`.
2. **Follower path** (no token): fetches live status on mount; shows "Live now — Import & follow" or "Import & wait for broadcast".

Dedupe path: when `conductorCode` is already in a local collection, show "Rejoin broadcast?" instead.

Props:
```
isOpen, shareSongs, conductorToken, broadcastTime, onImport, onRejoin, onCancel
```

`onImport(role)` — called with `"conductor"` or `"follower"` so App.jsx can set the role correctly.
`onRejoin()` — called when user rejoins an existing broadcast.

- [ ] **Step 8.1: Write failing tests**

Create `src/test/ConductorJoinModal.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConductorJoinModal } from '../components/Conductor/ConductorJoinModal'
import { useLibraryStore } from '../store/libraryStore'

vi.mock('../lib/conductorApi', () => ({
  fetchConductorStatus: vi.fn(),
}))

import { fetchConductorStatus } from '../lib/conductorApi'

const baseSongs = {
  songs: [{ meta: { title: 'El Shaddai' }, id: '1' }],
  collectionName: 'Easter Set',
  conductorCode: 'ABC123',
  lyricsOnly: false,
}

beforeEach(() => {
  fetchConductorStatus.mockResolvedValue({ live: false, currentSbpId: null, followerCount: 0, expiresAt: new Date(Date.now() + 86400000).toISOString() })
  useLibraryStore.setState({ collections: [] })
})

describe('ConductorJoinModal — conductor path', () => {
  it('shows conductor-specific heading when conductorToken is provided', () => {
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken="tok-123" broadcastTime={null}
        onImport={() => {}} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    expect(screen.getByText(/conductor link/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import.*conductor/i })).toBeInTheDocument()
  })

  it('calls onImport with "conductor" role when confirmed', () => {
    const onImport = vi.fn()
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken="tok-123" broadcastTime={null}
        onImport={onImport} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /import.*conductor/i }))
    expect(onImport).toHaveBeenCalledWith('conductor')
  })
})

describe('ConductorJoinModal — follower path', () => {
  it('shows follower import button when no conductor token', async () => {
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken={null} broadcastTime={null}
        onImport={() => {}} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument())
  })

  it('shows "Live now" badge when server returns live:true', async () => {
    fetchConductorStatus.mockResolvedValue({ live: true, currentSbpId: 5, followerCount: 3, expiresAt: new Date(Date.now() + 86400000).toISOString() })
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken={null} broadcastTime={null}
        onImport={() => {}} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByText(/live now/i)).toBeInTheDocument())
  })

  it('calls onImport with "follower" role', async () => {
    const onImport = vi.fn()
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken={null} broadcastTime={null}
        onImport={onImport} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    await waitFor(() => screen.getByRole('button', { name: /import/i }))
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    expect(onImport).toHaveBeenCalledWith('follower')
  })
})

describe('ConductorJoinModal — dedupe path', () => {
  it('shows rejoin UI when conductorCode already in library', async () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Easter Set', songIds: [], createdAt: '', conductorCode: 'ABC123', conductorRole: 'follower' }
      ],
    })
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken={null} broadcastTime={null}
        onImport={() => {}} onRejoin={() => {}} onCancel={() => {}}
      />
    )
    expect(screen.getByText(/already in your library/i)).toBeInTheDocument()
  })

  it('calls onRejoin when Rejoin is clicked', async () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Easter Set', songIds: [], createdAt: '', conductorCode: 'ABC123', conductorRole: 'follower' }
      ],
    })
    const onRejoin = vi.fn()
    render(
      <ConductorJoinModal
        isOpen shareSongs={baseSongs} conductorToken={null} broadcastTime={null}
        onImport={() => {}} onRejoin={onRejoin} onCancel={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /rejoin/i }))
    expect(onRejoin).toHaveBeenCalled()
  })
})
```

- [ ] **Step 8.2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose src/test/ConductorJoinModal.test.jsx
```

Expected: fails with "Cannot find module".

- [ ] **Step 8.3: Create `ConductorJoinModal.jsx`**

Create `src/components/Conductor/ConductorJoinModal.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { fetchConductorStatus } from '../../lib/conductorApi'
import { useLibraryStore } from '../../store/libraryStore'

export function ConductorJoinModal({ isOpen, shareSongs, conductorToken, broadcastTime, onImport, onRejoin, onCancel }) {
  const [serverStatus, setServerStatus] = useState(null) // { live, followerCount, currentSbpId } | null
  const [loadingStatus, setLoadingStatus] = useState(false)
  const collections = useLibraryStore(s => s.collections)

  const isConductorLink = !!conductorToken
  const existingCollection = collections.find(c => c.conductorCode === shareSongs?.conductorCode)
  const isDedupe = !!existingCollection && !isConductorLink

  useEffect(() => {
    if (!isOpen || isConductorLink || !shareSongs?.conductorCode) return
    setLoadingStatus(true)
    fetchConductorStatus(shareSongs.conductorCode)
      .then(s => setServerStatus(s))
      .catch(() => setServerStatus(null))
      .finally(() => setLoadingStatus(false))
  }, [isOpen, shareSongs?.conductorCode, isConductorLink])

  if (!shareSongs) return null

  const collectionLabel = shareSongs.collectionName || 'Shared Songs'
  const songCount = shareSongs.songs.length

  const scheduledLabel = broadcastTime
    ? new Date(broadcastTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null

  // — Dedupe path —
  if (isDedupe) {
    const isLive = serverStatus?.live ?? false
    return (
      <Modal isOpen={isOpen} title="Join broadcast" onClose={onCancel}>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          <strong>{collectionLabel}</strong> is already in your library.
          {isLive
            ? ' The broadcast is live now.'
            : scheduledLabel
              ? ` Broadcast scheduled at ${scheduledLabel}.`
              : ' Waiting for broadcast to start.'}
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onRejoin}>
            {isLive ? 'Rejoin & follow' : 'Rejoin'}
          </Button>
        </div>
      </Modal>
    )
  }

  // — Conductor link path —
  if (isConductorLink) {
    return (
      <Modal isOpen={isOpen} title="🎙 Conductor link" onClose={onCancel}>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          You've been given conductor control of this broadcast:
        </p>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{collectionLabel} — {songCount} song{songCount !== 1 ? 's' : ''}</p>
        {scheduledLabel && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Scheduled: {scheduledLabel}</p>
        )}
        <p className="text-xs text-orange-600 dark:text-orange-400 mb-4">
          ⚠ This link gives you broadcast control. Don't share it further.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onImport('conductor')}>
            Import &amp; become Conductor
          </Button>
        </div>
      </Modal>
    )
  }

  // — Follower path —
  const isLive = serverStatus?.live ?? false
  const followerCount = serverStatus?.followerCount ?? 0

  function statusLine() {
    if (loadingStatus) return 'Checking broadcast status…'
    if (!serverStatus) return scheduledLabel ? `Scheduled: ${scheduledLabel}` : 'Waiting to start'
    if (isLive) return `Live now · ${followerCount} following`
    if (scheduledLabel) return `Starts at ${scheduledLabel}`
    return 'Waiting for broadcast to start'
  }

  return (
    <Modal isOpen={isOpen} title="🎵 Join broadcast" onClose={onCancel}>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{collectionLabel} — {songCount} song{songCount !== 1 ? 's' : ''}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {isLive && <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium mr-2"><span className="w-2 h-2 rounded-full bg-green-500" />Live now</span>}
        {statusLine()}
      </p>
      {shareSongs.lyricsOnly && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Chords will be hidden — shared in lyrics-only mode.</p>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="secondary" onClick={() => onImport('follower')}>Just import the songs</Button>
        <Button variant="primary" onClick={() => onImport('follower')}>
          {isLive ? 'Import & follow live' : 'Import & wait for broadcast'}
        </Button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 8.4: Run tests**

```bash
npm test -- --reporter=verbose src/test/ConductorJoinModal.test.jsx
```

Expected: all tests pass.

- [ ] **Step 8.5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8.6: Commit**

```bash
git add src/components/Conductor/ConductorJoinModal.jsx src/test/ConductorJoinModal.test.jsx
git commit -m "feat(conductor): ConductorJoinModal with conductor/follower/dedupe paths"
```

---

## Task 9 — App.jsx: route to ConductorJoinModal + dedupe + wiring

**Files:**
- Modify: `src/App.jsx`

When the parsed share has `conductorCode`, show `ConductorJoinModal` instead of `ImportConfirmModal`. Pass role from `onImport` back into the collection update.

- [ ] **Step 9.1: Add ConductorJoinModal import and wiring to App.jsx**

In `src/App.jsx`:

1. Add import:
```js
import { ConductorJoinModal } from './components/Conductor/ConductorJoinModal'
```

2. The existing `conductorToken` is already read from the URL as `directorTokenRef.current`. Rename the ref for clarity (or keep the old name and derive from it — keeping old name is safest for minimal diff). Keep as `directorTokenRef`.

3. Replace the `ImportConfirmModal` at the bottom of the JSX with conditional logic:

```jsx
{shareSongs?.conductorCode ? (
  <ConductorJoinModal
    isOpen={shareSongs !== null}
    shareSongs={shareSongs}
    conductorToken={directorTokenRef.current}
    broadcastTime={broadcastTimeRef.current}
    onImport={(role) => handleConductorShareImport(role)}
    onRejoin={handleConductorRejoin}
    onCancel={handleShareCancel}
  />
) : (
  <ImportConfirmModal
    isOpen={shareSongs !== null}
    songs={shareSongs?.songs ?? []}
    collectionName={shareSongs?.collectionName ?? null}
    lyricsOnly={shareSongs?.lyricsOnly ?? false}
    onImport={handleShareImport}
    onCancel={handleShareCancel}
  />
)}
```

4. Add handler functions `handleConductorShareImport` and `handleConductorRejoin`:

```js
function handleConductorShareImport(role) {
  if (!shareSongs) return
  const name = shareSongs.collectionName || 'Shared Songs'
  const { newSongIds, collectionId } = addSongs(shareSongs.songs, name)
  const count = shareSongs.songs.length
  addToast(`${count} song${count !== 1 ? 's' : ''} imported.`, 'success')
  if (shareSongs.lyricsOnly) setSessionLyricsOnly(true)
  if (collectionId && shareSongs.conductorCode) {
    const updates = {
      conductorCode: shareSongs.conductorCode,
      conductorRole: role,
    }
    if (directorTokenRef.current) {
      updates.conductorDirectorToken = directorTokenRef.current
      directorTokenRef.current = null
    }
    if (broadcastTimeRef.current) {
      updates.conductorBroadcastTime = broadcastTimeRef.current
      broadcastTimeRef.current = null
    }
    updateCollection(collectionId, updates)
  }
  setSidebarOpen(true)
  if (newSongIds.length > 0) {
    setViewMode('collections')
    setExpandedCollectionId(collectionId)
    selectSong(newSongIds[0])
  }
  setShareSongs(null)
  clearShareParam()
}

function handleConductorRejoin() {
  // Dedupe path: collection already exists, just navigate and follow
  const existing = collections.find(c => c.conductorCode === shareSongs?.conductorCode)
  if (existing && existing.songIds.length > 0) {
    setViewMode('collections')
    setExpandedCollectionId(existing.id)
    selectSong(existing.songIds[0])
  }
  setShareSongs(null)
  clearShareParam()
}
```

5. Remove the old `handleShareImport` conductor-code block (lines 118–129 of original App.jsx) since it's now handled by `handleConductorShareImport`. Keep the plain `handleShareImport` for non-conductor shares (it no longer has the conductor block).

- [ ] **Step 9.2: Fix the ConductorJoinModal receiving stale token**

The `directorTokenRef.current` value is set from URL params on mount, but inside `ConductorJoinModal`'s render it needs to be a stable value. In App.jsx, add a state for it (since refs don't trigger re-renders and the modal renders before the ref is consumed):

```js
const [conductorTokenFromUrl, setConductorTokenFromUrl] = useState(null)
const [broadcastTimeFromUrl, setBroadcastTimeFromUrl] = useState(null)
```

In the URL parse `useEffect`, set them:
```js
const directorToken = params.get('conductor_token') || params.get('director') || null
setConductorTokenFromUrl(directorToken)
directorTokenRef.current = directorToken
setBroadcastTimeFromUrl(params.get('bt') || null)
broadcastTimeRef.current = params.get('bt') || null
```

Use these in the ConductorJoinModal render:
```jsx
<ConductorJoinModal
  ...
  conductorToken={conductorTokenFromUrl}
  broadcastTime={broadcastTimeFromUrl}
  ...
/>
```

And consume them in `handleConductorShareImport`:
```js
if (conductorTokenFromUrl) {
  updates.conductorDirectorToken = conductorTokenFromUrl
  setConductorTokenFromUrl(null)
}
if (broadcastTimeFromUrl) {
  updates.conductorBroadcastTime = broadcastTimeFromUrl
  setBroadcastTimeFromUrl(null)
}
```

Remove the old `directorTokenRef` + `broadcastTimeRef` refs if they are now replaced by state.

- [ ] **Step 9.3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9.4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(app): route conductor shares to ConductorJoinModal; add dedupe + rejoin path"
```

---

## Task 10 — `BroadcastWaitingBanner` + end-state lifecycle

**Files:**
- Create: `src/components/Conductor/BroadcastWaitingBanner.jsx`
- Create: `src/test/BroadcastWaitingBanner.test.jsx`
- Modify: `src/App.jsx`

The banner is shown to followers when `phase` is `dormant` / `waiting` / `ended`. It replaces the small gray header text for these states.

- [ ] **Step 10.1: Write failing tests**

Create `src/test/BroadcastWaitingBanner.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BroadcastWaitingBanner } from '../components/Conductor/BroadcastWaitingBanner'

describe('BroadcastWaitingBanner', () => {
  it('shows countdown when broadcastTime is in the future', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    render(
      <BroadcastWaitingBanner
        phase="waiting"
        broadcastTime={future}
        collectionName="Easter Set"
        previewSongTitle={null}
        onForget={() => {}}
      />
    )
    expect(screen.getByText(/easter set/i)).toBeInTheDocument()
    expect(screen.getByText(/waiting for broadcast/i)).toBeInTheDocument()
  })

  it('shows ended state when phase is "ended"', () => {
    render(
      <BroadcastWaitingBanner
        phase="ended"
        broadcastTime={null}
        collectionName="Easter Set"
        previewSongTitle={null}
        onForget={() => {}}
      />
    )
    expect(screen.getByText(/broadcast ended/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /forget/i })).toBeInTheDocument()
  })

  it('calls onForget when Forget broadcast is clicked', () => {
    const onForget = vi.fn()
    render(
      <BroadcastWaitingBanner
        phase="ended"
        broadcastTime={null}
        collectionName="Easter Set"
        previewSongTitle={null}
        onForget={onForget}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /forget/i }))
    expect(onForget).toHaveBeenCalled()
  })

  it('shows preview song title when provided', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    render(
      <BroadcastWaitingBanner
        phase="waiting"
        broadcastTime={future}
        collectionName="Easter Set"
        previewSongTitle="Hosanna"
        onForget={() => {}}
      />
    )
    expect(screen.getByText(/hosanna/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 10.2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose src/test/BroadcastWaitingBanner.test.jsx
```

Expected: fails with "Cannot find module".

- [ ] **Step 10.3: Create `BroadcastWaitingBanner.jsx`**

Create `src/components/Conductor/BroadcastWaitingBanner.jsx`:

```jsx
import { useState, useEffect } from 'react'

function formatCountdown(ms) {
  if (ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return `${h > 0 ? `${h}h ` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function BroadcastWaitingBanner({ phase, broadcastTime, collectionName, previewSongTitle, onForget }) {
  const [countdown, setCountdown] = useState(null)

  useEffect(() => {
    if (!broadcastTime || phase === 'ended') { setCountdown(null); return }
    const tick = () => {
      const ms = new Date(broadcastTime).getTime() - Date.now()
      setCountdown(ms > 0 ? formatCountdown(ms) : null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [broadcastTime, phase])

  if (phase !== 'waiting' && phase !== 'dormant' && phase !== 'ended') return null

  if (phase === 'ended') {
    return (
      <div className="w-full bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">✓ Broadcast ended</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{collectionName} — the songs are kept in your library.</p>
        </div>
        <button
          onClick={onForget}
          className="text-xs text-gray-400 underline shrink-0"
          aria-label="Forget broadcast"
        >
          Forget broadcast
        </button>
      </div>
    )
  }

  const timeLabel = broadcastTime
    ? new Date(broadcastTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null

  return (
    <div className="w-full bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            ⏳ Waiting for broadcast
          </p>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
            {collectionName}
            {timeLabel ? ` · starts ${timeLabel}` : ''}
            {countdown ? ` (${countdown})` : ''}
          </p>
          {previewSongTitle && (
            <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
              Preview: "{previewSongTitle}" — the conductor will start here
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 10.4: Wire BroadcastWaitingBanner into App.jsx**

In `src/App.jsx`:

1. Add import:
```js
import { BroadcastWaitingBanner } from './components/Conductor/BroadcastWaitingBanner'
```

2. After the `conductorSync` declaration, add a derived value for the preview song title:
```js
const previewSongTitle = conductorSync.currentSbpId != null
  ? (() => {
      const entry = collections
        .flatMap(c => c.songIds)
        .map(id => { const s = loadSong?.(id); return s?.meta?.sbpId === conductorSync.currentSbpId ? s : null })
        .find(Boolean)
      return entry?.meta?.title ?? null
    })()
  : null
```

Actually this is too complex for inline. Instead, derive it from the library index:
```js
const previewSongTitle = conductorSync.currentSbpId != null
  ? (index.find(e => e.sbpId === conductorSync.currentSbpId)?.title ?? null)
  : null
```

Add `index` to the destructured store values (it's already available via `useLibraryStore` calls).

3. In the JSX body, inside the non-session branch, add the banner between the header and body:

```jsx
{/* Body */}
<div className="flex flex-1 overflow-hidden relative">
  {activeSession ? (
    <SessionView ... />
  ) : (
    <>
      {/* Broadcast waiting banner — shown to followers before/after broadcast */}
      {conductorCollection?.conductorRole === 'follower' && (
        ['dormant', 'waiting', 'ended'].includes(conductorSync.phase) && (
          <div className="absolute inset-x-0 top-0 z-10">
            <BroadcastWaitingBanner
              phase={conductorSync.phase}
              broadcastTime={conductorCollection.conductorBroadcastTime ?? null}
              collectionName={conductorCollection.name}
              previewSongTitle={previewSongTitle}
              onForget={() => {
                const { clearBroadcastFields } = useLibraryStore.getState()
                clearBroadcastFields(conductorCollection.id)
              }}
            />
          </div>
        )
      )}
      <Sidebar ... />
      <MainContent ... />
    </>
  )}
</div>
```

Note: `useLibraryStore.getState()` outside of React render is safe for event handlers.

- [ ] **Step 10.5: Run tests**

```bash
npm test -- --reporter=verbose src/test/BroadcastWaitingBanner.test.jsx
```

Expected: all 4 tests pass.

- [ ] **Step 10.6: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 10.7: Commit**

```bash
git add src/components/Conductor/BroadcastWaitingBanner.jsx src/test/BroadcastWaitingBanner.test.jsx src/App.jsx
git commit -m "feat(conductor): BroadcastWaitingBanner for follower pre/post broadcast states"
```

---

## Task 11 — Terminology rename pass

**Files:** cross-cutting — all conductor-related files

This is a mechanical rename. The key changes:
- `?director=` URL param → `?conductor_token=` (URL parse side: accept both; generate side: use new)
- `conductorDirectorToken` collection field → `conductorToken` (old field accepted in read paths; written with new name going forward)
- `isDirector` variable in `useConductorSync.js` → `isConductor`
- `directorToken` prop/variable → `conductorToken`
- Header `X-Director-Token` → `X-Conductor-Token` (conductorApi.js; worker accepts both)
- UI strings "Director" → "Conductor"

> ⚠ The `conductorDirectorToken` localStorage field rename is storage-breaking. The migration shim added in Task 3 still reads and writes `conductorDirectorToken`. After this task we write `conductorToken` but must read both keys for one release cycle. Update `clearBroadcastFields` in libraryStore to also clear `conductorToken`.

- [ ] **Step 11.1: Rename in `useConductorSync.js`**

In `src/hooks/useConductorSync.js`:

Replace the function signature parameter:
```js
// Old:
export function useConductorSync({ conductorCode, directorToken, broadcastTime, activeSongSbpId, onAddToast }) {
// New:
export function useConductorSync({ conductorCode, conductorToken, broadcastTime, activeSongSbpId, onAddToast }) {
```

Replace all occurrences of `directorToken` inside the file with `conductorToken`.
Replace `isDirector` with `isConductor` throughout.
Update the return object: `isDirector: isConductor` becomes `isConductor`.

- [ ] **Step 11.2: Update App.jsx hook call**

In `src/App.jsx`, update the `useConductorSync` call:
```js
const conductorSync = useConductorSync({
  conductorCode: conductorCollection?.conductorCode ?? null,
  conductorToken: conductorCollection?.conductorDirectorToken ?? conductorCollection?.conductorToken ?? null,
  broadcastTime: conductorCollection?.conductorBroadcastTime ?? null,
  activeSongSbpId: activeSong?.meta?.sbpId ?? null,
  onAddToast: addToast,
})
```

(Reading both old `conductorDirectorToken` and new `conductorToken` for backward compat.)

- [ ] **Step 11.3: Update `ConductorBar.jsx`**

In `src/components/Conductor/ConductorBar.jsx`, replace `isDirector` with `isConductor` in the destructured prop:
```js
const { live, phase, broadcastTime, isConductor, isFollowing, isBroadcasting,
        followerCount, startBroadcast, stopBroadcast, followDirector, stopFollowing } = sync

if (isConductor) {
```

- [ ] **Step 11.4: Update `conductorApi.js` to send `X-Conductor-Token`**

In `src/lib/conductorApi.js`, replace all `'X-Director-Token': ...` with `'X-Conductor-Token': ...`.

- [ ] **Step 11.5: Update worker to accept both header names**

In `songbook-worker/src/routes/conductor.ts`, update `requireDirector` to accept both headers:
```ts
function requireDirector(data: ConductorData, token: string | undefined): boolean {
  return !!token && token === data.directorToken;
}
```

Add a helper in the routes that reads both:
```ts
function getConductorToken(c: Context): string | undefined {
  return c.req.header('X-Conductor-Token') ?? c.req.header('X-Director-Token');
}
```

Replace all `c.req.header('X-Director-Token')` calls with `getConductorToken(c)`.

- [ ] **Step 11.6: Update ShareModal done step copy**

In `src/components/Share/ShareModal.jsx`:
- Change `"Director link"` label to `"Conductor link"`
- Change `"Save Director QR"` button to `"Save Conductor QR"`
- Update the director URL generation to use `conductor_token` param:
  ```js
  const directorUrl = `${result.shareUrl}&conductor_token=${directorToken}`
  ```

- [ ] **Step 11.7: Update URL parse in App.jsx to accept both param names**

In `src/App.jsx`, update the URL parse effect:
```js
const directorToken = params.get('conductor_token') || params.get('director') || null
```

(Already done in Task 9 Step 9.2 — verify it's correct here.)

- [ ] **Step 11.8: Update `clearBroadcastFields` in libraryStore to clear both field names**

In `src/store/libraryStore.js`, in `clearBroadcastFields`, destructure both `conductorDirectorToken` and `conductorToken`:
```js
const {
  conductorCode: _cc,
  conductorDirectorToken: _cdt,
  conductorToken: _ct,         // NEW — clear the renamed field too
  conductorBroadcastTime: _cbt,
  conductorRole: _cr,
  conductorShareCode: _csc,
  conductorCreatedAt: _cca,
  conductorExpiresAt: _cea,
  conductorEnded: _ce,
  ...rest
} = c
```

- [ ] **Step 11.9: Run full tests**

```bash
npm test && cd songbook-worker && npm test
```

Expected: all tests pass (some may need updating if they reference `isDirector` — fix those).

- [ ] **Step 11.10: Commit**

```bash
git add -A
git commit -m "refactor(conductor): rename director→conductor in variables, headers, URL params; accept aliases"
```

---

## Self-review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| BroadcastsPanel with re-accessible links | Task 5 |
| Auto-detect role on link open | Task 8 (ConductorJoinModal) |
| Skip import friction for followers (dedupe) | Task 8 (dedupe path), Task 9 |
| Self-direct shortcut | Task 7 |
| Fix refresh-mid-broadcast bug | Task 6 |
| BroadcastWaitingBanner prominence | Task 10 |
| `/end` + `/preview` backend endpoints | Task 1 |
| `conductorEnded` lifecycle | Tasks 3 + 5 (markEnded) |
| Terminology cleanup | Task 11 |
| `conductorRole` migration shim | Task 3 |
| `conductorExpiresAt` lazy fill | Task 1 (exposed in status response); not auto-written to store — acceptable for v1; panel can show from status response |
| Multiple conductor collections — use active one | Task 6 (App.jsx selection logic) |
| "Stop" vs "End session" distinction | Task 5 (BroadcastsPanel) |

**No placeholders found.**

**Type consistency:**
- `conductorToken` (renamed from `directorToken`) used consistently from Task 11 onward
- `conductorRole` values `"coordinator" | "conductor" | "follower"` consistent across Tasks 3, 4, 7, 8
- `useConductorSync` `isConductor` (Task 11) correctly consumed by `ConductorBar` (Task 11 Step 11.3)
- `conductorCode` exposed from `useConductorSync` (Task 6) consumed by `BroadcastsPanel` (Task 5)

**One gap:** The spec mentions that follower-side `BroadcastWaitingBanner` can show the preview song title from `/preview` endpoint. Task 10 derives this from `conductorSync.currentSbpId` + `index`. This works correctly since `fetchConductorStatus` always returns `currentSbpId` regardless of `live` (per Task 1 implementation).

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-03-conductor-broadcast-ux.md`.**
