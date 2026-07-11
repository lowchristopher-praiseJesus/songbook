# PIN-Protected Share Link Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mandatory 4-digit PIN to the existing share-link lock: locking a share always sets a PIN, unlocking always requires it (enforced by the worker, not just the UI), and the share automatically re-locks after a successful Push Update or after the Share modal is closed while unlocked.

**Architecture:** A salted SHA-256 hash of the PIN is stored in the R2 object's `customMetadata` (`pinHash`/`pinSalt`), alongside the existing `locked`/`expiresAt`/`version`. `PATCH /share/:code/lock` verifies the PIN server-side on every unlock and only asks for a PIN on a share's *first* lock — re-locking (manual, auto-after-push, or auto-on-modal-close) reuses the stored hash silently. `PUT /share/:code` (Push Update) forces the share back to `locked: true` on success whenever it has ever had a PIN. The Share modal renders an inline 4-digit input beneath the "Lock link" switch whenever a PIN needs to be set or entered, and reuses the existing per-open live lock-state check to also fetch whether a PIN currently exists.

**Tech Stack:** Cloudflare Worker (Hono) + R2 for the backend (`songbook-worker/`); React + Vitest + Testing Library for the frontend (`src/`).

## Global Constraints

- No authentication beyond the PIN itself — matches the existing no-account model (anyone with the link can attempt to unlock, but must know the PIN).
- No brute-force rate limiting on PIN attempts — a deliberate simplicity trade-off, not an oversight.
- PIN is exactly 4 digits (`/^\d{4}$/`), validated both client-side (before any network call) and server-side (defense in depth).
- Locking always requires a PIN the first time; re-locking (manual toggle, auto-after-push, auto-on-close) never re-prompts and never needs the PIN — it reuses the stored hash.
- Unlocking always requires the correct PIN, checked server-side in `PATCH /share/:code/lock`, independent of anything the UI does.
- "New Link" always creates the new share unlocked, regardless of the old link's current toggle state.
- A PIN-protected share must never be left unlocked outside of an active Share-modal session: closing the modal while unlocked re-locks it (no PIN needed for this re-lock).

---

### Task 1: Worker — PIN hashing helper

**Files:**
- Create: `songbook-worker/src/lib/pin.ts`
- Test: `songbook-worker/test/pin.test.ts` (new)

**Interfaces:**
- Consumes: nothing (pure functions, Web Crypto only)
- Produces:
  - `isValidPinFormat(pin: unknown): pin is string`
  - `generateSalt(): string`
  - `hashPin(pin: string, salt: string): Promise<string>`

- [ ] **Step 1: Write the failing tests**

Create `songbook-worker/test/pin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidPinFormat, generateSalt, hashPin } from '../src/lib/pin';

describe('isValidPinFormat', () => {
  it('accepts a 4-digit string', () => {
    expect(isValidPinFormat('1234')).toBe(true);
  });

  it('rejects strings that are not exactly 4 digits', () => {
    expect(isValidPinFormat('123')).toBe(false);
    expect(isValidPinFormat('12345')).toBe(false);
    expect(isValidPinFormat('12a4')).toBe(false);
    expect(isValidPinFormat('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidPinFormat(1234)).toBe(false);
    expect(isValidPinFormat(undefined)).toBe(false);
    expect(isValidPinFormat(null)).toBe(false);
  });
});

describe('generateSalt', () => {
  it('returns a 32-character hex string', () => {
    expect(generateSalt()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns a different value on each call', () => {
    expect(generateSalt()).not.toBe(generateSalt());
  });
});

describe('hashPin', () => {
  it('returns a 64-character hex string (SHA-256 digest)', async () => {
    const hash = await hashPin('1234', 'somesalt');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same pin and salt', async () => {
    const a = await hashPin('1234', 'salt1');
    const b = await hashPin('1234', 'salt1');
    expect(a).toBe(b);
  });

  it('differs for different pins with the same salt', async () => {
    const a = await hashPin('1234', 'salt1');
    const b = await hashPin('5678', 'salt1');
    expect(a).not.toBe(b);
  });

  it('differs for the same pin with different salts', async () => {
    const a = await hashPin('1234', 'salt1');
    const b = await hashPin('1234', 'salt2');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd songbook-worker && npx vitest run test/pin.test.ts`
