import { useEffect, useRef, useCallback } from 'react'
import { getStroke } from 'perfect-freehand'
import { useAnnotationStore } from '../../store/annotationStore'

// Turns a perfect-freehand outline (array of [x, y]) into a smooth filled
// Path2D by curving through the midpoint of each consecutive pair.
function strokeOutlineToPath2D(outline) {
  const path = new Path2D()
  if (outline.length === 0) return path
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length - 1; i++) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[i + 1]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.closePath()
  return path
}

function paintStroke(ctx, stroke) {
  const input = stroke.points.map(p => [p.x, p.y, p.pressure ?? 0.5])
  const outline = getStroke(input, { size: stroke.width, thinning: 0.6, smoothing: 0.5, streamline: 0.5 })
  ctx.fillStyle = stroke.color
  ctx.fill(strokeOutlineToPath2D(outline))
}

/**
 * Ink canvas overlay. Sizes itself to whatever box it's placed in (either the
 * live, still-reflowing content area before a song has any ink, or the
 * frozen baseline-sized box afterward — see AnnotatedMaximizeView). Stroke
 * coordinates are plain CSS pixels in that box's own untransformed space, so
 * they stay valid under any ancestor CSS scale (fit-to-screen or optical zoom).
 */
export function AnnotationLayer({ active, fitFontSize, fitColumns }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const liveStrokeRef = useRef(null)
  const layers = useAnnotationStore(s => s.layers)
  const activeLayer = useAnnotationStore(s => s.activeLayer)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    layers.forEach((layer, i) => {
      if (!layer.visible) return
      layer.strokes.forEach(stroke => paintStroke(ctx, stroke))
      if (i === activeLayer && liveStrokeRef.current) paintStroke(ctx, liveStrokeRef.current)
    })
  }, [layers, activeLayer])

  // Keeps the canvas backing store matched to its own layout box (CSS px * dpr).
  // Only fires when the box's untransformed size actually changes — never on
  // a pure CSS transform (fit-to-screen scale / optical zoom), which is exactly
  // the behavior we want since stroke coordinates live in untransformed space.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      redraw()
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [redraw])

  useEffect(() => { redraw() }, [redraw])

  function localPoint(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    // getBoundingClientRect reflects any ancestor CSS transform (fit-to-screen
    // scale / optical zoom); clientWidth/Height do not. Converting through
    // that ratio maps the pointer back into the canvas's own untransformed
    // pixel space, so stored coordinates stay valid regardless of current scale.
    const scaleX = canvas.clientWidth / rect.width
    const scaleY = canvas.clientHeight / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure: e.pressure || 0.5,
    }
  }

  function onPointerDown(e) {
    if (!active) return
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const pt = localPoint(e)
    const { tool, color, strokeWidth } = useAnnotationStore.getState()
    if (tool === 'eraser') {
      useAnnotationStore.getState().eraseStrokeAt(pt.x, pt.y)
      return
    }
    liveStrokeRef.current = { color, width: strokeWidth, points: [pt] }
  }

  function onPointerMove(e) {
    if (!drawingRef.current) return
    const pt = localPoint(e)
    const { tool } = useAnnotationStore.getState()
    if (tool === 'eraser') {
      useAnnotationStore.getState().eraseStrokeAt(pt.x, pt.y)
      return
    }
    if (liveStrokeRef.current) {
      liveStrokeRef.current.points.push(pt)
      redraw()
    }
  }

  function onPointerUp() {
    if (!drawingRef.current) return
    drawingRef.current = false
    const stroke = liveStrokeRef.current
    liveStrokeRef.current = null
    if (!stroke || stroke.points.length === 0) {
      redraw()
      return
    }
    const hadBaseline = !!useAnnotationStore.getState().baseline
    useAnnotationStore.getState().addStroke(stroke)
    if (!hadBaseline) {
      const canvas = canvasRef.current
      useAnnotationStore.getState().captureBaseline({
        fontSize: fitFontSize,
        columns: fitColumns,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      })
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{
        touchAction: 'none',
        pointerEvents: active ? 'auto' : 'none',
        cursor: active ? 'crosshair' : 'default',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}
