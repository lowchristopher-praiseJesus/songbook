import { describe, it, expect } from 'vitest'
import { parseChordPro } from '../chordProParser'

describe('parseChordPro', () => {
  // ── Metadata ──────────────────────────────────────────────────────────────

  it('parses {title:} and {artist:} directives', () => {
    const text = '{title: Amazing Grace}\n{artist: John Newton}\n'
    const { meta } = parseChordPro(text)
    expect(meta.title).toBe('Amazing Grace')
    expect(meta.artist).toBe('John Newton')
  })

  it('parses short aliases {t:} for title and {st:} for artist', () => {
    const text = '{t: My Song}\n{st: Some Artist}\n'
    const { meta } = parseChordPro(text)
    expect(meta.title).toBe('My Song')
    expect(meta.artist).toBe('Some Artist')
  })

  it('parses {key: G} → key="G", keyIndex=7, usesFlats=false', () => {
    const { meta } = parseChordPro('{title: T}\n{key: G}\n')
    expect(meta.key).toBe('G')
    expect(meta.keyIndex).toBe(7)
    expect(meta.usesFlats).toBe(false)
  })

  it('parses {key: Bb} → key="Bb", keyIndex=10, usesFlats=true', () => {
    const { meta } = parseChordPro('{title: T}\n{key: Bb}\n')
    expect(meta.key).toBe('Bb')
    expect(meta.keyIndex).toBe(10)
    expect(meta.usesFlats).toBe(true)
  })

  it('parses {key: F} → usesFlats=true (F uses flats)', () => {
    const { meta } = parseChordPro('{key: F}\n')
    expect(meta.key).toBe('F')
    expect(meta.usesFlats).toBe(true)
  })

  it('parses {capo: 2} → meta.capo=2', () => {
    const { meta } = parseChordPro('{capo: 2}\n')
    expect(meta.capo).toBe(2)
  })

  it('clamps capo to max 5', () => {
    const { meta } = parseChordPro('{capo: 9}\n')
    expect(meta.capo).toBe(5)
  })

  it('parses {tempo: 120} → meta.tempo=120', () => {
    const { meta } = parseChordPro('{tempo: 120}\n')
    expect(meta.tempo).toBe(120)
  })

  it('parses {time: 3/4} → meta.timeSignature="3/4"', () => {
    const { meta } = parseChordPro('{time: 3/4}\n')
    expect(meta.timeSignature).toBe('3/4')
  })

  it('parses {copyright:} → meta.copyright', () => {
    const { meta } = parseChordPro('{copyright: 2024 Acme}\n')
    expect(meta.copyright).toBe('2024 Acme')
  })

  it('falls back to "Untitled" when no title directive is present', () => {
    const { meta } = parseChordPro('[G]Hello\n')
    expect(meta.title).toBe('Untitled')
  })

  it('uses filename stem as fallback title when provided', () => {
    const { meta } = parseChordPro('[G]Hello\n', 'amazing-grace.cho')
    expect(meta.title).toBe('amazing-grace')
  })

  // ── Sections ──────────────────────────────────────────────────────────────

  it('{start_of_verse} creates a section with label "Verse"', () => {
    const text = '{start_of_verse}\nHello world\n{end_of_verse}\n'
    const { sections } = parseChordPro(text)
    expect(sections[0].label).toBe('Verse')
    expect(sections[0].lines[0].content).toBe('Hello world')
  })

  it('{start_of_chorus} creates a section with label "Chorus"', () => {
    const text = '{start_of_chorus}\n[G]Sing\n{end_of_chorus}\n'
    const { sections } = parseChordPro(text)
    expect(sections[0].label).toBe('Chorus')
  })

  it('{start_of_chorus: My Chorus} uses the custom label', () => {
    const text = '{start_of_chorus: Refrain}\nLa la la\n{end_of_chorus}\n'
    const { sections } = parseChordPro(text)
    expect(sections[0].label).toBe('Refrain')
  })

  it('{start_of_bridge} creates a section with label "Bridge"', () => {
    const text = '{start_of_bridge}\nBridge line\n{end_of_bridge}\n'
    const { sections } = parseChordPro(text)
    expect(sections[0].label).toBe('Bridge')
  })

  it('{end_of_chorus} does not create its own section', () => {
    const text = '{start_of_chorus}\nLine\n{end_of_chorus}\n'
    const { sections } = parseChordPro(text)
    // Only one section (the chorus), no extra section from end_of_chorus
    expect(sections).toHaveLength(1)
  })

  it('short aliases {soc} and {eoc} work for chorus', () => {
    const text = '{soc}\nSing\n{eoc}\n'
    const { sections } = parseChordPro(text)
    expect(sections[0].label).toBe('Chorus')
    expect(sections).toHaveLength(1)
  })

  it('short aliases {sov} and {eov} work for verse', () => {
    const text = '{sov}\nWords\n{eov}\n'
    const { sections } = parseChordPro(text)
    expect(sections[0].label).toBe('Verse')
    expect(sections).toHaveLength(1)
  })

  // ── Skip blocks ───────────────────────────────────────────────────────────

  it('{start_of_tab} … {end_of_tab} block is entirely skipped', () => {
    const text = '{start_of_chorus}\nSing\n{end_of_chorus}\n{start_of_tab}\ne|---0---|\n{end_of_tab}\n'
    const { sections } = parseChordPro(text)
    // Only the chorus section; no tab section
    expect(sections).toHaveLength(1)
    expect(sections[0].label).toBe('Chorus')
  })

  it('{sot} / {eot} short aliases skip the tab block', () => {
    const text = '{sov}\nLine\n{eov}\n{sot}\ne|--|\n{eot}\n'
    const { sections } = parseChordPro(text)
    expect(sections).toHaveLength(1)
  })

  it('{start_of_grid} … {end_of_grid} block is entirely skipped', () => {
    const text = '{sov}\nLine\n{eov}\n{start_of_grid}\nG D Em C\n{end_of_grid}\n'
    const { sections } = parseChordPro(text)
    expect(sections).toHaveLength(1)
  })

  // ── Comments ──────────────────────────────────────────────────────────────

  it('{comment:} lines are omitted (not treated as section headers)', () => {
    const text = '{start_of_verse}\n{comment: Play softly}\nHello\n{end_of_verse}\n'
    const { sections } = parseChordPro(text)
    // The comment line should not appear as a lyric line
    expect(sections[0].lines.some(l => l.content === 'Play softly')).toBe(false)
    expect(sections[0].lines[0].content).toBe('Hello')
  })

  it('{c: text} in ChordPro is treated as a comment and omitted (not a section header)', () => {
    // In ChordPro {c:} = comment; in SBP {c:} = section. Must NOT create a section.
    const text = '{start_of_verse}\n{c: this is a comment}\nHello\n{end_of_verse}\n'
    const { sections } = parseChordPro(text)
    expect(sections[0].lines[0].content).toBe('Hello')
    expect(sections[0].lines).toHaveLength(1)
  })

  it('lines starting with # are skipped', () => {
    const text = '# This is a comment\n{start_of_verse}\nHello\n{end_of_verse}\n'
    const { sections } = parseChordPro(text)
    expect(sections[0].lines[0].content).toBe('Hello')
  })

  // ── Chord / lyric content ─────────────────────────────────────────────────

  it('inline [Chord] tokens in lyrics produce chords array', () => {
    const text = '{start_of_verse}\nA[G]mazing grace how [C]sweet\n{end_of_verse}\n'
    const { sections } = parseChordPro(text)
    const line = sections[0].lines[0]
    expect(line.type).toBe('lyric')
    expect(line.content).toBe('Amazing grace how sweet')
    expect(line.chords).toEqual([
      { chord: 'G', position: 1, strum: null },
      { chord: 'C', position: 18, strum: null },
    ])
  })

  it('a line of only [Chord] tokens produces type="chord"', () => {
    const text = '{start_of_verse}\n[G]  [D]  [Em]\n{end_of_verse}\n'
    const { sections } = parseChordPro(text)
    expect(sections[0].lines[0].type).toBe('chord')
    expect(sections[0].lines[0].chords).toHaveLength(3)
  })

  // ── rawText round-trip ────────────────────────────────────────────────────

  it('rawText uses SBP {c:} syntax so it can be re-parsed by parseContent', () => {
    const text = '{title: T}\n{start_of_chorus}\nSing\n{end_of_chorus}\n'
    const { rawText } = parseChordPro(text)
    expect(rawText).toContain('{c: Chorus}')
    expect(rawText).not.toContain('{start_of_chorus}')
  })

  it('rawText does not include metadata directive lines', () => {
    const text = '{title: My Song}\n{key: G}\n{start_of_verse}\nHello\n{end_of_verse}\n'
    const { rawText } = parseChordPro(text)
    expect(rawText).not.toContain('{title:')
    expect(rawText).not.toContain('{key:')
  })
})
