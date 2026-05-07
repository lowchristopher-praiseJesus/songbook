# License Server-Side Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move license key validation entirely off the client and onto the Cloudflare Worker, so that the shared secret and checksum algorithm never ship in the browser bundle, and the premium Conductor feature cannot be accessed without a server-verified token.

**Architecture:** The worker gains a `POST /license/validate` endpoint that validates the key using the existing MD5 checksum algorithm (with the secret stored as a Wrangler secret, never in the bundle) and issues a short-lived HMAC-SHA-256 signed token (24 h TTL). `POST /conductor/create` on the worker verifies that token before proceeding. On the client, the secret and all encoding/decoding helpers are deleted from `licenseValidation.js`; `LicenseContext` calls the server on mount (and whenever the key changes) and stores the returned token; `ShareModal` passes the token to `createConductorSession`, which sends it in an `X-License-Token` header.

**Tech Stack:** Cloudflare Workers (Hono 4, `nodejs_compat`), Web Crypto API (`HMAC-SHA-256`), `node:crypto` (`createHash('md5')`), `@cloudflare/vitest-pool-workers`, Vitest 2, React 18

---

## File Map

### Worker (`songbook-worker/`)

| Action | Path | Purpose |
|--------|------|---------|
| **Create** | `src/lib/licenseValidation.ts` | Server-side key validation (MD5 checksum, secret from env) |
| **Create** | `src/lib/licenseToken.ts` | HMAC-SHA-256 sign + verify for 24 h license tokens |
| **Create** | `src/routes/license.ts` | `POST /license/validate` handler |
| **Create** | `src/routes/license.test.ts` | Integration tests for the validate endpoint |
| **Modify** | `src/types.ts` | Add `LICENSE_SECRET` and `LICENSE_TOKEN_SECRET` to `Env` |
| **Modify** | `src/routes/conductor.ts` | Verify license token before creating a conductor session |
| **Modify** | `src/routes/conductor.test.ts` | Add tests for token enforcement on `/conductor/create` |
| **Modify** | `src/index.ts` | Wire `/license` route; add `X-License-Token` to CORS allowed headers |
| **Modify** | `vitest.config.ts` | Add `LICENSE_SECRET` and `LICENSE_TOKEN_SECRET` to miniflare test bindings |
| **Modify** | `.dev.vars` | Add both secrets for local `wrangler dev` |

### Client (`src/`)

| Action | Path | Purpose |
|--------|------|---------|
| **Modify** | `src/lib/licenseValidation.js` | Strip secret, `encodePayload`, `computeChecksum`; keep format-only check |
| **Modify** | `src/lib/__tests__/licenseValidation.test.js` | Remove tests that relied on stripped exports |
| **Create** | `src/lib/licenseApi.js` | `validateLicenseWithServer`, token storage helpers |
| **Create** | `src/lib/__tests__/licenseApi.test.js` | Unit tests for token helpers |
| **Modify** | `src/contexts/LicenseContext.jsx` | Server-validate on mount; store token; expose it in context |
| **Modify** | `src/lib/conductorApi.js` | Accept and forward `licenseToken` in `X-License-Token` header |
| **Modify** | `src/components/Share/ShareModal.jsx` | Pull `licenseToken` from context; pass it to `createConductorSession` |

---

## Task 1 — Extend worker Env types and configure test/dev secrets

**Files:**
- Modify: `songbook-worker/src/types.ts`
- Modify: `songbook-worker/vitest.config.ts`
- Modify: `songbook-worker/.dev.vars`

- [ ] **Step 1: Add new secrets to the Env interface**

Open `songbook-worker/src/types.ts` and replace its contents with:

```ts
export interface Env {
  R2_BUCKET: R2Bucket;
  SESSION_KV: KVNamespace;
  APP_ORIGIN: string;
  WALKIE_ORIGIN: string;
  LICENSE_SECRET: string;
  LICENSE_TOKEN_SECRET: string;
}
```

- [ ] **Step 2: Add secrets to the miniflare test bindings**

Open `songbook-worker/vitest.config.ts` and replace its contents with:

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
          },
          kvNamespaces: ['SESSION_KV'],
          r2Buckets: ['R2_BUCKET'],
        },
      },
    },
  },
});
```

> **Why these values?** `LICENSE_SECRET` must match whatever value you used when generating keys. For tests that generate and validate keys, use a known value so you control the checksum. `LICENSE_TOKEN_SECRET` just needs to be a non-empty string in tests.

- [ ] **Step 3: Add secrets to .dev.vars for local wrangler dev**

Open `songbook-worker/.dev.vars` and append (do not replace existing lines):

```
LICENSE_SECRET=songsheet-conductor-2026-v1
LICENSE_TOKEN_SECRET=dev-token-secret-change-in-prod
```

> **Note:** `LICENSE_SECRET` must match the value that was hardcoded in `licenseValidation.js` so existing issued keys remain valid. You will rotate this in production as part of Task 11.

- [ ] **Step 4: Commit**

```bash
git add songbook-worker/src/types.ts songbook-worker/vitest.config.ts songbook-worker/.dev.vars
git commit -m "chore(worker): add LICENSE_SECRET and LICENSE_TOKEN_SECRET to Env and test config"
```

---

## Task 2 — Worker: server-side license key validation library

**Files:**
- Create: `songbook-worker/src/lib/licenseValidation.ts`
- Create: `songbook-worker/src/lib/licenseValidation.test.ts`

This is a TypeScript port of the algorithm in `src/lib/licenseValidation.js`, with the secret injected as a parameter (never hardcoded). It uses `node:crypto` (available via the `nodejs_compat` flag already in `wrangler.toml`) so no extra npm dependencies are needed.

- [ ] **Step 1: Write the failing test**

Create `songbook-worker/src/lib/licenseValidation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateLicenseKey, isLicenseExpired } from './licenseValidation';

