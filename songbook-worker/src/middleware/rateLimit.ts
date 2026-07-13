import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

/**
 * KV-backed fixed-window IP rate limiter. With no user accounts there is nobody to ban,
 * so IP limits plus after-the-fact admin removal are the whole abuse toolkit.
 */
export function rateLimit(opts: { prefix: string; limit: number; windowSeconds: number }): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const key = `${opts.prefix}:${ip}:${window}`;

    const current = Number((await c.env.SESSION_KV.get(key)) ?? '0');
    if (current >= opts.limit) {
      return c.json({ error: 'rate_limited' }, 429);
    }

    await c.env.SESSION_KV.put(key, String(current + 1), { expirationTtl: opts.windowSeconds });
    return next();
  };
}