Expected: FAIL — `src/lib/pin.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `songbook-worker/src/lib/pin.ts`:

```ts
export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(pin + salt);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd songbook-worker && npx vitest run test/pin.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/lib/pin.ts songbook-worker/test/pin.test.ts
git commit -m "feat(worker): add PIN hashing helper"
```

---

### Task 2: Worker — `pinHash`/`pinSalt`/`hasPin` on R2 share metadata

**Files:**
- Modify: `songbook-worker/src/lib/r2.ts:1-52` (`putShare`, `headShare`, `getShareIfValid`)
- Test: `songbook-worker/test/share.test.ts`

**Interfaces:**
- Consumes: nothing new (uses existing `R2Bucket` binding)
- Produces:
  - `putShare(bucket, shareCode, body, expiresAt, version = 1, locked = false, pinHash?: string, pinSalt?: string): Promise<void>`
  - `headShare(bucket, shareCode): Promise<{ version: number; expiresAt: Date; locked: boolean; hasPin: boolean; pinHash?: string; pinSalt?: string } | { error: 'not_found' | 'expired' }>`
  - `getShareIfValid(bucket, shareCode): Promise<{ object: R2ObjectBody; version: number; locked: boolean; hasPin: boolean } | { error: 'not_found' | 'expired' }>`

- [ ] **Step 1: Write the failing tests**

Append to `songbook-worker/test/share.test.ts` (after the existing `describe('putShare — locked metadata', ...)` block):

```ts
describe('putShare — pin metadata', () => {
  it('does not write pinHash/pinSalt when not passed', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await putShare(env.R2_BUCKET, 'test-put-no-pin', body, expiresAt);

    const obj = await env.R2_BUCKET.head('test-put-no-pin');
    expect(obj?.customMetadata?.pinHash).toBeUndefined();
    expect(obj?.customMetadata?.pinSalt).toBeUndefined();
  });

  it('writes pinHash/pinSalt when passed', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await putShare(env.R2_BUCKET, 'test-put-pin', body, expiresAt, 1, true, 'somehash', 'somesalt');

    const obj = await env.R2_BUCKET.head('test-put-pin');
    expect(obj?.customMetadata?.pinHash).toBe('somehash');
    expect(obj?.customMetadata?.pinSalt).toBe('somesalt');
  });
});
```

Append after the existing `describe('headShare — locked field', ...)` block:

```ts
describe('headShare — pin fields', () => {
  it('returns hasPin: false and no pinHash/pinSalt when none stored', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('head-no-pin', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString() },
    });
    const result = await headShare(env.R2_BUCKET, 'head-no-pin');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.hasPin).toBe(false);
      expect(result.pinHash).toBeUndefined();
    }
  });

  it('returns hasPin: true and the stored pinHash/pinSalt', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('head-pin', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString(), pinHash: 'abc', pinSalt: 'def' },
    });
    const result = await headShare(env.R2_BUCKET, 'head-pin');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.hasPin).toBe(true);
      expect(result.pinHash).toBe('abc');
      expect(result.pinSalt).toBe('def');
    }
  });
});
```

Append after the existing `describe('getShareIfValid — locked field', ...)` block:

```ts
describe('getShareIfValid — hasPin field', () => {
  it('surfaces hasPin from the underlying head', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('valid-pin', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString(), pinHash: 'abc', pinSalt: 'def' },
    });
    const result = await getShareIfValid(env.R2_BUCKET, 'valid-pin');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.hasPin).toBe(true);
      await result.object.arrayBuffer(); // consume stream to avoid isolated-storage leak
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd songbook-worker && npx vitest run test/share.test.ts`
Expected: FAIL — `pinHash`/`pinSalt`/`hasPin` are all `undefined`.

- [ ] **Step 3: Implement**

Replace `songbook-worker/src/lib/r2.ts` lines 1-52 with:

```ts
export async function putShare(
  bucket: R2Bucket,
  shareCode: string,
  body: ArrayBuffer | Uint8Array | ReadableStream,
  expiresAt: Date,
  version = 1,
  locked = false,
  pinHash?: string,
  pinSalt?: string,
): Promise<void> {
  const customMetadata: Record<string, string> = {
    expiresAt: expiresAt.toISOString(),
    version: String(version),
    locked: String(locked),
  };
  if (pinHash) customMetadata.pinHash = pinHash;
  if (pinSalt) customMetadata.pinSalt = pinSalt;

  await bucket.put(shareCode, body, {
    customMetadata,
    httpMetadata: { contentType: 'application/zip' },
  });
}

export async function headShare(
  bucket: R2Bucket,
  shareCode: string,
): Promise<
  | { version: number; expiresAt: Date; locked: boolean; hasPin: boolean; pinHash?: string; pinSalt?: string }
  | { error: 'not_found' | 'expired' }
> {
  const head = await bucket.head(shareCode);
  if (!head) return { error: 'not_found' };

  const expiresAt = new Date(head.customMetadata?.expiresAt ?? '');
  if (isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
    return { error: 'expired' };
  }

  const pinHash = head.customMetadata?.pinHash;
  const pinSalt = head.customMetadata?.pinSalt;

  return {
    version: Number(head.customMetadata?.version ?? 1),
    expiresAt,
    locked: head.customMetadata?.locked === 'true',
    hasPin: pinHash != null,
    pinHash,
    pinSalt,
  };
}

export async function getShareIfValid(
  bucket: R2Bucket,
  shareCode: string,
): Promise<
  { object: R2ObjectBody; version: number; locked: boolean; hasPin: boolean } | { error: 'not_found' | 'expired' }
