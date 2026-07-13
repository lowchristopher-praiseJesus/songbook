import { describe, it, expect, beforeAll } from 'vitest';
import { SELF, env } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

interface Result {
  id: string; title: string; artist: string; keyIndex: number | null;
  capo: number | null; tempo: number | null;
  collectionName: string; publisherName: string; importCount: number;
}

// /community/publish is rate-limited to 5/hour per IP (test/rateLimit.test.ts). This file's
// beforeAll needs 6 successful publishes, all in one back-to-back run, so they're split across
// two distinct CF-Connecting-IP values to stay under that unrelated limit.
const SEED_IP_A = '203.0.113.50';
const SEED_IP_B = '203.0.113.51';

async function publish(collectionName: string, publisherName: string, songs: unknown[], ip = SEED_IP_A) {
  const res = await SELF.fetch('http://localhost/community/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ collectionName, publisherName, songs }),
  });
  expect(res.status).toBe(201);
}

async function search(q: string): Promise<Result[]> {
  const res = await SELF.fetch(`http://localhost/community/search?q=${encodeURIComponent(q)}`, { headers: { Origin: ORIGIN } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: Result[] }).results;
}

beforeAll(async () => {
  // Five distinct arrangements of one song (different bodies → different content hashes,
  // same group_key), plus one unrelated song.
  for (let i = 0; i < 5; i++) {
    await publish(`Set ${i}`, `Church ${i}`, [
      { title: 'How Great Is Our God', artist: 'Chris Tomlin', keyIndex: i, capo: 0, body: `The [G]splendor of a king ${'la '.repeat(i + 1)}` },
    ]);
  }
  await publish('Other', 'Someone', [
    { title: 'Oceans', artist: 'Hillsong', keyIndex: 2, capo: 2, tempo: 70, body: 'You call me [D]out upon the waters' },
  ], SEED_IP_B);

  // Make arrangement keyIndex=3 the most-imported so the cap keeps a predictable winner.
  await env.DB.prepare('UPDATE songs SET import_count = 99 WHERE key_index = 3 AND title = ?')
    .bind('How Great Is Our God').run();
});

describe('GET /community/search', () => {
  it('finds a song by title', async () => {
    const results = await search('oceans');
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({
      title: 'Oceans', artist: 'Hillsong', keyIndex: 2, capo: 2, tempo: 70,
      collectionName: 'Other', publisherName: 'Someone', importCount: 0,
    });
    expect(results[0].id).toBeTruthy();
  });

  it('finds a song by a lyric line, not just the title', async () => {
    const results = await search('waters');
    expect(results.map(r => r.title)).toContain('Oceans');
  });

  it('caps arrangements at 3 per song', async () => {
    const results = await search('splendor');
    expect(results.length).toBe(3);
    expect(new Set(results.map(r => r.title))).toEqual(new Set(['How Great Is Our God']));
  });

  it('keeps the most-imported arrangement when capping', async () => {
    const results = await search('splendor');
    expect(results.map(r => r.keyIndex)).toContain(3);
  });

  it('returns an empty list rather than erroring on a punctuation-only query', async () => {
    const res = await SELF.fetch('http://localhost/community/search?q=%21%21%21', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it('returns an empty list rather than erroring on FTS operator characters', async () => {
    const results = await search('oceans OR *');
    expect(Array.isArray(results)).toBe(true);
  });

  it('excludes removed songs', async () => {
    await env.DB.prepare("UPDATE songs SET status = 'removed' WHERE title = ?").bind('Oceans').run();
    const results = await search('oceans');
    expect(results.length).toBe(0);
    await env.DB.prepare("UPDATE songs SET status = 'live' WHERE title = ?").bind('Oceans').run();
  });
});
