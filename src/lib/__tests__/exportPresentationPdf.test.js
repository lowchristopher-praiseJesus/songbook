import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportPresentationPdf } from '../exportPresentationPdf'

const mockDoc = {
  internal: { pageSize: { getWidth: () => 960, getHeight: () => 540 } },
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  text: vi.fn(),
  splitTextToSize: vi.fn((text) => (text ? [text] : [''])),
  addPage: vi.fn(),
  addImage: vi.fn(),
  save: vi.fn(),
}

vi.mock('jspdf', () => ({ default: vi.fn(() => mockDoc) }))

const mockBg = { src: '' }

beforeEach(() => {
  Object.values(mockDoc).forEach(fn => typeof fn === 'function' && fn.mockClear?.())
})

const makeSong = (title, artist, sections) => ({
  meta: { title, artist },
  sections: sections ?? [{ label: 'Verse 1', lines: [{ type: 'lyric', content: 'Hello world' }] }],
})

/**
 * Build a song with `n` sections each containing one lyric line.
 * At MAX_FONT=32 with a no-artist header:
 *   headerH  ≈ 74.88 (title) + 20 (gap) = 94.88
 *   contentH ≈ 450 - 94.88 = 355.12
 *   sectionH ≈ 6 + (32*0.65*1.4) + 4 + (32*1.4) + (32*1.4*0.4) = ~101.84
 *   3 sections ≈ 305.52 → fits single-col
 *   4 sections ≈ 407.36 → overflows single-col, needs 2-col
 */
function makeLongSong(n) {
  return {
    meta: { title: 'Long Song', artist: null },
    sections: Array.from({ length: n }, (_, i) => ({
      label: `Section ${i + 1}`,
      lines: [{ type: 'lyric', content: `Lyric line ${i + 1}` }],
    })),
  }
}

/**
 * Build a song with ONE section containing `n` lyric lines.
 * Simulates songs using [Verse]/[Chorus] format (not {c:} format) which parse
 * as a single section.
 * At MAX_FONT=32, each lyric line ≈ 44.8pt (32*1.4).
 * 10 lines ≈ 448pt > 405pt threshold → should trigger two-column split within the section.
 */
function makeSingleSectionSong(n) {
  return {
    meta: { title: 'Single Section Song', artist: null },
    sections: [{
      label: 'Verse',
      lines: Array.from({ length: n }, (_, i) => ({ type: 'lyric', content: `Line ${i + 1}` })),
    }],
  }
}

