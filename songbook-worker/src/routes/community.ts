import { Hono } from 'hono';
import type { Env } from '../types';
import { verifyTurnstile } from '../middleware/turnstile';
import { rateLimit } from '../middleware/rateLimit';
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

community.post('/publish', verifyTurnstile, rateLimit({ prefix: 'cpub', limit: 5, windowSeconds: 3600 }), async (c) => {
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

export default community;
