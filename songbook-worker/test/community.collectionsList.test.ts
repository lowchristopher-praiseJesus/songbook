import { describe, it, expect, beforeAll } from 'vitest';
import { SELF, env } from 'cloudflare:test';

const ORIGIN = 'http://localhost:5173';

interface CollectionResult {
  id: string; collectionName: string; publisherName: string;
  songCount: number; createdAt: number;
}

async function publish(collectionName: string, publisherName: string, songs: unknown[], ip = '203.0.113.80') {
  const res = await SELF.fetch('http://localhost/community/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Turnstile-Token': 'test-token', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ collectionName, publisherName, songs }),
  });
  expect(res.status).toBe(201);
}

async function listCollections(): Promise<CollectionResult[]> {
  const res = await SELF.fetch('http://localhost/community/collections', { headers: { Origin: ORIGIN } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: CollectionResult[] }).results;
}

beforeAll(async () => {
  await publish('Judah Worship Set', 'First Baptist', [
    { title: 'List Song One', artist: 'Artist A', body: 'la [G]la' },
    { title: 'List Song Two', artist: 'Artist B', body: 'la [D]la' },
  ], '203.0.113.80');
  await publish('Easter Set', 'Grace Chapel', [
    { title: 'List Song Three', artist: 'Artist C', body: 'la [C]la' },
  ], '203.0.113.81');
});

describe('GET /community/collections', () => {
  it('returns published collections with song counts', async () => {
    const results = await listCollections();
    const judah = results.find(r => r.collectionName === 'Judah Worship Set');
    expect(judah).toMatchObject({ publisherName: 'First Baptist', songCount: 2 });
    expect(judah!.id).toBeTruthy();
    expect(typeof judah!.createdAt).toBe('number');

    const easter = results.find(r => r.collectionName === 'Easter Set');
    expect(easter).toMatchObject({ publisherName: 'Grace Chapel', songCount: 1 });
  });

  it('orders by song count descending, then most recent first', async () => {
    const results = await listCollections();
    const judahIndex = results.findIndex(r => r.collectionName === 'Judah Worship Set');
    const easterIndex = results.findIndex(r => r.collectionName === 'Easter Set');
    // Judah has 2 songs, Easter has 1 — Judah must rank first.
    expect(judahIndex).toBeLessThan(easterIndex);
  });

  it('excludes a collection whose songs were all individually removed', async () => {
    await publish('Orphaned Set', 'Someone', [
      { title: 'List Only Song', artist: 'A', body: 'la' },
    ], '203.0.113.82');
    await env.DB.prepare("UPDATE songs SET status = 'removed' WHERE title = ?").bind('List Only Song').run();

    const results = await listCollections();
    expect(results.map(r => r.collectionName)).not.toContain('Orphaned Set');
  });
});