// A key generated with secret='test-license-secret', expiresAt=0, licenseType=1
// Generate once by running: node -e "
//   const { createHash } = require('crypto');
//   const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
//   function bitsToChar(v) { return ALPHA[v & 0x1f]; }
//   function encodePayload({ version, expiresAt, licenseType, random }) {
//     const bits = new Array(60).fill(0);
//     const wb = (s,c,v) => { for(let i=c-1;i>=0;i--){ bits[s+i]=v&1; v>>=1; } };
//     wb(0,4,version); wb(4,31,expiresAt); wb(35,4,licenseType); wb(39,21,random);
//     let ch=''; for(let i=0;i<12;i++){ let v=0; for(let b=0;b<5;b++) v=(v<<1)|bits[i*5+b]; ch+=bitsToChar(v); } return ch;
//   }
//   const p = encodePayload({ version:0, expiresAt:0, licenseType:1, random:42 });
//   const h = createHash('md5').update('test-license-secret'+p).digest('hex');
//   let bits=0; for(let i=0;i<5;i++) bits=(bits<<4)|parseInt(h[i],16);
//   let ck=''; for(let i=0;i<4;i++) ck+=bitsToChar((bits>>(15-i*5))&0x1f);
//   console.log('SONGBOOK-'+p.slice(0,4)+'-'+p.slice(4,8)+'-'+p.slice(8,12)+'-'+ck);
// "
// Paste the output below:
const SECRET = 'test-license-secret';

function makeTestKey(secret: string, expiresAt = 0, licenseType = 1): string {
  const { createHash } = require('node:crypto');
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bitsToChar = (v: number) => ALPHA[v & 0x1f];
  const bits = new Array(60).fill(0);
  const wb = (s: number, c: number, v: number) => {
    for (let i = c - 1; i >= 0; i--) { bits[s + i] = v & 1; v >>= 1; }
  };
  wb(0, 4, 0); wb(4, 31, expiresAt); wb(35, 4, licenseType); wb(39, 21, 42);
  let payload = '';
  for (let i = 0; i < 12; i++) {
    let v = 0; for (let b = 0; b < 5; b++) v = (v << 1) | bits[i * 5 + b];
    payload += bitsToChar(v);
  }
  const hash = createHash('md5').update(secret + payload).digest('hex');
  let hbits = 0;
  for (let i = 0; i < 5; i++) hbits = (hbits << 4) | parseInt(hash[i], 16);
  let checksum = '';
  for (let i = 0; i < 4; i++) checksum += bitsToChar((hbits >> (15 - i * 5)) & 0x1f);
  return `SONGBOOK-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${checksum}`;
}

describe('validateLicenseKey (server)', () => {
  it('accepts a valid key with no expiry', () => {
    const key = makeTestKey(SECRET);
    const result = validateLicenseKey(key, SECRET);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.payload.expiresAt).toBe(0);
  });

  it('rejects a key whose checksum does not match the given secret', () => {
    const key = makeTestKey(SECRET);
    const result = validateLicenseKey(key, 'wrong-secret');
    expect(result.valid).toBe(false);
  });

  it('rejects a key with a tampered payload segment', () => {
    const key = makeTestKey(SECRET);
    const parts = key.split('-');
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    parts[2] = parts[2].split('').map((c, i) => i === 0 ? ALPHA[(ALPHA.indexOf(c) + 1) % 32] : c).join('');
    expect(validateLicenseKey(parts.join('-'), SECRET).valid).toBe(false);
  });

  it('rejects wrong format', () => {
    expect(validateLicenseKey('BLAH', SECRET).valid).toBe(false);
    expect(validateLicenseKey('SONGBOOK-AAAA-AAAA-AAAA', SECRET).valid).toBe(false);
  });

  it('accepts lowercase / padded whitespace input', () => {
    const key = makeTestKey(SECRET);
    expect(validateLicenseKey(key.toLowerCase(), SECRET).valid).toBe(true);
    expect(validateLicenseKey(`  ${key}  `, SECRET).valid).toBe(true);
  });
});

