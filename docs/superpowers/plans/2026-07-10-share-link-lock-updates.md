# Lock Push Updates on Share Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone holding a share link freeze it so `PUT /share/:code` (Push Update) is rejected for everyone, toggleable independently of Push Update itself, and settable up front when creating a new link.

**Architecture:** A `locked` boolean is stored in the R2 object's `customMetadata` alongside the existing `expiresAt`/`version`. It is read/written through a dedicated `PATCH /share/:code/lock` endpoint — never bundled into the `PUT` push-update request — so a locked link can always be unlocked even though the Push Update button is disabled while locked. The Share modal live-checks lock state from the server each time it opens in update mode, and exposes a toggle that stays interactive even when every other field in the modal is frozen.

**Tech Stack:** Cloudflare Worker (Hono) + R2 for the backend (`songbook-worker/`); React + Vitest + Testing Library for the frontend (`src/`).

## Global Constraints

- No authentication on lock/unlock — matches the existing no-account model (anyone with the link can already Push Update today)
- Locking blocks `PUT` only — `GET`/`HEAD` (viewing, version checks) are unaffected
- The lock toggle is never disabled by `isUpdateMode`, unlike every other field in `ShareModal.jsx` (name, expiry, lyrics-only, conductor) — it must stay editable so an existing link can be locked/unlocked without creating a new one
- Default is unlocked, both for brand-new links and as the fallback if a live lock check fails — no behavior change unless a user opts in
- Push Update button is disabled (grayed out) when locked, with an inline note explaining why; New Link stays enabled regardless of the old link's lock state

---

### Task 1: Worker — `locked` field on R2 share metadata

**Files:**
- Modify: `songbook-worker/src/lib/r2.ts:1-39` (`putShare`, `headShare`, `getShareIfValid`)
- Test: `songbook-worker/test/share.test.ts`

**Interfaces:**
- Consumes: nothing new (uses existing `R2Bucket` binding)
- Produces:
  - `putShare(bucket, shareCode, body, expiresAt, version = 1, locked = false): Promise<void>`
  - `headShare(bucket, shareCode): Promise<{ version: number; expiresAt: Date; locked: boolean } | { error: 'not_found' | 'expired' }>`
  - `getShareIfValid(bucket, shareCode): Promise<{ object: R2ObjectBody; version: number; locked: boolean } | { error: 'not_found' | 'expired' }>`

- [ ] **Step 1: Write the failing tests**

Append to `songbook-worker/test/share.test.ts` (after the existing `describe('putShare', ...)` block):

```ts
describe('putShare — locked metadata', () => {
  it('defaults locked to false when not passed', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await putShare(env.R2_BUCKET, 'test-put-default-lock', body, expiresAt);

    const obj = await env.R2_BUCKET.head('test-put-default-lock');
    expect(obj?.customMetadata?.locked).toBe('false');
  });

  it('writes locked: true when passed', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await putShare(env.R2_BUCKET, 'test-put-locked', body, expiresAt, 1, true);

    const obj = await env.R2_BUCKET.head('test-put-locked');
    expect(obj?.customMetadata?.locked).toBe('true');
  });
});
```

Append to the existing `describe('getShareIfValid', ...)` block's sibling scope (add a new `import { headShare } from '../src/lib/r2';` alongside the existing `putShare, getShareIfValid` import at the top of the file):

```ts
describe('headShare — locked field', () => {
  it('returns locked: false for an object with no locked metadata', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('head-no-lock', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString() },
    });
    const result = await headShare(env.R2_BUCKET, 'head-no-lock');
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.locked).toBe(false);
  });

  it('returns locked: true when metadata says so', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('head-locked', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString(), locked: 'true' },
    });
    const result = await headShare(env.R2_BUCKET, 'head-locked');
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.locked).toBe(true);
  });
});

describe('getShareIfValid — locked field', () => {
  it('surfaces locked from the underlying head', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('valid-locked', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString(), locked: 'true' },
    });
    const result = await getShareIfValid(env.R2_BUCKET, 'valid-locked');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.locked).toBe(true);
      await result.object.arrayBuffer(); // consume stream to avoid isolated-storage leak
    }
  });
});
```

