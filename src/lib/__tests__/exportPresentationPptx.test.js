import { describe, it, expect, vi } from 'vitest'
import { exportPresentationPptx } from '../exportPresentationPptx'

// ── Mock classes ─────────────────────────────────────────────────────────────

class MockSlide {
  constructor() {
    this.textCalls  = []
    this.imageCalls = []
    this.background = null
  }
  addText(text, opts) { this.textCalls.push({ text, opts }); return this }
  addImage(opts)      { this.imageCalls.push(opts); return this }
}

class MockPptx {
  constructor() { this.slides = []; this.layout = null }
  addSlide()          { const s = new MockSlide(); this.slides.push(s); return s }
  async writeFile()   {}
}

/** Returns a MockPptx subclass that captures its own instance. */
function makeMockPptx() {
  let instance
  class CapturePptx extends MockPptx {
    constructor() { super(); instance = this }
  }
  return { CapturePptx, getInstance: () => instance }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Defined here; reused in later tasks' tests added to this file.
export const TWO_SECTION_SONG = {
  meta: { title: 'Song', artist: 'Artist' },
  sections: [
    { label: 'Verse',  lines: [{ type: 'lyric', content: 'Verse line' }] },
    { label: 'Chorus', lines: [{ type: 'lyric', content: 'Chorus line' }] },
  ],
}

export const CHORD_SONG = {
  meta: { title: 'Song' },
  sections: [
    {
      label: 'Verse',
      lines: [
        { type: 'chord', content: 'G  C' },
        { type: 'lyric', content: 'Lyric here' },
      ],
    },
  ],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('exportPresentationPptx', () => {
  it('does nothing when songs array is empty', async () => {
    const writeFileSpy = vi.spyOn(MockPptx.prototype, 'writeFile')
    await exportPresentationPptx([], null, {}, MockPptx)
    expect(writeFileSpy).not.toHaveBeenCalled()
    writeFileSpy.mockRestore()
  })

  it('sets layout to LAYOUT_WIDE', async () => {
    const { CapturePptx, getInstance } = makeMockPptx()
    await exportPresentationPptx(
      [{ meta: { title: 'T' }, sections: [] }], null, {}, CapturePptx
    )
    expect(getInstance().layout).toBe('LAYOUT_WIDE')
  })

  it('creates one slide per song (baseline — song mode)', async () => {
    const { CapturePptx, getInstance } = makeMockPptx()
    await exportPresentationPptx(
      [{ meta: { title: 'A' }, sections: [] }, { meta: { title: 'B' }, sections: [] }],
      null, { slideMode: 'song' }, CapturePptx
    )
    expect(getInstance().slides).toHaveLength(2)
  })

  it('sets slide.background when bgImage is provided', async () => {
    const { CapturePptx, getInstance } = makeMockPptx()
    const fakeImg = { naturalWidth: 10, naturalHeight: 10 }
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toDataURL: () => 'data:image/png;base64,MOCKED',
        }
      }
      return origCreate(tag)
    })
    await exportPresentationPptx(
      [{ meta: { title: 'T' }, sections: [] }], fakeImg, { slideMode: 'song' }, CapturePptx
    )
    expect(getInstance().slides[0].background).toEqual({ data: 'data:image/png;base64,MOCKED', type: 'png' })
    vi.restoreAllMocks()
  })
})

describe('section-per-slide mode', () => {
  it('creates one slide per lyric section', async () => {
    const { CapturePptx, getInstance } = makeMockPptx()
    await exportPresentationPptx([TWO_SECTION_SONG], null, { slideMode: 'section' }, CapturePptx)
    expect(getInstance().slides).toHaveLength(2)
  })

  it('skips sections that have no lyric lines', async () => {
    const { CapturePptx, getInstance } = makeMockPptx()
    const song = {
      meta: { title: 'T' },
      sections: [
        { label: 'Chord-only', lines: [{ type: 'chord', content: 'G' }] },
        { label: 'Verse',      lines: [{ type: 'lyric', content: 'Line' }] },
      ],
    }
    await exportPresentationPptx([song], null, { slideMode: 'section' }, CapturePptx)
    expect(getInstance().slides).toHaveLength(1)
  })

  it('puts lyric content on the slide text', async () => {
    const { CapturePptx, getInstance } = makeMockPptx()
    await exportPresentationPptx([TWO_SECTION_SONG], null, { slideMode: 'section' }, CapturePptx)
    const slide0Text = JSON.stringify(getInstance().slides[0].textCalls)
    expect(slide0Text).toContain('Verse line')
  })

  it('creates one slide for a song with no labelled sections', async () => {
    const { CapturePptx, getInstance } = makeMockPptx()
    const song = {
      meta: { title: 'T' },
      sections: [{ label: null, lines: [{ type: 'lyric', content: 'line' }] }],
    }
    await exportPresentationPptx([song], null, { slideMode: 'section' }, CapturePptx)
    expect(getInstance().slides).toHaveLength(1)
  })
})

describe('song-per-slide mode', () => {
  it('creates one slide per song', async () => {
    const { CapturePptx, getInstance } = makeMockPptx()
    await exportPresentationPptx(
      [TWO_SECTION_SONG, TWO_SECTION_SONG],
      null, { slideMode: 'song' }, CapturePptx
    )
    expect(getInstance().slides).toHaveLength(2)
  })

  it('puts all section lyrics on one slide', async () => {
    const { CapturePptx, getInstance } = makeMockPptx()
    await exportPresentationPptx([TWO_SECTION_SONG], null, { slideMode: 'song' }, CapturePptx)
    const allText = JSON.stringify(getInstance().slides[0].textCalls)
    expect(allText).toContain('Verse line')
    expect(allText).toContain('Chorus line')
  })

  it('shows section labels as uppercase inline text in song mode', async () => {
    const { CapturePptx, getInstance } = makeMockPptx()
    await exportPresentationPptx([TWO_SECTION_SONG], null, { slideMode: 'song' }, CapturePptx)
    const allText = JSON.stringify(getInstance().slides[0].textCalls)
    expect(allText).toContain('VERSE')
    expect(allText).toContain('CHORUS')
  })
})
