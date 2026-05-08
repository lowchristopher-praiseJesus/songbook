# Cloudflare Turnstile Bot Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cloudflare Turnstile verification to the four unauthenticated POST endpoints in the Cloudflare Worker, with a shared invisible widget on the React frontend that gates all four corresponding API calls.

**Architecture:** A single Hono middleware (`verifyTurnstile`) is wired on each guarded route — it reads `X-Turnstile-Token`, calls CF siteverify, and returns 403 on failure. On the frontend, a module-level singleton hook (`useTurnstile`) loads the CF script once, mounts one invisible widget, and exposes `getToken()` which executes the challenge and returns the token string for injection into API call headers. `App.jsx` provides a hidden `<div id="turnstile-widget">` container; it never calls the hook itself.

**Tech Stack:** Hono (middleware), Cloudflare Turnstile siteverify API, React hook (vanilla JS), Vitest with cloudflare:test (worker tests), Vitest + Testing Library (frontend tests)

---

## File Map

**New files:**
- `songbook-worker/src/middleware/turnstile.ts` — Hono middleware that verifies the token with CF siteverify
- `songbook-worker/src/middleware/turnstile.test.ts` — middleware unit tests via the share route
- `songbook-worker/src/routes/share.test.ts` — route-level tests for share upload (new file; none existed)
- `src/hooks/useTurnstile.js` — module-level singleton hook

**Modified files:**
- `songbook-worker/src/types.ts` — add `TURNSTILE_SECRET_KEY: string`
- `songbook-worker/vitest.config.ts` — add `TURNSTILE_SECRET_KEY` to miniflare bindings
- `songbook-worker/src/index.ts` — add `X-Turnstile-Token` to CORS allowed headers
- `songbook-worker/src/routes/share.ts` — wire `verifyTurnstile` on `POST /upload`
- `songbook-worker/src/routes/session.ts` — wire `verifyTurnstile` on `POST /create`
- `songbook-worker/src/routes/conductor.ts` — wire `verifyTurnstile` on `POST /create`
- `songbook-worker/src/routes/album.ts` — wire `verifyTurnstile` on `POST /`
- `songbook-worker/src/routes/session.test.ts` — add token header to createSession helper + 403 test
- `songbook-worker/src/routes/conductor.test.ts` — add token header to createConductor helper + 403 test
- `songbook-worker/src/routes/album.test.ts` — add token header to createAlbum helper + 403 test
- `src/App.jsx` — add `<div id="turnstile-widget" style={{ display: 'none' }} />`
- `src/lib/shareApi.js` — add `turnstileToken` param + `X-Turnstile-Token` header
- `src/lib/sessionApi.js` — add `turnstileToken` param + `X-Turnstile-Token` header
- `src/lib/conductorApi.js` — add `turnstileToken` param + `X-Turnstile-Token` header
- `src/lib/albumApi.js` — add `turnstileToken` param + `X-Turnstile-Token` header
- `src/test/shareApi.test.js` — verify `X-Turnstile-Token` header in uploadShare
- `src/test/sessionApi.test.js` — verify `X-Turnstile-Token` header in createSession
- `src/lib/__tests__/conductorApi.test.js` — add test for `X-Turnstile-Token` in createConductorSession
- `src/components/Share/ShareModal.jsx` — add `useTurnstile` + two `getToken()` calls
- `src/components/Session/LiveSessionModal.jsx` — add `useTurnstile` + one `getToken()` call
- `src/components/Album/NewAlbumCreator.jsx` — add `useTurnstile` + one `getToken()` call
- `src/test/ShareModal.test.jsx` — mock `useTurnstile`
- `src/components/Share/__tests__/ShareModal.conductor.test.jsx` — mock `useTurnstile`
- `src/test/NewAlbumCreator.test.jsx` — mock `useTurnstile`
- `src/test/NewAlbumCreator.edit.test.jsx` — mock `useTurnstile`
- `.env.example` — add `VITE_TURNSTILE_SITE_KEY=`

---

## Task 1: Worker infrastructure — types, vitest config, CORS

**Files:**
- Modify: `songbook-worker/src/types.ts`
- Modify: `songbook-worker/vitest.config.ts`
- Modify: `songbook-worker/src/index.ts`

- [ ] **Step 1: Add `TURNSTILE_SECRET_KEY` to the `Env` interface**

Replace the contents of `songbook-worker/src/types.ts`:

```ts
export interface Env {
  R2_BUCKET: R2Bucket;
  SESSION_KV: KVNamespace;
  APP_ORIGIN: string;
  WALKIE_ORIGIN: string;
  LICENSE_SECRET: string;
  LICENSE_TOKEN_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
}
```

- [ ] **Step 2: Add the test secret key to miniflare bindings**