Update the import line at the top of `songbook-worker/test/share.test.ts` from:
```ts
import { putShare, getShareIfValid } from '../src/lib/r2';
```
to:
```ts
import { putShare, getShareIfValid, headShare } from '../src/lib/r2';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd songbook-worker && npx vitest run test/share.test.ts`
Expected: FAIL — `obj?.customMetadata?.locked` is `undefined`, not `'false'`/`'true'`; `result.locked` is `undefined`.

- [ ] **Step 3: Implement**

Replace `songbook-worker/src/lib/r2.ts` lines 1-39 with:

```ts
export async function putShare(
  bucket: R2Bucket,
  shareCode: string,
  body: ArrayBuffer | Uint8Array | ReadableStream,
  expiresAt: Date,
  version = 1,
  locked = false,
): Promise<void> {
  await bucket.put(shareCode, body, {
    customMetadata: {
      expiresAt: expiresAt.toISOString(),
      version: String(version),
      locked: String(locked),
    },
    httpMetadata: { contentType: 'application/zip' },
  });
}

export async function headShare(
  bucket: R2Bucket,
  shareCode: string,
): Promise<
  { version: number; expiresAt: Date; locked: boolean } | { error: 'not_found' | 'expired' }
> {
  const head = await bucket.head(shareCode);
  if (!head) return { error: 'not_found' };

  const expiresAt = new Date(head.customMetadata?.expiresAt ?? '');
  if (isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
    return { error: 'expired' };
  }

  return {
    version: Number(head.customMetadata?.version ?? 1),
    expiresAt,
    locked: head.customMetadata?.locked === 'true',
  };
}

export async function getShareIfValid(
  bucket: R2Bucket,
  shareCode: string,
): Promise<
  { object: R2ObjectBody; version: number; locked: boolean } | { error: 'not_found' | 'expired' }
> {
  const head = await headShare(bucket, shareCode);
  if ('error' in head) return head;

  const object = await bucket.get(shareCode);
  if (!object) return { error: 'not_found' };
  return { object, version: head.version, locked: head.locked };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd songbook-worker && npx vitest run test/share.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/lib/r2.ts songbook-worker/test/share.test.ts
git commit -m "feat(worker): add locked field to share R2 metadata"
```

---

### Task 2: Worker — lock enforcement (`PATCH /:code/lock`, `PUT /:code` rejection)

**Files:**
- Modify: `songbook-worker/src/routes/share.ts:59-77` (`PUT /:code` handler), add new `PATCH /:code/lock` handler
- Test: `songbook-worker/src/routes/share.test.ts`

**Interfaces:**
- Consumes: `putShare`, `headShare` from Task 1 (`songbook-worker/src/lib/r2.ts`)
- Produces: `PATCH /share/:code/lock` — body `{ locked: boolean }` → `200 { locked: boolean }` / `404` / `410` / `400`. `PUT /share/:code` now also returns `423 { error: 'locked' }` when the share is locked.

- [ ] **Step 1: Write the failing tests**

Add a top-level helper and new `describe` blocks to `songbook-worker/src/routes/share.test.ts` (after the existing `import` line, before the first `describe`):

```ts
async function createShare(headers: Record<string, string> = {}) {
  const res = await SELF.fetch('http://localhost/share/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      Origin: ORIGIN,
      'X-Turnstile-Token': 'test-token',
      ...headers,
    },
    body: new Uint8Array([1, 2, 3]),
  });
  return (await res.json()) as { shareCode: string; shareUrl: string; expiresAt: string };
}
```

Append at the end of the file:

