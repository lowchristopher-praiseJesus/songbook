import { describe, it, expect } from 'vitest'
import { parseUGMarkdown, parseUGPage } from '../ugParser'

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
    // chord line:  "Am              E7"   (Am at col 0, E7 at col 16)
    // lyric line:  "On a dark desert highway"
    // E7 at col 16 = the space before "highway" → merged:
    //   "[Am]On a dark desert[E7] highway"
    // parseContent counts lyric chars before each chord marker:
    //   Am → 0 lyric chars before it → position 0
    //   E7 → "On a dark desert" = 16 lyric chars before it → position 16
    const md = '[Verse 1]\nAm              E7\nOn a dark desert highway'
    const song = parseUGMarkdown(md)
    const line = song.sections[0].lines[0]
    expect(line.chords[0].chord).toBe('Am')
    expect(line.chords[0].position).toBe(0)
    expect(line.chords[1].chord).toBe('E7')
    expect(line.chords[1].position).toBe(16)
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

  it('starts collecting at first chord line when no section header precedes it', () => {
    // Simulates a song where Verse 1 is unlabeled on UG
    const md = [
      '# Hallelujah Chords by Leonard Cohen',
      'by [Leonard Cohen](https://url)',
      '5,478,786 views',
      'C  Am',
      'I heard there was a secret chord',
      '[Verse 2]',
      'C  Am',
      'Your faith was strong',
    ].join('\n')
    const song = parseUGMarkdown(md)
    // Verse 1 content (unlabeled) should be included
    expect(song.rawText).toContain('secret chord')
    // Verse 2 should also be present
    expect(song.sections.some(s => s.label === 'Verse 2')).toBe(true)
  })

  it('stops at "Last update:" footer marker', () => {
    const md = '[Verse 1]\nG  D\nHello\nLast update: Jan 28, 2023\ncomment text'
    const song = parseUGMarkdown(md)
    expect(song.rawText).not.toContain('Last update')
    expect(song.rawText).not.toContain('comment text')
  })
})

