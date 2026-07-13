# Community Song Pool — Design

**Date:** 2026-07-13
**Status:** Approved, ready for implementation planning

## Problem

Songs live in one user's browser. When a worship team shares a collection via link, the
songs inside it are visible only to whoever holds the link, and only until the share
expires (1–30 days). There is no way for a user to discover a chart another team has
already built, and no way to pull a single song out of someone else's set into their own
collection.

We want a community pool: songs published by app users become searchable by other app
users, who can import any of them into their own collections.

## Constraints from the existing app

These are facts about the codebase that shape the design:

- **The worker never opens a share.** `POST /share/upload` (`songbook-worker/src/routes/share.ts`)
  writes the raw `.sbp` ZIP into R2 under a random UUID. The server has no idea what songs
  a share contains. The pool therefore cannot be built by indexing existing shares.
- **Shares expire in at most 30 days** (`share.ts:11`). Pool entries must be durable, so
  publishing must *copy* song data into the pool rather than reference a share blob.
- **There are no user accounts.** The only identity is the Conductor license key
  (`songsheet_conductor_license`), which most users do not have. Membership cannot mean
  "licensed".
- **`meta.sbpId` is not globally unique.** It comes from SongBook Pro and is unique only
  within one person's file. Cross-user song identity must be content-derived.
- **localStorage has a ~5MB ceiling** (`storage.js:106`). The pool index cannot be cached
  client-side; search must be server-side.
- **`mergeSharedCollection` keys on `meta.sbpId` + `meta.sharedBaseline`.** A song with
  neither is treated as manually added and is skipped by refresh. Imported pool songs must
  carry neither, so snapshot semantics fall out of the existing logic for free.
- **Songs are copyrighted worship music.** A publicly readable full-lyrics index is a
  materially different product, legally and morally, from a members-only pool.

## Decisions

| Question | Decision |
|---|---|
| Who can search/import | Any app user, no signup. Reachable only through the app API — never a public web page, never search-engine indexed. Turnstile + rate limits, as `/share/upload` already has. |
| How songs get in | Opt-in checkbox on the Share modal, **default off**. Sharing stays exactly what it is today. |
| Unit of discovery | **Songs**, with the published collection shown as context. |
| Duplicates | Exact duplicates collapse on content hash. Different arrangements of the same title+artist group under one heading ("4 arrangements"). No fuzzy clustering. |
| Storage & search | **Cloudflare D1 + FTS5**, in the existing worker. |
| After import | **Snapshot.** The imported song is yours; no update channel back to the publisher. Provenance is stamped for credit. |

Rejected: fully public index (copyright exposure, moderation obligation); real accounts
(turns a no-backend app into one holding user data); contributors-only reads (cold-start
killer); first-publisher-wins (silently discards other churches' arrangements, which are
often the actual value).

## Data model

Three derived keys carry the whole design:

- **`content_hash`** — SHA-256 over the normalized body (whitespace collapsed) plus title
  and artist. Byte-identical charts from two publishers produce the same hash; the second
  publish links to the existing song rather than creating a row. This is exact-duplicate
  collapse.
- **`group_key`** — normalized `title|artist`: lowercased, punctuation and trailing
  parentheticals (`(Live)`, `(Acoustic)`) stripped. This is what makes
  "How Great Is Our God — 4 arrangements" a `GROUP BY`. Same song, different key or chord
  voicing → different `content_hash`, same `group_key`.
- **`lyrics_only`** — the body with `[Chord]` tokens stripped, fed to FTS5 so a user can
  find a song from a half-remembered line. Chords in the index would be noise.

### Tables (D1)

