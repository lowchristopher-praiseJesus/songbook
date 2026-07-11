import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { putShare, getShareIfValid, headShare } from '../src/lib/r2';

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

describe('putShare — locked metadata', () => {
  it('defaults locked to false when not passed', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await putShare(env.R2_BUCKET, 'test-put-default-lock', body, expiresAt);

    const obj = await env.R2_BUCKET.head('test-put-default-lock');
    expect(obj?.customMetadata?.locked).toBe('false');
  });

  it('writes locked: true when passed', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await putShare(env.R2_BUCKET, 'test-put-locked', body, expiresAt, 1, true);

    const obj = await env.R2_BUCKET.head('test-put-locked');
    expect(obj?.customMetadata?.locked).toBe('true');
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

describe('headShare — locked field', () => {
  it('returns locked: false for an object with no locked metadata', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('head-no-lock', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString() },
    });
    const result = await headShare(env.R2_BUCKET, 'head-no-lock');
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.locked).toBe(false);
  });

  it('returns locked: true when metadata says so', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('head-locked', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString(), locked: 'true' },
    });
    const result = await headShare(env.R2_BUCKET, 'head-locked');
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.locked).toBe(true);
  });
});

describe('getShareIfValid — locked field', () => {
  it('surfaces locked from the underlying head', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('valid-locked', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString(), locked: 'true' },
    });
    const result = await getShareIfValid(env.R2_BUCKET, 'valid-locked');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.locked).toBe(true);
      await result.object.arrayBuffer(); // consume stream to avoid isolated-storage leak
    }
  });
});

describe('putShare — pin metadata', () => {
  it('does not write pinHash/pinSalt when not passed', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await putShare(env.R2_BUCKET, 'test-put-no-pin', body, expiresAt);

    const obj = await env.R2_BUCKET.head('test-put-no-pin');
    expect(obj?.customMetadata?.pinHash).toBeUndefined();
    expect(obj?.customMetadata?.pinSalt).toBeUndefined();
  });

  it('writes pinHash/pinSalt when passed', async () => {
    const body = new Uint8Array([1, 2, 3]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await putShare(env.R2_BUCKET, 'test-put-pin', body, expiresAt, 1, true, 'somehash', 'somesalt');

    const obj = await env.R2_BUCKET.head('test-put-pin');
    expect(obj?.customMetadata?.pinHash).toBe('somehash');
    expect(obj?.customMetadata?.pinSalt).toBe('somesalt');
  });
});

describe('headShare — pin fields', () => {
  it('returns hasPin: false and no pinHash/pinSalt when none stored', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('head-no-pin', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString() },
    });
    const result = await headShare(env.R2_BUCKET, 'head-no-pin');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.hasPin).toBe(false);
      expect(result.pinHash).toBeUndefined();
    }
  });

  it('returns hasPin: true and the stored pinHash/pinSalt', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('head-pin', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString(), pinHash: 'abc', pinSalt: 'def' },
    });
    const result = await headShare(env.R2_BUCKET, 'head-pin');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.hasPin).toBe(true);
      expect(result.pinHash).toBe('abc');
      expect(result.pinSalt).toBe('def');
    }
  });
});

describe('getShareIfValid — hasPin field', () => {
  it('surfaces hasPin from the underlying head', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('valid-pin', new Uint8Array([1]), {
      customMetadata: { expiresAt: expiresAt.toISOString(), pinHash: 'abc', pinSalt: 'def' },
    });
    const result = await getShareIfValid(env.R2_BUCKET, 'valid-pin');
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.hasPin).toBe(true);
      await result.object.arrayBuffer(); // consume stream to avoid isolated-storage leak
    }
  });
});

describe('POST /share/upload', () => {
  it('stores blob and returns shareCode, shareUrl, expiresAt', async () => {
    const res = await SELF.fetch('http://example.com/share/upload', {
      method: 'POST',
      body: new Uint8Array([1, 2, 3]),
      headers: { 'X-Expires-In-Days': '7', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token' },
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
      headers: { 'X-Expires-In-Days': '999', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token' },
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
      headers: { Origin: ORIGIN, 'X-Turnstile-Token': 'test-token' },
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /share/:code', () => {
  it('streams blob for a valid non-expired share', async () => {
    const body = new Uint8Array([10, 20, 30]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('dl-valid', body, {
      customMetadata: { expiresAt: expiresAt.toISOString() },
    });

    const res = await SELF.fetch('http://example.com/share/dl-valid', {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf).toEqual(body);
  });

  it('exposes X-Share-Version to the browser via Access-Control-Expose-Headers', async () => {
    const body = new Uint8Array([10, 20, 30]);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.R2_BUCKET.put('dl-expose', body, {
      customMetadata: { expiresAt: expiresAt.toISOString(), version: '5' },
    });

    const res = await SELF.fetch('http://example.com/share/dl-expose', {
      headers: { Origin: ORIGIN },
    });
    const exposeHeaders = res.headers.get('Access-Control-Expose-Headers') ?? '';
    const shareVersion = res.headers.get('X-Share-Version');
    await res.arrayBuffer(); // consume stream before assertions to avoid isolated-storage leak
    expect(res.status).toBe(200);
    expect(shareVersion).toBe('5');
    expect(exposeHeaders).toContain('X-Share-Version');
  });

  it('returns 404 for unknown share code', async () => {
    const res = await SELF.fetch('http://example.com/share/no-such-code', {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });

  it('returns 410 for an expired share', async () => {
    const past = new Date(Date.now() - 1000);
    await env.R2_BUCKET.put('dl-expired', new Uint8Array([1]), {
      customMetadata: { expiresAt: past.toISOString() },
    });

    const res = await SELF.fetch('http://example.com/share/dl-expired', {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: 'expired' });
  });
});
