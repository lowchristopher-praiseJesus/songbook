import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { CONDUCTOR } from '../config';
import {
  getConductor, putConductor,
  countActiveFollowers, isConductorExpired, isConductorTerminated,
} from '../lib/conductor';
import type { ConductorData } from '../lib/conductor';
import { verifyLicenseToken } from '../lib/licenseToken';
import { verifyTurnstile } from '../middleware/turnstile';

const conductor = new Hono<{ Bindings: Env }>();

const CONDUCTOR_CODE_RE = /^[A-Z2-9]{6}$/;

// POST /conductor/create
conductor.post('/create', verifyTurnstile, async (c) => {
  const licenseToken = c.req.header('X-License-Token');
  if (!await verifyLicenseToken(licenseToken, c.env.LICENSE_TOKEN_SECRET)) {
    return c.json({ error: 'license_required' }, 403);
  }

  let body: { maxFollowers?: unknown };
  try { body = await c.req.json(); } catch { body = {}; }

  if (typeof body.maxFollowers === 'number' && body.maxFollowers > CONDUCTOR.MAX_FOLLOWERS)
    return c.json({ error: 'max_followers_exceeded' }, 400);

  const maxFollowers = typeof body.maxFollowers === 'number'
    ? body.maxFollowers
    : CONDUCTOR.MAX_FOLLOWERS;

  const conductorCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  const directorToken = crypto.randomUUID();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONDUCTOR.SESSION_DAYS * 24 * 60 * 60 * 1000);

  const data: ConductorData = {
    conductorCode,
    directorToken,
    maxFollowers,
    live: false,
    currentSbpId: null,
    version: 0,
    followers: {},
    expiresAt: expiresAt.toISOString(),
  };

  await putConductor(c.env.SESSION_KV, data);
  return c.json({ ok: true, conductorCode, directorToken });
});

// GET /conductor/:code/status
conductor.get('/:code/status', async (c) => {
  const code = c.req.param('code');
  if (!CONDUCTOR_CODE_RE.test(code)) return c.json({ error: 'not_found' }, 404);
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data) || isConductorTerminated(data)) return c.json({ error: 'expired' }, 410);

  return c.json({
    live: data.live,
    currentSbpId: data.currentSbpId,
    version: data.version,
    followerCount: countActiveFollowers(data),
    expiresAt: data.expiresAt,
  });
});

function getConductorToken(c: Context): string | undefined {
  return c.req.header('X-Conductor-Token') ?? c.req.header('X-Director-Token');
}

function requireDirector(data: ConductorData, token: string | undefined): boolean {
  return !!token && token === data.directorToken;
}

// POST /conductor/:code/start
conductor.post('/:code/start', async (c) => {
  const code = c.req.param('code');
  if (!CONDUCTOR_CODE_RE.test(code)) return c.json({ error: 'not_found' }, 404);
  const token = getConductorToken(c);
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data) || isConductorTerminated(data)) return c.json({ error: 'expired' }, 410);
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);

  await putConductor(c.env.SESSION_KV, { ...data, live: true });
  return c.json({ ok: true });
});

// POST /conductor/:code/current
conductor.post('/:code/current', async (c) => {
  const code = c.req.param('code');
  if (!CONDUCTOR_CODE_RE.test(code)) return c.json({ error: 'not_found' }, 404);
  const token = getConductorToken(c);
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data) || isConductorTerminated(data)) return c.json({ error: 'expired' }, 410);
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);

  let body: { sbpId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }
  if (typeof body.sbpId !== 'number') return c.json({ error: 'missing_sbp_id' }, 400);

  const updated: ConductorData = { ...data, currentSbpId: body.sbpId, version: data.version + 1 };
  await putConductor(c.env.SESSION_KV, updated);
  return c.json({ currentSbpId: updated.currentSbpId, version: updated.version });
});

