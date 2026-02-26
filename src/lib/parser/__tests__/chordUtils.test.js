import { describe, it, expect } from 'vitest'
import { transposeChord, transposeSections } from '../chordUtils'

describe('transposeChord', () => {
  it('transposes G up 2 semitones to A', () => {
    expect(transposeChord('G', 2, false)).toBe('A')
  })

  it('transposes G down 1 semitone to F#', () => {
    expect(transposeChord('G', -1, false)).toBe('F#')
  })

  it('uses flat notation when usesFlats is true', () => {
    expect(transposeChord('G', -1, true)).toBe('Gb')
  })

  it('wraps around: B up 1 = C', () => {
    expect(transposeChord('B', 1, false)).toBe('C')
  })

  it('wraps around: C down 1 = B', () => {
    expect(transposeChord('C', -1, true)).toBe('B')
  })

  it('transposes chord with suffix: Am7 up 2 → Bm7', () => {
    expect(transposeChord('Am7', 2, false)).toBe('Bm7')
  })

  it('transposes chord with suffix: Fmaj7 up 2 → Gmaj7', () => {
    expect(transposeChord('Fmaj7', 2, false)).toBe('Gmaj7')
  })

  it('transposes slash chord: G/B up 2 → A/C#', () => {
    expect(transposeChord('G/B', 2, false)).toBe('A/C#')
  })

  it('handles flat root: Bb up 2 → C', () => {
    expect(transposeChord('Bb', 2, true)).toBe('C')
  })

  it('handles flat root: Eb down 1 → D', () => {
    expect(transposeChord('Eb', -1, true)).toBe('D')
  })

  it('returns 0 delta unchanged', () => {
    expect(transposeChord('Em', 0, false)).toBe('Em')
  })

  it('returns 0 delta unchanged for flat chord', () => {
    expect(transposeChord('Bb', 0, true)).toBe('Bb')
  })

  it('transposes Am up 1 to Bbm (flat key)', () => {
    expect(transposeChord('Am', 1, true)).toBe('Bbm')
  })

  it('transposes Am up 1 to A#m (sharp key)', () => {
    expect(transposeChord('Am', 1, false)).toBe('A#m')
  })

  it('handles Eb/G slash chord (flat notation)', () => {
    expect(transposeChord('Eb/G', 2, true)).toBe('F/A')
  })
})

describe('transposeSections', () => {
  it('applies delta to all chord tokens in all sections', () => {
    const sections = [{
      label: 'Verse',
      lines: [
        { type: 'lyric', content: 'Hello world', chords: [{ chord: 'G', position: 0 }, { chord: 'Am', position: 6 }] },
        { type: 'blank', content: '', chords: [] },
      ]
    }]
    const result = transposeSections(sections, 2, false)
    expect(result[0].lines[0].chords[0].chord).toBe('A')
    expect(result[0].lines[0].chords[1].chord).toBe('Bm')
  })

  it('returns original sections when delta is 0', () => {
    const sections = [{ label: 'Verse', lines: [{ type: 'lyric', content: 'Hello', chords: [{ chord: 'G', position: 0 }] }] }]
    const result = transposeSections(sections, 0, false)
    // Same reference (no mutation needed, but at minimum equal)
    expect(result[0].lines[0].chords[0].chord).toBe('G')
  })

  it('does not mutate original sections', () => {
    const sections = [{ label: 'Verse', lines: [{ type: 'lyric', content: 'Hello', chords: [{ chord: 'G', position: 0 }] }] }]
    const original = sections[0].lines[0].chords[0].chord
    transposeSections(sections, 2, false)
    expect(sections[0].lines[0].chords[0].chord).toBe(original)
  })

  it('handles multiple sections', () => {
    const sections = [
      { label: 'Verse', lines: [{ type: 'lyric', content: 'Hi', chords: [{ chord: 'C', position: 0 }] }] },
      { label: 'Chorus', lines: [{ type: 'lyric', content: 'Oh', chords: [{ chord: 'F', position: 0 }] }] },
    ]
    const result = transposeSections(sections, 7, false)
    expect(result[0].lines[0].chords[0].chord).toBe('G')
    expect(result[1].lines[0].chords[0].chord).toBe('C')
  })
})