> {
  const head = await headShare(bucket, shareCode);
  if ('error' in head) return head;

  const object = await bucket.get(shareCode);
  if (!object) return { error: 'not_found' };
  return { object, version: head.version, locked: head.locked, hasPin: head.hasPin };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd songbook-worker && npx vitest run test/share.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/lib/r2.ts songbook-worker/test/share.test.ts
git commit -m "feat(worker): add pinHash/pinSalt/hasPin to share R2 metadata"
```

---

### Task 3: Worker — `PATCH /:code/lock` enforces the PIN

**Files:**
- Modify: `songbook-worker/src/routes/share.ts` (`PATCH /:code/lock` handler, lines 85-111)
- Test: `songbook-worker/src/routes/share.test.ts`

**Interfaces:**
- Consumes: `headShare`, `putShare` from Task 2 (`songbook-worker/src/lib/r2.ts`); `isValidPinFormat`, `generateSalt`, `hashPin` from Task 1 (`songbook-worker/src/lib/pin.ts`)
- Produces: `PATCH /share/:code/lock` body `{ locked: boolean, pin?: string }` →
  - unlock success: `200 { locked: false }`
  - unlock, wrong pin: `403 { error: 'invalid_pin' }`
  - unlock, missing/malformed pin or no pin ever set: `400 { error: 'pin_required' }`
  - first-time lock, missing/malformed pin: `400 { error: 'pin_required' }`
  - first-time lock, valid pin: `200 { locked: true }`
  - re-lock (pin already exists): `200 { locked: true }`, `pin` in body ignored
  - `404`/`410` unchanged for missing/expired shares

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe('PATCH /share/:code/lock', ...)` block (lines 86-161) in `songbook-worker/src/routes/share.test.ts` with:

```ts
describe('PATCH /share/:code/lock', () => {
  it('requires a pin to lock a never-locked share', async () => {
    const { shareCode } = await createShare();
    const res = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed pin when locking', async () => {
    const { shareCode } = await createShare();
    const res = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: 'abcd' }),
    });
    expect(res.status).toBe(400);
  });

  it('locks a share with a valid pin and PUT is then rejected with 423', async () => {
    const { shareCode } = await createShare();

    const lockRes = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
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

  it('rejects unlock with no pin', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
    });

    const res = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects unlock with the wrong pin, share stays locked', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
    });

    const wrongRes = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '9999' }),
    });
    expect(wrongRes.status).toBe(403);
    expect(await wrongRes.json()).toEqual({ error: 'invalid_pin' });

    const putRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip', Origin: ORIGIN },
      body: new Uint8Array([4, 5, 6]),
    });
    expect(putRes.status).toBe(423);
  });

  it('unlocks a share with the correct pin and PUT succeeds again', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
    });
    const unlockRes = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '1234' }),
    });
    expect(unlockRes.status).toBe(200);
    expect(await unlockRes.json()).toEqual({ locked: false });

    const putRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip', Origin: ORIGIN },
      body: new Uint8Array([4, 5, 6]),
    });
    expect(putRes.status).toBe(200);
  });

  it('re-locking an already-PIN-protected share does not require a pin', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
    });
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '1234' }),
    });

    const relockRes = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });
    expect(relockRes.status).toBe(200);
    expect(await relockRes.json()).toEqual({ locked: true });

    // The original pin still works to unlock it again.
    const unlockRes = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '1234' }),
    });
    expect(unlockRes.status).toBe(200);
  });

  it('returns 404 for a non-existent share code', async () => {
    const res = await SELF.fetch('http://localhost/share/does-not-exist/lock', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
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

  it('preserves the stored blob content after a lock/unlock cycle', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
    });

    const getRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      headers: { Origin: ORIGIN },
    });
    const buf = new Uint8Array(await getRes.arrayBuffer());
    expect(buf).toEqual(new Uint8Array([1, 2, 3]));
  });
});
```

Also update the one existing test that locks without a pin and will now break under the new PIN-required behavior. In the `describe('HEAD/GET /share/:code — X-Share-Locked header', ...)` block, replace:

```ts
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
```

with:

```ts
  it('HEAD exposes X-Share-Locked: true after locking', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
    });
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(res.headers.get('X-Share-Locked')).toBe('true');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd songbook-worker && npx vitest run src/routes/share.test.ts`
Expected: FAIL — locking with no pin currently succeeds (200, not 400); unlocking never checks a pin.

- [ ] **Step 3: Implement**

Add the import at the top of `songbook-worker/src/routes/share.ts` (alongside the existing `putShare, getShareIfValid, headShare` import):

```ts
import { isValidPinFormat, generateSalt, hashPin } from '../lib/pin';
```

Replace the `share.patch('/:code/lock', ...)` block (lines 85-111) with:

```ts
share.patch('/:code/lock', async (c) => {
  const shareCode = c.req.param('code');

  const existing = await headShare(c.env.R2_BUCKET, shareCode);
  if ('error' in existing) {
    const status = existing.error === 'not_found' ? 404 : 410;
    return c.json({ error: existing.error }, status);
  }

  let payload: { locked?: unknown; pin?: unknown };
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

  if (payload.locked === false) {
    // Unlocking always requires the correct pin.
    if (!existing.pinHash || !existing.pinSalt || !isValidPinFormat(payload.pin)) {
      return c.json({ error: 'pin_required' }, 400);
    }
    const suppliedHash = await hashPin(payload.pin, existing.pinSalt);
    if (suppliedHash !== existing.pinHash) {
      return c.json({ error: 'invalid_pin' }, 403);
    }
    await putShare(c.env.R2_BUCKET, shareCode, body, existing.expiresAt, existing.version, false, existing.pinHash, existing.pinSalt);
    return c.json({ locked: false });
  }

  // Locking: re-locking a share that already has a pin reuses the existing hash silently.
  if (existing.hasPin) {
    await putShare(c.env.R2_BUCKET, shareCode, body, existing.expiresAt, existing.version, true, existing.pinHash, existing.pinSalt);
    return c.json({ locked: true });
  }

  // First-ever lock on this share: a pin must be supplied and stored.
  if (!isValidPinFormat(payload.pin)) {
    return c.json({ error: 'pin_required' }, 400);
  }
  const pinSalt = generateSalt();
  const pinHash = await hashPin(payload.pin, pinSalt);
  await putShare(c.env.R2_BUCKET, shareCode, body, existing.expiresAt, existing.version, true, pinHash, pinSalt);
  return c.json({ locked: true });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd songbook-worker && npx vitest run src/routes/share.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/routes/share.ts songbook-worker/src/routes/share.test.ts
git commit -m "feat(worker): enforce PIN on share link lock/unlock"
```

---

### Task 4: Worker — auto re-lock on Push Update, PIN on creation

**Files:**
- Modify: `songbook-worker/src/routes/share.ts` (`PUT /:code` handler, `POST /upload` handler)
- Test: `songbook-worker/src/routes/share.test.ts`

**Interfaces:**
- Consumes: `headShare`, `putShare` from Task 2; `isValidPinFormat`, `generateSalt`, `hashPin` from Task 1
- Produces:
  - `PUT /share/:code` response gains `locked: boolean` — `true` when the share has a pin and the push just re-locked it, `false` when the share has never been locked
  - `POST /share/upload` accepts a new request header `X-Lock-Pin: 1234`, required (and validated) when `X-Locked: true` is also sent — `400 { error: 'pin_required' }` otherwise

- [ ] **Step 1: Write the failing tests**

Append to `songbook-worker/src/routes/share.test.ts`:

```ts
describe('PUT /share/:code — auto re-lock for PIN-protected shares', () => {
  it('auto re-locks after a successful push and returns locked: true', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
    });
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '1234' }),
    });

    const putRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip', Origin: ORIGIN },
      body: new Uint8Array([4, 5, 6]),
    });
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({ locked: true });

    const headRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(headRes.headers.get('X-Share-Locked')).toBe('true');
  });

  it('does not auto re-lock a share that has never been PIN-protected', async () => {
    const { shareCode } = await createShare();
    const putRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip', Origin: ORIGIN },
      body: new Uint8Array([4, 5, 6]),
    });
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({ locked: false });
  });

  it('a re-locked share requires the same pin to unlock again', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
    });
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '1234' }),
    });
    await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip', Origin: ORIGIN },
      body: new Uint8Array([4, 5, 6]),
    });

    const wrongUnlock = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '9999' }),
    });
    expect(wrongUnlock.status).toBe(403);

    const rightUnlock = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '1234' }),
    });
    expect(rightUnlock.status).toBe(200);
  });
});

describe('POST /share/upload — X-Lock-Pin header', () => {
  it('creates a pre-locked share with a pin when X-Locked: true and X-Lock-Pin are sent', async () => {
    const { shareCode } = await createShare({ 'X-Locked': 'true', 'X-Lock-Pin': '1234' });
    const headRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(headRes.headers.get('X-Share-Locked')).toBe('true');
  });

  it('returns 400 when X-Locked: true is sent without X-Lock-Pin', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        Origin: ORIGIN,
        'X-Turnstile-Token': 'test-token',
        'X-Locked': 'true',
      },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when X-Lock-Pin is not 4 digits', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        Origin: ORIGIN,
        'X-Turnstile-Token': 'test-token',
        'X-Locked': 'true',
        'X-Lock-Pin': 'abcd',
      },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(res.status).toBe(400);
  });

  it('a pre-locked share requires the pin set at creation to unlock', async () => {
    const { shareCode } = await createShare({ 'X-Locked': 'true', 'X-Lock-Pin': '4321' });
    const wrongUnlock = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '0000' }),
    });
    expect(wrongUnlock.status).toBe(403);

    const rightUnlock = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '4321' }),
    });
    expect(rightUnlock.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd songbook-worker && npx vitest run src/routes/share.test.ts`
Expected: FAIL — PUT response has no `locked` field; `X-Lock-Pin` is ignored; locking on upload with no pin still succeeds.

- [ ] **Step 3: Implement**

Add `isValidPinFormat, generateSalt, hashPin` to the `../lib/pin` import at the top of `songbook-worker/src/routes/share.ts` (already imported in Task 3 — no new import line needed).

Replace the `share.put('/:code', ...)` block with:

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
  // A PIN-protected share re-locks itself on every successful push, so the
  // next push needs the PIN entered again too.
  const relock = existing.hasPin;
  await putShare(c.env.R2_BUCKET, shareCode, body, existing.expiresAt, newVersion, relock, existing.pinHash, existing.pinSalt);

  return c.json({ version: newVersion, updatedAt: updatedAt.toISOString(), locked: relock });
});
```

Replace the `share.post('/upload', ...)` block with:

```ts
share.post('/upload', verifyTurnstile, async (c) => {
  const rawDays = Number(c.req.header('X-Expires-In-Days') ?? '7');
  const expiresInDays = isNaN(rawDays) ? 7 : Math.min(30, Math.max(1, rawDays));
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const locked = c.req.header('X-Locked') === 'true';

  let pinHash: string | undefined;
  let pinSalt: string | undefined;
  if (locked) {
    const pin = c.req.header('X-Lock-Pin');
    if (!isValidPinFormat(pin)) {
      return c.json({ error: 'pin_required' }, 400);
    }
    pinSalt = generateSalt();
    pinHash = await hashPin(pin, pinSalt);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: 'no_body' }, 400);
  if (body.byteLength > 10 * 1024 * 1024) return c.json({ error: 'too_large' }, 413);

  const shareCode = crypto.randomUUID();
  await putShare(c.env.R2_BUCKET, shareCode, body, expiresAt, 1, locked, pinHash, pinSalt);

  const shareUrl = `${c.env.APP_ORIGIN}?share=${shareCode}`;
  return c.json({ shareCode, shareUrl, expiresAt: expiresAt.toISOString() });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd songbook-worker && npx vitest run src/routes/share.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/routes/share.ts songbook-worker/src/routes/share.test.ts
git commit -m "feat(worker): auto re-lock PIN-protected shares after push, accept X-Lock-Pin on upload"
```

---

### Task 5: Worker — expose `X-Share-Has-Pin`, CORS

**Files:**
- Modify: `songbook-worker/src/routes/share.ts` (`HEAD /:code`, `GET /:code` handlers)
- Modify: `songbook-worker/src/index.ts:23-44` (CORS headers)
- Test: `songbook-worker/src/routes/share.test.ts`

**Interfaces:**
- Consumes: `headShare`, `getShareIfValid` from Task 2
- Produces: `HEAD`/`GET /share/:code` responses carry an `X-Share-Has-Pin: true|false` header, readable from the browser

- [ ] **Step 1: Write the failing tests**

Append to `songbook-worker/src/routes/share.test.ts`:

```ts
describe('HEAD/GET /share/:code — X-Share-Has-Pin header', () => {
  it('HEAD exposes X-Share-Has-Pin: false by default', async () => {
    const { shareCode } = await createShare();
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(res.headers.get('X-Share-Has-Pin')).toBe('false');
  });

  it('HEAD exposes X-Share-Has-Pin: true after locking with a pin', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
    });
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(res.headers.get('X-Share-Has-Pin')).toBe('true');
  });

  it('X-Share-Has-Pin stays true after unlocking (the pin is remembered)', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true, pin: '1234' }),
    });
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false, pin: '1234' }),
    });
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(res.headers.get('X-Share-Has-Pin')).toBe('true');
    expect(res.headers.get('X-Share-Locked')).toBe('false');
  });

  it('GET exposes X-Share-Has-Pin and Access-Control-Expose-Headers includes it', async () => {
    const { shareCode } = await createShare();
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      headers: { Origin: ORIGIN },
    });
    const exposeHeaders = res.headers.get('Access-Control-Expose-Headers') ?? '';
    const hasPin = res.headers.get('X-Share-Has-Pin');
    await res.arrayBuffer();
    expect(hasPin).toBe('false');
    expect(exposeHeaders).toContain('X-Share-Has-Pin');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd songbook-worker && npx vitest run src/routes/share.test.ts`
Expected: FAIL — `X-Share-Has-Pin` header is `null` on all responses.

- [ ] **Step 3: Implement**

In `songbook-worker/src/routes/share.ts`, update the `HEAD /:code` handler:

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
    'X-Share-Has-Pin': String(result.hasPin),
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
      'X-Share-Has-Pin': String(result.hasPin),
      // no-store: a live share blob changes on every Push Update; never serve a cached copy.
      'Cache-Control': 'no-store',
    },
  });
});
```

