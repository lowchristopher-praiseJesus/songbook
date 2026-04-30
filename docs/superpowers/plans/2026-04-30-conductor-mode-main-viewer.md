# Conductor Mode (Main Viewer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight Conductor Mode letting a music director control which song is displayed on follower devices from within the normal main viewer — no Live Session required.

**Architecture:** A coordinator shares a conductor-enabled collection; the SBP zip embeds a `conductorCode` and a director link carries a `directorToken`. The Cloudflare Worker stores a minimal conductor record (`{ live, currentSbpId, followers }`) in the existing `SESSION_KV` namespace under `conductor:<code>` keys. Follower devices poll `GET /conductor/:code/status` every second; the director's song taps broadcast via `POST /conductor/:code/current`. Song identity uses `sbpId` (deterministic integer, identical across all imports of the same song).

**Tech Stack:** TypeScript + Hono (Cloudflare Worker), React 18, Zustand, Vitest, @cloudflare/vitest-pool-workers, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-30-conductor-mode-main-viewer-design.md`

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `songbook-worker/src/config.ts` | CONDUCTOR capacity constants |
| Create | `songbook-worker/src/lib/conductor.ts` | KV types + helpers |
| Create | `songbook-worker/src/routes/conductor.ts` | All conductor HTTP endpoints |
| Create | `songbook-worker/src/routes/conductor.test.ts` | Worker integration tests |
| Modify | `songbook-worker/src/index.ts` | Mount router + add CORS header |
| Modify | `src/lib/parser/sbpParser.js` | Add `sbpId` to song meta + return `conductorCode` from archive |
| Modify | `src/lib/exportSbp.js` | Embed `conductorCode` in SBP zip when provided |
| Create | `src/lib/conductorApi.js` | HTTP client for all conductor endpoints |
| Modify | `src/store/libraryStore.js` | Add `sbpId` to index entries; add `updateCollection` action |
| Create | `src/hooks/useConductorSync.js` | 1-second poll, broadcast, follow, heartbeat |
| Create | `src/components/Conductor/ConductorBar.jsx` | Director/follower header controls |
| Modify | `src/components/Share/ShareModal.jsx` | Conductor toggle, max followers, two QR codes |
| Modify | `src/App.jsx` | Mount hook + ConductorBar, handle `?director=` param, post-import conductor wiring |

---

## Task 1: Worker config file + CORS header

**Files:**
- Create: `songbook-worker/src/config.ts`
- Modify: `songbook-worker/src/index.ts`

- [ ] **Step 1: Create config.ts**

```ts
// songbook-worker/src/config.ts
export const CONDUCTOR = {
  MAX_FOLLOWERS: 20,
  FOLLOWER_TTL_SECONDS: 90,
  SESSION_DAYS: 30,
} as const;
```

- [ ] **Step 2: Add `X-Director-Token` to CORS allowed headers in index.ts**

In `songbook-worker/src/index.ts`, find the OPTIONS response and change the `Access-Control-Allow-Headers` line:

```ts
'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In-Days, X-Leader-Token, X-Director-Token',
```

- [ ] **Step 3: Verify the worker still builds**

```bash
cd songbook-worker && npx wrangler dev --dry-run
```

Expected: no TypeScript errors, exits cleanly.

- [ ] **Step 4: Commit**

```bash
git add songbook-worker/src/config.ts songbook-worker/src/index.ts
git commit -m "feat(conductor): worker config + CORS header for X-Director-Token"
```

---

## Task 2: Worker conductor KV types + helpers

**Files:**
- Create: `songbook-worker/src/lib/conductor.ts`

- [ ] **Step 1: Create the types and KV helper file**

```ts
// songbook-worker/src/lib/conductor.ts
import { CONDUCTOR } from '../config';
import { generateCode } from './session';

export interface ConductorFollower {
  lastSeen: string; // ISO timestamp
}

export interface ConductorData {
  conductorCode: string;
  directorToken: string;
  maxFollowers: number;
  live: boolean;
  currentSbpId: number | null;
  version: number;
  followers: Record<string, ConductorFollower>;
  expiresAt: string;
}

export { generateCode };

export function kvKey(code: string): string {
  return `conductor:${code}`;
}

export async function getConductor(
  kv: KVNamespace,
  code: string,
): Promise<ConductorData | null> {
  const raw = await kv.get(kvKey(code));
  if (!raw) return null;
  return JSON.parse(raw) as ConductorData;
}

export async function putConductor(
  kv: KVNamespace,
  data: ConductorData,
): Promise<void> {
  const expiresAt = new Date(data.expiresAt);
  const ttlSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  await kv.put(kvKey(data.conductorCode), JSON.stringify(data), {
    expirationTtl: ttlSeconds,
  });
}

/** Count followers whose lastSeen is within FOLLOWER_TTL_SECONDS. */
export function countActiveFollowers(data: ConductorData): number {
  const cutoff = Date.now() - CONDUCTOR.FOLLOWER_TTL_SECONDS * 1000;
  return Object.values(data.followers).filter(
    f => new Date(f.lastSeen).getTime() > cutoff,
  ).length;
}

/** Remove stale follower entries (lazy cleanup). */
export function stripStaleFollowers(data: ConductorData): ConductorData {
  const cutoff = Date.now() - CONDUCTOR.FOLLOWER_TTL_SECONDS * 1000;
  const followers: Record<string, ConductorFollower> = {};
  for (const [id, f] of Object.entries(data.followers)) {
    if (new Date(f.lastSeen).getTime() > cutoff) followers[id] = f;
  }
  return { ...data, followers };
}

