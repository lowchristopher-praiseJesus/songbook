# Collaborative Live Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time collaborative set-list editing with polling sync, edit locking, and per-member library import for worship teams.

**Architecture:** A new Cloudflare KV namespace stores one JSON session object per session (code, setList, songs, editLocks, version). The existing Worker gains six new session endpoints; the React SPA polls for state every 4 s, submits ops on every mutation, and acquires/releases edit locks around song editing. Songs stay in KV only until a member explicitly saves them to their local library.

**Tech Stack:** Cloudflare Worker (Hono, TypeScript), Cloudflare KV, @cloudflare/vitest-pool-workers, React 18, Zustand, @dnd-kit/sortable, Tailwind CSS, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-04-15-collaborative-sessions-design.md`

---

## File Map

### Worker (new / changed)
| File | Role |
|---|---|
| `songbook-worker/wrangler.toml` | Add `SESSION_KV` KV namespace binding |
| `songbook-worker/vitest.config.ts` | Add `SESSION_KV` to miniflare bindings |
| `songbook-worker/src/types.ts` | Add `SESSION_KV: KVNamespace` to `Env` |
| `songbook-worker/src/lib/session.ts` | `SessionData` types, KV read/write helpers, op logic |
| `songbook-worker/src/routes/session.ts` | All 6 session endpoints (Hono router) |
| `songbook-worker/src/routes/session.test.ts` | Integration tests via `SELF.fetch()` |
| `songbook-worker/src/index.ts` | Mount session router + add DELETE + X-Leader-Token to CORS |

### Frontend (new / changed)
| File | Role |
|---|---|
| `src/lib/sessionApi.js` | All Worker session API calls (mirrors shareApi.js pattern) |
| `src/store/sessionStore.js` | Zustand store: code, leaderToken, version, setList, songs, editLocks |
| `src/hooks/useSessionSync.js` | 4 s polling loop, visibility-pause, heartbeat helpers |
| `src/components/Session/CreateSessionModal.jsx` | Two-step: name input → show leader+member links |
| `src/components/Session/SessionView.jsx` | Main collaborative view: set list, DnD reorder, lock indicators |
| `src/components/Session/EditLockWarning.jsx` | Lock-expiry recovery dialog (no-conflict + conflict variants) |
| `src/components/Sidebar/Sidebar.jsx` | Add "Start Live Session" to existing choice modal |
| `src/App.jsx` | Detect `?session=` + `?token=` URL params on mount |

---

## Task 1: Worker — KV namespace + CORS + types

**Files:**
- Modify: `songbook-worker/wrangler.toml`
- Modify: `songbook-worker/vitest.config.ts`
- Modify: `songbook-worker/src/types.ts`
- Modify: `songbook-worker/src/index.ts`

- [ ] **Step 1: Add KV binding to wrangler.toml**

Append to `songbook-worker/wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "SESSION_KV"
id = "placeholder-replace-with-real-id"
preview_id = "placeholder-replace-with-preview-id"
```
> Note: Replace placeholder IDs with real IDs after running `wrangler kv namespace create SESSION_KV` and `wrangler kv namespace create SESSION_KV --preview` in production setup.

- [ ] **Step 2: Add SESSION_KV to vitest miniflare bindings**

In `songbook-worker/vitest.config.ts`, add `kvNamespaces: ['SESSION_KV']` to the workers config:

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: { APP_ORIGIN: 'http://localhost:5173' },
          kvNamespaces: ['SESSION_KV'],
        },
      },
    },
  },
});
```

- [ ] **Step 3: Add SESSION_KV to Env type**

Replace the entire contents of `songbook-worker/src/types.ts`:

```ts
export interface Env {
  R2_BUCKET: R2Bucket;
  SESSION_KV: KVNamespace;
  APP_ORIGIN: string;
  WALKIE_ORIGIN: string;
}
```

- [ ] **Step 4: Update CORS middleware in index.ts to allow DELETE and X-Leader-Token**

Replace the CORS `OPTIONS` response headers in `songbook-worker/src/index.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from './types';
import share from './routes/share';
import walkieShare from './routes/walkieShare';
import session from './routes/session';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const requestOrigin = c.req.header('Origin') ?? '';
  const appOrigin = c.env.APP_ORIGIN ?? '';
  const walkieOrigin = c.env.WALKIE_ORIGIN ?? '';
  const allowed =
    (appOrigin && requestOrigin === appOrigin) ||
    (walkieOrigin && requestOrigin === walkieOrigin);

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed ? requestOrigin : '',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In-Days, X-Leader-Token',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  if (allowed) {
    c.res.headers.set('Access-Control-Allow-Origin', requestOrigin);
    c.res.headers.set('Vary', 'Origin');
  }
});

app.get('/health', (c) => c.json({ ok: true }));
app.route('/share', share);
app.route('/walkie-shares', walkieShare);
app.route('/session', session);

export default app;
```

- [ ] **Step 5: Verify types check**

```bash
cd songbook-worker && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/wrangler.toml songbook-worker/vitest.config.ts songbook-worker/src/types.ts songbook-worker/src/index.ts
git commit -m "feat(worker): add SESSION_KV binding, update CORS for DELETE + X-Leader-Token"
```

---

## Task 2: Worker — session lib (types + KV helpers)

**Files:**
- Create: `songbook-worker/src/lib/session.ts`

- [ ] **Step 1: Create session.ts with all types and helpers**

Create `songbook-worker/src/lib/session.ts`:

