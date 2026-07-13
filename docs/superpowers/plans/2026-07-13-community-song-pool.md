# Community Song Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users publish songs from their shared collections into a members-only pool, and find those songs as a third source ("Community") inside the app's existing multi-source song search, importing them into their own collections.

**Architecture:** A new `/community/*` Hono route group in the existing Cloudflare Worker, backed by a new D1 database with an FTS5 index. Publishing is an opt-in checkbox on the existing Share modal that POSTs song JSON (never the `.sbp` ZIP — the worker stays out of the ZIP-parsing business). Discovery is **not** a new UI: `UGSearchModal` is already a multi-source modal titled "Search Songs" that fans out with `Promise.allSettled`, tags results with a `source`, badges them, and dispatches fetch/parse on that source. Community slots into those existing seams.

**Tech Stack:** Cloudflare Workers + Hono + D1 (SQLite/FTS5) + KV (rate limiting) + R2 (unchanged); React 19 + Zustand + Vite; Vitest everywhere (`@cloudflare/vitest-pool-workers` on the worker, jsdom + Testing Library on the client).

**Spec:** `docs/superpowers/specs/2026-07-13-community-song-pool-design.md`

## Global Constraints

- **Publish is opt-in, default OFF.** A share must never silently list itself in the community.
- **A failed publish must never break the share link.** Publish is called *after* the R2 upload succeeds, and its failure is swallowed.
- **Imported community songs carry no `sbpId` baseline and no `shareCode`** — only `meta.communitySource`. This is what makes `mergeSharedCollection` skip them (snapshot semantics). Task 16 guards this.
- **`artist` is required to publish.** Reject with `missing_artist` if absent.
- **`{note:}` tokens are stripped from every published body.** Notes hold private team chatter.
- **Community must work with no Firecrawl API key.** It is the only zero-config source, and that is a headline benefit.
- **A failing Community search must not suppress UG/DC results** (and vice versa). The existing "error only if *all* sources failed" contract must survive a third leg.
- **The worker has no CI.** Deployment is a manual `npm run deploy` in `songbook-worker/`.
- Existing worker route file style: `import { Hono } from 'hono'; const x = new Hono<{ Bindings: Env }>(); ... export default x;`
- Existing worker test style: `import { SELF, env } from 'cloudflare:test';` and `SELF.fetch('http://localhost/...', { headers: { Origin: 'http://localhost:5173' } })`.

---

### Task 1: D1 database, schema migration, and test harness

Adds the D1 binding, the schema, and the ability for worker tests to run against a migrated database. Nothing else can be tested until this exists.

**Files:**
- Create: `songbook-worker/migrations/0001_community.sql`
- Create: `songbook-worker/test/apply-migrations.ts`
- Modify: `songbook-worker/wrangler.toml`
- Modify: `songbook-worker/vitest.config.ts`
- Modify: `songbook-worker/src/types.ts`
- Test: `songbook-worker/test/schema.test.ts`

**Interfaces:**
- Produces: `Env.DB: D1Database` — every later worker task uses `c.env.DB`.
- Produces: tables `publications`, `songs`, `song_publications`, `songs_fts`, `reports`.

- [ ] **Step 1: Write the failing test**

`songbook-worker/test/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('community schema', () => {
  it('creates the songs table', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='songs'"
    ).all();
    expect(results.length).toBe(1);
  });

  it('creates an FTS5 index that can be matched against', async () => {
    await env.DB.prepare(
      "INSERT INTO songs_fts (song_id, title, artist, lyrics_only) VALUES (?, ?, ?, ?)"
    ).bind('s1', 'How Great Is Our God', 'Chris Tomlin', 'the splendor of a king').run();

    const { results } = await env.DB.prepare(
      "SELECT song_id FROM songs_fts WHERE songs_fts MATCH ?"
    ).bind('splendor').all();
    expect(results).toEqual([{ song_id: 's1' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd songbook-worker && npx vitest run test/schema.test.ts`
Expected: FAIL — `env.DB` is undefined (no D1 binding yet).

- [ ] **Step 3: Write the migration**

`songbook-worker/migrations/0001_community.sql`:

```sql
CREATE TABLE publications (
  id                 TEXT PRIMARY KEY,
  collection_name    TEXT NOT NULL,
  publisher_name     TEXT NOT NULL,
  publish_token_hash TEXT NOT NULL,
  created_at         INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'live'
);

CREATE TABLE songs (
  id                 TEXT PRIMARY KEY,
  content_hash       TEXT NOT NULL UNIQUE,
  group_key          TEXT NOT NULL,
  title              TEXT NOT NULL,
  artist             TEXT NOT NULL,
  key_index          INTEGER,
  capo               INTEGER,
  tempo              INTEGER,
  time_sig           TEXT,
  body               TEXT NOT NULL,
  first_published_at INTEGER NOT NULL,
  import_count       INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'live'
);
CREATE INDEX idx_songs_group_key ON songs(group_key);
CREATE INDEX idx_songs_status ON songs(status);

CREATE TABLE song_publications (
  song_id        TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  PRIMARY KEY (song_id, publication_id)
);
CREATE INDEX idx_song_publications_publication ON song_publications(publication_id);

-- Standalone (not external-content) FTS5: lyrics_only is derived at publish time and is
-- not a column on `songs`, and a standalone table needs no sync triggers.
CREATE VIRTUAL TABLE songs_fts USING fts5(
  song_id UNINDEXED,
  title,
  artist,
  lyrics_only
);

CREATE TABLE reports (
  id         TEXT PRIMARY KEY,
  song_id    TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX idx_reports_status ON reports(status);
```

- [ ] **Step 4: Add the D1 binding to wrangler.toml**

Append to `songbook-worker/wrangler.toml`:

```toml
# COMMUNITY_DB: run `wrangler d1 create songbook-community` and paste the returned id below
[[d1_databases]]
binding = "DB"
database_name = "songbook-community"
database_id = "REPLACE_WITH_ID_FROM_WRANGLER_D1_CREATE"
migrations_dir = "migrations"
```

Then actually create it and paste the real id:

```bash
cd songbook-worker && npx wrangler d1 create songbook-community
```

- [ ] **Step 5: Add DB to the Env type**

`songbook-worker/src/types.ts` — add one line to the `Env` interface:

```ts
export interface Env {
  R2_BUCKET: R2Bucket;
  SESSION_KV: KVNamespace;
  DB: D1Database;
  APP_ORIGIN: string;
  WALKIE_ORIGIN: string;
  LICENSE_SECRET: string;
  LICENSE_TOKEN_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
}
```

- [ ] **Step 6: Wire D1 + migrations into the test harness**

`songbook-worker/vitest.config.ts` — read the migrations at config time and pass them into the test env:

```ts
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

const migrations = await readD1Migrations('./migrations');

export default defineWorkersConfig({
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            APP_ORIGIN: 'http://localhost:5173',
            LICENSE_SECRET: 'test-license-secret',
            LICENSE_TOKEN_SECRET: 'test-token-secret',
            TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
            TEST_MIGRATIONS: migrations,
          },
          kvNamespaces: ['SESSION_KV'],
          r2Buckets: ['R2_BUCKET'],
          d1Databases: ['DB'],
        },
      },
    },
  },
});
```

`songbook-worker/test/apply-migrations.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test';

// Runs once per test worker, before any test file. Applies migrations/*.sql to the
// isolated D1 instance so every test starts against the real schema.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd songbook-worker && npx vitest run test/schema.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 8: Run the full worker suite to confirm nothing regressed**

Run: `cd songbook-worker && npm test`
Expected: PASS — all pre-existing tests still green.

- [ ] **Step 9: Commit**

```bash
git add songbook-worker/migrations songbook-worker/test/apply-migrations.ts songbook-worker/test/schema.test.ts songbook-worker/wrangler.toml songbook-worker/vitest.config.ts songbook-worker/src/types.ts
git commit -m "feat(worker): add D1 community schema and test harness"
```

---

### Task 2: Song identity library

Pure functions, no I/O. These decide what "the same song" means, and they are exactly the functions that break quietly, so they get thorough unit tests.

**Files:**
- Create: `songbook-worker/src/lib/songIdentity.ts`
- Test: `songbook-worker/test/songIdentity.test.ts`

**Interfaces:**
- Produces:
  - `stripChords(body: string): string`
  - `stripNotes(body: string): string`
  - `normalizeBody(body: string): string`
  - `groupKey(title: string, artist: string): string`
  - `contentHash(title: string, artist: string, body: string): Promise<string>`
  - `toFtsQuery(raw: string): string`

- [ ] **Step 1: Write the failing test**

`songbook-worker/test/songIdentity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  stripChords, stripNotes, normalizeBody, groupKey, contentHash, toFtsQuery,
} from '../src/lib/songIdentity';

describe('stripChords', () => {
  it('removes inline chord tokens but keeps the lyric', () => {
    expect(stripChords('El Shad[Dm]dai')).toBe('El Shaddai');
  });

  it('reduces a pure chord line to whitespace', () => {
    expect(stripChords('[Dm]   [G]  [C]').trim()).toBe('');
  });
});

describe('stripNotes', () => {
  it('removes a {note:} line entirely, leaving no blank line', () => {
    expect(stripNotes('a\n{note: Sarah leads}\nb\n')).toBe('a\nb\n');
  });
});

describe('normalizeBody', () => {
  it('collapses whitespace so cosmetic spacing does not change identity', () => {
    expect(normalizeBody('a  \n\n  b')).toBe(normalizeBody('a\nb'));
  });
});

describe('groupKey', () => {
  it('is case- and punctuation-insensitive', () => {
    expect(groupKey('How Great Is Our God!', 'Chris Tomlin'))
      .toBe(groupKey('how great is our god', 'chris tomlin'));
  });

  it('strips trailing parentheticals like (Live)', () => {
    expect(groupKey('Build My Life (Live)', 'Housefires'))
      .toBe(groupKey('Build My Life', 'Housefires'));
  });

  it('separates title from artist so they cannot bleed into each other', () => {
    expect(groupKey('a b', 'c')).not.toBe(groupKey('a', 'b c'));
  });
});

describe('contentHash', () => {
  it('is stable for identical input', async () => {
    expect(await contentHash('T', 'A', 'x')).toBe(await contentHash('T', 'A', 'x'));
  });

  it('ignores cosmetic whitespace differences', async () => {
    expect(await contentHash('T', 'A', 'a  \n\n b')).toBe(await contentHash('T', 'A', 'a\nb'));
  });

  it('differs when the chords differ', async () => {
    expect(await contentHash('T', 'A', '[G]la')).not.toBe(await contentHash('T', 'A', '[C]la'));
  });
});

