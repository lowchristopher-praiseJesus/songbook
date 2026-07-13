import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('community schema', () => {
  it('creates the songs table', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='songs'"
    ).all();
    expect(results.length).toBe(1);
  });

  it('creates an FTS5 index that can be matched against', async () => {
    await env.DB.prepare(
      "INSERT INTO songs_fts (song_id, title, artist, lyrics_only) VALUES (?, ?, ?, ?)"
    ).bind('s1', 'How Great Is Our God', 'Chris Tomlin', 'the splendor of a king').run();

    const { results } = await env.DB.prepare(
      "SELECT song_id FROM songs_fts WHERE songs_fts MATCH ?"
    ).bind('splendor').all();
    expect(results).toEqual([{ song_id: 's1' }]);
  });
});