Replace the `bindings` block in `songbook-worker/vitest.config.ts`:

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            APP_ORIGIN: 'http://localhost:5173',
            LICENSE_SECRET: 'test-license-secret',
            LICENSE_TOKEN_SECRET: 'test-token-secret',
            TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
          },
          kvNamespaces: ['SESSION_KV'],
          r2Buckets: ['R2_BUCKET'],
        },
      },
    },
  },
});
```

The key `1x0000000000000000000000000000000AA` is Cloudflare's official always-passes test secret key — siteverify returns `success: true` for any token value when this key is used.

- [ ] **Step 3: Add `X-Turnstile-Token` to the CORS allowed headers**

In `songbook-worker/src/index.ts`, line 29, change the `Access-Control-Allow-Headers` value to:

```ts
'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In-Days, X-Leader-Token, X-Director-Token, X-Conductor-Token, X-Creator-Token, X-License-Token, X-Turnstile-Token',
```

- [ ] **Step 4: Run existing worker tests to confirm nothing broke**

```bash
cd songbook-worker && npm test
```

Expected: all tests pass. The new `TURNSTILE_SECRET_KEY` binding is ignored by existing tests because no route uses it yet.

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/types.ts songbook-worker/vitest.config.ts songbook-worker/src/index.ts
git commit -m "feat: add TURNSTILE_SECRET_KEY to Env, vitest config, and CORS headers"
```

---

## Task 2: Turnstile middleware + share route wiring + tests

**Files:**
- Create: `songbook-worker/src/middleware/turnstile.ts`
- Create: `songbook-worker/src/middleware/turnstile.test.ts`
- Create: `songbook-worker/src/routes/share.test.ts`
- Modify: `songbook-worker/src/routes/share.ts`

The middleware test file uses `POST /share/upload` as the vehicle (simplest unauthenticated POST route). The route test file covers the full upload success path.

- [ ] **Step 1: Write the failing middleware tests**

Create `songbook-worker/src/middleware/turnstile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

describe('verifyTurnstile middleware', () => {
  it('returns 403 with turnstile_failed when X-Turnstile-Token header is missing', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', 'Origin': ORIGIN },
      body: new ArrayBuffer(1),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });

  it('calls next() and returns 200 when siteverify returns success: true', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Origin': ORIGIN,
        'X-Turnstile-Token': 'test-token',
      },
      body: new ArrayBuffer(1),
    });
    expect(res.status).toBe(200);
  });

  it('returns 403 when siteverify returns success: false', async () => {
    // 2x0000000000000000000000000000000BB is Cloudflare's always-fails test secret key
    env.TURNSTILE_SECRET_KEY = '2x0000000000000000000000000000000BB';
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Origin': ORIGIN,
        'X-Turnstile-Token': 'test-token',
      },
      body: new ArrayBuffer(1),
    });
    env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });
});
```

- [ ] **Step 2: Write the failing share route tests**

Create `songbook-worker/src/routes/share.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

describe('POST /share/upload', () => {
  it('returns 403 when X-Turnstile-Token header is missing', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', 'Origin': ORIGIN },
      body: new ArrayBuffer(1),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });

  it('uploads a share and returns shareCode, shareUrl, expiresAt', async () => {
    const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // ZIP magic bytes
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Origin': ORIGIN,
        'X-Turnstile-Token': 'test-token',
      },
      body: data,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { shareCode: string; shareUrl: string; expiresAt: string };
    expect(body.shareCode).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.shareUrl).toContain('?share=');
    expect(body.expiresAt).toBeDefined();
  });

  it('returns 400 when body is empty', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Origin': ORIGIN,
        'X-Turnstile-Token': 'test-token',
      },
      body: new ArrayBuffer(0),
    });
    expect(res.status).toBe(400);
  });

  it('returns 413 when body exceeds 10 MB', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Origin': ORIGIN,
        'X-Turnstile-Token': 'test-token',
      },
      body: new Uint8Array(10 * 1024 * 1024 + 1),
    });
    expect(res.status).toBe(413);
  });
});

describe('GET /share/:code', () => {
  it('returns 404 for a non-existent share code', async () => {
    const res = await SELF.fetch('http://localhost/share/does-not-exist', {
      headers: { 'Origin': ORIGIN },
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd songbook-worker && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|turnstile|share"
```

Expected: `turnstile.test.ts` and `share.test.ts` FAIL because the middleware doesn't exist yet.

- [ ] **Step 4: Create the turnstile middleware**

Create `songbook-worker/src/middleware/turnstile.ts`:

```ts
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

export const verifyTurnstile: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = c.req.header('X-Turnstile-Token');
  if (!token) return c.json({ error: 'turnstile_failed' }, 403);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: c.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: c.req.header('CF-Connecting-IP') ?? '',
      }),
    });
    const data = await res.json() as { success: boolean };
    if (data.success !== true) return c.json({ error: 'turnstile_failed' }, 403);
  } catch {
    return c.json({ error: 'turnstile_failed' }, 403);
  }

  return next();
};
```

