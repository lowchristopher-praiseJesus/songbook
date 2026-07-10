import { Hono } from 'hono';
import type { Env } from './types';
import share from './routes/share';
import walkieShare from './routes/walkieShare';
import session from './routes/session';
import conductor from './routes/conductor';
import album from './routes/album';
import license from './routes/license';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const requestOrigin = c.req.header('Origin') ?? '';
  const appOrigin = c.env.APP_ORIGIN ?? '';
  const walkieOrigin = c.env.WALKIE_ORIGIN ?? '';
  // APP_ORIGIN may be a comma-separated list (e.g. "https://app.example.com,http://localhost:5173")
  const allowedOrigins = new Set([
    ...appOrigin.split(',').map(o => o.trim()).filter(Boolean),
    ...walkieOrigin.split(',').map(o => o.trim()).filter(Boolean),
  ]);
  const allowed = allowedOrigins.has(requestOrigin);

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed ? requestOrigin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In-Days, X-Leader-Token, X-Director-Token, X-Conductor-Token, X-Creator-Token, X-License-Token, X-Turnstile-Token, X-Locked',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  if (allowed) {
    c.res.headers.set('Access-Control-Allow-Origin', requestOrigin);
    c.res.headers.set('Vary', 'Origin');
    // Expose custom response headers so browser JS can read them. Without this,
    // X-Share-Version/X-Share-Locked are hidden from fetch() and the client falls back to defaults.
    c.res.headers.set('Access-Control-Expose-Headers', 'X-Share-Version, X-Share-Locked');
  }
});

app.get('/health', (c) => c.json({ ok: true }));
app.route('/share', share);
app.route('/walkie-shares', walkieShare);
app.route('/session', session);
app.route('/conductor', conductor);
app.route('/album', album);
app.route('/license', license);

export default app;
