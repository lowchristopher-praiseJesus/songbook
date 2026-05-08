import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { isConductorExpired } from '../lib/conductor';

const ORIGIN = 'http://localhost:5173';
const h = { 'Content-Type': 'application/json', 'Origin': ORIGIN, 'X-Turnstile-Token': 'test-token' };

// ── License token helper ──────────────────────────────────────────────────────
function makeLicenseKey(): string {
  const { createHash } = require('node:crypto');
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bitsToChar = (v: number) => ALPHA[v & 0x1f];
  const bits = new Array(60).fill(0);
  const wb = (s: number, c: number, v: number) => {
    for (let i = c - 1; i >= 0; i--) { bits[s + i] = v & 1; v >>= 1; }
  };
  wb(0, 4, 0); wb(4, 31, 0); wb(35, 4, 1); wb(39, 21, 55);
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

let _cachedToken: string | null = null;
async function getLicenseToken(): Promise<string> {
  if (!_cachedToken) {
    const res = await SELF.fetch('http://localhost/license/validate', {
      method: 'POST', headers: h, body: JSON.stringify({ key: makeLicenseKey() }),
    });
    const data = await res.json() as { token: string };
    _cachedToken = data.token;
  }
  return _cachedToken;
}
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conductor/create — license enforcement', () => {
  beforeEach(() => { _cachedToken = null; });

  it('returns 403 when X-Turnstile-Token header is missing', async () => {
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
      body: JSON.stringify({ maxFollowers: 5 }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });

  it('returns 403 when X-License-Token header is absent', async () => {
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST', headers: h,
      body: JSON.stringify({ maxFollowers: 5 }),
    });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('license_required');
  });

  it('returns 403 when X-License-Token is invalid', async () => {
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST',
      headers: { ...h, 'X-License-Token': 'garbage.token' },
      body: JSON.stringify({ maxFollowers: 5 }),
    });
    expect(res.status).toBe(403);
  });

  it('creates the session and returns conductorCode and directorToken', async () => {
    const token = await getLicenseToken();
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST',
      headers: { ...h, 'X-License-Token': token },
      body: JSON.stringify({ maxFollowers: 5 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; conductorCode: string; directorToken: string };
    expect(data.ok).toBe(true);
    expect(data.conductorCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(data.directorToken).toMatch(/^[0-9a-f-]{36}$/);
  });
});

async function createConductor(body: Record<string, unknown> = {}) {
  const token = await getLicenseToken();
  const res = await SELF.fetch('http://localhost/conductor/create', {
    method: 'POST',
    headers: { ...h, 'X-License-Token': token },
    body: JSON.stringify({ maxFollowers: 5, ...body }),
  });
  return res.json() as Promise<{ ok: boolean; conductorCode: string; directorToken: string }>;
}