In `songbook-worker/src/index.ts`, replace the `Access-Control-Allow-Headers` line (line 29):

```ts
        'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In-Days, X-Leader-Token, X-Director-Token, X-Conductor-Token, X-Creator-Token, X-License-Token, X-Turnstile-Token, X-Locked, X-Lock-Pin',
```

and the `Access-Control-Expose-Headers` line (line 42), along with its comment:

```ts
    // Expose custom response headers so browser JS can read them. Without this,
    // X-Share-Version/X-Share-Locked/X-Share-Has-Pin are hidden from fetch() and the client falls back to defaults.
    c.res.headers.set('Access-Control-Expose-Headers', 'X-Share-Version, X-Share-Locked, X-Share-Has-Pin');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd songbook-worker && npx vitest run`
Expected: PASS — full worker suite, including `pin.test.ts`, `test/share.test.ts`, `src/routes/share.test.ts`, and all pre-existing worker tests.

- [ ] **Step 5: Type-check**

Run: `cd songbook-worker && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/src/routes/share.ts songbook-worker/src/index.ts songbook-worker/src/routes/share.test.ts
git commit -m "feat(worker): expose X-Share-Has-Pin header, allow X-Lock-Pin in CORS"
```

---

### Task 6: Frontend — `shareApi.js` client functions

