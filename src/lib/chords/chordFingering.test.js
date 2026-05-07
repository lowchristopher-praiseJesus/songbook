import { describe, test, expect } from 'vitest'
import { chordFingering, resolveChordKey } from './chordFingering'

describe('chordFingering', () => {
  test('returns voicing for a standard chord', () => {
    const result = chordFingering('C')
    expect(result).not.toBeNull()
    expect(Array.isArray(result.frets)).toBe(true)
    expect(result.frets).toHaveLength(6)
    expect(typeof result.baseFret).toBe('number')
    expect(Array.isArray(result.barres)).toBe(true)
  })

  test('returns null for an unrecognised chord', () => {
    expect(chordFingering('Zzzz')).toBeNull()
    expect(chordFingering('')).toBeNull()
    expect(chordFingering(null)).toBeNull()
  })

  test('applies enharmonic alias G# → Ab', () => {
    expect(chordFingering('G#')).toEqual(chordFingering('Ab'))
  })

  test('applies enharmonic alias C# → Db', () => {
    expect(chordFingering('C#')).toEqual(chordFingering('Db'))
  })

  test('applies suffix alias sus4 → sus', () => {
    expect(chordFingering('Csus4')).toEqual(chordFingering('Csus'))
  })

  test('strips slash bass and returns root voicing when no slash voicing exists', () => {
    // C/Zzz has no dedicated voicing → falls back to C
    expect(chordFingering('C/Zzz')).toEqual(chordFingering('C'))
  })
})

describe('resolveChordKey', () => {
  test('returns the chord name for a known chord', () => {
    expect(resolveChordKey('C')).toBe('C')
    expect(resolveChordKey('Am')).toBe('Am')
  })

  test('returns root key when slash chord falls back to root', () => {
    expect(resolveChordKey('C/Zzz')).toBe('C')
  })

  test('returns null for an unknown chord', () => {
    expect(resolveChordKey('Zzzz')).toBeNull()
    expect(resolveChordKey(null)).toBeNull()
  })
})
