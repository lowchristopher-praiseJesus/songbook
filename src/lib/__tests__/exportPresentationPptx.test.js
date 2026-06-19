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
})