```ts
describe('PATCH /share/:code/lock', () => {
  it('locks a share and PUT is then rejected with 423', async () => {
    const { shareCode } = await createShare();

    const lockRes = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });
    expect(lockRes.status).toBe(200);
    expect(await lockRes.json()).toEqual({ locked: true });

    const putRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip', Origin: ORIGIN },
      body: new Uint8Array([4, 5, 6]),
    });
    expect(putRes.status).toBe(423);
    expect(await putRes.json()).toEqual({ error: 'locked' });
  });

  it('unlocks a share and PUT succeeds again', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false }),
    });

    const putRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip', Origin: ORIGIN },
      body: new Uint8Array([4, 5, 6]),
    });
    expect(putRes.status).toBe(200);
  });

  it('returns 404 for a non-existent share code', async () => {
    const res = await SELF.fetch('http://localhost/share/does-not-exist/lock', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when the body is missing a boolean locked field', async () => {
    const { shareCode } = await createShare();
    const res = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('preserves the stored blob content after a lock toggle', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });

    const getRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      headers: { Origin: ORIGIN },
    });
    const buf = new Uint8Array(await getRes.arrayBuffer());
    expect(buf).toEqual(new Uint8Array([1, 2, 3]));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd songbook-worker && npx vitest run src/routes/share.test.ts`
Expected: FAIL — `PATCH /share/:code/lock` doesn't exist (404 from Hono's default not-found), and `PUT` never returns 423.

- [ ] **Step 3: Implement**

In `songbook-worker/src/routes/share.ts`, replace the `share.put('/:code', ...)` block (lines 59-77) with:

```ts
share.put('/:code', async (c) => {
  const shareCode = c.req.param('code');

  const existing = await headShare(c.env.R2_BUCKET, shareCode);
  if ('error' in existing) {
    const status = existing.error === 'not_found' ? 404 : 410;
    return c.json({ error: existing.error }, status);
  }
  if (existing.locked) {
    return c.json({ error: 'locked' }, 423);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: 'no_body' }, 400);
  if (body.byteLength > 10 * 1024 * 1024) return c.json({ error: 'too_large' }, 413);

  const newVersion = existing.version + 1;
  const updatedAt = new Date();
  await putShare(c.env.R2_BUCKET, shareCode, body, existing.expiresAt, newVersion, existing.locked);

  return c.json({ version: newVersion, updatedAt: updatedAt.toISOString() });
});

share.patch('/:code/lock', async (c) => {
  const shareCode = c.req.param('code');

  const existing = await headShare(c.env.R2_BUCKET, shareCode);
  if ('error' in existing) {
    const status = existing.error === 'not_found' ? 404 : 410;
    return c.json({ error: existing.error }, status);
  }

  let payload: { locked?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }
  if (typeof payload.locked !== 'boolean') {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const object = await c.env.R2_BUCKET.get(shareCode);
  if (!object) return c.json({ error: 'not_found' }, 404);
  const body = await object.arrayBuffer();

  await putShare(c.env.R2_BUCKET, shareCode, body, existing.expiresAt, existing.version, payload.locked);

  return c.json({ locked: payload.locked });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd songbook-worker && npx vitest run src/routes/share.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/routes/share.ts songbook-worker/src/routes/share.test.ts
git commit -m "feat(worker): add PATCH /share/:code/lock, block PUT when locked"
```

---

### Task 3: Worker — expose lock state on read, accept initial lock on create, CORS

**Files:**
- Modify: `songbook-worker/src/routes/share.ts` (`HEAD /:code`, `GET /:code`, `POST /upload` handlers)
- Modify: `songbook-worker/src/index.ts:23-44` (CORS headers)
- Test: `songbook-worker/src/routes/share.test.ts`

**Interfaces:**
- Consumes: `headShare`, `getShareIfValid`, `putShare` from Task 1
- Produces: `HEAD`/`GET /share/:code` responses carry an `X-Share-Locked: true|false` header, readable from the browser. `POST /share/upload` accepts an `X-Locked: true|false` request header to set the new link's initial lock state.

- [ ] **Step 1: Write the failing tests**

Append to `songbook-worker/src/routes/share.test.ts`:

