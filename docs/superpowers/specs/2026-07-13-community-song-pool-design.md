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

The app already searches *external* song sources — Ultimate Guitar and Daniel Choy — through
one multi-source modal. The community pool is best understood as **a third source in that
same surface**: the app's own users become a place to find songs, alongside the web. That
framing is what makes this a small build rather than a new subsystem.

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
- **A multi-source song search already exists.** `UGSearchModal` is misnamed — it is titled
  *"Search Songs"*, fans out across Ultimate Guitar and Daniel Choy with `Promise.allSettled`,
  tags each result with a `source`, badges them, and dispatches fetch/parse on that `source`
  (`fetchSong.js:10`). The community pool is a **third source in this existing surface**, not
  a new one. Nearly all of the consume-side UI is code that already exists.

## Decisions

| Question | Decision |
|---|---|
| Who can search/import | Any app user, no signup. Reachable only through the app API — never a public web page, never search-engine indexed. Turnstile + rate limits, as `/share/upload` already has. |
| How songs get in | Opt-in checkbox on the Share modal, **default off**. Sharing stays exactly what it is today. |
| Unit of discovery | **Songs**, with the published collection shown as context. |
| Where discovery happens | **A third source in the existing multi-source search modal**, alongside Ultimate Guitar and Daniel Choy. Not a separate panel. |
| Duplicates | Exact duplicates collapse on content hash. Arrangements of the same title+artist stay separate rows, capped server-side at the **top 3 per song** by import count. No fuzzy clustering, no expandable groups. |
| Storage & search | **Cloudflare D1 + FTS5**, in the existing worker. |
| After import | **Snapshot.** The imported song is yours; no update channel back to the publisher. Provenance is stamped for credit. |

Rejected: fully public index (copyright exposure, moderation obligation); real accounts
(turns a no-backend app into one holding user data); contributors-only reads (cold-start
killer); first-publisher-wins (silently discards other churches' arrangements, which are
often the actual value); a dedicated Community browse panel (duplicates a search surface
that already exists, and splits "where do I find a song?" into two places).

## Data model

Three derived keys carry the whole design:

- **`content_hash`** — SHA-256 over the normalized body (whitespace collapsed) plus title
  and artist. Byte-identical charts from two publishers produce the same hash; the second
  publish links to the existing song rather than creating a row. This is exact-duplicate
  collapse.
- **`group_key`** — normalized `title|artist`: lowercased, punctuation and trailing
  parentheticals (`(Live)`, `(Acoustic)`) stripped. Same song, different key or chord
  voicing → different `content_hash`, same `group_key`. Its job is **flood control**: search
  returns only the top 3 arrangements per `group_key`, so twenty churches' versions of
  "How Great Is Our God" can't bury the UG and DC rows in a shared result list. It is a
  ranking constraint, not a UI grouping.
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
| `GET /community/search?q=` | FTS5 `MATCH` on `songs_fts`. Returns a **flat list of arrangements**, ranked by relevance then `import_count`, capped at the **top 3 arrangements per `group_key`** so one popular title can't flood the shared result list. Each item: `{ id, title, artist, keyIndex, capo, tempo, collectionName, publisherName, importCount }`. |
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

### Consume side — Community is a third search source, not a new panel

There is **no Community panel**. `UGSearchModal` is misnamed: it is already a multi-source
search modal titled *"Search Songs"* that fans out over Ultimate Guitar and Daniel Choy.
Community slots in as a third source, and almost all of the consume-side UI is therefore
code that already exists:

| Existing machinery | What Community needs |
|---|---|
| `handleSearch` fans out with `Promise.allSettled` and tags results `{ ...r, source }` (`UGSearchModal.jsx:49–58`) | A third leg calling `searchCommunity(query)` |
| Per-source badge `UG` / `DC` (`:235–241`) | A `CM` badge |
| `fetchAndParseSong(result, apiKey)` **dispatches on `result.source`** (`fetchSong.js:10`) | A third branch — fetch the arrangement body from the worker and parse it. **No scraping, no Firecrawl key.** |
| Import buckets per source: `addSongs([song], 'Daniel Choy', 'danielchoy')` (`:117–119`) | `addSongs([song], 'Community', 'community')` — auto-buckets into a "Community" collection like the other two |
| `collectionId` prop lands the import in the collection you searched from (`:102`, `:130`) | Nothing — works as-is |
| Duplicate resolution (Replace / Keep Both / Skip), matched on title (`:96–114`) | Nothing — works as-is |
| `UGPreviewModal` is source-agnostic; it only calls `fetchAndParseSong` | One conditional addition: a **Report** link, rendered only when `result.source === 'community'` (see below) |

**Community is the only source that works with no API key.** Today an unconfigured user
sees *"Add a Firecrawl API key in Settings to also search Ultimate Guitar"* and gets a
Daniel-Choy-only experience. After this, the app's own pool is the zero-config default
source and UG becomes the thing you unlock. That materially improves first run.

