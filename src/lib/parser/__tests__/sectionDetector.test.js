import { describe, it, expect } from 'vitest'
import { detectSectionHeaders, convertSectionHeaders } from '../sectionDetector'

describe('detectSectionHeaders', () => {
  it('returns empty array when all headers are already formatted', () => {
    const text = '{c: Verse}\nHello world\n{c: Chorus}\nAmazing grace'
    expect(detectSectionHeaders(text)).toEqual([])
  })

  it('detects bracket format [Verse]', () => {
    const results = detectSectionHeaders('[Verse]\nHello world')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ lineIndex: 0, proposed: '{c: Verse}', confidence: 'high' })
  })

  it('detects bracket format with number [Verse 1]', () => {
    expect(detectSectionHeaders('[Verse 1]\nHello')[0].proposed).toBe('{c: Verse 1}')
  })

  it('normalises lowercase bracket [chorus] to canonical capitalisation', () => {
    expect(detectSectionHeaders('[chorus]\nHello')[0].proposed).toBe('{c: Chorus}')
  })

  it('preserves custom bracket names not in the known list', () => {
    const result = detectSectionHeaders('[My Special Part]\nContent')[0]
    expect(result.proposed).toBe('{c: My Special Part}')
    expect(result.confidence).toBe('high')
  })

  it('skips bracket lines that are actual chords [Am]', () => {
    expect(detectSectionHeaders('[Am]\nHello world')).toHaveLength(0)
  })

  it('detects markdown heading format ## Verse', () => {
    const result = detectSectionHeaders('## Verse\nHello')[0]
    expect(result.proposed).toBe('{c: Verse}')
    expect(result.confidence).toBe('high')
  })

  it('detects plain text exact match "Verse"', () => {
    const result = detectSectionHeaders('Verse\nHello world')[0]
    expect(result.proposed).toBe('{c: Verse}')
    expect(result.confidence).toBe('high')
  })

  it('detects plain text case-insensitive "verse"', () => {
    expect(detectSectionHeaders('verse\nHello')[0].proposed).toBe('{c: Verse}')
  })

  it('detects numbered section "Verse 2"', () => {
    expect(detectSectionHeaders('Verse 2\nHello')[0].proposed).toBe('{c: Verse 2}')
  })

  it('detects "Pre-Chorus" and alias "prechorus"', () => {
    expect(detectSectionHeaders('Pre-Chorus\n')[0].proposed).toBe('{c: Pre-Chorus}')
    expect(detectSectionHeaders('prechorus\n')[0].proposed).toBe('{c: Pre-Chorus}')
    expect(detectSectionHeaders('pre chorus\n')[0].proposed).toBe('{c: Pre-Chorus}')
  })

  it('detects fuzzy match typo "Fhorus" → Chorus with low confidence', () => {
    const result = detectSectionHeaders('Fhorus\nHello')[0]
    expect(result.proposed).toBe('{c: Chorus}')
    expect(result.confidence).toBe('low')
  })

  it('detects fuzzy match typo "Brige" → Bridge', () => {
    expect(detectSectionHeaders('Brige\nHello')[0].proposed).toBe('{c: Bridge}')
  })

  it('strips trailing colon "Verse:" → {c: Verse}', () => {
    expect(detectSectionHeaders('Verse:\nHello')[0].proposed).toBe('{c: Verse}')
  })

  it('skips lines with inline chords', () => {
    expect(detectSectionHeaders('[G]Hello world\nMore lyrics')).toHaveLength(0)
  })

  it('skips pure chord-sequence lines "Am G C"', () => {
    expect(detectSectionHeaders('Am G C\nHello')).toHaveLength(0)
  })

  it('skips lines with more than 3 tokens', () => {
    expect(detectSectionHeaders('This line is too long to be a section\nHello')).toHaveLength(0)
  })

  it('detects "Section A1" pattern', () => {
    expect(detectSectionHeaders('Section A1\nHello')[0].proposed).toBe('{c: Section A1}')
  })

  it('detects "Section B1" pattern', () => {
    expect(detectSectionHeaders('Section B1\nHello')[0].proposed).toBe('{c: Section B1}')
  })

  it('detects case-insensitive "section a1"', () => {
    expect(detectSectionHeaders('section a1\nHello')[0].proposed).toBe('{c: Section a1}')
  })

  it('detects "Section A" (letter only suffix)', () => {
    expect(detectSectionHeaders('Section A\nHello')[0].proposed).toBe('{c: Section A}')
  })

  it('detects "[Section A1]" bracket format', () => {
    expect(detectSectionHeaders('[Section A1]\nHello')[0].proposed).toBe('{c: Section A1}')
  })

  it('detects multiple Section X candidates in one song', () => {
    const text = 'Section A1\nHello\nSection B1\nWorld'
    const results = detectSectionHeaders(text)
    expect(results).toHaveLength(2)
    expect(results[0].proposed).toBe('{c: Section A1}')
    expect(results[1].proposed).toBe('{c: Section B1}')
  })

  it('detects multiple candidates in one song', () => {
    const text = '[Verse]\nHello world\nChorus\nAmazing grace\nBrige\nContent'
    const results = detectSectionHeaders(text)
    expect(results).toHaveLength(3)
    expect(results.map(r => r.proposed)).toEqual(['{c: Verse}', '{c: Chorus}', '{c: Bridge}'])
  })
})

describe('convertSectionHeaders', () => {
  it('converts detected lines to {c:} syntax', () => {
    const text = '[Verse]\nHello world\nChorus\nAmazing grace'
    const detections = detectSectionHeaders(text)
    const result = convertSectionHeaders(text, detections)
    expect(result).toBe('{c: Verse}\nHello world\n{c: Chorus}\nAmazing grace')
  })

  it('leaves undetected lines unchanged', () => {
    const text = '[Verse]\nSome [G]lyric here'
    const detections = detectSectionHeaders(text)
    expect(convertSectionHeaders(text, detections)).toBe('{c: Verse}\nSome [G]lyric here')
  })

  it('handles empty detections gracefully', () => {
    const text = '{c: Verse}\nContent'
    expect(convertSectionHeaders(text, [])).toBe(text)
  })
})