```ts
describe('HEAD/GET /share/:code — X-Share-Locked header', () => {
  it('HEAD exposes X-Share-Locked: false by default', async () => {
    const { shareCode } = await createShare();
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(res.headers.get('X-Share-Locked')).toBe('false');
  });

  it('HEAD exposes X-Share-Locked: true after locking', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(res.headers.get('X-Share-Locked')).toBe('true');
  });

  it('GET exposes X-Share-Locked and Access-Control-Expose-Headers includes it', async () => {
    const { shareCode } = await createShare();
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      headers: { Origin: ORIGIN },
    });
    const exposeHeaders = res.headers.get('Access-Control-Expose-Headers') ?? '';
    const locked = res.headers.get('X-Share-Locked');
    await res.arrayBuffer();
    expect(locked).toBe('false');
    expect(exposeHeaders).toContain('X-Share-Locked');
  });
});

describe('POST /share/upload — X-Locked header', () => {
  it('creates a pre-locked share when X-Locked: true is sent', async () => {
    const { shareCode } = await createShare({ 'X-Locked': 'true' });
    const headRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(headRes.headers.get('X-Share-Locked')).toBe('true');
  });

  it('defaults to unlocked when X-Locked is omitted', async () => {
    const { shareCode } = await createShare();
    const headRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(headRes.headers.get('X-Share-Locked')).toBe('false');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd songbook-worker && npx vitest run src/routes/share.test.ts`
Expected: FAIL — `X-Share-Locked` header is `null` on all responses; `Access-Control-Expose-Headers` doesn't contain it.

- [ ] **Step 3: Implement**

In `songbook-worker/src/routes/share.ts`, update the `POST /upload` handler:

```ts
share.post('/upload', verifyTurnstile, async (c) => {
  const rawDays = Number(c.req.header('X-Expires-In-Days') ?? '7');
  const expiresInDays = isNaN(rawDays) ? 7 : Math.min(30, Math.max(1, rawDays));
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const locked = c.req.header('X-Locked') === 'true';

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: 'no_body' }, 400);
  if (body.byteLength > 10 * 1024 * 1024) return c.json({ error: 'too_large' }, 413);

  const shareCode = crypto.randomUUID();
  await putShare(c.env.R2_BUCKET, shareCode, body, expiresAt, 1, locked);

  const shareUrl = `${c.env.APP_ORIGIN}?share=${shareCode}`;
  return c.json({ shareCode, shareUrl, expiresAt: expiresAt.toISOString() });
});
```

Update the `HEAD /:code` handler:

```ts
share.on('HEAD', '/:code', async (c) => {
  const shareCode = c.req.param('code');
  const result = await headShare(c.env.R2_BUCKET, shareCode);

  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : 410;
    return c.body(null, status);
  }

  return c.body(null, 200, {
    'X-Share-Version': String(result.version),
    'X-Share-Locked': String(result.locked),
    // no-store: a live share is mutable; clients must always read the current version.
    'Cache-Control': 'no-store',
  });
});
```

Update the `GET /:code` handler:

```ts
share.get('/:code', async (c) => {
  const shareCode = c.req.param('code');
  const result = await getShareIfValid(c.env.R2_BUCKET, shareCode);

  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : 410;
    return c.json({ error: result.error }, status);
  }

  return new Response(result.object.body, {
    headers: {
      'Content-Type': 'application/zip',
      'X-Share-Version': String(result.version),
      'X-Share-Locked': String(result.locked),
      // no-store: a live share blob changes on every Push Update; never serve a cached copy.
      'Cache-Control': 'no-store',
    },
  });
});
```

In `songbook-worker/src/index.ts`, update the CORS middleware (lines 23-44):

```ts
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed ? requestOrigin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In-Days, X-Leader-Token, X-Director-Token, X-Conductor-Token, X-Creator-Token, X-License-Token, X-Turnstile-Token, X-Locked',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  if (allowed) {
    c.res.headers.set('Access-Control-Allow-Origin', requestOrigin);
    c.res.headers.set('Vary', 'Origin');
    // Expose custom response headers so browser JS can read them. Without this,
    // X-Share-Version/X-Share-Locked are hidden from fetch() and the client falls back to defaults.
    c.res.headers.set('Access-Control-Expose-Headers', 'X-Share-Version, X-Share-Locked');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd songbook-worker && npx vitest run`
