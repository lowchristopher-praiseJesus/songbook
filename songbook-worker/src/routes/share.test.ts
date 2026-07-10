import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

async function createShare(headers: Record<string, string> = {}) {
  const res = await SELF.fetch('http://localhost/share/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      Origin: ORIGIN,
      'X-Turnstile-Token': 'test-token',
      ...headers,
    },
    body: new Uint8Array([1, 2, 3]),
  });
  return (await res.json()) as { shareCode: string; shareUrl: string; expiresAt: string };
}

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

describe('PATCH /share/:code/lock', () => {
  it('locks a share and PUT is then rejected with 423', async () => {
    const { shareCode } = await createShare();

    const lockRes = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });
    expect(lockRes.status).toBe(200);
    expect(await lockRes.json()).toEqual({ locked: true });

    const putRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip', Origin: ORIGIN },
      body: new Uint8Array([4, 5, 6]),
    });
    expect(putRes.status).toBe(423);
    expect(await putRes.json()).toEqual({ error: 'locked' });
  });

  it('unlocks a share and PUT succeeds again', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: false }),
    });

    const putRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip', Origin: ORIGIN },
      body: new Uint8Array([4, 5, 6]),
    });
    expect(putRes.status).toBe(200);
  });

  it('returns 404 for a non-existent share code', async () => {
    const res = await SELF.fetch('http://localhost/share/does-not-exist/lock', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when the body is missing a boolean locked field', async () => {
    const { shareCode } = await createShare();
    const res = await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('preserves the stored blob content after a lock toggle', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });

    const getRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      headers: { Origin: ORIGIN },
    });
    const buf = new Uint8Array(await getRes.arrayBuffer());
    expect(buf).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('HEAD/GET /share/:code — X-Share-Locked header', () => {
  it('HEAD exposes X-Share-Locked: false by default', async () => {
    const { shareCode } = await createShare();
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(res.headers.get('X-Share-Locked')).toBe('false');
  });

  it('HEAD exposes X-Share-Locked: true after locking', async () => {
    const { shareCode } = await createShare();
    await SELF.fetch(`http://localhost/share/${shareCode}/lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ locked: true }),
    });
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(res.headers.get('X-Share-Locked')).toBe('true');
  });

  it('GET exposes X-Share-Locked and Access-Control-Expose-Headers includes it', async () => {
    const { shareCode } = await createShare();
    const res = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      headers: { Origin: ORIGIN },
    });
    const exposeHeaders = res.headers.get('Access-Control-Expose-Headers') ?? '';
    const locked = res.headers.get('X-Share-Locked');
    await res.arrayBuffer();
    expect(locked).toBe('false');
    expect(exposeHeaders).toContain('X-Share-Locked');
  });
});

describe('POST /share/upload — X-Locked header', () => {
  it('creates a pre-locked share when X-Locked: true is sent', async () => {
    const { shareCode } = await createShare({ 'X-Locked': 'true' });
    const headRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(headRes.headers.get('X-Share-Locked')).toBe('true');
  });

  it('defaults to unlocked when X-Locked is omitted', async () => {
    const { shareCode } = await createShare();
    const headRes = await SELF.fetch(`http://localhost/share/${shareCode}`, {
      method: 'HEAD',
      headers: { Origin: ORIGIN },
    });
    expect(headRes.headers.get('X-Share-Locked')).toBe('false');
  });
});
