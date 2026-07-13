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
