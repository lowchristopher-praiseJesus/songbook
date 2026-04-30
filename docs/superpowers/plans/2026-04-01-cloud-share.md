# Cloud Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to upload selected songs to Cloudflare R2 via a Worker, receive a shareable URL, and let recipients import those songs by clicking the URL.

**Architecture:** A Cloudflare Worker (Hono) acts as a proxy to R2 — the browser never holds R2 credentials. The Worker exposes two endpoints: POST `/share/upload` writes the `.sbp` blob with expiry metadata, GET `/share/:code` streams it back after checking expiry. The React SPA detects `?share=<uuid>` on load, fetches the blob, parses it, and shows a confirmation modal before importing.

**Tech Stack:** Cloudflare Workers + Hono + `@cloudflare/vitest-pool-workers`; React 18 + Vite + Zustand (existing); `exportSongsAsSbp` / `parseSbpFile` already exist and are reused.

---

## File Map

### New: `songbook-worker/` (Cloudflare Worker — new subfolder in repo root)

| File | Responsibility |
|------|---------------|
| `wrangler.toml` | Worker name, R2 binding, compatibility settings |
| `package.json` | hono, wrangler, vitest, @cloudflare/vitest-pool-workers |
| `tsconfig.json` | TypeScript config for Workers runtime |
| `vitest.config.ts` | Pool workers config pointing to wrangler.toml |
| `src/types.ts` | `Env` interface (R2_BUCKET, APP_ORIGIN) |
| `src/lib/r2.ts` | `putShare`, `getShareIfValid` — all R2 operations |
| `src/routes/share.ts` | Upload and download route handlers |
| `src/index.ts` | Hono app entry: CORS middleware + route mount |
| `test/share.test.ts` | Integration tests via SELF + in-memory R2 bucket |

### New: Frontend files

| File | Responsibility |
|------|---------------|
| `src/lib/shareApi.js` | `uploadShare(blob, days)` and `fetchShare(code)` — all Worker calls |
| `src/components/Share/ShareModal.jsx` | Expiry picker → upload progress → share URL display |
| `src/components/Share/ImportConfirmModal.jsx` | Song list preview + Import All / Cancel |

### Modified: Frontend files

| File | Change |
|------|--------|
| `src/components/Sidebar/Sidebar.jsx` | Export button opens choice modal (Download vs Share) |
| `src/App.jsx` | Detects `?share=` param on mount, shows ImportConfirmModal |

---

## Task 1: Scaffold the Cloudflare Worker project

**Files:**
- Create: `songbook-worker/wrangler.toml`
- Create: `songbook-worker/package.json`
- Create: `songbook-worker/tsconfig.json`
- Create: `songbook-worker/src/types.ts`

- [ ] **Step 1: Create the worker folder and wrangler.toml**

```bash
mkdir -p songbook-worker/src songbook-worker/test
```

`songbook-worker/wrangler.toml`:
```toml
name = "songbook-worker"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "songbook-shares"

# APP_ORIGIN is set as a secret: wrangler secret put APP_ORIGIN
```

- [ ] **Step 2: Create package.json**

`songbook-worker/package.json`:
```json
{
  "name": "songbook-worker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.80.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

`songbook-worker/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 4: Create src/types.ts**

`songbook-worker/src/types.ts`:
```typescript
export interface Env {
  R2_BUCKET: R2Bucket;
  APP_ORIGIN: string;
}
```

- [ ] **Step 5: Install dependencies**

```bash
cd songbook-worker && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/
git commit -m "feat: scaffold cloudflare worker project"
```

---

## Task 2: R2 helper functions (TDD)

**Files:**
- Create: `songbook-worker/src/lib/r2.ts`
- Create: `songbook-worker/vitest.config.ts`
- Test: `songbook-worker/test/share.test.ts` (partial — r2 helpers only)

- [ ] **Step 1: Create vitest.config.ts**

`songbook-worker/vitest.config.ts`:
```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: { APP_ORIGIN: 'http://localhost:5173' },
        },
      },
    },
  },
});
```

- [ ] **Step 2: Write failing tests for putShare and getShareIfValid**

