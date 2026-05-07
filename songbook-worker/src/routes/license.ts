import { Hono } from 'hono';
import type { Env } from '../types';
import { validateLicenseKey, isLicenseExpired } from '../lib/licenseValidation';
import { signLicenseToken } from '../lib/licenseToken';

const license = new Hono<{ Bindings: Env }>();

license.post('/validate', async (c) => {
  let body: { key?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }

  if (typeof body.key !== 'string' || !body.key.trim()) {
    return c.json({ error: 'missing_key' }, 400);
  }

  const result = validateLicenseKey(body.key, c.env.LICENSE_SECRET);
  if (!result.valid) return c.json({ error: 'invalid_key' }, 422);
  if (isLicenseExpired(result.payload)) return c.json({ error: 'expired_key' }, 403);

  const { token, expiresAt } = await signLicenseToken(body.key, c.env.LICENSE_TOKEN_SECRET);
  return c.json({ token, expiresAt });
});

export default license;