// POST /conductor/:code/stop
conductor.post('/:code/stop', async (c) => {
  const code = c.req.param('code');
  if (!CONDUCTOR_CODE_RE.test(code)) return c.json({ error: 'not_found' }, 404);
  const token = getConductorToken(c);
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data) || isConductorTerminated(data)) return c.json({ error: 'expired' }, 410);
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);

  await putConductor(c.env.SESSION_KV, { ...data, live: false, currentSbpId: null });
  return c.json({ ok: true });
});

// POST /conductor/:code/end
conductor.post('/:code/end', async (c) => {
  const code = c.req.param('code');
  if (!CONDUCTOR_CODE_RE.test(code)) return c.json({ ok: true }); // invalid = already gone
  const token = getConductorToken(c);
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ ok: true }); // idempotent: already gone
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);
  if (isConductorTerminated(data)) return c.json({ ok: true }); // already terminated
  await putConductor(c.env.SESSION_KV, { ...data, terminated: true, live: false, currentSbpId: null });
  return c.json({ ok: true });
});

// POST /conductor/:code/preview
conductor.post('/:code/preview', async (c) => {
  const code = c.req.param('code');
  if (!CONDUCTOR_CODE_RE.test(code)) return c.json({ error: 'not_found' }, 404);
  const token = getConductorToken(c);
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data) || isConductorTerminated(data)) return c.json({ error: 'expired' }, 410);
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);

  let body: { sbpId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }
  if (typeof body.sbpId !== 'number') return c.json({ error: 'missing_sbp_id' }, 400);

  await putConductor(c.env.SESSION_KV, { ...data, currentSbpId: body.sbpId, version: data.version + 1 });
  return c.json({ ok: true, currentSbpId: body.sbpId, version: data.version + 1 });
});

// POST /conductor/:code/join
conductor.post('/:code/join', async (c) => {
  const code = c.req.param('code');
  if (!CONDUCTOR_CODE_RE.test(code)) return c.json({ error: 'not_found' }, 404);
  let body: { clientId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }
  if (typeof body.clientId !== 'string' || !body.clientId)
    return c.json({ error: 'missing_client_id' }, 400);

  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data) || isConductorTerminated(data)) return c.json({ error: 'expired' }, 410);

  const clientId = body.clientId;
  const alreadyRegistered = !!data.followers[clientId];
  const activeCount = countActiveFollowers(data);

  if (!alreadyRegistered && activeCount >= data.maxFollowers)
    return c.json({ error: 'full' }, 403);

  const updated: ConductorData = {
    ...data,
    followers: { ...data.followers, [clientId]: { lastSeen: new Date().toISOString() } },
  };
  await putConductor(c.env.SESSION_KV, updated);
  return c.json({ ok: true });
});

// POST /conductor/:code/heartbeat
conductor.post('/:code/heartbeat', async (c) => {
  const code = c.req.param('code');
  if (!CONDUCTOR_CODE_RE.test(code)) return c.json({ error: 'not_found' }, 404);
  let body: { clientId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }
  if (typeof body.clientId !== 'string') return c.json({ error: 'missing_client_id' }, 400);

  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data) || isConductorTerminated(data)) return c.json({ error: 'expired' }, 410);

  const clientId = body.clientId;
  if (!data.followers[clientId]) return c.json({ error: 'not_registered' }, 404);

  const updated: ConductorData = {
    ...data,
    followers: { ...data.followers, [clientId]: { lastSeen: new Date().toISOString() } },
  };
  await putConductor(c.env.SESSION_KV, updated);
  return c.json({ ok: true });
});

// DELETE /conductor/:code/join
conductor.delete('/:code/join', async (c) => {
  const code = c.req.param('code');
  if (!CONDUCTOR_CODE_RE.test(code)) return new Response(null, { status: 204 });
  let body: { clientId?: unknown };
  try { body = await c.req.json(); } catch { body = {}; }

  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return new Response(null, { status: 204 });

  if (typeof body.clientId === 'string' && data.followers[body.clientId]) {
    const followers = { ...data.followers };
    delete followers[body.clientId];
    await putConductor(c.env.SESSION_KV, { ...data, followers });
  }
  return new Response(null, { status: 204 });
});

export default conductor;