describe('POST /conductor/create', () => {
  it('creates a conductor session and returns ok', async () => {
    const data = await createConductor();
    expect(data.ok).toBe(true);
    expect(data.conductorCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(data.directorToken).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects maxFollowers above server ceiling', async () => {
    const token = await getLicenseToken();
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST',
      headers: { ...h, 'X-License-Token': token },
      body: JSON.stringify({ maxFollowers: 9999 }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /conductor/:code/status', () => {
  it('returns live:false and zero followers for a new session', async () => {
    const { conductorCode } = await createConductor();
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/status`, { headers: h });
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
    const { conductorCode, directorToken } = await createConductor();
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/start`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    expect(res.status).toBe(200);

    const status = await (await SELF.fetch(`http://localhost/conductor/${conductorCode}/status`, { headers: h })).json() as { live: boolean };
    expect(status.live).toBe(true);
  });

  it('returns 403 with wrong token', async () => {
    const { conductorCode } = await createConductor();
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/start`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'wrong-tok' },
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /conductor/:code/current', () => {
  it('sets currentSbpId and bumps version', async () => {
    const { conductorCode, directorToken } = await createConductor();
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/current`, {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': directorToken },
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
    const { conductorCode, directorToken } = await createConductor();
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/start`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/current`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
      body: JSON.stringify({ sbpId: 99 }),
    });
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/stop`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    expect(res.status).toBe(200);
    const status = await (await SELF.fetch(`http://localhost/conductor/${conductorCode}/status`, { headers: h })).json() as { live: boolean; currentSbpId: null };
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

describe('POST /conductor/:code/join', () => {
  it('registers a follower and returns ok', async () => {
    const { conductorCode, directorToken } = await createConductor();
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/start`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/join`, {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('returns 403 when at capacity', async () => {
    const { conductorCode, directorToken } = await createConductor({ maxFollowers: 1 });
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/start`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/join`, {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/join`, {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-b' }),
    });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('full');
  });

  it('allows re-join for an existing clientId', async () => {
    const { conductorCode } = await createConductor({ maxFollowers: 1 });
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/join`, {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/join`, {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /conductor/:code/heartbeat', () => {
  it('updates lastSeen for a registered follower', async () => {
    const { conductorCode } = await createConductor();
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/join`, {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/heartbeat`, {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 for unregistered clientId', async () => {
    const { conductorCode } = await createConductor();
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/heartbeat`, {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'ghost' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 410 when session is terminated', async () => {
    const { conductorCode, directorToken } = await createConductor();
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/join`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ clientId: 'cli-1' }),
    });
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/end`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/heartbeat`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ clientId: 'cli-1' }),
    });
    expect(res.status).toBe(410);
  });
});

describe('DELETE /conductor/:code/join', () => {
  it('removes follower and returns 204', async () => {
    const { conductorCode, directorToken } = await createConductor();
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/start`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/join`, {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/join`, {
      method: 'DELETE', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(204);

    const status = await (await SELF.fetch(`http://localhost/conductor/${conductorCode}/status`, { headers: h })).json() as { followerCount: number };
    expect(status.followerCount).toBe(0);
  });
});

describe('POST /conductor/:code/end', () => {
  it('marks session terminated; subsequent status returns 410', async () => {
    const { conductorCode, directorToken } = await createConductor();
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/start`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/end`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    const status = await SELF.fetch(`http://localhost/conductor/${conductorCode}/status`, { headers: h });
    expect(status.status).toBe(410);
  });

  it('returns 403 with wrong token', async () => {
    const { conductorCode } = await createConductor();
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/end`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'wrong-tok' },
    });
    expect(res.status).toBe(403);
  });

  it('is idempotent: calling /end twice returns 200 both times', async () => {
    const { conductorCode, directorToken } = await createConductor();
    await SELF.fetch(`http://localhost/conductor/${conductorCode}/end`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    const res2 = await SELF.fetch(`http://localhost/conductor/${conductorCode}/end`, {
      method: 'POST', headers: { ...h, 'X-Director-Token': directorToken },
    });
    expect(res2.status).toBe(200);

    const status = await SELF.fetch(`http://localhost/conductor/${conductorCode}/status`, { headers: h });
    expect(status.status).toBe(410);
  });
});

describe('POST /conductor/:code/preview', () => {
  it('sets currentSbpId without making session live', async () => {
    const { conductorCode, directorToken } = await createConductor();
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/preview`, {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': directorToken },
      body: JSON.stringify({ sbpId: 42 }),
    });
    expect(res.status).toBe(200);

    const status = await (await SELF.fetch(`http://localhost/conductor/${conductorCode}/status`, { headers: h })).json() as { live: boolean; currentSbpId: number };
    expect(status.live).toBe(false);
    expect(status.currentSbpId).toBe(42);
  });

  it('returns 403 with wrong token', async () => {
    const { conductorCode } = await createConductor();
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/preview`, {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': 'wrong' },
      body: JSON.stringify({ sbpId: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 when sbpId is missing from body', async () => {
    const { conductorCode, directorToken } = await createConductor();
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/preview`, {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': directorToken },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /conductor/:code/status includes expiresAt', () => {
  it('status response includes expiresAt string', async () => {
    const { conductorCode } = await createConductor();
    const res = await SELF.fetch(`http://localhost/conductor/${conductorCode}/status`, { headers: h });
    const body = await res.json() as { expiresAt: string };
    expect(typeof body.expiresAt).toBe('string');
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
