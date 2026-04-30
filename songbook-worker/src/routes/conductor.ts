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

export default conductor;
