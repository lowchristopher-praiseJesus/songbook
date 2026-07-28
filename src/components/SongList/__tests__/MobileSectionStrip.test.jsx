import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MobileSectionStrip } from '../MobileSectionStrip'

// jsdom does not implement scrollIntoView (used by the active-pill
// auto-centering effect, unrelated to the fade affordance under test here).
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const sections = [
  { label: 'Intro' },
  { label: 'Chorus' },
  { label: 'Verse 1' },
]

// jsdom does no layout, so scrollWidth/clientWidth are always 0 — override
// them per-test to simulate an overflowing (or non-overflowing) strip.
function setDimensions(el, { scrollWidth, clientWidth, scrollLeft = 0 }) {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
  el.scrollLeft = scrollLeft
}

function getStrip() {
  // The scrollable element is the one with the fade testids as siblings —
  // find it via the left fade indicator's parent.
  return screen.getByTestId('section-strip-fade-right').parentElement.querySelector('.overflow-x-auto')
}

describe('MobileSectionStrip scroll affordance', () => {
  it('shows a right-edge fade when the strip overflows and is at the start', () => {
    render(<MobileSectionStrip sections={sections} activeIndex={0} onSectionClick={vi.fn()} />)
    const strip = getStrip()
    fireEvent.scroll(strip, {})
    setDimensions(strip, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 })
    fireEvent.scroll(strip, {})

    expect(screen.getByTestId('section-strip-fade-right')).toHaveClass('opacity-100')
    expect(screen.getByTestId('section-strip-fade-left')).toHaveClass('opacity-0')
  })

  it('shows a left-edge fade once scrolled away from the start', () => {
    render(<MobileSectionStrip sections={sections} activeIndex={0} onSectionClick={vi.fn()} />)
    const strip = getStrip()
    setDimensions(strip, { scrollWidth: 600, clientWidth: 300, scrollLeft: 150 })
    fireEvent.scroll(strip, {})

    expect(screen.getByTestId('section-strip-fade-left')).toHaveClass('opacity-100')
  })

  it('hides the right-edge fade once scrolled to the end', () => {
    render(<MobileSectionStrip sections={sections} activeIndex={0} onSectionClick={vi.fn()} />)
    const strip = getStrip()
    setDimensions(strip, { scrollWidth: 600, clientWidth: 300, scrollLeft: 300 })
    fireEvent.scroll(strip, {})

    expect(screen.getByTestId('section-strip-fade-right')).toHaveClass('opacity-0')
  })

  it('shows neither fade when the strip fits entirely (no overflow)', () => {
    render(<MobileSectionStrip sections={sections} activeIndex={0} onSectionClick={vi.fn()} />)
    const strip = getStrip()
    setDimensions(strip, { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 })
    fireEvent.scroll(strip, {})

    expect(screen.getByTestId('section-strip-fade-left')).toHaveClass('opacity-0')
    expect(screen.getByTestId('section-strip-fade-right')).toHaveClass('opacity-0')
  })

  it('re-measures on mount so an already-overflowing strip shows the fade without requiring a scroll event first', () => {
    render(<MobileSectionStrip sections={sections} activeIndex={0} onSectionClick={vi.fn()} />)
    const strip = getStrip()
    setDimensions(strip, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 })
    // Simulate the effect that runs after mount re-measuring real layout,
    // exercised here via a resize event rather than a scroll.
    fireEvent(window, new Event('resize'))

    expect(screen.getByTestId('section-strip-fade-right')).toHaveClass('opacity-100')
  })

  it('fade indicators are not interactive (pointer-events-none)', () => {
    render(<MobileSectionStrip sections={sections} activeIndex={0} onSectionClick={vi.fn()} />)
    expect(screen.getByTestId('section-strip-fade-left')).toHaveClass('pointer-events-none')
    expect(screen.getByTestId('section-strip-fade-right')).toHaveClass('pointer-events-none')
  })
})

describe('MobileSectionStrip pill legibility', () => {
  it('renders pill labels at readable size (text-sm), not the former arm\'s-length-unreadable text-xs', () => {
    render(<MobileSectionStrip sections={sections} activeIndex={0} onSectionClick={vi.fn()} />)
    const pill = screen.getByRole('button', { name: 'Chorus' })
    expect(pill).toHaveClass('text-sm')
    expect(pill).not.toHaveClass('text-xs')
  })
})
