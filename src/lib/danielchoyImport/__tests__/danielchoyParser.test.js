import { describe, it, expect } from 'vitest'
import { parseDanielChoyPage } from '../danielchoyParser'

describe('parseDanielChoyPage — chord-above-lyrics merge', () => {
  it('merges a single chord line into the following lyric line', () => {
    const html = 'Verse 1\nG  D\nHello world'
    const song = parseDanielChoyPage(html, { title: 'Test Song', artist: 'Test Artist' })
    expect(song.sections[0].lines[0].chords.map(c => c.chord)).toEqual(['G', 'D'])
    expect(song.sections[0].lines[0].content).toBe('Hello world')
  })

  it('emits a pure chord line when a chord line has no following lyric', () => {
    const html = 'Intro\nG  D  Em  C'
    const song = parseDanielChoyPage(html, { title: 'Test Song', artist: 'Test Artist' })
    expect(song.sections[0].lines[0].type).toBe('chord')
    expect(song.sections[0].lines[0].chords.map(c => c.chord)).toEqual(['G', 'D', 'Em', 'C'])
  })

  it('does not treat a chord line with a bare "x" rhythm marker as a chord line (shared chordLineUtils only tolerates numeric repeat annotations like "2x")', () => {
    // Previously (pre-consolidation) danielchoyParser tolerated a bare "x" token
    // mixed in with real chords as a rhythm-only marker to strip. The shared
    // isChordLine's RHYTHM_ONLY_RE only matches -, ^, / and REPEAT_ANNOTATION_RE
    // only matches numeric patterns like "2x"/"x2" — a bare "x" matches neither,
    // so "G  D  x" is no longer recognized as a chord line and passes through
    // as a literal lyric line instead of being merged/converted.
    const html = 'Verse 1\nG  D  x\nHello world'
    const song = parseDanielChoyPage(html, { title: 'Test Song', artist: 'Test Artist' })
    const lines = song.sections[0].lines
    expect(lines).toHaveLength(2)
    expect(lines[0].type).toBe('lyric')
    expect(lines[0].content).toBe('G  D  x')
    expect(lines[0].chords).toEqual([])
    expect(lines[1].type).toBe('lyric')
    expect(lines[1].content).toBe('Hello world')
  })
})
