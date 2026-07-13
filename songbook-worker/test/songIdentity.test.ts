import { describe, it, expect } from 'vitest';
import {
  stripChords, stripNotes, normalizeBody, groupKey, contentHash, toFtsQuery,
} from '../src/lib/songIdentity';

describe('stripChords', () => {
  it('removes inline chord tokens but keeps the lyric', () => {
    expect(stripChords('El Shad[Dm]dai')).toBe('El Shaddai');
  });

  it('reduces a pure chord line to whitespace', () => {
    expect(stripChords('[Dm]   [G]  [C]').trim()).toBe('');
  });
});

describe('stripNotes', () => {
  it('removes a {note:} line entirely, leaving no blank line', () => {
    expect(stripNotes('a\n{note: Sarah leads}\nb\n')).toBe('a\nb\n');
  });
});

describe('normalizeBody', () => {
  it('collapses whitespace so cosmetic spacing does not change identity', () => {
    expect(normalizeBody('a  \n\n  b')).toBe(normalizeBody('a\nb'));
  });
});

describe('groupKey', () => {
  it('is case- and punctuation-insensitive', () => {
    expect(groupKey('How Great Is Our God!', 'Chris Tomlin'))
      .toBe(groupKey('how great is our god', 'chris tomlin'));
  });

  it('strips trailing parentheticals like (Live)', () => {
    expect(groupKey('Build My Life (Live)', 'Housefires'))
      .toBe(groupKey('Build My Life', 'Housefires'));
  });

  it('separates title from artist so they cannot bleed into each other', () => {
    expect(groupKey('a b', 'c')).not.toBe(groupKey('a', 'b c'));
  });
});

describe('contentHash', () => {
  it('is stable for identical input', async () => {
    expect(await contentHash('T', 'A', 'x')).toBe(await contentHash('T', 'A', 'x'));
  });

  it('ignores cosmetic whitespace differences', async () => {
    expect(await contentHash('T', 'A', 'a  \n\n b')).toBe(await contentHash('T', 'A', 'a\nb'));
  });

  it('differs when the chords differ', async () => {
    expect(await contentHash('T', 'A', '[G]la')).not.toBe(await contentHash('T', 'A', '[C]la'));
  });
});

describe('toFtsQuery', () => {
  it('quotes each term so FTS5 cannot choke on punctuation', () => {
    expect(toFtsQuery('how great!')).toBe('"how" "great"');
  });

  it('drops characters that would be parsed as FTS operators', () => {
    expect(toFtsQuery('a OR b*')).toBe('"a" "OR" "b"');
  });

  it('returns an empty string for an all-punctuation query', () => {
    expect(toFtsQuery('!!!')).toBe('');
  });
});