```ts
export interface SongMeta {
  title: string;
  artist?: string;
  keyIndex: number;
  usesFlats: boolean;
  capo?: number;
  tempo?: number;
  timeSig?: string;
}

export interface SessionSong {
  meta: SongMeta;
  rawText: string;
}

export interface EditLock {
  clientId: string;
  lockedAt: string;
  expiresAt: string;
}

export interface SessionData {
  code: string;
  name: string;
  leaderToken: string;
  createdAt: string;
  expiresAt: string;
  closed: boolean;
  version: number;
  setList: string[];
  songs: Record<string, SessionSong>;
  editLocks: Record<string, EditLock>;
}

// 6-char code from unambiguous uppercase chars (no 0,O,I,1)
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateCode(): string {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => CHARSET[b % CHARSET.length]).join('');
}

export function kvKey(code: string): string {
  return `session:${code}`;
}

export async function getSession(
  kv: KVNamespace,
  code: string,
): Promise<SessionData | null> {
  const raw = await kv.get(kvKey(code));
  if (!raw) return null;
  return JSON.parse(raw) as SessionData;
}

export async function putSession(
  kv: KVNamespace,
  session: SessionData,
): Promise<void> {
  const expiresAt = new Date(session.expiresAt);
  const ttlSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  await kv.put(kvKey(session.code), JSON.stringify(session), {
    expirationTtl: ttlSeconds,
  });
}

/** Strip expired locks without writing back (lazy cleanup). */
export function stripExpiredLocks(session: SessionData): SessionData {
  const now = Date.now();
  const editLocks: Record<string, EditLock> = {};
  for (const [songId, lock] of Object.entries(session.editLocks)) {
    if (new Date(lock.expiresAt).getTime() > now) {
      editLocks[songId] = lock;
    }
  }
  return { ...session, editLocks };
}

/** Returns true if session is expired or closed. */
export function isSessionDead(session: SessionData): boolean {
  return session.closed || new Date(session.expiresAt).getTime() <= Date.now();
}

export type OpType = 'add_song' | 'remove_song' | 'move_song' | 'update_song';

export interface Op {
  type: OpType;
  songId: string;
  song?: SessionSong;
  afterSongId?: string | null;
}

/** Apply an op to session state, returns updated session with version+1. */
export function applyOp(session: SessionData, op: Op): SessionData {
  const songs = { ...session.songs };
  let setList = [...session.setList];

  switch (op.type) {
    case 'add_song': {
      if (!op.song) break;
      songs[op.songId] = op.song;
      if (!setList.includes(op.songId)) setList.push(op.songId);
      break;
    }
    case 'remove_song': {
      delete songs[op.songId];
      setList = setList.filter(id => id !== op.songId);
      break;
    }
    case 'move_song': {
      setList = setList.filter(id => id !== op.songId);
      if (op.afterSongId == null) {
        setList.unshift(op.songId);
      } else {
        const idx = setList.indexOf(op.afterSongId);
        setList.splice(idx + 1, 0, op.songId);
      }
      break;
    }
    case 'update_song': {
      if (!op.song || !songs[op.songId]) break;
      songs[op.songId] = op.song;
      break;
    }
  }

  return { ...session, songs, setList, version: session.version + 1 };
}
```

- [ ] **Step 2: Verify types**

```bash
cd songbook-worker && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add songbook-worker/src/lib/session.ts
git commit -m "feat(worker): add session types, KV helpers, and op apply logic"
```

---

## Task 3: Worker — session routes (all endpoints)

**Files:**
- Create: `songbook-worker/src/routes/session.ts`

- [ ] **Step 1: Write the failing test first**

Create `songbook-worker/src/routes/session.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';
const headers = { 'Content-Type': 'application/json', 'Origin': ORIGIN };

async function createSession(body = {}) {
  return SELF.fetch('http://localhost/session/create', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /session/create', () => {
  it('creates a session and returns code + urls', async () => {
    const res = await createSession({ name: 'Sunday Service' });
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, string>;
    expect(data.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(data.leaderToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.memberUrl).toContain('?session=');
    expect(data.leaderUrl).toContain('&token=');
    expect(data.expiresAt).toBeDefined();
  });

  it('seeds setList from songs array', async () => {
    const song = { id: 'song-1', meta: { title: 'Oceans', keyIndex: 9, usesFlats: false }, rawText: 'lyrics' };
    const res = await createSession({ name: 'Test', songs: [song] });
    const data = await res.json() as { code: string };

    const stateRes = await SELF.fetch(`http://localhost/session/${data.code}/state`, { headers: { Origin: ORIGIN } });
    const state = await stateRes.json() as { setList: string[]; songs: Record<string, unknown> };
    expect(state.setList).toContain('song-1');
    expect(state.songs['song-1']).toBeDefined();
  });

  it('defaults name to a date string when name is omitted', async () => {
    const res = await createSession({});
    const data = await res.json() as { code: string };
    const stateRes = await SELF.fetch(`http://localhost/session/${data.code}/state`, { headers: { Origin: ORIGIN } });
    const state = await stateRes.json() as { name: string };
    expect(state.name.length).toBeGreaterThan(0);
  });
});

describe('GET /session/:code/state', () => {
  it('returns 404 for unknown code', async () => {
    const res = await SELF.fetch('http://localhost/session/XXXXXX/state', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(404);
  });
});

describe('POST /session/:code/op', () => {
  it('add_song adds a song and increments version', async () => {
    const { code } = await (await createSession({ name: 'Test' })).json() as { code: string };
    const song = { id: 'song-a', meta: { title: 'El Shaddai', keyIndex: 3, usesFlats: true }, rawText: 'text' };

    const opRes = await SELF.fetch(`http://localhost/session/${code}/op`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'add_song', songId: 'song-a', song: song }),
    });
    expect(opRes.status).toBe(200);
    const { version } = await opRes.json() as { version: number };
    expect(version).toBe(1);

    const state = await (await SELF.fetch(`http://localhost/session/${code}/state`, { headers: { Origin: ORIGIN } })).json() as { setList: string[] };
    expect(state.setList).toContain('song-a');
  });

  it('remove_song removes a song idempotently', async () => {
    const song = { id: 'song-b', meta: { title: 'Test', keyIndex: 0, usesFlats: false }, rawText: '' };
    const { code } = await (await createSession({ name: 'Test', songs: [song] })).json() as { code: string };

    await SELF.fetch(`http://localhost/session/${code}/op`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'remove_song', songId: 'song-b' }),
    });
    // Remove again — should be no error
    const res2 = await SELF.fetch(`http://localhost/session/${code}/op`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'remove_song', songId: 'song-b' }),
    });
    expect(res2.status).toBe(200);

    const state = await (await SELF.fetch(`http://localhost/session/${code}/state`, { headers: { Origin: ORIGIN } })).json() as { setList: string[] };
    expect(state.setList).not.toContain('song-b');
  });

  it('move_song reorders setList', async () => {
    const songs = [
      { id: 'a', meta: { title: 'A', keyIndex: 0, usesFlats: false }, rawText: '' },
      { id: 'b', meta: { title: 'B', keyIndex: 0, usesFlats: false }, rawText: '' },
      { id: 'c', meta: { title: 'C', keyIndex: 0, usesFlats: false }, rawText: '' },
    ];
    const { code } = await (await createSession({ name: 'Test', songs })).json() as { code: string };

    // Move 'c' to after 'a' → order: a, c, b
    await SELF.fetch(`http://localhost/session/${code}/op`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'move_song', songId: 'c', afterSongId: 'a' }),
    });

    const state = await (await SELF.fetch(`http://localhost/session/${code}/state`, { headers: { Origin: ORIGIN } })).json() as { setList: string[] };
    expect(state.setList).toEqual(['a', 'c', 'b']);
  });
});

