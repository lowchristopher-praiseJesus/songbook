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
})
