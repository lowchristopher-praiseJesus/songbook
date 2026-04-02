import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportPresentationPdf } from '../exportPresentationPdf'

// Mock jsPDF
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

beforeEach(() => { Object.values(mockDoc).forEach(fn => typeof fn === 'function' && fn.mockClear?.()) })

const makeSong = (title, artist, lines = []) => ({
  meta: { title, artist },
  sections: [{ label: 'Verse 1', lines: [{ type: 'lyric', content: 'Hello world' }, ...lines] }],
})

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
    const textCalls = mockDoc.text.mock.calls.map(c => c[0])
    expect(textCalls.some(t => Array.isArray(t) ? t.includes('My Song') : t === 'My Song')).toBe(true)
  })

  it('skips chord-only lines', () => {
    const song = makeSong('Test', null, [{ type: 'chord', content: '', chords: [{ chord: 'G', position: 0 }] }])
    expect(() => exportPresentationPdf([song])).not.toThrow()
    expect(mockDoc.save).toHaveBeenCalledOnce()
  })

  it('handles songs with no artist gracefully', () => {
    expect(() => exportPresentationPdf([makeSong('No Artist', null)])).not.toThrow()
    expect(mockDoc.save).toHaveBeenCalledOnce()
  })
})