- [ ] **Step 5: Wire the middleware on `POST /share/upload`**

In `songbook-worker/src/routes/share.ts`, add the import and update the route:

```ts
import { Hono } from 'hono';
import type { Env } from '../types';
import { putShare, getShareIfValid } from '../lib/r2';
import { verifyTurnstile } from '../middleware/turnstile';

const share = new Hono<{ Bindings: Env }>();

share.post('/upload', verifyTurnstile, async (c) => {
  // ... rest of handler unchanged
```

Only the import line and the `share.post('/upload', ...)` line change. The handler body is untouched.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd songbook-worker && npm test
```

Expected: all tests pass including the new `turnstile.test.ts` and `share.test.ts`. Tests require outbound network access to `challenges.cloudflare.com` (Cloudflare's test keys hit their real siteverify endpoint).

- [ ] **Step 7: Commit**

```bash
git add songbook-worker/src/middleware/turnstile.ts songbook-worker/src/middleware/turnstile.test.ts songbook-worker/src/routes/share.ts songbook-worker/src/routes/share.test.ts
git commit -m "feat: add verifyTurnstile middleware and wire on POST /share/upload"
```

---

## Task 3: Wire middleware on session route + update session tests

**Files:**
- Modify: `songbook-worker/src/routes/session.ts`
- Modify: `songbook-worker/src/routes/session.test.ts`

Only `POST /session/create` is guarded. The other session endpoints (`/op`, `/lock`, `/heartbeat`, `/close`) are authenticated by `X-Leader-Token` or operate on existing sessions — they are left unchanged.

- [ ] **Step 1: Add the missing-token 403 test to session.test.ts**

In `songbook-worker/src/routes/session.test.ts`, add a new describe block at the end of the file:

```ts
describe('POST /session/create — Turnstile guard', () => {
  it('returns 403 when X-Turnstile-Token header is missing', async () => {
    const res = await SELF.fetch('http://localhost/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
      body: JSON.stringify({ name: 'Test' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });
});
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
cd songbook-worker && npm test -- session.test.ts
```

Expected: the new "returns 403 when X-Turnstile-Token header is missing" test FAILS (returns 200, not 403) because the middleware isn't wired yet.

- [ ] **Step 3: Wire the middleware on `POST /session/create`**

In `songbook-worker/src/routes/session.ts`, add the import at the top and update the route registration:

```ts
import { Hono } from 'hono';
import type { Env } from '../types';
import {
  generateCode, getSession, putSession, stripExpiredLocks,
  isSessionDead, applyOp,
} from '../lib/session';
import type { SessionData, Op } from '../lib/session';
import { verifyTurnstile } from '../middleware/turnstile';

const session = new Hono<{ Bindings: Env }>();

// POST /session/create
session.post('/create', verifyTurnstile, async (c) => {
```

Only the import line and `session.post('/create', ...)` signature change. Handler body is untouched.

- [ ] **Step 4: Add `X-Turnstile-Token` to the `createSession` helper in session.test.ts**

The existing `createSession` helper at the top of `session.test.ts` must include the token, otherwise all existing tests that call it will now fail:

```ts
async function createSession(body = {}) {
  return SELF.fetch('http://localhost/session/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN, 'X-Turnstile-Token': 'test-token' },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 5: Run all worker tests**

```bash
cd songbook-worker && npm test
```

Expected: all tests pass. The new 403 test passes, and all existing tests that use `createSession()` pass because the helper now includes the token.

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/src/routes/session.ts songbook-worker/src/routes/session.test.ts
git commit -m "feat: wire verifyTurnstile on POST /session/create"
```

---

## Task 4: Wire middleware on conductor route + update conductor tests

**Files:**
- Modify: `songbook-worker/src/routes/conductor.ts`
- Modify: `songbook-worker/src/routes/conductor.test.ts`

Only `POST /conductor/create` is guarded. All other conductor endpoints require a valid director token and are not Turnstile-gated.

- [ ] **Step 1: Add the missing-token 403 test to conductor.test.ts**

In `songbook-worker/src/routes/conductor.test.ts`, add a new describe block at the end of the file:

```ts
describe('POST /conductor/create — Turnstile guard', () => {
  it('returns 403 with turnstile_failed when X-Turnstile-Token header is missing', async () => {
    const token = await getLicenseToken();
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN, 'X-License-Token': token },
      body: JSON.stringify({ conductorCode: 'NOTURNS', directorToken: 'tok', maxFollowers: 5 }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });
});
```

Note: this test includes a valid `X-License-Token` so the license check passes — letting the Turnstile check run and return 403.

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
cd songbook-worker && npm test -- conductor.test.ts
```

Expected: the new test FAILS (the endpoint returns `license_required` or 200, not `turnstile_failed`) because the middleware isn't wired yet.

- [ ] **Step 3: Wire the middleware on `POST /conductor/create`**

In `songbook-worker/src/routes/conductor.ts`, add the import and update the route:

```ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { CONDUCTOR } from '../config';
import {
  getConductor, putConductor,
  countActiveFollowers, isConductorExpired, isConductorTerminated,
} from '../lib/conductor';
import type { ConductorData } from '../lib/conductor';
import { verifyLicenseToken } from '../lib/licenseToken';
import { verifyTurnstile } from '../middleware/turnstile';

const conductor = new Hono<{ Bindings: Env }>();

// POST /conductor/create
conductor.post('/create', verifyTurnstile, async (c) => {
```

The order matters: `verifyTurnstile` runs first, then the license check runs inside the handler body. This ensures a missing Turnstile token returns `turnstile_failed` (not `license_required`).

- [ ] **Step 4: Add `X-Turnstile-Token` to the `createConductor` helper in conductor.test.ts**

```ts
async function createConductor(body = {}) {
  const token = await getLicenseToken();
  return SELF.fetch('http://localhost/conductor/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN, 'X-License-Token': token, 'X-Turnstile-Token': 'test-token' },
    body: JSON.stringify({ conductorCode: 'AABBCC', directorToken: 'tok-1', maxFollowers: 5, ...body }),
  });
}
```

Also update the three direct calls in the license enforcement describe block (before `createConductor` is used as the helper) that call `POST /conductor/create` with valid license tokens — add `'X-Turnstile-Token': 'test-token'` to each:

```ts
// "creates the session when a valid token is provided" test — line ~68
const res = await SELF.fetch('http://localhost/conductor/create', {
  method: 'POST',
  headers: { ...h, 'X-License-Token': token, 'X-Turnstile-Token': 'test-token' },
  body: JSON.stringify({ conductorCode: 'LIC001', directorToken: 'tok', maxFollowers: 5 }),
});
```

The two 403-returning tests ("absent" and "invalid" license token) do NOT need `X-Turnstile-Token` because they short-circuit before the Turnstile check — wait, actually the Turnstile check runs FIRST (it's wired as middleware before the handler). So those 403-returning tests would now get 403 from Turnstile instead of from license. Add `'X-Turnstile-Token': 'test-token'` to those calls so the license check runs and produces the expected `license_required` error:

```ts
// "returns 403 when X-License-Token header is absent" test
const res = await SELF.fetch('http://localhost/conductor/create', {
  method: 'POST',
  headers: { ...h, 'X-Turnstile-Token': 'test-token' },
  body: JSON.stringify({ conductorCode: 'NOLIC1', directorToken: 'tok', maxFollowers: 5 }),
});
expect(res.status).toBe(403);
const data = await res.json() as { error: string };
expect(data.error).toBe('license_required');

// "returns 403 when X-License-Token is invalid" test
const res = await SELF.fetch('http://localhost/conductor/create', {
  method: 'POST',
  headers: { ...h, 'X-License-Token': 'garbage.token', 'X-Turnstile-Token': 'test-token' },
  body: JSON.stringify({ conductorCode: 'NOLIC2', directorToken: 'tok', maxFollowers: 5 }),
});
expect(res.status).toBe(403);
```

- [ ] **Step 5: Run all worker tests**

```bash
cd songbook-worker && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/src/routes/conductor.ts songbook-worker/src/routes/conductor.test.ts
git commit -m "feat: wire verifyTurnstile on POST /conductor/create"
```

---

## Task 5: Wire middleware on album route + update album tests

**Files:**
- Modify: `songbook-worker/src/routes/album.ts`
- Modify: `songbook-worker/src/routes/album.test.ts`

Only `POST /album` (create) is guarded. `POST /album/:code/track/:trackId` and `POST /album/:code/cover` already require a valid `X-Creator-Token` obtained from the Turnstile-gated create step, so they are excluded.

- [ ] **Step 1: Add the missing-token 403 test to album.test.ts**

In `songbook-worker/src/routes/album.test.ts`, add a new describe block at the end of the file:

```ts
describe('POST /album — Turnstile guard', () => {
  it('returns 403 when X-Turnstile-Token header is missing', async () => {
    const form = new FormData();
    form.append('meta', JSON.stringify({ title: 'T', artist: '', tracks: [] }));
    const res = await SELF.fetch(`${BASE}/album`, { method: 'POST', body: form });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });
});
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
cd songbook-worker && npm test -- album.test.ts
```

Expected: the new test FAILS (returns 201, not 403).

- [ ] **Step 3: Wire the middleware on `POST /album`**

In `songbook-worker/src/routes/album.ts`, add the import and update the route:

```ts
import { Hono } from 'hono';
import type { Env } from '../types';
import {
  AlbumMeta,
  deleteAlbum,
  getAlbumCover,
  getAlbumMetaRaw,
  getAlbumTrack,
  putAlbumCover,
  putAlbumMeta,
  putAlbumTrack,
} from '../lib/r2';
import { verifyTurnstile } from '../middleware/turnstile';

const album = new Hono<{ Bindings: Env }>();

// ... PUBLIC_CORS constant unchanged ...

album.options('*', (c) =>
  new Response(null, { status: 204, headers: PUBLIC_CORS }),
);

// POST /album — create album (metadata + optional cover)
album.post('/', verifyTurnstile, async (c) => {
```

- [ ] **Step 4: Add `X-Turnstile-Token` to the `createAlbum` helper in album.test.ts**

The `createAlbum` helper at the top of `album.test.ts` must include the token, otherwise all tests that use it as a setup step fail:

```ts
async function createAlbum() {
  const form = new FormData();
  form.append('meta', JSON.stringify({
    title: 'Original Title',
    artist: 'Original Artist',
    tracks: [{ trackId: 'track-1', title: 'Song One', duration: 120000, mimeType: 'audio/webm' }],
  }));
  const res = await SELF.fetch(`${BASE}/album`, {
    method: 'POST',
    headers: { 'X-Turnstile-Token': 'test-token' },
    body: form,
  });
  return res.json() as Promise<{ albumCode: string; creatorToken: string }>;
}
```

Also update the direct `POST /album` call in the "cover size guard during creation" describe block (which does NOT use the helper):

```ts
describe('POST /album — cover size guard', () => {
  it('returns 413 when cover blob exceeds 5 MB during album creation', async () => {
    const form = new FormData();
    form.append('meta', JSON.stringify({ title: 'T', artist: '', tracks: [] }));
    const bigCover = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' });
    form.append('cover', bigCover, 'cover.jpg');

    const res = await SELF.fetch(`${BASE}/album`, {
      method: 'POST',
      headers: { 'X-Turnstile-Token': 'test-token' },
      body: form,
    });
    expect(res.status).toBe(413);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('cover_too_large');
  });
});
```

- [ ] **Step 5: Run all worker tests**

```bash
cd songbook-worker && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/src/routes/album.ts songbook-worker/src/routes/album.test.ts
git commit -m "feat: wire verifyTurnstile on POST /album"
```

---

## Task 6: Frontend API function changes + API unit tests

**Files:**
- Modify: `src/lib/shareApi.js`
- Modify: `src/lib/sessionApi.js`
- Modify: `src/lib/conductorApi.js`
- Modify: `src/lib/albumApi.js`
- Modify: `src/test/shareApi.test.js`
- Modify: `src/test/sessionApi.test.js`
- Modify: `src/lib/__tests__/conductorApi.test.js`

Each API function gains a `turnstileToken` parameter and sends it as the `X-Turnstile-Token` request header. `albumApi` has no unit test file; no new file is created.

- [ ] **Step 1: Update `uploadShare` in shareApi.js**

In `src/lib/shareApi.js`, change the `uploadShare` function signature and headers:

```js
export async function uploadShare(blob, expiresInDays = 7, turnstileToken) {
  const res = await fetch(`${WORKER_URL}/share/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'X-Expires-In-Days': String(expiresInDays),
      'X-Turnstile-Token': turnstileToken,
    },
    body: blob,
  });
  if (!res.ok) {
    const err = new Error('upload_failed');
    err.code = 'upload_failed';
    throw err;
  }
  return res.json();
}
```

- [ ] **Step 2: Update shareApi.test.js to verify the token header**

In `src/test/shareApi.test.js`, update the three `uploadShare` tests:

```js
describe('uploadShare', () => {
  it('POSTs blob with correct headers and returns JSON', async () => {
    const mockResult = {
      shareCode: 'abc-123',
      shareUrl: 'http://app?share=abc-123',
      expiresAt: '2026-04-08T00:00:00.000Z',
    };
    fetch.mockResolvedValue({ ok: true, json: async () => mockResult });

    const blob = new Blob(['zip-data'], { type: 'application/zip' });
    const result = await uploadShare(blob, 14, 'my-token');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/upload'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/zip',
          'X-Expires-In-Days': '14',
          'X-Turnstile-Token': 'my-token',
        }),
        body: blob,
      }),
    );
    expect(result).toEqual(mockResult);
  });

  it('uses 7 as default expiresInDays', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadShare(new Blob(['x']), undefined, 'tok');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Expires-In-Days': '7' }),
      }),
    );
  });

  it('throws with code upload_failed on non-ok response', async () => {
    fetch.mockResolvedValue({ ok: false });
    await expect(uploadShare(new Blob(['x']), 7, 'tok')).rejects.toMatchObject({
      code: 'upload_failed',
    });
  });
});
```

- [ ] **Step 3: Update `createSession` in sessionApi.js**

In `src/lib/sessionApi.js`, update `createSession`:

```js
export async function createSession({ name = '', songs = [], turnstileToken } = {}) {
  const res = await fetch(`${WORKER_URL}/session/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Turnstile-Token': turnstileToken,
    },
    body: JSON.stringify({ name, songs }),
  })
  if (!res.ok) throw Object.assign(new Error('create_failed'), { code: 'create_failed' })
  return res.json()
}
```

- [ ] **Step 4: Update sessionApi.test.js**

In `src/test/sessionApi.test.js`, update the `createSession` describe block:

```js
describe('createSession', () => {
  it('returns code and urls on success', async () => {
    mockFetch(200, { code: 'ABC123', leaderToken: 'tok', memberUrl: 'http://x?session=ABC123', leaderUrl: 'http://x?session=ABC123&token=tok', expiresAt: '...' })
    const result = await createSession({ name: 'Test', turnstileToken: 'test-token' })
    expect(result.code).toBe('ABC123')
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/session/create'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends X-Turnstile-Token header', async () => {
    mockFetch(200, { code: 'X', leaderToken: 'y', memberUrl: '', leaderUrl: '', expiresAt: '' })
    await createSession({ name: 'Test', turnstileToken: 'my-token' })
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Turnstile-Token': 'my-token' }),
      })
    )
  })

  it('throws create_failed on non-ok response', async () => {
    mockFetch(500, {})
    await expect(createSession({ turnstileToken: 'tok' })).rejects.toMatchObject({ code: 'create_failed' })
  })
})
```

- [ ] **Step 5: Update `createConductorSession` in conductorApi.js**

In `src/lib/conductorApi.js`, update `createConductorSession`:

```js
export async function createConductorSession({ conductorCode, directorToken, maxFollowers, licenseToken, turnstileToken }) {
  const res = await fetch(`${workerUrl()}/conductor/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(licenseToken ? { 'X-License-Token': licenseToken } : {}),
      'X-Turnstile-Token': turnstileToken,
    },
    body: JSON.stringify({ conductorCode, directorToken, maxFollowers }),
  })
  if (res.status === 403) throw Object.assign(new Error('license_required'), { code: 'license_required' })
  if (!res.ok) throw Object.assign(new Error('create_failed'), { code: 'create_failed' })
  return res.json()
}
```

- [ ] **Step 6: Add a createConductorSession test to conductorApi.test.js**

In `src/lib/__tests__/conductorApi.test.js`, add a new describe block. Also add `createConductorSession` to the existing imports if it is not already there (it is already imported):

```js
describe('createConductorSession', () => {
  it('includes X-Turnstile-Token header in request', async () => {
    mockFetch.mockReturnValue(mockOk({ ok: true }))
    await createConductorSession({
      conductorCode: 'ABC123',
      directorToken: 'dir-tok',
      maxFollowers: 5,
      licenseToken: 'lic-tok',
      turnstileToken: 'tt',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/conductor/create'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Turnstile-Token': 'tt' }),
      })
    )
  })

  it('throws license_required on 403', async () => {
    mockFetch.mockReturnValue(mockStatus(403, { error: 'license_required' }))
    await expect(
      createConductorSession({ conductorCode: 'X', directorToken: 'y', turnstileToken: 'tok' })
    ).rejects.toMatchObject({ code: 'license_required' })
  })
})
```

- [ ] **Step 7: Update `createAlbum` in albumApi.js**

In `src/lib/albumApi.js`, update `createAlbum`:

```js
export async function createAlbum({ title, artist, tracks, coverFile, turnstileToken }) {
  const form = new FormData()
  form.append('meta', JSON.stringify({ title, artist, tracks }))
  if (coverFile) form.append('cover', coverFile)

  const res = await fetch(`${WORKER_URL}/album`, {
    method: 'POST',
    headers: { 'X-Turnstile-Token': turnstileToken },
    body: form,
  })
  if (!res.ok) throw Object.assign(new Error('create_failed'), { code: 'create_failed' })
  return res.json()
}
```

- [ ] **Step 8: Run frontend tests**

```bash
cd /path/to/songbook && npm test -- --reporter=verbose 2>&1 | grep -E "shareApi|sessionApi|conductorApi|FAIL|PASS"
```

Expected: all API unit tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/shareApi.js src/lib/sessionApi.js src/lib/conductorApi.js src/lib/albumApi.js \
        src/test/shareApi.test.js src/test/sessionApi.test.js src/lib/__tests__/conductorApi.test.js
git commit -m "feat: add turnstileToken param to API functions and verify header in unit tests"
```