export function isConductorExpired(data: ConductorData): boolean {
  return new Date(data.expiresAt).getTime() <= Date.now();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd songbook-worker && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add songbook-worker/src/lib/conductor.ts
git commit -m "feat(conductor): KV types and helpers"
```

---

## Task 3: Worker conductor routes — create + status + mount

**Files:**
- Create: `songbook-worker/src/routes/conductor.ts` (partial — create + status only)
- Create: `songbook-worker/src/routes/conductor.test.ts` (partial)
- Modify: `songbook-worker/src/index.ts`

- [ ] **Step 1: Write failing tests for create + status**

```ts
// songbook-worker/src/routes/conductor.test.ts
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';
const h = { 'Content-Type': 'application/json', 'Origin': ORIGIN };

async function createConductor(body = {}) {
  return SELF.fetch('http://localhost/conductor/create', {
    method: 'POST', headers: h,
    body: JSON.stringify({ conductorCode: 'AABBCC', directorToken: 'tok-1', maxFollowers: 5, ...body }),
  });
}

describe('POST /conductor/create', () => {
  it('creates a conductor session and returns ok', async () => {
    const res = await createConductor();
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('rejects maxFollowers above server ceiling', async () => {
    const res = await createConductor({ maxFollowers: 9999 });
    expect(res.status).toBe(400);
  });
});

describe('GET /conductor/:code/status', () => {
  it('returns live:false and zero followers for a new session', async () => {
    await createConductor({ conductorCode: 'STAT01' });
    const res = await SELF.fetch('http://localhost/conductor/STAT01/status', { headers: h });
    expect(res.status).toBe(200);
    const data = await res.json() as { live: boolean; currentSbpId: null; version: number; followerCount: number };
    expect(data.live).toBe(false);
    expect(data.currentSbpId).toBeNull();
    expect(data.version).toBe(0);
    expect(data.followerCount).toBe(0);
  });

  it('returns 404 for unknown code', async () => {
    const res = await SELF.fetch('http://localhost/conductor/XXXXXX/status', { headers: h });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests — expect failure (route not found)**

```bash
cd songbook-worker && npx vitest run src/routes/conductor.test.ts
```

Expected: FAIL — 404 or similar because route does not exist yet.

- [ ] **Step 3: Create the conductor router with create + status**

```ts
// songbook-worker/src/routes/conductor.ts
import { Hono } from 'hono';
import type { Env } from '../types';
import { CONDUCTOR } from '../config';
import {
  generateCode as _generateCode,
  getConductor, putConductor,
  countActiveFollowers, isConductorExpired,
} from '../lib/conductor';
import type { ConductorData } from '../lib/conductor';

const conductor = new Hono<{ Bindings: Env }>();

// POST /conductor/create
conductor.post('/create', async (c) => {
  let body: { conductorCode?: unknown; directorToken?: unknown; maxFollowers?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }

  if (typeof body.conductorCode !== 'string' || !body.conductorCode)
    return c.json({ error: 'missing_conductor_code' }, 400);
  if (typeof body.directorToken !== 'string' || !body.directorToken)
    return c.json({ error: 'missing_director_token' }, 400);

  const maxFollowers = typeof body.maxFollowers === 'number'
    ? Math.min(body.maxFollowers, CONDUCTOR.MAX_FOLLOWERS)
    : CONDUCTOR.MAX_FOLLOWERS;

  if (typeof body.maxFollowers === 'number' && body.maxFollowers > CONDUCTOR.MAX_FOLLOWERS)
    return c.json({ error: 'max_followers_exceeded' }, 400);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONDUCTOR.SESSION_DAYS * 24 * 60 * 60 * 1000);

  const data: ConductorData = {
    conductorCode: body.conductorCode,
    directorToken: body.directorToken,
    maxFollowers,
    live: false,
    currentSbpId: null,
    version: 0,
    followers: {},
    expiresAt: expiresAt.toISOString(),
  };

  await putConductor(c.env.SESSION_KV, data);
  return c.json({ ok: true });
});

// GET /conductor/:code/status
conductor.get('/:code/status', async (c) => {
  const code = c.req.param('code');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data)) return c.json({ error: 'expired' }, 410);

  return c.json({
    live: data.live,
    currentSbpId: data.currentSbpId,
    version: data.version,
    followerCount: countActiveFollowers(data),
  });
});

export default conductor;
```

- [ ] **Step 4: Mount the conductor router in index.ts**

Add to `songbook-worker/src/index.ts`:
```ts
import conductor from './routes/conductor';
// ... after existing imports

app.route('/conductor', conductor);
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd songbook-worker && npx vitest run src/routes/conductor.test.ts
```

Expected: PASS — all create + status tests green.

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/src/routes/conductor.ts songbook-worker/src/routes/conductor.test.ts songbook-worker/src/index.ts
git commit -m "feat(conductor): create + status endpoints"
```

---

## Task 4: Worker conductor routes — director endpoints

**Files:**
- Modify: `songbook-worker/src/routes/conductor.ts`
- Modify: `songbook-worker/src/routes/conductor.test.ts`

- [ ] **Step 1: Write failing tests for start, current, stop**

Append to `conductor.test.ts`:

```ts
describe('POST /conductor/:code/start', () => {
  it('sets live:true with valid director token', async () => {
    await createConductor({ conductorCode: 'START1', directorToken: 'dir-tok' });
    const res = await SELF.fetch('http://localhost/conductor/START1/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-tok' },
    });
    expect(res.status).toBe(200);

    const status = await (await SELF.fetch('http://localhost/conductor/START1/status', { headers: h })).json() as { live: boolean };
    expect(status.live).toBe(true);
  });

  it('returns 403 with wrong token', async () => {
    await createConductor({ conductorCode: 'START2', directorToken: 'real-tok' });
    const res = await SELF.fetch('http://localhost/conductor/START2/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'wrong-tok' },
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /conductor/:code/current', () => {
  it('sets currentSbpId and bumps version', async () => {
    await createConductor({ conductorCode: 'CURR01', directorToken: 'dir-tok' });
    const res = await SELF.fetch('http://localhost/conductor/CURR01/current', {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': 'dir-tok' },
      body: JSON.stringify({ sbpId: 42 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { currentSbpId: number; version: number };
    expect(data.currentSbpId).toBe(42);
    expect(data.version).toBe(1);
  });
});

describe('POST /conductor/:code/stop', () => {
  it('sets live:false and clears currentSbpId', async () => {
    await createConductor({ conductorCode: 'STOP01', directorToken: 'dir-tok' });
    await SELF.fetch('http://localhost/conductor/STOP01/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-tok' },
    });
    await SELF.fetch('http://localhost/conductor/STOP01/current', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-tok' },
      body: JSON.stringify({ sbpId: 99 }),
    });
    const res = await SELF.fetch('http://localhost/conductor/STOP01/stop', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-tok' },
    });
    expect(res.status).toBe(200);
    const status = await (await SELF.fetch('http://localhost/conductor/STOP01/status', { headers: h })).json() as { live: boolean; currentSbpId: null };
    expect(status.live).toBe(false);
    expect(status.currentSbpId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd songbook-worker && npx vitest run src/routes/conductor.test.ts
```

Expected: FAIL — new tests 404.

- [ ] **Step 3: Implement director endpoints in conductor.ts**

Add after the `GET /:code/status` handler:

```ts
function requireDirector(data: ConductorData, token: string | undefined): boolean {
  return !!token && token === data.directorToken;
}

// POST /conductor/:code/start
conductor.post('/:code/start', async (c) => {
  const code = c.req.param('code');
  const token = c.req.header('X-Director-Token');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data)) return c.json({ error: 'expired' }, 410);
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);

  await putConductor(c.env.SESSION_KV, { ...data, live: true });
  return c.json({ ok: true });
});

// POST /conductor/:code/current
conductor.post('/:code/current', async (c) => {
  const code = c.req.param('code');
  const token = c.req.header('X-Director-Token');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data)) return c.json({ error: 'expired' }, 410);
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);

  let body: { sbpId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }
  if (typeof body.sbpId !== 'number') return c.json({ error: 'missing_sbp_id' }, 400);

  const updated: ConductorData = { ...data, currentSbpId: body.sbpId, version: data.version + 1 };
  await putConductor(c.env.SESSION_KV, updated);
  return c.json({ currentSbpId: updated.currentSbpId, version: updated.version });
});

// POST /conductor/:code/stop
conductor.post('/:code/stop', async (c) => {
  const code = c.req.param('code');
  const token = c.req.header('X-Director-Token');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data)) return c.json({ error: 'expired' }, 410);
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);

  await putConductor(c.env.SESSION_KV, { ...data, live: false, currentSbpId: null });
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run all conductor tests — expect pass**

```bash
cd songbook-worker && npx vitest run src/routes/conductor.test.ts
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/routes/conductor.ts songbook-worker/src/routes/conductor.test.ts
git commit -m "feat(conductor): director start/current/stop endpoints"
```

---

## Task 5: Worker conductor routes — follower endpoints

**Files:**
- Modify: `songbook-worker/src/routes/conductor.ts`
- Modify: `songbook-worker/src/routes/conductor.test.ts`

- [ ] **Step 1: Write failing tests for join, heartbeat, leave**

Append to `conductor.test.ts`:

```ts
describe('POST /conductor/:code/join', () => {
  it('registers a follower and returns ok', async () => {
    await createConductor({ conductorCode: 'JOIN01', directorToken: 'd', maxFollowers: 5 });
    await SELF.fetch('http://localhost/conductor/JOIN01/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'd' },
    });
    const res = await SELF.fetch('http://localhost/conductor/JOIN01/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('returns 403 when at capacity', async () => {
    await createConductor({ conductorCode: 'FULL01', directorToken: 'd', maxFollowers: 1 });
    await SELF.fetch('http://localhost/conductor/FULL01/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'd' },
    });
    await SELF.fetch('http://localhost/conductor/FULL01/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch('http://localhost/conductor/FULL01/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-b' }),
    });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('full');
  });

  it('allows re-join for an existing clientId', async () => {
    await createConductor({ conductorCode: 'REJOIN', directorToken: 'd', maxFollowers: 1 });
    await SELF.fetch('http://localhost/conductor/REJOIN/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch('http://localhost/conductor/REJOIN/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /conductor/:code/heartbeat', () => {
  it('updates lastSeen for a registered follower', async () => {
    await createConductor({ conductorCode: 'HB0001', directorToken: 'd', maxFollowers: 5 });
    await SELF.fetch('http://localhost/conductor/HB0001/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch('http://localhost/conductor/HB0001/heartbeat', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 for unregistered clientId', async () => {
    await createConductor({ conductorCode: 'HB0002', directorToken: 'd', maxFollowers: 5 });
    const res = await SELF.fetch('http://localhost/conductor/HB0002/heartbeat', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'ghost' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /conductor/:code/join', () => {
  it('removes follower and returns 204', async () => {
    await createConductor({ conductorCode: 'LEAVE1', directorToken: 'd', maxFollowers: 5 });
    await SELF.fetch('http://localhost/conductor/LEAVE1/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch('http://localhost/conductor/LEAVE1/join', {
      method: 'DELETE', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(204);

    const status = await (await SELF.fetch('http://localhost/conductor/LEAVE1/status', { headers: h })).json() as { followerCount: number };
    expect(status.followerCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd songbook-worker && npx vitest run src/routes/conductor.test.ts
```

Expected: FAIL — follower endpoints not found.

- [ ] **Step 3: Implement follower endpoints in conductor.ts**

Add after the stop handler:

```ts
// POST /conductor/:code/join
conductor.post('/:code/join', async (c) => {
  const code = c.req.param('code');
  let body: { clientId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }
  if (typeof body.clientId !== 'string' || !body.clientId)
    return c.json({ error: 'missing_client_id' }, 400);

  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data)) return c.json({ error: 'expired' }, 410);

  const clientId = body.clientId;
  const alreadyRegistered = !!data.followers[clientId];
  const activeCount = countActiveFollowers(data);

  if (!alreadyRegistered && activeCount >= data.maxFollowers)
    return c.json({ error: 'full' }, 403);

  const updated: ConductorData = {
    ...data,
    followers: { ...data.followers, [clientId]: { lastSeen: new Date().toISOString() } },
  };
  await putConductor(c.env.SESSION_KV, updated);
  return c.json({ ok: true });
});

// POST /conductor/:code/heartbeat
conductor.post('/:code/heartbeat', async (c) => {
  const code = c.req.param('code');
  let body: { clientId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }
  if (typeof body.clientId !== 'string') return c.json({ error: 'missing_client_id' }, 400);

  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);

  const clientId = body.clientId;
  if (!data.followers[clientId]) return c.json({ error: 'not_registered' }, 404);

  const updated: ConductorData = {
    ...data,
    followers: { ...data.followers, [clientId]: { lastSeen: new Date().toISOString() } },
  };
  await putConductor(c.env.SESSION_KV, updated);
  return c.json({ ok: true });
});

// DELETE /conductor/:code/join
conductor.delete('/:code/join', async (c) => {
  const code = c.req.param('code');
  let body: { clientId?: unknown };
  try { body = await c.req.json(); } catch { body = {}; }

  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return new Response(null, { status: 204 });

  if (typeof body.clientId === 'string' && data.followers[body.clientId]) {
    const followers = { ...data.followers };
    delete followers[body.clientId];
    await putConductor(c.env.SESSION_KV, { ...data, followers });
  }
  return new Response(null, { status: 204 });
});
```

- [ ] **Step 4: Run all conductor tests — expect pass**

```bash
cd songbook-worker && npx vitest run src/routes/conductor.test.ts
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/routes/conductor.ts songbook-worker/src/routes/conductor.test.ts
git commit -m "feat(conductor): follower join/heartbeat/leave endpoints"
```

---

## Task 6: Parser — sbpId field + sbpId in library index

**Files:**
- Modify: `src/lib/parser/sbpParser.js`
- Modify: `src/store/libraryStore.js`
- Test: `src/lib/parser/__tests__/sbpParser.test.js`
- Test: `src/store/__tests__/libraryStore.collections.test.js`

- [ ] **Step 1: Write a failing test for sbpId in parsed song meta**

Open `src/lib/parser/__tests__/sbpParser.test.js`. Find a test that checks the returned song object and add:

```js
it('includes sbpId derived from song Id field', async () => {
  // Build a minimal SBP zip with one song
  const { buildSbpZip } = await import('../../exportSbp.js')
  const song = {
    id: 'test-id',
    meta: { title: 'Test Song', artist: 'Artist', keyIndex: 0, usesFlats: false },
    rawText: '[C]Hello world',
  }
  const zip = buildSbpZip([song], null, false)
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  const { songs } = await parseSbpFile(buf)
  expect(songs[0].meta.sbpId).toBeDefined()
  expect(typeof songs[0].meta.sbpId).toBe('number')
})
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- src/lib/parser/__tests__/sbpParser.test.js
```

Expected: FAIL — `sbpId` is `undefined`.

- [ ] **Step 3: Add sbpId to songFromJson in sbpParser.js**

In `src/lib/parser/sbpParser.js`, inside `songFromJson`, find the `return { rawText, meta: { ... }, sections }` block and add `sbpId: s.Id` to the meta object:

```js
  return {
    rawText,
    meta: {
      title: s.name ?? 'Untitled',
      artist: s.author || undefined,
      key: KEY_NAMES[keyIndex],
      keyIndex,
      isMinor: false,
      usesFlats,
      capo,
      tempo: s.TempoInt > 0 ? s.TempoInt : undefined,
      timeSignature: s.timeSig || undefined,
      copyright: s.Copyright || undefined,
      ccli: s.ccli ?? undefined,
      subTitle: s.subTitle || undefined,
      sbpId: typeof s.Id === 'number' ? s.Id : null,   // ← add this line
      sbpKey: typeof s.key === 'number' ? s.key : 0,
      sbpKeyShift: songKeyShift,
      sbpSongCapo: songCapo,
      sbpSetCapo: setCapo,
      sbpKeyOfset: keyOfset,
      sbpOriginalContent: content,
      sbpBaselineKeyIndex: keyIndex,
    },
    sections: parseContent(rawText),
  }
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm test -- src/lib/parser/__tests__/sbpParser.test.js
```

Expected: PASS.

- [ ] **Step 5: Write a failing test for sbpId appearing in the library index**

Open `src/store/__tests__/libraryStore.collections.test.js`. Add:

```js
it('includes sbpId in index entry when song has meta.sbpId', () => {
  const { addSongs, index } = useLibraryStore.getState()
  addSongs([{
    meta: { title: 'Conductor Song', artist: '', keyIndex: 0, usesFlats: false, sbpId: 12345 },
    rawText: '',
  }])
  const entry = useLibraryStore.getState().index.find(e => e.title === 'Conductor Song')
  expect(entry?.sbpId).toBe(12345)
})
```

- [ ] **Step 6: Run the test — expect failure**

```bash
npm test -- src/store/__tests__/libraryStore.collections.test.js
```

Expected: FAIL — `entry.sbpId` is `undefined`.

- [ ] **Step 7: Add sbpId to index entries in libraryStore.js**

In `src/store/libraryStore.js`, find the `entry` object construction inside `addSongs`:

```js
      const entry = {
        id: song.id,
        title: song.meta.title,
        artist: song.meta.artist ?? '',
        importedAt: song.importedAt,
      }
```

Change it to:

```js
      const entry = {
        id: song.id,
        title: song.meta.title,
        artist: song.meta.artist ?? '',
        importedAt: song.importedAt,
        ...(song.meta.sbpId != null ? { sbpId: song.meta.sbpId } : {}),
      }
```

- [ ] **Step 8: Run all tests — expect pass**

```bash
npm test -- src/store/__tests__/libraryStore.collections.test.js src/lib/parser/__tests__/sbpParser.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/parser/sbpParser.js src/store/libraryStore.js
git commit -m "feat(conductor): add sbpId to song meta and library index"
```

---

## Task 7: Export + parseSbpFile — conductorCode round-trip

**Files:**
- Modify: `src/lib/exportSbp.js`
- Modify: `src/lib/parser/sbpParser.js`
- Test: `src/test/exportSbp.test.js`

- [ ] **Step 1: Write failing tests**

Open `src/test/exportSbp.test.js` and add:

```js
import { buildSbpZip } from '../lib/exportSbp.js'
import { parseSbpFile } from '../lib/parser/sbpParser.js'

describe('conductorCode round-trip', () => {
  it('embeds conductorCode in the zip when provided', async () => {
    const zip = buildSbpZip([], 'Test', false, 'COND01')
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    const { conductorCode } = await parseSbpFile(buf)
    expect(conductorCode).toBe('COND01')
  })

  it('returns null conductorCode when not embedded', async () => {
    const zip = buildSbpZip([], 'Test', false, null)
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    const { conductorCode } = await parseSbpFile(buf)
    expect(conductorCode).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- src/test/exportSbp.test.js
```

Expected: FAIL — `conductorCode` not in zip, `parseSbpFile` doesn't return it.

- [ ] **Step 3: Update buildSbpZip to accept and embed conductorCode**

In `src/lib/exportSbp.js`, change the `buildSbpZip` signature and the `data` object:

```js
export function buildSbpZip(songs, collectionName = null, lyricsOnly = false, conductorCode = null) {
  const sbpSongs = songs.map(songToSbpJson)
  // ... (sets array unchanged) ...

  const data = {
    songs: sbpSongs,
    sets,
    folders: [],
    ...(lyricsOnly && { lyricsOnly: true }),
    ...(conductorCode ? { conductorCode } : {}),   // ← add this line
  }
  // ... rest unchanged
}
```

Also update `exportSongsAsSbp`:

```js
export async function exportSongsAsSbp(songs, collectionName = null, lyricsOnly = false, conductorCode = null) {
  return buildSbpZip(songs, collectionName, lyricsOnly, conductorCode).generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
```

- [ ] **Step 4: Update parseSbpFile to return conductorCode**

In `src/lib/parser/sbpParser.js`, find the `return { songs, collectionName, lyricsOnly }` line and change to:

```js
  return {
    songs,
    collectionName,
    lyricsOnly: data.lyricsOnly ?? false,
    conductorCode: data.conductorCode ?? null,
  }
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm test -- src/test/exportSbp.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exportSbp.js src/lib/parser/sbpParser.js
git commit -m "feat(conductor): embed and parse conductorCode in SBP share package"
```

---

## Task 8: Conductor API client

**Files:**
- Create: `src/lib/conductorApi.js`
- Create: `src/lib/__tests__/conductorApi.test.js`

- [ ] **Step 1: Write failing tests**

```js
// src/lib/__tests__/conductorApi.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createConductorSession, fetchConductorStatus,
  startBroadcast, setCurrentSong, stopBroadcast,
  joinBroadcast, sendFollowerHeartbeat, leaveBroadcast,
} from '../conductorApi.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockOk(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
}
function mockStatus(status, body) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

beforeEach(() => { mockFetch.mockReset(); import.meta.env.VITE_WORKER_URL = 'https://worker.test' })

describe('fetchConductorStatus', () => {
  it('calls GET /conductor/:code/status and returns data', async () => {
    mockFetch.mockReturnValue(mockOk({ live: true, currentSbpId: 42, version: 3, followerCount: 2 }))
    const result = await fetchConductorStatus('ABC123')
    expect(mockFetch).toHaveBeenCalledWith('https://worker.test/conductor/ABC123/status')
    expect(result.live).toBe(true)
    expect(result.currentSbpId).toBe(42)
  })

  it('throws with code not_found on 404', async () => {
    mockFetch.mockReturnValue(mockStatus(404, {}))
    await expect(fetchConductorStatus('XXXXXX')).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('joinBroadcast', () => {
  it('throws with code full on 403', async () => {
    mockFetch.mockReturnValue(mockStatus(403, { error: 'full' }))
    await expect(joinBroadcast('ABC123', 'client-a')).rejects.toMatchObject({ code: 'full' })
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- src/lib/__tests__/conductorApi.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create conductorApi.js**

```js
// src/lib/conductorApi.js
const WORKER_URL = import.meta.env.VITE_WORKER_URL

export async function createConductorSession({ conductorCode, directorToken, maxFollowers }) {
  const res = await fetch(`${WORKER_URL}/conductor/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conductorCode, directorToken, maxFollowers }),
  })
  if (!res.ok) throw Object.assign(new Error('create_failed'), { code: 'create_failed' })
  return res.json()
}

export async function fetchConductorStatus(code) {
  const res = await fetch(`${WORKER_URL}/conductor/${code}/status`)
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' })
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' })
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' })
  return res.json()
}

export async function startBroadcast(code, directorToken) {
  const res = await fetch(`${WORKER_URL}/conductor/${code}/start`, {
    method: 'POST',
    headers: { 'X-Director-Token': directorToken },
  })
  if (res.status === 403) throw Object.assign(new Error('forbidden'), { code: 'forbidden' })
  if (!res.ok) throw Object.assign(new Error('start_failed'), { code: 'start_failed' })
  return res.json()
}

export async function setCurrentSong(code, sbpId, directorToken) {
  const res = await fetch(`${WORKER_URL}/conductor/${code}/current`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Director-Token': directorToken },
    body: JSON.stringify({ sbpId }),
  })
  if (!res.ok) throw Object.assign(new Error('current_failed'), { code: 'current_failed' })
  return res.json()
}

export async function stopBroadcast(code, directorToken) {
  const res = await fetch(`${WORKER_URL}/conductor/${code}/stop`, {
    method: 'POST',
    headers: { 'X-Director-Token': directorToken },
  })
  if (!res.ok) throw Object.assign(new Error('stop_failed'), { code: 'stop_failed' })
  return res.json()
}

export async function joinBroadcast(code, clientId) {
  const res = await fetch(`${WORKER_URL}/conductor/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
  if (res.status === 403) throw Object.assign(new Error('full'), { code: 'full' })
  if (!res.ok) throw Object.assign(new Error('join_failed'), { code: 'join_failed' })
  return res.json()
}

export async function sendFollowerHeartbeat(code, clientId) {
  const res = await fetch(`${WORKER_URL}/conductor/${code}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
  if (!res.ok) throw Object.assign(new Error('heartbeat_failed'), { code: 'heartbeat_failed' })
  return res.json()
}

export async function leaveBroadcast(code, clientId) {
  await fetch(`${WORKER_URL}/conductor/${code}/join`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- src/lib/__tests__/conductorApi.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/conductorApi.js src/lib/__tests__/conductorApi.test.js
git commit -m "feat(conductor): HTTP API client"
```

---

## Task 9: libraryStore — updateCollection action

**Files:**
- Modify: `src/store/libraryStore.js`
- Test: `src/store/__tests__/libraryStore.collections.test.js`

- [ ] **Step 1: Write failing test**

Append to `src/store/__tests__/libraryStore.collections.test.js`:

```js
describe('updateCollection', () => {
  it('merges fields into an existing collection and persists', () => {
    const { addSongs, updateCollection } = useLibraryStore.getState()
    addSongs(
      [{ meta: { title: 'Song A', artist: '', keyIndex: 0, usesFlats: false }, rawText: '' }],
      'My Collection',
    )
    const { collectionId } = useLibraryStore.getState().collections.reduce(
      (acc, c) => c.name === 'My Collection' ? { collectionId: c.id } : acc, {}
    )
    updateCollection(collectionId, { conductorCode: 'XXYYZZ' })
    const col = useLibraryStore.getState().collections.find(c => c.id === collectionId)
    expect(col.conductorCode).toBe('XXYYZZ')
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm test -- src/store/__tests__/libraryStore.collections.test.js
```

Expected: FAIL — `updateCollection` is not a function.

- [ ] **Step 3: Add updateCollection to libraryStore.js**

Find the end of the store object (before the closing `})`), and add:

```js
  updateCollection(collectionId, updates) {
    const collections = get().collections.map(c =>
      c.id === collectionId ? { ...c, ...updates } : c
    )
    saveCollections(collections)
    set({ collections })
  },
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- src/store/__tests__/libraryStore.collections.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/libraryStore.js
git commit -m "feat(conductor): updateCollection action in libraryStore"
```

---

## Task 10: App.jsx — conductor wiring on share import

**Files:**
- Modify: `src/App.jsx`

Wire up: (a) read `conductorCode` from parsed share; (b) read `?director=` param; (c) after import, call `updateCollection` with conductor fields; (d) add `VITE_CONDUCTOR_MAX_FOLLOWERS` env var.

- [ ] **Step 1: Add VITE_CONDUCTOR_MAX_FOLLOWERS to .env.local**

In the project root, open `.env.local` (or create it if absent) and add:

```
VITE_CONDUCTOR_MAX_FOLLOWERS=20
```

This must match `CONDUCTOR.MAX_FOLLOWERS` in `songbook-worker/src/config.ts`.

- [ ] **Step 2: Add updateCollection to App.jsx imports and store bindings**

At the top of `App.jsx`, update the libraryStore imports:

```js
const updateCollection = useLibraryStore(state => state.updateCollection)
```

Add this line alongside the existing `addSongs`, `setViewMode`, etc. bindings.

- [ ] **Step 3: Capture directorToken from URL at mount**

Inside the `useEffect` that reads URL params, after reading `shareCode`, add:

```js
const directorToken = params.get('director') || null
// Store in a ref so it's available when handleShareImport runs
directorTokenRef.current = directorToken
```

Add the ref declaration near the top of the component (after the existing `useRef` calls):

```js
const directorTokenRef = useRef(null)
```

- [ ] **Step 4: Update handleShareImport to write conductor fields**

Replace the existing `handleShareImport` function:

```js
  function handleShareImport() {
    if (shareSongs) {
      const name = shareSongs.collectionName || 'Shared Songs'
      const { newSongIds, collectionId } = addSongs(shareSongs.songs, name)
      const count = shareSongs.songs.length
      addToast(`${count} song${count !== 1 ? 's' : ''} imported.`, 'success')
      if (shareSongs.lyricsOnly) setSessionLyricsOnly(true)
      if (collectionId && shareSongs.conductorCode) {
        const updates = { conductorCode: shareSongs.conductorCode }
        if (directorTokenRef.current) {
          updates.conductorDirectorToken = directorTokenRef.current
          directorTokenRef.current = null
        }
        updateCollection(collectionId, updates)
      }
      setSidebarOpen(true)
      if (newSongIds.length > 0) {
        setViewMode('collections')
        setExpandedCollectionId(collectionId)
        selectSong(newSongIds[0])
      }
    }
    setShareSongs(null)
    clearShareParam()
  }
```

- [ ] **Step 5: Clear ?director= from URL in clearShareParam**

```js
  function clearShareParam() {
    const url = new URL(window.location.href)
    url.searchParams.delete('share')
    url.searchParams.delete('director')
    window.history.replaceState({}, '', url.toString())
  }
```

- [ ] **Step 6: Smoke test manually**

```bash
npm run dev
```

Open the app, import an `.sbp` file normally. Confirm no errors in the console and existing import flow works.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx .env.local
git commit -m "feat(conductor): wire conductorCode + directorToken into collection on share import"
```

---

## Task 11: useConductorSync hook

**Files:**
- Create: `src/hooks/useConductorSync.js`
- Create: `src/hooks/__tests__/useConductorSync.test.js`

- [ ] **Step 1: Write failing tests**

```js
// src/hooks/__tests__/useConductorSync.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConductorSync } from '../useConductorSync.js'

vi.mock('../../lib/conductorApi.js', () => ({
  fetchConductorStatus: vi.fn(),
  startBroadcast: vi.fn(),
  setCurrentSong: vi.fn(),
  stopBroadcast: vi.fn(),
  joinBroadcast: vi.fn(),
  sendFollowerHeartbeat: vi.fn(),
  leaveBroadcast: vi.fn(),
}))

vi.mock('../../store/libraryStore.js', () => ({
  useLibraryStore: (selector) => selector({
    index: [{ id: 'song-1', title: 'Song One', sbpId: 42 }],
    selectSong: vi.fn(),
  }),
}))

import * as api from '../../lib/conductorApi.js'

beforeEach(() => {
  vi.useFakeTimers()
  api.fetchConductorStatus.mockResolvedValue({ live: false, currentSbpId: null, version: 0, followerCount: 0 })
})
afterEach(() => { vi.useRealTimers() })

describe('useConductorSync', () => {
  it('polls fetchConductorStatus every second when conductorCode is set', async () => {
    renderHook(() => useConductorSync({
      conductorCode: 'ABC123',
      directorToken: null,
      activeSongSbpId: null,
      onAddToast: vi.fn(),
    }))
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(api.fetchConductorStatus).toHaveBeenCalledWith('ABC123')
    expect(api.fetchConductorStatus.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('does not poll when conductorCode is null', async () => {
    renderHook(() => useConductorSync({
      conductorCode: null,
      directorToken: null,
      activeSongSbpId: null,
      onAddToast: vi.fn(),
    }))
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(api.fetchConductorStatus).not.toHaveBeenCalled()
  })

  it('exposes live:true when status returns live', async () => {
    api.fetchConductorStatus.mockResolvedValue({ live: true, currentSbpId: null, version: 1, followerCount: 0 })
    const { result } = renderHook(() => useConductorSync({
      conductorCode: 'ABC123', directorToken: null, activeSongSbpId: null, onAddToast: vi.fn(),
    }))
    await act(async () => { vi.advanceTimersByTime(1100) })
    expect(result.current.live).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- src/hooks/__tests__/useConductorSync.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create useConductorSync.js**

```js
// src/hooks/useConductorSync.js
import { useState, useEffect, useRef, useCallback } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import {
  fetchConductorStatus, startBroadcast, setCurrentSong,
  stopBroadcast, joinBroadcast, sendFollowerHeartbeat, leaveBroadcast,
} from '../lib/conductorApi'

function getClientId() {
  let id = sessionStorage.getItem('conductor_client_id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('conductor_client_id', id)
  }
  return id
}

export function useConductorSync({ conductorCode, directorToken, activeSongSbpId, onAddToast }) {
  const index = useLibraryStore(s => s.index)
  const selectSong = useLibraryStore(s => s.selectSong)

  const [live, setLive] = useState(false)
  const [currentSbpId, setCurrentSbpId] = useState(null)
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isBroadcasting, setIsBroadcasting] = useState(false)

  const isDirector = !!directorToken
  const pollRef = useRef(null)
  const heartbeatRef = useRef(null)
  const prevSbpIdRef = useRef(null)

  const poll = useCallback(async () => {
    if (!conductorCode) return
    try {
      const status = await fetchConductorStatus(conductorCode)
      setLive(status.live)
      setFollowerCount(status.followerCount)
      if (status.currentSbpId !== prevSbpIdRef.current) {
        prevSbpIdRef.current = status.currentSbpId
        setCurrentSbpId(status.currentSbpId)
      }
      if (!status.live) setIsFollowing(false)
    } catch {
      // Network errors silently skipped
    }
  }, [conductorCode])

  // 1-second poll
  useEffect(() => {
    if (!conductorCode) return
    poll()
    function startPolling() { pollRef.current = setInterval(poll, 1000) }
    startPolling()
    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        clearInterval(pollRef.current)
      } else {
        poll()
        startPolling()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(pollRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [conductorCode, poll])

  // Director: broadcast song when activeSongSbpId changes
  useEffect(() => {
    if (!isDirector || !isBroadcasting || !activeSongSbpId || !conductorCode) return
    setCurrentSong(conductorCode, activeSongSbpId, directorToken).catch(() => {})
  }, [activeSongSbpId, isDirector, isBroadcasting, conductorCode, directorToken])

  // Follower: navigate when currentSbpId changes
  useEffect(() => {
    if (!isFollowing || currentSbpId == null) return
    const entry = index.find(e => e.sbpId === currentSbpId)
    if (entry) {
      selectSong(entry.id)
    } else {
      onAddToast?.("Director switched to a song not in your library", 'info')
    }
  }, [currentSbpId, isFollowing]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStartBroadcast() {
    if (!conductorCode || !directorToken) return
    try {
      await startBroadcast(conductorCode, directorToken)
      setIsBroadcasting(true)
      setLive(true)
      // Broadcast immediately if already on a song
      if (activeSongSbpId) {
        await setCurrentSong(conductorCode, activeSongSbpId, directorToken)
      }
    } catch { /* ignore */ }
  }

  async function handleStopBroadcast() {
    if (!conductorCode || !directorToken) return
    try {
      await stopBroadcast(conductorCode, directorToken)
      setIsBroadcasting(false)
      setLive(false)
    } catch { /* ignore */ }
  }

  async function handleFollowDirector() {
    if (!conductorCode) return
    const clientId = getClientId()
    try {
      await joinBroadcast(conductorCode, clientId)
      setIsFollowing(true)
      // Navigate immediately to current song
      if (currentSbpId != null) {
        const entry = index.find(e => e.sbpId === currentSbpId)
        if (entry) selectSong(entry.id)
      }
      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        sendFollowerHeartbeat(conductorCode, clientId).catch(() => {})
      }, 60_000)
    } catch (err) {
      if (err.code === 'full') {
        onAddToast?.("Broadcast is full — try again later", 'error')
      }
    }
  }

  async function handleStopFollowing() {
    if (!conductorCode) return
    const clientId = getClientId()
    clearInterval(heartbeatRef.current)
    heartbeatRef.current = null
    setIsFollowing(false)
    leaveBroadcast(conductorCode, clientId).catch(() => {})
  }

  return {
    live,
    currentSbpId,
    followerCount,
    isFollowing,
    isBroadcasting,
    isDirector,
    startBroadcast: handleStartBroadcast,
    stopBroadcast: handleStopBroadcast,
    followDirector: handleFollowDirector,
    stopFollowing: handleStopFollowing,
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- src/hooks/__tests__/useConductorSync.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useConductorSync.js src/hooks/__tests__/useConductorSync.test.js
git commit -m "feat(conductor): useConductorSync hook — poll, broadcast, follow"
```

---

## Task 12: ConductorBar component + wired into App.jsx header

**Files:**
- Create: `src/components/Conductor/ConductorBar.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create ConductorBar.jsx**

```jsx
// src/components/Conductor/ConductorBar.jsx
export function ConductorBar({ sync }) {
  const { live, isDirector, isFollowing, isBroadcasting, followerCount,
          startBroadcast, stopBroadcast, followDirector, stopFollowing } = sync

  if (isDirector) {
    if (!isBroadcasting) {
      return (
        <button
          onClick={startBroadcast}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
            bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300
            hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
          aria-label="Start conductor broadcast"
        >
          ▶ Start Broadcast
        </button>
      )
    }
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Broadcasting · {followerCount} following
        </span>
        <button
          onClick={stopBroadcast}
          className="px-2 py-1 rounded text-xs font-medium
            bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300
            hover:bg-red-200 dark:hover:bg-red-800/40 transition-colors"
          aria-label="Stop broadcast"
        >
          Stop
        </button>
      </div>
    )
  }

  // Follower
  if (!live) return null

  if (!isFollowing) {
    return (
      <button
        onClick={followDirector}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
          bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300
          hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors
          animate-[fadeIn_0.3s_ease-in]"
        aria-label="Follow director"
      >
        Follow Director
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        Following
      </span>
      <button
        onClick={stopFollowing}
        className="px-2 py-1 rounded text-xs font-medium
          bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300
          hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        aria-label="Stop following"
      >
        Stop
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Mount useConductorSync and ConductorBar in App.jsx**

Add imports at top of `src/App.jsx`:
```js
import { useConductorSync } from './hooks/useConductorSync'
import { ConductorBar } from './components/Conductor/ConductorBar'
```

Add store bindings inside `App()`:
```js
const collections = useLibraryStore(s => s.collections)
const activeSong = useLibraryStore(s => s.activeSong)
```

Add the hook call (after the existing hook calls):
```js
  const conductorCollection = collections.find(c => c.conductorCode) ?? null
  const conductorSync = useConductorSync({
    conductorCode: conductorCollection?.conductorCode ?? null,
    directorToken: conductorCollection?.conductorDirectorToken ?? null,
    activeSongSbpId: activeSong?.meta?.sbpId ?? null,
    onAddToast: addToast,
  })
```

Add `<ConductorBar>` inside the top nav header `<div className="flex items-center gap-1">`:
```jsx
          <ConductorBar sync={conductorSync} />
```

Place it before the help link `<a>` tag.

- [ ] **Step 3: Run full test suite to check for regressions**

```bash
npm test
```

Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/Conductor/ConductorBar.jsx src/App.jsx
git commit -m "feat(conductor): ConductorBar component + wired into App header"
```

---

## Task 13: Share modal — conductor idle step

**Files:**
- Modify: `src/components/Share/ShareModal.jsx`
- Create: `src/components/Share/__tests__/ShareModal.conductor.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// src/components/Share/__tests__/ShareModal.conductor.test.jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ShareModal } from '../ShareModal.jsx'

const songs = [{ id: 's1', meta: { title: 'Song A' }, rawText: '' }]

describe('ShareModal conductor section', () => {
  it('shows Enable Conductor Broadcast toggle in idle step', () => {
    render(<ShareModal isOpen songs={songs} collectionName="Test" onClose={vi.fn()} />)
    expect(screen.getByLabelText(/enable conductor broadcast/i)).toBeInTheDocument()
  })

  it('hides max followers input when toggle is off', () => {
    render(<ShareModal isOpen songs={songs} collectionName="Test" onClose={vi.fn()} />)
    expect(screen.queryByLabelText(/max followers/i)).not.toBeInTheDocument()
  })

  it('shows max followers input when toggle is on', () => {
    render(<ShareModal isOpen songs={songs} collectionName="Test" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/enable conductor broadcast/i))
    expect(screen.getByLabelText(/max followers/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- src/components/Share/__tests__/ShareModal.conductor.test.jsx
```

Expected: FAIL — conductor toggle not in DOM.

- [ ] **Step 3: Add conductor state and idle-step UI to ShareModal.jsx**

At the top of the `ShareModal` component function, add state:

```js
  const [conductorEnabled, setConductorEnabled] = useState(false)
  const maxCap = Number(import.meta.env.VITE_CONDUCTOR_MAX_FOLLOWERS ?? 20)
  const [maxFollowers, setMaxFollowers] = useState(maxCap)
```

In the idle step JSX, after the "Share lyrics only" toggle block and before the action buttons, add:

```jsx
          {/* Conductor broadcast section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <button
              type="button"
              role="switch"
              aria-checked={conductorEnabled}
              aria-label="Enable Conductor Broadcast"
              onClick={() => setConductorEnabled(v => !v)}
              className="flex items-center gap-3 w-full text-left"
            >
              <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                transition-colors duration-200
                ${conductorEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                  ${conductorEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Enable Conductor Broadcast</span>
            </button>
            {conductorEnabled && (
              <div className="mt-3 flex items-center gap-3">
                <label className="text-sm text-gray-600 dark:text-gray-400 shrink-0" htmlFor="maxFollowers">
                  Max followers
                </label>
                <input
                  id="maxFollowers"
                  type="number"
                  min={1}
                  max={maxCap}
                  value={maxFollowers}
                  onChange={e => setMaxFollowers(Math.min(Number(e.target.value), maxCap))}
                  className="w-20 rounded-lg border border-gray-300 dark:border-gray-600
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
                  aria-label="Max followers"
                />
                <span className="text-xs text-gray-400">(max: {maxCap})</span>
              </div>
            )}
          </div>
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- src/components/Share/__tests__/ShareModal.conductor.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Share/ShareModal.jsx src/components/Share/__tests__/ShareModal.conductor.test.jsx
git commit -m "feat(conductor): conductor toggle + max followers in Share modal idle step"
```

---

## Task 14: Share modal — done step with two QR codes

**Files:**
- Modify: `src/components/Share/ShareModal.jsx`

This task wires the conductor creation call and renders the director link + second QR code.

- [ ] **Step 1: Write a failing test**

Append to `src/components/Share/__tests__/ShareModal.conductor.test.jsx`:

```jsx
import { vi } from 'vitest'
vi.mock('../../../lib/shareApi.js', () => ({
  uploadShare: vi.fn().mockResolvedValue({ shareUrl: 'https://app/?share=XYZ', expiresAt: new Date(Date.now() + 86400000).toISOString() }),
}))
vi.mock('../../../lib/conductorApi.js', () => ({
  createConductorSession: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('../../../lib/exportSbp.js', () => ({
  exportSongsAsSbp: vi.fn().mockResolvedValue(new Blob()),
}))

it('shows director link in done step when conductor is enabled', async () => {
  const { user } = render(<ShareModal isOpen songs={songs} collectionName="Test" onClose={vi.fn()} />)
  // Enable conductor
  fireEvent.click(screen.getByLabelText(/enable conductor broadcast/i))
  // Click Create link
  fireEvent.click(screen.getByText(/create link/i))
  // Wait for done step
  await screen.findByText(/director link/i)
  expect(screen.getByText(/keep private/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm test -- src/components/Share/__tests__/ShareModal.conductor.test.jsx
```

Expected: FAIL — "director link" not found.

- [ ] **Step 3: Update handleCreateLink to generate conductor data and call createConductorSession**

At the top of `ShareModal`, add imports:
```js
import { createConductorSession } from '../../lib/conductorApi'
import { v4 as uuidv4 } from 'uuid'
```

Add state for conductor result:
```js
  const [conductorData, setConductorData] = useState(null) // { conductorCode, directorToken, directorUrl }
  const directorQrRef = useRef(null)
```

Replace `handleCreateLink`:

```js
  async function handleCreateLink() {
    setStep('uploading')
    try {
      let conductorCode = null
      let directorToken = null

      if (conductorEnabled) {
        conductorCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
        directorToken = uuidv4()
      }

      const blob = await exportSongsAsSbp(songs, nameValue.trim() || null, shareLyricsOnly, conductorCode)
      const result = await uploadShare(blob, expiresInDays)

      if (conductorEnabled) {
        await createConductorSession({ conductorCode, directorToken, maxFollowers })
        const directorUrl = `${result.shareUrl}&director=${directorToken}`
        setConductorData({ conductorCode, directorToken, directorUrl, memberUrl: result.shareUrl })
      }

      setShareUrl(result.shareUrl)
      setExpiresAt(result.expiresAt)
      setStep('done')
    } catch {
      setStep('error')
    }
  }
```

- [ ] **Step 4: Update the done step to show two QR codes when conductorData is set**

In the done step JSX, replace the existing single-link block with:

```jsx
      {step === 'done' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Link expires {new Date(expiresAt).toLocaleDateString()}.
          </p>

          {/* Member link */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Member link</p>
            <div className="flex gap-2">
              <input readOnly value={shareUrl}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm" />
              <Button variant="secondary" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
            <div className="flex flex-col items-center gap-2 mt-2">
              <canvas ref={qrCanvasRef} className="rounded-lg border border-gray-200 dark:border-gray-700" />
              <Button variant="secondary" onClick={() => handleDownloadQr(qrCanvasRef, 'member-qr.png')}>Save Member QR</Button>
            </div>
          </div>

          {/* Director link — only when conductor enabled */}
          {conductorData && (
            <div className="border-t border-orange-200 dark:border-orange-800 pt-3">
              <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">
                Director link &nbsp;⚠ Keep private — gives broadcast control
              </p>
              <div className="flex gap-2">
                <input readOnly value={conductorData.directorUrl}
                  className="flex-1 rounded-lg border border-orange-300 dark:border-orange-700 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm" />
                <Button variant="secondary" onClick={() => {
                  navigator.clipboard.writeText(conductorData.directorUrl).catch(() => {})
                }}>Copy</Button>
              </div>
              <div className="flex flex-col items-center gap-2 mt-2">
                <canvas ref={directorQrRef} className="rounded-lg border border-orange-200 dark:border-orange-700" />
                <Button variant="secondary" onClick={() => handleDownloadQr(directorQrRef, 'director-qr.png')}>Save Director QR</Button>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Update handleDownloadQr to accept a ref and filename**

Replace the existing `handleDownloadQr` function signature (it was hardcoded to `qrCanvasRef`):

```js
  function handleDownloadQr(ref, filename = 'share-qr.png') {
    const qr = ref.current
    if (!qr) return
    const name = nameValue.trim()
    const expiry = `Expires ${new Date(expiresAt).toLocaleDateString()}`
    const padding = 16
    const lineHeight = 20
    const textLines = name ? [name, expiry] : [expiry]
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
    a.download = filename
    a.click()
  }
```

- [ ] **Step 6: Render director QR code in useEffect**

Update the existing QR useEffect to also render the director QR:

```js
  useEffect(() => {
    if (step === 'done' && shareUrl && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, shareUrl, { width: 220, margin: 2 })
    }
    if (step === 'done' && conductorData?.directorUrl && directorQrRef.current) {
      QRCode.toCanvas(directorQrRef.current, conductorData.directorUrl, { width: 220, margin: 2 })
    }
  }, [step, shareUrl, conductorData])
```

- [ ] **Step 7: Reset conductor state in handleClose**

Add to `handleClose`:
```js
    setConductorEnabled(false)
    setMaxFollowers(maxCap)
    setConductorData(null)
```

- [ ] **Step 8: Run all tests — expect pass**

```bash
npm test
```

Expected: all tests green.

- [ ] **Step 9: Commit**

```bash
git add src/components/Share/ShareModal.jsx src/components/Share/__tests__/ShareModal.conductor.test.jsx
git commit -m "feat(conductor): Share modal done step — director link + two QR codes"
```

---

## Self-Review Checklist (do not skip)

After writing the plan, verify against the spec:

- [x] `CONDUCTOR.MAX_FOLLOWERS` hard ceiling enforced backend (Task 3) and capped in UI (Task 13)
- [x] `conductorCode` pre-generated client-side and embedded in SBP zip (Task 14) — never `directorToken`
- [x] `directorToken` travels in URL param only (Task 14), stored in collection after import (Task 10)
- [x] `sbpId` added to parser meta (Task 6) and index (Task 6)
- [x] 1-second poll with visibility-change pause (Task 11)
- [x] Director broadcasts on every song tap (Task 11 — `activeSongSbpId` effect)
- [x] "Follow Director" button only appears when `live: true` (Task 12 — `if (!live) return null`)
- [x] Follower immediately jumps to `currentSbpId` on opt-in (Task 11 — `handleFollowDirector`)
- [x] Hard cap with 403 → "Broadcast is full" toast (Tasks 5 + 11)
- [x] 60-second heartbeat while following (Task 11)
- [x] `leaveBroadcast` called on "Stop Following" and on page unmount (Task 11 — `handleStopFollowing`)
- [x] Two QR codes in done step (Task 14)
- [x] Director QR labelled "Keep private" (Task 14)
- [x] Config file in `songbook-worker/src/config.ts` (Task 1)
- [x] `VITE_CONDUCTOR_MAX_FOLLOWERS` env var in `.env.local` (Task 10)
- [x] `updateCollection` action in libraryStore (Task 9)
- [x] `conductorCode` + `conductorDirectorToken` written to collection after import (Task 10)
