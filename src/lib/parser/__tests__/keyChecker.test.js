import { describe, it, expect } from 'vitest'
import { checkKey } from '../keyChecker'

describe('checkKey', () => {
  it('detects a clear key mismatch (B major chords declared as C)', () => {
    const rawText = '[B]one [E]two [F#]three [G#m]four\n[B]one [E]two [F#]three [G#m]four'
    const result = checkKey(rawText, 'C')

    expect(result.keyMatches).toBe(false)
    expect(result.detectedKey).toBe('B')
    expect(result.totalChords).toBe(8)
    expect(result.outlierChords).toHaveLength(4)
    const byChord = Object.fromEntries(result.outlierChords.map(o => [o.chord, o.count]))
    expect(byChord).toEqual({ B: 2, E: 2, 'F#': 2, 'G#m': 2 })
  })

  it('flags a single non-diatonic chord in an otherwise clean C major progression', () => {
    const rawText = '[C]Amazing [F]grace how [G]sweet the [Am]sound\n[C]that saved a [E]wretch like me'
    const result = checkKey(rawText, 'C')

    expect(result.keyMatches).toBe(true)
    expect(result.detectedKey).toBe('C')
    expect(result.totalChords).toBe(6)
    expect(result.outlierChords).toEqual([
      { chord: 'E', count: 1, exampleLine: 1, exampleText: '[C]that saved a [E]wretch like me' },
    ])
  })

  it('returns a neutral result when there are no chords', () => {
    const result = checkKey('Just some lyrics, no chords at all.', 'D')

    expect(result.totalChords).toBe(0)
    expect(result.keyMatches).toBe(true)
    expect(result.detectedKey).toBe('D')
    expect(result.outlierChords).toEqual([])
  })

  it('resolves slash chords by their root, ignoring the bass note', () => {
    const rawText = '[C]Test [G/B]walk [Am]down [F]here'
    const result = checkKey(rawText, 'C')

    expect(result.outlierChords).toEqual([])
    expect(result.keyMatches).toBe(true)
  })

  it('prefers the stated key when scores tie (ambiguous short song)', () => {
    const rawText = '[C]Hello [G]world'
    const result = checkKey(rawText, 'C')

    expect(result.keyMatches).toBe(true)
    expect(result.detectedKey).toBe('C')
    expect(result.outlierChords).toEqual([])
  })
})