describe('exportPresentationPdf', () => {
  it('does nothing when songs array is empty', () => {
    exportPresentationPdf([], mockBg)
    expect(mockDoc.save).not.toHaveBeenCalled()
  })

  it('saves a PDF with a date-based filename', () => {
    exportPresentationPdf([makeSong('Amazing Grace', 'John Newton')], mockBg)
    expect(mockDoc.save).toHaveBeenCalledOnce()
    expect(mockDoc.save.mock.calls[0][0]).toMatch(/Presentation.*\.pdf$/)
  })

  it('does not call addPage for a single song', () => {
    exportPresentationPdf([makeSong('Song A', 'Artist')], mockBg)
    expect(mockDoc.addPage).not.toHaveBeenCalled()
  })

  it('calls addPage N-1 times for N songs', () => {
    exportPresentationPdf([
      makeSong('Song A', 'Artist'),
      makeSong('Song B', 'Artist'),
      makeSong('Song C', 'Artist'),
    ], mockBg)
    expect(mockDoc.addPage).toHaveBeenCalledTimes(2)
  })

  it('renders title text for each song', () => {
    exportPresentationPdf([makeSong('My Song', 'My Artist')], mockBg)
    const textArgs = mockDoc.text.mock.calls.map(c => c[0])
    expect(textArgs.some(t => (Array.isArray(t) ? t.includes('My Song') : t === 'My Song'))).toBe(true)
  })

  it('skips chord-only lines', () => {
    const song = makeSong('Test', null, [{
      label: 'V1',
      lines: [
        { type: 'lyric', content: 'Hello' },
        { type: 'chord', content: '', chords: [{ chord: 'G', position: 0 }] },
      ],
    }])
    expect(() => exportPresentationPdf([song], mockBg)).not.toThrow()
    expect(mockDoc.save).toHaveBeenCalledOnce()
  })

  it('handles songs with no artist gracefully', () => {
    expect(() => exportPresentationPdf([makeSong('No Artist', null)], mockBg)).not.toThrow()
    expect(mockDoc.save).toHaveBeenCalledOnce()
  })

  it('renders all text with centre alignment', () => {
    exportPresentationPdf([makeSong('My Song', 'My Artist')], mockBg)
    const opts = mockDoc.text.mock.calls.map(c => c[3])
    expect(opts.every(o => o?.align === 'center')).toBe(true)
  })

  it('uses two columns when content overflows single-column', () => {
    // 4 sections at font 32 ≈ 407pt > 405pt threshold → triggers 2-col
    const song = makeLongSong(4)
    exportPresentationPdf([song], mockBg, { desiredFont: 32 })
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    // Column centres 260 and 700 must both appear (section content calls)
    expect(xValues).toContain(260)
    expect(xValues).toContain(700)
  })

  it('does not use two-column layout for a short song', () => {
    // 2 sections at font 32 ≈ 204pt < 405pt threshold → single col
    const song = makeLongSong(2)
    exportPresentationPdf([song], mockBg, { desiredFont: 32 })
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    expect(xValues).not.toContain(260)
    expect(xValues).not.toContain(700)
  })

  it('uses two columns for a single-section song with many lyric lines', () => {
    // 10 lyric lines at font 32 ≈ 448pt > 405pt threshold
    const song = makeSingleSectionSong(10)
    exportPresentationPdf([song], mockBg, { desiredFont: 32 })
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    expect(xValues).toContain(260)
    expect(xValues).toContain(700)
  })

  it('does not split a single-section song with few lyric lines', () => {
    // 2 lyric lines at font 32 ≈ 90pt < 405pt threshold → single col
    const song = makeSingleSectionSong(2)
    exportPresentationPdf([song], mockBg, { desiredFont: 32 })
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    expect(xValues).not.toContain(260)
    expect(xValues).not.toContain(700)
  })

  it('draws the background image on every page', () => {
    exportPresentationPdf([
      makeSong('Song A', 'Artist'),
      makeSong('Song B', 'Artist'),
    ], mockBg)
    expect(mockDoc.addImage).toHaveBeenCalledTimes(2)
    expect(mockDoc.addImage).toHaveBeenCalledWith(mockBg, 'PNG', 0, 0, 960, 540)
  })

  describe('options parameter', () => {
    it('accepts no options argument (backward compat)', () => {
      exportPresentationPdf([makeSong('Song', 'Artist')], mockBg)
      expect(mockDoc.save).toHaveBeenCalledOnce()
    })

    it('forces single-column when maxCols=1', () => {
      // makeLongSong(4) at font 32 ≈ 407pt > 405pt threshold → would use 2-col without constraint
      exportPresentationPdf([makeLongSong(4)], mockBg, { desiredFont: 32, maxCols: 1 })
      const xValues = mockDoc.text.mock.calls.map(c => c[1])
      expect(xValues).not.toContain(260)
      expect(xValues).not.toContain(700)
    })

    it('allows two columns when maxCols=2', () => {
      exportPresentationPdf([makeLongSong(4)], mockBg, { desiredFont: 32, maxCols: 2 })
      const xValues = mockDoc.text.mock.calls.map(c => c[1])
      expect(xValues).toContain(260)
      expect(xValues).toContain(700)
    })

    it('uses desiredFont=16 as the base (setFontSize called with ≤16 for body text)', () => {
      exportPresentationPdf([makeSong('Song', 'Artist')], mockBg, { desiredFont: 16, maxCols: 2 })
      const calls = mockDoc.setFontSize.mock.calls.map(c => c[0])
      expect(Math.min(...calls)).toBeLessThanOrEqual(16)
    })

    it('still saves PDF when content does not fit at desiredFont-2 (fallback)', () => {
      exportPresentationPdf([makeLongSong(20)], mockBg, { desiredFont: 20, maxCols: 1 })
      expect(mockDoc.save).toHaveBeenCalledOnce()
    })
  })

  it('does not render text below the bottom margin for a song with an oversized chorus', () => {
    // Intro(1 line) + Chorus(13 lines) + Outro(1 line).
    // At desiredFont=20 the midpoint split puts [Intro+Chorus] in the left column.
    // At fs=18 (the old desiredFont-2 floor) left column height ≈ 426 pt > contentH ≈ 388 pt,
    // causing lyric lines to render past the bottom margin (y > 500).
    const bigChorus = {
      meta: { title: 'Big Chorus Song', artist: null },
      sections: [
        { label: 'Intro', lines: [{ type: 'lyric', content: 'Intro line' }] },
        {
          label: 'Chorus',
          lines: Array.from({ length: 13 }, (_, i) => ({
            type: 'lyric', content: `Chorus line ${i + 1}`,
          })),
        },
        { label: 'Outro', lines: [{ type: 'lyric', content: 'Outro line' }] },
      ],
    }
    exportPresentationPdf([bigChorus], mockBg, { desiredFont: 20, maxCols: 2 })
    const yValues = mockDoc.text.mock.calls.map(c => c[2])
    // PAGE_H(540) - MARGIN_BOTTOM(40) = 500
    expect(Math.max(...yValues)).toBeLessThanOrEqual(500)
  })

  it('picks a height-valid column split rather than a midpoint split that overflows', () => {
    // Three sections where midpoint lands after section B, but A+B overflows the column.
    // A valid split (A alone in left, B+C in right) must be found instead.
    // At fontSize=32: lineH=44.8, labelLineH=29.12
    // Section with label + N lines ≈ 6 + 29.12 + 4 + N*44.8 + 17.92 = 57.04 + N*44.8
    // contentH(32) ≈ 450 - (32*1.8*1.3 + 20) = 450 - 94.88 = 355.12
    // A = 57.04 + 1*44.8 = 101.84  (fits in left)
    // B = 57.04 + 5*44.8 = 281.04  (A+B = 382.88 > 355.12 — overflows!)
    // C = 57.04 + 1*44.8 = 101.84  (B+C = 382.88 fits in right)
    // Midpoint: total ≈ 484.72, half ≈ 242.36
    //   after A (101.84) < 242.36 → continue; after A+B (382.88) >= 242.36 → left=[A,B] ← overflow
    // Fix: pick left=[A], right=[B,C] since that is the only valid split
    const song = {
      meta: { title: 'Split Test Song', artist: null },
      sections: [
        { label: 'A', lines: [{ type: 'lyric', content: 'A line' }] },
        { label: 'B', lines: Array.from({ length: 5 }, (_, i) => ({ type: 'lyric', content: `B${i}` })) },
        { label: 'C', lines: [{ type: 'lyric', content: 'C line' }] },
      ],
    }
    exportPresentationPdf([song], mockBg, { desiredFont: 32, maxCols: 2 })
    const yValues = mockDoc.text.mock.calls.map(c => c[2])
    // PAGE_H(540) - MARGIN_BOTTOM(40) = 500
    expect(Math.max(...yValues)).toBeLessThanOrEqual(500)
  })
})
