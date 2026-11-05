import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { verifyTurnstile } from '../middleware/turnstile';
import { buildCatalogue } from '../lib/themeCatalogue';
import { getQuota, recordPick, PER_IP_DAILY } from '../lib/themeQuota';
import { validatePicks } from '../lib/themePickValidate';

const MAX_COUNT = 20;
const MAX_THEME = 200;
const MAX_EXCLUDE = 100;
const PICKER_TIMEOUT_MS = 85_000;

interface PickInput { theme: string; count: number; exclude: string[] }

function parseInput(body: unknown): PickInput | null {
  if (!body || typeof body !== 'object') return null;
  const { theme, count, exclude = [] } = body as Record<string, unknown>;
  if (typeof theme !== 'string') return null;
  const trimmed = theme.trim();
  if (!trimmed || trimmed.length > MAX_THEME) return null;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_COUNT) return null;
  if (!Array.isArray(exclude) || exclude.length > MAX_EXCLUDE || !exclude.every(x => typeof x === 'string')) return null;
  return { theme: trimmed, count, exclude: exclude as string[] };
}

const ipOf = (c: Context<{ Bindings: Env }>) => c.req.header('CF-Connecting-IP') ?? 'unknown';

const themePick = new Hono<{ Bindings: Env; Variables: { input: PickInput } }>();

themePick.get('/quota', async (c) => {
  const q = await getQuota(c.env, ipOf(c), new Date());
  return c.json({ remaining: q.remaining, limit: PER_IP_DAILY, resetsAt: q.resetsAt });
});

// Input is checked before Turnstile so a malformed request never spends a siteverify call.
async function validateInput(c: Context<{ Bindings: Env; Variables: { input: PickInput } }>, next: Next) {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = null; }
  const input = parseInput(body);
  if (!input) return c.json({ error: 'invalid_input' }, 400);
  c.set('input', input);
  return next();
}

themePick.post('/', validateInput, verifyTurnstile, async (c) => {
  const { theme, count, exclude } = c.get('input');
  const ip = ipOf(c);
  const now = new Date();

  const q = await getQuota(c.env, ip, now);
  if (q.remaining <= 0) return c.json({ error: 'daily_limit', resetsAt: q.resetsAt }, 429);
  if (q.globalRemaining <= 0) return c.json({ error: 'global_limit', resetsAt: q.resetsAt }, 429);

  const excluded = new Set(exclude);
  const catalogue = (await buildCatalogue(c.env)).filter(s => !excluded.has(s.id));

  let res: Response;
  try {
    res = await fetch(`${c.env.PICKER_URL}/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Picker-Key': c.env.PICKER_KEY },
      body: JSON.stringify({ theme, count, songs: catalogue }),
      signal: AbortSignal.timeout(PICKER_TIMEOUT_MS),
    });
  } catch {
    return c.json({ error: 'picker_unavailable' }, 503);
  }
  // A sleeping Abacus VM answers with a platform 503 page; the picker's own deadline is 504.
  if (!res.ok) {
    return res.status >= 500 && res.status !== 502
      ? c.json({ error: 'picker_unavailable' }, 503)
      : c.json({ error: 'picker_bad_output' }, 502);
  }

  let raw: unknown;
  try { raw = await res.json(); } catch { return c.json({ error: 'picker_bad_output' }, 502); }

  const picks = validatePicks(raw, catalogue, exclude, count);
  if (picks.length === 0) return c.json({ error: 'picker_bad_output' }, 502);

  await recordPick(c.env, ip, now);
  return c.json({ picks, remaining: Math.max(0, q.remaining - 1) });
});

export default themePick;