describe('toFtsQuery', () => {
  it('quotes each term so FTS5 cannot choke on punctuation', () => {
    expect(toFtsQuery('how great!')).toBe('"how" "great"');
  });

  it('drops characters that would be parsed as FTS operators', () => {
    expect(toFtsQuery('a OR b*')).toBe('"a" "OR" "b"');
  });

  it('returns an empty string for an all-punctuation query', () => {
    expect(toFtsQuery('!!!')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd songbook-worker && npx vitest run test/songIdentity.test.ts`
Expected: FAIL — cannot resolve `../src/lib/songIdentity`.

- [ ] **Step 3: Write the implementation**

`songbook-worker/src/lib/songIdentity.ts`:

```ts
/** Remove inline [Chord] tokens, leaving the lyric text. */
export function stripChords(body: string): string {
  return body.replace(/\[[^\]]*\]/g, '');
}

/**
 * Remove {note:} lines including the trailing newline, so no blank line is left behind.
 * Mirrors stripNoteTokens in src/lib/exportSbp.js — notes are private team chatter and
 * must never travel with a published chart.
 */
export function stripNotes(body: string): string {
  return body.replace(/\{note:[^}]*\}[^\n]*\n?/g, '');
}

/** Collapse whitespace so cosmetic spacing does not change a song's identity. */
export function normalizeBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

function normalizeField(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)\s*$/, '')     // trailing parentheticals: (Live), (Acoustic)
    .replace(/[^a-z0-9 ]/g, '')       // punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same song, different arrangement → same group_key. Used to cap arrangements per song. */
export function groupKey(title: string, artist: string): string {
  return `${normalizeField(title)}|${normalizeField(artist)}`;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Byte-identical charts from two publishers produce the same hash → exact-duplicate collapse. */
export async function contentHash(title: string, artist: string, body: string): Promise<string> {
  const material = `${normalizeField(title)} ${normalizeField(artist)} ${normalizeBody(body)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return toHex(digest);
}

/**
 * Turn a raw user query into a safe FTS5 MATCH expression. Unquoted user input can contain
 * FTS operators (OR, *, ^, ") that make MATCH throw a SQL error, which would surface as a
 * dead search box.
 */
export function toFtsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .map((t) => `"${t}"`)
    .join(' ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd songbook-worker && npx vitest run test/songIdentity.test.ts`
Expected: PASS — all tests.

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/lib/songIdentity.ts songbook-worker/test/songIdentity.test.ts
git commit -m "feat(worker): add song identity hashing and normalization"
```

---

### Task 3: POST /community/publish

Accepts song JSON, dedups on `content_hash`, writes `publications` / `songs` / `song_publications` / `songs_fts`, returns an unpublish token. Mounts the route group.

**Files:**
- Create: `songbook-worker/src/routes/community.ts`
- Modify: `songbook-worker/src/index.ts`
- Test: `songbook-worker/test/community.publish.test.ts`

**Interfaces:**
- Consumes: `Env.DB` (Task 1); `groupKey`, `contentHash`, `stripChords`, `stripNotes` (Task 2); `verifyTurnstile` from `../middleware/turnstile`; `generateSalt`, `hashPin` from `../lib/pin` (reused to hash the publish token — same salted SHA-256 shape).
- Produces: `POST /community/publish` → `201 { publicationId, publishToken, published, alreadyInPool }`.
- Produces: request body type `{ collectionName: string, publisherName?: string, songs: Array<{ title, artist, keyIndex?, capo?, tempo?, timeSig?, body }> }`.

- [ ] **Step 1: Write the failing test**

`songbook-worker/test/community.publish.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

function song(over: Record<string, unknown> = {}) {
  return { title: 'How Great Is Our God', artist: 'Chris Tomlin', keyIndex: 7, capo: 0, body: 'The [G]splendor of a king', ...over };
}

async function publish(body: unknown, headers: Record<string, string> = {}) {
  return SELF.fetch('http://localhost/community/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /community/publish', () => {
  it('returns 403 without a Turnstile token', async () => {
    const res = await publish({ collectionName: 'C', songs: [song()] }, { 'X-Turnstile-Token': '' });
    expect(res.status).toBe(403);
  });

  it('publishes songs and returns a publish token', async () => {
    const res = await publish({ collectionName: 'Judah 15Apr26', publisherName: 'Chris', songs: [song()] });
    expect(res.status).toBe(201);
    const body = await res.json() as { publicationId: string; publishToken: string; published: number; alreadyInPool: number };
    expect(body.published).toBe(1);
    expect(body.alreadyInPool).toBe(0);
    expect(body.publishToken).toMatch(/^[0-9a-f-]{36}$/);

    const row = await env.DB.prepare('SELECT title, artist, key_index FROM songs WHERE title = ?')
      .bind('How Great Is Our God').first();
    expect(row).toMatchObject({ artist: 'Chris Tomlin', key_index: 7 });
  });

  it('rejects a song with no artist', async () => {
    const res = await publish({ collectionName: 'C', songs: [song({ artist: '' })] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing_artist' });
  });

  it('strips {note:} tokens from the published body', async () => {
    await publish({ collectionName: 'C', songs: [song({ title: 'Noted', body: 'a\n{note: Sarah leads}\nb' })] });
    const row = await env.DB.prepare('SELECT body FROM songs WHERE title = ?').bind('Noted').first<{ body: string }>();
    expect(row!.body).not.toContain('note:');
    expect(row!.body).toContain('a');
  });

  it('collapses an exact duplicate instead of creating a second song row', async () => {
    await publish({ collectionName: 'A', songs: [song({ title: 'Dup' })] });
    const res = await publish({ collectionName: 'B', songs: [song({ title: 'Dup' })] });
    const body = await res.json() as { published: number; alreadyInPool: number };
    expect(body.published).toBe(0);
    expect(body.alreadyInPool).toBe(1);

    const { results } = await env.DB.prepare('SELECT id FROM songs WHERE title = ?').bind('Dup').all();
    expect(results.length).toBe(1);

    // ...but it is linked to BOTH publications
    const links = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM song_publications sp JOIN songs s ON s.id = sp.song_id WHERE s.title = ?'
    ).bind('Dup').first<{ n: number }>();
    expect(links!.n).toBe(2);
  });

  it('indexes chord-stripped lyrics for full-text search', async () => {
    await publish({ collectionName: 'C', songs: [song({ title: 'Searchable', body: 'The [G]splendor of a [C]king' })] });
    const row = await env.DB.prepare(
      'SELECT lyrics_only FROM songs_fts WHERE title = ?'
    ).bind('Searchable').first<{ lyrics_only: string }>();
    expect(row!.lyrics_only).toContain('splendor');
    expect(row!.lyrics_only).not.toContain('[G]');
  });

  it('rejects an empty songs array', async () => {
    const res = await publish({ collectionName: 'C', songs: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no_songs' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd songbook-worker && npx vitest run test/community.publish.test.ts`
Expected: FAIL — 404 on `/community/publish` (route not mounted).

- [ ] **Step 3: Write the route**

`songbook-worker/src/routes/community.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../types';
import { verifyTurnstile } from '../middleware/turnstile';
import { generateSalt, hashPin } from '../lib/pin';
import { groupKey, contentHash, stripChords, stripNotes } from '../lib/songIdentity';

const community = new Hono<{ Bindings: Env }>();

const MAX_SONGS = 200;

interface IncomingSong {
  title?: unknown;
  artist?: unknown;
  keyIndex?: unknown;
  capo?: unknown;
  tempo?: unknown;
  timeSig?: unknown;
  body?: unknown;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

community.post('/publish', verifyTurnstile, async (c) => {
  let payload: { collectionName?: unknown; publisherName?: unknown; songs?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const collectionName = str(payload.collectionName) || 'Untitled';
  const publisherName = str(payload.publisherName) || 'Anonymous';
  const songs = Array.isArray(payload.songs) ? (payload.songs as IncomingSong[]) : [];

  if (songs.length === 0) return c.json({ error: 'no_songs' }, 400);
  if (songs.length > MAX_SONGS) return c.json({ error: 'too_many_songs' }, 400);

  // Validate before writing anything — a partial publication is worse than a rejected one.
  for (const s of songs) {
    if (!str(s.title)) return c.json({ error: 'missing_title' }, 400);
    if (!str(s.artist)) return c.json({ error: 'missing_artist' }, 400);
    if (!str(s.body)) return c.json({ error: 'missing_body' }, 400);
  }

  const publicationId = crypto.randomUUID();
  const publishToken = crypto.randomUUID();
  const salt = generateSalt();
  const publishTokenHash = await hashPin(publishToken, salt);
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO publications (id, collection_name, publisher_name, publish_token_hash, created_at, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(publicationId, collectionName, publisherName, `${salt}:${publishTokenHash}`, now, 'live').run();

  let published = 0;
  let alreadyInPool = 0;

  for (const s of songs) {
    const title = str(s.title);
    const artist = str(s.artist);
    const body = stripNotes(String(s.body));
    const hash = await contentHash(title, artist, body);

    const existing = await c.env.DB.prepare('SELECT id FROM songs WHERE content_hash = ?')
      .bind(hash).first<{ id: string }>();

    let songId: string;
    if (existing) {
      songId = existing.id;
      alreadyInPool++;
      // A previously removed arrangement republished by someone else comes back to life.
      await c.env.DB.prepare("UPDATE songs SET status = 'live' WHERE id = ?").bind(songId).run();
    } else {
      songId = crypto.randomUUID();
      await c.env.DB.prepare(
        `INSERT INTO songs (id, content_hash, group_key, title, artist, key_index, capo, tempo, time_sig, body, first_published_at, import_count, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'live')`
      ).bind(
        songId, hash, groupKey(title, artist), title, artist,
        num(s.keyIndex), num(s.capo), num(s.tempo), str(s.timeSig) || null,
        body, now,
      ).run();

      await c.env.DB.prepare(
        'INSERT INTO songs_fts (song_id, title, artist, lyrics_only) VALUES (?, ?, ?, ?)'
      ).bind(songId, title, artist, stripChords(body)).run();

      published++;
    }

    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO song_publications (song_id, publication_id) VALUES (?, ?)'
    ).bind(songId, publicationId).run();
  }

  return c.json({ publicationId, publishToken, published, alreadyInPool }, 201);
});

export default community;
```

- [ ] **Step 4: Mount the route**

`songbook-worker/src/index.ts` — add the import beside the others and the `app.route` beside the others:

```ts
import community from './routes/community';
```

```ts
app.route('/community', community);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd songbook-worker && npx vitest run test/community.publish.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/src/routes/community.ts songbook-worker/src/index.ts songbook-worker/test/community.publish.test.ts
git commit -m "feat(worker): add POST /community/publish with content-hash dedup"
```

---

### Task 4: Rate-limit publishing

Publish is the only write path an anonymous caller can reach. With no accounts, IP rate limiting plus admin removal is the entire abuse toolkit — so it has to exist before this is exposed.

**Files:**
- Create: `songbook-worker/src/middleware/rateLimit.ts`
- Modify: `songbook-worker/src/routes/community.ts`
- Test: `songbook-worker/test/rateLimit.test.ts`

**Interfaces:**
- Consumes: `Env.SESSION_KV` (already bound).
- Produces: `rateLimit(opts: { prefix: string; limit: number; windowSeconds: number }): MiddlewareHandler<{ Bindings: Env }>` — returns `429 { error: 'rate_limited' }` when exceeded.

- [ ] **Step 1: Write the failing test**

`songbook-worker/test/rateLimit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

function body() {
  return JSON.stringify({
    collectionName: 'C',
    songs: [{ title: `T${crypto.randomUUID()}`, artist: 'A', body: 'la' }],
  });
}

async function publishFrom(ip: string) {
  return SELF.fetch('http://localhost/community/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      'X-Turnstile-Token': 'test-token',
      'CF-Connecting-IP': ip,
    },
    body: body(),
  });
}

describe('publish rate limiting', () => {
  it('allows the first 5 publications from one IP and blocks the 6th', async () => {
    const ip = '203.0.113.10';
    for (let i = 0; i < 5; i++) {
      const ok = await publishFrom(ip);
      expect(ok.status).toBe(201);
    }
    const blocked = await publishFrom(ip);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'rate_limited' });
  });

  it('does not penalise a different IP', async () => {
    const res = await publishFrom('203.0.113.99');
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd songbook-worker && npx vitest run test/rateLimit.test.ts`
Expected: FAIL — the 6th publish returns 201, not 429.

- [ ] **Step 3: Write the middleware**

`songbook-worker/src/middleware/rateLimit.ts`:

```ts
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

/**
 * KV-backed fixed-window IP rate limiter. With no user accounts there is nobody to ban,
 * so IP limits plus after-the-fact admin removal are the whole abuse toolkit.
 */
export function rateLimit(opts: { prefix: string; limit: number; windowSeconds: number }): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const key = `${opts.prefix}:${ip}:${window}`;

    const current = Number((await c.env.SESSION_KV.get(key)) ?? '0');
    if (current >= opts.limit) {
      return c.json({ error: 'rate_limited' }, 429);
    }

    await c.env.SESSION_KV.put(key, String(current + 1), { expirationTtl: opts.windowSeconds });
    return next();
  };
}
```

- [ ] **Step 4: Apply it to publish**

`songbook-worker/src/routes/community.ts` — add the import:

```ts
import { rateLimit } from '../middleware/rateLimit';
```

and insert the middleware between `verifyTurnstile` and the handler:

```ts
community.post('/publish', verifyTurnstile, rateLimit({ prefix: 'cpub', limit: 5, windowSeconds: 3600 }), async (c) => {
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd songbook-worker && npx vitest run test/rateLimit.test.ts test/community.publish.test.ts`
Expected: PASS. (The publish tests use no `CF-Connecting-IP`, so they share the `unknown` bucket — they publish fewer than 5 times, so they stay under the limit.)

- [ ] **Step 6: Commit**

```bash
git add songbook-worker/src/middleware/rateLimit.ts songbook-worker/src/routes/community.ts songbook-worker/test/rateLimit.test.ts
git commit -m "feat(worker): rate-limit community publishing by IP"
```

---

### Task 5: GET /community/search

FTS5 search returning a **flat** list of arrangements, capped at the top 3 per `group_key` so twenty versions of one worship standard cannot bury the UG and DC rows in the shared result list.

**Files:**
- Modify: `songbook-worker/src/routes/community.ts`
- Test: `songbook-worker/test/community.search.test.ts`

**Interfaces:**
- Consumes: `toFtsQuery` (Task 2).
- Produces: `GET /community/search?q=<query>` → `200 { results: CommunityResult[] }` where
  `CommunityResult = { id, title, artist, keyIndex, capo, tempo, collectionName, publisherName, importCount }`.
  This is the exact shape the client depends on in Task 8.

- [ ] **Step 1: Write the failing test**

`songbook-worker/test/community.search.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { SELF, env } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

interface Result {
  id: string; title: string; artist: string; keyIndex: number | null;
  capo: number | null; tempo: number | null;
  collectionName: string; publisherName: string; importCount: number;
}

async function publish(collectionName: string, publisherName: string, songs: unknown[]) {
  const res = await SELF.fetch('http://localhost/community/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token' },
    body: JSON.stringify({ collectionName, publisherName, songs }),
  });
  expect(res.status).toBe(201);
}

async function search(q: string): Promise<Result[]> {
  const res = await SELF.fetch(`http://localhost/community/search?q=${encodeURIComponent(q)}`, { headers: { Origin: ORIGIN } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: Result[] }).results;
}

beforeAll(async () => {
  // Five distinct arrangements of one song (different bodies → different content hashes,
  // same group_key), plus one unrelated song.
  for (let i = 0; i < 5; i++) {
    await publish(`Set ${i}`, `Church ${i}`, [
      { title: 'How Great Is Our God', artist: 'Chris Tomlin', keyIndex: i, capo: 0, body: `The [G]splendor of a king ${'la '.repeat(i + 1)}` },
    ]);
  }
  await publish('Other', 'Someone', [
    { title: 'Oceans', artist: 'Hillsong', keyIndex: 2, capo: 2, tempo: 70, body: 'You call me [D]out upon the waters' },
  ]);

  // Make arrangement keyIndex=3 the most-imported so the cap keeps a predictable winner.
  await env.DB.prepare('UPDATE songs SET import_count = 99 WHERE key_index = 3 AND title = ?')
    .bind('How Great Is Our God').run();
});

describe('GET /community/search', () => {
  it('finds a song by title', async () => {
    const results = await search('oceans');
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({
      title: 'Oceans', artist: 'Hillsong', keyIndex: 2, capo: 2, tempo: 70,
      collectionName: 'Other', publisherName: 'Someone', importCount: 0,
    });
    expect(results[0].id).toBeTruthy();
  });

  it('finds a song by a lyric line, not just the title', async () => {
    const results = await search('waters');
    expect(results.map(r => r.title)).toContain('Oceans');
  });

  it('caps arrangements at 3 per song', async () => {
    const results = await search('splendor');
    expect(results.length).toBe(3);
    expect(new Set(results.map(r => r.title))).toEqual(new Set(['How Great Is Our God']));
  });

  it('keeps the most-imported arrangement when capping', async () => {
    const results = await search('splendor');
    expect(results.map(r => r.keyIndex)).toContain(3);
  });

  it('returns an empty list rather than erroring on a punctuation-only query', async () => {
    const res = await SELF.fetch('http://localhost/community/search?q=%21%21%21', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it('returns an empty list rather than erroring on FTS operator characters', async () => {
    const results = await search('oceans OR *');
    expect(Array.isArray(results)).toBe(true);
  });

  it('excludes removed songs', async () => {
    await env.DB.prepare("UPDATE songs SET status = 'removed' WHERE title = ?").bind('Oceans').run();
    const results = await search('oceans');
    expect(results.length).toBe(0);
    await env.DB.prepare("UPDATE songs SET status = 'live' WHERE title = ?").bind('Oceans').run();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd songbook-worker && npx vitest run test/community.search.test.ts`
Expected: FAIL — 404 on `/community/search`.

- [ ] **Step 3: Write the handler**

`songbook-worker/src/routes/community.ts` — add `toFtsQuery` to the existing import from `../lib/songIdentity`, then append this route before `export default community;`:

```ts
const MAX_RESULTS = 30;
const MAX_ARRANGEMENTS_PER_SONG = 3;

interface SearchRow {
  id: string; title: string; artist: string;
  key_index: number | null; capo: number | null; tempo: number | null;
  collection_name: string | null; publisher_name: string | null; import_count: number;
}

community.get('/search', async (c) => {
  const match = toFtsQuery(c.req.query('q') ?? '');
  if (!match) return c.json({ results: [] });

  // ROW_NUMBER caps arrangements per song so one popular worship standard cannot bury the
  // Ultimate Guitar / Daniel Choy rows in the shared result list.
  // bm25() is negative and lower is better, hence ORDER BY rank ASC.
  const sql = `
    WITH hits AS (
      SELECT
        s.id, s.group_key, s.title, s.artist, s.key_index, s.capo, s.tempo, s.import_count,
        bm25(songs_fts) AS rank,
        (SELECT p.collection_name FROM song_publications sp
           JOIN publications p ON p.id = sp.publication_id
          WHERE sp.song_id = s.id AND p.status = 'live'
          ORDER BY p.created_at ASC LIMIT 1) AS collection_name,
        (SELECT p.publisher_name FROM song_publications sp
           JOIN publications p ON p.id = sp.publication_id
          WHERE sp.song_id = s.id AND p.status = 'live'
          ORDER BY p.created_at ASC LIMIT 1) AS publisher_name
      FROM songs_fts
      JOIN songs s ON s.id = songs_fts.song_id
      WHERE songs_fts MATCH ?1 AND s.status = 'live'
    ),
    ranked AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY group_key ORDER BY import_count DESC, rank ASC
      ) AS rn
      FROM hits
    )
    SELECT id, title, artist, key_index, capo, tempo, collection_name, publisher_name, import_count
    FROM ranked
    WHERE rn <= ?2
    ORDER BY rank ASC, import_count DESC
    LIMIT ?3
  `;

  let rows: SearchRow[];
  try {
    const { results } = await c.env.DB.prepare(sql)
      .bind(match, MAX_ARRANGEMENTS_PER_SONG, MAX_RESULTS)
      .all<SearchRow>();
    rows = results;
  } catch {
    // A malformed MATCH must degrade to "no results", never to a dead search box.
    return c.json({ results: [] });
  }

  return c.json({
    results: rows.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      keyIndex: r.key_index,
      capo: r.capo,
      tempo: r.tempo,
      collectionName: r.collection_name ?? '',
      publisherName: r.publisher_name ?? 'Anonymous',
      importCount: r.import_count,
    })),
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd songbook-worker && npx vitest run test/community.search.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/routes/community.ts songbook-worker/test/community.search.test.ts
git commit -m "feat(worker): add GET /community/search with FTS5 and per-song arrangement cap"
```

---

### Task 6: Fetch one arrangement, and count imports

The read path the client uses for preview and import, plus the popularity counter that ranking depends on.

**Files:**
- Modify: `songbook-worker/src/routes/community.ts`
- Test: `songbook-worker/test/community.arrangement.test.ts`

**Interfaces:**
- Produces: `GET /community/arrangement/:id` → `200 { id, title, artist, keyIndex, capo, tempo, timeSig, body, collectionName, publisherName, importCount }`, `404 { error: 'not_found' }` when missing or removed.
- Produces: `POST /community/arrangement/:id/import` → `200 { ok: true }` (always; a counter failure must never block an import).

- [ ] **Step 1: Write the failing test**

`songbook-worker/test/community.arrangement.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { SELF, env } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';
let songId: string;

beforeAll(async () => {
  await SELF.fetch('http://localhost/community/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token' },
    body: JSON.stringify({
      collectionName: 'Judah 15Apr26',
      publisherName: 'Chris',
      songs: [{ title: 'Yeshua', artist: 'Jesus Image', keyIndex: 7, capo: 2, tempo: 72, body: 'You are [G]holy' }],
    }),
  });
  const row = await env.DB.prepare('SELECT id FROM songs WHERE title = ?').bind('Yeshua').first<{ id: string }>();
  songId = row!.id;
});

describe('GET /community/arrangement/:id', () => {
  it('returns the full body and provenance', async () => {
    const res = await SELF.fetch(`http://localhost/community/arrangement/${songId}`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: songId, title: 'Yeshua', artist: 'Jesus Image',
      keyIndex: 7, capo: 2, tempo: 72,
      body: 'You are [G]holy',
      collectionName: 'Judah 15Apr26', publisherName: 'Chris',
    });
  });

  it('returns 404 for an unknown id', async () => {
    const res = await SELF.fetch('http://localhost/community/arrangement/nope', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a removed arrangement', async () => {
    await env.DB.prepare("UPDATE songs SET status = 'removed' WHERE id = ?").bind(songId).run();
    const res = await SELF.fetch(`http://localhost/community/arrangement/${songId}`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(404);
    await env.DB.prepare("UPDATE songs SET status = 'live' WHERE id = ?").bind(songId).run();
  });
});

describe('POST /community/arrangement/:id/import', () => {
  it('increments the import counter', async () => {
    const res = await SELF.fetch(`http://localhost/community/arrangement/${songId}/import`, {
      method: 'POST', headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare('SELECT import_count FROM songs WHERE id = ?')
      .bind(songId).first<{ import_count: number }>();
    expect(row!.import_count).toBe(1);
  });

  it('is a no-op (not an error) for an unknown id, so a counter bump can never block an import', async () => {
    const res = await SELF.fetch('http://localhost/community/arrangement/nope/import', {
      method: 'POST', headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd songbook-worker && npx vitest run test/community.arrangement.test.ts`
Expected: FAIL — 404 on `/community/arrangement/:id`.

- [ ] **Step 3: Write the handlers**

`songbook-worker/src/routes/community.ts` — append before `export default community;`:

```ts
interface ArrangementRow extends SearchRow {
  time_sig: string | null;
  body: string;
}

community.get('/arrangement/:id', async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT
      s.id, s.title, s.artist, s.key_index, s.capo, s.tempo, s.time_sig, s.body, s.import_count,
      (SELECT p.collection_name FROM song_publications sp
         JOIN publications p ON p.id = sp.publication_id
        WHERE sp.song_id = s.id AND p.status = 'live'
        ORDER BY p.created_at ASC LIMIT 1) AS collection_name,
      (SELECT p.publisher_name FROM song_publications sp
         JOIN publications p ON p.id = sp.publication_id
        WHERE sp.song_id = s.id AND p.status = 'live'
        ORDER BY p.created_at ASC LIMIT 1) AS publisher_name
    FROM songs s
    WHERE s.id = ? AND s.status = 'live'
  `).bind(c.req.param('id')).first<ArrangementRow>();

  if (!row) return c.json({ error: 'not_found' }, 404);

  return c.json({
    id: row.id,
    title: row.title,
    artist: row.artist,
    keyIndex: row.key_index,
    capo: row.capo,
    tempo: row.tempo,
    timeSig: row.time_sig,
    body: row.body,
    collectionName: row.collection_name ?? '',
    publisherName: row.publisher_name ?? 'Anonymous',
    importCount: row.import_count,
  });
});

community.post('/arrangement/:id/import', async (c) => {
  // Deliberately always 200: this is a fire-and-forget popularity counter, and a failure
  // here must never surface to a user who has already successfully imported the song.
  await c.env.DB.prepare(
    "UPDATE songs SET import_count = import_count + 1 WHERE id = ? AND status = 'live'"
  ).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd songbook-worker && npx vitest run test/community.arrangement.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add songbook-worker/src/routes/community.ts songbook-worker/test/community.arrangement.test.ts
git commit -m "feat(worker): add arrangement fetch and import counter"
```

---

### Task 7: Report and unpublish

The takedown path. A rights-holder complaint must have somewhere to land, and a publisher must be able to withdraw what they listed.

**Files:**
- Modify: `songbook-worker/src/routes/community.ts`
- Modify: `songbook-worker/src/index.ts` (CORS allow-header)
- Test: `songbook-worker/test/community.moderation.test.ts`

**Interfaces:**
- Consumes: `hashPin` from `../lib/pin` (already imported in Task 3).
- Produces: `POST /community/arrangement/:id/report` with body `{ reason: 'copyright' | 'inappropriate' | 'wrong-or-broken' }` → `201 { ok: true }`.
- Produces: `DELETE /community/publication/:id` with header `X-Publish-Token` → `200 { unlisted: number }`; `403 { error: 'invalid_token' }` on a bad token.

- [ ] **Step 1: Write the failing test**

`songbook-worker/test/community.moderation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

async function publish(title: string) {
  const res = await SELF.fetch('http://localhost/community/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token' },
    body: JSON.stringify({
      collectionName: 'C', publisherName: 'P',
      songs: [{ title, artist: 'A', body: `body for ${title}` }],
    }),
  });
  const body = await res.json() as { publicationId: string; publishToken: string };
  const row = await env.DB.prepare('SELECT id FROM songs WHERE title = ?').bind(title).first<{ id: string }>();
  return { ...body, songId: row!.id };
}

describe('POST /community/arrangement/:id/report', () => {
  it('records a report', async () => {
    const { songId } = await publish('Reportable');
    const res = await SELF.fetch(`http://localhost/community/arrangement/${songId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ reason: 'copyright' }),
    });
    expect(res.status).toBe(201);

    const row = await env.DB.prepare('SELECT reason, status FROM reports WHERE song_id = ?')
      .bind(songId).first();
    expect(row).toMatchObject({ reason: 'copyright', status: 'open' });
  });

  it('rejects an unknown reason', async () => {
    const { songId } = await publish('Reportable2');
    const res = await SELF.fetch(`http://localhost/community/arrangement/${songId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ reason: 'because-i-say-so' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /community/publication/:id', () => {
  it('rejects a wrong publish token', async () => {
    const { publicationId } = await publish('Unlistable');
    const res = await SELF.fetch(`http://localhost/community/publication/${publicationId}`, {
      method: 'DELETE',
      headers: { Origin: ORIGIN, 'X-Publish-Token': 'not-the-token' },
    });
    expect(res.status).toBe(403);
  });

  it('unlists the publication and removes its songs from search', async () => {
    const { publicationId, publishToken, songId } = await publish('GoneSoon');
    const res = await SELF.fetch(`http://localhost/community/publication/${publicationId}`, {
      method: 'DELETE',
      headers: { Origin: ORIGIN, 'X-Publish-Token': publishToken },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unlisted: 1 });

    const song = await env.DB.prepare('SELECT status FROM songs WHERE id = ?').bind(songId).first<{ status: string }>();
    expect(song!.status).toBe('removed');

    const fts = await env.DB.prepare('SELECT song_id FROM songs_fts WHERE song_id = ?').bind(songId).first();
    expect(fts).toBeNull();

    const search = await SELF.fetch('http://localhost/community/search?q=GoneSoon', { headers: { Origin: ORIGIN } });
    expect(await search.json()).toEqual({ results: [] });
  });

  it('keeps a song alive if another live publication still references it', async () => {
    const first = await publish('Shared');
    // Republish the identical body from a second publication → same content_hash, same song row.
    const second = await SELF.fetch('http://localhost/community/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token' },
      body: JSON.stringify({
        collectionName: 'C2', publisherName: 'P2',
        songs: [{ title: 'Shared', artist: 'A', body: 'body for Shared' }],
      }),
    });
    expect(second.status).toBe(201);

    await SELF.fetch(`http://localhost/community/publication/${first.publicationId}`, {
      method: 'DELETE',
      headers: { Origin: ORIGIN, 'X-Publish-Token': first.publishToken },
    });

    const song = await env.DB.prepare('SELECT status FROM songs WHERE id = ?')
      .bind(first.songId).first<{ status: string }>();
    expect(song!.status).toBe('live');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd songbook-worker && npx vitest run test/community.moderation.test.ts`
Expected: FAIL — 404 on the report and delete routes.

- [ ] **Step 3: Write the handlers**

`songbook-worker/src/routes/community.ts` — append before `export default community;`:

```ts
const VALID_REASONS = new Set(['copyright', 'inappropriate', 'wrong-or-broken']);

community.post('/arrangement/:id/report', async (c) => {
  let payload: { reason?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }
  if (typeof payload.reason !== 'string' || !VALID_REASONS.has(payload.reason)) {
    return c.json({ error: 'invalid_reason' }, 400);
  }

  await c.env.DB.prepare(
    "INSERT INTO reports (id, song_id, reason, created_at, status) VALUES (?, ?, ?, ?, 'open')"
  ).bind(crypto.randomUUID(), c.req.param('id'), payload.reason, Date.now()).run();

  return c.json({ ok: true }, 201);
});

community.delete('/publication/:id', async (c) => {
  const publicationId = c.req.param('id');
  const token = c.req.header('X-Publish-Token') ?? '';

  const pub = await c.env.DB.prepare(
    "SELECT publish_token_hash FROM publications WHERE id = ? AND status = 'live'"
  ).bind(publicationId).first<{ publish_token_hash: string }>();
  if (!pub) return c.json({ error: 'not_found' }, 404);

  const [salt, expected] = pub.publish_token_hash.split(':');
  if (!salt || !expected || (await hashPin(token, salt)) !== expected) {
    return c.json({ error: 'invalid_token' }, 403);
  }

  await c.env.DB.prepare("UPDATE publications SET status = 'removed' WHERE id = ?")
    .bind(publicationId).run();

  // Only orphan the songs that no *other* live publication still references — one church
  // unlisting its set must not yank a shared arrangement out from under everyone else.
  const { results: orphans } = await c.env.DB.prepare(`
    SELECT sp.song_id AS id
    FROM song_publications sp
    WHERE sp.publication_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM song_publications sp2
        JOIN publications p2 ON p2.id = sp2.publication_id
        WHERE sp2.song_id = sp.song_id AND p2.status = 'live'
      )
  `).bind(publicationId).all<{ id: string }>();

  for (const { id } of orphans) {
    await c.env.DB.prepare("UPDATE songs SET status = 'removed' WHERE id = ?").bind(id).run();
    await c.env.DB.prepare('DELETE FROM songs_fts WHERE song_id = ?').bind(id).run();
  }

  return c.json({ unlisted: orphans.length });
});
```

- [ ] **Step 4: Allow the X-Publish-Token header through CORS**

`songbook-worker/src/index.ts` — add `X-Publish-Token` to the existing `Access-Control-Allow-Headers` list:

```ts
'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In-Days, X-Leader-Token, X-Director-Token, X-Conductor-Token, X-Creator-Token, X-License-Token, X-Turnstile-Token, X-Locked, X-Lock-Pin, X-Publish-Token',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd songbook-worker && npx vitest run test/community.moderation.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Run the whole worker suite**

Run: `cd songbook-worker && npm test`
Expected: PASS — everything green.

- [ ] **Step 7: Commit**

```bash
git add songbook-worker/src/routes/community.ts songbook-worker/src/index.ts songbook-worker/test/community.moderation.test.ts
git commit -m "feat(worker): add community report and unpublish"
```

---

### Task 8: Community client (frontend)

The client-side wrapper for the four endpoints, mirroring the structure of `src/lib/danielchoyImport/danielchoyClient.js`.

**Files:**
- Create: `src/lib/communityImport/communityClient.js`
- Test: `src/lib/communityImport/__tests__/communityClient.test.js`

**Interfaces:**
- Consumes: `GET /community/search`, `GET /community/arrangement/:id`, `POST /community/arrangement/:id/import`, `POST /community/arrangement/:id/report`, `POST /community/publish` (Tasks 3–7).
- Produces:
  - `searchCommunity(query): Promise<Array<{ id, url, title, artist, description, source: 'community', keyIndex, capo, tempo, collectionName, publisherName, importCount }>>` — **`url` is a synthetic `community:<id>` string**: the shared result list keys rows on `r.url` (`UGSearchModal.jsx:217`) and it is never fetched, because `fetchAndParseSong` branches on `source` first.
  - `fetchCommunityArrangement(id): Promise<{ id, title, artist, keyIndex, capo, tempo, timeSig, body, collectionName, publisherName }>`
  - `recordCommunityImport(id): Promise<void>` — never throws.
  - `reportCommunityArrangement(id, reason): Promise<void>`
  - `publishCollection({ collectionName, publisherName, songs, turnstileToken }): Promise<{ publicationId, publishToken, published, alreadyInPool }>`
  - `unpublishCollection(publicationId, publishToken): Promise<void>`

- [ ] **Step 1: Write the failing test**

`src/lib/communityImport/__tests__/communityClient.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  searchCommunity, fetchCommunityArrangement, recordCommunityImport,
  reportCommunityArrangement, publishCollection,
} from '../communityClient'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(body, ok = true, status = 200) {
  global.fetch = vi.fn(() => Promise.resolve({
    ok, status, json: () => Promise.resolve(body),
  }))
}

describe('searchCommunity', () => {
  it('tags results with source and a synthetic url key', async () => {
    mockFetch({ results: [{
      id: 'a1', title: 'Oceans', artist: 'Hillsong', keyIndex: 2, capo: 2, tempo: 70,
      collectionName: 'Judah', publisherName: 'Chris', importCount: 5,
    }] })

    const results = await searchCommunity('oceans')
    expect(results).toEqual([{
      id: 'a1',
      url: 'community:a1',
      source: 'community',
      title: 'Oceans',
      artist: 'Hillsong',
      description: 'Key D · capo 2 · from "Judah" · 5 imports',
      keyIndex: 2, capo: 2, tempo: 70,
      collectionName: 'Judah', publisherName: 'Chris', importCount: 5,
    }])
  })

  it('returns [] for a blank query without hitting the network', async () => {
    global.fetch = vi.fn()
    expect(await searchCommunity('   ')).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws on a network failure so the caller can report the source as failed', async () => {
    mockFetch({}, false, 500)
    await expect(searchCommunity('oceans')).rejects.toThrow()
  })
})

describe('fetchCommunityArrangement', () => {
  it('returns the arrangement', async () => {
    mockFetch({ id: 'a1', title: 'Oceans', artist: 'Hillsong', body: 'la', keyIndex: 2, capo: 2 })
    const a = await fetchCommunityArrangement('a1')
    expect(a).toMatchObject({ id: 'a1', title: 'Oceans', body: 'la' })
  })

  it('throws not_found on 404', async () => {
    mockFetch({ error: 'not_found' }, false, 404)
    await expect(fetchCommunityArrangement('nope')).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('recordCommunityImport', () => {
  it('never throws, even when the network fails — a counter must not break an import', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')))
    await expect(recordCommunityImport('a1')).resolves.toBeUndefined()
  })
})

describe('reportCommunityArrangement', () => {
  it('posts the reason', async () => {
    mockFetch({ ok: true }, true, 201)
    await reportCommunityArrangement('a1', 'copyright')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/community/arrangement/a1/report'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'copyright' }) }),
    )
  })
})

describe('publishCollection', () => {
  it('sends the turnstile token and returns the publish token', async () => {
    mockFetch({ publicationId: 'p1', publishToken: 't1', published: 3, alreadyInPool: 1 }, true, 201)
    const out = await publishCollection({
      collectionName: 'Judah', publisherName: 'Chris',
      songs: [{ title: 'T', artist: 'A', body: 'la' }],
      turnstileToken: 'ts',
    })
    expect(out).toEqual({ publicationId: 'p1', publishToken: 't1', published: 3, alreadyInPool: 1 })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/community/publish'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Turnstile-Token': 'ts' }),
      }),
    )
  })

  it('throws rate_limited on 429', async () => {
    mockFetch({ error: 'rate_limited' }, false, 429)
    await expect(publishCollection({ collectionName: 'C', songs: [], turnstileToken: 't' }))
      .rejects.toMatchObject({ code: 'rate_limited' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/communityImport/__tests__/communityClient.test.js`
Expected: FAIL — cannot resolve `../communityClient`.

- [ ] **Step 3: Write the client**

`src/lib/communityImport/communityClient.js`:

```js
const WORKER_URL = import.meta.env.VITE_WORKER_URL

const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

function err(code) {
  return Object.assign(new Error(code), { code })
}

/** The subtitle shown under a community row in the shared search results. */
function describeArrangement(r) {
  const parts = []
  if (typeof r.keyIndex === 'number') parts.push(`Key ${KEY_NAMES[r.keyIndex % 12]}`)
  if (r.capo) parts.push(`capo ${r.capo}`)
  if (r.collectionName) parts.push(`from "${r.collectionName}"`)
  parts.push(`${r.importCount} import${r.importCount === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/**
 * Search the community pool. Result shape matches what UGSearchModal expects from every
 * source. `url` is synthetic (`community:<id>`): the result list keys rows on r.url, and
 * fetchAndParseSong dispatches on `source` before it ever looks at `url`.
 */
export async function searchCommunity(query) {
  if (!query?.trim()) return []

  const res = await fetch(`${WORKER_URL}/community/search?q=${encodeURIComponent(query.trim())}`)
  if (!res.ok) throw err('network_error')

  const { results } = await res.json()
  return (results ?? []).map(r => ({
    ...r,
    url: `community:${r.id}`,
    source: 'community',
    description: describeArrangement(r),
  }))
}

export async function fetchCommunityArrangement(id) {
  const res = await fetch(`${WORKER_URL}/community/arrangement/${id}`)
  if (res.status === 404) throw err('not_found')
  if (!res.ok) throw err('network_error')
  return res.json()
}

/** Fire-and-forget popularity counter. Never throws — the song is already imported. */
export async function recordCommunityImport(id) {
  try {
    await fetch(`${WORKER_URL}/community/arrangement/${id}/import`, { method: 'POST' })
  } catch {
    // ignored on purpose
  }
}

export async function reportCommunityArrangement(id, reason) {
  const res = await fetch(`${WORKER_URL}/community/arrangement/${id}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw err('report_failed')
}

export async function publishCollection({ collectionName, publisherName, songs, turnstileToken }) {
  const res = await fetch(`${WORKER_URL}/community/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Turnstile-Token': turnstileToken,
    },
    body: JSON.stringify({ collectionName, publisherName, songs }),
  })
  if (res.status === 429) throw err('rate_limited')
  if (!res.ok) throw err('publish_failed')
  return res.json()
}

export async function unpublishCollection(publicationId, publishToken) {
  const res = await fetch(`${WORKER_URL}/community/publication/${publicationId}`, {
    method: 'DELETE',
    headers: { 'X-Publish-Token': publishToken },
  })
  if (res.status === 403) throw err('invalid_token')
  if (!res.ok) throw err('unpublish_failed')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/communityImport/__tests__/communityClient.test.js`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/communityImport
git commit -m "feat: add community pool API client"
```

---

### Task 9: Community branch in fetchAndParseSong

The dispatch point that makes Community a real source. Note this is the **only** source that needs no scrape and no API key.

**Files:**
- Modify: `src/lib/ugImport/fetchSong.js`
- Test: `src/lib/communityImport/__tests__/fetchCommunitySong.test.js`

**Interfaces:**
- Consumes: `fetchCommunityArrangement` (Task 8), `parseContent` from `src/lib/parser/contentParser.js`.
- Produces: `fetchAndParseSong(result, apiKey)` returns, for `result.source === 'community'`, a song of the same shape every other source produces: `{ rawText, meta: { title, artist, keyIndex, capo, tempo, communitySource }, sections }`.

- [ ] **Step 1: Write the failing test**

`src/lib/communityImport/__tests__/fetchCommunitySong.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'

vi.mock('../communityClient', () => ({
  fetchCommunityArrangement: vi.fn(() => Promise.resolve({
    id: 'a1',
    title: 'Oceans',
    artist: 'Hillsong',
    keyIndex: 2,
    capo: 2,
    tempo: 70,
    body: '{c: Verse}\nYou call me [D]out upon the waters',
    collectionName: 'Judah',
    publisherName: 'Chris',
  })),
}))

import { fetchAndParseSong } from '../../ugImport/fetchSong'
import { fetchCommunityArrangement } from '../communityClient'

describe('fetchAndParseSong — community source', () => {
  it('fetches by arrangement id and parses the body into sections', async () => {
    const song = await fetchAndParseSong({ source: 'community', id: 'a1', url: 'community:a1' }, null)

    expect(fetchCommunityArrangement).toHaveBeenCalledWith('a1')
    expect(song.meta.title).toBe('Oceans')
    expect(song.meta.artist).toBe('Hillsong')
    expect(song.meta.keyIndex).toBe(2)
    expect(song.meta.capo).toBe(2)
    expect(song.sections.length).toBeGreaterThan(0)
  })

  it('needs no API key — community is the zero-config source', async () => {
    const song = await fetchAndParseSong({ source: 'community', id: 'a1' }, undefined)
    expect(song.meta.title).toBe('Oceans')
  })

  it('stamps provenance and NO sync keys, so the merge engine treats it as manually added', async () => {
    const song = await fetchAndParseSong({ source: 'community', id: 'a1' }, null)

    expect(song.meta.communitySource).toMatchObject({
      arrangementId: 'a1',
      publisherName: 'Chris',
    })
    expect(song.meta.communitySource.importedAt).toBeTruthy()
    expect(song.meta.sbpId).toBeUndefined()
    expect(song.meta.sharedBaseline).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/communityImport/__tests__/fetchCommunitySong.test.js`
Expected: FAIL — `fetchAndParseSong` tries to scrape and returns a UG parse.

- [ ] **Step 3: Add the branch**

`src/lib/ugImport/fetchSong.js` — rewrite the file:

```js
import { scrapeURL } from './firecrawlClient'
import { parseUGPage } from './ugParser'
import { parseDanielChoyPage } from '../danielchoyImport/danielchoyParser'
import { fetchCommunityArrangement } from '../communityImport/communityClient'
import { parseContent } from '../parser/contentParser'

// Fetch + parse a single search result into a Song object.
// `result` shape: { url, source: 'ug' | 'danielchoy' | 'community', rawHtml?, id? }
// Community results come straight from our own worker as structured JSON — no scrape, and
// no API key. Daniel Choy JSONP results carry rawHtml from the Blogger feed.
// Firecrawl (UG) results have no rawHtml and require a scrape (needs an API key).
export async function fetchAndParseSong(result, apiKey) {
  if (result.source === 'community') {
    const a = await fetchCommunityArrangement(result.id)
    return {
      rawText: a.body,
      meta: {
        title: a.title,
        artist: a.artist,
        keyIndex: a.keyIndex ?? 0,
        capo: a.capo ?? 0,
        tempo: a.tempo ?? undefined,
        // Provenance only. Deliberately no sbpId and no sharedBaseline: mergeSharedCollection
        // skips songs that have neither, which is what makes a community import a snapshot.
        communitySource: {
          arrangementId: a.id,
          publisherName: a.publisherName,
          importedAt: new Date().toISOString(),
        },
      },
      sections: parseContent(a.body),
    }
  }

  if (result.source === 'danielchoy') {
    const rawHtml = result.rawHtml || (await scrapeURL(result.url, apiKey)).rawHtml
    return parseDanielChoyPage(rawHtml, result)
  }

  const scraped = await scrapeURL(result.url, apiKey)
  return parseUGPage(scraped, result.url)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/communityImport/__tests__/fetchCommunitySong.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ugImport/fetchSong.js src/lib/communityImport/__tests__/fetchCommunitySong.test.js
git commit -m "feat: parse community arrangements in fetchAndParseSong"
```

---

### Task 10: Community as a third source in the search modal

The heart of the feature — and almost entirely edits to existing seams.

**Files:**
- Modify: `src/components/UGImport/UGSearchModal.jsx`
- Test: `src/components/UGImport/__tests__/UGSearchModal.community.test.jsx`

**Interfaces:**
- Consumes: `searchCommunity` (Task 8), `recordCommunityImport` (Task 8).
- Produces: community results rendered with a `CM` badge; imports bucketed via `addSongs([song], 'Community', 'community')`.

- [ ] **Step 1: Write the failing test**

`src/components/UGImport/__tests__/UGSearchModal.community.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReplaceSong = vi.fn()
const mockSelectSong = vi.fn()
const storeState = { index: [], replaceSong: mockReplaceSong, selectSong: mockSelectSong }
const mockAddSongs = vi.fn((songs, sourceLabel, sourceKey) => {
  songs.forEach((s, i) => storeState.index.push({
    id: `id-${storeState.index.length}-${i}`,
    title: s.meta.title,
    sourceLabel,
    sourceKey,
  }))
})
storeState.addSongs = mockAddSongs
const mockAddSongToCollection = vi.fn()
storeState.addSongToCollection = mockAddSongToCollection

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: Object.assign((s) => s(storeState), { getState: () => storeState }),
}))

// No Firecrawl key: this is the zero-config path, and Community must still work.
vi.mock('../../../lib/storage', () => ({ getFirecrawlKey: () => '' }))

const communitySong = {
  meta: {
    title: 'Oceans',
    artist: 'Hillsong',
    communitySource: { arrangementId: 'a1', publisherName: 'Chris', importedAt: 'now' },
  },
  sections: [{ label: 'Verse', lines: [{ type: 'lyric', content: 'la' }] }],
  rawText: 'la',
}

vi.mock('../../../lib/ugImport/firecrawlClient', () => ({
  searchUG: vi.fn(() => Promise.resolve([])),
  scrapeURL: vi.fn(),
}))
vi.mock('../../../lib/ugImport/ugParser', () => ({ parseUGPage: vi.fn() }))
vi.mock('../../../lib/danielchoyImport/danielchoyClient', () => ({
  searchDanielChoy: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../../../lib/danielchoyImport/danielchoyParser', () => ({ parseDanielChoyPage: vi.fn() }))
vi.mock('../../../lib/ugImport/fetchSong', () => ({
  fetchAndParseSong: vi.fn(() => Promise.resolve(communitySong)),
}))
vi.mock('../../../lib/communityImport/communityClient', () => ({
  searchCommunity: vi.fn(() => Promise.resolve([{
    id: 'a1',
    url: 'community:a1',
    source: 'community',
    title: 'Oceans',
    artist: 'Hillsong',
    description: 'Key D · capo 2 · from "Judah" · 5 imports',
  }])),
  recordCommunityImport: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../SongList/SongBody', () => ({
  SongBody: ({ sections }) => <div data-testid="songbody">{sections.length} sections</div>,
}))

import { searchCommunity, recordCommunityImport } from '../../../lib/communityImport/communityClient'
import { searchDanielChoy } from '../../../lib/danielchoyImport/danielchoyClient'
import { UGSearchModal } from '../UGSearchModal'

const noop = () => {}

function renderModal(props = {}) {
  return render(
    <UGSearchModal
      isOpen
      onClose={noop}
      onSongSelect={noop}
      onAddToast={noop}
      {...props}
    />,
  )
}

async function search(term = 'oceans') {
  fireEvent.change(screen.getByPlaceholderText(/song title or artist/i), { target: { value: term } })
  fireEvent.click(screen.getByRole('button', { name: /^search$/i }))
}

beforeEach(() => {
  storeState.index.length = 0
  vi.clearAllMocks()
})

describe('UGSearchModal — community source', () => {
  it('shows community results with a CM badge even with no Firecrawl key', async () => {
    renderModal()
    await search()

    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())
    expect(screen.getByText('CM')).toBeInTheDocument()
    expect(screen.getByText(/from "Judah"/)).toBeInTheDocument()
    expect(searchCommunity).toHaveBeenCalledWith('oceans')
  })

  it('still shows community results when Daniel Choy fails', async () => {
    searchDanielChoy.mockRejectedValueOnce(new Error('offline'))
    renderModal()
    await search()

    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())
  })

  it('still shows Daniel Choy results when community fails', async () => {
    searchCommunity.mockRejectedValueOnce(new Error('offline'))
    searchDanielChoy.mockResolvedValueOnce([
      { url: 'https://danielchoy.blogspot.com/2020/01/x.html', title: 'DC Song', artist: 'A' },
    ])
    renderModal()
    await search()

    await waitFor(() => expect(screen.getByText('DC Song')).toBeInTheDocument())
  })

  it('buckets a community import into the Community collection', async () => {
    renderModal()
    await search()
    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Oceans'))

    await waitFor(() => expect(mockAddSongs).toHaveBeenCalled())
    expect(mockAddSongs).toHaveBeenCalledWith([communitySong], 'Community', 'community')
  })

  it('bumps the import counter after a successful import', async () => {
    renderModal()
    await search()
    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Oceans'))

    await waitFor(() => expect(recordCommunityImport).toHaveBeenCalledWith('a1'))
  })

  it('adds the import to the collection it was launched from', async () => {
    renderModal({ collectionId: 'col-1' })
    await search()
    await waitFor(() => expect(screen.getByText('Oceans')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Oceans'))

    await waitFor(() => expect(mockAddSongToCollection).toHaveBeenCalledWith(expect.any(String), 'col-1'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/UGImport/__tests__/UGSearchModal.community.test.jsx`
Expected: FAIL — no `CM` badge; `searchCommunity` never called.

- [ ] **Step 3: Add the third source leg**

`src/components/UGImport/UGSearchModal.jsx` — add the import:

```jsx
import { searchCommunity, recordCommunityImport } from '../../lib/communityImport/communityClient'
```

Replace the body of `handleSearch` with a three-way fan-out. The "error only if *all* sources failed" contract must survive the third leg — Community is now the only source that always attempts, so a search only fails outright if Community fails too:

```jsx
  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    const apiKey = getFirecrawlKey()
    setStatus('searching')
    setError(null)
    try {
      const [cmOutcome, ugOutcome, dcOutcome] = await Promise.allSettled([
        searchCommunity(query.trim()),
        apiKey ? searchUG(query.trim(), apiKey) : Promise.resolve([]),
        searchDanielChoy(query.trim(), apiKey),
      ])
      const cmItems = cmOutcome.status === 'fulfilled' ? cmOutcome.value : []
      const ugItems = ugOutcome.status === 'fulfilled' ? ugOutcome.value : []
      const dcItems = dcOutcome.status === 'fulfilled' ? dcOutcome.value : []
      const combined = [
        // Community first: it is our own pool, it needs no API key, and its metadata is
        // richer (key, capo, import count) than a scraped web result.
        ...cmItems,
        ...ugItems.map(r => ({ ...r, source: 'ug' })),
        ...dcItems.map(r => ({ ...r, source: 'danielchoy' })),
      ]
      setResults(combined)
      setStatus('results')
      // Surface an error only when every source that was actually searched failed
      const cmFailed = cmOutcome.status === 'rejected'
      const ugFailed = ugOutcome.status === 'rejected'
      const dcFailed = dcOutcome.status === 'rejected'
      const ugSkipped = !apiKey  // UG not searched (no key)
      if (cmFailed && (ugFailed || ugSkipped) && dcFailed) {
        setStatus('idle')
        setError(errorMessage(cmOutcome.reason))
      }
    } catch (err) {
      setStatus('idle')
      setError(errorMessage(err))
    }
  }
```

- [ ] **Step 4: Route the import through the Community source label**

In `runImport`, replace the two source-label lines. Currently:

```jsx
    const sourceLabel = result.source === 'danielchoy' ? 'Daniel Choy' : 'Ultimate Guitar'
```

becomes:

```jsx
    const SOURCE_LABELS = { community: 'Community', danielchoy: 'Daniel Choy', ug: 'Ultimate Guitar' }
    const sourceKey = result.source ?? 'ug'
    const sourceLabel = SOURCE_LABELS[sourceKey] ?? 'Ultimate Guitar'
```

and delete the now-redundant line further down:

```jsx
    const sourceKey = result.source === 'danielchoy' ? 'danielchoy' : 'ug'
```

Then, immediately after the successful-import block (right after `if (newEntry) selectSong(newEntry.id)`), bump the counter:

```jsx
    // Fire-and-forget: the song is already in the library, so a failed counter must not surface.
    if (result.source === 'community') recordCommunityImport(result.id)
```

Add `recordCommunityImport` to the `runImport` dependency array.

- [ ] **Step 5: Add the CM badge**

In the results list, replace the `isDC` badge logic. Currently:

```jsx
                  const isDC = r.source === 'danielchoy'
```

becomes:

```jsx
                  const isDC = r.source === 'danielchoy'
                  const isCM = r.source === 'community'
                  const badge = isCM ? 'CM' : isDC ? 'DC' : 'UG'
                  const badgeClass = isCM
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                    : isDC
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                      : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'
```

and the badge `<span>` becomes:

```jsx
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${badgeClass}`}>
                            {badge}
                          </span>
```

and the artist line condition widens from `isDC && r.artist` to:

```jsx
                        {(isDC || isCM) && r.artist && (
                          <div className="text-xs text-gray-400 truncate mt-0.5">{r.artist}</div>
                        )}
```

- [ ] **Step 6: Update the no-API-key hint**

The hint currently implies search barely works without a key. It must now say the opposite — Community works out of the box:

```jsx
            {!apiKey && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Searching the <strong>Community</strong> pool and Daniel Choy. Add a Firecrawl API key in <strong>Settings</strong> to also search Ultimate Guitar.
              </p>
            )}
```

- [ ] **Step 7: Run the new tests and the pre-existing modal tests**

Run: `npx vitest run src/components/UGImport`
Expected: PASS — the 6 new community tests **and** the pre-existing `UGSearchModal.test.jsx` / `UGPreviewModal.test.jsx` suites.

- [ ] **Step 8: Commit**

```bash
git add src/components/UGImport/UGSearchModal.jsx src/components/UGImport/__tests__/UGSearchModal.community.test.jsx
git commit -m "feat: add Community as a third source in the song search modal"
```

---

### Task 11: Report link in the preview modal

Preview is the one place a user reads a community chart in full *before* taking it — exactly when they would notice a copyright problem or a broken transcription. Reporting must not require importing first.

**Files:**
- Modify: `src/components/UGImport/UGPreviewModal.jsx`
- Test: `src/components/UGImport/__tests__/UGPreviewModal.report.test.jsx`

**Interfaces:**
- Consumes: `reportCommunityArrangement(id, reason)` (Task 8).

- [ ] **Step 1: Write the failing test**

`src/components/UGImport/__tests__/UGPreviewModal.report.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeSong = {
  meta: { title: 'Oceans', artist: 'Hillsong' },
  sections: [{ label: 'Verse', lines: [{ type: 'lyric', content: 'la' }] }],
  rawText: 'la',
}

vi.mock('../../../lib/ugImport/fetchSong', () => ({
  fetchAndParseSong: vi.fn(() => Promise.resolve(fakeSong)),
}))
vi.mock('../../../lib/communityImport/communityClient', () => ({
  reportCommunityArrangement: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../SongList/SongBody', () => ({
  SongBody: ({ sections }) => <div data-testid="songbody">{sections.length} sections</div>,
}))

import { reportCommunityArrangement } from '../../../lib/communityImport/communityClient'
import { UGPreviewModal } from '../UGPreviewModal'

const communityResult = { source: 'community', id: 'a1', url: 'community:a1', title: 'Oceans' }
const ugResult = { source: 'ug', url: 'https://tabs.ultimate-guitar.com/tab/x', title: 'Oceans' }

beforeEach(() => vi.clearAllMocks())

describe('UGPreviewModal — report', () => {
  it('shows a Report link for a community result', async () => {
    render(<UGPreviewModal result={communityResult} apiKey={null} isOpen onClose={() => {}} onImported={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('songbody')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /report/i })).toBeInTheDocument()
  })

  it('does NOT show a Report link for a UG result', async () => {
    render(<UGPreviewModal result={ugResult} apiKey="KEY" isOpen onClose={() => {}} onImported={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('songbody')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /report/i })).not.toBeInTheDocument()
  })

  it('submits the chosen reason', async () => {
    render(<UGPreviewModal result={communityResult} apiKey={null} isOpen onClose={() => {}} onImported={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('songbody')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(screen.getByRole('button', { name: /copyright/i }))

    await waitFor(() => expect(reportCommunityArrangement).toHaveBeenCalledWith('a1', 'copyright'))
    expect(await screen.findByText(/thanks/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/UGImport/__tests__/UGPreviewModal.report.test.jsx`
Expected: FAIL — no Report button.

- [ ] **Step 3: Add the report UI**

`src/components/UGImport/UGPreviewModal.jsx` — add the imports:

```jsx
import { useState } from 'react'
import { reportCommunityArrangement } from '../../lib/communityImport/communityClient'
```

(`useState` may already be imported — merge, don't duplicate.)

Add state inside the component, next to the existing state:

```jsx
  const [reportOpen, setReportOpen] = useState(false)
  const [reported, setReported] = useState(false)

  const isCommunity = result?.source === 'community'

  async function submitReport(reason) {
    setReportOpen(false)
    setReported(true)
    try {
      await reportCommunityArrangement(result.id, reason)
    } catch {
      // Swallow: the user has done their part, and a failed report must not become their problem.
    }
  }
```

Render the footer at the bottom of the modal body, after the song preview and only for community results:

```jsx
        {isCommunity && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            {reported ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Thanks — we'll take a look.</p>
            ) : reportOpen ? (
              <div className="flex gap-2 flex-wrap items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">Report this chart:</span>
                <Button variant="ghost" className="text-xs" onClick={() => submitReport('copyright')}>Copyright</Button>
                <Button variant="ghost" className="text-xs" onClick={() => submitReport('inappropriate')}>Inappropriate</Button>
                <Button variant="ghost" className="text-xs" onClick={() => submitReport('wrong-or-broken')}>Wrong or broken</Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:underline"
              >
                Report
              </button>
            )}
          </div>
        )}
```

Ensure `Button` is imported from `'../UI/Button'` (it may already be).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/UGImport`
Expected: PASS — the report tests plus all pre-existing preview/search tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/UGImport/UGPreviewModal.jsx src/components/UGImport/__tests__/UGPreviewModal.report.test.jsx
git commit -m "feat: report community charts from the preview modal"
```

---

### Task 12: Publish opt-in on the Share modal

**Files:**
- Modify: `src/components/Share/ShareModal.jsx`
- Modify: `src/lib/exportSbp.js` (export `stripNoteTokens`)
- Modify: `src/lib/storage.js` (document the two new collection fields)
- Test: `src/test/ShareModal.publish.test.jsx`

**Interfaces:**
- Consumes: `publishCollection` (Task 8); the existing Turnstile token the modal already obtains for `uploadShare`; `useLibraryStore` collections/songs.
- Produces: on the collection record, `communityPublicationId: string` and `communityPublishToken: string`, persisted through the existing `saveCollections` path — mirroring how `conductorDirectorToken` is already stored.

- [ ] **Step 1: Read the current share flow**

Read `src/components/Share/ShareModal.jsx` around the `uploadShare` call (`~:114`) and note: the Turnstile token variable (`shareToken`), how `collection` and its songs are obtained, and how the store's collection-update action is called. The publish call must be inserted **after** `uploadShare` resolves.

- [ ] **Step 2: Write the failing test**

`src/test/ShareModal.publish.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/shareApi', () => ({
  uploadShare: vi.fn(() => Promise.resolve({
    shareCode: 'sc1', shareUrl: 'https://app/?share=sc1',
    expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
  })),
  updateShare: vi.fn(),
  checkShareVersion: vi.fn(),
  setShareLocked: vi.fn(),
}))
vi.mock('../lib/communityImport/communityClient', () => ({
  publishCollection: vi.fn(() => Promise.resolve({
    publicationId: 'p1', publishToken: 't1', published: 2, alreadyInPool: 0,
  })),
  unpublishCollection: vi.fn(() => Promise.resolve()),
}))
vi.mock('../hooks/useTurnstile', () => ({
  useTurnstile: () => ({ token: 'ts-token', widget: null, reset: () => {} }),
}))

import { publishCollection } from '../lib/communityImport/communityClient'
import { uploadShare } from '../lib/shareApi'

// NOTE: import ShareModal and set up the library store mock following the pattern in
// src/test/ShareModal.test.jsx — reuse its store mock and its renderModal helper verbatim.
import { ShareModal } from '../components/Share/ShareModal'

beforeEach(() => vi.clearAllMocks())

describe('ShareModal — community publish', () => {
  it('does not publish when the checkbox is left off', async () => {
    renderShareModal()
    fireEvent.click(screen.getByRole('button', { name: /create link/i }))

    await waitFor(() => expect(uploadShare).toHaveBeenCalled())
    expect(publishCollection).not.toHaveBeenCalled()
  })

  it('requires the copyright acknowledgement before it will publish', async () => {
    renderShareModal()
    fireEvent.click(screen.getByLabelText(/also list in community/i))
    // Acknowledgement unchecked → the create button is disabled
    expect(screen.getByRole('button', { name: /create link/i })).toBeDisabled()
  })

  it('publishes after the share upload succeeds, and stores the publish token', async () => {
    const { onCollectionUpdate } = renderShareModal()

    fireEvent.click(screen.getByLabelText(/also list in community/i))
    fireEvent.change(screen.getByPlaceholderText(/your name or church/i), { target: { value: 'Chris' } })
    fireEvent.click(screen.getByLabelText(/i have the right to share/i))
    fireEvent.click(screen.getByRole('button', { name: /create link/i }))

    await waitFor(() => expect(publishCollection).toHaveBeenCalled())

    const arg = publishCollection.mock.calls[0][0]
    expect(arg.publisherName).toBe('Chris')
    expect(arg.turnstileToken).toBe('ts-token')
    expect(arg.songs[0]).toHaveProperty('title')
    expect(arg.songs[0]).toHaveProperty('body')

    await waitFor(() => expect(onCollectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ communityPublicationId: 'p1', communityPublishToken: 't1' }),
    ))
  })

  it('strips {note:} tokens from published bodies', async () => {
    renderShareModal({ songs: [{ id: 's1', meta: { title: 'T', artist: 'A' }, rawText: 'a\n{note: private}\nb' }] })

    fireEvent.click(screen.getByLabelText(/also list in community/i))
    fireEvent.click(screen.getByLabelText(/i have the right to share/i))
    fireEvent.click(screen.getByRole('button', { name: /create link/i }))

    await waitFor(() => expect(publishCollection).toHaveBeenCalled())
    expect(publishCollection.mock.calls[0][0].songs[0].body).not.toContain('note:')
  })

  it('still returns a working share link when publishing fails', async () => {
    publishCollection.mockRejectedValueOnce(new Error('rate_limited'))
    renderShareModal()

    fireEvent.click(screen.getByLabelText(/also list in community/i))
    fireEvent.click(screen.getByLabelText(/i have the right to share/i))
    fireEvent.click(screen.getByRole('button', { name: /create link/i }))

    // The share link is the thing the user actually came for — it must survive.
    expect(await screen.findByText(/\?share=sc1/)).toBeInTheDocument()
    expect(await screen.findByText(/couldn't list.*community/i)).toBeInTheDocument()
  })
})
```

**Note for the implementer:** `renderShareModal` is a helper you must write at the top of this file, copying the store-mock and render setup from the existing `src/test/ShareModal.test.jsx`. It must accept an optional `{ songs }` override and return `{ onCollectionUpdate }` (the spy passed to whichever store action the modal uses to persist collection changes). Read `ShareModal.test.jsx` first and match it exactly — do not invent a second mocking style.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/ShareModal.publish.test.jsx`
Expected: FAIL — no "Also list in Community" checkbox.

- [ ] **Step 4: Export the note stripper**

`src/lib/exportSbp.js` — change the declaration so the community publisher can reuse it rather than duplicating the regex:

```js
export function stripNoteTokens(content) {
```

- [ ] **Step 5: Implement publish in the Share modal**

`src/components/Share/ShareModal.jsx`:

Imports:

```jsx
import { publishCollection } from '../../lib/communityImport/communityClient'
import { stripNoteTokens } from '../../lib/exportSbp'
```

State (next to `expiresInDays`):

```jsx
  const [listInCommunity, setListInCommunity] = useState(false)
  const [publisherName, setPublisherName] = useState('')
  const [copyrightAck, setCopyrightAck] = useState(false)
  const [publishError, setPublishError] = useState(null)
```

Build the payload from the collection's songs:

```jsx
  function buildCommunitySongs() {
    return songs.map(s => ({
      title: s.meta.title,
      artist: s.meta.artist ?? '',
      keyIndex: s.meta.keyIndex,
      capo: s.meta.capo,
      tempo: s.meta.tempo,
      timeSig: s.meta.timeSig,
      body: stripNoteTokens(s.rawText),
    }))
  }
```

(`songs` is the collection's songs — obtain them the same way the existing export/upload path does.)

In the share handler, **after** `uploadShare` resolves and its result has been applied:

```jsx
      if (listInCommunity) {
        try {
          const pub = await publishCollection({
            collectionName: collection.name,
            publisherName: publisherName.trim() || 'Anonymous',
            songs: buildCommunitySongs(),
            turnstileToken: shareToken,
          })
          onCollectionUpdate({
            ...collection,
            communityPublicationId: pub.publicationId,
            communityPublishToken: pub.publishToken,
          })
        } catch {
          // The share link already exists and is the thing the user came for. A failed
          // listing is reported, never thrown.
          setPublishError("Couldn't list this in the Community — the link still works.")
        }
      }
```

(Use whatever the modal's real collection-update action is; `onCollectionUpdate` above is a stand-in for it. Match the existing code.)

UI, rendered in the create-link form beneath the expiry selector and hidden in update mode:

```jsx
        {!isUpdateMode && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={listInCommunity}
                onChange={e => setListInCommunity(e.target.checked)}
              />
              Also list in Community
            </label>

            {listInCommunity && (
              <div className="mt-2 space-y-2 pl-6">
                <input
                  type="text"
                  value={publisherName}
                  onChange={e => setPublisherName(e.target.value)}
                  placeholder="Your name or church (optional)"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                />
                <label className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={copyrightAck}
                    onChange={e => setCopyrightAck(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I have the right to share these charts. Published songs are visible to other SongSheet users.
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {publishError && <p className="text-sm text-amber-600 dark:text-amber-400">{publishError}</p>}
```

Disable the create button until the acknowledgement is given:

```jsx
disabled={/* existing conditions */ || (listInCommunity && !copyrightAck)}
```

- [ ] **Step 6: Document the new collection fields**

`src/lib/storage.js` — extend the `loadCollections` doc comment's collection shape:

```js
 *   communityPublicationId?, communityPublishToken?,   ← set when listed in the Community pool
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/test/ShareModal.publish.test.jsx src/test/ShareModal.test.jsx`
Expected: PASS — new publish tests, and the pre-existing ShareModal suite still green.

- [ ] **Step 8: Commit**

```bash
git add src/components/Share/ShareModal.jsx src/lib/exportSbp.js src/lib/storage.js src/test/ShareModal.publish.test.jsx
git commit -m "feat: opt-in community publishing from the Share modal"
```

---

### Task 13: Unlist a published collection

**Files:**
- Modify: `src/components/Share/ShareModal.jsx`
- Test: `src/test/ShareModal.publish.test.jsx` (extend)

**Interfaces:**
- Consumes: `unpublishCollection(publicationId, publishToken)` (Task 8); `collection.communityPublicationId` / `communityPublishToken` (Task 12).

- [ ] **Step 1: Write the failing test**

Append to `src/test/ShareModal.publish.test.jsx`:

```jsx
import { unpublishCollection } from '../lib/communityImport/communityClient'

describe('ShareModal — unlist', () => {
  it('shows the listed state and unlists on click', async () => {
    const { onCollectionUpdate } = renderShareModal({
      collection: { id: 'c1', name: 'Judah', songIds: ['s1'], communityPublicationId: 'p1', communityPublishToken: 't1' },
    })

    expect(screen.getByText(/listed in community/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /unlist/i }))

    await waitFor(() => expect(unpublishCollection).toHaveBeenCalledWith('p1', 't1'))
    await waitFor(() => expect(onCollectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ communityPublicationId: undefined, communityPublishToken: undefined }),
    ))
  })

  it('does not show the community checkbox for an already-listed collection', () => {
    renderShareModal({
      collection: { id: 'c1', name: 'Judah', songIds: ['s1'], communityPublicationId: 'p1', communityPublishToken: 't1' },
    })
    expect(screen.queryByLabelText(/also list in community/i)).not.toBeInTheDocument()
  })
})
```

(Extend `renderShareModal` to accept a `collection` override.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/ShareModal.publish.test.jsx`
Expected: FAIL — no "Listed in Community" text.

- [ ] **Step 3: Implement**

`src/components/Share/ShareModal.jsx` — add the import:

```jsx
import { publishCollection, unpublishCollection } from '../../lib/communityImport/communityClient'
```

Add state and handler:

```jsx
  const [unlisting, setUnlisting] = useState(false)
  const isListed = !!collection?.communityPublicationId

  async function handleUnlist() {
    setUnlisting(true)
    setPublishError(null)
    try {
      await unpublishCollection(collection.communityPublicationId, collection.communityPublishToken)
      onCollectionUpdate({
        ...collection,
        communityPublicationId: undefined,
        communityPublishToken: undefined,
      })
    } catch {
      setPublishError("Couldn't unlist this — try again.")
    } finally {
      setUnlisting(false)
    }
  }
```

Render the listed banner, and gate the opt-in checkbox behind `!isListed` (change the wrapper condition from `{!isUpdateMode && (` to `{!isUpdateMode && !isListed && (`):

```jsx
        {isListed && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
            <p className="text-xs text-amber-800 dark:text-amber-300">✅ Listed in Community</p>
            <Button variant="ghost" className="text-xs" onClick={handleUnlist} disabled={unlisting}>
              {unlisting ? 'Unlisting…' : 'Unlist'}
            </Button>
          </div>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/ShareModal.publish.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Share/ShareModal.jsx src/test/ShareModal.publish.test.jsx
git commit -m "feat: unlist a collection from the Community pool"
```

---

### Task 14: Rename "Search UG" to "Search Songs"

The button opens a modal already titled "Search Songs", and with Community as the zero-config default source, advertising one of three sources — the one that needs an API key — is actively wrong.

**Files:**
- Modify: `src/components/Sidebar/Sidebar.jsx:455`
- Modify: `src/components/Collection/CollectionDetailView.jsx:329`

- [ ] **Step 1: Rename both call sites**

`src/components/Sidebar/Sidebar.jsx:455`:

```jsx
                <span className="text-[10px] font-medium">Search Songs</span>
```

`src/components/Collection/CollectionDetailView.jsx:329` — change the button text `Search UG` to `Search Songs`.

- [ ] **Step 2: Fix any test that asserts the old label**

Run: `npx vitest run` and update any test querying `/search ug/i` to `/search songs/i`.

- [ ] **Step 3: Run the full client suite**

Run: `npm test`
Expected: PASS — everything green.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar/Sidebar.jsx src/components/Collection/CollectionDetailView.jsx
git commit -m "refactor: rename Search UG to Search Songs"
```

---

### Task 15: Guard the snapshot invariant

The whole snapshot model rests on `mergeSharedCollection` ignoring community-imported songs. Nothing currently stops a future change to that function from silently starting to sync them into a sharer's edits. This test is the guard.

**Files:**
- Test: `src/test/mergeSharedCollection.community.test.js`

**Interfaces:**
- Consumes: `mergeSharedCollection` from `src/lib/mergeSharedCollection.js`; `meta.communitySource` (Task 9).

- [ ] **Step 1: Write the test**

`src/test/mergeSharedCollection.community.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { mergeSharedCollection } from '../lib/mergeSharedCollection'

// A community-imported song carries provenance but NO sbpId and NO sharedBaseline.
// mergeSharedCollection skips songs that have neither — that is precisely what makes a
// community import a snapshot rather than a live, publisher-maintained document.
const communitySong = {
  id: 'local-1',
  rawText: 'my edited chart',
  meta: {
    title: 'Oceans',
    artist: 'Hillsong',
    communitySource: { arrangementId: 'a1', publisherName: 'Chris', importedAt: '2026-07-13' },
  },
}

const sharedSong = {
  id: 'local-2',
  rawText: 'shared chart',
  meta: { title: 'Shared', artist: 'A', sbpId: 42, sharedBaseline: { title: 'Shared', artist: 'A', rawText: 'shared chart', keyIndex: 0, key: '', capo: 0, tempo: undefined } },
}

describe('mergeSharedCollection — community imports are snapshots', () => {
  it('never marks a community song as removed, even when the server ZIP omits it', () => {
    const result = mergeSharedCollection({}, [communitySong], [])
    expect(result.removed).toEqual([])
  })

  it('never auto-applies server edits onto a community song', () => {
    const result = mergeSharedCollection({}, [communitySong], [])
    expect(result.autoApplied).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it('still processes genuinely shared songs alongside a community song', () => {
    const serverSongs = [{
      id: 'srv',
      rawText: 'shared chart EDITED',
      meta: { title: 'Shared', artist: 'A', sbpId: 42, keyIndex: 0, key: '', capo: 0 },
    }]

    const result = mergeSharedCollection({}, [communitySong, sharedSong], serverSongs)

    // The community song is untouched...
    expect(result.removed).toEqual([])
    // ...while the shared song still gets its server update.
    expect(result.autoApplied).toHaveLength(1)
    expect(result.autoApplied[0].localId).toBe('local-2')
    expect(result.autoApplied[0].rawText).toBe('shared chart EDITED')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/test/mergeSharedCollection.community.test.js`
Expected: PASS immediately — this documents and locks in existing behaviour (`mergeSharedCollection.js:42` skips songs with no `sbpId` and no `sharedBaseline`). If it *fails*, the snapshot model is broken and Task 9's metadata is wrong — fix that before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/test/mergeSharedCollection.community.test.js
git commit -m "test: lock in snapshot semantics for community imports"
```

---

### Task 16: Admin reports view

A takedown path only works if someone can see the reports and act on them. Without this, `reports` rows accumulate where nobody looks.

**Files:**
- Modify: `admin/server.js`
- Modify: `admin/index.html`
- Modify: `admin/lib.js`
- Test: `admin/lib.test.js`

**Interfaces:**
- Consumes: the worker's D1 database via `wrangler d1 execute`, or a new admin-authenticated worker endpoint — **read `admin/README.md` and `admin/server.js` first and follow whichever pattern the admin app already uses to reach worker data.** Do not invent a third mechanism.

- [ ] **Step 1: Read the existing admin app**

Read `admin/README.md`, `admin/server.js`, and `admin/lib.js`. Identify how it currently authenticates and how it reads worker-side data. The reports view must use the same mechanism.

- [ ] **Step 2: Write the failing test**

`admin/lib.test.js` — append, matching the file's existing test style:

```js
describe('formatReport', () => {
  it('renders a report row with song title and reason', () => {
    const row = formatReport({
      id: 'r1', song_id: 's1', reason: 'copyright', created_at: 1752364800000, status: 'open',
      title: 'Oceans', artist: 'Hillsong',
    })
    expect(row).toContain('Oceans')
    expect(row).toContain('copyright')
    expect(row).toContain('open')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd admin && npm test`
Expected: FAIL — `formatReport` is not defined.

- [ ] **Step 4: Implement**

Add `formatReport` to `admin/lib.js` (export it in the same style as the file's other exports), add a `/reports` route to `admin/server.js` that queries open reports joined to their songs, and add a Reports section to `admin/index.html` with a **Remove arrangement** action that sets `songs.status = 'removed'` and deletes the `songs_fts` row (the same two writes Task 7 does on unpublish), plus a **Dismiss** action that sets `reports.status = 'dismissed'`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd admin && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin
git commit -m "feat(admin): add community reports review and takedown"
```

---

### Task 17: Deploy, seed, and verify end to end

The pool's value is entirely a function of what is in it. **An empty pool makes this feature invisible** — there is no browse surface, so a user searches, sees only UG and DC rows, and never learns Community exists. Seeding is a shipping requirement, not a follow-up.

**Files:** none (operational)

- [ ] **Step 1: Apply the migration to the real D1 database**

```bash
cd songbook-worker && npx wrangler d1 migrations apply songbook-community --remote
```

- [ ] **Step 2: Deploy the worker**

The worker has no CI — this is manual.

```bash
cd songbook-worker && npm run deploy
```

- [ ] **Step 3: Smoke-test the API against production**

```bash
# Expect: {"results":[]}
curl -s "https://<worker-host>/community/search?q=test"
```

- [ ] **Step 4: Seed the pool**

In the running app, open several of your own collections, use **Share → Also list in Community**, and publish them. Publish enough that a plausible first search (a common worship title your churches actually play) returns a `CM` row.

- [ ] **Step 5: Verify the end-to-end loop by hand**

1. Open **Search Songs** with **no Firecrawl API key configured**. Search a seeded title.
2. Confirm a `CM`-badged row appears with key/capo/collection/import-count in its subtitle.
3. Preview it — confirm the chart renders and a **Report** link is present.
4. Import it — confirm it lands in a **Community** collection, and that opening it from a collection's own **Search Songs** puts it in *that* collection.
5. Search the same title again — confirm the import count went up by one.
6. Open the published collection's Share modal — confirm **Listed in Community**, then **Unlist**, then search again and confirm the row is gone.

- [ ] **Step 6: Gate on the cold-start condition**

If step 5.1 does not surface a `CM` row for a plausible first search, **do not ship**. Publish more seed collections until it does. A search that never shows a Community row teaches users the source does not exist.

---

## Self-Review Notes

**Spec coverage:** every spec section maps to a task — data model (T1, T2), publish (T3, T4, T12), search (T5), arrangement fetch + import counter (T6), report + unpublish (T7), client (T8, T9), third source + badge + bucketing (T10), report UI (T11), unlist (T13), button rename (T14), snapshot invariant (T15), admin takedown (T16), copyright acknowledgement (T12 step 5), abuse limits (T4), cold start (T17).

**Deviations from the spec, deliberate:**
- The spec's `songs` table had no publisher/collection columns; search and arrangement fetch derive them with a correlated subquery over `song_publications` → `publications` (earliest live publication wins) rather than denormalizing. Keeps the schema as specced.
- `publish_token_hash` stores `salt:hash` in one column, reusing `pin.ts`'s `generateSalt`/`hashPin` rather than adding a `publish_token_salt` column.
- `POST /community/publish` returns **201**, not 200.

**Known risk:** Task 12 depends on `ShareModal.jsx` internals (the Turnstile token variable, the collection-update action, how the collection's songs are obtained) that this plan does not quote verbatim, because the file is large and the exact names must be read at implementation time. Step 1 of that task exists to force that read before any edit.