---

## Task 7: useTurnstile hook + App.jsx widget container

**Files:**
- Create: `src/hooks/useTurnstile.js`
- Modify: `src/App.jsx`

The hook uses module-level variables so all components share a single widget instance. `App.jsx` provides the container `<div>` but never calls the hook.

- [ ] **Step 1: Create the useTurnstile hook**

Create `src/hooks/useTurnstile.js`:

```js
let loadStarted = false;
let widgetId = null;
let pendingResolve = null;
const readyCallbacks = [];

function ensureLoaded() {
  if (loadStarted) return;
  loadStarted = true;

  if (!document.querySelector('script[data-cf-turnstile]')) {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.cfTurnstile = '1';
    document.head.appendChild(script);
  }

  const interval = setInterval(() => {
    if (typeof window.turnstile !== 'undefined' && widgetId === null) {
      clearInterval(interval);
      widgetId = window.turnstile.render('#turnstile-widget', {
        sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
        size: 'invisible',
        callback: (token) => {
          if (pendingResolve) {
            const resolve = pendingResolve;
            pendingResolve = null;
            window.turnstile.reset(widgetId);
            resolve(token);
          }
        },
      });
      readyCallbacks.forEach(cb => cb());
      readyCallbacks.length = 0;
    }
  }, 100);
}

async function getToken() {
  ensureLoaded();
  if (widgetId === null) {
    await new Promise(resolve => readyCallbacks.push(resolve));
  }
  return new Promise(resolve => {
    pendingResolve = resolve;
    window.turnstile.execute(widgetId);
  });
}

export default function useTurnstile() {
  ensureLoaded();
  return { getToken };
}
```

