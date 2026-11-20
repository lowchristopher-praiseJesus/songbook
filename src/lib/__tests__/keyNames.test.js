import { describe, it, expect } from 'vitest'
import { keyNameForIndex, withSyncedKeyName } from '../keyNames'

describe('keyNameForIndex', () => {
  it('maps C-based indices to the app key names', () => {
    expect(keyNameForIndex(0)).toBe('C')
    expect(keyNameForIndex(7)).toBe('G')
    expect(keyNameForIndex(10)).toBe('Bb')
  })

  it('wraps out-of-range indices', () => {
    expect(keyNameForIndex(12)).toBe('C')
    expect(keyNameForIndex(-1)).toBe('B')
  })
})

describe('withSyncedKeyName', () => {
  it('rewrites a stale key name to match keyIndex (keyIndex wins)', () => {
    expect(withSyncedKeyName({ keyIndex: 7, key: 'C' }).key).toBe('G')
  })

  it('fills in a missing key name', () => {
    expect(withSyncedKeyName({ keyIndex: 2 }).key).toBe('D')
  })

  it('keeps an enharmonic spelling that already matches keyIndex', () => {
    const meta = { keyIndex: 1, key: 'C#' }
    expect(withSyncedKeyName(meta)).toBe(meta)
  })

  it('keeps a matching minor key name', () => {
    const meta = { keyIndex: 9, key: 'Am', isMinor: true }
    expect(withSyncedKeyName(meta)).toBe(meta)
  })

  it('leaves meta without a numeric keyIndex untouched', () => {
    const meta = { key: 'E' }
    expect(withSyncedKeyName(meta)).toBe(meta)
  })
})