`songbook-worker/test/share.test.ts`:
```typescript
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { putShare, getShareIfValid } from '../src/lib/r2';

describe('putShare', () => {
  it('writes blob to R2 with expiresAt metadata', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await putShare(env.R2_BUCKET, 'test-put', body, expiresAt);

    const obj = await env.R2_BUCKET.head('test-put');
    expect(obj).not.toBeNull();
    expect(obj?.customMetadata?.expiresAt).toBe(expiresAt.toISOString());
    expect(obj?.httpMetadata?.contentType).toBe('application/zip');
  });
});

describe('getShareIfValid', () => {
  it('returns object for a valid non-expired share', async () => {
    const body = new Uint8Array([10, 20, 30]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('valid-code', body, {
      customMetadata: { expiresAt: expiresAt.toISOString() },
    });

    const result = await getShareIfValid(env.R2_BUCKET, 'valid-code');
    expect('error' in result).toBe(false);
  });

  it('returns { error: "not_found" } for unknown key', async () => {
    const result = await getShareIfValid(env.R2_BUCKET, 'nonexistent');
    expect(result).toEqual({ error: 'not_found' });
  });

  it('returns { error: "expired" } when expiresAt is in the past', async () => {
    const past = new Date(Date.now() - 1000);
    await env.R2_BUCKET.put('expired-code', new Uint8Array([1]), {
      customMetadata: { expiresAt: past.toISOString() },
    });

    const result = await getShareIfValid(env.R2_BUCKET, 'expired-code');
    expect(result).toEqual({ error: 'expired' });
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd songbook-worker && npm test
```

Expected: FAIL — `Cannot find module '../src/lib/r2'`

- [ ] **Step 4: Implement src/lib/r2.ts**

`songbook-worker/src/lib/r2.ts`:
```typescript
export async function putShare(
  bucket: R2Bucket,
  shareCode: string,
  body: ArrayBuffer | Uint8Array | ReadableStream,
  expiresAt: Date,
): Promise<void> {
  await bucket.put(shareCode, body, {
    customMetadata: { expiresAt: expiresAt.toISOString() },
    httpMetadata: { contentType: 'application/zip' },
  });
}

export async function getShareIfValid(
  bucket: R2Bucket,
  shareCode: string,
): Promise<{ object: R2ObjectBody } | { error: 'not_found' | 'expired' }> {
  const head = await bucket.head(shareCode);
  if (!head) return { error: 'not_found' };

  const expiresAt = new Date(head.customMetadata?.expiresAt ?? '');
  if (isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
    return { error: 'expired' };
  }

  const object = await bucket.get(shareCode);
  if (!object) return { error: 'not_found' };
  return { object };
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd songbook-worker && npm test
```

Expected: PASS — 4 tests passing.

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/src/lib/r2.ts songbook-worker/vitest.config.ts songbook-worker/test/share.test.ts
git commit -m "feat: add R2 helper functions with tests"
```

---

## Task 3: Share upload route (TDD)

**Files:**
- Create: `songbook-worker/src/routes/share.ts`
- Modify: `songbook-worker/test/share.test.ts` (append upload route tests)

- [ ] **Step 1: Append upload route tests to test/share.test.ts**

Add these imports at the top of the file (after existing imports):
```typescript
import { SELF } from 'cloudflare:test';
```

Append to the end of `test/share.test.ts`:
```typescript
const ORIGIN = 'http://localhost:5173';

