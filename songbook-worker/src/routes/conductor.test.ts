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
      body: JSON.stringify({ conductorCode: 'NOTKN1', directorToken: 'tok', maxFollowers: 5 }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });

  it('returns 403 when X-License-Token header is absent', async () => {
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST', headers: h,
      body: JSON.stringify({ conductorCode: 'NOLIC1', directorToken: 'tok', maxFollowers: 5 }),
    });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('license_required');
  });

  it('returns 403 when X-License-Token is invalid', async () => {
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST',
      headers: { ...h, 'X-License-Token': 'garbage.token' },
      body: JSON.stringify({ conductorCode: 'NOLIC2', directorToken: 'tok', maxFollowers: 5 }),
    });
    expect(res.status).toBe(403);
  });

  it('creates the session when a valid token is provided', async () => {
    const token = await getLicenseToken();
    const res = await SELF.fetch('http://localhost/conductor/create', {
      method: 'POST',
      headers: { ...h, 'X-License-Token': token },
      body: JSON.stringify({ conductorCode: 'LIC001', directorToken: 'tok', maxFollowers: 5 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });
});

async function createConductor(body = {}) {
  const token = await getLicenseToken();
  return SELF.fetch('http://localhost/conductor/create', {
    method: 'POST',
    headers: { ...h, 'X-License-Token': token },
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

describe('POST /conductor/:code/join', () => {
  it('registers a follower and returns ok', async () => {
    await createConductor({ conductorCode: 'JOIN01', directorToken: 'd', maxFollowers: 5 });
    await SELF.fetch('http://localhost/conductor/JOIN01/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'd' },
    });
    const res = await SELF.fetch('http://localhost/conductor/JOIN01/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('returns 403 when at capacity', async () => {
    await createConductor({ conductorCode: 'FULL01', directorToken: 'd', maxFollowers: 1 });
    await SELF.fetch('http://localhost/conductor/FULL01/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'd' },
    });
    await SELF.fetch('http://localhost/conductor/FULL01/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch('http://localhost/conductor/FULL01/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-b' }),
    });
    expect(res.status).toBe(403);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('full');
  });

  it('allows re-join for an existing clientId', async () => {
    await createConductor({ conductorCode: 'REJOIN', directorToken: 'd', maxFollowers: 1 });
    await SELF.fetch('http://localhost/conductor/REJOIN/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch('http://localhost/conductor/REJOIN/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /conductor/:code/heartbeat', () => {
  it('updates lastSeen for a registered follower', async () => {
    await createConductor({ conductorCode: 'HB0001', directorToken: 'd', maxFollowers: 5 });
    await SELF.fetch('http://localhost/conductor/HB0001/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch('http://localhost/conductor/HB0001/heartbeat', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 for unregistered clientId', async () => {
    await createConductor({ conductorCode: 'HB0002', directorToken: 'd', maxFollowers: 5 });
    const res = await SELF.fetch('http://localhost/conductor/HB0002/heartbeat', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'ghost' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 410 when session is terminated', async () => {
    await createConductor({ conductorCode: 'HB_TERM1', directorToken: 'dir-hb' });
    // Join so a follower entry exists
    await SELF.fetch('http://localhost/conductor/HB_TERM1/join', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ clientId: 'cli-1' }),
    });
    // Terminate the session
    await SELF.fetch('http://localhost/conductor/HB_TERM1/end', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-hb' },
    });
    // Heartbeat should now return 410
    const res = await SELF.fetch('http://localhost/conductor/HB_TERM1/heartbeat', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ clientId: 'cli-1' }),
    });
    expect(res.status).toBe(410);
  });
});

describe('DELETE /conductor/:code/join', () => {
  it('removes follower and returns 204', async () => {
    await createConductor({ conductorCode: 'LEAVE1', directorToken: 'd', maxFollowers: 5 });
    await SELF.fetch('http://localhost/conductor/LEAVE1/join', {
      method: 'POST', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    const res = await SELF.fetch('http://localhost/conductor/LEAVE1/join', {
      method: 'DELETE', headers: h, body: JSON.stringify({ clientId: 'client-a' }),
    });
    expect(res.status).toBe(204);

    const status = await (await SELF.fetch('http://localhost/conductor/LEAVE1/status', { headers: h })).json() as { followerCount: number };
    expect(status.followerCount).toBe(0);
  });
});

describe('POST /conductor/:code/end', () => {
  it('marks session terminated; subsequent status returns 410', async () => {
    await createConductor({ conductorCode: 'END001', directorToken: 'dir-end' });
    // start broadcast first
    await SELF.fetch('http://localhost/conductor/END001/start', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-end' },
    });
    const res = await SELF.fetch('http://localhost/conductor/END001/end', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir-end' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    const status = await SELF.fetch('http://localhost/conductor/END001/status', { headers: h });
    expect(status.status).toBe(410);
  });

  it('returns 403 with wrong token', async () => {
    await createConductor({ conductorCode: 'END002', directorToken: 'real-tok' });
    const res = await SELF.fetch('http://localhost/conductor/END002/end', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'wrong-tok' },
    });
    expect(res.status).toBe(403);
  });

  it('is idempotent: calling /end twice returns 200 both times', async () => {
    await createConductor({ conductorCode: 'END003', directorToken: 'dir3' });
    await SELF.fetch('http://localhost/conductor/END003/end', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir3' },
    });
    const res2 = await SELF.fetch('http://localhost/conductor/END003/end', {
      method: 'POST', headers: { ...h, 'X-Director-Token': 'dir3' },
    });
    expect(res2.status).toBe(200);

    // Also confirm the session still shows as terminated after the second /end
    const status = await SELF.fetch('http://localhost/conductor/END003/status', { headers: h });
    expect(status.status).toBe(410);
  });
});

describe('POST /conductor/:code/preview', () => {
  it('sets currentSbpId without making session live', async () => {
    await createConductor({ conductorCode: 'PRV001', directorToken: 'dir-prv' });
    const res = await SELF.fetch('http://localhost/conductor/PRV001/preview', {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': 'dir-prv' },
      body: JSON.stringify({ sbpId: 42 }),
    });
    expect(res.status).toBe(200);

    const status = await (await SELF.fetch('http://localhost/conductor/PRV001/status', { headers: h })).json() as { live: boolean; currentSbpId: number };
    expect(status.live).toBe(false);
    expect(status.currentSbpId).toBe(42);
  });

  it('returns 403 with wrong token', async () => {
    await createConductor({ conductorCode: 'PRV002', directorToken: 'real' });
    const res = await SELF.fetch('http://localhost/conductor/PRV002/preview', {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': 'wrong' },
      body: JSON.stringify({ sbpId: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 when sbpId is missing from body', async () => {
    await createConductor({ conductorCode: 'PRV003', directorToken: 'dir-prv3' });
    const res = await SELF.fetch('http://localhost/conductor/PRV003/preview', {
      method: 'POST',
      headers: { ...h, 'X-Director-Token': 'dir-prv3' },
      body: JSON.stringify({}), // no sbpId
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /conductor/:code/status includes expiresAt', () => {
  it('status response includes expiresAt string', async () => {
    await createConductor({ conductorCode: 'EXPAT1' });
    const res = await SELF.fetch('http://localhost/conductor/EXPAT1/status', { headers: h });
    const body = await res.json() as { expiresAt: string };
    expect(typeof body.expiresAt).toBe('string');
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
