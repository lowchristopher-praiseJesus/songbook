import { describe, it, expect, beforeAll } from 'vitest';
import { SELF, env } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

interface CollectionResult {
  id: string; collectionName: string; publisherName: string;
  songCount: number; createdAt: number;
}

async function publish(collectionName: string, publisherName: string, songs: unknown[], ip = '203.0.113.60') {
  const res = await SELF.fetch('http://localhost/community/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ collectionName, publisherName, songs }),
  });
  expect(res.status).toBe(201);
}

async function searchCollections(q: string): Promise<CollectionResult[]> {
  const res = await SELF.fetch(`http://localhost/community/collections/search?q=${encodeURIComponent(q)}`, { headers: { Origin: ORIGIN } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: CollectionResult[] }).results;
}

beforeAll(async () => {
  await publish('Judah Worship Set', 'First Baptist', [
    { title: 'Song One', artist: 'Artist A', body: 'la [G]la' },
    { title: 'Song Two', artist: 'Artist B', body: 'la [D]la' },
  ], '203.0.113.60');
  await publish('Easter Set', 'Grace Chapel', [
    { title: 'Song Three', artist: 'Artist C', body: 'la [C]la' },
  ], '203.0.113.61');
});

describe('GET /community/collections/search', () => {
  it('finds a collection by collection name', async () => {
    const results = await searchCollections('judah');
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({
      collectionName: 'Judah Worship Set', publisherName: 'First Baptist', songCount: 2,
    });
    expect(results[0].id).toBeTruthy();
    expect(typeof results[0].createdAt).toBe('number');
  });

  it('finds a collection by publisher name', async () => {
    const results = await searchCollections('grace chapel');
    expect(results.map(r => r.collectionName)).toContain('Easter Set');
  });

  it('returns [] for a blank query without erroring', async () => {
    const res = await SELF.fetch('http://localhost/community/collections/search?q=', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it('returns [] for a query that matches nothing', async () => {
    const results = await searchCollections('no-such-collection-xyz');
    expect(results).toEqual([]);
  });

  it('excludes a collection whose songs were all individually removed', async () => {
    await publish('Orphaned Set', 'Someone', [
      { title: 'Only Song', artist: 'A', body: 'la' },
    ], '203.0.113.62');
    await env.DB.prepare("UPDATE songs SET status = 'removed' WHERE title = ?").bind('Only Song').run();

    const results = await searchCollections('orphaned');
    expect(results).toEqual([]);
  });
});
