import { Hono } from 'hono';
import type { Env } from '../types';
import { putShare, getShareIfValid } from '../lib/r2';

const share = new Hono<{ Bindings: Env }>();

share.post('/upload', async (c) => {
  const rawDays = Number(c.req.header('X-Expires-In-Days') ?? '7');
  const expiresInDays = isNaN(rawDays) ? 7 : Math.min(30, Math.max(1, rawDays));
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: 'no_body' }, 400);

  const shareCode = crypto.randomUUID();
  await putShare(c.env.R2_BUCKET, shareCode, body, expiresAt);

  const shareUrl = `${c.env.APP_ORIGIN}?share=${shareCode}`;
  return c.json({ shareCode, shareUrl, expiresAt: expiresAt.toISOString() });
});

share.get('/:code', async (c) => {
  const shareCode = c.req.param('code');
  const result = await getShareIfValid(c.env.R2_BUCKET, shareCode);

  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : 410;
    return c.json({ error: result.error }, status);
  }

  return new Response(result.object.body, {
    headers: { 'Content-Type': 'application/zip' },
  });
});

export default share;