Expected: PASS — full worker suite, including all existing `share.test.ts`/`test/share.test.ts` tests plus the new ones.

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/routes/share.ts songbook-worker/src/index.ts songbook-worker/src/routes/share.test.ts
git commit -m "feat(worker): expose X-Share-Locked header, accept X-Locked on upload"
```

---

### Task 4: Frontend — `shareApi.js` client functions

**Files:**
- Modify: `src/lib/shareApi.js` (`uploadShare`, `checkShareVersion`, `updateShare`), add `setShareLocked`
- Test: `src/test/shareApi.test.js`

**Interfaces:**
- Consumes: worker endpoints from Tasks 2-3 (`PATCH /share/:code/lock`, `X-Share-Locked` header, `X-Locked` request header)
- Produces:
  - `uploadShare(blob, expiresInDays = 7, turnstileToken, locked = false) → { shareCode, shareUrl, expiresAt }`
  - `checkShareVersion(shareCode) → { version: number, locked: boolean }` (was `{ version }`)
  - `updateShare(shareCode, blob)` — now also throws `Object.assign(new Error('locked'), { code: 'locked' })` on `423`
  - `setShareLocked(shareCode, locked: boolean) → { locked: boolean }`

- [ ] **Step 1: Write the failing tests**

Add to `src/test/shareApi.test.js`. First, update the import line at the top:

```js
import { uploadShare, fetchShare, checkShareVersion, updateShare, setShareLocked } from '../lib/shareApi';
```

Add to the existing `describe('uploadShare', ...)` block:

```js
  it('sends X-Locked: false by default', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadShare(new Blob(['x']), 7, 'tok');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Locked': 'false' }),
      }),
    );
  });

  it('sends X-Locked: true when locked is passed', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadShare(new Blob(['x']), 7, 'tok', true);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Locked': 'true' }),
      }),
    );
  });
```

Add to the existing `describe('checkShareVersion', ...)` block:

```js
  it('returns locked: true from X-Share-Locked header', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: (h) => (h === 'X-Share-Version' ? '3' : h === 'X-Share-Locked' ? 'true' : null) },
      text: async () => '',
    });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 3, locked: true });
  });

  it('defaults locked to false when X-Share-Locked header is absent', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => '',
    });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 1, locked: false });
  });
```

Add to the existing `describe('updateShare', ...)` block:

```js
  it('throws with code locked on 423', async () => {
    fetch.mockResolvedValue({ status: 423, ok: false });
    await expect(updateShare('abc', new Blob(['x']))).rejects.toMatchObject({ code: 'locked' });
  });
