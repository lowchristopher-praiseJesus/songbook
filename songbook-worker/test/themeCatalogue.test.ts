import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { normalizeTitle, lyricExcerpt, buildCatalogue } from '../src/lib/themeCatalogue';

const CACHE_KEY = 'themepick:catalogue:v1';

async function insertSong(id: string, title: string, artist: string, body: string, importCount = 0, publishedAt = 1, status = 'live') {
  await env.DB.prepare(
    `INSERT INTO songs (id, content_hash, group_key, title, artist, body, first_published_at, import_count, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, `hash-${id}`, `${title}|${artist}`, title, artist, body, publishedAt, importCount, status).run();
}

beforeAll(async () => {
  await insertSong('holy-1', 'Holy Forever', 'Chris Tomlin', '[G]A thousand generations', 1, 10);
  await insertSong('holy-2', 'Holy Forever (Kenneth)', 'Unknown', '[G]A thousand generations falling', 2, 5);
  await insertSong('shout', 'Shout To The Lord - G', 'Darlene', '{c: Verse}\n[A]Shout to the Lord all the earth', 0, 1);
  await insertSong('gone', 'Removed Song', 'X', 'gone', 50, 1, 'removed');
});

beforeEach(async () => {
  await env.SESSION_KV.delete(CACHE_KEY);
});

describe('normalizeTitle', () => {
  it.each([
    ['Holy Forever', 'holy forever'],
    ['What A Beautiful Name (Kenneth)', 'what a beautiful name'],
    ['Raise A Hallelujah 260712 PLQ', 'raise a hallelujah'],
    ['Shout To The Lord - G', 'shout to the lord'],
    ['1 Beauty Of Holiness++', '1 beauty of holiness'],
    ['Great Things (Short Version)', 'great things'],
    ['Just As I Am (DnEd) (Viv)', 'just as i am'],
  ])('%s → %s', (input, out) => {
    expect(normalizeTitle(input)).toBe(out);
  });
});

describe('lyricExcerpt', () => {
  it('strips chords and directives and collapses whitespace', () => {
    expect(lyricExcerpt('{c: Verse}\n[G]Bless the [C]Lord   o my soul')).toBe('Bless the Lord o my soul');
  });

  it('caps length at 400 by default', () => {
    expect(lyricExcerpt('a '.repeat(500)).length).toBeLessThanOrEqual(400);
  });
});

describe('buildCatalogue', () => {
  it('keeps one entry per normalised title, highest import_count wins', async () => {
    const cat = await buildCatalogue(env);
    const holy = cat.filter(e => normalizeTitle(e.title) === 'holy forever');
    expect(holy).toHaveLength(1);
    expect(holy[0].id).toBe('holy-2');
  });

  it('builds entries with an excerpt and no chords', async () => {
    const cat = await buildCatalogue(env);
    expect(cat.find(e => e.id === 'shout')).toEqual({
      id: 'shout', title: 'Shout To The Lord - G', artist: 'Darlene', excerpt: 'Shout to the Lord all the earth',
    });
  });

  it('excludes songs whose status is not live', async () => {
    const cat = await buildCatalogue(env);
    expect(cat.some(e => e.id === 'gone')).toBe(false);
  });

  it('serves from the KV cache on the second call', async () => {
    const first = await buildCatalogue(env);
    await env.DB.prepare("UPDATE songs SET title = 'Changed' WHERE id = 'shout'").run();
    expect(await buildCatalogue(env)).toEqual(first);
    await env.DB.prepare("UPDATE songs SET title = 'Shout To The Lord - G' WHERE id = 'shout'").run();
  });
});
