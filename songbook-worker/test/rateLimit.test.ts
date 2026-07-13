import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

function body() {
  return JSON.stringify({
    collectionName: 'C',
    songs: [{ title: `T${crypto.randomUUID()}`, artist: 'A', body: 'la' }],
  });
}

async function publishFrom(ip: string) {
  return SELF.fetch('http://localhost/community/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      'X-Turnstile-Token': 'test-token',
      'CF-Connecting-IP': ip,
    },
    body: body(),
  });
}

describe('publish rate limiting', () => {
  it('allows the first 5 publications from one IP and blocks the 6th', async () => {
    const ip = '203.0.113.10';
    for (let i = 0; i < 5; i++) {
      const ok = await publishFrom(ip);
      expect(ok.status).toBe(201);
    }
    const blocked = await publishFrom(ip);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'rate_limited' });
  });

  it('does not penalise a different IP', async () => {
    const res = await publishFrom('203.0.113.99');
    expect(res.status).toBe(201);
  });
});