describe('POST /share/upload', () => {
  it('stores blob and returns shareCode, shareUrl, expiresAt', async () => {
    const res = await SELF.fetch('http://example.com/share/upload', {
      method: 'POST',
      body: new Uint8Array([1, 2, 3]),
      headers: { 'X-Expires-In-Days': '7', Origin: ORIGIN },
    });
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      shareCode: string;
      shareUrl: string;
      expiresAt: string;
    };
    expect(json.shareCode).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.shareUrl).toBe(`${ORIGIN}?share=${json.shareCode}`);

    const obj = await env.R2_BUCKET.head(json.shareCode);
    expect(obj?.customMetadata?.expiresAt).toBe(json.expiresAt);
  });

  it('clamps expiresInDays to 30 when given 999', async () => {
    const res = await SELF.fetch('http://example.com/share/upload', {
      method: 'POST',
      body: new Uint8Array([1]),
      headers: { 'X-Expires-In-Days': '999', Origin: ORIGIN },
    });
    const { expiresAt } = (await res.json()) as { expiresAt: string };
    const diffDays =
      (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeLessThanOrEqual(30.1);
  });

  it('returns 400 for empty body', async () => {
    const res = await SELF.fetch('http://example.com/share/upload', {
      method: 'POST',
      body: new Uint8Array([]),
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests — confirm new tests fail**

```bash
cd songbook-worker && npm test
```

Expected: FAIL — no `/share/upload` route exists yet.

- [ ] **Step 3: Create src/routes/share.ts with upload route**

`songbook-worker/src/routes/share.ts`:
```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { putShare, getShareIfValid } from '../lib/r2';

const share = new Hono<{ Bindings: Env }>();

share.post('/upload', async (c) => {
  const rawDays = Number(c.req.header('X-Expires-In-Days') ?? '7');
  const expiresInDays = isNaN(rawDays) ? 7 : Math.min(30, Math.max(1, rawDays));
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: 'no_body' }, 400);

  const shareCode = crypto.randomUUID();
  await putShare(c.env.R2_BUCKET, shareCode, body, expiresAt);

  const shareUrl = `${c.env.APP_ORIGIN}?share=${shareCode}`;
  return c.json({ shareCode, shareUrl, expiresAt: expiresAt.toISOString() });
});

export default share;
```

- [ ] **Step 4: Create src/index.ts (minimal — just enough to mount the route)**

`songbook-worker/src/index.ts`:
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import share from './routes/share';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  return cors({
    origin: c.env.APP_ORIGIN,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Expires-In-Days'],
  })(c, next);
});

app.get('/health', (c) => c.json({ ok: true }));
app.route('/share', share);

export default app;
```

- [ ] **Step 5: Run tests — confirm upload tests pass**

```bash
cd songbook-worker && npm test
```

Expected: all R2 helper tests + upload tests pass.

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/src/routes/share.ts songbook-worker/src/index.ts songbook-worker/test/share.test.ts
git commit -m "feat: add share upload route"
```

---

## Task 4: Share download route (TDD)

**Files:**
- Modify: `songbook-worker/src/routes/share.ts` (append GET route)
- Modify: `songbook-worker/test/share.test.ts` (append download tests)

- [ ] **Step 1: Append download route tests to test/share.test.ts**

```typescript
describe('GET /share/:code', () => {
  it('streams blob for a valid non-expired share', async () => {
    const body = new Uint8Array([10, 20, 30]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('dl-valid', body, {
      customMetadata: { expiresAt: expiresAt.toISOString() },
    });

    const res = await SELF.fetch('http://example.com/share/dl-valid', {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf).toEqual(body);
  });

  it('returns 404 for unknown share code', async () => {
    const res = await SELF.fetch('http://example.com/share/no-such-code', {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });

  it('returns 410 for an expired share', async () => {
    const past = new Date(Date.now() - 1000);
    await env.R2_BUCKET.put('dl-expired', new Uint8Array([1]), {
      customMetadata: { expiresAt: past.toISOString() },
    });

    const res = await SELF.fetch('http://example.com/share/dl-expired', {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: 'expired' });
  });
});
```

- [ ] **Step 2: Run tests — confirm new tests fail**

```bash
cd songbook-worker && npm test
```

Expected: FAIL — no GET route for `/share/:code`.

- [ ] **Step 3: Append GET route to src/routes/share.ts**

Add after the `share.post('/upload', ...)` block:
```typescript
share.get('/:code', async (c) => {
  const shareCode = c.req.param('code');
  const result = await getShareIfValid(c.env.R2_BUCKET, shareCode);

  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : 410;
    return c.json({ error: result.error }, status);
  }

  return new Response(result.object.body, {
    headers: { 'Content-Type': 'application/zip' },
  });
});
```

- [ ] **Step 4: Run all tests — confirm they all pass**

```bash
cd songbook-worker && npm test
```

Expected: all tests pass (R2 helpers + upload + download).

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/routes/share.ts songbook-worker/test/share.test.ts
git commit -m "feat: add share download route"
```

---

## Task 5: Deploy the Worker to Cloudflare

**Prerequisites:** A Cloudflare account with Workers and R2 enabled. Run these from inside `songbook-worker/`.

- [ ] **Step 1: Authenticate with Cloudflare**

```bash
cd songbook-worker && npx wrangler login
```

A browser window will open. Log in and authorize.

- [ ] **Step 2: Create the R2 bucket**

```bash
npx wrangler r2 bucket create songbook-shares
```

Expected: `Created bucket 'songbook-shares'`

- [ ] **Step 3: Set APP_ORIGIN secret**

```bash
npx wrangler secret put APP_ORIGIN
```

When prompted, enter the URL where the React SPA is hosted (e.g. `https://your-app.netlify.app`). For local dev, you'll set `.dev.vars` separately (next step).

- [ ] **Step 4: Create .dev.vars for local development**

`songbook-worker/.dev.vars` (not committed — add to .gitignore):
```
APP_ORIGIN=http://localhost:5173
```

Also update `.gitignore` in the worker folder:
```bash
echo ".dev.vars" >> songbook-worker/.gitignore
echo "node_modules/" >> songbook-worker/.gitignore
```

- [ ] **Step 5: Deploy**

```bash
npx wrangler deploy
```

Expected output includes:
```
Uploaded songbook-worker
Published songbook-worker (https://songbook-worker.<your-subdomain>.workers.dev)
```

Note the Worker URL — you will need it in Step 6.

- [ ] **Step 6: Smoke-test the deployed Worker**

```bash
curl -X POST https://songbook-worker.<your-subdomain>.workers.dev/share/upload \
  -H "Content-Type: application/zip" \
  -H "X-Expires-In-Days: 1" \
  --data-binary "test" \
  -i
```

Expected: HTTP 200 with JSON body containing `shareCode`, `shareUrl`, `expiresAt`.

- [ ] **Step 7: Commit .gitignore**

```bash
git add songbook-worker/.gitignore
git commit -m "chore: add worker gitignore for .dev.vars"
```

---

## Task 6: `shareApi.js` — frontend Worker client (TDD)

**Files:**
- Create: `src/lib/shareApi.js`
- Create: `src/test/shareApi.test.js`

- [ ] **Step 1: Write failing tests**

`src/test/shareApi.test.js`:
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadShare, fetchShare } from '../lib/shareApi';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('uploadShare', () => {
  it('POSTs blob with correct headers and returns JSON', async () => {
    const mockResult = {
      shareCode: 'abc-123',
      shareUrl: 'http://app?share=abc-123',
      expiresAt: '2026-04-08T00:00:00.000Z',
    };
    fetch.mockResolvedValue({ ok: true, json: async () => mockResult });

    const blob = new Blob(['zip-data'], { type: 'application/zip' });
    const result = await uploadShare(blob, 14);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/share/upload'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/zip',
          'X-Expires-In-Days': '14',
        }),
        body: blob,
      }),
    );
    expect(result).toEqual(mockResult);
  });

  it('uses 7 as default expiresInDays', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await uploadShare(new Blob(['x']));
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Expires-In-Days': '7' }),
      }),
    );
  });

  it('throws with code upload_failed on non-ok response', async () => {
    fetch.mockResolvedValue({ ok: false });
    await expect(uploadShare(new Blob(['x']), 7)).rejects.toMatchObject({
      code: 'upload_failed',
    });
  });
});

