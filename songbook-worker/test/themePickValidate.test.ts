import { describe, it, expect } from 'vitest';
import { validatePicks } from '../src/lib/themePickValidate';
import type { CatalogueEntry } from '../src/lib/themeCatalogue';

const e = (id: string, title: string, artist = ''): CatalogueEntry => ({ id, title, artist, excerpt: '' });
const cat = [e('a', 'Shout To The Lord'), e('b', 'Holy Forever', 'Chris Tomlin'), e('c', 'Glory To The Lamb')];
const p = (id: string, section = 'opening') => ({ id, section, reason: 'r' });

describe('validatePicks', () => {
  it('keeps valid picks in order with title and artist from the catalogue', () => {
    const out = validatePicks({ picks: [{ id: 'b', section: 'close', reason: 'r', title: 'WRONG' }, p('a')] }, cat, [], 3);
    expect(out).toEqual([
      { id: 'b', title: 'Holy Forever', artist: 'Chris Tomlin', section: 'close', reason: 'r' },
      { id: 'a', title: 'Shout To The Lord', artist: '', section: 'opening', reason: 'r' },
    ]);
  });

  it('drops unknown ids, duplicates, excluded ids and bad sections', () => {
    const raw = { picks: [p('zz'), p('a'), p('a'), p('c'), { ...p('b'), section: 'bridge' }] };
    expect(validatePicks(raw, cat, ['c'], 5).map(x => x.id)).toEqual(['a']);
  });

  it('caps at count even when the AI returns more', () => {
    expect(validatePicks({ picks: [p('a'), p('b'), p('c')] }, cat, [], 2)).toHaveLength(2);
  });

  it('returns fewer than count when that is all that is valid', () => {
    expect(validatePicks({ picks: [p('a')] }, cat, [], 10)).toHaveLength(1);
  });

  it('returns [] for malformed input', () => {
    expect(validatePicks(null, cat, [], 3)).toEqual([]);
    expect(validatePicks('x', cat, [], 3)).toEqual([]);
    expect(validatePicks({ picks: 'x' }, cat, [], 3)).toEqual([]);
    expect(validatePicks({ picks: [{ id: 'a', section: 'opening', reason: 5 }] }, cat, [], 3)).toEqual([]);
    expect(validatePicks({ picks: [null, 3] }, cat, [], 3)).toEqual([]);
  });

  it('truncates reason to 200 characters', () => {
    const out = validatePicks({ picks: [{ id: 'a', section: 'middle', reason: 'x'.repeat(500) }] }, cat, [], 1);
    expect(out[0].reason).toHaveLength(200);
  });
});
