import { describe, it, expect } from 'vitest'
import { isChordLine, mergeChordAboveLyric, toPureChordLine } from '../chordLineUtils'

describe('isChordLine', () => {
  it('detects a simple two-chord line', () => {
    expect(isChordLine('G       D')).toBe(true)
  })

  it('detects a single chord line', () => {
    expect(isChordLine('C')).toBe(true)
  })

  it('rejects a plain lyric line', () => {
    expect(isChordLine('Hello world')).toBe(false)
  })

  it('rejects a blank line', () => {
    expect(isChordLine('   ')).toBe(false)
  })

  it('rejects a line with inline bracketed chords', () => {
    expect(isChordLine('[F]Cele[Bb]brate [C]Jesus [F]celebrate.')).toBe(false)
  })

  it('detects chords with a numeric repeat annotation in parens', () => {
    expect(isChordLine('Dm   Am   (2x)')).toBe(true)
  })

  it('detects chords with a free-text repeat annotation and pipe-joined chords', () => {
    expect(isChordLine('F   Bb   C   F        Bb|C (To Repeat)')).toBe(true)
  })

  it('rejects a line that is only rhythm/annotation markers with no real chords', () => {
    expect(isChordLine('- - | (2x)')).toBe(false)
  })
})

describe('mergeChordAboveLyric', () => {
  it('inserts a single chord at the start of the lyric', () => {
    expect(mergeChordAboveLyric('G', 'Hello')).toBe('[G]Hello')
  })

  it('inserts chords at matching column positions', () => {
    const merged = mergeChordAboveLyric('Am              E7', 'On a dark desert highway')
    expect(merged).toBe('[Am]On a dark desert[E7] highway')
  })

  it('pads a lyric line shorter than the chord line', () => {
    const merged = mergeChordAboveLyric('G       D', 'Hi')
    expect(merged).toBe(`[G]Hi${' '.repeat(6)}[D]`)
  })

  it('splits pipe-joined chords and drops repeat annotations', () => {
    const merged = mergeChordAboveLyric('F   Bb   C   F        Bb|C (To Repeat)', 'Celebrate Jesus celebrate.')
    expect(merged.match(/\[([^\]]+)\]/g)).toEqual(['[F]', '[Bb]', '[C]', '[F]', '[Bb]', '[C]'])
  })
})

describe('toPureChordLine', () => {
  it('converts plain chord tokens to bracketed form', () => {
    expect(toPureChordLine('G  D  Em  C')).toBe('[G]    [D]    [Em]    [C]')
  })

  it('drops decorations and keeps only chords', () => {
    expect(toPureChordLine('F   Bb   C   F        Bb|C (To Repeat)'))
      .toBe('[F]    [Bb]    [C]    [F]    [Bb]    [C]')
  })
})
