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
