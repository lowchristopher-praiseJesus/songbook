import { describe, it, expect } from 'vitest'
import { parseUGMarkdown } from '../ugParser'

describe('parseUGMarkdown — metadata', () => {
  it('extracts title and artist from H1', () => {
    const md = '# Hotel California Chords by Eagles\n\n[Verse 1]\nAm  E7\nOn a dark desert highway'
    const song = parseUGMarkdown(md, 'https://ultimate-guitar.com/guitar-chords/eagles/hotel-california')
    expect(song.meta.title).toBe('Hotel California')
    expect(song.meta.artist).toBe('Eagles')
  })

  it('falls back to URL slug when H1 does not match', () => {
    const md = '## Some page\n\n[Verse 1]\nG  D\nHello world'
    const song = parseUGMarkdown(md, 'https://ultimate-guitar.com/guitar-chords/bob-dylan/blowin-in-the-wind')
    expect(song.meta.title).toBe('Blowin In The Wind')
    expect(song.meta.artist).toBe('')
  })

  it('extracts capo from content', () => {
    const md = '# Song Chords by Artist\nCapo: 3\n\n[Verse 1]\nG  D\nHello world'
    const song = parseUGMarkdown(md)
    expect(song.meta.capo).toBe(3)
  })

  it('defaults capo to 0 when not present', () => {
    const md = '# Song Chords by Artist\n\n[Verse 1]\nG  D\nHello'
    const song = parseUGMarkdown(md)
    expect(song.meta.capo).toBe(0)
  })

  it('defaults key to C / keyIndex 0', () => {
    const md = '# Song Chords by Artist\n\n[Verse 1]\nG  D\nHello'
    const song = parseUGMarkdown(md)
    expect(song.meta.key).toBe('C')
    expect(song.meta.keyIndex).toBe(0)
    expect(song.meta.isMinor).toBe(false)
    expect(song.meta.usesFlats).toBe(false)
  })
})

describe('parseUGMarkdown — section headers', () => {
  it('converts [Verse 1] to {c: Verse 1}', () => {
    const md = '[Verse 1]\nG  D\nHello world'
    const song = parseUGMarkdown(md)
    expect(song.sections[0].label).toBe('Verse 1')
  })

  it('converts [Chorus] to {c: Chorus}', () => {
    const md = '[Chorus]\nG  D\nSing along'
    const song = parseUGMarkdown(md)
    expect(song.sections[0].label).toBe('Chorus')
  })

  it('converts ## Bridge to {c: Bridge}', () => {
    const md = '## Bridge\nAm  G\nSomething'
    const song = parseUGMarkdown(md)
    expect(song.sections[0].label).toBe('Bridge')
  })
})

describe('parseUGMarkdown — chord-above-lyrics conversion', () => {
  it('inserts chords inline at matching column positions', () => {
    // chord line:  "Am              E7"   (E7 at col 16)
    // lyric line:  "On a dark desert highway"
    // merged:      "[Am]On a dark de[E7]sert highway"
    // position is the lyric-char index at insertion time, not the column:
    //   Am inserted before any lyric chars → position 0
    //   E7 inserted after "On a dark de" (12 chars) → position 12
    const md = '[Verse 1]\nAm              E7\nOn a dark desert highway'
    const song = parseUGMarkdown(md)
    const line = song.sections[0].lines[0]
    expect(line.chords[0].chord).toBe('Am')
    expect(line.chords[0].position).toBe(0)
    expect(line.chords[1].chord).toBe('E7')
    expect(line.chords[1].position).toBe(12)
  })

  it('pads lyric with spaces when shorter than chord line', () => {
    // chord line:  "G       D"   (D at col 8)
    // lyric line:  "Hi"          (only 2 chars)
    const md = '[Verse 1]\nG       D\nHi'
    const song = parseUGMarkdown(md)
    const line = song.sections[0].lines[0]
    expect(line.chords[0].chord).toBe('G')
    expect(line.chords[1].chord).toBe('D')
  })

  it('emits a pure chord line when chord line has no following lyric', () => {
    const md = '[Intro]\nG  D  Em  C'
    const song = parseUGMarkdown(md)
    const line = song.sections[0].lines[0]
    expect(line.type).toBe('chord')
    expect(line.chords.map(c => c.chord)).toEqual(['G', 'D', 'Em', 'C'])
  })

  it('emits first of consecutive chord lines as pure chord, processes second normally', () => {
    const md = '[Intro]\nG  D\nAm  F\nSomething'
    const song = parseUGMarkdown(md)
    // First chord line → pure chord
    expect(song.sections[0].lines[0].type).toBe('chord')
    // Second chord line paired with lyric
    expect(song.sections[0].lines[1].type).toBe('lyric')
    expect(song.sections[0].lines[1].chords[0].chord).toBe('Am')
  })
})

