import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, fetchMock } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';
const SITEVERIFY_URL = 'https://challenges.cloudflare.com';

describe('verifyTurnstile middleware', () => {
  beforeEach(() => {
    fetchMock.activate();
    fetchMock.enableNetConnect();
  });

  it('returns 403 with turnstile_failed when X-Turnstile-Token header is missing', async () => {
    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', 'Origin': ORIGIN },
      body: new ArrayBuffer(1),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });

  it('calls next() and returns 200 when siteverify returns success: true', async () => {
    fetchMock
      .get(SITEVERIFY_URL)
      .intercept({ path: '/turnstile/v0/siteverify', method: 'POST' })
      .reply(200, { success: true });

    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Origin': ORIGIN,
        'X-Turnstile-Token': 'test-token',
      },
      body: new ArrayBuffer(1),
    });
    expect(res.status).toBe(200);
  });

  it('returns 403 when siteverify returns success: false', async () => {
    fetchMock
      .get(SITEVERIFY_URL)
      .intercept({ path: '/turnstile/v0/siteverify', method: 'POST' })
      .reply(200, { success: false });

    const res = await SELF.fetch('http://localhost/share/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Origin': ORIGIN,
        'X-Turnstile-Token': 'test-token',
      },
      body: new ArrayBuffer(1),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('turnstile_failed');
  });
});