describe('isLicenseExpired (server)', () => {
  it('returns false when expiresAt is 0 (no expiry)', () => {
    expect(isLicenseExpired({ version: 0, expiresAt: 0, licenseType: 1 })).toBe(false);
  });

  it('returns false for a future timestamp', () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    expect(isLicenseExpired({ version: 0, expiresAt: future, licenseType: 1 })).toBe(false);
  });

  it('returns true for a past timestamp', () => {
    const past = Math.floor(Date.now() / 1000) - 86400;
    expect(isLicenseExpired({ version: 0, expiresAt: past, licenseType: 1 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd songbook-worker && npx vitest run src/lib/licenseValidation.test.ts
```

Expected: `FAIL` — `Cannot find module './licenseValidation'`

- [ ] **Step 3: Implement `licenseValidation.ts`**

Create `songbook-worker/src/lib/licenseValidation.ts`:

```ts
import { createHash } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KEY_REGEX = /^SONGBOOK-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export interface LicensePayload {
  version: number;
  expiresAt: number;  // Unix seconds; 0 = never expires
  licenseType: number;
}

function charToBits(ch: string): number {
  const i = ALPHABET.indexOf(ch);
  if (i === -1) throw new Error(`Invalid character: ${ch}`);
  return i;
}

function bitsToChar(bits: number): string {
  return ALPHABET[bits & 0x1f];
}

function decodePayload(chars: string): LicensePayload {
  if (chars.length !== 12) throw new Error('Payload must be 12 characters');
  const bits: number[] = [];
  for (let i = 0; i < 12; i++) {
    const v = charToBits(chars[i]);
    for (let b = 0; b < 5; b++) bits.push((v >> (4 - b)) & 1);
  }
  const readBits = (start: number, count: number): number => {
    let val = 0;
    for (let i = 0; i < count; i++) val = (val << 1) | bits[start + i];
    return val;
  };
  return {
    version: readBits(0, 4),
    expiresAt: readBits(4, 31),
    licenseType: readBits(35, 4),
  };
}

function computeChecksum(payload: string, secret: string): string {
  const hash = createHash('md5').update(secret + payload).digest('hex');
  let bits = 0;
  for (let i = 0; i < 5; i++) bits = (bits << 4) | parseInt(hash[i], 16);
  let checksum = '';
  for (let i = 0; i < 4; i++) checksum += bitsToChar((bits >> (15 - i * 5)) & 0x1f);
  return checksum;
}

export function validateLicenseKey(
  key: string,
  secret: string,
): { valid: false; error: string } | { valid: true; payload: LicensePayload } {
  if (!key || typeof key !== 'string') return { valid: false, error: 'No license key provided' };
  const cleaned = key.trim().toUpperCase();
  if (!KEY_REGEX.test(cleaned)) return { valid: false, error: 'Invalid license key format' };

  const segments = cleaned.split('-');
  const payload = segments[1] + segments[2] + segments[3];
  const claimedChecksum = segments[4];

  if (claimedChecksum !== computeChecksum(payload, secret)) {
    return { valid: false, error: 'Invalid license key' };
  }

  let payloadData: LicensePayload;
  try {
    payloadData = decodePayload(payload);
  } catch {
    return { valid: false, error: 'Invalid license key' };
  }

  if (payloadData.version > 1) return { valid: false, error: 'Unsupported license version' };
  return { valid: true, payload: payloadData };
}

export function isLicenseExpired(payload: LicensePayload): boolean {
  if (!payload || payload.expiresAt === 0) return false;
  return Date.now() / 1000 > payload.expiresAt;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd songbook-worker && npx vitest run src/lib/licenseValidation.test.ts
```

Expected: all tests `PASS`

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/lib/licenseValidation.ts songbook-worker/src/lib/licenseValidation.test.ts
git commit -m "feat(worker): add server-side license key validation library"
```

---

## Task 3 — Worker: license token sign/verify library

**Files:**
- Create: `songbook-worker/src/lib/licenseToken.ts`
- Create: `songbook-worker/src/lib/licenseToken.test.ts`

Issues a short-lived (24 h) HMAC-SHA-256 signed token using the Web Crypto API, which is always available in Cloudflare Workers.

- [ ] **Step 1: Write the failing test**

Create `songbook-worker/src/lib/licenseToken.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { signLicenseToken, verifyLicenseToken } from './licenseToken';

const SECRET = 'test-token-secret';

describe('signLicenseToken', () => {
  it('returns a token string and an ISO expiresAt', async () => {
    const { token, expiresAt } = await signLicenseToken('SONGBOOK-AAAA-BBBB-CCCC-DDDD', SECRET);
    expect(typeof token).toBe('string');
    expect(token.includes('.')).toBe(true);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('token expires roughly 24 hours from now', async () => {
    const before = Date.now();
    const { expiresAt } = await signLicenseToken('TEST-KEY', SECRET);
    const exp = new Date(expiresAt).getTime();
    expect(exp - before).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(exp - before).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });
});

describe('verifyLicenseToken', () => {
  it('returns true for a freshly signed token', async () => {
    const { token } = await signLicenseToken('SONGBOOK-TEST-KEY', SECRET);
    expect(await verifyLicenseToken(token, SECRET)).toBe(true);
  });

  it('returns false for a token signed with a different secret', async () => {
    const { token } = await signLicenseToken('SONGBOOK-TEST-KEY', SECRET);
    expect(await verifyLicenseToken(token, 'other-secret')).toBe(false);
  });

  it('returns false for a tampered payload', async () => {
    const { token } = await signLicenseToken('SONGBOOK-TEST-KEY', SECRET);
    const [payload, sig] = token.split('.');
    const tamperedPayload = payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A');
    expect(await verifyLicenseToken(`${tamperedPayload}.${sig}`, SECRET)).toBe(false);
  });

  it('returns false for undefined or empty input', async () => {
    expect(await verifyLicenseToken(undefined, SECRET)).toBe(false);
    expect(await verifyLicenseToken('', SECRET)).toBe(false);
    expect(await verifyLicenseToken('notadottoken', SECRET)).toBe(false);
  });

  it('returns false for an expired token', async () => {
    // Build a token whose exp is 1 second in the past
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const payload = { sub: 'KEY', iat: 0, exp: Math.floor(Date.now() / 1000) - 1 };
    const payloadStr = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr));
    const sigStr = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(await verifyLicenseToken(`${payloadStr}.${sigStr}`, SECRET)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd songbook-worker && npx vitest run src/lib/licenseToken.test.ts
```

Expected: `FAIL` — `Cannot find module './licenseToken'`

- [ ] **Step 3: Implement `licenseToken.ts`**

Create `songbook-worker/src/lib/licenseToken.ts`:

```ts
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(str: string): Uint8Array {
  return Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

async function importKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signLicenseToken(
  licenseKey: string,
  secret: string,
): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_TTL_SECONDS;
  const payload: TokenPayload = { sub: licenseKey, iat: now, exp };

  const payloadStr = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importKey(secret, 'sign');
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr));

  return {
    token: `${payloadStr}.${toBase64Url(new Uint8Array(sigBytes))}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export async function verifyLicenseToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;

  const payloadStr = token.slice(0, dot);
  const sigStr = token.slice(dot + 1);

  try {
    const key = await importKey(secret, 'verify');
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigStr),
      new TextEncoder().encode(payloadStr),
    );
    if (!valid) return false;

    const payload: TokenPayload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadStr)),
    );
    return payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd songbook-worker && npx vitest run src/lib/licenseToken.test.ts
```

Expected: all tests `PASS`

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/lib/licenseToken.ts songbook-worker/src/lib/licenseToken.test.ts
git commit -m "feat(worker): add HMAC-SHA-256 license token sign/verify"
```

---

## Task 4 — Worker: `POST /license/validate` route

**Files:**
- Create: `songbook-worker/src/routes/license.ts`
- Create: `songbook-worker/src/routes/license.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `songbook-worker/src/routes/license.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';
const h = { 'Content-Type': 'application/json', 'Origin': ORIGIN };

// makeTestKey uses the same secret configured in vitest.config.ts miniflare bindings
// (LICENSE_SECRET = 'test-license-secret'). It reimplements the minimal algorithm inline
// to avoid any dependency on the client-side licenseValidation.js.
function makeTestKey(secret: string, expiresAt = 0): string {
  const { createHash } = require('node:crypto');
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bitsToChar = (v: number) => ALPHA[v & 0x1f];
  const bits = new Array(60).fill(0);
  const wb = (s: number, c: number, v: number) => {
    for (let i = c - 1; i >= 0; i--) { bits[s + i] = v & 1; v >>= 1; }
  };
  wb(0, 4, 0); wb(4, 31, expiresAt); wb(35, 4, 1); wb(39, 21, 77);
  let payload = '';
  for (let i = 0; i < 12; i++) {
    let v = 0; for (let b = 0; b < 5; b++) v = (v << 1) | bits[i * 5 + b];
    payload += bitsToChar(v);
  }
  const hash = createHash('md5').update(secret + payload).digest('hex');
  let hbits = 0;
  for (let i = 0; i < 5; i++) hbits = (hbits << 4) | parseInt(hash[i], 16);
  let ck = '';
  for (let i = 0; i < 4; i++) ck += bitsToChar((hbits >> (15 - i * 5)) & 0x1f);
  return `SONGBOOK-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${ck}`;
}

const VALID_KEY = makeTestKey('test-license-secret');
const EXPIRED_KEY = makeTestKey('test-license-secret', Math.floor(Date.now() / 1000) - 86400);

describe('POST /license/validate', () => {
  it('returns 400 when key is missing', async () => {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('missing_key');
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: { ...h, 'Content-Type': 'text/plain' }, body: 'notjson{',
    });
    expect(res.status).toBe(400);
  });

  it('returns 422 for an invalid key (wrong checksum)', async () => {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({ key: 'SONGBOOK-AAAA-BBBB-CCCC-DDDD' }),
    });
    expect(res.status).toBe(422);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('invalid_key');
  });

  it('returns 403 for an expired key', async () => {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({ key: EXPIRED_KEY }),
    });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('expired_key');
  });

  it('returns 200 with token and expiresAt for a valid key', async () => {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({ key: VALID_KEY }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { token: string; expiresAt: string };
    expect(typeof data.token).toBe('string');
    expect(data.token.includes('.')).toBe(true);
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('returns a token that expires ~24 h from now', async () => {
    const before = Date.now();
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({ key: VALID_KEY }),
    });
    const { expiresAt } = await res.json() as { expiresAt: string };
    const diff = new Date(expiresAt).getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(diff).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd songbook-worker && npx vitest run src/routes/license.test.ts
```

Expected: `FAIL` — route not found (404 from worker)

- [ ] **Step 3: Implement `routes/license.ts`**

Create `songbook-worker/src/routes/license.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../types';
import { validateLicenseKey, isLicenseExpired } from '../lib/licenseValidation';
import { signLicenseToken } from '../lib/licenseToken';

const license = new Hono<{ Bindings: Env }>();

license.post('/validate', async (c) => {
  let body: { key?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }

  if (typeof body.key !== 'string' || !body.key.trim()) {
    return c.json({ error: 'missing_key' }, 400);
  }

  const result = validateLicenseKey(body.key, c.env.LICENSE_SECRET);
  if (!result.valid) return c.json({ error: 'invalid_key' }, 422);
  if (isLicenseExpired(result.payload)) return c.json({ error: 'expired_key' }, 403);

  const { token, expiresAt } = await signLicenseToken(body.key, c.env.LICENSE_TOKEN_SECRET);
  return c.json({ token, expiresAt });
});

export default license;
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd songbook-worker && npx vitest run src/routes/license.test.ts
```

Expected: `FAIL` — still 404 (route not wired into app yet — that is Task 5)

- [ ] **Step 5: Commit the route file**

```bash
git add songbook-worker/src/routes/license.ts songbook-worker/src/routes/license.test.ts
git commit -m "feat(worker): add POST /license/validate route"
```

---

## Task 5 — Wire the `/license` route and update CORS

**Files:**
- Modify: `songbook-worker/src/index.ts`

- [ ] **Step 1: Add the route and the new CORS header**

Open `songbook-worker/src/index.ts`. Make exactly two changes:

1. Add the import after the existing route imports:
```ts
import license from './routes/license';
```

2. In the CORS middleware, replace the `Access-Control-Allow-Headers` value — add `X-License-Token` to the end:
```ts
'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In-Days, X-Leader-Token, X-Director-Token, X-Conductor-Token, X-Creator-Token, X-License-Token',
```

3. Add the route mount after the existing `app.route` calls:
```ts
app.route('/license', license);
```

The full updated file:

```ts
import { Hono } from 'hono';
import type { Env } from './types';
import share from './routes/share';
import walkieShare from './routes/walkieShare';
import session from './routes/session';
import conductor from './routes/conductor';
import album from './routes/album';
import license from './routes/license';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const requestOrigin = c.req.header('Origin') ?? '';
  const appOrigin = c.env.APP_ORIGIN ?? '';
  const walkieOrigin = c.env.WALKIE_ORIGIN ?? '';
  const allowedOrigins = new Set([
    ...appOrigin.split(',').map(o => o.trim()).filter(Boolean),
    ...walkieOrigin.split(',').map(o => o.trim()).filter(Boolean),
  ]);
  const allowed = allowedOrigins.has(requestOrigin);

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed ? requestOrigin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In-Days, X-Leader-Token, X-Director-Token, X-Conductor-Token, X-Creator-Token, X-License-Token',
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
app.route('/conductor', conductor);
app.route('/album', album);
app.route('/license', license);

export default app;
```

- [ ] **Step 2: Run the license tests — they should now pass**

```bash
cd songbook-worker && npx vitest run src/routes/license.test.ts
```

Expected: all tests `PASS`

- [ ] **Step 3: Run the full worker test suite to confirm no regressions**

```bash
cd songbook-worker && npx vitest run
```

Expected: all tests `PASS`

- [ ] **Step 4: Commit**

```bash
git add songbook-worker/src/index.ts
git commit -m "feat(worker): wire /license route and allow X-License-Token CORS header"
```

---

## Task 6 — Worker: enforce license token on `POST /conductor/create`

**Files:**
- Modify: `songbook-worker/src/routes/conductor.ts`
- Modify: `songbook-worker/src/routes/conductor.test.ts`

- [ ] **Step 1: Write failing tests for the new enforcement**

Open `songbook-worker/src/routes/conductor.test.ts` and add these two `describe` blocks immediately **before** the existing `describe('POST /conductor/create', ...)` block:

```ts
// ── Helper: obtain a real license token from the worker ───────────────────────
// Uses the same key-generation logic as license.test.ts.
// The test secret ('test-license-secret') matches vitest.config.ts miniflare bindings.
function makeTestKey(expiresAt = 0): string {
  const { createHash } = require('node:crypto');
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bitsToChar = (v: number) => ALPHA[v & 0x1f];
  const bits = new Array(60).fill(0);
  const wb = (s: number, c: number, v: number) => {
    for (let i = c - 1; i >= 0; i--) { bits[s + i] = v & 1; v >>= 1; }
  };
  wb(0, 4, 0); wb(4, 31, expiresAt); wb(35, 4, 1); wb(39, 21, 55);
  let payload = '';
  for (let i = 0; i < 12; i++) {
    let v = 0; for (let b = 0; b < 5; b++) v = (v << 1) | bits[i * 5 + b];
    payload += bitsToChar(v);
  }
  const hash = createHash('md5').update('test-license-secret' + payload).digest('hex');
  let hbits = 0;
  for (let i = 0; i < 5; i++) hbits = (hbits << 4) | parseInt(hash[i], 16);
  let ck = '';
  for (let i = 0; i < 4; i++) ck += bitsToChar((hbits >> (15 - i * 5)) & 0x1f);
  return `SONGBOOK-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${ck}`;
}

async function getLicenseToken(): Promise<string> {
  const res = await SELF.fetch('http://localhost/license/validate', {
    method: 'POST', headers: h, body: JSON.stringify({ key: makeTestKey() }),
  });
  const data = await res.json() as { token: string };
  return data.token;
}
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conductor/create — license enforcement', () => {
  it('returns 403 when X-License-Token header is absent', async () => {
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST', headers: h,
      body: JSON.stringify({ conductorCode: 'NOLIC1', directorToken: 'tok', maxFollowers: 5 }),
    });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('license_required');
  });

  it('returns 403 when X-License-Token is invalid', async () => {
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST',
      headers: { ...h, 'X-License-Token': 'garbage.token' },
      body: JSON.stringify({ conductorCode: 'NOLIC2', directorToken: 'tok', maxFollowers: 5 }),
    });
    expect(res.status).toBe(403);
  });

  it('creates the session when a valid token is provided', async () => {
    const token = await getLicenseToken();
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST',
      headers: { ...h, 'X-License-Token': token },
      body: JSON.stringify({ conductorCode: 'LIC001', directorToken: 'tok', maxFollowers: 5 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });
});
```

Also update the existing `createConductor` helper at the top of the file to include a token:

```ts
// Replace the existing createConductor helper with this version:
async function getLicenseTokenForTests(): Promise<string> {
  const { createHash } = require('node:crypto');
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bitsToChar = (v: number) => ALPHA[v & 0x1f];
  const bits = new Array(60).fill(0);
  const wb = (s: number, c: number, v: number) => {
    for (let i = c - 1; i >= 0; i--) { bits[s + i] = v & 1; v >>= 1; }
  };
  wb(0, 4, 0); wb(4, 31, 0); wb(35, 4, 1); wb(39, 21, 55);
  let payload = '';
  for (let i = 0; i < 12; i++) {
    let v = 0; for (let b = 0; b < 5; b++) v = (v << 1) | bits[i * 5 + b];
    payload += bitsToChar(v);
  }
  const hash = createHash('md5').update('test-license-secret' + payload).digest('hex');
  let hbits = 0;
  for (let i = 0; i < 5; i++) hbits = (hbits << 4) | parseInt(hash[i], 16);
  let ck = '';
  for (let i = 0; i < 4; i++) ck += bitsToChar((hbits >> (15 - i * 5)) & 0x1f);
  const key = `SONGBOOK-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${ck}`;
  const res = await SELF.fetch('http://localhost/license/validate', {
    method: 'POST', headers: h, body: JSON.stringify({ key }),
  });
  const data = await res.json() as { token: string };
  return data.token;
}