**Result shape.** The result list keys on `r.url` (`:217`). Community results carry a
synthetic `url: \`community:${id}\`` — a stable unique key that is never fetched, because
`fetchAndParseSong` branches on `source` before it ever looks at `url`. Rows subtitle as
`Key G · capo 2 · from "Judah 15Apr26" · 12 imports`.

**Provenance.** The imported song carries:

```js
meta.communitySource = { arrangementId, publisherName, importedAt }
```

and deliberately carries **no `sbpId` baseline and no `shareCode`**, so
`mergeSharedCollection` treats it as manually added and never tries to sync it. Snapshot
semantics come free from the existing merge logic rather than needing a guard.

After a successful import, fire-and-forget `POST /community/arrangement/:id/import` to bump
the popularity counter. A failure here must never surface to the user.

**Reporting.** Folding discovery into the shared search modal removed the panel that was
going to host the Report link, so it moves to `UGPreviewModal` — a quiet link in the footer,
rendered only when `result.source === 'community'`. Preview is the right home for it: it is
the one place a user reads a community chart in full *before* taking it, which is exactly
when they would notice a copyright problem or a broken transcription. Reporting must not
require importing first.

### Button rename

The sidebar button says **"Search UG"** but opens a modal already titled *"Search Songs"*.
With a third source — and with Community, not UG, as the zero-config default — the label is
actively wrong. Rename to **"Search Songs"** at both call sites: `Sidebar.jsx:455` and
`CollectionDetailView.jsx:329`.

### New files

- `src/lib/communityImport/communityClient.js` — `searchCommunity(query)` and
  `fetchCommunityArrangement(id)`, mirroring the structure of `danielchoyImport/danielchoyClient.js`
- `songbook-worker/src/routes/community.ts`
- `songbook-worker/src/lib/songIdentity.ts` — hashing/normalizing, unit-testable in isolation
- `songbook-worker/migrations/0001_community.sql`

Modified: `UGSearchModal.jsx` (third source leg, `CM` badge), `fetchSong.js` (third
dispatch branch), `ShareModal.jsx` (publish checkbox), `Sidebar.jsx` +
`CollectionDetailView.jsx` (button label).

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
3. **A takedown path that works.** The Report link in `UGPreviewModal` writes to a
   `reports` table, surfaced in the existing `admin/` app, where an arrangement or a whole
   publication can be removed. A rights-holder complaint has somewhere to land and can be
   actioned in minutes — which is what matters most in practice.

**Abuse.** Publish is the write path and gets the protection: the existing
`verifyTurnstile` middleware is reused as-is, plus a KV-backed IP rate limit on the order
of a few publications per hour. Reads are unauthenticated but rate-limited. With no
accounts there is no user to ban — IP limits and after-the-fact admin removal are the
entire toolkit. That is an honest cost of the no-signup decision.

**Cold start.** This is the biggest product risk and it got *worse* with the search-modal
reframe, so it needs stating plainly. There is no browse surface any more — the search
modal requires a query — so an empty pool is not merely uninviting, it is invisible: the
user searches, gets UG and DC rows, and never learns Community exists. Two mitigations,
both required:

1. **Seed the pool before launch** by publishing our own collections. Community must return
   real rows for common worship titles on day one.
2. **A `CM` row must be reachable for a plausible first search.** If seeding cannot produce
   that, the feature is not ready to ship, regardless of whether the code works.

## Testing

**Worker** (following `songbook-worker/test/` and `routes/*.test.ts` patterns):

- `songIdentity` unit tests: content hashing, `group_key` normalization (the `(Live)`
  stripping, whitespace collapse, chord-token removal). These are exactly the functions
  that break quietly.
- `community.ts` route tests against a D1 test binding: publish, exact-duplicate dedup,
  search, the **top-3-arrangements-per-`group_key` cap**, unpublish, report.

**Client** (following `src/test/*.test.jsx` patterns):

- `UGSearchModal` with `searchCommunity` mocked: `CM` results appear alongside `UG`/`DC`;
  **Community results still render when the Firecrawl key is absent** (the zero-config
  path, and the reason the source is worth having);
  **a failing Community search does not suppress UG/DC results**, and vice versa — the
  existing `Promise.allSettled` "error only if all sources failed" contract must survive a
  third leg.
- Import path: a `CM` result buckets into the "Community" collection, honours `collectionId`,
  and goes through duplicate resolution like any other source.
- `ShareModal` publish checkbox: off by default, publish failure does not break the share.
- **The invariant test:** a community-imported song is *not* picked up by
  `mergeSharedCollection`. The snapshot model rests on this.

## Rollout

1. D1 migration.
2. Worker `/community` routes — deployable and testable with `curl` before any UI exists.
3. Publish side (ShareModal checkbox) — lets us seed the pool with real data.
4. **Seed the pool** with our own collections.
5. Consume side (third source in `UGSearchModal`, `CM` badge, `fetchSong` branch, button
   rename) — built against a pool that already has songs in it.

Publish before consume matters: the search source is built and demoed against real content,
not an empty table. Seeding is a numbered step, not a launch afterthought, for the cold-start
reason above.

Note: the worker has **no CI**. Deployment is a manual `npm run deploy` in
`songbook-worker/`.
