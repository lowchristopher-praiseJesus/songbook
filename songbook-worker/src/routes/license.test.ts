import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';
const h = { 'Content-Type': 'application/json', 'Origin': ORIGIN };

// Generates a valid key signed with the test secret 'test-license-secret'
// (must match vitest.config.ts miniflare bindings: LICENSE_SECRET = 'test-license-secret')
function makeTestKey(expiresAt = 0): string {
  const { createHash } = require('node:crypto');
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bitsToChar = (v: number) => ALPHA[v & 0x1f];
  const bits = new Array(60).fill(0);
  const wb = (s: number, c: number, v: number) => {
    for (let i = c - 1; i >= 0; i--) { bits[s + i] = v & 1; v >>= 1; }
  };
  wb(0, 4, 0); wb(4, 31, expiresAt); wb(35, 4, 1); wb(39, 21, 77);
  let payload = '';
  for (let i = 0; i < 12; i++) {
    let v = 0; for (let b = 0; b < 5; b++) v = (v << 1) | bits[i * 5 + b];
    payload += bitsToChar(v);
  }
  const hash = createHash('md5').update('test-license-secret' + payload).digest('hex');
  let hbits = 0;
  for (let i = 0; i < 5; i++) hbits = (hbits << 4) | parseInt(hash[i], 16);
  let ck = '';
  for (let i = 0; i < 4; i++) ck += bitsToChar((hbits >> (15 - i * 5)) & 0x1f);
  return `SONGBOOK-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${ck}`;
}

const VALID_KEY = makeTestKey();
const EXPIRED_KEY = makeTestKey(Math.floor(Date.now() / 1000) - 86400);

describe('POST /license/validate', () => {
  it('returns 400 when key is missing', async () => {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('missing_key');
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: { ...h, 'Content-Type': 'text/plain' }, body: 'notjson{',
    });
    expect(res.status).toBe(400);
  });

  it('returns 422 for an invalid key (wrong checksum)', async () => {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({ key: 'SONGBOOK-AAAA-BBBB-CCCC-DDDD' }),
    });
    expect(res.status).toBe(422);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('invalid_key');
  });

  it('returns 403 for an expired key', async () => {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({ key: EXPIRED_KEY }),
    });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('expired_key');
  });

  it('returns 200 with token and expiresAt for a valid key', async () => {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({ key: VALID_KEY }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { token: string; expiresAt: string };
    expect(typeof data.token).toBe('string');
    expect(data.token.includes('.')).toBe(true);
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('returns a token that expires ~24 h from now', async () => {
    const before = Date.now();
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({ key: VALID_KEY }),
    });
    const { expiresAt } = await res.json() as { expiresAt: string };
    const diff = new Date(expiresAt).getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(diff).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });
});
