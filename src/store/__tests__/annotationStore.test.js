import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAnnotationStore, MAX_LAYERS } from '../annotationStore'
import { getAnnotations, setAnnotations } from '../../lib/storage'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  useAnnotationStore.getState().loadForSong('song-1')
})

describe('loadForSong', () => {
  it('starts with a null baseline and 5 empty visible layers when nothing is stored', () => {
    const state = useAnnotationStore.getState()
    expect(state.baseline).toBeNull()
    expect(state.layers).toHaveLength(MAX_LAYERS)
    expect(state.layers.every(l => l.visible && l.strokes.length === 0)).toBe(true)
  })

  it('loads previously stored annotations for a song', () => {
    const stored = {
      baseline: { fontSize: 18, columns: 2, width: 800, height: 1200 },
      layers: [{ visible: false, strokes: [{ id: 'a', color: '#000', width: 2, points: [{ x: 1, y: 1, pressure: 0.5 }] }] }, ...Array.from({ length: 4 }, () => ({ visible: true, strokes: [] }))],
      activeLayer: 2,
    }
    setAnnotations('song-2', stored)
    useAnnotationStore.getState().loadForSong('song-2')
    const state = useAnnotationStore.getState()
    expect(state.baseline).toEqual(stored.baseline)
    expect(state.layers[0].visible).toBe(false)
    expect(state.activeLayer).toBe(2)
  })

  it('resets annotateMode/userZoom/pan on song change', () => {
    useAnnotationStore.getState().setAnnotateMode(true)
    useAnnotationStore.getState().setUserZoom(3)
    useAnnotationStore.getState().loadForSong('song-3')
    const state = useAnnotationStore.getState()
    expect(state.annotateMode).toBe(false)
    expect(state.userZoom).toBe(1)
    expect(state.pan).toEqual({ x: 0, y: 0 })
  })
})

describe('captureBaseline', () => {
  it('sets the baseline once', () => {
    useAnnotationStore.getState().captureBaseline({ fontSize: 16, columns: 1, width: 600, height: 900 })
    expect(useAnnotationStore.getState().baseline).toEqual({ fontSize: 16, columns: 1, width: 600, height: 900 })
  })

  it('ignores a second capture attempt, keeping the first baseline', () => {
    useAnnotationStore.getState().captureBaseline({ fontSize: 16, columns: 1, width: 600, height: 900 })
    useAnnotationStore.getState().captureBaseline({ fontSize: 24, columns: 3, width: 1200, height: 1800 })
    expect(useAnnotationStore.getState().baseline).toEqual({ fontSize: 16, columns: 1, width: 600, height: 900 })
  })

  it('persists the baseline to storage after the debounce', () => {
    useAnnotationStore.getState().captureBaseline({ fontSize: 16, columns: 1, width: 600, height: 900 })
    vi.advanceTimersByTime(600)
    expect(getAnnotations('song-1').baseline).toEqual({ fontSize: 16, columns: 1, width: 600, height: 900 })
  })
})

describe('addStroke / undoLastStroke', () => {
  it('adds a stroke to the active layer with a generated id', () => {
    useAnnotationStore.getState().addStroke({ color: '#000', width: 2, points: [{ x: 0, y: 0, pressure: 1 }] })
    const strokes = useAnnotationStore.getState().layers[0].strokes
    expect(strokes).toHaveLength(1)
    expect(strokes[0].id).toBeTruthy()
  })

  it('adds strokes to whichever layer is active', () => {
    useAnnotationStore.getState().setActiveLayer(2)
    useAnnotationStore.getState().addStroke({ color: '#000', width: 2, points: [{ x: 0, y: 0, pressure: 1 }] })
    expect(useAnnotationStore.getState().layers[2].strokes).toHaveLength(1)
    expect(useAnnotationStore.getState().layers[0].strokes).toHaveLength(0)
  })

  it('undo removes the most recently added stroke', () => {
    useAnnotationStore.getState().addStroke({ color: '#000', width: 2, points: [{ x: 0, y: 0, pressure: 1 }] })
    useAnnotationStore.getState().addStroke({ color: '#000', width: 2, points: [{ x: 5, y: 5, pressure: 1 }] })
    useAnnotationStore.getState().undoLastStroke()
    const strokes = useAnnotationStore.getState().layers[0].strokes
    expect(strokes).toHaveLength(1)
    expect(strokes[0].points[0].x).toBe(0)
  })

  it('undo on an empty layer is a no-op', () => {
    expect(() => useAnnotationStore.getState().undoLastStroke()).not.toThrow()
    expect(useAnnotationStore.getState().layers[0].strokes).toHaveLength(0)
  })

  it('persists strokes to storage after the debounce', () => {
    useAnnotationStore.getState().addStroke({ color: '#000', width: 2, points: [{ x: 0, y: 0, pressure: 1 }] })
    vi.advanceTimersByTime(600)
    expect(getAnnotations('song-1').layers[0].strokes).toHaveLength(1)
  })
})

