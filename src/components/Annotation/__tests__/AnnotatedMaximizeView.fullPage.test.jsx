import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnnotatedMaximizeView } from '../AnnotatedMaximizeView'
import { useAnnotationStore } from '../../../store/annotationStore'

const sections = [
  { label: 'Verse', lines: [{ type: 'lyric', content: 'Hello world', chords: [] }] },
]

beforeEach(() => {
  useAnnotationStore.setState({
    baseline: null,
    annotateMode: false,
    userZoom: 1,
    pan: { x: 0, y: 0 },
  })
  // AnnotationLayer's canvas-sizing effect needs a ResizeObserver; jsdom
  // doesn't implement one. Same stub as AnnotatedMaximizeView.refTiming.test.jsx.
  vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })))
})

describe('AnnotatedMaximizeView full-page canvas (live/pre-annotation branch)', () => {
  it('renders the title and puts the ink canvas outside SongBody, covering both, for a non-paginated song', () => {
    const { container } = render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        bodyRef={{ current: null }}
        fitFontSize={18}
        fitColumns={2}
        paginated={false}
        title="Amazing Grace"
        songKey="Eb"
        tempo={120}
      />
    )
    expect(screen.getByRole('heading', { name: 'Amazing Grace' })).not.toBeNull()

    const outer = container.firstChild
    const canvas = container.querySelector('canvas')
    // The canvas is a direct child of the same outer box that also contains
    // the heading — not nested inside SongBody's own content div.
    expect(canvas.parentElement).toBe(outer)
    expect(outer.contains(screen.getByRole('heading', { name: 'Amazing Grace' }))).toBe(true)
  })

  it('does not render a title and keeps the canvas inside SongBody for a paginated song (unchanged)', () => {
    const { container } = render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        bodyRef={{ current: null }}
        fitFontSize={18}
        fitColumns={3}
        paginated={true}
        totalColumns={7}
        currentPage={0}
        pageColWidth={200}
        fitAvailableHeight={600}
        title="Amazing Grace"
        songKey="Eb"
        tempo={120}
      />
    )
    expect(screen.queryByRole('heading', { name: 'Amazing Grace' })).toBeNull()

    // Canvas is nested inside SongBody's paginated inner flow div, i.e. it
    // is NOT a direct child of the outer bodyRef div.
    const outer = container.firstChild
    const canvas = container.querySelector('canvas')
    expect(canvas.parentElement).not.toBe(outer)
  })
})

describe('AnnotatedMaximizeView full-page canvas (frozen/post-annotation branch)', () => {
  function mockContainer(clientHeight) {
    return { clientHeight, scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) }
  }

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the title inside the scaled box, alongside the canvas, for a non-paginated frozen baseline', () => {
    useAnnotationStore.setState({
      baseline: { fontSize: 20, columns: 2, width: 800, height: 500, paginated: false },
      annotateMode: false,
      userZoom: 1,
      pan: { x: 0, y: 0 },
    })
    const containerRef = { current: mockContainer(500) }

    const { container } = render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        containerRef={containerRef}
        title="Amazing Grace"
        songKey="Eb"
        tempo={120}
      />
    )

    expect(screen.getByRole('heading', { name: 'Amazing Grace' })).not.toBeNull()
    const scaledBox = container.querySelector('canvas').closest('div[style*="scale"]')
    expect(scaledBox.contains(screen.getByRole('heading', { name: 'Amazing Grace' }))).toBe(true)
  })

  it('does not render a title for a paginated frozen baseline (unchanged)', () => {
    useAnnotationStore.setState({
      baseline: { fontSize: 20, columns: 3, width: 868, height: 406, paginated: true, totalColumns: 9, pageColWidth: 268, availableHeight: 374 },
      annotateMode: false,
      userZoom: 1,
      pan: { x: 0, y: 0 },
    })
    const containerRef = { current: mockContainer(500) }

    render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        containerRef={containerRef}
        currentPage={0}
        title="Amazing Grace"
        songKey="Eb"
        tempo={120}
      />
    )

    expect(screen.queryByRole('heading', { name: 'Amazing Grace' })).toBeNull()
  })
})
