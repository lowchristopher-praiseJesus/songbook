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

describe('POST /conductor/:code/start', () => {
  it('sets live:true with valid director token', async () => {
    await createConductor({ conductorCode: 'START1', directorToken: 'dir-tok' });
    const res = await SELF.fetch('http://localhost/conductor/START1/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-tok' },
    });
    expect(res.status).toBe(200);

    const status = await (await SELF.fetch('http://localhost/conductor/START1/status', { headers: h })).json() as { live: boolean };
    expect(status.live).toBe(true);
  });

  it('returns 403 with wrong token', async () => {
    await createConductor({ conductorCode: 'START2', directorToken: 'real-tok' });
    const res = await SELF.fetch('http://localhost/conductor/START2/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'wrong-tok' },
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /conductor/:code/current', () => {
  it('sets currentSbpId and bumps version', async () => {
    await createConductor({ conductorCode: 'CURR01', directorToken: 'dir-tok' });
    const res = await SELF.fetch('http://localhost/conductor/CURR01/current', {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': 'dir-tok' },
      body: JSON.stringify({ sbpId: 42 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { currentSbpId: number; version: number };
    expect(data.currentSbpId).toBe(42);
    expect(data.version).toBe(1);
  });
});

describe('POST /conductor/:code/stop', () => {
  it('sets live:false and clears currentSbpId', async () => {
    await createConductor({ conductorCode: 'STOP01', directorToken: 'dir-tok' });
    await SELF.fetch('http://localhost/conductor/STOP01/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-tok' },
    });
    await SELF.fetch('http://localhost/conductor/STOP01/current', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-tok' },
      body: JSON.stringify({ sbpId: 99 }),
    });
    const res = await SELF.fetch('http://localhost/conductor/STOP01/stop', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-tok' },
    });
    expect(res.status).toBe(200);
    const status = await (await SELF.fetch('http://localhost/conductor/STOP01/status', { headers: h })).json() as { live: boolean; currentSbpId: null };
    expect(status.live).toBe(false);
    expect(status.currentSbpId).toBeNull();
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
