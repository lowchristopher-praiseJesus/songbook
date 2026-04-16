import { Hono } from 'hono';
import type { Env } from '../types';
import {
  generateCode, getSession, putSession, stripExpiredLocks,
  isSessionDead, applyOp,
} from '../lib/session';
import type { SessionData, Op } from '../lib/session';

const session = new Hono<{ Bindings: Env }>();

// POST /session/create
session.post('/create', async (c) => {
  let body: { name?: string; songs?: Array<{ id: string; meta: unknown; rawText: string }> };
  try { body = await c.req.json(); } catch { body = {}; }

  const code = generateCode();
  const leaderToken = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const name = body.name?.trim() || now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const songs: SessionData['songs'] = {};
  const setList: string[] = [];

  if (Array.isArray(body.songs)) {
    for (const s of body.songs) {
      if (s.id && s.meta && typeof s.rawText === 'string') {
        songs[s.id] = { meta: s.meta as SessionData['songs'][string]['meta'], rawText: s.rawText };
        setList.push(s.id);
      }
    }
  }

  const data: SessionData = {
    code, name, leaderToken,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    closed: false, version: 0,
    setList, songs, editLocks: {},
  };

  await putSession(c.env.SESSION_KV, data);

  const appOrigin = c.env.APP_ORIGIN;
  return c.json({
    code, leaderToken,
    memberUrl: `${appOrigin}?session=${code}`,
    leaderUrl: `${appOrigin}?session=${code}&token=${leaderToken}`,
    expiresAt: expiresAt.toISOString(),
  });
});

// GET /session/:code/state
session.get('/:code/state', async (c) => {
  const code = c.req.param('code');
  const raw = await getSession(c.env.SESSION_KV, code);
  if (!raw) return c.json({ error: 'not_found' }, 404);
  if (isSessionDead(raw)) return c.json({ error: 'expired' }, 410);

  const clean = stripExpiredLocks(raw);
  const { leaderToken: _dropped, ...publicState } = clean;
  return c.json(publicState);
});

// POST /session/:code/op
session.post('/:code/op', async (c) => {
  const code = c.req.param('code');
  const sess = await getSession(c.env.SESSION_KV, code);
  if (!sess) return c.json({ error: 'not_found' }, 404);
  if (isSessionDead(sess)) return c.json({ error: 'gone' }, 410);

  let op: Op;
  try { op = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }

  const updated = applyOp(sess, op);
  await putSession(c.env.SESSION_KV, updated);
  return c.json({ version: updated.version, applied: updated.version !== sess.version });
});

// POST /session/:code/lock/:songId
session.post('/:code/lock/:songId', async (c) => {
  const code = c.req.param('code');
  const songId = c.req.param('songId');

  let clientId: string;
  try {
    const body = await c.req.json() as { clientId?: unknown };
    if (typeof body.clientId !== 'string' || !body.clientId) {
      return c.json({ error: 'missing_client_id' }, 400);
    }
    clientId = body.clientId;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const sess = await getSession(c.env.SESSION_KV, code);
  if (!sess) return c.json({ error: 'not_found' }, 404);
  if (isSessionDead(sess)) return c.json({ error: 'gone' }, 410);

  if (!sess.songs[songId]) return c.json({ error: 'not_found' }, 404);

  const existing = sess.editLocks[songId];
  const now = Date.now();
  const lockExpiry = existing ? new Date(existing.expiresAt).getTime() : 0;
  const isHeldByOther = existing && lockExpiry > now && existing.clientId !== clientId;

  if (isHeldByOther) {
    return c.json({ error: 'locked', lockedUntil: existing.expiresAt }, 423);
  }

  const expiresAt = new Date(now + 2 * 60 * 1000).toISOString();
  const updated: SessionData = {
    ...sess,
    editLocks: {
      ...sess.editLocks,
      [songId]: { clientId, lockedAt: new Date(now).toISOString(), expiresAt },
    },
  };
  await putSession(c.env.SESSION_KV, updated);
  return c.json({ expiresAt });
});

// POST /session/:code/heartbeat/:songId
session.post('/:code/heartbeat/:songId', async (c) => {
  const code = c.req.param('code');
  const songId = c.req.param('songId');

  let clientId: string;
  try {
    const body = await c.req.json() as { clientId?: unknown };
    if (typeof body.clientId !== 'string' || !body.clientId) {
      return c.json({ error: 'missing_client_id' }, 400);
    }
    clientId = body.clientId;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const sess = await getSession(c.env.SESSION_KV, code);
  if (!sess) return c.json({ error: 'not_found' }, 404);
  if (isSessionDead(sess)) return c.json({ error: 'gone' }, 410);

  const lock = sess.editLocks[songId];
  const lockExpired = !lock || new Date(lock.expiresAt).getTime() <= Date.now();
  if (lockExpired || lock.clientId !== clientId) return c.json({ error: 'not_found' }, 404);

  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const updated: SessionData = {
    ...sess,
    editLocks: { ...sess.editLocks, [songId]: { ...lock, expiresAt } },
  };
  await putSession(c.env.SESSION_KV, updated);
  return c.json({ expiresAt });
});

// DELETE /session/:code/lock/:songId
session.delete('/:code/lock/:songId', async (c) => {
  const code = c.req.param('code');
  const songId = c.req.param('songId');

  let clientId: string;
  try {
    const body = await c.req.json() as { clientId?: unknown };
    if (typeof body.clientId !== 'string' || !body.clientId) {
      return c.json({ error: 'missing_client_id' }, 400);
    }
    clientId = body.clientId;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const sess = await getSession(c.env.SESSION_KV, code);
  if (!sess) return new Response(null, { status: 204 });

  const lock = sess.editLocks[songId];
  if (!lock || lock.clientId !== clientId) return new Response(null, { status: 204 });

  const editLocks = { ...sess.editLocks };
  delete editLocks[songId];
  await putSession(c.env.SESSION_KV, { ...sess, editLocks });
  return new Response(null, { status: 204 });
});

// POST /session/:code/close
session.post('/:code/close', async (c) => {
  const code = c.req.param('code');
  const token = c.req.header('X-Leader-Token');

  const sess = await getSession(c.env.SESSION_KV, code);
  if (!sess) return c.json({ error: 'not_found' }, 404);
  if (sess.leaderToken !== token) return c.json({ error: 'forbidden' }, 403);

  await putSession(c.env.SESSION_KV, { ...sess, closed: true });
  return c.json({ ok: true });
});

export default session;
