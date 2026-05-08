import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

export const verifyTurnstile: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = c.req.header('X-Turnstile-Token');
  if (!token) return c.json({ error: 'turnstile_failed' }, 403);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: c.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: c.req.header('CF-Connecting-IP') ?? '',
      }),
    });
    const data = await res.json() as { success: boolean };
    if (data.success !== true) return c.json({ error: 'turnstile_failed' }, 403);
  } catch {
    return c.json({ error: 'turnstile_failed' }, 403);
  }

  return next();
};
