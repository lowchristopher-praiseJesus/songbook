# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-served Bun + HTML dashboard that queries Cloudflare R2 and SESSION_KV to display share/album/session/conductor counts, creation timelines, and R2 storage vs free-tier usage.

**Architecture:** A Bun HTTP server (`admin/server.js`) lists R2 objects via the S3-compatible API and queries SESSION_KV via the Cloudflare REST API, aggregates the data, and serves it as JSON on `GET /api/stats`. A self-contained `admin/index.html` (Chart.js via CDN, no build step) fetches that endpoint on manual refresh and renders 6 stat cards, a multi-line timeline chart, and a storage donut.

**Tech Stack:** Bun (runtime + test runner), `@aws-sdk/client-s3` v3 (R2 access), Chart.js 4 (CDN), Cloudflare KV REST API (native fetch)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `admin/package.json` | Create | Bun project + S3 SDK dependency |
| `admin/.env.example` | Create | Credential template (committed) |
| `admin/lib.js` | Create | Pure helpers: `formatBytes`, `bucketDate`, `buildTimeline` |
| `admin/lib.test.js` | Create | Unit tests for `lib.js` |
| `admin/server.js` | Create | Bun HTTP server, R2/KV fetching, stats aggregation |
| `admin/index.html` | Create | Self-contained dashboard UI |
| `admin/README.md` | Create | Setup guide |
| `.gitignore` | Modify | Add `admin/.env` |

---

### Task 1: Scaffold the admin directory

**Files:**
- Create: `admin/package.json`
- Create: `admin/.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create `admin/package.json`**

```json
{
  "name": "songbook-admin",
  "type": "module",
  "scripts": {
    "start": "bun server.js",
    "test": "bun test"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0"
  }
}
```

- [ ] **Step 2: Create `admin/.env.example`**

```
# Cloudflare R2 — create an API token with Object Read on the songbook-shares bucket
# Dashboard → R2 → Manage R2 API Tokens → Create API Token
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=

# Cloudflare API — create a token with Workers KV Storage:Read permission
# Dashboard → My Profile → API Tokens → Create Token → Custom Token
CF_ACCOUNT_ID=
CF_API_TOKEN=
KV_NAMESPACE_ID=4db84560ebae40cf90fb142ee84c8562
```

- [ ] **Step 3: Add `admin/.env` to the root `.gitignore`**

Open `.gitignore` at the repo root and append:

```
admin/.env
```

- [ ] **Step 4: Install dependencies**

```bash
cd admin && bun install
```

Expected: `bun install v1.x.x — Saved lockfile. 1 package installed.`

- [ ] **Step 5: Commit scaffold**

```bash
git add admin/package.json admin/.env.example .gitignore
git commit -m "feat(admin): scaffold admin dashboard project"
```

---

### Task 2: Pure helper functions with TDD

**Files:**
- Create: `admin/lib.js`
- Create: `admin/lib.test.js`

- [ ] **Step 1: Write the failing tests — create `admin/lib.test.js`**

```js
import { test, expect } from 'bun:test';
import { formatBytes, bucketDate, buildTimeline } from './lib.js';

test('formatBytes: zero', () => {
  expect(formatBytes(0)).toBe('0 B');
});

test('formatBytes: kilobytes', () => {
  expect(formatBytes(1024)).toBe('1.0 KB');
});

test('formatBytes: megabytes', () => {
  expect(formatBytes(1048576)).toBe('1.0 MB');
});

test('formatBytes: gigabytes', () => {
  expect(formatBytes(1073741824)).toBe('1.0 GB');
});

test('bucketDate: monthly', () => {
  expect(bucketDate('2026-04-15T10:00:00Z', 'monthly')).toBe('2026-04');
  expect(bucketDate('2026-12-01T00:00:00Z', 'monthly')).toBe('2026-12');
});

test('bucketDate: weekly returns YYYY-Www format', () => {
  const result = bucketDate('2026-04-13T00:00:00Z', 'weekly');
  expect(result).toMatch(/^\d{4}-W\d{2}$/);
});

test('buildTimeline: groups events by month and sorts by date', () => {
  const events = [
    { type: 'share',     createdAt: '2026-04-10T00:00:00Z' },
    { type: 'share',     createdAt: '2026-04-20T00:00:00Z' },
    { type: 'album',     createdAt: '2026-04-15T00:00:00Z' },
    { type: 'session',   createdAt: '2026-05-01T00:00:00Z' },
    { type: 'conductor', createdAt: '2026-03-05T00:00:00Z' },
  ];
  const result = buildTimeline(events, 'monthly');
  expect(result).toEqual([
    { date: '2026-03', shares: 0, albums: 0, sessions: 0, conductors: 1 },
    { date: '2026-04', shares: 2, albums: 1, sessions: 0, conductors: 0 },
    { date: '2026-05', shares: 0, albums: 0, sessions: 1, conductors: 0 },
  ]);
});

