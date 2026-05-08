import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

describe('POST /share/upload', () => {
  it('returns 403 when X-Turnstile-Token header is missing', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', 'Origin': ORIGIN },
      body: new ArrayBuffer(1),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });

  it('uploads a share and returns shareCode, shareUrl, expiresAt', async () => {
    const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // ZIP magic bytes
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Origin': ORIGIN,
        'X-Turnstile-Token': 'test-token',
      },
      body: data,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { shareCode: string; shareUrl: string; expiresAt: string };
    expect(body.shareCode).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.shareUrl).toContain('?share=');
    expect(body.expiresAt).toBeDefined();
  });

  it('returns 400 when body is empty', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Origin': ORIGIN,
        'X-Turnstile-Token': 'test-token',
      },
      body: new ArrayBuffer(0),
    });
    expect(res.status).toBe(400);
  });

  it('returns 413 when body exceeds 10 MB', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Origin': ORIGIN,
        'X-Turnstile-Token': 'test-token',
      },
      body: new Uint8Array(10 * 1024 * 1024 + 1),
    });
    expect(res.status).toBe(413);
  });
});

describe('GET /share/:code', () => {
  it('returns 404 for a non-existent share code', async () => {
    const res = await SELF.fetch('http://localhost/share/does-not-exist', {
      headers: { 'Origin': ORIGIN },
    });
    expect(res.status).toBe(404);
  });
});
