import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { getAnnotations, setAnnotations, deleteAnnotations } from '../lib/storage'

export const MAX_LAYERS = 5
const PERSIST_DEBOUNCE_MS = 500

function freshLayers() {
  return Array.from({ length: MAX_LAYERS }, () => ({ visible: true, strokes: [] }))
}

// Nearest distance from (x, y) to any point of a stroke's polyline, in the
// stroke's own coordinate space (plain baseline pixels — see plan doc).
function distanceToStroke(stroke, x, y) {
  let min = Infinity
  for (const p of stroke.points) {
    const d = Math.hypot(p.x - x, p.y - y)
    if (d < min) min = d
  }
  return min
}

let persistTimer = null
function schedulePersist(get) {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    const { songId, baseline, layers, activeLayer } = get()
    if (!songId) return
    setAnnotations(songId, { baseline, layers, activeLayer })
  }, PERSIST_DEBOUNCE_MS)
}

export const useAnnotationStore = create((set, get) => ({
  songId: null,
  baseline: null,      // { fontSize, columns, width, height } | null
  layers: freshLayers(),
  activeLayer: 0,
  tool: 'pen',          // 'pen' | 'eraser'
  color: '#ef4444',
  strokeWidth: 3,
  annotateMode: false,
  userZoom: 1,
  pan: { x: 0, y: 0 },

  loadForSong(songId) {
    clearTimeout(persistTimer)
    const stored = getAnnotations(songId)
    set({
      songId,
      baseline: stored?.baseline ?? null,
      layers: stored?.layers ?? freshLayers(),
      activeLayer: stored?.activeLayer ?? 0,
      annotateMode: false,
      userZoom: 1,
      pan: { x: 0, y: 0 },
    })
  },

  // Sets the frozen-layout baseline the first time a song is annotated.
  // No-op if a baseline already exists — it's immutable until reset.
  // Snapshots the live pagination shape (paginated/totalColumns/totalPages/
  // pageColWidth/availableHeight) alongside fontSize/columns: once the
  // baseline exists, MainContent disables useFitToScreen (its measurement
  // would otherwise fight the frozen box), which resets the hook's own
  // pagination state to its "off" defaults. Without this snapshot, that
  // reset silently collapses a multi-page song to a single page and breaks
  // in-song navigation.
  captureBaseline({ fontSize, columns, width, height, paginated, totalColumns, totalPages, pageColWidth, availableHeight }) {
    if (get().baseline) return
    set({ baseline: { fontSize, columns, width, height, paginated, totalColumns, totalPages, pageColWidth, availableHeight } })
    schedulePersist(get)
  },

  addStroke(stroke) {
    const { layers, activeLayer } = get()
    const withId = { ...stroke, id: uuidv4() }
    const nextLayers = layers.map((layer, i) =>
      i === activeLayer ? { ...layer, strokes: [...layer.strokes, withId] } : layer
    )
    set({ layers: nextLayers })
    schedulePersist(get)
  },

  // Removes the stroke on the active layer nearest to (x, y), if within a
  // reasonable hit-test radius of its own line width.
  eraseStrokeAt(x, y) {
    const { layers, activeLayer } = get()
    const layer = layers[activeLayer]
    let closestIdx = -1
    let closestDist = Infinity
    layer.strokes.forEach((stroke, i) => {
      const threshold = Math.max(12, stroke.width * 2)
      const d = distanceToStroke(stroke, x, y)
      if (d <= threshold && d < closestDist) {
        closestDist = d
        closestIdx = i
      }
    })
    if (closestIdx === -1) return
    const nextStrokes = layer.strokes.filter((_, i) => i !== closestIdx)
    const nextLayers = layers.map((l, i) => (i === activeLayer ? { ...l, strokes: nextStrokes } : l))
    set({ layers: nextLayers })
    schedulePersist(get)
  },

  undoLastStroke() {
    const { layers, activeLayer } = get()
    const layer = layers[activeLayer]
    if (layer.strokes.length === 0) return
    const nextLayers = layers.map((l, i) =>
      i === activeLayer ? { ...l, strokes: l.strokes.slice(0, -1) } : l
    )
    set({ layers: nextLayers })
    schedulePersist(get)
  },

  clearAllAnnotations() {
    clearTimeout(persistTimer)
    const { songId } = get()
    if (songId) deleteAnnotations(songId)
    set({ baseline: null, layers: freshLayers(), activeLayer: 0, userZoom: 1, pan: { x: 0, y: 0 } })
  },

  setActiveLayer(i) {
    if (i < 0 || i >= MAX_LAYERS) return
    set({ activeLayer: i })
  },

  toggleLayerVisibility(i) {
    const { layers } = get()
    const nextLayers = layers.map((l, idx) => (idx === i ? { ...l, visible: !l.visible } : l))
    set({ layers: nextLayers })
    schedulePersist(get)
  },

  setTool(tool) { set({ tool }) },
  setColor(color) { set({ color }) },
  setStrokeWidth(strokeWidth) { set({ strokeWidth }) },
  setAnnotateMode(annotateMode) { set({ annotateMode }) },

  setUserZoom(userZoom) {
    set({ userZoom: Math.min(4, Math.max(1, userZoom)) })
  },

  setPan(pan) { set({ pan }) },

  resetZoom() { set({ userZoom: 1, pan: { x: 0, y: 0 } }) },
}))
