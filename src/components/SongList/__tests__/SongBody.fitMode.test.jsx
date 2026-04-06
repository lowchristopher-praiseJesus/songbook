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
