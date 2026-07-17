import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AnnotationLayer } from '../AnnotationLayer'
import { useAnnotationStore } from '../../../store/annotationStore'

// perfect-freehand's getStroke needs real point geometry to produce an
// outline; a single point is enough to exercise onPointerUp's baseline
// capture without needing to simulate a full drag gesture.
function drawOneStroke(canvas) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
  fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
}

describe('AnnotationLayer captureBaseline box size', () => {
  beforeEach(() => {
    useAnnotationStore.setState({
      songId: 'song-1', baseline: null, annotateMode: false,
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

  it('captures the single visible page window size, not the full multi-page flow width, for a paginated song', () => {
    // Simulates the real layout for a 3-page song: the ink canvas is sized
    // to the FULL flow (all pages side by side, e.g. ~1521px, per
    // SongBody's `overlay` slot living inside its position:relative inner
    // flow div — this is correct, ink needs to span every page). The
    // baseline box AnnotatedMaximizeView scales to fit the screen must
    // instead be the single page WINDOW (~868px, matching pageColWidth/
    // MAX_COLS/COLUMN_GAP_PX), not this flow width.
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, value: 1521 })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, value: 406 })

    const { container } = render(
      <AnnotationLayer
        active
        fitFontSize={20}
        fitColumns={3}
        paginated
        totalColumns={9}
        pageColWidth={268}
        fitAvailableHeight={374}
      />
    )
    drawOneStroke(container.querySelector('canvas'))

    const baseline = useAnnotationStore.getState().baseline
    expect(baseline).not.toBeNull()
    // pageWidth = MAX_COLS(3) * 268 + 2 * COLUMN_GAP_PX(32) = 868
    expect(baseline.width).toBe(868)
    // SongBody's outer `py-4` wrapper adds 16px top + 16px bottom around the
    // inner flow's own availableHeight.
    expect(baseline.height).toBe(374 + 32)
  })

  it('still uses the canvas box size directly for a non-paginated song (unaffected by the flow-sizing change)', () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, value: 600 })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, value: 500 })

    const { container } = render(
      <AnnotationLayer active fitFontSize={20} fitColumns={2} paginated={false} />
    )
    drawOneStroke(container.querySelector('canvas'))

    const baseline = useAnnotationStore.getState().baseline
    expect(baseline.width).toBe(600)
    expect(baseline.height).toBe(500)
  })
})
