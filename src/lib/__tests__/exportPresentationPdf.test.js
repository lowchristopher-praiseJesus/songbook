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
  save: vi.fn(),
}

vi.mock('jspdf', () => ({ default: vi.fn(() => mockDoc) }))

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

describe('exportPresentationPdf', () => {
  it('does nothing when songs array is empty', () => {
    exportPresentationPdf([])
    expect(mockDoc.save).not.toHaveBeenCalled()
  })

  it('saves a PDF with a date-based filename', () => {
    exportPresentationPdf([makeSong('Amazing Grace', 'John Newton')])
    expect(mockDoc.save).toHaveBeenCalledOnce()
    expect(mockDoc.save.mock.calls[0][0]).toMatch(/Presentation.*\.pdf$/)
  })

  it('does not call addPage for a single song', () => {
    exportPresentationPdf([makeSong('Song A', 'Artist')])
    expect(mockDoc.addPage).not.toHaveBeenCalled()
  })

  it('calls addPage N-1 times for N songs', () => {
    exportPresentationPdf([
      makeSong('Song A', 'Artist'),
      makeSong('Song B', 'Artist'),
      makeSong('Song C', 'Artist'),
    ])
    expect(mockDoc.addPage).toHaveBeenCalledTimes(2)
  })

  it('renders title text for each song', () => {
    exportPresentationPdf([makeSong('My Song', 'My Artist')])
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
    expect(() => exportPresentationPdf([song])).not.toThrow()
    expect(mockDoc.save).toHaveBeenCalledOnce()
  })

  it('handles songs with no artist gracefully', () => {
    expect(() => exportPresentationPdf([makeSong('No Artist', null)])).not.toThrow()
    expect(mockDoc.save).toHaveBeenCalledOnce()
  })

  it('renders all text with centre alignment', () => {
    exportPresentationPdf([makeSong('My Song', 'My Artist')])
    const opts = mockDoc.text.mock.calls.map(c => c[3])
    expect(opts.every(o => o?.align === 'center')).toBe(true)
  })

  it('uses two columns when content overflows single-column', () => {
    // 4 sections overflow single-col at MAX_FONT (see makeLongSong comment)
    const song = makeLongSong(4)
    exportPresentationPdf([song])
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    // Column centres 260 and 700 must both appear (section content calls)
    expect(xValues).toContain(260)
    expect(xValues).toContain(700)
  })

  it('does not use two-column layout for a short song', () => {
    // 2 sections comfortably fit single-col (see makeLongSong comment)
    const song = makeLongSong(2)
    exportPresentationPdf([song])
    const xValues = mockDoc.text.mock.calls.map(c => c[1])
    expect(xValues).not.toContain(260)
    expect(xValues).not.toContain(700)
  })
})
