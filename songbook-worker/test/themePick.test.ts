import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { SELF, env, fetchMock } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';
const PICKER_ORIGIN = 'https://picker.test';
const PICK_PATH = '/songsheet-picker/api/pick';

async function insertSong(id: string, title: string) {
  await env.DB.prepare(
    `INSERT INTO songs (id, content_hash, group_key, title, artist, body, first_published_at)
     VALUES (?, ?, ?, ?, 'Artist', ?, 1)`
  ).bind(id, `hash-${id}`, `${title}|artist`, title, `[G]${title} lyrics`).run();
}

beforeAll(async () => {
  await insertSong('s1', 'Shout To The Lord');
  await insertSong('s2', 'Holy Forever');
  await insertSong('s3', 'Glory To The Lamb');
});

interface Captured { headers?: Record<string, string>; body?: any }

function mockPicker(status: number, reply: unknown, captured: Captured = {}, times = 1) {
  fetchMock
    .get(PICKER_ORIGIN)
    .intercept({
      path: PICK_PATH,
      method: 'POST',
      headers: (h: Record<string, string>) => { captured.headers = h; return true; },
      body: (b: string) => { captured.body = JSON.parse(b); return true; },
    })
    .reply(status, typeof reply === 'string' ? reply : JSON.stringify(reply))
    .times(times);
  return captured;
}

function pick(body: unknown, ip = '192.0.2.1', token: string | null = 'test-token') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': ip };
  if (token) headers['X-Turnstile-Token'] = token;
  return SELF.fetch('http://localhost/theme-pick', { method: 'POST', headers, body: JSON.stringify(body) });
}

async function quota(ip = '192.0.2.1') {
  const res = await SELF.fetch('http://localhost/theme-pick/quota', { headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip } });
  return (await res.json()) as { remaining: number; limit: number; resetsAt: string };
}

const GOOD = { picks: [{ id: 's1', section: 'opening', reason: 'shout' }, { id: 's3', section: 'close', reason: 'glory' }] };
const VALID = { theme: 'Let us glorify God', count: 2 };

beforeEach(async () => {
  fetchMock.activate();
  fetchMock.enableNetConnect();
  await env.SESSION_KV.delete('themepick:catalogue:v1');
});

afterEach(() => {
  fetchMock.deactivate();
});

describe('POST /theme-pick input validation', () => {
  it.each([
    [{ theme: 'x', count: 0 }],
    [{ theme: 'x', count: 21 }],
    [{ theme: 'x', count: 2.5 }],
    [{ theme: 'x', count: '10' }],
    [{ theme: '   ', count: 5 }],
    [{ theme: 'x'.repeat(201), count: 5 }],
    [{ theme: 'x', count: 5, exclude: Array.from({ length: 101 }, (_, i) => `id${i}`) }],
    [{ theme: 'x', count: 5, exclude: [1, 2] }],
  ])('400 invalid_input for %j', async (body) => {
    const res = await pick(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_input' });
  });

  it('403 without a Turnstile token', async () => {
    const res = await pick(VALID, '192.0.2.1', null);
    expect(res.status).toBe(403);
  });
});

describe('POST /theme-pick success', () => {
  it('returns validated picks, remaining 4, and calls the picker with key and filtered catalogue', async () => {
    const captured = mockPicker(200, GOOD);
    const res = await pick({ ...VALID, exclude: ['s2'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      picks: [
        { id: 's1', title: 'Shout To The Lord', artist: 'Artist', section: 'opening', reason: 'shout' },
        { id: 's3', title: 'Glory To The Lamb', artist: 'Artist', section: 'close', reason: 'glory' },
      ],
      remaining: 4,
    });
    expect(captured.headers?.['x-picker-key']).toBe('test-picker-key');
    expect(captured.body.theme).toBe('Let us glorify God');
    expect(captured.body.count).toBe(2);
    expect(captured.body.songs.map((s: { id: string }) => s.id).sort()).toEqual(['s1', 's3']);
    expect(captured.body.songs[0]).toHaveProperty('excerpt');
    expect((await quota()).remaining).toBe(4);
  });
});

describe('POST /theme-pick failures use no pick', () => {
  it('503 picker_unavailable when the picker returns 503', async () => {
    mockPicker(503, '<html>asleep</html>');
    const res = await pick(VALID);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'picker_unavailable' });
    expect((await quota()).remaining).toBe(5);
  });

  it('502 picker_bad_output when the reply is not JSON', async () => {
    mockPicker(200, 'not json');
    const res = await pick(VALID);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'picker_bad_output' });
    expect((await quota()).remaining).toBe(5);
  });

  it('502 picker_bad_output when no pick survives validation', async () => {
    mockPicker(200, { picks: [{ id: 'nope', section: 'opening', reason: 'r' }] });
    const res = await pick(VALID);
    expect(res.status).toBe(502);
    expect((await quota()).remaining).toBe(5);
  });
});

describe('limits', () => {
  it('429 daily_limit with resetsAt after 5 successful picks; another IP still works', async () => {
    mockPicker(200, GOOD, {}, 6);
    for (let i = 0; i < 5; i++) expect((await pick(VALID, '192.0.2.9')).status).toBe(200);
    const res = await pick(VALID, '192.0.2.9');
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; resetsAt: string };
    expect(body.error).toBe('daily_limit');
    expect(body.resetsAt).toMatch(/T00:00:00\.000Z$/);
    expect((await pick(VALID, '192.0.2.10')).status).toBe(200);
  });

  it('429 global_limit when the global counter is full', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await env.SESSION_KV.put(`themepick:global:${day}`, '200');
    const res = await pick(VALID, '192.0.2.20');
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'global_limit' });
  });
});

describe('GET /theme-pick/quota', () => {
  it('reports 5 for a new IP with limit and resetsAt', async () => {
    const q = await quota('192.0.2.30');
    expect(q).toMatchObject({ remaining: 5, limit: 5 });
    expect(q.resetsAt).toMatch(/T00:00:00\.000Z$/);
  });
});

describe('attempt cap (bounds credit spend from failed calls)', () => {
  it('a failed call counts as an attempt but not a pick', async () => {
    mockPicker(503, 'asleep');
    await pick(VALID, '192.0.2.40');
    const day = new Date().toISOString().slice(0, 10);
    expect(await env.SESSION_KV.get(`themepick:attempts:ip:192.0.2.40:${day}`)).toBe('1');
    expect((await quota('192.0.2.40')).remaining).toBe(5);
  });

  it('429 daily_limit once an IP has used 15 attempts, without calling the picker', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await env.SESSION_KV.put(`themepick:attempts:ip:192.0.2.41:${day}`, '15');
    const res = await pick(VALID, '192.0.2.41');
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'daily_limit' });
  });

  it('429 global_limit once global attempts reach 3× the global cap', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await env.SESSION_KV.put(`themepick:attempts:global:${day}`, '600');
    const res = await pick(VALID, '192.0.2.42');
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'global_limit' });
  });
});
