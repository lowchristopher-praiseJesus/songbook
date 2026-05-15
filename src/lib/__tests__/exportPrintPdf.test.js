import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportPrintPdf, containsCJK, songsHaveCJK, DEFAULT_COMPONENTS } from '../exportPrintPdf'

// ---------------------------------------------------------------------------
// jsPDF mock
// ---------------------------------------------------------------------------
const mockDoc = {
  addFileToVFS:       vi.fn(),
  addFont:            vi.fn(),
  setFont:            vi.fn(),
  setFontSize:        vi.fn(),
  setTextColor:       vi.fn(),
  text:               vi.fn(),
  splitTextToSize:    vi.fn((t) => [t ?? '']),
  getStringUnitWidth: vi.fn(() => 1),
  addPage:            vi.fn(),
  save:               vi.fn(),
  internal:           { scaleFactor: 1 },
}
vi.mock('jspdf', () => ({ default: vi.fn(() => mockDoc) }))

// fetch mock (for font loading)
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function okFetch() {
  // Returns a minimal ArrayBuffer so base64 conversion doesn't throw
  const buf = new ArrayBuffer(16)
  mockFetch.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(buf) })
}

beforeEach(() => {
  Object.values(mockDoc).forEach(fn => typeof fn?.mockClear === 'function' && fn.mockClear())
  mockFetch.mockReset()
})

// ---------------------------------------------------------------------------
// Helper fixtures
// ---------------------------------------------------------------------------
const latinSong = {
  meta: { title: 'Amazing Grace' },
  sections: [{
    label: 'Verse',
    lines: [{ type: 'lyric', content: 'How sweet the sound', chords: [] }],
  }],
}

const cjkSong = {
  meta: { title: 'How Great Is Our God' },
  sections: [{
    label: 'Chinese Chorus',
    lines: [{ type: 'lyric', content: '我神真伟大', chords: [] }],
  }],
}

// ---------------------------------------------------------------------------
// containsCJK
// ---------------------------------------------------------------------------
describe('containsCJK', () => {
  it('returns true for simplified Chinese characters', () => {
    expect(containsCJK('我神真伟大')).toBe(true)
  })

  it('returns true for traditional Chinese characters', () => {
    expect(containsCJK('讚美主')).toBe(true)
  })

  it('returns true for mixed Latin + Chinese text', () => {
    expect(containsCJK('Hello 你好 World')).toBe(true)
  })

  it('returns false for pure Latin text', () => {
    expect(containsCJK('Amazing grace, how sweet the sound')).toBe(false)
  })

  it('returns false for chord names', () => {
    expect(containsCJK('D A Bm G')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(containsCJK('')).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(containsCJK(null)).toBe(false)
    expect(containsCJK(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// songsHaveCJK
// ---------------------------------------------------------------------------
describe('songsHaveCJK', () => {
  it('returns false for all-Latin songs', () => {
    expect(songsHaveCJK([latinSong])).toBe(false)
  })

  it('returns true when any lyric line has CJK', () => {
    expect(songsHaveCJK([cjkSong])).toBe(true)
  })

  it('returns true when the song title has CJK', () => {
    const song = { meta: { title: '神的荣耀' }, sections: [] }
    expect(songsHaveCJK([song])).toBe(true)
  })

  it('returns true when only one song in a list has CJK', () => {
    expect(songsHaveCJK([latinSong, cjkSong])).toBe(true)
  })

  it('returns false for empty song list', () => {
    expect(songsHaveCJK([])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_COMPONENTS
// ---------------------------------------------------------------------------
describe('DEFAULT_COMPONENTS', () => {
  const validStyles = ['normal', 'bold', 'italic', 'bolditalic']

  it('has a valid fontStyle for every component', () => {
    for (const [key, value] of Object.entries(DEFAULT_COMPONENTS)) {
      expect(validStyles, `${key} should have a valid fontStyle`).toContain(value.fontStyle)
    }
  })

  it('defaults chords fontFamily to helvetica', () => {
    expect(DEFAULT_COMPONENTS.chords.fontFamily).toBe('helvetica')
  })

  it('defaults title fontStyle to bold', () => {
    expect(DEFAULT_COMPONENTS.title.fontStyle).toBe('bold')
  })

  it('defaults annotation fontStyle to italic', () => {
    expect(DEFAULT_COMPONENTS.annotation.fontStyle).toBe('italic')
  })
})

// ---------------------------------------------------------------------------
// exportPrintPdf — font style option
// ---------------------------------------------------------------------------
describe('exportPrintPdf font style', () => {
  it('uses a custom fontStyle from the components option for lyrics', async () => {
    await exportPrintPdf([latinSong], { components: { lyrics: { fontStyle: 'italic' } } })
    const calls = mockDoc.setFont.mock.calls
    expect(calls).toContainEqual(['helvetica', 'italic'])
  })

  it('uses a custom fontStyle from the components option for title', async () => {
    // 'bolditalic' is not the default for any component, so this uniquely
    // proves the title renderer is reading fontStyle rather than hardcoding
    await exportPrintPdf([latinSong], { components: { title: { fontStyle: 'bolditalic' } } })
    expect(mockDoc.setFont).toHaveBeenCalledWith('helvetica', 'bolditalic')
  })
})

// ---------------------------------------------------------------------------
// exportPrintPdf — CJK font loading
// ---------------------------------------------------------------------------
describe('exportPrintPdf CJK font loading', () => {
  it('registers CJK font when songs contain Chinese text', async () => {
    okFetch()
    await exportPrintPdf([cjkSong])
    expect(mockDoc.addFileToVFS).toHaveBeenCalledWith('NotoSansSC-Regular.ttf', expect.any(String))
    expect(mockDoc.addFont).toHaveBeenCalledWith('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal')
  })

  it('does not fetch or register font for Latin-only songs', async () => {
    await exportPrintPdf([latinSong])
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockDoc.addFileToVFS).not.toHaveBeenCalled()
  })

  it('uses NotoSansSC as the font family for lyrics when CJK detected', async () => {
    okFetch()
    await exportPrintPdf([cjkSong])
    const fontCalls = mockDoc.setFont.mock.calls.map(c => c[0])
    expect(fontCalls).toContain('NotoSansSC')
  })

  it('still renders even when font fetch fails (degrades gracefully)', async () => {
    mockFetch.mockResolvedValue({ ok: false })
    await expect(exportPrintPdf([cjkSong])).resolves.not.toThrow()
    expect(mockDoc.save).toHaveBeenCalled()
  })

  it('fetches from the correct font path', async () => {
    okFetch()
    await exportPrintPdf([cjkSong])
    expect(mockFetch).toHaveBeenCalledWith('/fonts/NotoSansSC-Regular.ttf')
  })
})
