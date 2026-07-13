import { Hono } from 'hono';
import type { Env } from '../types';
import { verifyTurnstile } from '../middleware/turnstile';
import { rateLimit } from '../middleware/rateLimit';
import { generateSalt, hashPin } from '../lib/pin';
import { groupKey, contentHash, stripChords, stripNotes, toFtsQuery } from '../lib/songIdentity';

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

community.post('/publish', verifyTurnstile, rateLimit({ prefix: 'cpub', limit: 5, windowSeconds: 3600 }), async (c) => {
  // Read raw body to enforce 10MB size cap before parsing JSON.
  const rawBody = await c.req.arrayBuffer();
  if (rawBody.byteLength > 10 * 1024 * 1024) return c.json({ error: 'too_large' }, 413);

  let payload: { collectionName?: unknown; publisherName?: unknown; songs?: unknown };
  try {
    // Parse the ArrayBuffer as text then JSON.
    const text = new TextDecoder().decode(rawBody);
    payload = JSON.parse(text);
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

  // NOTE: this request as a whole is NOT atomic across songs — if a later song in this loop
  // throws, earlier songs in this same publish request are already durably committed and the
  // request still returns an error. This is an accepted tradeoff: D1's `.batch()` API doesn't
  // support the read-then-conditionally-write pattern this route needs across multiple songs,
  // and redesigning that is out of scope for this fix. A caller that gets an error is safe to
  // retry — already-published songs will be picked up via the content-hash dedup path below
  // rather than duplicated.
  for (const s of songs) {
    const title = str(s.title);
    const artist = str(s.artist);
    const body = stripNotes(String(s.body));
    const hash = await contentHash(title, artist, body);

    const existing = await c.env.DB.prepare('SELECT id FROM songs WHERE content_hash = ?')
      .bind(hash).first<{ id: string }>();

    let songId: string;
    let isNew = false;

    if (existing) {
      songId = existing.id;
    } else {
      const newId = crypto.randomUUID();
      try {
        // publisher_name / collection_name are written ONLY here, on first publish. A later
        // duplicate publish links a new publication row but must never rewrite the credit on
        // an existing arrangement — first publisher wins.
        //
        // The songs insert and its songs_fts companion are batched together so they commit or
        // fail as one unit — a song row can never exist without a matching search index row.
        await c.env.DB.batch([
          c.env.DB.prepare(
            `INSERT INTO songs (id, content_hash, group_key, title, artist, key_index, capo, tempo, time_sig, body, publisher_name, collection_name, first_published_at, import_count, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'live')`
          ).bind(
            newId, hash, groupKey(title, artist), title, artist,
            num(s.keyIndex), num(s.capo), num(s.tempo), str(s.timeSig) || null,
            body, publisherName, collectionName, now,
          ),
          c.env.DB.prepare(
            'INSERT INTO songs_fts (song_id, title, artist, lyrics_only) VALUES (?, ?, ?, ?)'
          ).bind(newId, title, artist, stripChords(body)),
        ]);
        songId = newId;
        isNew = true;
      } catch (err) {
        // A concurrent publish of this exact content won the race for content_hash (which is
        // UNIQUE) between our SELECT and INSERT. Re-select to pick up the winner's row and fall
        // through to the "existing" behavior below rather than 500ing.
        const winner = await c.env.DB.prepare('SELECT id FROM songs WHERE content_hash = ?')
          .bind(hash).first<{ id: string }>();
        if (!winner) throw err;
        songId = winner.id;
      }
    }

    if (isNew) {
      published++;
    } else {
      alreadyInPool++;
      // A previously removed arrangement republished by someone else comes back to life.
      await c.env.DB.prepare("UPDATE songs SET status = 'live' WHERE id = ?").bind(songId).run();
    }

    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO song_publications (song_id, publication_id) VALUES (?, ?)'
    ).bind(songId, publicationId).run();
  }

  return c.json({ publicationId, publishToken, published, alreadyInPool }, 201);
});

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
  // publisher_name / collection_name are read straight off the songs row: D1 bills rows
  // *scanned*, so deriving them per hit via song_publications would multiply the read cost
  // of every search by roughly 5-10x for no user-visible gain.
  const sql = `
    WITH hits AS (
      SELECT
        s.id, s.group_key, s.title, s.artist, s.key_index, s.capo, s.tempo, s.import_count,
        s.publisher_name, s.collection_name,
        bm25(songs_fts) AS rank
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

interface ArrangementRow extends SearchRow {
  time_sig: string | null;
  body: string;
}

community.get('/arrangement/:id', async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT id, title, artist, key_index, capo, tempo, time_sig, body,
           publisher_name, collection_name, import_count
    FROM songs
    WHERE id = ? AND status = 'live'
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
  try {
    await c.env.DB.prepare(
      "UPDATE songs SET import_count = import_count + 1 WHERE id = ? AND status = 'live'"
    ).bind(c.req.param('id')).run();
  } catch {
    // Suppress DB errors; a counter bump failure must never interrupt an import.
  }
  return c.json({ ok: true });
});

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

export default community;
