import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AnnotationLayer, HIGHLIGHTER_WIDTH, HIGHLIGHTER_OPACITY } from '../AnnotationLayer'
import { useAnnotationStore } from '../../../store/annotationStore'

function draw(canvas) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 10, pointerId: 1 })
  fireEvent.pointerUp(canvas, { clientX: 40, clientY: 10, pointerId: 1 })
}

let fills
beforeEach(() => {
  fills = []
  useAnnotationStore.setState({
    songId: 'song-1', baseline: { width: 600, height: 500 }, annotateMode: true, activeLayer: 0,
    tool: 'pen', color: '#ef4444', highlightColor: '#facc15',
    layers: useAnnotationStore.getState().layers.map(l => ({ ...l, visible: true, strokes: [] })),
  })
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
  HTMLCanvasElement.prototype.getContext = vi.fn(function () {
    const ctx = {
      globalAlpha: 1, fillStyle: '',
      setTransform: vi.fn(), clearRect: vi.fn(),
      fill: vi.fn(() => fills.push({ color: ctx.fillStyle, alpha: ctx.globalAlpha })),
    }
    return ctx
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, value: 600 })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, value: 500 })
  vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })))
  vi.stubGlobal('Path2D', vi.fn(() => ({ moveTo: vi.fn(), quadraticCurveTo: vi.fn(), closePath: vi.fn() })))
})

afterEach(() => { vi.restoreAllMocks() })

describe('AnnotationLayer highlighter', () => {
  it('stores a wide highlighter stroke in the highlight color', () => {
    useAnnotationStore.setState({ tool: 'highlighter' })
    const { container } = render(<AnnotationLayer active />)
    draw(container.querySelector('canvas'))
    const [stroke] = useAnnotationStore.getState().layers[0].strokes
    expect(stroke.tool).toBe('highlighter')
    expect(stroke.color).toBe('#facc15')
    expect(stroke.width).toBe(HIGHLIGHTER_WIDTH)
  })

  it('pen strokes are unchanged (pen color and width, no highlighter tag)', () => {
    const { container } = render(<AnnotationLayer active />)
    draw(container.querySelector('canvas'))
    const [stroke] = useAnnotationStore.getState().layers[0].strokes
    expect(stroke.tool).toBeUndefined()
    expect(stroke.color).toBe('#ef4444')
  })

  it('paints highlights translucent and underneath pen ink, regardless of draw order', () => {
    const layers = useAnnotationStore.getState().layers.map(l => ({ ...l }))
    layers[0] = { visible: true, strokes: [
      { id: 'p', color: '#ef4444', width: 3, points: [{ x: 1, y: 1, pressure: 0.5 }] },
      { id: 'h', tool: 'highlighter', color: '#facc15', width: 20, points: [{ x: 1, y: 1, pressure: 0.5 }] },
    ] }
    useAnnotationStore.setState({ layers })
    render(<AnnotationLayer active />)
    const last = fills.slice(-2)
    expect(last[0]).toEqual({ color: '#facc15', alpha: HIGHLIGHTER_OPACITY })
    expect(last[1]).toEqual({ color: '#ef4444', alpha: 1 })
  })
})
