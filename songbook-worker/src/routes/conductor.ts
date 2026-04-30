import { Hono } from 'hono';
import type { Env } from '../types';
import { CONDUCTOR } from '../config';
import {
  getConductor, putConductor,
  countActiveFollowers, isConductorExpired,
} from '../lib/conductor';
import type { ConductorData } from '../lib/conductor';

const conductor = new Hono<{ Bindings: Env }>();

// POST /conductor/create
conductor.post('/create', async (c) => {
  let body: { conductorCode?: unknown; directorToken?: unknown; maxFollowers?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }

  if (typeof body.conductorCode !== 'string' || !body.conductorCode)
    return c.json({ error: 'missing_conductor_code' }, 400);
  if (typeof body.directorToken !== 'string' || !body.directorToken)
    return c.json({ error: 'missing_director_token' }, 400);

  if (typeof body.maxFollowers === 'number' && body.maxFollowers > CONDUCTOR.MAX_FOLLOWERS)
    return c.json({ error: 'max_followers_exceeded' }, 400);

  const maxFollowers = typeof body.maxFollowers === 'number'
    ? body.maxFollowers
    : CONDUCTOR.MAX_FOLLOWERS;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONDUCTOR.SESSION_DAYS * 24 * 60 * 60 * 1000);

  const data: ConductorData = {
    conductorCode: body.conductorCode,
    directorToken: body.directorToken,
    maxFollowers,
    live: false,
    currentSbpId: null,
    version: 0,
    followers: {},
    expiresAt: expiresAt.toISOString(),
  };

  await putConductor(c.env.SESSION_KV, data);
  return c.json({ ok: true });
});

// GET /conductor/:code/status
conductor.get('/:code/status', async (c) => {
  const code = c.req.param('code');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data)) return c.json({ error: 'expired' }, 410);

  return c.json({
    live: data.live,
    currentSbpId: data.currentSbpId,
    version: data.version,
    followerCount: countActiveFollowers(data),
  });
});

function requireDirector(data: ConductorData, token: string | undefined): boolean {
  return !!token && token === data.directorToken;
}

// POST /conductor/:code/start
conductor.post('/:code/start', async (c) => {
  const code = c.req.param('code');
  const token = c.req.header('X-Director-Token');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data)) return c.json({ error: 'expired' }, 410);
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);

  await putConductor(c.env.SESSION_KV, { ...data, live: true });
  return c.json({ ok: true });
});

// POST /conductor/:code/current
conductor.post('/:code/current', async (c) => {
  const code = c.req.param('code');
  const token = c.req.header('X-Director-Token');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data)) return c.json({ error: 'expired' }, 410);
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
  const token = c.req.header('X-Director-Token');
  const data = await getConductor(c.env.SESSION_KV, code);
  if (!data) return c.json({ error: 'not_found' }, 404);
  if (isConductorExpired(data)) return c.json({ error: 'expired' }, 410);
  if (!requireDirector(data, token)) return c.json({ error: 'forbidden' }, 403);

  await putConductor(c.env.SESSION_KV, { ...data, live: false, currentSbpId: null });
  return c.json({ ok: true });
});

export default conductor;
