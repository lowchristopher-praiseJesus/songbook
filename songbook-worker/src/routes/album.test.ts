import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const BASE = 'http://localhost';
const JSON_H = { 'Content-Type': 'application/json' };

async function createAlbum() {
  const form = new FormData();
  form.append('meta', JSON.stringify({
    title: 'Original Title',
    artist: 'Original Artist',
    tracks: [{ trackId: 'track-1', title: 'Song One', duration: 120000, mimeType: 'audio/webm' }],
  }));
  const res = await SELF.fetch(`${BASE}/album`, { method: 'POST', body: form });
  return res.json() as Promise<{ albumCode: string; creatorToken: string }>;
}

describe('PATCH /album/:code', () => {
  it('updates title and artist with valid creator token', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    const res = await SELF.fetch(`${BASE}/album/${albumCode}`, {
      method: 'PATCH',
      headers: { ...JSON_H, 'X-Creator-Token': creatorToken },
      body: JSON.stringify({ title: 'New Title', artist: 'New Artist', tracks: [] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns 403 with wrong creator token', async () => {
    const { albumCode } = await createAlbum();
    const res = await SELF.fetch(`${BASE}/album/${albumCode}`, {
      method: 'PATCH',
      headers: { ...JSON_H, 'X-Creator-Token': 'wrong-token' },
      body: JSON.stringify({ title: 'Hacked', artist: '', tracks: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent album', async () => {
    const res = await SELF.fetch(`${BASE}/album/does-not-exist`, {
      method: 'PATCH',
      headers: { ...JSON_H, 'X-Creator-Token': 'any' },
      body: JSON.stringify({ title: 'X', artist: '', tracks: [] }),
    });
    expect(res.status).toBe(404);
  });

  it('persists updated title in GET response', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    await SELF.fetch(`${BASE}/album/${albumCode}`, {
      method: 'PATCH',
      headers: { ...JSON_H, 'X-Creator-Token': creatorToken },
      body: JSON.stringify({ title: 'Persisted Title', artist: 'Band', tracks: [] }),
    });
    const get = await SELF.fetch(`${BASE}/album/${albumCode}`);
    const meta = await get.json() as { title: string; artist: string };
    expect(meta.title).toBe('Persisted Title');
    expect(meta.artist).toBe('Band');
  });
});