**Files:**
- Modify: `src/lib/shareApi.js` (`uploadShare`, `checkShareVersion`, `setShareLocked`)
- Test: `src/test/shareApi.test.js`

**Interfaces:**
- Consumes: worker endpoints from Tasks 3-5 (`PATCH /share/:code/lock` with `pin`, `X-Share-Has-Pin` header, `X-Lock-Pin` request header, `PUT` response `locked` field)
- Produces:
  - `uploadShare(blob, expiresInDays = 7, turnstileToken, locked = false, pin = null) → { shareCode, shareUrl, expiresAt }`
  - `checkShareVersion(shareCode) → { version: number, locked: boolean, hasPin: boolean }` (was `{ version, locked }`)
  - `setShareLocked(shareCode, locked: boolean, pin: string | null = null) → { locked: boolean }` — new error cases `invalid_pin` (403), `pin_required` (400)
  - `updateShare(shareCode, blob) → { version, updatedAt, locked }` — no code change, `locked` simply passes through `res.json()`

- [ ] **Step 1: Write the failing tests**

In `src/test/shareApi.test.js`, replace the `describe('checkShareVersion', ...)` block (lines 109-162) with:

```js
describe('checkShareVersion', () => {
  it('returns { version, locked, hasPin } from response headers on 200', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: (h) => h === 'X-Share-Version' ? '3' : null },
      text: async () => '',
    });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 3, locked: false, hasPin: false });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/abc-123'),
      expect.objectContaining({ method: 'HEAD', cache: 'no-store' }),
    );
  });

  it('throws with code expired on 410', async () => {
    fetch.mockResolvedValue({ status: 410, ok: false, headers: { get: () => null } });
    await expect(checkShareVersion('abc')).rejects.toMatchObject({ code: 'expired' });
  });

  it('throws with code not_found on 404', async () => {
    fetch.mockResolvedValue({ status: 404, ok: false, headers: { get: () => null } });
    await expect(checkShareVersion('abc')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('defaults to version 1 when X-Share-Version header is absent', async () => {
    fetch.mockResolvedValue({ status: 200, ok: true, headers: { get: () => null }, text: async () => '' });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 1, locked: false, hasPin: false });
  });

  it('returns locked: true from X-Share-Locked header', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: (h) => (h === 'X-Share-Version' ? '3' : h === 'X-Share-Locked' ? 'true' : null) },
      text: async () => '',
    });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 3, locked: true, hasPin: false });
  });

  it('defaults locked to false when X-Share-Locked header is absent', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => '',
    });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 1, locked: false, hasPin: false });
  });

  it('returns hasPin: true from X-Share-Has-Pin header', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: (h) => (h === 'X-Share-Has-Pin' ? 'true' : null) },
      text: async () => '',
    });
    const result = await checkShareVersion('abc-123');
    expect(result).toEqual({ version: 1, locked: false, hasPin: true });
  });
});
```

Add to the existing `describe('uploadShare', ...)` block (after `'sends X-Locked: true when locked is passed'`):

```js
  it('sends X-Lock-Pin header when locked and pin are both provided', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadShare(new Blob(['x']), 7, 'tok', true, '1234');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Lock-Pin': '1234' }),
      }),
    );
  });

  it('omits X-Lock-Pin header when not locked', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadShare(new Blob(['x']), 7, 'tok', false);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.not.objectContaining({ 'X-Lock-Pin': expect.anything() }),
      }),
    );
  });
```

Add to the existing `describe('updateShare', ...)` block (after `'throws with code locked on 423'`):

```js
  it('returns the locked field from the response (auto re-lock signal)', async () => {
    const mockResult = { version: 2, updatedAt: '2026-07-11T10:00:00.000Z', locked: true };
    fetch.mockResolvedValue({ ok: true, json: async () => mockResult });
    const result = await updateShare('abc-123', new Blob(['x']));
    expect(result).toEqual(mockResult);
  });
```

Add to the existing `describe('setShareLocked', ...)` block (after `'throws with code lock_failed on other failure'`):

```js
  it('sends pin in the body when provided', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ locked: true }) });
    await setShareLocked('abc-123', true, '1234');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/abc-123/lock'),
      expect.objectContaining({
        body: JSON.stringify({ locked: true, pin: '1234' }),
      }),
    );
  });

  it('throws with code invalid_pin on 403', async () => {
    fetch.mockResolvedValue({ status: 403, ok: false });
    await expect(setShareLocked('abc', false, '0000')).rejects.toMatchObject({ code: 'invalid_pin' });
  });

  it('throws with code pin_required on 400', async () => {
    fetch.mockResolvedValue({ status: 400, ok: false });
    await expect(setShareLocked('abc', false)).rejects.toMatchObject({ code: 'pin_required' });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/shareApi.test.js`
Expected: FAIL — `checkShareVersion` doesn't return `hasPin`; `uploadShare` doesn't send `X-Lock-Pin`; `setShareLocked` doesn't send `pin` or throw the new error codes.

- [ ] **Step 3: Implement**

Replace the full contents of `src/lib/shareApi.js`:

