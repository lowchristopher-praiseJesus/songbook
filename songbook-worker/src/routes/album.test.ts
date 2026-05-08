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

describe('POST /album/:code/cover', () => {
  it('accepts a cover image and returns ok', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const res = await SELF.fetch(`${BASE}/album/${albumCode}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Creator-Token': creatorToken },
      body: imageBytes,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('sets hasCover:true on the album metadata', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff]); // JPEG magic bytes
    await SELF.fetch(`${BASE}/album/${albumCode}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'X-Creator-Token': creatorToken },
      body: imageBytes,
    });
    const meta = await (await SELF.fetch(`${BASE}/album/${albumCode}`)).json() as { hasCover: boolean; coverExt: string };
    expect(meta.hasCover).toBe(true);
    expect(meta.coverExt).toBe('jpg');
  });

  it('returns 403 with wrong token', async () => {
    const { albumCode } = await createAlbum();
    const res = await SELF.fetch(`${BASE}/album/${albumCode}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'X-Creator-Token': 'bad-token' },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 when body is empty', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    const res = await SELF.fetch(`${BASE}/album/${albumCode}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'X-Creator-Token': creatorToken },
      body: new Uint8Array([]),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /album/:code/cover — size guard', () => {
  it('returns 413 when cover body exceeds 5 MB', async () => {
    const { albumCode, creatorToken } = await createAlbum();
    const res = await SELF.fetch(`${BASE}/album/${albumCode}/cover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
        'X-Creator-Token': creatorToken,
      },
      body: new Uint8Array(5 * 1024 * 1024 + 1),
    });
    expect(res.status).toBe(413);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('cover_too_large');
  });
});

describe('POST /album — cover size guard', () => {
  it('returns 413 when cover blob exceeds 5 MB during album creation', async () => {
    const form = new FormData();
    form.append('meta', JSON.stringify({ title: 'T', artist: '', tracks: [] }));
    const bigCover = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' });
    form.append('cover', bigCover, 'cover.jpg');

    const res = await SELF.fetch(`${BASE}/album`, { method: 'POST', body: form });
    expect(res.status).toBe(413);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('cover_too_large');
  });
});
