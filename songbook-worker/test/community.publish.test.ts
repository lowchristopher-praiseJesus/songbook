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
});
