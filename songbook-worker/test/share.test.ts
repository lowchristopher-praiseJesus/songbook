import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { putShare, getShareIfValid } from '../src/lib/r2';

const ORIGIN = 'http://localhost:5173';

describe('putShare', () => {
  it('writes blob to R2 with expiresAt metadata', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await putShare(env.R2_BUCKET, 'test-put', body, expiresAt);

    const obj = await env.R2_BUCKET.head('test-put');
    expect(obj).not.toBeNull();
    expect(obj?.customMetadata?.expiresAt).toBe(expiresAt.toISOString());
    expect(obj?.httpMetadata?.contentType).toBe('application/zip');
  });
});

describe('getShareIfValid', () => {
  it('returns object for a valid non-expired share', async () => {
    const body = new Uint8Array([10, 20, 30]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('valid-code', body, {
      customMetadata: { expiresAt: expiresAt.toISOString() },
    });

    const result = await getShareIfValid(env.R2_BUCKET, 'valid-code');
    expect('error' in result).toBe(false);
    // Consume the R2ObjectBody stream to avoid isolated-storage leak
    if (!('error' in result)) await result.object.arrayBuffer();
  });

  it('returns { error: "not_found" } for unknown key', async () => {
    const result = await getShareIfValid(env.R2_BUCKET, 'nonexistent');
    expect(result).toEqual({ error: 'not_found' });
  });

  it('returns { error: "expired" } when expiresAt is in the past', async () => {
    const past = new Date(Date.now() - 1000);
    await env.R2_BUCKET.put('expired-code', new Uint8Array([1]), {
      customMetadata: { expiresAt: past.toISOString() },
    });

    const result = await getShareIfValid(env.R2_BUCKET, 'expired-code');
    expect(result).toEqual({ error: 'expired' });
  });
});

describe('POST /share/upload', () => {
  it('stores blob and returns shareCode, shareUrl, expiresAt', async () => {
    const res = await SELF.fetch('http://example.com/share/upload', {
      method: 'POST',
      body: new Uint8Array([1, 2, 3]),
      headers: { 'X-Expires-In-Days': '7', Origin: ORIGIN },
    });
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      shareCode: string;
      shareUrl: string;
      expiresAt: string;
    };
    expect(json.shareCode).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.shareUrl).toBe(`${ORIGIN}?share=${json.shareCode}`);

    const obj = await env.R2_BUCKET.head(json.shareCode);
    expect(obj?.customMetadata?.expiresAt).toBe(json.expiresAt);
  });

  it('clamps expiresInDays to 30 when given 999', async () => {
    const res = await SELF.fetch('http://example.com/share/upload', {
      method: 'POST',
      body: new Uint8Array([1]),
      headers: { 'X-Expires-In-Days': '999', Origin: ORIGIN },
    });
    const { expiresAt } = (await res.json()) as { expiresAt: string };
    const diffDays =
      (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeLessThanOrEqual(30.1);
  });

  it('returns 400 for empty body', async () => {
    const res = await SELF.fetch('http://example.com/share/upload', {
      method: 'POST',
      body: new Uint8Array([]),
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(400);
  });
});
