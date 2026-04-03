import { describe, it, expect } from 'vitest'
import { buildGroups, buildNavOrder } from '../collectionUtils'

const index = [
  { id: 'a', title: 'Amazing Grace', artist: 'Traditional', collectionId: 'c1' },
  { id: 'b', title: 'Blessed Be', artist: 'Matt Redman', collectionId: 'c1' },
  { id: 'c', title: 'El Shaddai', artist: 'Amy Grant', collectionId: 'c2' },
]
const collections = [
  { id: 'c1', name: 'Sunday Set', songIds: ['b', 'a'] },
  { id: 'c2', name: 'Worship', songIds: ['c'] },
]

describe('buildNavOrder', () => {
  it('returns collection order when viewMode is "collections"', () => {
    const order = buildNavOrder(index, collections, 'collections')
    expect(order.map(e => e.id)).toEqual(['b', 'a', 'c'])
  })

  it('returns A-Z order when viewMode is "allSongs"', () => {
    const order = buildNavOrder(index, collections, 'allSongs')
    expect(order.map(e => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('allSongs order is case-insensitive', () => {
    const idx = [
      { id: '1', title: 'zebra', artist: '', collectionId: null },
      { id: '2', title: 'Apple', artist: '', collectionId: null },
      { id: '3', title: 'mango', artist: '', collectionId: null },
    ]
    const order = buildNavOrder(idx, [], 'allSongs')
    expect(order.map(e => e.title)).toEqual(['Apple', 'mango', 'zebra'])
  })

  it('does not mutate the index array', () => {
    const idx = [
      { id: 'z', title: 'Zebra', artist: '', collectionId: null },
      { id: 'a', title: 'Apple', artist: '', collectionId: null },
    ]
    const original = [...idx]
    buildNavOrder(idx, [], 'allSongs')
    expect(idx).toEqual(original)
  })
})

describe('buildGroups', () => {
  it('returns groups with entries from collections', () => {
    const groups = buildGroups(index, collections)
    expect(groups).toHaveLength(2)
    expect(groups[0].name).toBe('Sunday Set')
    expect(groups[0].entries.map(e => e.id)).toEqual(['b', 'a'])
  })

  it('prepends uncategorized group for songs with no collectionId', () => {
    const idx = [...index, { id: 'u', title: 'Uncategorized Song', artist: '', collectionId: null }]
    const groups = buildGroups(idx, collections)
    expect(groups[0].id).toBe('__uncategorized__')
    expect(groups[0].entries[0].id).toBe('u')
  })
})
