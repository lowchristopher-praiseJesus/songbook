import { Hono } from 'hono';
import type { Env } from '../types';
import { putShare, getShareIfValid, headShare } from '../lib/r2';
import { verifyTurnstile } from '../middleware/turnstile';

const share = new Hono<{ Bindings: Env }>();

share.post('/upload', verifyTurnstile, async (c) => {
  const rawDays = Number(c.req.header('X-Expires-In-Days') ?? '7');
  const expiresInDays = isNaN(rawDays) ? 7 : Math.min(30, Math.max(1, rawDays));
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: 'no_body' }, 400);
  if (body.byteLength > 10 * 1024 * 1024) return c.json({ error: 'too_large' }, 413);

  const shareCode = crypto.randomUUID();
  await putShare(c.env.R2_BUCKET, shareCode, body, expiresAt, 1);

  const shareUrl = `${c.env.APP_ORIGIN}?share=${shareCode}`;
  return c.json({ shareCode, shareUrl, expiresAt: expiresAt.toISOString() });
});

share.on('HEAD', '/:code', async (c) => {
  const shareCode = c.req.param('code');
  const result = await headShare(c.env.R2_BUCKET, shareCode);

  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : 410;
    return c.body(null, status);
  }

  return c.body(null, 200, {
    'X-Share-Version': String(result.version),
    // no-store: a live share is mutable; clients must always read the current version.
    'Cache-Control': 'no-store',
  });
});

share.get('/:code', async (c) => {
  const shareCode = c.req.param('code');
  const result = await getShareIfValid(c.env.R2_BUCKET, shareCode);

  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : 410;
    return c.json({ error: result.error }, status);
  }

  return new Response(result.object.body, {
    headers: {
      'Content-Type': 'application/zip',
      'X-Share-Version': String(result.version),
      // no-store: a live share blob changes on every Push Update; never serve a cached copy.
      'Cache-Control': 'no-store',
    },
  });
});

share.put('/:code', async (c) => {
  const shareCode = c.req.param('code');

  const existing = await headShare(c.env.R2_BUCKET, shareCode);
  if ('error' in existing) {
    const status = existing.error === 'not_found' ? 404 : 410;
    return c.json({ error: existing.error }, status);
  }
  if (existing.locked) {
    return c.json({ error: 'locked' }, 423);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: 'no_body' }, 400);
  if (body.byteLength > 10 * 1024 * 1024) return c.json({ error: 'too_large' }, 413);

  const newVersion = existing.version + 1;
  const updatedAt = new Date();
  await putShare(c.env.R2_BUCKET, shareCode, body, existing.expiresAt, newVersion, existing.locked);

  return c.json({ version: newVersion, updatedAt: updatedAt.toISOString() });
});

share.patch('/:code/lock', async (c) => {
  const shareCode = c.req.param('code');

  const existing = await headShare(c.env.R2_BUCKET, shareCode);
  if ('error' in existing) {
    const status = existing.error === 'not_found' ? 404 : 410;
    return c.json({ error: existing.error }, status);
  }

  let payload: { locked?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }
  if (typeof payload.locked !== 'boolean') {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const object = await c.env.R2_BUCKET.get(shareCode);
  if (!object) return c.json({ error: 'not_found' }, 404);
  const body = await object.arrayBuffer();

  await putShare(c.env.R2_BUCKET, shareCode, body, existing.expiresAt, existing.version, payload.locked);

  return c.json({ locked: payload.locked });
});

export default share;