```sql
CREATE TABLE publications (
  id                 TEXT PRIMARY KEY,   -- uuid
  collection_name    TEXT NOT NULL,
  publisher_name     TEXT NOT NULL,      -- self-declared, unverified; defaults to 'Anonymous'
  publish_token_hash TEXT NOT NULL,      -- unpublish secret (hashed, like pin.ts does)
  created_at         INTEGER NOT NULL,
  status             TEXT NOT NULL       -- 'live' | 'removed'
);

CREATE TABLE songs (
  id                 TEXT PRIMARY KEY,   -- uuid ("arrangement id")
  content_hash       TEXT NOT NULL UNIQUE,
  group_key          TEXT NOT NULL,
  title              TEXT NOT NULL,
  artist             TEXT NOT NULL,      -- required to publish
  key_index          INTEGER,
  capo               INTEGER,
  tempo              INTEGER,
  time_sig           TEXT,
  body               TEXT NOT NULL,      -- rawText, {note:} tokens stripped
  first_published_at INTEGER NOT NULL,
  import_count       INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL       -- 'live' | 'removed'
);
CREATE INDEX idx_songs_group_key ON songs(group_key);

CREATE TABLE song_publications (
  song_id        TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  PRIMARY KEY (song_id, publication_id)
);

-- Standalone (not external-content) FTS5: `lyrics_only` is derived at publish time and is
-- not a column on `songs`, and a standalone table needs no sync triggers. Rows are written
-- alongside the `songs` insert and deleted on unpublish.
CREATE VIRTUAL TABLE songs_fts USING fts5(
  song_id UNINDEXED,
  title,
  artist,
  lyrics_only
);

CREATE TABLE reports (
  id            TEXT PRIMARY KEY,
  song_id       TEXT NOT NULL,
  reason        TEXT NOT NULL,          -- 'copyright' | 'inappropriate' | 'wrong-or-broken'
  created_at    INTEGER NOT NULL,
  status        TEXT NOT NULL           -- 'open' | 'actioned' | 'dismissed'
);
```

### `{note:}` tokens are stripped on publish

`exportSbp.js` already has `stripNoteTokens`. Notes are where teams put private
operational chatter ("Sarah leads, watch the cue in v2"). That must not travel with a
published chart. Reuse the existing function.

### Publisher name is unverified

With no accounts there is nothing to verify. The field is a self-declared string,
optional, defaulting to "Anonymous". Being honest about this is better than implying an
identity guarantee that does not exist.

## Worker API

A new `/community/*` Hono route group in the existing worker, alongside `/share`,
`/session`, `/license`. Adds a D1 binding to `wrangler.toml`.

| Endpoint | Behaviour |
|---|---|
| `POST /community/publish` | Turnstile-protected, rate-limited. Body is **JSON**, not a ZIP: `{ collectionName, publisherName, songs: [{ title, artist, keyIndex, capo, tempo, body }] }`. Normalizes, hashes, upserts each song (existing `content_hash` → link and skip), writes the `publications` row. Returns `{ publicationId, publishToken, published, alreadyInPool }`. Sending JSON keeps the worker out of the ZIP-parsing business. |
| `GET /community/search?q=&offset=` | FTS5 `MATCH` on `songs_fts`, collapsed by `group_key`. Returns one entry per song with arrangement count, top arrangement's key/capo, total import count. **Empty `q` returns recently-published + popular**, so browse and search are the same endpoint. |
| `GET /community/song/:groupKey` | The arrangements under one song: key, capo, tempo, publisher, source collections, import count for each. |
| `GET /community/arrangement/:id` | Full body, for preview and import. |
| `POST /community/arrangement/:id/import` | Fire-and-forget `import_count` bump. Popularity is "how many people took this" — the only ranking signal available, and a good one. |
| `DELETE /community/publication/:id` | Requires `X-Publish-Token`. Unpublishes. Songs no longer referenced by any live publication are marked `removed`. |
| `POST /community/arrangement/:id/report` | Writes a `reports` row. |

Body size is capped as `/share/upload` caps today (10MB).

## Client

### Publish side

`ShareModal` gains a collapsed **"Also list in Community"** checkbox, default off. Checking
it reveals the publisher-name field and the copyright acknowledgement.

On share, if checked, `/community/publish` is called **after** the R2 upload succeeds — a
failed publish must never break the share link, which is what the user actually came for.

The returned `publishToken` and `publicationId` are stored on the collection record in
localStorage as `communityPublishToken` / `communityPublicationId`, mirroring how
`conductorDirectorToken` is already persisted (see the collection shape documented in
`storage.js:loadCollections`). When a collection has a live publication, the Share modal
shows "Listed in Community" with an **Unlist** button.

