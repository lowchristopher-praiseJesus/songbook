import { describe, it, expect } from 'vitest'
import { detectChordFixes, applyChordFixes } from '../chordLineDetector'

describe('detectChordFixes', () => {
  it('returns empty array for text with no chord-above-lyric lines', () => {
    const text = '{c: Verse}\n[F]Cele[Bb]brate Jesus'
    expect(detectChordFixes(text)).toEqual([])
  })

  it('skips blank lines and section headers', () => {
    expect(detectChordFixes('{c: Verse}\n\nHello world')).toEqual([])
  })

  it('skips already-bracketed pure chord lines', () => {
    expect(detectChordFixes('[F]    [Bb]    [C]\nCelebrate Jesus')).toEqual([])
  })

  it('detects a chord line followed by a lyric line as a merge', () => {
    const text = '{c: Verse}\nF   Bb   C\nCelebrate Jesus celebrate.'
    const results = detectChordFixes(text)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ type: 'merge', chordLineIndex: 1, lyricLineIndex: 2 })
    expect(results[0].proposed).toBe('[F]Cele[Bb]brate[C] Jesus celebrate.')
  })

  it('detects a trailing chord line with no following lyric as standalone', () => {
    const text = '{c: Intro}\nG  D  Em  C'
    const results = detectChordFixes(text)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ type: 'standalone', lineIndex: 1 })
    expect(results[0].proposed).toBe('[G]    [D]    [Em]    [C]')
  })

  it('detects a chord line followed by another chord line as standalone', () => {
    const text = 'F  Bb\nG  D\nCelebrate'
    const results = detectChordFixes(text)
    expect(results[0]).toMatchObject({ type: 'standalone', lineIndex: 0 })
  })

  it('detects a chord line followed by a blank line as standalone', () => {
    const text = 'F  Bb\n\nCelebrate'
    const results = detectChordFixes(text)
    expect(results[0]).toMatchObject({ type: 'standalone', lineIndex: 0 })
  })

  it('detects a chord line followed by a header as standalone', () => {
    const text = 'F  Bb\n{c: Chorus}'
    const results = detectChordFixes(text)
    expect(results[0]).toMatchObject({ type: 'standalone', lineIndex: 0 })
  })

  it('handles a decorated chord line with pipes and a free-text repeat annotation', () => {
    const text = 'F   Bb   C   F        Bb|C (To Repeat)\nCelebrate Jesus celebrate.'
    const results = detectChordFixes(text)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('merge')
    expect(results[0].proposed.match(/\[([^\]]+)\]/g)).toEqual(['[F]', '[Bb]', '[C]', '[F]', '[Bb]', '[C]'])
  })

  it('detects multiple independent chord/lyric pairs in one song', () => {
    const text = 'F   Bb   C\nCelebrate Jesus celebrate.\nG   D\nSing along'
    const results = detectChordFixes(text)
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ type: 'merge', chordLineIndex: 0, lyricLineIndex: 1 })
    expect(results[1]).toMatchObject({ type: 'merge', chordLineIndex: 2, lyricLineIndex: 3 })
  })
})

describe('applyChordFixes', () => {
  it('merges the chord line into the lyric line and removes the chord line', () => {
    const text = '{c: Verse}\nF   Bb   C\nCelebrate Jesus celebrate.'
    const detections = detectChordFixes(text)
    const result = applyChordFixes(text, detections)
    expect(result).toBe('{c: Verse}\n[F]Cele[Bb]brate[C] Jesus celebrate.')
  })

  it('converts a standalone chord line to bracketed form', () => {
    const text = '{c: Intro}\nG  D  Em  C'
    const detections = detectChordFixes(text)
    const result = applyChordFixes(text, detections)
    expect(result).toBe('{c: Intro}\n[G]    [D]    [Em]    [C]')
  })

  it('leaves unselected detections untouched', () => {
    const text = 'F   Bb   C\nCelebrate Jesus celebrate.\nG   D\nSing along'
    const detections = detectChordFixes(text)
    const result = applyChordFixes(text, [detections[1]])
    expect(result).toBe('F   Bb   C\nCelebrate Jesus celebrate.\n[G]Sing[D] along')
  })

  it('handles empty detections gracefully', () => {
    const text = '{c: Verse}\nContent'
    expect(applyChordFixes(text, [])).toBe(text)
  })
})
