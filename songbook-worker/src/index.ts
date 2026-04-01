import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import share from './routes/share';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  return cors({
    origin: c.env.APP_ORIGIN,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Expires-In-Days'],
  })(c, next);
});

app.get('/health', (c) => c.json({ ok: true }));
app.route('/share', share);

export default app;