- [ ] **Step 2: Add the hidden widget container to App.jsx**

In `src/App.jsx`, add the container div immediately before the closing `</LicenseProvider>` tag (after `</ThemeProvider>` is not closed at that point — add it inside the JSX return but outside any conditional rendering). The best location is just before the closing `</LicenseProvider>` tag, after the last modal:

Find this section near the end of the return statement:
```jsx
      </LicenseProvider>
    </ThemeProvider>
  )
}
```

Change to:
```jsx
      <div id="turnstile-widget" style={{ display: 'none' }} />
      </LicenseProvider>
    </ThemeProvider>
  )
}
```

The div must be in the DOM before any modal triggers `getToken()`. Placing it just inside `<LicenseProvider>` (which wraps everything) ensures it's always mounted.

- [ ] **Step 3: Run frontend tests**

```bash
npm test
```

Expected: all existing tests pass. The hook is not yet used by any component, so no mocking is needed yet.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTurnstile.js src/App.jsx
git commit -m "feat: add useTurnstile hook and #turnstile-widget container in App"
```

---

## Task 8: Modal changes + test mocks + .env.example

**Files:**
- Modify: `src/components/Share/ShareModal.jsx`
- Modify: `src/components/Session/LiveSessionModal.jsx`
- Modify: `src/components/Album/NewAlbumCreator.jsx`
- Modify: `src/test/ShareModal.test.jsx`
- Modify: `src/components/Share/__tests__/ShareModal.conductor.test.jsx`
- Modify: `src/test/NewAlbumCreator.test.jsx`
- Modify: `src/test/NewAlbumCreator.edit.test.jsx`
- Modify: `.env.example`

Each modal calls `useTurnstile()` at the top and `getToken()` immediately before its guarded API call. `ShareModal` makes two separate `getToken()` calls — one before `uploadShare` and one before `createConductorSession`.

- [ ] **Step 1: Update ShareModal.jsx**

Add the import at the top of `src/components/Share/ShareModal.jsx`:

```js
import useTurnstile from '../../hooks/useTurnstile';
```

Add the hook call at the top of the `ShareModal` component body (after the existing `useLicense()` call):

```js
const { getToken } = useTurnstile();
```

In `handleCreateLink`, add token acquisition before `uploadShare` and before `createConductorSession`:

```js
async function handleCreateLink() {
  setStep('uploading')
  setErrorMessage('')
  try {
    let conductorCode = null
    let directorToken = null

    if (conductorEnabled) {
      conductorCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
        .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
      directorToken = uuidv4()
    }

    const blob = await exportSongsAsSbp(songs, nameValue.trim() || null, shareLyricsOnly, conductorCode)

    const uploadToken = await getToken()
    let result
    try {
      result = await uploadShare(blob, expiresInDays, uploadToken)
    } catch (err) {
      console.error('[ShareModal] upload failed:', err)
      setErrorMessage('Upload failed. Please check your connection and try again.')
      setStep('error')
      return
    }

    // Backfill sbpId on in-app-created songs so conductor sync can track them
    songs.forEach(song => {
      if (song.meta.sbpId == null) {
        backfillSongSbpId(song.id, computeExportId(song))
      }
    })

    if (conductorEnabled) {
      const conductorToken = await getToken()
      try {
        await createConductorSession({ conductorCode, directorToken, maxFollowers, licenseToken, turnstileToken: conductorToken })
      } catch (err) {
        console.error('[ShareModal] conductor session creation failed:', err)
        setErrorMessage('Conductor session could not be created. The share link was not saved.')
        setStep('error')
        return
      }
      // ... rest of conductor block unchanged
```

- [ ] **Step 2: Update LiveSessionModal.jsx**

Add the import at the top of `src/components/Session/LiveSessionModal.jsx`:

```js
import useTurnstile from '../../hooks/useTurnstile';
```

Add the hook call at the top of the `LiveSessionModal` component body:

```js
const { getToken } = useTurnstile();
```

In `handleCreate`, add token acquisition before `createSession`:

```js
async function handleCreate() {
  setLoading(true)
  setError(null)
  try {
    const name = sessionName.trim() || defaultName()
    const token = await getToken()
    const data = await createSession({ name, songs: [], turnstileToken: token })
    handleClose()
    onStartSession({ code: data.code, leaderToken: data.leaderToken, name })
  } catch {
    setError({ field: 'start', message: 'Could not create session. Check your connection.' })
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 3: Update NewAlbumCreator.jsx**

Add the import at the top of `src/components/Album/NewAlbumCreator.jsx`:

```js
import useTurnstile from '../../hooks/useTurnstile';
```

Add the hook call at the top of the `NewAlbumCreator` component body (after the existing store subscriptions):

```js
const { getToken } = useTurnstile();
```

In `handlePublish`, in the create branch (the `else` block), add token acquisition before `createAlbum`:

```js
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
        const turnstileToken = await getToken()
        const { albumCode, creatorToken } = await createAlbum({
          title: effectiveTitle,
          artist: artist.trim(),
          coverFile: coverFile ?? null,
          tracks: trackMeta.map(({ trackId, title: t, duration, mimeType }) => ({ trackId, title: t, duration, mimeType })),
          turnstileToken,
        })
        // ... rest of create block unchanged
```

- [ ] **Step 4: Add useTurnstile mock to ShareModal.test.jsx**

In `src/test/ShareModal.test.jsx`, add the mock after the existing `vi.mock` calls:

```js
vi.mock('../hooks/useTurnstile', () => ({
  default: () => ({ getToken: async () => 'mock-token' }),
}))
```

- [ ] **Step 5: Add useTurnstile mock to ShareModal.conductor.test.jsx**

Read `src/components/Share/__tests__/ShareModal.conductor.test.jsx` first to find the correct location. Add the mock after the existing `vi.mock` calls:

```js
vi.mock('../../../hooks/useTurnstile', () => ({
  default: () => ({ getToken: async () => 'mock-token' }),
}))
```

- [ ] **Step 6: Add useTurnstile mock to NewAlbumCreator.test.jsx**

In `src/test/NewAlbumCreator.test.jsx`, add the mock after the existing `vi.mock` calls:

```js
vi.mock('../hooks/useTurnstile', () => ({
  default: () => ({ getToken: async () => 'mock-token' }),
}))
```

- [ ] **Step 7: Add useTurnstile mock to NewAlbumCreator.edit.test.jsx**

In `src/test/NewAlbumCreator.edit.test.jsx`, add the same mock after the existing `vi.mock` calls:

```js
vi.mock('../hooks/useTurnstile', () => ({
  default: () => ({ getToken: async () => 'mock-token' }),
}))
```

- [ ] **Step 8: Update .env.example**

Append to `.env.example`:

```
# Cloudflare Turnstile site key
# Dev test key (always passes, no CAPTCHA shown): 1x00000000000000000000AA
# Production: obtain from Cloudflare Dashboard → Turnstile → Add site
VITE_TURNSTILE_SITE_KEY=
```

- [ ] **Step 9: Update your local .env.local for dev**

Add this line to `.env.local` (not committed — already gitignored):
```
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

- [ ] **Step 10: Run all frontend tests**

```bash
npm test
```

Expected: all frontend tests pass. The `useTurnstile` mock resolves `getToken()` immediately with `'mock-token'`, so all existing modal tests continue to pass unchanged.

- [ ] **Step 11: Run all worker tests**

```bash
cd songbook-worker && npm test
```

Expected: all worker tests pass.

- [ ] **Step 12: Commit**

```bash
git add src/components/Share/ShareModal.jsx \
        src/components/Session/LiveSessionModal.jsx \
        src/components/Album/NewAlbumCreator.jsx \
        src/test/ShareModal.test.jsx \
        "src/components/Share/__tests__/ShareModal.conductor.test.jsx" \
        src/test/NewAlbumCreator.test.jsx \
        src/test/NewAlbumCreator.edit.test.jsx \
        .env.example
git commit -m "feat: wire Turnstile token into ShareModal, LiveSessionModal, and NewAlbumCreator"
```

---

## Production Setup

After the implementation is complete, configure the real keys:

```bash
# Set the secret key in Cloudflare Workers
wrangler secret put TURNSTILE_SECRET_KEY
# When prompted, paste the real secret key from CF Dashboard → Turnstile → your site

# Set the site key for production frontend
# Add VITE_TURNSTILE_SITE_KEY=<real-site-key> to your CI environment variables
# or to .env.production (gitignored)
```

Both keys are obtained from **Cloudflare Dashboard → Turnstile → Add site** after adding your production domain.