### Consume side

A new **Community** entry in the sidebar opens `CommunityPanel`: a search box over a
result list. Each row is a song — title, artist, "4 arrangements", import count. Expanding
a row shows the arrangements with publisher and key. Clicking an arrangement opens a
preview rendering the chart with the existing song renderer, with **Add to collection**
(a picker over the user's collections, plus "New collection…") and a quiet **Report** link.

Import calls the existing `libraryStore.addSongs()`, which already handles collection
assignment. The imported song carries:

```js
meta.communitySource = { arrangementId, publisherName, importedAt }
```

and deliberately carries **no `sbpId` baseline and no `shareCode`**, so
`mergeSharedCollection` treats it as manually added and never tries to sync it. Snapshot
semantics come free from the existing merge logic rather than needing a guard.

### New files

- `src/lib/communityApi.js`
- `src/components/Community/CommunityPanel.jsx`
- `src/components/Community/SongPreviewModal.jsx`
- `src/components/Community/AddToCollectionPicker.jsx`
- `songbook-worker/src/routes/community.ts`
- `songbook-worker/src/lib/songIdentity.ts` — hashing/normalizing, unit-testable in isolation
- `songbook-worker/migrations/0001_community.sql`

## Safety, moderation, copyright

**Copyright posture.** Most worship songs are copyrighted, and churches license them
through CCLI — which covers reproducing lyrics for their own congregation, not operating a
shared repository. Keeping the pool members-only and off the public web puts this in
roughly the same territory as a worship team emailing charts to each other: the norm, and
broadly tolerated. It is *not* legally airtight, and the design does not pretend
otherwise. Three controls keep the risk proportionate:

1. **The publish dialog states it plainly** — one line, not a wall of legalese: *"Only
   publish charts you have the right to share. Published songs are visible to other
   SongSheet users."* Plus an acknowledgement checkbox. The user's own judgment is the
   real control, so the moment where they exercise it must exist.
2. **`artist` is required to publish.** Attribution is good manners and the cheapest
   signal that a chart is not being laundered of its authorship.
3. **A takedown path that works.** Reports land in a `reports` table, surfaced in the
   existing `admin/` app, where an arrangement or a whole publication can be removed. A
   rights-holder complaint has somewhere to land and can be actioned in minutes — which is
   what matters most in practice.

**Abuse.** Publish is the write path and gets the protection: the existing
`verifyTurnstile` middleware is reused as-is, plus a KV-backed IP rate limit on the order
of a few publications per hour. Reads are unauthenticated but rate-limited. With no
accounts there is no user to ban — IP limits and after-the-fact admin removal are the
entire toolkit. That is an honest cost of the no-signup decision.

**Cold start.** An empty search box is a dead feature. The pool ships populated: seed it
with our own collections before launch, and make the default (empty-query) view "recently
published" so the panel always shows something.

## Testing

**Worker** (following `songbook-worker/test/` and `routes/*.test.ts` patterns):

- `songIdentity` unit tests: content hashing, `group_key` normalization (the `(Live)`
  stripping, whitespace collapse, chord-token removal). These are exactly the functions
  that break quietly.
- `community.ts` route tests against a D1 test binding: publish, exact-duplicate dedup,
  search + grouping, unpublish, report.

**Client** (following `src/test/*.test.jsx` patterns):

- `communityApi` mocked; `CommunityPanel` search results, expansion, and empty states.
- `ShareModal` publish checkbox: off by default, publish failure does not break the share.
- **The invariant test:** a community-imported song is *not* picked up by
  `mergeSharedCollection`. The snapshot model rests on this.

## Rollout

1. D1 migration.
2. Worker `/community` routes — deployable and testable with `curl` before any UI exists.
3. Publish side (ShareModal checkbox) — lets us seed the pool with real data.
4. Consume side (CommunityPanel) — built against a pool that already has songs in it.

Publish before consume matters: it means the search surface is built and demoed against
real content, not an empty table.

Note: the worker has **no CI**. Deployment is a manual `npm run deploy` in
`songbook-worker/`.
