import { Hono } from 'hono';
import type { Env } from './types';
import share from './routes/share';
import walkieShare from './routes/walkieShare';
import session from './routes/session';

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
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In-Days, X-Leader-Token',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  if (allowed) {
    c.res.headers.set('Access-Control-Allow-Origin', requestOrigin);
    c.res.headers.set('Vary', 'Origin');
  }
});

app.get('/health', (c) => c.json({ ok: true }));
app.route('/share', share);
app.route('/walkie-shares', walkieShare);
app.route('/session', session);

export default app;
