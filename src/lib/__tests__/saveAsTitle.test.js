import { describe, it, expect } from 'vitest'
import { resolveSaveAsTitle } from '../saveAsTitle'

describe('resolveSaveAsTitle', () => {
  it('appends " 1" when the title is unchanged', () => {
    expect(resolveSaveAsTitle('Amazing Grace', 'Amazing Grace', ['Amazing Grace'])).toBe('Amazing Grace 1')
  })

  it('increments past existing suffixed names', () => {
    expect(
      resolveSaveAsTitle('Amazing Grace', 'Amazing Grace', [
        'Amazing Grace',
        'Amazing Grace 1',
      ])
    ).toBe('Amazing Grace 2')
  })

  it('keeps incrementing until it finds a free slot', () => {
    expect(
      resolveSaveAsTitle('Amazing Grace', 'Amazing Grace', [
        'Amazing Grace',
        'Amazing Grace 1',
        'Amazing Grace 2',
        'Amazing Grace 3',
      ])
    ).toBe('Amazing Grace 4')
  })

  it('passes the user-renamed title through unchanged', () => {
    expect(resolveSaveAsTitle('Amazing Grace', 'Grace Amazing', ['Amazing Grace'])).toBe('Grace Amazing')
  })

  it('does not collision-check a user-renamed title', () => {
    // Even if the new name matches an existing song, it is returned as-is.
    expect(resolveSaveAsTitle('Amazing Grace', 'Father Hear', ['Amazing Grace', 'Father Hear'])).toBe('Father Hear')
  })

  it('ignores surrounding whitespace when comparing', () => {
    expect(resolveSaveAsTitle('Amazing Grace', '  Amazing Grace  ', ['Amazing Grace'])).toBe('Amazing Grace 1')
  })

  it('treats whitespace-only edits as unchanged', () => {
    expect(resolveSaveAsTitle('Amazing Grace', 'Amazing Grace ', ['Amazing Grace'])).toBe('Amazing Grace 1')
  })
})