describe('parseUGMarkdown — [Tab] skip', () => {
  it('skips content between [Tab] and next section header', () => {
    const md = '[Verse 1]\nG  D\nHello world\n[Tab]\ne|--0--2--3--|\n[Chorus]\nG  D\nSing along'
    const song = parseUGMarkdown(md)
    expect(song.sections).toHaveLength(2)
    expect(song.sections[0].label).toBe('Verse 1')
    expect(song.sections[1].label).toBe('Chorus')
  })

  it('skips [Tab] content until end of content if no section header follows', () => {
    const md = '[Verse 1]\nG  D\nHello\n[Tab]\ne|--0--2--|'
    const song = parseUGMarkdown(md)
    expect(song.sections).toHaveLength(1)
    expect(song.sections[0].label).toBe('Verse 1')
  })
})

describe('parseUGMarkdown — noise stripping', () => {
  it('skips pre-song header noise before first section header', () => {
    const md = [
      '# Hallelujah Chords by Leonard Cohen',
      'by [Leonard Cohen](https://ultimate-guitar.com/artist/leonard_cohen)',
      '5,478,786 views81,358 saves',
      'Author: Unregistered',
      'Capo: 5th fret',
      '[Verse 1]',
      'C  Am',
      'I heard there was a secret chord',
    ].join('\n')
    const song = parseUGMarkdown(md)
    expect(song.sections).toHaveLength(1)
    expect(song.sections[0].label).toBe('Verse 1')
    // Pre-song lines should not appear in rawText
    expect(song.rawText).not.toContain('5,478,786')
    expect(song.rawText).not.toContain('Author:')
  })

  it('stops at "PrintCreate correction" footer marker', () => {
    const md = [
      '[Verse 1]',
      'G  D',
      'Hello world',
      'PrintCreate correctionReport bad tab',
      'Last update: Jan 28, 2023',
      'Related tabs...',
    ].join('\n')
    const song = parseUGMarkdown(md)
    expect(song.rawText).not.toContain('Last update')
    expect(song.rawText).not.toContain('Related tabs')
  })

  it('stops at "Last update:" footer marker', () => {
    const md = '[Verse 1]\nG  D\nHello\nLast update: Jan 28, 2023\ncomment text'
    const song = parseUGMarkdown(md)
    expect(song.rawText).not.toContain('Last update')
    expect(song.rawText).not.toContain('comment text')
  })
})

describe('parseUGMarkdown — output shape', () => {
  it('returns rawText string', () => {
    const md = '[Verse 1]\nG  D\nHello world'
    const song = parseUGMarkdown(md)
    expect(typeof song.rawText).toBe('string')
  })

  it('returns sections array from parseContent', () => {
    const md = '[Verse 1]\nG  D\nHello world'
    const song = parseUGMarkdown(md)
    expect(Array.isArray(song.sections)).toBe(true)
    expect(song.sections.length).toBeGreaterThan(0)
  })
})