describe('fetchShare', () => {
  it('returns ArrayBuffer on 200', async () => {
    const buf = new ArrayBuffer(4);
    fetch.mockResolvedValue({ status: 200, ok: true, arrayBuffer: async () => buf });
    const result = await fetchShare('abc123');
    expect(result).toBe(buf);
  });

  it('throws with code not_found on 404', async () => {
    fetch.mockResolvedValue({ status: 404, ok: false });
    await expect(fetchShare('abc')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws with code expired on 410', async () => {
    fetch.mockResolvedValue({ status: 410, ok: false });
    await expect(fetchShare('abc')).rejects.toMatchObject({ code: 'expired' });
  });

  it('throws with code network_error on other failure', async () => {
    fetch.mockResolvedValue({ status: 500, ok: false });
    await expect(fetchShare('abc')).rejects.toMatchObject({ code: 'network_error' });
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- src/test/shareApi.test.js
```

Expected: FAIL — `Cannot find module '../lib/shareApi'`

- [ ] **Step 3: Implement src/lib/shareApi.js**

`src/lib/shareApi.js`:
```javascript
const WORKER_URL = import.meta.env.VITE_WORKER_URL;

export async function uploadShare(blob, expiresInDays = 7) {
  const res = await fetch(`${WORKER_URL}/share/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'X-Expires-In-Days': String(expiresInDays),
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
  const res = await fetch(`${WORKER_URL}/share/${shareCode}`);
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (res.status === 410) throw Object.assign(new Error('expired'), { code: 'expired' });
  if (!res.ok) throw Object.assign(new Error('network_error'), { code: 'network_error' });
  return res.arrayBuffer();
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- src/test/shareApi.test.js
```

Expected: 8 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shareApi.js src/test/shareApi.test.js
git commit -m "feat: add shareApi client for Worker communication"
```

---

## Task 7: `ShareModal` component (TDD)

**Files:**
- Create: `src/components/Share/ShareModal.jsx`
- Create: `src/test/ShareModal.test.jsx`

- [ ] **Step 1: Write failing tests**

`src/test/ShareModal.test.jsx`:
```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShareModal } from '../components/Share/ShareModal';

vi.mock('../lib/shareApi', () => ({ uploadShare: vi.fn() }));
vi.mock('../lib/exportSbp', () => ({ exportSongsAsSbp: vi.fn() }));

import { uploadShare } from '../lib/shareApi';
import { exportSongsAsSbp } from '../lib/exportSbp';

const songs = [{ meta: { title: 'El Shaddai' }, id: '1' }];

beforeEach(() => {
  exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
});

describe('ShareModal', () => {
  it('renders title and default 7-day expiry when open', () => {
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    expect(screen.getByText('Share via link')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7 days')).toBeInTheDocument();
    expect(screen.getByText('1 song will be shared.')).toBeInTheDocument();
  });

  it('shows uploading spinner after clicking Create link', async () => {
    uploadShare.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    expect(await screen.findByText('Uploading…')).toBeInTheDocument();
  });

  it('shows share URL input after successful upload', async () => {
    uploadShare.mockResolvedValue({
      shareCode: 'abc',
      shareUrl: 'http://app?share=abc',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    expect(await screen.findByDisplayValue('http://app?share=abc')).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('shows error message and Retry button on upload failure', async () => {
    uploadShare.mockRejectedValue(Object.assign(new Error('fail'), { code: 'upload_failed' }));
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    expect(await screen.findByText('Retry')).toBeInTheDocument();
    expect(screen.getByText(/Upload failed/)).toBeInTheDocument();
  });

  it('resets to idle when Retry is clicked', async () => {
    uploadShare.mockRejectedValue(new Error('fail'));
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    const retryBtn = await screen.findByText('Retry');
    fireEvent.click(retryBtn);
    expect(screen.getByText('Create link')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- src/test/ShareModal.test.jsx
```

Expected: FAIL — `Cannot find module '../components/Share/ShareModal'`

- [ ] **Step 3: Implement ShareModal.jsx**

First create the directory:
```bash
mkdir -p src/components/Share
```

`src/components/Share/ShareModal.jsx`:
```jsx
import { useState } from 'react';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { uploadShare } from '../../lib/shareApi';
import { exportSongsAsSbp } from '../../lib/exportSbp';

export function ShareModal({ isOpen, songs, onClose }) {
  const [step, setStep] = useState('idle');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [shareUrl, setShareUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleCreateLink() {
    setStep('uploading');
    try {
      const blob = await exportSongsAsSbp(songs);
      const result = await uploadShare(blob, expiresInDays);
      setShareUrl(result.shareUrl);
      setExpiresAt(result.expiresAt);
      setStep('done');
    } catch {
      setStep('error');
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setStep('idle');
    setExpiresInDays(7);
    setShareUrl('');
    setCopied(false);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} title="Share via link" onClose={handleClose}>
      {step === 'idle' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {songs.length} song{songs.length !== 1 ? 's' : ''} will be shared.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Link expires in
            </label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
            >
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} day{d !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateLink}>Create link</Button>
          </div>
        </div>
      )}

      {step === 'uploading' && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Uploading…</p>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Link expires {new Date(expiresAt).toLocaleDateString()}.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
            />
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            Upload failed. Please check your connection and try again.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={() => setStep('idle')}>Retry</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- src/test/ShareModal.test.jsx
```

Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/Share/ShareModal.jsx src/test/ShareModal.test.jsx
git commit -m "feat: add ShareModal component"
```

---

## Task 8: `ImportConfirmModal` component (TDD)

**Files:**
- Create: `src/components/Share/ImportConfirmModal.jsx`
- Create: `src/test/ImportConfirmModal.test.jsx`

- [ ] **Step 1: Write failing tests**

`src/test/ImportConfirmModal.test.jsx`:
```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ImportConfirmModal } from '../components/Share/ImportConfirmModal';

const songs = [
  { meta: { title: 'El Shaddai' } },
  { meta: { title: 'How Great Thou Art' } },
];

describe('ImportConfirmModal', () => {
  it('renders all song titles', () => {
    render(<ImportConfirmModal isOpen songs={songs} onImport={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('• El Shaddai')).toBeInTheDocument();
    expect(screen.getByText('• How Great Thou Art')).toBeInTheDocument();
  });

  it('shows correct song count', () => {
    render(<ImportConfirmModal isOpen songs={songs} onImport={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('2 songs shared with you:')).toBeInTheDocument();
  });

  it('uses singular "song" for a single song', () => {
    render(
      <ImportConfirmModal
        isOpen
        songs={[{ meta: { title: 'Only One' } }]}
        onImport={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('1 song shared with you:')).toBeInTheDocument();
  });

  it('calls onImport when Import All is clicked', () => {
    const onImport = vi.fn();
    render(<ImportConfirmModal isOpen songs={songs} onImport={onImport} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Import All'));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<ImportConfirmModal isOpen songs={songs} onImport={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ImportConfirmModal isOpen={false} songs={songs} onImport={() => {}} onCancel={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- src/test/ImportConfirmModal.test.jsx
```

Expected: FAIL — `Cannot find module '../components/Share/ImportConfirmModal'`

- [ ] **Step 3: Implement ImportConfirmModal.jsx**

`src/components/Share/ImportConfirmModal.jsx`:
```jsx
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';

export function ImportConfirmModal({ isOpen, songs, onImport, onCancel }) {
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
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onImport}>Import All</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- src/test/ImportConfirmModal.test.jsx
```

Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/Share/ImportConfirmModal.jsx src/test/ImportConfirmModal.test.jsx
git commit -m "feat: add ImportConfirmModal component"
```

---

## Task 9: Modify Sidebar — export choice modal

**Files:**
- Modify: `src/components/Sidebar/Sidebar.jsx`

The current export button (in export mode) calls `openFilenameModal` directly. We insert a choice modal between the button click and the filename prompt.

- [ ] **Step 1: Add new state and imports at the top of Sidebar.jsx**

After the existing imports, add:
```javascript
import { ShareModal } from '../Share/ShareModal'
```

After the existing `useState` declarations (around line 25), add:
```javascript
const [choiceModalOpen, setChoiceModalOpen] = useState(false)
const [shareModalOpen, setShareModalOpen] = useState(false)
```

- [ ] **Step 2: Add helper functions**

Add these three functions after `openFilenameModal` (around line 62):
```javascript
function openChoiceModal() {
  setChoiceModalOpen(true)
}

function handleChooseDownload() {
  setChoiceModalOpen(false)
  openFilenameModal()
}

function handleChooseShare() {
  setChoiceModalOpen(false)
  setShareModalOpen(true)
}
```

- [ ] **Step 3: Change Export button onClick in export mode**

Find this line (around line 150):
```jsx
<Button variant="primary" disabled={selectedSongIds.size === 0} onClick={openFilenameModal}>Export</Button>
```

Change `onClick` to `openChoiceModal`:
```jsx
<Button variant="primary" disabled={selectedSongIds.size === 0} onClick={openChoiceModal}>Export</Button>
```

- [ ] **Step 4: Add selectedSongs computation**

Add this line just before the `return` statement of Sidebar (before the `<>`):
```javascript
const selectedSongs = [...selectedSongIds].map(id => loadSong(id)).filter(Boolean)
```

- [ ] **Step 5: Add choice modal and ShareModal to the JSX**

In the JSX return, after the existing filename modal `</Modal>` closing tag, add:

```jsx
<Modal
  isOpen={choiceModalOpen}
  title={`Export ${selectedSongIds.size} song${selectedSongIds.size !== 1 ? 's' : ''}`}
  onClose={() => setChoiceModalOpen(false)}
>
  <div className="flex flex-col gap-3">
    <Button variant="secondary" className="w-full" onClick={handleChooseDownload}>
      Download .sbp
    </Button>
    <Button variant="secondary" className="w-full" onClick={handleChooseShare}>
      Share via link
    </Button>
  </div>
</Modal>

<ShareModal
  isOpen={shareModalOpen}
  songs={selectedSongs}
  onClose={() => { setShareModalOpen(false); toggleExportMode() }}
/>
```

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: all existing tests still pass (no regressions).

- [ ] **Step 7: Commit**

```bash
git add src/components/Sidebar/Sidebar.jsx
git commit -m "feat: add export choice modal (download vs share)"
```

---

## Task 10: Modify App.jsx — share URL detection on mount

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add imports to App.jsx**

After the existing imports, add:
```javascript
import { ImportConfirmModal } from './components/Share/ImportConfirmModal'
import { fetchShare } from './lib/shareApi'
import { parseSbpFile } from './lib/parser/sbpParser'
```

- [ ] **Step 2: Add addSongs selector and shareSongs state**

Add `addSongs` to the store selector. After the existing:
```javascript
const init = useLibraryStore(state => state.init)
```
Add:
```javascript
const addSongs = useLibraryStore(state => state.addSongs)
```

Add `shareSongs` state after the existing `useState` declarations:
```javascript
const [shareSongs, setShareSongs] = useState(null)
```

- [ ] **Step 3: Add share URL detection effect**

Add this second `useEffect` immediately after the existing `useEffect(() => { init() }, [init])`:
```javascript
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const shareCode = params.get('share')
  if (!shareCode) return

  fetchShare(shareCode)
    .then(buf => parseSbpFile(buf))
    .then(songs => setShareSongs(songs))
    .catch(err => {
      if (err.code === 'expired') {
        addToast({ message: 'This share link has expired.', type: 'error' })
      } else if (err.code === 'not_found') {
        addToast({ message: 'Share link not found.', type: 'error' })
      } else {
        addToast({ message: 'Could not load shared songs.', type: 'error' })
      }
      clearShareParam()
    })
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Add clearShareParam, handleShareImport, handleShareCancel**

Add these functions inside the App component, after the effects:
```javascript
function clearShareParam() {
  const url = new URL(window.location.href)
  url.searchParams.delete('share')
  window.history.replaceState({}, '', url.toString())
}

function handleShareImport() {
  if (shareSongs) {
    addSongs(shareSongs, 'Shared Songs')
    addToast({ message: `${shareSongs.length} song${shareSongs.length !== 1 ? 's' : ''} imported.`, type: 'success' })
  }
  setShareSongs(null)
  clearShareParam()
}

function handleShareCancel() {
  setShareSongs(null)
  clearShareParam()
}
```

- [ ] **Step 5: Add ImportConfirmModal to the JSX**

At the end of the returned JSX (before the closing `</ThemeProvider>`), add:
```jsx
<ImportConfirmModal
  isOpen={shareSongs !== null}
  songs={shareSongs ?? []}
  onImport={handleShareImport}
  onCancel={handleShareCancel}
/>
```

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: detect share URL on load and show import confirmation"
```

---

## Task 11: Wire VITE_WORKER_URL and end-to-end smoke test

**Files:**
- Create/update: `.env.example` (document the variable)
- Create: `.env.local` (actual value — not committed)

- [ ] **Step 1: Document the environment variable**

Add to `.env.example` (create it if it doesn't exist):
```
# Cloudflare Worker URL for cloud sharing feature
VITE_WORKER_URL=https://songbook-worker.<your-subdomain>.workers.dev
```

- [ ] **Step 2: Create .env.local with the real Worker URL**

Create `.env.local` (this is already gitignored by Vite by default):
```
VITE_WORKER_URL=https://songbook-worker.<your-subdomain>.workers.dev
```

Replace `<your-subdomain>` with the actual subdomain shown after `wrangler deploy` in Task 5.

For local Worker dev, use:
```
VITE_WORKER_URL=http://localhost:8787
```

- [ ] **Step 3: Start both dev servers for end-to-end testing**

Terminal 1 — Worker:
```bash
cd songbook-worker && npm run dev
```
Expected: `Ready on http://localhost:8787`

Terminal 2 — React app:
```bash
npm run dev
```
Expected: `Local: http://localhost:5173`

- [ ] **Step 4: Test the upload flow**

1. Open `http://localhost:5173`
2. Import any `.sbp` file so you have songs in the library
3. Click "Export" in the sidebar → enter export mode
4. Select one or more songs using the checkboxes
5. Click "Export" → the choice modal should appear
6. Click "Share via link"
7. The ShareModal opens — leave expiry at 7 days
8. Click "Create link"
9. A share URL should appear (e.g. `http://localhost:5173?share=<uuid>`)
10. Click "Copy"

Expected: URL is copied to clipboard and Worker terminal shows the POST request.

- [ ] **Step 5: Test the download/import flow**

1. Open a new browser tab (or incognito window)
2. Paste the share URL and navigate to it
3. The app should load and the ImportConfirmModal should appear
4. Verify the correct song titles are listed
5. Click "Import All"
6. Songs should appear in the sidebar
7. Verify the `?share=` param is gone from the URL bar

- [ ] **Step 6: Test expiry (manual)**

1. In `songbook-worker/.dev.vars`, temporarily add no changes (expiry can't be shortened below 1 day in the UI)
2. Alternatively: in the R2 bucket directly via Cloudflare dashboard, find the uploaded object, check its `expiresAt` metadata is set correctly.

- [ ] **Step 7: Final commit**

```bash
git add .env.example
git commit -m "chore: document VITE_WORKER_URL environment variable"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|-----------|
| Upload .sbp to R2 via Worker (no credentials in browser) | Tasks 2–5 (Worker), Task 6 (shareApi) |
| Signed/proxied access — credentials never reach browser | Worker R2 binding (Task 1) |
| UUID share code embedded in URL as `?share=` | Task 3 (upload route), Task 10 (App.jsx detection) |
| Default 7-day expiry, user-configurable up to 30 days | Task 3 (clamping), Task 7 (ShareModal select) |
| Download: check expiry, 410 if expired | Task 4 (download route) |
| Export choice modal (Download vs Share) | Task 9 (Sidebar) |
| Confirmation screen before import | Task 8 (ImportConfirmModal), Task 10 (App.jsx) |
| Cancel clears `?share=` from URL | Task 10 (`clearShareParam`) |
| Error handling: not_found, expired, network_error | Tasks 4, 6, 10 |
| Deploy to Cloudflare Workers | Task 5 |

**Placeholder scan:** No TBDs, no "implement later", no "similar to Task N" — all steps contain complete code.

**Type consistency:**
- `getShareIfValid` returns `{ object: R2ObjectBody } | { error: 'not_found' | 'expired' }` — used consistently in routes/share.ts
- `uploadShare(blob, expiresInDays)` / `fetchShare(shareCode)` — consistent across shareApi.js, ShareModal.jsx, and App.jsx
- `songs` prop in both Share modals is an array of objects with `{ meta: { title } }` — consistent with parseSbpFile output and ImportConfirmModal rendering
