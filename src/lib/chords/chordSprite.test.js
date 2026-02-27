import { describe, it, expect } from 'vitest'
import { chordToSprite, SPRITE_W, SPRITE_H } from './chordSprite'

describe('chordToSprite', () => {
  it('returns correct position for C major', () => {
    // C is row 4, col 0  →  x=60, y=83+(4*116)=547
    expect(chordToSprite('C')).toEqual({ x: 60, y: 547 })
  })

  it('returns correct position for Am', () => {
    // A is row 1, col 1 (m)  →  x=140, y=83+(1*116)=199
    expect(chordToSprite('Am')).toEqual({ x: 140, y: 199 })
  })

  it('returns correct position for Cmaj7', () => {
    // C is row 4, col 7 (maj7)  →  x=618, y=547
    expect(chordToSprite('Cmaj7')).toEqual({ x: 618, y: 547 })
  })

  it('returns correct position for G', () => {
    // G is row 11, col 0  →  x=60, y=83+(11*116)=1359
    expect(chordToSprite('G')).toEqual({ x: 60, y: 1359 })
  })

  it('maps enharmonic G# to Ab row', () => {
    expect(chordToSprite('G#')).toEqual(chordToSprite('Ab'))
  })

  it('maps enharmonic C# to Db row', () => {
    expect(chordToSprite('C#m')).toEqual(chordToSprite('Dbm'))
  })

  it('strips slash bass before lookup (G/B → G)', () => {
    expect(chordToSprite('G/B')).toEqual(chordToSprite('G'))
  })

  it('normalises sus4 to sus', () => {
    expect(chordToSprite('Dsus4')).toEqual(chordToSprite('Dsus'))
  })

  it('normalises min to m', () => {
    expect(chordToSprite('Amin')).toEqual(chordToSprite('Am'))
  })

  it('returns null for unknown suffix', () => {
    expect(chordToSprite('Cadd9')).toBeNull()
  })

  it('returns null for unknown root', () => {
    expect(chordToSprite('H7')).toBeNull()
  })

  it('exports SPRITE_W=84 and SPRITE_H=116', () => {
    expect(SPRITE_W).toBe(84)
    expect(SPRITE_H).toBe(116)
  })
})
