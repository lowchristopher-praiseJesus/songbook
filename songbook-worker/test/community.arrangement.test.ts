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
