import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { AnnotatedMaximizeView } from '../AnnotatedMaximizeView'
import { useAnnotationStore } from '../../../store/annotationStore'

function drawOneStroke(canvas) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
  fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
}

const sections = [
  { label: 'Verse', lines: [{ type: 'lyric', content: 'Hello world', chords: [] }] },
]

describe('Baseline capture covers the full title+lyrics page for non-paginated songs', () => {
  beforeEach(() => {
    useAnnotationStore.setState({
      songId: 'song-1', baseline: null, annotateMode: true,
      layers: useAnnotationStore.getState().layers.map(l => ({ ...l, strokes: [] })),
    })
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      setTransform: vi.fn(), clearRect: vi.fn(), fill: vi.fn(),
    }))
    vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })))
    vi.stubGlobal('Path2D', vi.fn(() => ({ moveTo: vi.fn(), quadraticCurveTo: vi.fn(), closePath: vi.fn() })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('captures a baseline box at least as tall as the title block plus the lyrics box', () => {
    // The canvas now sits on the outer wrapper (title + lyrics), so its
    // clientHeight reflects both. Simulate that combined size directly,
    // the same way AnnotationLayer.captureBaseline.test.jsx simulates the
    // paginated flow's size.
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, value: 600 })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, value: 560 })

    const { container } = render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        bodyRef={{ current: null }}
        fitFontSize={20}
        fitColumns={2}
        paginated={false}
        title="Amazing Grace"
        songKey="Eb"
        tempo={120}
      />
    )
    // Prove the canvas that fires the stroke event is structurally
    // positioned as a sibling covering the title+lyrics wrapper, not
    // nested inside SongBody's lyrics-only overlay slot. Without this,
    // the clientHeight stub above (applied to the whole prototype) can't
    // distinguish the fixed layout from the pre-fix nested layout.
    const outer = container.firstChild
    const canvas = container.querySelector('canvas')
    expect(canvas.parentElement).toBe(outer)
    expect(outer.contains(screen.getByRole('heading', { name: 'Amazing Grace' }))).toBe(true)

    drawOneStroke(canvas)

    const baseline = useAnnotationStore.getState().baseline
    expect(baseline).not.toBeNull()
    expect(baseline.width).toBe(600)
    // 560 includes both the title block and the lyrics box, since the
    // canvas is mounted on their shared outer wrapper — bigger than the
    // lyrics box would have measured on its own.
    expect(baseline.height).toBe(560)
  })
})
