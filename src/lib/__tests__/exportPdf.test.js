import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportLyricsPdf } from '../exportPdf'

const mockDoc = {
  internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
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

const meta = { title: 'Amazing Grace', artist: 'John Newton', annotation: 'sing joyfully' }

const sections = [
  {
    label: 'Verse 1',
    annotation: 'only leader sings',
    lines: [
      { type: 'lyric', content: 'Amazing grace', chords: [], annotation: 'softly' },
      { type: 'lyric', content: 'How sweet the sound', chords: [], annotation: null },
    ],
  },
]

describe('exportLyricsPdf annotations', () => {
  it('renders song annotation when annotationsVisible is true', () => {
    exportLyricsPdf(meta, sections, true)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).toContain('sing joyfully')
  })

  it('suppresses song annotation when annotationsVisible is false', () => {
    exportLyricsPdf(meta, sections, false)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).not.toContain('sing joyfully')
  })

  it('renders section annotation when annotationsVisible is true', () => {
    exportLyricsPdf(meta, sections, true)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).toContain('— only leader sings')
  })

  it('suppresses section annotation when annotationsVisible is false', () => {
    exportLyricsPdf(meta, sections, false)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).not.toContain('— only leader sings')
  })

  it('renders line annotation when annotationsVisible is true', () => {
    exportLyricsPdf(meta, sections, true)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).toContain('— softly')
  })

  it('suppresses line annotation when annotationsVisible is false', () => {
    exportLyricsPdf(meta, sections, false)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).not.toContain('— softly')
  })

  it('defaults to showing annotations when annotationsVisible omitted', () => {
    exportLyricsPdf(meta, sections)
    const calls = mockDoc.text.mock.calls.map(c => c[0]).flat()
    expect(calls).toContain('sing joyfully')
  })
})
