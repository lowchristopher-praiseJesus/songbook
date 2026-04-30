import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { isConductorExpired } from '../lib/conductor';

const ORIGIN = 'http://localhost:5173';
const h = { 'Content-Type': 'application/json', 'Origin': ORIGIN };

async function createConductor(body = {}) {
  return SELF.fetch('http://localhost/conductor/create', {
    method: 'POST', headers: h,
    body: JSON.stringify({ conductorCode: 'AABBCC', directorToken: 'tok-1', maxFollowers: 5, ...body }),
  });
}

describe('POST /conductor/create', () => {
  it('creates a conductor session and returns ok', async () => {
    const res = await createConductor();
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('rejects maxFollowers above server ceiling', async () => {
    const res = await createConductor({ maxFollowers: 9999 });
    expect(res.status).toBe(400);
  });
});

describe('GET /conductor/:code/status', () => {
  it('returns live:false and zero followers for a new session', async () => {
    await createConductor({ conductorCode: 'STAT01' });
    const res = await SELF.fetch('http://localhost/conductor/STAT01/status', { headers: h });
    expect(res.status).toBe(200);
    const data = await res.json() as { live: boolean; currentSbpId: null; version: number; followerCount: number };
    expect(data.live).toBe(false);
    expect(data.currentSbpId).toBeNull();
    expect(data.version).toBe(0);
    expect(data.followerCount).toBe(0);
  });

  it('returns 404 for unknown code', async () => {
    const res = await SELF.fetch('http://localhost/conductor/XXXXXX/status', { headers: h });
    expect(res.status).toBe(404);
  });

  it('returns 410 for an expired session', async () => {
    const expiredData = JSON.stringify({
      conductorCode: 'EXPRD1',
      directorToken: 'tok',
      maxFollowers: 5,
      live: false,
      currentSbpId: null,
      version: 0,
      followers: {},
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await env.SESSION_KV.put('conductor:EXPRD1', expiredData);
    const res = await SELF.fetch('http://localhost/conductor/EXPRD1/status', { headers: h });
    expect(res.status).toBe(410);
  });
});

describe('isConductorExpired', () => {
  it('returns true for a past expiresAt', () => {
    const data = {
      conductorCode: 'X',
      directorToken: 'y',
      maxFollowers: 5,
      live: false,
      currentSbpId: null,
      version: 0,
      followers: {},
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    expect(isConductorExpired(data)).toBe(true);
  });

  it('returns false for a future expiresAt', () => {
    const data = {
      conductorCode: 'X',
      directorToken: 'y',
      maxFollowers: 5,
      live: false,
      currentSbpId: null,
      version: 0,
      followers: {},
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    expect(isConductorExpired(data)).toBe(false);
  });
});