```js
const WORKER_URL = import.meta.env.VITE_WORKER_URL;
if (!WORKER_URL && import.meta.env.DEV) {
  console.warn('VITE_WORKER_URL is not set. Create .env.local with VITE_WORKER_URL=https://...');
}

export async function uploadShare(blob, expiresInDays = 7, turnstileToken, locked = false, pin = null) {
  const headers = {
    'Content-Type': 'application/zip',
    'X-Expires-In-Days': String(expiresInDays),
    'X-Turnstile-Token': turnstileToken,
    'X-Locked': String(locked),
  };
  if (locked && pin) headers['X-Lock-Pin'] = pin;

  const res = await fetch(`${WORKER_URL}/share/upload`, {
    method: 'POST',
    headers,
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
  const hasPin = res.headers.get('X-Share-Has-Pin') === 'true';
  return { version, locked, hasPin };
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

export async function setShareLocked(shareCode, locked, pin = null) {
  const res = await fetch(`${WORKER_URL}/share/${shareCode}/lock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pin ? { locked, pin } : { locked }),
  });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (res.status === 403) throw Object.assign(new Error('invalid_pin'), { code: 'invalid_pin' });
  if (res.status === 400) throw Object.assign(new Error('pin_required'), { code: 'pin_required' });
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
git commit -m "feat: send/verify PIN in shareApi client for lock/unlock and creation"
```

---

### Task 7: Frontend — `ShareModal.jsx` inline PIN entry (lock/unlock)

**Files:**
- Modify: `src/components/Share/ShareModal.jsx`
- Test: `src/test/ShareModal.test.jsx`

**Interfaces:**
- Consumes: `checkShareVersion` (now returns `hasPin`), `setShareLocked(shareCode, locked, pin)` from Task 6
- Produces: no new exports — leaf UI component. Renders a `<input aria-label="PIN">` and `Lock`/`Unlock`/`Cancel` buttons whenever `pinInputMode !== 'none'`.

- [ ] **Step 1: Write the failing tests**

Update the `vi.mock('../lib/shareApi', ...)` block near the top of `src/test/ShareModal.test.jsx` from:

```js
vi.mock('../lib/shareApi', () => ({
  uploadShare: vi.fn(),
  updateShare: vi.fn(),
  checkShareVersion: vi.fn().mockResolvedValue({ version: 1, locked: false }),
  setShareLocked: vi.fn().mockResolvedValue({ locked: true }),
}));
```

to:

```js
vi.mock('../lib/shareApi', () => ({
  uploadShare: vi.fn(),
  updateShare: vi.fn(),
  checkShareVersion: vi.fn().mockResolvedValue({ version: 1, locked: false, hasPin: false }),
  setShareLocked: vi.fn().mockResolvedValue({ locked: true }),
}));
```

Replace the existing test `'passes locked=true to uploadShare when "Lock link" is checked before Create link'` (in the top-level `describe('ShareModal', ...)` block) with:

```js
  it('passes locked=true and the pin to uploadShare after setting a PIN and clicking Create link', async () => {
    uploadShare.mockResolvedValue({
      shareCode: 'x',
      shareUrl: 'http://app?share=x',
      expiresAt: new Date().toISOString(),
    });
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('switch', { name: /lock link/i }));
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    fireEvent.click(screen.getByText('Create link'));
    await screen.findByDisplayValue('http://app?share=x');
    expect(uploadShare).toHaveBeenCalledWith(expect.anything(), 7, 'mock-token', true, '1234');
  });