describe('parseUGPage — store.page_data JSON extraction', () => {
  function makeHtml(pageData) {
    return `<html><head><script>store.page_data = ${JSON.stringify(pageData)};</script></head></html>`
  }

  const basePageData = {
    tab: { song_name: 'Hallelujah', artist_name: 'Leonard Cohen', capo: 5 },
    tab_view: {
      wiki_tab: {
        content: '[Verse 1]\n[ch]C[/ch]  [ch]Am[/ch]\nI heard there was a secret chord\n[Chorus]\n[ch]F[/ch]  [ch]Am[/ch]\nHallelujah',
      },
    },
  }

  it('extracts title, artist, and capo from JSON', () => {
    const song = parseUGPage({ rawHtml: makeHtml(basePageData) })
    expect(song.meta.title).toBe('Hallelujah')
    expect(song.meta.artist).toBe('Leonard Cohen')
    expect(song.meta.capo).toBe(5)
  })

  it('reads tonality_name for a major key (G)', () => {
    const data = { ...basePageData, tab: { ...basePageData.tab, tonality_name: 'G' } }
    const song = parseUGPage({ rawHtml: makeHtml(data) })
    expect(song.meta.key).toBe('G')
    expect(song.meta.keyIndex).toBe(7)
    expect(song.meta.isMinor).toBe(false)
  })

  it('reads tonality_name for a minor key (Am → key A, isMinor true)', () => {
    const data = { ...basePageData, tab: { ...basePageData.tab, tonality_name: 'Am' } }
    const song = parseUGPage({ rawHtml: makeHtml(data) })
    expect(song.meta.key).toBe('A')
    expect(song.meta.keyIndex).toBe(9)
    expect(song.meta.isMinor).toBe(true)
  })

  it('reads tonality_name for a flat key (Bb)', () => {
    const data = { ...basePageData, tab: { ...basePageData.tab, tonality_name: 'Bb' } }
    const song = parseUGPage({ rawHtml: makeHtml(data) })
    expect(song.meta.key).toBe('Bb')
    expect(song.meta.keyIndex).toBe(10)
    expect(song.meta.usesFlats).toBe(true)
  })

  it('reads tonality_name for a sharp key (F#)', () => {
    const data = { ...basePageData, tab: { ...basePageData.tab, tonality_name: 'F#' } }
    const song = parseUGPage({ rawHtml: makeHtml(data) })
    expect(song.meta.key).toBe('F#')
    expect(song.meta.keyIndex).toBe(6)
    expect(song.meta.usesFlats).toBe(false)
  })

  it('falls back to key C when tonality_name is absent', () => {
    const song = parseUGPage({ rawHtml: makeHtml(basePageData) })
    expect(song.meta.key).toBe('C')
    expect(song.meta.keyIndex).toBe(0)
  })

  it('strips [ch]/[/ch] tags and converts chord-above-lyrics', () => {
    const song = parseUGPage({ rawHtml: makeHtml(basePageData) })
    // Should have section with chords
    expect(song.sections[0].label).toBe('Verse 1')
    const line = song.sections[0].lines[0]
    expect(line.chords.map(c => c.chord)).toContain('C')
    expect(line.chords.map(c => c.chord)).toContain('Am')
  })

  it('strips [tab]...[/tab] blocks', () => {
    const data = {
      ...basePageData,
      tab_view: {
        wiki_tab: {
          content: '[Verse 1]\n[ch]G[/ch]  [ch]D[/ch]\nHello\n[tab]\ne|--0--|\n[/tab]\n[Chorus]\n[ch]C[/ch]  [ch]G[/ch]\nSing',
        },
      },
    }
    const song = parseUGPage({ rawHtml: makeHtml(data) })
    expect(song.rawText).not.toContain('e|--0--|')
    expect(song.sections.some(s => s.label === 'Chorus')).toBe(true)
  })

  it('falls back to markdown when store.page_data is absent', () => {
    const markdown = '# Hallelujah Chords by Leonard Cohen\n[Verse 1]\nG  D\nHello'
    const song = parseUGPage({ rawHtml: '<html>no data here</html>', markdown })
    expect(song.meta.title).toBe('Hallelujah')
    expect(song.meta.artist).toBe('Leonard Cohen')
  })

  it('strips trailing X and backtick noise lines from wiki_tab.content', () => {
    const data = {
      tab: { song_name: 'Test', artist_name: 'Artist', capo: 0 },
      tab_view: {
        // Simulates UG's typical trailing: song content, then X, then `
        wiki_tab: { content: '[Verse 1]\n[ch]G[/ch]  [ch]D[/ch]\nHello world\nX\n`' },
      },
    }
    const song = parseUGPage({ rawHtml: makeHtml(data) })
    expect(song.rawText).not.toMatch(/\bX\b\s*$/)
    expect(song.rawText).not.toContain('`')
    // Legitimate content is preserved (chords are merged inline so check for lyric fragment)
    expect(song.rawText).toContain('world')
  })

  it('falls back to markdown when wiki_tab.content is absent', () => {
    const data = { tab: { song_name: 'Test', artist_name: 'Artist' }, tab_view: {} }
    const markdown = '# Test Chords by Artist\n[Verse 1]\nG  D\nHello'
    const song = parseUGPage({ rawHtml: makeHtml(data), markdown })
    expect(song.sections.length).toBeGreaterThan(0)
  })
})

describe('parseUGPage — [ch] chord-above-lyrics with multiple chords', () => {
  function makeHtml(pageData) {
    return `<html><head><script>store.page_data = ${JSON.stringify(pageData)};</script></head></html>`
  }

  it('preserves all chords including Dm7 and G/B from [ch]-tagged chord line', () => {
    const data = {
      tab: { song_name: 'As The Deer', artist_name: 'Matt Redman', capo: 0 },
      tab_view: {
        wiki_tab: {
          content: '[Verse 1]\n         [ch]F[/ch]  [ch]Dm7[/ch]  [ch]G7[/ch]   [ch]C[/ch]   [ch]G/B[/ch]\nAnd I long to worship Thee.',
        },
      },
    }
    const song = parseUGPage({ rawHtml: makeHtml(data) })
    const line = song.sections[0].lines[0]
    expect(line.type).toBe('lyric')
    const chordNames = line.chords.map(c => c.chord)
    expect(chordNames).toContain('F')
    expect(chordNames).toContain('Dm7')
    expect(chordNames).toContain('G7')
    expect(chordNames).toContain('C')
    expect(chordNames).toContain('G/B')
    expect(chordNames).toHaveLength(5)
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
