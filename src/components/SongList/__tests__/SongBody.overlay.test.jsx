import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SongBody } from '../SongBody'

const sections = [
  {
    label: 'Verse',
    lines: [
      { type: 'lyric', content: 'Hello world', chords: [] },
    ],
  },
]

const paginatedProps = {
  sections,
  fitMode: true,
  paginated: true,
  totalColumns: 7,
  currentPage: 1,
  pageColWidth: 200,
  availableHeight: 600,
}

describe('SongBody overlay slot', () => {
  it('renders the overlay inside the plain (non-paginated) flow container', () => {
    const { container } = render(
      <SongBody sections={sections} overlay={<div data-testid="overlay" />} />
    )
    const overlay = screen.getByTestId('overlay')
    expect(overlay.parentElement).toBe(container.firstChild)
  })

  it('renders the overlay inside the paginated inner flow div, not the outer clip box', () => {
    const { container } = render(
      <SongBody {...paginatedProps} overlay={<div data-testid="overlay" />} />
    )
    const overlay = screen.getByTestId('overlay')
    const innerFlow = container.firstChild.firstChild
    expect(overlay.parentElement).toBe(innerFlow)
  })

  // The overlay (annotation ink canvas) sizes and positions itself with
  // `position: absolute; inset: 0` relative to its nearest positioned
  // ancestor. Without an explicit containing block here, an absolutely
  // positioned overlay would skip past this div (position: static) and
  // anchor to a distant ancestor instead — sizing itself to the single-page
  // clip box rather than the full multi-page flow, and never moving when
  // the flow's own translateX advances pages. This is what let ink drawn on
  // one page silently bleed into every other page of the same song.
  it('makes the paginated inner flow div a positioned containing block for the overlay', () => {
    const { container } = render(
      <SongBody {...paginatedProps} overlay={<div data-testid="overlay" />} />
    )
    const innerFlow = container.firstChild.firstChild
    expect(innerFlow.style.position).toBe('relative')
  })
})