```

Replace the two toggle tests in the `describe('ShareModal — update mode', ...)` block —
`'toggling "Lock link" in update mode calls setShareLocked immediately'` and
`'reverts the toggle and shows an error if setShareLocked fails'` — with:

```js
  it('clicking Lock link on a never-locked share opens an inline PIN entry instead of calling setShareLocked', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: false, hasPin: false });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
    expect(setShareLocked).not.toHaveBeenCalled();
  });

  it('submitting a valid PIN locks a never-locked share', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: false, hasPin: false });
    setShareLocked.mockResolvedValueOnce({ locked: true });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    await waitFor(() => expect(setShareLocked).toHaveBeenCalledWith('abc-123', true, '1234'));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });

  it('shows a format error for a non-4-digit PIN without calling the server', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: false, hasPin: false });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(screen.getByText(/enter a 4-digit pin/i)).toBeInTheDocument();
    expect(setShareLocked).not.toHaveBeenCalled();
  });

  it('toggling Lock link on a previously-PIN-protected, currently-unlocked share re-locks silently', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: false, hasPin: true });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
    await waitFor(() => expect(setShareLocked).toHaveBeenCalledWith('abc-123', true));
  });

  it('reverts the toggle and shows an error if the silent re-lock fails', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: false, hasPin: true });
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

  it('unlocking with the correct PIN clears the lock and enables Push Update', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: true });
    setShareLocked.mockResolvedValueOnce({ locked: false });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(setShareLocked).toHaveBeenCalledWith('abc-123', false, '1234'));
    await waitFor(() => expect(screen.getByRole('button', { name: /push update/i })).not.toBeDisabled());
  });

  it('unlocking with the wrong PIN shows an inline error and keeps the link locked', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: true });
    setShareLocked.mockRejectedValueOnce(Object.assign(new Error('invalid_pin'), { code: 'invalid_pin' }));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText(/incorrect pin/i)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
  });

  it('shows a hint to use New Link after 3 wrong PIN attempts', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: true });
    setShareLocked.mockRejectedValue(Object.assign(new Error('invalid_pin'), { code: 'invalid_pin' }));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle);
    for (let i = 0; i < 3; i++) {
      fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '9999' } });
      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await screen.findByText(/incorrect pin/i);
    }
    expect(screen.getByText(/forgot your pin/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/ShareModal.test.jsx`
Expected: FAIL — no PIN input exists yet; clicking the toggle still calls `setShareLocked` immediately in every case.

- [ ] **Step 3: Implement**

Update the state block (replace lines 20-22):

```js
  const [shareLyricsOnly, setShareLyricsOnly] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [lockStatus, setLockStatus] = useState('idle'); // 'idle' | 'checking' | 'saving' | 'error'
  const [pinInputMode, setPinInputMode] = useState('none'); // 'none' | 'set' | 'enter'
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);
```

Update the live lock-check effect (replace lines 51-68) to also capture `hasPin`:

```js
  // Live-check lock state on open — another holder of the link may have
  // changed it since we last saw this collection, so we never trust a stale cache.
  useEffect(() => {
    if (!isOpen || !isUpdateMode) return;
    let cancelled = false;
    setLockStatus('checking');
    checkShareVersion(collection.shareCode)
      .then(({ locked: serverLocked, hasPin: serverHasPin }) => {
        if (cancelled) return;
        setLocked(serverLocked);
        setHasPin(serverHasPin);
        setLockStatus('idle');
      })
      .catch(() => {
        if (cancelled) return;
        setLockStatus('idle');
      });
    return () => { cancelled = true };
  }, [isOpen, isUpdateMode, collection?.shareCode]);
```

Replace the `handleToggleLocked` function (lines 203-219) with:

```js
  function handleToggleLocked() {
    setPinError('');
    if (!isUpdateMode) {
      // Create mode: nothing is persisted server-side yet, so toggling is purely local.
      if (locked) {
        setLocked(false);
        setPinValue('');
        setPinInputMode('none');
      } else {
        setPinInputMode('set');
      }
      return;
    }
    if (locked) {
      setPinInputMode('enter');
      return;
    }
    if (hasPin) {
      relockSilently();
    } else {
      setPinInputMode('set');
    }
  }

  async function relockSilently() {
    setLocked(true);
    setLockStatus('saving');
    try {
      await setShareLocked(collection.shareCode, true);
      setLockStatus('idle');
    } catch (err) {
      console.error('[ShareModal] silent re-lock failed:', err);
      setLocked(false);
      setLockStatus('error');
    }
  }

  async function handleSetPinSubmit() {
    if (!/^\d{4}$/.test(pinValue)) {
      setPinError('Enter a 4-digit PIN.');
      return;
    }
    if (!isUpdateMode) {
      // Create mode: no network call yet — applied when Create link is clicked.
      setLocked(true);
      setPinInputMode('none');
      setPinError('');
      return;
    }
    setLockStatus('saving');
    try {
      await setShareLocked(collection.shareCode, true, pinValue);
      setLocked(true);
      setHasPin(true);
      setPinInputMode('none');
      setPinValue('');
      setPinError('');
      setLockStatus('idle');
    } catch (err) {
      console.error('[ShareModal] lock with pin failed:', err);
      setPinError("Couldn't lock — check your connection.");
      setLockStatus('idle');
    }
  }

  async function handleUnlockPinSubmit() {
    if (!/^\d{4}$/.test(pinValue)) {
      setPinError('Enter a 4-digit PIN.');
      return;
    }
    setLockStatus('saving');
    try {
      await setShareLocked(collection.shareCode, false, pinValue);
      setLocked(false);
      setPinInputMode('none');
      setPinValue('');
      setPinError('');
      setPinAttempts(0);
      setLockStatus('idle');
    } catch (err) {
      if (err.code === 'invalid_pin') {
        setPinAttempts(a => a + 1);
        setPinError('Incorrect PIN.');
        setPinValue('');
        setLockStatus('idle');
      } else {
        console.error('[ShareModal] unlock failed:', err);
        setPinInputMode('none');
        setPinValue('');
        setLockStatus('error');
      }
    }
  }

  function handlePinCancel() {
    setPinInputMode('none');
    setPinValue('');
    setPinError('');
    setPinAttempts(0);
  }
```

Replace the "Lock link" switch block (lines 369-393) with:

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
            {pinInputMode !== 'none' && (
              <div className="mt-2 ml-14 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={pinValue}
                  onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4-digit PIN"
                  aria-label="PIN"
                  className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                />
                <Button variant="primary" onClick={pinInputMode === 'set' ? handleSetPinSubmit : handleUnlockPinSubmit}>
                  {pinInputMode === 'set' ? 'Lock' : 'Unlock'}
                </Button>
                <Button variant="ghost" onClick={handlePinCancel}>Cancel</Button>
              </div>
            )}
            {pinError && <p className="text-xs text-red-500 mt-1 ml-14">{pinError}</p>}
            {pinAttempts >= 3 && (
              <p className="text-xs text-gray-400 mt-1 ml-14">Forgot your PIN? Use "New Link" to start over.</p>
            )}
            {lockStatus === 'error' && !pinError && (
              <p className="text-xs text-red-500 mt-1 ml-14">Couldn't update lock — check your connection.</p>
            )}
          </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/ShareModal.test.jsx`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add src/components/Share/ShareModal.jsx src/test/ShareModal.test.jsx
git commit -m "feat: add inline PIN entry for locking/unlocking share links"
```

---

### Task 8: Frontend — auto re-lock on Push Update and modal close, New Link reset

**Files:**
- Modify: `src/components/Share/ShareModal.jsx`
- Test: `src/test/ShareModal.test.jsx`

**Interfaces:**
- Consumes: `updateShare` (now resolves with `locked`), `uploadShare(..., locked, pin)`, `setShareLocked` from Task 6/7
- Produces: no new exports

- [ ] **Step 1: Write the failing tests**

Add to the `describe('ShareModal — update mode', ...)` block in `src/test/ShareModal.test.jsx`:

```js
  it('shows "re-locked" message when Push Update response includes locked: true', async () => {
    updateShare.mockResolvedValue({ version: 2, updatedAt: new Date().toISOString(), locked: true });
    exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /push update/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /push update/i }));
    expect(await screen.findByText(/link updated and re-locked/i)).toBeInTheDocument();
  });

  it('New Link resets lock state to unlocked even if the current link is locked', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: true });
    uploadShare.mockResolvedValue({
      shareCode: 'new-code',
      shareUrl: 'http://app?share=new-code',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByRole('switch', { name: /lock link/i })).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(screen.getByRole('button', { name: /new link/i }));
    await waitFor(() => expect(uploadShare).toHaveBeenCalled());
    expect(uploadShare).toHaveBeenCalledWith(expect.anything(), 7, 'mock-token', false, null);
  });

  it('closing the modal after unlocking without pushing re-locks the share silently', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: true });
    setShareLocked.mockResolvedValueOnce({ locked: false });
    const onClose = vi.fn();
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={onClose} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));

    setShareLocked.mockResolvedValueOnce({ locked: true });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(setShareLocked).toHaveBeenCalledWith('abc-123', true));
    expect(onClose).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/ShareModal.test.jsx`
Expected: FAIL — Push Update success never shows a "re-locked" message; New Link still carries over `locked: true`; closing the modal never re-locks.

- [ ] **Step 3: Implement**

In `handleCreateLink`, change the function signature and the `uploadShare` call. Replace:

```js
  async function handleCreateLink() {
    setStep('uploading')
    setErrorMessage('')
    try {
```

with:

```js
  async function handleCreateLink(options = {}) {
    const lockedForThisLink = options.forceUnlocked ? false : locked
    const pinForThisLink = lockedForThisLink ? pinValue : null
    setStep('uploading')
    setErrorMessage('')
    try {
```

Replace:

```js
        result = await uploadShare(blob, expiresInDays, shareToken, locked)
```

with:

```js
        result = await uploadShare(blob, expiresInDays, shareToken, lockedForThisLink, pinForThisLink)
```

Change the "New link" button's `onClick` (in the `isUpdateMode` button row) from:

```jsx
                <Button variant="secondary" onClick={handleCreateLink} aria-label="New link">
                  New link
                </Button>
```

to:

```jsx
                <Button variant="secondary" onClick={() => handleCreateLink({ forceUnlocked: true })} aria-label="New link">
                  New link
                </Button>
```

In `handlePushUpdate`, replace:

```js
      const blob = await exportSongsAsSbp(collectionSongs, nameValue.trim() || null, shareLyricsOnly, null)
      const result = await updateShare(collection.shareCode, blob)
      if (collectionId) updateCollection(collectionId, { lastVersion: result.version })
      // Update baseline so the sharer's songs look "in sync" after pushing;
      // prevents false merge conflicts when recipients push further changes.
      collection.songIds.forEach(id => stampSharedBaseline(id))
      setExpiresAt(result.updatedAt ?? new Date().toISOString())
      setStep('update-done')
```

with:

```js
      const blob = await exportSongsAsSbp(collectionSongs, nameValue.trim() || null, shareLyricsOnly, null)
      const result = await updateShare(collection.shareCode, blob)
      if (collectionId) updateCollection(collectionId, { lastVersion: result.version })
      // Update baseline so the sharer's songs look "in sync" after pushing;
      // prevents false merge conflicts when recipients push further changes.
      collection.songIds.forEach(id => stampSharedBaseline(id))
      setExpiresAt(result.updatedAt ?? new Date().toISOString())
      if (result.locked) setLocked(true)
      setStep('update-done')
```

Update the `update-done` render step. Replace:

```jsx
      {step === 'update-done' && (
        <div className="space-y-4">
          <p className="text-sm text-green-600 dark:text-green-400">
            ✓ Link updated. Recipients can now tap "Check for updates" to see your changes.
          </p>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}
```

with:

```jsx
      {step === 'update-done' && (
        <div className="space-y-4">
          <p className="text-sm text-green-600 dark:text-green-400">
            {locked
              ? '✓ Link updated and re-locked.'
              : '✓ Link updated. Recipients can now tap "Check for updates" to see your changes.'}
          </p>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}
```

Replace `handleClose` (lines 265-281) with:

```js
  function handleClose() {
    if (isUpdateMode && hasPin && !locked) {
      // A PIN-protected share must never sit unlocked once its modal session ends.
      setShareLocked(collection.shareCode, true).catch(err => {
        console.error('[ShareModal] re-lock on close failed:', err);
      });
    }
    setStep('idle');
    setErrorMessage('');
    setNameValue(collectionName ?? '');
    setExpiresInDays(7);
    setShareUrl('');
    setCopied(false);
    setShareLyricsOnly(false);
    setLocked(false);
    setHasPin(false);
    setLockStatus('idle');
    setPinInputMode('none');
    setPinValue('');
    setPinError('');
    setPinAttempts(0);
    setConductorEnabled(false);
    setMaxFollowers(maxCap);
    setBroadcastTime('');
    setConductorData(null);
    setSelfDirect(true);
    onClose();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/ShareModal.test.jsx`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add src/components/Share/ShareModal.jsx src/test/ShareModal.test.jsx
git commit -m "feat: auto re-lock PIN-protected share on push success and modal close, reset lock state on New Link"
```

---

### Task 9: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full worker test suite**

Run: `cd songbook-worker && npx vitest run`
Expected: PASS — every worker test file (`pin.test.ts`, `test/share.test.ts`, `src/routes/share.test.ts`, `conductor.test.ts`, `album.test.ts`, `session.test.ts`, `license.test.ts`, `turnstile.test.ts`, etc.)

- [ ] **Step 2: Type-check the worker**

Run: `cd songbook-worker && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full frontend test suite**

Run: `npx vitest run`
Expected: PASS — every frontend test file, including `ShareModal.test.jsx`, `shareApi.test.js`, and adjacent share-related tests (`CollectionGroupRefresh.test.jsx`, `libraryStoreShareRefresh.test.js`, `ImportConfirmModal.test.jsx`, `mergeSharedCollection.test.js`) — none of these should be affected by this feature, but they touch adjacent share code paths.

- [ ] **Step 4: Manual smoke test against a local worker**

Run: `cd songbook-worker && npx wrangler dev` (in one terminal), then `npm run dev` (repo root, in another terminal) with `VITE_WORKER_URL` pointed at the local wrangler dev URL.

In the app:
1. Create a collection with at least one song → Share via link → check "Lock link" → a PIN field appears → enter `1234` → click "Lock" → click "Create link". Confirm the link is created.
2. Reopen the Share modal on that collection → "Lock link" shows checked, Push Update is disabled.
3. Toggle "Lock link" off → enter `9999` → click "Unlock" → confirm "Incorrect PIN." appears and the link stays locked.
4. Toggle off again → enter `1234` → click "Unlock" → confirm it unlocks and Push Update becomes enabled.
5. Click Push Update → confirm success screen reads "Link updated and re-locked." → reopen the modal → confirm it shows locked again.
6. Unlock again with `1234`, then close the modal via Cancel without pushing → reopen the modal → confirm it's still locked (re-locked on close).
7. Click "New Link" while the toggle shows locked → confirm the new link is created unlocked.

- [ ] **Step 5: Commit (if step 4 surfaced fixes)**

Only if manual testing required code changes:
```bash
git add -A
git commit -m "fix: address issues found in manual verification of PIN-lock feature"
```