describe('eraseStrokeAt', () => {
  it('removes the stroke nearest the given point when within threshold', () => {
    useAnnotationStore.getState().addStroke({ color: '#000', width: 2, points: [{ x: 10, y: 10, pressure: 1 }] })
    useAnnotationStore.getState().eraseStrokeAt(11, 11)
    expect(useAnnotationStore.getState().layers[0].strokes).toHaveLength(0)
  })

  it('leaves strokes untouched when nothing is near the point', () => {
    useAnnotationStore.getState().addStroke({ color: '#000', width: 2, points: [{ x: 10, y: 10, pressure: 1 }] })
    useAnnotationStore.getState().eraseStrokeAt(500, 500)
    expect(useAnnotationStore.getState().layers[0].strokes).toHaveLength(1)
  })

  it('erases only the closest stroke when multiple are present', () => {
    useAnnotationStore.getState().addStroke({ color: '#000', width: 2, points: [{ x: 10, y: 10, pressure: 1 }] })
    useAnnotationStore.getState().addStroke({ color: '#000', width: 2, points: [{ x: 100, y: 100, pressure: 1 }] })
    useAnnotationStore.getState().eraseStrokeAt(9, 9)
    const strokes = useAnnotationStore.getState().layers[0].strokes
    expect(strokes).toHaveLength(1)
    expect(strokes[0].points[0].x).toBe(100)
  })
})

describe('clearAllAnnotations', () => {
  it('resets baseline and all layers, and clears storage', () => {
    useAnnotationStore.getState().captureBaseline({ fontSize: 16, columns: 1, width: 600, height: 900 })
    useAnnotationStore.getState().addStroke({ color: '#000', width: 2, points: [{ x: 0, y: 0, pressure: 1 }] })
    vi.advanceTimersByTime(600)
    useAnnotationStore.getState().clearAllAnnotations()
    const state = useAnnotationStore.getState()
    expect(state.baseline).toBeNull()
    expect(state.layers.every(l => l.strokes.length === 0)).toBe(true)
    expect(getAnnotations('song-1')).toBeNull()
  })

  it('allows a fresh baseline capture after reset', () => {
    useAnnotationStore.getState().captureBaseline({ fontSize: 16, columns: 1, width: 600, height: 900 })
    useAnnotationStore.getState().clearAllAnnotations()
    useAnnotationStore.getState().captureBaseline({ fontSize: 24, columns: 3, width: 1200, height: 1800 })
    expect(useAnnotationStore.getState().baseline).toEqual({ fontSize: 24, columns: 3, width: 1200, height: 1800 })
  })
})

describe('layer controls', () => {
  it('setActiveLayer ignores out-of-range indices', () => {
    useAnnotationStore.getState().setActiveLayer(2)
    useAnnotationStore.getState().setActiveLayer(99)
    expect(useAnnotationStore.getState().activeLayer).toBe(2)
    useAnnotationStore.getState().setActiveLayer(-1)
    expect(useAnnotationStore.getState().activeLayer).toBe(2)
  })

  it('toggleLayerVisibility flips only the targeted layer', () => {
    useAnnotationStore.getState().toggleLayerVisibility(1)
    const layers = useAnnotationStore.getState().layers
    expect(layers[1].visible).toBe(false)
    expect(layers[0].visible).toBe(true)
  })
})

describe('zoom/pan', () => {
  it('clamps userZoom between 1 and 4', () => {
    useAnnotationStore.getState().setUserZoom(0.2)
    expect(useAnnotationStore.getState().userZoom).toBe(1)
    useAnnotationStore.getState().setUserZoom(10)
    expect(useAnnotationStore.getState().userZoom).toBe(4)
  })

  it('resetZoom restores userZoom to 1 and pan to origin', () => {
    useAnnotationStore.getState().setUserZoom(3)
    useAnnotationStore.getState().setPan({ x: 40, y: 60 })
    useAnnotationStore.getState().resetZoom()
    expect(useAnnotationStore.getState().userZoom).toBe(1)
    expect(useAnnotationStore.getState().pan).toEqual({ x: 0, y: 0 })
  })
})