test('buildTimeline: empty events returns empty array', () => {
  expect(buildTimeline([], 'monthly')).toEqual([]);
});
```

- [ ] **Step 2: Run tests — expect failures (lib.js does not exist yet)**

```bash
cd admin && bun test lib.test.js
```

Expected: errors like `Cannot find module './lib.js'`

- [ ] **Step 3: Create `admin/lib.js`**

```js
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function bucketDate(isoDate, granularity) {
  const d = new Date(isoDate);
  if (granularity === 'weekly') {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildTimeline(events, granularity = 'monthly') {
  const buckets = new Map();
  for (const event of events) {
    const key = bucketDate(event.createdAt, granularity);
    if (!buckets.has(key)) {
      buckets.set(key, { date: key, shares: 0, albums: 0, sessions: 0, conductors: 0 });
    }
    buckets.get(key)[event.type + 's']++;
  }
  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 4: Run tests — expect all 8 passing**

```bash
cd admin && bun test lib.test.js
```

Expected:
```
bun test v1.x.x
lib.test.js:
✓ formatBytes: zero
✓ formatBytes: kilobytes
✓ formatBytes: megabytes
✓ formatBytes: gigabytes
✓ bucketDate: monthly
✓ bucketDate: weekly returns YYYY-Www format
✓ buildTimeline: groups events by month and sorts by date
✓ buildTimeline: empty events returns empty array

 8 pass, 0 fail
```

- [ ] **Step 5: Commit**

```bash
git add admin/lib.js admin/lib.test.js
git commit -m "feat(admin): add pure helper functions with tests"
```

---

### Task 3: Bun server skeleton with env validation

**Files:**
- Create: `admin/server.js`
- Create: `admin/index.html` (placeholder, replaced in Task 7)

- [ ] **Step 1: Create placeholder `admin/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Songbook Admin</title></head>
<body><h1>Songbook Admin</h1><p>Loading…</p></body>
</html>
```

- [ ] **Step 2: Create `admin/server.js` with env validation and HTTP routing**

```js
import { networkInterfaces } from 'node:os';
import { formatBytes, buildTimeline } from './lib.js';
import {
  S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';

const R2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024;
const BUCKET = 'songbook-shares';
const CONDUCTOR_SESSION_DAYS = 30;

// ── Env validation ─────────────────────────────────────────────────────────────
const REQUIRED = [
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
  'CF_ACCOUNT_ID', 'CF_API_TOKEN', 'KV_NAMESPACE_ID',
];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[admin] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const env = {
  R2_ACCOUNT_ID:        process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID:     process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  CF_ACCOUNT_ID:        process.env.CF_ACCOUNT_ID,
  CF_API_TOKEN:         process.env.CF_API_TOKEN,
  KV_NAMESPACE_ID:      process.env.KV_NAMESPACE_ID,
};

// ── HTTP server ────────────────────────────────────────────────────────────────
const htmlFile = Bun.file(new URL('./index.html', import.meta.url).pathname);

const server = Bun.serve({
  port: 3001,
  hostname: '0.0.0.0',
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/') {
      return new Response(htmlFile, { headers: { 'Content-Type': 'text/html' } });
    }
    if (url.pathname === '/api/stats') {
      return Response.json({ ok: true, message: 'stats coming soon' });
    }
    return new Response('Not found', { status: 404 });
  },
});

const lanIp = Object.values(networkInterfaces()).flat()
  .find(i => i && !i.internal && i.family === 'IPv4')?.address ?? 'your-ip';
console.log(`Songbook Admin → http://localhost:${server.port}`);
console.log(`LAN access    → http://${lanIp}:${server.port}`);
```

- [ ] **Step 3: Copy `.env.example` to `.env` and fill in real credentials**

```bash
cp admin/.env.example admin/.env
# Open admin/.env and add your real R2 and CF credentials before continuing
```

- [ ] **Step 4: Start the server and verify it starts cleanly**

```bash
cd admin && bun server.js
```

Expected (no errors):
```
Songbook Admin → http://localhost:3001
LAN access    → http://192.168.x.x:3001
```

If you see `Missing required env var: X`, you have a blank value in `admin/.env` — fill it in and retry.

- [ ] **Step 5: Verify endpoints respond**

In a second terminal:
```bash
curl http://localhost:3001/          # → HTML page
curl http://localhost:3001/api/stats # → {"ok":true,"message":"stats coming soon"}
```

- [ ] **Step 6: Stop the server (Ctrl+C) and commit**

```bash
git add admin/server.js admin/index.html
git commit -m "feat(admin): add Bun server skeleton with env validation"
```

---

### Task 4: R2 data fetching

**Files:**
- Modify: `admin/server.js` (add `makeS3Client`, `listAllR2Objects`, `fetchR2Stats`)

- [ ] **Step 1: Add R2 functions to `admin/server.js`**

Insert the following block after the `env` object, before the HTTP server section:

```js
// ── R2 fetching ────────────────────────────────────────────────────────────────
function makeS3Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function listAllR2Objects(s3) {
  const objects = [];
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    for (const obj of res.Contents ?? []) objects.push(obj);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function fetchR2Stats() {
  const s3 = makeS3Client();
  const allObjects = await listAllR2Objects(s3);
  const totalBytes = allObjects.reduce((sum, o) => sum + (o.Size ?? 0), 0);

  const shareObjects = allObjects.filter(o => !o.Key.includes('/'));
  const albumMetaObjects = allObjects.filter(o =>
    /^albums\/[^/]+\/meta\.json$/.test(o.Key),
  );

  // HEAD each share to get expiresAt from R2 custom metadata (lowercased by SDK)
  const shares = await Promise.all(shareObjects.map(async (obj) => {
    try {
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      return {
        key: obj.Key,
        size: obj.Size ?? 0,
        createdAt: obj.LastModified?.toISOString() ?? null,
        expiresAt: head.Metadata?.expiresat ?? null,
      };
    } catch {
      return {
        key: obj.Key,
        size: obj.Size ?? 0,
        createdAt: obj.LastModified?.toISOString() ?? null,
        expiresAt: null,
      };
    }
  }));

  // Fetch meta.json for each album to get createdAt
  const albums = await Promise.all(albumMetaObjects.map(async (obj) => {
    try {
      const result = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      const text = await result.Body.transformToString();
      const meta = JSON.parse(text);
      return { albumCode: meta.albumCode, createdAt: meta.createdAt };
    } catch {
      return {
        albumCode: obj.Key.split('/')[1],
        createdAt: obj.LastModified?.toISOString() ?? null,
      };
    }
  }));

  return { shares, albums, totalBytes };
}
```

- [ ] **Step 2: Temporarily wire `fetchR2Stats` into `/api/stats` for smoke testing**

In the `Bun.serve` fetch handler, replace the `if (url.pathname === '/api/stats')` block with:

```js
if (url.pathname === '/api/stats') {
  try {
    const r2 = await fetchR2Stats();
    return Response.json({
      totalShares: r2.shares.length,
      totalAlbums: r2.albums.length,
      totalBytes: r2.totalBytes,
      sampleShare: r2.shares[0] ?? null,
      sampleAlbum: r2.albums[0] ?? null,
    });
  } catch (err) {
    console.error('R2 error:', err);
    return Response.json({ error: 'r2_unavailable' }, { status: 503 });
  }
}
```

- [ ] **Step 3: Start the server and smoke test R2 fetching**

```bash
cd admin && bun server.js
```

In a second terminal:
```bash
curl http://localhost:3001/api/stats | python3 -m json.tool
```

Expected: JSON showing `totalShares`, `totalAlbums`, `totalBytes`, and a `sampleShare` with a real `createdAt` (ISO timestamp from R2's `LastModified`) and `expiresAt` from the custom metadata.

- [ ] **Step 4: Stop the server (Ctrl+C) and commit**

```bash
git add admin/server.js
git commit -m "feat(admin): add R2 stats fetching (shares + albums)"
```

---

### Task 5: KV data fetching

**Files:**
- Modify: `admin/server.js` (add `listKVKeys`, `getKVValue`, `fetchKVStats`)

- [ ] **Step 1: Add KV functions to `admin/server.js`**

Insert after `fetchR2Stats`, before the HTTP server section:

```js
// ── KV fetching ────────────────────────────────────────────────────────────────
async function listKVKeys(prefix) {
  const keys = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ prefix });
    if (cursor) qs.set('cursor', cursor);
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/storage/kv/namespaces/${env.KV_NAMESPACE_ID}/keys?${qs}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`KV list failed: ${res.status}`);
    const data = await res.json();
    for (const k of data.result ?? []) keys.push(k.name);
    cursor = data.result_info?.cursor ?? null;
  } while (cursor);
  return keys;
}

