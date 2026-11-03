import { describe, it, expect } from 'vitest'
import { insertIntoSet, displayTitle, findLibraryMatch } from '../addSongsToSet'

describe('insertIntoSet', () => {
  it('appends at the end and keeps appending', () => {
    let r = insertIntoSet(['a', 'b'], 'x', 'end')
    expect(r.songIds).toEqual(['a', 'b', 'x'])
    r = insertIntoSet(r.songIds, 'y', r.anchor)
    expect(r.songIds).toEqual(['a', 'b', 'x', 'y'])
  })

  it('inserts at the start, then keeps later adds in the order they were added', () => {
    let r = insertIntoSet(['a', 'b'], 'x', 'start')
    expect(r.songIds).toEqual(['x', 'a', 'b'])
    r = insertIntoSet(r.songIds, 'y', r.anchor)
    expect(r.songIds).toEqual(['x', 'y', 'a', 'b'])
  })

  it('inserts after a chosen song, then after the previous add', () => {
    let r = insertIntoSet(['a', 'b', 'c'], 'x', 'a')
    expect(r.songIds).toEqual(['a', 'x', 'b', 'c'])
    r = insertIntoSet(r.songIds, 'y', r.anchor)
    expect(r.songIds).toEqual(['a', 'x', 'y', 'b', 'c'])
  })

  it('falls back to the end when the anchor song is no longer in the set', () => {
    const r = insertIntoSet(['a', 'b'], 'x', 'gone')
    expect(r.songIds).toEqual(['a', 'b', 'x'])
  })

  it('does not add a song that is already in the set', () => {
    const r = insertIntoSet(['a', 'b'], 'a', 'end')
    expect(r.songIds).toEqual(['a', 'b'])
  })
})

describe('displayTitle', () => {
  it('strips Ultimate Guitar "Chords ver. N" and "Chords by Artist" suffixes', () => {
    expect(displayTitle('Way Maker Chords ver. 2')).toBe('Way Maker')
    expect(displayTitle('Way Maker Chords by Sinach')).toBe('Way Maker')
    expect(displayTitle('Oceans')).toBe('Oceans')
  })
})

describe('findLibraryMatch', () => {
  const index = [
    { id: 's1', title: 'Way Maker', artist: 'Sinach' },
    { id: 's2', title: 'Oceans', artist: 'Hillsong' },
  ]

  it('matches an online result to a library song by title, ignoring case, spacing and UG suffixes', () => {
    expect(findLibraryMatch(index, '  way maker Chords ver. 1')?.id).toBe('s1')
  })

  it('returns null when no library song has that title', () => {
    expect(findLibraryMatch(index, 'Goodness of God')).toBeNull()
  })
})
