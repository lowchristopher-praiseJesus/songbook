import { describe, it, expect, beforeAll } from 'vitest';
import { SELF, env } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';
let publicationId: string;
let song1Id: string;

beforeAll(async () => {
  const res = await SELF.fetch('http://localhost/community/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token', 'CF-Connecting-IP': '203.0.113.70' },
    body: JSON.stringify({
      collectionName: 'Judah 15Apr26',
      publisherName: 'Chris',
      songs: [
        { title: 'Yeshua', artist: 'Jesus Image', keyIndex: 7, capo: 2, tempo: 72, body: 'You are [G]holy' },
        { title: 'Oceans', artist: 'Hillsong', keyIndex: 2, capo: 0, body: 'You call me [D]out' },
      ],
    }),
  });
  const body = await res.json() as { publicationId: string };
  publicationId = body.publicationId;
  const row = await env.DB.prepare('SELECT id FROM songs WHERE title = ?').bind('Yeshua').first<{ id: string }>();
  song1Id = row!.id;
});

describe('GET /community/collections/:id', () => {
  it('returns the collection metadata and every live song with its full body', async () => {
    const res = await SELF.fetch(`http://localhost/community/collections/${publicationId}`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string, collectionName: string, publisherName: string, songs: Array<Record<string, unknown>> };
    expect(body).toMatchObject({ id: publicationId, collectionName: 'Judah 15Apr26', publisherName: 'Chris' });
    expect(body.songs.length).toBe(2);
    // Ordered by title
    expect(body.songs.map(s => s.title)).toEqual(['Oceans', 'Yeshua']);
    expect(body.songs.find(s => s.title === 'Yeshua')).toMatchObject({
      artist: 'Jesus Image', keyIndex: 7, capo: 2, tempo: 72, body: 'You are [G]holy',
    });
  });

  it('returns 404 for an unknown id', async () => {
    const res = await SELF.fetch('http://localhost/community/collections/nope', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(404);
  });

  it('returns 404 once every song in the collection has been individually removed', async () => {
    await env.DB.prepare("UPDATE songs SET status = 'removed' WHERE id = ?").bind(song1Id).run();
    await env.DB.prepare("UPDATE songs SET status = 'removed' WHERE title = ?").bind('Oceans').run();

    const res = await SELF.fetch(`http://localhost/community/collections/${publicationId}`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(404);

    await env.DB.prepare("UPDATE songs SET status = 'live' WHERE id = ?").bind(song1Id).run();
    await env.DB.prepare("UPDATE songs SET status = 'live' WHERE title = ?").bind('Oceans').run();
  });
});
