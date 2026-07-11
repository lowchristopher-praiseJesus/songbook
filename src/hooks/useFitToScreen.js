import { useState, useRef, useLayoutEffect, useEffect } from 'react'

const MIN_FONT = 10
const MAX_FONT = 28
const MAX_COLS = 4
const STEP = 2
const DEBOUNCE_MS = 100

export function useFitToScreen({ enabled, containerRef, bodyRef, lyricsOnly }) {
  const [state, setState] = useState({
    fitFontSize: null,
    fitColumns: null,
    canIncrease: false,
    canDecrease: false,
  })
  const shadowRef = useRef(null)
  const timerRef = useRef(null)
  const rafRef = useRef(null)
  const measureRef = useRef(null)
  const modeRef = useRef('auto')

  function getAvailableHeight() {
    const container = containerRef?.current
    const body = bodyRef?.current
    if (!container || !body) return null

    const containerRect = container.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    // Absolute offset of body from container top (scroll-independent)
    const bodyTopInContainer = bodyRect.top - containerRect.top + container.scrollTop
    const availableHeight = container.clientHeight - bodyTopInContainer
    return availableHeight > 0 ? availableHeight : null
  }

  // For a fixed font size, find the smallest column count (1..MAX_COLS) whose
  // balanced-column height fits the available space. Returns null if none fit.
  function deriveColumnsForFont(fontSize, availableHeight) {
    const shadow = shadowRef?.current
    if (!shadow) return null

    shadow.style.height = 'auto'
    shadow.style.setProperty('--fit-fs', `${fontSize}px`)

    for (let cols = 1; cols <= MAX_COLS; cols++) {
      shadow.style.columnCount = cols
      const h = shadow.getBoundingClientRect().height
      if (h <= availableHeight) return cols
    }
    return null
  }

  function computeFlags(fontSize, availableHeight) {
    const canDecrease = fontSize > MIN_FONT
    const canIncrease =
      fontSize < MAX_FONT &&
      deriveColumnsForFont(Math.min(fontSize + STEP, MAX_FONT), availableHeight) !== null
    return { canIncrease, canDecrease }
  }

  measureRef.current = function measureAuto() {
    const availableHeight = getAvailableHeight()
    if (availableHeight === null) return

    let best = null

    // Use height:auto so the browser balances content across N columns.
    // With a fixed height, CSS multi-column overflows horizontally (extra columns
    // to the right), making scrollHeight === clientHeight regardless of content
    // size — the check is blind. With height:auto + column-fill:balance (default),
    // the rendered height ≈ total_content / N, which we compare to availableHeight.
    const shadow = shadowRef?.current
    if (!shadow) return
    shadow.style.height = 'auto'

    for (let cols = 1; cols <= MAX_COLS; cols++) {
      shadow.style.columnCount = cols

      let lo = MIN_FONT
      let hi = MAX_FONT
      let colBest = null

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        shadow.style.setProperty('--fit-fs', `${mid}px`)
        // getBoundingClientRect() forces synchronous layout and returns the
        // actual rendered height of the balanced columns.
        const h = shadow.getBoundingClientRect().height
        if (h <= availableHeight) {
          colBest = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }

      if (colBest !== null) {
        best = { fitFontSize: colBest, fitColumns: cols }
        break
      }
    }

    const result = best ?? { fitFontSize: MIN_FONT, fitColumns: MAX_COLS }
    modeRef.current = 'auto'
    setState({ ...result, ...computeFlags(result.fitFontSize, availableHeight) })
  }

  function increaseFontSize() {
    setState(prev => {
      if (!prev.canIncrease || prev.fitFontSize === null) return prev
      const availableHeight = getAvailableHeight()
      if (availableHeight === null) return prev
      const nextFont = Math.min(prev.fitFontSize + STEP, MAX_FONT)
      const cols = deriveColumnsForFont(nextFont, availableHeight)
      if (cols === null) return prev
      modeRef.current = 'manual'
      return { fitFontSize: nextFont, fitColumns: cols, ...computeFlags(nextFont, availableHeight) }
    })
  }

  function decreaseFontSize() {
    setState(prev => {
      if (!prev.canDecrease || prev.fitFontSize === null) return prev
      const availableHeight = getAvailableHeight()
      if (availableHeight === null) return prev
      const nextFont = Math.max(prev.fitFontSize - STEP, MIN_FONT)
      const cols = deriveColumnsForFont(nextFont, availableHeight) ?? MAX_COLS
      modeRef.current = 'manual'
      return { fitFontSize: nextFont, fitColumns: cols, ...computeFlags(nextFont, availableHeight) }
    })
  }

  // Re-measure when enabled state or lyricsOnly changes
  useLayoutEffect(() => {
    if (!enabled) {
      setState({ fitFontSize: null, fitColumns: null, canIncrease: false, canDecrease: false })
      return
    }
    measureRef.current()
    // Guard against transitional layout on the very first pass (e.g. a freshly
    // mounted `fixed inset-0` overlay tree). Re-measure once a full layout+paint
    // cycle has actually completed, and correct the result if it changed.
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => measureRef.current())
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [enabled, lyricsOnly])

  // ResizeObserver: re-measure on container size changes (debounced).
  // In manual mode, keep the user's pinned font and only re-derive columns;
  // in auto mode, re-run the full auto-fit search as before.
  useEffect(() => {
    if (!enabled || !containerRef?.current) return
    const el = containerRef.current
    const observer = new ResizeObserver(() => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        if (modeRef.current === 'manual') {
          setState(prev => {
            if (prev.fitFontSize === null) return prev
            const availableHeight = getAvailableHeight()
            if (availableHeight === null) return prev
            const cols = deriveColumnsForFont(prev.fitFontSize, availableHeight) ?? MAX_COLS
            return { fitFontSize: prev.fitFontSize, fitColumns: cols, ...computeFlags(prev.fitFontSize, availableHeight) }
          })
        } else {
          measureRef.current()
        }
      }, DEBOUNCE_MS)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimeout(timerRef.current)
    }
  }, [enabled])

  return {
    fitFontSize: state.fitFontSize,
    fitColumns: state.fitColumns,
    canIncrease: state.canIncrease,
    canDecrease: state.canDecrease,
    increaseFontSize,
    decreaseFontSize,
    shadowRef,
  }
}