```

Add a new `describe` block at the end of the file:

```js
describe('setShareLocked', () => {
  it('PATCHes /share/{shareCode}/lock with JSON body and returns { locked }', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ locked: true }) });
    const result = await setShareLocked('abc-123', true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/abc-123/lock'),
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ locked: true }),
      }),
    );
    expect(result).toEqual({ locked: true });
  });

  it('throws with code not_found on 404', async () => {
    fetch.mockResolvedValue({ status: 404, ok: false });
    await expect(setShareLocked('abc', true)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws with code expired on 410', async () => {
    fetch.mockResolvedValue({ status: 410, ok: false });
    await expect(setShareLocked('abc', true)).rejects.toMatchObject({ code: 'expired' });
  });

  it('throws with code lock_failed on other failure', async () => {
    fetch.mockResolvedValue({ status: 500, ok: false });
    await expect(setShareLocked('abc', true)).rejects.toMatchObject({ code: 'lock_failed' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/shareApi.test.js`
Expected: FAIL — `setShareLocked` is not exported; `uploadShare` doesn't send `X-Locked`; `checkShareVersion` doesn't return `locked`; `updateShare` doesn't throw `code: 'locked'` on 423.

- [ ] **Step 3: Implement**

Replace the full contents of `src/lib/shareApi.js`:

```js
const WORKER_URL = import.meta.env.VITE_WORKER_URL;
if (!WORKER_URL && import.meta.env.DEV) {
  console.warn('VITE_WORKER_URL is not set. Create .env.local with VITE_WORKER_URL=https://...');
}

export async function uploadShare(blob, expiresInDays = 7, turnstileToken, locked = false) {
  const res = await fetch(`${WORKER_URL}/share/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'X-Expires-In-Days': String(expiresInDays),
      'X-Turnstile-Token': turnstileToken,
      'X-Locked': String(locked),
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

export async function fetchShare(shareCode) {
  // cache: 'no-store' — a live share blob changes on every Push Update; a cached copy
  // would silently merge stale data on refresh.
  const res = await fetch(`${WORKER_URL}/share/${shareCode}`, { cache: 'no-store' });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' });
  return res.arrayBuffer();
}

export async function checkShareVersion(shareCode) {
  // cache: 'no-store' — the version header must reflect the current server state, never a
  // cached value, or "Check for updates" wrongly reports "Already up to date".
  const res = await fetch(`${WORKER_URL}/share/${shareCode}`, { method: 'HEAD', cache: 'no-store' });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' });
  const version = Number(res.headers.get('X-Share-Version') ?? 1);
  const locked = res.headers.get('X-Share-Locked') === 'true';
  return { version, locked };
}

export async function updateShare(shareCode, blob) {
  const res = await fetch(`${WORKER_URL}/share/${shareCode}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/zip' },
    body: blob,
  });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (res.status === 423) throw Object.assign(new Error('locked'), { code: 'locked' });
  if (!res.ok) throw Object.assign(new Error('update_failed'), { code: 'update_failed' });
  return res.json();
}

export async function setShareLocked(shareCode, locked) {
  const res = await fetch(`${WORKER_URL}/share/${shareCode}/lock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locked }),
  });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (!res.ok) throw Object.assign(new Error('lock_failed'), { code: 'lock_failed' });
  return res.json();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/shareApi.test.js`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/shareApi.js src/test/shareApi.test.js
git commit -m "feat: add setShareLocked and lock support to shareApi client"
```

---

### Task 5: Frontend — `ShareModal.jsx` lock toggle UI

**Files:**
- Modify: `src/components/Share/ShareModal.jsx`
- Test: `src/test/ShareModal.test.jsx`

**Interfaces:**
- Consumes: `checkShareVersion`, `setShareLocked`, `uploadShare(..., locked)`, `updateShare` (throws `code: 'locked'`) from Task 4 (`src/lib/shareApi.js`)
- Produces: no new exports — this is a leaf UI component. Renders a `role="switch"` element with `aria-label="Lock link"`.

- [ ] **Step 1: Write the failing tests**

Update the `vi.mock('../lib/shareApi', ...)` line near the top of `src/test/ShareModal.test.jsx` from:
```js
vi.mock('../lib/shareApi', () => ({ uploadShare: vi.fn(), updateShare: vi.fn() }));
```
to:
```js
vi.mock('../lib/shareApi', () => ({
  uploadShare: vi.fn(),
  updateShare: vi.fn(),
  checkShareVersion: vi.fn().mockResolvedValue({ version: 1, locked: false }),
  setShareLocked: vi.fn().mockResolvedValue({ locked: true }),
}));
```
and the import line below it from:
```js
import { uploadShare, updateShare } from '../lib/shareApi';
```
to:
```js
import { uploadShare, updateShare, checkShareVersion, setShareLocked } from '../lib/shareApi';
```

Add a new test to the top-level `describe('ShareModal', ...)` block (create mode):

```js
  it('renders "Lock link" toggle unchecked by default in create mode', () => {
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    const toggle = screen.getByRole('switch', { name: /lock link/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('passes locked=true to uploadShare when "Lock link" is checked before Create link', async () => {
    uploadShare.mockResolvedValue({
      shareCode: 'x',
      shareUrl: 'http://app?share=x',
      expiresAt: new Date().toISOString(),
    });
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('switch', { name: /lock link/i }));
    fireEvent.click(screen.getByText('Create link'));
    await screen.findByDisplayValue('http://app?share=x');
    expect(uploadShare).toHaveBeenCalledWith(expect.anything(), 7, 'mock-token', true);
  });
```

Add new tests inside the existing `describe('ShareModal — update mode', ...)` block (after its existing `beforeEach`):

```js
  it('checks live lock state on open and reflects it on the toggle', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(checkShareVersion).toHaveBeenCalledWith('abc-123');
  });

  it('disables Push Update and shows a note when the live link is locked', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /push update/i })).toBeDisabled());
    expect(screen.getByText(/push update is disabled — this link is locked/i)).toBeInTheDocument();
  });

  it('toggling "Lock link" in update mode calls setShareLocked immediately', async () => {
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(setShareLocked).toHaveBeenCalledWith('abc-123', true));
  });

  it('reverts the toggle and shows an error if setShareLocked fails', async () => {
    setShareLocked.mockRejectedValueOnce(Object.assign(new Error('lock_failed'), { code: 'lock_failed' }));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByText(/couldn't update lock/i)).toBeInTheDocument();
  });

  it('shows a locked-specific error when Push Update hits a 423 mid-flight', async () => {
    updateShare.mockRejectedValue(Object.assign(new Error('locked'), { code: 'locked' }));
    exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /push update/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /push update/i }));
    expect(await screen.findByText(/unlock it before pushing updates/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/ShareModal.test.jsx`
Expected: FAIL — no "Lock link" switch exists yet; Push Update is never disabled; `checkShareVersion`/`setShareLocked` are never called by the component.

- [ ] **Step 3: Implement**

In `src/components/Share/ShareModal.jsx`, update the import at line 5 from:
```js
import { uploadShare, updateShare } from '../../lib/shareApi';
```
to:
```js
import { uploadShare, updateShare, checkShareVersion, setShareLocked } from '../../lib/shareApi';
```

Add new state below the existing `shareLyricsOnly` state (near line 20):
```js
  const [locked, setLocked] = useState(false);
  const [lockStatus, setLockStatus] = useState('idle'); // 'idle' | 'checking' | 'saving' | 'error'
```

Add a new effect below the existing `nameValue` sync effect (near line 30), to live-check lock state whenever the modal opens on an existing link:
```js
  // Live-check lock state on open — another holder of the link may have
  // changed it since we last saw this collection, so we never trust a stale cache.
  useEffect(() => {
    if (!isOpen || !isUpdateMode) return;
    let cancelled = false;
    setLockStatus('checking');
    checkShareVersion(collection.shareCode)
      .then(({ locked: serverLocked }) => {
        if (cancelled) return;
        setLocked(serverLocked);
        setLockStatus('idle');
      })
      .catch(() => {
        if (cancelled) return;
        setLockStatus('idle');
      });
    return () => { cancelled = true };
  }, [isOpen, isUpdateMode, collection?.shareCode]);
```

Add a new handler below `handlePushUpdate` (after line 175):
```js
  async function handleToggleLocked() {
    const nextLocked = !locked;
    if (!isUpdateMode) {
      setLocked(nextLocked);
      return;
    }
    setLocked(nextLocked);
    setLockStatus('saving');
    try {
      await setShareLocked(collection.shareCode, nextLocked);
      setLockStatus('idle');
    } catch (err) {
      console.error('[ShareModal] lock toggle failed:', err);
      setLocked(!nextLocked);
      setLockStatus('error');
    }
  }
```

In `handleCreateLink`, change the upload call (near line 85) from:
```js
        result = await uploadShare(blob, expiresInDays, shareToken)
```
to:
```js
        result = await uploadShare(blob, expiresInDays, shareToken, locked)
```

In `handlePushUpdate`, replace the `catch` block (lines 170-174) from:
```js
    } catch (err) {
      console.error('[ShareModal] push update failed:', err)
      setErrorMessage('Update failed. Please check your connection and try again.')
      setStep('error')
    }
```
to:
```js
    } catch (err) {
      console.error('[ShareModal] push update failed:', err)
      if (err.code === 'locked') {
        setLocked(true)
        setErrorMessage('This link is locked. Unlock it before pushing updates.')
      } else {
        setErrorMessage('Update failed. Please check your connection and try again.')
      }
      setStep('error')
    }
```

In `handleClose`, add two lines after `setShareLyricsOnly(false);` (near line 228):
```js
    setLocked(false);
    setLockStatus('idle');
```

Add the toggle JSX directly after the existing "Share lyrics only" `<div>` block (after line 322, before the `{/* Conductor broadcast section */}` comment):
```jsx
          <div>
            <button
              type="button"
              role="switch"
              aria-checked={locked}
              aria-label="Lock link"
              onClick={handleToggleLocked}
              disabled={lockStatus === 'checking' || lockStatus === 'saving'}
              className={`flex items-center gap-3 w-full text-left ${lockStatus === 'checking' || lockStatus === 'saving' ? 'opacity-50 cursor-wait' : ''}`}
            >
              <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                transition-colors duration-200
                ${locked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                  ${locked ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Lock link</span>
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-14">
              When locked, no one — including you — can push new content until you unlock it.
            </p>
            {lockStatus === 'error' && (
              <p className="text-xs text-red-500 mt-1 ml-14">Couldn't update lock — check your connection.</p>
            )}
          </div>
```

Update the button row (lines 403-417) from:
```jsx
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            {isUpdateMode ? (
              <>
                <Button variant="secondary" onClick={handleCreateLink} aria-label="New link">
                  New link
                </Button>
                <Button variant="primary" onClick={handlePushUpdate} aria-label="Push Update">
                  Push Update
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={handleCreateLink}>Create link</Button>
            )}
          </div>
```
to:
```jsx
          {isUpdateMode && locked && (
            <p className="text-xs text-gray-400 text-right">Push Update is disabled — this link is locked.</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            {isUpdateMode ? (
              <>
                <Button variant="secondary" onClick={handleCreateLink} aria-label="New link">
                  New link
                </Button>
                <Button variant="primary" onClick={handlePushUpdate} aria-label="Push Update" disabled={locked}>
                  Push Update
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={handleCreateLink}>Create link</Button>
            )}
          </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/ShareModal.test.jsx`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add src/components/Share/ShareModal.jsx src/test/ShareModal.test.jsx
git commit -m "feat: add Lock link toggle to Share via link dialog"
```

---

### Task 6: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full worker test suite**

Run: `cd songbook-worker && npx vitest run`
Expected: PASS — every worker test file (`share.test.ts`, `conductor.test.ts`, `album.test.ts`, `session.test.ts`, `license.test.ts`, `turnstile.test.ts`, etc.)

- [ ] **Step 2: Run the full frontend test suite**

Run: `npx vitest run`
Expected: PASS — every frontend test file, including `ShareModal.test.jsx`, `shareApi.test.js`, `CollectionGroupRefresh.test.jsx`, `libraryStoreShareRefresh.test.js`, `ImportConfirmModal.test.jsx` (none of these should be affected by this feature, but they touch adjacent share code paths)

- [ ] **Step 3: Manual smoke test against a local worker**

Run: `cd songbook-worker && npx wrangler dev` (in one terminal), then `npm run dev` (repo root, in another terminal) with `VITE_WORKER_URL` pointed at the local wrangler dev URL.

In the app: create a collection with at least one song → Share via link → check "Lock link" → Create link → confirm the link was created. Reopen the Share modal on that collection → confirm "Lock link" shows checked and "Push Update" is disabled with the note. Uncheck "Lock link" → confirm "Push Update" re-enables without a page reload.

- [ ] **Step 4: Commit (if step 3 surfaced fixes)**

Only if manual testing required code changes:
```bash
git add -A
git commit -m "fix: address issues found in manual verification of lock-link feature"
```