// Cached so each test file run only calls /license/validate once.
let _cachedToken: string | null = null;
async function getToken(): Promise<string> {
  if (!_cachedToken) _cachedToken = await getLicenseTokenForTests();
  return _cachedToken;
}

async function createConductor(body = {}) {
  const token = await getToken();
  return SELF.fetch('http://localhost/conductor/create', {
    method: 'POST',
    headers: { ...h, 'X-License-Token': token },
    body: JSON.stringify({ conductorCode: 'AABBCC', directorToken: 'tok-1', maxFollowers: 5, ...body }),
  });
}
```

- [ ] **Step 2: Run the tests to confirm new ones fail**

```bash
cd songbook-worker && npx vitest run src/routes/conductor.test.ts
```

Expected: the three new `license enforcement` tests `FAIL` (still 200 / no enforcement yet)

- [ ] **Step 3: Add token enforcement to the conductor route**

Open `songbook-worker/src/routes/conductor.ts`. Add the import at the top:

```ts
import { verifyLicenseToken } from '../lib/licenseToken';
```

Then add verification as the **first action** inside `conductor.post('/create', ...)`, before the JSON parse:

```ts
conductor.post('/create', async (c) => {
  const licenseToken = c.req.header('X-License-Token');
  if (!await verifyLicenseToken(licenseToken, c.env.LICENSE_TOKEN_SECRET)) {
    return c.json({ error: 'license_required' }, 403);
  }

  // ... rest of existing handler unchanged ...
```

- [ ] **Step 4: Run the tests and confirm all pass**

```bash
cd songbook-worker && npx vitest run src/routes/conductor.test.ts
```

Expected: all tests `PASS`

- [ ] **Step 5: Run full worker suite for regressions**

```bash
cd songbook-worker && npx vitest run
```

Expected: all tests `PASS`

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/src/routes/conductor.ts songbook-worker/src/routes/conductor.test.ts
git commit -m "feat(worker): require valid license token to create conductor session"
```

---

## Task 7 — Client: strip secret from `licenseValidation.js`

**Files:**
- Modify: `src/lib/licenseValidation.js`
- Modify: `src/lib/__tests__/licenseValidation.test.js`

The client module is reduced to a format-only check. The secret, checksum algorithm, payload encoder/decoder, and SparkMD5 import are all deleted. This is a **breaking change** to the module's public API — the tests must be updated in the same commit.

- [ ] **Step 1: Update the test file first**

Replace `src/lib/__tests__/licenseValidation.test.js` entirely with:

```js
import { describe, it, expect } from 'vitest'
import { isValidKeyFormat, getLicenseStatus } from '../licenseValidation'

const VALID_FORMAT = 'SONGBOOK-AAAA-BBBB-CCCC-DDDD'
const INVALID_FORMAT = 'SONGBOOK-AAAA-BBBB-CCCC'

describe('isValidKeyFormat', () => {
  it('returns true for a correctly formatted key', () => {
    expect(isValidKeyFormat(VALID_FORMAT)).toBe(true)
  })

  it('returns true for lowercase input', () => {
    expect(isValidKeyFormat(VALID_FORMAT.toLowerCase())).toBe(true)
  })

  it('returns true for input with surrounding whitespace', () => {
    expect(isValidKeyFormat(`  ${VALID_FORMAT}  `)).toBe(true)
  })

  it('returns false for missing segment', () => {
    expect(isValidKeyFormat(INVALID_FORMAT)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isValidKeyFormat(null)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidKeyFormat('')).toBe(false)
  })

  it('returns false for wrong prefix', () => {
    expect(isValidKeyFormat('XONGBOOK-AAAA-BBBB-CCCC-DDDD')).toBe(false)
  })
})

describe('getLicenseStatus', () => {
  it('returns missing for null', () => {
    expect(getLicenseStatus(null)).toBe('missing')
  })

  it('returns missing for empty string', () => {
    expect(getLicenseStatus('')).toBe('missing')
  })

  it('returns invalid_format for malformed key', () => {
    expect(getLicenseStatus(INVALID_FORMAT)).toBe('invalid_format')
  })

  it('returns unchecked for correctly formatted key (checksum not verified client-side)', () => {
    expect(getLicenseStatus(VALID_FORMAT)).toBe('unchecked')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npx vitest run src/lib/__tests__/licenseValidation.test.js
```

Expected: `FAIL` — `isValidKeyFormat` and new `getLicenseStatus` return values not found

- [ ] **Step 3: Replace `licenseValidation.js`**

Replace `src/lib/licenseValidation.js` entirely with:

```js
const KEY_REGEX = /^SONGBOOK-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/

export function isValidKeyFormat(key) {
  if (!key || typeof key !== 'string') return false
  return KEY_REGEX.test(key.trim().toUpperCase())
}

// Returns 'missing' | 'invalid_format' | 'unchecked'
// 'unchecked' means format is valid but server has not yet verified the checksum.
export function getLicenseStatus(key) {
  if (!key) return 'missing'
  if (!isValidKeyFormat(key)) return 'invalid_format'
  return 'unchecked'
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run src/lib/__tests__/licenseValidation.test.js
```

Expected: all tests `PASS`

- [ ] **Step 5: Run the full client test suite to confirm no other file depends on the removed exports**

```bash
npx vitest run
```

Expected: all tests `PASS`. If any other test imports `encodePayload`, `computeChecksum`, or `SECRET`, fix those imports now (they should not exist outside the test file you just replaced).

- [ ] **Step 6: Commit**

```bash
git add src/lib/licenseValidation.js src/lib/__tests__/licenseValidation.test.js
git commit -m "feat(client): strip license secret and checksum algorithm from client bundle"
```

---

## Task 8 — Client: license API module

**Files:**
- Create: `src/lib/licenseApi.js`
- Create: `src/lib/__tests__/licenseApi.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/licenseApi.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  saveLicenseToken, loadLicenseToken, clearLicenseToken, isTokenExpired,
} from '../licenseApi'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

function makeToken(expOffsetSeconds) {
  const exp = Math.floor(Date.now() / 1000) + expOffsetSeconds
  const payload = btoa(JSON.stringify({ sub: 'KEY', iat: 0, exp }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${payload}.fakesig`
}

describe('localStorage helpers', () => {
  it('saveLicenseToken stores the token', () => {
    saveLicenseToken('my-token')
    expect(localStorage.getItem('songsheet_license_token')).toBe('my-token')
  })

  it('loadLicenseToken returns the stored value', () => {
    localStorage.setItem('songsheet_license_token', 'stored-token')
    expect(loadLicenseToken()).toBe('stored-token')
  })

  it('loadLicenseToken returns null when nothing stored', () => {
    expect(loadLicenseToken()).toBeNull()
  })

  it('clearLicenseToken removes the stored value', () => {
    localStorage.setItem('songsheet_license_token', 'stored-token')
    clearLicenseToken()
    expect(localStorage.getItem('songsheet_license_token')).toBeNull()
  })
})

describe('isTokenExpired', () => {
  it('returns true for null', () => {
    expect(isTokenExpired(null)).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(isTokenExpired('')).toBe(true)
  })

  it('returns true for a token whose exp is in the past', () => {
    expect(isTokenExpired(makeToken(-1))).toBe(true)
  })

  it('returns false for a token whose exp is in the future', () => {
    expect(isTokenExpired(makeToken(3600))).toBe(false)
  })

  it('returns true for a malformed token', () => {
    expect(isTokenExpired('not.a.real.token.at.all')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/lib/__tests__/licenseApi.test.js
```

Expected: `FAIL` — module not found

- [ ] **Step 3: Implement `licenseApi.js`**

Create `src/lib/licenseApi.js`:

```js
const WORKER_URL = import.meta.env.VITE_WORKER_URL
const TOKEN_KEY = 'songsheet_license_token'

/**
 * Call the worker to validate a license key.
 * On success, returns { token, expiresAt }.
 * Throws with err.code = 'invalid' | 'expired' | 'network_error' on failure.
 */
export async function validateLicenseWithServer(key) {
  let res
  try {
    res = await fetch(`${WORKER_URL}/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
  } catch {
    throw Object.assign(new Error('network_error'), { code: 'network_error' })
  }
  if (res.status === 422) throw Object.assign(new Error('invalid'), { code: 'invalid' })
  if (res.status === 403) throw Object.assign(new Error('expired'), { code: 'expired' })
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' })
  return res.json()
}

export function saveLicenseToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function loadLicenseToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearLicenseToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * Decode the exp claim from the token payload (without verifying the signature —
 * signature verification happens server-side on /conductor/create).
 * Returns true if the token is missing, malformed, or expired.
 */
export function isTokenExpired(token) {
  if (!token) return true
  try {
    const [payloadB64] = token.split('.')
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
    const { exp } = JSON.parse(json)
    return !exp || Date.now() / 1000 >= exp
  } catch {
    return true
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run src/lib/__tests__/licenseApi.test.js
```

Expected: all tests `PASS`

- [ ] **Step 5: Commit**

```bash
git add src/lib/licenseApi.js src/lib/__tests__/licenseApi.test.js
git commit -m "feat(client): add licenseApi module for server validation and token storage"
```

---

## Task 9 — Client: update `LicenseContext` to use server validation

**Files:**
- Modify: `src/contexts/LicenseContext.jsx`

`LicenseContext` previously derived `isLicensed` from the client-side checksum check. It now calls the server on mount (and when the key changes) and stores the returned token. The rest of the app continues to consume `isLicensed` and `licenseStatus` with no changes — except `ShareModal`, which also gets `licenseToken` from the context (added in Task 10).

There is no Vitest test file for `LicenseContext` to update (it was tested indirectly). The context is tested end-to-end via the ShareModal tests in Task 10.

- [ ] **Step 1: Replace `LicenseContext.jsx`**

Replace `src/contexts/LicenseContext.jsx` entirely with:

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import {
  validateLicenseWithServer,
  saveLicenseToken,
  loadLicenseToken,
  clearLicenseToken,
  isTokenExpired,
} from '../lib/licenseApi'

export const LicenseContext = createContext()

export function LicenseProvider({ children }) {
  const [licenseKey, setLicenseKeyRaw] = useLocalStorage('songsheet_conductor_license', null)

  const [licenseToken, setLicenseToken] = useState(() => {
    const stored = loadLicenseToken()
    return stored && !isTokenExpired(stored) ? stored : null
  })

  // 'missing' | 'invalid_format' | 'invalid' | 'expired' | 'pending' | 'valid'
  const [licenseStatus, setLicenseStatus] = useState(() =>
    licenseToken ? 'valid' : (licenseKey ? 'pending' : 'missing')
  )
  const [validating, setValidating] = useState(false)

  const validateKey = useCallback(async (key) => {
    if (!key) {
      setLicenseToken(null)
      clearLicenseToken()
      setLicenseStatus('missing')
      return
    }
    setValidating(true)
    setLicenseStatus('pending')
    try {
      const { token } = await validateLicenseWithServer(key)
      saveLicenseToken(token)
      setLicenseToken(token)
      setLicenseStatus('valid')
    } catch (err) {
      clearLicenseToken()
      setLicenseToken(null)
      setLicenseStatus(err.code === 'expired' ? 'expired' : 'invalid')
    } finally {
      setValidating(false)
    }
  }, [])

  // On mount: re-validate if we have a key but the stored token is missing or expired.
  useEffect(() => {
    if (licenseKey && isTokenExpired(licenseToken)) {
      validateKey(licenseKey)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setLicenseKey = useCallback((key) => {
    setLicenseKeyRaw(key)
    validateKey(key)
  }, [setLicenseKeyRaw, validateKey])

  const isLicensed = licenseStatus === 'valid'

  return (
    <LicenseContext.Provider
      value={{ licenseKey, setLicenseKey, licenseStatus, isLicensed, validating, licenseToken }}
    >
      {children}
    </LicenseContext.Provider>
  )
}

export const useLicense = () => useContext(LicenseContext)
```

- [ ] **Step 2: Run the full client test suite**

```bash
npx vitest run
```

Expected: all tests `PASS`. If any test mocks `getLicenseStatus` from `licenseValidation`, update those mocks to mock `validateLicenseWithServer` from `licenseApi` instead.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/LicenseContext.jsx
git commit -m "feat(client): validate license key server-side in LicenseContext"
```

---

## Task 10 — Client: forward license token to conductor API

**Files:**
- Modify: `src/lib/conductorApi.js`
- Modify: `src/components/Share/ShareModal.jsx`

`createConductorSession` gains an optional `licenseToken` parameter. `ShareModal`, the only real call site, already imports `useLicense` and now also destructures `licenseToken` from it.

- [ ] **Step 1: Update `conductorApi.js`**

Open `src/lib/conductorApi.js` and replace the `createConductorSession` function:

```js
export async function createConductorSession({ conductorCode, directorToken, maxFollowers, licenseToken }) {
  const res = await fetch(`${workerUrl()}/conductor/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(licenseToken ? { 'X-License-Token': licenseToken } : {}),
    },
    body: JSON.stringify({ conductorCode, directorToken, maxFollowers }),
  })
  if (res.status === 403) throw Object.assign(new Error('license_required'), { code: 'license_required' })
  if (!res.ok) throw Object.assign(new Error('create_failed'), { code: 'create_failed' })
  return res.json()
}
```

- [ ] **Step 2: Update `ShareModal.jsx` to pass `licenseToken`**

Open `src/components/Share/ShareModal.jsx`.

Line 13 already destructures from `useLicense` — add `licenseToken`:

```jsx
const { isLicensed, licenseStatus, licenseToken } = useLicense();
```

Line 83, the `createConductorSession` call — add `licenseToken`:

```jsx
await createConductorSession({ conductorCode, directorToken, maxFollowers, licenseToken })
```

- [ ] **Step 3: Update the conductor API test mock in ShareModal tests**

Open `src/test/ShareModal.test.jsx` (and `src/components/Share/__tests__/ShareModal.conductor.test.jsx`). The mock for `createConductorSession` is already a `vi.fn().mockResolvedValue({})`. Update the mock's expected call assertion if any test checks that it was called without `licenseToken` — add `licenseToken: undefined` or update the test to pass a token via the mocked context.

Search for `createConductorSession` in both test files and ensure each `expect(createConductorSession).toHaveBeenCalledWith(...)` call includes `licenseToken` (or uses `expect.objectContaining` to avoid brittleness):

```js
// Example fix — use objectContaining so the test doesn't break if more fields are added later:
expect(createConductorSession).toHaveBeenCalledWith(
  expect.objectContaining({ conductorCode: expect.any(String), directorToken: expect.any(String) })
)
```

- [ ] **Step 4: Run the full client test suite**

```bash
npx vitest run
```

Expected: all tests `PASS`

- [ ] **Step 5: Commit**

```bash
git add src/lib/conductorApi.js src/components/Share/ShareModal.jsx \
  src/test/ShareModal.test.jsx \
  src/components/Share/__tests__/ShareModal.conductor.test.jsx
git commit -m "feat(client): send license token header when creating conductor session"
```

---

## Task 11 — Set production Wrangler secrets and rotate the old secret

This task is a **manual operations step**, not a code change.

- [ ] **Step 1: Generate a new `LICENSE_SECRET`**

The old secret (`songsheet-conductor-2026-v1`) is compromised — it shipped in every built bundle. You must use a new, random value. Generate one:

```bash
openssl rand -base64 32
```

Copy the output. This is your new `LICENSE_SECRET`. All **future** license keys must be generated with this new secret. Keys generated with the old secret will no longer validate — you must re-issue any keys you have distributed.

- [ ] **Step 2: Generate a `LICENSE_TOKEN_SECRET`**

```bash
openssl rand -base64 32
```

This value only needs to be consistent with itself — it is not used for key generation.

- [ ] **Step 3: Set the secrets in Cloudflare**

```bash
cd songbook-worker
wrangler secret put LICENSE_SECRET
# paste the value from Step 1 when prompted

wrangler secret put LICENSE_TOKEN_SECRET
# paste the value from Step 2 when prompted
```

- [ ] **Step 4: Deploy the worker**

```bash
cd songbook-worker && wrangler deploy
```

Confirm the deploy succeeds and `/health` returns `{"ok":true}`.

- [ ] **Step 5: Verify the endpoint works in production**

```bash
curl -s -X POST https://<your-worker-domain>/license/validate \
  -H "Content-Type: application/json" \
  -d '{"key":"SONGBOOK-AAAA-BBBB-CCCC-DDDD"}' | jq .
```

Expected: `{"error":"invalid_key"}` (422) — confirming the endpoint is live and the new secret is active.

- [ ] **Step 6: Re-generate and re-issue any licence keys**

Use the admin key-generation script (in `tools/` or `scripts/`) with the **new** `LICENSE_SECRET`. Any keys issued with the old secret are now invalid. Distribute new keys to existing licensees.

- [ ] **Step 7: Build and deploy the client**

```bash
cd /Volumes/HomeX/Chris/Documents/songbook && npm run build
```

Confirm that `dist/` contains no occurrence of the old secret:

```bash
grep -r "songsheet-conductor-2026-v1" dist/ && echo "SECRET STILL IN BUNDLE — DO NOT DEPLOY" || echo "Clean — safe to deploy"
```

Expected: `Clean — safe to deploy`

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Remove hardcoded secret from client bundle | Task 7 (strip licenseValidation.js) |
| Server holds secret in environment variable | Task 1 (Env types + .dev.vars + vitest config) |
| Server validates license key using existing algorithm | Task 2 (licenseValidation.ts) |
| Server issues short-lived signed token | Task 3 (licenseToken.ts) |
| POST /license/validate endpoint | Task 4 + 5 |
| Worker enforces token on conductor create | Task 6 |
| Client calls server on mount + key change | Task 9 (LicenseContext) |
| Client stores and forwards token | Tasks 8, 10 |
| Old secret rotation + re-issue of keys | Task 11 |

### No Placeholders

All code blocks are complete and self-contained. No "TBD" or "similar to" references.

### Type Consistency

- `LicensePayload` is defined in `licenseValidation.ts` and used only within that module.
- `signLicenseToken` / `verifyLicenseToken` are defined in `licenseToken.ts` and imported by `routes/license.ts` and `routes/conductor.ts`.
- `validateLicenseWithServer`, `saveLicenseToken`, `loadLicenseToken`, `clearLicenseToken`, `isTokenExpired` are defined in `licenseApi.js` and imported only by `LicenseContext.jsx`.
- `licenseToken` is a new field on the `LicenseContext` value — `ShareModal` reads it and passes it to `createConductorSession`.