describe('Edit lock endpoints', () => {
  it('acquires and releases a lock', async () => {
    const { code } = await (await createSession({ name: 'T', songs: [{ id: 's1', meta: { title: 'X', keyIndex: 0, usesFlats: false }, rawText: '' }] })).json() as { code: string };

    const lockRes = await SELF.fetch(`http://localhost/session/${code}/lock/s1`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(lockRes.status).toBe(200);

    const releaseRes = await SELF.fetch(`http://localhost/session/${code}/lock/s1`, {
      method: 'DELETE', headers,
      body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(releaseRes.status).toBe(204);
  });

  it('returns 423 when another client holds the lock', async () => {
    const { code } = await (await createSession({ name: 'T', songs: [{ id: 's2', meta: { title: 'X', keyIndex: 0, usesFlats: false }, rawText: '' }] })).json() as { code: string };

    await SELF.fetch(`http://localhost/session/${code}/lock/s2`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-a' }),
    });

    const res = await SELF.fetch(`http://localhost/session/${code}/lock/s2`, {
      method: 'POST', headers,
      body: JSON.stringify({ clientId: 'client-b' }),
    });
    expect(res.status).toBe(423);
  });
});

describe('POST /session/:code/close', () => {
  it('closes session with valid leader token', async () => {
    const { code, leaderToken } = await (await createSession({ name: 'T' })).json() as { code: string; leaderToken: string };

    const res = await SELF.fetch(`http://localhost/session/${code}/close`, {
      method: 'POST',
      headers: { 'Origin': ORIGIN, 'X-Leader-Token': leaderToken },
    });
    expect(res.status).toBe(200);

    const stateRes = await SELF.fetch(`http://localhost/session/${code}/state`, { headers: { Origin: ORIGIN } });
    expect(stateRes.status).toBe(410);
  });

  it('returns 403 with wrong leader token', async () => {
    const { code } = await (await createSession({ name: 'T' })).json() as { code: string };
    const res = await SELF.fetch(`http://localhost/session/${code}/close`, {
      method: 'POST',
      headers: { 'Origin': ORIGIN, 'X-Leader-Token': 'wrong-token' },
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests — confirm they all fail**

```bash
cd songbook-worker && npm test
```
Expected: multiple failures (routes not defined yet).

- [ ] **Step 3: Implement session routes**

Create `songbook-worker/src/routes/session.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../types';
import {
  generateCode, getSession, putSession, stripExpiredLocks,
  isSessionDead, applyOp, SessionData, Op,
} from '../lib/session';

const session = new Hono<{ Bindings: Env }>();

// POST /session/create
session.post('/create', async (c) => {
  let body: { name?: string; songs?: Array<{ id: string; meta: unknown; rawText: string }> };
  try { body = await c.req.json(); } catch { body = {}; }

  const code = generateCode();
  const leaderToken = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const name = body.name?.trim() || now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const songs: SessionData['songs'] = {};
  const setList: string[] = [];

  if (Array.isArray(body.songs)) {
    for (const s of body.songs) {
      if (s.id && s.meta && typeof s.rawText === 'string') {
        songs[s.id] = { meta: s.meta as SessionData['songs'][string]['meta'], rawText: s.rawText };
        setList.push(s.id);
      }
    }
  }

  const data: SessionData = {
    code, name, leaderToken,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    closed: false, version: 0,
    setList, songs, editLocks: {},
  };

  await putSession(c.env.SESSION_KV, data);

  const appOrigin = c.env.APP_ORIGIN;
  return c.json({
    code, leaderToken,
    memberUrl: `${appOrigin}?session=${code}`,
    leaderUrl: `${appOrigin}?session=${code}&token=${leaderToken}`,
    expiresAt: expiresAt.toISOString(),
  });
});

// GET /session/:code/state
session.get('/:code/state', async (c) => {
  const code = c.req.param('code');
  const raw = await getSession(c.env.SESSION_KV, code);
  if (!raw) return c.json({ error: 'not_found' }, 404);
  if (isSessionDead(raw)) return c.json({ error: 'expired' }, 410);

  const clean = stripExpiredLocks(raw);
  const { leaderToken: _dropped, ...publicState } = clean;
  return c.json(publicState);
});

// POST /session/:code/op
session.post('/:code/op', async (c) => {
  const code = c.req.param('code');
  const session = await getSession(c.env.SESSION_KV, code);
  if (!session) return c.json({ error: 'not_found' }, 404);
  if (isSessionDead(session)) return c.json({ error: 'gone' }, 410);

  let op: Op;
  try { op = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }

  const updated = applyOp(session, op);
  await putSession(c.env.SESSION_KV, updated);
  return c.json({ version: updated.version });
});

// POST /session/:code/lock/:songId
session.post('/:code/lock/:songId', async (c) => {
  const code = c.req.param('code');
  const songId = c.req.param('songId');
  const { clientId } = await c.req.json() as { clientId: string };

  const session = await getSession(c.env.SESSION_KV, code);
  if (!session) return c.json({ error: 'not_found' }, 404);
  if (isSessionDead(session)) return c.json({ error: 'gone' }, 410);

  const existing = session.editLocks[songId];
  const now = Date.now();
  const lockExpiry = existing ? new Date(existing.expiresAt).getTime() : 0;
  const isHeldByOther = existing && lockExpiry > now && existing.clientId !== clientId;

  if (isHeldByOther) {
    return c.json({ error: 'locked', lockedUntil: existing.expiresAt }, 423);
  }

  const expiresAt = new Date(now + 2 * 60 * 1000).toISOString();
  const updated: SessionData = {
    ...session,
    editLocks: {
      ...session.editLocks,
      [songId]: { clientId, lockedAt: new Date(now).toISOString(), expiresAt },
    },
  };
  await putSession(c.env.SESSION_KV, updated);
  return c.json({ expiresAt });
});

// POST /session/:code/heartbeat/:songId
session.post('/:code/heartbeat/:songId', async (c) => {
  const code = c.req.param('code');
  const songId = c.req.param('songId');
  const { clientId } = await c.req.json() as { clientId: string };

  const session = await getSession(c.env.SESSION_KV, code);
  if (!session) return c.json({ error: 'not_found' }, 404);

  const lock = session.editLocks[songId];
  if (!lock || lock.clientId !== clientId) return c.json({ error: 'not_found' }, 404);

  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const updated: SessionData = {
    ...session,
    editLocks: { ...session.editLocks, [songId]: { ...lock, expiresAt } },
  };
  await putSession(c.env.SESSION_KV, updated);
  return c.json({ expiresAt });
});

// DELETE /session/:code/lock/:songId
session.delete('/:code/lock/:songId', async (c) => {
  const code = c.req.param('code');
  const songId = c.req.param('songId');
  const { clientId } = await c.req.json() as { clientId: string };

  const session = await getSession(c.env.SESSION_KV, code);
  if (!session) return new Response(null, { status: 204 });

  const lock = session.editLocks[songId];
  if (!lock || lock.clientId !== clientId) return new Response(null, { status: 204 });

  const editLocks = { ...session.editLocks };
  delete editLocks[songId];
  await putSession(c.env.SESSION_KV, { ...session, editLocks });
  return new Response(null, { status: 204 });
});

// POST /session/:code/close
session.post('/:code/close', async (c) => {
  const code = c.req.param('code');
  const token = c.req.header('X-Leader-Token');

  const session = await getSession(c.env.SESSION_KV, code);
  if (!session) return c.json({ error: 'not_found' }, 404);
  if (session.leaderToken !== token) return c.json({ error: 'forbidden' }, 403);

  await putSession(c.env.SESSION_KV, { ...session, closed: true });
  return c.json({ ok: true });
});

export default session;
```

- [ ] **Step 4: Run tests — confirm they all pass**

```bash
cd songbook-worker && npm test
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/lib/session.ts songbook-worker/src/routes/session.ts songbook-worker/src/routes/session.test.ts
git commit -m "feat(worker): add collaborative session endpoints with KV state, op log, edit locking"
```

---

## Task 4: Frontend — sessionApi.js

**Files:**
- Create: `src/lib/sessionApi.js`
- Create: `src/test/sessionApi.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/test/sessionApi.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.stubEnv('VITE_WORKER_URL', 'http://localhost:8787')
})

// Import after stubbing env so module reads the stubbed value
const { createSession, fetchSessionState, acquireLock } = await import('../lib/sessionApi')

function mockFetch(status, body) {
  global.fetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('createSession', () => {
  it('returns code and urls on success', async () => {
    mockFetch(200, { code: 'ABC123', leaderToken: 'tok', memberUrl: 'http://x?session=ABC123', leaderUrl: 'http://x?session=ABC123&token=tok', expiresAt: '...' })
    const result = await createSession({ name: 'Test' })
    expect(result.code).toBe('ABC123')
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/session/create'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws create_failed on non-ok response', async () => {
    mockFetch(500, {})
    await expect(createSession({})).rejects.toMatchObject({ code: 'create_failed' })
  })
})

describe('fetchSessionState', () => {
  it('returns state on success', async () => {
    mockFetch(200, { version: 3, setList: [] })
    const result = await fetchSessionState('ABC123')
    expect(result.version).toBe(3)
  })

  it('throws expired on 410', async () => {
    mockFetch(410, {})
    await expect(fetchSessionState('ABC123')).rejects.toMatchObject({ code: 'expired' })
  })

  it('throws not_found on 404', async () => {
    mockFetch(404, {})
    await expect(fetchSessionState('ABC123')).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('acquireLock', () => {
  it('throws locked with lockedUntil on 423', async () => {
    global.fetch.mockResolvedValue({
      ok: false, status: 423,
      json: () => Promise.resolve({ lockedUntil: '2026-04-20T10:00:00Z' }),
    })
    await expect(acquireLock('ABC123', 'song-1', 'client-a')).rejects.toMatchObject({
      code: 'locked',
      lockedUntil: '2026-04-20T10:00:00Z',
    })
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- src/test/sessionApi.test.js
```
Expected: FAIL — sessionApi not found.

- [ ] **Step 3: Implement sessionApi.js**

Create `src/lib/sessionApi.js`:

```js
const WORKER_URL = import.meta.env.VITE_WORKER_URL

export async function createSession({ name = '', songs = [] } = {}) {
  const res = await fetch(`${WORKER_URL}/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, songs }),
  })
  if (!res.ok) throw Object.assign(new Error('create_failed'), { code: 'create_failed' })
  return res.json()
}

export async function fetchSessionState(code) {
  const res = await fetch(`${WORKER_URL}/session/${code}/state`)
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' })
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' })
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' })
  return res.json()
}

export async function submitOp(code, op) {
  const res = await fetch(`${WORKER_URL}/session/${code}/op`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  })
  if (!res.ok) throw Object.assign(new Error('op_failed'), { code: 'op_failed' })
  return res.json()
}

export async function acquireLock(code, songId, clientId) {
  const res = await fetch(`${WORKER_URL}/session/${code}/lock/${songId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
  if (res.status === 423) {
    const data = await res.json()
    throw Object.assign(new Error('locked'), { code: 'locked', lockedUntil: data.lockedUntil })
  }
  if (!res.ok) throw Object.assign(new Error('lock_failed'), { code: 'lock_failed' })
  return res.json()
}

export async function sendHeartbeat(code, songId, clientId) {
  const res = await fetch(`${WORKER_URL}/session/${code}/heartbeat/${songId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' })
  if (!res.ok) throw Object.assign(new Error('heartbeat_failed'), { code: 'heartbeat_failed' })
  return res.json()
}

export async function releaseLock(code, songId, clientId) {
  await fetch(`${WORKER_URL}/session/${code}/lock/${songId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
}

export async function closeSession(code, leaderToken) {
  const res = await fetch(`${WORKER_URL}/session/${code}/close`, {
    method: 'POST',
    headers: { 'X-Leader-Token': leaderToken },
  })
  if (res.status === 403) throw Object.assign(new Error('forbidden'), { code: 'forbidden' })
  if (!res.ok) throw Object.assign(new Error('close_failed'), { code: 'close_failed' })
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- src/test/sessionApi.test.js
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessionApi.js src/test/sessionApi.test.js
git commit -m "feat: add sessionApi client for collaborative session Worker endpoints"
```

---

## Task 5: Frontend — sessionStore.js

**Files:**
- Create: `src/store/sessionStore.js`

- [ ] **Step 1: Create the Zustand session store**

Create `src/store/sessionStore.js`:

```js
import { create } from 'zustand'

export const useSessionStore = create((set, get) => ({
  // Session identity
  code: null,
  leaderToken: null,        // only present for the worship leader
  // Synced state from Worker
  name: '',
  version: -1,
  setList: [],              // ordered array of songIds
  songs: {},                // Record<songId, { meta, rawText }>
  editLocks: {},            // Record<songId, { clientId, expiresAt }>
  closed: false,
  expiresAt: null,
  // Local client identity
  clientId: null,           // UUID for this tab, used for lock ownership

  initClient(code, leaderToken) {
    // Generate or restore clientId from sessionStorage so refresh keeps the lock
    let clientId = sessionStorage.getItem('session_client_id')
    if (!clientId) {
      clientId = crypto.randomUUID()
      sessionStorage.setItem('session_client_id', clientId)
    }
    set({ code, leaderToken: leaderToken ?? null, clientId })
  },

  applyServerState(state) {
    set({
      name: state.name,
      version: state.version,
      setList: state.setList,
      songs: state.songs,
      editLocks: state.editLocks,
      closed: state.closed,
      expiresAt: state.expiresAt,
    })
  },

  clearSession() {
    sessionStorage.removeItem('session_client_id')
    set({
      code: null, leaderToken: null, name: '', version: -1,
      setList: [], songs: {}, editLocks: {}, closed: false,
      expiresAt: null, clientId: null,
    })
  },

  isLeader() {
    return !!get().leaderToken
  },

  isLocked(songId) {
    const lock = get().editLocks[songId]
    if (!lock) return false
    return new Date(lock.expiresAt).getTime() > Date.now()
  },

  isMyLock(songId) {
    const lock = get().editLocks[songId]
    if (!lock) return false
    return lock.clientId === get().clientId && new Date(lock.expiresAt).getTime() > Date.now()
  },
}))
```

- [ ] **Step 2: Verify the store imports correctly**

```bash
npm run build 2>&1 | head -20
```
Expected: build succeeds (no import errors).

- [ ] **Step 3: Commit**

```bash
git add src/store/sessionStore.js
git commit -m "feat: add sessionStore Zustand store for collaborative session state"
```

---

## Task 6: Frontend — useSessionSync hook

**Files:**
- Create: `src/hooks/useSessionSync.js`
- Create: `src/hooks/__tests__/useSessionSync.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useSessionSync.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionSync } from '../useSessionSync'
import * as sessionApi from '../../lib/sessionApi'

vi.mock('../../lib/sessionApi')
vi.mock('../../store/sessionStore', () => ({
  useSessionStore: vi.fn(sel => sel({
    applyServerState: vi.fn(),
    version: -1,
  })),
}))

beforeEach(() => {
  vi.useFakeTimers()
  sessionApi.fetchSessionState.mockResolvedValue({
    version: 1, name: 'Test', setList: [], songs: {}, editLocks: {}, closed: false,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useSessionSync', () => {
  it('polls on mount', async () => {
    const onEnded = vi.fn()
    renderHook(() => useSessionSync({ code: 'ABC123', onEnded }))
    await act(async () => { await Promise.resolve() })
    expect(sessionApi.fetchSessionState).toHaveBeenCalledWith('ABC123')
  })

  it('polls again after 4 s', async () => {
    renderHook(() => useSessionSync({ code: 'ABC123', onEnded: vi.fn() }))
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(4000); await Promise.resolve() })
    expect(sessionApi.fetchSessionState).toHaveBeenCalledTimes(2)
  })

  it('calls onEnded when session is closed', async () => {
    sessionApi.fetchSessionState.mockResolvedValue({
      version: 2, name: 'T', setList: [], songs: {}, editLocks: {},
      closed: true, expiresAt: new Date(Date.now() + 86400000).toISOString(),
    })
    const onEnded = vi.fn()
    renderHook(() => useSessionSync({ code: 'ABC123', onEnded }))
    await act(async () => { await Promise.resolve() })
    expect(onEnded).toHaveBeenCalled()
  })

  it('calls onEnded on 410 expired error', async () => {
    sessionApi.fetchSessionState.mockRejectedValue(Object.assign(new Error('expired'), { code: 'expired' }))
    const onEnded = vi.fn()
    renderHook(() => useSessionSync({ code: 'ABC123', onEnded }))
    await act(async () => { await Promise.resolve() })
    expect(onEnded).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npm test -- src/hooks/__tests__/useSessionSync.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement useSessionSync**

Create `src/hooks/useSessionSync.js`:

```js
import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { fetchSessionState, sendHeartbeat } from '../lib/sessionApi'

export function useSessionSync({ code, onEnded, onLockLost }) {
  // onLockLost({ songId, hadConflict, theirRawText, localRawText })
  // called when the active edit lock disappears from poll state
  const applyServerState = useSessionStore(s => s.applyServerState)
  const pollRef = useRef(null)
  const heartbeatRef = useRef(null)
  const activeLockRef = useRef(null) // { songId, clientId, localRawText } | null

  const poll = useCallback(async () => {
    if (!code) return
    try {
      const state = await fetchSessionState(code)
      if (state.closed || new Date(state.expiresAt).getTime() <= Date.now()) {
        onEnded?.()
        return
      }

      // Detect lost lock: we had a lock but it no longer appears for our clientId
      if (activeLockRef.current) {
        const { songId, clientId, localRawText } = activeLockRef.current
        const lock = state.editLocks[songId]
        const stillMine = lock && lock.clientId === clientId && new Date(lock.expiresAt).getTime() > Date.now()
        if (!stillMine) {
          const theirRawText = state.songs[songId]?.rawText ?? ''
          const hadConflict = theirRawText !== localRawText
          activeLockRef.current = null
          clearInterval(heartbeatRef.current)
          onLockLost?.({ songId, hadConflict, theirRawText, localRawText })
        }
      }

      applyServerState(state)
    } catch (err) {
      if (err.code === 'expired' || err.code === 'not_found') {
        onEnded?.()
      }
      // Other errors: silently skip this cycle
    }
  }, [code, applyServerState, onEnded, onLockLost])

  useEffect(() => {
    if (!code) return
    poll()

    function startPolling() {
      pollRef.current = setInterval(poll, 4000)
    }

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
  }, [code, poll])

  // localRawText is the song's rawText at the moment editing began — used for conflict detection
  function startHeartbeat(songId, clientId, localRawText) {
    activeLockRef.current = { songId, clientId, localRawText }
    clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(async () => {
      if (!activeLockRef.current || !code) return
      try {
        await sendHeartbeat(code, activeLockRef.current.songId, activeLockRef.current.clientId)
      } catch {
        // Lock expired — next poll will reflect it
      }
    }, 30_000)
  }

  function stopHeartbeat() {
    activeLockRef.current = null
    clearInterval(heartbeatRef.current)
    heartbeatRef.current = null
  }

  return { startHeartbeat, stopHeartbeat }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- src/hooks/__tests__/useSessionSync.test.js
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSessionSync.js src/hooks/__tests__/useSessionSync.test.js
git commit -m "feat: add useSessionSync hook with 4s polling, visibility pause, heartbeat"
```

---

## Task 7: Frontend — CreateSessionModal

**Files:**
- Create: `src/components/Session/CreateSessionModal.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/Session/CreateSessionModal.jsx`:

```jsx
import { useState } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { createSession } from '../../lib/sessionApi'
import { loadSong } from '../../lib/storage'

export function CreateSessionModal({ isOpen, selectedSongIds, onClose, onCreated }) {
  const [step, setStep] = useState('name') // 'name' | 'links'
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { code, leaderToken, memberUrl, leaderUrl }
  const [copied, setCopied] = useState(null) // 'member' | 'leader' | null

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const songs = [...selectedSongIds]
        .map(id => loadSong(id))
        .filter(Boolean)
        .map(s => ({ id: s.id, meta: s.meta, rawText: s.rawText ?? '' }))

      const data = await createSession({ name: name.trim(), songs })
      setResult(data)
      setStep('links')
      onCreated?.(data)
    } catch {
      setError('Could not create session. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  function copyToClipboard(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function handleClose() {
    setStep('name')
    setName('')
    setResult(null)
    setError(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} title="Start Live Session" onClose={handleClose}>
      {step === 'name' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Create a session your team can join to edit the set list together.
            {selectedSongIds?.size > 0 && (
              <span> {selectedSongIds.size} song{selectedSongIds.size !== 1 ? 's' : ''} will be added.</span>
            )}
          </p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            placeholder={`Session name (e.g. Sunday ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })})`}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating…' : 'Create Session'}
            </Button>
          </div>
        </div>
      )}

      {step === 'links' && result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
              Live
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-300">Session created</span>
          </div>

          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">MEMBER LINK — share with your team</p>
            <p className="text-xs font-mono text-blue-600 dark:text-blue-400 break-all mb-2">{result.memberUrl}</p>
            <Button variant="secondary" className="text-xs py-1 px-3" onClick={() => copyToClipboard(result.memberUrl, 'member')}>
              {copied === 'member' ? '✓ Copied!' : '📋 Copy link'}
            </Button>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">YOUR LEADER LINK — keep private</p>
            <p className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all mb-2">{result.leaderUrl}</p>
            <Button variant="secondary" className="text-xs py-1 px-3" onClick={() => copyToClipboard(result.leaderUrl, 'leader')}>
              {copied === 'leader' ? '✓ Copied!' : '📋 Copy link'}
            </Button>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Close</Button>
            <Button variant="primary" onClick={handleClose}>Open Session →</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
```

> Note: "Open Session →" navigates when App.jsx detects the session URL param. For now `handleClose` is fine — in Task 9 the App will detect the URL param from the leaderUrl and route to SessionView. Alternatively, after creation you can directly call `window.location.href = result.leaderUrl`.

- [ ] **Step 2: Commit**

```bash
git add src/components/Session/CreateSessionModal.jsx
git commit -m "feat: add CreateSessionModal with name input and link display steps"
```

---

## Task 8: Frontend — Sidebar: add Start Live Session

**Files:**
- Modify: `src/components/Sidebar/Sidebar.jsx`

- [ ] **Step 1: Add session modal state and handler**

In `src/components/Sidebar/Sidebar.jsx`, add these imports at the top (after existing imports):

```js
import { CreateSessionModal } from '../Session/CreateSessionModal'
```

Add this state variable alongside the other `useState` calls (after `backgroundModalOpen`):

```js
const [sessionModalOpen, setSessionModalOpen] = useState(false)
```

Add this handler function after `handleChoosePresentationPdf`:

```js
function handleChooseSession() {
  setChoiceModalOpen(false)
  setSessionModalOpen(true)
}
```

- [ ] **Step 2: Add "Start Live Session" button to the choice modal**

In the `<Modal isOpen={choiceModalOpen} ...>` block, add a new button after "Presentation PDF":

```jsx
<Button variant="secondary" className="w-full" onClick={handleChooseSession}>
  👥 Start Live Session
</Button>
```

- [ ] **Step 3: Mount the CreateSessionModal**

After the `<ExportBackgroundModal .../>` render, add:

```jsx
<CreateSessionModal
  isOpen={sessionModalOpen}
  selectedSongIds={selectedSongIds}
  onClose={() => { setSessionModalOpen(false); toggleExportMode() }}
  onCreated={(data) => {
    // Navigate to the leader URL so App.jsx detects ?session=+?token=
    window.location.href = data.leaderUrl
  }}
/>
```

- [ ] **Step 4: Verify in browser**

Start dev server (`npm run dev`), enter export mode, click Export → "Start Live Session" button appears. Clicking it opens the CreateSessionModal. *(Worker must be running locally for actual creation to work — you can verify UI only at this stage.)*

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar/Sidebar.jsx
git commit -m "feat: add Start Live Session option to export choice modal"
```

---

## Task 9: Frontend — App.jsx session URL detection

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add session URL param detection**

In `src/App.jsx`, add these imports after existing imports:

```js
import { useSessionStore } from './store/sessionStore'
import { SessionView } from './components/Session/SessionView'
```

Add this state and store access after existing `useState` calls:

```js
const [activeSession, setActiveSession] = useState(null) // { code, leaderToken } | null
const initClient = useSessionStore(s => s.initClient)
const clearSession = useSessionStore(s => s.clearSession)
```

Replace the existing `useEffect` that handles `?share=` with this expanded version:

```js
useEffect(() => {
  const params = new URLSearchParams(window.location.search)

  // Handle ?session= param
  const sessionCode = params.get('session')
  if (sessionCode) {
    const leaderToken = params.get('token') || null
    initClient(sessionCode, leaderToken)
    setActiveSession({ code: sessionCode, leaderToken })
    // Clean URL params so refresh doesn't re-trigger
    const url = new URL(window.location.href)
    url.searchParams.delete('session')
    url.searchParams.delete('token')
    window.history.replaceState({}, '', url.toString())
    return
  }

  // Handle ?share= param (existing behaviour)
  const shareCode = params.get('share')
  if (!shareCode) return

  fetchShare(shareCode)
    .then(buf => parseSbpFile(buf))
    .then(parsed => setShareSongs(parsed))
    .catch(err => {
      if (err.code === 'expired') {
        addToast('This share link has expired.', 'error')
      } else if (err.code === 'not_found') {
        addToast('Share link not found.', 'error')
      } else {
        addToast('Could not load shared songs.', 'error')
      }
      clearShareParam()
    })
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Render SessionView when activeSession is set**

In the JSX `return`, replace the `<div className="flex flex-1 ...">` body block:

```jsx
{/* Body */}
<div className="flex flex-1 overflow-hidden relative">
  {activeSession ? (
    <SessionView
      code={activeSession.code}
      leaderToken={activeSession.leaderToken}
      onExit={() => {
        clearSession()
        setActiveSession(null)
      }}
      onAddToast={addToast}
    />
  ) : (
    <>
      <Sidebar
        isOpen={sidebarOpen}
        onAddToast={addToast}
        onClose={() => setSidebarOpen(false)}
        onSongSelect={() => { if (window.innerWidth < 768) setSidebarOpen(false) }}
        onImportSuccess={() => { if (window.innerWidth < 768) setSidebarOpen(true) }}
      />
      <MainContent onAddToast={addToast} lyricsOnly={effectiveLyricsOnly} fontSize={fontSize} onFontSizeChange={setFontSize} onImportSuccess={() => { if (window.innerWidth < 768) setSidebarOpen(true) }} />
    </>
  )}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: detect ?session= URL param and route to SessionView"
```

---

## Task 10: Frontend — SessionView

**Files:**
- Create: `src/components/Session/SessionView.jsx`

- [ ] **Step 1: Create SessionView**

Create `src/components/Session/SessionView.jsx`:

```jsx
import { useState, useCallback } from 'react'
import {
  DndContext, MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove,
  verticalListSortingStrategy, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSessionStore } from '../../store/sessionStore'
import { useSessionSync } from '../../hooks/useSessionSync'
import { submitOp, acquireLock, releaseLock, closeSession } from '../../lib/sessionApi'
import { Button } from '../UI/Button'
import { EditLockWarning } from './EditLockWarning'

function SortableSessionSong({ songId, song, isLocked, isMyLock, onEdit, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: songId })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const KEY_NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
  const keyName = KEY_NAMES[song.meta.keyIndex] ?? ''

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm
        ${isDragging ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="text-gray-300 dark:text-gray-600 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
      >⋮⋮</button>

      {/* Song info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{song.meta.title}</p>
        <p className="text-xs text-gray-500">{song.meta.artist || ''}{keyName ? ` · Key of ${keyName}` : ''}</p>
      </div>

      {/* Lock / edit action */}
      {isLocked && !isMyLock ? (
        <span title="Someone is editing this song" className="text-base">🔒</span>
      ) : (
        <button
          onClick={() => onEdit(songId)}
          aria-label={`Edit ${song.meta.title}`}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
        >✏️</button>
      )}

      {/* Remove */}
      <button
        onClick={() => onRemove(songId)}
        aria-label={`Remove ${song.meta.title}`}
        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
      >×</button>
    </li>
  )
}

export function SessionView({ code, leaderToken, onExit, onAddToast }) {
  const { name, setList, songs, editLocks, closed } = useSessionStore(s => ({
    name: s.name, setList: s.setList, songs: s.songs,
    editLocks: s.editLocks, closed: s.closed,
  }))
  const clientId = useSessionStore(s => s.clientId)
  const isLeader = useSessionStore(s => s.isLeader())
  const isLocked = useSessionStore(s => s.isLocked)
  const isMyLock = useSessionStore(s => s.isMyLock)

  const [lockWarning, setLockWarning] = useState(null) // { songId, hadConflict, theirRawText }
  const [editingSongId, setEditingSongId] = useState(null)
  const [memberLink] = useState(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('session', code)
    url.searchParams.delete('token')
    return url.toString()
  })
  const [copied, setCopied] = useState(false)
  const [ended, setEnded] = useState(false)

  const { startHeartbeat, stopHeartbeat } = useSessionSync({
    code,
    onEnded: useCallback(() => setEnded(true), []),
    onLockLost: useCallback(({ songId, hadConflict, theirRawText, localRawText }) => {
      setLockWarning({ songId, hadConflict, theirRawText, myRawText: localRawText })
      setEditingSongId(null)
    }, []),
  })

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = setList.indexOf(active.id)
    const newIndex = setList.indexOf(over.id)
    const reordered = arrayMove(setList, oldIndex, newIndex)
    const afterSongId = newIndex === 0 ? null : reordered[newIndex - 1]

    try {
      await submitOp(code, { type: 'move_song', songId: active.id, afterSongId })
    } catch {
      onAddToast('Could not reorder — please try again.', 'error')
    }
  }

  async function handleRemoveSong(songId) {
    try {
      await submitOp(code, { type: 'remove_song', songId })
    } catch {
      onAddToast('Could not remove song — please try again.', 'error')
    }
  }

  async function handleEditSong(songId) {
    try {
      await acquireLock(code, songId, clientId)
      const localRawText = songs[songId]?.rawText ?? ''
      startHeartbeat(songId, clientId, localRawText)
      setEditingSongId(songId)
    } catch (err) {
      if (err.code === 'locked') {
        onAddToast('Someone else is editing this song.', 'error')
      } else {
        onAddToast('Could not acquire edit lock.', 'error')
      }
    }
  }

  async function handleSaveSong(songId, updatedSong) {
    try {
      await submitOp(code, { type: 'update_song', songId, song: updatedSong })
      await releaseLock(code, songId, clientId)
    } catch {
      onAddToast('Could not save song — please try again.', 'error')
    } finally {
      stopHeartbeat()
      setEditingSongId(null)
    }
  }

  async function handleCancelEdit(songId) {
    await releaseLock(code, songId, clientId)
    stopHeartbeat()
    setEditingSongId(null)
  }

  async function handleClose() {
    if (!leaderToken) return
    try {
      await closeSession(code, leaderToken)
      onExit()
    } catch {
      onAddToast('Could not close session.', 'error')
    }
  }

  function copyMemberLink() {
    navigator.clipboard.writeText(memberLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (ended || closed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-2xl">🎵</p>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">This session has ended</h2>
        <Button variant="primary" onClick={onExit}>Back to library</Button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <button onClick={onExit} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm">←</button>
          <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{name || 'Live Session'}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
            Live
          </span>
        </div>
        {isLeader && (
          <button
            onClick={handleClose}
            title="End session"
            className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            End
          </button>
        )}
      </div>

      {/* Set list */}
      <div className="flex-1 overflow-y-auto p-3">
        {setList.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">
            No songs yet — add some below
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={setList} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1">
                {setList.map(songId => {
                  const song = songs[songId]
                  if (!song) return null
                  const locked = isLocked(songId)
                  const myLock = isMyLock(songId)
                  return (
                    <div key={songId}>
                      <SortableSessionSong
                        songId={songId}
                        song={song}
                        isLocked={locked}
                        isMyLock={myLock}
                        onEdit={handleEditSong}
                        onRemove={handleRemoveSong}
                      />
                      {locked && !myLock && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 px-8 pb-1">
                          ⚠ Someone is editing this song
                        </p>
                      )}
                    </div>
                  )
                })}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <Button variant="secondary" className="w-full" onClick={copyMemberLink}>
          {copied ? '✓ Link copied!' : '🔗 Copy member link'}
        </Button>
        <Button variant="ghost" className="w-full text-xs" onClick={onExit}>
          ↓ Exit session (go back to library)
        </Button>
      </div>

      {/* Lock expiry warning dialog */}
      {lockWarning && (
        <EditLockWarning
          hadConflict={lockWarning.hadConflict}
          theirRawText={lockWarning.theirRawText}
          myRawText={lockWarning.myRawText}
          onRelock={async () => {
            // Re-acquire lock and save the user's version
            const { songId, myRawText } = lockWarning
            setLockWarning(null)
            try {
              await acquireLock(code, songId, clientId)
              const updatedSong = { ...songs[songId], rawText: myRawText }
              await submitOp(code, { type: 'update_song', songId, song: updatedSong })
              await releaseLock(code, songId, clientId)
              onAddToast('Song saved.', 'success')
            } catch {
              onAddToast('Could not save — please try again.', 'error')
            }
          }}
          onKeepTheirs={() => {
            // Their version is already in session state — just dismiss
            setLockWarning(null)
            stopHeartbeat()
          }}
          onDiscard={() => {
            setLockWarning(null)
            stopHeartbeat()
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Session/SessionView.jsx
git commit -m "feat: add SessionView with DnD reorder, edit lock UI, session header"
```

---

## Task 11: Frontend — EditLockWarning

**Files:**
- Create: `src/components/Session/EditLockWarning.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/Session/EditLockWarning.jsx`:

```jsx
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'

/**
 * Shown when the editor's lock has expired while they were editing.
 *
 * Props:
 *   songId       — which song was being edited
 *   hadConflict  — boolean: did someone else save changes while lock was gone?
 *   theirRawText — the version saved by the other person (only when hadConflict=true)
 *   myRawText    — the editor's unsaved local changes
 *   onRelock     — called when user chooses to re-acquire lock and save their version
 *   onKeepTheirs — called when user chooses to discard their edits and keep the other version
 *   onDiscard    — called when user discards all changes (no-conflict path or cancel)
 */
export function EditLockWarning({ hadConflict, theirRawText, myRawText, onRelock, onKeepTheirs, onDiscard }) {
  return (
    <Modal isOpen title="Edit lock expired" onClose={onDiscard}>
      {hadConflict ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Your edit lock expired and someone else saved changes to this song. Review and choose which version to keep.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Their version</p>
              <pre className="bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-auto max-h-36 whitespace-pre-wrap">{theirRawText}</pre>
            </div>
            <div>
              <p className="text-xs font-semibold text-indigo-500 mb-1 uppercase tracking-wide">Your version</p>
              <pre className="bg-indigo-50 dark:bg-indigo-900/30 rounded p-2 overflow-auto max-h-36 whitespace-pre-wrap">{myRawText}</pre>
            </div>
          </div>

          <div className="flex gap-2 justify-end flex-wrap">
            <Button variant="ghost" onClick={onDiscard}>Cancel</Button>
            <Button variant="secondary" onClick={onKeepTheirs}>Keep their version</Button>
            <Button variant="primary" onClick={onRelock}>Keep my version</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Your edit lock expired, but no one else changed this song. You can still save your edits.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onDiscard}>Discard</Button>
            <Button variant="primary" onClick={onRelock}>Re-lock &amp; Save</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Session/EditLockWarning.jsx
git commit -m "feat: add EditLockWarning dialog for lock-expiry recovery (no-conflict and conflict variants)"
```

---

## Task 12: Frontend — Save to My Library

**Files:**
- Modify: `src/components/Session/SessionView.jsx`

- [ ] **Step 1: Add save-to-library logic to SessionView**

The library `addSongs` function expects songs in the app's format. Add this import to `SessionView.jsx`:

```js
import { useLibraryStore } from '../../store/libraryStore'
```

Add inside the `SessionView` component body (after existing state):

```js
const addSongs = useLibraryStore(s => s.addSongs)

function saveAllToLibrary() {
  const songsToAdd = setList
    .map(id => songs[id])
    .filter(Boolean)
    .map(s => ({
      meta: s.meta,
      rawText: s.rawText,
      sections: [],   // addSongs will re-parse if needed
    }))

  if (songsToAdd.length === 0) return
  addSongs(songsToAdd)
  onAddToast(`${songsToAdd.length} song${songsToAdd.length !== 1 ? 's' : ''} saved to your library.`, 'success')
}
```

- [ ] **Step 2: Add Save to Library button to footer**

In the footer `<div>` in `SessionView.jsx`, add this button before the "Copy member link" button:

```jsx
<Button variant="secondary" className="w-full" onClick={saveAllToLibrary}>
  💾 Save all songs to My Library
</Button>
```

- [ ] **Step 3: Verify in browser (manual)**

Join or create a session with songs. Click "Save all songs to My Library". Exit the session. Open the sidebar All Songs list — the songs should appear.

- [ ] **Step 4: Commit**

```bash
git add src/components/Session/SessionView.jsx
git commit -m "feat: add Save all songs to My Library action in SessionView"
```

---

## Task 13: Final wiring + smoke test

**Files:**
- Modify: `src/test/smoke.test.js` (add session smoke coverage)

- [ ] **Step 1: Add session components to smoke test**

Open `src/test/smoke.test.js`. Add an import and a test verifying SessionView renders without crashing:

```js
import { SessionView } from '../components/Session/SessionView'
import { CreateSessionModal } from '../components/Session/CreateSessionModal'
import { EditLockWarning } from '../components/Session/EditLockWarning'
// Add to existing imports

// Inside describe block:
it('renders CreateSessionModal without crashing', () => {
  render(<CreateSessionModal isOpen={false} selectedSongIds={new Set()} onClose={() => {}} />)
})

it('renders EditLockWarning (no conflict) without crashing', () => {
  render(
    <EditLockWarning
      hadConflict={false}
      myRawText=""
      onRelock={() => {}}
      onDiscard={() => {}}
    />
  )
})
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 3: Run worker tests**

```bash
cd songbook-worker && npm test
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/test/smoke.test.js
git commit -m "test: add smoke tests for session components"
```

---

## Task 14: Worker deploy prep

**Files:**
- Modify: `songbook-worker/wrangler.toml` (replace placeholder KV IDs with real ones)

- [ ] **Step 1: Create KV namespaces in Cloudflare**

```bash
cd songbook-worker
npx wrangler kv namespace create SESSION_KV
npx wrangler kv namespace create SESSION_KV --preview
```

Copy the `id` values from each command's output.

- [ ] **Step 2: Update wrangler.toml with real IDs**

Replace the placeholder values in `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "SESSION_KV"
id = "<real-production-id>"
preview_id = "<real-preview-id>"
```

- [ ] **Step 3: Deploy**

```bash
npx wrangler deploy
```
Expected: deployment succeeds, Worker URL printed.

- [ ] **Step 4: Set VITE_WORKER_URL in frontend .env.local**

In `songbook-app/.env.local` (create if absent):
```
VITE_WORKER_URL=https://songbook-worker.<your-subdomain>.workers.dev
```

- [ ] **Step 5: End-to-end verification checklist**

Run through the spec verification steps manually:
- [ ] Leader creates session → code + both URLs returned
- [ ] Member opens member URL → session view loads with correct songs
- [ ] Leader URL shows "End" button; member URL does not
- [ ] Two tabs: Tab A adds a song → Tab B sees it within 4 s
- [ ] Tab A drags a song → Tab B sees new order within 4 s
- [ ] Tab A opens editor → Tab B sees 🔒 and "Someone is editing" warning
- [ ] Tab A saves → 🔒 clears for Tab B within 4 s
- [ ] Open editor, wait 90 s without saving → lock still held (heartbeat working)
- [ ] Leader clicks End → Tab B sees "This session has ended"
- [ ] Save all songs to library → songs appear in All Songs list

- [ ] **Step 6: Final commit**

```bash
git add songbook-worker/wrangler.toml
git commit -m "chore: update SESSION_KV wrangler IDs for production deploy"
```
