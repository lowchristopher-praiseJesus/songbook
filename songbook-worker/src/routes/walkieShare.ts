import { Hono } from 'hono';
import type { Env } from '../types';

const walkieShare = new Hono<{ Bindings: Env }>();

walkieShare.post('/upload', async (c) => {
  let body: { volunteers?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (!Array.isArray(body.volunteers)) {
    return c.json({ error: 'volunteers_required' }, 400);
  }

  const uuid = crypto.randomUUID();
  const key = `walkie-shares/${uuid}`;
  const json = JSON.stringify({ volunteers: body.volunteers });

  await c.env.R2_BUCKET.put(key, json, {
    customMetadata: { createdAt: new Date().toISOString() },
    httpMetadata: { contentType: 'application/json' },
  });

  const shareUrl = `${c.env.WALKIE_ORIGIN ?? ''}?server=${uuid}`;
  return c.json({ uuid, shareUrl });
});

walkieShare.get('/:uuid', async (c) => {
  const uuid = c.req.param('uuid');
  const key = `walkie-shares/${uuid}`;

  const object = await c.env.R2_BUCKET.get(key);
  if (!object) return c.json({ error: 'not_found' }, 404);

  const text = await object.text();
  return new Response(text, {
    headers: { 'Content-Type': 'application/json' },
  });
});

export default walkieShare;
