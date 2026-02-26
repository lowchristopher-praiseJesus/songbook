import { describe, it, expect } from 'vitest'
import { parseContent } from '../contentParser'

describe('parseContent', () => {
  it('parses a simple section with chords inline', () => {
    const content = '{c: Verse 1}\nEl Shad[Dm]dai, El Shad[G]dai'
    const sections = parseContent(content)
    expect(sections).toHaveLength(1)
    expect(sections[0].label).toBe('Verse 1')
    expect(sections[0].lines).toHaveLength(1)
    expect(sections[0].lines[0].type).toBe('lyric')
    expect(sections[0].lines[0].content).toBe('El Shaddai, El Shaddai')
    expect(sections[0].lines[0].chords).toEqual([
      { chord: 'Dm', position: 7 },
      { chord: 'G', position: 19 },
    ])
  })

  it('parses a pure chord line', () => {
    const content = '{c: Intro}\n[Dm]     [G]    [C]'
    const sections = parseContent(content)
    expect(sections[0].lines[0].type).toBe('chord')
    expect(sections[0].lines[0].chords).toHaveLength(3)
    expect(sections[0].lines[0].chords[0].chord).toBe('Dm')
    expect(sections[0].lines[0].chords[1].chord).toBe('G')
    expect(sections[0].lines[0].chords[2].chord).toBe('C')
  })

  it('handles blank lines as blank type', () => {
    const content = '{c: Verse 1}\nHello [G]world\n\nNext line'
    const sections = parseContent(content)
    expect(sections[0].lines[1].type).toBe('blank')
    expect(sections[0].lines[2].type).toBe('lyric')
  })

  it('parses multiple sections', () => {
    const content = '{c: Verse 1}\nLine one\n{c: Chorus}\nLine two'
    const sections = parseContent(content)
    expect(sections).toHaveLength(2)
    expect(sections[0].label).toBe('Verse 1')
    expect(sections[1].label).toBe('Chorus')
  })

  it('returns default section for content without section markers', () => {
    const sections = parseContent('Just some lyrics')
    expect(sections).toHaveLength(1)
    expect(sections[0].label).toBe('')
    expect(sections[0].lines[0].content).toBe('Just some lyrics')
  })

  it('handles empty and null content', () => {
    expect(parseContent('')).toEqual([])
    expect(parseContent(null)).toEqual([])
    expect(parseContent(undefined)).toEqual([])
  })

  it('chord positions are correct after removing bracket notation', () => {
    // "[G]Hello [Am]world" → lyric "Hello world" with G at 0, Am at 6
    const content = '{c: Test}\n[G]Hello [Am]world'
    const sections = parseContent(content)
    const line = sections[0].lines[0]
    expect(line.content).toBe('Hello world')
    expect(line.chords[0]).toEqual({ chord: 'G', position: 0 })
    expect(line.chords[1]).toEqual({ chord: 'Am', position: 6 })
  })

  it('handles slash chords: G/B', () => {
    const content = '{c: Test}\nHello [G/B]world'
    const sections = parseContent(content)
    const line = sections[0].lines[0]
    expect(line.chords[0].chord).toBe('G/B')
    expect(line.content).toBe('Hello world')
  })

  it('handles complex chord suffixes: Am7, Fmaj7, E7, A/C#, Dm11, Fmaj13', () => {
    const content = '{c: Test}\n[Am7]test [Fmaj7]test [E7]test [A/C#]test [Dm11]test [Fmaj13]test'
    const sections = parseContent(content)
    const chords = sections[0].lines[0].chords.map(c => c.chord)
    expect(chords).toEqual(['Am7', 'Fmaj7', 'E7', 'A/C#', 'Dm11', 'Fmaj13'])
  })

  it('lyric line with no chords has empty chords array', () => {
    const content = '{c: Verse}\nNo chords here'
    const sections = parseContent(content)
    expect(sections[0].lines[0].chords).toEqual([])
  })

  it('treats non-chord bracket sequences as literal text', () => {
    const content = '{c: Test}\n[NotAChord]some text'
    const sections = parseContent(content)
    expect(sections[0].lines[0].content).toBe('[NotAChord]some text')
    expect(sections[0].lines[0].chords).toEqual([])
  })

  it('treats unclosed bracket as literal character', () => {
    const content = '{c: Test}\nHello [G world'
    const sections = parseContent(content)
    expect(sections[0].lines[0].content).toBe('Hello [G world')
    expect(sections[0].lines[0].chords).toEqual([])
  })
})