async function getKVValue(key) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/storage/kv/namespaces/${env.KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

async function fetchKVStats() {
  const [sessionKeys, conductorKeys] = await Promise.all([
    listKVKeys('session:'),
    listKVKeys('conductor:'),
  ]);

  const [sessionValues, conductorValues] = await Promise.all([
    Promise.all(sessionKeys.map(getKVValue)),
    Promise.all(conductorKeys.map(getKVValue)),
  ]);

  const sessions = sessionValues
    .filter(Boolean)
    .map(s => ({ createdAt: s.createdAt, expiresAt: s.expiresAt, closed: s.closed ?? false }));

  const conductors = conductorValues
    .filter(Boolean)
    .map(c => {
      const expiresMs = new Date(c.expiresAt).getTime();
      const createdAt = new Date(expiresMs - CONDUCTOR_SESSION_DAYS * 86400000).toISOString();
      return { createdAt, expiresAt: c.expiresAt, terminated: c.terminated ?? false };
    });

  return { sessions, conductors };
}
```

- [ ] **Step 2: Temporarily wire `fetchKVStats` into `/api/stats` for smoke testing**

Replace the `if (url.pathname === '/api/stats')` block with:

```js
if (url.pathname === '/api/stats') {
  try {
    const kv = await fetchKVStats();
    return Response.json({
      totalSessions: kv.sessions.length,
      totalConductors: kv.conductors.length,
      sampleSession: kv.sessions[0] ?? null,
      sampleConductor: kv.conductors[0] ?? null,
    });
  } catch (err) {
    console.error('KV error:', err);
    return Response.json({ error: 'kv_unavailable' }, { status: 503 });
  }
}
```

- [ ] **Step 3: Start the server and smoke test KV fetching**

```bash
cd admin && bun server.js
```

```bash
curl http://localhost:3001/api/stats | python3 -m json.tool
```

Expected: JSON with `totalSessions`, `totalConductors`, and sample objects. The sample session should have `createdAt`, `expiresAt`, `closed`. The sample conductor should have an inferred `createdAt` (30 days before `expiresAt`).

- [ ] **Step 4: Stop the server (Ctrl+C) and commit**

```bash
git add admin/server.js
git commit -m "feat(admin): add KV stats fetching (sessions + conductors)"
```

---

### Task 6: Stats aggregation and complete `/api/stats` endpoint

**Files:**
- Modify: `admin/server.js` (add `buildStats`, replace temp `/api/stats` handler)

- [ ] **Step 1: Add `buildStats` to `admin/server.js`**

Insert after `fetchKVStats`, before the HTTP server section:

```js
// ── Stats aggregation ──────────────────────────────────────────────────────────
async function buildStats(granularity) {
  const [r2Result, kvResult] = await Promise.allSettled([
    fetchR2Stats(),
    fetchKVStats(),
  ]);

  const r2  = r2Result.status === 'fulfilled' ? r2Result.value : null;
  const kv  = kvResult.status === 'fulfilled' ? kvResult.value : null;
  const now = Date.now();

  const summary = {
    totalShares:      r2  ? r2.shares.length    : null,
    activeShares:     r2  ? r2.shares.filter(s =>
                              s.expiresAt && new Date(s.expiresAt).getTime() > now
                            ).length : null,
    totalAlbums:      r2  ? r2.albums.length     : null,
    totalBytes:       r2  ? r2.totalBytes        : null,
    r2FreeTierBytes:  R2_FREE_TIER_BYTES,
    totalSessions:    kv  ? kv.sessions.length   : null,
    activeSessions:   kv  ? kv.sessions.filter(s =>
                              !s.closed && new Date(s.expiresAt).getTime() > now
                            ).length : null,
    totalConductors:  kv  ? kv.conductors.length : null,
    activeConductors: kv  ? kv.conductors.filter(c =>
                              !c.terminated && new Date(c.expiresAt).getTime() > now
                            ).length : null,
    r2Error:  r2Result.status === 'rejected',
    kvError:  kvResult.status === 'rejected',
  };

  const events = [];
  if (r2) {
    for (const s of r2.shares) if (s.createdAt) events.push({ type: 'share',     createdAt: s.createdAt });
    for (const a of r2.albums) if (a.createdAt) events.push({ type: 'album',     createdAt: a.createdAt });
  }
  if (kv) {
    for (const s of kv.sessions)   events.push({ type: 'session',   createdAt: s.createdAt });
    for (const c of kv.conductors) events.push({ type: 'conductor', createdAt: c.createdAt });
  }

  return {
    summary,
    timeline: buildTimeline(events, granularity),
    fetchedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 2: Replace the temp `/api/stats` handler in `Bun.serve` with the final version**

```js
if (url.pathname === '/api/stats') {
  const granularity = url.searchParams.get('granularity') === 'weekly' ? 'weekly' : 'monthly';
  try {
    const stats = await buildStats(granularity);
    return Response.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Smoke test the full `/api/stats` response**

```bash
cd admin && bun server.js
```

```bash
curl 'http://localhost:3001/api/stats' | python3 -m json.tool
```

Verify the response matches this shape (all numbers, no nulls if credentials are valid):
```json
{
  "summary": {
    "totalShares": 5,
    "activeShares": 3,
    "totalAlbums": 2,
    "totalBytes": 1234567,
    "r2FreeTierBytes": 10737418240,
    "totalSessions": 1,
    "activeSessions": 1,
    "totalConductors": 0,
    "activeConductors": 0,
    "r2Error": false,
    "kvError": false
  },
  "timeline": [
    { "date": "2026-04", "shares": 3, "albums": 1, "sessions": 0, "conductors": 0 },
    { "date": "2026-05", "shares": 2, "albums": 1, "sessions": 1, "conductors": 0 }
  ],
  "fetchedAt": "2026-05-06T09:00:00.000Z"
}
```

Also test weekly granularity:
```bash
curl 'http://localhost:3001/api/stats?granularity=weekly' | python3 -m json.tool
```

Verify `timeline[*].date` values look like `"2026-W18"`.

- [ ] **Step 4: Stop the server and commit**

```bash
git add admin/server.js
git commit -m "feat(admin): add stats aggregation and complete /api/stats endpoint"
```

---

### Task 7: Dashboard HTML — layout, stat cards, and refresh wiring

**Files:**
- Modify: `admin/index.html` (replace placeholder with full dashboard)

- [ ] **Step 1: Replace `admin/index.html` with the full dashboard**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Songbook Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }

    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 24px; background: #1e293b; border-bottom: 1px solid #334155;
    }
    header h1 { font-size: 1.1rem; font-weight: 700; color: #f1f5f9; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    #last-fetched { font-size: 0.75rem; color: #64748b; }

    #refresh-btn {
      padding: 6px 14px; background: #3b82f6; color: #fff; border: none;
      border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; gap: 6px;
    }
    #refresh-btn:hover { background: #2563eb; }
    #refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .spinner {
      width: 12px; height: 12px; border: 2px solid #fff; border-top-color: transparent;
      border-radius: 50%; animation: spin 0.6s linear infinite; display: none;
    }
    #refresh-btn.loading .spinner { display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }

    #error-banner {
      display: none; background: #7f1d1d; color: #fca5a5;
      font-size: 0.8rem; padding: 8px 24px; border-bottom: 1px solid #991b1b;
    }
    #error-banner.visible { display: block; }

    .stat-cards {
      display: grid; grid-template-columns: repeat(6, 1fr);
      gap: 12px; padding: 20px 24px 0;
    }
    .stat-card {
      background: #1e293b; border: 1px solid #334155;
      border-radius: 10px; padding: 14px 16px;
    }
    .stat-card .label {
      font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: .05em; color: #64748b; margin-bottom: 6px;
    }
    .stat-card .value { font-size: 1.6rem; font-weight: 700; line-height: 1; }
    .stat-card .sub { font-size: 0.7rem; color: #64748b; margin-top: 4px; }

    .charts-row {
      display: grid; grid-template-columns: 2fr 1fr;
      gap: 16px; padding: 16px 24px 24px;
    }
    .panel { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 16px; }
    .panel-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
    }
    .panel-title {
      font-size: 0.8rem; font-weight: 600; color: #94a3b8;
      text-transform: uppercase; letter-spacing: .05em;
    }

    .granularity-toggle { display: flex; gap: 4px; }
    .granularity-toggle button {
      padding: 3px 10px; font-size: 0.75rem; border: 1px solid #334155;
      background: transparent; color: #94a3b8; border-radius: 4px; cursor: pointer;
    }
    .granularity-toggle button.active { background: #334155; color: #e2e8f0; }

    #storage-text { font-size: 0.8rem; color: #94a3b8; text-align: center; margin: 8px 0 6px; }
    .progress-bar { height: 4px; background: #334155; border-radius: 2px; overflow: hidden; }
    #progress-fill { height: 100%; background: #3b82f6; border-radius: 2px; width: 0%; transition: width 0.4s; }
  </style>
</head>
<body>

<header>
  <h1>Songbook Admin</h1>
  <div class="header-right">
    <span id="last-fetched">Never refreshed</span>
    <button id="refresh-btn" onclick="refresh()">
      <span class="spinner"></span>
      Refresh
    </button>
  </div>
</header>

<div id="error-banner"></div>

<div class="stat-cards">
  <div class="stat-card">
    <div class="label">Shares</div>
    <div class="value" id="val-total-shares" style="color:#3b82f6">—</div>
  </div>
  <div class="stat-card">
    <div class="label">Active Shares</div>
    <div class="value" id="val-active-shares" style="color:#22c55e">—</div>
  </div>
  <div class="stat-card">
    <div class="label">Albums</div>
    <div class="value" id="val-total-albums" style="color:#a855f7">—</div>
  </div>
  <div class="stat-card">
    <div class="label">Sessions</div>
    <div class="value" id="val-total-sessions" style="color:#f97316">—</div>
    <div class="sub">last 30 days</div>
  </div>
  <div class="stat-card">
    <div class="label">Conductors</div>
    <div class="value" id="val-total-conductors" style="color:#f43f5e">—</div>
    <div class="sub">last 30 days</div>
  </div>
  <div class="stat-card">
    <div class="label">R2 Used</div>
    <div class="value" id="val-r2-used" style="color:#38bdf8; font-size:1.2rem">—</div>
    <div class="sub">of 10 GB free tier</div>
  </div>
</div>

<div class="charts-row">
  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">Creation Timeline</span>
      <div class="granularity-toggle">
        <button id="btn-monthly" class="active" onclick="setGranularity('monthly')">Monthly</button>
        <button id="btn-weekly" onclick="setGranularity('weekly')">Weekly</button>
      </div>
    </div>
    <canvas id="timeline-chart" height="260"></canvas>
  </div>
  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">R2 Storage</span>
    </div>
    <canvas id="storage-chart" height="200"></canvas>
    <div id="storage-text">—</div>
    <div class="progress-bar"><div id="progress-fill"></div></div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
  let granularity = 'monthly';
  let timelineChart = null;
  let storageChart = null;

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  function setText(id, value) {
    document.getElementById(id).textContent = value ?? '—';
  }

  function renderStatCards(summary) {
    setText('val-total-shares',     summary.totalShares);
    setText('val-active-shares',    summary.activeShares);
    setText('val-total-albums',     summary.totalAlbums);
    setText('val-total-sessions',   summary.totalSessions);
    setText('val-total-conductors', summary.totalConductors);
    setText('val-r2-used', summary.totalBytes != null ? formatBytes(summary.totalBytes) : '—');
  }

  function showError(msg) {
    const el = document.getElementById('error-banner');
    el.textContent = msg;
    el.classList.add('visible');
  }

  function clearError() {
    document.getElementById('error-banner').classList.remove('visible');
  }

  function renderTimelineChart(timeline) {
    // implemented in Task 8
  }

  function renderStorageChart(summary) {
    // implemented in Task 9
  }

  async function refresh() {
    const btn = document.getElementById('refresh-btn');
    btn.classList.add('loading');
    btn.disabled = true;
    clearError();
    try {
      const res = await fetch(`/api/stats?granularity=${granularity}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const stats = await res.json();
      if (stats.summary.r2Error) showError('R2 data unavailable — check R2 credentials in admin/.env');
      if (stats.summary.kvError) showError('KV data unavailable — check CF credentials in admin/.env');
      renderStatCards(stats.summary);
      renderTimelineChart(stats.timeline);
      renderStorageChart(stats.summary);
      document.getElementById('last-fetched').textContent =
        `Updated ${new Date(stats.fetchedAt).toLocaleTimeString()}`;
    } catch (err) {
      showError(`Refresh failed: ${err.message}. Prior data shown.`);
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  function setGranularity(g) {
    granularity = g;
    document.getElementById('btn-monthly').classList.toggle('active', g === 'monthly');
    document.getElementById('btn-weekly').classList.toggle('active', g === 'weekly');
    refresh();
  }

  refresh();
</script>
</body>
</html>
```

- [ ] **Step 2: Start the server and verify stat cards populate**

```bash
cd admin && bun server.js
```

Open `http://localhost:3001`. Verify:
- All 6 stat cards show real numbers after the initial load
- "Updated HH:MM:SS" timestamp appears in the header
- Refresh button spinner shows briefly then stops
- No errors in the browser console (F12 → Console)

- [ ] **Step 3: Stop the server and commit**

```bash
git add admin/index.html
git commit -m "feat(admin): add dashboard layout with stat cards and refresh wiring"
```

---

### Task 8: Multi-line timeline chart

**Files:**
- Modify: `admin/index.html` (replace `renderTimelineChart` stub)

- [ ] **Step 1: Replace the `renderTimelineChart` stub in `admin/index.html`**

In the `<script>` block, replace:
```js
function renderTimelineChart(timeline) {
  // implemented in Task 8
}
```
with:
```js
function renderTimelineChart(timeline) {
  const labels = timeline.map(t => t.date);
  const datasets = [
    {
      label: 'Shares',
      data: timeline.map(t => t.shares),
      borderColor: '#3b82f6', backgroundColor: '#3b82f620',
      tension: 0.3, fill: false, pointRadius: 3,
    },
    {
      label: 'Albums',
      data: timeline.map(t => t.albums),
      borderColor: '#a855f7', backgroundColor: '#a855f720',
      tension: 0.3, fill: false, pointRadius: 3,
    },
    {
      label: 'Sessions',
      data: timeline.map(t => t.sessions),
      borderColor: '#f97316', backgroundColor: '#f9731620',
      tension: 0.3, fill: false, pointRadius: 3,
    },
    {
      label: 'Conductors',
      data: timeline.map(t => t.conductors),
      borderColor: '#f43f5e', backgroundColor: '#f43f5e20',
      tension: 0.3, fill: false, pointRadius: 3,
    },
  ];

  if (timelineChart) {
    timelineChart.data.labels = labels;
    timelineChart.data.datasets.forEach((ds, i) => { ds.data = datasets[i].data; });
    timelineChart.update();
    return;
  }

  const ctx = document.getElementById('timeline-chart').getContext('2d');
  timelineChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } },
        y: {
          beginAtZero: true,
          ticks: { color: '#64748b', font: { size: 11 }, precision: 0 },
          grid: { color: '#334155' },
        },
      },
    },
  });
}
```

- [ ] **Step 2: Start the server and verify the timeline chart**

```bash
cd admin && bun server.js
```

Open `http://localhost:3001`. Verify:
- Multi-line chart renders in the left panel with 4 coloured lines (blue shares, purple albums, orange sessions, red conductors)
- Legend is visible with correct labels and colours
- Hovering over a data point shows a tooltip with all 4 values for that period
- Clicking **Weekly** fetches new data and redraws with `YYYY-Www` x-axis labels
- Clicking **Monthly** returns to `YYYY-MM` labels
- Clicking **Refresh** updates the chart data without duplicating the chart instance

- [ ] **Step 3: Stop the server and commit**

```bash
git add admin/index.html
git commit -m "feat(admin): add multi-line timeline chart with monthly/weekly toggle"
```

---

### Task 9: Storage donut chart and progress bar

**Files:**
- Modify: `admin/index.html` (add `centerLabelPlugin`, replace `renderStorageChart` stub)

- [ ] **Step 1: Add the Chart.js centre-label plugin**

In the `<script>` block, add the following immediately after the opening `<script>` tag (before `let granularity`):

```js
const centerLabelPlugin = {
  id: 'centerLabel',
  beforeDraw(chart) {
    if (chart.config.type !== 'doughnut') return;
    const { width, height, ctx } = chart;
    const text = chart.config.options.plugins?.centerLabel?.text ?? '';
    if (!text) return;
    ctx.save();
    ctx.font = `bold ${Math.min(width, height) / 5}px system-ui, sans-serif`;
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);
    ctx.restore();
  },
};
Chart.register(centerLabelPlugin);
```

- [ ] **Step 2: Replace the `renderStorageChart` stub in `admin/index.html`**

Replace:
```js
function renderStorageChart(summary) {
  // implemented in Task 9
}
```
with:
```js
function renderStorageChart(summary) {
  const used  = summary.totalBytes ?? 0;
  const total = summary.r2FreeTierBytes;
  const free  = Math.max(0, total - used);
  const pct   = total > 0 ? ((used / total) * 100).toFixed(1) : '0.0';

  document.getElementById('storage-text').textContent =
    `${formatBytes(used)} of ${formatBytes(total)} used`;
  document.getElementById('progress-fill').style.width = `${pct}%`;

  const centerText = `${pct}%`;

  if (storageChart) {
    storageChart.data.datasets[0].data = [used, free];
    storageChart.options.plugins.centerLabel.text = centerText;
    storageChart.update();
    return;
  }

  const ctx = document.getElementById('storage-chart').getContext('2d');
  storageChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Used', 'Free'],
      datasets: [{
        data: [used, free],
        backgroundColor: ['#3b82f6', '#334155'],
        borderWidth: 0,
        hoverOffset: 4,
      }],
    },
    options: {
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (item) => ` ${item.label}: ${formatBytes(item.raw)}` },
        },
        centerLabel: { text: centerText },
      },
    },
  });
}
```

- [ ] **Step 3: Start the server and verify the storage panel**

```bash
cd admin && bun server.js
```

Open `http://localhost:3001`. Verify:
- Donut chart renders in the right panel with a blue arc and dark grey background
- The percentage is shown in the centre (e.g. `"1.6%"`)
- Hovering shows "Used: X MB" and "Free: X.X GB" tooltips
- Text below the donut reads "X.X MB of 10.0 GB used"
- The blue progress bar below fills to the correct proportion
- Clicking **Refresh** updates both the donut and the progress bar

- [ ] **Step 4: Stop the server and commit**

```bash
git add admin/index.html
git commit -m "feat(admin): add R2 storage donut chart and progress bar"
```

---

### Task 10: README and final verification

**Files:**
- Create: `admin/README.md`

- [ ] **Step 1: Create `admin/README.md`**

```markdown
# Songbook Admin Dashboard

Local LAN dashboard for monitoring Songbook share/album/session/conductor usage and R2 storage capacity.

## Prerequisites

- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)
- Access to the Cloudflare dashboard for the songbook account

## Setup

### 1. Install dependencies

\```bash
cd admin && bun install
\```

### 2. Create an R2 API token

1. Cloudflare Dashboard → **R2** → **Manage R2 API Tokens** → **Create API Token**
2. Permissions: **Object Read Only** on bucket `songbook-shares`
3. Copy the **Access Key ID** and **Secret Access Key**

### 3. Create a Cloudflare API token

1. Cloudflare Dashboard → My Profile → **API Tokens** → **Create Token** → **Custom Token**
2. Permissions: `Workers KV Storage` → `Read`; Account Resources: your account
3. Copy the token value

### 4. Configure credentials

\```bash
cp admin/.env.example admin/.env
\```

Edit `admin/.env`:

| Variable | Where to find it |
|---|---|
| `R2_ACCOUNT_ID` | Dashboard → Overview → Account ID (right sidebar) |
| `R2_ACCESS_KEY_ID` | From Step 2 |
| `R2_SECRET_ACCESS_KEY` | From Step 2 |
| `CF_ACCOUNT_ID` | Same as `R2_ACCOUNT_ID` |
| `CF_API_TOKEN` | From Step 3 |
| `KV_NAMESPACE_ID` | Pre-filled: `4db84560ebae40cf90fb142ee84c8562` |

### 5. Start the dashboard

\```bash
bun admin/server.js
\```

Open `http://localhost:3001` on this machine, or `http://<your-mac-ip>:3001` from any device on the same LAN.

## Usage

- **Refresh** — fetches fresh data from Cloudflare R2 and KV
- **Monthly / Weekly** toggle — changes the creation timeline granularity
- **Sessions** and **Conductors** reflect the last ~30 days only (Cloudflare KV TTL limitation)
- **R2 Storage** shows bytes used vs the 10 GB free tier limit

## Running unit tests

\```bash
cd admin && bun test
\```
```

- [ ] **Step 2: Run all unit tests**

```bash
cd admin && bun test
```

Expected: `8 pass, 0 fail`

- [ ] **Step 3: Full end-to-end verification**

```bash
bun admin/server.js
```

Open `http://localhost:3001` and confirm:
- [ ] All 6 stat cards populate with numbers (not `—`)
- [ ] Timeline chart shows 4 lines with a legend
- [ ] Storage donut shows correct percentage in the centre
- [ ] Monthly → Weekly toggle changes x-axis labels to `YYYY-Www` format
- [ ] Refresh button shows spinner during fetch, updates timestamp on completion
- [ ] No errors in the browser console

- [ ] **Step 4: Commit README and close out**

```bash
git add admin/README.md
git commit -m "docs(admin): add setup and usage README for admin dashboard"
```
