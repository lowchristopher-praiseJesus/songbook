import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SongBody } from '../SongBody'

const sections = [
  {
    label: 'Verse',
    lines: [
      { type: 'lyric', content: 'Hello world', chords: [] },
    ],
  },
]

describe('SongBody fitMode', () => {
  it('applies columnCount style when fitMode is true', () => {
    const { container } = render(
      <SongBody sections={sections} fitMode fitColumns={2} />
    )
    expect(container.firstChild.style.columnCount).toBe('2')
  })

  it('does not set columnCount when fitMode is false', () => {
    const { container } = render(<SongBody sections={sections} />)
    expect(container.firstChild.style.columnCount).toBe('')
  })

  it('uses CSS variable for lyric line font size in fitMode', () => {
    const { container } = render(
      <SongBody sections={sections} fitMode fitColumns={1} />
    )
    const lineDiv = container.querySelector('.leading-relaxed')
    expect(lineDiv.style.fontSize).toBe('var(--fit-fs, 16px)')
  })

  it('uses numeric fontSize on lyric line when fitMode is false', () => {
    const { container } = render(
      <SongBody sections={sections} fontSize={20} />
    )
    const lineDiv = container.querySelector('.leading-relaxed')
    expect(lineDiv.style.fontSize).toBe('20px')
  })
})

describe('SongBody paginated mode', () => {
  const paginatedProps = {
    sections,
    fitMode: true,
    paginated: true,
    totalColumns: 7,
    currentPage: 1,
    pageColWidth: 200,
    availableHeight: 600,
  }

  it('clips the outer wrapper to 3 columns worth of width, horizontally only', () => {
    const { container } = render(<SongBody {...paginatedProps} />)
    // 3 columns * 200px + 2 gaps * 32px = 664px
    expect(container.firstChild.style.width).toBe('664px')
    expect(container.firstChild.style.overflowX).toBe('hidden')
    // Vertical overflow must still reach the scrollable containerRef above this
    // component (the existing "single section too tall for a page" fallback
    // safety net) — overflow-y is deliberately left unset, not 'hidden'.
    expect(container.firstChild.style.overflowY).toBe('')
  })

  it('sizes the inner flow to hold all totalColumns and sets column-fill/height', () => {
    const { container } = render(<SongBody {...paginatedProps} />)
    const flow = container.firstChild.firstChild
    // 7 columns * 200px + 6 gaps * 32px = 1592px
    expect(flow.style.width).toBe('1592px')
    expect(flow.style.columnWidth).toBe('200px')
    expect(flow.style.columnFill).toBe('auto')
    expect(flow.style.height).toBe('600px')
  })

  it('translates the inner flow by currentPage * pageStep (3 column-slots, each column + trailing gap)', () => {
    const { container } = render(<SongBody {...paginatedProps} currentPage={2} />)
    const flow = container.firstChild.firstChild
    // pageStep = 3 * (200 + 32) = 696px (3 column-slots, each = column + trailing gap);
    // currentPage 2 -> translateX(-1392px). The clip width is still 664px
    // (3 columns + 2 internal gaps), but the slide step includes the trailing
    // gap so the next page's first column lands at the left border instead of
    // drifting right by one gap per page.
    expect(flow.style.transform).toBe('translateX(-1392px)')
  })

  it('does not apply the paginated branch when paginated is false', () => {
    const { container } = render(<SongBody sections={sections} fitMode fitColumns={2} paginated={false} />)
    expect(container.firstChild.style.columnCount).toBe('2')
  })
})
