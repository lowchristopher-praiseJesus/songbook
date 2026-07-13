import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { contentHash, stripNotes } from '../src/lib/songIdentity';

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

  it('denormalizes the publisher and collection onto the song row', async () => {
    await publish({ collectionName: 'Judah 15Apr26', publisherName: 'Chris', songs: [song({ title: 'Credited' })] });
    const row = await env.DB.prepare('SELECT publisher_name, collection_name FROM songs WHERE title = ?')
      .bind('Credited').first();
    expect(row).toMatchObject({ publisher_name: 'Chris', collection_name: 'Judah 15Apr26' });
  });

  it('defaults an omitted publisher name to Anonymous', async () => {
    await publish({ collectionName: 'C', songs: [song({ title: 'Anon' })] });
    const row = await env.DB.prepare('SELECT publisher_name FROM songs WHERE title = ?')
      .bind('Anon').first<{ publisher_name: string }>();
    expect(row!.publisher_name).toBe('Anonymous');
  });

  it('collapses an exact duplicate instead of creating a second song row', async () => {
    await publish({ collectionName: 'A', publisherName: 'First', songs: [song({ title: 'Dup' })] });
    const res = await publish({ collectionName: 'B', publisherName: 'Second', songs: [song({ title: 'Dup' })] });
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

  it('first publisher wins — a duplicate publish must not steal the credit', async () => {
    await publish({ collectionName: 'Original Set', publisherName: 'First', songs: [song({ title: 'Credit' })] });
    await publish({ collectionName: 'Copycat Set', publisherName: 'Second', songs: [song({ title: 'Credit' })] });

    const row = await env.DB.prepare('SELECT publisher_name, collection_name FROM songs WHERE title = ?')
      .bind('Credit').first();
    expect(row).toMatchObject({ publisher_name: 'First', collection_name: 'Original Set' });
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

  // This does NOT exercise the content_hash-collision try/catch fallback in the route (that
  // branch only runs when the route's own INSERT throws). Pre-inserting the row and fully
  // awaiting it before calling publish() means the route's ordinary top-of-loop SELECT finds
  // the row directly and takes the `if (existing)` branch. What this test does verify — and
  // what isn't covered elsewhere — is that a previously 'removed' song found via that ordinary
  // duplicate path gets revived to 'live'.
  it('revives a previously removed song found via the ordinary duplicate SELECT path', async () => {
    const s = song({ title: 'Removed Song Revival' });
    const title = s.title as string;
    const artist = s.artist as string;
    const body = stripNotes(String(s.body));
    const hash = await contentHash(title, artist, body);

    // A pre-existing row with this exact content_hash, previously taken down ('removed').
    await env.DB.prepare(
      `INSERT INTO songs (id, content_hash, group_key, title, artist, body, first_published_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'removed')`
    ).bind('preexisting-song-id', hash, `${title.toLowerCase()}|${artist.toLowerCase()}`, title, artist, body, Date.now()).run();

    const res = await publish({ collectionName: 'C', songs: [s] });
    expect(res.status).toBe(201);
    const resBody = await res.json() as { published: number; alreadyInPool: number };
    expect(resBody.published).toBe(0);
    expect(resBody.alreadyInPool).toBe(1);

    // No duplicate row was created — the pre-existing row is the only one, and it's been
    // revived to 'live'.
    const { results } = await env.DB.prepare('SELECT id, status FROM songs WHERE content_hash = ?')
      .bind(hash).all();
    expect(results.length).toBe(1);
    expect((results[0] as { id: string; status: string }).id).toBe('preexisting-song-id');
    expect((results[0] as { id: string; status: string }).status).toBe('live');

    // It's still linked to this publication despite not being "published" by this request.
    const link = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM song_publications WHERE song_id = ?'
    ).bind('preexisting-song-id').first<{ n: number }>();
    expect(link!.n).toBe(1);
  });

  // Genuine concurrency test for the content_hash-collision try/catch fallback in the route
  // (src/routes/community.ts, new-song branch): fire two REAL concurrent SELF.fetch() requests
  // at /community/publish, both publishing identical brand-new content that neither call has
  // ever published before. Cloudflare Workers run single-threaded with cooperative scheduling
  // at `await` boundaries, so two requests issued together via Promise.all genuinely interleave
  // — both requests' initial `SELECT id FROM songs WHERE content_hash = ?` can run (and find
  // nothing) before either request's `songs` INSERT commits. Whichever request's INSERT commits
  // second then collides with the content_hash UNIQUE constraint the first request just
  // satisfied, and must take the route's catch-and-re-SELECT fallback instead of 500ing.
  //
  // We assert only the externally-observable safety properties, not which internal branch ran
  // (that's non-deterministic and depends on runtime scheduling we don't control from the test).
  it('resolves two truly concurrent first-time publishes of identical content without either 500ing or duplicating the song', async () => {
    const s = song({ title: 'Concurrent Race Song', artist: 'Race Artist', body: 'The [G]lyrics of a [C]race' });
    const title = s.title as string;
    const artist = s.artist as string;
    const body = stripNotes(String(s.body));
    const hash = await contentHash(title, artist, body);

    // Sanity check: nothing published yet for this content_hash.
    const before = await env.DB.prepare('SELECT id FROM songs WHERE content_hash = ?').bind(hash).first();
    expect(before).toBeNull();

    const [res1, res2] = await Promise.all([
      publish({ collectionName: 'Racer A', publisherName: 'Alice', songs: [s] }),
      publish({ collectionName: 'Racer B', publisherName: 'Bob', songs: [s] }),
    ]);

    // 1. Neither response is a 500 / non-2xx — both must return 201.
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const body1 = await res1.json() as { publicationId: string; published: number; alreadyInPool: number };
    const body2 = await res2.json() as { publicationId: string; published: number; alreadyInPool: number };

    // 2. Exactly one songs row exists for this content_hash — no duplicate row, and the UNIQUE
    // constraint violation never surfaced to either caller.
    const { results: songRows } = await env.DB.prepare('SELECT id FROM songs WHERE content_hash = ?')
      .bind(hash).all();
    expect(songRows.length).toBe(1);
    const songId = (songRows[0] as { id: string }).id;

    // 3. Exactly one winner across the two responses: one published it, the other found it
    // already in the pool. Order between the two calls is not guaranteed, so assert on the
    // combined/sorted outcome rather than which specific call won.
    const outcomes = [body1, body2]
      .map((b) => `${b.published}-${b.alreadyInPool}`)
      .sort();
    expect(outcomes).toEqual(['0-1', '1-0']);
    expect(body1.published + body2.published).toBe(1);
    expect(body1.alreadyInPool + body2.alreadyInPool).toBe(1);

    // 4. Both responses link to the same song via song_publications — two rows (one per
    // publication), both pointing at the same song_id.
    const { results: linkRows } = await env.DB.prepare(
      'SELECT publication_id FROM song_publications WHERE song_id = ?'
    ).bind(songId).all();
    expect(linkRows.length).toBe(2);
    const linkedPublicationIds = new Set(linkRows.map((r) => (r as { publication_id: string }).publication_id));
    expect(linkedPublicationIds).toEqual(new Set([body1.publicationId, body2.publicationId]));
  });
});
